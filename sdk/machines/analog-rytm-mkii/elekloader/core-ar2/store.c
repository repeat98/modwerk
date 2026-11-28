// SPDX-License-Identifier: GPL-2.0-or-later
// Analog Rytm core (Modwerk): mod storage, the fields modules declare (analog-rytm-mk2/store.h).
//
// Where a field's bytes live:
// - sound: three spare bytes of the live sound (+0x6d..+0x6f) and the low bytes of its four velocity-route amount
//   words (+0x71, +0x74, +0x77, +0x7a), which stock only ever holds at 0 (route.s keeps them from stock's readers and
//   writers). Stored in the stored sound's +0x70..+0x7b, with the layout ID and the generation between them.
// - kit: the live kit's FX words 38..41 (+0x796..+0x79d), stored in the stored kit's FX record + 0x50..+0x5c.
// - global: core_store_globals, stored in the five spare bytes at the end of each stored global slot.
// - track and pattern: 64 spare bytes per track and per pattern in the live pattern.
// - project, and the stored copies of track and pattern: the tagged store, 4352 bytes nobody else uses in each
//   project image (byte 2 of every 4-byte entry from + 0x114 in each of the 17 song records). It begins with a
//   10-byte header: the layout ID and the generation of each scope.
//
// Stored module data is used only when the layout that wrote it is this build's or one of its ancestors
// (core_store_ids) and the scope's generation matches. Anything else loads as zeros, every field's default.
//
// The stock routines this wraps are entered through store.s (their *_body continuations). Every address comes from
// the machine's base.json common.cflags.

#include <stdint.h>
#include "analog-rytm-mk2/store.h"

#if !defined(CORE_S_AT) || !defined(CORE_LP_AT) || !defined(CORE_GLOBALS_AT) || !defined(CORE_SAVE_AT) || \
    !defined(CORE_LOAD_AT) || !defined(CORE_TRACK_SAVE_AT) || !defined(CORE_SETTINGS_SAVE_AT) || \
    !defined(CORE_LOCK_SAVE_AT) || !defined(CORE_LOCKS_SAVE_AT)
#error "store.c: the machine's storage addresses (CORE_*_AT) come from base.json common.cflags"
#endif

typedef unsigned char u8;
typedef uintptr_t addr;

#ifndef CORE_GEN
extern char __store_gen[], __store_gen2[];
#define CORE_GEN ((unsigned)(addr)__store_gen)
#define CORE_GEN2 ((unsigned)(addr)__store_gen2)
#endif
#ifndef CORE_DDR_LO
#define CORE_DDR_LO 0x40000000u
#define CORE_DDR_HI 0x48000000u
#endif

extern const unsigned core_store_ids[];
extern void (*const ev_project[])(int how, unsigned dropped);

#define S ((u8 *)(CORE_S_AT))
#define LP ((u8 *)(CORE_LP_AT))

// project image
#define IMAGE 0x1f9f32u
#define IMG_PATTERN0 0x18u
#define IMG_PATTERNS 0x3345u
#define PATTERN_REC 13101u
#define IMG_KIT0 0x19c9c5u
#define IMG_KIT_INDEX 0x19d3f7u
#define IMG_KITS 0x19d3fbu
#define KIT_REC 2610u
#define IMG_SONGS 0x1eecfbu
#define SONG_REC 0x518u
#define IMG_SOUNDS 0x1f4397u
#define SOUND_REC 162u
#define IMG_GLOBALS 0x1f9dee
#define GLOBAL_REC 80u
// stored records
#define PAT_TRACK0 4u
#define PAT_TRACK_REC 641u
#define PAT_LOCKS 8337u
#define PAT_SETTINGS 13089u
#define KIT_SOUND0 46u
#define KIT_FX 0x7c6u
#define SND_F0 0x70u                      // field bytes 0..2
#define SND_ID 0x73u
#define SND_GEN 0x77u
#define SND_F3 0x78u                      // field bytes 3..6
#define FX_F 0x50u                        // kit field bytes 0..7
#define FX_ID 0x58u
#define FX_GEN 0x5cu
#define GLB_F 0x4bu
// live objects
#define LP_PATTERN0 24u
#define LP_PATTERNS 85784u
#define LIVE_PATTERN 85760u
#define LP_KITS 0xa8cf18u
#define LIVE_KIT 2531u
#define LP_SAVED_KITS (LP_KITS + 128u * LIVE_KIT)
#define LP_SOUNDS 0xb4b27cu
#define LIVE_SOUND 152u
#define KIT_SOUNDS 42u
#define LIVE_TRACK 917u
#define TRACK_HOME 785u
#define PATTERN_HOME 85696u
#define LIVE_LOCKS 11921u
#define LIVE_SETTINGS 85683u
#define KIT_HOME 0x796u
#define HOME 64u
#define LIVE_GLOBAL 228u
// tagged store
#define TAGGED 4352u
#define HEADER 10u
#define T ((CORE_GEN2 >> 8) & 255u)
#define P (CORE_GEN2 & 255u)
#define PATTERNS_AT (HEADER + 1677u * T)
#define PROJECT_AT (PATTERNS_AT + 129u * P)

