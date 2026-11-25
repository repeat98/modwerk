// SPDX-License-Identifier: GPL-3.0-or-later
// Quick Mod Assign (id quick-velocity-aftertouch-assign) for the Analog Rytm MKII: link a
// parameter to velocity, aftertouch or the LFO by holding a key and turning
// its knob.
//
//   FIX + turn a knob       links that parameter to velocity; the turn sets the
//                           amount (-128..127), continuing from the slot's amount.
//   SAMPLER + turn a knob   the same for aftertouch.
//   LFO + turn a knob       makes that parameter the LFO's destination (DST),
//                           at depth 0 on the first turn; further turns set DEP
//                           (-128.00..+127.99) at DEP's own step.
//   SCENE + turn a knob     locks that parameter in the active scene (with none
//                           engaged, the scene engaged last), as stock's scene
//                           edit does with the scene's pad held.
//   SCENE + a pad           moves to that pad's track for its locks (in scene
//                           mode too, with AUTO TRK SWITCH on).
//
// While a key is held, stock draws every knob already linked with its
// amount, as it does for a held performance or scene pad. The module puts its
// own locker into stock's parameter UI for that (as QPERF does), and stock's
// lock edit turns the knobs through it, so the parameter's own value never
// moves; a knob's press there clears the link to 0, as it clears a lock. A core_params entry
// covers a turn that reaches stock's parameter edit instead.
//
// Each sound has stock's four velocity and four aftertouch slots (SOUND
// SETTINGS, VELOCITY MOD and AFTERTOUCH). A parameter already in a slot keeps
// it; otherwise it takes the first slot with no destination or an amount of 0.
// With all four in use a popup says MODS FULL and nothing changes. The LFO's
// DST and DEP are the sound's own LFO parameters (the FX track's on the FX
// track). The module writes them through stock's own writers and stores
// nothing itself.
//
// FIX pressed and released with no turn toggles fixed velocity as stock does,
// on the release. SAMPLER released with no turn opens the recorder as stock
// does; after a turn its release is the module's. LFO released with no turn
// shows the LFO page as stock does (on the release, not the press); after a
// turn the page stays. A hold of about half a second (LOOK_TICKS) is a
// look at the amounts: its release does nothing, as after a turn. On the LFO
// page itself the key is stock's. During one key's hold the other two do
// nothing. FUNC + FIX (stock's FIXED VELOCITY), FUNC + LFO, FIX and SAMPLER on the FX track, and
// a performance or scene pad or a trig that holds stock's locker stay stock.
//
// Firmware routines are reached at fixed addresses given for each OS release
// by ar2-1.74.h. Stock returns pointers in d0, while m68k-linux GCC expects
// them in a0, so those routines are declared as returning a word.

#include <stdint.h>
#include "ar2-1.74.h"

// QMA_UI marks functions that run only in the UI task (keys, knobs, screen, parameter
// text, tick housekeeping), never in the audio block. cold builds them for size, out of the hot
// code, so the module takes less of the RAM all modules share; the rest stays at -O2. No
// behaviour change.
#define QMA_UI __attribute__((cold))

typedef unsigned long word_t;
typedef word_t (*word0_t)(void);
typedef word_t (*word1_t)(word_t a);
typedef word_t (*word2_t)(word_t a, word_t b);
typedef int (*int1_t)(word_t a);
typedef unsigned char (*bool1_t)(word_t a);   // a C++ bool: only d0's low byte
typedef void (*fixed_set_t)(word_t seq, int on);
typedef unsigned (*is_key_held_t)(int key);
typedef void (*string_from_cstr_t)(void *string, const char *text, void *allocator);
typedef void (*string_dtor_t)(void *string);
typedef void (*popup_ctor_t)(void *popup, void *string);
typedef void (*shared_ptr_ctor_t)(void *shared, void *object);
typedef void (*shared_ptr_release_t)(void *counts);
typedef void (*show_popup_t)(void *views, void *shared, int flag);
typedef void (*set_locker_t)(word_t ui, void *locker);
typedef void (*lock_edit_t)(word_t ui, int on);
typedef void (*end_lock_edit_t)(word_t ui);
typedef void (*set_value_t)(word_t set, int id, int value, int a, int b, int c);
typedef void (*event_ctor_t)(void *event, int key, int flags, int when, int velocity);
typedef void (*event_dtor_t)(void *event);
typedef int (*enc_delta_t)(void *event, int step, int pushed_step);
typedef int (*enc_accumulate_t)(void *state, int knob, int delta, void *profile, int pushed);

#define PROJECT ((word0_t)PROJECT_SINGLETON_AT)
#define PROJECT_KIT ((word1_t)PROJECT_KIT_AT)
#define PROJECT_SEQ ((word1_t)PROJECT_SEQ_AT)
#define SELECTED_TRACK ((int1_t)SELECTED_TRACK_AT)
#define KIT_TRACK ((word2_t)KIT_TRACK_AT)
#define TRACK_VEL_CONF ((word1_t)TRACK_VEL_CONF_AT)
#define TRACK_AT_CONF ((word1_t)TRACK_AT_CONF_AT)
#define KIT_PARAM_SET ((word2_t)KIT_PARAM_SET_AT)
#define FIXED_VEL_GET ((bool1_t)FIXED_VEL_GET_AT)
#define FIXED_VEL_SET ((fixed_set_t)FIXED_VEL_SET_AT)
#define PARAM_FLAGS ((int1_t)PARAM_FLAGS_AT)
#define IS_KEY_HELD ((is_key_held_t)IS_KEY_HELD_AT)
#define STRING_FROM_CSTR ((string_from_cstr_t)STRING_FROM_CSTR_AT)
#define STRING_DTOR ((string_dtor_t)STRING_DTOR_AT)
#define MEM_NEW ((word1_t)MEM_NEW_AT)
#define POPUP_CTOR ((popup_ctor_t)POPUP_CTOR_AT)
#define SHARED_PTR_CTOR ((shared_ptr_ctor_t)SHARED_PTR_CTOR_AT)
#define SHARED_PTR_RELEASE ((shared_ptr_release_t)SHARED_PTR_RELEASE_AT)
#define SHOW_POPUP ((show_popup_t)SHOW_POPUP_AT)
#define PARAM_UI ((word0_t)PARAM_UI_AT)
#define SET_LOCKER ((set_locker_t)SET_LOCKER_AT)
#define GET_LOCKER ((word1_t)GET_LOCKER_AT)
#define LOCK_EDIT ((lock_edit_t)LOCK_EDIT_AT)
#define END_LOCK_EDIT ((end_lock_edit_t)END_LOCK_EDIT_AT)
#define SET_VALUE ((set_value_t)SET_VALUE_AT)
#define PARAM_RECORD ((word1_t)PARAM_RECORD_AT)
#define EVENT_CTOR ((event_ctor_t)KEY_EVENT_CTOR_AT)
#define EVENT_DTOR ((event_dtor_t)KEY_EVENT_DTOR_AT)
#define ENC_DELTA ((enc_delta_t)ENC_DELTA_AT)
#define ENC_ACCUMULATE ((enc_accumulate_t)ENC_ACCUMULATE_AT)
#define KIT_SCENES ((word1_t)KIT_SCENES_AT)
#define ACTIVE_SCENE ((int1_t)ACTIVE_SCENE_AT)
#define CONSUME_KEY ((void (*)(int))CONSUME_KEY_AT)

