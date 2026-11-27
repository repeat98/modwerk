/* SPDX-License-Identifier: GPL-3.0-or-later
 * The Quadraverb's ColdFire half: its ot_dsp_effects record (runtime.json). program() reads PROG, code() gives a
 * program's area words for the base to write into P, and the stream (ENGINE.md, "The SDRAM stream") keeps each
 * streamed delay line in a ring here: take() files the head words the DSP wrote in a frame, fill() sends back the runs
 * its reads take, MODWERK_DSP_STREAM_LAG (3) frames later. This is qvs.ColdFire in C; engine/test_qv_runtime.py holds
 * it to that model. fill and take run in the frame interrupt, program and code in the UI task; they share no state.
 *
 * Out-block (DSP to here): the tag 0x5100 | index, K (the DSP's frame since the program started, modulo 0x8000;
 * 0xffff while it waits), then each streamed line's 16 head words newest first, then each moving window's published U.
 * In-block (here to DSP): each window's run, as qvs.ColdFire.compose, then the knob words (qvs.knob_values: the
 * marker 0x4b00 | index, LEN's coefficients << 4, the sweep's rate, depth and centre), zeros past the program's words.
 * Knobs B-E (LEN, TIME, SPD, DEP) are read from the frame record; 64 is the factory program (engine/qvk.py).
 *
 * qv_page and qv_name serve runtime/qv_entry.s, which names the program in stock's message box when PROG turns. */
#include "qv_runtime.h"
#ifndef QV_TABLES
#define QV_TABLES "../gen/qv_tables.h"
#endif
#include QV_TABLES
#ifndef QV_NAMES
#define QV_NAMES "../gen/qv_names.h"
#endif
#include QV_NAMES
_Static_assert(QV_NAMES_COUNT == QV_PROGRAMS, "gen/qv_names.h names another program list than gen/qv_tables.h");

#ifndef QV_POOL_HALFWORDS
#define QV_POOL_HALFWORDS QV_RING_MAX /* the dearest program alone; two chambers fit side by side */
#endif
#define LAT 3u                        /* MODWERK_DSP_STREAM_LAG */
#define STALE 8                       /* frames with no fill: the slot has left the effect */
#define NOFIT 0xffffffffu

#ifdef QV_HOST
/* The host test's frame records: the bytes from 0x80000000 on. */
uint8_t qv_host_mem[0x800] __attribute__((aligned(4)));
#define AT(a) (qv_host_mem + ((a) - 0x80000000u))
#else
#define AT(a) ((volatile uint8_t *)(a))
#endif

#ifdef __m68k__
#define SEEN __attribute__((section(".data"))) /* in the image, as Midiverb's state, so MEM reaches it */
#else
#define SEEN
#endif

struct slot {
    uint8_t prog;         /* the index + 1; 0 none */
    uint8_t room, known, unsynced;
    uint32_t at;          /* its rings' offset in the pool, while room */
    uint32_t base;        /* the frame the DSP's K counts from, while known */
    uint32_t kn, have;    /* the newest frame filed and how many samples since the stream started */
    uint32_t seen;        /* the last fill's frame */
    uint32_t pubk[8];     /* the frame of each published entry */
    uint16_t pub[8][QV_MOVING_MAX];
};

static struct slot slots[16] SEEN;
static uint16_t pool[QV_POOL_HALFWORDS]; /* never assumed zero: a slot reads only what it filed since it started */
volatile uint32_t qv_resyncs SEEN, qv_no_room SEEN, qv_missing SEEN, qv_gaps SEEN, qv_bad_tags SEEN;

/* ---- the live knobs (engine/qvk.py: the same arithmetic) ---- */

/* The parameter knob position k (0-127) asks for: f at 64, lo at 0, hi at 127, linear on each side. */
static int knob_value(int k, int f, int lo, int hi)
{
    int m, x;
    if (k > 127) k = 127;
    m = k < 64 ? 2 * (f - lo) : ((hi - f) * 128 + 62) / 63;
    x = (k - 64) * m;
    return f + (x >= 0 ? x >> 7 : -((-x + 127) >> 7));
}