typedef int (*serial_save)(void *dst, void *live, int a, int flags, int progress);
typedef int (*serial_load)(void *live, void *src, int progress);
typedef int (*part_save)(void *dst, void *live, int a, int b, int c);

unsigned char core_store_globals[4][5];
static u8 *st_image = S;                 // initialised data: S from the first instruction on

static inline unsigned short irq_off(void)
{
#ifdef MODWERK_HOST
    return 0;
#else
    unsigned short sr;
    __asm__ volatile("move.w %%sr,%0\n\tmove.w #0x2700,%%sr" : "=d"(sr) : : "memory", "cc");
    return sr;
#endif
}

static inline void irq_on(unsigned short sr)
{
#ifdef MODWERK_HOST
    (void)sr;
#else
    __asm__ volatile("move.w %0,%%sr" : : "d"(sr) : "memory", "cc");
#endif
}

static unsigned get32(const u8 *p)
{
    return (unsigned)p[0] << 24 | (unsigned)p[1] << 16 | (unsigned)p[2] << 8 | p[3];
}

static void put32(u8 *p, unsigned v)
{
    p[0] = v >> 24;
    p[1] = v >> 16;
    p[2] = v >> 8;
    p[3] = v;
}

static void copy(u8 *dst, const u8 *src, unsigned n)
{
    while (n--)
        *dst++ = *src++;
}

static void zero(u8 *dst, unsigned n)
{
    while (n--)
        *dst++ = 0;
}

static unsigned gen(int scope)
{
    switch (scope) {
    case STORE_SOUND: return CORE_GEN >> 24;
    case STORE_KIT: return (CORE_GEN >> 16) & 255;
    case STORE_GLOBAL: return (CORE_GEN >> 8) & 255;
    case STORE_TRACK: return CORE_GEN & 255;
    case STORE_PATTERN: return CORE_GEN2 >> 24;
    default: return (CORE_GEN2 >> 16) & 255;
    }
}

static int known(unsigned id)
{
    if (!id)
        return 0;
    for (const unsigned *p = core_store_ids; *p; p++)
        if (*p == id)
            return 1;
    return 0;
}

// Tagged byte k of an image.
static u8 *tag(u8 *img, unsigned k)
{
    return img + IMG_SONGS + SONG_REC * (k >> 8) + 0x116u + 4u * (k & 255u);
}

static int is_image(const u8 *b)
{
    addr a = (addr)b;
    if (b != S && (a < CORE_DDR_LO || a > CORE_DDR_HI - IMAGE))
        return 0;
    return get32(b) == 0xbeefbaceu && get32(b + 4) == 9 && get32(b + IMAGE - 4) == 0xbacef00cu;
}

static int inside(const u8 *img, const u8 *p)
{
    return img && p >= img && (addr)(p - img) < IMAGE;
}

static int store_ok(u8 *img, int scope)
{
    if (!img)
        return 0;
    unsigned id = 0;
    for (unsigned k = 0; k < 4; k++)
        id = id << 8 | *tag(img, k);
    return known(id) && *tag(img, 3 + scope) == gen(scope);
}

static void put_header(u8 *img)
{
    unsigned id = core_store_ids[0];
    for (unsigned k = 0; k < 4; k++)
        *tag(img, k) = id >> (24 - 8 * k);
    for (int scope = STORE_SOUND; scope <= STORE_PROJECT; scope++)
        *tag(img, 3 + scope) = gen(scope);
}

static void tagged_copy(u8 *dst, u8 *src, unsigned from, unsigned to)
{
    for (unsigned k = from; k < to; k++)
        *tag(dst, k) = *tag(src, k);
}

