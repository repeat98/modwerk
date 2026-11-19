/* SPDX-License-Identifier: GPL-3.0-or-later */
/* The tempo for added machines' sound-chip players (OS 1.17).
 *
 * Before each transfer to the sound chip (the base's audio-frame entry, ahead of ev_audio_frame's subscribers), the
 * base writes two words into the transfer's tail, after the words a module's frame writer takes (0-10 in the
 * sidechain prototype): DT2_MACHINE_WIRE_MAGIC, then the samples per sixteenth step at the pattern's tempo. The tempo
 * is the one the sequencer uses: with patterns as its source (seq-note-bridge.c's rule), the current pattern's word at
 * +0x1db70, in BPM * 120 (14,400 for 120 BPM; the OS points its active tempo there, 0x400d7f4c). Otherwise, or with a
 * value out of range, the last tempo stays. The base's receiver on the sound chip copies the step where machine
 * players read it (DT2_BASE_SHARC.stepSamples in the builder). Track speed is not applied: the step is a 1X step.
 */
#include <stdint.h>
#include <mk2/machines.h>

#define STOCK_WORD(address) (*(const volatile uint32_t *)(address))
#define CURRENT_PATTERN 0x4316501cu
#define SEQ_SOURCE 0x4316513cu
#define PATTERN_SOURCE 0x402a1bf8u
#define PATTERN_TEMPO 0x1db70u             /* BPM * 120 */
#define TEMPO_MIN (30u * 120u)
#define TEMPO_MAX (300u * 120u)
#define STEP_SAMPLES_TIMES_TEMPO (48000u * 60u / 4u * 120u) /* samples per sixteenth = this / (BPM * 120) */
#define DSP_QUEUE 0x400cd48cu              /* the transfer's halfword queue */
#define FIRST_TAIL_HALF 0x402u

uint32_t core_machine_samples_per_step = 6000; /* 120 BPM until a pattern's tempo is read */

static __attribute__((noinline)) void put(volatile uint16_t *halves, unsigned int word, uint32_t value)
{
    /* The queue alternates command and data halfwords; a sound-chip word arrives low half first. The command
     * halfwords stay as stock wrote them. */
    halves[4 * word] = (uint16_t)value;
    halves[4 * word + 2] = (uint16_t)(value >> 16);
}

void core_machine_frame(unsigned int data_bytes, const void *data, unsigned int frame_bytes, const void *reply)
{
    (void)data;
    (void)reply;
    if (data_bytes != 0x802 || frame_bytes != 0xabc) {
        return;
    }
    const uintptr_t pattern = STOCK_WORD(CURRENT_PATTERN);
    if (STOCK_WORD(SEQ_SOURCE) == PATTERN_SOURCE && pattern) {
        const uint32_t tempo = STOCK_WORD(pattern + PATTERN_TEMPO);
        if (tempo >= TEMPO_MIN && tempo <= TEMPO_MAX) {
            core_machine_samples_per_step = STEP_SAMPLES_TIMES_TEMPO / tempo;
        }
    }
    volatile uint16_t *tail = (volatile uint16_t *)(STOCK_WORD(DSP_QUEUE) + 4 * FIRST_TAIL_HALF + 2);
    put(tail, DT2_MACHINE_WIRE, DT2_MACHINE_WIRE_MAGIC);
    put(tail, DT2_MACHINE_WIRE + 1, core_machine_samples_per_step);
}
