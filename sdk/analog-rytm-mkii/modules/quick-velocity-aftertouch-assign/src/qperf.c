// SPDX-License-Identifier: GPL-3.0-or-later
// QPER and performance locks for the Analog Rytm MKII (QPER Live Rec before 0.5.0).
//
// Stock lets QPER link several performances, which add up. Here a press links
// one: with QPER held, a pad or trig moves the link to that performance, and the
// linked one unlinks it. A kit that brings several keeps them until that press.
// Since 0.6.0 the PERF hold (main.c) does the rest, on the linked performance (in
// performance edit, the one it shows), through qperf_locker and qperf_action:
//
//   turn a knob   Stock's own lock edit on the linked performance, drawn as when
//                 a performance pad is held. The kit has 48 lock slots for all
//                 performances.
//   PLAY          stock's clear, then its undo.
//   REC, STOP     stock's copy, then paste and its undo, on the linked performance.
//   YES           what the locks add at the QPER knob's position goes into the
//                 kit and those locks go, so the sound holds at any position.
//
// FUNC + QPER (stock's mute) is untouched.
//
// The quick perf rec: stock records no performance moves, and no lock can
// hold an amount. So while LIVE RECORDING plays, every performance someone
// moves (its pad, the QPER knob on the linked one, MIDI) is kept here, 8 points
// a step, and played back through the amounts while the pattern plays and
// nobody moves it. RECORD + YES applies it to the pattern as trigless locks, a
// step at a time, and empties it; RECORD + NO empties it, NO again brings it
// back. It lives in RAM only, so a pattern change drops it.
//
// The gestures work on the pages and the pad screens over them. A menu or dialog
// keeps its keys, though some let stock's QPER view open above them. There a pad
// still moves the link, so only a kit can bring several.
//
// Stock's amount is only written to performances linked when the knob moves, so
// the knob's position comes from one site of our own, where stock reads it, and
// a moved link hands the amount over.
//
// Firmware routines are reached at fixed addresses given for each OS release
// by ar2-1.74.h. Stock returns pointers in d0, while m68k-linux GCC
// expects them in a0, so those routines are declared as returning a word.

#include "qperf-1.74.h"

// The functions marked QPERF_UI run only from the UI task (keys, tick, project; the quick
// perf rec bake and clear), never from the audio block. cold puts them out of the hot code
// and builds them for size, about 1.9 KB less RAM; the rest of the module stays at -O2.
// No behaviour changes.
#define QPERF_UI __attribute__((cold))

typedef unsigned long word_t;
typedef word_t (*project_singleton_t)(void);
typedef word_t (*kit_param_set_t)(void *kit, int track);
typedef word_t (*kit_perf_t)(void *kit);
typedef int (*kit_word_t)(void *kit);
typedef int (*perf_set_t)(void *perf, int index, int track, int param, int value);
typedef int (*perf_op_t)(void *perf, int index, int flag);
typedef int (*perf_copy_t)(void *perf, int index);
typedef void (*kit_set_mask_t)(void *kit, int mask);
typedef void (*amount_set_t)(word_t project, int index, int amount, int a, int b);
typedef int (*fx_id_t)(int index);
typedef void (*perf_clear_t)(void *perf, int index);
typedef void (*perf_clear_one_t)(void *perf, int index, int track, int param);
typedef int (*id_for_index_t)(int index, int machine);
typedef int (*set_read_t)(void *set, int id);
typedef void (*set_value_t)(void *set, int id, int value, int track, int a, int b);
typedef void (*string_from_cstr_t)(void *string, const char *text, void *allocator);
typedef void (*string_dtor_t)(void *string);
typedef word_t (*mem_new_t)(unsigned size);
typedef void (*popup_ctor_t)(void *popup, void *string);
typedef void (*shared_ptr_ctor_t)(void *shared, void *object);
typedef void (*shared_ptr_release_t)(void *counts);
typedef void (*show_popup_t)(void *views, void *shared, int flag);
typedef word_t (*param_ui_t)(void);
typedef void (*set_locker_t)(void *ui, void *locker);
typedef word_t (*get_locker_t)(void *ui);
typedef void (*lock_edit_t)(void *ui, int on);
typedef void (*end_lock_edit_t)(void *ui);

#define PROJECT_SINGLETON ((project_singleton_t)PROJECT_SINGLETON_AT)
#define KIT_PARAM_SET ((kit_param_set_t)KIT_PARAM_SET_AT)
#define KIT_PERF ((kit_perf_t)KIT_PERF_AT)
#define KIT_QPER_MASK ((kit_word_t)KIT_QPER_MASK_AT)
#define PERF_SET ((perf_set_t)PERF_SET_AT)
#define PERF_CLEAR ((perf_clear_t)PERF_CLEAR_AT)
#define PERF_UNDO ((perf_op_t)PERF_UNDO_AT)
#define PERF_CLEAR_KEEP ((perf_op_t)PERF_CLEAR_KEEP_AT)
#define PERF_PASTE ((perf_op_t)PERF_PASTE_AT)
#define PERF_COPY ((perf_copy_t)PERF_COPY_AT)
#define KIT_SET_MASK ((kit_set_mask_t)KIT_SET_MASK_AT)
#define AMOUNT_SET ((amount_set_t)AMOUNT_SET_AT)
#define FX_ID ((fx_id_t)FX_ID_AT)
#define PERF_CLEAR_ONE ((perf_clear_one_t)PERF_CLEAR_ONE_AT)
#define ID_FOR_INDEX ((id_for_index_t)ID_FOR_INDEX_AT)
#define SET_VALUE ((set_value_t)SET_VALUE_AT)
#define STRING_FROM_CSTR ((string_from_cstr_t)STRING_FROM_CSTR_AT)
#define STRING_DTOR ((string_dtor_t)STRING_DTOR_AT)
#define MEM_NEW ((mem_new_t)MEM_NEW_AT)
#define POPUP_CTOR ((popup_ctor_t)POPUP_CTOR_AT)
#define SHARED_PTR_CTOR ((shared_ptr_ctor_t)SHARED_PTR_CTOR_AT)
#define SHARED_PTR_RELEASE ((shared_ptr_release_t)SHARED_PTR_RELEASE_AT)
#define SHOW_POPUP ((show_popup_t)SHOW_POPUP_AT)
#define PARAM_UI ((param_ui_t)PARAM_UI_AT)
#define SET_LOCKER ((set_locker_t)SET_LOCKER_AT)
#define GET_LOCKER ((get_locker_t)GET_LOCKER_AT)
#define LOCK_EDIT ((lock_edit_t)LOCK_EDIT_AT)
#define END_LOCK_EDIT ((end_lock_edit_t)END_LOCK_EDIT_AT)
// The performances' amounts: a lock adds value * amount / 0x8000.
#define PERF_AMOUNT(p) (((volatile unsigned short *)PERF_AMOUNTS_AT)[p])
#define AMOUNT_SCALE 15

#define PROJECT_KIT 352             // project + 352: the active kit
#define PERF_TABLE 16               // performance object + 16: the lock table
#define VT_READ 0x28                // parameter set: read(set, id)
#define SET_SOUND 0x18              // sound set: its live sound's source
#define VT_LIVE 0x28                // source: the live sound
#define SOUND_MACHINE 0x68          // live sound: machine byte

#define KEY_QPER 0xb1
#define KEY_YES 0x44
#define KEY_PLAY 0x51
#define KEY_REC 0x50
#define KEY_STOP 0x52
#define KEY_FUNC 0x80
#define KEY_NO 0x45
#define KEY_SCENE 0x13              // held: the scene lane keeps the scene still
#define EV_KEY 12                   // event + 12: the key
#define EV_FLAGS 16                 // event + 16: bit 0 down (clear on release), 8 repeat
#define PRESSED 1
#define REPEAT 8
#define UNDO_CLEAR 1                // what stock's undo reverses
#define UNDO_PASTE 2
#define BRAIN_VIEWS 32              // brain + 32: the view manager
#define MANAGER_LIST 20             // view manager + 20: its list of views
#define MANAGER_LAST 24             // view manager + 24: the top view's list node
#define NODE_PREV 4
#define NODE_VIEW 8
#define POPUP_BYTES 0xa0

#define PERFS 12
#define SEVERAL "MORE THAN ONE LINKED"
#define SLOTS 48
#define SLOT_BYTES 5
#define TRACK_NONE 12               // a slot's track byte above this is empty
#define FX_TRACK 12

typedef unsigned (*is_key_held_t)(int key);
typedef unsigned char (*event_test_t)(void *event);
typedef void (*view_close_t)(void *view);
#define IS_KEY_HELD ((is_key_held_t)IS_KEY_HELD_AT)
#define PRESSED_ONCE ((event_test_t)PRESSED_ONCE_AT)
#define VIEW_CLOSE ((view_close_t)VIEW_CLOSE_AT)

static int held;                    // QPER is down, on a screen of ours, without FUNC
static unsigned swallowed;          // YES, PLAY, REC and STOP: their release is ours too
static unsigned known;              // the link as we last set or saw it
static int kit_changed;             // stock changed the whole kit
int qperf_pot;                      // the QPER knob + 1, 0 until it first moves

// ---- The quick perf rec --------------------------------------------------

