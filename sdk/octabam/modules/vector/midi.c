/* VECTOR on MIDI tracks: a MIDI generator (sdk/machines/octatrack/events.json ot_midi_generators). The same original
 * phrase engine writes the track's note trigs and NOTE, VEL and LEN locks; the stock MIDI sequencer plays them, so
 * tempo, track speed, swing, conditions and note-offs stay stock's. Its controls take the SRC page (stock's NOTE page)
 * and the AMP page (stock's ARP page; FUNC+AMP its second): layout A, the owner's choice of 24 October 2026. OCT, VEL
 * and GATE are the track's own NOTE, VEL and LEN, so a trig placed by hand plays the root at the phrase's velocity and
 * length; the others are kept in the track's arpeggiator note bytes, which the base gives a generator's track (Part
 * 0x1832 + 16 t, value - 64: the -64..63 stock's validator keeps). Included after native.c (its Part, dirty and redraw
 * helpers). MIDI track records: octabam docs/firmware/STEP_LOCKS.md, and on the owner's MKII (21 October 2026): trig
 * mask 0 at +0, length +0x28, locks +0x30 + 32 step (NOTE 0, VEL 1, LEN 2); the trig word as the audio record's
 * (PARAM_PAGES.md 5g: micro-timing in bits 12-7, condition in 6-0, labels 0x400b2588). */
#include "modwerk_events.h"
#define MIDI_TRACKS 0x48d0u
#define MIDI_TRACK_BYTES 0x8b0u
#define MIDI_LOCKS 0x30u
#define MIDI_TIMING 0x830u           /* the trig word, high byte first, two bytes a step */
#define MIDI_PAGE1(t) (0x3e2u + 32u * (t)) /* the NOTE page's values: NOTE, VEL, LEN, NOT2-4 */
#define MIDI_NOTES(t) (0x1832u + 16u * (t))
#define MIDI_MARK 12u                /* a thirteenth byte: 'V' once VECTOR wrote its controls there */
#define MIDI_NOTE_FORMAT (0x400d3e3eu + 0xcau) /* the NOTE page descriptor's formatters: NOTE's, then VEL's, LEN's */

/* Controls 0-11 are the audio machine's (engine.c's order); GATE is the track's LEN, so arp byte 4 stays unused. */
enum { C_ROOT = 2, C_GATE = 4, C_SEED = 6, C_OCT = 12, C_VEL, C_PROB, C_HUMN, C_NONE };
static const char *const midi_names[17] = {"TYPE", "DENS", "ROOT", "SCAL", "GATE", "ACNT", "SEED", "SPAN", "OFST", "ROT",
                                           "RPT", "DIR", "OCT", "VEL", "PROB", "HUMN", ""};
static const uint8_t midi_max[16] = {15, 16, 11, 4, 126, 127, 127, 12, 24, 63, 64, 1, 9, 127, 21, 23};
static const uint8_t midi_byte[16] = {0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 0, 0, 13, 14}; /* PROB, HUMN past the mark */
/* SRC; AMP; FUNC+AMP. */
static const uint8_t midi_layout[3][6] = {
    {0, 1, C_ROOT, 3, C_OCT, C_SEED},
    {C_VEL, 5, C_GATE, 7, 8, 10},
    {9, 11, C_PROB, C_HUMN, C_NONE, C_NONE},
};

