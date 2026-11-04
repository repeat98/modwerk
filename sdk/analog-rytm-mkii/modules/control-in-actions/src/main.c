// SPDX-License-Identifier: GPL-3.0-or-later
// Control In Actions for the Analog Rytm MKII: a gate or a footswitch on
// EXP/CV IN 1 or 2 opens the MUTE screen or switches live recording.
//
// Stock's GLOBAL > CONTROL > CONTROL INPUT menus already hold a fourth MODE,
// FSW, with FOOTSW DEST and FOOTSWITCH LEARN rows, but stop MODE at EXPR. This
// module's sites let MODE reach it, name the three ACTION, ACTION and LEARN
// LEVELS, and give the ACTION row its own five choices; stock keeps storing all
// of it with its other control-input settings.
//
// Each UI tick reads the jack's smoothed level and compares it with the middle
// of the two levels ACTION LEARN found (0 V and 5 V until learned). Past
// it toward the higher level is pressed; REVERSE DIRECTION swaps the two, for a
// switch that pulls the tip low. An action is a key press played through
// stock's own key path, so the MUTE screen and live recording behave exactly
// as from the panel.

#include "ar2-1.74.h"

#define KEY_MUTE 0x11
#define KEY_CHRO 0x12
#define KEY_SCNE 0x13
#define KEY_PERF 0x14
#define KEY_REC 0x50
#define KEY_PLAY 0x51
#define KEY_FILL 0xb2
#define FLAG_DOWN 1
#define FLAG_UP 0x10

#define DEST_OFF 0
#define DEST_MUTE_HOLD 1
#define DEST_MUTE_TOGGLE 2
#define DEST_REC_HOLD 3
#define DEST_REC_TOGGLE 4
#define DEST_FILL_HOLD 5
#define DEST_FILL_LATCH 6

#define HYSTERESIS_MIN 200          // mV
#define UNSEEN 2                    // a port's state before its first reading

typedef unsigned word_t;
typedef void (*settings_t)(int port, void *record);
typedef int (*millivolts_t)(int port);
typedef void (*event_ctor_t)(void *event, int key, int flags, int when, int velocity);
typedef void (*event_dtor_t)(void *event);
typedef int (*dispatch_t)(void *brain, void *event);
typedef word_t (*singleton_t)(void);
typedef unsigned char (*live_rec_t)(void *app);
typedef void (*rect_t)(void *screen, int x1, int y1, int x2, int y2, int colour);
typedef void (*hline_t)(void *screen, int x1, int y, int x2, int colour);
typedef void (*vline_t)(void *screen, int x, int y1, int y2, int colour);
typedef void (*invalidate_t)(void *view);

#define SETTINGS ((settings_t)CI_SETTINGS_AT)
#define MILLIVOLTS ((millivolts_t)CI_MILLIVOLTS_AT)
#define EVENT_CTOR ((event_ctor_t)KEY_EVENT_CTOR_AT)
#define EVENT_DTOR ((event_dtor_t)KEY_EVENT_DTOR_AT)
#define DISPATCH ((dispatch_t)KEY_DISPATCH_AT)
#define APP_SINGLETON ((singleton_t)APP_SINGLETON_AT)
#define LIVE_REC ((live_rec_t)LIVE_REC_AT)
#define FRAME ((rect_t)DRAW_FRAME_AT)
#define FILL ((rect_t)DRAW_FILL_AT)
#define HLINE ((hline_t)DRAW_HLINE_AT)
#define VLINE ((vline_t)DRAW_VLINE_AT)
#define INVALIDATE ((invalidate_t)VIEW_INVALIDATE_AT)

// The ACTION row's names, in place of stock's list (OFF, TEMPO, ACTIVE,
// PRESET +, PRESET -, ENV TRIG); the row has room for 8 characters.
const char control_in_actions_hold[] = "MUTE HLD";
const char control_in_actions_toggle[] = "MUTE TGL";
const char control_in_actions_rec_hold[] = "REC HLD";
const char control_in_actions_rec_toggle[] = "REC TGL";
const char control_in_actions_fill_hold[] = "FILL HLD";
const char control_in_actions_fill_latch[] = "FILL LAT";
const char *const control_in_actions_dests[] = {
    (const char *)OFF_TEXT, control_in_actions_hold, control_in_actions_toggle,
    control_in_actions_rec_hold, control_in_actions_rec_toggle,
    control_in_actions_fill_hold, control_in_actions_fill_latch,
};

