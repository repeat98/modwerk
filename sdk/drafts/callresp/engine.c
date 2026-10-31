/* SPDX-License-Identifier: GPL-3.0-or-later
 * CALL & RESPONSE engine. The phrase rules follow Nordl3's Call / Response Generator (MIT, Copyright (c) 2026 Nordl3,
 * github.com/Nordl3/Call-Response-Generator dbd1f0c35ecd37dd4d64747808fff7ea3629c1b6, index.html): motifTemplate,
 * notePool ("Pool with spice notes"), buildCall, buildResponse with 31 of its answer strategies, applyEnding and
 * mutatePhrase ("Response only"), with the generator's neutral style profile, "Medium register" and "Motif accents"
 * where CALL & RESPONSE has no knob. The generator draws from Math.random(); this draws from seeded xorshifts (one for
 * the call, one for the response), so a pair reproduces from its settings on both tracks. Its per-cent and fractional
 * chances are kept in thousandths. Gate, tie and slide are not ported: the track's own AMP envelope shapes the notes.
 * Integers only. Firmware-free. */
#include "engine.h"

/* MOTF ACID, DENS 16 (the generator's Medium 0.52), REPT 23 (Repetitive 0.72), SCAL MINP, PHRS C|R, ROLE C+R, VAR 0;
 * ANSW SR+R ("Same rhythm + resolve"), TGHT 16 (its neutral 0.5), END MORE ("Response more resolved than call"),
 * MUT 0, TRNS 0. */
const CrParams cr_defaults = {0, 16, 23, 0, CR_SPLIT, 1, CR_SELF, 0, 0, 16, CR_END_MORE, 0, 12};
const char *const cr_motif_names[CR_MOTIFS] = {"ACID", "PULS", "OFFB", "SYNC", "SPRS", "ROLL", "STAB", "RPT",
                                               "RISE", "FALL", "R>D", "D>R", "LEAP", "PIVT", "HOOK", "ARP"};
const char *const cr_scale_names[CR_SCALES] = {"MINP", "MAJP", "MINR", "DORI", "PHRY", "HMIN", "MAJR", "BLUS"};
const char *const cr_mode_names[CR_MODES] = {"C|R", "CRCR", "CCCR", "CCRR", "LAYR"};
const char *const cr_answer_names[CR_ANSWERS] = {
    "SR+R", "SR+C", "SIMP", "EXTD", "TRNC", "ECHO", "DLAY", "UP", "DOWN", "INVR", "RHY=", "NOT=", "TRN+", "TRN-", ">RT",
    ">5TH", ">LOW", "HARD", "RPBR", "SPRS", "BUSY", "ACNT", "HALF", "FRAG", "TAIL", "OPPO", "DARK", "BRIT", "Q>C", "HOOK",
    "V>I"};
const char *const cr_ending_names[CR_ENDINGS] = {"ROOT", "5TH", "RISE", "FALL", "FADE", "STRG", "WEAK", "AMBG", "MORE",
                                                 "SAME", "TENS"};
const uint8_t cr_scale_length[CR_SCALES] = {5, 5, 7, 7, 7, 7, 7, 6};
const uint8_t cr_scale_semis[CR_SCALES][7] = {
    {0, 3, 5, 7, 10}, {0, 2, 4, 7, 9}, {0, 2, 3, 5, 7, 8, 10}, {0, 2, 3, 5, 7, 9, 10},
    {0, 1, 3, 5, 7, 8, 10}, {0, 2, 3, 5, 7, 8, 11}, {0, 2, 4, 5, 7, 9, 11}, {0, 3, 5, 6, 7, 10},
};
enum { A_SR_RESOLVE, A_SR_CONTOUR, A_SIMPLIFY, A_EXTEND, A_TRUNCATE, A_ECHO, A_DELAY, A_UP, A_DOWN, A_INVERT, A_RHYTHM,
       A_NOTES, A_TRANS_UP, A_TRANS_DOWN, A_ROOT, A_FIFTH, A_LOWER, A_HARDER, A_REPEAT_BREAK, A_SPARSER, A_BUSIER,
       A_ACCENT, A_HALF, A_FRAGMENT, A_TAIL, A_OPPOSITE, A_DARKER, A_BRIGHTER, A_QUESTION, A_HOOK, A_CADENCE };
enum { E_ROOT, E_FIFTH, E_RISE, E_FALL, E_FADE, E_STRONG, E_WEAK, E_AMBIGUOUS, E_MORE, E_SAME, E_TENSE };

/* The generator's neutral style profile, in thousandths. */
#define LEAP 180u
#define REST_BIAS 180u
#define MOTIF_VAR 180u
#define ROOT_BIAS 220u
#define STABLE_END 700u
#define MOTIF_ACCENT 80u   /* "Motif accents": the motif's first step, else 0.08 */
#define TOP 8              /* "Medium register": degrees 0-8 in the call */
#define CEIL 10            /* the generator's clamp(.., 0, 10) */