static unsigned midi_value(unsigned t, unsigned k) { return (uint8_t)((int8_t)current_part()[MIDI_NOTES(t) + k] + 64); }
/* A byte of the current Part and its battery-backed copy. */
static void midi_part(unsigned at, uint8_t v)
{
    current_part()[at] = v;
    U8(SRAM_PART + (U8(PART_IDX) & 3u) * PART_STRIDE + at) = v;
}
static void midi_put(unsigned t, unsigned k, unsigned v) { midi_part(MIDI_NOTES(t) + k, (uint8_t)(v - 64u)); }
/* A NOTE page value, and its live copy while the track plays this bank and Part (as the base's arp reset). */
static void midi_page1(unsigned t, unsigned k, unsigned v)
{
    midi_part(MIDI_PAGE1(t) + k, (uint8_t)v);
    if (U8(0x8000666eu + t) == U8(0x80000002u) && U8(0x80006676u + t) == U8(0x80000003u))
        U8(0x46c76dc0u + 0x44u * t + k) = (uint8_t)v;
}
static unsigned midi_control(unsigned t, unsigned c)
{
    const volatile uint8_t *page1 = current_part() + MIDI_PAGE1(t);
    unsigned v;
    if (c >= C_NONE) return 0;
    if (c == C_OCT) v = page1[0] / 12u;
    else if (c == C_VEL) v = page1[1];
    else if (c == C_GATE) v = page1[2];
    else if (midi_value(t, MIDI_MARK) != 'V') {
        static const uint8_t first[16] = {11, 11, 0, 1, 0, 48, 1, 12, 12, 0, 0, 0, 0, 0, 0, 0};
        return c == C_SEED ? t + 1u : first[c];
    } else v = midi_value(t, midi_byte[c]);
    return v > midi_max[c] ? midi_max[c] : v;
}
/* OCT and ROOT both set NOTE: the root in that octave. The first control kept writes every default and the mark. */
static void midi_set_control(unsigned t, unsigned c, unsigned v)
{
    if (c == C_OCT || c == C_ROOT)
        midi_page1(t, 0, 12u * (c == C_OCT ? v : midi_control(t, C_OCT)) + (c == C_ROOT ? v : midi_control(t, C_ROOT)));
    if (c == C_VEL) { midi_page1(t, 1, v); return; }
    if (c == C_GATE) { midi_page1(t, 2, v); return; }
    if (c == C_OCT) return;
    if (midi_value(t, MIDI_MARK) != 'V') {
        for (unsigned k = 0; k < C_NONE; ++k)
            if (k != C_GATE && k != C_OCT && k != C_VEL) midi_put(t, midi_byte[k], midi_control(t, k));
        midi_put(t, MIDI_MARK, 'V');
    }
    midi_put(t, midi_byte[c], v);
}
static void midi_params(unsigned t, VectorParams *p, uint32_t *seed)
{
    uint8_t *bytes = (uint8_t *)p;
    for (unsigned c = 0; c < 12; ++c) if (c != C_SEED) bytes[c < C_SEED ? c : c - 1] = (uint8_t)midi_control(t, c);
    *seed = midi_control(t, C_SEED);
}

static unsigned midi_bit(const uint8_t *r, unsigned mask, unsigned step) { return (r[mask * 8u + 7u - step / 8u] >> (step % 8u)) & 1u; }
static void midi_setbit(uint8_t *r, unsigned mask, unsigned step, unsigned on)
{
    uint8_t *byte = r + mask * 8u + 7u - step / 8u, b = (uint8_t)(1u << (step % 8u));
    *byte = on ? (uint8_t)(*byte | b) : (uint8_t)(*byte & (uint8_t)~b);
}
/* No trigs, trigless trigs or locks: a phrase may be written without replacing anything. Swing (mask 3) is a default. */
static int midi_empty(const volatile uint8_t *r)
{
    for (unsigned i = 0; i < 24; ++i) if (r[i]) return 0;
    for (unsigned i = 32; i < 40; ++i) if (r[i]) return 0;
    for (unsigned i = 0; i < VECTOR_STEPS * 32u; ++i) if (r[MIDI_LOCKS + i] != VECTOR_NO_LOCK) return 0;
    return 1;
}
/* A byte of the track record and its battery-backed copy, stored only when it changes. */
static void midi_set(volatile uint8_t *r, volatile uint8_t *mirror, unsigned at, uint8_t v)
{
    if (r[at] != v) { r[at] = v; mirror[at] = v; }
}
/* A note's trig word from PROB and HUMN: off the beat (a step not a multiple of 4) it gets the condition PROB names,
 * 99% (1) down to 1% (21) of stock's list; HUMN moves every note by up to that many micro-timing units either way.
 * From the seed and the step, so turning another control keeps them where they were. */
static unsigned midi_word(unsigned step, uint32_t seed, unsigned prob, unsigned humn)
{
    uint32_t h = (seed + 1u) * 0x9e3779b9u ^ (step + 1u) * 0x85ebca6bu;
    h ^= h >> 15; h *= 0x2c1b3c6du; h ^= h >> 12;
    int micro = humn ? (int)(h % (2u * humn + 1u)) - (int)humn : 0;
    unsigned condition = prob && step % 4u ? 30u - prob : 0u;
    return ((unsigned)micro & 0x3fu) << 7 | condition;
}
/* In place, as stock's own editors store: module code and data run uncached, so a whole-record copy in and out cost
 * about 0.8 ms of a 1.3 ms knob turn on the owner's MKII (21 October 2026); this touches the five masks, three locks
 * a step and the trig words of the steps that change. NOTE locks from the phrase's semitones over `octave`, VEL from
 * its volumes, LEN from its holds. Other locks and swing stay; old and new notes lose stale trigless marks, and their
 * trig words are rewritten (none on a removed note). `locked` gets whether each step keeps any lock (the lock index). */
