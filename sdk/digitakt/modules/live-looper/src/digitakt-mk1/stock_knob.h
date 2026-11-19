/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Stock knob handling for pages a module draws itself: Digitakt I, OS 1.54.
 *
 * It calls the firmware's own routines, so a module's page turns exactly like a stock parameter page:
 *  - speed: the stock accumulator (0x400c06ae) on a stock knob-state object (built by 0x400c053c, which
 *    runs its own 10 ms timer for the speed);
 *  - pushed while turning: the coarse multiplier, from the event's push flag (0x400c047e);
 *  - FUNC + turn: after the stock hold-off of a few counts (0x400c08b0, 0x400c08de) the turn is a jump.
 *    Stock jumps per parameter: most to their default, centred ones to the middle and then the end;
 *    dt_knob_jump() does either.
 *
 * Each module keeps its own dt_knobs; nothing is shared between modules. Call from the UI task only
 * (the ev_enc and ev_tick handlers). */
#ifndef DIGITAKT_MK1_STOCK_KNOB_H
#define DIGITAKT_MK1_STOCK_KNOB_H

typedef struct { unsigned int w[64]; } dt_knobs;     /* the firmware's object is 252 bytes; w[63] is ours */

/* Acceleration profiles in the firmware's data, with the multipliers stock pairs them with. */
#define DT_KNOB_FINE ((const unsigned char *)0x4208dbb8)   /* 0-127 values: x1, pushed x4 */
#define DT_KNOB_LIST ((const unsigned char *)0x4208db80)   /* lists, small ranges: x1, pushed x8 */

#define DT_FW_KNOBS_NEW   ((void (*)(void *))0x400c053c)
#define DT_FW_KNOBS_RESET ((void (*)(void *))0x400c050c)
#define DT_FW_ENC_DELTA   ((int (*)(void *, int, int))0x400c047e)
#define DT_FW_ENC_PUSHED  ((unsigned char (*)(void *))0x400c049c)
#define DT_FW_KNOB_ACC    ((int (*)(void *, int, int, const void *, int))0x400c06ae)   /* state, knob, delta, profile, pushed */
#define DT_FW_HOLDOFF_SET ((void (*)(void *, int))0x400c08b0)
#define DT_FW_HOLDOFF     ((unsigned char (*)(void *, int))0x400c08de)
#define DT_FW_KEY_HELD    ((int (*)(int))0x400d399c)
#define DT_KEY_FUNC       1

static inline void dt_knobs_init(dt_knobs *k)          /* once, before the first turn */
{
    if (!k->w[63]) { DT_FW_KNOBS_NEW(k); k->w[63] = 1; }
}

static inline void dt_knobs_reset(dt_knobs *k)         /* the page is shown: no speed left over */
{
    dt_knobs_init(k);
    DT_FW_KNOBS_RESET(k);
}

/* A turn of knob 0-9 (A-H 0-7, LEVEL 8): the change in 1/256 steps, or 0. *jump is 1 when FUNC is held:
 * then only the sign counts, and the caller jumps (dt_knob_jump). */
static inline int dt_knob(dt_knobs *k, void *ev, int knob, const unsigned char *profile, int *jump)
{
    int pushed, d, func;
    dt_knobs_init(k);
    pushed = DT_FW_ENC_PUSHED(ev) != 0;
    d = DT_FW_ENC_DELTA(ev, 1, profile == DT_KNOB_LIST ? 8 : 4);
    d = DT_FW_KNOB_ACC(k, knob, d, profile, pushed);
    *jump = 0;
    if (!d) return 0;
    if (!profile[1] && !(profile[2] && pushed)) d <<= 8;   /* whole steps: in 1/256 like the rest */
    func = DT_FW_KEY_HELD(DT_KEY_FUNC) != 0;
    if (func && !(k->w[63] & 2)) DT_FW_HOLDOFF_SET(k, knob);
    k->w[63] = func ? 3 : 1;
    if (DT_FW_HOLDOFF(k, knob)) return 0;
    *jump = func;
    return d;
}

/* FUNC + turn: the stock jump, to def. With def DT_CENTRE (a fader, a centred value) it goes to the middle
 * of the range, then to the end it turns towards, as stock's centred parameters do. */
#define DT_CENTRE 0x7fff
static inline int dt_knob_jump(int v, int d, int lo, int hi, int def)
{
    int mid = lo + (hi - lo + 1) / 2;
    if (def != DT_CENTRE) return def;
    if (d < 0) return mid < v ? mid : lo;
    return mid > v ? mid : hi;
}

/* A turn applied to a value with 8 fraction bits kept in *frac (as stock keeps 8.8 values). */
static inline int dt_knob_apply(int v, int *frac, int d, int lo, int hi)
{
    int x = v * 256 + *frac + d;
    if (x < lo * 256) x = lo * 256;
    if (x > hi * 256 + 255) x = hi * 256 + 255;
    *frac = x & 255;
    return x >> 8;
}

#endif
