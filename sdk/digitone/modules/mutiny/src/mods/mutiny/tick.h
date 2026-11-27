/* SPDX-License-Identifier: GPL-2.0-or-later */
/* MUTINY's UI tick: one observation per relevant track and one project serialization per batch.
 * It notices key, sound-base, evolution, render and retry work and reuses one observation for all
 * of it. No firmware address or cross-tick pointer lives here. */
#ifndef MUTINY_TICK_H
#define MUTINY_TICK_H

#include "../../src/engine/engine.h"
#include "../../src/runtime/runtime.h"
#include "playback.h"
#include "preview.h"
#include "storage.h"
#include <stdint.h>

#define MU_TICK_TRACKS MU_RT_TRACKS

/* One track as the sequencer reports it this tick: len 1-64, scale -1 chromatic or the device's
 * scale index (never a guessed scale), master the pattern restart length (0: never). */
struct mu_track_info {
    int32_t len;
    int32_t master;
    uint8_t note;
    uint8_t root;
    int8_t scale;
};

/* The device boundary: -> 0 on success, -1 when there is no pattern (nothing written to *out), so a
 * failed observation never looks valid. */
int32_t mu_dev_track_info(int32_t track, struct mu_track_info *out);

/* Read every track's sound FREQ (slot 55) and VOL (slot 72) into out[track]. -> 0 on success, -1
 * when no kit is active (nothing written). */
int32_t mu_dev_sound_base(struct mu_base out[MU_TICK_TRACKS]);

/* The clock this tick observes. hold_track is the track a momentary HOLD covers, or 0xff. */
struct mu_tick_clock {
    uint32_t last[MU_TICK_TRACKS];
    uint32_t parity[MU_TICK_TRACKS];
    uint8_t playing;
    uint8_t hold_track;
};

struct mu_tick {
    /* persistent state, owned by the mod */
    struct mu_rt *rt;
    struct mu_playback *pb;
    struct mu_store *save;
    struct mu_cycle *cyc;
    struct mu_evo *evo;
    struct mu_base *base;
    struct mu_key *seen;
    uint32_t *passes;
    uint8_t *seen_ok;
    uint8_t *dirty;
    uint8_t *coalesced;

    /* this tick's observation, overwritten by the next tick; never a firmware pointer */
    struct mu_key key[MU_TICK_TRACKS];
    struct mu_track_info info[MU_TICK_TRACKS];
    struct mu_base last_base[MU_TICK_TRACKS];
    uint8_t ok[MU_TICK_TRACKS];
    uint8_t rendered;      /* this tick republished or switched a track off */
    uint8_t preview_check; /* a recipe/key/command change may need the picture rebuilt */

    /* per-track derived TB3P bases, shared by playback and the page picture */
    struct mu_acid_cache acid[MU_TICK_TRACKS];

    /* the page's prepared picture: built here, never by drawing */
    struct mu_preview_cache preview;
};

/* Forget everything the tick remembers between passes (session initialization only). */
void mu_tick_reset(struct mu_tick *tick);

/* One track pass: sound bases, one observation per relevant track, change detection, at most one
 * evolution pass and every pending render. -> the tracks to rearm (bit t), 0 for none. */
uint32_t mu_tick_run(struct mu_tick *tick, const struct mu_tick_clock *clock, uint8_t page_track);

/* The batch's one preview phase, after its commands. `visible` is the page's actual visibility: a
 * closed page moves no generator work onto hidden playback. -> 1 when rebuilt. */
int mu_tick_prepare(struct mu_tick *tick, uint8_t page_track, uint8_t visible);

/* After the commands: write the project record once when the batch left it stale. -> 1 when
 * written.
 */
int mu_tick_flush(struct mu_tick *tick);

/* A pending render blocks a commit that would use the generation it is about to replace. */
int mu_tick_dirty(const struct mu_tick *tick, uint8_t track);

/* 1 when this tick observed the track; its length, or -1 when unknown. */
int mu_tick_observed(const struct mu_tick *tick, uint8_t track);
int32_t mu_tick_track_len(const struct mu_tick *tick, uint8_t track);

/* The key this tick observed, or NULL when the observation failed. The page uses the same key the
 * preview was prepared from, so a native track never borrows a generated render's key. */
const struct mu_key *mu_tick_key(const struct mu_tick *tick, uint8_t track);

/* The prepared picture for exactly this track/recipe/key, or NULL when the cache has not caught up
 * with a genuine edit. Drawing never builds it. */
const struct mu_preview *mu_tick_preview(const struct mu_tick *tick, uint8_t track,
                                         const struct mu_track *recipe, const struct mu_key *key);

/* The prepared picture for this tick's own observation, or NULL when it failed. A fallback key kept
 * for labels never accepts a picture. */
const struct mu_preview *mu_tick_current_preview(const struct mu_tick *tick, uint8_t track,
                                                 const struct mu_track *recipe);

#endif