typedef struct { uint32_t s; } Rng;
static uint32_t next(Rng *r) { uint32_t x = r->s ? r->s : 1u; x ^= x << 13; x ^= x >> 17; x ^= x << 5; return r->s = x; }
static unsigned below(Rng *r, unsigned n) { return n ? (next(r) >> 8) % n : 0u; }
static int chance(Rng *r, unsigned thousandths) { return thousandths >= 1000u || below(r, 1000u) < thousandths; }
static int pick(Rng *r, const int8_t *values, unsigned n) { return values[below(r, n)]; }
#define PICK(r, a) pick((r), (a), sizeof(a) / sizeof((a)[0]))
/* `values` filtered to those below `limit` (the generator's .filter(x => x < c.scale.length)), `fallback` if none. */
static int pick_below(Rng *r, const int8_t *values, unsigned n, int limit, int fallback)
{
    int8_t kept[8];
    unsigned k = 0;
    for (unsigned i = 0; i < n && k < 8; ++i) if (values[i] < limit) kept[k++] = values[i];
    return k ? kept[below(r, k)] : fallback;
}
#define PICK_BELOW(r, a, limit, fallback) pick_below((r), (a), sizeof(a) / sizeof((a)[0]), (limit), (fallback))
static int clampi(int v, int lo, int hi) { return v < lo ? lo : v > hi ? hi : v; }
static int floordiv(int a, int b) { return a >= 0 ? a / b : -((-a + b - 1) / b); }
static unsigned knob(unsigned v) { return v >= CR_KNOB ? 1000u : v * 1000u / CR_KNOB; } /* 0-31 as thousandths */

static const int8_t PM1[] = {-1, 0, 1}, PM1_ZERO[] = {-1, 0, 0, 1}, START[] = {0, 0, 1, -1}, ROOTISH[] = {0, 0, 1, 2},
                    LEAPS[] = {-3, 3}, SPREAD[] = {-2, -1, 0, 1, 2}, SPREAD_WIDE[] = {-3, -2, -1, 0, 1, 2, 3},
                    ROOT24[] = {0, 0, 2, 4}, STRONG[] = {0, 0, 0, 2, 4}, WEAK[] = {1, 3, 5}, AMBIG[] = {1, 2, 5},
                    MUTATE[] = {-2, -1, 1, 2};

/* "Pool with spice notes": four degrees of the scale's first seven, and its middle one. */
typedef struct { int8_t d[8]; unsigned n; } Pool;
static void spice_pool(Rng *r, unsigned slen, Pool *pool)
{
    int8_t all[7];
    unsigned n = slen < 7u ? slen : 7u, want = n < 4u ? n : 4u, mid = slen / 2u < slen - 1u ? slen / 2u : slen - 1u;
    for (unsigned i = 0; i < n; ++i) all[i] = (int8_t)i;
    pool->n = 0;
    for (unsigned k = 0; k < want; ++k) { /* pickN: draw without replacement */
        unsigned j = below(r, n - k);
        pool->d[pool->n++] = all[j];
        all[j] = all[n - k - 1u];
    }
    unsigned seen = 0;
    for (unsigned k = 0; k < pool->n; ++k) seen |= pool->d[k] == (int8_t)mid;
    if (!seen) pool->d[pool->n++] = (int8_t)mid;
}

/* motifTemplate: the rhythm and contour of each motif type, by the keywords the generator tests. */
enum { R_DEFAULT, R_PULSE, R_OFFBEAT, R_SYNC, R_SPARSE, R_DENSE, R_STAB };
static const uint8_t motif_rhythm[CR_MOTIFS] = {R_DEFAULT, R_PULSE, R_OFFBEAT, R_SYNC, R_SPARSE, R_DENSE, R_STAB, R_DEFAULT,
                                                R_DEFAULT, R_DEFAULT, R_DEFAULT, R_DEFAULT, R_DEFAULT, R_DEFAULT, R_DEFAULT, R_DEFAULT};
