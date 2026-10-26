/* SPDX-License-Identifier: MIT
 * Copyright (C) 2026 Jan Kolkmeier
 *
 * BUTTER FINGERS: removing a lock by pressing a DATA ENTRY knob no longer
 * writes a new one when the knob slips a detent. On the MKII the press is a
 * lock toggle applied on release, and a turn while pressed is stock's coarse
 * edit (x7) that cancels the toggle. While a TRIG key (a parameter lock) or
 * SCENE A/B (a scene lock) is held, a pressed knob's first single detent is
 * dropped (the slip that would turn the removal into a x7 jump); further turns pass,
 * so a deliberate coarse edit works, one detent short. Every turn of that knob
 * is dropped for QUIET ticks after its release (the detent the release turns).
 * Everything else reaches the firmware as before: the press itself, the other
 * knobs, LEVEL, and press + turn outside lock editing (TEMPO's LEVEL steps x7
 * while pushed, octabam docs/firmware/MAINMENU.md). It takes no key and patches
 * no stock code.
 *
 * MKII panel codes (octabam docs/firmware/PANEL.md): TRIG 1-16 are keys
 * 0x00-0x0f, SCENE A/B 0x19/0x1a, the pushes of knobs A-F 0x38-0x3d; turns are
 * encoders 0-5. The runtime hooks (sdk/runtime/loader/modwerk_module.h): a
 * nonzero return takes the event from the firmware; the tick runs 60 times a
 * second. DIAG's value counts the turns taken.
 *
 * generate.py compiles this into butter_fingers_core.s, the unit manifest.py
 * links; verify.py runs it on the host. */
#include <stdint.h>

#define KNOBS 6u
#define TRIGS 16
#define PUSH_A 0x38
#define SCENE_A 0x19
#define SCENE_B 0x1a
#define QUIET 9u                 /* UI ticks after a release (60 a second): 150 ms */

struct bf_api { volatile uint32_t value; };   /* modwerk_runtime_api */

#define MAGIC 0x42464731u      /* "BFG1": card builds do not zero .bss (docs/BUILDER_MEMORY.md) */

struct bf_state {
    uint32_t magic, now, taken;  /* taken: the turns dropped (DIAG's value) */
    uint32_t quiet_until[KNOBS]; /* the tick each knob's release window ends */
    uint16_t trigs;              /* TRIG keys held, one bit each */
    uint8_t scenes;              /* SCENE A / B held */
    uint8_t held;                /* knobs pressed while a lock was being edited */
    uint8_t slipped;             /* of them, those whose first detent was seen */
};
static struct bf_state bf;
/* Read once a call, so the state is addressed through a register: one relocation a function instead of one an
 * access (the package's relocation list, small ascending offsets, must not match a stock table). */
static struct bf_state *volatile bf_at = &bf;

/* The state, set up on first use. */
static struct bf_state *ready(void)
{
    struct bf_state *s = bf_at;
    if (s->magic == MAGIC) return s;
    uint8_t *p = (uint8_t *)s;
    for (unsigned i = 0; i < sizeof *s; ++i) p[i] = 0;
    s->magic = MAGIC;
    return s;
}

#ifdef BF_HOST
void *bf_state(unsigned *bytes) { *bytes = sizeof bf; return &bf; }  /* verify.py's garbage-state check */
#endif

static int editing_locks(const struct bf_state *s) { return s->trigs || s->scenes; }

int bf_key(int code, int pressed)
{
    struct bf_state *s = ready();
    if (code >= 0 && code < TRIGS) {
        if (pressed) s->trigs |= (uint16_t)(1u << code); else s->trigs &= (uint16_t)~(1u << code);
    } else if (code == SCENE_A || code == SCENE_B) {
        uint8_t bit = code == SCENE_A ? 1u : 2u;
        if (pressed) s->scenes |= bit; else s->scenes &= (uint8_t)~bit;
    } else if (code >= PUSH_A && code < PUSH_A + (int)KNOBS) {
        unsigned bit = 1u << (code - PUSH_A);
        if (pressed) {
            if (editing_locks(s)) s->held |= (uint8_t)bit, s->slipped &= (uint8_t)~bit;
        } else if (s->held & bit) {
            s->held &= (uint8_t)~bit;
            s->quiet_until[code - PUSH_A] = s->now + QUIET;
        }
    }
    return 0;
}

int bf_enc(int encoder, int delta)
{
    struct bf_state *s = ready();
    if (encoder < 0 || encoder >= (int)KNOBS) return 0;
    unsigned bit = 1u << encoder;
    if (s->held & bit) {
        /* A single first detent is the slip; a coalesced fast turn (|delta| > 1) or a later one is a coarse edit. */
        int slip = !(s->slipped & bit) && (delta == 1 || delta == -1);
        s->slipped |= (uint8_t)bit;
        if (!slip) return 0;
    } else if ((int32_t)(s->quiet_until[encoder] - s->now) <= 0) {
        return 0;
    }
    s->taken++;
    return 1;
}

void bf_tick(struct bf_api *api)
{
    struct bf_state *s = ready();
    s->now++;
    api->value = s->taken;
}
