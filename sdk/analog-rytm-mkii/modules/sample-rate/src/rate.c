// SPDX-License-Identifier: GPL-3.0-or-later
// Sample Rate for the Analog Rytm MKII: a sample's speed down to a stop and
// into reverse, as the Octatrack's RATE with its setting on PTCH.
//
// Stock's sample engine builds each voice's step once a block, in the prefetch,
// from the note, TUN and FIN, clamped to 0.25x..4x. For a sound with SOUND
// SETTINGS > SMP RATE on, the gates in audio.s take FIN out of the pitch and
// scale the step by |FIN - 64| / 64, with raw 127 exactly 1x (the Octatrack's
// increment: PTCH's, times that). Below 64 the voice goes backward: stock plays
// a sample backward when END is below STA, so this handler swaps the effective
// STA and END before the prefetch reads them. A trig then starts from END. Stock
// rebuilds the array every block before this runs, so the swap lasts one block.
//
// The setting is a bit of the sound. Stock copies a sound's settings to the
// audio side, per track, whenever it applies a sound to a track (kit load, sound
// load, a sound lock on a trig, a change in SOUND SETTINGS or a tap of FIN's knob):
// the module's copy follows there (sample_rate_applied), so the audio code never
// walks the kit.

#include <stdint.h>
#include "analog-rytm-mk2/store.h"

#define EFF(t, i) (*(volatile short *)(PARAMS_EFF_AT + (t) * 84 + (i) * 2))
#define IDX_FIN 18
#define IDX_STA 21
#define IDX_END 22
#define IDX_LOP 23
#define VPOS(v) (*(volatile int *)(VOICE_REC_AT + (v) * 92 + 4))
#define VFRAMES(v) (*(volatile unsigned *)(VOICE_REC_AT + (v) * 92 + 20))
#define VDOWN(v) (*(volatile unsigned char *)(VOICE_REC_AT + (v) * 92 + 42))
#define OWNER(v) (*(volatile unsigned char *)(VOICE_OWNER_AT + (v)))
#define TRIG_NEXT (*(volatile unsigned *)TRIG_NEXT_AT)   // one bit a voice, as stock's prefetch tests it

#define VOICES 8
#define TRACKS 12
#define ID_FIN 40           // FIN's parameter id
#define STOP 0x4000         // FIN 64 in 8.8: the step scales to 0, and in the pitch no detune
#define FULL 0x7f00         // FIN 127 in 8.8: 1x
#define TURN_LAG 14         // going down, the voice reads this many frames below the same position
#define EDGE 32             // frames from STA or END where a change of direction waits
#define MIN_WAIT 141        // shortest loop stock plays: below it no position is clear of both

STORE_FIELD(sample_rate_on);

unsigned char sample_rate_voices;               // one bit a voice: audio.s scales its step

static volatile unsigned char track_on[TRACKS]; // one byte a track: written from the UI and the audio interrupt

static unsigned char going_down[VOICES];        // the way each voice went last block

// stock's frames for STA and END (8.8, of 120), audio.s; the DMA follows these frames
void sample_rate_frames(int sta, int end, unsigned frames, int *out);

// From the gate in stock's routine that applies a sound to a track, audio side
void sample_rate_applied(void *sound, int track)
{
    if (track >= 0 && track < TRACKS)
        track_on[track] = (unsigned char)core_store_get(STORE(sample_rate_on), sound, 0);
}

// RATE's sign changes on this voice. Going down the voice reads TURN_LAG frames
// below the same position, so the position moves to keep the frames heard. Near
// STA or END of a loop the change waits: a voice just past an edge (LOP PIPO
// leaves it there) sent back over it wraps by a whole loop, and RATE comes through
// zero slowly, so it can sit there a while. 0 while it waits. A trig does not
// wait, and the prefetch places a voice that starts.
static int turn_round(int v, int t, int trig)
{
    int f[2], lo, hi, p = VPOS(v), inner;
    int sta = EFF(t, IDX_STA), end = EFF(t, IDX_END);
    sample_rate_frames(sta < 0 ? 0 : sta, end < 0 ? 0 : end, VFRAMES(v), f);
    lo = f[0] < f[1] ? f[0] : f[1];
    hi = f[0] < f[1] ? f[1] : f[0];
    inner = p >= lo + EDGE && p < hi - EDGE;
    if (inner) {
        if (!trig)
            VPOS(v) = p + (VDOWN(v) ? -TURN_LAG : TURN_LAG);    // stock's direction: LOP PIPO may have its own
        return 1;
    }
    return trig || !(EFF(t, IDX_LOP) >> 8) || hi - lo < MIN_WAIT;
}