// In place of stock's FSW, FOOTSW DEST and FOOTSWITCH LEARN.
const char control_in_actions_mode[] = "ACTION";
const char control_in_actions_dest[] = "ACTION";
const char control_in_actions_learn[] = "ACTION LEARN";

// ACTION LEARN's first line, in place of stock's "PUSH THE SWITCH SOME TIMES.";
// the second stays stock's "PRESS YES/NO WHEN DONE.".
const char control_in_actions_learn_1[] = "PRESS OR SEND A FEW GATES.";

#ifdef CIA_EMU
// rytm-emu has no ADC: a test build reads these words, poked from outside.
volatile int control_in_actions_emu_mv[CI_PORTS];
volatile int control_in_actions_emu_mode;  // the open mode screen's key, for DTBOOT_PEEK
#define LEVEL(port) control_in_actions_emu_mv[port]
#else
#define LEVEL(port) MILLIVOLTS(port)
#endif

static unsigned char state[CI_PORTS] = { UNSEEN, UNSEEN };
static unsigned char last_dest[CI_PORTS];
static unsigned char hold_active[CI_PORTS]; // MUTE HOLD opened the screen
static unsigned char hold_back[CI_PORTS];   // the mode key to go back to, 0 for none
static unsigned char rec_active[CI_PORTS];  // REC HOLD turned live recording on
static unsigned char fill_active[CI_PORTS]; // FILL HOLD holds FILL down
static unsigned char learning[CI_PORTS];    // the learn open as the view last drew: LEARN_EXPR, LEARN_FSW or 0
static char *shown[CI_PORTS];               // the CONTROL INPUT view that last drew
static word_t shown_class[CI_PORTS];        // its vtable, so a new object at that address is not it
static unsigned char lit[CI_PORTS];         // the bars' state: pressed by the menu's own levels
static unsigned char finished[CI_PORTS];    // the learn that has just closed

static void *brain(void)
{
    return *(void **)BRAIN_AT;
}

static void press(int key, int flags)
{
    long event[KEY_EVENT_BYTES / 4 + 2];
    void *b = brain();
    if (!b)
        return;
    EVENT_CTOR(event, key, flags, 0, 127);
    DISPATCH(b, event);
    EVENT_DTOR(event);
}

static void tap(int key)
{
    press(key, FLAG_DOWN);
    press(key, FLAG_UP);
}

// The view stack's views, top first, through *node; 0 at its end.
static char *next_view(char **node)
{
    void *b = brain();
    char *views;
    if (!b)
        return 0;
    views = *(char **)((char *)b + BRAIN_VIEWS);
    *node = *node ? *(char **)(*node + NODE_PREV) : *(char **)(views + MANAGER_LAST);
    return *node == views + MANAGER_LIST ? 0 : *(char **)(*node + NODE_VIEW);
}

// Which mode screen is open, as the key that opens it: 0 for none.
static int mode_key(void)
{
    char *node = 0, *view;
    while ((view = next_view(&node))) {
        word_t vtable = *(word_t *)view;
        if (vtable == MUTE_VTABLE)
            return KEY_MUTE;
        if (vtable == CHROMATIC_VTABLE)
            return KEY_CHRO;
        if (vtable == SCENE_VTABLE || vtable == SCENE_FX_VTABLE)
            return KEY_SCNE;
        if (vtable == PERF_VTABLE || vtable == PERF_FX_VTABLE)
            return KEY_PERF;
    }
    return 0;
}

// PLAY with RECORD read as held: stock's RECORD + PLAY, which starts live
// recording (and the sequencer, when stopped). A RECORD the musician really
// holds stays held.
static void record_play(void)
{
    long index = ((volatile long *)KEY_BIT_INDEX)[KEY_REC];
    volatile unsigned char *bits = (volatile unsigned char *)KEY_BITS;
    unsigned char bit, was;
    if (index < 0)
        return;
    bit = 1 << (index & 7);
    was = bits[index >> 3] & bit;
    bits[index >> 3] |= bit;
    tap(KEY_PLAY);
    if (!was)
        bits[index >> 3] &= ~bit;
}

static int live_rec(void)
{
    return LIVE_REC((void *)APP_SINGLETON());
}

// Live recording on, from RECORD + PLAY: a stopped sequencer starts too.
static void rec_on(void)
{
    if (!live_rec())
        record_play();
}

// Live recording off, from PLAY, which stock reads in live recording as
// leaving it: the sequencer plays on.
static void rec_off(void)
{
    if (live_rec())
        tap(KEY_PLAY);
}

