/* SPDX-License-Identifier: GPL-3.0-or-later
 * Firmware-free tests of the TB-3PO engine (test_engine.py builds and runs them under the sanitizers). */
#include "engine.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>

/* tb3po.c's generate_pattern, as written (floats, GPL-3.0, djphazer / Charles Vestal), for one motif of n steps at
 * FWD with no mutation: the integer engine must draw the same line from the same seed word. */
static uint32_t ref_rng;
static uint32_t ref_u32(void) { uint32_t x = ref_rng; if (x == 0) x = 1; x ^= x << 13; x ^= x >> 17; x ^= x << 5; return ref_rng = x; }
static float ref_f(void) { return (float)(ref_u32() & 0xFFFFFF) / (float)0x1000000; }
static void reference(Tb3poStep *m, unsigned n, const Tb3poParams *p, uint32_t seed)
{
    float density = p->density >= 127 ? 1.0f : (float)p->density / 127.0f;
    float accent = p->accent >= 127 ? 1.0f : (float)p->accent / 127.0f, slide = p->slide >= 127 ? 1.0f : (float)p->slide / 127.0f;
    int len = tb3po_scale_length[p->scale];
    ref_rng = seed ? seed : 1;
    for (unsigned i = 0; i < n; ++i) {
        m[i].kind = TB3PO_REST; m[i].degree = 0; m[i].octave = 0;
        if (ref_f() > density) continue;
        int degree;
        if (i % 4 == 0 && ref_f() < 0.35f) degree = 0;
        else { degree = (int)(ref_f() * (float)len); if (degree >= len) degree = len - 1; }
        m[i].degree = (uint8_t)degree;
        int oct = (int)(ref_f() * (float)p->octs); if (oct >= p->octs) oct = p->octs - 1;
        m[i].octave = (uint8_t)oct;
        int kind = TB3PO_NOTE;
        if (ref_f() < accent) kind = TB3PO_ACCENT;
        if (ref_f() < slide) kind = TB3PO_SLIDE;
        m[i].kind = (uint8_t)kind;
    }
    for (unsigned i = 0; i < n; ++i) { unsigned nxt = (i + 1) % n; if (m[i].kind == TB3PO_SLIDE && m[nxt].kind == TB3PO_REST) m[i].kind = TB3PO_NOTE; }
    int any = 0;
    for (unsigned i = 0; i < n; ++i) if (m[i].kind != TB3PO_REST) any = 1;
    if (!any) { m[0].kind = TB3PO_NOTE; m[0].degree = 0; m[0].octave = 0; }
}

