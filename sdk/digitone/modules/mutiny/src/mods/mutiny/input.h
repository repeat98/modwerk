/* SPDX-License-Identifier: GPL-2.0-or-later */
/* MUTINY input: which key gesture belongs to the page, and what it means. Stock combinations keep
 * their meaning (FUNC+YES/NO, held trig + YES, encoder+NO, MIDI tracks); TRIG opens the page from
 * the stock page and the next TRIG returns it. Encoder fractions are per track and model. */
#ifndef MUTINY_INPUT_H
#define MUTINY_INPUT_H

#include "../../src/engine/engine.h"
#include <stdint.h>

#define MU_KEY_FUNC 1
#define MU_KEY_YES 13
#define MU_KEY_NO 14
#define MU_KEY_TRIG1 26 /* trig keys 1-16: 26-41 */
#define MU_KEY_TRIG16 41
#define MU_KEY_PUSH_A 46
#define MU_KEY_PUSH_H 53
#define MU_KEY_TRIGPAGE 20 /* TRIG PARAMETERS */
#define MU_KEY_PAGE 19     /* PAGE: the pattern step pages */
#define MU_KEY_PAGE_LO 19  /* PAGE, TRIG, SYN1, SYN2, FLTR, AMP, LFO: 19-25 */
#define MU_KEY_PAGE_HI 25
#define MU_KEY_MENUS_LO 2 /* MIDI, KEYBOARD, PTN, BANK, SONG, GLOBAL, VOICE: 2-8 */
#define MU_KEY_MENUS_HI 8
#define MU_KEY_T1 42
#define MU_KEY_T4 45
#define MU_KEY_LEVELDATA 54

#define MU_MENU_TICKS 14 /* 0.47 s at 30 Hz: after the panel's key repeat, before a hand acts */

#define MU_FLAG_PRESS 0x1u
#define MU_FLAG_FUNC 0x2u /* FUNC is held with this event */
#define MU_FLAG_REPEAT 0x8u
#define MU_FLAG_RELEASE 0x10u

enum {
    MU_ACT_PASS = 0,
    MU_ACT_TAKE = 1u << 0,       /* the page consumes the key */
    MU_ACT_OPEN = 1u << 1,       /* open the page on the selected track */
    MU_ACT_COMMIT = 1u << 2,     /* YES: write the selected track */
    MU_ACT_CANCEL = 1u << 3,     /* NO: cancel the preview, or uncommit */
    MU_ACT_SELECT = 1u << 4,     /* a track key selects the page's track */
    MU_ACT_CLOSE_PASS = 1u << 5, /* close and let the stock key proceed */
    MU_ACT_REROLL = 1u << 6,     /* push H tapped on its own track */
    MU_ACT_HOLD = 1u << 7,       /* push H held: the hold begins or ends */
    MU_ACT_HOLD_END = 1u << 8,
    MU_ACT_RESET = 1u << 9, /* encoder push + NO: reset that knob */
    MU_ACT_MENU = 1u << 10  /* a held track key: the core's Mod Menu is over the page */
};

struct mu_input {
    uint8_t func; /* FUNC is down */
    uint8_t no_down;
    uint8_t no_used;   /* an encoder turned while NO was held: a stock reset, not ours */
    uint8_t no_track;  /* the track NO was pressed on: the cancel belongs there */
    uint8_t trig_down; /* a trig key is held: YES is the stock preview */
    uint8_t h_down;
    uint8_t h_used; /* a turn was consumed during this hold: no tap reroll */
    uint8_t h_ticks;
    uint8_t h_track;
    uint8_t holding;     /* H held long enough on TURI */
    uint8_t push;        /* the encoder held down, 0xff none (0-6; H has its own gesture) */
    uint8_t reset;       /* the knob a latched encoder+NO reset belongs to, 0xff none */
    uint8_t reset_track; /* the track the reset formed on: a later selection never moves it */
    uint8_t acc_track;
    uint8_t acc_model;
    uint8_t track_down; /* the page's track key held, 0xff none */
    uint8_t track_ticks;
    int32_t acc[MU_KNOBS];
};

void mu_in_init(struct mu_input *in);

/* Apply one key event. page_open: the page is showing; page_track: its track (updated by a track
 * key). synth_ctx: a MIDI track never opens the page. -> MU_ACT_* bits. */
uint32_t mu_in_key(struct mu_input *in, uint32_t key, uint32_t flags, uint8_t page_open,
                   uint8_t *page_track, uint8_t synth_ctx, uint8_t generated);

/* The page's 30 Hz tick: advances H's hold timer against the model H began on.
 * -> MU_ACT_HOLD once when a hold begins. */
uint32_t mu_in_tick(struct mu_input *in, uint8_t model);

/* The page closed or a browser took the screen: no gesture stays owned. */
void mu_in_release_all(struct mu_input *in);

/* Whole detents for the visible track and model; 0 for a fraction not arrived yet. per: counts one
 * unit takes (4 * mu_knob_step). A track or model change clears the fractions first. */
int32_t mu_in_detents(struct mu_input *in, uint8_t knob, int32_t delta, int32_t per, uint8_t track,
                      uint8_t model);

/* A turn was consumed: a later H release is not a tap. */
void mu_in_turn_used(struct mu_input *in);

/* The count HITS plays: a stored value above the length is heard as the length. */
int32_t mu_in_effective(int32_t stored, int32_t len);

/* EUCL HITS: the value a turn starts from. Turning down begins at the count it plays, so the
 * first detent is audible; turning up keeps the stored value, so the knob can leave the loop the
 * length caps and come back to it. */
int32_t mu_in_hits_start(int32_t stored, int32_t plays, int32_t d);

#endif