static const int8_t motif_contour[CR_MOTIFS][4] = { /* 99: a random -1..1 */
    {0, 0, 1, 0}, {99, 99, 99, 99}, {99, 99, 99, 99}, {99, 99, 99, 99}, {99, 99, 99, 99}, {99, 99, 99, 99},
    {99, 99, 99, 99}, {0, 0, 0, 0}, {0, 1, 2, 3}, {0, -1, -2, -3}, {0, 1, 2, 0}, {0, -1, -2, 0}, {0, 77, 1, 0},
    {0, 1, 0, -1}, {0, 1, 2, 1}, {0, 2, 4, 2},
};
typedef struct { unsigned len; uint8_t rhythm[4]; int8_t contour[4]; } Motif;
static void motif_template(Rng *r, unsigned type, unsigned steps, Motif *m)
{
    static const int8_t LENS8[] = {2, 3, 4}, LENS[] = {3, 4}, LEAPS_UP[] = {2, 3, 4};
    m->len = steps <= 4u ? 2u : steps <= 8u ? (unsigned)PICK(r, LENS8) : (unsigned)PICK(r, LENS);
    unsigned any = 0;
    for (unsigned i = 0; i < m->len; ++i) {
        unsigned on;
        switch (motif_rhythm[type]) {
        case R_PULSE: on = 1; break;
        case R_OFFBEAT: on = i % 2u == 1u; break;
        case R_SYNC: on = (unsigned)chance(r, i == 0 ? 780u : 550u); break;
        case R_SPARSE: on = (unsigned)chance(r, 450u); break;
        case R_DENSE: on = (unsigned)chance(r, 820u); break;
        case R_STAB: on = i == 0 || chance(r, 250u); break;
        default: on = (unsigned)chance(r, 650u); break;
        }
        m->rhythm[i] = (uint8_t)on; any |= on;
    }
    if (!any) m->rhythm[0] = 1;
    unsigned leap = type == 12u ? (unsigned)PICK(r, LEAPS_UP) : 0u;
    for (unsigned i = 0; i < m->len; ++i) {
        int c = motif_contour[type][i];
        m->contour[i] = (int8_t)(c == 99 ? PICK(r, PM1) : c == 77 ? (int)leap : c);
    }
}

static void note_set(CrNote *n, unsigned active, int degree, unsigned accent)
{
    n->active = (uint8_t)active; n->degree = (int8_t)degree; n->accent = (uint8_t)(active && accent);
}
static void copy_note(CrNote *to, const CrNote *from) { to->active = from->active; to->degree = from->degree; to->accent = from->accent; }
static unsigned motif_accent(Rng *r, unsigned pos) { return pos == 0 || chance(r, MOTIF_ACCENT); }

/* applyEnding: the last step sounds; the ending sets its degree (the call's ending is the generator's default, "more
 * resolved" for the response, so only the forcing). */
static void apply_ending(Rng *r, CrPhrase *ph, unsigned slen, int end, int response)
{
    unsigned last = ph->len - 1u;
    CrNote *n = &ph->n[last];
    int prev = last ? ph->n[last - 1u].degree : 0;
    if (!n->active) { n->active = 1; n->degree = 0; }
    if (!response) return;
    switch (end) {
    case E_ROOT: n->degree = 0; break;
    case E_FIFTH: n->degree = (int8_t)(slen - 1u < 4u ? slen - 1u : 4u); break;
    case E_RISE: n->degree = (int8_t)clampi(prev + 1, 0, CEIL); break;
    case E_FALL: n->degree = (int8_t)clampi((last ? prev : 1) - 1, 0, CEIL); break;
    case E_FADE: n->accent = 0; break;
    case E_STRONG: n->degree = (int8_t)PICK_BELOW(r, STRONG, (int)slen, 0); break;
    case E_WEAK: case E_TENSE: n->degree = (int8_t)PICK_BELOW(r, WEAK, (int)slen, 1); break;
    case E_AMBIGUOUS: n->degree = (int8_t)PICK_BELOW(r, AMBIG, (int)slen, 1); break;
    case E_MORE: n->degree = (int8_t)PICK_BELOW(r, ROOT24, (int)slen, 0); break;
    default: break; /* E_SAME */
    }
}