static void same_as_reference(void)
{
    unsigned cases = 0, differences = 0;
    for (unsigned seed = 0; seed < 128; ++seed) for (unsigned scale = 0; scale < TB3PO_SCALES; ++scale)
    for (unsigned octs = 1; octs <= 3; ++octs) for (unsigned length = 1; length <= 64; length += 3) {
        Tb3poParams p = tb3po_defaults;
        p.seed = (uint8_t)seed; p.scale = (uint8_t)scale; p.octs = (uint8_t)octs;
        p.density = (uint8_t)(seed * 7 % 128); p.accent = (uint8_t)(seed * 11 % 128); p.slide = (uint8_t)(seed * 13 % 128);
        Tb3poPattern a; Tb3poStep r[TB3PO_STEPS];
        assert(tb3po_generate(&a, &p, length));
        reference(r, length, &p, 0xbeefu ^ (seed * 0x9e3779b9u));
        for (unsigned i = 0; i < length; ++i) differences += memcmp(&a.steps[i], &r[i], sizeof r[i]) != 0;
        ++cases;
    }
    printf("reference: %u cases, %u step differences\n", cases, differences);
    assert(differences == 0);
}
static void deterministic_in_scale(void)
{
    for (unsigned seed = 0; seed < 128; seed += 5) for (unsigned scale = 0; scale < TB3PO_SCALES; ++scale)
    for (unsigned dir = 0; dir <= TB3PO_RND; ++dir) for (unsigned motif = 0; motif <= 32; motif += (motif ? 3 : 2))
    for (unsigned var = 0; var < 128; var += 31) for (unsigned length = 1; length <= 64; length += 9) {
        Tb3poParams p = tb3po_defaults;
        p.seed = (uint8_t)seed; p.scale = (uint8_t)scale; p.dir = (uint8_t)dir; p.motif = (uint8_t)motif; p.var = (uint8_t)var;
        Tb3poPattern a, b;
        assert(tb3po_generate(&a, &p, length));
        assert(tb3po_generate(&b, &p, length));
        assert(!memcmp(&a, &b, sizeof a));
        unsigned notes = 0;
        for (unsigned i = 0; i < TB3PO_STEPS; ++i) {
            const Tb3poStep *s = &a.steps[i];
            assert(s->kind <= TB3PO_SLIDE && s->degree < tb3po_scale_length[scale] && s->octave < p.octs);
            if (i >= length) assert(s->kind == TB3PO_REST);
            if (s->kind != TB3PO_REST) ++notes;
            if (s->kind == TB3PO_SLIDE) assert(a.steps[(i + 1) % length].kind != TB3PO_REST);
            unsigned note = tb3po_note(&p, s, 33);
            assert(note >= 33 && note <= 33 + 11 + 24);
        }
        assert(notes >= 1);
        /* A motif repeats along the track. */
        if (motif >= 2 && dir == TB3PO_FWD) for (unsigned i = motif; i < length; ++i) {
            const Tb3poStep *s = &a.steps[i], *m = &a.steps[i - motif];
            if (s->kind != TB3PO_REST && m->kind != TB3PO_REST) assert(s->degree == m->degree && s->octave == m->octave);
        }
    }
    Tb3poPattern a; Tb3poParams p = tb3po_defaults;
    assert(!tb3po_generate(&a, &p, 0) && !tb3po_generate(&a, &p, 65));
    p.motif = 1; assert(!tb3po_generate(&a, &p, 16)); p.motif = 33; assert(!tb3po_generate(&a, &p, 16));
    p = tb3po_defaults; p.scale = 6; assert(!tb3po_generate(&a, &p, 16));
    assert(tb3po_next_seed(127) == 0 && tb3po_next_seed(3) == 4);
}
static void knobs_change_it(void)
{
    Tb3poPattern a, b; Tb3poParams p = tb3po_defaults;
    assert(tb3po_generate(&a, &p, 16));
    p.density = 127; assert(tb3po_generate(&b, &p, 16));
    for (unsigned i = 0; i < 16; ++i) assert(b.steps[i].kind != TB3PO_REST); /* every step plays at full density */
    p.density = 0; assert(tb3po_generate(&b, &p, 16));
    unsigned notes = 0; for (unsigned i = 0; i < 16; ++i) notes += b.steps[i].kind != TB3PO_REST;
    assert(notes == 1); /* nothing but the guaranteed note */
    p = tb3po_defaults; p.accent = 127; p.slide = 0; assert(tb3po_generate(&b, &p, 16));
    for (unsigned i = 0; i < 16; ++i) assert(b.steps[i].kind == TB3PO_REST || b.steps[i].kind == TB3PO_ACCENT);
    p = tb3po_defaults; p.seed = 2; assert(tb3po_generate(&b, &p, 16)); assert(memcmp(&a, &b, sizeof a));
    p = tb3po_defaults; p.dir = TB3PO_REV; assert(tb3po_generate(&b, &p, 16));
    /* REV: the same pitches in the opposite order (kinds may change at the slide cleanup). */
    for (unsigned i = 0; i < 16; ++i) {
        const Tb3poStep *s = &a.steps[i], *t = &b.steps[15 - i];
        assert((s->kind == TB3PO_REST) == (t->kind == TB3PO_REST));
        if (s->kind != TB3PO_REST) assert(s->degree == t->degree && s->octave == t->octave);
    }
    p = tb3po_defaults; p.var = 40; assert(tb3po_generate(&b, &p, 16)); assert(memcmp(&a, &b, sizeof a));
}
static void record(uint8_t *r) { memset(r, 0, TB3PO_TRACK_BYTES); memset(r + TB3PO_LOCKS, 255, 64 * 32); r[0x28] = 16; }
static unsigned on(const uint8_t *r, unsigned m, unsigned i) { return (r[m * 8 + 7 - i / 8] >> (i % 8)) & 1u; }
static void writes_the_record(void)
{
    static uint8_t r[TB3PO_TRACK_BYTES], mirror[TB3PO_TRACK_BYTES], before[TB3PO_TRACK_BYTES];
    uint8_t locked[TB3PO_STEPS]; Tb3poPattern a; Tb3poParams p = tb3po_defaults;
    record(r); memcpy(mirror, r, sizeof r);
    assert(tb3po_track_empty(r));
    /* Other locks and swing stay; a lock on a rest marks the step lock-only. */
    r[0x18] = 0xaa; r[TB3PO_LOCKS + 32 * 3 + 7] = 9; r[TB3PO_LOCKS + 32 * 60 + 5] = 4; r[TB3PO_LOCKS + 32 * 2 + 0] = 60;
    r[TB3PO_TIMING + 2 * 2] = 0x12; memcpy(mirror, r, sizeof r);
    assert(!tb3po_track_empty(r));
    assert(tb3po_generate(&a, &p, 32));
    unsigned trigs = tb3po_write(r, mirror, &a, &p, 33, 118, 100, locked);
    assert(!memcmp(r, mirror, sizeof r));
    unsigned count = 0;
    for (unsigned i = 0; i < TB3PO_STEPS; ++i) {
        const Tb3poStep *s = &a.steps[i]; const uint8_t *l = r + TB3PO_LOCKS + 32 * i;
        unsigned active = i < 32 && s->kind != TB3PO_REST;
        count += active;
        assert(on(r, 0, i) == active);
        if (i >= 32) { assert(!on(r, 0, i)); continue; }
        assert(l[0] == (active ? tb3po_note(&p, s, 33) : 255));
        assert(l[1] == (active && s->kind == TB3PO_ACCENT ? 118 : 255));
        assert(l[2] == (active && s->kind == TB3PO_SLIDE ? 100 : 255));
        assert(!on(r, 1, i) && !on(r, 4, i));
        assert(r[TB3PO_TIMING + 2 * i] == 0 && r[TB3PO_TIMING + 2 * i + 1] == 0);
        unsigned any = active || (i == 3);
        assert(locked[i] == any && on(r, 2, i) == (!active && any));
    }
    assert(trigs == count && r[0x18] == 0xaa && r[TB3PO_LOCKS + 32 * 3 + 7] == 9 && r[TB3PO_LOCKS + 32 * 60 + 5] == 4 && locked[60] == 1);
    /* The same line again changes nothing; a new one changes only its steps. */
    memcpy(before, r, sizeof r);
    assert(tb3po_write(r, mirror, &a, &p, 33, 118, 100, locked) == trigs && !memcmp(r, before, sizeof r));
    p.seed = 9; assert(tb3po_generate(&a, &p, 32));
    tb3po_write(r, NULL, &a, &p, 33, 118, 100, locked);
    for (unsigned i = 32; i < TB3PO_STEPS; ++i) assert(!memcmp(r + TB3PO_LOCKS + 32 * i, before + TB3PO_LOCKS + 32 * i, 32));
    /* Velocity and length clamp to MIDI's range. */
    tb3po_write(r, NULL, &a, &p, 33, 200, 300, locked);
    for (unsigned i = 0; i < 32; ++i) { const uint8_t *l = r + TB3PO_LOCKS + 32 * i; assert(l[1] == 255 || l[1] == 127); assert(l[2] == 255 || l[2] == 127); }
}
int main(void)
{
    same_as_reference();
    deterministic_in_scale();
    knobs_change_it();
    writes_the_record();
    puts("[PASS] tb3po engine");
    return 0;
}
