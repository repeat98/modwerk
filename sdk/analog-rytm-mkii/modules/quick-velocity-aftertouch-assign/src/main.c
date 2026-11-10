// SPDX-License-Identifier: GPL-3.0-or-later
// Quick Velocity+Aftertouch Assign for the Analog Rytm MKII: link a
// parameter to velocity, aftertouch or the LFO by holding a key and turning
// its knob.
//
//   FIX + turn a knob       links that parameter to velocity; the turn sets the
//                           amount (-128..127), continuing from the slot's amount.
//   SAMPLER + turn a knob   the same for aftertouch.
//   LFO + turn a knob       makes that parameter the LFO's destination (DST),
//                           at depth 0 on the first turn; further turns set DEP
//                           (-128.00..+127.99) at DEP's own step.
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
// turn the page stays. During one key's hold the other two do nothing. FUNC + FIX
// (stock's FIXED VELOCITY), FUNC + LFO, FIX and SAMPLER on the FX track, and
// a performance or scene pad or a trig that holds stock's locker stay stock.
//
// Firmware routines are reached at fixed addresses given for each OS release
// by ar2-1.74.h. Stock returns pointers in d0, while m68k-linux GCC expects
// them in a0, so those routines are declared as returning a word.

#include <stdint.h>
#include "ar2-1.74.h"

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
typedef int (*dispatch_t)(void *brain, void *event);
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
#define DISPATCH ((dispatch_t)KEY_DISPATCH_AT)
#define ENC_DELTA ((enc_delta_t)ENC_DELTA_AT)
#define ENC_ACCUMULATE ((enc_accumulate_t)ENC_ACCUMULATE_AT)

#define KEY_FIX 0xb3
#define KEY_SAMPLER 0xb4
#define KEY_LFO 0x35
#define KEY_FUNC 0x80
#define KEY_PAD_FIRST 0x90          // BD .. CB
#define KEY_PAD_LAST 0x9b
#define TRIG_KEYS 16                // trig keys 0..15
#define EV_KEY 12                   // event + 12: the key
#define EV_FLAGS 16                 // event + 16: bit 0 down (clear on release), 8 repeat
#define PRESSED 1
#define REPEAT 8
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

enum { NONE = -1, VEL, AT, LFO, KINDS };

// One hold per key: FIX for velocity, SAMPLER for aftertouch, LFO for the LFO.
// A hold is ours only when its press came on a page of ours without FUNC.
struct hold {
    int key;
    int held;                       // the press was ours and the key is down
    int turned;                     // an encoder turned during the hold
    int ignored;                    // pressed during another key's hold: its release is ours
};
static struct hold holds[KINDS] = {
    { KEY_FIX, 0, 0, 0 }, { KEY_SAMPLER, 0, 0, 0 }, { KEY_LFO, 0, 0, 0 },
};

static void *views;
static char message[28];
static int pending;                 // a popup for ev_tick
static int wait;                    // ticks until the next popup may open
static int redraw;                  // ev_tick asks for a redraw
static int shown = NONE;            // the kind our locker shows, NONE when not set
static unsigned lfo_flags;          // the LFO press held back, for its replay
static int lfo_swallowed;           // that press was held back and its release not seen yet

// What is on screen: the top view's class, past the popups, which pass keys on.
static word_t top_view(void)
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

static int pad_screen(word_t top)
{
    return top == PERF_VTABLE || top == PERF_EDIT_VTABLE
        || top == SCENE_VTABLE || top == SCENE_EDIT_VTABLE;
}

static int on_pages(void)
{
    word_t top;
    if (!views)
        return 0;
    top = top_view();
    return top == PAGES_TOP_VTABLE || pad_screen(top)
        || top == MUTE_VTABLE || top == CHROMATIC_VTABLE;
}

static const char *row(int id)
{
    return (const char *)PARAM_TABLE + id * PARAM_ROW_BYTES;
}