static uint32_t call_seed(const CrParams *p) { return 0xca11u ^ ((uint32_t)(p->seed + 1u) * 0x9e3779b9u) ^ ((uint32_t)p->motif << 20); }
int cr_call(CrPhrase *out, const CrParams *p, unsigned steps)
{
    if (!out || !p || !steps || steps > CR_STEPS || p->motif >= CR_MOTIFS || p->scale >= CR_SCALES) return 0;
    Rng rng = {call_seed(p)};
    Rng *r = &rng;
    unsigned slen = cr_scale_length[p->scale], dens = 50u + knob(p->dens) * 9u / 10u, rep = 50u + knob(p->rept) * 9u / 10u;
    Motif m;
    Pool pool;
    CrNote motif[4];
    motif_template(r, p->motif, steps, &m);
    spice_pool(r, slen, &pool);
    int center = (int)below(r, 3u), prev = center + PICK(r, START);
    unsigned any = 0;
    for (unsigned i = 0; i < m.len; ++i) {
        unsigned active = m.rhythm[i];
        int deg = prev;
        if (chance(r, REST_BIAS + (1000u - dens) / 4u)) active = active && chance(r, 680u);
        if (i == 0 && chance(r, ROOT_BIAS)) deg = PICK_BELOW(r, ROOTISH, (int)slen, 0);
        else if (chance(r, 650u)) deg = prev + m.contour[i] + PICK(r, PM1_ZERO);
        else { int8_t lift[3] = {0, 0, (int8_t)(center / 2)}; deg = pool.d[below(r, pool.n)] + PICK(r, lift); }
        if (chance(r, LEAP)) deg += PICK(r, LEAPS);
        deg = clampi(deg, 0, TOP);
        prev = deg;
        note_set(&motif[i], active, deg, motif_accent(r, i));
        any |= active;
    }
    if (!any) note_set(&motif[0], 1, 0, 1);
    static const uint16_t activation[4] = {700, 350, 600, 300}; /* preferredStepActivation, the neutral style */
    for (unsigned i = 0; i < steps; ++i) {
        CrNote s;
        copy_note(&s, &motif[i % m.len]);
        if (i >= m.len && !chance(r, rep)) {
            if (s.active) s.degree = (int8_t)clampi(s.degree + (rep < 250u ? PICK(r, SPREAD_WIDE) : PICK(r, SPREAD)), 0, TOP);
            if (chance(r, MOTIF_VAR + (1000u - rep) / 4u) && !s.active) s.active = (uint8_t)chance(r, 380u);
        }
        if (i >= m.len && i >= steps * 3u / 4u && s.active && chance(r, STABLE_END))
            s.degree = (int8_t)clampi(s.degree + PICK(r, PM1), 0, CEIL);
        unsigned d = (dens * 6u + activation[i % 4u] * 4u) / 10u;
        d = d < 50u ? 50u : d > 980u ? 980u : d;
        if (chance(r, 1000u - d)) s.active = (uint8_t)(s.active && chance(r, d));
        if (s.active && chance(r, ROOT_BIAS * 4u / 10u) && i % (m.len > 2u ? m.len : 2u) == 0)
            s.degree = (int8_t)PICK_BELOW(r, ROOT24, (int)slen, 0);
        if (!s.active) s.accent = 0;
        copy_note(&out->n[i], &s);
    }
    unsigned clone = m.len < steps / 2u ? m.len : steps / 2u;
    if (rep >= 700u && clone) /* "Repetitive" (0.72) and "Very repetitive" (0.88): the motif cloned along the phrase */
        for (unsigned i = clone; i < steps; ++i)
            if (chance(r, rep >= 860u ? 900u : 720u)) {
                copy_note(&out->n[i], &out->n[i % clone]);
                out->n[i].accent = (uint8_t)(out->n[i].active && motif_accent(r, i % m.len));
            }
    out->len = (uint8_t)steps;
    apply_ending(r, out, slen, E_SAME, 0);
    return 1;
}

