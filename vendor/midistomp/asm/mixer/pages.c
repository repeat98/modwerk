/* Mixer Mode: the node knob pages (stock screen 15, the MIXER screen) and the
 * settings in the packed patch. Each node's knobs fill pages 3 at a time with no
 * gaps, as stock effect pages (docs/dev/v2.0-brief.md "Node knob pages"):
 *   IN      InLvl                  (Split: InL, InR)
 *   [ROUTE] XFade, Mode, BusA      BusB
 *   [MIX]   XFade, Outpt, Curve    MixA, MixB, PhasB    MuteA, MuteB, Solo
 *   OUT     Mastr                  (Output Split: MastL, MastR)
 * Drawn with the stock knob page primitives (stock.h "node knob pages"), so the
 * screen looks like an effect's. Labels and values stay within 5 characters: the
 * stock 7-px cells of 40-px columns. Knob 1-3 turn: the setting; knob 3 press:
 * next page of the range the chain opened (MENU > MIXER: every page); knob 2: EXIT. */
#include "chain.h"
#include "stock.h"
#include "knob_step.h"

#define UI_REFRESH FN(0xC00ACD84, void, (void))  /* the edited mark, then the auto save timer */
#define DEFAULTS ((const unsigned char *)(MIXER_BASE + 320))  /* [24] */
#define MAGIC 0x4D              /* setting byte 11: settings are present */

enum { FADER, KNOB, TOGGLE };    /* control look, per Luca: levels and crossfades are faders */
typedef struct { int s, max, t; const char *l; const char *const *opt; } Knob;

static const char *const o_mode[] = { "Serl", "Paral", "Split", "MSerl" };
static const char *const o_out[] = { "Ster", "Mono", "Split" };
static const char *const o_curve[] = { "Smoth", "DJ", "Cut" };
static const char *const o_phase[] = { "Norm", "Inv" };
static const char *const o_off[] = { "Off", "On" };
static const char *const o_solo[] = { "Off", "A", "B" };

static const Knob knobs[] = {      /* every node's knobs, in order */
    { S_IN, 150, FADER, "InLvl", 0 },
    { S_SEND, 100, FADER, "XFade", 0 }, { S_MODE, 3, KNOB, "Mode", o_mode }, { S_RA, 150, FADER, "BusA", 0 }, { S_RB, 150, FADER, "BusB", 0 },
    { S_XF, 100, FADER, "XFade", 0 }, { S_OUT, 2, KNOB, "Outpt", o_out }, { S_CURVE, 2, KNOB, "Curve", o_curve },
    { S_MA, 150, FADER, "MixA", 0 }, { S_MB, 150, FADER, "MixB", 0 }, { S_PHASE, 1, TOGGLE, "PhasB", o_phase },
    { S_MUTEA, 1, TOGGLE, "MuteA", o_off }, { S_MUTEB, 1, TOGGLE, "MuteB", o_off }, { S_SOLO, 2, KNOB, "Solo", o_solo },
    { S_MASTER, 150, FADER, "Mastr", 0 },
};
static const Knob k_inl = { S_IN, 150, FADER, "InL", 0 }, k_inr = { S_INR, 150, FADER, "InR", 0 };
static const Knob k_mastl = { S_MASTER, 150, FADER, "MastL", 0 }, k_mastr = { S_MR, 150, FADER, "MastR", 0 };
static const Knob k_mode = { S_MODE, 1, KNOB, "Mode", o_mode };   /* MONO input: Serial / Parallel */

/* per page PG_*: its node's name, first page, page count, first knob in knobs[], knob count */
static const char *const node[PG_N] = { "IN", "[ROUTE]", "[ROUTE]", "[MIX]", "[MIX]", "[MIX]", "OUT" };
static const unsigned char first[PG_N] = { 0, 1, 1, 3, 3, 3, 6 };
static const unsigned char count[PG_N] = { 1, 2, 2, 3, 3, 3, 1 };
static const unsigned char kbase[PG_N] = { 0, 1, 1, 5, 5, 5, 14 };
static const unsigned char kn[PG_N] = { 1, 4, 4, 9, 9, 9, 1 };

static int page(void)
{
    int p = PAGE;
    return p < 0 || p >= PG_N ? 0 : p;
}

