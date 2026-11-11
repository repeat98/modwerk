/* SPDX-License-Identifier: MIT */
#ifndef PATTERN_SAMPLE_LOCKS_ENGINE_H
#define PATTERN_SAMPLE_LOCKS_ENGINE_H
#include <stddef.h>
#include <stdint.h>

#define PSL_TRACKS 8u
#define PSL_STEPS 64u
#define PSL_TRACK_BYTES 0x91au
#define PSL_PART_BYTES 0x18b2u
#define PSL_PATTERN_BYTES 0x8ed8u
#define PSL_LOCK_OFFSET 0x78u /* TRAC data + 0x59 + SAMPLE slot 31. */
#define PSL_NO_LOCK 255u

enum psl_action { PSL_LOCK, PSL_CLEAR };
enum psl_result { PSL_OK, PSL_INVALID, PSL_NO_TRACKS, PSL_STALE };
struct psl_source {
    uint32_t bank;
    uint8_t pattern, part;
    /* Computed by the instrument adapter, excluding contributed machines. */
    uint8_t eligible;
    uint8_t machine[PSL_TRACKS], sample[PSL_TRACKS];
    const uint8_t *track[PSL_TRACKS];
};
struct psl_plan {
    uint32_t bank;
    uint8_t pattern, part, eligible, selected, action, replace, ready;
    uint8_t machine[PSL_TRACKS], sample[PSL_TRACKS];
    uint8_t trigs[PSL_TRACKS][8];
    uint8_t before[PSL_TRACKS][PSL_STEPS];
    uint8_t after[PSL_TRACKS][PSL_STEPS];
    uint16_t changed, preserved;
};
/* prepare never writes instrument data. All stored 64 steps are covered,
 * including those beyond the current playback length. */
int psl_prepare(struct psl_plan *, const struct psl_source *,
                unsigned selected, enum psl_action, unsigned include_existing);
/* include_existing is OFF by default: LOCK keeps every existing SAMPLE lock.
 * ON permits replacing those locks. CLEAR always removes all SAMPLE locks on
 * the selected tracks; no origin information is stored or consulted. */
int psl_validate(const struct psl_plan *, const struct psl_source *);
/* Caller owns the instrument's writer boundary, including source identity.
 * Every target is validated before the first write; writes touch SAMPLE only.
 * This portable function does not publish live lanes, mirror RAM or save. */
int psl_apply(struct psl_plan *, const struct psl_source *,
              uint8_t *const working[PSL_TRACKS], uint8_t *const mirror[PSL_TRACKS]);
#endif