struct qv_now { int len[2], ms[2], s, d, rate, depth, centre; };

static void knobs_now(const struct qv_knob *K, const volatile uint8_t *kb, struct qv_now *n)
{
    for (unsigned g = 0; g < K->len_n; ++g) n->len[g] = knob_value(kb[0], K->lf[g], 0, K->lhi[g]);
    if (K->time_n) {
        int L = knob_value(kb[1], K->tf[0], 1, K->thi[0]);
        n->ms[0] = L;
        if (K->time_n > 1) {
            int R = (L * K->tf[1] + K->tf[0] / 2) / K->tf[0];
            n->ms[1] = R < 1 ? 1 : R > K->thi[1] ? K->thi[1] : R;
        }
    }
    if (K->sweep) {
        n->s = knob_value(kb[2], K->s, 0, 98), n->d = knob_value(kb[3], K->d, 0, K->dhi);
        n->rate = qv_rate[n->s];
        n->depth = (qv_depth_h[n->d / (K->sweep & 0x7f)] * qv_depth_k[n->s]) >> 8;
        n->centre = K->c0 + ((K->sweep & 0x80) ? n->depth : 0);
    }
}

static unsigned knob_coef(const struct qv_knob *K, int v) { return K->len_kind == 1 ? qv_decay[v] : 16u * (unsigned)v; }

/* PROG's value to its program's index: past the list, the last. */
static unsigned qv_index(unsigned v) { return v < QV_PROGRAMS ? v : QV_PROGRAMS - 1u; }

int32_t qv_program(unsigned slot)
{
    if (slot < 8u || slot >= 16u) return -1; /* FX1: never ours */
    uint32_t bank = *(volatile uint32_t *)AT(0x800000e0u) & 1u;
    unsigned v = *(volatile uint8_t *)AT(0x80000110u + bank * 512u + (slot - 8u) * 64u + 24u); /* FX2 knob A */
    return (int32_t)qv_index(v);
}

/* What stock's message box shows when PROG stores `value`: the number and name of the program qv_program then picks. */
const char *qv_name(unsigned value) { return qv_names[qv_index(value)]; }

static char *put(char *o, const char *s) { while (*s) *o++ = *s++; return o; }
static char *num(char *o, int v)
{
    char d[6];
    int n = 0;
    do d[n++] = (char)('0' + v % 10), v /= 10; while (v && n < 6);
    while (n) *o++ = d[--n];
    return o;
}

/* What the message box shows when knob slot (0 PROG, 1-4 LEN, TIME, SPD, DEP) stores value; part: that knob's Part
 * byte, the page's six values together, so PROG's is part[-slot] (Midiverb's entry.s). As qvk.Program.text. */
const char *qv_label(unsigned slot, unsigned value, const volatile uint8_t *part)
{
    static char line[20];
    if (!slot || slot > 4u) return qv_name(value);
    const struct qv_knob *K = &qv_knobs[qv_index(part[-(int)slot])];
    uint8_t kb[4] = {64, 64, 64, 64};
    kb[slot - 1u] = (uint8_t)value;
    struct qv_now n;
    knobs_now(K, kb, &n);
    char *o = line;
    if (slot == 1u)
        o = K->len_kind == 1 ? num(put(o, "DECAY "), n.len[0]) : K->len_kind == 2 ? put(num(put(o, "FBK "), n.len[0]), " %")
          : put(o, K->len_kind == 3 ? "NO DECAY ON REVERSE" : "NO DECAY HERE");
    else if (slot == 2u) {
        if (K->time_kind == 1) o = put(num(put(o, "PRE "), n.ms[0]), " MS");
        else if (K->time_kind == 2) {
            o = num(put(o, "DELAY "), n.ms[0]);
            if (K->time_n > 1) o = num(put(o, "/"), n.ms[1]);
            o = put(o, " MS");
        } else o = put(o, K->time_kind == 3 ? "NO PRE ON REVERSE" : K->time_kind == 4 ? "NO PRE-DELAY HERE" : "NO DELAY HERE");
    } else if (!K->sweep) o = put(o, "NO SWEEP HERE");
    else o = slot == 3u ? num(put(o, "SPEED "), n.s) : num(put(o, "DEPTH "), n.d);
    *o = 0;
    return line;
}