static const Knob *knob_at(int p, int k)
{
    int i = (p - first[p]) * 3 + k;   /* the node's knob i: 3 per page, no gaps */
    if (p == PG_IN && eff_mode() == 2) return i == 0 ? &k_inl : i == 1 ? &k_inr : 0;
    if (p == PG_OUT && LIVE[S_OUT] == 2) return i == 0 ? &k_mastl : i == 1 ? &k_mastr : 0;
    if (p == PG_ROUTE && i == 1 && !PEDAL) return &k_mode;
    return i < kn[p] ? &knobs[kbase[p] + i] : 0;
}

static int value(const Knob *kn)
{
    int v = kn->s == S_MODE ? eff_mode() : LIVE[kn->s];
    return v > kn->max ? kn->max : v;
}

static char *num(char *b, int v)    /* 0-255, no RTS division */
{
    char *p = b;
    int h = 0, t = 0;
    while (v >= 100) { v -= 100; h++; }
    while (v >= 10) { v -= 10; t++; }
    if (h) *p++ = '0' + h;
    if (h || t) *p++ = '0' + t;
    *p++ = '0' + v;
    *p = 0;
    return b;
}

void pages_build(Pages *p)
{
    static char buf[3][6];
    const Knob *kn;
    int pg = page(), k, v;
    p->name = node[pg];
    p->page = pg - first[pg];
    p->npages = count[pg];
    p->warn = pg >= PG_MIX && pg < PG_OUT && mix_silent();
    p->limit = pg == PG_OUT && HOLD != 0;
    for (k = 0; k < 3; k++) {
        kn = knob_at(pg, k);
        p->label[k] = kn ? kn->l : 0;
        if (!kn) continue;
        v = value(kn);
        p->val[k] = v;
        p->max[k] = kn->max;
        p->type[k] = kn->t;
        p->text[k] = kn->opt ? kn->opt[v] : num(buf[k], v);
        if (kn->s == S_XF || kn->s == S_SEND) {   /* crossfades read like a pan: A100 .. AB .. B100 */
            buf[k][0] = v <= 50 ? 'A' : 'B';
            if (v == 50) buf[k][1] = 'B', buf[k][2] = 0;
            else num(buf[k] + 1, 2 * (v < 50 ? 50 - v : v - 50));
            p->text[k] = buf[k];
        }
        if ((kn->s == S_XF && LIVE[S_OUT] == 2) || (kn->s == S_SEND && eff_mode() == 2))
            p->text[k] = "-", p->val[k] = 0;   /* does nothing now: Split output / Split input */
    }
}

/* knob_step: the stock step 0xC00ABE58's math (state 0, an effect parameter page). Same knob as the previous
 * event: interval = ms since the last such turn / detents; range > 500: x (21 - interval) * range / 200, 1000,
 * 3000 under 8, 13, 20 ms; else x (21 - interval) * range / 150 under 20 ms; 0 -> the plain steps. */
int knob_step(int ev, int steps, int range)
{
    int iv, s = steps;
    if (ev != KS_LAST || !steps) return steps;     /* stock: no time kept either */
    iv = KS_DIV(KS_TICKS() - KS_TIME, steps < 0 ? -steps : steps);
    if (range > 500)
        s = iv < 20 ? KS_DIV((21 - iv) * steps * range, iv < 8 ? 200 : iv < 13 ? 1000 : 3000) : steps;
    else if (iv < 20)
        s = KS_DIV((21 - iv) * steps * range, 150);
    KS_TIME = KS_TICKS();
    return s ? s : steps;
}

/* Screen 15 key entry (chain_vec.asm): event, knob steps; 1 = redraw. */
int pages_key(int ev, int steps)
{
    const Knob *kn;
    int pg = page(), v;
    if (ev >= 160 && ev <= 162) {
        kn = knob_at(pg, ev - 160);
        if (!kn) return 0;
        v = value(kn) + knob_step(ev, steps, kn->max);   /* 1 per detent while slow, as stock params */
        LIVE[kn->s] = v < 0 ? 0 : v > kn->max ? kn->max : v;
        if (kn->s == S_IN && eff_mode() != 2) LIVE[S_INR] = LIVE[S_IN];   /* not Split: knob 1 drives both sides */
        if (kn->s == S_MASTER && LIVE[S_OUT] != 2) LIVE[S_MR] = LIVE[S_MASTER];
        UI_REFRESH();
        EVENT_POST(MAILBOX, 0x40);
        return 1;
    }
    if (ev == 67) {             /* knob 3 press: the next page of the range */
        PAGE = pg >= UI[UI_PLAST] ? UI[UI_PFIRST] : pg + 1;
        return 1;
    }
    if (ev == 65) {             /* EXIT: back to the chain when it opened us, else the menu */
        v = UI[UI_FROMCHAIN];
        UI[UI_FROMCHAIN] = 0;
        UI[UI_PFIRST] = 0;
        UI[UI_PLAST] = PG_N - 1;
        if (v) SET_SCREEN(3, -2);
        else SET_SCREEN(0, 3);
        return 1;
    }
    return 0;
}