static void tagged_zero(u8 *img, unsigned from, unsigned to)
{
    for (unsigned k = from; k < to; k++)
        *tag(img, k) = 0;
}

static void fire(int how, unsigned dropped)
{
    for (void (*const *f)(int, unsigned) = ev_project; *f; f++)
        (*f)(how, dropped);
}

// ---- where stored records belong

// The image holding pattern record p.
static u8 *pattern_image(u8 *p)
{
    if (inside(st_image, p))
        return st_image;
    if (is_image(p - IMG_PATTERN0))
        return p - IMG_PATTERN0;
    for (unsigned n = 0; n < 128; n++) {
        u8 *img = p - IMG_PATTERNS - PATTERN_REC * n;
        if (is_image(img))
            return img;
    }
    return 0;
}

// Pattern record p's number in img: 0 the working pattern, 1 + n pattern n, -1 none.
static int pattern_index(u8 *img, u8 *p)
{
    if (!inside(img, p))
        return -1;
    addr at = (addr)(p - img);
    if (at == IMG_PATTERN0)
        return 0;
    if (at < IMG_PATTERNS)
        return -1;
    at -= IMG_PATTERNS;
    if (at % PATTERN_REC || at / PATTERN_REC >= 128)
        return -1;
    return 1 + (int)(at / PATTERN_REC);
}

static u8 *global_image(u8 *p)
{
    if (inside(st_image, p))
        return st_image;
    if (inside(S, p))
        return S;
    for (unsigned g = 0; g < 4; g++) {
        u8 *img = p - IMG_GLOBALS - GLOBAL_REC * g;
        if (is_image(img))
            return img;
    }
    return 0;
}

static int live_slot(u8 *live)
{
    addr at = (addr)live - (addr)(CORE_GLOBALS_AT);
    if ((addr)live < (addr)(CORE_GLOBALS_AT) || at % LIVE_GLOBAL || at / LIVE_GLOBAL >= 4)
        return -1;
    return (int)(at / LIVE_GLOBAL);
}

// The live pattern's number as the tagged store counts them, -1 when it is none of the project's.
static int live_pattern(u8 *pattern)
{
    if (pattern == LP + LP_PATTERN0)
        return 0;
    addr at = (addr)pattern - (addr)(LP + LP_PATTERNS);
    if ((addr)pattern < (addr)(LP + LP_PATTERNS) || at % LIVE_PATTERN || at / LIVE_PATTERN >= 128)
        return -1;
    return 1 + (int)(at / LIVE_PATTERN);
}

// The stored kit in S of a live kit: the working kit for the edited kit the project is on, the stored kit i for the
// as-last-saved live kit i, else none.
static u8 *stored_kit(u8 *kit)
{
    unsigned k = get32(S + IMG_KIT_INDEX);
    if (k < 128 && kit == LP + LP_KITS + LIVE_KIT * k)
        return S + IMG_KIT0;
    addr at = (addr)kit - (addr)(LP + LP_SAVED_KITS);
    if ((addr)kit >= (addr)(LP + LP_SAVED_KITS) && !(at % LIVE_KIT) && at / LIVE_KIT < 128)
        return S + IMG_KITS + KIT_REC * (unsigned)(at / LIVE_KIT);
    return 0;
}

// ---- live homes

static u8 *sound_byte(u8 *sound, unsigned k)
{
    return k < 3 ? sound + 0x6d + k : sound + 0x71 + 3 * (k - 3);
}

static u8 *track_home(u8 *pattern, unsigned t)
{
    return pattern + LIVE_TRACK * t + TRACK_HOME;
}

static u8 *home(int scope, u8 *item, int index, unsigned k)
{
    switch (scope) {
    case STORE_SOUND: return sound_byte(item, k);
    case STORE_KIT: return item + KIT_HOME + k;
    case STORE_GLOBAL: return &core_store_globals[index][k];
    case STORE_TRACK: return track_home(item, (unsigned)index) + k;
    case STORE_PATTERN: return item + PATTERN_HOME + k;
    default: return tag(S, PROJECT_AT + k);
    }
}

