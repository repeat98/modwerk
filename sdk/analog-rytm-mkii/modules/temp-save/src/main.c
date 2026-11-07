// SPDX-License-Identifier: GPL-3.0-or-later
// Temp Save for the Analog Rytm MKII: FUNC + YES saves the pattern and its
// kit, FUNC + NO reloads both, with stock's own routines.
//
// The sites sit in the views' own YES and NO cases, not in ev_key, so a screen
// that takes YES or NO itself keeps it: this code only runs for a key the
// views above let through. Parameter pages take FUNC + NO before the main view
// does, so NO has a site in each. That page case erases the active track's
// locks in LIVE RECORDING, which stays stock, and a held trig leaves both keys
// to stock.
//
// Stock's saved pattern is one buffer, which every pattern change refills, and
// stock's kit reload reads the kit the pattern links. So a save belongs to its
// pattern and its kit: changing either or loading a project drops it, and
// FUNC + NO without one changes nothing.

#include "ar2-1.74.h"

#define KEY_FUNC 0x80
#define TOOK 2                      // not stock's true or false: we took the key
#define VIEW_MANAGER 44             // view + 44: the view manager
#define MANAGER_LAST 24             // view manager + 24: the top view's list node
#define NODE_VIEW 8                 // list node + 8: its view
#define PROJECT_KIT 352             // project + 352: the active kit
#define TRIG_KEYS 16                // the trig keys are keys 0 to 15
#define VT_INDEX 108                // kit: index(kit)
#define POPUP_BYTES 0xa0
#define VT_POPUP_TAKES_NO 84         // popup: takes_no(popup, on)

typedef unsigned word_t;

typedef unsigned char (*event_test_t)(void *event);
typedef void (*event_taken_t)(void *event);
typedef unsigned (*is_key_held_t)(int key);
typedef word_t (*singleton_t)(void);
typedef unsigned char (*live_rec_t)(void *app);
typedef int (*pattern_index_t)(void *patterns);
typedef void (*pattern_save_t)(void *project, int pattern);
typedef void (*project_op_t)(void *project);
typedef void (*kit_save_t)(void *project, int kit, const char *name);
typedef int (*kit_index_t)(void *kit);
typedef word_t (*object_part_t)(void *object);
typedef int (*kit_link_t)(void *pattern_kit);
typedef void (*string_from_cstr_t)(void *string, const char *text, void *allocator);
typedef void (*string_dtor_t)(void *string);
typedef word_t (*mem_new_t)(unsigned size);
typedef void (*popup_ctor_t)(void *popup, void *string);
typedef void (*popup_takes_no_t)(void *popup, int on);
typedef void (*shared_ptr_ctor_t)(void *shared, void *object);
typedef void (*shared_ptr_release_t)(void *counts);
typedef void (*show_popup_t)(void *views, void *shared, int flag);

#define PRESSED_ONCE ((event_test_t)PRESSED_ONCE_AT)
#define FUNC_FLAG ((event_test_t)FUNC_FLAG_AT)
#define EVENT_TAKEN ((event_taken_t)EVENT_TAKEN_AT)
#define IS_KEY_HELD ((is_key_held_t)IS_KEY_HELD_AT)
#define PROJECT_SINGLETON ((singleton_t)PROJECT_SINGLETON_AT)
#define APP_SINGLETON ((singleton_t)APP_SINGLETON_AT)
#define LIVE_REC ((live_rec_t)LIVE_REC_AT)
#define PATTERN_SELECTION ((singleton_t)PATTERN_SELECTION_AT)
#define PATTERN_INDEX ((pattern_index_t)PATTERN_INDEX_AT)
#define PATTERN_SAVE ((pattern_save_t)PATTERN_SAVE_AT)
#define PATTERN_RELOAD ((project_op_t)PATTERN_RELOAD_AT)
#define KIT_SAVE ((kit_save_t)KIT_SAVE_AT)
#define KIT_RELOAD ((project_op_t)KIT_RELOAD_AT)
#define CURRENT_PATTERN ((object_part_t)CURRENT_PATTERN_AT)
#define PATTERN_KIT ((object_part_t)PATTERN_KIT_AT)
#define KIT_LINK ((kit_link_t)KIT_LINK_AT)
#define STRING_FROM_CSTR ((string_from_cstr_t)STRING_FROM_CSTR_AT)
#define STRING_DTOR ((string_dtor_t)STRING_DTOR_AT)
#define MEM_NEW ((mem_new_t)MEM_NEW_AT)
#define POPUP_CTOR ((popup_ctor_t)POPUP_CTOR_AT)
#define SHARED_PTR_CTOR ((shared_ptr_ctor_t)SHARED_PTR_CTOR_AT)
#define SHARED_PTR_RELEASE ((shared_ptr_release_t)SHARED_PTR_RELEASE_AT)
#define SHOW_POPUP ((show_popup_t)SHOW_POPUP_AT)

#define FIELD(object, offset) (*(void **)((char *)(object) + (offset)))

static int saved;                   // the temp-saved pattern + 1, 0 for none
static int saved_kit;

