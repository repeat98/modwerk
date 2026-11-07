// SPDX-License-Identifier: GPL-3.0-or-later
// MIDI Expression: the settings on the +Drive, as text files.
//
// No byte of a saved sound or pattern is free for them (docs/RESEARCH-OS154.md,
// section 13), so they are files of the mod's own, written with the firmware's
// ekFS calls (as Digi Slicer keeps its slices), in /cfw/expression:
//
//   projects/003.txt   project slot 003's settings, all 16 tracks (its name inside)
//   audio/01.txt       audio-track preset 01 .. 64 (one track's settings)
//   midi/01.txt        MIDI-track preset 01 .. 64
//   current.txt        the settings as they are now, for power-on
//   config.txt         which preset is the default for each kind of track
//   _temp/...          the same names: each file is written there first, then
//                      in its place, so a power cut during a save always
//                      leaves one whole copy; the loader takes the first that
//                      reads whole (it must end with an END line).
//
// Plain text, one setting a line, editable by hand; anything out of range is
// held to the nearest valid value, unknown lines are skipped, a missing value
// is the factory default. A file that does not start with its header or has
// no END line is not used (the copy in _temp is tried, then the defaults).
//
// When (store.s hooks the project jobs' messages, with their slot number):
//   SAVE PROJECT AS / save   projects/NNN.txt <- the settings now
//   LOAD PROJECT             the settings <- projects/NNN.txt, or, for a
//                            project without one, each track's default preset
//   a change on the page     current.txt, a second later
//   power-on                 the settings <- current.txt
// Projects are known by their slot, so renaming a project or deleting another
// one changes nothing. A project put into a slot from outside (Transfer)
// takes the slot's old file, if there is one.
//
// Everything runs in the UI task (ev_tick, 30 Hz), one job a tick, only while
// the filesystem's mutex is free and the drive is mounted. No memory is
// allocated: one static text buffer, files opened and closed in the same call.

// Small rather than fast: the page and the files are not on a hot path, and
// RAM is shared with the other mods (it saves about 10 KB beside Digi Slicer).
#ifndef ME_HOST_TEST
#pragma GCC optimize ("Os", "no-tree-loop-distribute-patterns")   // and no memset, memmove or strlen calls: a mod has no C library
#endif

#include "expr.h"

typedef uint32_t u32;
typedef int32_t s32;

#ifdef ME_HOST_TEST
#include "host_store.h"
#else
typedef struct { u32 inode, pos, writable, open; } ekfile;
#define EK_OPEN    ((s32 (*)(const char *, const char *, ekfile *))0x400cf3a0)
#define EK_READ    ((s32 (*)(void *, s32, ekfile *))0x400cf0e6)
#define EK_WRITE   ((s32 (*)(const void *, s32, ekfile *))0x400cf146)
#define EK_CLOSE   ((s32 (*)(ekfile *))0x400cf35e)
#define EK_MKDIR   ((s32 (*)(const char *))0x400ce034)
#define EK_LOOKUP  ((s32 (*)(const char *, u32 *, s32, s32, s32))0x400d0ccc)
#define EK_LOCK    ((void (*)(void *))0x40001884)
#define EK_UNLOCK  ((void (*)(void *))0x400019b6)
#define EK_MUTEX   ((void *)0x42686690)
#define EK_OWNER   (*(volatile u32 *)0x42686690)
#define EK_MOUNTED (*(volatile u32 *)0x420eec50)
#define NOT_FOUND  0x19
#endif

#define SAVE_WAIT  30                         // ticks after the last change (1 s)
#define QUIET      60                         // ticks without a note or live input (2 s)
#define RETRY      300                        // after a failed write (10 s)
#define PROJ_SIZE  5120                       // a project file, always this size (about 4.3 KB at most used)
#define PRESET_SIZE 1024                      // a preset or config file
#define NAME_MAX   ME_NAME_LEN

// ---- state --------------------------------------------------------------------
static char buf[PROJ_SIZE];                   // the one text buffer
static struct me_cfg snap_a[8], snap_m[8];    // settings taken for a job
static char snap_name[NAME_MAX + 1];
static int8_t def_preset[2] = { -1, -1 };     // default preset per kind (audio, MIDI): -1 Factory
static char pnames[2][ME_PRESETS][NAME_MAX + 1];   // the presets' names, "" for an empty slot
static uint8_t pscan[2];                      // 0 not read, 1..64 next to read + 1, 65 read
static int8_t cur_slot = -1;                  // the project's slot, as last saved or loaded
static char cur_name[NAME_MAX + 1];
static s32 dirs_made;