static int row_word(int id, int offset)
{
    return *(const int *)(row(id) + offset);
}

static word_t vcall(word_t object, int slot)
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

static int any_held(int first, int last)
{
    int k;
    for (k = first; k <= last; k++)
        if (IS_KEY_HELD(k))
            return 1;
    return 0;
}

#define ANY_TRIG_HELD() any_held(0, TRIG_KEYS - 1)
#define ANY_PAD_HELD() any_held(KEY_PAD_FIRST, KEY_PAD_LAST)

static void show(const char *text)
{
    char *p = message;
    while (*text && p < message + sizeof message - 1)
        *p++ = *text++;
    *p = 0;
    pending = 1;
}

static int selected_track(void)
{
    return SELECTED_TRACK(PROJECT_SEQ(PROJECT()));
}

static int sound_track(int track)
{
    return track >= 0 && track < FX_TRACK;
}

// The tracks a kind works on: velocity and aftertouch on the sound tracks,
// the LFO on the FX track too.
static int kind_track(int kind, int track)
{
    return kind == LFO ? track >= 0 && track <= FX_TRACK : sound_track(track);
}

// The kind held now, NONE without one. A release that never reached ev_key
// must not leave knobs taken, so the key's own state is asked too.
static int held_kind(void)
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
static word_t slots_of(int track, int kind)
{
    word_t sound = KIT_TRACK(PROJECT_KIT(PROJECT()), track);
    return kind == VEL ? TRACK_VEL_CONF(sound) + VEL_SET : TRACK_AT_CONF(sound) + AT_SET;
}

// The slot whose destination is index, -1 for none.
static int slot_of(word_t set, int index)
{
    int n = SET_COUNT(set), i;
    for (i = 0; i < n; i++)
        if (SET_DEST(set, i) == index)
            return i;
    return -1;
}

// The slot that holds index, else the first free one (no destination, or an
// amount of 0), else -1.
static int find_slot(word_t set, int index)
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
static word_t param_set(int track)
{
    return KIT_PARAM_SET(PROJECT_KIT(PROJECT()), track);
}

// The logical id stock's destination list gives a parameter's index on this
// track, 0 when it is no destination or outside stock's id table. The LFO's
// own parameters are no LFO destination.
static int dest_id(int kind, int track, int index)
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

static void not_a_destination(int kind)
{
    show(kind == VEL ? "NOT A VELOCITY TARGET"
        : kind == AT ? "NOT AN AFTERTOUCH TARGET" : "NOT AN LFO TARGET");
}

// Changes the amount (8.8) of the destination logical on track by change, in
// the parameter's own resolution; 0 only makes sure it has a slot. A fine knob
// such as TUN turns in fractions, so a change is at least one step, and a fast
// turn as many as the parameter would move. A popup says why when it cannot.
static void nudge(int kind, int track, int logical, int change)
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

static int lfo_read(int track, int id)
{
    word_t set = param_set(track);
    return SET_READ_ID(set, id);
}

static void lfo_write(int track, int id, int value)
{
    SET_VALUE(param_set(track), id, value, -1, 0, 1);
}

// The parameter index the track's LFO modulates, 0 for none.
static int lfo_dest(int track)
{
    return lfo_read(track, ID_LFO_DST) >> 8;
}

// The depth as the locker shows it: 8.8, -128.00..+127.99.
static int lfo_shown(int track)
{
    return (lfo_read(track, ID_LFO_DEP) - DEP_CENTRE) * 2;
}