/* Screen 15 draw (chain_vec.asm): as stock 0xC00CAFA0 draws an effect's knob page. */
void pages_draw_h(void)
{
    Pages p;
    char dg[2];
    int i, x;
    for (i = 0; i < 256; i++) LCD0[i] = 0;
    LCD_DIRTY(0);
    KP_BOX(0, 0, 11, 128, 53);              /* the knob area frame, as stock */
    pages_build(&p);
    x = KP_TAB(0, 0, 0, 2, p.name) - 1;     /* the name tab: left of every page tab, as stock */
    if (p.warn) x += KP_TAB(0, x, 0, 2, "!") - 1;
    dg[1] = 0;
    for (i = 0; i < p.npages; i++) {
        dg[0] = (char)('1' + i);
        x += KP_TAB(0, x, 0, i == p.page ? 0 : i < p.page ? 2 : 1, dg) - 1;
    }
    if (p.limit) KP_TEXT_R(0, "LIMIT", 127, 2);
    for (i = 0; i < 3 && p.label[i]; i++) {
        x = KP_COLX[i];
        KP_TEXT(0, p.label[i], x, 16);
        if (p.type[i] == FADER) KP_FADER(0, x, 24, p.val[i], 0, p.max[i]);
        else if (p.type[i] == TOGGLE) KP_TOGGLE(0, p.val[i], x, 24);
        else KP_KNOB(0, KP_DIVD(p.val[i], p.max[i]), x, 24);
        KP_TEXT_R(0, p.text[i], x + 30, 48);
    }
    KP_SOFTKEY(0, "", 0);
    KP_SOFTKEY(1, KP_EXIT, 0);
    KP_SOFTKEY(2, KP_PAGE, 0);
    SHOWN = HOLD != 0;
}

/* Where the settings are saved. Bytes 0-16 of each 18-byte slot block of the
 * packed patch are the effect's (P8 reaches byte 15: effects with many params
 * use it), byte 17 is free:
 *   byte 17 bits 0-1: the bus of the slot (settings 12-17)
 *   byte 17 bits 2-6 of the six blocks (30 bits, 22 used; bit 6 of block 6 marks
 *     this layout, bit 7 stays 0: a SysEx round trip moves it): Input R ^ 100 (8),
 *     Master R ^ 100 (8), Output (2), Mute A, Mute B, Solo (2). The ^ 100:
 *     a stock patch (0 there) reads back as unity and Stereo / Off.
 * Settings 0-10 do not fit: they go in the global record 50, grown to 824 bytes
 * (R50: the stock 24 bytes, then one 16-byte entry per patch: the patch's hash,
 * settings 0-10, a pad). The hash (effect ids and name, not the params or
 * on / off) tells whether the record still is the patch the entry was saved
 * for: an editor or SysEx store of another patch gets the defaults, a copy
 * finds its original's entry. */
#define MAXES ((const unsigned char *)(MIXER_BASE + 296))     /* [24] */
#define R50_ENT(n) ((unsigned char *)R50 + 24 + 16 * (n))
#define REC_LOAD FN(0xC00B4AAC, int, (int id, void *buf))       /* 0: loaded */
#define REC_SAVE FN(0xC00B49F4, int, (int id, const void *buf))

static unsigned fnv(unsigned h, unsigned c) { return (h ^ c) * 16777619u; }

static unsigned r50_hash(const unsigned char *rec)
{
    unsigned h = 2166136261u;
    int i;
    for (i = 0; i < 6; i++) {           /* the effect id, bits 1-28 of the block */
        const unsigned char *b = rec + 18 * i;
        h = fnv(fnv(fnv(fnv(h, b[0] & 0xFE), b[1]), b[2]), b[3] & 0x1F);
    }
    for (i = 111; i < 122; i++) h = fnv(h, rec[i]);    /* the name */
    return h;
}