enum { J_NONE, J_BOOT, J_SAVE_PROJECT, J_LOAD_PROJECT, J_SAVE_PRESET, J_LOAD_PRESET, J_RESET, J_CONFIG };
static struct { uint8_t kind; int8_t mid, slot, track; } job;   // the one waiting (UI: one at a time)
static uint8_t save_project_req, load_project_req, current_dirty;
static int8_t req_slot_save, req_slot_load;
static s32 wait_ticks;
static u32 last_sum;

// For tests (found by its marker): [1] booted (current.txt read, or none),
// [2] files written, [3] failed writes, [4] files read, [5] bad files seen,
// [6] the project slot last saved or loaded + 1. A test clears [1] for a power-on.
volatile u32 me_store_probe[7] = { 0x4d455850, 0, 0, 0, 0, 0, 0 };   // "MEXP"
#define booted       me_store_probe[1]
#define n_written    me_store_probe[2]
#define n_failed     me_store_probe[3]
#define n_read       me_store_probe[4]
#define n_bad        me_store_probe[5]

// ---- small string helpers (no C library in a mod) ------------------------------
static int slen(const char *s) { int n = 0; while (s[n]) n++; return n; }

static void scopy(char *d, const char *s, int max)
{
    int i = 0;
    for (; s && s[i] && i < max; i++)
        d[i] = s[i];
    d[i] = 0;
}

// A name as the firmware's own: printable ASCII, at most NAME_MAX, trailing spaces gone.
static void clean_name(char *d, const char *s)
{
    int n = 0;
    for (int i = 0; s && s[i] && n < NAME_MAX; i++)
        d[n++] = s[i] >= 32 && s[i] < 127 ? s[i] : ' ';
    while (n > 0 && d[n - 1] == ' ')
        n--;
    d[n] = 0;
}

struct out { char *p; int n, max; };

static void put(struct out *o, const char *s)
{
    while (*s && o->n < o->max - 1)
        o->p[o->n++] = *s++;
}

static void put_int(struct out *o, s32 v, int sign)
{
    char t[12];
    int n = 0;
    u32 u = v < 0 ? (u32)-v : (u32)v;
    do t[n++] = (char)('0' + u % 10); while ((u /= 10) && n < 11);
    if (v < 0) put(o, "-");
    else if (sign) put(o, "+");
    while (n) { char c[2] = { t[--n], 0 }; put(o, c); }
}

static void put_2(struct out *o, int v)        // two digits
{
    char c[3] = { (char)('0' + v / 10 % 10), (char)('0' + v % 10), 0 };
    put(o, c);
}

// A depth in 1/256 as +dd.dd (two decimals, rounded); BEND without the sign.
static void put_fixed(struct out *o, s32 v, int sign)
{
    s32 h = (v < 0 ? -v : v) * 100;
    h = (h + 128) / 256;                       // hundredths
    if (v < 0) put(o, "-"); else if (sign) put(o, "+");
    put_int(o, h / 100, 0);
    put(o, ".");
    put_2(o, (int)(h % 100));
}

static void path_of(char *p, int temp, const char *dir, int number, int digits)
{
    struct out o = { p, 0, 48 };
    put(&o, temp ? "/cfw/expression/_temp/" : "/cfw/expression/");
    put(&o, dir);
    if (digits) {
        char d[4] = { (char)('0' + number / 100 % 10), (char)('0' + number / 10 % 10), (char)('0' + number % 10), 0 };
        put(&o, d + (3 - digits));
        put(&o, ".txt");
    }
    p[o.n] = 0;
}

// ---- the text format ---------------------------------------------------------------
static const char *const keys_audio[8] = { "BEND", "V.SNS", "MW", "M.DEP", "VEL", "V.DEP", "AT", "A.DEP" };
static const char *const keys_midi[8] = { "THRU", "V.SNS", "MW", "M.DEP", "VEL", "V.DEP", "AT", "A.DEP" };

static s32 field(const struct me_cfg *c, int k)
{
    switch (k) {
    case 0: return c->range;
    case 1: return c->vel_sens;
    case 2: return c->mw_dest;
    case 3: return c->mw_amount;
    case 4: return c->vel_dest;
    case 5: return c->vel_amount;
    case 6: return c->at_dest;
    default: return c->at_amount;
    }
}

static void set_field(struct me_cfg *c, int k, s32 v)
{
    switch (k) {
    case 0: c->range = (int16_t)v; break;
    case 1: c->vel_sens = (int8_t)v; break;
    case 2: c->mw_dest = (int8_t)v; break;
    case 3: c->mw_amount = (int16_t)v; break;
    case 4: c->vel_dest = (int8_t)v; break;
    case 5: c->vel_amount = (int16_t)v; break;
    case 6: c->at_dest = (int8_t)v; break;
    default: c->at_amount = (int16_t)v; break;
    }
}