/* The FX2 page the base installed for this module (its descriptor), or 0: qv_entry.s takes only turns on that page, so
 * another module's page with a PROG of its own never shows these names.
 * shortcut: as Midiverb's mv_installed, through the page recipe the builder puts before this code ('MWPG' at the
 * module's start; the base keeps the page's address at recipe + 48, fxpage.c); upgrade when the loader hands a module
 * its handle. */
#ifdef QV_HOST
uint8_t qv_host_image[0x4000]; /* the host test's module: the image starts at its end */
#define IMAGE_START (qv_host_image + sizeof qv_host_image)
#else
extern const uint8_t __image_start[];
#define IMAGE_START __image_start
#endif
static const volatile uint8_t *recipe SEEN;

uint32_t qv_page(void)
{
    if (!recipe) {
        const volatile uint8_t *p = IMAGE_START - 4;
        for (unsigned n = 0; n < 16384u && !recipe; n += 4u, p -= 4)
            if (p[0] == 'M' && p[1] == 'W' && p[2] == 'P' && p[3] == 'G') recipe = p;
        if (!recipe) return 0;
    }
    uint32_t d = (uint32_t)recipe[48] << 24 | (uint32_t)recipe[49] << 16 | (uint32_t)recipe[50] << 8 | recipe[51];
    return d < 0x40000000u || d >= 0x48000000u ? 0 : d; /* 0: no page installed yet */
}

uint32_t qv_code(unsigned slot, int32_t program, uint32_t at, uint32_t *out)
{
    (void)slot;
    if (program < 0 || program >= QV_PROGRAMS) return 0;
    const struct qv_prog *p = &qv_progs[program];
    const uint16_t *ix = qv_area + p->area0;    /* each word by its index in the dictionary of distinct words */
    for (uint32_t i = 0; i < p->area_n; ++i) {
        const uint8_t *b = qv_dict + 3u * ix[i];
        out[i] = (uint32_t)b[0] << 16 | (uint32_t)b[1] << 8 | b[2];
    }
    for (uint32_t i = 0; i < p->reloc_n; ++i) {
        uint32_t *w = &out[qv_relocs[p->reloc0 + i]];
        *w = (*w + at - p->origin) & 0xffffffu;
    }
    return p->area_n;
}

/* The first fit of n halfwords past every other slot's rings; a slot not filled for STALE frames gives its rings up. */
static uint32_t fit(unsigned self, uint32_t n, uint32_t now)
{
    for (uint32_t at = 0;;) {
        unsigned moved = 0;
        if (at + n > QV_POOL_HALFWORDS) return NOFIT;
        for (unsigned j = 0; j < 16u; ++j) {
            struct slot *o = &slots[j];
            uint32_t len = o->prog ? qv_progs[o->prog - 1].ring : 0;
            if (j == self || !o->room || !len || at >= o->at + len || at + n <= o->at) continue;
            if ((int32_t)(now - o->seen) > STALE) { o->prog = o->room = o->known = 0; continue; }
            at = o->at + len, moved = 1;
        }
        if (!moved) return at;
    }
}

/* The stream starts (or starts again) at frame k: nothing filed yet, nothing published. */
static void start(struct slot *s, uint32_t k)
{
    s->kn = k - 1u, s->have = 0;
    for (unsigned i = 0; i < 8u; ++i) s->pubk[i] = k - 1u;
}