static uint32_t answer_seed(const CrParams *call, const CrParams *a)
{
    return call_seed(call) ^ 0x5e5e0000u ^ ((uint32_t)(a->seed + 1u) * 0x85ebca6bu) ^ ((uint32_t)a->answ << 8);
}
int cr_response(CrPhrase *out, const CrPhrase *call, const CrParams *cp, const CrParams *a, unsigned steps)
{
    if (!out || !call || !cp || !a || !steps || steps > CR_STEPS || call->len != steps || cp->scale >= CR_SCALES
        || a->answ >= CR_ANSWERS || a->end >= CR_ENDINGS) return 0;
    Rng rng = {answer_seed(cp, a)};
    Rng *r = &rng;
    int slen = cr_scale_length[cp->scale];
    unsigned tight = knob(a->tght), ml = steps / 2u, strategy_accent = 0;
    ml = ml < 2u ? 2u : ml > 4u ? 4u : ml;
    if (ml > steps) ml = steps;
    const CrNote *motif = call->n; /* motifFromCall: the call's first two to four steps */
    int sum = 0, count = 0, first = 0, last = 0;
    for (unsigned i = 0; i < steps; ++i) if (call->n[i].active) { if (!count) first = call->n[i].degree; last = call->n[i].degree; sum += call->n[i].degree; ++count; }
    int contour = count >= 2 ? last - first : 0;
    Pool pool;
    spice_pool(r, (unsigned)slen, &pool);
    static const int8_t STABLE[] = {0, 2, 4, 6}, UP3[] = {1, 2, 3}, DOWN2[] = {1, 1, 2}, PLUS2[] = {0, 0, 2}, TUP[] = {2, 3, 4},
                        TDOWN[] = {2, 2, 3}, FIFTHS[] = {4, 2, 0}, LOW2[] = {1, 2}, BREAK[] = {2, 3, -2}, DOMINANT[] = {4, 1, 5};
    CrNote *o = out->n;
    out->len = (uint8_t)steps;
    for (unsigned i = 0; i < steps; ++i) copy_note(&o[i], &call->n[i]);
    /* mapMotif: the motif along the phrase, each degree moved by the strategy, some pulled into the pool by TGHT */
    /* the strategies that map the motif, and how they move its degrees */
    static const uint8_t maps[CR_ANSWERS] = {0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 0, 1};
    unsigned mapped = maps[a->answ], invert = a->answ == A_INVERT;
    int down = 0, offset = 0;
    const int8_t *move = PM1; unsigned moves = 3;
    if (a->answ == A_SIMPLIFY) { move = PM1_ZERO; moves = 4; }
    else if (a->answ == A_UP) move = UP3;
    else if (a->answ == A_DOWN) { move = DOWN2; down = 1; } /* deg - rand([1,1,2]) */
    else if (a->answ == A_TRANS_UP) move = TUP;
    else if (a->answ == A_TRANS_DOWN) { move = TDOWN; down = 1; }
    else if (a->answ == A_LOWER) { move = LOW2; moves = 2; down = 1; }
    else if (a->answ == A_OPPOSITE) { offset = 3; moves = 0; }
    else if (a->answ == A_DARKER) { offset = -1; moves = 0; }
    else if (a->answ == A_BRIGHTER) { offset = 1; moves = 0; }
    if (mapped)
        for (unsigned i = 0; i < steps; ++i) {
            copy_note(&o[i], &motif[i % ml]);
            if (!o[i].active) continue;
            int d = o[i].degree, delta = moves ? pick(r, move, moves) : 0;
            if (invert) d = (count ? floordiv(2 * (2 * sum - d * count) + count, 2 * count) : -d) + delta; /* round(2 avg - d) */
            else d += offset + (down ? -delta : delta);
            if (chance(r, tight * 28u / 100u)) d = pool.d[below(r, pool.n)] + floordiv(d, slen) * slen;
            o[i].degree = (int8_t)clampi(d, 0, CEIL);
        }
    unsigned half = steps / 2u;
    switch (a->answ) {
    case A_SR_RESOLVE:
        for (unsigned i = 0; i < steps; ++i) if (o[i].active) o[i].degree = (int8_t)clampi(call->n[i].degree + PICK(r, PM1_ZERO), 0, CEIL);
        break;
    case A_SR_CONTOUR: {
        int dir = contour >= 0 ? -1 : 1, quarter = (int)steps / 4 > 2 ? (int)steps / 4 : 2;
        for (unsigned i = 0; i < steps; ++i)
            if (o[i].active) o[i].degree = (int8_t)clampi(call->n[i].degree + dir * ((int)i / quarter) + PICK(r, PM1), 0, CEIL);
        break;
    }
    case A_SIMPLIFY:
        for (unsigned i = 0; i < steps; ++i) o[i].active = (uint8_t)(o[i].active && (i % 2u == 0 || chance(r, 350u)));
        break;
    case A_EXTEND:
        for (unsigned i = 1; i < steps; ++i)
            if (!o[i].active && o[i - 1].active && chance(r, 420u)) { o[i].active = 1; o[i].degree = o[i - 1].degree; }
        break;
    case A_TRUNCATE:
        for (unsigned i = steps * 65u / 100u; i < steps; ++i) if (chance(r, 650u)) o[i].active = 0;
        break;
    case A_ECHO: case A_DELAY:
        for (unsigned i = 0; i < steps; ++i) {
            const CrNote *src = &call->n[(i + 2u * steps - 2u) % steps];
            o[i].active = src->active; o[i].accent = src->accent;
            o[i].degree = (int8_t)clampi(src->degree + PICK(r, PM1), 0, CEIL);
        }
        if (a->answ == A_DELAY) {
            for (unsigned i = steps - 1u; i > 0; --i) copy_note(&o[i], &o[i - 1u]);
            note_set(&o[0], 0, 0, 0);
        }
        break;
    case A_RHYTHM:
        for (unsigned i = 0; i < steps; ++i) if (o[i].active) o[i].degree = (int8_t)clampi(pool.d[below(r, pool.n)] + PICK(r, PLUS2), 0, CEIL);
        break;
    case A_NOTES:
        for (unsigned i = 0; i < steps; ++i) o[i].active = (uint8_t)chance(r, call->n[i].active ? 680u : 220u);
        break;
    case A_ROOT:
        for (unsigned i = steps > 3u ? steps - 3u : 0u; i < steps; ++i) if (o[i].active) o[i].degree = (int8_t)PICK_BELOW(r, PLUS2, slen, 0);
        break;
    case A_FIFTH:
        for (unsigned i = steps > 3u ? steps - 3u : 0u; i < steps; ++i) if (o[i].active) o[i].degree = (int8_t)PICK_BELOW(r, FIFTHS, slen, 0);
        break;
    case A_LOWER:
        for (unsigned i = steps > 2u ? steps - 2u : 0u; i < steps; ++i) if (o[i].active) o[i].degree = (int8_t)clampi(o[i].degree - 1, 0, CEIL);
        break;
    case A_HARDER:
        for (unsigned i = steps > 4u ? steps - 4u : 0u; i < steps; ++i)
            if (o[i].active) { o[i].degree = (int8_t)PICK_BELOW(r, STABLE, slen, 0); o[i].accent = 1; }
        strategy_accent = 2;
        break;
    case A_REPEAT_BREAK:
        for (unsigned i = 0; i + 2u < steps; ++i) if (chance(r, 720u)) copy_note(&o[i], &call->n[i]);
        if (steps >= 2u && o[steps - 2u].active) o[steps - 2u].degree = (int8_t)clampi(o[steps - 2u].degree + PICK(r, BREAK), 0, CEIL);
        if (o[steps - 1u].active) o[steps - 1u].degree = (int8_t)PICK_BELOW(r, STABLE, slen, 0);
        break;
    case A_SPARSER:
        for (unsigned i = 0; i < steps; ++i) o[i].active = (uint8_t)(o[i].active && chance(r, i % 2u == 0 ? 850u : 220u));
        break;
    case A_BUSIER:
        for (unsigned i = 0; i < steps; ++i)
            if (!o[i].active && chance(r, 300u)) {
                const CrNote *before = &o[i ? i - 1u : 0u];
                o[i].active = 1;
                o[i].degree = before->active ? before->degree : pool.d[below(r, pool.n)];
            }
        break;
    case A_ACCENT:
        for (unsigned i = 0; i < steps; ++i) o[i].accent = (uint8_t)(o[i].active && (i % 2u == 0 || chance(r, 220u)));
        strategy_accent = 1;
        break;
    case A_HALF:
        for (unsigned i = 0; i < half; ++i) o[i].active = 0;
        break;
    case A_FRAGMENT: case A_TAIL: {
        unsigned start = a->answ == A_TAIL ? steps / 2u : steps / 3u;
        for (unsigned i = 0; i < steps; ++i) {
            const CrNote *src = &call->n[(start + i) % steps];
            o[i].active = (uint8_t)(src->active && chance(r, 880u));
            o[i].degree = (int8_t)clampi(src->degree + PICK(r, PM1), 0, CEIL);
        }
        break;
    }
    case A_QUESTION:
        if (steps >= 2u && o[steps - 2u].active) o[steps - 2u].degree = (int8_t)PICK_BELOW(r, WEAK, slen, 1);
        if (o[steps - 1u].active) o[steps - 1u].degree = (int8_t)PICK_BELOW(r, STABLE, slen, 0);
        break;
    case A_HOOK:
        for (unsigned i = 0; i < steps; ++i) {
            if (i < half) { copy_note(&o[i], &call->n[i]); continue; }
            copy_note(&o[i], &motif[i % ml]);
            if (o[i].active) o[i].degree = (int8_t)clampi(o[i].degree + PICK(r, MUTATE), 0, CEIL);
        }
        break;
    case A_CADENCE:
        for (unsigned i = 0; i < steps; ++i) {
            if (i < half && o[i].active) o[i].degree = (int8_t)PICK_BELOW(r, DOMINANT, slen, 1);
            if (i >= half && o[i].active && chance(r, 550u)) o[i].degree = (int8_t)PICK_BELOW(r, STABLE, slen, 0);
        }
        break;
    default: break;
    }
    /* TGHT pulls the response's notes halfway to the call's; the motif's accents (an ACNT or HARD answer keeps its own). */
    for (unsigned i = 0; i < steps; ++i) {
        if (o[i].active && call->n[i].active && chance(r, tight))
            o[i].degree = (int8_t)clampi((o[i].degree + call->n[i].degree + 1) / 2, 0, CEIL);
        unsigned own = strategy_accent && o[i].accent;
        o[i].accent = (uint8_t)(o[i].active && (motif_accent(r, i % ml) || own));
    }
    apply_ending(r, out, (unsigned)slen, a->end, 1);
    return 1;
}