void me_factory(struct me_cfg *c, int mid)
{
    c->range = (int16_t)(mid ? 1 : 2 * 256);   // audio BEND 2.00; MIDI THRU ON
    c->vel_sens = VEL_SENS_MAX;
    c->mw_dest = c->at_dest = c->vel_dest = 0;
    c->mw_amount = c->at_amount = c->vel_amount = 0;
}

// Every value held to what the page can set.
static void hold_cfg(struct me_cfg *c, int mid)
{
#define IN(v, lo, hi) ((v) < (lo) ? (lo) : (v) > (hi) ? (hi) : (v))
    c->range = (int16_t)(mid ? IN(c->range, 0, 1) : IN(c->range, 0, BEND_MAX));
    c->vel_sens = (int8_t)IN(c->vel_sens, 0, VEL_SENS_MAX);
    int dmax = mid ? MIDI_DESTS - 1 : 45;
    c->mw_dest = (int8_t)IN(c->mw_dest, 0, dmax);
    c->at_dest = (int8_t)IN(c->at_dest, 0, dmax);
    c->vel_dest = (int8_t)IN(c->vel_dest, 0, dmax);
    if (!mid) {                               // audio: only the slots the list offers
        if (!me_dest_valid(0, c->mw_dest)) c->mw_dest = 0;
        if (!me_dest_valid(0, c->at_dest)) c->at_dest = 0;
        if (!me_dest_valid(0, c->vel_dest)) c->vel_dest = 0;
    }
    c->mw_amount = (int16_t)IN(c->mw_amount, -AMOUNT_MAX, AMOUNT_MAX);
    c->at_amount = (int16_t)IN(c->at_amount, -AMOUNT_MAX, AMOUNT_MAX);
    c->vel_amount = (int16_t)IN(c->vel_amount, -AMOUNT_MAX, AMOUNT_MAX);
#undef IN
}

static void put_track(struct out *o, const struct me_cfg *c, int mid, int track)
{
    const char *const *keys = mid ? keys_midi : keys_audio;
    char line[40];
    if (track >= 0) {
        char h[4] = { '[', (char)(mid ? 'A' + track : '1' + track), ']', 0 };
        put(o, h);
        put(o, mid ? "   ; MIDI track\n" : "   ; audio track\n");
    }
    for (int k = 0; k < 8; k++) {
        s32 v = field(c, k);
        put(o, keys[k]);
        put(o, "=");
        if (k == 0 && mid) {
            put(o, v ? "ON" : "OFF");
        } else if (k == 0) {
            if (v) { put_fixed(o, v, 0); put(o, "   ; semitones"); } else put(o, "OFF");
        } else if (k == 1) {
            put_int(o, v, 0);
            put(o, "   ; %");
        } else if (k & 1) {
            put_fixed(o, v, 1);
        } else {
            put_int(o, v, 0);
            me_dest_name(line, sizeof line, mid, track < 0 ? 0 : track, (int)v);
            put(o, "   ; ");
            put(o, line);
        }
        put(o, "\n");
    }
}

// Pad to the file's fixed size, so a rewrite in place never leaves old bytes.
static int finish(struct out *o, int size)
{
    put(o, "END\n");
    while (o->n < size - 1) {
        int line = 0;
        while (o->n < size - 1 && line++ < 63)
            o->p[o->n++] = ' ';
        if (o->n < size - 1)
            o->p[o->n++] = '\n';
    }
    o->p[o->n++] = '\n';
    return o->n;
}

static int write_project(char *b, const char *name, int slot)
{
    struct out o = { b, 0, PROJ_SIZE };
    put(&o, "MIDI EXPRESSION PROJECT 1\n; Settings of the MIDI Expression mod. Edit freely:\n");
    put(&o, "; a value out of range is held to the nearest, a missing one is the default.\n");
    put(&o, "NAME="); put(&o, name); put(&o, "\n");
    put(&o, "SLOT="); put_int(&o, slot + 1, 0); put(&o, "\n");
    for (int t = 0; t < 8; t++)
        put_track(&o, &snap_a[t], 0, t);
    for (int t = 0; t < 8; t++)
        put_track(&o, &snap_m[t], 1, t);
    return finish(&o, PROJ_SIZE);
}

static int write_preset(char *b, const char *name, const struct me_cfg *c, int mid)
{
    struct out o = { b, 0, PRESET_SIZE };
    put(&o, mid ? "MIDI EXPRESSION PRESET MIDI 1\n" : "MIDI EXPRESSION PRESET AUDIO 1\n");
    put(&o, "NAME="); put(&o, name); put(&o, "\n");
    put_track(&o, c, mid, -1);
    return finish(&o, PRESET_SIZE);
}