#define KEY_FIX 0xb3
#define KEY_SAMPLER 0xb4
#define KEY_LFO 0x35
#define KEY_FUNC 0x80
#define KEY_SCENE 0x13
#define KEY_YES 0x44
#define KEY_NO 0x45
#define KEY_REC 0x50                // REC, PLAY, STOP: copy, clear, paste with SCENE held
#define KEY_PLAY 0x51
#define KEY_STOP 0x52
#define KEY_PUSH_FIRST 0x70         // the knobs' presses, A..H
#define KEY_PUSH_LAST 0x77
#define KEY_PAD_FIRST 0x90          // BD .. CB
#define KEY_PAD_LAST 0x9b
#define TRIG_KEYS 16                // trig keys 0..15
#define EV_KEY 12                   // event + 12: the key
#define EV_FLAGS 16                 // event + 16: bit 0 down (clear on release), 8 repeat
#define PRESSED 1
#define REPEAT 8
#define CLEAN 0x10                  // on a release: no other key went down during the hold
#define ENC_CLICKS 16               // encoder event + 16: its clicks
#define BRAIN_VIEWS 32              // brain + 32: the view manager
#define MANAGER_LIST 20             // view manager + 20: its list's sentinel node
#define MANAGER_LAST 24             // view manager + 24: the top view's list node
#define NODE_PREV 4
#define NODE_VIEW 8
#define POPUP_BYTES 0xa0
#define CTRL_REDRAW 0x20            // ev_tick's ctrl: asks for a redraw
#define FX_TRACK 12
#define STEP 256                    // one amount step in 8.8
#define AMOUNT_MIN (-128 * STEP)
#define AMOUNT_MAX (127 * STEP)
#define POPUP_TICKS 4               // at most one popup in four ticks (about 200 ms)

enum { NONE = -1, VEL, AT, LFO, SCN, KINDS };

// One hold per key: FIX for velocity, SAMPLER for aftertouch, LFO for the LFO,
// SCENE for scene locks.
// A hold is ours only when its press came on a page of ours without FUNC.
struct hold {
    int key;
    int held;                       // the press was ours and the key is down
    int turned;                     // an encoder turned during the hold
    int ignored;                    // pressed during another key's hold: its release is ours
    unsigned since;                 // ev_tick's count at the press
};
static struct hold holds[KINDS] = {
    { KEY_FIX, 0, 0, 0, 0 }, { KEY_SAMPLER, 0, 0, 0, 0 }, { KEY_LFO, 0, 0, 0, 0 },
    { KEY_SCENE, 0, 0, 0, 0 },
};
// A hold of about half a second with no turn is a look at the amounts, not a tap: counted in ev_tick's
// calls, as stock's UI loop runs them. Not by stock's key repeat: it moves to the last key pressed, so a
// page key pressed during the hold stopped the count (rytm-emu, 15 Nov 2026).
#define LOOK_TICKS 10
// A SCENE hold shows the scene's locks this many ticks in (about 0.2 s), so a tap does not flash them.
#define SHOW_TICKS 4
static unsigned ticks;              // ev_tick's count

static void *views;
static char message[28];
static int pending;                 // a popup for ev_tick
static int wait;                    // ticks until the next popup may open
static int redraw;                  // ev_tick asks for a redraw
static int shown = NONE;            // the kind our locker shows, NONE when not set
static unsigned lfo_flags;          // the LFO press held back, for its replay
static int lfo_swallowed;           // that press was held back and its release not seen yet
static int replaying;               // the held-back tap is going round the key chain now
static unsigned scn_flags;          // SCENE's press, for the replayed repeat
static int scn_ours;                // that press started a SCENE hold, its release not seen yet
static int scn_repeated;            // a SCENE repeat was swallowed: the release opens scene edit
static int scn_locking;             // a knob or pad event ended SCENE's hold for scene locks
static int last_scene;              // the scene engaged last (0, scene 1, until one is)
static unsigned pads_taken;         // pads whose press the module took in scene mode: their releases too

// core-ar2's ev_key site (core.s): every mod's ev_key handler in order, then
// stock's Brain::key, as for a key from the panel. Every core-ar2 0.7 and
// Modwerk base build exports it.
extern int core_key(void *brain, void *event);

// What is on screen: the top view's class, past the popups, which pass keys on.
QMA_UI static word_t top_view(void)
{
    char *sentinel = (char *)views + MANAGER_LIST;
    char *node = *(char **)((char *)views + MANAGER_LAST);
    while (node && node != sentinel) {
        word_t vtable = **(word_t **)(node + NODE_VIEW);
        if (vtable != POPUP_VTABLE)
            return vtable;
        node = *(char **)(node + NODE_PREV);
    }
    return 0;                           // only popups: no page of ours
}

QMA_UI static int pad_screen(word_t top)
{
    return top == PERF_VTABLE || top == PERF_EDIT_VTABLE
        || top == SCENE_VTABLE || top == SCENE_EDIT_VTABLE;
}

QMA_UI static int on_pages(void)
{
    word_t top;
    if (!views)
        return 0;
    top = top_view();
    return top == PAGES_TOP_VTABLE || pad_screen(top)
        || top == MUTE_VTABLE || top == CHROMATIC_VTABLE;
}

// The page shown as itself: the pages on top, or a pad mode (PERF, SCNE, MUTE,
// CHRO), which only changes what the pads do and draws the page as it is. Not
// scene edit or performance edit, where stock's own edit owns the knobs and pads.
QMA_UI static int page_shown(void)
{
    word_t top;
    if (!views)
        return 0;
    top = top_view();
    return top == PAGES_TOP_VTABLE || top == PERF_VTABLE || top == SCENE_VTABLE
        || top == MUTE_VTABLE || top == CHROMATIC_VTABLE;
}

// The top view's object, past the popups; 0 for none.
QMA_UI static char *top_object(void)
{
    char *sentinel = (char *)views + MANAGER_LIST;
    char *node = *(char **)((char *)views + MANAGER_LAST);
    while (node && node != sentinel) {
        char *view = *(char **)(node + NODE_VIEW);
        if (*(word_t *)view != POPUP_VTABLE)
            return view;
        node = *(char **)(node + NODE_PREV);
    }
    return 0;
}

// Scene edit with none of its scene pads held: a SCENE hold locks the scene it shows.
QMA_UI static int scene_edit_free(void)
{
    char *view;
    if (!views || top_view() != SCENE_EDIT_VTABLE)
        return 0;
    view = top_object();
    return view && !*(unsigned *)(view + SCENE_EDIT_PADS);
}

// Where a SCENE hold may make scene locks: the pages and pad modes as page_shown, and
// scene edit while no scene pad is held there (a held pad edits its own scene's locks).
QMA_UI static int scene_screen(void)
{
    return page_shown() || scene_edit_free();
}

QMA_UI static const char *row(int id)
{
    return (const char *)PARAM_TABLE + id * PARAM_ROW_BYTES;
}

QMA_UI static int row_word(int id, int offset)
{
    return *(const int *)(row(id) + offset);
}

QMA_UI static word_t vcall(word_t object, int slot)
{
    return (*(word_t **)object)[slot / 4];
}

#define SET_COUNT(s) ((int (*)(word_t))vcall(s, SLOTS_COUNT))(s)
#define SET_DEST(s, i) ((int (*)(word_t, int))vcall(s, SLOTS_DEST))(s, i)
#define SET_AMOUNT(s, i) ((int (*)(word_t, int))vcall(s, SLOTS_AMOUNT))(s, i)
#define SET_WRITE_DEST(s, i, id) ((void (*)(word_t, int, int))vcall(s, SLOTS_SET_DEST))(s, i, id)
#define SET_WRITE_AMOUNT(s, i, v) ((void (*)(word_t, int, int))vcall(s, SLOTS_SET_AMOUNT))(s, i, v)
#define SOUND_ID_OF(s, i) ((int (*)(word_t, int))vcall(s, SOUND_SET_ID_OF))(s, i)
#define SET_READ_ID(s, id) ((int (*)(word_t, int))vcall(s, SET_READ))(s, id)