// Each replaces a 6-byte call to one of stock's event tests. a2 is the view.
// A key we took leaves the event handler as handled.
#define TEXT(x) #x
#define ADDRESS(x) TEXT(x)
#define GATE(name, handler, leave)          \
    ".globl " #name "\n"                    \
    #name ":\n"                             \
    "    move.l %sp@(4),%sp@-\n"            \
    "    move.l %a2,%sp@-\n"                \
    "    jsr " #handler "\n"                \
    "    addq.l #8,%sp\n"                   \
    "    moveq #2,%d1\n"                    \
    "    cmp.l %d0,%d1\n"                   \
    "    beq.s 1f\n"                        \
    "    rts\n"                             \
    "1:  moveq #1,%d3\n"                    \
    "    jmp " ADDRESS(leave) "\n"
__asm__(GATE(temp_save_yes, temp_save_yes_key, KEY_EVENT_EXIT_AT));
__asm__(GATE(temp_save_no, temp_save_no_key, KEY_EVENT_EXIT_AT));
__asm__(GATE(temp_save_page_no, temp_save_page_no_key, PAGE_EVENT_EXIT_AT));

static void show(void *view, const char *text)
{
    word_t string;
    char allocator;
    struct { void *object; void *counts; } shared;
    void *popup;
    STRING_FROM_CSTR(&string, text, &allocator);
    popup = (void *)MEM_NEW(POPUP_BYTES);
    POPUP_CTOR(popup, &string);
    // As stock's reload messages: NO reaches the views below.
    ((popup_takes_no_t)FIELD(*(void **)popup, VT_POPUP_TAKES_NO))(popup, 0);
    SHARED_PTR_CTOR(&shared, popup);
    SHOW_POPUP(FIELD(view, VIEW_MANAGER), &shared, 0);
    SHARED_PTR_RELEASE(&shared.counts);
    STRING_DTOR(&string);
}

static int current_pattern(void)
{
    return PATTERN_INDEX((void *)PATTERN_SELECTION());
}

static int active_kit(void *project)
{
    void *kit = (char *)project + PROJECT_KIT;
    return ((kit_index_t)FIELD(*(void **)kit, VT_INDEX))(kit);
}

// The kit stock's reload reads: the pattern's, else the active one.
static int reload_kit(void *project)
{
    int link = KIT_LINK((void *)PATTERN_KIT((void *)CURRENT_PATTERN(project)));
    return link < 0 ? active_kit(project) : link;
}

static int save_holds(void *project)
{
    return saved == current_pattern() + 1
        && active_kit(project) == saved_kit && reload_kit(project) == saved_kit;
}

// The RECORDER leaves FUNC + NO to the views below it.
static int on_recorder(void *view)
{
    void *top = FIELD(FIELD(FIELD(view, VIEW_MANAGER), MANAGER_LAST), NODE_VIEW);
    return *(word_t *)top == RECORDER_VTABLE;
}

static int ours(void *view)
{
    int key;
    if (!IS_KEY_HELD(KEY_FUNC) || on_recorder(view))
        return 0;
    for (key = 0; key < TRIG_KEYS; key++)
        if (IS_KEY_HELD(key))
            return 0;
    return 1;
}

// Stock's sound pages erase locks with FUNC + NO in LIVE RECORDING.
static int ours_no(void *view)
{
    return ours(view) && !LIVE_REC((void *)APP_SINGLETON());
}

// The pattern first: a reloaded pattern can name another kit, and the kit
// reload follows the pattern's.
static unsigned reload(void *view, void *event)
{
    void *project = (void *)PROJECT_SINGLETON();
    EVENT_TAKEN(event);
    if (!saved || !save_holds(project)) {
        show(view, "NO TEMP SAVE");
        return TOOK;
    }
    PATTERN_RELOAD(project);
    KIT_RELOAD(project);
    show(view, "RELOADED");
    return TOOK;
}

unsigned temp_save_yes_key(void *view, void *event)
{
    unsigned pressed = PRESSED_ONCE(event) & 0xff;
    void *project;
    int pattern, kit;
    if (!pressed || !ours(view))
        return pressed;
    EVENT_TAKEN(event);
    project = (void *)PROJECT_SINGLETON();
    kit = active_kit(project);
    if (reload_kit(project) != kit) {   // a reload would read another kit
        saved = 0;
        show(view, "KIT NOT LINKED");
        return TOOK;
    }
    pattern = current_pattern();
    PATTERN_SAVE(project, pattern);
    KIT_SAVE(project, kit, 0);
    saved = pattern + 1;
    saved_kit = kit;
    show(view, "TEMP SAVED");
    return TOOK;
}

unsigned temp_save_no_key(void *view, void *event)
{
    unsigned pressed = PRESSED_ONCE(event) & 0xff;
    if (!pressed || !ours_no(view))
        return pressed;
    return reload(view, event);
}

unsigned temp_save_page_no_key(void *view, void *event)
{
    unsigned func = FUNC_FLAG(event) & 0xff;
    if (!func || !(PRESSED_ONCE(event) & 0xff) || !ours_no(view))
        return func;
    return reload(view, event);
}

void temp_save_tick(void *ctrl)
{
    (void)ctrl;
    if (saved && !save_holds((void *)PROJECT_SINGLETON()))
        saved = 0;
}

void temp_save_project(int how, unsigned dropped)
{
    (void)how;
    (void)dropped;
    saved = 0;
}
