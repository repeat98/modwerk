/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Crossfader for the Digitakt I, OS 1.54 on Core 2.1.
 *
 * Each audio track and each external input (IN L, IN R) is in group A, group B or neither. One fader,
 * 0..127, fades between the two groups with an equal-power curve: at 0 group A plays at its own level
 * and group B is silent, at 127 the other way round, in the middle both at -3 dB.
 *
 * The fader is the LEVEL knob on the Internal Mixer page (FUNC + LFO, its second sub-page), shown in
 * the page's empty lower-left box, and a CC number of your choice on FX CONTROL CH.
 *
 * Where. The render's mixer (0x40071c20) loops over ten channels, tracks 1-8 then IN L and IN R, and
 * works out each one's gain first: from the track's level, from the input's IN level, or, with the
 * External Mixer global (SETTINGS > GLOBAL FX/MIX), the inputs' unity gain. All three meet at
 * 0x40071d86, where glue.s hands the gain to cxf_mix: the crossfade is the last layer on top of
 * whatever the levels and settings are, and the channel's delay and reverb sends follow it (they are
 * taken from the dry gains after it), except an input's with Input Pre-Fader Sends set to PRE.
 * The fader's amplitude is cos (group A) or sin (group B) of its angle, 0..90 degrees. The angle eases in
 * over the first fifth of the travel from either end, so a small move away from an end brings the
 * other group in gently; between those it follows the fader in a straight line.
 *
 * Settings: SETTINGS > CROSSFADER opens a page with the groups and the CC number; they are kept for
 * the whole unit on the +Drive (store.c) and loaded after power-on. */

typedef unsigned long u32;
typedef long s32;
typedef unsigned short u16;
typedef unsigned char u8;
#include "digitakt-mk1/stock_knob.h"
#define R32(a) (*(volatile u32 *)(a))

#define FW_RECT    0x400c1bce          /* (canvas, x0, y0, x1, y1, colour: 0 clear, 1 set, -1 invert) */
#define FW_TEXT    0x400c27e8          /* (canvas, font, x, y, mode, fmt, ...) */
#define FW_TEXT5   0x400c27a4          /* (canvas, rawfont, x, y, maxlen, fmt, ...) */
#define FONT5      ((const void *)0x40200ebc)
#define FONT_CELL  0x4208dc70
#define FONT_VALUE 0x4208dc60
#define FW_INVALIDATE 0x400c9a3a
#define RECT(c, x0, y0, x1, y1, k) ((void (*)(void *, s32, s32, s32, s32, s32))FW_RECT)((c), (x0), (y0), (x1), (y1), (k))
#define TEXT(c, f, x, y, ...) ((void (*)(void *, u32, s32, s32, s32, const char *, ...))FW_TEXT)((c), (f), (x), (y), 0, __VA_ARGS__)
#define TEXT5(c, x, y, ...) ((void (*)(void *, const void *, s32, s32, s32, const char *, ...))FW_TEXT5)((c), FONT5, (x), (y), -1, __VA_ARGS__)

#define FX_CH  0x4197c740               /* MIDI CONFIG > CHANNELS > FX CONTROL CH: 0-15, or off */
#define NWORDS 10                       /* tracks 1..8, IN L, IN R */
#define V_SHOWN 0x2c                    /* view: non-zero while it is on screen */
#define V_COVER 0x14                    /* view: non-zero low half while a menu or the recorder covers it */
#define V_SUB   144                     /* view: the sub-page shown */
#define IMIX_SUB 1                      /* the FX/mixer view's sub-page 2: Internal Mixer */

const u16 cxf_eqp[128] = { 32768, 32768, 32768, 32768, 32768, 32768, 32767, 32766, 32765, 32763, 32760, 32757, 32752, 32746, 32739, 32730, 32718, 32705, 32688, 32669, 32647, 32620, 32590, 32555, 32516, 32471, 32421, 32367, 32309, 32246, 32180, 32110, 32036, 31958, 31875, 31789, 31699, 31605, 31506, 31404, 31297, 31186, 31072, 30953, 30829, 30702, 30571, 30435, 30295, 30150, 30002, 29849, 29691, 29529, 29363, 29192, 29017, 28837, 28653, 28464, 28270, 28072, 27868, 27660, 27447, 27229, 27006, 26778, 26545, 26306, 26062, 25813, 25558, 25297, 25031, 24759, 24481, 24196, 23905, 23608, 23304, 22994, 22676, 22351, 22018, 21678, 21330, 20973, 20607, 20233, 19849, 19455, 19050, 18634, 18207, 17767, 17313, 16846, 16363, 15863, 15345, 14807, 14248, 13685, 13120, 12554, 11987, 11419, 10850, 10281, 9712, 9142, 8571, 8001, 7430, 6859, 6287, 5716, 5145, 4573, 4001, 3430, 2858, 2287, 1715, 1143, 572, 0 };    /* 32768 * sqrt(cos(w(x / 127) * pi / 2)), w: eases in over the first fifth from each end, then linear */

