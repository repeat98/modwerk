/* SPDX-License-Identifier: GPL-2.0-or-later */
#include "preview.h"

static int same(const void *a, const void *b, uint32_t n) {
    const uint8_t *x = a;
    const uint8_t *y = b;
    while (n--) {
        if (*x != *y)
            return 0;
        x++;
        y++;
    }
    return 1;
}

static void copy(void *dst, const void *src, uint32_t n) {
    uint8_t *d = dst;
    const uint8_t *s = src;
    while (n--)
        *d++ = *s++;
}

void mu_preview_cache_reset(struct mu_preview_cache *cache) { cache->valid = 0; }

int mu_preview_cache_prepare(struct mu_preview_cache *cache, uint8_t track,
                             const struct mu_track *recipe, const struct mu_key *key,
                             struct mu_acid_cache *acid) {
    if (cache->valid && cache->track == track &&
        same(&cache->recipe, recipe, (uint32_t)sizeof cache->recipe) &&
        same(&cache->key, key, (uint32_t)sizeof cache->key))
        return 0;
    copy(&cache->recipe, recipe, (uint32_t)sizeof cache->recipe);
    copy(&cache->key, key, (uint32_t)sizeof cache->key);
    cache->track = track;
    mu_preview_cached(&cache->recipe, &cache->key, track, acid, &cache->value);
    cache->valid = 1;
    return 1;
}

const struct mu_preview *mu_preview_cache_ready(const struct mu_preview_cache *cache, uint8_t track,
                                                const struct mu_track *recipe,
                                                const struct mu_key *key) {
    if (!cache->valid || cache->track != track ||
        !same(&cache->recipe, recipe, (uint32_t)sizeof cache->recipe) ||
        !same(&cache->key, key, (uint32_t)sizeof cache->key))
        return 0;
    return &cache->value;
}