static void pedal(int port, int dest, int down)
{
    switch (dest) {
    case DEST_MUTE_HOLD:
        if (down) {
            int now = mode_key();
            hold_active[port] = now != KEY_MUTE;
            hold_back[port] = now;
            if (hold_active[port])
                tap(KEY_MUTE);
        } else if (hold_active[port]) {
            hold_active[port] = 0;
            if (mode_key() == KEY_MUTE)
                tap(hold_back[port] ? hold_back[port] : KEY_MUTE);
        }
        break;
    case DEST_MUTE_TOGGLE:
        if (down)
            tap(KEY_MUTE);
        break;
    case DEST_REC_HOLD:
        if (down) {
            rec_active[port] = !live_rec();
            rec_on();
        } else if (rec_active[port]) {
            rec_active[port] = 0;
            rec_off();
        }
        break;
    case DEST_FILL_HOLD:            // FILL down and up, as from the panel: fill while held
        if (down) {
            fill_active[port] = 1;
            press(KEY_FILL, FLAG_DOWN);
        } else if (fill_active[port]) {
            fill_active[port] = 0;
            press(KEY_FILL, FLAG_UP);
        }
        break;
    case DEST_FILL_LATCH:           // FUNC + FILL FILL latches, and FILL ends a latch
        if (down) {
            int func = *(volatile unsigned char *)FILL_ON ? 0 : FLAG_FUNC;
            press(KEY_FILL, FLAG_DOWN | func | (func ? FLAG_DOUBLE : 0));
            press(KEY_FILL, FLAG_UP | func);
        }
        break;
    case DEST_REC_TOGGLE:
        if (down) {
            if (live_rec())
                rec_off();
            else
                rec_on();
        }
        break;
    }
}

// A hold in progress ends when its jack leaves ACTION mode or the choice
// changes, as on release.
static void end_holds(int port)
{
    if (hold_active[port])
        pedal(port, DEST_MUTE_HOLD, 0);
    if (rec_active[port])
        pedal(port, DEST_REC_HOLD, 0);
    if (fill_active[port])
        pedal(port, DEST_FILL_HOLD, 0);
}

// Whether the input counts as pressed, from the two learned levels and
// whether it did: past their middle toward the higher one, with hysteresis.
// REVERSE DIRECTION swaps the levels, so the lower one is pressed.
static int pressed(int low, int high, int level, int was)
{
    int middle = (low + high) / 2;
    int band = (high > low ? high - low : low - high) / 8;
    if (band < HYSTERESIS_MIN)
        band = HYSTERESIS_MIN;
    if (high < low) {
        level = -level;
        middle = -middle;
    }
    if (was == UNSEEN)
        return level > middle;
    return level > (was ? middle - band : middle + band);
}

// The bar's row for a level: the EXPR bars' scale, -0.5 V to 5.5 V over 45 rows.
static int bar_row(int mv)
{
    int row = (mv + 500) * 45 / 6000;
    return (row < 0 ? 0 : row > 45 ? 45 : row) + 3;
}

// A learned level: the bar shaded from it to the bar's end, bracketed beside.
static void mark(void *screen, int row, int end)
{
    FILL(screen, 4, row, 15, end, 1);
    HLINE(screen, 18, row, 19, 1);
    VLINE(screen, 19, row, end, 1);
    HLINE(screen, 19, end, 21, 1);
}

// Whether the CONTROL INPUT view that last drew is still open; forgets it
// when not.
static int still_shown(int port)
{
    char *node = 0, *view;
    while (shown[port] && (view = next_view(&node)))
        if ((view == shown[port] || view == shown[port] + VIEW_BASE) && *(word_t *)shown[port] == shown_class[port])
            return 1;
    shown[port] = 0;
    learning[port] = 0;
    return 0;
}

// Draw the view again on every tick while it shows ACTION or a learn, as
// stock's update does for EXPR's bars only when the converter reports: the
// bars then follow the module, and the draw sees a learn close.
static void redraw(int port)
{
    if (still_shown(port) && (*(long *)(shown[port] + VIEW_RECORD + REC_MODE) == MODE_FSW || learning[port]))
        INVALIDATE(shown[port] + VIEW_BASE);
}

