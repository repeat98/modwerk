// SPDX-License-Identifier: GPL-3.0-or-later
// Quick Fill Trig Condition for the Analog Rytm MKII: hold a trig and press FILL
// to lock the trig's condition: FILL, then NOT FILL, then no lock. UP and DOWN
// with a trig held set a ratio: UP steps the first number, DOWN the second.
//
// A press with a trig held in GRID RECORDING writes every held trig and stock
// never sees it. Taking the event also takes FILL's release, which would
// otherwise end a fill latched with FUNC + FILL. Anything else stays stock's.
//
// Stock opens the trig's RETRIG menu on UP, DOWN or RTRG with a trig held. UP
// and DOWN are taken here, release and repeat too; RTRG still opens the menu,
// and with the menu open UP and DOWN stay stock's.
//
// The editor stock keeps at view + 108 masks the trigs held. A view above it can
// take a trig's release and leave the bit behind, and that must not take FILL
// from the musician, so a trig counts when its key is down too. A write drops
// such bits: stock's edit mark lasts until the mask empties, and while it lasts
// a tap does not remove a trig.
//
// The trig also has to be on the active track: a pad press with a trig held
// changes track, and the lock would land on an empty step, unseen.
//
// QPER's view and the menus cover TRC, so a write there would not show and FILL
// stays stock's. The PERF, SCNE, MUTE and CHRO modes leave the page on screen.
//
// Firmware routines are reached at fixed addresses given for each OS release
// by ar2-1.74.h. Stock returns pointers in d0, while m68k-linux GCC
// expects them in a0, so those routines are declared as returning a word.

#include "ar2-1.74.h"

#define VIEW_MANAGER 44
#define VIEW_PATTERN 104
#define VIEW_EDITOR 108
#define VIEW_SELECTION 116
#define VIEW_RETRIG 176             // the trig's RETRIG menu
#define MANAGER_LAST 24             // view manager + 24: the top view's list node
#define NODE_PREV 4
#define NODE_VIEW 8
#define EDITOR_HELD_HIGH 344        // steps 32-63
#define EDITOR_HELD_LOW 348         // steps 0-31
#define TRIG_KEYS 16
#define STEPS 64
#define KEY_UP 0x42
#define KEY_DOWN 0x43
#define TOOK 2

#define COND_UNSET (-2)
#define COND_NONE (-1)
#define COND_FILL 22
#define COND_NOT_FILL 23
#define RATIO_MAX 8                 // stock's ratios run 1:2, 2:2, 1:3 ... 8:8

typedef unsigned word_t;

typedef unsigned char (*event_test_t)(void *event);
typedef int (*key_id_t)(void *event);
typedef void (*event_taken_t)(void *event);
typedef unsigned char (*view_test_t)(void *view);
typedef unsigned char (*editor_test_t)(void *editor);
typedef void (*mark_edited_t)(void *editor, int on);
typedef void (*clear_actions_t)(void *editor);
typedef word_t (*object_part_t)(void *object);
typedef int (*active_track_t)(void *selection);
typedef word_t (*pattern_track_t)(void *pattern, int track);
typedef unsigned char (*step_test_t)(void *track, int step);
typedef signed char (*step_cond_t)(void *track, int step);
typedef void (*set_step_cond_t)(void *track, int step, int condition);
typedef unsigned (*is_key_held_t)(int key);
typedef int (*shown_page_t)(void *selection);
typedef signed char (*euclid_mode_t)(void *track);
typedef signed char (*euclid_step_t)(void *track, int step);
typedef void (*hold_step_t)(void *editor, int step, int held);
typedef int (*next_condition_t)(int condition);

