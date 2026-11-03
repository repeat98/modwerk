/* SPDX-License-Identifier: MIT */
/* digidice: a meloDICEr-style random melody generator for the Digitakt mk1
 * (OS 1.54). A double press on TRIG opens its page on the active track,
 * audio or MIDI (the first press shows the TRIG page as usual):
 *
 *   A DENSITY  B NOTE VALUE  C VARIATION  D LEGATO
 *   E ROOT     F SCALE       G RANGE      H VEL
 *   YES rolls everything, LEFT the rhythm, RIGHT the notes; NO or a
 *   double press on TRIG closes.
 *
 * The melody is written into the pattern as ordinary trigs with NOTE, VEL
 * and LEN, through the OS's own step setters, from the UI task (ev_tick).
 * Opening the page changes nothing; a roll or a knob turn does. Knob turns
 * are written about 150 ms after the knob stops, and only the steps that
 * changed. Timing is the instrument's own: the track's length and speed,
 * the tempo and swing. */
#include "engine.h"

typedef signed char s8;
typedef unsigned char u8;
typedef unsigned short u16;
typedef int s32;
typedef unsigned int u32;

typedef u32 (*fn0_t)(void);
typedef u32 (*fn1_t)(u32);
typedef u32 (*fn2_t)(u32, u32);
typedef s32 (*set_t)(u32 trk, s32 step, s32 v);
typedef void (*fill_t)(void *bmp, s32 x0, s32 y0, s32 x1, s32 y1, s32 colour);
typedef void (*text_t)(void *bmp, const void *font, s32 x, s32 y, s32 maxlen, const char *fmt, ...);

/* OS 1.54 (sdk/digitakt/research/pattern-write.md) */
#define APP        ((fn0_t)0x40138882)
#define TSTATE     ((fn1_t)0x40014d86)   /* (app) -> the TrackState */
#define ACTIVE     ((fn1_t)0x4001d27e)   /* (TrackState) -> the active track, 0-15 */
#define KB_ON      ((fn1_t)0x4001d4f0)   /* (TrackState) -> the keyboard is on (a byte) */
#define PATTERN    ((fn1_t)0x40015786)   /* (app) -> the pattern */
#define PTRACK     ((fn2_t)0x40012a02)   /* (pattern, t) -> its track t */
#define TRIGSET    ((set_t)0x400261c2)   /* a note trig on (resets NOTE/VEL/LEN) or off */
#define NOTESET    ((set_t)0x40024942)
#define VELSET     ((set_t)0x40024b2a)   /* not clamped */
#define LENSET     ((set_t)0x40024ba4)   /* an index into the LEN table, not clamped */
#define EFFLEN     ((fn1_t)0x40024700)   /* (trk) -> the effective length */
#define FILLRECT   ((fill_t)0x400c1bce)  /* colour 0 clears, 1 sets, -1 inverts; y = 0 at the bottom */
#define TEXTF      ((text_t)0x400c27a4)
#define FONT5      ((const void *)0x40200ebc)

/* Track data (vtable slot 10): u16 flags[64] (bit 0 a trig), NOTE at
 * +0x280, the track's VEL at +0x380 and NOTE at +0x384. */
#define D_NOTE     0x280
#define D_TVEL     0x380
#define D_TNOTE    0x384

#define K_DOUBLE 4                  /* the event's flags: a double press */
#define K_PLAY  10
#define K_STOP  11
#define K_YES   12
#define K_NO    13
#define K_TRIG  19
#define K_LEFT  16
#define K_RIGHT 17
#define K_FUNC  1

#define NOTE_BASE  60       /* the root's octave: C5 (0) on an audio track */
#define DEBOUNCE   5        /* ticks (30 a second) after the last knob turn */

static dd_settings set = { 80, 1, 0, 64, 0, 1, 7, 0 };
static u32 rseed, nseed;
static s32 open, dirty, quiet, repaint;
static u32 swallow, ticks;
static dd_step out[DD_STEPS];

/* What was last written to each step, to write only what changed. */
static struct { s8 on, note, vel, len; } done[DD_STEPS];
static s32 done_valid;

static u8 *tdata(u32 trk)
{
    u32 (*get)(u32) = *(u32 (**)(u32))(*(u32 *)trk + 40);
    return (u8 *)get(trk);
}

static s32 active_track(void)
{
    s32 t = (s32)ACTIVE(TSTATE(APP()));
    return t < 0 || t > 15 ? -1 : t;
}

