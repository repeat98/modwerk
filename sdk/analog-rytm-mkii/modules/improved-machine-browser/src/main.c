// SPDX-License-Identifier: GPL-3.0-or-later
// Improved Machine Browser for the Analog Rytm MKII: browse the machine list
// without loading, and jump between its sections.
//
//   UP, DOWN, knobs A-H     move the outline one machine; nothing loads.
//   FUNC + DOWN             the first machine of the next section.
//   FUNC + UP               the first machine of this section, or of the one
//                           above when the outline is already there.
//   FUNC + knob A-H         as FUNC + DOWN (right) or FUNC + UP (left).
//   YES                     loads the outlined machine, then stock confirms
//                           and closes the list.
//   NO                      stock: closes the list; nothing was loaded.
//
// Stock loads each machine as the outline reaches it, so the voice and the
// SRC page change while you scroll. Here the outline moves through stock's
// own routine (it shows Confirm? Y/N, as stock does), and only YES loads, with
// the call stock's own step makes. A section is what stock draws between its
// dotted lines: the list's items with the value -1.
//
// Firmware routines are reached at fixed addresses given for each OS release
// by ar2-1.74.h. Stock returns pointers in d0, while m68k-linux GCC expects
// them in a0, so those routines are declared as returning a word.

#include "ar2-1.74.h"

typedef unsigned long word_t;
typedef word_t (*word1_t)(word_t a);
typedef word_t (*word2_t)(word_t a, word_t b);
typedef void (*show_machine_t)(word_t view, word_t machine);
typedef word_t (*set_machine_t)(word_t sound, word_t machine, word_t track, int notify);
typedef word_t (*knob_steps_t)(word_t state, word_t encoder, word_t count, word_t table, word_t pushed);

#define KEY_ID ((word1_t)KEY_ID_AT)
#define KEY_DOWN ((word1_t)KEY_DOWN_AT)
#define KEY_CLICK ((word1_t)KEY_CLICK_AT)
#define KEY_FUNC_FLAG ((word1_t)KEY_FUNC_AT)
#define SHOW_MACHINE ((show_machine_t)SHOW_MACHINE_AT)
#define KIT_TRACK ((word2_t)KIT_TRACK_AT)
#define SOUND_MACHINE ((word1_t)SOUND_MACHINE_AT)
#define SET_MACHINE ((set_machine_t)SET_MACHINE_AT)
#define KNOB_STEPS ((knob_steps_t)KNOB_STEPS_AT)
#define IS_KEY_HELD ((word1_t)IS_KEY_HELD_AT)

#define KEY_UP 0x42
#define KEY_DOWN_ARROW 0x43
#define KEY_YES 0x44
#define BRAIN_VIEWS 32              // brain + 32: the view manager
#define MANAGER_LIST 20             // view manager + 20: its list's sentinel node
#define MANAGER_LAST 24             // view manager + 24: the top view's list node
#define NODE_PREV 4
#define NODE_VIEW 8
#define EV_ENCODER 12               // encoder event + 12: the encoder, 0-7 for A-H
#define EV_COUNT 16                 // + 16: the count after acceleration, signed
#define EV_PUSHED 20                // + 20: a byte, the knob's button held while it turns
#define KNOBS 8
#define DIVIDER ((word_t)-1)

#define WORD(p, off) (*(word_t *)((char *)(p) + (off)))

// The machine list when it is the screen on top, past the popups (they pass
// these keys on), or 0.
static word_t machine_list(void *brain)
{
    char *views = (char *)WORD(brain, BRAIN_VIEWS);
    char *sentinel, *node;
    if (!views)
        return 0;
    sentinel = views + MANAGER_LIST;
    node = (char *)WORD(views, MANAGER_LAST);
    while (node && node != sentinel) {
        word_t view = WORD(node, NODE_VIEW);
        word_t vtable = view ? WORD(view, 0) : 0;
        if (vtable == MACHINE_LIST_VTABLE)
            return view;
        if (vtable != POPUP_VTABLE)
            return 0;
        node = (char *)WORD(node, NODE_PREV);
    }
    return 0;
}

// The list's items: count, and item i's value (a machine, or DIVIDER).
static int item_count(word_t view)
{
    word_t list = view + VIEW_LIST;
    return (int)((WORD(list, LIST_END) - WORD(list, LIST_BEGIN)) >> 3);
}

static word_t item_value(word_t view, int i)
{
    word_t item = WORD(WORD(view + VIEW_LIST, LIST_BEGIN), i * 8);
    return item ? WORD(item, ITEM_VALUE) : DIVIDER;
}

