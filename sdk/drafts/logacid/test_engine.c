/* SPDX-License-Identifier: GPL-3.0-only
 * Firmware-free tests of the LOGACID engine (test_engine.py builds and runs them under the sanitizers). */
#include "engine.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>

/* tb3po.c's generate_pattern, as written (floats, GPL-3.0, Charles Vestal, after Logarhythm's MIT TB_3PO applet), for one motif of n steps at
 * FWD with no mutation: the integer engine must draw the same line from the same seed word. */
static uint32_t ref_rng;
static uint32_t ref_u32(void) { uint32_t x = ref_rng; if (x == 0) x = 1; x ^= x << 13; x ^= x >> 17; x ^= x << 5; return ref_rng = x; }
static float ref_f(void) { return (float)(ref_u32() & 0xFFFFFF) / (float)0x1000000; }
static void reference(LogacidStep *m, unsigned n, const LogacidParams *p, uint32_t seed)
{
    float density = p->density >= 127 ? 1.0f : (float)p->density / 127.0f;
    float accent = p->accent >= 127 ? 1.0f : (float)p->accent / 127.0f, slide = p->slide >= 127 ? 1.0f : (float)p->slide / 127.0f;
    int len = logacid_scale_length[p->scale];
    ref_rng = seed ? seed : 1;
    for (unsigned i = 0; i < n; ++i) {
        m[i].kind = LOGACID_REST; m[i].degree = 0; m[i].octave = 0;
        if (ref_f() > density) continue;
        int degree;
        if (i % 4 == 0 && ref_f() < 0.35f) degree = 0;
        else { degree = (int)(ref_f() * (float)len); if (degree >= len) degree = len - 1; }
        m[i].degree = (uint8_t)degree;
        int oct = (int)(ref_f() * (float)p->octs); if (oct >= p->octs) oct = p->octs - 1;
        m[i].octave = (uint8_t)oct;
        int kind = LOGACID_NOTE;
        if (ref_f() < accent) kind = LOGACID_ACCENT;
        if (ref_f() < slide) kind = LOGACID_SLIDE;
        m[i].kind = (uint8_t)kind;
    }
    for (unsigned i = 0; i < n; ++i) { unsigned nxt = (i + 1) % n; if (m[i].kind == LOGACID_SLIDE && m[nxt].kind == LOGACID_REST) m[i].kind = LOGACID_NOTE; }
    int any = 0;
    for (unsigned i = 0; i < n; ++i) if (m[i].kind != LOGACID_REST) any = 1;
    if (!any) { m[0].kind = LOGACID_NOTE; m[0].degree = 0; m[0].octave = 0; }
}

