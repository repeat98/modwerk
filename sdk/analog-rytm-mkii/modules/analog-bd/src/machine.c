/* SPDX-License-Identifier: MIT */
// Analog BD for the Analog Rytm MKII (OS 1.74): BD ANALOG, a digital voice machine that
// plays repeat98's 808 and 909 bass drum models (from the Octatrack's Analog BD).
//
// The Modwerk base runs everything around the sound (modwerk/voice.h): the hit, the
// voice's analog circuit silenced, the knobs, velocity and note, LEV into the voice's
// stream and its filter, AMP and OVR after it, the end of a hit, and the type: 808 or
// 909, stepped by a tap of encoder B, whose label reads TON or SWT. ACNT is the hit's
// velocity.

#include <stdint.h>
#include "analog-rytm-mk2/machines.h"
#include "modwerk/voice.h"
#include "ab_dsp.h"

#define SLOT 36

// The knobs, by sound index (play.knob[i] is index 9 + i). Slot 36's SYNTH page shows
// A 10, B 13, C 14, D 11 / E 15, F 12, G 16, H 9 (rytm-emu, AB00).
enum { K_LEV, K_TUN, K_DEC, K_LOW, K_TON, K_ATK, K_SWP, K_HIGH };
#define TAP_ENCODER 1               // B
#define TAP_INDEX 13                // the sound index B shows

static struct ab_voice voices[8];
static uint8_t ready;               // one bit a voice: its state is set up

static void bd_hit(int v, const struct mw_voice_play *p)
{
    struct ab_voice *s = &voices[v];
    int model = p->type ? AB_909 : AB_808;
    if (!(ready >> v & 1) || s->model != model)   // a retrig keeps the desk's and the slews' history
        ab_init(s, model);
    ready |= (uint8_t)(1u << v);
    ab_trig(s);
}

static void bd_render(int v, const struct mw_voice_play *p, int32_t *out)
{
    struct ab_knobs k = {
        p->knob[K_TUN], p->knob[K_DEC], p->knob[K_TON], p->knob[K_ATK],
        p->knob[K_SWP], p->velocity, p->knob[K_LOW], p->knob[K_HIGH], p->ratio,
    };
    ab_render(&voices[v], &k, out);
}

static void bd_engine(int32_t v, void *frame, uint16_t *blk, int32_t pitch);

static const char *const labels[4] = { "TON", "808 Tone", "SWT", "909 Sweep Time" };
static const char *const names[2] = { "808", "909" };

const struct mw_voice analog_bd_voice = {
    MW_VOICE_ABI, SLOT, 2, TAP_ENCODER, TAP_INDEX, 0, labels, names, bd_hit, bd_render,
};

static void bd_engine(int32_t v, void *frame, uint16_t *blk, int32_t pitch)
{
    mw_voice_run(&analog_bd_voice, v, frame, blk, pitch);
}

const struct core_machine analog_bd_machine = {
    SLOT, bd_engine, 0, CORE_VOICE_BD | CORE_VOICE_BT | CORE_VOICE_SD, 0, "BD ANALOG", "BDAN",   // BD, SD and BT tracks only: four 909s hit together overran the audio block on a MKII
    {
        { "Level", "LEV", 0, 127, 100, 0 },          // sound index 9: H
        { "Tune", "TUN", 0, 127, 64, 1 },            // 10: A
        { "Decay", "DEC", 0, 127, 80, 0 },           // 11: D
        { "Low", "LOW", 0, 127, 64, 1 },             // 12: F
        { "Tone", "TON", 0, 127, 80, 0 },            // 13: B (909: SWT, the base relabels it)
        { "Attack", "ATK", 0, 127, 64, 0 },          // 14: C
        { "Sweep Depth", "SWP", 0, 127, 64, 0 },     // 15: E
        { "High", "HI", 0, 127, 64, 1 },             // 16: G
    },
};
