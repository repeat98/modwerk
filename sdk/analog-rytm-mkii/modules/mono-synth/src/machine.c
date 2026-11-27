/* SPDX-License-Identifier: GPL-3.0-or-later */
// Mono Synth for the Analog Rytm MKII (OS 1.74): SY MONO, a digital voice machine in the
// spirit of a small monosynth's oscillator section. One oscillator gives a saw and a pulse,
// a sub divides it down one or two octaves, white noise joins them, and a triangle LFO of
// its own bends the oscillator's pitch. The track's own analog filter, AMP and OVR come
// after it: the Modwerk base sends the voice's stream there (modwerk/voice.h).
//
// The range (16', 8', 4', 2') is the machine's type: a tap of encoder A steps it, A's label
// follows (T16, T8, T4, T2) and it saves with the sound.

#include <stdint.h>
#include "analog-rytm-mk2/machines.h"
#include "modwerk/voice.h"
#include "ms_dsp.h"
#include "ms_gate.h"

#define SLOT 40

// The knobs, by sound index (play.knob[i] is index 9 + i). Slot 40's SYNTH page shows
// A 10, B 13, C 12, D 11 / E 14, F 16, G 15, H 9 (sdk/machines/analog-rytm-mkii/README.md),
// so the page reads TUN LFO MOD PLS / SAW SUB NSE LEV.
enum { K_LEV, K_TUN, K_PLS, K_MOD, K_LFO, K_SAW, K_NSE, K_SUB };
#define TAP_ENCODER 0               // A
#define TAP_INDEX 10                // the sound index A shows

static struct ms_voice voices[8];

// Each voice's amp, as ms_amp_follow (amp_follow.s) saw it this block: the state (negative
// when idle), the rate and level words sent. The marker lets a memory read find it.
struct ms_amp { uint32_t marker; int32_t state[8]; uint32_t rate[8], level[8]; };
volatile struct ms_amp ms_amp = { 0x6d73616du };
static struct ms_gate gates[8];

static void knobs(const struct mw_voice_play *p, struct ms_knobs *k)
{
    k->tun = p->knob[K_TUN];
    k->lfo = p->knob[K_LFO];
    k->mod = p->knob[K_MOD];
    k->pls = p->knob[K_PLS];
    k->saw = p->knob[K_SAW];
    k->sub = p->knob[K_SUB];
    k->nse = p->knob[K_NSE];
    k->range = p->type < MS_RANGES ? p->type : 0;
    k->ratio = p->ratio;
}

static void ms_hit(int v, const struct mw_voice_play *p)
{
    ms_gate_hit(&gates[v]);
    // The oscillator and the LFO run free across hits, as an analog one does; only the
    // first hit on a voice sets it up.
    if (!voices[v].ready) {
        struct ms_knobs k;
        knobs(p, &k);
        ms_init(&voices[v], &k);
    }
}

static void ms_block(int v, const struct mw_voice_play *p, int32_t *out)
{
    // Once the voice's AMP has surely closed the voice goes quiet, so the base ends the hit
    // (64 quiet blocks) and the voice costs nothing until its next trig.
    if (!ms_gate_block(&gates[v], ms_amp.state[v], ms_amp.rate[v], ms_amp.level[v])) {
        for (int i = 0; i < MS_FRAMES; i++)
            out[i] = 0;
        return;
    }
    struct ms_knobs k;
    knobs(p, &k);
    ms_render(&voices[v], &k, out);
}

static void ms_engine(int32_t v, void *frame, uint16_t *blk, int32_t pitch);

static const char *const labels[2 * MS_RANGES] = {
    "T16", "Tune 16ft", "T8", "Tune 8ft", "T4", "Tune 4ft", "T2", "Tune 2ft",
};

const struct mw_voice mono_synth_voice = {
    MW_VOICE_ABI, SLOT, MS_RANGES, TAP_ENCODER, TAP_INDEX, 0, labels, 0, ms_hit, ms_block,
};

static void ms_engine(int32_t v, void *frame, uint16_t *blk, int32_t pitch)
{
    mw_voice_run(&mono_synth_voice, v, frame, blk, pitch);
}

const struct core_machine mono_synth_machine = {
    SLOT, ms_engine, 0, CORE_VOICE_BD | CORE_VOICE_SD | CORE_VOICE_RS | CORE_VOICE_BT | CORE_VOICE_LT | CORE_VOICE_MT, 0, "SY MONO", "SYMO",   // pads 1-8: six voices, about 25 % of the block at 4.1 % each
    {
        { "Level", "LEV", 0, 127, 100, 0 },          // sound index 9: H
        { "Tune", "TUN", 0, 127, 64, 1 },            // 10: A (the base relabels it by range)
        { "Pulse Level", "PLS", 0, 127, 0, 0 },      // 11: D
        { "Pitch Mod", "MOD", 0, 127, 0, 0 },        // 12: C
        { "LFO Rate", "LFO", 0, 127, 64, 0 },        // 13: B
        { "Saw Level", "SAW", 0, 127, 100, 0 },      // 14: E
        { "Noise Level", "NSE", 0, 127, 0, 0 },      // 15: G
        { "Sub Osc", "SUB", 0, 127, 0, 0 },          // 16: F
    },
};
