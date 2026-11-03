// SPDX-License-Identifier: GPL-3.0-or-later
// Quick Mod Assign for the Analog Rytm MKII: link a parameter to velocity or
// aftertouch by holding a key and turning its knob.
//
//   FIX + turn a knob    links that parameter to velocity; the turn sets the
//                        amount (-128..127), continuing from the slot's amount.
//   RTRG + turn a knob   the same for aftertouch, unless a pad was played
//                        during this hold: then the knobs stay stock, so pad
//                        retrigs and a knob tweak still go together.
//
// Each sound has stock's four velocity and four aftertouch slots (SOUND
// SETTINGS, VELOCITY MOD and AFTERTOUCH). A parameter already in a slot keeps
// it; otherwise it takes the first slot with no destination or an amount of 0.
// With all four in use a popup says SLOTS FULL and nothing changes. The module
// writes stock's slots through stock's own writers and stores nothing itself.
//
// FIX pressed and released with no turn toggles fixed velocity as stock does,
// on the release. FUNC + FIX, a held trig, the TRIG page and the FX track stay
// stock. The turn reaches us through core-ar2's core_params table, ahead of
// stock's edit; taking it leaves the parameter's own value alone.
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

#define KEY_FIX 0xb3
#define KEY_RTRG 0x85
#define KEY_FUNC 0x80
#define KEY_PAD_FIRST 0x90          // BD .. CB
#define KEY_PAD_LAST 0x9b
#define TRIG_KEYS 16                // trig keys 0..15
#define EV_KEY 12                   // event + 12: the key
#define EV_FLAGS 16                 // event + 16: bit 0 down (clear on release), 8 repeat
#define PRESSED 1
#define REPEAT 8
#define BRAIN_VIEWS 32              // brain + 32: the view manager
#define MANAGER_LAST 24             // view manager + 24: the top view's list node
#define NODE_PREV 4
#define NODE_VIEW 8
#define POPUP_BYTES 0xa0
#define FX_TRACK 12
#define STEP 256                    // one amount step in 8.8
#define AMOUNT_MIN (-128 * STEP)
#define AMOUNT_MAX (127 * STEP)

enum { VEL, AT };

static int fix_held;                // FIX is down and its press was ours
static int rtrg_held;               // RTRG is down
static int rtrg_pads;               // a pad was played during this RTRG hold
static int turned;                  // a turn was ours during this FIX hold
static void *views;
static char message[24];
static int pending;                 // a popup for ev_tick
static int wait;                    // ticks until the next popup may open
#define POPUP_TICKS 4               // at most one popup in four ticks (about 200 ms)

// What is on screen: the top view's class, past the popups, which pass keys on.
static word_t top_view(void)
{
    char *node = *(char **)((char *)views + MANAGER_LAST);
    for (;;) {
        word_t vtable = **(word_t **)(node + NODE_VIEW);
        if (vtable != POPUP_VTABLE)
            return vtable;
        node = *(char **)(node + NODE_PREV);
    }
}

