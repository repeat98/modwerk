/* SPDX-License-Identifier: GPL-3.0-or-later
 * Firmware-free tests of the CALL & RESPONSE engine (test_engine.py builds and runs them under the sanitizers). */
#include "engine.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>

static unsigned layered_mode(unsigned phrs) { return phrs == CR_LAYER; }

static int in_scale(unsigned scale, int semis, int trns)
{
    int pc = ((semis - trns) % 12 + 24) % 12;
    for (unsigned k = 0; k < cr_scale_length[scale]; ++k) if (cr_scale_semis[scale][k] == pc) return 1;
    return 0;
}
static CrParams params(unsigned n)
{
    CrParams p = cr_defaults;
    uint32_t x = 0x9e3779b9u * (n + 7u);
    x ^= x >> 15; x *= 0x2c1b3c6du; x ^= x >> 12;
    p.motif = (uint8_t)(n % CR_MOTIFS); p.dens = (uint8_t)(x & 31); p.rept = (uint8_t)(x >> 7 & 31);
    p.scale = (uint8_t)(x >> 14 & 7); p.phrs = (uint8_t)(n / 16 % CR_MODES); p.seed = (uint8_t)(x >> 17 & 127);
    p.answ = (uint8_t)(n % CR_ANSWERS); p.tght = (uint8_t)(x >> 24 & 31); p.end = (uint8_t)(n / 3 % CR_ENDINGS);
    p.mut = (uint8_t)(n % 5 ? 0 : x >> 9 & 31); p.var = (uint8_t)(n % 7 ? 0 : x >> 3 & 31); p.trns = (uint8_t)(n % 25);
    return p;
}

/* Every line is deterministic, sounds only in its slots and its scale, and ends each call on a sounding step. A C+R
 * track is exactly its call track's calls and its answer track's responses (same settings): the answer track rebuilds
 * the call the call track plays. */
