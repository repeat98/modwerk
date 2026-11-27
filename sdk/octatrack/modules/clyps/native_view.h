/* SPDX-License-Identifier: GPL-3.0-or-later
 * CLYPS Design System v1 (D31): Clip View Native Frame and Panorama Full Grid.
 * Port of the CLYPS Art Direction Refinement v1.4 reference renderer onto the candidate state.
 * The frame arrives with the stock page already drawn. Clip keeps the stock track tabs, frame,
 * top line and Scene/crossfader; Panorama keeps only Scene/crossfader, moved 11 px right.
 * Column-major surface: byte x*8 + 7 - (y>>3), bit y&7.
 */
#include "ui_fonts.h"

#define TEMPO24 LONG(0x8000181cu)              /* BPM x 24, as AMIGA reads it */
#define MASTER_STEP ((unsigned)BYTE(0x800065b4u) << 8 | BYTE(0x800065b5u))  /* u16 step now playing (Bar LED) */
#define PLAY_BANK BYTE(0x800065bdu)
#define PLAY_PATTERN BYTE(0x800065beu)

static void ui_px(unsigned char *f, int x, int y, int v)
{
    if ((unsigned)x >= 128 || (unsigned)y >= 64) return;
    unsigned char *b = &f[x * 8 + 7 - (y >> 3)];
    unsigned char m = (unsigned char)(1u << (y & 7));
    if (v) *b |= m; else *b &= (unsigned char)~m;
}
/* Rectangles by column and band: one masked byte per 8-pixel band instead of one call per pixel. */
static void ui_fill(unsigned char *f, int x, int y, int w, int h, int v)
{
    int x1 = x + w, y1 = y + h - 1;
    if (x < 0) x = 0;
    if (y < 0) y = 0;
    if (x1 > 128) x1 = 128;
    if (y1 > 63) y1 = 63;
    if (x >= x1 || y > y1) return;
    for (int band = y >> 3; band <= y1 >> 3; ++band) {
        int lo = band * 8 > y ? 0 : y & 7, hi = band * 8 + 7 < y1 ? 7 : y1 & 7;
        unsigned char m = (unsigned char)((0xffu << lo) & (0xffu >> (7 - hi)));
        unsigned char *b = f + x * 8 + 7 - band;
        for (int i = x; i < x1; ++i, b += 8) {
            if (v) *b |= m; else *b &= (unsigned char)~m;
        }
    }
}
static void ui_hline(unsigned char *f, int x, int y, int w, int v) { ui_fill(f, x, y, w, 1, v); }
static void ui_vline(unsigned char *f, int x, int y, int h, int v) { ui_fill(f, x, y, 1, h, v); }
static void ui_rect(unsigned char *f, int x, int y, int w, int h)
{
    ui_hline(f, x, y, w, 1); ui_hline(f, x, y + h - 1, w, 1); ui_vline(f, x, y, h, 1); ui_vline(f, x + w - 1, y, h, 1);
}
/* Surface with the four corner pixels cut: the one plate shape of the language. */
static void ui_plate(unsigned char *f, int x, int y, int w, int h)
{
    ui_fill(f, x, y, w, h, 1);
    ui_px(f, x, y, 0); ui_px(f, x + w - 1, y, 0); ui_px(f, x, y + h - 1, 0); ui_px(f, x + w - 1, y + h - 1, 0);
}
static void ui_contour(unsigned char *f, int x, int y, int w, int h)   /* pending */
{
    ui_hline(f, x + 1, y, w - 2, 1); ui_hline(f, x + 1, y + h - 1, w - 2, 1);
    ui_vline(f, x, y + 1, h - 2, 1); ui_vline(f, x + w - 1, y + 1, h - 2, 1);
}
static void ui_dotted(unsigned char *f, int x, int y, int w, int h)    /* SET, phase from the origin */
{
    for (int i = 1; i < w - 1; ++i) {
        if (!((x + i + y) & 1)) ui_px(f, x + i, y, 1);
        if (!((x + i + y + h - 1) & 1)) ui_px(f, x + i, y + h - 1, 1);
    }
    for (int j = 1; j < h - 1; ++j) {
        if (!((x + y + j) & 1)) ui_px(f, x, y + j, 1);
        if (!((x + w - 1 + y + j) & 1)) ui_px(f, x + w - 1, y + j, 1);
    }
}
static void ui_corner(unsigned char *f, int cx, int cy, int dx, int dy, int v)
{
    ui_px(f, cx, cy, v); ui_px(f, cx + dx, cy, v); ui_px(f, cx, cy + dy, v);
}
static void ui_corners(unsigned char *f, int x, int y, int w, int h)  /* focus */
{
    int r = x + w - 1, b = y + h - 1;
    ui_corner(f, x, y, 1, 1, 1); ui_corner(f, r, y, -1, 1, 1); ui_corner(f, x, b, 1, -1, 1); ui_corner(f, r, b, -1, -1, 1);
}
static const unsigned char *ui_glyph(const struct ui_font *font, char c)
{
    if (c >= '0' && c <= '9')                                   /* every font starts with the digits */
        return font->data + (unsigned)(c - '0') * (1u + font->height);
    for (unsigned i = 10; font->chars[i]; ++i)
        if (font->chars[i] == c) return font->data + i * (1u + font->height);
    return font->data;                                          /* never reached for the strings below */
}
/* One glyph column, rows 0..h-1 as bits 0..h-1, written into at most two band bytes. */
static void ui_column(unsigned char *f, int x, int y, unsigned bits, int v)
{
    if ((unsigned)x >= 128 || y < 0) return;
    unsigned long m = (unsigned long)bits << (y & 7);
    for (int band = y >> 3; m && band < 8; ++band, m >>= 8) {
        unsigned char *b = f + x * 8 + 7 - band, part = (unsigned char)(m & 0xffu);
        if (v) *b |= part; else *b &= (unsigned char)~part;
    }
}
static int ui_width(const struct ui_font *font, const char *s)
{
    int w = 0;
    for (; *s; ++s) w += ui_glyph(font, *s)[0] + font->track;
    return w ? w - font->track : 0;
}
static int ui_text(unsigned char *f, const char *s, int x, int y, const struct ui_font *font, int v)
{
    int x0 = x;
    for (; *s; ++s) {
        const unsigned char *g = ui_glyph(font, *s);
        for (unsigned i = 0; i < g[0]; ++i) {
            unsigned bits = 0;
            for (unsigned r = 0; r < font->height; ++r) bits |= (g[1 + r] >> (g[0] - 1 - i) & 1u) << r;
            if (bits) ui_column(f, x + (int)i, y, bits, v);
        }
        x += g[0] + font->track;
    }
    return x - font->track - x0;
}
static void ui_text_r(unsigned char *f, const char *s, int right, int y, const struct ui_font *font, int v)
{
    ui_text(f, s, right - ui_width(font, s) + 1, y, font, v);
}
static int ui_mark(unsigned char *f, enum ui_mark m, int x, int y, int v)
{
    const unsigned char *g = ui_mark_data;
    for (int n = 0; n < (int)m; ++n) g += 2 + g[1];
    for (unsigned r = 0; r < g[1]; ++r)
        for (unsigned i = 0; i < g[0]; ++i)
            if (g[2 + r] >> (g[0] - 1 - i) & 1) ui_px(f, x + (int)i, y + (int)r, v);
    return g[0];
}
static void ui_two(char *s, unsigned n) { s[0] = (char)('0' + n / 10); s[1] = (char)('0' + n % 10); s[2] = 0; }
/* Slot content (D37.02, one model for every view): a source with no sequence on the track is a
 * single dot where its number would be, a source that is not a 16-step grid (it cannot launch)
 * a small x. Both stay reachable; a Panorama cell of an undefined Row keeps its dash. */