// The quick perf rec's longest loop. A choice, not a stock limit: 64 is the
// longest a track can be, so an applied quick perf rec always fits one track;
// it also bounds the RAM (12 x 64 x 8 points). A master length above 64 (up to
// 1024) loops it every 64 steps inside it. To revisit, raise this and the
// track lengthening in apply_perf_rec.
#define STEPS 64
#define POINTS 8                        // a step's points
#define REC_POINTS (STEPS * POINTS)
#define PULSE_UNITS 900000              // the music clock's units a pulse
#define TOUCH_BLOCKS 150                // 0.1 s of audio blocks: a move holds this long
#define LIVE_REC 361                    // record state + 361: LIVE RECORDING on
#define GRID_REC 360                    // record state + 360: GRID RECORDING on
#define PATTERN_BYTES 85760
#define PATTERN_LENGTH 0x14eb3          // s16, the pattern's steps
#define PATTERN_PER_TRACK 0x14eb9       // 1: each track has its own length and speed
#define PATTERN_SPEED 0x14eba
#define TRACK_BYTES 917
#define TRACK_LENGTH 709
#define TRACK_SPEED 711
#define PATTERN_LOCKS 44                // pattern track + 44: the pattern's locks
#define LOCKS_DATA 0x28                 // locks: their live matrix
#define MATRIX_TRACK 5674               // bytes a track, 88 a step, 2 a word
#define MATRIX_STEP 88
#define MATRIX_FINE 5632                // + word: the row has fine bits
#define WORDS 42
#define ROWS 71                         // stock stores 72 rows and uses 71
#define ID_MIN 8                        // id table row: range, in the words' units
#define ID_MAX 12
#define ID_ROW 52
#define TRACK_INDEX 64                  // pattern track + 64: its index
#define VT_NOTICE 16                    // a track's or the locks' change notice
#define STEP_FIELDS 9                   // the byte rows a step keeps, as stock's page copy
#define COND_ROW 576                    // a step's condition; the track's default at + 713
#define COND_DEFAULT 713
#define TRIG_ON 1                       // a step's flag: it has a trig
#define COND_NONE (-1)
#define COND_NEVER (-3)                 // ours: the copy never plays, so it has no trig
#define COND_FIRST 28                   // 1ST, !1ST: the track's first loop or not
#define COND_NOT_FIRST 29
#define COND_RATIO_LO 30                // N:M is 28 + M(M-1)/2 + N, 1:2 to 8:8
#define COND_RATIO_HI 64

#define U8(a) (*(volatile signed char *)(a))
#define U16(a) (*(volatile unsigned short *)(a))
#define U32(a) (*(volatile unsigned long *)(a))

typedef word_t (*pattern_of_t)(word_t project);
typedef word_t (*pattern_track_t)(word_t pattern, int track);
typedef int (*step_lock_set_t)(void *track, int step, int word, int value, int fine);
typedef int (*step_lock_get_t)(void *track, int step, int word, int unused);
typedef unsigned char (*step_test_t)(void *track, int step);   // stock sets the low byte only
typedef void (*step_make_t)(void *track, int step, int on);
typedef int (*id_word_t)(int id);
typedef void (*track_length_set_t)(void *track, int steps);
typedef void (*euclid_refresh_t)(void *track, int on);
typedef int (*track_test_t)(void *track);
typedef void (*step_clear_t)(void *track, int step);
typedef void (*memcpy_t)(void *to, const void *from, unsigned bytes);
typedef void (*step_cond_set_t)(void *track, int step, int condition);
typedef void (*step_flag_set_t)(void *track, int step, int mask, int on);
typedef int (*pad_track_t)(int index);
typedef void (*notice_t)(void *self, void *info);
#define TRACK_LENGTH_SET ((track_length_set_t)TRACK_LENGTH_SET_AT)
#define EUCLID_REFRESH ((euclid_refresh_t)EUCLID_REFRESH_AT)
#define EUCLID_MODE ((track_test_t)EUCLID_MODE_AT)
#define STEP_LOCKS_CLEAR ((step_clear_t)STEP_LOCKS_CLEAR_AT)
#define MEMCPY ((memcpy_t)MEMCPY_AT)
#define STEP_COND_SET ((step_cond_set_t)STEP_COND_SET_AT)
#define STEP_FLAG_SET ((step_flag_set_t)STEP_FLAG_SET_AT)
#define PAD_TRACK ((pad_track_t)PAD_TRACK_AT)
#define PATTERN_OF ((pattern_of_t)PATTERN_OF_AT)
#define PATTERN_TRACK ((pattern_track_t)PATTERN_TRACK_AT)
#define STEP_LOCK_SET ((step_lock_set_t)STEP_LOCK_SET_AT)
#define STEP_LOCK_GET ((step_lock_get_t)STEP_LOCK_GET_AT)
#define STEP_AUDIBLE ((step_test_t)STEP_AUDIBLE_AT)
#define STEP_LOCK_TRIG ((step_test_t)STEP_LOCK_TRIG_AT)
#define STEP_MAKE_LOCK_TRIG ((step_make_t)STEP_MAKE_LOCK_TRIG_AT)
#define ID_FINE ((id_word_t)ID_FINE_AT)

typedef unsigned long __attribute__((may_alias)) amount_pair_t;   // two bytes' worth, or four
static unsigned char perf_rec[PERFS][REC_POINTS] __attribute__((aligned(4))); // amount >> 7 at each point
static unsigned char perf_rec_has[PERFS][STEPS];  // a bit for each recorded point
static int perf_rec_loop;               // the loop's steps the take last played or recorded at
static int perf_rec_period;             // the take repeats every this many steps: the loop it was
                                        // last recorded at, or a shorter one it was cut to since
static int pass_steps, passes;          // the loop's comings round at one length, up to 2

// The scene lane (0.6.0): the scene engaged at each point, + 1 (0 for none), recorded in
// LIVE RECORDING from a scene change to the loop's end, played back by engaging the
// scene where it changes, and written by RECORD + YES as the scene's locks. UI side only.
static unsigned char scene_rec[REC_POINTS];
static unsigned char scene_rec_has[STEPS];
static int scene_used;                  // any point recorded
static int scene_armed;                 // recording from a change to the loop's end
static int scene_last_pos = -1;         // the position at the last tick, -1 stopped
static int scene_last_seen = -2;        // the active scene at the last tick
static int scene_engaged_by_us = -2;    // the scene the lane engaged, for the tick after
static int scene_engaged_ticks;         // ticks that guard lasts
static int scene_loop, scene_period;    // the lane's loop and its repeat period, as the
                                        // performance lanes' (it extends in the UI tick)
static volatile int scene_wipe;         // a wipe asks the UI to empty the lane: 1, or 2 for a
                                        // new pattern or project (no scene change to record yet)
static int scene_pass_steps, scene_passes;  // the lane's own pass count, as pass_steps and passes
QPERF_UI static void scene_lane_sync(void);

// What the audio block reads when nothing happens, together on four cache lines: stock's
// audio work evicts module data every block, and each cold line costs about 20 ticks.
static struct qperf_hot {
    unsigned short seen[PERFS];         // each amount as we last wrote or saw it
    int ready;                          // a project is loaded
    volatile int perf_rec_busy;         // the UI is reading or emptying it
    int perf_rec_pattern;               // the pattern it was recorded in
    unsigned perf_rec_used;             // performances with any point
    int perf_rec_hidden;                // emptied by RECORD + NO, NO again brings it back
    int last_pos;                       // the position last block
    int stirring;                       // after the last whole block: a knob, pad, take, drive,
                                        // touch or recording point was still in play
    int pot_still;                      // where the knob rests (pot_last once pot_rest is set),
                                        // 0 while it has no rest: then only 0 changes nothing
} hot __attribute__((aligned(16))) = { .perf_rec_pattern = -1, .last_pos = -1, .stirring = 1 };
static unsigned short rest[PERFS];      // each driven amount before we drove it
static unsigned short touched[PERFS];   // audio blocks left of the last move
static unsigned driven;                 // performances the quick perf rec plays now
static int rec_pos[PERFS];              // each one's last recorded point, -1 none
static unsigned pads_held;              // performances a pad or MIDI holds above zero
static int pot_rest;                    // the QPER knob where it last came to rest
static int pot_last, pot_before;        // its last two values, a wobble's pair
static unsigned short knob_touched;     // audio blocks left of the knob's turn
static int knob_armed;                  // points left of the knob's take, to the loop's end, 0 none
static int knob_armed_pos;              // where the take had got to last block
static int knob_was;                    // the knob was turning last block
#define KNOB_BLOCKS 75                  // 0.05 s of audio blocks: a knob turn holds this long
#define POT_DEAD 2                      // steps a turn must pass to start: a resting pot wobbles

// Stock's message for one pot: this replaces the 6-byte lea at its start.
#define TEXT(x) #x
#define ADDRESS(x) TEXT(x)
__asm__(
    ".globl qperf_pot_gate\n"
    "qperf_pot_gate:\n"
    "    move.l %a2@(8),%d0\n"
    "    addq.l #1,%d0\n"
    "    move.l %d0,qperf_pot\n"
    "    lea " ADDRESS(PROJECT_SINGLETON_AT) ",%a4\n"
    "    rts\n");

// Stock runs this routine after every change of the whole kit: load, reload,
// SysEx and its restores. This replaces its first two instructions.
__asm__(
    ".globl qperf_kit_gate\n"
    "qperf_kit_gate:\n"
    "    jsr qperf_kit_changed\n"
    "    lea %sp@(-16),%sp\n"
    "    move.l %a2,%sp@-\n"
    "    jmp " ADDRESS(KIT_CHANGED_RESUME_AT) "\n");