static int on_pages(void)
{
    word_t top;
    if (!views)
        return 0;
    top = top_view();
    return top == PAGES_TOP_VTABLE || top == PERF_VTABLE || top == SCENE_VTABLE
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

static int any_trig_held(void)
{
    int k;
    for (k = 0; k < TRIG_KEYS; k++)
        if (IS_KEY_HELD(k))
            return 1;
    return 0;
}

static int any_pad_held(void)
{
    int k;
    for (k = KEY_PAD_FIRST; k <= KEY_PAD_LAST; k++)
        if (IS_KEY_HELD(k))
            return 1;
    return 0;
}

static void append(char **p, const char *text)
{
    while (*text && *p < message + sizeof message - 1)
        *(*p)++ = *text++;
}

static void show_amount(int kind, int id, int amount)
{
    char digits[5], *p = message;
    int n = amount / STEP, i = 0;
    append(&p, kind == VEL ? "VEL " : "AT ");
    append(&p, *(const char *const *)(row(id) + ROW_SHORT));
    append(&p, n < 0 ? " -" : " +");
    if (n < 0)
        n = -n;
    do {
        digits[i++] = (char)('0' + n % 10);
        n /= 10;
    } while (n);
    while (i)
        *p++ = digits[--i];
    *p = 0;
    pending = 1;
}

static void show(const char *text)
{
    char *p = message;
    append(&p, text);
    *p = 0;
    pending = 1;
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

// core_params' delta: 1 takes the turn (no stock edit, no lock), 0 passes.
static int qma_delta(void *view, int32_t id, int32_t delta, int32_t func)
{
    word_t project, kit, sound, conf, set;
    int kind, track, index, logical, slot, amount, steps;
    (void)view;
    if (fix_held)
        kind = VEL;
    else if (rtrg_held && !rtrg_pads) {
        if (any_pad_held()) {
            rtrg_pads = 1;
            return 0;
        }
        kind = AT;
    } else
        return 0;
    if (func || !delta || id < 0 || id >= PARAM_ROWS || any_trig_held()
        || row_word(id, ROW_CATEGORY) == CATEGORY_TRIG)
        return 0;
    project = PROJECT();
    track = SELECTED_TRACK(PROJECT_SEQ(project));
    if (track < 0 || track >= FX_TRACK)
        return 0;
    if (kind == VEL)
        turned = 1;
    kit = PROJECT_KIT(project);
    index = row_word(id, ROW_INDEX);
    logical = index > 0 ? SOUND_ID_OF(KIT_PARAM_SET(kit, track), index) : 0;
    if (logical <= 0 || !(PARAM_FLAGS(logical) & FLAG_MOD_DEST)) {
        show(kind == VEL ? "NOT A VEL DESTINATION" : "NOT AN AT DESTINATION");
        return 1;
    }
    sound = KIT_TRACK(kit, track);
    if (kind == VEL) {
        conf = TRACK_VEL_CONF(sound);
        set = conf + VEL_SET;
    } else {
        conf = TRACK_AT_CONF(sound);
        set = conf + AT_SET;
    }
    slot = find_slot(set, index);
    if (slot < 0) {
        show(kind == VEL ? "VEL SLOTS FULL" : "AT SLOTS FULL");
        return 1;
    }
    if (SET_DEST(set, slot) != index) {
        SET_WRITE_AMOUNT(set, slot, 0);
        SET_WRITE_DEST(set, slot, logical);
    }
    // The delta comes scaled to the parameter's own resolution (a fine knob
    // such as TUN turns in fractions), so each event is at least one step,
    // and a fast turn as many as the parameter would move.
    steps = (delta < 0 ? -delta : delta) / STEP;
    if (!steps)
        steps = 1;
    if (delta < 0)
        steps = -steps;
    amount = SET_AMOUNT(set, slot) + steps * STEP;
    if (amount < AMOUNT_MIN)
        amount = AMOUNT_MIN;
    if (amount > AMOUNT_MAX)
        amount = AMOUNT_MAX;
    if (steps)
        SET_WRITE_AMOUNT(set, slot, amount);
    show_amount(kind, id, SET_AMOUNT(set, slot));
    return 1;
}

const struct {
    int32_t first, last;
    void *get;
    int (*delta)(void *view, int32_t id, int32_t delta, int32_t func);
    void *text;
} quick_mod_assign_params = { 0, PARAM_ROWS - 1, 0, qma_delta, 0 };

int quick_mod_assign_key(void *brain, void *event)
{
    int key = *(int *)((char *)event + EV_KEY);
    unsigned flags = *(unsigned *)((char *)event + EV_FLAGS);
    int down = flags & PRESSED;
    views = *(void **)((char *)brain + BRAIN_VIEWS);
    if (key == KEY_FIX) {
        if (!down) {
            if (!fix_held)
                return 0;
            fix_held = 0;
            if (!turned) {              // a plain tap: stock's toggle, on the release
                word_t seq = PROJECT_SEQ(PROJECT());
                FIXED_VEL_SET(seq, !FIXED_VEL_GET(seq));
            }
            return 1;
        }
        if (fix_held)
            return 1;                   // its repeats
        if ((flags & REPEAT) || IS_KEY_HELD(KEY_FUNC) || !on_pages())
            return 0;
        fix_held = 1;
        turned = 0;
        return 1;
    }
    if (key == KEY_RTRG) {
        if (!down) {
            rtrg_held = 0;
        } else if (!(flags & REPEAT) && !rtrg_held) {
            rtrg_held = 1;
            rtrg_pads = 0;
        }
        return 0;
    }
    if (key >= KEY_PAD_FIRST && key <= KEY_PAD_LAST && down && rtrg_held)
        rtrg_pads = 1;
    return 0;
}

// Stock's popup, opened from ev_tick so a fast turn opens one, not dozens.
void quick_mod_assign_tick(void *ctrl)
{
    word_t string;
    char allocator;
    struct { void *object; void *counts; } shared;
    void *popup;
    (void)ctrl;
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
