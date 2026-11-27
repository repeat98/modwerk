/* SPDX-License-Identifier: GPL-2.0-or-later */
#include "input.h"

#define MU_HOLD_TICKS 9 /* 0.3 s at 30 Hz: a hold, not a tap */

void mu_in_init(struct mu_input *in) {
    uint32_t i;
    in->func = in->no_down = in->no_used = in->trig_down = 0;
    in->no_track = 0xff;
    in->track_down = 0xff;
    in->track_ticks = 0;
    in->h_down = in->h_used = in->h_ticks = in->h_track = 0;
    in->holding = 0;
    in->push = in->reset = in->reset_track = 0xff;
    in->acc_track = 0xff;
    in->acc_model = 0xff;
    for (i = 0; i < MU_KNOBS; i++)
        in->acc[i] = 0;
}

static int page_key(uint32_t key) {
    return (key >= MU_KEY_PAGE_LO && key <= MU_KEY_PAGE_HI) ||
           (key >= MU_KEY_MENUS_LO && key <= MU_KEY_MENUS_HI);
}

uint32_t mu_in_key(struct mu_input *in, uint32_t key, uint32_t flags, uint8_t page_open,
                   uint8_t *page_track, uint8_t synth_ctx, uint8_t generated) {
    /* A press carries 0x1 (0x8 repeat, 0x2 FUNC, 0x4 double). Measured on OS 1.44, some releases
     * carry no 0x10 at all, so "not a press" is the release; requiring 0x10 would latch the
     * gesture for ever. */
    uint32_t press = flags & MU_FLAG_PRESS, release = !press;
    uint32_t repeat = flags & MU_FLAG_REPEAT;
    if (key == MU_KEY_FUNC) { /* observed, never taken */
        /* FUNC's release after a combination may arrive without the release flag: any non-press
         * ends the combination */
        in->func = press ? 1 : 0;
        return MU_ACT_PASS;
    }
    if (flags & MU_FLAG_FUNC)
        in->func = 1;

    /* Releases of owned gestures stay the page's even after it closed, so none stays latched. */
    if (key == MU_KEY_PUSH_H && release && in->h_down) {
        uint32_t act = MU_ACT_TAKE;
        if (page_open && !in->h_used && in->h_ticks < MU_HOLD_TICKS)
            act |= MU_ACT_REROLL;
        in->h_down = in->h_ticks = in->h_used = 0;
        in->holding = 0;
        return act;
    }
    if (key >= MU_KEY_PUSH_A && key <= MU_KEY_PUSH_H) {
        if (release) {
            int owned = in->push == (uint8_t)(key - MU_KEY_PUSH_A);
            if (owned)
                in->push = 0xff; /* the reset gesture stays latched until NO is released */
            return owned ? MU_ACT_TAKE : MU_ACT_PASS; /* never eat a release we did not press */
        }
    }
    if (key >= MU_KEY_TRIG1 && key <= MU_KEY_TRIG16 && release) {
        in->trig_down = 0;
        return page_open && generated ? MU_ACT_TAKE : MU_ACT_PASS;
    }
    if (key == MU_KEY_NO && release) {
        int owned = in->no_down, reset = in->reset < MU_KNOBS;
        int cancel = owned && !in->no_used && !reset;
        in->no_down = 0; /* the action's knob stays readable until the next NO press */
        if (!owned)
            return MU_ACT_PASS; /* FUNC+NO's release: the stock had that press */
        if (reset)
            return page_open ? MU_ACT_RESET | MU_ACT_TAKE : MU_ACT_PASS;
        if (cancel)
            return MU_ACT_CANCEL | MU_ACT_TAKE;
        return page_open ? MU_ACT_TAKE : MU_ACT_PASS;
    }

    /* A track key selects the track as the stock does, except with FUNC (that is mute). While the
     * page is open its release also says whether the core's Mod Menu took the hold. */
    if (key >= MU_KEY_T1 && key <= MU_KEY_T4) {
        uint8_t t = (uint8_t)(key - MU_KEY_T1);
        if (!press) {
            if (in->track_down == t)
                in->track_down = 0xff;
            return MU_ACT_PASS;
        }
        if (!repeat && !(flags & MU_FLAG_FUNC)) {
            *page_track = t;
            if (page_open) {
                in->track_down = t; /* the core opens its menu on the repeat; we do not see it */
                in->track_ticks = 0;
            }
            return page_open ? MU_ACT_SELECT : MU_ACT_PASS;
        }
        return MU_ACT_PASS;
    }

    /* FUNC combinations stay stock: FUNC+YES/NO checkpoint, held trig + YES preview, FUNC+encoder
     * reset. */
    if (flags & MU_FLAG_FUNC) {
        if (page_open && press && page_key(key))
            return MU_ACT_CLOSE_PASS;
        return MU_ACT_PASS;
    }
    if (!synth_ctx)
        return MU_ACT_PASS; /* a MIDI track never gets a synth page */

    if (!page_open) {
        /* repeated ordinary TRIG presses alternate the stock page and MUTINY */
        if (key == MU_KEY_TRIGPAGE && press && !repeat)
            return MU_ACT_OPEN | MU_ACT_TAKE;
        return MU_ACT_PASS;
    }

    if (key == MU_KEY_TRIGPAGE) {
        if (press && !repeat)
            return MU_ACT_CLOSE_PASS; /* the next press reopens ours */
        return MU_ACT_TAKE;
    }
    if (key == MU_KEY_NO) {
        if (press && !repeat) {
            in->no_down = 1;
            in->no_used = 0;
            in->no_track = *page_track;
            in->reset = in->reset_track = 0xff;
            if (in->push < MU_KNOBS) {
                in->reset = in->push; /* the combination exists now, whatever is released first */
                in->reset_track = *page_track; /* and on the track it formed on */
            }
            return MU_ACT_TAKE;
        }
        if (release)
            return in->no_down
                       ? (in->no_down = 0, in->no_used ? MU_ACT_TAKE : MU_ACT_CANCEL | MU_ACT_TAKE)
                       : MU_ACT_PASS;
        return MU_ACT_TAKE;
    }
    if (key == MU_KEY_YES) {
        if (in->trig_down)
            return MU_ACT_PASS; /* a held trig's YES is the stock's preview */
        if (press && !repeat)
            return MU_ACT_COMMIT | MU_ACT_TAKE; /* the tick decides after its pending renders */
        return MU_ACT_TAKE;                     /* already native: nothing to write */
    }
    if (key >= MU_KEY_TRIG1 && key <= MU_KEY_TRIG16) {
        if (press)
            in->trig_down = 1;
        return generated ? MU_ACT_TAKE : MU_ACT_PASS; /* native: GRID RECORDING edits as stock */
    }
    if (key == MU_KEY_PUSH_H) {
        if (press && !repeat) {
            in->h_down = 1;
            in->h_used = 0;
            in->h_ticks = 0;
            in->h_track = *page_track; /* bound to the track it began on */
            return MU_ACT_TAKE;
        }
        return MU_ACT_TAKE;
    }
    if (key >= MU_KEY_PUSH_A && key <= MU_KEY_PUSH_H) {
        if (press && key < MU_KEY_PUSH_H) {
            in->push = (uint8_t)(key - MU_KEY_PUSH_A);
            if (in->no_down) {
                in->reset = in->push; /* NO was held first */
                in->reset_track = *page_track;
            }
        }
        return MU_ACT_TAKE;
    }
    if (key == MU_KEY_PAGE)
        return MU_ACT_PASS;
    if (page_key(key))
        return press ? MU_ACT_CLOSE_PASS : MU_ACT_TAKE;
    if (key == MU_KEY_LEVELDATA)
        return press ? MU_ACT_CLOSE_PASS : MU_ACT_PASS; /* the browser is stock */
    return MU_ACT_PASS; /* PLAY, STOP, TEMPO, FUNC, arrows ... stay the Digitone's */
}