// Replaces the 6-byte press test of a pad or trig in stock's QPER view, reached
// wherever stock would link. d2 is its performance. The 0 skips stock's link.
__asm__(
    ".globl qperf_pad_gate\n"
    "qperf_pad_gate:\n"
    "    move.l %d2,%sp@-\n"
    "    move.l %sp@(8),%sp@-\n"
    "    jsr qperf_pad\n"
    "    addq.l #8,%sp\n"
    "    moveq #0,%d0\n"
    "    rts\n");

// Stock's popup, opened from ev_tick so repeats open one, not dozens.
static void *views;
static const char *show_text;
static char message[24];

static void show(const char *text)
{
    show_text = text;
}

// What is on screen: the top view's class, past the popups, which pass keys on.
QPERF_UI static word_t top_view(void)
{
    char *node = *(char **)((char *)views + MANAGER_LAST);
    for (;;) {
        word_t vtable = **(word_t **)(node + NODE_VIEW);
        if (vtable != POPUP_VTABLE)
            return vtable;
        node = *(char **)(node + NODE_PREV);
    }
}

// A screen can take QPER's release, which leaves stock's QPER view open behind
// it, taking pads with QPER up. Closing it twice is harmless: it only sets a flag.
QPERF_UI static void close_qper_view(void)
{
    char *list = (char *)views + MANAGER_LIST;
    char *node = *(char **)((char *)views + MANAGER_LAST);
    for (; node != list; node = *(char **)(node + NODE_PREV)) {
        void *view = *(void **)(node + NODE_VIEW);
        if (*(word_t *)view == QPER_VTABLE) {
            VIEW_CLOSE(view);
            return;
        }
    }
}

QPERF_UI static int on_pages(void)
{
    word_t top = top_view();
    return top == PAGES_TOP_VTABLE || top == PERF_VTABLE || top == SCENE_VTABLE
        || top == MUTE_VTABLE || top == CHROMATIC_VTABLE;
}

static void *active_kit(void)
{
    return (char *)PROJECT_SINGLETON() + PROJECT_KIT;
}

static unsigned linked(void *kit)
{
    return (unsigned)KIT_QPER_MASK(kit) & 0xfff;
}

// The performance the PERF hold edits and acts on: the one performance edit shows, or
// QPER's link (from 0.6.0 PERF holds the gestures QPER held before; QPER keeps its link).
static int forced = -1;
static unsigned target(void *kit)
{
    return forced >= 0 ? 1u << forced : linked(kit);
}

// What the last PERF + YES applied, so a second YES puts it back:
// the kit's values as they were and the locks it removed. Any other QPER action, a lock
// edit or another kit forgets it, as stock's undo for clear and paste does.
static struct {
    void *kit;
    int index, count, valid;
    struct { unsigned char track, param; short lock; int old, now, expect; } e[SLOTS];
} applied;

static const unsigned char *lock_table(void *perf)
{
    return *(const unsigned char **)((char *)perf + PERF_TABLE);
}

static int lowest_linked(unsigned mask)
{
    int i = 0;
    while (!(mask >> i & 1))
        i++;
    return i;
}

static int several(unsigned mask)
{
    return (mask & (mask - 1)) != 0;
}

static int slots_free(const unsigned char *t)
{
    int i, free_slots = 0;
    for (i = 0; i < SLOTS; i++, t += SLOT_BYTES)
        if (t[2] > TRACK_NONE)
            free_slots++;
    return free_slots;
}

// A sound parameter's id on this track: machine parameters have one per machine.
QPERF_UI static int track_id(void *set, int param)
{
    word_t source = *(word_t *)((char *)set + SET_SOUND), sound;
    typedef word_t (*live_t)(word_t self);
    live_t live;
    if (!source)
        return 0;
    live = *(live_t *)(*(word_t *)source + VT_LIVE);
    sound = live(source);
    if (!sound)
        return 0;
    return ID_FOR_INDEX(param, *(unsigned char *)(sound + SOUND_MACHINE));
}

QPERF_UI static int param_id(void *set, int track, int param)
{
    return track == FX_TRACK ? FX_ID(param) : track_id(set, param);
}

QPERF_UI static int param_read(void *set, int id)
{
    return (*(set_read_t *)(*(word_t *)set + VT_READ))(set, id);
}

// A value as stock's setter keeps it: within the parameter row's range (as RECORD + YES
// clamps its locks), so an undo can tell its own write from a change made since, even if
// the setter lands a moment after it is called.
QPERF_UI static int clamp_id(int id, int value)
{
    const unsigned char *row = (const unsigned char *)ID_TABLE_AT + ID_ROW * id;
    int lo = *(const int *)(row + ID_MIN), hi = *(const int *)(row + ID_MAX);
    lo = lo < 0 ? 0 : lo;
    hi = hi > 0x7fff ? 0x7fff : hi;
    return value < lo ? lo : value > hi ? hi : value;
}

// The linked performance's lock on (track, param), 0 for none, or with several.
static const unsigned char *find_lock(void *kit, int track, int param)
{
    const unsigned char *t = lock_table((void *)KIT_PERF(kit));
    unsigned mask = target(kit);
    int i;
    if (several(mask))
        return 0;
    for (i = 0; i < SLOTS; i++, t += SLOT_BYTES)
        if (t[2] == track && t[3] == param && t[4] < PERFS && (mask >> t[4] & 1))
            return t;
    return 0;
}

// The locker stock edits through while PERF is held (main.c). Stock calls these slots.
static int locker_has_any(void *self)
{
    void *kit = active_kit();
    const unsigned char *t = lock_table((void *)KIT_PERF(kit));
    unsigned mask = target(kit);
    int i;
    (void)self;
    for (i = 0; i < SLOTS; i++, t += SLOT_BYTES)
        if (t[2] <= TRACK_NONE && t[4] < PERFS && (mask >> t[4] & 1))
            return 1;
    return 0;
}

static void locker_clear(void *self, int track, int param)
{
    void *kit = active_kit();
    unsigned mask = target(kit);
    (void)self;
    if (mask && !several(mask))
        PERF_CLEAR_ONE((void *)KIT_PERF(kit), lowest_linked(mask), track, param);
}

static void locker_clear_all(void *self)
{
    void *kit = active_kit();
    unsigned mask = target(kit);
    (void)self;
    if (mask && !several(mask))
        PERF_CLEAR((void *)KIT_PERF(kit), lowest_linked(mask));
}

static void locker_set(void *self, int track, int param, int value)
{
    void *kit = active_kit();
    void *perf = (void *)KIT_PERF(kit);
    unsigned mask = target(kit);
    (void)self;
    if (!mask) {
        show("NO PERFORMANCE LINKED");
        return;
    }
    if (several(mask)) {
        show(SEVERAL);
        return;
    }
    if (!find_lock(kit, track, param) && !slots_free(lock_table(perf))) {
        show("LOCK MEM FULL!");
        return;
    }
    applied.valid = 0;
    PERF_SET(perf, lowest_linked(mask), track, param, value);
}

static int locker_get(void *self, int track, int param)
{
    const unsigned char *t = find_lock(active_kit(), track, param);
    (void)self;
    return t ? (short)(t[0] << 8 | t[1]) : 0;
}

static int locker_has(void *self, int track, int param)
{
    (void)self;
    return find_lock(active_kit(), track, param) != 0;
}

static void locker_never(void *self)
{
    (void)self;                         // the object is static: never destroyed
}

// PerformanceParamLocker's slots, its last two kept: relative, and lockable(id).
static const void *const locker_vtable[] = {
    locker_never, locker_never, locker_has_any, locker_clear, locker_clear_all,
    locker_set, locker_get, locker_has,
    (const void *)LOCKER_RELATIVE_AT, (const void *)LOCKER_LOCKABLE_AT,
};
static struct { const void *const *vtable; } locker = { locker_vtable };

// A message with the linked performance's number in it.
QPERF_UI static void show_numbered(const char *before, unsigned mask, const char *after)
{
    char *out = message;
    int number = lowest_linked(mask) + 1;
    while (*before)
        *out++ = *before++;
    if (number > 9)
        *out++ = '1';
    *out++ = (char)('0' + number % 10);
    while (*after)
        *out++ = *after++;
    *out = 0;
    show(message);
}

static void seen_now(void)
{
    int i;
    for (i = 0; i < PERFS; i++)
        hot.seen[i] = PERF_AMOUNT(i);
}

// An unlinked performance stops adding, and a new one takes over at the knob's
// position.
static void link_moved(unsigned mask)
{
    word_t project = PROJECT_SINGLETON();
    unsigned old = known;
    int i, amount = qperf_pot ? (qperf_pot - 1) << 7 : old ? (int)PERF_AMOUNT(lowest_linked(old)) : 0;
    hot.perf_rec_busy = 1;
    for (i = 0; i < PERFS; i++) {
        if ((old & ~mask) >> i & 1)
            AMOUNT_SET(project, i, 0, 1, 1);
        else if ((mask & ~old) >> i & 1)
            AMOUNT_SET(project, i, amount, 1, 1);
    }
    known = mask;
    seen_now();                         // our own writes are no move for the quick perf rec
    hot.perf_rec_busy = 0;
}