static void pairs_are_well_formed(void)
{
    unsigned lines = 0, notes = 0, accents = 0, rests = 0;
    for (unsigned n = 0; n < 3000; ++n) for (unsigned length = 1; length <= 64; length += 7) {
        CrParams call = params(n), answer = call;
        CrLine a, b, c, d, e;
        answer.role = CR_ANSWER;
        call.role = CR_CALL;
        assert(cr_generate(&a, &call, NULL, length, CR_CALLS) && cr_generate(&b, &call, NULL, length, CR_CALLS) && !memcmp(&a, &b, sizeof a));
        assert(cr_generate(&c, &call, &answer, length, CR_RESPONSES) && cr_generate(&d, &call, &answer, length, CR_RESPONSES) && !memcmp(&c, &d, sizeof c));
        assert(cr_generate(&e, &call, &call, length, CR_CALLS | CR_RESPONSES));
        assert(!cr_generate(&d, &call, NULL, length, CR_RESPONSES));
        lines += 3;
        char pair[4], self[4];
        unsigned steps, solo, np = cr_layout(call.phrs, length, 0, pair, &steps), ns = cr_layout(call.phrs, length, 1, self, &solo);
        for (unsigned s = 0; s < 64; ++s) {
            const CrStep *x = &a.steps[s], *y = &c.steps[s], *z = &e.steps[s];
            unsigned layered = call.phrs == CR_LAYER, k = layered ? 0 : steps ? s / steps : 9, ks = solo ? s / solo : 9;
            unsigned call_slot = layered ? s < steps : k < np && pair[k] == 'C';
            unsigned answer_slot = layered ? s < steps : k < np && pair[k] == 'R';
            if (!call_slot) assert(!x->trig);
            if (!answer_slot) assert(!y->trig);
            if (x->trig) { assert(x->semis >= -12 && x->semis <= 12 && in_scale(call.scale, x->semis, 0)); ++notes; accents += x->accent; }
            else { assert(!x->accent && !x->semis); rests += call_slot; }
            if (y->trig) assert(y->semis >= -12 && y->semis <= 12 && in_scale(call.scale, y->semis, (int)answer.trns - 12));
            else assert(!y->accent && !y->semis);
            if (!layered) { /* one track: the call track's calls where it calls, the answer track's responses where it answers */
                if (ks < ns) assert(!memcmp(z, self[ks] == 'C' ? x : y, sizeof *z));
                else assert(!z->trig);
            } else if (s >= solo * 2) assert(!z->trig);
        }
        if (np && steps) for (unsigned k = 0; k < np; ++k)
            if (pair[k] == 'C' && (!k || !call.var) && !layered_mode(call.phrs)) assert(a.steps[k * steps + steps - 1].trig); /* applyEnding */
        if (np && steps && !call.var) /* without VAR every call is the first */
            for (unsigned k = 1; k < np; ++k) if (pair[k] == 'C' && !layered_mode(call.phrs))
                assert(!memcmp(&a.steps[0], &a.steps[k * steps], steps * sizeof a.steps[0]));
        CrPhrase p, q;
        if (np && steps) {
            assert(cr_call(&p, &call, steps));
            for (unsigned s = 0; s < steps; ++s) {
                assert(p.n[s].active == a.steps[s].trig);
                if (p.n[s].active) assert(cr_semis(call.scale, p.n[s].degree, 0) == a.steps[s].semis);
                assert(p.n[s].degree >= 0 && p.n[s].degree <= 10);
            }
            assert(cr_response(&q, &p, &call, &answer, steps));
            for (unsigned s = 0; s < steps; ++s) assert(q.n[s].degree >= 0 && q.n[s].degree <= 10 && (q.n[s].active || !q.n[s].accent));
        }
    }
    assert(notes && accents && rests);
    printf("pairs: %u lines, %u call notes, %u accented, %u rests\n", lines, notes, accents, rests);
}
static void layouts(void)
{
    char k[4]; unsigned steps;
    assert(cr_layout(CR_CCCR, 64, 1, k, &steps) == 4 && steps == 16 && !memcmp(k, "CCCR", 4));
    assert(cr_layout(CR_CCRR, 32, 0, k, &steps) == 4 && steps == 8 && !memcmp(k, "CCRR", 4));
    assert(cr_layout(CR_CRCR, 16, 1, k, &steps) == 4 && steps == 4 && !memcmp(k, "CRCR", 4));
    assert(cr_layout(CR_SPLIT, 16, 1, k, &steps) == 2 && steps == 8 && !memcmp(k, "CR", 2));
    assert(cr_layout(CR_LAYER, 16, 0, k, &steps) == 2 && steps == 16);
    assert(cr_layout(CR_LAYER, 16, 1, k, &steps) == 2 && steps == 8 && !memcmp(k, "CR", 2)); /* one track: C|R */
    assert(cr_layout(CR_CCCR, 3, 1, k, &steps) == 2 && steps == 1 && !memcmp(k, "CR", 2));   /* below four: C|R */
    assert(cr_layout(CR_SPLIT, 1, 1, k, &steps) == 0);
}
/* VAR varies the second and third calls of CCCR and leaves the first alone. */
static void call_variation(void)
{
    unsigned changed = 0;
    for (unsigned n = 0; n < 300; ++n) {
        CrParams c = params(n);
        CrLine x, y;
        c.phrs = CR_CCCR; c.var = 0;
        assert(cr_generate(&x, &c, &c, 64, CR_CALLS | CR_RESPONSES));
        c.var = 31;
        assert(cr_generate(&y, &c, &c, 64, CR_CALLS | CR_RESPONSES));
        assert(!memcmp(&x.steps[0], &y.steps[0], 16 * sizeof x.steps[0]) && !memcmp(&x.steps[48], &y.steps[48], 16 * sizeof x.steps[0]));
        changed += memcmp(&x.steps[16], &y.steps[16], 16 * sizeof x.steps[0]) != 0 && memcmp(&x.steps[32], &y.steps[32], 16 * sizeof x.steps[0]) != 0;
    }
    assert(changed > 280);
    printf("variation: %u of 300 CCCR repeats varied\n", changed);
}

/* Each strategy answers differently: over many calls no two strategies give the same responses everywhere, and ROOT,
 * 5TH and MORE close where the generator closes. */
