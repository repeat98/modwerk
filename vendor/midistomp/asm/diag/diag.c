/* SYSTEM (MS-70CDR 2.10 OS): DSP and CPU meters in the MENU title bar and 4 pages on the
 * VERSION screen (screen 9, menu entry SYSTEM). docs/dev/diagnostics-plan.md.
 * Audio side: diag_end, called by asm/mixer/engine.c at the end of each block while the
 * SYSTEM screen or the MENU list is open (diag_poll sets MAGIC; zero cost otherwise), sums 4096
 * blocks (0.74 s) and publishes the averages. TSCL stops while the OS idles, so the TSCL
 * period between two block starts counts busy cycles only: period / 54422 = CPU load.
 * Built by scripts/build_diag_ui.py. No libc, no RTS (no / % by variables), no B14. */

#define FN(addr, ret, args) ((ret (*) args)(addr))
#define B14 0xC00EF748u
#define MODE (*(volatile int *)(B14 + 320))               /* 11 = menu */
#define SCREEN (*(volatile int *)(B14 + 352))             /* 0 menu list, 9 version */
#define UI_EVENT (*(volatile int *)(B14 + 656))
#define FB ((volatile unsigned char *)0x11816800)         /* page format: 128 bytes per 8 rows */
#define FB_DIRTY (*(volatile unsigned char *)0xC00EEBB0)  /* bit = 8-row page to send */
#define TITLE FN(0xC00A7378, void, (const char *))
#define DRAW_TEXT FN(0xC009FCE0, void, (int, const char *, int, int))   /* 6-px font */
#define SNPRINTF FN(0xC00DDEE0, int, (char *, int, const char *, ...))
#define EVENT_POST FN(0xC00CBF40, void, (int, int))
#define POLL_TRAMP FN(0xC00C82D0, int, (void))            /* midi-clock.yaml, to poll.S */
#define SOFTKEY FN(0xC009F8F0, void, (int, const char *, int))   /* (knob, text, 0) */
#define DRAW_ARROWS FN(0xC00A7400, void, (int))           /* the stock list's up/down arrows above a knob */
#define SCROLLBAR FN(0xC00A8874, void, (int, int))       /* (top, rows) */
#define STR_EXIT ((const char *)0xC00E90FC)
#define STR_BLANK ((const char *)0xC00E9101)
#define MENU_DRAW FN(0xC00C1FC4, int, (int, int, int, int))   /* menu draw trampoline */
#define BATTERY_LEVEL FN(0xC00D7260, int, (void))         /* 0..4 on battery, 5+ no icon */
#define FX_TABLE ((volatile unsigned *)0xC00EE930)        /* audio function of each slot */
#define FX_EMPTY 0xC00E0780u
#define FX_MUTE 0xC00E0784u                               /* an effect is loading */
#define DESC(s) (*(volatile unsigned *)(0xC0064E04u + 28 * (s)))   /* ZDL descriptor */
#define LOOPER_SLOT (*(volatile int *)(0xC00F3028u))      /* looper services +40: GRDLOOP slot, -1 none */
#define MAGIC (*(volatile unsigned *)0xC00F3128u)       /* diag_vec.asm +40: engine.c calls diag_end while "DIAG" */
#define MS_LOAD(k) (*(volatile int *)(0xC010A024u + 4 * (k)))   /* master_vec.asm +36: MASTER, KALEIDO CPU, tenths of % */
#define STAMP(i) ((const char *)(0xC00F3140u + 16 * (i))) /* diag_vec.asm: version, commit, date, label */

extern __cregister volatile unsigned int TSCL;

#define PERIOD 54422.0f         /* cycles per 8-frame block: 300 MHz x 8 / 44100 */
#define LATE 60000u             /* a longer period: the block started late */
#define WIN 12                  /* 1 << WIN blocks per window */

/* ---- audio side ------------------------------------------------------------------------ */
static unsigned w_n, w_per, w_ch, w_chmax, w_own, w_cyc[7], w_late;
static unsigned prev, own, late_total, polls;
static volatile int restart;            /* diag_poll turned the timing on: skip a block */
static struct { unsigned per, ch, chmax, own, cyc[7], late, win, midi; } pub;
static volatile unsigned aud_total;     /* busy cycles of all blocks so far (chain + diag) */
static volatile unsigned m_acc;         /* Task_MIDI's cycles so far, audio taken out */
static unsigned m_last, m_t, m_aud;
static int m_on;                        /* m_t is from this timing run */
unsigned diag_b3;                       /* diag_vec.asm: Task_MIDI's return address */