u8 cxf_group[NWORDS];                   /* 0 neither, 1 A, 2 B (store.c saves it) */
u32 cxf_cc = 128;                       /* the fader's CC on FX CONTROL CH; 128 = none */
volatile s32 cxf_in = -1;               /* the last value of that CC, from the MIDI input (glue.s) */
volatile s32 cxf_pos;                   /* the fader, 0..127 */
u32 cxf_view;                           /* the effects/mixer page view (glue.s, from its getTitle) */
u32 cxf_shownv;                         /* the view shown last, any kind (glue.s) */
u32 cxf_fmask;                          /* LEVEL is the fader on these tracks' pages: bit 0..7 tracks 1-8,
                                         * 8..15 the MIDI tracks (store.c) */
extern volatile u32 cxf_dirty;          /* store.c: ticks until the settings are saved */

volatile u32 cxf_blocks;                /* audio blocks since power-on (counted on channel 0) */
static s32 cur[NWORDS];                 /* each channel's crossfade gain now, 0..32768, ramping */
static u8 started;

static s32 amp(int x)                   /* the fader's amplitude for group A at x: cos, 0..32768 */
{
    s32 e = cxf_eqp[x];
    return (e * e) >> 15;
}

/* From the mixer (glue.s), once per channel per audio block: ch 0..7 the tracks, 8 and 9 the inputs,
 * gain the channel's gain as the mixer has made it (tracks, inputs through their IN levels, or the
 * inputs' unity gain). Returns it scaled by the crossfade. The gain ramps an eighth of the way each
 * block, so a jump of the fader (a CC, a fast turn) does not click. */
s32 cxf_mix(s32 ch, s32 gain)
{
    int x, g, i;
    s32 target, c;
    if ((u32)ch >= NWORDS)
        return gain;
    if (ch == 0) {
        s32 in = cxf_in;
        cxf_blocks++;
        if (in >= 0) {                  /* the fader's CC arrived: it moves the fader */
            cxf_in = -1;
            cxf_pos = in;
        }
        if (!started) {
            for (i = 0; i < NWORDS; i++) cur[i] = 32768;
            started = 1;
        }
    }
    if (!started)
        return gain;
    x = cxf_pos;
    if (x < 0) x = 0; else if (x > 127) x = 127;
    g = cxf_group[ch];
    target = !g ? 32768 : g == 1 ? amp(x) : amp(127 - x);
    c = cur[ch];
    c += (target - c) / 8;
    if (c - target < 8 && target - c < 8)
        c = target;
    cur[ch] = c;
    if (c >= 32768)
        return gain;
    return (gain >> 15) * c;
}

/* ---- the Internal Mixer page: the fader on LEVEL ---------------------------------------------- */

static int imix_shown(void)
{
    u32 v = cxf_view;
    return v && R32(v + V_SHOWN) && !(R32(v + V_COVER) & 0xffff) && R32(v + V_SUB) == IMIX_SUB;
}

/* A parameter page of a FADER ON track is on screen, uncovered: LEVEL is the fader there instead of the
 * track's level (on a MIDI track, where LEVEL does nothing). Menus cover the page, so LEVEL stays the
 * DATA knob in them. */
#define FW_SELECTED_TRACK 0x4001d24e    /* (TrackState) -> the track it shows */
/* The track pages' views, by class: TRIG, SRC, FLTR, AMP, LFO, the FUNC + FLTR / AMP setup pages and
 * the MIDI tracks' SRC, FLTR and AMP. Menus, the machine list and the mixers are other classes. */
#define VT_SRC 0x40184bd4
static const u32 page_vt[] = { 0x40184308, VT_SRC, 0x40184590, 0x4018444c, 0x401af858, 0x401846d4, 0x40183814 };
static u32 page;                        /* the track page shown last */
static int ftrack_shown(void)
{
    u32 v = cxf_shownv, t;
    int i;
    if (!cxf_fmask)
        return 0;
    if (v && v != page)
        for (i = 0; i < (int)(sizeof page_vt / sizeof page_vt[0]); i++)
            if (R32(v) == page_vt[i]) { page = v; break; }
    v = page;
    if (!v || !R32(v + V_SHOWN) || (R32(v + V_COVER) & 0xffff))
        return 0;
    if (R32(v) == VT_SRC) {             /* the machine list (FUNC + SRC) opens inside the SRC page, as a */
        u32 m = R32(v + 0x1a4);         /* view of its own; the pointer stays after it closes, so match */
        if (m && R32(m + V_SHOWN) == R32(v + V_SHOWN)) return 0;   /* its screen. Open: LEVEL scrolls it */
    }
    t = ((u32 (*)(u32))FW_SELECTED_TRACK)(R32(v + 0x74));   /* 0-7 the audio tracks, 8-15 MIDI */
    return t < 16 && ((cxf_fmask >> t) & 1);
}