static void strategies_and_endings(void)
{
    static CrPhrase call, resp[CR_ANSWERS];
    unsigned differ[CR_ANSWERS][CR_ANSWERS];
    memset(differ, 0, sizeof differ);
    for (unsigned n = 0; n < 200; ++n) {
        CrParams c = params(n), a = cr_defaults;
        c.phrs = CR_SPLIT; c.role = CR_CALL; a.role = CR_ANSWER;
        assert(cr_call(&call, &c, 16));
        for (unsigned k = 0; k < CR_ANSWERS; ++k) {
            a.answ = (uint8_t)k; a.seed = (uint8_t)n; a.tght = 0; a.end = 9; /* SAME: the strategy's own ending */
            assert(cr_response(&resp[k], &call, &c, &a, 16));
        }
        for (unsigned i = 0; i < CR_ANSWERS; ++i) for (unsigned j = 0; j < CR_ANSWERS; ++j)
            for (unsigned s = 0; s < 16; ++s)
                if (resp[i].n[s].active != resp[j].n[s].active || (resp[i].n[s].active && resp[i].n[s].degree != resp[j].n[s].degree)) { differ[i][j] = 1; break; }
        /* HALF leaves the first half silent; ECHO plays the call two steps late; HOOK opens with the call */
        for (unsigned s = 0; s < 8; ++s) assert(!resp[22].n[s].active);
        for (unsigned s = 0; s < 15; ++s) assert(resp[5].n[s].active == call.n[(s + 14) % 16].active);
        for (unsigned s = 0; s < 8; ++s) assert(resp[29].n[s].active == call.n[s].active && (!call.n[s].active || resp[29].n[s].degree == call.n[s].degree));
        CrParams e = cr_defaults;
        e.end = 0; assert(cr_response(&resp[0], &call, &c, &e, 16)); assert(resp[0].n[15].active && resp[0].n[15].degree == 0);
        e.end = 1; assert(cr_response(&resp[0], &call, &c, &e, 16)); assert(resp[0].n[15].degree == (cr_scale_length[c.scale] > 4 ? 4 : cr_scale_length[c.scale] - 1));
        e.end = 8; assert(cr_response(&resp[0], &call, &c, &e, 16));
        assert(resp[0].n[15].degree == 0 || resp[0].n[15].degree == 2 || resp[0].n[15].degree == 4);
    }
    for (unsigned i = 0; i < CR_ANSWERS; ++i) for (unsigned j = i + 1; j < CR_ANSWERS; ++j) assert(differ[i][j]);
    /* TGHT pulls the response toward the call: at 127 the degrees stay closer to the call's than at 0 */
    unsigned far0 = 0, far127 = 0;
    for (unsigned n = 0; n < 400; ++n) {
        CrParams c = params(n), a = cr_defaults;
        assert(cr_call(&call, &c, 16));
        a.answ = 7; a.seed = (uint8_t)n; a.role = CR_ANSWER; /* UP */
        for (unsigned t = 0; t < 2; ++t) {
            a.tght = t ? 31 : 0;
            assert(cr_response(&resp[0], &call, &c, &a, 16));
            for (unsigned s = 0; s < 15; ++s)
                if (resp[0].n[s].active && call.n[s].active) {
                    int d = resp[0].n[s].degree - call.n[s].degree;
                    *(t ? &far127 : &far0) += (unsigned)(d < 0 ? -d : d);
                }
        }
    }
    assert(far127 < far0);
    printf("strategies: %u answers pairwise distinct; TGHT distance %u -> %u\n", CR_ANSWERS, far0, far127);
}

/* MUT changes the response, and where there are two only the second one. */
static void mutation(void)
{
    unsigned changed = 0;
    for (unsigned n = 0; n < 300; ++n) {
        CrParams c = params(n), a = params(n + 1000u);
        CrLine x, y;
        c.phrs = CR_CRCR; a.mut = 0;
        assert(cr_generate(&x, &c, &a, 32, CR_RESPONSES));
        a.mut = 31;
        assert(cr_generate(&y, &c, &a, 32, CR_RESPONSES));
        assert(!memcmp(&x.steps[0], &y.steps[0], 24 * sizeof x.steps[0])); /* call slots and the first response */
        changed += memcmp(&x.steps[24], &y.steps[24], 8 * sizeof x.steps[0]) != 0;
        c.phrs = CR_CCCR; a.mut = 0; /* one response: it is the one mutated */
        assert(cr_generate(&x, &c, &a, 32, CR_RESPONSES));
        a.mut = 31;
        assert(cr_generate(&y, &c, &a, 32, CR_RESPONSES));
        assert(!memcmp(&x.steps[0], &y.steps[0], 24 * sizeof x.steps[0]));
    }
    assert(changed > 250);
    printf("mutation: %u of 300 second responses changed\n", changed);
}

