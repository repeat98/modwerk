/* SETTINGS (screen 1) and MIDI (screen 14) lists without choice screens: each row shows
 * its value at the right and knob 3 changes it. ENTER is shown and works only on a row
 * that opens something (MIDI). Changes are saved when the list is left: SETTINGS to
 * record 50 (SAVE_SETTINGS), MIDI to record 51 (SAVE_LAST_PATCH), as settings.S's choice
 * screen did. The lists are drawn by settings.S's draw_list (no room left in L2).
 * Row 8 is PEDAL INPUT (MONO/STEREO, default MONO), bit 7 of byte 23 of record 50
 * (settings.S packs bits 0, 5 and 6 there); it lives in mixer.S data (PEDAL, chain.h):
 * STEREO draws double lines from IN and allows the Split and Mono Serial modes; MONO
 * plays them as Parallel and Serial. Row 9 is IDLE KALEIDO (IDLE: OFF, 10 S .. 2 MIN, bits
 * 1-3 of byte 23; chain_keys.c idle_ev). Row 10, MIDI, opens screen 14, whose EXIT comes back here. */
#include "chain.h"
#include "stock.h"

/* settings.S, fixed by patches/midi-settings.yaml */
#define SETTINGS_ICONS ((const unsigned char *)0x1181EC24)
#define SETTINGS_KEYS FN(0x1181F164, int, (long long ev))     /* the event pair in A5:A4 */
#define DRAW_LIST FN(0x1181ED20, void, (const char *title, const char *const *names, int rows, \
                                        const unsigned char *icons, int stride, const char *left))
#define PACK_HOOK FN(0x1181EA80, void, (unsigned char *rec, int *words))
#define UNPACK_HOOK FN(0x1181EA88, void, (int *words, unsigned char *rec))
#define MIDI_FLAGS (*(volatile unsigned *)0x1181EA00)          /* transport.inc */
#define TLOCK (*(volatile int *)0x1181EA0C)                    /* settings.S V_TLOCK */
#define HOLDM (*(volatile int *)0x1181EA24)                    /* settings.S V_HOLDM: MOMENTARY */
#define BLOCK ((volatile int *)0x1181FF00)                     /* transport block: [1] seq, [2] run */

#define LIST_INDEX FN(0xC00A7040, int, (void))                 /* -> row + top */
#define LIST_SCROLL FN(0xC00A72D4, void, (int delta, int rows))
#define SAVE_SETTINGS FN(0xC00BA3E4, void, (int *words))       /* writes record 50 */
#define SAVE_LAST_PATCH FN(0xC00B8410, void, (int patch))      /* writes record 51 */
#define DRAW_ARROWS FN(0xC00A7400, void, (int knob))          /* the turn arrows over a softkey */
#define BACKLIGHT_APPLY FN(0xC00DC048, void, (void))
#define CONTRAST_APPLY FN(0xC00BA5F4, void, (int))
#define SETTINGS_WORDS ((int *)0xC009D8F8)
#define W(a) (*(volatile int *)(a))                            /* stock settings words */
#define OFF_ON ((const char *const *)0xC00ECD38)
#define STR_SETTINGS ((const char *)0xC00E9004)
#define STR_ENTER ((const char *)0xC00E90F6)
#define STR_BLANK ((const char *)0xC00E9101)
#define EV_ENTER 34
#define EV_EXIT 65
#define EV_TURN 160
#define EV_TURN3 162
#define ROW_PEDAL 8
#define ROW_IDLE 9
#define ROW_MIDI 10
#define ROWS 11
#define MROWS 6
#define COLS 18                 /* 6 px characters from x 12 to the narrow highlight's edge */

static char text[ROWS][COLS + 1];
static const char *names[ROWS];
static unsigned char icons[7 * ROWS];
static int dirty;               /* a value changed: save when the list is left */
static const unsigned char plug[14] = {0x08, 0x08, 0x1c, 0x3e, 0x3e, 0x3e, 0x08,
                                       0x1c, 0x22, 0x55, 0x41, 0x55, 0x22, 0x1c};   /* + a DIN socket */
