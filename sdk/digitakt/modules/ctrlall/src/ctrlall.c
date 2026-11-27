/* SPDX-License-Identifier: GPL-2.0-or-later */
/* Ctrl All for the Digitakt mk1 (OS 1.54), after the Analog Rytm mod of the same name.
 *
 * Hold TRK and press YES to turn CTRL ALL on or off (a small ALL shows in the top-right corner while
 * it is on). While it is on, a parameter lock you set with a knob (hold a trig, turn a knob) is
 * also set on the same step of every other track that has a trig there: the other audio tracks
 * when you are on an audio track, the other MIDI tracks when you are on a MIDI track. Steps with
 * no trig are left alone, so no lock memory is spent on locks that would never play.
 *
 * How it works (OS 1.54, found by reading its code):
 *   - every lock the firmware writes goes through PatternParamLocks::set(locks, track, step, param,
 *     value) at 0x40013ee4, called from one place only, Track::setLock (the jsr at 0x4002479a).
 *     That jsr now calls ca_setlock, which calls the real set first and then, when CTRL ALL is on
 *     and a knob just turned, calls it again for the other tracks.
 *   - locks->vtable[10](locks) is the start of the pattern's lock area, which sits 0x38f0 bytes
 *     (16 tracks x 911) after the start of the pattern itself; a track's step words are at
 *     pattern + 911 * track + 2 * step (big-endian), bit 0 set when the step has a trig. That is the
 *     layout seq-events reads (mods/seq-events-dt1/dev.h).
 *   - before it trusts that, it checks that the pattern it worked out is the one the sequencer
 *     plays (the pointer at 0x4199ec38). If not, it copies nothing.
 * "A knob just turned" means: an encoder event came since the last UI tick. So pasting, clearing,
 * CREATE RANDOM LOCKS and the rest are never copied, only your knob turns (also live-recorded
 * ones while the pattern plays). */
#include <stdint.h>
#include "digitakt-mk1/core3.h"

typedef int32_t (*set_fn)(void *locks, int32_t track, int32_t step, int32_t param, int32_t value);
typedef uint32_t (*vfn)(void *self);

#define LOCK_SET   ((set_fn)LOCK_SET_AT)
#define PATTERN_PP ((const uint8_t *const volatile *)PATTERN_PP_AT)

#define TRACK_STRIDE 911
#define LOCKS_OFF    0x38f0                     /* 16 * 911: the lock area after the tracks */
#define WORD_TRIG    0x0001

#define E_KEY      12
#define E_FLAGS    16
#define F_REPEAT   0x08
#define F_RELEASE  0x10
#define F_DOWN     0x01                         /* the firmware's own "is it down" (0x400c33fc) */
#define IS_UP(f)   (!((f) & F_DOWN) || ((f) & F_RELEASE))
#define K_TRK      2
#define K_YES      12

static int32_t on;                              /* CTRL ALL */
static int32_t knob_turned;                     /* an encoder event since the last tick */
static int32_t busy;                            /* inside our own copies: never copy those again */
static int32_t trk_held, swallow_yes;
static int32_t warned;                          /* "CTRL ALL: NO PATTERN" shown once */

static const char *msg;
static int32_t msg_ticks, redraw;

static void say(const char *text)
{
    msg = text;
    msg_ticks = 36;
    redraw = 1;
}

static int32_t has_trig(const uint8_t *pattern, int32_t track, int32_t step)
{
    const uint8_t *w = pattern + TRACK_STRIDE * track + 2 * step;
    return ((w[0] << 8) | w[1]) & WORD_TRIG;
}

/* Track::setLock's call of PatternParamLocks::set, with the same arguments and result */
int32_t ca_setlock(void *locks, int32_t track, int32_t step, int32_t param, int32_t value)
{
    int32_t result = LOCK_SET(locks, track, step, param, value);
    if (on && knob_turned && !busy && (result & 0xff) && track >= 0 && track < 16 && step >= 0
        && step < 64) {
        uint32_t vt = *(const uint32_t *)locks;
        vfn area_of = *(const vfn *)(vt + 40);
        uint32_t area = area_of(locks);
        const uint8_t *pattern = (const uint8_t *)(area - LOCKS_OFF);
        if (area && pattern == *PATTERN_PP) {
            int32_t first = track < 8 ? 0 : 8, t;
            busy = 1;
            for (t = first; t < first + 8; t++)
                if (t != track && has_trig(pattern, t, step))
                    LOCK_SET(locks, t, step, param, value);
            busy = 0;
        } else if (!warned) {                   /* the layout isn't what we expect: say so once */
            warned = 1;
            say("CTRL ALL: NO PATTERN");
        }
    }
    return result;
}

int32_t ctrlall_enc(void *brain, void *ev)
{
    (void)brain; (void)ev;
    knob_turned = 1;
    return 0;                                   /* the stock still handles the turn */
}

int32_t ctrlall_key(void *brain, void *ev)
{
    int32_t key = *(int32_t *)((char *)ev + E_KEY);
    int32_t flags = *(int32_t *)((char *)ev + E_FLAGS);
    (void)brain;
    if (key == K_TRK)
        trk_held = !IS_UP(flags);
    if (key == K_YES && swallow_yes) {
        if (IS_UP(flags))
            swallow_yes = 0;
        return 1;
    }
    if (key == K_YES && trk_held && !IS_UP(flags) && !(flags & F_REPEAT)) {
        swallow_yes = 1;
        on = !on;
        say(on ? "CTRL ALL ON" : "CTRL ALL OFF");
        return 1;
    }
    return 0;
}

void ctrlall_tick(void *ctrl)
{
    knob_turned = 0;
    if (msg_ticks > 0 && --msg_ticks == 0)
        redraw = 1;
    if (redraw || msg_ticks > 0) {
        *((uint8_t *)ctrl + 0x20) = 1;
        redraw = 0;
    }
}

static int32_t text_len(const char *s)
{
    int32_t n = 0;
    while (s[n])
        n++;
    return n;
}

void ctrlall_draw(void *bmp, void *ctrl)
{
    (void)ctrl;
    if (on) {                                   /* ALL, left of Kit A/B's B */
        fw_fillrect(bmp, 103, 55, 117, 63, 0);
        fw_framerect(bmp, 103, 55, 117, 63, 1);
        fw_textf(bmp, fw_font5, 105, 57, 4, "ALL");
    }
    if (msg_ticks > 0 && msg) {
        int32_t w = text_len(msg) * 4;
        int32_t x0 = 64 - w / 2 - 5, x1 = 64 + w / 2 + 4;
        fw_fillrect(bmp, x0, 24, x1, 38, 0);
        fw_framerect(bmp, x0, 24, x1, 38, 1);
        fw_textf(bmp, fw_font5, 64 - w / 2, 29, 24, "%s", msg);
    }
}
