// SPDX-License-Identifier: GPL-3.0-or-later
// Quick Fill Trig Condition for the Analog Rytm MKII: hold a trig and press FILL
// to lock the trig's condition: FILL, then NOT FILL, then no lock.
//
// A press with a trig held in GRID RECORDING writes every held trig and stock
// never sees it. Taking the event also takes FILL's release, which would
// otherwise end a fill latched with FUNC + FILL. Anything else stays stock's.
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

#define VIEW_PATTERN 104
#define VIEW_EDITOR 108
#define VIEW_SELECTION 116
#define VIEW_MANAGER 44
#define MANAGER_LAST 24             // view manager + 24: the top view's list node
#define NODE_PREV 4
#define NODE_VIEW 8
#define EDITOR_HELD_HIGH 344        // steps 32-63
#define EDITOR_HELD_LOW 348         // steps 0-31
#define TRIG_KEYS 16
#define STEPS 64
#define TOOK 2

#define COND_UNSET (-2)
#define COND_NONE (-1)
#define COND_FILL 22
#define COND_NOT_FILL 23

typedef unsigned word_t;

typedef unsigned char (*event_test_t)(void *event);
typedef void (*event_taken_t)(void *event);
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

#define PRESSED_ONCE ((event_test_t)PRESSED_ONCE_AT)
#define FUNC_FLAG ((event_test_t)FUNC_FLAG_AT)
#define EVENT_TAKEN ((event_taken_t)EVENT_TAKEN_AT)
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

static int next_condition(int condition)
{
    if (condition == COND_FILL)
        return COND_NOT_FILL;
    return condition == COND_NOT_FILL ? COND_NONE : COND_FILL;
}

unsigned quick_fill_key(void *view, void *event)
{
    unsigned pressed = PRESSED_ONCE(event) & 0xff;
    void *editor = FIELD(view, VIEW_EDITOR);
    void *selection = FIELD(view, VIEW_SELECTION);
    void *track;
    word_t kept[2] = {0, 0};
    int key, step, first_step, euclid, condition = COND_UNSET;
    if (!pressed || FUNC_FLAG(event) || !GRID_EDIT(editor) || STEP_RECORDING(editor)
        || !(WORD(editor, EDITOR_HELD_LOW) | WORD(editor, EDITOR_HELD_HIGH))
        || !page_shown(view))
        return pressed;
    track = (void *)PATTERN_TRACK((void *)CURRENT_PATTERN(FIELD(view, VIEW_PATTERN)),
                                  ACTIVE_TRACK(selection));
    first_step = SHOWN_PAGE(selection) << 4;
    euclid = EUCLID_MODE(track) == 1;
    // Every held trig takes the step after the first one's condition.
    for (key = 0; key < TRIG_KEYS; key++) {
        if (!IS_KEY_HELD(key))
            continue;
        step = euclid ? EUCLID_STEP(track, first_step + key) : first_step + key;
        if (step < 0 || step >= STEPS || !step_held(editor, step)
            || !(HAS_TRIG(track, step) || HAS_TRIGLESS(track, step)))
            continue;
        if (condition == COND_UNSET)
            condition = next_condition(STEP_COND(track, step));
        SET_STEP_COND(track, step, condition);
        kept[step >> 5] |= 1u << (step & 31);
    }
    if (condition == COND_UNSET)
        return pressed;
    EVENT_TAKEN(event);
    drop_stale_steps(editor, kept, euclid);
    // As a lock edit: the trigs stay when their keys are released.
    MARK_EDITED(editor, 1);
    CLEAR_RELEASE_ACTIONS(editor);
    return TOOK;
}