QMA_UI static int any_held(int first, int last)
{
    int k;
    for (k = first; k <= last; k++)
        if (IS_KEY_HELD(k))
            return 1;
    return 0;
}

#define ANY_TRIG_HELD() any_held(0, TRIG_KEYS - 1)
// The pads held, from their own events (ev_key): on the author's unit stock's key table
// (0x40081c28) reported every pad held with none touched (25 Nov 2026), so it is not asked.
static unsigned pads_down;
#define ANY_PAD_HELD() (pads_down != 0)

QMA_UI static void show(const char *text)
{
    char *p = message;
    while (*text && p < message + sizeof message - 1)
        *p++ = *text++;
    *p = 0;
    pending = 1;
}

QMA_UI static int selected_track(void)
{
    return SELECTED_TRACK(PROJECT_SEQ(PROJECT()));
}

QMA_UI static int sound_track(int track)
{
    return track >= 0 && track < FX_TRACK;
}

// The tracks a kind works on: velocity and aftertouch on the sound tracks,
// the LFO and scene locks on the FX track too.
QMA_UI static int kind_track(int kind, int track)
{
    return kind == LFO || kind == SCN ? track >= 0 && track <= FX_TRACK : sound_track(track);
}

// SCENE (from 0.4.0). Stock opens scene edit on SCENE's first key repeat, about
// 0.2 s into the hold, and toggles scene mode on a clean release. The module lets
// the press pass (stock does nothing on it), swallows the repeats while SCENE is
// held and decides at the release: a tap (no repeat seen) is stock's toggle; a
// hold with no knob replays one repeat, so stock opens scene edit then; a hold
// with a knob turn or press puts a locker of the module's own into the parameter
// UI that forwards to stock's SceneParamLocker routines for the target scene, and
// ends SCENE's hold as stock does when it opens a screen (CONSUME_KEY), so its
// release is dropped and neither scene edit nor the toggle happens. Stock's lock
// edit then writes the lock (absolute, as scene locks are) and draws the boxes.
// The module writes no lock bytes. With no scene engaged the locks go to the scene
// engaged last. A pad during the hold ends it as a knob does (scene_pad).
//
// The kind held now, NONE without one. A release that never reached ev_key
// must not leave knobs taken, so the key's own state is asked too.
QMA_UI static int held_kind(void)
{
    int k;
    for (k = VEL; k < KINDS; k++)
        if (holds[k].held && !IS_KEY_HELD(holds[k].key))
            holds[k].held = 0;
    for (k = VEL; k < KINDS; k++)
        if (holds[k].held)
            return k;
    return NONE;
}

// The track's velocity or aftertouch slots.
QMA_UI static word_t slots_of(int track, int kind)
{
    word_t sound = KIT_TRACK(PROJECT_KIT(PROJECT()), track);
    return kind == VEL ? TRACK_VEL_CONF(sound) + VEL_SET : TRACK_AT_CONF(sound) + AT_SET;
}

// The slot whose destination is index, -1 for none.
QMA_UI static int slot_of(word_t set, int index)
{
    int n = SET_COUNT(set), i;
    for (i = 0; i < n; i++)
        if (SET_DEST(set, i) == index)
            return i;
    return -1;
}

// The slot that holds index, else the first free one (no destination, or an
// amount of 0), else -1.
QMA_UI static int find_slot(word_t set, int index)
{
    int n = SET_COUNT(set), i, free = -1;
    for (i = 0; i < n; i++) {
        int dest = SET_DEST(set, i);
        if (dest == index)
            return i;
        if (free < 0 && (dest <= 0 || SET_AMOUNT(set, i) == 0))
            free = i;
    }
    return free;
}

// The track's parameter set: its sound's, or the FX track's.
QMA_UI static word_t param_set(int track)
{
    return KIT_PARAM_SET(PROJECT_KIT(PROJECT()), track);
}

// The logical id stock's destination list gives a parameter's index on this
// track, 0 when it is no destination or outside stock's id table. The LFO's
// own parameters are no LFO destination.
QMA_UI static int dest_id(int kind, int track, int index)
{
    int logical;
    if (index <= 0)
        return 0;
    logical = SOUND_ID_OF(param_set(track), index);
    if (logical <= 0 || logical >= PARAM_ROWS)
        return 0;
    if (kind == LFO && logical >= ID_LFO_FIRST && logical <= ID_LFO_LAST)
        return 0;
    if (kind == LFO)
        return (PARAM_FLAGS(logical) & LFO_DEST_MASK) == LFO_DEST_MASK ? logical : 0;
    return PARAM_FLAGS(logical) & FLAG_MOD_DEST ? logical : 0;
}

QMA_UI static void not_a_destination(int kind)
{
    show(kind == VEL ? "NOT A VELOCITY DEST"   // DEST, as stock's menus abbreviate it
        : kind == AT ? "NOT AN AFTERTOUCH DEST" : "NOT AN LFO DEST");
}

// Changes the amount (8.8) of the destination logical on track by change, in
// the parameter's own resolution; 0 only makes sure it has a slot. A fine knob
// such as TUN turns in fractions, so a change is at least one step, and a fast
// turn as many as the parameter would move. A popup says why when it cannot.
QMA_UI static void nudge(int kind, int track, int logical, int change)
{
    int index = row_word(logical, ROW_INDEX), slot, amount, steps;   // the byte stock stores
    word_t set = slots_of(track, kind);
    if (SET_COUNT(set) <= 0)
        return;                         // no slots on this sound
    slot = find_slot(set, index);
    if (slot < 0) {
        show(kind == VEL ? "VELOCITY MODS FULL" : "AFTERTOUCH MODS FULL");
        return;
    }
    if (SET_DEST(set, slot) != index) {
        SET_WRITE_AMOUNT(set, slot, 0);
        SET_WRITE_DEST(set, slot, logical);
    }
    steps = (change < 0 ? -change : change) / STEP;
    if (change && !steps)
        steps = 1;
    if (change < 0)
        steps = -steps;
    amount = SET_AMOUNT(set, slot) + steps * STEP;
    if (amount < AMOUNT_MIN)
        amount = AMOUNT_MIN;
    if (amount > AMOUNT_MAX)
        amount = AMOUNT_MAX;
    SET_WRITE_AMOUNT(set, slot, amount);
}

// ---- The LFO's DST and DEP ------------------------------------------------------

QMA_UI static int lfo_read(int track, int id)
{
    word_t set = param_set(track);
    return SET_READ_ID(set, id);
}

QMA_UI static void lfo_write(int track, int id, int value)
{
    SET_VALUE(param_set(track), id, value, -1, 0, 1);
}

// The parameter index the track's LFO modulates, 0 for none.
QMA_UI static int lfo_dest(int track)
{
    return lfo_read(track, ID_LFO_DST) >> 8;
}

// The depth as the locker shows it: 8.8, -128.00..+127.99.
QMA_UI static int lfo_shown(int track)
{
    return (lfo_read(track, ID_LFO_DEP) - DEP_CENTRE) * 2;
}

// DEP moves as the same turns of DEP's own knob would move it: ev_enc runs
// each encoder event of an LFO hold through the LFO page's own accumulator,
// at DEP's knob, with DEP's step and turn profile, as that page does when DEP
// is turned there (0x4003a028), so speed and acceleration are stock's, its
// 10 ms slow-down included (no hold begins on the LFO page itself: its key is
// stock's there). Once a turn has shown which knob is the
// destination's (dest_knob), ev_enc writes DEP at once; before that, the
// change waits in dep_pending for the locker's call. Any key pressed during
// the hold (a page key) forgets the knob.
static int dep_pending;
static int pending_knob = -1;           // the knob dep_pending counts, -1 none
static int dest_knob = -1;              // the knob of the LFO's destination, -1 unknown
// Set by a knob's encoder event during an LFO hold, cleared by the next locker set, every key
// event and every tick: a set with it clear came through stock's locker interface from
// something other than a Rytm knob (MIDI through a module that uses stock's locker, say), whose
// value is all it has. A knob event that reaches no set (a knob that cannot be locked) leaves
// it until then, so a non-encoder set in between is taken as the knob's (its step is lost).
static int encoder_turn;
static int last_knob = -1;              // the knob of the latest encoder event

