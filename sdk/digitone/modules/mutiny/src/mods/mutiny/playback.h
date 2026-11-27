/* SPDX-License-Identifier: GPL-2.0-or-later */
/* MUTINY playback: complete, immutable generations the step fire reads. The UI task renders into
 * the inactive buffer and publishes it; the fire latches once per step and never combines it with
 * later edits. No allocation, drawing or firmware call at interrupt level. */
#ifndef MUTINY_PLAYBACK_H
#define MUTINY_PLAYBACK_H

#include "../../src/engine/engine.h"
#include <stddef.h>
#include <stdint.h>

#define MU_PB_TRACKS 4
#define MU_PB_BUFFERS 2
#define MU_LOCK_MAX 4 /* PTIM, PORT, FREQ, VOL: the most one generated step adds */

/* One step as the fire uses it, with lock values fixed at publication. */
struct mu_voice {
    uint8_t trig, note, vel, slide, hold;
    uint8_t nlock;
    uint16_t slot[MU_LOCK_MAX];
    int16_t value[MU_LOCK_MAX];
};

/* The voice layout is read by byte offset outside C; a layout change must stop the build. */
typedef char mu_voice_nlock_offset_must_be_5[(offsetof(struct mu_voice, nlock) == 5) ? 1 : -1];
typedef char mu_voice_slot_offset_must_be_6[(offsetof(struct mu_voice, slot) == 6) ? 1 : -1];
typedef char mu_voice_value_offset_must_be_14[(offsetof(struct mu_voice, value) == 14) ? 1 : -1];
typedef char mu_voice_size_must_be_22[(sizeof(struct mu_voice) == 22) ? 1 : -1];

struct mu_snapshot {
    uint32_t gen; /* even: complete; odd: being written */
    uint16_t len; /* the loop length at publication */
    uint8_t steps;
    uint8_t valid;
    uint64_t play;   /* bit s: step s fires */
    uint64_t accent; /* bit s: step s is accented */
    uint64_t slide;  /* bit s: step s glides into the next */
    struct mu_voice step[MU_STEPS];
};

/* The sound values an accent lock is built from: the track's own cutoff and level. */
struct mu_base {
    int16_t freq, vol;
};

struct mu_playback {
    struct mu_snapshot buf[MU_PB_TRACKS][MU_PB_BUFFERS];
    uint32_t gen[MU_PB_TRACKS];
    volatile uint8_t cur[MU_PB_TRACKS];   /* the complete generation in use */
    volatile uint8_t on[MU_PB_TRACKS];    /* generated output is playing */
    volatile uint8_t latch[MU_PB_TRACKS]; /* the generation the current step fire reads */
};

void mu_pb_init(struct mu_playback *pb);

/* UI task: render and publish one generation. `acid` is the caller's shared TB3P cache. -> the
 * buffer index, or -1 for MODEL OFF (native trigs play; the last generation remains history). */
int mu_pb_publish(struct mu_playback *pb, uint8_t track, const struct mu_track *recipe,
                  const struct mu_key *key, const struct mu_base *base, struct mu_acid_cache *acid);

/* Interrupt: the first read of a step latches the generation; later reads reuse it. */
void mu_pb_latch(struct mu_playback *pb, uint8_t track, int32_t first);
/* Interrupt: the latched step, or 0 outside the track's audio tracks. */
const struct mu_voice *mu_pb_step(struct mu_playback *pb, uint8_t track, uint32_t step);
/* UI task: stop generated output for a track (MODEL OFF or a commit). */
void mu_pb_off(struct mu_playback *pb, uint8_t track);

/* The trig keys' colours for one visible page: 0 off, 2 hit, 3 accented, 4 the playing step, 5 a
 * slid note. */
void mu_pb_keys(struct mu_playback *pb, uint8_t track, uint8_t page, uint32_t track_len,
                uint8_t playing, uint8_t step, uint8_t out[16]);

/* The step clock.
 * Cycles are counted from the clock's own progress, because a 30 Hz tick misses steps: the number
 * of loop boundaries between two observations. A stopped re-arm (7 -> 0 without a wrap) is not a
 * cycle. The count is a bounded phase (< loop_len) plus the observed configuration; a changed
 * track/loop length, an invalid position or an impossible backwards jump rebaselines instead of
 * subtracting different configurations. `fresh` marks that rebaseline. */
struct mu_cycle {
    uint32_t track_len;
    uint32_t loop_len;
    uint32_t last;
    uint32_t parity;
    uint32_t phase; /* steps into the loop, 0 .. loop_len - 1 */
    uint8_t have;
    uint8_t fresh;
};

#define MU_CLOCK_NONE 0xffffffffu
#define MU_CLOCK_LIMIT 4096u /* far above any track or loop the engine or seq-events reports */

void mu_cycle_reset(struct mu_cycle *c);
/* -> loop cycles since the previous call; *coalesced 1 when more than one was counted. */
uint32_t mu_cycle_advance(struct mu_cycle *c, uint32_t last, uint32_t parity, uint32_t track_len,
                          uint32_t loop_len, uint32_t playing, int *coalesced);

/* Evolution budget.
 * At most one evolution pass per track per tick. Legitimate notifications accumulate in a fixed
 * counter; a full counter or an unknowable cycle count marks the track desynchronised and freezes
 * evolution at the last complete generation until session initialization. HOLD drops the
 * opportunities it covers instead of replaying a burst. No allocation. */
#define MU_EVO_PENDING_MAX 64

struct mu_evo {
    uint16_t pending;
    uint8_t desync;
};

void mu_evo_reset(struct mu_evo *e);

/* UI scheduler: observed 1 valid, 0 OFF, -1 acquisition failure. No firmware pointers retained. */
int mu_evo_schedule(struct mu_cycle *c, struct mu_evo *e, int observed, uint32_t last,
                    uint32_t parity, uint32_t track_len, uint32_t loop_len, int playing,
                    int can_evolve, int hold, uint8_t *coalesced);
/* -> 1 when this tick performs exactly one pass. cycles: boundaries observed now; can_evolve: the
 * session may drift; hold: momentary freeze. */
int mu_evo_step(struct mu_evo *e, uint32_t cycles, int can_evolve, int hold);

#endif