// Each block, before the prefetch
void sample_rate_block(void)
{
    unsigned char mask = 0;
    int v;
    for (v = 0; v < VOICES; v++) {
        int t = OWNER(v), on, down;
        if (t >= TRACKS) {
            going_down[v] = 0;
            continue;
        }
        on = track_on[t];
        down = on && EFF(t, IDX_FIN) < STOP;   // switched off going down: back up, as any change of sign
        if (down != going_down[v]) {
            if (turn_round(v, t, (int)(TRIG_NEXT >> v & 1)))
                going_down[v] = (unsigned char)down;
            else
                down = going_down[v];
        }
        if (on)
            mask |= (unsigned char)(1u << v);
        if (down) {
            short sta = EFF(t, IDX_STA);
            EFF(t, IDX_STA) = EFF(t, IDX_END);
            EFF(t, IDX_END) = sta;
        }
    }
    sample_rate_voices = mask;
}

// The selected track's sound, for the row, the tap and the knob's label.
// Stock returns pointers in d0: these are integers, cast where used.
typedef uint32_t (*get0_t)(void);
typedef uint32_t (*get1_t)(uint32_t);
typedef uint32_t (*get2_t)(uint32_t, int);
typedef uint32_t (*get3_t)(uint32_t, int, int);
typedef void (*set_value_t)(uint32_t, int, int, int, int, int);
typedef void (*bitmap_t)(void *, const void *, int, int, int);
typedef int (*held_t)(int);
typedef void (*invalidate_t)(void *);
#define PROJECT ((get0_t)PROJECT_AT)
#define TRACK_INDEX_OF ((get1_t)TRACK_INDEX_OF_AT)
#define KIT_TRACK_SOUND ((get2_t)KIT_TRACK_SOUND_AT)
#define PARAM_TARGET ((get3_t)PARAM_TARGET_AT)
#define PARAM_SET ((set_value_t)PARAM_SET_AT)
#define BITMAP_DRAW ((bitmap_t)BITMAP_DRAW_AT)
#define CHECK_GLYPHS (*(const unsigned char *const *)CHECK_GLYPHS_AT)    // unchecked, then checked
#define IS_KEY_HELD ((held_t)IS_KEY_HELD_AT)
#define LOCK_EDITOR ((get1_t)LOCK_EDITOR_AT)
#define LIVE_RECORDING ((get1_t)LIVE_RECORDING_AT)
#define VIEW_INVALIDATE ((invalidate_t)VIEW_INVALIDATE_AT)
#define SOUND_OF_WRAPPER 40          // the wrapper's vtable: its live sound, or 0
#define NOTIFY_OF_WRAPPER 16         // and the change notice
#define LIVE_SOUND_FIN 0x38          // FIN's word in a live sound
#define PROJECT_TRACKSEL 48          // the project's track selection
#define PROJECT_TRACKS 352           // the project's track sounds
#define VIEW_PAGE_STATE 108          // a sound page view's lock and record state
#define VT_PARAM_OBJ 160              // a sound page view's vtable: its parameter object
#define VIEW_MANAGER 44              // a view's view manager
#define MANAGER_LAST 24              // the manager's top list node
#define NODE_VIEW 8                  // a list node's view
#define KEY_FUNC 0x80
#define KEY_NO 0x45
#define KEY_PAD_FIRST 0x90
#define KEY_PAD_LAST 0x9b
#define KEY_TRIGS 16                 // trig keys are ids 0..15
#define KEY_DOWN 1                   // the event's flags
#define KEY_REPEAT 8
#define ENC_FIN 1                    // encoder B on the SAMPLE page
#define TAP_TICKS 8                  // about 0.4 s of the UI's 20 Hz
#define TAP_TURNS 3                  // encoder events in a press that make it a turn

struct picked {
    uint32_t project, wrapper;
    unsigned char *sound;
    int track;
};

static int pick(struct picked *p)
{
    p->project = PROJECT();
    p->track = (int)TRACK_INDEX_OF(p->project + PROJECT_TRACKSEL);
    if ((unsigned)p->track >= TRACKS)
        return 0;
    p->wrapper = KIT_TRACK_SOUND(p->project + PROJECT_TRACKS, p->track);
    p->sound = (unsigned char *)(*(get1_t *)(*(uint32_t *)p->wrapper + SOUND_OF_WRAPPER))(p->wrapper);
    return p->sound != 0;
}

int sample_rate_selected(void)   // nonzero while FIN is RATE on the selected track's sound
{
    struct picked p;
    return pick(&p) && core_store_get(STORE(sample_rate_on), p.sound, 0);
}

// FIN at its detune's rest would stop the sample, so switching on takes it to
// 1x, and switching off takes 1x back to rest. Any other value stays: it may be
// a sound's real detune, or the RATE to come back to.
static void set_on(int on)
{
    struct picked p;
    struct {
        const void *vtable;
        unsigned char changed;
    } info = {(const void *)CONFIG_CHANGED_INFO, 1};
    int fin;
    if (!pick(&p) || (int)core_store_get(STORE(sample_rate_on), p.sound, 0) == on)
        return;
    core_store_set(STORE(sample_rate_on), p.sound, 0, (unsigned)on);
    ((void (*)(uint32_t, void *))*(uint32_t *)(*(uint32_t *)p.wrapper + NOTIFY_OF_WRAPPER))(p.wrapper, &info);
    fin = *(short *)(p.sound + LIVE_SOUND_FIN);
    if (on && fin == STOP)
        PARAM_SET(PARAM_TARGET(p.project, p.track, 0), ID_FIN, FULL, p.track, 1, 1);
    else if (!on && fin >= FULL)
        PARAM_SET(PARAM_TARGET(p.project, p.track, 0), ID_FIN, STOP, p.track, 1, 1);
}