// DEP moves as the same turns of DEP's own knob would move it: ev_enc runs
// each encoder event of an LFO hold through the LFO page's own accumulator,
// at DEP's knob, with DEP's step and turn profile, as that page does when DEP
// is turned there (0x4003a028), so speed and acceleration are stock's, its
// 10 ms slow-down included. Only a hold begun on the LFO page itself shares
// that knob with stock, and there DEP is no destination. Once a turn has shown which knob is the
// destination's (dest_knob), ev_enc writes DEP at once; before that, the
// change waits in dep_pending for the locker's call. Any key pressed during
// the hold (a page key) forgets the knob.
static int dep_pending;
static int pending_knob = -1;           // the knob dep_pending counts, -1 none
static int dest_knob = -1;              // the knob of the LFO's destination, -1 unknown
static int last_knob = -1;              // the knob of the latest encoder event

// The LFO page's knob accumulator, 0 when the page holder is not found.
static void *lfo_accumulator(void)
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

static void dep_add(int track, int change)
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

static void dep_turn(void *event)
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

static void dep_drop(void)
{
    dep_pending = 0;
    pending_knob = -1;
}

// A turn of the knob of index on track: a new destination takes the LFO at
// depth 0; the destination's own knob moves DEP by what its turns have made.
static void lfo_turn(int track, int index)
{
    int change;
    if (lfo_dest(track) != index) {
        lfo_write(track, ID_LFO_DST, index << 8);
        lfo_write(track, ID_LFO_DEP, DEP_CENTRE);
        dep_drop();                     // the grabbing turn sets no depth
        dest_knob = last_knob;
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
static int shown_on(int track)
{
    return shown != NONE && kind_track(shown, track) ? shown : NONE;
}

static int locker_has_any(void *self)
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
static int locker_has(void *self, int track, int param)
{
    int kind = shown_on(track);
    (void)self;
    if (kind == NONE || param <= 0)
        return 0;
    if (kind == LFO)
        return lfo_dest(track) == param;
    return slot_of(slots_of(track, kind), param) >= 0;
}

static int locker_get(void *self, int track, int param)
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
static void locker_set(void *self, int track, int param, int value)
{
    int kind = shown_on(track), logical, slot;
    word_t set;
    (void)self;
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
        lfo_turn(track, param);
        return;
    }
    set = slots_of(track, kind);
    slot = slot_of(set, param);
    nudge(kind, track, logical, slot < 0 ? 0 : value - SET_AMOUNT(set, slot));
}

static void locker_clear(void *self, int track, int param)
{
    int kind = shown_on(track), slot;
    word_t set;
    (void)self;
    if (kind == NONE || param <= 0)
        return;
    if (kind == LFO) {
        if (lfo_dest(track) == param)
            lfo_write(track, ID_LFO_DEP, DEP_CENTRE);
        return;
    }
    set = slots_of(track, kind);
    slot = slot_of(set, param);
    if (slot >= 0)
        SET_WRITE_AMOUNT(set, slot, 0);
}

static void locker_clear_all(void *self)
{
    (void)self;                         // never: one gesture must not wipe a sound's links
}

static void locker_never(void *self)
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

static int ours(void)
{
    return GET_LOCKER(PARAM_UI()) == (word_t)&locker;
}

// Sets our locker for kind if the UI's is free (or already ours), on a track
// the kind works on. A performance or scene pad, or a trig, that holds it
// keeps it.
static void locker_install(int kind)
{
    word_t ui = PARAM_UI(), current = GET_LOCKER(ui);
    if (!kind_track(kind, selected_track()) || (current && current != (word_t)&locker))
        return;
    shown = kind;
    SET_LOCKER(ui, &locker);
    LOCK_EDIT(ui, 1);
    redraw = 1;
}

static void locker_remove(void)
{
    word_t ui = PARAM_UI();
    if (GET_LOCKER(ui) == (word_t)&locker)
        END_LOCK_EDIT(ui);
    shown = NONE;
    redraw = 1;
}

// ---- A turn that reaches stock's parameter edit --------------------------------

// core_params' delta: 1 takes the turn (no stock edit, no lock), 0 passes. With
// our locker set, stock's lock edit takes the turns before this; this covers a
// hold whose locker the tick has not set yet.
static int qma_delta(void *view, int32_t id, int32_t delta, int32_t func)
{
    int kind = held_kind(), track, index, logical;
    (void)view;
    if (kind == NONE)
        return 0;
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

// The LFO press held back, played to stock's key path now: past ev_key, so
// no mod sees it twice. Its release then reaches stock as the real one.
static void replay_lfo(void *brain)
{
    long event[KEY_EVENT_BYTES / 4 + 2];
    EVENT_CTOR(event, KEY_LFO, lfo_flags, 0, 127);
    DISPATCH(brain, event);
    EVENT_DTOR(event);
}

int quick_velocity_aftertouch_assign_key(void *brain, void *event)
{
    int key = *(int *)((char *)event + EV_KEY);
    unsigned flags = *(unsigned *)((char *)event + EV_FLAGS);
    int down = flags & PRESSED, k;
    struct hold *h;
    word_t locker_now;
    views = *(void **)((char *)brain + BRAIN_VIEWS);
    if (key == KEY_FIX)
        k = VEL;
    else if (key == KEY_SAMPLER)
        k = AT;
    else if (key == KEY_LFO)
        k = LFO;
    else {
        if (holds[LFO].held && (flags & PRESSED))
            dest_knob = -1;             // a page key may have moved the knobs
        if (holds[LFO].held && (flags & PRESSED))
            dep_drop();                 // a trig or pad's turns are not the LFO's
        return 0;
    }
    h = &holds[k];
    if (!down) {
        int turned = h->turned;
        if (h->ignored) {
            h->ignored = 0;
            return 1;
        }
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
            replay_lfo(brain);          // a plain tap: stock's page, then its release
            return 0;
        }
        return turned;                  // SAMPLER: a tap's release opens stock's recorder
    }
    if (flags & REPEAT)
        return h->ignored || (k != AT && h->held);   // SAMPLER's own repeats are stock's
    // A fresh press starts a new hold, even if a lost release left one set.
    if (h->held && shown == k)
        locker_remove();
    h->held = 0;
    h->ignored = 0;
    if (k == LFO)
        lfo_swallowed = 0;
    if (held_kind() != NONE) {
        h->ignored = 1;                 // during another key's hold: nothing
        return 1;
    }
    if (IS_KEY_HELD(KEY_FUNC) || !on_pages() || !kind_track(k, selected_track()))
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
    locker_install(k);
    return k != AT;                     // FIX's and LFO's presses are held back; SAMPLER's does nothing on stock
}

// ev_enc: any encoder turned during a hold (LEVEL, or a knob stock takes before
// the parameter's turn, such as LFO DST) also makes it a hold, not a tap.
// During an LFO hold it also runs the turn through DEP's accumulator.
int quick_velocity_aftertouch_assign_enc(void *brain, void *event)
{
    int k;
    (void)brain;
    if (holds[LFO].held)
        dep_turn(event);
    for (k = VEL; k < KINDS; k++)
        if (holds[k].held)
            holds[k].turned = 1;
    return 0;
}

// ev_tick: keeps our locker with the hold. A lost release takes it away, and
// so does a track the kind does not work on selected during the hold (the FX
// track for velocity and aftertouch), whose knobs then edit as on stock; a
// locker stock set over ours (a pad or a trig) and then cleared gives it back.
static void keep_locker(void)
{
    int kind = held_kind();
    if (shown != NONE && (shown != kind || !kind_track(shown, selected_track())))
        locker_remove();
    if (kind != NONE && !ours() && !GET_LOCKER(PARAM_UI()) && on_pages())
        locker_install(kind);
}

// Stock's popup for the module's messages, opened from ev_tick so repeats open
// one, not dozens.
void quick_velocity_aftertouch_assign_tick(void *ctrl)
{
    word_t string;
    char allocator;
    struct { void *object; void *counts; } shared;
    void *popup;
    keep_locker();
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