QPERF_UI static int undo_apply(void *kit, unsigned mask)
{
    void *perf = (void *)KIT_PERF(kit);
    int i;
    if (!applied.valid || applied.kit != kit || mask != 1u << applied.index)
        return 0;
    applied.valid = 0;
    for (i = 0; i < applied.count; i++) {
        int track = applied.e[i].track, param = applied.e[i].param, id;
        void *set = (void *)KIT_PARAM_SET(kit, track);
        id = param_id(set, track, param);
        if (id && (param_read(set, id) == applied.e[i].now || param_read(set, id) == applied.e[i].expect))
            SET_VALUE(set, id, applied.e[i].old, track, 1, 1);     // unless MIDI changed it since
        PERF_SET(perf, applied.index, track, param, applied.e[i].lock);
    }
    show("UNDO APPLY");
    return 1;
}

QPERF_UI static void apply_linked(void *kit)
{
    void *perf = (void *)KIT_PERF(kit);
    const unsigned char *t = lock_table(perf);
    unsigned mask = target(kit);
    int i, changed = 0;
    if (undo_apply(kit, mask))
        return;
    applied.count = 0;
    for (i = 0; i < SLOTS; i++, t += SLOT_BYTES) {
        int track = t[2], param = t[3], index = t[4], lock, id, value;
        void *set;
        if (track > TRACK_NONE || index >= PERFS || !(mask >> index & 1))
            continue;
        lock = (short)(t[0] << 8 | t[1]);
        if (!lock)
            continue;
        set = (void *)KIT_PARAM_SET(kit, track);
        id = param_id(set, track, param);
        if (!id)
            continue;
        value = lock * (int)PERF_AMOUNT(index) >> AMOUNT_SCALE;     // as the engine adds it
        if (!value)
            continue;
        applied.e[applied.count].track = track;
        applied.e[applied.count].param = param;
        applied.e[applied.count].lock = lock;
        applied.e[applied.count].old = param_read(set, id);
        applied.count++;
        applied.index = index;
        applied.e[applied.count - 1].expect = clamp_id(id, param_read(set, id) + value);
        SET_VALUE(set, id, param_read(set, id) + value, track, 1, 1);
        applied.e[applied.count - 1].now = param_read(set, id);
        PERF_CLEAR_ONE(perf, index, track, param);
        changed = 1;
    }
    applied.kit = kit;
    applied.valid = changed;
    if (changed)
        show_numbered("PERFORMANCE ", mask, " APPLIED");
    else
        show("NOTHING TO APPLY");
}

// As stock's own menu rows do: undo if there is one, then the action.
QPERF_UI static void clear_linked(void *perf, int index)
{
    if (PERF_UNDO(perf, index, UNDO_CLEAR))
        show("UNDO CLEAR");
    else if (PERF_CLEAR_KEEP(perf, index, 1))
        show("CLEAR PERFORMANCE");
    else
        show("NOTHING TO CLEAR");
}

QPERF_UI static void paste_linked(void *perf, int index)
{
    if (PERF_UNDO(perf, index, UNDO_PASTE))
        show("UNDO PASTE");
    else if (PERF_PASTE(perf, index, 1))
        show("PASTE PERFORMANCE");
    else
        show("NOTHING TO PASTE");
}

static int live_rec(void);
QPERF_UI static void perf_rec_action(int key);

QPERF_UI static void perf_action(int key)
{
    void *kit = active_kit();
    void *perf = (void *)KIT_PERF(kit);
    unsigned mask = target(kit);
    int index;
    if (several(mask)) {
        show(SEVERAL);
        return;
    }
    if (key == KEY_YES) {
        apply_linked(kit);
        return;
    }
    applied.valid = 0;
    if (!mask) {
        show("NO PERFORMANCE LINKED");
        return;
    }
    index = lowest_linked(mask);
    if (key == KEY_PLAY)
        clear_linked(perf, index);
    else if (key == KEY_STOP)
        paste_linked(perf, index);
    else if (PERF_COPY(perf, index))
        show_numbered("COPY PERFORMANCE ", mask, "");
    else
        show("NOTHING TO COPY");
}

static int playing(void)
{
    return U32(PLAYING_A_AT) && U32(PLAYING_B_AT);
}

static int live_rec(void)
{
    word_t rec = U32(REC_UI_AT);
    return rec && *(volatile unsigned char *)(rec + LIVE_REC);
}

static word_t live_pattern_data(void)
{
    int index = U8(LIVE_PATTERN_AT);
    return index < 0 ? 0 : PATTERNS_AT + (word_t)PATTERN_BYTES * index;
}

QPERF_UI static int per_track(word_t pattern)
{
    return *(volatile unsigned char *)(pattern + PATTERN_PER_TRACK) == 1;
}

QPERF_UI static int track_length(word_t pattern, int track)
{
    int steps = *(volatile unsigned char *)(pattern + (word_t)TRACK_BYTES * track + TRACK_LENGTH);
    return steps < 1 || steps > STEPS ? STEPS : steps;
}

QPERF_UI static int track_speed(word_t pattern, int track)
{
    return *(volatile unsigned char *)(pattern + (word_t)TRACK_BYTES * track + TRACK_SPEED);
}

// The quick perf rec's loop: the pattern's length, which with a length per track is the
// master length. INF (shown as 1) and anything above 64 loop every 64 steps.
static int perf_rec_steps(word_t pattern)
{
    int steps = pattern ? (short)U16(pattern + PATTERN_LENGTH) : 0;
    return steps <= 1 || steps > STEPS ? STEPS : steps;
}

// The pattern's place in points: its step and how far the sequencer's pulses
// have gone into it, timed between pulses on the music clock.
static int position(void)
{
    int pps = *(const signed char *)(PULSES_TABLE_AT + U8(SEQ_SPEED_AT));
    int pulse = U8(SEQ_PULSE_AT), step = U16(SEQ_STEP_AT) % perf_rec_steps(live_pattern_data()), pos;
    long elapsed = PULSE_UNITS - (long)(U32(NEXT_PULSE_AT) - U32(MUSIC_CLOCK_AT));
    if (pps <= 0)
        pps = 6;
    if (pulse < 0 || pulse >= pps)
        pulse = 0;
    if (elapsed < 0)
        elapsed = 0;
    else if (elapsed >= PULSE_UNITS)
        elapsed = PULSE_UNITS - 1;
    pos = step * POINTS
        + (int)(((long)pulse * PULSE_UNITS + elapsed) * POINTS / ((long)pps * PULSE_UNITS));
    // The pulse handler can be cut between its pulse reset and its step count,
    // which reads as a step back: hold the last place then.
    if (hot.last_pos >= 0 && pos < hot.last_pos && hot.last_pos - pos < POINTS)
        pos = hot.last_pos;
    return pos;
}

static int has_point(int p, int pos)
{
    return perf_rec_has[p][pos / POINTS] >> (pos % POINTS) & 1;
}

static void record(int p, int pos, unsigned amount)
{
    int from = rec_pos[p], i;
    // Fill the points passed since the last block, so a fast tempo leaves no gap.
    if (from < 0 || pos <= from || pos - from > POINTS)
        from = pos - 1;
    for (i = from + 1; i <= pos; i++) {
        perf_rec[p][i] = (unsigned char)(amount >> 7);
        perf_rec_has[p][i / POINTS] |= (unsigned char)(1 << (i % POINTS));
    }
    rec_pos[p] = pos;
    hot.perf_rec_used |= 1u << p;
}

static void wipe(void)
{
    int p, s;
    for (p = 0; p < PERFS; p++) {
        for (s = 0; s < STEPS; s++)
            perf_rec_has[p][s] = 0;
        rec_pos[p] = -1;
    }
    hot.perf_rec_used = 0;
    hot.perf_rec_hidden = 0;
    scene_wipe = 1;                     // the UI tick empties the scene lane
    perf_rec_loop = perf_rec_period = perf_rec_steps(live_pattern_data());
}

// The loop got longer: the take repeats over the new steps at its own period, so 16 to 32
// plays it twice and 16 to 24 plays steps 1-8 again, whether the length jumps or SCALE's
// menu steps it one at a time. Steps below the period are the take's own, never cut, so
// they stay. Points and their bits both, so a gap copies as a gap. Each step copies one
// already in place, so a loop several periods long tiles too.
static void extend_take(int from, int to)
{
    int p, s;
    if (from < perf_rec_period)
        from = perf_rec_period;
    for (p = 0; p < PERFS; p++) {
        amount_pair_t *points = (amount_pair_t *)perf_rec[p];
        if (!(hot.perf_rec_used >> p & 1))
            continue;
        for (s = from; s < to; s++) {
            int t = s - perf_rec_period;
            points[2 * s] = points[2 * t];                  // POINTS bytes: two words a step
            points[2 * s + 1] = points[2 * t + 1];
            perf_rec_has[p][s] = perf_rec_has[p][t];
        }
    }
}

// Hand each driven performance back to what it was before the quick perf rec took it.
static void release_driven(void)
{
    int p;
    for (p = 0; p < PERFS; p++)
        if (driven >> p & 1) {
            PERF_AMOUNT(p) = rest[p];
            hot.seen[p] = rest[p];
        }
    driven = 0;
}