/* rec = packed patch, n = its record (patch number; else >= 50). Returns 1 for
 * a patch saved by M3b5 / M3b6 (settings 0-11 in bytes 14, 15): mixer.S then
 * masks P8 back to 12 bits. */
extern int perf_save(int patch); /* asm/perform/perform_store.c */
unsigned r50_live_hash;          /* the patch played: Perform keys its record 50 entry on it */

int mix_get(const unsigned char *rec, unsigned char *dst, int n)
{
    unsigned h = r50_hash(rec), w = 0;
    const unsigned char *src = 0;
    unsigned char old[12];
    int i, was_old = 0;
    int v2 = rec[18 * 5 + 17] >> 6 & 1;  /* 5-bit chunks; else a save before b70dc01, 6-bit ones */
    for (i = 0; i < 6; i++) {
        dst[12 + i] = rec[18 * i + 17] & 3;
        w |= v2 ? (unsigned)(rec[18 * i + 17] >> 2 & 31) << 5 * i
                : (unsigned)(rec[18 * i + 17] >> 2) << 6 * i;
        old[2 * i] = rec[18 * i + 14];
        old[2 * i + 1] = rec[18 * i + 15];
    }
    if ((unsigned)n < 50 && *(unsigned *)R50_ENT(n) == h)
        src = R50_ENT(n) + 4;
    else if (old[11] == MAGIC && old[10] <= 1 && old[0] <= 3)
        src = old, was_old = 1;
    else
        for (i = 0; i < 50 && !src; i++)
            if (*(unsigned *)R50_ENT(i) == h) src = R50_ENT(i) + 4;
    if ((void *)dst == (void *)LIVE) r50_live_hash = h;
    for (i = 0; i < 11; i++) dst[i] = src ? src[i] : DEFAULTS[i];
    dst[11] = MAGIC;
    dst[S_INR] = (w & 255) ^ 100;
    dst[S_MR] = (w >> 8 & 255) ^ 100;
    dst[S_OUT] = w >> 16 & 3;
    dst[S_MUTEA] = w >> 18 & 1;
    dst[S_MUTEB] = w >> 19 & 1;
    dst[S_SOLO] = w >> 20 & 3;
    for (i = 0; i < NSET; i++)
        if (dst[i] > MAXES[i]) dst[i] = DEFAULTS[i];
    return was_old;
}

/* Byte 17 of each block; for a patch record (n < 50) also its R50 entry.
 * Returns 1 when the entry changed: mixer.S then saves record 50. */
int mix_put(unsigned char *rec, const unsigned char *src, int n)
{
    unsigned w = (src[S_INR] ^ 100) | (src[S_MR] ^ 100) << 8 | src[S_OUT] << 16
               | src[S_MUTEA] << 18 | src[S_MUTEB] << 19 | src[S_SOLO] << 20;
    unsigned h;
    unsigned char *e;
    int i, changed;
    for (i = 0; i < 6; i++)
        rec[18 * i + 17] = (src[12 + i] & 3) | (w >> 5 * i & 31) << 2;
    rec[18 * 5 + 17] |= 0x40;           /* bit 7 stays 0: a SysEx round trip moved it into other bytes */
    if ((unsigned)n >= 50) return 0;
    e = R50_ENT(n);
    h = r50_hash(rec);
    changed = *(unsigned *)e != h;
    *(unsigned *)e = h;
    for (i = 0; i < 11; i++) {
        changed |= e[4 + i] != src[i];
        e[4 + i] = src[i];
    }
    if ((const void *)src == (const void *)LIVE) changed |= perf_save(n);   /* STORE: Perform too */
    return changed;
}

/* Record 50 (the globals) load and save: the callps at 0xC00BA798 and
 * 0xC00BA3F8 (A4 = 50, B4 = the stock 24 bytes). */
int r50_load(int id, unsigned char *buf)
{
    int r = REC_LOAD(id, (void *)R50), i;
    if (r)      /* none in flash: an empty table, the globals as stock has them */
        for (i = 0; i < R50_SIZE; i++) R50[i] = i < 24 ? buf[i] : 0;
    else
        for (i = 0; i < 24; i++) buf[i] = R50[i];
    return r;
}

int r50_save(int id, const unsigned char *buf)
{
    int i;
    for (i = 0; i < 24; i++) R50[i] = buf[i];
    return REC_SAVE(id, (const void *)R50);
}