// A learn has closed. Stock saves the menu's copy on YES, and on NO leaves
// the new levels in it unsaved, where leaving the menu saves them: NO puts
// the saved ones back, in EXPRESSION LEARN as in ACTION LEARN. After YES the
// copy is what was saved, so this changes nothing.
static void learned(int port, char *view, int learn)
{
    long saved[REC_BYTES / 4];
    int at = learn == LEARN_FSW ? VIEW_FSW_LOW : VIEW_EXPR_MIN;
    int from = learn == LEARN_FSW ? REC_FSW_LOW : REC_EXPR_MIN;
    SETTINGS(port, saved);
    *(long *)(view + at) = saved[from / 4];
    *(long *)(view + at + 4) = saved[from / 4 + 1];
}

// Each draw of the CONTROL INPUT view, in EXPR or ACTION: which learn is
// open, and the view to draw again. The port, or -1.
static int watch(char *view)
{
    int port = *(long *)(view + VIEW_PORT);
    int learn;
    if (port < 0 || port >= CI_PORTS)
        return -1;
    learn = *(long *)(view + VIEW_LEARN);
    if (learn != LEARN_EXPR && learn != LEARN_FSW)
        learn = 0;
    if (learning[port] && !learn)
        finished[port] = learning[port];
    learning[port] = learn;
    shown[port] = view;
    shown_class[port] = *(word_t *)view;
    return port;
}

// EXPR mode's draw, before stock's bars (draw.S).
void control_in_actions_expr(char *view)
{
    watch(view);
}

// ACTION's bars, from the view's draw (draw.S), laid out as stock's EXPR
// bars: the input's level against the two learned levels, which ACTION LEARN
// moves as it runs, then a line at the box's far end while the input counts
// as pressed, as EXPR's output line.
void control_in_actions_draw(char *view, void *screen, int mv)
{
    int port = watch(view);
    int low, high;
    if (port < 0)
        return;
#ifdef CIA_EMU
    mv = LEVEL(port);
#endif
    low = *(long *)(view + VIEW_FSW_LOW);
    high = *(long *)(view + VIEW_FSW_HIGH);
    lit[port] = pressed(low, high, mv, lit[port]);
    low = bar_row(low);
    high = bar_row(high);
    if (low > high) {
        int row = low;
        low = high;
        high = row;
    }
    FRAME(screen, 3, 3, 16, 48, 1);
    HLINE(screen, 4, bar_row(mv), 15, 1);
    mark(screen, low, 3);
    mark(screen, high, 48);
    FRAME(screen, 23, 3, 36, 48, 1);
    HLINE(screen, 24, lit[port] ? 45 : 6, 35, 1);
}

void control_in_actions_tick(void *ctrl)
{
    long record[REC_BYTES / 4];
    int port;
    (void)ctrl;
#ifdef CIA_EMU
    control_in_actions_emu_mode = mode_key() | live_rec() << 8 | state[0] << 16 | learning[0] << 24;
#endif
    for (port = 0; port < CI_PORTS; port++) {
        int down, dest, i;
        redraw(port);
        if (finished[port]) {
            if (shown[port])
                learned(port, shown[port], finished[port]);
            finished[port] = 0;
        }
        // With its CONTROL INPUT screen open, a port follows the menu's own
        // copy, which stock saves only on leaving it, REVERSE or LEARN's YES.
        if (shown[port])
            for (i = 0; i < REC_BYTES / 4; i++)
                record[i] = ((long *)(shown[port] + VIEW_RECORD))[i];
        else
            SETTINGS(port, record);
        if (record[REC_MODE / 4] != MODE_FSW) {
            end_holds(port);
            state[port] = UNSEEN;
            continue;
        }
        // Stock's input routine leaves the macro's level as it was for this
        // mode; nothing in the kit should keep playing it.
        ((volatile long *)CI_SOURCE)[port] = 0;
        // While ACTION LEARN runs the input moves on purpose, and the levels
        // in force are the old ones: no action, and a fresh start after.
        if (learning[port] == LEARN_FSW) {
            end_holds(port);
            state[port] = UNSEEN;
            continue;
        }
        dest = record[REC_DEST / 4];
        down = pressed(record[REC_FSW_LOW / 4], record[REC_FSW_HIGH / 4], LEVEL(port), state[port]);
        if (dest != last_dest[port]) {
            end_holds(port);
            last_dest[port] = dest;
            state[port] = down;     // a new choice waits for the next press
            continue;
        }
        if (state[port] == UNSEEN) {
            state[port] = down;     // no action for a pedal already down at start
            continue;
        }
        if (down != state[port]) {
            state[port] = down;
            pedal(port, dest, down);
        }
    }
}
