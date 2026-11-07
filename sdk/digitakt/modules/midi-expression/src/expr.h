// SPDX-License-Identifier: GPL-3.0-or-later
// MIDI Expression: what expr.c (MIDI tracks), audio.c (audio tracks) and
// page.c (the TRIG page's second page) share.
#ifndef MIDI_EXPRESSION_H
#define MIDI_EXPRESSION_H

#include <stdint.h>

enum { PB, AT, MW, KINDS };                     // live sources an audio track takes

// Per track, on the TRIG page's second page (page.c). Kept with the project
// in a file of the mod's own on the +Drive (store.c). Audio and MIDI tracks share
// the layout: knob A is BEND on an audio track, THRU on a MIDI track.
#define PB_RANGE_MAX 12                         // an octave each way at most
#define BEND_MAX     (PB_RANGE_MAX * 256)       // BEND in 1/256 semitone: 0..12.00
#define AMOUNT_MAX   (64 * 256)                 // depths in 1/256: -64.00..+64.00
#define VEL_SENS_MAX 100

struct me_cfg {
    union {
        volatile int16_t range;                 // audio: bend in 1/256 semitone (TUNE's step), 0 = none
        volatile int16_t thru;                  // MIDI: PB, AT, MW and BC pass to the synth
    };
    volatile int8_t mw_dest, at_dest, vel_dest; // audio: a sound slot 1..45; MIDI: 1..12 (below); 0 none
    volatile int8_t vel_sens;                   // 0..100 %: how much velocity counts in what plays
    volatile int16_t mw_amount, at_amount, vel_amount;  // -64.00..+64.00, in 1/256
};

extern struct me_cfg me_audio_cfg[8];
extern struct me_cfg me_midi_cfg[8];

// A MIDI track's destinations, as its LFO page lists them: what its send()
// ids 21..32 are. dest = output + 1.
enum { O_PB, O_AT, O_MW, O_BC, O_VAL1, OUTPUTS = O_VAL1 + 8 };
// A MIDI track's destinations: 0 none, 1..OUTPUTS its twelve values (output
// + 1), then its LFO's SPD, MULT, FADE, PHAS and DEP.
#define MIDI_LFO_FIRST (OUTPUTS + 1)
#define MIDI_DESTS     (MIDI_LFO_FIRST + 5)

extern volatile uint32_t me_activity;        // counts notes and live input: store.c waits for quiet
#define ME_PRESETS  64                          // preset slots for each kind of track
#define ME_NAME_LEN 12                          // a preset's or project's name, as shown
void me_dest_name(char *line, int size, int mid, int track, int value);
int me_dest_valid(int mid, int value);
void me_factory(struct me_cfg *c, int mid);
const char *me_preset_name(int mid, int slot);
int me_presets_ready(int mid);
void me_presets_rescan(int mid);
int me_default_preset(int mid);
int me_default_set(int mid, int slot);
int me_preset_save(int mid, int slot, const char *name, int track);
int me_preset_load(int mid, int slot, int track);
int me_track_reset(int mid, int track);
int me_store_busy(void);

#define AUDIO_KINDS (KINDS + 1)                 // audio sources: PB, AT, MW and the velocity
#define VELK KINDS

// audio.c
// live: PB as an offset from centre (-8192..8191), AT and MW 0..127.
void me_audio_take(int kind, int32_t live, uint32_t audio_tracks, int from_auto);
void me_audio_release_auto(void);
void me_audio_velocity(int t, int32_t velocity, int from_auto);
void me_render(void *words);                    // after the LFO stage: every slot but the LFOs'
void me_render_lfo(void *words);                // the LFO stage's entry: the LFO slots (1..16)
// vel.s / audio.c: a note the render plays on a voice (its velocity is in the
// voice's word); a velocity 1..127 through V.SNS 0..100 %.
void me_voice_velocity(int32_t voice);
int32_t me_velocity_scaled(int32_t velocity, int32_t sens);

// expr.c
// vel.s: notes the MIDI tracks send: V.SNS on their velocity, VEL as a source.
const uint8_t *me_note_out(int32_t len, const uint8_t *bytes);
// page.c: a MIDI track's settings changed: what it sends follows at once.
void me_midi_changed(int m);
// The CC number a MIDI track's CC VAL slot k (0..7) sends on (its SEL), or -1.
int32_t me_midi_sel(int m, int k);
void me_midi_lfo_pre(volatile int16_t *params, int32_t track);
void me_midi_lfo_post(volatile int16_t *params, int32_t track);

#endif