int cxf_open;                           /* SETTINGS > CROSSFADER is up */
static int cursor;                      /* its row: 0..9 the groups, 10 the CC, 11 the FADER ON tracks */
static s32 counts;                      /* panel counts not yet a step (page knobs) */

/* The fader on LEVEL turns as a stock knob (stock_knob.h): the firmware's speed, pushed while turning
 * coarse, FUNC + turn to the middle, then to the end it turns towards. */
static dt_knobs knobs;
static int lfrac;
static u32 ticks;
static void fader_turn(void *ev)
{
    int jump, d = dt_knob(&knobs, ev, 8, DT_KNOB_FINE, &jump);
    if (!d) return;
    if (jump) { lfrac = 0; cxf_pos = dt_knob_jump(cxf_pos, d, 0, 127, DT_CENTRE); }
    else cxf_pos = dt_knob_apply(cxf_pos, &lfrac, d, 0, 127);
}

static void fader_draw(void *bmp)
{
    int x = 2 + (cxf_pos * 12 + 63) / 127;
    RECT(bmp, 0, 0, 18, 26, 0);
    TEXT5(bmp, 2, 18, "%3d", (int)cxf_pos);     /* the fader position, 0..127 */
    TEXT5(bmp, 1, 1, "A");
    TEXT5(bmp, 14, 1, "B");
    RECT(bmp, 2, 10, 16, 10, 1);
    RECT(bmp, 2, 8, 2, 12, 1);
    RECT(bmp, 16, 8, 16, 12, 1);
    RECT(bmp, x - 1, 7, x + 1, 13, 1);
}

static const char *const rowname[12] = { "TRACK 1", "TRACK 2", "TRACK 3", "TRACK 4", "TRACK 5", "TRACK 6", "TRACK 7", "TRACK 8", "INPUT L", "INPUT R", "FADER CC", "FADER ON" };

static void page_draw(void *bmp)
{
    int first = cursor < 3 ? 0 : (cursor > 8 ? 9 : cursor - 2), r;
    RECT(bmp, 0, 0, 127, 63, 0);
    TEXT5(bmp, 2, 56, "%s", "CROSSFADER");                /* the title bar, as on the song page */
    if (cursor == 11)
        TEXT5(bmp, 76, 56, "%s", "TRIG 1-16");          /* the trig keys pick the tracks */
    else
        TEXT5(bmp, 84, 56, "POS %3d", (int)cxf_pos);
    RECT(bmp, 0, 54, 127, 63, -1);
    TEXT5(bmp, 6, 46, "%s", "SOURCE");                    /* the column heads */
    TEXT5(bmp, 74, 46, "%s", "GROUP");
    RECT(bmp, 0, 44, 127, 44, 1);
    for (r = 0; r < 3; r++) {
        int i = first + r, y = 31 - r * 13;
        if (i > 11) break;
        TEXT(bmp, FONT_CELL, 6, y, "%s", rowname[i]);
        if (i < 10)
            TEXT(bmp, FONT_CELL, 80, y, "%s", cxf_group[i] == 1 ? "A" : cxf_group[i] == 2 ? "B" : "-");
        else if (i == 11) {                             /* LEVEL on these tracks' pages: the fader */
            int k;                                      /* a box per track: 1-8 above, MIDI below */
            for (k = 0; k < 16; k++) {
                int x = 75 + (k & 7) * 4 + (k & 7) / 4 * 2, yb = k < 8 ? y + 5 : y;
                RECT(bmp, x, yb, x + 2, yb + 3, 1);
                if (!((cxf_fmask >> k) & 1))
                    RECT(bmp, x + 1, yb + 1, x + 1, yb + 2, 0);
            }
        }
        else if (cxf_cc > 127)
            TEXT(bmp, FONT_CELL, 80, y, "%s", "OFF");
        else {
            s32 ch = *(volatile s32 *)FX_CH;
            TEXT(bmp, FONT_CELL, 80, y, "%d", (int)cxf_cc);
            if (ch >= 0 && ch < 16)                     /* where it listens: FX CONTROL CH */
                TEXT5(bmp, 96, y + 1, "CH%d", (int)ch + 1);
            else
                TEXT5(bmp, 96, y + 1, "%s", "CH-");
        }
        if (i == cursor)
            RECT(bmp, 72, y - 2, 112, y + 9, -1);       /* the cell under the cursor */
    }
    if (first > 0) RECT(bmp, 121, 40, 123, 41, 1);       /* more above / below */
    if (first + 3 <= 11) RECT(bmp, 121, 2, 123, 3, 1);
}

