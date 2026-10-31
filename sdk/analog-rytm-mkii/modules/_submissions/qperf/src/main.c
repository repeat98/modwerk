// SPDX-License-Identifier: GPL-3.0-or-later
// QPERF for the Analog Rytm MKII: set performance locks from the QPER key.
//
// Stock lets QPER link several performances, which add up. Here it links one:
// with QPER held, a pad or trig moves the link to that performance, and the
// linked one unlinks it. So, with QPER held:
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
// Stock's amount is only written to performances linked when the knob moves, so
// the knob's position comes from one site of our own, where stock reads it, and
// a moved link hands the amount over.
//
// Firmware routines are reached at fixed addresses given for each OS release
// by ar2-1.74.h. Stock returns pointers in d0, while m68k-linux GCC
// expects them in a0, so those routines are declared as returning a word.

#include "ar2-1.74.h"

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
#define KEY_PAD 0x90
#define KEY_FUNC 0x80
#define EV_KEY 12                   // event + 12: the key
#define EV_FLAGS 16                 // event + 16: bit 0 down (clear on release), 8 repeat
#define PRESSED 1
#define REPEAT 8
#define UNDO_CLEAR 1                // what stock's undo reverses
#define UNDO_PASTE 2
#define BRAIN_VIEWS 32              // brain + 32: the view manager
#define POPUP_BYTES 0xa0

#define PERFS 12
#define SLOTS 48
#define SLOT_BYTES 5
#define TRACK_NONE 12               // a slot's track byte above this is empty
#define FX_TRACK 12

typedef unsigned (*is_key_held_t)(int key);
#define IS_KEY_HELD ((is_key_held_t)IS_KEY_HELD_AT)

static int held;                    // QPER is down, without FUNC
static unsigned swallowed;          // YES, PLAY, REC and STOP: their release is ours too
static unsigned known;              // the link as we last set or saw it
static int ready;                   // a project is loaded
static int kit_changed;             // stock changed the whole kit
int qperf_pot;                      // the QPER knob + 1, 0 until it first moves

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

// Stock's popup, opened from ev_tick so repeats open one, not dozens.
static void *views;
static const char *show_text;
static char message[24];

static void show(const char *text)
{
    show_text = text;
}

static void *active_kit(void)
{
    return (char *)PROJECT_SINGLETON() + PROJECT_KIT;
}

static unsigned linked(void *kit)
{
    return (unsigned)KIT_QPER_MASK(kit) & 0xfff;
}

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

static int slots_free(const unsigned char *t)
{
    int i, free_slots = 0;
    for (i = 0; i < SLOTS; i++, t += SLOT_BYTES)
        if (t[2] > TRACK_NONE)
            free_slots++;
    return free_slots;
}

// A sound parameter's id on this track: machine parameters have one per machine.
static int track_id(void *set, int param)
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

static int param_id(void *set, int track, int param)
{
    return track == FX_TRACK ? FX_ID(param) : track_id(set, param);
}

static int param_read(void *set, int id)
{
    return (*(set_read_t *)(*(word_t *)set + VT_READ))(set, id);
}

// The linked performance's lock on (track, param), 0 for none.
static const unsigned char *find_lock(void *kit, int track, int param)
{
    const unsigned char *t = lock_table((void *)KIT_PERF(kit));
    unsigned mask = linked(kit);
    int i;
    for (i = 0; i < SLOTS; i++, t += SLOT_BYTES)
        if (t[2] == track && t[3] == param && t[4] < PERFS && (mask >> t[4] & 1))
            return t;
    return 0;
}

// The locker stock edits through while QPER is held. Stock calls these slots.
static int locker_has_any(void *self)
{
    void *kit = active_kit();
    const unsigned char *t = lock_table((void *)KIT_PERF(kit));
    unsigned mask = linked(kit);
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
    unsigned mask = linked(kit);
    (void)self;
    if (mask)
        PERF_CLEAR_ONE((void *)KIT_PERF(kit), lowest_linked(mask), track, param);
}

static void locker_clear_all(void *self)
{
    void *kit = active_kit();
    unsigned mask = linked(kit);
    (void)self;
    if (mask)
        PERF_CLEAR((void *)KIT_PERF(kit), lowest_linked(mask));
}

