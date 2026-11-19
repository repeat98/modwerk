/* SPDX-License-Identifier: GPL-3.0-or-later */
/* The tempo for added machines' sound-chip players (OS 1.17).
 *
 * Before each transfer to the sound chip (the base's audio-frame entry, ahead of ev_audio_frame's subscribers), the
 * base writes two words into the transfer's tail, after the words a module's frame writer takes (0-10 in the
 * sidechain prototype): DT2_MACHINE_WIRE_MAGIC, then the samples per sixteenth step at the pattern's tempo, measured
 * from the transport's tick counter over the last block. The base's receiver on the sound chip copies them where
 * machine players read them (DT2_BASE_SHARC.wire in the builder). While the transport stands still, or after a jump,
 * the last tempo stays.
 */
#include <stdint.h>
#include <mk2/machines.h>

#define STOCK_WORD(address) (*(const volatile uint32_t *)(address))
#define TICK_COUNTER 0x80004880u           /* transport ticks: 21,600,000 per quarter note */
#define DSP_QUEUE 0x400cd48cu              /* the transfer's halfword queue */
#define FIRST_TAIL_HALF 0x402u
#define TICKS_PER_STEP (21600000u / 4u)
#define BLOCK_SAMPLES 32u
#define SPAN_MIN 2000u                     /* about 25 BPM */
#define SPAN_MAX 300000u                   /* about 1,250 BPM: anything above is a jump, not a tempo */

uint32_t core_machine_samples_per_step = 6000; /* 120 BPM until the transport has run */
static uint32_t last_tick;

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
    const uint32_t tick = STOCK_WORD(TICK_COUNTER);
    const uint32_t span = tick - last_tick;
    last_tick = tick;
    if (span >= SPAN_MIN && span <= SPAN_MAX) {
        core_machine_samples_per_step = TICKS_PER_STEP * BLOCK_SAMPLES / span;
    }
    volatile uint16_t *tail = (volatile uint16_t *)(STOCK_WORD(DSP_QUEUE) + 4 * FIRST_TAIL_HALF + 2);
    put(tail, DT2_MACHINE_WIRE, DT2_MACHINE_WIRE_MAGIC);
    put(tail, DT2_MACHINE_WIRE + 1, core_machine_samples_per_step);
}