static void same_as_reference(void)
{
    unsigned cases = 0, differences = 0;
    for (unsigned seed = 0; seed < 128; ++seed) for (unsigned scale = 0; scale < LOGACID_SCALES; ++scale)
    for (unsigned octs = 1; octs <= 3; ++octs) for (unsigned length = 1; length <= 64; length += 3) {
        LogacidParams p = logacid_defaults;
        p.seed = (uint8_t)seed; p.scale = (uint8_t)scale; p.octs = (uint8_t)octs;
        p.density = (uint8_t)(seed * 7 % 128); p.accent = (uint8_t)(seed * 11 % 128); p.slide = (uint8_t)(seed * 13 % 128);
        LogacidPattern a; LogacidStep r[LOGACID_STEPS];
        assert(logacid_generate(&a, &p, length));
        reference(r, length, &p, 0xbeefu ^ (seed * 0x9e3779b9u));
        for (unsigned i = 0; i < length; ++i) differences += memcmp(&a.steps[i], &r[i], sizeof r[i]) != 0;
        ++cases;
    }
    printf("reference: %u cases, %u step differences\n", cases, differences);
    assert(differences == 0);
}
static void deterministic_in_scale(void)
{
    for (unsigned seed = 0; seed < 128; seed += 5) for (unsigned scale = 0; scale < LOGACID_SCALES; ++scale)
    for (unsigned dir = 0; dir <= LOGACID_RND; ++dir) for (unsigned motif = 0; motif <= 32; motif += (motif ? 3 : 2))
    for (unsigned var = 0; var < 128; var += 31) for (unsigned length = 1; length <= 64; length += 9) {
        LogacidParams p = logacid_defaults;
        p.seed = (uint8_t)seed; p.scale = (uint8_t)scale; p.dir = (uint8_t)dir; p.motif = (uint8_t)motif; p.var = (uint8_t)var;
        LogacidPattern a, b;
        assert(logacid_generate(&a, &p, length));
        assert(logacid_generate(&b, &p, length));
        assert(!memcmp(&a, &b, sizeof a));
        unsigned notes = 0;
        for (unsigned i = 0; i < LOGACID_STEPS; ++i) {
            const LogacidStep *s = &a.steps[i];
            assert(s->kind <= LOGACID_SLIDE && s->degree < logacid_scale_length[scale] && s->octave < p.octs);
            if (i >= length) assert(s->kind == LOGACID_REST);
            if (s->kind != LOGACID_REST) ++notes;
            if (s->kind == LOGACID_SLIDE) assert(a.steps[(i + 1) % length].kind != LOGACID_REST);
            unsigned note = logacid_note(&p, s, 33);
            assert(note >= 33 && note <= 33 + 11 + 24);
        }
        assert(notes >= 1);
        /* A motif repeats along the track. */
        if (motif >= 2 && dir == LOGACID_FWD) for (unsigned i = motif; i < length; ++i) {
            const LogacidStep *s = &a.steps[i], *m = &a.steps[i - motif];
            if (s->kind != LOGACID_REST && m->kind != LOGACID_REST) assert(s->degree == m->degree && s->octave == m->octave);
        }
    }
    LogacidPattern a; LogacidParams p = logacid_defaults;
    assert(!logacid_generate(&a, &p, 0) && !logacid_generate(&a, &p, 65));
    p.motif = 1; assert(!logacid_generate(&a, &p, 16)); p.motif = 33; assert(!logacid_generate(&a, &p, 16));
    p = logacid_defaults; p.scale = 6; assert(!logacid_generate(&a, &p, 16));
    assert(logacid_next_seed(127) == 0 && logacid_next_seed(3) == 4);
}
static void knobs_change_it(void)
{
    LogacidPattern a, b; LogacidParams p = logacid_defaults;
    assert(logacid_generate(&a, &p, 16));
    p.density = 127; assert(logacid_generate(&b, &p, 16));
    for (unsigned i = 0; i < 16; ++i) assert(b.steps[i].kind != LOGACID_REST); /* every step plays at full density */
    p.density = 0; assert(logacid_generate(&b, &p, 16));
    unsigned notes = 0; for (unsigned i = 0; i < 16; ++i) notes += b.steps[i].kind != LOGACID_REST;
    assert(notes == 1); /* nothing but the guaranteed note */
    p = logacid_defaults; p.accent = 127; p.slide = 0; assert(logacid_generate(&b, &p, 16));
    for (unsigned i = 0; i < 16; ++i) assert(b.steps[i].kind == LOGACID_REST || b.steps[i].kind == LOGACID_ACCENT);
    p = logacid_defaults; p.seed = 2; assert(logacid_generate(&b, &p, 16)); assert(memcmp(&a, &b, sizeof a));
    p = logacid_defaults; p.dir = LOGACID_REV; assert(logacid_generate(&b, &p, 16));
    /* REV: the same pitches in the opposite order (kinds may change at the slide cleanup). */
    for (unsigned i = 0; i < 16; ++i) {
        const LogacidStep *s = &a.steps[i], *t = &b.steps[15 - i];
        assert((s->kind == LOGACID_REST) == (t->kind == LOGACID_REST));
        if (s->kind != LOGACID_REST) assert(s->degree == t->degree && s->octave == t->octave);
    }
    p = logacid_defaults; p.var = 40; assert(logacid_generate(&b, &p, 16)); assert(memcmp(&a, &b, sizeof a));
}
static void record(uint8_t *r) { memset(r, 0, LOGACID_TRACK_BYTES); memset(r + LOGACID_LOCKS, 255, 64 * 32); r[0x28] = 16; }
static unsigned on(const uint8_t *r, unsigned m, unsigned i) { return (r[m * 8 + 7 - i / 8] >> (i % 8)) & 1u; }
static void writes_the_record(void)
{
    static uint8_t r[LOGACID_TRACK_BYTES], mirror[LOGACID_TRACK_BYTES], before[LOGACID_TRACK_BYTES];
    uint8_t locked[LOGACID_STEPS]; LogacidPattern a; LogacidParams p = logacid_defaults;
    record(r); memcpy(mirror, r, sizeof r);
    assert(logacid_track_empty(r));
    /* Other locks and swing stay; a lock on a rest marks the step lock-only. */
    r[0x18] = 0xaa; r[LOGACID_LOCKS + 32 * 3 + 7] = 9; r[LOGACID_LOCKS + 32 * 60 + 5] = 4; r[LOGACID_LOCKS + 32 * 2 + 0] = 60;
    r[LOGACID_TIMING + 2 * 2] = 0x12; memcpy(mirror, r, sizeof r);
    assert(!logacid_track_empty(r));
    assert(logacid_generate(&a, &p, 32));
    unsigned trigs = logacid_write(r, mirror, &a, &p, 33, 118, 100, locked);
    assert(!memcmp(r, mirror, sizeof r));
    unsigned count = 0;
    for (unsigned i = 0; i < LOGACID_STEPS; ++i) {
        const LogacidStep *s = &a.steps[i]; const uint8_t *l = r + LOGACID_LOCKS + 32 * i;
        unsigned active = i < 32 && s->kind != LOGACID_REST;
        count += active;
        assert(on(r, 0, i) == active);
        if (i >= 32) { assert(!on(r, 0, i)); continue; }
        assert(l[0] == (active ? logacid_note(&p, s, 33) : 255));
        assert(l[1] == (active && s->kind == LOGACID_ACCENT ? 118 : 255));
        assert(l[2] == (active && s->kind == LOGACID_SLIDE ? 100 : 255));
        assert(!on(r, 1, i) && !on(r, 4, i));
        assert(r[LOGACID_TIMING + 2 * i] == 0 && r[LOGACID_TIMING + 2 * i + 1] == 0);
        unsigned any = active || (i == 3);
        assert(locked[i] == any && on(r, 2, i) == (!active && any));
    }
    assert(trigs == count && r[0x18] == 0xaa && r[LOGACID_LOCKS + 32 * 3 + 7] == 9 && r[LOGACID_LOCKS + 32 * 60 + 5] == 4 && locked[60] == 1);
    /* The same line again changes nothing; a new one changes only its steps. */
    memcpy(before, r, sizeof r);
    assert(logacid_write(r, mirror, &a, &p, 33, 118, 100, locked) == trigs && !memcmp(r, before, sizeof r));
    p.seed = 9; assert(logacid_generate(&a, &p, 32));
    logacid_write(r, NULL, &a, &p, 33, 118, 100, locked);
    for (unsigned i = 32; i < LOGACID_STEPS; ++i) assert(!memcmp(r + LOGACID_LOCKS + 32 * i, before + LOGACID_LOCKS + 32 * i, 32));
    /* Velocity and length clamp to MIDI's range. */
    logacid_write(r, NULL, &a, &p, 33, 200, 300, locked);
    for (unsigned i = 0; i < 32; ++i) { const uint8_t *l = r + LOGACID_LOCKS + 32 * i; assert(l[1] == 255 || l[1] == 127); assert(l[2] == 255 || l[2] == 127); }
}

