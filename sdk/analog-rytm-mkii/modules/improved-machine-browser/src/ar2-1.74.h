// SPDX-License-Identifier: GPL-3.0-or-later
// Stock routines and data on Analog Rytm MKII OS 1.74, read from the OS's code.

// Key events (KeyEvent): + 12 the key, + 16 the flags.
#define KEY_ID_AT 0x40071efc        // event -> key
#define KEY_DOWN_AT 0x40071f54      // event -> flags bit 0: down, repeats too (stock's arrows act on it)
#define KEY_CLICK_AT 0x40071f24     // event -> flags bit 4 (stock's YES acts on it)
#define KEY_FUNC_AT 0x40071f90      // event -> flags bit 1: FUNC held

// The machine list (MachineListView, built by 0x400def76 when SRC is pressed
// twice or with FUNC). Its key routine (0x400df49e) sends UP and DOWN, and its
// encoder routine (0x400df5b2) a turn of any of the knobs A-H, as -1 or +1 to
// a std::function at + 464, which loads the next machine at once (0x400d4110,
// 0x400bedce). YES (0x400deaee) shows "Confirmed!"; NO restores the sound the
// list opened with.
#define MACHINE_LIST_VTABLE 0x401e5ea4
#define POPUP_VTABLE 0x401d70c8
#define VIEW_LIST 76                // the list widget: + 4 begin, + 8 end of its items (8-byte shared_ptrs)
#define LIST_BEGIN 4
#define LIST_END 8
#define ITEM_VALUE 4                // an item's value: a machine id, -1 for the dotted line between sections
#define VIEW_KNOB_STATE 180         // the knobs' accumulator state, as the encoder routine passes it
#define VIEW_OPENED 412             // the machine the list opened with
#define VIEW_SHOWN 432              // the outlined machine
#define VIEW_STEP_FN 464            // the step std::function: + 0 its functor { track, page }, + 8 its manager
#define FN_MANAGER 8
#define FUNCTOR_TRACK 0
#define FUNCTOR_PAGE 4
#define PAGE_KIT 120                // the sound page + 120: the kit
#define SHOW_MACHINE_AT 0x400dea5e  // (view, machine): outline it, "Confirm? Y/N" when it is not the one loaded, redraw

// Stock's knob accumulator: (state, encoder, count x (FUNC ? 16 : 1), table,
// FUNC) -> a step, 0 until the turn adds up to one (0x400df5d4..0x400df616).
#define KNOB_STEPS_AT 0x4006f1fa
#define KNOB_TABLE 0x417e3790
#define FUNC_SCALE 16

#define KIT_TRACK_AT 0x400a67ca     // (kit, track) -> the track's sound object
#define SOUND_MACHINE_AT 0x400bcadc // (sound) -> its machine
#define SET_MACHINE_AT 0x400bd1ba   // (sound, machine, track, notify): stock's load, as the step makes it
