/* SPDX-License-Identifier: GPL-3.0-or-later */
// Rave Stab for the Analog Rytm MKII (OS 1.74): SY RAVE, a digital chord voice for stabs.
// Six band-limited oscillators play a chord (CHD) in a voicing (VOI), detuned against each
// other (DET), from saw through square to a narrow pulse (WAV), with a strum (STR) and a pitch drop (PCH) at the hit.
// The track's own analog filter, AMP and OVR come after it: the Modwerk base sends the
// voice's stream there (modwerk/voice.h), so the filter's envelope makes the stab's sweep.
//
// The register (-1, -2, 0 or +1 octave against the note) is the machine's type: a tap of
// the TUN encoder steps it, the label follows and it saves with the sound.

#include <stdint.h>
#include "analog-rytm-mk2/machines.h"
#include "analog-rytm-mk2/pages.h"
#include "modwerk/voice.h"
#include "ra_dsp.h"

#define SLOT 39

// The knobs, by sound index (play.knob[i] is index 9 + i). Indices 9 (LEV), 10 (TUN) and
// 11 (DEC) keep stock's meaning and MIDI CCs; where slot 39 draws each index on the page
// is read off the unit (sdk/machines/analog-rytm-mkii/README.md, knob positions).
enum { K_LEV, K_TUN, K_STR, K_CHD, K_VOI, K_DET, K_WAV, K_PCH };
#define TAP_ENCODER 0               // A, the encoder that shows TUN (index 10) on slots 40-42
#define TAP_INDEX 10

static struct ra_voice voices[8];

static void knobs(const struct mw_voice_play *p, struct ra_knobs *k)
{
    k->tun = p->knob[K_TUN];
    k->str = p->knob[K_STR];
    k->chd = (uint8_t)(p->knob[K_CHD] * RA_CHORDS >> 7);     // the whole dial: 13 equal zones
    k->voi = (uint8_t)(p->knob[K_VOI] * RA_VOICINGS >> 7);   // 9 equal zones
    k->det = p->knob[K_DET];
    k->wav = p->knob[K_WAV];
    k->pch = p->knob[K_PCH];
    k->octave = p->type < RA_OCTAVES ? p->type : 0;
    k->velocity = p->velocity;
    k->ratio = p->ratio;
}

static void ra_on_hit(int v, const struct mw_voice_play *p)
{
    struct ra_knobs k;
    knobs(p, &k);
    ra_hit(&voices[v], &k);
}

static void ra_block(int v, const struct mw_voice_play *p, int32_t *out)
{
    struct ra_knobs k;
    knobs(p, &k);
    ra_render(&voices[v], &k, out);
}

static const char *const labels[2 * RA_OCTAVES] = {
    "T-1", "Tune, octave down", "T-2", "Tune, two octaves down", "T 0", "Tune, at the note", "T+1", "Tune, octave up",
};

const struct mw_voice rave_stab_voice = {
    MW_VOICE_ABI, SLOT, RA_OCTAVES, TAP_ENCODER, TAP_INDEX, 0, labels, 0, ra_on_hit, ra_block,
};

static void ra_engine(int32_t v, void *frame, uint16_t *blk, int32_t pitch)
{
    mw_voice_run(&rave_stab_voice, v, frame, blk, pitch);
}

const struct core_machine rave_stab_machine = {
    SLOT, ra_engine, 0, CORE_VOICE_BD | CORE_VOICE_BT | CORE_VOICE_SD, 0, "SY RAVE", "SYRV",   // the voices Analog BD and SY MONO run on
    {
        { "Level", "LEV", 0, 127, 100, 0 },          // sound index 9
        { "Tune", "TUN", 0, 127, 64, 1 },            // 10 (the base relabels it by register)
        { "Strum", "STR", 0, 127, 0, 0 },            // 11: none at 0; the lowest note first, upwards, up to 100 ms a note at 127
        { "Chord", "CHD", 0, 127, 0, 0 },            // 12, in 13 zones of about 10 (starting 0 10 20 30 40 50 60 69 79 89 99 109 119): EURK, MIN, MIN7, MIN9, MIN11, MAJ, MAJ7, DOM7, SUS2, SUS4, 5TH, DIM, OCT
        { "Voicing", "VOI", 0, 127, 0, 0 },          // 13, in 9 zones of about 14 (starting 0 15 29 43 57 72 86 100 114): as listed, root down, root and fifth down, drop 2, drop 3, drop 2+4, open, sub, wide
        { "Detune", "DET", 0, 127, 0, 0 },           // 14
        { "Wave", "WAV", 0, 127, 64, 0 },            // 15: saw 0, square 64, narrow pulse 127
        { "Pitch drop", "PCH", 0, 127, 64, 1 },      // 16: none at 64, the chord starts up to 2 octaves above (127) or below (0) and falls back
    },
};

// CHD and VOI read as the chord's and the voicing's names, not numbers. Stock asks each
// knob's text when it draws the page; this entry comes before the base's (order 9 against
// its 10) and answers only slot 39's records at indices 12 and 13, passing the rest on.
#define RECORD(id) ((const int32_t *)(PARAM_RECORDS_AT + 52 * (id)))    // owner +0, index +4
#define RECORD_FIRST 334            // the hidden slots 34..43's records (the base's voice.c)
#define RECORD_LAST 407

static const char chord_names[RA_CHORDS][5] = {
    "EURK", "MIN", "MIN7", "MIN9", "MI11", "MAJ", "MAJ7", "DOM7", "SUS2", "SUS4", "5TH", "DIM", "OCT",
};
static const char voicing_names[RA_VOICINGS][5] = {
    "STD", "R-1", "R5-1", "DRP2", "DRP3", "D2+4", "OPEN", "SUB", "WIDE",
};

static int ra_text(struct core_text *t)
{
    const int32_t *r = RECORD(t->id);
    int v = t->value >> 8;
    const char *name;
    if (r[0] != SLOT || v < 0 || v > 127)
        return CORE_TEXT_PASS;
    if (r[1] == 9 + K_CHD)
        name = chord_names[v * RA_CHORDS >> 7];
    else if (r[1] == 9 + K_VOI)
        name = voicing_names[v * RA_VOICINGS >> 7];
    else
        return CORE_TEXT_PASS;
    char *b = t->buf;
    while (*name)
        *b++ = *name++;
    *b = 0;
    return CORE_TEXT_DONE;
}

const struct core_param rave_stab_params = { RECORD_FIRST, RECORD_LAST, 0, 0, ra_text };