static void audio_record(uint8_t *r) { memset(r, 0, LOGACID_AUDIO_TRACK_BYTES); memset(r + LOGACID_AUDIO_LOCKS, 255, 64 * 32); memset(r + 0x40, 0xaa, 8); r[0x50] = 16; r[0x51] = 1; }
static void writes_the_audio_record(void)
{
    static uint8_t r[LOGACID_AUDIO_TRACK_BYTES], mirror[LOGACID_AUDIO_TRACK_BYTES], before[LOGACID_AUDIO_TRACK_BYTES];
    uint8_t locked[LOGACID_STEPS]; LogacidPattern a; LogacidParams p = logacid_defaults;
    LogacidAudio au = {9, 16, 100, 8, 5, 1, 3};
    audio_record(r);
    assert(logacid_audio_empty(r));
    r[LOGACID_AUDIO_LOCKS + 32 * 3 + 7] = 9; /* a user's LFO lock on step 3 stays */
    r[LOGACID_AUDIO_LOCKS + 32 * 60 + 24] = 4; /* an FX2 lock past the length stays */
    memcpy(mirror, r, sizeof r);
    assert(!logacid_audio_empty(r));
    p.seed = 3; p.slide = 127; p.accent = 60; /* every note slides: the record is a chain of lock-only glides */
    assert(logacid_generate(&a, &p, 32));
    unsigned trigs = logacid_write_audio(r, mirror, &a, &p, &au, locked), count = 0, lock_only = 0, slides = 0;
    assert(!memcmp(r, mirror, sizeof r));
    for (unsigned i = 0; i < LOGACID_STEPS; ++i) {
        const LogacidStep *s = &a.steps[i]; const uint8_t *l = r + LOGACID_AUDIO_LOCKS + 32 * i;
        unsigned note = i < 32 && s->kind != LOGACID_REST, slid = i < 32 && a.steps[(i + 31) % 32].kind == LOGACID_SLIDE && note;
        unsigned trig = note && !slid, accent = note && s->kind == LOGACID_ACCENT;
        count += trig; lock_only += note && !trig; slides += on(r, 3, i);
        assert(on(r, 0, i) == trig && on(r, 3, i) == slid);
        if (i >= 32) { assert(!on(r, 0, i) && !on(r, 2, i)); continue; }
        assert(l[0] == (note ? logacid_ptch(&p, s, 9) : 255));
        if (note) { assert(l[0] >= 4 && l[0] <= 119 && (l[0] - 4) % 5 == 0); }
        assert((l[13] != 255) == trig);
        if (trig) { assert(l[13] >= 32 && l[13] <= 126); if (s->kind == LOGACID_SLIDE) assert(l[13] > 32); else assert(l[13] == 32); }
        assert(l[15] == (note && !accent ? 100 - 32 : 255));
        assert(l[21] == (accent ? 90 : 255));
        assert(!on(r, 1, i) && !on(r, 9, i));
        assert(r[LOGACID_AUDIO_TIMING + 2 * i] == 0 && r[LOGACID_AUDIO_TIMING + 2 * i + 1] == 0);
        unsigned any = note || i == 3;
        assert(locked[i] == any && on(r, 2, i) == (!trig && any));
    }
    assert(trigs == count && lock_only > 0 && slides == lock_only);
    assert(r[LOGACID_AUDIO_LOCKS + 32 * 3 + 7] == 9 && r[LOGACID_AUDIO_LOCKS + 32 * 60 + 24] == 4 && locked[60] == 1);
    for (unsigned k = 0x40; k < 0x48; ++k) assert(r[k] == 0xaa); /* swing untouched */
    /* No slides, no accents, AVEL and AFLT off: trigs with PTCH and HOLD alone. */
    memcpy(before, r, sizeof r);
    p.slide = 0; p.accent = 0; au.avel = 0; au.aflt = 0;
    assert(logacid_generate(&a, &p, 32));
    logacid_write_audio(r, NULL, &a, &p, &au, locked);
    for (unsigned i = 0; i < 32; ++i) {
        const uint8_t *l = r + LOGACID_AUDIO_LOCKS + 32 * i; unsigned note = a.steps[i].kind != LOGACID_REST;
        assert(on(r, 0, i) == note && !on(r, 3, i) && l[15] == 255 && l[21] == 255 && (l[13] == 32) == note);
    }
    for (unsigned i = 32; i < LOGACID_STEPS; ++i) assert(!memcmp(r + LOGACID_AUDIO_LOCKS + 32 * i, before + LOGACID_AUDIO_LOCKS + 32 * i, 32));
    /* Without the stock FILTER on FX1 no DEPTH lock is written. */
    au.aflt = 7; au.filter = 0; p.accent = 127;
    assert(logacid_generate(&a, &p, 16));
    logacid_write_audio(r, NULL, &a, &p, &au, locked);
    for (unsigned i = 0; i < 16; ++i) assert(r[LOGACID_AUDIO_LOCKS + 32 * i + 21] == 255);
    /* The same line again changes nothing. */
    memcpy(before, r, sizeof r);
    logacid_write_audio(r, NULL, &a, &p, &au, locked);
    assert(!memcmp(r, before, sizeof r));
}
static void pitch_fits_two_octaves(void)
{
    for (unsigned scale = 0; scale < LOGACID_SCALES; ++scale) for (unsigned root = 0; root < 12; ++root)
    for (unsigned degree = 0; degree < logacid_scale_length[scale]; ++degree) for (unsigned octave = 0; octave < 2; ++octave) {
        LogacidParams p = logacid_defaults; p.scale = (uint8_t)scale;
        LogacidStep s = {LOGACID_NOTE, (uint8_t)degree, (uint8_t)octave};
        unsigned v = logacid_ptch(&p, &s, root);
        assert(v >= 4 && v <= 119 && (v - 4) % 5 == 0);
        int semitone = ((int)v - 64) / 5;
        assert((semitone + 24 - (int)root) % 12 == logacid_scale_degrees[scale][degree] % 12);
    }
}
static void settings_round_trip(void)
{
    uint8_t packed[LOGACID_PACKED];
    for (unsigned n = 0; n < 4000; ++n) {
        LogacidAudioSettings s = logacid_audio_defaults, back;
        uint32_t x = 0x9e3779b9u * (n + 1u);
        s.p.density = (uint8_t)(x & 127); s.p.accent = (uint8_t)(x >> 7 & 127); s.p.slide = (uint8_t)(x >> 14 & 127); s.p.seed = (uint8_t)(x >> 21 & 127);
        s.p.var = (uint8_t)(n % 32); s.a.gate = (uint8_t)(n % 64); s.a.avel = (uint8_t)(n / 3 % 32); s.p.scale = (uint8_t)(n % 6);
        s.p.dir = (uint8_t)(n % 4); s.p.motif = (uint8_t)(n % 32 ? n % 32 + 1 : 0); s.a.root = (uint8_t)(n % 12); s.a.aflt = (uint8_t)(n % 8);
        logacid_pack(packed, &s);
        for (unsigned k = 0; k < LOGACID_PACKED; ++k) assert(packed[k] < 128); /* stock's validator may see them */
        logacid_unpack(&back, packed);
        assert(back.p.density == s.p.density && back.p.accent == s.p.accent && back.p.slide == s.p.slide && back.p.seed == s.p.seed);
        assert(back.p.var == s.p.var && back.a.gate == s.a.gate && back.a.avel == s.a.avel && back.p.scale == s.p.scale);
        assert(back.p.dir == s.p.dir && back.p.motif == s.p.motif && back.a.root == s.a.root && back.a.aflt == s.a.aflt);
        assert(back.p.octs == 2); /* two octaves on a sample track */
    }
    memset(packed, 0x7f, sizeof packed); /* a stray all-ones record still unpacks inside every range */
    LogacidAudioSettings s; logacid_unpack(&s, packed);
    assert(s.p.scale < LOGACID_SCALES && s.a.root < 12 && s.p.motif <= 32 && s.p.dir <= 3);
}
int main(void)
{
    same_as_reference();
    deterministic_in_scale();
    knobs_change_it();
    writes_the_record();
    writes_the_audio_record();
    pitch_fits_two_octaves();
    settings_round_trip();
    puts("[PASS] logacid engine");
    return 0;
}
