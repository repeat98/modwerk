// MIDI Mute for the Analog Rytm MKII (OS 1.74): a Modwerk elemod module.
//
// Stock mutes stop the sequencer only: a note that comes in over USB or DIN
// MIDI still plays a muted track. With MUTE MIDI IN on, this module drops a
// Note On for a muted track, and when a track is muted while it holds a note
// that came in over MIDI, it releases that note as its Note Off would.
//
// Both ports reach one MIDI task, which hands a Note On to stock's note-on
// routine. That routine works out the tracks the note is for (every track on
// the note's channel, or the active track on the AUTO channel) and plays each
// through a per-track call; a Note Off (or a Note On with velocity 0) does the
// same through a per-track release. The module takes those two per-track
// calls inside the MIDI routines only (sites.s); pads, TRIG keys and the
// sequencer reach the same play routine from elsewhere and stay stock.
//
// A track is muted when its bit is set in the project's mute mask, the one
// MUTE mode's pads (and FUNC + pads), and MIDI CC 94 set.

#include <stdint.h>
#include "analog-rytm-mk2/store.h"

STORE_FIELD(midi_mute_on);      // project, 1 bit: 1 = MUTE MIDI IN on

extern void core_additem(void *menu, const void *row);
extern void midi_mute_label(void);

#define TRACKS 13               // BD..CY/CB and the FX track
#define PITCHES 128

// OS 1.74 locations (build.json release cflags)
#define MUTE_MASK (*(volatile uint32_t *)MUTE_MASK_AT)     // bit t: track t muted
#define HELD(t, p) (((volatile int32_t *)HELD_COUNT_AT)[(t) * PITCHES + (p)])  // stock's held count
typedef void (*play_fn)(int track, int pitch, int vel, int iface, int a, int b, int c);
typedef void (*release_fn)(int track, int pitch, int iface);
#define STOCK_PLAY ((play_fn)PLAY_AT)
#define STOCK_RELEASE ((release_fn)RELEASE_AT)

static int enabled;             // MUTE MIDI IN, read from the project
static uint32_t seen_mask;      // the mute mask at the last tick
static int last_iface[TRACKS];  // the interface of a track's last MIDI note
static uint32_t held[TRACKS][PITCHES / 32];     // notes MIDI played on a track
static uint32_t swallow[TRACKS][PITCHES / 32];  // Note Offs with nothing to release

#define BIT(map, t, p) ((map)[t][(p) >> 5] & (1u << ((p) & 31)))
#define SET(map, t, p) ((map)[t][(p) >> 5] |= 1u << ((p) & 31))
#define CLR(map, t, p) ((map)[t][(p) >> 5] &= ~(1u << ((p) & 31)))

static int muted(int track)
{
    return (MUTE_MASK >> track) & 1;
}

// The MIDI note-on routine's per-track call (sites.s): play it, or drop it
// for a muted track. Runs in the MIDI task, once per track a note is for.
void midi_mute_note_on(int track, int pitch, int vel, int iface)
{
    if ((unsigned)track >= TRACKS || (unsigned)pitch >= PITCHES)
        return;
    if (enabled && muted(track)) {
        SET(swallow, track, pitch);     // its Note Off finds nothing to release
        return;
    }
    CLR(swallow, track, pitch);
    SET(held, track, pitch);
    last_iface[track] = iface;
    STOCK_PLAY(track, pitch, vel, iface, 0, -1, -1);
}

// The MIDI note-off routine's per-track call (sites.s): a Note Off whose
// Note On was dropped, or whose note the module already released, releases
// nothing. Every other Note Off is stock's.
void midi_mute_note_off(int track, int pitch, int iface)
{
    if ((unsigned)track >= TRACKS || (unsigned)pitch >= PITCHES)
        return;
    if (BIT(swallow, track, pitch) && HELD(track, pitch) <= 0) {
        CLR(swallow, track, pitch);
        return;
    }
    CLR(held, track, pitch);
    STOCK_RELEASE(track, pitch, iface);
}