static const unsigned char gem[7] = {0x08, 0x14, 0x22, 0x49, 0x22, 0x14, 0x08};   /* IDLE KALEIDO */
static const char *const set_names[ROWS] = {"HOLD FOR", "TUNER OUT", "POWER SAVE", "AUTO SAVE",
    "BATTERY", "BACKLIGHT", "LCD CONTRAST", "TEMPO LOCK", "INPUT", "IDLE KALEIDO", "MIDI"};
static const char *const hold_names[3] = {"TUNER", "TEMPO", "MOMENTARY"};
static const char *const input_names[2] = {"MONO", "STEREO"};
static const char *const idle_names[5] = {"OFF", "10 S", "30 S", "1 MIN", "2 MIN"};
/* stock settings words of rows 1-5 and 6 (contrast), their choices and label tables */
static const int set_word[7] = {0, 0xC009D900, 0xC009D91C, 0xC009D918, 0xC009D914, 0xC009D910,
                                0xC009D8FC};
static const int set_labels[6] = {0, 0xC00ECD40, 0xC00ECD38, 0xC00ECD38, 0xC00ECD28, 0xC00ECB08};
static const char set_count[ROWS] = {3, 2, 2, 2, 2, 4, 10, 2, 2, 5, 0};
static const char *const midi_names[MROWS] = {"CLOCK RECEIVE", "TRANSPORT", "PC RECEIVE",
    "PC START NO.", "CC RECEIVE", "MIDI CHANNEL"};
/* settings.S items: value = (MIDI_FLAGS >> shift & mask) ^ xor */
static const unsigned char midi_item[MROWS][4] = {{0, 1, 1, 2}, {1, 1, 1, 2}, {2, 1, 1, 2},
                                                  {4, 1, 1, 2}, {3, 1, 1, 2}, {5, 31, 0, 17}};
static char num[3];

static const char *number(int n)        /* 0..16, no RTS division */
{
    num[0] = n > 9 ? '1' : '0' + n;
    num[1] = n > 9 ? '0' + n - 10 : 0;
    num[2] = 0;
    return num;
}

/* The row's text: name, then value at the right edge. */
static const char *row_text(int r, const char *name, const char *value)
{
    char *t = text[r];
    int i = 0, v = 0;
    while (name[i])
        t[i] = name[i], i++;
    while (value[v])
        v++;
    while (i < COLS - v)
        t[i++] = ' ';
    while (*value)
        t[i++] = *value++;
    t[i] = 0;
    return t;
}

/* Values as 0..count-1 (contrast: 0..9 for 1..10). */
static int set_get(int r)
{
    if (r == 0)
        return HOLDM ? 2 : W(0xC009D920);
    if (r == 6)
        return W(set_word[6]) - 1;
    if (r == 7)
        return TLOCK;
    if (r == ROW_PEDAL)
        return PEDAL;
    if (r == ROW_IDLE)
        return IDLE;
    return W(set_word[r]);
}

static void set_put(int r, int v)
{
    if (r == 0) {
        HOLDM = v == 2;
        W(0xC009D920) = v == 1;
    } else if (r == 6) {
        W(set_word[6]) = v + 1;
        CONTRAST_APPLY(0);
    } else if (r == 7) {
        TLOCK = v;
    } else if (r == ROW_PEDAL) {
        PEDAL = v;
        if (!PEDAL && LIVE[S_MODE] > 1)     /* the patch played falls back, as the mockup */
            LIVE[S_MODE] = LIVE[S_MODE] == 2;
    } else if (r == ROW_IDLE) {
        IDLE = v;
    } else {
        W(set_word[r]) = v;
        if (r == 5)
            BACKLIGHT_APPLY();
    }
}

static int midi_get(int r)
{
    const unsigned char *m = midi_item[r];
    return (MIDI_FLAGS >> m[0] & m[1]) ^ m[2];
}

static void midi_put(int r, int v)
{
    const unsigned char *m = midi_item[r];
    MIDI_FLAGS = (MIDI_FLAGS & ~(m[1] << m[0])) | (unsigned)(v ^ m[2]) << m[0];
    if (r == 1 && !v) {     /* TRANSPORT off: the transport counts as stopped (transport.inc) */
        unsigned csr = _disable_interrupts();
        BLOCK[1]++;
        BLOCK[2] = 0;
        BLOCK[1]++;
        _restore_interrupts(csr);
    }
}