static u32 track_handle(s32 t)
{
    return t < 0 ? 0 : PTRACK(PATTERN(APP()), (u32)t);
}

static s32 track_length(u32 trk)
{
    s32 n = (s32)EFFLEN(trk);
    return n < 1 ? 1 : n > DD_STEPS ? DD_STEPS : n;
}

/* A length in eighths of a step -> the nearest TRIG page LEN index: eighths
 * up to 4 steps, quarters to 8, halves to 16 (checked against OS 1.54). */
static s32 len_index(s32 e)
{
    if (e < 1)
        e = 1;
    if (e <= 32)
        return e - 1;
    if (e <= 64)
        return 31 + (e - 32 + 1) / 2;
    if (e > 128)
        e = 128;
    return 47 + (e - 64 + 2) / 4;
}

static void write_track(void)
{
    s32 t = active_track(), s, len;
    u32 trk = track_handle(t);
    u8 *d;
    s32 vbase;
    if (!trk)
        return;
    len = track_length(trk);
    d = tdata(trk);
    vbase = (s8)d[D_TVEL];
    if (vbase < 1 || vbase > 127)
        vbase = 100;
    dd_generate(&set, rseed, nseed, len, (u8)vbase, out);
    for (s = 0; s < len; s++) {
        s8 on = (s8)out[s].on, note = 0, vel = 0, l = 0;
        if (on) {
            s32 n = NOTE_BASE + out[s].note;
            note = (s8)(n > 127 ? 127 : n);
            vel = (s8)out[s].vel;
            l = (s8)len_index(out[s].len);
        }
        if (done_valid && done[s].on == on && done[s].note == note
            && done[s].vel == vel && done[s].len == l)
            continue;
        if (on) {
            TRIGSET(trk, s, 1);
            NOTESET(trk, s, note);
            VELSET(trk, s, vel);
            LENSET(trk, s, l);
        } else {
            TRIGSET(trk, s, 0);
        }
        done[s].on = on;
        done[s].note = note;
        done[s].vel = vel;
        done[s].len = l;
    }
    done_valid = 1;
}

static void roll(s32 rhythm, s32 notes)
{
    if (!rseed)                        /* the first roll: seeds from the clock */
        rseed = ticks * 2654435761u + 1, nseed = ticks * 40503u + 7;
    if (rhythm)
        rseed = dd_next_seed(rseed);
    if (notes)
        nseed = dd_next_seed(nseed);
    dirty = 1;
    quiet = DEBOUNCE;                  /* a roll is written on the next tick */
}

static void page_open(void)
{
    open = 1;
    done_valid = 0;                    /* the track may have changed since */
    dirty = 0;
}

int digidice_key(void *brain, void *ev)
{
    s32 key = *(s32 *)((u8 *)ev + 12), fl = *(s32 *)((u8 *)ev + 16);
    s32 press = (fl & 1) && !(fl & 8);
    u32 bit = key >= 0 && key < 32 ? 1u << key : 0;
    (void)brain;
    if (!(fl & 1)) {                   /* a release: swallow the ones we took */
        if (swallow & bit) {
            swallow &= ~bit;
            return 1;
        }
        return 0;
    }
    if (!open) {
        if (key == K_TRIG && press && (fl & K_DOUBLE) && active_track() >= 0) {
            page_open();
            swallow |= bit;
            return 1;
        }
        return 0;
    }
    /* The page is open: the transport and FUNC work as usual, the rest is ours. */
    if (key == K_PLAY || key == K_STOP || key == K_FUNC)
        return 0;
    swallow |= bit;
    if (!press)
        return 1;
    switch (key) {
    case K_YES:   roll(1, 1); break;
    case K_LEFT:  roll(1, 0); break;
    case K_RIGHT: roll(0, 1); break;
    case K_NO:
        open = 0;
        repaint = 1;
        break;
    case K_TRIG:                       /* a single press is ignored */
        if (fl & K_DOUBLE)
            open = 0, repaint = 1;
        break;
    }
    return 1;
}

static s32 clampi(s32 v, s32 lo, s32 hi)
{
    return v < lo ? lo : v > hi ? hi : v;
}