static void ui_slot_mark(unsigned char *f, unsigned state, int cx, int cy, int v)
{
    if (state == SLOT_EMPTY) { ui_px(f, cx, cy, v); return; }
    ui_px(f, cx - 1, cy - 1, v); ui_px(f, cx + 1, cy - 1, v); ui_px(f, cx, cy, v);
    ui_px(f, cx - 1, cy + 1, v); ui_px(f, cx + 1, cy + 1, v);
}

/* ---------------------------------------------------------------- shared reading of the state */
struct ui_state {
    uint32_t play, req, op[2], oq[2];         /* op/oq: provenance of playing/requested (D33) */
    unsigned pos, pend, next, run;            /* rows one-based, 0 = none; run: 0 stop, 1 play, 2 pause */
};
static struct ui_state ui_snapshot(void)
{
    struct ui_state s;
    unsigned sr = critical();
    s.play = playing; s.req = requested; s.pos = last_row; s.pend = pending_row;
    s.op[0] = org_play[0]; s.op[1] = org_play[1]; s.oq[0] = org_req[0]; s.oq[1] = org_req[1];
    restore(sr);
    s.run = RUNNING;
    if (s.run > 2) s.run = 1;
    s.next = 0;
    for (unsigned i = s.pos; i < 16; ++i)       /* the same forward scan as YES */
        if (defined & (1u << i)) { s.next = i + 1; break; }
    return s;
}
static unsigned ui_from(const uint32_t *o, unsigned lane) { return (o[lane >> 2] >> (8 * (lane & 3))) & 255u; }
/* A lane overrides the path when it does not come from the position Row (by provenance, never by value). */
static int ui_override(const struct ui_state *s, unsigned lane)
{
    return s->pos && ui_from(s->op, lane) != s->pos;
}
static int ui_changing(const struct ui_state *s, unsigned lane)
{
    return source(s->req, lane) != source(s->play, lane);
}
/* Pending for a lane: its source changes, or a Cell Launch moves its origin to another Row.
 * Lanes of a pending Row transaction count only when their source changes (Design Lock v1.4). */