/* The value after a knob 3 turn, clamped; -1 = no change. */
static int step(int steps, int v, int count)
{
    int n = v + steps;
    n = n < 0 ? 0 : n >= count ? count - 1 : n;
    return n == v ? -1 : n;
}

int settings_key(int ev, int steps)
{
    int r = LIST_INDEX(), v;
    if (ev == EV_TURN) {
        LIST_SCROLL(steps, ROWS);
        return 1;
    }
    if (ev == EV_EXIT || (r == ROW_MIDI && ev == EV_ENTER)) {
        if (dirty)
            SAVE_SETTINGS(SETTINGS_WORDS);
        dirty = 0;
        if (ev != EV_EXIT) {
            SET_SCREEN(14, 0);
            return 1;
        }
        return SETTINGS_KEYS((long long)steps << 32 | (unsigned)ev);
    }
    if (ev != EV_TURN3 || r == ROW_MIDI || (v = step(steps, set_get(r), set_count[r])) < 0)
        return 0;
    set_put(r, v);
    dirty = 1;
    return 1;
}

void settings_draw(void)
{
    int i, v;
    const char *val;
    for (i = 0; i < 7 * ROW_PEDAL; i++)
        icons[i] = SETTINGS_ICONS[i];
    for (i = 0; i < 7; i++) {
        icons[7 * ROW_PEDAL + i] = plug[i];
        icons[7 * ROW_IDLE + i] = gem[i];
        icons[7 * ROW_MIDI + i] = plug[7 + i];
    }
    for (i = 0; i < ROWS; i++) {
        v = i == ROW_MIDI ? 0 : set_get(i);
        val = i == 0 ? hold_names[v] : i == 6 ? number(v + 1) : i == 7 ? OFF_ON[v]
            : i == ROW_PEDAL ? input_names[v] : i == ROW_IDLE ? idle_names[v]
            : i == ROW_MIDI ? ""
            : ((const char *const *)set_labels[i])[v];
        names[i] = row_text(i, set_names[i], val);
    }
    DRAW_LIST(STR_SETTINGS, names, ROWS, icons, 7, LIST_INDEX() == ROW_MIDI ? STR_ENTER : STR_BLANK);
    if (LIST_INDEX() != ROW_MIDI)
        DRAW_ARROWS(2);              /* knob 3 changes the value */
}

int midi_key(int ev, int steps)
{
    int r = LIST_INDEX(), v;
    if (ev == EV_TURN) {
        LIST_SCROLL(steps, MROWS);
        return 1;
    }
    if (ev == EV_EXIT) {
        if (dirty)
            SAVE_LAST_PATCH(BV(324));       /* the current patch, B14+324 */
        dirty = 0;
        SET_SCREEN(1, ROW_MIDI);
        return 1;
    }
    if (ev != EV_TURN3 || (v = step(steps, midi_get(r), midi_item[r][3])) < 0)
        return 0;
    midi_put(r, v);
    dirty = 1;
    return 1;
}

void midi_draw(void)
{
    int i, v;
    for (i = 0; i < MROWS; i++) {
        v = midi_get(i);
        names[i] = row_text(i, midi_names[i], i == 5 ? (v ? number(v) : "OMNI")
                                              : i == 3 ? number(v) : OFF_ON[v]);
    }
    DRAW_LIST("MIDI", names, MROWS, plug + 7, 0, STR_BLANK);
    DRAW_ARROWS(2);
}

/* Called instead of settings.S pack_hook / unpack_hook (their DDR trampolines). */
void settings_pack(unsigned char *rec, int *words)
{
    PACK_HOOK(rec, words);
    rec[23] |= PEDAL << 7 | IDLE << 1;   /* bits 1-4 were free (settings.S clears them) */
}

void settings_unpack(int *words, unsigned char *rec)
{
    int v = rec[23] >> 1 & 7;
    UNPACK_HOOK(words, rec);
    PEDAL = rec[23] >> 7;
    IDLE = v > 4 ? 0 : v;
}