/* t0: TSCL at engine_run's start. cyc: [0] perf_block, [1 + s] slot s this block. */
void diag_end(unsigned t0, unsigned *cyc)
{
    unsigned t1 = TSCL, per = t0 - prev, ch = t1 - t0;
    int i;
    prev = t0;
    if (restart) {              /* the first block after the timing turned on has no period */
        restart = 0;
        w_n = w_per = w_ch = w_chmax = w_own = w_late = 0;
        for (i = 0; i < 7; i++) w_cyc[i] = 0;
        m_last = m_acc;
    } else {
        if (per > LATE) { w_late++; late_total++; }
        w_per += per;
        w_ch += ch;
        if (ch > w_chmax) w_chmax = ch;
        w_own += own;
        for (i = 0; i < 7; i++) w_cyc[i] += cyc[i];
        if (++w_n == 1u << WIN) {
            pub.per = w_per >> WIN;
            pub.ch = w_ch >> WIN;
            pub.chmax = w_chmax;
            pub.own = w_own >> WIN;
            for (i = 0; i < 7; i++) { pub.cyc[i] = w_cyc[i] >> WIN; w_cyc[i] = 0; }
            pub.late = w_late;
            pub.midi = (m_acc - m_last) >> WIN;
            m_last = m_acc;
            pub.win++;
            w_n = w_per = w_ch = w_chmax = w_own = w_late = 0;
        }
    }
    for (i = 1; i < 7; i++) cyc[i] = 0;
    own = TSCL - t1;
    aud_total += TSCL - t0;
}

/* Task_MIDI (diag_vec.asm): it woke up, and it finished a byte. The time in between,
 * minus the audio blocks that interrupted it, is MIDI's.
 * ponytail: the stock audio interrupt entry and exit and higher-priority tasks still
 * count as MIDI; small while MIDI bytes are short. */
static unsigned now(unsigned *a)
{
    unsigned t;
    do { *a = aud_total; t = TSCL; } while (*a != aud_total);   /* no block in between */
    return t;
}

void diag_mwake(void)
{
    m_on = MAGIC != 0;
    if (m_on) m_t = now(&m_aud);
}

void diag_mend(void)
{
    unsigned a, t, d;
    if (!MAGIC) { m_on = 0; return; }
    t = now(&a);
    d = t - m_t - (a - m_aud);
    if (m_on && (int)d > 0) m_acc += d;
    m_on = 1;
    m_t = t;
    m_aud = a;
}

/* ---- UI side --------------------------------------------------------------------------- */
static int page, top, tick, open, nrow;
static unsigned peak, seen;
static char b1[12], b2[12];
static const int NR[4] = { 5, 8, 6, 9 };    /* rows of each page; 4 fit, knob 1 scrolls */

static unsigned udiv(unsigned a, unsigned b)
{
    unsigned q = 0, r = 0;
    int i;
    for (i = 31; i >= 0; i--) {
        r = r << 1 | (a >> i & 1);
        if (r >= b) { r -= b; q |= 1u << i; }
    }
    return q;
}

/* tenths -> "47.3" + u */
static char *dec(char *b, int t, const char *u)
{
    int q;
    if (t < 0) t = 0;
    q = (int)((unsigned)t * 52429u >> 19);              /* t / 10, exact below 43690 */
    SNPRINTF(b, 12, "%d.%d%s", q, t - 10 * q, u);
    return b;
}

static char *pc(char *b, int cycles) { return dec(b, (int)(cycles * (1000.0f / PERIOD) + 0.5f), "%"); }

static int len(const char *s) { int n = 0; while (s[n]) n++; return n; }

/* the next row: label at the left; v (and v2) right-aligned in their columns, 6-px font */
static void put(const char *l, const char *v, const char *v2)
{
    int r = nrow++ - top, y = 12 + 9 * r;
    if (r < 0 || r > 3) return;
    DRAW_TEXT(0, l, 1, y);
    if (v2) { DRAW_TEXT(0, v, 93 - 6 * len(v), y); v = v2; }
    if (v) DRAW_TEXT(0, v, 121 - 6 * len(v), y);   /* the scrollbar is right of 121 */
}

/* slot s: its name (8 characters at most) and declared DSP in tenths; 0 = no effect */
static int slot(int s, char *name, int *dsp)
{
    unsigned f = FX_TABLE[s], d = DESC(s), e = d + 48;
    int i;
    *dsp = 0;
    if (f == FX_EMPTY) { name[0] = '-'; name[1] = 0; return 0; }
    if (f == FX_MUTE || d >> 28 != 12 || *(volatile unsigned *)(e + 32) != f) {
        name[0] = '?'; name[1] = 0;
        return 0;
    }
    for (i = 0; i < 8 && ((volatile char *)e)[i]; i++) name[i] = ((volatile char *)e)[i];
    name[i] = 0;
    *dsp = (int)(*(volatile float *)(e + 40) * 10.0f + 0.5f);
    return 1;
}