void cxf_draw(void *bmp, void *ctrl)    /* ev_draw */
{
    (void)ctrl;
    if (cxf_open)
        page_draw(bmp);
    else if (imix_shown() || ftrack_shown())
        fader_draw(bmp);                /* over the track's level bar, which LEVEL no longer moves */
}

void cxf_tick(u8 *ctrl);                /* store.c */
static s32 drawn_pos = -1;
void cxf_uitick(u8 *ctrl)               /* ev_tick */
{
    if (cxf_open || (cxf_pos != drawn_pos && (imix_shown() || ftrack_shown())))
        ctrl[0x20] = 1;                 /* redraw: the page, or the fader box after the fader moved */
    drawn_pos = cxf_pos;
    ticks++;
    cxf_tick(ctrl);
}

static void step(int s)
{
    if (cursor < 10) {
        int g = cxf_group[cursor] + s;
        if (g < 0 || g > 2) return;
        cxf_group[cursor] = (u8)g;
    } else if (cursor == 11) {
        return;                                         /* the trig keys set this row */
    } else {
        int c = (cxf_cc > 127 ? 128 : (int)cxf_cc) + s;
        if (c < 0 || c > 128) return;
        cxf_cc = (u32)c;
    }
    cxf_dirty = 30;
}

#define KEYID(ev)   (*(int *)((char *)(ev) + 12))
#define KEYDOWN(ev) (*(int *)((char *)(ev) + 16) & 1)

int cxf_key(void *brain, void *ev)      /* ev_key */
{
    int id = KEYID(ev);
    (void)brain;
    if (!cxf_open)                      /* where LEVEL is the fader, pushing it (48, press and release) does */
        return id == 48 && (imix_shown() || ftrack_shown());   /* nothing, so a fade never opens the sound browser */
    if (id == 9 || id == 10 || id == 11)                /* REC, PLAY, STOP still work */
        return 0;
    if (!KEYDOWN(ev))
        return 1;
    if (id >= 24 && id < 40) {                          /* trig keys 1-16: on FADER ON, toggle that track */
        if (cursor == 11) { cxf_fmask ^= 1u << (id - 24); cxf_dirty = 30; }
        return 1;
    }
    switch (id) {
    case 13: cxf_open = 0; break;                       /* NO: leave */
    case 14: if (cursor > 0) cursor--; counts = 0; break;   /* UP */
    case 15: if (cursor < 11) cursor++; counts = 0; break;  /* DOWN */
    case 16: step(-1); break;                           /* LEFT */
    case 17: step(1); break;                            /* RIGHT */
    default: break;
    }
    return 1;
}

int cxf_enc(void *brain, void *ev)      /* ev_enc */
{
    int id = KEYID(ev), delta = *(int *)((char *)ev + 16);
    (void)brain;
    if (cxf_open) {
        if (!delta) return 1;
        if (id == 9) {                                  /* LEVEL: the fader, as on the Internal Mixer */
            fader_turn(ev);
            return 1;
        }
        counts += delta;                                /* any knob: the value, a step per 4 counts */
        while (counts >= 4) { step(1); counts -= 4; }
        while (counts <= -4) { step(-1); counts += 4; }
        return 1;
    }
    if (id == 9 && (imix_shown() || ftrack_shown())) {
        fader_turn(ev);
        return 1;
    }
    return 0;
}

void cxf_select(void **payload)         /* YES on the SETTINGS row */
{
    cxf_open = 1;
    cursor = 0;
    counts = 0;
    ((void (*)(void *))FW_INVALIDATE)((char *)*payload + 0x38);
}

void cxf_change(void **payload, int unused, int delta)
{
    (void)unused; (void)delta;
    ((void (*)(void *))FW_INVALIDATE)((char *)*payload + 0x38);
}

void cxf_rowdraw(void *a, void *b, void *bmp, int x, int y)
{
    int i, n = 0;
    (void)a; (void)b;
    for (i = 0; i < NWORDS; i++) if (cxf_group[i]) n++;
    TEXT5(bmp, x + 58, y, "%d", n);
}