void mu_in_release_all(struct mu_input *in) {
    in->track_down = 0xff;
    in->h_down = in->h_ticks = in->h_used = in->holding = 0;
    in->trig_down = 0;
    in->no_down = in->no_used = 0;
    in->no_track = 0xff;
    in->push = in->reset = in->reset_track = 0xff;
}

uint32_t mu_in_tick(struct mu_input *in, uint8_t model) {
    uint32_t act = 0;
    int want;
    /* A track key held while the page is open: the core's Mod Menu opened on the key's repeat and
     * its release never reaches us, so the page must hand the screen back. */
    if (in->track_down != 0xff && ++in->track_ticks >= MU_MENU_TICKS) {
        in->track_down = 0xff;
        act |= MU_ACT_MENU;
    }
    if (!in->h_down) {
        int was = in->holding;
        in->holding = 0;
        return act | (was ? MU_ACT_HOLD_END : 0);
    }
    if (in->h_ticks < 255)
        in->h_ticks++;
    want = in->h_ticks >= MU_HOLD_TICKS && model == MU_TURI; /* only TURI has something to hold */
    if (want && !in->holding) {
        in->holding = 1;
        act |= MU_ACT_HOLD;
    } else if (!want && in->holding) {
        in->holding = 0;
        act |= MU_ACT_HOLD_END;
    }
    return act;
}

int32_t mu_in_detents(struct mu_input *in, uint8_t knob, int32_t delta, int32_t per, uint8_t track,
                      uint8_t model) {
    int32_t d;
    uint32_t i;
    if (knob >= MU_KNOBS || per < 1)
        return 0;
    if (in->acc_track != track || in->acc_model != model) {
        for (i = 0; i < MU_KNOBS; i++)
            in->acc[i] = 0;
        in->acc_track = track;
        in->acc_model = model;
    }
    if (in->no_down)
        in->no_used = 1; /* NO + a turn is the stock reset, not our cancel */
    in->acc[knob] += delta;
    d = in->acc[knob] / per;
    in->acc[knob] -= d * per;
    return d;
}

void mu_in_turn_used(struct mu_input *in) {
    if (in->h_down)
        in->h_used = 1;
}

int32_t mu_in_effective(int32_t stored, int32_t len) {
    if (len <= 0)
        return stored;
    return stored > len ? len : stored;
}

int32_t mu_in_hits_start(int32_t stored, int32_t plays, int32_t d) {
    return d < 0 ? mu_in_effective(stored, plays) : stored;
}