// Release every note MIDI holds on a newly muted track, as its Note Off would.
static void release_track(int track)
{
    for (int w = 0; w < PITCHES / 32; w++) {
        uint32_t bits = held[track][w];
        held[track][w] = 0;
        for (int b = 0; bits; b++, bits >>= 1) {
            if (!(bits & 1))
                continue;
            int pitch = w * 32 + b;
            for (int n = 0; n < 8 && HELD(track, pitch) > 0; n++)
                STOCK_RELEASE(track, pitch, last_iface[track]);
            SET(swallow, track, pitch);
        }
    }
}

// ev_tick: the UI compose check, about 20 Hz
void midi_mute_tick(void *ctrl)
{
    (void)ctrl;
    uint32_t mask = MUTE_MASK;
    uint32_t newly = mask & ~seen_mask;
    seen_mask = mask;
    if (!enabled || !newly)
        return;
    for (int t = 0; t < TRACKS; t++)
        if (newly & (1u << t))
            release_track(t);
}

static void forget(void)
{
    for (int t = 0; t < TRACKS; t++)
        for (int w = 0; w < PITCHES / 32; w++)
            held[t][w] = swallow[t][w] = 0;
    seen_mask = MUTE_MASK;
}

// ev_project: after a project load (at boot too) or CREATE NEW
void midi_mute_project(int how, unsigned dropped)
{
    (void)how;
    (void)dropped;
    enabled = core_store_get(STORE(midi_mute_on), 0, 0);
    forget();
}

// The PORT CONFIG row (GLOBAL > MIDI CONFIG > PORT CONFIG, after RECEIVE
// CC/NRPN), a checkbox as stock's RECEIVE rows draw it. core_additem builds it
// from four callbacks, each called as its std::function's invoker: the first
// argument is the function's payload, which holds the menu for select and
// change. The label's text comes back as an integer, in d0, where label.s
// reads it (gcc returns pointers in a0).
typedef void (*draw_fn)(void *bitmap, const void *glyph, int x, int y, int mode);
typedef void (*invalidate_fn)(void *view_part);
#define BITMAP_DRAW ((draw_fn)BITMAP_DRAW_AT)
#define CHECK_GLYPHS (*(const uint8_t *const *)CHECK_GLYPHS_AT)    // unchecked, then checked
#define VIEW_INVALIDATE ((invalidate_fn)VIEW_INVALIDATE_AT)

uint32_t midi_mute_text(void)
{
    return (uint32_t)"MUTE MIDI IN";
}

static void set_enabled(void **payload, int on)
{
    enabled = on;
    core_store_set(STORE(midi_mute_on), 0, 0, enabled);
    seen_mask = on ? 0 : MUTE_MASK;     // checked: the next tick releases what muted tracks hold
    VIEW_INVALIDATE((char *)*payload + 56);     // redraw the menu, as stock's rows do
}

// YES turns it over
static void midi_mute_select(void **payload, void *item)
{
    (void)item;
    set_enabled(payload, !enabled);
}

// the checkbox, where stock's RECEIVE rows draw theirs
static void midi_mute_draw(void **payload, void *item, void *bitmap, int x, int y)
{
    (void)payload;
    (void)item;
    BITMAP_DRAW(bitmap, CHECK_GLYPHS + (enabled ? 28 : 0), x + 11, y, 0);
}

// RIGHT checks, LEFT unchecks
static void midi_mute_change(void **payload, void *item, int dir)
{
    (void)item;
    if (dir && (dir > 0) != enabled)
        set_enabled(payload, dir > 0);
}

static const void *const midi_mute_row[4] = {
    (const void *)midi_mute_label, (const void *)midi_mute_select,
    (const void *)midi_mute_draw, (const void *)midi_mute_change,
};

// sites.s, after PORT CONFIG's last row: add this one to the same menu
void midi_mute_port_rows(void *menu)
{
    core_additem(menu, midi_mute_row);
}