static int ui_moving(const struct ui_state *s, unsigned lane)
{
    unsigned oq = ui_from(s->oq, lane);
    return ui_changing(s, lane) || (oq != ui_from(s->op, lane) && (!oq || oq != s->pend));
}

/* Bar: CLYPS writes only the page-context part; the stock group stays live. */
static void ui_bar(unsigned char *f, int x0, int x1, const char *a, int mark, const char *b, const char *c)
{
    ui_fill(f, x0, 57, x1 - x0 + 1, 7, 1);
    int x = x0 + 2;
    if (a) x += ui_text(f, a, x, 58, &UI_M3, 0) + 3;
    if (mark >= 0) x += ui_mark(f, (enum ui_mark)mark, x, 58, 0) + 3;
    if (b) x += ui_text(f, b, x, 58, &UI_M3, 0) + 3;
    if (c) ui_text(f, c, x, 58, &UI_M3, 0);
}
static void ui_path(char *s, const struct ui_state *st)
{
    int n = 0;
    if (st->pos) { s[n++] = 'R'; ui_two(s + n, st->pos); n += 2; } else { s[n++] = '-'; s[n++] = '-'; }
    s[n++] = '>';
    if (st->next) { s[n++] = 'R'; ui_two(s + n, st->next); } else { s[n++] = 'E'; s[n++] = 'N'; s[n++] = 'D'; s[n] = 0; }
}