static int write_config(char *b)
{
    struct out o = { b, 0, PRESET_SIZE };
    put(&o, "MIDI EXPRESSION CONFIG 1\n; the preset new projects and RESET use: 0 = Factory\n");
    put(&o, "DEFAULT AUDIO="); put_int(&o, def_preset[0] + 1, 0); put(&o, "\n");
    put(&o, "DEFAULT MIDI="); put_int(&o, def_preset[1] + 1, 0); put(&o, "\n");
    return finish(&o, PRESET_SIZE);
}

// ---- reading -------------------------------------------------------------------------
// Lines of b (n bytes): starts with header, has an END line. 0 if not.
static int valid(const char *b, int n, const char *header)
{
    int h = slen(header), i;
    if (n < h)
        return 0;
    for (i = 0; i < h; i++)
        if (b[i] != header[i])
            return 0;
    for (i = 0; i + 3 <= n; i++)
        if ((i == 0 || b[i - 1] == '\n') && b[i] == 'E' && b[i + 1] == 'N' && b[i + 2] == 'D'
            && (i + 3 == n || b[i + 3] == '\n' || b[i + 3] == '\r' || b[i + 3] == ' '))
            return 1;
    return 0;
}

static int same_key(const char *line, int len, const char *key)
{
    int i = 0;
    for (; key[i]; i++)
        if (i >= len || line[i] != key[i])
            return 0;
    while (i < len && line[i] == ' ')
        i++;
    return i < len && line[i] == '=';
}

static const char *value_of(const char *line, int len)
{
    for (int i = 0; i < len; i++)
        if (line[i] == '=') {
            i++;
            while (i < len && line[i] == ' ')
                i++;
            return line + i;
        }
    return line + len;
}

// A number: [+-]digits[.digits]; scale 256 for a depth (hundredths kept), 1 otherwise.
static int number(const char *s, const char *end, s32 *v, int depth)
{
    int neg = 0, any = 0;
    s32 w = 0, frac = 0, fd = 0;
    if (s < end && (*s == '+' || *s == '-'))
        neg = *s++ == '-';
    if (s + 1 < end && (s[0] == 'O' || s[0] == 'o')) {    // ON / OFF
        *v = (s[1] == 'N' || s[1] == 'n');
        return 1;
    }
    while (s < end && *s >= '0' && *s <= '9' && w < 100000)
        w = w * 10 + (*s++ - '0'), any = 1;
    if (s < end && (*s == '.' || *s == ',')) {
        s++;
        while (s < end && *s >= '0' && *s <= '9') {
            if (fd < 2) frac = frac * 10 + (*s - '0'), fd++;
            s++, any = 1;
        }
    }
    if (!any)
        return 0;
    if (fd == 1)
        frac *= 10;
    if (depth)
        w = (w * 100 + frac) * 256 / 100;
    *v = neg ? -w : w;
    return 1;
}

// Read the settings of one track's lines (key=value) into c; mid picks the keys.
static void read_line(const char *line, int len, struct me_cfg *c, int mid)
{
    const char *const *keys = mid ? keys_midi : keys_audio;
    for (int k = 0; k < 8; k++) {
        if (!same_key(line, len, keys[k]))
            continue;
        const char *v = value_of(line, len), *end = line + len;
        for (const char *p = v; p < end; p++)
            if (*p == ';' || *p == '#') { end = p; break; }
        s32 x;
        int fine = (k >= 3 && (k & 1)) || (k == 0 && !mid);    // depths and BEND: 1/256 (BEND=5 is 5.00)
        if (number(v, end, &x, fine)) {
            s32 lo = fine || k == 0 ? -32768 : -128, hi = -lo - 1;   // the field's width; hold() does the rest
            set_field(c, k, x < lo ? lo : x > hi ? hi : x);
        }
        return;
    }
}