static void midi_write(volatile uint8_t *r, volatile uint8_t *mirror, const VectorPhrase *phrase, unsigned octave,
                       uint32_t seed, unsigned prob, unsigned humn, uint8_t locked[VECTOR_STEPS])
{
    uint8_t masks[40];
    for (unsigned k = 0; k < 40; ++k) masks[k] = r[k];
    for (unsigned i = 0; i < VECTOR_STEPS; ++i) {
        const VectorStep *s = &phrase->steps[i];
        unsigned at = MIDI_LOCKS + 32u * i, old = midi_bit(masks, 0, i);
        int note = (int)octave + ((int)s->pitch - 64) / 5;
        midi_set(r, mirror, at, s->active ? (uint8_t)(note < 0 ? 0 : note > 127 ? 127 : note) : VECTOR_NO_LOCK);
        midi_set(r, mirror, at + 1u, s->active ? s->volume : VECTOR_NO_LOCK);
        midi_set(r, mirror, at + 2u, s->active ? s->hold : VECTOR_NO_LOCK);
        midi_setbit(masks, 0, i, s->active);
        if (old || s->active) {
            unsigned word = s->active ? midi_word(i, seed, prob, humn) : 0u;
            midi_set(r, mirror, MIDI_TIMING + 2u * i, (uint8_t)(word >> 8));
            midi_set(r, mirror, MIDI_TIMING + 2u * i + 1u, (uint8_t)word);
            midi_setbit(masks, 1, i, 0); midi_setbit(masks, 4, i, 0);
        }
        unsigned any = s->active;
        for (unsigned k = 3; !any && k < 32; ++k) any = r[at + k] != VECTOR_NO_LOCK;
        locked[i] = (uint8_t)any;
        midi_setbit(masks, 2, i, !s->active && any);
    }
    for (unsigned k = 0; k < 40; ++k) midi_set(r, mirror, k, masks[k]);
}
/* On the UI task, into the current pattern's record and its battery-backed copy, then published through stock's
 * track update (MIDI tracks are 8-15 there). Stock's lock index (0x400339d8) rescans every track of the pattern, 16 x
 * 64 x 32 bytes, about 3 ms on the unit; only this track's bit changes, so it is set here: bit t of each step's byte
 * at 0x46c7d2e4 (the MIDI tracks'), as that routine sets it. A fresh seed is kept only once its phrase is written. */
static int midi_generate(unsigned t, int replace, int fresh)
{
    unsigned p = U8(PATTERN_IDX);
    if (!valid_bank() || t >= 8 || p >= 16) return 0;
    uint32_t bank = U32(BANK_PTR), part = U8(PART_IDX), off = p * PATTERN_STRIDE + MIDI_TRACKS + t * MIDI_TRACK_BYTES;
    volatile uint8_t *r = (volatile uint8_t *)(uintptr_t)(bank + off), *mirror = (volatile uint8_t *)(uintptr_t)(SRAM_PATTERNS + off);
    if (!replace && !midi_empty(r)) return 0;
    const volatile uint8_t *pat = (const volatile uint8_t *)(uintptr_t)(bank + p * PATTERN_STRIDE);
    unsigned length = pat[0x8e55u] ? r[0x28u] : pat[0x8e53u];
    VectorParams params; uint32_t seed;
    midi_params(t, &params, &seed);
    if (fresh) seed = vector_next_seed(seed);
    const volatile uint8_t *page1 = current_part() + MIDI_PAGE1(t);
    if (!length || length > 64 || page1[1] > 127 || !vector_generate(&phrase, &params, length, page1[1], seed)) return 0;
    static uint8_t locked[VECTOR_STEPS];
    midi_write(r, mirror, &phrase, page1[0] - page1[0] % 12u, seed, midi_control(t, C_PROB), midi_control(t, C_HUMN), locked);
    if (fresh) midi_set_control(t, C_SEED, seed);
    dirty_part(part & 3u);
    for (unsigned i = 0; i < VECTOR_STEPS; ++i)
        U8(0x46c7d2e4u + i) = (uint8_t)((U8(0x46c7d2e4u + i) & ~(1u << t)) | locked[i] << t);
    ((void (*)(unsigned))0x4009da20u)(t + 8u);
    return 1;
}

/* The pages: stock's NOTE or ARP descriptor with VECTOR's names and formatters in value-text cells, built in the audio
 * page's buffer (never shown together); audio's generator_page rebuilds it once src_page_ready is clear. */
