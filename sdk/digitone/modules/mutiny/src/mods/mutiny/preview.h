/* SPDX-License-Identifier: GPL-2.0-or-later */
/* MUTINY's prepared model preview: a pure function of recipe and observed key, built in the UI
 * tick and consumed by the page. The cache compares the exact input bytes (cache-key equality, not
 * identity); drawing only copies a prepared value. */
#ifndef MUTINY_PREVIEW_H
#define MUTINY_PREVIEW_H

#include "../../src/engine/engine.h"
#include <stdint.h>

struct mu_preview_cache {
    struct mu_preview value; /* the prepared page picture */
    struct mu_track recipe;  /* the exact recipe it was built from */
    struct mu_key key;       /* the exact key it was built from */
    uint8_t track;           /* context, not identity */
    uint8_t valid;           /* value and both input copies are complete */
};

/* Forget the prepared value (session reset only). */
void mu_preview_cache_reset(struct mu_preview_cache *cache);

/* Prepare when track, recipe or key differs from the prepared copies. `acid` is the shared TB3P
 * base cache. -> 1 when rebuilt, 0 when reused. Never called from drawing. */
int mu_preview_cache_prepare(struct mu_preview_cache *cache, uint8_t track,
                             const struct mu_track *recipe, const struct mu_key *key,
                             struct mu_acid_cache *acid);

/* -> the prepared value only when it belongs to this track and its inputs still equal
 * recipe/key; NULL otherwise. Read-only and owned by the cache. */
const struct mu_preview *mu_preview_cache_ready(const struct mu_preview_cache *cache, uint8_t track,
                                                const struct mu_track *recipe,
                                                const struct mu_key *key);

#endif