static int dsp_total(void)
{
    int s, dsp, t = 0;
    char n[9];
    for (s = 0; s < 6; s++) { slot(s, n, &dsp); t += dsp; }
    return t;
}

static void page_version(void)
{
    /* ponytail: polls x 16 ms (the poll's nominal period) */
    unsigned t = (unsigned)(int)(polls * 0.016f), h = udiv(t, 3600), m;
    t -= 3600 * h;
    m = udiv(t, 60);
    t -= 60 * m;
    put("MIDISTOMP", STAMP(0), 0);
    put("COMMIT", STAMP(1), 0);
    put("DATE", STAMP(2), 0);
    put("LABEL", STAMP(3), 0);
    SNPRINTF(b1, 12, "%d:%d%d:%d%d", h, (int)(m * 52429u >> 19), (int)(m - 10 * (m * 52429u >> 19)),
             (int)(t * 52429u >> 19), (int)(t - 10 * (t * 52429u >> 19)));
    put("UPTIME", b1, 0);
}

static void page_load(void)
{
    put("CPU", pc(b1, pub.per), 0);
    put("CPU PEAK", pc(b1, peak), 0);
    put("AUDIO", pc(b1, pub.ch), 0);
    put("AUDIO MAX", pc(b1, pub.chmax), 0);
    put("FREE", dec(b1, 1000 - (int)(pub.per * (1000.0f / PERIOD) + 0.5f), "%"), 0);
    SNPRINTF(b1, 12, "%d", pub.late); put("LATE", b1, 0);
    SNPRINTF(b1, 12, "%d", late_total); put("LATE TOTAL", b1, 0);
    SNPRINTF(b1, 12, "%d/300", (int)((unsigned)(dsp_total() + 5) * 52429u >> 19)); put("DSP", b1, 0);
}

/* each slot: name, CPU % of a block, declared DSP */
static void page_effects(void)
{
    int s, dsp;
    char n[9], l[12];
    for (s = 0; s < 6; s++) {
        SNPRINTF(l, 12, "%d %s", s + 1, (slot(s, n, &dsp), n));
        if (dsp) put(l, pc(b1, pub.cyc[1 + s]), dec(b2, dsp, ""));
        else put(l, 0, 0);
    }
}

/* the parts of the CPU load, most to least; LOOPER BUFFER last ("-") with no GRDLOOP. Then
 * MASTER and KALEIDO, which run only on their own screen: their load when last open ("-" never). */
static void page_mods(void)
{
    static const char *const N[7] = { "EFFECT CHAIN", "PERFORM MODE", "LOOPER BUFFER", "MIDI",
                                      "SYSTEM", "EFFECTS", "OS" };
    int v[7], o[7], s, i, j, fx = 0, l = LOOPER_SLOT, lc = 0;
    for (s = 0; s < 6; s++) fx += pub.cyc[1 + s];
    if ((unsigned)l < 6) lc = pub.cyc[1 + l];
    v[0] = (int)pub.ch - (int)pub.cyc[0] - fx;
    v[1] = pub.cyc[0];
    v[2] = (unsigned)l < 6 ? lc : -0x7FFFFFFF;
    v[3] = pub.midi;
    v[4] = pub.own;
    v[5] = fx - lc;
    v[6] = (int)pub.per - (int)pub.ch - (int)pub.own - (int)pub.midi;
    for (i = 0; i < 7; i++)
        for (o[i] = i, j = i; j && v[o[j]] > v[o[j - 1]]; j--) { s = o[j]; o[j] = o[j - 1]; o[j - 1] = s; }
    for (i = 0; i < 7; i++) put(N[o[i]], v[o[i]] == -0x7FFFFFFF ? "-" : pc(b1, v[o[i]]), 0);
    put("MASTER", MS_LOAD(0) < 0 ? "-" : dec(b1, MS_LOAD(0), "%"), 0);
    put("KALEIDO", MS_LOAD(1) < 0 ? "-" : dec(b1, MS_LOAD(1), "%"), 0);
}