// Walk the lines of b: sections [1]..[8] (audio), [A]..[H] (MIDI), or one
// preset's lines (section -1, into *one); NAME= into name.
static void parse(const char *b, int n, struct me_cfg *aud, struct me_cfg *mid_cfg,
                  struct me_cfg *one, int one_mid, char *name)
{
    int i = 0, section = -1, smid = 0;
    while (i < n) {
        int s = i;
        while (i < n && b[i] != '\n')
            i++;
        int len = i - s;
        i++;
        while (len > 0 && (b[s + len - 1] == '\r' || b[s + len - 1] == ' '))
            len--;
        const char *line = b + s;
        if (len >= 3 && line[0] == 'E' && line[1] == 'N' && line[2] == 'D')
            break;
        if (!len || line[0] == ';' || line[0] == '#')
            continue;
        if (line[0] == '[' && len >= 3) {
            char c = line[1];
            section = -1;
            if (c >= '1' && c <= '8') section = c - '1', smid = 0;
            else if (c >= 'A' && c <= 'H') section = c - 'A', smid = 1;
            else if (c >= 'a' && c <= 'h') section = c - 'a', smid = 1;
            continue;
        }
        if (name && same_key(line, len, "NAME")) {
            const char *v = value_of(line, len);
            char t[NAME_MAX + 1];
            int m = (int)(line + len - v);
            if (m > NAME_MAX) m = NAME_MAX;
            for (int j = 0; j < m; j++) t[j] = v[j];
            t[m] = 0;
            clean_name(name, t);
            continue;
        }
        if (one)
            read_line(line, len, one, one_mid);
        else if (section >= 0)
            read_line(line, len, smid ? &mid_cfg[section] : &aud[section], smid);
    }
}

// ---- the card --------------------------------------------------------------------------
static s32 ek_ready(void)
{
    return EK_MOUNTED != 0 && EK_OWNER == 0;
}

static int read_file(const char *path, int size)
{
    ekfile f;
    if (EK_OPEN(path, "r", &f) != 0)
        return -1;
    s32 got = EK_READ(buf, size, &f);
    EK_CLOSE(&f);
    n_read++;
    return got < 0 ? -1 : got > size ? size : got;
}

// The file or its copy in _temp, whichever reads whole. 0 if neither.
static int read_either(const char *dir, int number, int digits, const char *header, int size)
{
    char p[48];
    for (int temp = 0; temp < 2; temp++) {
        path_of(p, temp, dir, number, digits);
        int n = read_file(p, size);
        if (n > 0 && valid(buf, n, header))
            return n;
        if (n > 0)
            n_bad++;
    }
    return 0;
}

static s32 make_dir(const char *p)
{
    u32 ino;
    EK_LOCK(EK_MUTEX);
    s32 r = EK_LOOKUP(p, &ino, 0, 0, 0);
    EK_UNLOCK(EK_MUTEX);
    if (r == NOT_FOUND)
        return EK_MKDIR(p);
    return 0;
}

static s32 make_dirs(void)
{
    static const char *const d[] = {
        "/cfw", "/cfw/expression", "/cfw/expression/projects", "/cfw/expression/audio",
        "/cfw/expression/midi", "/cfw/expression/_temp", "/cfw/expression/_temp/projects",
        "/cfw/expression/_temp/audio", "/cfw/expression/_temp/midi",
    };
    if (dirs_made)
        return 0;
    for (unsigned i = 0; i < sizeof d / sizeof d[0]; i++)
        if (make_dir(d[i]) != 0)
            return -1;
    dirs_made = 1;
    return 0;
}

static s32 write_one(const char *path, int n)
{
    ekfile f;
    if (EK_OPEN(path, "w", &f) != 0)
        return -1;
    s32 w = EK_WRITE(buf, n, &f);
    EK_CLOSE(&f);
    return w == n ? 0 : -1;
}

// buf (n bytes) to _temp first, then in its place. 0 or -1.
static s32 write_safe(const char *dir, int number, int digits, int n)
{
    char p[48];
    if (make_dirs() != 0)
        return -1;
    path_of(p, 1, dir, number, digits);
    if (write_one(p, n) != 0)
        return -1;
    path_of(p, 0, dir, number, digits);
    if (write_one(p, n) != 0)
        return -1;
    n_written++;
    return 0;
}

// ---- applying -------------------------------------------------------------------------------
static void cfg_copy(struct me_cfg *d, const volatile struct me_cfg *c)
{
    d->range = c->range;                       // field by field: no memcpy in a mod
    d->mw_dest = c->mw_dest;
    d->at_dest = c->at_dest;
    d->vel_dest = c->vel_dest;
    d->vel_sens = c->vel_sens;
    d->mw_amount = c->mw_amount;
    d->at_amount = c->at_amount;
    d->vel_amount = c->vel_amount;
}

static void take_snapshot(void)
{
    for (int t = 0; t < 8; t++) {
        cfg_copy(&snap_a[t], &me_audio_cfg[t]);
        cfg_copy(&snap_m[t], &me_midi_cfg[t]);
    }
}