// Stored sound and kit records: the bytes the core owns in them.
static void sound_out(u8 *dst, u8 *live)
{
    for (unsigned k = 0; k < 3; k++)
        dst[SND_F0 + k] = *sound_byte(live, k);
    for (unsigned k = 3; k < 7; k++)
        dst[SND_F3 + k - 3] = *sound_byte(live, k);
    put32(dst + SND_ID, core_store_ids[0]);
    dst[SND_GEN] = gen(STORE_SOUND);
}

static void sound_in(u8 *live, const u8 *src, int valid)
{
    for (unsigned k = 0; k < 3; k++)
        *sound_byte(live, k) = valid ? src[SND_F0 + k] : 0;
    for (unsigned k = 3; k < 7; k++)
        *sound_byte(live, k) = valid ? src[SND_F3 + k - 3] : 0;
}

static void kit_out(u8 *dst, u8 *live)
{
    u8 *fx = dst + KIT_FX;
    copy(fx + FX_F, live + KIT_HOME, 8);
    put32(fx + FX_ID, core_store_ids[0]);
    fx[FX_GEN] = gen(STORE_KIT);
}

// The tagged bytes of pattern n: its 13 tracks (T bytes each), then the pattern's own P bytes.
static unsigned track_at(unsigned n, unsigned t)
{
    return HEADER + (13 * n + t) * T;
}

static unsigned pattern_at(unsigned n)
{
    return PATTERNS_AT + P * n;
}

static void tracks_out(u8 *img, unsigned n, u8 *live)
{
    for (unsigned t = 0; t < 13; t++)
        for (unsigned j = 0; j < T; j++)
            *tag(img, track_at(n, t) + j) = track_home(live, t)[j];
}

static void pattern_out(u8 *img, unsigned n, u8 *live)
{
    for (unsigned j = 0; j < P; j++)
        *tag(img, pattern_at(n) + j) = live[PATTERN_HOME + j];
}

// ---- core_store_get / core_store_set

static int has_base(int scope, void *item, int index)
{
    switch (scope) {
    case STORE_SOUND: case STORE_KIT: case STORE_PATTERN: return item != 0;
    case STORE_GLOBAL: return (unsigned)index < 4;
    case STORE_TRACK: return item != 0 && (unsigned)index < 13;
    case STORE_PROJECT: return 1;
    default: return 0;
    }
}

unsigned core_store_get(unsigned field, void *item, int index)
{
    int scope = field >> 28;
    unsigned bits = (field >> 22) & 63, at = field & 0x3fffff, end = at + bits, value = 0;
    if (!has_base(scope, item, index))
        return 0;
    unsigned short sr = irq_off();
    while (at < end) {
        unsigned skip = at & 7, n = 8 - skip;
        if (n > end - at)
            n = end - at;
        unsigned byte = *home(scope, item, index, at >> 3);
        value = value << n | ((byte >> (8 - skip - n)) & ((1u << n) - 1));
        at += n;
    }
    irq_on(sr);
    return value;
}

// The value just set, copied into its stored copy in S, so a power cycle keeps it as stock keeps its own edits.
static void write_through(int scope, u8 *item, int index)
{
    switch (scope) {
    case STORE_KIT: {
        u8 *kit = stored_kit(item);
        if (kit)
            kit_out(kit, item);
        return;
    }
    case STORE_SOUND: {
        addr at = (addr)item - (addr)(LP + LP_SOUNDS);
        if ((addr)item >= (addr)(LP + LP_SOUNDS) && !(at % LIVE_SOUND) && at / LIVE_SOUND < 128) {
            sound_out(S + IMG_SOUNDS + SOUND_REC * (unsigned)(at / LIVE_SOUND), item);
            return;
        }
        at = (addr)item - (addr)(LP + LP_KITS + KIT_SOUNDS);
        if ((addr)item < (addr)(LP + LP_KITS + KIT_SOUNDS))
            return;
        unsigned in_kit = (unsigned)(at % LIVE_KIT);
        if (in_kit % LIVE_SOUND || in_kit / LIVE_SOUND >= 12)
            return;
        unsigned t = in_kit / LIVE_SOUND;
        u8 *kit = stored_kit(item - KIT_SOUNDS - LIVE_SOUND * t);
        if (kit)
            sound_out(kit + KIT_SOUND0 + SOUND_REC * t, item);
        return;
    }
    case STORE_GLOBAL:
        copy(S + IMG_GLOBALS + GLOBAL_REC * (unsigned)index + GLB_F, core_store_globals[index], 5);
        return;
    case STORE_TRACK:
    case STORE_PATTERN: {
        int n = live_pattern(item);
        if (n < 0 || !store_ok(S, scope))
            return;
        if (scope == STORE_PATTERN)
            pattern_out(S, (unsigned)n, item);
        else
            for (unsigned j = 0; j < T; j++)
                *tag(S, track_at((unsigned)n, (unsigned)index) + j) = track_home(item, (unsigned)index)[j];
        return;
    }
    default:
        return;                            // project: the bytes already live in S
    }
}

