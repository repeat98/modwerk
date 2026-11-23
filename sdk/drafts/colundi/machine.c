/* SPDX-License-Identifier: MIT */
#include "mono.h"
#include "modwerk_events.h"

/* One short test note cannot sustain indefinitely across a missed leave. */
static ColundiVoice voices[8];
static unsigned remaining[8];

static void leave(unsigned track)
{
    if (track < 8) {
        volatile uint8_t *state = (volatile uint8_t *)&voices[track];
        for (unsigned i = 0; i < sizeof voices[track]; ++i) state[i] = 0;
        remaining[track] = 0;
    }
}

static int note(unsigned track, unsigned sample, unsigned flags)
{
    (void)sample;
    (void)flags;
    if (track >= 8) return 0;
    leave(track);
    uintptr_t lane = *(volatile uint32_t *)0x800062a8u;
    uintptr_t expected = 0x80000510u + 48u * track;
    if (lane != expected && lane != expected + 384u) return 0;
    unsigned degree = *(volatile uint16_t *)(lane + 2u) >> 8;
    colundi_note(&voices[track], 0, degree, 0);
    if (voices[track].word) remaining[track] = 4096;
    return 0;
}

static int render(unsigned track, unsigned ping, unsigned start, unsigned end)
{
    (void)ping;
    if (track >= 8 || start > end || end > 16) return 0;
    volatile uint32_t *cursor = (volatile uint32_t *)0x80001c80u;
    volatile uint32_t *packet = (volatile uint32_t *)(uintptr_t)*cursor;
    unsigned count = end - start;
    int16_t pcm[16];
    unsigned held = remaining[track] < count ? remaining[track] : count;
    colundi_render(&voices[track], pcm, held);
    remaining[track] -= held;
    if (!remaining[track]) colundi_off(&voices[track]);
    colundi_render(&voices[track], pcm + held, count - held);
    *packet++ = count;
    *packet++ = start;
    *packet++ = 1u << 26;
    *packet++ = start << 26;
    for (unsigned i = 0; i < count; ++i) {
        uint32_t sample = (uint32_t)(uint16_t)pcm[i] << 16;
        *packet++ = sample;
        *packet++ = sample;
    }
    *cursor = (uint32_t)(uintptr_t)packet;
    return 0;
}

const struct modwerk_machine descriptor = {
    .abi = MODWERK_MACHINE_ABI, .sig = {'C','u'}, .sig_lo = 1, .sig_hi = 1,
    .label = "MICRO OSC", .flags = MODWERK_MACHINE_START | MODWERK_MACHINE_LIST,
    .render = render, .leave = leave
};
const struct modwerk_machine_start start_record = {
    MODWERK_MACHINE_START_ABI, sizeof start_record, &descriptor, note
};