// The whole block: what qperf_render did up to 0.2.1, after its first test. Its early
// return for a block where nothing happens is qperf_render's quick exit now.
static void render_all(void)
{
    int p, pos, rec, steps, pattern = U8(LIVE_PATTERN_AT);
    if (pattern != hot.perf_rec_pattern) {
        release_driven();
        wipe();
        scene_wipe = 2;
        hot.perf_rec_pattern = pattern;
    }
    // A longer loop fills its new steps with the take, once, here; a shorter one plays the
    // start of it, and once a whole pass has played at it (below) that start is what a
    // later lengthening repeats, over what the hidden steps held. A cleared take stays as
    // it was until NO brings it back, and then takes the loop it comes back to.
    steps = perf_rec_steps(live_pattern_data());
    if (steps != perf_rec_loop && !hot.perf_rec_hidden) {
        if (steps > perf_rec_loop && hot.perf_rec_used && perf_rec_period)
            extend_take(perf_rec_loop, steps);
        perf_rec_loop = steps;
    }
    // The QPER knob: a resting pot wobbles a step, and stock writes each wobble
    // to the linked performance. So a turn starts only once the knob has left
    // its rest by more than POT_DEAD; from then every new value counts, until
    // it stops. Going back and forth between the same two values is a wobble.
    {
        int pot = qperf_pot;
        if (pot && pot != pot_last) {
            int travel = pot != pot_before;
            if (knob_touched ? travel : pot - pot_rest > POT_DEAD || pot_rest - pot > POT_DEAD)
                knob_touched = KNOB_BLOCKS;
            pot_before = pot_last;
            pot_last = pot;
        } else if (knob_touched && !--knob_touched) {
            pot_rest = pot;             // stopped: this is where it rests
        }
        if (!knob_touched && !pot_rest)
            pot_rest = pot;
    }
    // A move anyone else makes: the pads, the QPER knob, MIDI. A pad sends its
    // pressure only when it changes and a 0 when let go, so a performance a pad
    // left above zero is still held, the linked one too: only the panel's knob
    // message moves the knob's value. A knob touch in LIVE
    // RECORDING takes the rest of the loop: the linked performances record what
    // the knob plays, moving or not, from where the turn started to the loop's
    // end, then play it back, so an earlier take before the turn is kept.
    // Turning on doesn't stretch it; a new turn after the knob rested starts
    // another. Otherwise the knob takes one over only while it turns, and lets
    // go as soon as it stops.
    rec = playing() && live_rec();
    pos = playing() ? position() : -1;
    if (!rec || pos < 0) {
        knob_armed = 0;
    } else if (knob_touched && !knob_was && !knob_armed) {
        knob_armed = steps * POINTS - pos;
        knob_armed_pos = pos;
    } else if (knob_armed) {
        // It runs to the loop's end: done once the place comes round to the start, or
        // jumps back there because the loop was cut short of it, so the moves before the
        // turn are kept. A loop made longer, or shorter ahead of it, moves that end with it.
        knob_armed = pos < knob_armed_pos ? 0 : steps * POINTS - pos;
        knob_armed_pos = pos;
    }
    knob_was = knob_touched != 0;
    for (p = 0; p < PERFS; p++) {
        unsigned short now = PERF_AMOUNT(p);
        int knob = known >> p & 1, wobble = knob && qperf_pot && now == (unsigned short)((qperf_pot - 1) << 7);
        int moved = now != hot.seen[p] && !wobble, held_now;
        if (now != hot.seen[p] && (!wobble || !now)) {
            if (now)
                pads_held |= 1u << p;
            else
                pads_held &= ~(1u << p);   // let go, whoever wrote the 0
        }
        held_now = pads_held >> p & 1;
        if (moved || held_now || (knob && (knob_armed || knob_touched))) {
            hot.seen[p] = now;
            touched[p] = moved || held_now ? TOUCH_BLOCKS : 1;   // the knob lets go at once
            driven &= ~(1u << p);       // it is theirs now
        } else {
            if (now != hot.seen[p]) {
                hot.seen[p] = now;      // the knob resting: its amount, but no move
                driven &= ~(1u << p);
            }
            if (touched[p])
                touched[p]--;
        }
    }
    if (pos < 0) {
        release_driven();
        hot.last_pos = -1;
        passes = 0;
        for (p = 0; p < PERFS; p++)
            rec_pos[p] = -1;
        return;
    }
    // A shorter loop cuts the take to its start only once a whole pass has played at it:
    // from one coming round (or PLAY from the start) to the next, the length unchanged.
    // A menu scrolled through short lengths, or a length set while stopped, cuts nothing.
    if (steps != pass_steps || hot.perf_rec_hidden) {
        pass_steps = steps;
        passes = 0;
    }
    if (hot.last_pos < 0 ? pos < POINTS : pos < hot.last_pos && hot.last_pos < steps * POINTS) {
        if (passes < 2)
            passes++;
        if (passes == 2 && steps < perf_rec_period)
            perf_rec_period = steps;
    }
    hot.last_pos = pos;
    for (p = 0; p < PERFS; p++) {
        unsigned bit = 1u << p;
        if (touched[p]) {
            if (rec) {
                if (hot.perf_rec_hidden) {
                    wipe();             // a new take replaces the cleared one
                }
                // What it holds now repeats with this loop; a first move starts a new take.
                if (!hot.perf_rec_used || perf_rec_period < perf_rec_loop)
                    perf_rec_period = perf_rec_loop;
                record(p, pos, PERF_AMOUNT(p));
            }
            continue;
        }
        rec_pos[p] = -1;
        if (!hot.perf_rec_hidden && (hot.perf_rec_used & bit) && has_point(p, pos)) {
            unsigned short amount = (unsigned short)(perf_rec[p][pos] << 7);
            if (!(driven & bit)) {
                rest[p] = PERF_AMOUNT(p);
                driven |= bit;
            }
            PERF_AMOUNT(p) = amount;
            hot.seen[p] = amount;
        } else if (driven & bit) {
            PERF_AMOUNT(p) = rest[p];
            hot.seen[p] = rest[p];
            driven &= ~bit;
        }
    }
}

// Anything left in play after a whole block that a later block must look at. Only the
// whole block raises these; the UI only lowers them (release_driven, wipe), so a 0 here
// stays true until the next whole block.
static int stirring(void)
{
    int p;
    if (knob_touched || knob_armed || knob_was || pads_held || driven)
        return 1;
    for (p = 0; p < PERFS; p++)
        if (touched[p] || rec_pos[p] >= 0)
            return 1;
    return 0;
}

// Every performance's amount where we last saw it: two at a time.
static int amounts_seen(const amount_pair_t *was)
{
    const volatile amount_pair_t *now = (const volatile amount_pair_t *)PERF_AMOUNTS_AT;
    return now[0] == was[0] && now[1] == was[1] && now[2] == was[2]
        && now[3] == was[3] && now[4] == was[4] && now[5] == was[5];
}

// A whole block, then what the quick exit needs to know about it.
static void __attribute__((noinline)) render_whole(void)
{
    render_all();
    hot.stirring = stirring();
    hot.pot_still = pot_rest ? pot_last : 0;
}

// The audio interrupt runs this every block, sequencer stopped or not. A block where
// nothing happens takes the quick exit: the same pattern, nothing still in play from the
// last whole block (stirring), no quick perf rec to play back, the knob at rest and every
// amount where it was. That is 0.2.1's early return, and as there, the whole block would
// change nothing but last_pos, so set only that. It reads the hot lines only.
void qperf_render(void)
{
    struct qperf_hot *h = &hot;
    int pot;
    __asm__("" : "+a"(h));              // one address register for the hot lines: shorter code
    if (!h->ready || h->perf_rec_busy)
        return;
    if (!h->stirring && U8(LIVE_PATTERN_AT) == h->perf_rec_pattern
        && (!h->perf_rec_used || h->perf_rec_hidden)
        && (!(pot = qperf_pot) || pot == h->pot_still)
        && amounts_seen((const amount_pair_t *)h->seen)) {
        h->last_pos = playing() ? position() : -1;
        return;
    }
    render_whole();
}

// A step's value in one performance's quick perf rec: its first recorded point, so a
// move shorter than a step still lands. -1 for none.
QPERF_UI static int step_amount(int p, int step)
{
    unsigned bits = perf_rec_has[p][step];
    int q = 0;
    if (!bits)
        return -1;
    while (!(bits >> q & 1))
        q++;
    return perf_rec[p][step * POINTS + q] << 7;
}

QPERF_UI static int row_used(const char *data, int track, int word)
{
    int step;
    for (step = 0; step < STEPS; step++)
        if (*(const short *)(data + MATRIX_TRACK * track + MATRIX_STEP * step + 2 * word) >= 0)
            return 1;
    return 0;
}

QPERF_UI static int matrix_rows(const char *data)
{
    int track, word, rows = 0;
    for (track = 0; track <= FX_TRACK; track++)
        for (word = 0; word < WORDS; word++)
            if (row_used(data, track, word))
                rows += 1 + (data[MATRIX_TRACK * track + MATRIX_FINE + word] != 0);
    return rows;
}

// How many steps a track takes the quick perf rec on: its own length with a length per
// track, as long as it runs at the pattern's speed (0: none).
QPERF_UI static int track_steps(word_t pattern, int track, int steps)
{
    if (!per_track(pattern))
        return steps;
    if (track_speed(pattern, track) != *(volatile unsigned char *)(pattern + PATTERN_SPEED))
        return 0;
    return track_length(pattern, track);
}

QPERF_UI static int perf_rec_target(const unsigned char *table, int i);