static void semis_fold(void)
{
    for (unsigned s = 0; s < CR_SCALES; ++s) for (int d = 0; d <= 10; ++d) for (int t = -12; t <= 12; ++t) {
        int v = cr_semis(s, d, t);
        assert(v >= -12 && v <= 12 && in_scale(s, v, t));
    }
    assert(cr_semis(0, 0, 0) == 0 && cr_semis(0, 5, 0) == 12 && cr_semis(0, 6, 0) == 3 && cr_semis(6, 4, -12) == -5);
}

static unsigned on(const uint8_t *r, unsigned mask, unsigned step) { return (r[mask * 8 + 7 - step / 8] >> (step % 8)) & 1u; }
static void writes_the_record(void)
{
    static uint8_t r[CR_TRACK_BYTES], mirror[CR_TRACK_BYTES], before[CR_TRACK_BYTES];
    uint8_t locked[64];
    CrParams c = cr_defaults;
    CrLine a;
    memset(r, 0, sizeof r);
    memset(r + CR_LOCKS, CR_NO_LOCK, 64 * 32);
    assert(cr_track_empty(r));
    r[0x50] = 32;
    r[CR_LOCKS + 32 * 3 + 12] = 40;   /* a user's AMP ATK lock on a step: kept, the step lock-only if no trig */
    r[CR_LOCKS + 32 * 40 + 0] = 70;   /* a PTCH lock past the length: kept */
    for (unsigned k = 0x40; k < 0x48; ++k) r[k] = 0xaa; /* swing */
    assert(!cr_track_empty(r));
    assert(cr_generate(&a, &c, NULL, 32, CR_CALLS));
    unsigned trigs = cr_write(r, mirror, &a, 100, locked), count = 0;
    for (unsigned i = 0; i < 64; ++i) {
        const CrStep *s = &a.steps[i]; const uint8_t *l = r + CR_LOCKS + 32 * i;
        if (i >= 32) { assert(!on(r, 0, i)); continue; }
        count += s->trig;
        assert(on(r, 0, i) == s->trig);
        assert(l[0] == (s->trig ? 64 + 5 * s->semis : 255));
        assert(l[15] == (s->trig && s->accent ? 118 : 255));
        assert(l[12] == (i == 3 ? 40 : 255));
        assert(on(r, 2, i) == (!s->trig && i == 3));
        assert(locked[i] == (s->trig || i == 3));
    }
    assert(trigs == count && trigs && r[CR_LOCKS + 32 * 40] == 70 && locked[40]);
    for (unsigned k = 0x40; k < 0x48; ++k) assert(r[k] == 0xaa);
    memcpy(before, r, sizeof r);
    cr_write(r, NULL, &a, 100, locked);
    assert(!memcmp(r, before, sizeof r));
    cr_write(r, NULL, &a, 120, locked); /* an accent never passes 127 */
    for (unsigned i = 0; i < 32; ++i) assert(r[CR_LOCKS + 32 * i + 15] == 255 || r[CR_LOCKS + 32 * i + 15] == 127);
}
static void settings_round_trip(void)
{
    uint8_t packed[CR_PACKED];
    for (unsigned n = 0; n < 4000; ++n) {
        CrParams p = params(n), back;
        p.role = (uint8_t)(n % 10);
        cr_pack(packed, &p);
        for (unsigned k = 0; k < CR_PACKED; ++k) assert(packed[k] < 128);
        cr_unpack(&back, packed);
        assert(!memcmp(&p, &back, sizeof p));
    }
    memset(packed, 0x7f, sizeof packed);
    CrParams p; cr_unpack(&p, packed);
    assert(p.role <= 9 && p.phrs < CR_MODES && p.answ < CR_ANSWERS && p.end < CR_ENDINGS && p.trns <= 24 && p.scale < CR_SCALES && p.motif < CR_MOTIFS);
    CrLine line; assert(cr_generate(&line, &p, &p, 64, CR_CALLS | CR_RESPONSES));
}
int main(void)
{
    layouts();
    pairs_are_well_formed();
    call_variation();
    strategies_and_endings();
    mutation();
    semis_fold();
    writes_the_record();
    settings_round_trip();
    puts("[PASS] callresp engine");
    return 0;
}