static void apply_snapshot(void)
{
    for (int t = 0; t < 8; t++) {
        hold_cfg(&snap_a[t], 0);
        hold_cfg(&snap_m[t], 1);
        cfg_copy(&me_audio_cfg[t], &snap_a[t]);
        cfg_copy(&me_midi_cfg[t], &snap_m[t]);
    }
    for (int m = 0; m < 8; m++)
        me_midi_changed(m);
}

static u32 cfg_sum(void)
{
    u32 s = 1;
    const uint8_t *p = (const uint8_t *)me_audio_cfg;
    for (unsigned i = 0; i < sizeof me_audio_cfg; i++) s = ((s << 5) | (s >> 27)) ^ p[i];
    p = (const uint8_t *)me_midi_cfg;
    for (unsigned i = 0; i < sizeof me_midi_cfg; i++) s = ((s << 5) | (s >> 27)) ^ p[i];
    return s;
}

// One kind's default preset into c (Factory if none, or if its file is gone).
static void default_of(struct me_cfg *c, int mid)
{
    me_factory(c, mid);
    if (def_preset[mid] < 0)
        return;
    int n = read_either(mid ? "midi/" : "audio/", def_preset[mid] + 1, 2,
                        mid ? "MIDI EXPRESSION PRESET MIDI" : "MIDI EXPRESSION PRESET AUDIO", PRESET_SIZE);
    if (n)
        parse(buf, n, 0, 0, c, mid, 0);
}

static void defaults_snapshot(void)
{
    struct me_cfg a, m;
    default_of(&a, 0);
    default_of(&m, 1);
    for (int t = 0; t < 8; t++) {
        cfg_copy(&snap_a[t], &a);
        cfg_copy(&snap_m[t], &m);
    }
}

static int read_project_file(const char *dir, int number, int digits)
{
    int n = read_either(dir, number, digits, "MIDI EXPRESSION PROJECT", PROJ_SIZE);
    if (!n)
        return 0;
    for (int t = 0; t < 8; t++) {              // a missing value is the factory default
        me_factory(&snap_a[t], 0);
        me_factory(&snap_m[t], 1);
    }
    char name[NAME_MAX + 1];
    name[0] = 0;
    parse(buf, n, snap_a, snap_m, 0, 0, name);
    scopy(cur_name, name, NAME_MAX);
    return 1;
}

static void read_config(void)
{
    char p[48];
    int n = 0;
    for (int temp = 0; temp < 2 && !n; temp++) {
        path_of(p, temp, "config.txt", 0, 0);
        n = read_file(p, PRESET_SIZE);
        if (n > 0 && !valid(buf, n, "MIDI EXPRESSION CONFIG"))
            n_bad++, n = 0;
        if (n < 0)
            n = 0;
    }
    for (int i = 0; i < n; ) {
        int s = i;
        while (i < n && buf[i] != '\n') i++;
        int len = i - s;
        i++;
        s32 v;
        for (int mid = 0; mid < 2; mid++)
            if (same_key(buf + s, len, mid ? "DEFAULT MIDI" : "DEFAULT AUDIO")
                && number(value_of(buf + s, len), buf + s + len, &v, 0))
                def_preset[mid] = (int8_t)(v >= 1 && v <= ME_PRESETS ? v - 1 : -1);
    }
}

static s32 write_named(const char *name, int temp, int n)
{
    char p[48];
    path_of(p, temp, name, 0, 0);
    return write_one(p, n);
}

static s32 save_config(void)
{
    if (make_dirs() != 0)
        return -1;
    int n = write_config(buf);
    if (write_named("config.txt", 1, n) != 0 || write_named("config.txt", 0, n) != 0)
        return -1;
    n_written++;
    return 0;
}

static s32 save_current(void)
{
    if (make_dirs() != 0)
        return -1;
    take_snapshot();
    int n = write_project(buf, cur_name, cur_slot < 0 ? 0 : cur_slot);
    if (write_named("current.txt", 1, n) != 0 || write_named("current.txt", 0, n) != 0)
        return -1;
    n_written++;
    return 0;
}

static int read_current(void)
{
    char p[48];
    for (int temp = 0; temp < 2; temp++) {
        path_of(p, temp, "current.txt", 0, 0);
        int n = read_file(p, PROJ_SIZE);
        if (n > 0 && valid(buf, n, "MIDI EXPRESSION PROJECT")) {
            for (int t = 0; t < 8; t++) {
                me_factory(&snap_a[t], 0);
                me_factory(&snap_m[t], 1);
            }
            char name[NAME_MAX + 1];
    name[0] = 0;
            parse(buf, n, snap_a, snap_m, 0, 0, name);
            scopy(cur_name, name, NAME_MAX);
            for (int i = 0; i + 5 < n; i++)    // SLOT=
                if ((i == 0 || buf[i - 1] == '\n') && same_key(buf + i, 6, "SLOT")) {
                    s32 v;
                    const char *e = buf + i;
                    while (e < buf + n && *e != '\n') e++;
                    if (number(value_of(buf + i, (int)(e - buf - i)), e, &v, 0) && v >= 1 && v <= 128)
                        cur_slot = (int8_t)(v - 1);
                    break;
                }
            return 1;
        }
        if (n > 0)
            n_bad++;
    }
    return 0;
}