// Each (track, word) a scene in the scene lane locks that no performance target already
// covers, once.
QPERF_UI static int scene_rec_target(const unsigned char *table, const unsigned char *st, unsigned scenes, int i)
{
    const unsigned char *t = st + SLOT_BYTES * i, *u = st;
    int j, sc = (signed char)t[4];
    if (t[2] > TRACK_NONE || sc < 0 || sc >= 12 || !(scenes >> sc & 1) || t[3] >= WORDS)
        return 0;
    for (j = 0; j < i; j++, u += SLOT_BYTES)
        if (u[2] == t[2] && u[3] == t[3] && (signed char)u[4] >= 0 && (signed char)u[4] < 12
            && (scenes >> (signed char)u[4] & 1))
            return 0;
    for (j = 0; j < SLOTS; j++)
        if (perf_rec_target(table, j) && table[SLOT_BYTES * j + 2] == t[2] && table[SLOT_BYTES * j + 3] == t[3])
            return 0;
    return 1;
}

// Each (track, word) a performance in the quick perf rec locks, once.
QPERF_UI static int perf_rec_target(const unsigned char *table, int i)
{
    const unsigned char *t = table + SLOT_BYTES * i, *u = table;
    int j;
    if (t[2] > TRACK_NONE || t[4] >= PERFS || !(hot.perf_rec_used >> t[4] & 1) || t[3] >= WORDS)
        return 0;
    for (j = 0; j < i; j++, u += SLOT_BYTES)
        if (u[2] == t[2] && u[3] == t[3] && u[4] < PERFS && (hot.perf_rec_used >> u[4] & 1))
            return 0;
    return 1;
}

// One (track, word): each step a quick perf rec move reaches gets the step's own lock or
// the kit's value plus the moves, and the step after a move gets that value
// back. Returns how many steps it writes, and writes only with write set.
// The scene the lane plays at a step's first recorded point, -1 for none or no point.
QPERF_UI static int step_scene(int step)
{
    unsigned bits = scene_used ? scene_rec_has[step] : 0;
    int q = 0;
    if (!bits)
        return -1;
    while (!(bits >> q & 1))
        q++;
    return scene_rec[step * POINTS + q] - 1;
}

// The kit's scene lock table.
QPERF_UI static const unsigned char *scene_table(void *kit)
{
    word_t scenes = ((word_t (*)(void *))KIT_SCENES_AT)(kit);
    return ((const unsigned char *(*)(word_t))(*(word_t **)scenes)[SCENES_TABLE / 4])(scenes);
}

// The scenes the lane plays, a bit each.
QPERF_UI static unsigned lane_scenes(void)
{
    unsigned mask = 0;
    int step, sc;
    for (step = 0; step < STEPS; step++)
        if ((sc = step_scene(step)) >= 0)
            mask |= 1u << sc;
    return mask;
}

QPERF_UI static int apply_target(void *kit, const unsigned char *table, word_t pattern, int track, int word,
                       int length, int steps, int write)
{
    void *set = (void *)KIT_PARAM_SET(kit, track);
    int id = param_id(set, track, word), kit_value = 0, lo = 0, hi = 0, at, was = 0, n = 0, i;
    int locks[PERFS], perfs[PERFS], count = 0, scene_lock[12];
    const unsigned char *st = scene_table(kit);
    void *trk = 0;
    if (!id)
        return 0;
    for (i = 0; i < 12; i++)
        scene_lock[i] = -1;
    for (i = 0; i < SCENE_SLOTS; i++, st += SLOT_BYTES)
        if (st[2] == track && st[3] == word && (signed char)st[4] >= 0 && (signed char)st[4] < 12)
            scene_lock[(signed char)st[4]] = (short)(st[0] << 8 | st[1]);
    for (i = 0; i < SLOTS && count < PERFS; i++) {
        const unsigned char *t = table + SLOT_BYTES * i;
        if (t[2] == track && t[3] == word && t[4] < PERFS && (hot.perf_rec_used >> t[4] & 1)) {
            locks[count] = (short)(t[0] << 8 | t[1]);
            perfs[count++] = t[4];
        }
    }
    if (write) {
        const unsigned char *row = (const unsigned char *)ID_TABLE_AT + ID_ROW * id;
        kit_value = param_read(set, id);
        lo = *(const int *)(row + ID_MIN);
        hi = *(const int *)(row + ID_MAX);  // stock shows ERR for a lock past it
        lo = lo < 0 ? 0 : lo;
        hi = hi > 0x7fff ? 0x7fff : hi;
        trk = (void *)PATTERN_TRACK(pattern, track);
    }
    // Each of the track's steps takes the quick perf rec where it plays: a shorter track
    // wraps it, a longer one repeats it. The counters run a step ahead of what
    // plays, so step at's lock comes from the quick perf rec one step on.
    for (at = 0; at < length; at++) {
        int step = (at + 1) % steps, offset = 0, lock, value, sc = step_scene(step), base;
        int scened = sc >= 0 && scene_lock[sc] >= 0, active;
        for (i = 0; i < count; i++) {
            int amount = step_amount(perfs[i], step);
            if (amount >= 0)
                offset += locks[i] * amount >> AMOUNT_SCALE;
        }
        active = offset || scened;
        if (!active && !was) {
            was = 0;
            continue;                   // nothing to add, and nothing to return from
        }
        was = active;
        n++;
        if (!write)
            continue;
        lock = STEP_LOCK_GET(trk, at, word, 0);
        if (!active && lock >= 0)
            continue;                   // its own lock is the sound to return to
        base = scened ? scene_lock[sc] : lock >= 0 ? lock : kit_value;   // a scene replaces the base
        value = base + offset;
        if (!ID_FINE(id))
            value = (value + 0x80) & ~0xff;     // a whole step: it has no fine part
        value = value < lo ? lo : value > hi ? hi : value;
        if (!STEP_AUDIBLE(trk, at) && !STEP_LOCK_TRIG(trk, at))
            STEP_MAKE_LOCK_TRIG(trk, at, 1);
        STEP_LOCK_SET(trk, at, word, value, ID_FINE(id) != 0);
    }
    return n;
}

QPERF_UI static void *track_data(void *trk)
{
    return (void *)(*(word_t (**)(void *))(*(word_t *)trk + LOCKS_DATA))(trk);
}

QPERF_UI static void notice(void *object)
{
    (*(notice_t *)(*(word_t *)object + VT_NOTICE))(object, 0);
}

// One step's contents onto another, as stock's page copy moves a page's.
QPERF_UI static void copy_step(void *trk, char *locks, int from, int to)
{
    static const short rows[STEP_FIELDS] = { 128, 192, 256, 320, 576, 384, 448, 512, 640 };
    unsigned char *d = (unsigned char *)track_data(trk);
    int i, index = *(int *)((char *)trk + TRACK_INDEX);
    ((unsigned short *)d)[to] = ((unsigned short *)d)[from];
    for (i = 0; i < STEP_FIELDS - 1; i++)
        d[rows[i] + to] = d[rows[i] + from];
    d[640 + to] = PAD_TRACK(index) == 1 ? d[640 + from] : 0xff;
    STEP_LOCKS_CLEAR(trk, to);
    locks += MATRIX_TRACK * index;
    MEMCPY(locks + MATRIX_STEP * to, locks + MATRIX_STEP * from, MATRIX_STEP);
}

QPERF_UI static int gcd(int a, int b)
{
    while (b) {
        int r = a % b;
        a = b;
        b = r;
    }
    return a;
}

// A step's condition for its copy c, when the track went from loops counted k
// times a cycle to one loop a cycle: stock counts a loop each time a track
// ends, so copy c of cycle m ran in loop k * m + c. The copy keeps the passes
// it played on: a new N:M, none, or COND_NEVER.
QPERF_UI static int copy_condition(int condition, int k, int c)
{
    int n, m, r, g, mm, kk, inv, m0;
    if (condition == COND_FIRST)
        return c ? COND_NEVER : condition;
    if (condition == COND_NOT_FIRST)
        return c ? COND_NONE : condition;
    if (condition < COND_RATIO_LO || condition > COND_RATIO_HI)
        return condition;
    for (m = 2; condition > 28 + m * (m + 1) / 2; m++)
        ;
    n = condition - 28 - m * (m - 1) / 2;
    r = ((n - 1 - c) % m + m) % m;
    g = gcd(k % m ? k % m : m, m);
    if (r % g)
        return COND_NEVER;
    mm = m / g;
    if (mm == 1)
        return COND_NONE;
    kk = (k / g) % mm;
    for (inv = 0; inv < mm && kk * inv % mm != 1; inv++)
        ;
    m0 = r / g * inv % mm;
    return 28 + mm * (mm - 1) / 2 + m0 + 1;
}

// Whether a track can take the quick perf rec's length exactly: with a master length up
// to 64 every track restarts with it, so repeating a track's steps out to it
// plays the same. Without one (INF) or past 64, only a length that divides 64
// repeats the same way.
QPERF_UI static int can_lengthen(word_t pattern, void *trk, int length, int steps)
{
    int master = (short)U16(pattern + PATTERN_LENGTH);
    signed char fallback = ((signed char *)track_data(trk))[COND_DEFAULT];
    // A track whose default condition counts loops: a step that takes it
    // could need "always", which a step can't say over a default.
    if (fallback == COND_FIRST || fallback == COND_NOT_FIRST
        || (fallback >= COND_RATIO_LO && fallback <= COND_RATIO_HI))
        return 0;
    if (EUCLID_MODE(trk) == 1)
        return 0;
    if (master > 1 && master <= STEPS)
        return 1;
    return STEPS % length == 0 && (master <= 1 || master % STEPS == 0);
}