void core_store_set(unsigned field, void *item, int index, unsigned value)
{
    int scope = field >> 28;
    unsigned bits = (field >> 22) & 63, at = field & 0x3fffff, end = at + bits, left = bits;
    if (!has_base(scope, item, index))
        return;
    if (bits < 32)
        value &= (1u << bits) - 1;
    unsigned short sr = irq_off();
    while (at < end) {
        unsigned skip = at & 7, n = 8 - skip;
        if (n > end - at)
            n = end - at;
        left -= n;
        unsigned shift = 8 - skip - n, mask = ((1u << n) - 1) << shift;
        u8 *byte = home(scope, item, index, at >> 3);
        *byte = (*byte & ~mask) | (((value >> left) << shift) & mask);
        at += n;
    }
    write_through(scope, item, index);
    irq_on(sr);
}

// ---- the stock routines' own work (store.s)

int st_sound_save_body(u8 *dst, u8 *live, int a);
int st_sound_load_body(u8 *live, u8 *src);
int st_pat_save_body(u8 *dst, u8 *live, int a);
int st_pat_load_body(u8 *live, u8 *src);
int st_kit_save_body(u8 *dst, u8 *live, int a);
int st_kit_load_body(u8 *live, u8 *src);
int st_glob_save_body(u8 *dst, u8 *live, int a);
int st_glob_load_body(u8 *live, u8 *src);
int st_pat_init_body(u8 *pattern, int a);
int st_track_init_body(u8 *track, int a);
int st_sound_init_body(u8 *sound, int a, int b, int c);
int st_proj_init_body(void *project, int a, int b, int c);
int st_proj_load_body(void *live, u8 *src, int progress);

// ---- patterns

int st_pat_save(u8 *dst, u8 *live, int a)
{
    u8 *img = pattern_image(dst);
    int r = st_pat_save_body(dst, live, a);
    int n = pattern_index(img, dst);
    if (n < 0 || !live)
        return r;
    tracks_out(img, (unsigned)n, live);
    pattern_out(img, (unsigned)n, live);
    if (n == 0 && img != S) {
        // a whole project is leaving: it takes the header and the project's bytes along
        tagged_copy(img, S, 0, HEADER);
        tagged_copy(img, S, PROJECT_AT, TAGGED);
    }
    return r;
}

int st_pat_load(u8 *live, u8 *src)
{
    u8 *img = pattern_image(src);
    int r = st_pat_load_body(live, src);
    int n = pattern_index(img, src);
    int tok = n >= 0 && store_ok(img, STORE_TRACK), pok = n >= 0 && store_ok(img, STORE_PATTERN);
    if (!live)
        return r;
    for (unsigned t = 0; t < 13; t++)
        for (unsigned j = 0; j < HOME; j++)
            track_home(live, t)[j] = tok && j < T ? *tag(img, track_at((unsigned)n, t) + j) : 0;
    for (unsigned j = 0; j < HOME; j++)
        live[PATTERN_HOME + j] = pok && j < P ? *tag(img, pattern_at((unsigned)n) + j) : 0;
    if (n == 0 && img != S) {
        if (store_ok(img, STORE_PROJECT))
            tagged_copy(S, img, PROJECT_AT, TAGGED);
        else
            tagged_zero(S, PROJECT_AT, TAGGED);
    }
    return r;
}

// One part of a pattern (a track, its settings or its locks) saved on its own: the tagged bytes follow it when the
// image's layout is this build's.
static void part_out(u8 *record, u8 *live)
{
    u8 *img = pattern_image(record);
    int n = pattern_index(img, record);
    if (n < 0 || !live)
        return;
    if (store_ok(img, STORE_TRACK))
        tracks_out(img, (unsigned)n, live);
    if (store_ok(img, STORE_PATTERN))
        pattern_out(img, (unsigned)n, live);
}