// ---- the firmware's project save and load (store.s) ----------------------------------------
void me_project_saving(const char *name, s32 slot)
{
    clean_name(snap_name, name);
    req_slot_save = (int8_t)(slot >= 0 && slot < 128 ? slot : -1);
    save_project_req = 1;
    take_snapshot();                           // as the project is saved, not as it is later
}

void me_project_loading(const char *name, s32 slot)
{
    (void)name;
    req_slot_load = (int8_t)(slot >= 0 && slot < 128 ? slot : -1);
    load_project_req = 1;
}

// LOAD PROJECT's CREATE NEW: the same job with no slot ("INITIALIZING PROJECT").
// The new project starts with the default presets on every track; it has no
// slot until it is saved.
void me_project_creating(void)
{
    req_slot_load = -2;
    load_project_req = 1;
}

// ---- presets, for the page's menu ---------------------------------------------------------
const char *me_preset_name(int mid, int slot)
{
    return slot >= 0 && slot < ME_PRESETS ? pnames[mid & 1][slot] : "";
}

int me_presets_ready(int mid)
{
    return pscan[mid & 1] > ME_PRESETS;
}

void me_presets_rescan(int mid)
{
    pscan[mid & 1] = 1;
}

int me_default_preset(int mid)
{
    return def_preset[mid & 1];
}

int me_store_busy(void)
{
    return job.kind != J_NONE || save_project_req || load_project_req;
}

static int queue(int kind, int mid, int slot, int track)
{
    if (job.kind != J_NONE)
        return 0;
    job.mid = (int8_t)mid;
    job.slot = (int8_t)slot;
    job.track = (int8_t)track;
    job.kind = (uint8_t)kind;
    return 1;
}

int me_preset_save(int mid, int slot, const char *name, int track)
{
    if (slot < 0 || slot >= ME_PRESETS || track < 0 || track > 7 || job.kind != J_NONE)
        return 0;
    clean_name(snap_name, name);
    cfg_copy(&snap_a[0], mid ? &me_midi_cfg[track] : &me_audio_cfg[track]);
    return queue(J_SAVE_PRESET, mid, slot, track);
}

int me_preset_load(int mid, int slot, int track)
{
    return slot >= 0 && slot < ME_PRESETS && track >= 0 && track <= 7 && queue(J_LOAD_PRESET, mid, slot, track);
}

int me_track_reset(int mid, int track)
{
    return track >= 0 && track <= 7 && queue(J_RESET, mid, 0, track);
}

int me_default_set(int mid, int slot)
{
    if (slot < -1 || slot >= ME_PRESETS)
        return 0;
    def_preset[mid & 1] = (int8_t)slot;
    return queue(J_CONFIG, mid, slot, 0);
}

static void track_set(int mid, int track, const struct me_cfg *c)
{
    struct me_cfg v;
    cfg_copy(&v, c);
    hold_cfg(&v, mid);
    if (mid) {
        cfg_copy(&me_midi_cfg[track], &v);
        me_midi_changed(track);
    } else {
        cfg_copy(&me_audio_cfg[track], &v);
    }
}

// One job; 0 if the drive was busy (try the next tick).
static s32 run_job(void)
{
    char p[48];
    s32 r = 0;
    switch (job.kind) {
    case J_SAVE_PRESET: {
        int n = write_preset(buf, snap_name, &snap_a[0], job.mid);
        r = write_safe(job.mid ? "midi/" : "audio/", job.slot + 1, 2, n);
        if (!r)
            scopy(pnames[job.mid][job.slot], snap_name[0] ? snap_name : "-", NAME_MAX);
        break;
    }
    case J_LOAD_PRESET: {
        struct me_cfg c;
        me_factory(&c, job.mid);
        int n = read_either(job.mid ? "midi/" : "audio/", job.slot + 1, 2,
                            job.mid ? "MIDI EXPRESSION PRESET MIDI" : "MIDI EXPRESSION PRESET AUDIO", PRESET_SIZE);
        if (n) {
            parse(buf, n, 0, 0, &c, job.mid, 0);
            track_set(job.mid, job.track, &c);
        }
        break;
    }
    case J_RESET: {
        struct me_cfg c;
        default_of(&c, job.mid);
        track_set(job.mid, job.track, &c);
        break;
    }
    case J_CONFIG:
        r = save_config();
        break;
    }
    (void)p;
    return r;
}