// Repeat a track's steps out to the quick perf rec's length and rewrite its conditions
// so every copy plays on the passes the original did.
QPERF_UI static void lengthen(void *trk, char *locks, int length, int steps)
{
    unsigned char *d;
    int k = steps / length, j;
    TRACK_LENGTH_SET(trk, steps);
    EUCLID_REFRESH(trk, 1);
    for (j = length; j < steps; j++)
        copy_step(trk, locks, j % length, j);
    d = (unsigned char *)track_data(trk);
    for (j = 0; j < steps; j++) {
        signed char own = (signed char)d[COND_ROW + j];
        int was = own >= 0 ? own : (signed char)d[COND_DEFAULT];
        int now = copy_condition(was, k, j / length);
        if (!(((unsigned short *)d)[j] & TRIG_ON))
            continue;
        if (now == COND_NEVER) {
            STEP_FLAG_SET(trk, j, TRIG_ON, 0);
            STEP_COND_SET(trk, j, COND_NONE);   // a lock trig placed here later plays every pass
        }
        else if (now != was)
            STEP_COND_SET(trk, j, now);
    }
    notice(*(void **)((char *)trk + PATTERN_LOCKS));
    notice(trk);
}

// QPER + YES with LIVE RECORDING on.
QPERF_UI static void apply_perf_rec(void)
{
    void *kit = active_kit();
    const unsigned char *table = lock_table((void *)KIT_PERF(kit));
    word_t project = PROJECT_SINGLETON(), pattern = PATTERN_OF(project);
    word_t steps_pattern = live_pattern_data();
    void *any_track = (void *)PATTERN_TRACK(pattern, 0);
    void *locks = *(void **)((char *)any_track + PATTERN_LOCKS);
    char *data;
    const unsigned char *st = scene_table(kit);
    unsigned tracks = 0, longer = 0, skipped = 0, scenes = lane_scenes();
    int i, need = 0, wrote = 0, steps, track, length[FX_TRACK + 1];
    if ((!hot.perf_rec_used && !scenes) || hot.perf_rec_hidden || !steps_pattern || !locks) {
        show("NOTHING TO APPLY");
        return;
    }
    data = (char *)(*(word_t (**)(void *))(*(word_t *)locks + LOCKS_DATA))(locks);
    steps = perf_rec_steps(steps_pattern);
    // Which tracks the moves reach, and how many steps each takes them on: a
    // track shorter than the quick perf rec takes its length first if it can, and one
    // that can't, or runs at its own speed, is left out.
    for (i = 0; i < SLOTS; i++)
        if (perf_rec_target(table, i))
            tracks |= 1u << table[SLOT_BYTES * i + 2];
    for (i = 0; i < SCENE_SLOTS; i++)
        if (scene_rec_target(table, st, scenes, i))
            tracks |= 1u << st[SLOT_BYTES * i + 2];
    for (track = 0; track <= FX_TRACK; track++) {
        length[track] = track_steps(steps_pattern, track, steps);
        if (!(tracks >> track & 1))
            continue;
        if (!length[track])
            skipped |= 1u << track;
        else if (length[track] < steps) {
            if (can_lengthen(steps_pattern, (void *)PATTERN_TRACK(pattern, track), length[track], steps))
                longer |= 1u << track;
            else
                skipped |= 1u << track;
        }
    }
    tracks &= ~skipped;
    // A dry run at the length each track will have: only tracks a move
    // reaches are lengthened, and like stock's own lock writes, a new row
    // needs room in the 71 stock keeps, all of them or none.
    {
        unsigned writes = 0;
        for (i = 0; i < SLOTS; i++) {
            const unsigned char *t = table + SLOT_BYTES * i;
            int at = longer >> t[2] & 1 ? steps : length[t[2]], id;
            if (!perf_rec_target(table, i) || !(tracks >> t[2] & 1)
                || !apply_target(kit, table, pattern, t[2], t[3], at, steps, 0))
                continue;
            writes |= 1u << t[2];
            if (row_used(data, t[2], t[3]))
                continue;
            id = param_id((void *)KIT_PARAM_SET(kit, t[2]), t[2], t[3]);
            need += 1 + (ID_FINE(id) != 0);
        }
        for (i = 0; i < SCENE_SLOTS; i++) {
            const unsigned char *t = st + SLOT_BYTES * i;
            int at = longer >> t[2] & 1 ? steps : length[t[2]], id;
            if (!scene_rec_target(table, st, scenes, i) || !(tracks >> t[2] & 1)
                || !apply_target(kit, table, pattern, t[2], t[3], at, steps, 0))
                continue;
            writes |= 1u << t[2];
            if (row_used(data, t[2], t[3]))
                continue;
            id = param_id((void *)KIT_PARAM_SET(kit, t[2]), t[2], t[3]);
            need += 1 + (ID_FINE(id) != 0);
        }
        longer &= writes;
    }
    if (matrix_rows(data) + need > ROWS) {
        show("LOCK MEM FULL!");
        return;
    }
    for (track = 0; track <= FX_TRACK; track++)
        if (longer >> track & 1) {
            lengthen((void *)PATTERN_TRACK(pattern, track), data, length[track], steps);
            length[track] = steps;
        }
    for (i = 0; i < SLOTS; i++) {
        const unsigned char *t = table + SLOT_BYTES * i;
        if (perf_rec_target(table, i) && (tracks >> t[2] & 1))
            wrote += apply_target(kit, table, pattern, t[2], t[3], length[t[2]], steps, 1);
    }
    for (i = 0; i < SCENE_SLOTS; i++) {
        const unsigned char *t = st + SLOT_BYTES * i;
        if (scene_rec_target(table, st, scenes, i) && (tracks >> t[2] & 1))
            wrote += apply_target(kit, table, pattern, t[2], t[3], length[t[2]], steps, 1);
    }
    release_driven();
    if (scenes) {                       // the steps now hold the take's scenes: one still engaged
        int active = ((int (*)(void *))ACTIVE_SCENE_AT)(kit);   // would lock every step over them
        if (active >= 0 && (scenes >> active & 1)) {
            ((void (*)(void *, int, int))SCENE_ENGAGE_AT)(kit, -1, 1);
            scene_engaged_by_us = -1;   // the lane's own change, not a hand's
            scene_engaged_ticks = 2;
        }
    }
    wipe();
    if (skipped) {
        // Moves written where they fit: say how many tracks could not take them.
        const char *tail;
        char *out = message;
        int n = 0;
        for (track = 0; track <= FX_TRACK; track++)
            n += skipped >> track & 1;
        if (n > 9)
            *out++ = (char)('0' + n / 10);
        *out++ = (char)('0' + n % 10);
        for (tail = n == 1 ? " TRACK LEFT OUT" : " TRACKS LEFT OUT"; *tail; )
            *out++ = *tail++;
        *out = 0;
        show(message);
    } else {
        show(wrote ? "APPLY PERF/SCENE REC" : "NOTHING TO APPLY");
    }
}

// RECORD + NO: empty the quick perf rec, and bring it back on the next press.
QPERF_UI static void clear_perf_rec(void)
{
    passes = 0;                         // hidden or back: its passes count from here
    if (hot.perf_rec_hidden) {
        hot.perf_rec_hidden = 0;
        show("UNDO CLEAR");
    } else if (hot.perf_rec_used || scene_used) {
        release_driven();
        hot.perf_rec_hidden = 1;
        show("CLEAR PERF/SCENE REC");
    } else {
        show("NOTHING TO CLEAR");
    }
}

static void perf_rec_action(int key)
{
    scene_lane_sync();                  // a wipe the tick has not seen yet
    hot.perf_rec_busy = 1;
    if (key == KEY_YES)
        apply_perf_rec();
    else
        clear_perf_rec();
    hot.perf_rec_busy = 0;
}

void qperf_pad(void *event, int perf)
{
    if (PRESSED_ONCE(event)) {
        void *kit = active_kit();
        unsigned one = 1u << perf, mask = linked(kit) == one ? 0 : one;
        KIT_SET_MASK(kit, (int)mask);
        applied.valid = 0;
        link_moved(mask);
    }
}

// RECORD + YES and RECORD + NO. With no recording mode on, stock toggles grid
// recording at RECORD's press, before a second key; as stock's RECORD + PLAY
// does, the chord puts the record state back as it was at the press. With
// LIVE or STEP RECORDING on stock acts at RECORD's release only if no other
// key came between, so nothing changes there.
typedef void (*rec_set_t)(word_t rec, int on);
#define GRID_REC_SET ((rec_set_t)GRID_REC_SET_AT)
#define LIVE_REC_SET ((rec_set_t)LIVE_REC_SET_AT)
static unsigned char grid_at_press, live_at_press;
static int record_held;                 // RECORD down, from its own events: stock's key table can stick

QPERF_UI static void record_press(void)
{
    word_t rec = U32(REC_UI_AT);
    if (rec) {
        grid_at_press = *(volatile unsigned char *)(rec + GRID_REC);
        live_at_press = *(volatile unsigned char *)(rec + LIVE_REC);
    }
}

QPERF_UI static void record_restore(void)
{
    word_t rec = U32(REC_UI_AT);
    if (!rec)
        return;
    if (*(volatile unsigned char *)(rec + GRID_REC) != grid_at_press)
        GRID_REC_SET(rec, grid_at_press);
    if (*(volatile unsigned char *)(rec + LIVE_REC) != live_at_press)
        LIVE_REC_SET(rec, live_at_press);
}