void diag_draw(void)
{
    static const char *const T[4] = { "VERSION 1/4", "LOAD 2/4", "EFFECTS 3/4", "MODS 4/4" };
    if (pub.win != seen) {      /* a new window: the peak since the screen opened */
        seen = pub.win;
        if (pub.per > peak) peak = pub.per;
    }
    TITLE(T[page]);
    nrow = 0;
    if (page == 0) page_version();
    else if (page == 1) page_load();
    else if (page == 2) page_effects();
    else page_mods();
    SCROLLBAR(top, NR[page]);
    DRAW_ARROWS(0);
    SOFTKEY(0, STR_BLANK, 0);
    SOFTKEY(1, STR_EXIT, 0);
    SOFTKEY(2, "PAGE", 0);
}

/* Knob turns and the knob 3 click (diag_vec.asm sends the rest to the stock keys): knob 1
 * scrolls, a knob 3 click goes to the next page (4 -> 1). steps > 0 = right. Returns 1 to redraw. */
int diag_keys(int ev, int steps)
{
    int t = top + (steps > 0 ? 1 : -1);
    if (ev == 67) {
        page = (page + 1) & 3;
        top = 0;
        return 1;
    }
    if (ev != 160 || !steps || t < 0 || t > NR[page] - 4) return 0;
    top = t;
    return 1;
}

/* 16 ms: the timing on only while the SYSTEM screen or the MENU list (its CPU badge) is open,
 * and a redraw about twice a second there. */
int diag_poll(void)
{
    int menu = MODE == 11, v = menu && SCREEN == 9, on = menu && (v || SCREEN == 0);
    polls++;
    if (on && !MAGIC) { restart = 1; MAGIC = 0x47414944u; }   /* "DIAG" */
    else if (!on) MAGIC = 0;
    if (v && !open) { page = top = 0; peak = 0; }
    open = v;
    if (on && !(++tick & 31)) EVENT_POST(UI_EVENT, 64);
    return POLL_TRAMP();
}

/* ---- the menu's badges: "DSP 135/300" at the left and "CPU 47%" at the right of the title
 * bar, white on the bar, 3 x 5 font ------------------------------------------------------ */
static const unsigned char G3[16][3] = {
    {31, 17, 31}, {18, 31, 16}, {29, 21, 23}, {21, 21, 31}, {7, 4, 31},
    {23, 21, 29}, {31, 21, 29}, {1, 1, 31}, {31, 21, 31}, {23, 21, 31},
    {31, 17, 17}, {31, 5, 7}, {31, 16, 31}, {25, 4, 19}, {31, 17, 14},   /* C P U % D */
    {24, 4, 3},                                                         /* / */
};

/* the 3 letters a, b, c, a space, n (0-999) and % (or /300 when of300), on the bar at x
 * (x < 0: ending at -x) */
static void badge(int a, int b, int c, unsigned n, int x, int of300)
{
    unsigned char s[11];
    unsigned h, t;
    int k = 4, i, j, y;
    s[0] = (unsigned char)a; s[1] = (unsigned char)b; s[2] = (unsigned char)c; s[3] = 255;
    if (n > 999) n = 999;
    h = n * 5243u >> 19;                                   /* n / 100 */
    n -= 100 * h;
    t = n * 52429u >> 19;                                  /* n / 10 */
    if (h) s[k++] = (unsigned char)h;
    if (h || t) s[k++] = (unsigned char)t;
    s[k++] = (unsigned char)(n - 10 * t);
    if (of300) { s[k++] = 15; s[k++] = 3; s[k++] = 0; s[k++] = 0; }
    else s[k++] = 13;
    if (x < 0) for (x = -x, i = k - 1; i >= 0; i--) x -= s[i] == 255 ? 2 : 4;
    for (j = x, i = 0; i < k; i++) j += s[i] == 255 ? 2 : 4;
    for (; j >= x; j--) FB[j] |= 0xFE;                     /* the bar behind it, rows 1-7 */
    for (i = 0; i < k; i++) {
        if (s[i] == 255) { x += 2; continue; }
        for (j = 0; j < 3; j++)
            for (y = 0; y < 5; y++)
                if (G3[s[i]][j] >> y & 1) FB[x + 1 + j] &= (unsigned char)~(1u << (y + 2));
        x += 4;
    }
}

int diag_menu(int a, int b, int c, int d)
{
    int r = MENU_DRAW(a, b, c, d);
    if (MODE != 11 || SCREEN != 0) return r;
    badge(14, 5, 11, (unsigned)(dsp_total() + 5) * 52429u >> 19, 0, 1);        /* DSP, 5 = S */
    badge(10, 11, 12, (unsigned)(int)(pub.per * (100.0f / PERIOD) + 0.5f),
          BATTERY_LEVEL() < 5 ? -111 : -126, 0);              /* CPU, left of the battery icon */
    FB_DIRTY |= 1;
    return r;
}