static void scan_some(int mid)
{
    for (int i = 0; i < 8 && pscan[mid] && pscan[mid] <= ME_PRESETS; i++) {
        int slot = pscan[mid] - 1;
        char name[NAME_MAX + 1];
    name[0] = 0;
        int n = read_either(mid ? "midi/" : "audio/", slot + 1, 2,
                            mid ? "MIDI EXPRESSION PRESET MIDI" : "MIDI EXPRESSION PRESET AUDIO", 256);
        if (n)                                 // the name is in the first lines
            parse(buf, n, 0, 0, 0, 0, name), scopy(pnames[mid][slot], name[0] ? name : "-", NAME_MAX);
        else {
            // A preset longer than 256 bytes has its END further on: read it whole.
            n = read_either(mid ? "midi/" : "audio/", slot + 1, 2,
                            mid ? "MIDI EXPRESSION PRESET MIDI" : "MIDI EXPRESSION PRESET AUDIO", PRESET_SIZE);
            if (n)
                parse(buf, n, 0, 0, 0, 0, name), scopy(pnames[mid][slot], name[0] ? name : "-", NAME_MAX);
            else
                pnames[mid][slot][0] = 0;
        }
        pscan[mid]++;
    }
}

// ---- ev_tick -----------------------------------------------------------------------------------
void me_store_tick(void)
{
    if (!ek_ready())
        return;
    if (!booted) {                             // power-on: the settings as they were
        read_config();
        if (!read_current())
            defaults_snapshot();               // the first power-on: the default presets
        apply_snapshot();
        booted = 1;
        last_sum = cfg_sum();
        return;
    }
    if (save_project_req) {                    // the snapshot was taken as the save began
        save_project_req = 0;
        if (req_slot_save >= 0) {
            int n = write_project(buf, snap_name, req_slot_save);
            if (write_safe("projects/", req_slot_save + 1, 3, n) != 0) {
                n_failed++;
            } else {
                cur_slot = req_slot_save;
                scopy(cur_name, snap_name, NAME_MAX);
                me_store_probe[6] = (u32)cur_slot + 1;
                current_dirty = 1;
                wait_ticks = 0;
            }
        }
        return;
    }
    if (load_project_req) {
        load_project_req = 0;
        if (req_slot_load == -2) {             // CREATE NEW: the defaults, no slot yet
            defaults_snapshot();
            apply_snapshot();
            cur_slot = -1;
            me_store_probe[6] = 0;
            last_sum = cfg_sum();
            current_dirty = 1;
            wait_ticks = 0;
        } else if (req_slot_load >= 0) {
            if (!read_project_file("projects/", req_slot_load + 1, 3))
                defaults_snapshot();           // a project without settings: the defaults
            apply_snapshot();
            cur_slot = req_slot_load;
            me_store_probe[6] = (u32)cur_slot + 1;
            last_sum = cfg_sum();
            current_dirty = 1;
            wait_ticks = 0;
        }
        return;
    }
    if (job.kind != J_NONE) {
        if (run_job() != 0) {
            n_failed++;
        }
        job.kind = J_NONE;
        last_sum = cfg_sum();
        current_dirty = 1;
        wait_ticks = SAVE_WAIT;
        return;
    }
    for (int mid = 0; mid < 2; mid++)
        if (pscan[mid] && pscan[mid] <= ME_PRESETS) {
            scan_some(mid);
            return;
        }
    static uint8_t every;
    if (++every >= 10) {                       // looked at three times a second
        every = 0;
        u32 now = cfg_sum();
        if (now != last_sum) {                 // a change on the page
            last_sum = now;
            current_dirty = 1;
            wait_ticks = SAVE_WAIT;
        }
    }
    // current.txt waits until nothing plays: a write holds the UI task (and
    // with it the MIDI tracks' task) for a moment (about 0.1 s a file in
    // digiemu), which must not land in the middle of a performance.
    static u32 seen_activity;
    static s32 quiet;
    if (me_activity != seen_activity) {
        seen_activity = me_activity;
        quiet = 0;
    } else if (quiet < QUIET) {
        quiet++;
    }
    if (!current_dirty)
        return;
    if (wait_ticks > 0) {
        wait_ticks--;
        return;
    }
    if (quiet < QUIET)
        return;
    if (save_current() == 0) {
        current_dirty = 0;
    } else {
        n_failed++;
        wait_ticks = RETRY;
    }
}