QPERF_UI int qperf_key(void *brain, void *event)
{
    int key = *(int *)((char *)event + EV_KEY);
    unsigned flags = *(unsigned *)((char *)event + EV_FLAGS), bit;
    views = *(void **)((char *)brain + BRAIN_VIEWS);
    if (key == KEY_QPER) {
        if (!(flags & PRESSED)) {
            held = 0;
            close_qper_view();
        } else if (!(flags & REPEAT) && !IS_KEY_HELD(KEY_FUNC) && on_pages()) {
            held = 1;                   // QPER keeps only its link (QPER + pad or trig)
            swallowed = 0;
        }
        return 0;
    }
    if (key == KEY_YES)
        bit = 1;
    else if (key == KEY_PLAY)
        bit = 2;
    else if (key == KEY_REC)
        bit = 4;
    else if (key == KEY_STOP)
        bit = 8;
    else if (key == KEY_NO)
        bit = 16;
    else
        return 0;
    if (!(flags & PRESSED)) {
        if (key == KEY_REC)
            record_held = 0;
        if (swallowed & bit) {
            swallowed &= ~bit;
            return 1;
        }
        return 0;
    }
    if (swallowed & bit)
        return 1;                       // its repeats
    if (key == KEY_REC && !(flags & REPEAT)) {
        record_held = 1;
        record_press();
    }
    if ((key == KEY_YES || key == KEY_NO) && !held && !(flags & REPEAT)
        && record_held && !IS_KEY_HELD(KEY_FUNC) && on_pages()) {
        swallowed |= bit;
        record_restore();
        perf_rec_action(key);
        return 1;
    }
    return 0;                           // QPER + YES, PLAY, RECORD, STOP: stock's (PERF has them)
}

// For the PERF hold (main.c): the locker on the performance it edits (index, or -1 for
// QPER's link), whether a locker is that one, and YES, PLAY, RECORD or STOP on it.
void *qperf_locker(int index)
{
    forced = index;
    return &locker;
}

int qperf_is_locker(unsigned long object)
{
    return object == (word_t)&locker;
}

void qperf_action(int key, int index)
{
    forced = index;
    perf_action(key);
}


// For SCENE + YES (main.c): a kit parameter by a lock's track and parameter index, read
// and written as QPER + YES does. Returns -1 when the index has no parameter here.
int qperf_kit_clamp(int track, int param, int value)
{
    void *set = (void *)KIT_PARAM_SET(active_kit(), track);
    int id = param_id(set, track, param);
    return id ? clamp_id(id, value) : value;
}

int qperf_kit_read(int track, int param)
{
    void *set = (void *)KIT_PARAM_SET(active_kit(), track);
    int id = param_id(set, track, param);
    return id ? param_read(set, id) : -1;
}

void qperf_kit_write(int track, int param, int value)
{
    void *set = (void *)KIT_PARAM_SET(active_kit(), track);
    int id = param_id(set, track, param);
    if (id)
        SET_VALUE(set, id, value, track, 1, 1);
}

// A kit can bring other links: its own stay, and the amounts follow them. Acting
// directly in stock's kit routine and the project event left the kit blank at
// boot, so they only ask and the tick acts.
extern void improved_modulation_kit_changed(void);
void qperf_kit_changed(void)
{
    kit_changed = 1;
    applied.valid = 0;
    improved_modulation_kit_changed();
    scene_last_seen = -2;               // another kit's scene is no take
}

QPERF_UI void qperf_project(int how, unsigned dropped)
{
    (void)how;
    (void)dropped;
    hot.ready = 1;
    kit_changed = 1;
    hot.perf_rec_pattern = -2;          // a new project: the next block empties it
}

// The scene lane, once a UI tick (50 ms); only the UI touches it. While the pattern plays:
// in LIVE RECORDING a scene change that was not the lane's own records the engaged scene
// from there to the loop's end; otherwise, where the lane's value changes (or starts after
// a stretch with none), the lane engages its scene, so a scene picked by hand stays until
// the next recorded change. A SCENE hold keeps the scene still. A longer loop repeats the
// lane at its period, as the performance lanes do.
QPERF_UI static void scene_lane_clear(int steps)
{
    int i;
    for (i = 0; i < STEPS; i++)
        scene_rec_has[i] = 0;
    scene_used = scene_armed = 0;
    scene_loop = scene_period = steps;
}

// Empties the lane when a wipe asked for it (the audio block's on a new pattern or a
// replaced take, RECORD + YES's own).
QPERF_UI static void scene_lane_sync(void)
{
    int asked = scene_wipe;
    if (!asked)
        return;
    scene_wipe = 0;
    scene_lane_clear(perf_rec_steps(live_pattern_data()));
    if (asked == 2)
        scene_last_seen = -2;           // a new pattern or project: no change to record yet
}

QPERF_UI static void scene_lane_record(int from, int to, int scene)
{
    int i;
    for (i = from; i <= to; i++) {
        scene_rec[i] = (unsigned char)(scene + 1);
        scene_rec_has[i / POINTS] |= (unsigned char)(1 << (i % POINTS));
    }
    scene_used = 1;
}

QPERF_UI static void scene_lane_tick(void)
{
    void *kit = active_kit();
    int active, pos, from, i, steps, engaged = 0, wrapped;
    if (!hot.ready)
        return;
    scene_lane_sync();
    steps = perf_rec_steps(live_pattern_data());
    active = ((int (*)(void *))ACTIVE_SCENE_AT)(kit);
    if (steps != scene_loop && !hot.perf_rec_hidden) {
        if (steps > scene_loop && scene_used && scene_period)
            for (i = scene_loop > scene_period ? scene_loop : scene_period; i < steps; i++) {
                int t = i - scene_period, q;
                for (q = 0; q < POINTS; q++)
                    scene_rec[i * POINTS + q] = scene_rec[t * POINTS + q];
                scene_rec_has[i] = scene_rec_has[t];
            }
        scene_loop = steps;
    }
    if (!playing()) {
        scene_last_pos = -1;
        scene_armed = 0;
        scene_last_seen = active;       // a change while stopped is not a take
        return;
    }
    pos = position();
    from = scene_last_pos;
    // The pulse handler can cut the tick's read of the position, which then reads up to a
    // step ahead: a step back from that is standing still, not the loop coming round.
    if (from >= 0 && pos < from && from - pos < POINTS)
        pos = from;
    wrapped = from < 0 ? pos < POINTS : pos < from;
    // The lane's period follows a shorter loop once a whole pass has played at it, as the
    // performance lanes' does.
    if (steps != scene_pass_steps || hot.perf_rec_hidden) {
        scene_pass_steps = steps;
        scene_passes = 0;
    }
    if (wrapped) {
        if (scene_passes < 2)
            scene_passes++;
        if (scene_passes == 2 && steps < scene_period)
            scene_period = steps;
    }
    if (!live_rec())
        scene_armed = 0;
    else if (scene_last_seen != -2 && active != scene_last_seen && active != scene_engaged_by_us) {
        if (hot.perf_rec_hidden) {      // a new take replaces the cleared one
            hot.perf_rec_busy = 1;
            release_driven();
            wipe();
            hot.perf_rec_busy = 0;
            scene_wipe = 0;
            scene_lane_clear(steps);
        }
        if (!scene_used || scene_period < scene_loop)
            scene_period = scene_loop = steps;
        scene_armed = 1;                // the musician changed the scene: record from here
        from = -1;                      // from this tick's place, not the last one's
    }
    if (scene_armed) {
        if (from >= 0 && pos < from) {  // the loop came round: fill to its end, then the take plays
            scene_lane_record(from + 1, steps * POINTS - 1, scene_last_seen);
            scene_armed = 0;
        } else {
            // A tick is 50 ms, several points at a fast tempo: fill what it passed. A jump
            // of more than four steps is a new place, not a stretch played.
            if (from < 0 || pos - from > 4 * POINTS)
                from = pos - 1;
            scene_lane_record(from + 1, pos, active);
        }
    } else if (scene_used && !hot.perf_rec_hidden && from != pos && !IS_KEY_HELD(KEY_SCENE)
               && (scene_rec_has[pos / POINTS] >> (pos % POINTS) & 1)) {
        int was = from >= 0 && !wrapped && (scene_rec_has[from / POINTS] >> (from % POINTS) & 1)
            ? scene_rec[from] : -1;
        if (scene_rec[pos] != was && scene_rec[pos] != active + 1) {
            ((void (*)(void *, int, int))SCENE_ENGAGE_AT)(kit, scene_rec[pos] - 1, 1);
            scene_engaged_by_us = active = scene_rec[pos] - 1;
            scene_engaged_ticks = 2;
            engaged = 1;
        }
    }
    if (!engaged && scene_engaged_ticks && !--scene_engaged_ticks)
        scene_engaged_by_us = -2;       // the guard covers the engage landing, then a hand may pick it
    scene_last_pos = pos;
    scene_last_seen = active;
}

QPERF_UI void qperf_tick(void *ctrl)
{
    word_t string;
    char allocator;
    struct { void *object; void *counts; } shared;
    void *popup;
    (void)ctrl;
    scene_lane_tick();
    if (hot.ready && kit_changed) {
        unsigned mask;
        kit_changed = 0;                // first, so a change after this asks again
        mask = linked(active_kit());
        if (mask != known)
            link_moved(mask);
    }
    if (!show_text || !views)
        return;
    STRING_FROM_CSTR(&string, show_text, &allocator);
    show_text = 0;
    popup = (void *)MEM_NEW(POPUP_BYTES);
    POPUP_CTOR(popup, &string);
    SHARED_PTR_CTOR(&shared, popup);
    SHOW_POPUP(views, &shared, 0);
    SHARED_PTR_RELEASE(&shared.counts);
    STRING_DTOR(&string);
}