// The LFO page's knob accumulator, 0 when the page holder is not found.
QMA_UI static void *lfo_accumulator(void)
{
    char *sentinel, *node;
    word_t view;
    if (!views)
        return 0;
    sentinel = (char *)views + MANAGER_LIST;
    for (node = *(char **)((char *)views + MANAGER_LAST); node && node != sentinel;
         node = *(char **)(node + NODE_PREV)) {
        char *holder = *(char **)(node + NODE_VIEW);
        if (*(word_t *)holder != HOLDER_VTABLE)
            continue;
        view = *(word_t *)(holder + HOLDER_LFO_VIEW);
        return view ? (void *)(view + VIEW_ACCUMULATOR) : 0;
    }
    return 0;
}

// The LFO page is the page shown: the pages or a pad mode on top (in every pad
// mode stock's LFO hold shows the page's values; rytm-emu, OS 1.74), and the
// holder's LFO view, a sound's (+ 248) or the FX track's (+ 296; the holder
// keeps a sound's page views at (26 + page) * 8 and the FX track's at
// (32 + page) * 8, 0x400cbbd6), is on the view stack. There the LFO key stays
// stock's, so holding it shows the page's values as holding any page key does,
// and its taps step to a module's page behind it.
QMA_UI static int lfo_page_shown(void)
{
    char *sentinel, *node, *holder = 0;
    word_t lfo, fx_lfo;
    if (!page_shown())
        return 0;
    sentinel = (char *)views + MANAGER_LIST;
    for (node = *(char **)((char *)views + MANAGER_LAST); node && node != sentinel;
         node = *(char **)(node + NODE_PREV))
        if (**(word_t **)(node + NODE_VIEW) == HOLDER_VTABLE) {
            holder = *(char **)(node + NODE_VIEW);
            break;                      // the top-most, as lfo_accumulator takes it
        }
    if (!holder)
        return 0;
    lfo = *(word_t *)(holder + HOLDER_LFO_VIEW);
    fx_lfo = *(word_t *)(holder + HOLDER_FX_LFO_VIEW);
    for (node = *(char **)((char *)views + MANAGER_LAST); node && node != sentinel;
         node = *(char **)(node + NODE_PREV)) {
        word_t view = *(word_t *)(node + NODE_VIEW);
        if (view && (view == lfo || view == fx_lfo))
            return 1;
    }
    return 0;
}

QMA_UI static void dep_add(int track, int change)
{
    int dep;
    if (!change)
        return;
    dep = lfo_read(track, ID_LFO_DEP) + change;
    if (dep < 0)
        dep = 0;
    if (dep > DEP_MAX)
        dep = DEP_MAX;
    lfo_write(track, ID_LFO_DEP, dep);
    redraw = 1;
}

QMA_UI static void dep_turn(void *event)
{
    word_t record = PARAM_RECORD(ID_LFO_DEP);
    long profile[PROFILE_BYTES / 4];
    const long *from = *(const long *const *)(record + RECORD_PROFILE);
    int knob = *(int *)((char *)event + ENC_KNOB), i, delta, track;
    unsigned char pushed = ((unsigned char *)event)[ENC_PUSHED];
    void *accumulator = lfo_accumulator();
    last_knob = knob >= 0 && knob < KNOBS ? knob : -1;
    if (last_knob < 0 || !from || !accumulator)
        return;
    for (i = 0; i < PROFILE_BYTES / 4; i++)
        profile[i] = from[i];
    delta = ENC_DELTA(event, *(const int *)(record + RECORD_STEP),
        *(const int *)(record + RECORD_STEP_PUSHED));
    delta = ENC_ACCUMULATE(accumulator, KNOB_DEP, delta, profile, pushed);
    track = selected_track();
    if (knob == dest_knob && shown == LFO && kind_track(LFO, track)
        && !ANY_TRIG_HELD() && lfo_dest(track) > 0)
        dep_add(track, delta);
    else {
        if (knob != pending_knob)
            dep_pending = 0;            // only the latest knob's turns can be the destination's
        pending_knob = knob;
        dep_pending += delta;
    }
}

QMA_UI static void dep_drop(void)
{
    dep_pending = 0;
    pending_knob = -1;
}

// A turn of the knob of index on track: a new destination takes the LFO at
// depth 0; the destination's own knob moves DEP by what its turns have made.
QMA_UI static void lfo_turn(int track, int index)
{
    int change;
    if (lfo_dest(track) != index) {
        lfo_write(track, ID_LFO_DST, index << 8);
        lfo_write(track, ID_LFO_DEP, DEP_CENTRE);
        dep_drop();                     // the grabbing turn sets no depth
        dest_knob = last_knob;
        redraw = 1;
        return;
    }
    dest_knob = last_knob;
    change = pending_knob == last_knob ? dep_pending : 0;
    dep_drop();
    dep_add(track, change);
}

// ---- The locker stock draws and edits through while a key is held ------------
// Its "param" is a parameter's index, as the slots and LFO DST store it.

// The kind our locker answers for on track, NONE when it has nothing to say.
// SCENE has a locker of its own (scene_locker).
QMA_UI static int shown_on(int track)
{
    return shown != NONE && shown != SCN && kind_track(shown, track) ? shown : NONE;
}

QMA_UI static int locker_has_any(void *self)
{
    int track = selected_track(), kind = shown_on(track), i, n;
    word_t set;
    (void)self;
    if (kind == NONE)
        return 0;
    if (kind == LFO)
        return lfo_dest(track) > 0;
    set = slots_of(track, kind);
    n = SET_COUNT(set);
    for (i = 0; i < n; i++)
        if (SET_DEST(set, i) > 0)
            return 1;
    return 0;
}

// A parameter with a slot (or the LFO's destination), whatever its amount:
// stock's lock edit makes a new lock (set 0) on the first turn and adds each
// turn to what get returns, so a link at 0 must read as one.
QMA_UI static int locker_has(void *self, int track, int param)
{
    int kind = shown_on(track);
    (void)self;
    if (kind == NONE || param <= 0)
        return 0;
    if (kind == LFO)
        return lfo_dest(track) == param;
    return slot_of(slots_of(track, kind), param) >= 0;
}

QMA_UI static int locker_get(void *self, int track, int param)
{
    int kind = shown_on(track), slot;
    word_t set;
    (void)self;
    if (kind == NONE || param <= 0)
        return 0;
    if (kind == LFO)
        return lfo_dest(track) == param ? lfo_shown(track) : 0;
    set = slots_of(track, kind);
    slot = slot_of(set, param);
    return slot < 0 ? 0 : SET_AMOUNT(set, slot);
}