/* mutatePhrase ("Response only", "Call only"): `amount` (0-31) steps drawn, each flipped (0.7) and, sounding, moved by up
 * to two degrees; at 31 up to 70% of the phrase, as "Brutal". */
static void mutate(CrPhrase *ph, uint32_t seed, unsigned amount_knob, unsigned salt)
{
    if (!amount_knob) return;
    Rng rng = {seed ^ (0x3779b97fu * (salt + 1u))};
    unsigned n = ph->len, most = n * 7u / 10u > 4u ? n * 7u / 10u : 4u, amount = 1u + (amount_knob * (most - 1u) + CR_KNOB / 2u) / CR_KNOB;
    uint8_t order[CR_STEPS];
    if (amount > n) amount = n;
    for (unsigned i = 0; i < n; ++i) order[i] = (uint8_t)i;
    for (unsigned k = 0; k < amount; ++k) {
        unsigned j = k + below(&rng, n - k), i = order[j];
        order[j] = order[k]; order[k] = (uint8_t)i;
        CrNote *s = &ph->n[i];
        if (chance(&rng, 700u)) s->active = !s->active;
        if (s->active) s->degree = (int8_t)clampi(s->degree + PICK(&rng, MUTATE), 0, CEIL);
        else s->accent = 0;
    }
}

