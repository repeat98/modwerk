/* SPDX-License-Identifier: GPL-2.0-or-later */
/* MUTINY engine: pure, allocation-free generators, built for the host tests and the m68k mod.
 * No firmware address, libc or global state. EUCL and TURI are original; TB3P ports TB-3PO
 * (MIT, see engine.c). */
#ifndef MUTINY_ENGINE_H
#define MUTINY_ENGINE_H

#include <stdint.h>

#define MU_STEPS 64
#define MU_KNOBS 8  /* A is MODEL; B..H are the model's seven controls */
#define MU_PARAMS 7 /* controls B..H */
#define MU_SRC 16   /* source steps: the project's data gap is only 480 bytes */

enum mu_model { MU_OFF = 0, MU_EUCL = 1, MU_TURI = 2, MU_TB3P = 3, MU_MODELS = 4 };

/* The random values a loop is made of. Knobs are live transforms on them, so only REROLL and
 * evolution change the source. */
struct mu_source {
    uint8_t g[MU_SRC]; /* gate */
    uint8_t p[MU_SRC]; /* pitch */
    uint8_t a[MU_SRC]; /* accent */
};

/* One track's session recipe: model, seven controls per model (kept when switching), seed counter,
 * source and TB3P's 16-bit seed (high byte first). 80 bytes, all uint8_t. */
struct mu_track {
    uint8_t model;
    uint8_t p[MU_MODELS][MU_PARAMS];
    uint8_t seed;
    struct mu_source src;
    uint8_t acid[2];
};

/* TB3P's generated pattern: 32 steps; bit s of each mask is step s. */
struct mu_acid {
    uint32_t gates, slides, accents, oct_ups, oct_downs;
    uint8_t notes[32];   /* scale degrees from ROOT */
    uint8_t slide_r[32]; /* the random(100) each step's slide was drawn from */
};
/* gate_dens 0-7 and pitch_dens 0-8 are the applet's DENSITY halves; scale_size is the scale's note
 * count; t4 selects the Teensy 4 build's single pass. */
void mu_acid_generate(uint16_t seed, uint32_t gate_dens, uint32_t pitch_dens, uint32_t scale_size,
                      int t4, struct mu_acid *a);
/* The highest scale degree TB3P uses at pitch density pd in a scale of size notes. */
uint32_t mu_acid_range(uint32_t pd, uint32_t size);
/* Does step s slide into the next at SLID 0-100, and the PTIM its note locks. */
int mu_acid_slides(const struct mu_acid *a, uint32_t s, uint32_t slid);
uint32_t mu_acid_ptim(uint32_t slid);
uint16_t mu_acid_seed(const struct mu_track *t);
void mu_acid_set_seed(struct mu_track *t, uint32_t seed);

/* Derived TB3P base cache: the seeded 32-step pattern depends only on the acid seed, GATE, PTCH,
 * the scale's note count and T4 mode. Caller-owned, never project data; track is context, not
 * identity. */
struct mu_acid_cache {
    struct mu_acid acid;
    uint16_t seed;
    uint32_t gate, ptch, size; /* the exact inputs compared */
    uint8_t t4, track, valid;
};
void mu_acid_cache_reset(struct mu_acid_cache *c);
/* -> 1 when generated, 0 when the cached base was reused. */
int mu_acid_cache_prepare(struct mu_acid_cache *c, uint8_t track, uint16_t seed, uint32_t gate_dens,
                          uint32_t pitch_dens, uint32_t scale_size, int t4);

/* The track's key as seq-events reports it. scale: -1 chromatic, else the manual's APPENDIX D order
 * after CHROMATIC. */
struct mu_key {
    uint8_t note; /* the track's NOTE: the register notes are placed around */
    uint8_t root; /* keyboard ROOT; 0xff unknown (NOTE is the root) */
    int8_t scale;
    uint8_t len; /* track length 1-64; 0 unknown, the model uses its default */
};

/* The TRIG page's PORT as a per-step lock: NONE keeps the track's own. */
enum { MU_GLIDE_NONE = 0, MU_GLIDE_ON = 1, MU_GLIDE_OFF = 2 };
#define MU_VEL_FLAT 100u /* ACNT 0: the Digitone's default VEL */
struct mu_step {
    uint8_t trig;  /* 1: the step fires */
    uint8_t note;  /* MIDI note, 0-127 */
    uint8_t vel;   /* 1-127 */
    uint8_t slide; /* MU_GLIDE_* */
    uint8_t hold;  /* 1: holds into the next step, as a 303 gate before a slide */
};

