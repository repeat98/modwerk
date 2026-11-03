// SPDX-License-Identifier: GPL-3.0-or-later
// Foot Switch Control for the Analog Rytm MKII: a footswitch or a gate on
// EXP/CV IN 1 or 2 opens the MUTE screen or switches live recording.
//
// Stock's GLOBAL > CONTROL > CONTROL INPUT menus already hold a fourth MODE,
// FSW, with FOOTSW DEST and FOOTSWITCH LEARN rows, but stop MODE at EXPR. This
// module's sites let MODE reach FSW and give FOOTSW DEST its own four choices;
// stock keeps storing all of it with its other control-input settings.
//
// Each UI tick reads the jack's smoothed level and compares it with the middle
// of the two levels FOOTSWITCH LEARN found (0 V and 5 V until learned). Past
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
#define FLAG_DOWN 1
#define FLAG_UP 0x10

#define DEST_OFF 0
#define DEST_MUTE_HOLD 1
#define DEST_MUTE_TOGGLE 2
#define DEST_LIVE_REC 3

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

#define SETTINGS ((settings_t)CI_SETTINGS_AT)
#define MILLIVOLTS ((millivolts_t)CI_MILLIVOLTS_AT)
#define EVENT_CTOR ((event_ctor_t)KEY_EVENT_CTOR_AT)
#define EVENT_DTOR ((event_dtor_t)KEY_EVENT_DTOR_AT)
#define DISPATCH ((dispatch_t)KEY_DISPATCH_AT)
#define APP_SINGLETON ((singleton_t)APP_SINGLETON_AT)
#define LIVE_REC ((live_rec_t)LIVE_REC_AT)

// FOOTSW DEST's names, in place of stock's TEMPO, ACTIVE and PRESET +; the
// row has room for 8 characters, as stock's PRESET +.
const char foot_switch_control_hold[] = "MUTE HLD";
const char foot_switch_control_toggle[] = "MUTE TGL";
const char foot_switch_control_live[] = "LIVE REC";

#ifdef FSC_EMU
// rytm-emu has no ADC: a test build reads these words, poked from outside.
volatile int foot_switch_control_emu_mv[CI_PORTS];
volatile int foot_switch_control_emu_mode;  // the open mode screen's key, for DTBOOT_PEEK
#define LEVEL(port) foot_switch_control_emu_mv[port]
#else
#define LEVEL(port) MILLIVOLTS(port)
#endif

static unsigned char state[CI_PORTS] = { UNSEEN, UNSEEN };
static unsigned char last_dest[CI_PORTS];
static unsigned char hold_active[CI_PORTS]; // MUTE HOLD opened the screen
static unsigned char hold_back[CI_PORTS];   // the mode key to go back to, 0 for none

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

// Which mode screen is open, as the key that opens it: 0 for none.
static int mode_key(void)
{
    void *b = brain();
    char *views, *list, *node;
    if (!b)
        return 0;
    views = *(char **)((char *)b + BRAIN_VIEWS);
    list = views + MANAGER_LIST;
    for (node = *(char **)(views + MANAGER_LAST); node != list; node = *(char **)(node + NODE_PREV)) {
        word_t vtable = **(word_t **)(node + NODE_VIEW);
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
    case DEST_LIVE_REC:
        if (down) {
            void *app = (void *)APP_SINGLETON();
            if (LIVE_REC(app))
                tap(KEY_PLAY);      // stock: PLAY leaves live recording, the sequencer plays on
            else
                record_play();
        }
        break;
    }
}

void foot_switch_control_tick(void *ctrl)
{
    long record[REC_BYTES / 4];
    int port;
    (void)ctrl;
#ifdef FSC_EMU
    foot_switch_control_emu_mode = mode_key() | LIVE_REC((void *)APP_SINGLETON()) << 8;
#endif
    for (port = 0; port < CI_PORTS; port++) {
        int low, high, middle, band, level, down, dest;
        SETTINGS(port, record);
        if (record[REC_MODE / 4] != MODE_FSW) {
            if (hold_active[port])
                pedal(port, DEST_MUTE_HOLD, 0);
            state[port] = UNSEEN;
            continue;
        }
        // Stock's input routine leaves the macro's level as it was for this
        // mode; nothing in the kit should keep playing it.
        ((volatile long *)CI_SOURCE)[port] = 0;
        dest = record[REC_DEST / 4];
        low = record[REC_FSW_LOW / 4];
        high = record[REC_FSW_HIGH / 4];
        middle = (low + high) / 2;
        band = (high > low ? high - low : low - high) / 8;
        if (band < HYSTERESIS_MIN)
            band = HYSTERESIS_MIN;
        level = LEVEL(port);
        if (high < low) {           // REVERSE DIRECTION: pressed is the lower level
            level = -level;
            middle = -middle;
        }
        if (state[port] == UNSEEN)
            down = level > middle;
        else if (state[port])
            down = level > middle - band;
        else
            down = level > middle + band;
        if (dest != last_dest[port]) {
            if (hold_active[port])
                pedal(port, DEST_MUTE_HOLD, 0);
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