unsigned cr_layout(unsigned mode, unsigned length, unsigned both, char kinds[4], unsigned *steps)
{
    static const char *const layouts[CR_MODES] = {"CR", "CRCR", "CCCR", "CCRR", "CR"};
    const char *k = layouts[mode < CR_MODES ? mode : 0u];
    unsigned n = 0;
    if (mode == CR_LAYER && !both) { kinds[0] = 'C'; kinds[1] = 'R'; *steps = length; return 2; } /* both from step 0 */
    if (mode != CR_SPLIT && mode != CR_LAYER && length < 4u) k = layouts[0];
    while (k[n]) { kinds[n] = k[n]; ++n; }
    *steps = length / n;
    return *steps ? n : 0u;
}
int cr_semis(unsigned scale, int degree, int trns)
{
    unsigned n = cr_scale_length[scale < CR_SCALES ? scale : 0u];
    int d = degree < 0 ? 0 : degree;
    int s = cr_scale_semis[scale < CR_SCALES ? scale : 0u][(unsigned)d % n] + 12 * (d / (int)n) + trns;
    while (s > 12) s -= 12;
    while (s < -12) s += 12;
    return s;
}
unsigned cr_next_seed(unsigned seed) { return (seed + 1u) & 127u; }

static void lay(CrLine *out, const CrPhrase *ph, unsigned at, unsigned scale, int trns)
{
    for (unsigned i = 0; i < ph->len && at + i < CR_STEPS; ++i) {
        CrStep *s = &out->steps[at + i];
        s->trig = ph->n[i].active; s->accent = ph->n[i].accent;
        s->semis = (int8_t)(s->trig ? cr_semis(scale, ph->n[i].degree, trns) : 0);
    }
}
int cr_generate(CrLine *out, const CrParams *call, const CrParams *answer, unsigned length, unsigned parts)
{
    static CrPhrase c, r, v; /* 600 bytes: kept off the UI task's stack */
    if (!out || !call || !length || length > CR_STEPS || call->phrs >= CR_MODES || (parts & CR_RESPONSES && !answer)
        || (answer && answer->trns > 24u)) return 0;
    for (unsigned i = 0; i < CR_STEPS; ++i) { out->steps[i].trig = out->steps[i].accent = 0; out->steps[i].semis = 0; }
    out->length = (uint8_t)length;
    char kinds[4];
    unsigned steps, n = cr_layout(call->phrs, length, parts == (CR_CALLS | CR_RESPONSES), kinds, &steps), calls = 0, responses = 0;
    if (!n) return 1; /* a one-step track: nothing fits a pair */
    if (!cr_call(&c, call, steps)) return 0;
    if (answer && !cr_response(&r, &c, call, answer, steps)) return 0;
    for (unsigned k = 0; k < n; ++k) responses += kinds[k] == 'R';
    unsigned layered = call->phrs == CR_LAYER && parts != (CR_CALLS | CR_RESPONSES);
    for (unsigned k = 0, done = 0; k < n; ++k) {
        unsigned at = layered ? 0u : k * steps;
        if (kinds[k] == 'C') { /* the first call as it is, the repeats varied by VAR */
            if (parts & CR_CALLS) {
                for (unsigned i = 0; i < steps; ++i) copy_note(&v.n[i], &c.n[i]);
                v.len = c.len;
                if (calls) mutate(&v, call_seed(call), call->var, calls);
                lay(out, &v, at, call->scale, 0);
            }
            ++calls;
        } else { /* one response mutated by MUT; of two, the second */
            if (parts & CR_RESPONSES) {
                for (unsigned i = 0; i < steps; ++i) copy_note(&v.n[i], &r.n[i]);
                v.len = r.len;
                if (responses == 1u || done) mutate(&v, answer_seed(call, answer), answer->mut, done);
                lay(out, &v, at, call->scale, (int)answer->trns - 12);
            }
            ++done;
        }
    }
    return 1;
}