#define PRESSED_ONCE ((event_test_t)PRESSED_ONCE_AT)
#define KEY_ID ((key_id_t)KEY_ID_AT)
#define FUNC_FLAG ((event_test_t)FUNC_FLAG_AT)
#define EVENT_TAKEN ((event_taken_t)EVENT_TAKEN_AT)
#define VIEW_SHOWN ((view_test_t)VIEW_SHOWN_AT)
#define GRID_EDIT ((editor_test_t)GRID_EDIT_AT)
#define STEP_RECORDING ((editor_test_t)STEP_RECORDING_AT)
#define MARK_EDITED ((mark_edited_t)MARK_EDITED_AT)
#define CLEAR_RELEASE_ACTIONS ((clear_actions_t)CLEAR_RELEASE_ACTIONS_AT)
#define CURRENT_PATTERN ((object_part_t)CURRENT_PATTERN_AT)
#define ACTIVE_TRACK ((active_track_t)ACTIVE_TRACK_AT)
#define PATTERN_TRACK ((pattern_track_t)PATTERN_TRACK_AT)
#define HAS_TRIG ((step_test_t)HAS_TRIG_AT)
#define HAS_TRIGLESS ((step_test_t)HAS_TRIGLESS_AT)
#define STEP_COND ((step_cond_t)STEP_COND_AT)
#define SET_STEP_COND ((set_step_cond_t)SET_STEP_COND_AT)
#define IS_KEY_HELD ((is_key_held_t)IS_KEY_HELD_AT)
#define SHOWN_PAGE ((shown_page_t)SHOWN_PAGE_AT)
#define EUCLID_MODE ((euclid_mode_t)EUCLID_MODE_AT)
#define EUCLID_STEP ((euclid_step_t)EUCLID_STEP_AT)
#define HOLD_STEP ((hold_step_t)HOLD_STEP_AT)

#define FIELD(object, offset) (*(void **)((char *)(object) + (offset)))
#define WORD(object, offset) (*(word_t *)((char *)(object) + (offset)))

// Replaces the 6-byte test at the head of stock's FILL case, which runs on the
// press and the release. a2 is the view. A key we took leaves as handled.
//
// The second gate replaces the held-trig test at the head of the case UP, DOWN
// and RTRG share, with the editor on the stack and the event in d2. Anything
// not taken goes on to stock's test.
#define TEXT(x) #x
#define ADDRESS(x) TEXT(x)
__asm__(
    ".globl quick_fill_gate\n"
    "quick_fill_gate:\n"
    "    move.l %sp@(4),%sp@-\n"
    "    move.l %a2,%sp@-\n"
    "    jsr quick_fill_key\n"
    "    addq.l #8,%sp\n"
    "    moveq #2,%d1\n"
    "    cmp.l %d0,%d1\n"
    "    beq.s 1f\n"
    "    rts\n"
    "1:  moveq #1,%d3\n"
    "    jmp " ADDRESS(KEY_EVENT_EXIT_AT) "\n"
    ".globl quick_ratio_gate\n"
    "quick_ratio_gate:\n"
    "    move.l %d2,%sp@-\n"
    "    move.l %a2,%sp@-\n"
    "    jsr quick_ratio_key\n"
    "    addq.l #8,%sp\n"
    "    moveq #2,%d1\n"
    "    cmp.l %d0,%d1\n"
    "    beq.s 1f\n"
    "    jmp " ADDRESS(TRIG_HELD_AT) "\n"
    "1:  moveq #1,%d3\n"
    "    jmp " ADDRESS(KEY_EVENT_EXIT_AT) "\n");

// A popup leaves the pages on show and takes only NO.
static int page_shown(void *view)
{
    void *node = FIELD(FIELD(view, VIEW_MANAGER), MANAGER_LAST);
    word_t top;
    while (*(word_t *)FIELD(node, NODE_VIEW) == POPUP_VTABLE)
        node = FIELD(node, NODE_PREV);
    top = *(word_t *)FIELD(node, NODE_VIEW);
    return top == PAGES_TOP_VTABLE || top == PERF_VTABLE || top == SCENE_VTABLE
        || top == MUTE_VTABLE || top == CHROMATIC_VTABLE;
}

static int step_held(void *editor, int step)
{
    word_t mask = WORD(editor, step < 32 ? EDITOR_HELD_LOW : EDITOR_HELD_HIGH);
    return mask >> (step & 31) & 1;
}

// Euclidean mode's steps do not name their keys, so there only the written ones
// stay.
static void drop_stale_steps(void *editor, const word_t *kept, int euclid)
{
    int step;
    for (step = 0; step < STEPS; step++)
        if (step_held(editor, step) && !(kept[step >> 5] >> (step & 31) & 1)
            && (euclid || !IS_KEY_HELD(step & (TRIG_KEYS - 1))))
            HOLD_STEP(editor, step, 0);
}