// Stock's lock edit turns a knob through here: value is what get returned plus
// the turn, or 0 to make the lock when has said no.
QMA_UI static void locker_set(void *self, int track, int param, int value)
{
    int kind = shown_on(track), logical, slot, from_encoder = encoder_turn;
    word_t set;
    (void)self;
    encoder_turn = 0;                   // one encoder event, one set at most, whatever happens
    if (kind == NONE || !IS_KEY_HELD(holds[kind].key))
        return;                         // a lost release: the tick takes the locker away
    holds[kind].turned = 1;
    if (ANY_TRIG_HELD()) {
        dep_drop();
        return;                         // a trig held too: no link by accident
    }
    logical = dest_id(kind, track, param);
    if (!logical) {
        dep_drop();
        not_a_destination(kind);
        return;
    }
    if (kind == LFO) {
        if (!from_encoder && lfo_dest(track) == param) {
            // Not a Rytm knob: the turn is the value's change from what get showed. The box
            // shows the depth at twice its stored units (lfo_shown).
            dest_knob = -1;
            dep_drop();
            dep_add(track, (value - lfo_shown(track)) / 2);
            return;
        }
        lfo_turn(track, param);
        return;
    }
    set = slots_of(track, kind);
    slot = slot_of(set, param);
    nudge(kind, track, logical, slot < 0 ? 0 : value - SET_AMOUNT(set, slot));
}

QMA_UI static void locker_clear(void *self, int track, int param)
{
    int kind = shown_on(track), slot;
    word_t set;
    (void)self;
    if (kind == NONE || param <= 0)
        return;
    if (kind == LFO) {
        if (lfo_dest(track) == param) {
            lfo_write(track, ID_LFO_DEP, DEP_CENTRE);
            redraw = 1;                 // the depth's box is ours to redraw
        }
        return;
    }
    set = slots_of(track, kind);
    slot = slot_of(set, param);
    if (slot >= 0)
        SET_WRITE_AMOUNT(set, slot, 0);
}

QMA_UI static void locker_clear_all(void *self)
{
    (void)self;                         // never: one gesture must not wipe a sound's links
}

QMA_UI static void locker_never(void *self)
{
    (void)self;                         // the object is static: never destroyed
}

// PerformanceParamLocker's slots, its last two kept: relative (returns 1), and
// lockable(id) (the id's category); neither reads the object. Stock calls the
// slots at +8 to +36 only.
static const void *const locker_vtable[] = {
    locker_never, locker_never, locker_has_any, locker_clear, locker_clear_all,
    locker_set, locker_get, locker_has,
    (const void *)LOCKER_RELATIVE_AT, (const void *)LOCKER_LOCKABLE_AT,
};
static struct { const void *const *vtable; } locker = { locker_vtable };

// ---- The target scene's locker, while SCENE is held ---------------------------
// Shaped as stock's SceneParamLocker {vtable, scenes, scene}, whose slot routines read
// only + 4 and + 8, so the module calls them on this object after pointing it at the
// kit's Scenes and the target scene. Not stock's own per-scene object: a scene pad in
// scene edit sets that same pointer, and the module must never take a pad's locker
// for its own.
static struct { const void *const *vtable; word_t scenes; int scene; } scene_locker;

// The scene the locks go to: the active one, or with none engaged the one engaged last
// (scene 1 until one is), so a disengaged scene can still be set up without hearing it.
QMA_UI static int target_scene(word_t kit)
{
    int scene;
    if (scene_edit_free()) {
        scene = *(int *)(top_object() + SCENE_EDIT_SCENE);
        if (scene >= 0 && scene < SCENES)
            return scene;               // scene edit: the scene it shows
    }
    scene = ACTIVE_SCENE(kit);
    if (scene >= 0 && scene < SCENES)
        last_scene = scene;
    return last_scene;
}

// Points scene_locker at the target scene.
QMA_UI static void scene_refresh(void)
{
    word_t kit = PROJECT_KIT(PROJECT());
    scene_locker.scenes = KIT_SCENES(kit);
    scene_locker.scene = target_scene(kit);
}

QMA_UI static int scene_has_any(void *self)
{
    (void)self;
    scene_refresh();
    return ((unsigned char (*)(void *))SCENE_HAS_ANY_AT)(&scene_locker) != 0;
}

QMA_UI static int scene_get(void *self, int track, int param)
{
    (void)self;
    scene_refresh();
    return ((int (*)(void *, int, int))SCENE_GET_AT)(&scene_locker, track, param);
}

QMA_UI static void scene_clear(void *self, int track, int param)
{
    (void)self;
    if (!IS_KEY_HELD(KEY_SCENE))
        return;
    scene_refresh();
    ((void (*)(void *, int, int))SCENE_CLEAR_AT)(&scene_locker, track, param);
}

// Stock's lock edit turns a knob through here, with the value it worked out from the
// lock's (or the parameter's) and the turn.
QMA_UI static int scene_set(void *self, int track, int param, int value)
{
    int written;
    (void)self;
    if (!IS_KEY_HELD(KEY_SCENE))
        return -1;                      // a lost release: the tick takes the locker away
    if (ANY_TRIG_HELD())
        return -1;                      // a trig's turn is its p-lock: the tick hands the knobs back
    scene_refresh();
    written = ((int (*)(void *, int, int, int))SCENE_SET_AT)(&scene_locker, track, param, value);
    if (written == -1 && track >= 0 && track <= FX_TRACK)
        show("SCENE LOCKS FULL");       // all 48 in use: stock's scene edit says nothing
    return written;
}

// Stock's slots for has (through this vtable's get), relative (0) and lockable;
// clear all is never ours: stock's wipes every scene's locks.
static const void *const scene_vtable[] = {
    locker_never, locker_never, scene_has_any, scene_clear, locker_clear_all,
    scene_set, scene_get,
    (const void *)SCENE_HAS_AT, (const void *)SCENE_RELATIVE_AT, (const void *)SCENE_LOCKABLE_AT,
};

QMA_UI static int is_ours(word_t current)
{
    return current && (current == (word_t)&locker || current == (word_t)&scene_locker);
}

QMA_UI static int ours(void)
{
    return is_ours(GET_LOCKER(PARAM_UI()));
}

// Sets our locker for kind if the UI's is free (or already ours), on a track
// the kind works on. A performance or scene pad, or a trig, that holds it
// keeps it.
QMA_UI static void locker_install(int kind)
{
    word_t ui = PARAM_UI(), current = GET_LOCKER(ui);
    void *mine = kind == SCN ? (void *)&scene_locker : (void *)&locker;
    if (!kind_track(kind, selected_track()) || (current && current != (word_t)mine))
        return;
    if (kind == SCN)
        scene_locker.vtable = scene_vtable;
    shown = kind;
    SET_LOCKER(ui, mine);
    LOCK_EDIT(ui, 1);
    redraw = 1;
}

QMA_UI static void locker_remove(void)
{
    word_t ui = PARAM_UI();
    if (is_ours(GET_LOCKER(ui)))
        END_LOCK_EDIT(ui);
    shown = NONE;
    redraw = 1;
}

// ---- A turn that reaches stock's parameter edit --------------------------------

// core_params' delta: 1 takes the turn (no stock edit, no lock), 0 passes. With
// our locker set, stock's lock edit takes the turns before this; this covers a
// hold whose locker the tick has not set yet.
QMA_UI static int qma_delta(void *view, int32_t id, int32_t delta, int32_t func)
{
    int kind = held_kind(), track, index, logical;
    (void)view;
    if (kind == NONE || kind == SCN)
        return 0;                       // SCENE: stock's lock edit takes its turns, or stock's edit
    holds[kind].turned = 1;             // any turn makes the hold a hold, not a tap
    if (func || !delta || id < 0 || id >= PARAM_ROWS || ANY_TRIG_HELD()
        || row_word(id, ROW_CATEGORY) == CATEGORY_TRIG)
        return 0;
    if (views && pad_screen(top_view()) && ANY_PAD_HELD())
        return 0;                       // a pad held in PERF or SCNE edits its own locks
    track = selected_track();
    if (!kind_track(kind, track))
        return 0;
    index = row_word(id, ROW_INDEX);
    logical = dest_id(kind, track, index);
    if (!logical) {
        dep_drop();
        not_a_destination(kind);
        return 1;
    }
    if (kind == LFO)
        lfo_turn(track, index);
    else
        nudge(kind, track, logical, delta);
    return 1;
}