void qv_take(unsigned slot, uint32_t f, const volatile uint16_t *out)
{
    if (slot >= 16u) return;
    struct slot *s = &slots[slot];
    unsigned tag = out[0], K = out[1];
    if ((tag >> 8) != 0x51u || (tag & 0xffu) >= QV_PROGRAMS) { s->unsynced = 1, qv_bad_tags = qv_bad_tags + 1u; return; }
    s->unsynced = 0;
    if (s->prog != (tag & 0xffu) + 1u) s->prog = (uint8_t)((tag & 0xffu) + 1u), s->room = s->known = 0;
    if (K == 0xffffu) return;
    const struct qv_prog *p = &qv_progs[s->prog - 1];
    if (!s->room) {
        uint32_t at = fit(slot, p->ring, f);
        if (at == NOFIT) { qv_no_room = qv_no_room + 1u; return; }
        s->at = at, s->room = 1;
    }
    if (!s->known) s->base = f - K, s->known = 1, start(s, K);
    else if (((f - s->base) & 0x7fffu) != K) s->base = f - K, start(s, K), qv_resyncs = qv_resyncs + 1u;
    uint32_t k = f - s->base;
    if (k != s->kn + 1u) qv_gaps = qv_gaps + 1u;
    const volatile uint16_t *o = out + 2;
    for (unsigned l = 0; l < p->lines; ++l, o += 16) {
        const struct qv_line *L = &qv_lines[p->line0 + l];
        uint16_t *r = pool + s->at + L->at;
        uint32_t n = 16u * k + 15u, mask = L->mask; /* locals: the volatile reads would reload them every word */
        for (unsigned i = 0; i < 16u; ++i) r[(n - i) & mask] = o[i];
    }
    for (unsigned j = 0; j < p->moving; ++j) s->pub[k & 7u][j] = o[j];
    s->pubk[k & 7u] = k, s->kn = k;
    if (s->have < 0x40000000u) s->have += 16u;
}

void qv_fill(unsigned slot, uint32_t f, volatile uint16_t *in)
{
    unsigned d = 0;
    if (slot < 16u) {
        struct slot *s = &slots[slot];
        s->seen = f;
        if (s->known && !s->unsynced) {
            const struct qv_prog *p = &qv_progs[s->prog - 1];
            const struct qv_knob *K = &qv_knobs[s->prog - 1];
            uint32_t bank = *(volatile uint32_t *)AT(0x800000e0u) & 1u;
            const volatile uint8_t *kb = AT(0x80000110u + bank * 512u + (slot - 8u) * 64u + 25u); /* FX2 knobs B-E */
            struct qv_now kn;
            knobs_now(K, kb, &kn);
            uint32_t k = f - s->base, u = (k - LAT) & 7u, have = s->have;
            for (unsigned x = p->win0; x < p->win0 + p->windows; ++x) {
                const struct qv_window *w = &qv_windows[x];
                const uint16_t *r = pool + s->at + qv_lines[w->line].at;
                uint32_t mask = qv_lines[w->line].mask;
                int32_t B = w->b;
                if (w->mv >= 0) B += s->pubk[u] == k - LAT ? s->pub[u][w->mv] : w->u0;
                if (w->kg >= 0) {      /* TIME: under the latency the DSP takes the run from the line's head */
                    B += 42 * (kn.ms[w->kg] - (int32_t)K->tf[w->kg]);
                    if (B < (int32_t)(16u * LAT)) B = (int32_t)(16u * LAT);
                }
                uint32_t n = 16u * k + 15u - (uint32_t)B;           /* the run's newest sample */
                int32_t age = (int32_t)(16u * (s->kn - k)) + B;      /* how far it is behind the newest filed */
                for (unsigned i = 0; i < w->w; ++i, --n, ++age) {
                    if (age < 0) { in[d++] = 0, qv_missing = qv_missing + 1u; continue; }
                    in[d++] = (uint32_t)age < have ? r[n & mask] : 0;
                }
            }
            if (K->kw) {
                in[d++] = (uint16_t)(0x4b00u | (s->prog - 1u));
                for (unsigned j = 0; j + 1u < K->kw; ++j) {
                    unsigned kd = K->kind[j];
                    in[d++] = (uint16_t)(kd <= 2u ? knob_coef(K, kn.len[kd - 1u]) << 4
                                         : kd == 3u ? (unsigned)kn.rate : kd == 4u ? (unsigned)kn.depth : (unsigned)kn.centre);
                }
            }
        }
    }
    while (d < QV_STREAM_IN) in[d++] = 0;
}

const struct modwerk_dsp_effect qv_effect = {
    MODWERK_DSP_EFFECT_ABI, QV_PROGRAM_WORDS, qv_program, qv_code, QV_STREAM_IN, QV_STREAM_OUT, qv_fill, qv_take, 0,
};