static uint32_t midi_page_built = 0;
static unsigned midi_view;
static void midi_format(char *out, unsigned c)
{
    typedef void (*Format)(char *, int);
    unsigned t = U8(TRACK_IDX), v = midi_control(t, c);
    if (c == C_GATE) { ((Format)*(const uint32_t *)(uintptr_t)(MIDI_NOTE_FORMAT + 8u))(out, (int)v); return; }
    if (c == C_OCT) { ((Format)*(const uint32_t *)(uintptr_t)MIDI_NOTE_FORMAT)(out, (int)(12u * v + midi_control(t, C_ROOT))); return; }
    static const char *const roots[] = {"C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"};
    const char *name = c == C_ROOT ? roots[v % 12] : c == 3 ? vector_scale_names[v % 5] : c == 11 ? (v ? "REV" : "FWD") :
                       (c == 10 || c == C_PROB) && !v ? "OFF" : c == C_NONE ? "" :
                       c == C_PROB ? *(const char *const *)(uintptr_t)(0x400b2588u + 4u * (30u - v)) : 0;
    unsigned i = 0;
    if (name) { do out[i] = name[i]; while (name[i++]); return; }
    if (c == 8) { int s = (int)v - 12; if (s < 0) { out[i++] = '-'; v = (unsigned)-s; } else v = (unsigned)s; }
    if (v >= 100) out[i++] = (char)('0' + v / 100);
    if (v >= 10) out[i++] = (char)('0' + v / 10 % 10);
    out[i++] = (char)('0' + v % 10); out[i] = 0;
}
#define MIDI_FORMATTER(n) static void midi_format_##n(char *out, int value) { (void)value; midi_format(out, midi_layout[midi_view][n]); }
MIDI_FORMATTER(0) MIDI_FORMATTER(1) MIDI_FORMATTER(2) MIDI_FORMATTER(3) MIDI_FORMATTER(4) MIDI_FORMATTER(5)
static unsigned midi_view_of(unsigned page, unsigned second) { return page == 0u ? 0u : 1u + (second & 1u); }
static uint32_t vector_midi_page(uint32_t stock, unsigned page, unsigned second)
{
    unsigned view = midi_view_of(page, second);
    midi_view = view;
    if (src_page_ready || midi_page_built != stock + view + 1u) {
        static void (*const formats[6])(char *, int) = {midi_format_0, midi_format_1, midi_format_2, midi_format_3,
                                                        midi_format_4, midi_format_5};
        static const char titles[3][13] = {"VECTOR SRC", "VECTOR AMP 1", "VECTOR AMP 2"};
        const volatile uint8_t *source = (const volatile uint8_t *)(uintptr_t)stock;
        uint8_t *d = src_page;
        for (unsigned i = 0; i < sizeof src_page; ++i) d[i] = source[i];
        label(d + 4, "VEC");
        for (unsigned i = 0; i < 13; ++i) d[9 + i] = (uint8_t)titles[view][i];
        for (unsigned i = 0; i < 6; ++i) {
            label(d + 0x16 + 6 * i, midi_names[midi_layout[view][i]]);
            put32(d + 0xca + 4 * i, (uint32_t)(uintptr_t)formats[i]);
            put32(d + 0xfa + 4 * i, 0x400467a4u); /* stock's value-text cell, as the NOTE page's */
        }
        put32(d + 0x18a, 0x00005555u);
        put32(d + 0x18e, 0x55555555u);
        src_page_ready = 0;
        midi_page_built = stock + view + 1u;
    }
    return (uint32_t)(uintptr_t)src_page;
}
static void vector_midi_knob(unsigned page, unsigned index, int delta, unsigned second)
{
    unsigned t = U8(TRACK_IDX), c = index < 6u ? midi_layout[midi_view_of(page, second)][index] : C_NONE;
    if (c >= C_NONE) return;
    unsigned old = midi_control(t, c);
    int value = (int)old + delta;
    if (value < 0) value = 0;
    if (value > midi_max[c]) value = midi_max[c];
    if ((unsigned)value == old) return;
    midi_set_control(t, c, (unsigned)value);
    if (!midi_generate(t, 1, 0)) midi_set_control(t, c, old);
}
static void vector_midi_yes(unsigned page)
{
    (void)page;
    notice(midi_generate(U8(TRACK_IDX), 1, 1) ? "VECTOR GENERATED" : "NO CHANGE");
}
/* Chosen: VECTOR's defaults, the track's NOTE on the root (C) of its octave and its chord notes off (NOT2-4 have no
 * place on VECTOR's SRC page), and a first phrase on an empty track; a track with notes waits for a control. */
static void vector_midi_assign(unsigned t, unsigned on)
{
    if (!on) return;
    unsigned note = current_part()[MIDI_PAGE1(t)];
    midi_set_control(t, C_SEED, t + 1u);
    midi_page1(t, 0, note > 119u ? 108u : note - note % 12u);
    for (unsigned k = 3; k < 6; ++k) midi_page1(t, k, 64);
    (void)midi_generate(t, 0, 0);
}
const struct modwerk_midi_generator vector_midi = {
    MODWERK_MIDI_GENERATOR_ABI, "VECTOR", 'V', 1u, vector_midi_assign, vector_midi_page, vector_midi_knob, vector_midi_yes, 0,
};