const struct {
    int32_t first, last;
    void *get;
    int (*delta)(void *view, int32_t id, int32_t delta, int32_t func);
    void *text;
} quick_velocity_aftertouch_assign_params = { 0, PARAM_ROWS - 1, 0, qma_delta, 0 };

// ---- Keys, encoders, the tick and the draw -------------------------------------

// A plain LFO tap: the press held back and then this release, played now
// through the whole key chain, so the mods after this one (Loop Sync's page
// tracking, the base's send pages) and stock see them as they would have. This
// mod lets both pass, and the real release then stops here. The mods before
// this one saw the real press and release already and see the pair again, so
// every mod ends with the key up.
QMA_UI static void replay_key(void *brain, int key, unsigned flags)
{
    long event[KEY_EVENT_BYTES / 4 + 2];
    EVENT_CTOR(event, key, flags, 0, 127);
    core_key(brain, event);
    EVENT_DTOR(event);
}

QMA_UI static void replay_lfo(void *brain, unsigned release_flags)
{
    replaying = 1;
    replay_key(brain, KEY_LFO, lfo_flags);
    replay_key(brain, KEY_LFO, release_flags);
    replaying = 0;
}

// A SCENE press with nothing else that SCENE means on stock: no FUNC (the PATTERN
// menu), no YES or NO (quick save, reload), no trig or pad, the UI's locker free, on a
// screen of scene_screen's. It passes on (stock does nothing on it).
QMA_UI static int scene_press(unsigned flags)
{
    if (IS_KEY_HELD(KEY_FUNC) || IS_KEY_HELD(KEY_YES) || IS_KEY_HELD(KEY_NO) || !scene_screen()
        || ANY_TRIG_HELD() || ANY_PAD_HELD() || GET_LOCKER(PARAM_UI()))
        return 0;
    scn_flags = flags;
    scn_ours = 1;
    holds[SCN].held = 1;
    holds[SCN].turned = 0;
    holds[SCN].since = ticks;
    return 0;
}

// The first knob or pad event of a SCENE hold ends the hold as stock does when its hold
// opens a screen: its release is dropped, so neither scene edit nor the toggle happens.
QMA_UI static void scene_touched(void)
{
    if (!scn_locking) {
        scn_locking = 1;
        CONSUME_KEY(KEY_SCENE);
    }
}

// A knob turned (with clicks) or pressed during a SCENE hold, before stock sees it.
// The first ends SCENE's hold (no scene edit, no toggle) and sets the scene locker, so
// stock's lock edit takes this same event: it always passes on (0).
QMA_UI static int scene_knob(void)
{
    word_t now;
    if (!scene_screen() || ANY_TRIG_HELD()) {
        if (shown == SCN)
            locker_remove();            // a trig held now makes its p-lock, as on stock
        return 0;                       // scene edit came up, or a trig edits its own locks
    }
    now = GET_LOCKER(PARAM_UI());
    if (now && now != (word_t)&scene_locker)
        return 0;                       // a pad, a trig or QPER holds stock's lock edit
    holds[SCN].turned = 1;
    scene_touched();
    if (!now)
        locker_install(SCN);
    return 0;
}

// A pad pressed during a SCENE hold, before stock sees it. It ends SCENE's hold as a knob
// does (no scene edit, no toggle on the release), so a hold can pick tracks and lock them.
// On the pages and in PERF, MUTE and CHRO the pad stays stock's (on the pages it plays
// and, with AUTO TRK SWITCH on, selects its track). In scene mode stock's SceneSelectView
// would engage the pad's scene; the module takes the press, its repeats and its release there and
// selects the pad's track as the pages' pad does with AUTO TRK SWITCH on, so the scene
// being set up stays where it is: 0 passes the press on, 1 takes it.
// REC, STOP or PLAY pressed during a SCENE hold (once the boxes show or a knob or pad
// made it a hold, so SCENE rolled into PLAY still starts the sequencer): copy, paste or clear the scene the
// locks go to, with stock's own routines and words, as scene edit's FUNC + REC, STOP and
// PLAY do (a second STOP or PLAY undoes, as there). It ends the hold as a knob does. The
// key's release is the module's too (transport_taken), so the transport does nothing.
static unsigned transport_taken;
QMA_UI static int scene_transport(int key)
{
    typedef unsigned char (*op2_t)(word_t, int);
    typedef unsigned char (*op3_t)(word_t, int, int);
    word_t scenes;
    int scene;
    static char text[16] = "COPY SCENE ";
    if (!scene_screen() || ANY_TRIG_HELD() || ANY_PAD_HELD())
        return 0;
    if (!scn_locking && ticks - holds[SCN].since < SHOW_TICKS)
        return 0;                       // SCENE rolled into PLAY: the transport's, as on stock
    scene_touched();
    transport_taken |= 1u << (key - KEY_REC);
    scene_refresh();
    scenes = scene_locker.scenes;
    scene = scene_locker.scene;
    if (key == KEY_REC) {
        if (((op2_t)SCENE_COPY_AT)(scenes, scene)) {
            text[11] = scene >= 9 ? '1' : '0' + scene + 1;
            text[12] = scene >= 9 ? '0' + scene - 9 : 0;
            text[13] = 0;
            show(text);
        }
    } else if (key == KEY_STOP) {
        if (((op3_t)SCENE_UNDO_AT)(scenes, scene, 2))
            show("UNDO PASTE");
        else if (((op3_t)SCENE_PASTE_AT)(scenes, scene, 1))
            show("PASTE SCENE");
    } else if (((op3_t)SCENE_UNDO_AT)(scenes, scene, 1))
        show("UNDO CLEAR");
    else if (((op3_t)SCENE_CLEAR_ALL_AT)(scenes, scene, 1))
        show("CLEAR SCENE");
    redraw = 1;
    return 1;
}

QMA_UI static int scene_pad(int pad)
{
    word_t project;
    int selected;
    word_t now;
    if (!scene_screen() || ANY_TRIG_HELD())
        return 0;                       // scene edit came up, or a trig edits its own locks
    now = GET_LOCKER(PARAM_UI());
    if (now && now != (word_t)&scene_locker)
        return 0;                       // QPER or a lock edit of stock's holds the knobs
    scene_touched();
    if (top_view() != SCENE_VTABLE)
        return 0;
    pads_taken |= 1u << pad;
    project = PROJECT();
    selected = selected_track();
    if (pad != selected
        && ((unsigned char (*)(word_t))AUTO_TRK_SWITCH_AT)(((word1_t)PROJECT_GLOBALS_AT)(project))) {
        ((void (*)(int, int))SELECT_TRACK_AT)(pad, selected == FX_TRACK);
        redraw = 1;                     // the boxes follow the new track at once
    }
    return 1;
}

// SCENE's release, when its press was ours. After a knob event it is dropped by stock
// and never comes. A tap passes: stock toggles scene mode. After a swallowed repeat the
// release is the module's, and one repeat then the release (without its clean flag, so
// MainView does not toggle scene mode as well) go round the key chain: stock opens
// scene edit as its own hold would have, and the mods after this one see the key go up.
QMA_UI static int scene_release(void *brain, unsigned flags)
{
    scn_ours = 0;
    holds[SCN].held = 0;
    if (shown == SCN)
        locker_remove();
    if (scn_locking)
        return 1;
    if (!scn_repeated)
        return 0;
    replaying = 1;
    replay_key(brain, KEY_SCENE, scn_flags | REPEAT);
    replay_key(brain, KEY_SCENE, flags & ~CLEAN);
    replaying = 0;
    return 1;
}