/* ---------------------------------------------------------------- Clip View · Native Frame */
static void clip_native_draw(unsigned char *f)
{
    struct ui_state st = ui_snapshot();
    /* Clear only the CLYPS area x 9-119, y 1-56; tabs, frame, top line and bar stay stock. */
    ui_fill(f, 9, 1, 111, 56, 0);
    char path[8], word[8];
    unsigned focus = src_cursor, now = source(st.play, track), want = source(st.req, track);
    int idle = focus != now && focus != want;   /* the focus names a source that YES would launch */
    ui_path(path, &st);
    if (idle && slot_state(track, focus) == SLOT_FOREIGN) {
        word[0] = 'A'; ui_two(word + 1, focus + 1); ui_bar(f, 10, 63, word, -1, "NOT GRID", 0);
    } else if (idle) { word[0] = 'Y'; word[1] = 'E'; word[2] = 'S'; word[3] = '>'; word[4] = 'A'; ui_two(word + 5, focus + 1); ui_bar(f, 10, 63, word, -1, 0, 0); }
    else ui_bar(f, 10, 63, path, -1, 0, 0);
    /* tempo plate, digits on the SRC page proportions */
    ui_plate(f, 11, 3, 28, 17);
    unsigned t24 = TEMPO24, bpm = t24 / 24, dec = ((t24 % 24) * 10 + 12) / 24;
    if (dec > 9) dec = 9;
    char n[4]; n[0] = (char)('0' + bpm / 100); n[1] = (char)('0' + bpm / 10 % 10); n[2] = (char)('0' + bpm % 10); n[3] = 0;
    ui_text_r(f, bpm >= 100 ? n : n + 1, 30, 5, &UI_B8, 0);
    ui_px(f, 32, 12, 0);
    char d[2] = {(char)('0' + dec), 0}; ui_text(f, d, 34, 8, &UI_M3, 0);
    unsigned beat = (MASTER_STEP / 4) & 3;
    for (int b = 0; b < 4; ++b) {
        int x = 14 + 6 * b;
        if (st.run && (unsigned)b == beat) ui_fill(f, x, 15, 5, 3, 0); else ui_hline(f, x, 17, 5, 0);
    }
    ui_mark(f, st.run == 1 ? MARK_PLAY : st.run == 2 ? MARK_PAUSE : MARK_STOP, 14, 24, 1);   /* U1: pause is not play */
    ui_mark(f, GRID_REC || LIVE_REC ? MARK_DISC : MARK_RING, 30, 24, 1);
    /* Sidebar (D43.02): the plate is the source this track plays now, committed at the boundary
     * (filled while running, dotted stopped). The line under it is the source that waits for the
     * next boundary (NXT, pulsing on the beat), else the native home pattern CLYPS never changes
     * (HOM). The focus is only the grid corners and YES>Ann in the bar. */
    char src[4] = {'A', 0, 0, 0}; ui_two(src + 1, now + 1);
    if (st.run) { ui_plate(f, 11, 35, 28, 11); ui_text(f, src, 17, 37, &UI_C7, 0); }
    else { ui_dotted(f, 11, 35, 28, 11); ui_text(f, src, 17, 37, &UI_C7, 1); }
    char low[4] = {'A', 0, 0, 0};
    if (want != now) {
        /* Pending is always an outline, never filled (filled = playing). The gentle beat-locked
         * pulse only adds a second outline around it on odd beats while running; no timer. */
        int pulse = st.run == 1 && (beat & 1);
        ui_two(low + 1, want + 1);
        ui_contour(f, 11, 49, 28, 7);
        if (pulse) ui_contour(f, 10, 48, 30, 9);
        ui_text(f, "NXT", 13, 50, &UI_M3, 1); ui_text_r(f, low, 37, 50, &UI_M3, 1);
    } else {
        low[0] = (char)('A' + (PLAY_BANK & 15)); ui_two(low + 1, (PLAY_PATTERN & 15) + 1);
        ui_text(f, "HOM", 13, 50, &UI_M3, 1); ui_text_r(f, low, 37, 50, &UI_M3, 1);   /* 25 px, as NXT */
    }
    ui_vline(f, 42, 1, 56, 1);
    unsigned home = ui_override(&st, track) ? source(rows[st.pos - 1], track) : 16;
    for (unsigned i = 0; i < 16; ++i) {
        int xb = 47 + 18 * (int)(i % 4), yb = 8 + 11 * (int)(i / 4);
        unsigned content = slot_state(track, i);
        char lab[3]; ui_two(lab, i + 1);
        int fill = i == now && st.run;
        if (fill) ui_plate(f, xb, yb, 15, 9);
        else if (i == now) ui_dotted(f, xb, yb, 15, 9);
        else if (i == want) ui_contour(f, xb, yb, 15, 9);
        if (content == SLOT_AVAILABLE) ui_text(f, lab, xb + 2, yb + 1, &UI_C7, !fill);
        else ui_slot_mark(f, content, xb + 7, yb + 4, !fill);
        if (i == focus) ui_corners(f, xb - 2, yb - 1, 19, 11);
        if (i == home) ui_vline(f, xb, yb + 1, 7, 1);
    }
}

