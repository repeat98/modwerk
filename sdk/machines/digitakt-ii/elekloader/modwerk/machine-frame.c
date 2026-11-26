/* SPDX-License-Identifier: GPL-3.0-or-later */
/* The tempo for added machines' sound-chip players (OS 1.17).
 *
 * Before each transfer to the sound chip (the base's audio-frame entry, ahead of ev_audio_frame's subscribers), the
 * base writes two words into the transfer's tail, after the words a module's frame writer takes (0-10 in the
 * sidechain prototype): DT2_MACHINE_WIRE_MAGIC, then the samples per sixteenth step at the pattern's tempo. The tempo
 * is the one the sequencer uses: with patterns as its source (seq-note-bridge.c's rule), the current pattern's word at
 * +0x1db70, in BPM * 120 (14,400 for 120 BPM; the OS points its active tempo there, 0x400d7f4c). Otherwise, or with a
 * value out of range, the last tempo stays. Then sixteen words: each track's step at its speed, and the view track a
 * module's page set. The base's receiver on the sound chip copies these eighteen words where machine players read them
 * (DT2_BASE_SHARC.stepSamples in the builder: the 1X step, tracks 1-16, the view track), and puts the machine view a
 * player posted into its reply, which comes back here with the next transfer.
 *
 * With no machine in core_machines nothing here runs: no tail words (the receiver then skips the wire and the view)
 * and no reply read. The reply is read only while a module's page has set a view track.
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
#define TRACKS 16u
#define TRACK_STRIDE 0x6a5u
#define PATTERN_TRACK_MODE 0x1db79u        /* nonzero: each track has its own length and speed */
#define PATTERN_SPEED 0x1db7au
#define TRACK_SPEED 0x48fu
#define SPEED_PULSES ((const uint32_t *)0x4020e28cu) /* 2X, 3/2X, 1X, 3/4X, 1/2X, 1/4X, 1/8X: 3, 4, 6, 8, 12, 24, 48 */
#define SPEED_1X 2u
#define SPEED_SLOWEST 6u
#define DSP_QUEUE 0x400cd48cu              /* the transfer's halfword queue */
#define SOUND_TYPE(track) (*(const volatile uint8_t *)(0x426532ecu + 0x450u * (track) + 0xa2u)) /* the kit's track sound */
#define FIRST_TAIL_HALF 0x402u
#define KNOB_TARGETS ((const volatile uint16_t *)0x80003362u) /* track t's parameter j at [KNOB_VALUES * t + j] */
#define KNOB_VALUES 71u
#define KNOB_C 27u                         /* the sound's parameter slots of SAMPLE's knobs C and E */
#define KNOB_E 31u

#define REPLY_VIEW 600u                    /* the reply word where the receiver puts the machine view */

extern const struct dt2_machine *const core_machines[DT2_MACHINE_COUNT];
unsigned int core_voice_lead(unsigned int track);

uint32_t core_machine_samples_per_step = 6000; /* 120 BPM until a pattern's tempo is read */
volatile uint32_t core_machine_view_track = DT2_MACHINE_VIEW_NONE;
volatile uint32_t core_machine_view[DT2_MACHINE_VIEW_WORDS];
volatile uint32_t core_machine_sample_views; /* counted by machines-entry.s's core_machine_sample_view_entry */

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
    if (data_bytes != 0x802 || frame_bytes != 0xabc || !core_machines[0]) {
        return;
    }
    const uintptr_t pattern = STOCK_WORD(CURRENT_PATTERN);
    const int playing_patterns = STOCK_WORD(SEQ_SOURCE) == PATTERN_SOURCE && pattern;
    if (playing_patterns) {
        const uint32_t tempo = STOCK_WORD(pattern + PATTERN_TEMPO);
        if (tempo >= TEMPO_MIN && tempo <= TEMPO_MAX) {
            core_machine_samples_per_step = STEP_SAMPLES_TIMES_TEMPO / tempo;
        }
    }
    volatile uint16_t *tail = (volatile uint16_t *)(STOCK_WORD(DSP_QUEUE) + 4 * FIRST_TAIL_HALF + 2);
    put(tail, DT2_MACHINE_WIRE, DT2_MACHINE_WIRE_MAGIC);
    put(tail, DT2_MACHINE_WIRE + 1, core_machine_samples_per_step);
    /* Each track's step at its speed: the pattern's speed, or the track's own in per-track mode (seq-note-bridge.c's
     * offsets), as pulses per step against 1X's six. */
    const uint8_t *p = (const uint8_t *)pattern;
    for (unsigned int track = 0; track < TRACKS; ++track) {
        uint32_t speed = SPEED_1X;
        if (playing_patterns) {
            speed = p[PATTERN_TRACK_MODE] ? p[track * TRACK_STRIDE + TRACK_SPEED] : p[PATTERN_SPEED];
            if (speed > SPEED_SLOWEST) {
                speed = SPEED_1X;
            }
        }
        put(tail, DT2_MACHINE_WIRE + 2 + track, core_machine_samples_per_step * SPEED_PULSES[speed] / SPEED_PULSES[SPEED_1X]);
    }
    const uint32_t view_track = core_machine_view_track;
    put(tail, DT2_MACHINE_WIRE + 18, view_track < TRACKS ? view_track : DT2_MACHINE_VIEW_NONE);
    /* Each track's machine type, from the kit (the type byte of track t's sound), for the sound chip's player
     * dispatcher: the sound chip's own copy of the types is not a table it keeps per track (MACHINES.md). A linked
     * voice track plays its lead's sound, so it takes its lead's type (voices.c). */
    for (unsigned int track = 0; track < TRACKS; ++track) {
        put(tail, DT2_MACHINE_WIRE + 19 + track, SOUND_TYPE(core_voice_lead(track)));
    }
    /* Each track's machine knobs C and E at full resolution (value << 8), from the parameter targets the stock
     * smoother follows: the kit's value with the note's trig locks, and on a linked voice track its lead's
     * (voices.c). The sound chip's own copy of C (SAMPLE's crossfade) arrives as 0 or 1 only. One word a track:
     * C | E << 16. */
    for (unsigned int track = 0; track < TRACKS; ++track) {
        const volatile uint16_t *const target = KNOB_TARGETS + KNOB_VALUES * track;
        put(tail, DT2_MACHINE_WIRE + 35 + track, (uint32_t)target[KNOB_C] | (uint32_t)target[KNOB_E] << 16);
    }
    /* The machine view the sound chip's receiver put in the last reply (words 600-631): the reply arrives as 16-bit
     * units, each sound-chip word low half first. */
    if (reply && view_track < TRACKS) {
        const volatile uint16_t *halves = (const volatile uint16_t *)reply + 2 * REPLY_VIEW;
        for (unsigned int k = 0; k < DT2_MACHINE_VIEW_WORDS; ++k) {
            core_machine_view[k] = (uint32_t)halves[2 * k + 1] << 16 | halves[2 * k];
        }
    }
}