/* 1 when the step is accented (above the flat velocity); 0 at ACNT 0. */
int mu_step_accent(const struct mu_step *s);

/* Every consumer asks these rather than re-deriving a loop: TRK is a control position, never an
 * array length, and a model's cap is never exceeded. */
uint32_t mu_model_cap(uint8_t model);     /* EUCL 64, TURI 16, TB3P 32, OFF 0 */
uint32_t mu_model_default(uint8_t model); /* EUCL 16, TURI 8, TB3P 16, OFF 0 */
/* v is the raw length control (1..cap), or cap + 1 for TRK: follow the key's track length as far
 * as the model holds it. TURI never goes below 2; an unknown length uses the model's default. */
uint32_t mu_loop_len(uint8_t model, uint32_t v, const struct mu_key *key);
/* The loop position display step plays, 0..len-1: the one rotation convention. */
uint32_t mu_loop_pos(uint8_t model, uint32_t len, uint32_t rot, uint32_t step);

/* A loop's gates and the position each display step plays. gates bit p is loop position p (the
 * first 16 a cell grid shows); play/accent/slide bit s are display step s in play order. Both go
 * through mu_loop_pos, so a picture cannot turn another way than the music. */
struct mu_preview {
    uint16_t gates;
    uint64_t play;
    uint64_t accent;
    uint64_t slide;
    uint8_t len;   /* effective loop length, 1..64 */
    uint8_t cells; /* positions the picture shows: min(len, 16) */
    uint8_t start; /* the loop position display step 0 plays: ROT's needle */
};
void mu_preview(const struct mu_track *t, const struct mu_key *key, struct mu_preview *out);
/* The same picture through the shared TB3P base cache. */
void mu_preview_cached(const struct mu_track *t, const struct mu_key *key, uint8_t track,
                       struct mu_acid_cache *cache, struct mu_preview *out);
/* x of 255 against a percentage: 100 admits every value. */
int mu_below(uint32_t x, uint32_t pct);

/* Knob metadata. k: 0 is MODEL, 1..7 are B..H. step: detents one unit takes (4 counts is a detent);
 * fast: what a turn of more than one detent multiplies that step by. */
int32_t mu_knob_min(uint8_t model, uint8_t k);
int32_t mu_knob_max(uint8_t model, uint8_t k);
int32_t mu_knob_step(uint8_t model, uint8_t k);
int32_t mu_knob_default(uint8_t model, uint8_t k);
int32_t mu_knob_fast(uint8_t model, uint8_t k);
const char *mu_knob_label(uint8_t model, uint8_t k);
const char *mu_model_name(uint8_t model);

void mu_defaults(struct mu_track *t);
void mu_clamp(struct mu_track *t);

/* Number of notes in a scale (1..12) and its semitones (0..11). */
uint32_t mu_scale_notes(int8_t scale, uint8_t out[12]);

/* Only TURI drifts: its LOCK is knob H, 100 keeps the source. */
#define MU_LOCK(t) ((t)->model == MU_TURI ? (t)->p[MU_TURI][MU_PARAMS - 1] : 100u)

/* Draw a new source from the seed counter; REROLL advances the counter first. */
void mu_fill(struct mu_track *t);
void mu_reroll(struct mu_track *t);
/* One pass played: replace each source step with probability 100-LOCK %. */
void mu_evolve(struct mu_track *t, uint32_t pass);

/* RIFF's line: one scale degree (0 to n-1) per source step, from a walk over the 16 steps, so
 * raising RIFF only adds hits and never moves a note. */
void mu_riff_degrees(const struct mu_track *t, uint32_t n, uint8_t out[MU_SRC]);

/* Render the 64-step table for the current model; all zero for MU_OFF. Pure: TB3P generates its
 * base locally. */
void mu_render(const struct mu_track *t, const struct mu_key *key, struct mu_step out[MU_STEPS]);

/* The same music through a caller-owned TB3P base cache, so playback and the page share one base
 * per dependency change. Other models ignore the cache. */
void mu_render_cached(const struct mu_track *t, const struct mu_key *key, uint8_t track,
                      struct mu_acid_cache *cache, struct mu_step out[MU_STEPS]);

#endif