QMA_UI int quick_velocity_aftertouch_assign_key(void *brain, void *event)
{
    encoder_turn = 0;
    int key = *(int *)((char *)event + EV_KEY);
    unsigned flags = *(unsigned *)((char *)event + EV_FLAGS);
    int down = flags & PRESSED, k;
    struct hold *h;
    word_t locker_now;
    if (replaying)
        return 0;                       // our own replayed LFO tap: the rest of the chain's
    if (key >= KEY_PAD_FIRST && key <= KEY_PAD_LAST && !(flags & REPEAT)) {
        if (down)
            pads_down |= 1u << (key - KEY_PAD_FIRST);
        else
            pads_down &= ~(1u << (key - KEY_PAD_FIRST));
    }
    views = *(void **)((char *)brain + BRAIN_VIEWS);
    if (shown == SCN && !IS_KEY_HELD(KEY_SCENE))
        locker_remove();                // SCENE's release was dropped: do not wait for the tick
    if (key == KEY_FIX)
        k = VEL;
    else if (key == KEY_SAMPLER)
        k = AT;
    else if (key == KEY_LFO)
        k = LFO;
    else if (key == KEY_SCENE)
        k = SCN;
    else {
        if (key >= KEY_REC && key <= KEY_STOP) {
            unsigned bit = 1u << (key - KEY_REC);
            if (down && !(flags & REPEAT))
                transport_taken &= ~bit;
            else if (transport_taken & bit) {
                if (!down)
                    transport_taken &= ~bit;
                return 1;               // its repeats and release are the module's too
            }
            if (down && !(flags & REPEAT) && held_kind() == SCN)
                return scene_transport(key);
        }
        if (key >= KEY_PAD_FIRST && key <= KEY_PAD_LAST) {
            unsigned bit = 1u << (key - KEY_PAD_FIRST);
            if (down && !(flags & REPEAT))
                pads_taken &= ~bit;     // a fresh press: a lost release leaves nothing taken
            else if (pads_taken & bit) {
                if (!down)
                    pads_taken &= ~bit;
                return 1;               // a pad taken in scene mode: its repeats and release too
            }
            if (down && !(flags & REPEAT) && held_kind() == SCN)
                return scene_pad(key - KEY_PAD_FIRST);
        }
        if (down && !(flags & REPEAT) && key >= KEY_PUSH_FIRST && key <= KEY_PUSH_LAST
            && held_kind() == SCN)
            return scene_knob();
        if (holds[LFO].held && (flags & PRESSED))
            dest_knob = -1;             // a page key may have moved the knobs
        if (holds[LFO].held && (flags & PRESSED))
            dep_drop();                 // a trig or pad's turns are not the LFO's
        return 0;
    }
    h = &holds[k];
    if (!down) {
        int turned = h->turned || ticks - h->since >= LOOK_TICKS;   // a look counts as a turn
        if (h->ignored) {
            h->ignored = 0;
            return 1;
        }
        if (k == SCN)                   // the tick may have seen SCENE go up first
            return scn_ours ? scene_release(brain, flags) : 0;
        if (k == LFO && lfo_swallowed) {
            lfo_swallowed = 0;          // the press was ours even if the tick saw the key go up first
            h->held = 1;
        }
        if (!h->held)
            return 0;
        h->held = 0;
        if (shown == k)
            locker_remove();
        if (k == VEL) {
            if (!turned) {              // a plain tap: stock's toggle, on the release
                word_t seq = PROJECT_SEQ(PROJECT());
                FIXED_VEL_SET(seq, !FIXED_VEL_GET(seq));
            }
            return 1;                   // the press was ours, so is the release
        }
        if (k == LFO) {
            if (turned)
                return 1;               // the page stays
            replay_lfo(brain, flags);   // a plain tap: stock's page, then its release
            return 1;
        }
        return turned;                  // SAMPLER: a tap's release opens stock's recorder
    }
    if (flags & REPEAT) {
        if (k == SCN) {
            if (scn_ours && !scn_locking)
                scn_repeated = 1;       // a hold: scene edit opens on the release
            return h->ignored || scn_ours;
        }
        return h->ignored || (k != AT && h->held);   // SAMPLER's own repeats are stock's
    }
    // A fresh press starts a new hold, even if a lost release left one set.
    if (h->held && shown == k)
        locker_remove();
    h->held = 0;
    h->ignored = 0;
    if (k == LFO)
        lfo_swallowed = 0;
    if (k == SCN)
        scn_ours = scn_repeated = scn_locking = 0;
    if (held_kind() != NONE) {
        h->ignored = 1;                 // during another key's hold: nothing
        return 1;
    }
    if (k == SCN)
        return scene_press(flags);
    if (IS_KEY_HELD(KEY_FUNC) || !on_pages() || !kind_track(k, selected_track())
        || (k == LFO && lfo_page_shown()))
        return 0;                       // FUNC (+ FIX: FIXED VELOCITY), another screen, or the FX track for FIX and SAMPLER
    if (k == LFO) {
        // The page key stays stock while a pad, a trig or QPER holds the locker.
        locker_now = GET_LOCKER(PARAM_UI());
        if ((locker_now && locker_now != (word_t)&locker) || ANY_TRIG_HELD())
            return 0;
        lfo_flags = flags;
        dep_drop();
        dest_knob = -1;
        lfo_swallowed = 1;
    }
    h->held = 1;
    h->turned = 0;
    h->since = ticks;
    locker_install(k);
    return k != AT;                     // FIX's and LFO's presses are held back; SAMPLER's does nothing on stock
}

// ev_enc: any encoder turned during a hold (LEVEL, or a knob stock takes before
// the parameter's turn, such as LFO DST) also makes it a hold, not a tap.
// During an LFO hold it also runs the turn through DEP's accumulator.
QMA_UI int quick_velocity_aftertouch_assign_enc(void *brain, void *event)
{
    int k;
    (void)brain;
    if (held_kind() == SCN) {
        int knob = *(int *)((char *)event + ENC_KNOB);
        if (knob >= 0 && knob < KNOBS && *(int *)((char *)event + ENC_CLICKS))
            return scene_knob();
        return 0;                       // LEVEL, or no clicks: stock's
    }
    if (holds[LFO].held) {
        int knob = *(int *)((char *)event + ENC_KNOB);
        encoder_turn = knob >= 0 && knob < KNOBS;   // LEVEL never reaches a locker set
        dep_turn(event);
    }
    for (k = VEL; k < KINDS; k++)
        if (holds[k].held)
            holds[k].turned = 1;
    return 0;
}

// ev_tick: keeps our locker with the hold. A lost release takes it away, and
// so does a track the kind does not work on selected during the hold (the FX
// track for velocity and aftertouch), whose knobs then edit as on stock; a
// locker stock set over ours (a pad or a trig) and then cleared gives it back.
QMA_UI static void keep_locker(void)
{
    int kind = held_kind();
    if (shown != NONE && (shown != kind || !kind_track(shown, selected_track())
        || (shown == SCN && (!scene_screen() || ANY_TRIG_HELD()))))
        locker_remove();
    if (kind != NONE && !ours() && !GET_LOCKER(PARAM_UI())
        && (kind == SCN ? (scn_locking || ticks - holds[SCN].since >= SHOW_TICKS)
                          && scene_screen() && !ANY_TRIG_HELD()
            : on_pages()))
        locker_install(kind);
}