// The SOUND SETTINGS row. core_additem builds it from four callbacks, each
// called as its std::function's invoker: the first argument is the function's
// payload, which holds the menu for select and change.
extern void sample_rate_row_label(void);
extern void core_additem(void *menu, const void *row);

static void row_select(void **menu, void *item)
{
    (void)item;
    set_on(!sample_rate_selected());
    VIEW_INVALIDATE((char *)*menu + 56);
}

static void row_draw(void **menu, void *item, void *bitmap, int x, int y)
{
    (void)menu;
    (void)item;
    BITMAP_DRAW(bitmap, CHECK_GLYPHS + (sample_rate_selected() ? 28 : 0), x + 11, y, 0);
}

static void row_change(void **menu, void *item, int dir)
{
    (void)item;
    if (dir) {
        set_on(dir > 0);
        VIEW_INVALIDATE((char *)*menu + 56);
    }
}

static const void *const row[4] = {
    (const void *)sample_rate_row_label, (const void *)row_select,
    (const void *)row_draw, (const void *)row_change,
};

void sample_rate_add_row(void *menu)
{
    core_additem(menu, row);
}

// A tap on FIN's knob turns RATE over: pressed and let go inside TAP_TICKS. A
// click nudges the encoder, so the first turns of a press are swallowed, neither
// a turn nor a change of value; TAP_TURNS of them make it stock's press and turn.
// Stock's press shows the parameter and changes nothing, so it goes on as ever. A
// press with a trig, FUNC or NO held, with a lock editor open, or with a pad held
// in scene or performance mode is stock's lock work, and so is every press in
// running live recording.
static int tap_ticks = -1;      // UI ticks since the press, -1 with no tap open
static int tap_turns;

extern char sample_rate_vt_scene[], sample_rate_vt_perf[];   // the top view in those modes

static int plain_press(void *view)
{
    uint32_t page = *(uint32_t *)((char *)view + VIEW_PAGE_STATE);
    uint32_t manager = *(uint32_t *)((char *)view + VIEW_MANAGER);
    uint32_t node = *(uint32_t *)(manager + MANAGER_LAST);
    uint32_t top = **(uint32_t **)(node + NODE_VIEW);
    int k;
    if (top == (uint32_t)sample_rate_vt_scene || top == (uint32_t)sample_rate_vt_perf)
        for (k = KEY_PAD_FIRST; k <= KEY_PAD_LAST; k++)
            if (IS_KEY_HELD(k))
                return 0;           // in those modes a held pad is the scene being edited
    if (LOCK_EDITOR(page) || LIVE_RECORDING(page) || IS_KEY_HELD(KEY_FUNC) || IS_KEY_HELD(KEY_NO))
        return 0;
    for (k = 0; k < KEY_TRIGS; k++)
        if (IS_KEY_HELD(k))
            return 0;
    return 1;
}

// Stock puts a parameter's name in the header at the press, and the tap acts at
// the release, so it puts the name there again, as stock's handler does.
extern void sample_rate_string(void *string, const char *text, void *allocator);
extern void sample_rate_string_end(void *string);
extern void sample_rate_header(uint32_t page, void *string);
extern uint32_t sample_rate_long_name(uint32_t obj, int id);

static void show_name(void *view)
{
    uint32_t vtable = *(uint32_t *)view;
    uint32_t obj = (*(get2_t *)(vtable + VT_PARAM_OBJ))((uint32_t)view, -1);
    uint32_t string[2];
    char allocator;
    sample_rate_string(string, (const char *)sample_rate_long_name(obj, ID_FIN), &allocator);
    sample_rate_header(*(uint32_t *)((char *)view + VIEW_PAGE_STATE), string);
    sample_rate_string_end(string);
}

// From the gate in stock's sound page key handler, for any knob's press or release
void sample_rate_knob(void *view, int id, const char *event)
{
    int flags = *(const int *)(event + 16);
    if (id != ID_FIN || (flags & KEY_REPEAT))
        return;
    if (flags & KEY_DOWN) {
        tap_ticks = plain_press(view) ? 0 : -1;
        tap_turns = 0;
    } else {
        if (tap_ticks >= 0 && plain_press(view)) {
            set_on(!sample_rate_selected());
            show_name(view);
            VIEW_INVALIDATE(view);
        }
        tap_ticks = -1;
    }
}

int sample_rate_turn(void *brain, char *event)
{
    (void)brain;
    if (*(int *)(event + 12) != ENC_FIN || tap_ticks < 0)
        return 0;
    if (++tap_turns < TAP_TURNS)
        return 1;
    tap_ticks = -1;
    return 0;
}

void sample_rate_tick(void *ctrl)
{
    (void)ctrl;
    if (tap_ticks >= 0 && ++tap_ticks > TAP_TICKS)
        tap_ticks = -1;
}
