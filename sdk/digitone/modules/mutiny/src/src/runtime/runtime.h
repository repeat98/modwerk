/* SPDX-License-Identifier: GPL-2.0-or-later */
/* MUTINY track sessions: the firmware-independent state machine of one synth track.
 *
 * A session owns a retained recipe (the model and its controls, source and seed), the source the
 * track plays from (native trigs or the generator), whether generated output is an uncommitted
 * preview over the native data, and a single-level uncommit record. It has no firmware address, no
 * allocation and no global state: the mod passes the recipe after a deliberate edit, and this file
 * decides what that means for playback. tests/test_runtime.c holds the transition table.
 */
#ifndef MUTINY_RUNTIME_H
#define MUTINY_RUNTIME_H

#include "../engine/engine.h"
#include <stdint.h>

#define MU_RT_TRACKS 4

enum mu_play_source { MU_PLAY_NATIVE = 0, MU_PLAY_GENERATED = 1 };

struct mu_rt_track {
    struct mu_track recipe;    /* what the page edits and the project keeps */
    struct mu_track before;    /* the recipe as it was when the current preview began */
    struct mu_track committed; /* the recipe the last successful commit captured */
    uint8_t play;              /* enum mu_play_source */
    uint8_t preview;           /* 1: generated output is not in the native data */
    uint8_t undo;              /* 1: a successful commit can still be undone */
    uint8_t reserved;
};

struct mu_rt {
    struct mu_rt_track t[MU_RT_TRACKS];
};

void mu_rt_init(struct mu_rt *rt);
void mu_rt_track_init(struct mu_rt_track *t);

/* Select a model. A model starts generated playback from the retained recipe (a preview when the
 * native data has not been committed); OFF plays the native trigs and keeps the recipe. */
void mu_rt_select_model(struct mu_rt_track *t, uint8_t model);

/* A deliberate edit that changed at least one value: `after` is the recipe as edited. The first
 * edit after native playback starts a generated preview over untouched native data and retires a
 * stale uncommit record. Editing without a change is not this function's business. */
void mu_rt_edit(struct mu_rt_track *t, const struct mu_track *after);

/* The commit wrote the native data: the track plays it, the recipe stays, the generator state at
 * the commit is kept for an uncommit. */
void mu_rt_committed(struct mu_rt_track *t);

/* The commit failed: nothing about the session changes. */
void mu_rt_commit_failed(struct mu_rt_track *t);

/* NO: cancel a preview back to the native sequence and the pre-preview recipe. -> 1 when it acted.
 */
int mu_rt_cancel(struct mu_rt_track *t);

/* NO after a commit: resume the captured generator over the restored native data. -> 1 when it
 * acted. */
int mu_rt_uncommit(struct mu_rt_track *t);

/* A native edit, or a pattern/project change, makes the uncommit record stale. */
void mu_rt_invalidate_undo(struct mu_rt_track *t);

/* TURI's evolution: only an audible generated track drifts; a native-playing track keeps its
 * recipe. */
int mu_rt_can_evolve(const struct mu_rt_track *t);
void mu_rt_evolve(struct mu_rt_track *t, uint32_t pass);

/* Load a project record: the recipe and its playback source come back, transient history does not.
 */
void mu_rt_load(struct mu_rt_track *t, const struct mu_track *recipe, uint8_t play);

#endif