// ---- The LFO depth's box at DEP's own resolution --------------------------------
// Stock draws the destination knob's box with a whole number, as for any lock on
// that knob, while the LFO page shows DEP as +1.96 (0x400fbbe8: sign, hundredths
// of the 8.8 value, cut, not rounded). ev_draw finds that box and writes the
// depth into it as the LFO page does. Stock draws two kinds (OS 1.74, seen in
// rytm-emu): on a knob shown by its label, a box 27 x 7 at the label (x 3 + 32
// per column, top-down rows 25..31 or 47..53); on a knob shown as a widget (OVR,
// DEL, REV, PAN, VOL), a block 19 x 15 over the widget (x 7 + 32 per column, rows
// 10..24 or 32..46). The new box keeps the found one's rows and fills the knob's
// column, 32 wide whatever the digits, as the LFO page's own +127.99 takes 30
// columns of it; a depth of 0 reads (0), as the LFO page writes it. A popup over
// the box hides it from the search.
typedef void (*text_draw_t)(void *bmp, void *font, int x, int y, int centred, int a5,
                            const char *width, const char *fmt, ...);
#define TEXT_DRAW ((text_draw_t)TEXT_DRAW_AT)
#define TEXT_FONT ((word1_t)TEXT_FONT_AT)

struct box_kind { int x, w, h, text; int top[2]; };   // top: top-down rows; text: rows from the top to the text's bottom
static const struct box_kind box_kinds[2] = {
    { 3, 27, 7, 5, { 25, 47 } },        // a label's box
    { 7, 19, 15, 9, { 10, 32 } },       // a widget's block
};

static unsigned *bm_words;
static int bm_w, bm_h, bm_stride;

// Rows count from the top here; the bitmap keeps row 63 - y.
QMA_UI static unsigned *bm_word(int x, int y, unsigned *bit)
{
    int r = 63 - y;
    *bit = 0x80000000u >> (r & 31);
    return bm_words + x * bm_stride + (r >> 5);
}

QMA_UI static int bm_get(int x, int y)
{
    unsigned bit;
    if (x < 0 || x >= bm_w || y < 0 || y > 63)
        return 0;
    return (*bm_word(x, y, &bit) & bit) != 0;
}

QMA_UI static void bm_put(int x, int y, int on)
{
    unsigned bit, *w;
    if (x < 0 || x >= bm_w || y < 0 || y > 63)
        return;
    w = bm_word(x, y, &bit);
    *w = on ? *w | bit : *w & ~bit;
}

// Stock's lock box of kind at knob k: a white outline with black text inside,
// so a plain white area is no box.
QMA_UI static int box_at(const struct box_kind *b, int k)
{
    int x0 = b->x + 32 * (k & 3), y0 = b->top[k >> 2], i, j;
    for (i = 0; i < b->w; i++)
        if (!bm_get(x0 + i, y0) || !bm_get(x0 + i, y0 + b->h - 1))
            return 0;
    for (j = 1; j < b->h - 1; j++)
        if (!bm_get(x0, y0 + j) || !bm_get(x0 + b->w - 1, y0 + j))
            return 0;
    for (i = 1; i < b->w - 1; i++)
        for (j = 1; j < b->h - 1; j++)
            if (!bm_get(x0 + i, y0 + j))
                return 1;
    return 0;
}

// The kind of box knob k shows, or 0.
QMA_UI static const struct box_kind *box_on(int k)
{
    return box_at(&box_kinds[0], k) ? &box_kinds[0] : box_at(&box_kinds[1], k) ? &box_kinds[1] : 0;
}

QMA_UI void quick_velocity_aftertouch_assign_draw(void *bmp, void *ctrl)
{
    char text[8], width[8], *p = text;
    const struct box_kind *b = 0;
    int track, v, h, k, n, w, x0, y0, x, y, i;
    (void)ctrl;
    // Only our own locker's box: with LFO held, a pad, a trig or QPER can hold
    // stock's locker, whose boxes are its locks, not the depth.
    if (shown != LFO || !ours() || !on_pages())
        return;
    track = selected_track();
    if (!kind_track(LFO, track) || lfo_dest(track) <= 0)
        return;
    v = lfo_shown(track);
    bm_w = *(int *)((char *)bmp + 4);
    bm_h = *(int *)((char *)bmp + 8);
    bm_stride = *(int *)((char *)bmp + 12);
    bm_words = *(unsigned **)((char *)bmp + 16);
    if (bm_w < 128 || bm_h < 64)
        return;
    // The destination's knob when a turn has shown it; otherwise the one box on
    // the page (none, or more than one, and nothing is drawn).
    if (dest_knob >= 0 && dest_knob < KNOBS) {
        k = dest_knob;
        b = box_on(k);
    } else {
        for (i = 0, k = -1; i < KNOBS; i++)
            if (box_on(i)) {
                if (k >= 0)
                    return;
                k = i;
            }
        if (k >= 0)
            b = box_on(k);
    }
    if (!b)
        return;
    if (!v) {                           // the LFO page's 0 (0x402589c3)
        *p++ = '('; *p++ = '0'; *p++ = ')';
    } else {
        *p++ = v < 0 ? '-' : '+';
        h = (v < 0 ? -v : v) * 100 / 256;
        n = h / 100;
        if (n >= 100) *p++ = (char)('0' + n / 100);
        if (n >= 10) *p++ = (char)('0' + n / 10 % 10);
        *p++ = (char)('0' + n % 10);
        *p++ = '.';
        *p++ = (char)('0' + h / 10 % 10);
        *p++ = (char)('0' + h % 10);
    }
    *p = 0;
    // The template centres on digits of one width, so the text does not move as
    // they change.
    for (i = 0; text[i]; i++)
        width[i] = text[i] >= '0' && text[i] <= '9' ? '0' : text[i];
    width[i] = 0;
    w = 32;                             // one width, the knob's column, whatever the digits
    x0 = 32 * (k & 3);
    y0 = b->top[k >> 2];
    // The column cleared (it covers the old box), the text drawn white, then the
    // new box turned over: white with black text.
    for (x = x0; x < x0 + w; x++)
        for (y = y0; y < y0 + b->h; y++)
            bm_put(x, y, 0);
    TEXT_DRAW(bmp, (void *)TEXT_FONT(TEXT_CTX_AT), x0 + w / 2, 63 - (y0 + b->text), 1, 0, width, "%s", text);
    for (x = x0; x < x0 + w; x++)
        for (y = y0; y < y0 + b->h; y++)
            bm_put(x, y, !bm_get(x, y));
}

// Stock's popup for the module's messages, opened from ev_tick so repeats open
// one, not dozens.
QMA_UI void quick_velocity_aftertouch_assign_tick(void *ctrl)
{
    ticks++;
    encoder_turn = 0;
    word_t string;
    char allocator;
    struct { void *object; void *counts; } shared;
    void *popup;
    keep_locker();
    if (pads_down) {                    // a release that never reached ev_key: stock's table may say held
        int pad;                        // when none is, but never says up while one is
        for (pad = 0; pad <= KEY_PAD_LAST - KEY_PAD_FIRST; pad++)
            if ((pads_down & 1u << pad) && !IS_KEY_HELD(KEY_PAD_FIRST + pad))
                pads_down &= ~(1u << pad);
    }
    if (views)                          // a key has gone through, so the project is up
        target_scene(PROJECT_KIT(PROJECT()));   // follows the engaged scene, by panel or MIDI
    if (redraw) {
        redraw = 0;
        ((char *)ctrl)[CTRL_REDRAW] = 1;
    }
    if (wait)
        wait--;
    if (!pending || !views || wait)
        return;
    pending = 0;
    wait = POPUP_TICKS;
    STRING_FROM_CSTR(&string, message, &allocator);
    popup = (void *)MEM_NEW(POPUP_BYTES);
    POPUP_CTOR(popup, &string);
    SHARED_PTR_CTOR(&shared, popup);
    SHOW_POPUP(views, &shared, 0);
    SHARED_PTR_RELEASE(&shared.counts);
    STRING_DTOR(&string);
}
