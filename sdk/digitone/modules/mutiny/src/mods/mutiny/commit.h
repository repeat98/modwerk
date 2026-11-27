/* SPDX-License-Identifier: GPL-2.0-or-later */
/* MUTINY commit: build the whole-track native image, keep the prior bytes for undo, verify the
 * write. The caller supplies a device with a pattern identity; nothing here names a firmware
 * address, and the rules are host-tested against the measured OS 1.44 layout. */
#ifndef MUTINY_COMMIT_H
#define MUTINY_COMMIT_H

#include "playback.h"
#include "port144.h"
#include <stdint.h>

/* The planner's contract; the measured OS 1.44 numbers live in port144.h. */
#define MU_TRACK_BYTES MU_PORT_TRACK_STRIDE
#define MU_TRACK_LOCKS MU_PORT_TRACK_LOCKS
#define MU_NATIVE_BYTES MU_PORT_NATIVE_BYTES

/* The track's 976-byte data, then its lock area. */
struct mu_native {
    uint8_t b[MU_NATIVE_BYTES];
};

/* A device view of one track. identity() must reject a write after the pattern the offsets refer to
 * has gone; in this build it is the pointer-derived buffer guard (port144.c), not a semantic
 * pattern/project epoch and is not collision-free. */
struct mu_device {
    void *ctx;
    uint8_t (*get)(void *ctx, uint32_t off);
    void (*put)(void *ctx, uint32_t off, uint8_t value);
    uint32_t (*identity)(void *ctx);
};

struct mu_commit {
    struct mu_native prior;
    uint32_t identity;
    uint32_t digest; /* the committed image's content: a later edit is evidence, not a guess */
    uint16_t len;
    uint8_t valid; /* 1: an undo record for this track */
};

/* The write extent: the active track's length clamped to 64 steps (never the loop length). */
uint32_t mu_commit_extent(int32_t track_len);
int mu_commit_page(uint32_t page, int32_t track_len, uint32_t *first, uint32_t *end);

/* What MUTINY itself wrote into a step's LEN, so a later commit starts from the intended length (a
 * manual per-step LEN included) instead of compounding its own extension.
 *
 * The memo belongs to one native pattern: a stored byte that equals what MUTINY wrote proves
 * nothing on its own, so every entry is dropped when the pattern identity changes. Publication
 * protocol, because the step fire reads this at interrupt level:
 *   1. retire the identity (0), so no entry is trusted while the memo is rebuilt;
 *   2. clear every entry;
 *   3. publish the new identity last.
 * An entry is one byte and its written length is recomputed, so a reader cannot pair one step's
 * base with another write's seal. */
struct mu_len_memo {
    uint32_t identity;      /* the native pattern the entries belong to; 0: no provenance */
    uint8_t base[MU_STEPS]; /* the length an extension started from; 0xff: none */
};

void mu_len_memo_init(struct mu_len_memo *m);
/* Bind to the pattern the memo is about to be used against; a different identity clears every
 * entry.
 */
void mu_len_memo_bind(struct mu_len_memo *m, uint32_t identity);
/* The memo when it belongs to this pattern, else 0. Read-only: the step fire must never bind it. */
const struct mu_len_memo *mu_len_memo_for(const struct mu_len_memo *m, uint32_t identity);
/* The length a held step's extension starts from: a manual LEN, the track default, or the base of a
 * previous MUTINY extension whose result is still stored. */
int32_t mu_held_base(int32_t stored, int32_t track_default, uint32_t step,
                     const struct mu_len_memo *m);
void mu_held_record(struct mu_len_memo *m, uint32_t step, int32_t base);

/* The step's LEN when a slide holds it into the next note. */
int32_t mu_held_len(int32_t len);

/* Build the intended image from the prior bytes and one generation: a written step gets its note,
 * velocity and condition and only the generation's own locks; a rest clears its note trig and keeps
 * its locks; other steps and tracks are untouched. The caller reads the whole image back. */
void mu_commit_plan(struct mu_native *plan, const struct mu_native *prior,
                    const struct mu_voice voice[MU_STEPS], uint32_t first, uint32_t len,
                    struct mu_len_memo *memo);

/* Capture the prior bytes and build the plan outside the writer. -> 1, or 0 when the pattern
 * identity cannot be read. */
int mu_commit_prepare(const struct mu_device *dev, struct mu_commit *c,
                      const struct mu_voice voice[MU_STEPS], uint32_t first, uint32_t len,
                      struct mu_native *plan, struct mu_len_memo *memo);

/* Write the plan, read every byte back, and keep the prior image only when both the write and the
 * readback succeeded and the identity did not change. -> 1 success; 0 refusal or failure (the prior
 * bytes are put back when the identity still matches). */
int mu_commit_apply(const struct mu_device *dev, struct mu_commit *c, const struct mu_native *plan);

/* Put the prior image back and read it back. -> 1 when the track is byte-identical to the record.
 */
int mu_commit_undo(const struct mu_device *dev, struct mu_commit *c);

#endif