/* ---------------------------------------------------------------- Panorama · Full Grid */
#define UI_ROWS 5
#define GX(i) (15 + 14 * (int)(i))
#define CY(k) (7 + 10 * (int)(k))
static void panorama_draw(unsigned char *f)
{
    struct ui_state st = ui_snapshot();
    /* Scene A/B and crossfader: the stock group at x 64-116, rows 57-63 of band 7, moves 11 px right
     * (to end on the grid edge). Row 56 (bit 0) belongs to CLYPS and is not copied. */
    for (int x = 116; x >= 64; --x) {
        unsigned char *dst = &f[(x + 11) * 8], src = f[x * 8];
        *dst = (unsigned char)((*dst & 1u) | (src & 0xfeu));
    }
    ui_fill(f, 0, 0, 128, 57, 0);                   /* no F/S tabs: CLYPS owns x 0-127, y 0-56 */
    unsigned first = first_row > 16 - UI_ROWS ? 16 - UI_ROWS : first_row;
    #define VISIBLE(r) ((r) && (r) - 1 >= first && (r) - 1 < first + UI_ROWS)
    /* Exceptions (D33): a lane whose playing or pending origin has no visible cell. The header
     * keeps T1-T8; the exception is its shape, the source of the focused lane is in the bar. */
    unsigned active = st.play | st.req | st.op[0] | st.op[1] | st.oq[0] | st.oq[1];
    unsigned play_exc = 0, pend_exc = 0;
    for (unsigned i = 0; i < 8; ++i) {
        unsigned op = ui_from(st.op, i), oq = ui_from(st.oq, i);
        if (active && (!op || !VISIBLE(op))) play_exc |= 1u << i;
        if (ui_moving(&st, i) && !(oq && VISIBLE(oq))) pend_exc |= 1u << i;
    }
    char path[8], bpm[4], detail[8] = {0};
    unsigned focus = slot + 1;
    /* Contextual footer (artist decision, option C): BPM and transport always stay. The rest
     * speaks about the focused Row. On the position Row it keeps the YES path R02>R03 (Row
     * Advance stays a separate action); on another Row it names the Row and its state (WAIT
     * pending, EMPTY undefined, NEXT on the YES path) or the TRIG that launches it. Nothing
     * permanent is added to the grid. */
    if (focus == st.pos && focus != st.pend) {
        ui_path(path, &st);
        if (pend_exc >> track & 1) { detail[0] = '>'; detail[1] = 'A'; ui_two(detail + 2, source(st.req, track) + 1); }
        else if (play_exc >> track & 1) { detail[0] = 'A'; ui_two(detail + 1, source(st.play, track) + 1); }
    } else {
        const char *word = focus == st.pend ? "WAIT" : !(defined >> slot & 1u) ? "EMPTY" :
                           focus == st.next ? "NEXT" : 0;
        path[0] = 'R'; ui_two(path + 1, focus);
        if (word) { unsigned n = 0; while (word[n]) { detail[n] = word[n]; ++n; } }
        else { detail[0] = 'T'; detail[1] = 'R'; detail[2] = 'I'; detail[3] = 'G'; ui_two(detail + 4, focus); if (focus < 10) { detail[4] = detail[5]; detail[5] = 0; } }
    }
    unsigned b = TEMPO24 / 24; bpm[0] = (char)('0' + b / 100); bpm[1] = (char)('0' + b / 10 % 10); bpm[2] = (char)('0' + b % 10); bpm[3] = 0;
    ui_bar(f, 0, 74, b >= 100 ? bpm : bpm + 1, st.run == 1 ? MARK_PLAY5 : st.run == 2 ? MARK_PAUSE5 : MARK_STOP5, path, detail[0] ? detail : 0);
    for (int k = 0; k < UI_ROWS; ++k) ui_hline(f, 15, 6 + 10 * k, 113, 1);
    for (int i = 0; i <= 8; ++i) ui_vline(f, GX(i), 6, 50, 1);
    unsigned important = st.pend && !VISIBLE(st.pend) ? st.pend : st.next && !VISIBLE(st.next) ? st.next :
                         st.pos && !VISIBLE(st.pos) ? st.pos : !VISIBLE(slot + 1) ? slot + 1 : 0;
    char two[3];
    if (important) { ui_mark(f, important - 1 > first ? MARK_DOWN : MARK_UP, 2, 2, 1); ui_two(two, important); ui_text(f, two, 8, 1, &UI_M3, 1); }
    else ui_text(f, "R", 6, 1, &UI_K5, 1);
    for (unsigned i = 0; i < 8; ++i) {
        int x = GX(i) + 1, play = play_exc >> i & 1;
        char t[3] = {'T', (char)('1' + i), 0};
        int tx = GX(i) + 4;
        if (play && st.run) {                                   /* playing from a Row out of view */
            ui_plate(f, x + 1, 0, 11, 6); ui_text(f, t, tx, 1, &UI_K5, 0);
            if (!ui_from(st.op, i)) ui_hline(f, x + 5, 0, 3, 0);  /* notch: no Row origin (override) */
        } else {
            if (play) ui_dotted(f, x + 1, 0, 11, 6);
            ui_text(f, t, tx, 1, &UI_K5, 1);
        }
        if (pend_exc >> i & 1) { ui_hline(f, x, 0, 13, 1); ui_vline(f, x, 0, 6, 1); ui_vline(f, x + 12, 0, 6, 1); }
    }
    for (unsigned k = 0; k < UI_ROWS; ++k) {
        unsigned r = first + k + 1, def = !!(defined & (1u << (r - 1)));
        int y = CY(k);
        ui_two(two, r);
        /* Row number column: plate = position Row, frame = pending Row, corners = focused Row. */
        if (r == st.pos) { ui_plate(f, 3, y + 1, 11, 7); ui_text(f, two, 4, y + 2, &UI_K5, 0); }
        else ui_text(f, two, 4, y + 2, &UI_K5, 1);
        if (r == st.pend) ui_rect(f, 2, y, 13, 9);
        else if (r == focus) ui_corners(f, 2, y, 13, 9);
        if (r == st.next) ui_mark(f, MARK_NEXT, 0, y + 2, 1);
        for (unsigned i = 0; i < 8; ++i) {
            int x = GX(i) + 1;
            unsigned value = source(rows[r - 1], i), content = slot_state(i, value);
            int lit = def && ui_from(st.op, i) == r;                    /* only the real origin lights */
            int pend = ui_from(st.oq, i) == r && ui_moving(&st, i);
            int fill = lit && st.run && !pend;
            if (fill) ui_plate(f, x + 1, y + 1, 11, 7);
            else if (pend) ui_rect(f, x, y, 13, 9);
            else if (lit) ui_dotted(f, x + 1, y + 1, 11, 7);
            if (!def) ui_hline(f, x + 5, y + 4, 3, 1);
            else if (content == SLOT_AVAILABLE) { ui_two(two, value + 1); ui_text(f, two, x + 2, y + 2, &UI_K5, !fill); }
            else ui_slot_mark(f, content, x + 6, y + 4, !fill);
            if (r == slot + 1 && i == track) {                          /* focus: the cell border opens */
                int bx = GX(i), by = y - 1;
                ui_hline(f, bx + 3, by, 9, 0); if (by + 10 < 56) ui_hline(f, bx + 3, by + 10, 9, 0);
                ui_vline(f, bx, by + 3, 5, 0); ui_vline(f, bx + 14, by + 3, 5, 0);
                ui_corner(f, bx + 1, by + 1, 1, 1, 1); ui_corner(f, bx + 13, by + 1, -1, 1, 1);
                ui_corner(f, bx + 1, by + 9, 1, -1, 1); ui_corner(f, bx + 13, by + 9, -1, -1, 1);
            }
        }
    }
    #undef VISIBLE
}