int digidice_enc(void *brain, void *ev)
{
    s32 enc = *(s32 *)((u8 *)ev + 12), dv = *(s32 *)((u8 *)ev + 16);
    s32 one = dv > 0 ? 1 : dv < 0 ? -1 : 0;   /* lists move one entry a click */
    (void)brain;
    if (!open)
        return 0;
    switch (enc) {
    case 1: set.density = (u8)clampi(set.density + dv, 0, 127); break;
    case 2: set.spacing = (u8)clampi(set.spacing + one, 0, DD_SPACINGS - 1); break;
    case 3: set.variation = (u8)clampi(set.variation + dv, 0, 127); break;
    case 4: set.legato = (u8)clampi(set.legato + dv, 0, 127); break;
    case 5: set.root = (u8)((set.root + 12 + one) % 12); break;
    case 6: set.scale = (u8)clampi(set.scale + one, 0, DD_SCALES - 1); break;
    case 7: set.range = (u8)clampi(set.range + dv, 0, DD_RANGE_MAX); break;
    case 8: set.vel_spread = (u8)clampi(set.vel_spread + dv, 0, 127); break;
    default: return 1;
    }
    if (!rseed)
        roll(0, 0);                    /* turning a knob first also needs seeds */
    dirty = 1;
    quiet = 0;
    return 1;
}

void digidice_tick(void *ctrl)
{
    ticks++;
    if (repaint) {                     /* closed: let the OS draw its own page again */
        repaint = 0;
        *((u8 *)ctrl + 0x20) = 1;
    }
    if (!open)
        return;
    if (dirty && ++quiet >= DEBOUNCE) {
        dirty = 0;
        write_track();
    }
    *((u8 *)ctrl + 0x20) = 1;          /* keep the page drawn */
}

static const char *const root_names[12] = {
    "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"
};

/* The track as it is now: a bar per trig, its height the note, scaled to
 * the lowest and highest notes shown. */
static void draw_roll(void *bmp, u32 trk)
{
    u8 *d = tdata(trk);
    s32 len = track_length(trk), s, tnote = (s8)d[D_TNOTE], lo = 127, hi = 0;
    for (s = 0; s < len; s++)
        if (((u16 *)d)[s] & 1) {
            s32 n = (s8)d[D_NOTE + s];
            if (n < 0)
                n = tnote;
            lo = n < lo ? n : lo;
            hi = n > hi ? n : hi;
        }
    for (s = 0; s < len; s++) {
        s32 x0 = s * 128 / len, x1 = (s + 1) * 128 / len - 2, n, h;
        if (!(((u16 *)d)[s] & 1))
            continue;
        n = (s8)d[D_NOTE + s];
        if (n < 0)
            n = tnote;
        h = hi > lo ? (n - lo) * 16 / (hi - lo) : 8;
        if (x1 < x0)
            x1 = x0;
        FILLRECT(bmp, x0, 37 + h, x1, 38 + h, 1);
    }
    FILLRECT(bmp, 0, 35, 127, 35, 1);
}

static void cell(void *bmp, s32 col, s32 y, const char *label, const char *fmt, s32 v, const char *sv)
{
    s32 x = col * 32 + 2;
    if (sv)
        TEXTF(bmp, FONT5, x, y + 7, 8, "%s", sv);
    else
        TEXTF(bmp, FONT5, x, y + 7, 8, fmt, v);
    TEXTF(bmp, FONT5, x, y, 8, "%s", label);
}

void digidice_draw(void *bmp, void *ctrl)
{
    s32 t;
    u32 trk;
    (void)ctrl;
    if (!open)
        return;
    t = active_track();
    trk = track_handle(t);
    FILLRECT(bmp, 0, 0, 127, 63, 0);
    TEXTF(bmp, FONT5, 2, 57, 30, "DIGIDICE  %s%d  LEN %d", t < 8 ? "T" : "M",
          t < 8 ? t + 1 : t - 7, trk ? track_length(trk) : 0);
    FILLRECT(bmp, 0, 56, 127, 63, -1);
    if (trk)
        draw_roll(bmp, trk);
    cell(bmp, 0, 22, "DENS", "%d", set.density, 0);
    cell(bmp, 1, 22, "NOTE", "%d", dd_spacing_steps(set.spacing), 0);
    cell(bmp, 2, 22, "VAR", "%d", set.variation, 0);
    cell(bmp, 3, 22, "LEG", "%d", set.legato, 0);
    cell(bmp, 0, 8, "ROOT", 0, 0, root_names[set.root % 12]);
    cell(bmp, 1, 8, "SCALE", 0, 0, dd_scale_name(set.scale));
    cell(bmp, 2, 8, "RANGE", "%d", set.range, 0);
    cell(bmp, 3, 8, "VEL", "%d", set.vel_spread, 0);
    TEXTF(bmp, FONT5, 2, 0, 32, "YES ROLL  < RHYTHM  > NOTES");
}
