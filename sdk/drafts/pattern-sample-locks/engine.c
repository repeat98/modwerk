/* SPDX-License-Identifier: MIT */
#include "engine.h"

static int source_valid(const struct psl_source *s)
{
    if (!s || !s->bank || s->pattern >= 16 || s->part >= 4) return 0;
    for (unsigned t = 0; t < PSL_TRACKS; ++t)
        if ((s->eligible & (1u << t)) &&
            (!s->track[t] || s->machine[t] > 1 ||
             (s->sample[t] > (s->machine[t] ? 135u : 127u) && s->sample[t] != PSL_NO_LOCK))) return 0;
    return 1;
}
int psl_prepare(struct psl_plan *p, const struct psl_source *s,
                unsigned selected, enum psl_action action, unsigned replace)
{
    if (!p) return PSL_INVALID;
    p->ready = 0;
    if (!source_valid(s) || selected > 255 || (selected & ~s->eligible) ||
        (action != PSL_LOCK && action != PSL_CLEAR) || replace > 1) return PSL_INVALID;
    if (!selected) return PSL_NO_TRACKS;
    for (unsigned t = 0; t < PSL_TRACKS; ++t)
        if ((selected & (1u << t)) && action == PSL_LOCK && s->sample[t] == PSL_NO_LOCK)
            return PSL_INVALID; /* No assigned sample: refuse the entire selection. */
    p->bank = s->bank; p->pattern = s->pattern; p->part = s->part;
    p->eligible = s->eligible; p->selected = (uint8_t)selected;
    p->action = (uint8_t)action; p->replace = (uint8_t)replace;
    p->changed = p->preserved = 0;
    p->ownership_epoch = s->ownership_epoch;
    for (unsigned t = 0; t < PSL_TRACKS; ++t) {
        p->machine[t] = s->machine[t]; p->sample[t] = s->sample[t];
        if (!(selected & (1u << t))) continue;
        const uint8_t *r = s->track[t];
        for (unsigned k = 0; k < 8; ++k) p->trigs[t][k] = r[k];
        for (unsigned step = 0; step < PSL_STEPS; ++step) {
            uint8_t old = r[PSL_LOCK_OFFSET + 32u * step], next = old;
            unsigned trig = (r[7u - step / 8u] >> (step % 8u)) & 1u;
            unsigned owned = s->owned[t] && s->owned[t][step] == 1u;
            p->owned[t][step] = (uint8_t)owned;
            if (action == PSL_CLEAR) {
                if (replace || owned) next = PSL_NO_LOCK;
                else if (old != PSL_NO_LOCK) ++p->preserved;
            }
            else if (trig) {
                if (old == PSL_NO_LOCK || replace) next = s->sample[t];
                else ++p->preserved;
            }
            p->before[t][step] = old; p->after[t][step] = next;
            p->changed += old != next;
        }
    }
    p->ready = 1;
    return PSL_OK;
}
int psl_validate(const struct psl_plan *p, const struct psl_source *s)
{
    if (!p || !p->ready || !source_valid(s)) return PSL_INVALID;
    if (s->bank != p->bank || s->pattern != p->pattern || s->part != p->part ||
        s->eligible != p->eligible || s->ownership_epoch != p->ownership_epoch) return PSL_STALE;
    for (unsigned t = 0; t < PSL_TRACKS; ++t) {
        if (!(p->selected & (1u << t))) continue;
        if (s->machine[t] != p->machine[t] || s->sample[t] != p->sample[t]) return PSL_STALE;
        for (unsigned k = 0; k < 8; ++k) if (s->track[t][k] != p->trigs[t][k]) return PSL_STALE;
        for (unsigned step = 0; step < PSL_STEPS; ++step) {
            unsigned owned = s->owned[t] && s->owned[t][step] == 1u;
            if (s->track[t][PSL_LOCK_OFFSET + 32u * step] != p->before[t][step] ||
                owned != p->owned[t][step]) return PSL_STALE;
        }
    }
    return PSL_OK;
}
int psl_apply(struct psl_plan *p, const struct psl_source *s,
              uint8_t *const working[PSL_TRACKS], uint8_t *const mirror[PSL_TRACKS])
{
    int result = psl_validate(p, s);
    if (result != PSL_OK) return result;
    if (!working || !mirror) return PSL_INVALID;
    for (unsigned t = 0; t < PSL_TRACKS; ++t)
        if (!working[t] || !mirror[t] ||
            (uintptr_t)working[t] > UINTPTR_MAX - PSL_TRACK_BYTES ||
            (uintptr_t)mirror[t] > UINTPTR_MAX - PSL_TRACK_BYTES) return PSL_INVALID;
    /* Require disjoint complete track records. In particular an alias must
     * never turn a selected-track write into a change on an unselected track. */
    for (unsigned t = 0; t < PSL_TRACKS; ++t) {
        if (!working[t] || !mirror[t] || s->track[t] != working[t]) return PSL_INVALID;
        for (unsigned u = 0; u < PSL_TRACKS; ++u) {
            uintptr_t w = (uintptr_t)working[t], m = (uintptr_t)mirror[t];
            uintptr_t w2 = (uintptr_t)working[u], m2 = (uintptr_t)mirror[u];
            if ((w < m2 + PSL_TRACK_BYTES && m2 < w + PSL_TRACK_BYTES) ||
                (t != u && ((w < w2 + PSL_TRACK_BYTES && w2 < w + PSL_TRACK_BYTES) ||
                            (m < m2 + PSL_TRACK_BYTES && m2 < m + PSL_TRACK_BYTES)))) return PSL_INVALID;
        }
        if (!(p->selected & (1u << t))) continue;
        for (unsigned step = 0; step < PSL_STEPS; ++step)
            if (mirror[t][PSL_LOCK_OFFSET + 32u * step] != p->before[t][step]) return PSL_STALE;
    }
    for (unsigned t = 0; t < PSL_TRACKS; ++t) {
        if (!(p->selected & (1u << t))) continue;
        for (unsigned step = 0; step < PSL_STEPS; ++step) {
            if (p->before[t][step] == p->after[t][step]) continue;
            unsigned at = PSL_LOCK_OFFSET + 32u * step;
            working[t][at] = p->after[t][step]; mirror[t][at] = p->after[t][step];
        }
    }
    p->ready = 0; /* One confirmation authorizes one application. */
    return PSL_OK;
}
