#ifndef OCTABAM_TAPE_CPU_H
#define OCTABAM_TAPE_CPU_H
#include <stdint.h>
/* The module's FX2 id (manifest.py); 0x15, SPRING REV's, until 30 Sep 2026. */
#define TE_ID 0x0fu
#define TE_FRAMES 16u
#define TE_RING 176400u
#define TE_STRIDE 1411328u
#define TE_FADE 512u
/* 16 samples at 44.1 kHz in counts of stock's free-running DTIM3 (132 MHz). */
#define TE_FRAME_COUNTS 47891u
typedef struct {
    uint32_t active, valid, position, tempo, phase, rng;
    int32_t mix, feedback, age, wow, hiss;       /* te_tape_block reads 20..40 */
    int32_t fir[2];                              /* 44: the record FIR's history */
    uint32_t unused0[3];
    int32_t z[8];                                /* 64: both playback sections' histories and carries */
    uint32_t unused1;
    uint32_t steady;                             /* nonzero: nothing ramps, glides or fades */
    int32_t coefficients[3];
    uint32_t unused2[2];
    uint32_t flutter, flutter_rate, flutter_target;
    int32_t wobble, wobble_step;
    uint32_t fade_from, fade_left, mode;
    uint32_t cached_position, cached_age, cached_speed, cached_index, filter_pending;
    int32_t filter_targets[3];
    uint32_t unused3[2];
    uint32_t control_clock;
} TapeState;
typedef struct {
    uint32_t time, feedback, wow, sync, mix, age, tempo;
    uint32_t lane; /* track index: stagger slow tone work across instances */
} TapeParams;
/* Shared by every instance (cpu_hooks.s, beside te_states): the overload hold's
 * clock and counters, and the tracks whose state may be active (low byte). */
typedef struct {
    uint32_t call, last, hold, holds, late, live;
} TapeGuard;
void te_process(TapeState *, const TapeParams *, volatile int32_t *ring,
                uint32_t write, int32_t *audio, int32_t *record);
uint32_t te_target(const TapeParams *, uint32_t tempo);
extern TapeState te_states[8];
extern TapeGuard te_guard;
/* Per track, the stock knob words and tempo of the last block that left s->steady set (te_cpu_hook). */
extern uint32_t te_keys[8][4];
#ifdef TE_HOST
void te_host_read_linear(int32_t *, volatile int32_t *, int32_t, int32_t, int32_t, int32_t);
void te_host_filter_block(int32_t *, const int32_t *, int32_t *);
void te_host_tape_block(TapeState *, const int32_t *, int32_t *, int32_t *,
                        int32_t, int32_t, int32_t);
/* te_process with the ColdFire's steady path: steady nonzero only when the
 * previous block left s->steady set and these are its controls again. */
void te_host_process(TapeState *, const TapeParams *, volatile int32_t *ring,
                     uint32_t write, int32_t *audio, int32_t *record, unsigned steady);
#endif
/* One block; te_process is te_block(..., 0). te_cpu_hook (cpu_hooks.s) calls
 * it with steady nonzero only when the previous block left s->steady set and
 * the stock knob words and tempo are the same again (te_keys). */
void te_block(TapeState *, const TapeParams *, volatile int32_t *ring, uint32_t write,
              int32_t *audio, int32_t *record, unsigned steady);
#endif