static void put(uint8_t *r, uint8_t *mirror, unsigned at, uint8_t v) { if (r[at] != v) { r[at] = v; if (mirror) mirror[at] = v; } }
static unsigned bit(const uint8_t *r, unsigned mask, unsigned step) { return (r[mask * 8u + 7u - step / 8u] >> (step % 8u)) & 1u; }
static void setbit(uint8_t *r, unsigned mask, unsigned step, unsigned on)
{
    uint8_t *byte = r + mask * 8u + 7u - step / 8u, b = (uint8_t)(1u << (step % 8u));
    *byte = on ? (uint8_t)(*byte | b) : (uint8_t)(*byte & (uint8_t)~b);
}
int cr_track_empty(const uint8_t *r)
{
    for (unsigned i = 0; i < 64; ++i) if (r[i]) return 0;
    for (unsigned i = 72; i < 80; ++i) if (r[i]) return 0;
    for (unsigned i = 0; i < CR_STEPS * 32u; ++i) if (r[CR_LOCKS + i] != CR_NO_LOCK) return 0;
    return 1;
}
unsigned cr_write(uint8_t *r, uint8_t *mirror, const CrLine *line, unsigned base_vol, uint8_t locked[CR_STEPS])
{
    uint8_t masks[80];
    unsigned trigs = 0, length = line->length > CR_STEPS ? CR_STEPS : line->length;
    unsigned accent = base_vol + CR_ACCENT_VOL > 127u ? 127u : base_vol + CR_ACCENT_VOL;
    for (unsigned k = 0; k < 80; ++k) masks[k] = r[k];
    for (unsigned i = 0; i < CR_STEPS; ++i) {
        unsigned at = CR_LOCKS + 32u * i, any = 0;
        if (i < length) {
            const CrStep *s = &line->steps[i];
            put(r, mirror, at + CR_LOCK_PTCH, s->trig ? (uint8_t)(64 + 5 * s->semis) : (uint8_t)CR_NO_LOCK);
            put(r, mirror, at + CR_LOCK_VOL, s->trig && s->accent ? (uint8_t)accent : (uint8_t)CR_NO_LOCK);
            if (bit(masks, 0, i) || s->trig) { setbit(masks, 1, i, 0); setbit(masks, 3, i, 0); setbit(masks, 9, i, 0); }
            setbit(masks, 0, i, s->trig);
            for (unsigned k = 0; !any && k < 32; ++k) any = r[at + k] != CR_NO_LOCK;
            setbit(masks, 2, i, !s->trig && any);
            locked[i] = (uint8_t)(any || s->trig);
            trigs += s->trig;
        } else {
            for (unsigned k = 0; !any && k < 32; ++k) any = r[at + k] != CR_NO_LOCK;
            locked[i] = (uint8_t)any;
        }
    }
    for (unsigned k = 0; k < 80; ++k) put(r, mirror, k, masks[k]);
    return trigs;
}

static unsigned field(const uint8_t *in, unsigned at, unsigned bits)
{
    unsigned v = 0;
    for (unsigned b = 0; b < bits; ++b, ++at) v |= (unsigned)((in[at / 7u] >> (at % 7u)) & 1u) << b;
    return v;
}
static void set_field(uint8_t *out, unsigned at, unsigned bits, unsigned v)
{
    for (unsigned b = 0; b < bits; ++b, ++at) {
        uint8_t m = (uint8_t)(1u << (at % 7u));
        out[at / 7u] = (uint8_t)(v >> b & 1u ? out[at / 7u] | m : out[at / 7u] & (uint8_t)~m);
    }
}
/* ROLE MOTF DENS REPT SCAL PHRS SEED VAR ANSW TGHT END MUT TRNS: 60 of the 63 bits */
static const uint8_t widths[13] = {4, 4, 5, 5, 3, 3, 7, 5, 5, 5, 4, 5, 5};
void cr_pack(uint8_t out[CR_PACKED], const CrParams *p)
{
    unsigned v[13] = {p->role, p->motif, p->dens, p->rept, p->scale, p->phrs, p->seed, p->var, p->answ, p->tght, p->end, p->mut, p->trns};
    for (unsigned k = 0; k < CR_PACKED; ++k) out[k] = 0;
    for (unsigned k = 0, at = 0; k < 13; at += widths[k++]) set_field(out, at, widths[k], v[k] & ((1u << widths[k]) - 1u));
}
void cr_unpack(CrParams *p, const uint8_t in[CR_PACKED])
{
    unsigned v[13];
    for (unsigned k = 0, at = 0; k < 13; at += widths[k++]) v[k] = field(in, at, widths[k]);
    p->role = (uint8_t)(v[0] <= CR_ANSWER + 7u ? v[0] : CR_SELF); p->motif = (uint8_t)v[1]; p->dens = (uint8_t)v[2];
    p->rept = (uint8_t)v[3]; p->scale = (uint8_t)v[4]; p->phrs = (uint8_t)(v[5] < CR_MODES ? v[5] : 0u); p->seed = (uint8_t)v[6];
    p->var = (uint8_t)v[7]; p->answ = (uint8_t)(v[8] < CR_ANSWERS ? v[8] : 0u); p->tght = (uint8_t)v[9];
    p->end = (uint8_t)(v[10] < CR_ENDINGS ? v[10] : CR_END_MORE); p->mut = (uint8_t)v[11]; p->trns = (uint8_t)(v[12] <= 24u ? v[12] : 12u);
}
void cr_copy(CrParams *to, const CrParams *from)
{
    const uint8_t *f = (const uint8_t *)from; uint8_t *t = (uint8_t *)to;
    for (unsigned k = 0; k < sizeof *to; ++k) t[k] = f[k];
}