int st_track_save(u8 *dst, u8 *live, int a, int b, int c)
{
    int r = ((part_save)(CORE_TRACK_SAVE_AT))(dst, live, a, b, c);
    if (!dst || !live)
        return r;
    for (unsigned t = 0; t < 13; t++) {
        u8 *record = dst - PAT_TRACK0 - PAT_TRACK_REC * t;
        if (pattern_index(pattern_image(record), record) >= 0) {
            part_out(record, live - LIVE_TRACK * t);
            break;
        }
    }
    return r;
}

int st_settings_save(u8 *dst, u8 *live, int a)
{
    int r = ((part_save)(CORE_SETTINGS_SAVE_AT))(dst, live, a, 0, 0);
    if (dst && live)
        part_out(dst - PAT_SETTINGS, live - LIVE_SETTINGS);
    return r;
}

// Both call stock's entry address: on the send-bus base the lock words hook it.
int st_lock_save(u8 *dst, u8 *live, int a, int param, int track)
{
    int r = ((part_save)(CORE_LOCK_SAVE_AT))(dst, live, a, param, track);
    if (dst && live)
        part_out(dst - PAT_LOCKS, live - LIVE_LOCKS);
    return r;
}

int st_locks_save(u8 *dst, u8 *live, int a)
{
    int r = ((part_save)(CORE_LOCKS_SAVE_AT))(dst, live, a, 0, 0);
    if (dst && live)
        part_out(dst - PAT_LOCKS, live - LIVE_LOCKS);
    return r;
}

int st_pat_init(u8 *pattern, int a)
{
    int r = st_pat_init_body(pattern, a);
    if (pattern)
        zero(pattern + PATTERN_HOME, HOME);
    return r;
}

int st_track_init(u8 *track, int a)
{
    int r = st_track_init_body(track, a);
    if (track)
        zero(track + TRACK_HOME, HOME);
    return r;
}

// ---- sounds and kits

int st_sound_save(u8 *dst, u8 *live, int a)
{
    int r = st_sound_save_body(dst, live, a);
    if (dst && live)
        sound_out(dst, live);
    return r;
}

int st_sound_load(u8 *live, u8 *src)
{
    int r = st_sound_load_body(live, src);
    if (live && src)
        sound_in(live, src, st_image && known(get32(src + SND_ID)) && src[SND_GEN] == gen(STORE_SOUND));
    return r;
}

int st_sound_init(u8 *sound, int a, int b, int c)
{
    int r = st_sound_init_body(sound, a, b, c);
    if (sound)
        sound_in(sound, 0, 0);
    return r;
}

int st_kit_save(u8 *dst, u8 *live, int a)
{
    int r = st_kit_save_body(dst, live, a);
    if (dst && live)
        kit_out(dst, live);
    return r;
}

int st_kit_load(u8 *live, u8 *src)
{
    int r = st_kit_load_body(live, src);
    if (live && src) {
        u8 *fx = src + KIT_FX;
        int valid = st_image && known(get32(fx + FX_ID)) && fx[FX_GEN] == gen(STORE_KIT);
        for (unsigned k = 0; k < 8; k++)
            live[KIT_HOME + k] = valid ? fx[FX_F + k] : 0;
    }
    return r;
}

// ---- global slots

int st_glob_save(u8 *dst, u8 *live, int a)
{
    int r = st_glob_save_body(dst, live, a);
    if (dst) {
        int g = live_slot(live);
        for (unsigned k = 0; k < 5; k++)
            dst[GLB_F + k] = g >= 0 ? core_store_globals[g][k] : 0;
    }
    return r;
}

int st_glob_load(u8 *live, u8 *src)
{
    int r = st_glob_load_body(live, src);
    int g = live_slot(live);
    if (src && g >= 0) {
        u8 *img = global_image(src);          // none for a SysEx global dump: that loads zeros
        int valid = st_image && img && store_ok(img, STORE_GLOBAL);
        for (unsigned k = 0; k < 5; k++)
            core_store_globals[g][k] = valid ? src[GLB_F + k] : 0;
    }
    return r;
}

// ---- whole projects

int st_proj_init(void *project, int a, int b, int c)
{
    int r = st_proj_init_body(project, a, b, c);
    tagged_zero(S, 0, TAGGED);
    put_header(S);
    zero(&core_store_globals[0][0], sizeof core_store_globals);
    fire(CORE_PROJECT_NEW, 0);
    return r;
}

