/* Freeze: a grid-locked, tape-like live loop for one Octatrack track.
 *
 * Original Modwerk code (MIT, see LICENSE). Freestanding fixed-point C: no
 * floating point, heap, runtime library or division in the per-sample path.
 * The same source builds natively (FZ_HOST) for the host tests and, once the
 * base carries the shared delay-ring hook (DELAY_HOOK_PROPOSAL.md), for the
 * ColdFire. It never reads or writes anything but the arguments it is given.
 *
 * Audio words are the stock delay path's 32-bit stereo words. The ring is the
 * stock per-track four-second delay ring (176,400 stereo frames). */
#ifndef MODWERK_FREEZE_H
#define MODWERK_FREEZE_H
#include <stdint.h>

#define FZ_FRAMES 16u          /* one stock delay-routine block */
#define FZ_RING 176400u        /* stereo frames in one track's ring */
#define FZ_GUARD 64u           /* frames kept clear of both history edges */
#define FZ_Q 14                /* fractional bits of a ring age */
#define FZ_ONE (1u << FZ_Q)    /* SPIN 1.0x, one frame */
#define FZ_MAX_STEPS 8u

/* Controls, each 0..127 as the Octatrack stores them (STEP: 0..7 = 1..8). */
typedef struct {
    uint8_t step, spin, jitter, position, grab, mix, fade, seam;
} FzParams;

/* The track's own sequencer timing, read by the adapter every block:
 * running: the track is playing; tick: the track's sequencer tick byte, which
 * reaches 1 once per track step, just after the step's trig (so it carries
 * track speed, swing and micro timing as the sequencer plays them);
 * step_q4: the nominal length of one track step in samples x 16, from the
 * tempo word and the track's scale (freeze_step_q4). */
typedef struct {
    uint8_t running, tick;
    uint16_t reserved;
    uint32_t step_q4;
} FzGrid;

typedef struct {
    uint32_t age;              /* Q14 frames back from the anchor (newest held frame) */
    int32_t gain, gain_step;   /* Q15 at block edges, interpolated per sample */
    uint32_t fade_pos, fade_len; /* seam crossfade progress in samples */
    uint8_t active, fading_out, reserved[2];
} FzHead;

typedef struct {
    uint32_t active;           /* 0 on effect entry: everything below is reset */
    uint32_t valid;            /* contiguous frames written since entry/resume */
    uint32_t anchor;           /* ring frame just after the newest held frame */
    uint32_t avail;            /* held frames usable behind the anchor */
    uint32_t held, armed_grab; /* holding; GRAB waits for the next step */
    uint32_t env, env_step;    /* Q30 wet envelope and its per-sample ramp */
    uint32_t env_target;
    uint32_t fade_param;       /* FADE value the ramp was computed for */
    uint8_t prev_tick, prev_running, steps_in_cycle, cycle_steps;
    uint32_t t;                /* samples since the cycle started */
    uint32_t period;           /* nominal cycle length in samples */
    uint32_t seam_len;         /* crossfade length in samples */
    uint32_t seamed;           /* this cycle's seam has started */
    uint32_t spin;             /* Q14 current playback rate (glides) */
    uint32_t spin_cap;         /* Q14 most the held history allows */
    uint32_t base_min;         /* Q14 youngest age a cycle may start at */
    uint32_t reserve_old;      /* Q14 frames reserved on the old edge */
    uint32_t pos_off, pos_target;  /* Q14 POSITION offset toward older audio */
    uint32_t jit_off;          /* Q14 slow tape-wander offset, 0..2J */
    uint32_t rng, lfo, cell_clock;
    int32_t cell_from, cell_to;    /* smooth random values, Q15 */
    uint32_t cycles;           /* completed cycles while held (tests) */
    FzHead head[2];
    uint32_t main_head;
} FzState;

/* One 16-frame block.
 *  audio : 16 interleaved stereo frames, the track's signal in and out.
 *  record: 16 interleaved stereo frames the caller then writes to the ring at
 *          `write` (the stock DMA write). Freeze fills it with the dry input,
 *          or, while it holds, with the ring's own frames so history survives.
 *  ring  : the track's ring, FZ_RING frames, read only here.
 *  write : the ring frame this block's record will be written to; at most
 *          FZ_RING - FZ_FRAMES. */
void freeze_process(FzState *s, const FzParams *p, const FzGrid *g,
                    const volatile int32_t *ring, uint32_t write,
                    int32_t *audio, int32_t *record);

/* Nominal track-step length in samples x 16 from the tempo word (BPM x 24)
 * and the track scale index 0..6 (2x, 3/2x, 1x, 3/4x, 1/2x, 1/4x, 1/8x). */
uint32_t freeze_step_q4(uint32_t tempo24, unsigned scale_index);

/* SPIN 0..127 as a Q14 rate: 0.25x at 0, 0.5x at 64, 1.0x at 127. */
uint32_t freeze_spin_q14(unsigned value);

#endif