static void locker_set(void *self, int track, int param, int value)
{
    void *kit = active_kit();
    void *perf = (void *)KIT_PERF(kit);
    unsigned mask = linked(kit);
    (void)self;
    if (!mask) {
        show("NO PERFORMANCE LINKED");
        return;
    }
    if (!find_lock(kit, track, param) && !slots_free(lock_table(perf))) {
        show("LOCK MEM FULL!");
        return;
    }
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

static void locker_install(void)
{
    void *ui = (void *)PARAM_UI();
    if (GET_LOCKER(ui))
        return;                         // a performance or scene pad holds it: stock's
    SET_LOCKER(ui, &locker);
    LOCK_EDIT(ui, 1);
}

static void locker_remove(void)
{
    void *ui = (void *)PARAM_UI();
    if (GET_LOCKER(ui) == (word_t)&locker)
        END_LOCK_EDIT(ui);
}

// A message with the linked performance's number in it.
static void show_numbered(const char *before, unsigned mask, const char *after)
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

// Links one performance, or none. An unlinked one stops adding, and the new one
// takes over at the knob's position.
static void link_only(void *kit, unsigned mask)
{
    word_t project = PROJECT_SINGLETON();
    unsigned old = known;
    int i, amount = qperf_pot ? (qperf_pot - 1) << 7 : old ? (int)PERF_AMOUNT(lowest_linked(old)) : 0;
    if (linked(kit) != mask)
        KIT_SET_MASK(kit, (int)mask);
    for (i = 0; i < PERFS; i++)
        if ((old & ~mask) >> i & 1)
            AMOUNT_SET(project, i, 0, 1, 1);
    if (mask & ~old)
        AMOUNT_SET(project, lowest_linked(mask), amount, 1, 1);
    known = mask;
}

static void apply_linked(void *kit)
{
    void *perf = (void *)KIT_PERF(kit);
    const unsigned char *t = lock_table(perf);
    unsigned mask = linked(kit);
    int i, changed = 0;
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
        SET_VALUE(set, id, param_read(set, id) + value, track, 1, 1);
        PERF_CLEAR_ONE(perf, index, track, param);
        changed = 1;
    }
    if (changed)
        show_numbered("PERFORMANCE ", mask, " APPLIED");
    else
        show("NOTHING TO APPLY");
}

// As stock's own menu rows do: undo if there is one, then the action.
static void clear_linked(void *perf, int index)
{
    if (PERF_UNDO(perf, index, UNDO_CLEAR))
        show("UNDO CLEAR");
    else if (PERF_CLEAR_KEEP(perf, index, 1))
        show("CLEAR PERFORMANCE");
    else
        show("NOTHING TO CLEAR");
}

static void paste_linked(void *perf, int index)
{
    if (PERF_UNDO(perf, index, UNDO_PASTE))
        show("UNDO PASTE");
    else if (PERF_PASTE(perf, index, 1))
        show("PASTE PERFORMANCE");
    else
        show("NOTHING TO PASTE");
}

static void perf_action(int key)
{
    void *kit = active_kit();
    void *perf = (void *)KIT_PERF(kit);
    unsigned mask = linked(kit);
    int index;
    if (key == KEY_YES) {
        apply_linked(kit);
        return;
    }
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

// A pad or trig key's performance, or -1.
static int link_key(int key)
{
    if (key >= 0 && key < PERFS)
        return key;
    if (key >= KEY_PAD && key < KEY_PAD + PERFS)
        return key - KEY_PAD;
    return -1;
}

int qperf_key(void *brain, void *event)
{
    int key = *(int *)((char *)event + EV_KEY);
    unsigned flags = *(unsigned *)((char *)event + EV_FLAGS), bit;
    int perf;
    views = *(void **)((char *)brain + BRAIN_VIEWS);
    if (key == KEY_QPER) {
        if (!(flags & PRESSED)) {
            if (held)
                locker_remove();
            held = 0;
        } else if (!(flags & REPEAT) && !IS_KEY_HELD(KEY_FUNC)) {
            held = 1;
            swallowed = 0;
            locker_install();
        }
        return 0;
    }
    perf = link_key(key);
    if (held && perf >= 0) {
        if ((flags & PRESSED) && !(flags & REPEAT)) {
            void *kit = active_kit();
            unsigned one = 1u << perf;
            link_only(kit, linked(kit) == one ? 0 : one);
        }
        return 1;
    }
    if (key == KEY_YES)
        bit = 1;
    else if (key == KEY_PLAY)
        bit = 2;
    else if (key == KEY_REC)
        bit = 4;
    else if (key == KEY_STOP)
        bit = 8;
    else
        return 0;
    if (!(flags & PRESSED)) {
        if (swallowed & bit) {
            swallowed &= ~bit;
            return 1;
        }
        return 0;
    }
    if (swallowed & bit)
        return 1;                       // its repeats
    if (!held || (flags & REPEAT) || IS_KEY_HELD(KEY_FUNC))
        return 0;
    swallowed |= bit;
    perf_action(key);
    return 1;
}

// A kit can bring another link, or several: keep one. Fixing it directly from
// stock's kit routine and the project event left the kit blank at boot, so they
// only ask and the tick acts.
void qperf_kit_changed(void)
{
    kit_changed = 1;
}

void qperf_project(int how, unsigned dropped)
{
    (void)how;
    (void)dropped;
    ready = 1;
    kit_changed = 1;
}

void qperf_tick(void *ctrl)
{
    word_t string;
    char allocator;
    struct { void *object; void *counts; } shared;
    void *popup;
    (void)ctrl;
    if (ready && kit_changed) {
        void *kit = active_kit();
        unsigned mask;
        kit_changed = 0;                // first, so a change after this asks again
        mask = linked(kit);
        if (mask != known)
            link_only(kit, mask & -mask);
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