static int next_fill(int condition)
{
    if (condition == COND_FILL)
        return COND_NOT_FILL;
    return condition == COND_NOT_FILL ? COND_NONE : COND_FILL;
}

// Stock numbers N:M as 28 + M(M-1)/2 + N, 30 (1:2) to 64 (8:8).
static int ratio(int n, int m)
{
    return 28 + m * (m - 1) / 2 + n;
}

static int ratio_m(int condition)
{
    int m;
    for (m = 2; m <= RATIO_MAX; m++)
        if (condition >= ratio(1, m) && condition <= ratio(m, m))
            return m;
    return 0;
}

// UP: the first number, back to 1 after M.
static int next_n(int condition)
{
    int m = ratio_m(condition);
    if (!m)
        return ratio(1, 2);
    return ratio((condition - ratio(0, m)) % m + 1, m);
}

// DOWN: the second number, keeping the first; past 8 the lock goes.
static int next_m(int condition)
{
    int m = ratio_m(condition);
    if (!m)
        return ratio(1, 2);
    if (m == RATIO_MAX)
        return COND_NONE;
    return ratio(condition - ratio(0, m), m + 1);
}

static int may_write(void *view, void *event)
{
    void *editor = FIELD(view, VIEW_EDITOR);
    return !FUNC_FLAG(event) && GRID_EDIT(editor) && !STEP_RECORDING(editor)
        && (WORD(editor, EDITOR_HELD_LOW) | WORD(editor, EDITOR_HELD_HIGH))
        && page_shown(view);
}

// Every held trig on the active track takes the step after the first one's
// condition. Without a next step it only tells whether there is such a trig.
static int write_held(void *view, next_condition_t next)
{
    void *editor = FIELD(view, VIEW_EDITOR);
    void *selection = FIELD(view, VIEW_SELECTION);
    void *track;
    word_t kept[2] = {0, 0};
    int key, step, first_step, euclid, condition = COND_UNSET;
    track = (void *)PATTERN_TRACK((void *)CURRENT_PATTERN(FIELD(view, VIEW_PATTERN)),
                                  ACTIVE_TRACK(selection));
    first_step = SHOWN_PAGE(selection) << 4;
    euclid = EUCLID_MODE(track) == 1;
    for (key = 0; key < TRIG_KEYS; key++) {
        if (!IS_KEY_HELD(key))
            continue;
        step = euclid ? EUCLID_STEP(track, first_step + key) : first_step + key;
        if (step < 0 || step >= STEPS || !step_held(editor, step)
            || !(HAS_TRIG(track, step) || HAS_TRIGLESS(track, step)))
            continue;
        if (!next)
            return 1;
        if (condition == COND_UNSET)
            condition = next(STEP_COND(track, step));
        SET_STEP_COND(track, step, condition);
        kept[step >> 5] |= 1u << (step & 31);
    }
    if (condition == COND_UNSET)
        return 0;
    drop_stale_steps(editor, kept, euclid);
    // As a lock edit: the trigs stay when their keys are released.
    MARK_EDITED(editor, 1);
    CLEAR_RELEASE_ACTIONS(editor);
    return 1;
}

unsigned quick_fill_key(void *view, void *event)
{
    unsigned pressed = PRESSED_ONCE(event) & 0xff;
    if (!pressed || !may_write(view, event) || !write_held(view, next_fill))
        return pressed;
    EVENT_TAKEN(event);
    return TOOK;
}

unsigned quick_ratio_key(void *view, void *event)
{
    int key = KEY_ID(event);
    void *retrig = FIELD(view, VIEW_RETRIG);
    if ((key != KEY_UP && key != KEY_DOWN) || !may_write(view, event)
        || (retrig && VIEW_SHOWN(retrig)))
        return 0;
    if (!(PRESSED_ONCE(event) & 0xff))
        return write_held(view, 0) ? TOOK : 0;
    if (!write_held(view, key == KEY_UP ? next_n : next_m))
        return 0;
    EVENT_TAKEN(event);
    return TOOK;
}