int st_proj_load(void *live, u8 *src, int progress)
{
    int r = st_proj_load_body(live, src, progress);
    u8 *from = is_image(src) ? src : st_image;
    unsigned dropped = 0;
    for (int scope = STORE_GLOBAL; scope <= STORE_PROJECT; scope++)
        if (!store_ok(from, scope))
            dropped |= STORE_DROPPED(scope);
    if (!store_ok(S, STORE_TRACK))
        tagged_zero(S, HEADER, PATTERNS_AT);
    if (!store_ok(S, STORE_PATTERN))
        tagged_zero(S, PATTERNS_AT, PROJECT_AT);
    if (!st_image || !store_ok(S, STORE_PROJECT))
        tagged_zero(S, PROJECT_AT, TAGGED);
    if (!store_ok(S, STORE_GLOBAL))
        for (unsigned g = 0; g < 4; g++)
            zero(S + IMG_GLOBALS + GLOBAL_REC * g + GLB_F, 5);
    put_header(S);
    fire(CORE_PROJECT_LOADED, dropped);
    return r;
}

// SAVE PROJECT AS: stock already keeps S edit by edit; the core's bytes of the saved file follow, by flags, so a
// power cycle keeps the module fields as well.
static void saved_as(u8 *dst, int flags)
{
    if (flags & 0x02)
        for (unsigned g = 0; g < 4; g++)
            copy(S + IMG_GLOBALS + GLOBAL_REC * g + GLB_F, dst + IMG_GLOBALS + GLOBAL_REC * g + GLB_F, 5);
    if (flags & 0x04) {
        for (unsigned i = 0; i <= 128; i++) {
            unsigned kit = i < 128 ? IMG_KITS + KIT_REC * i : IMG_KIT0;
            if (i == 128 && get32(dst + IMG_KIT_INDEX) != get32(S + IMG_KIT_INDEX))
                break;
            copy(S + kit + KIT_FX + FX_F, dst + kit + KIT_FX + FX_F, 13);
            for (unsigned j = 0; j < 12; j++)
                copy(S + kit + KIT_SOUND0 + SOUND_REC * j + SND_F0, dst + kit + KIT_SOUND0 + SOUND_REC * j + SND_F0, 12);
        }
    }
    if (flags & 0x08)
        tagged_copy(S, dst, 0, TAGGED);
    if (flags & 0x20)
        for (unsigned i = 0; i < 128; i++)
            copy(S + IMG_SOUNDS + SOUND_REC * i + SND_F0, dst + IMG_SOUNDS + SOUND_REC * i + SND_F0, 12);
}

int st_file_save(u8 *dst, void *live, int a, int flags, int progress)
{
    st_image = dst;
    int r = ((serial_save)(CORE_SAVE_AT))(dst, live, a, flags, progress);
    st_image = S;
    if (r && dst != S && live == (void *)LP && is_image(dst))
        saved_as(dst, flags);
    return r;
}

// Through the stock load's own entry, which is st_proj_load's site.
int st_file_load(void *live, u8 *src, int progress)
{
    st_image = src && get32(src + 4) == 9 ? src : 0;   // an older project version brings no module data
    int r = ((serial_load)(CORE_LOAD_AT))(live, src, progress);
    st_image = S;
    return r;
}

// ---- copies (memcpy's contract)

void *st_song_copy(u8 *dst, const u8 *src, unsigned n)
{
    if (n != SONG_REC) {
        copy(dst, src, n);
        return dst;
    }
    for (unsigned i = 0; i < n; i++)
        if (i < 0x116 || i > 0x116 + 4 * 255 || (i - 0x116) & 3)
            dst[i] = src[i];                  // the target keeps its tagged bytes
    return dst;
}

void *st_pattern_copy(u8 *dst, const u8 *src, unsigned n)
{
    copy(dst, src, n);
    if (n == PATTERN_REC) {
        // a pattern record copied in from elsewhere brings no module data
        u8 *img = pattern_image(dst);
        int k = pattern_index(img, dst);
        if (k >= 0) {
            if (store_ok(img, STORE_TRACK))
                tagged_zero(img, track_at((unsigned)k, 0), track_at((unsigned)k, 13));
            if (store_ok(img, STORE_PATTERN))
                tagged_zero(img, pattern_at((unsigned)k), pattern_at((unsigned)k) + P);
        }
    }
    return dst;
}