// The next machine from i in direction dir, or i at the list's end.
static int step(word_t view, int n, int i, int dir)
{
    int j;
    for (j = i + dir; j >= 0 && j < n; j += dir)
        if (item_value(view, j) != DIVIDER)
            return j;
    return i;
}

// The first machine of the section holding machine i.
static int section_start(word_t view, int i)
{
    while (i > 0 && item_value(view, i - 1) != DIVIDER)
        i--;
    return i;
}

static int jump(word_t view, int n, int i, int dir)
{
    int j, k;
    if (dir > 0) {
        for (j = i + 1; j < n; j++)
            if (item_value(view, j) == DIVIDER) {
                k = step(view, n, j, 1);
                return k == j ? i : k;  // no machine after the line: stay
            }
        return i;                       // the last section: stay
    }
    j = section_start(view, i);
    if (j < i)
        return j;
    j = step(view, n, j, -1);           // the section above's last machine, or j itself
    return section_start(view, j);
}

// Move the outline: one machine, or a section with FUNC. Nothing loads.
static void browse(word_t view, int dir, int func)
{
    int n = item_count(view), i, j;
    word_t shown = WORD(view, VIEW_SHOWN);
    for (i = 0; i < n; i++)
        if (item_value(view, i) == shown)
            break;
    if (i == n)
        return;                         // the outline is on no machine: leave it
    j = func ? jump(view, n, i, dir) : step(view, n, i, dir);
    if (j != i)
        SHOW_MACHINE(view, item_value(view, j));
}

// The list has its step function: always on OS 1.74, which sets it right
// after building the list. Without one stock passes the arrows and knobs on.
static int browsable(word_t view)
{
    return WORD(view, VIEW_STEP_FN + FN_MANAGER) != 0;
}

// YES: load the outlined machine as stock's step does, once, before stock's
// own YES confirms and closes the list. Only while the track still has the
// machine the list opened with: if a kit load or program change replaced it
// meanwhile, the new kit is left as it came.
static void load_shown(word_t view)
{
    word_t functor, track, page, sound, shown = WORD(view, VIEW_SHOWN);
    if (!browsable(view) || shown == DIVIDER)
        return;
    functor = WORD(view, VIEW_STEP_FN);
    track = WORD(functor, FUNCTOR_TRACK);
    page = WORD(functor, FUNCTOR_PAGE);
    sound = KIT_TRACK(WORD(page, PAGE_KIT), track);
    if (SOUND_MACHINE(sound) == WORD(view, VIEW_OPENED) && shown != WORD(view, VIEW_OPENED))
        SET_MACHINE(sound, shown, track, 1);
}

int improved_machine_browser_key(void *brain, void *event)
{
    word_t view = machine_list(brain), key = KEY_ID((word_t)event);
    if (!view)
        return 0;
    if ((key == KEY_UP || key == KEY_DOWN_ARROW) && browsable(view)) {
        // Stock acts while the key is down, repeats too, and takes the
        // release: so does this.
        if (KEY_DOWN((word_t)event) & 1)
            browse(view, key == KEY_UP ? -1 : 1, (int)(KEY_FUNC_FLAG((word_t)event) & 1));
        return 1;
    }
    if (key == KEY_YES && (KEY_CLICK((word_t)event) & 1))
        load_shown(view);               // then stock's YES runs as ever
    return 0;
}

int improved_machine_browser_enc(void *brain, void *event)
{
    word_t view = machine_list(brain), encoder;
    int pushed, steps;
    if (!view || (encoder = WORD(event, EV_ENCODER)) >= KNOBS)
        return 0;
    if (!browsable(view))
        return 1;                       // stock takes the turn and does nothing
    // Stock's own accumulator, as its knob routine calls it, so a turn moves
    // the outline as often as stock's would load: one step per result, by sign.
    // A section jump takes FUNC held, read from the keys as stock's sound
    // pages read it for their FUNC turns.
    pushed = *((unsigned char *)event + EV_PUSHED) != 0;
    steps = (int)KNOB_STEPS(view + VIEW_KNOB_STATE, encoder,
                            (word_t)((int)WORD(event, EV_COUNT) * (pushed ? PUSHED_SCALE : 1)),
                            KNOB_TABLE, (word_t)pushed);
    if (steps)
        browse(view, steps < 0 ? -1 : 1, IS_KEY_HELD(KEY_FUNC) != 0);
    return 1;
}
