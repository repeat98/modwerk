// SPDX-License-Identifier: GPL-3.0-or-later
// Stock routines and data on Analog Rytm MKII OS 1.74.

#define PROJECT_SINGLETON_AT 0x4017fa0a
#define KIT_PARAM_SET_AT 0x400a648e
#define KIT_PERF_AT 0x400a67fe
#define KIT_QPER_MASK_AT 0x400a6e0e
#define PERF_SET_AT 0x400ad1c8
#define PERF_CLEAR_AT 0x400ad0de
#define ID_FOR_INDEX_AT 0x40007028
#define SET_VALUE_AT 0x400a906c
#define IS_KEY_HELD_AT 0x40081c28
#define PERF_AMOUNTS_AT 0x8000e57c
#define STRING_FROM_CSTR_AT 0x401bcff0
#define STRING_DTOR_AT 0x401bb540
#define MEM_NEW_AT 0x40082a40
#define POPUP_CTOR_AT 0x40076754
#define SHARED_PTR_CTOR_AT 0x401832ec
#define SHARED_PTR_RELEASE_AT 0x40170bd8
#define SHOW_POPUP_AT 0x40079462
#define PERF_CLEAR_ONE_AT 0x400ad040
#define PARAM_UI_AT 0x401816f4
#define SET_LOCKER_AT 0x40036616
#define GET_LOCKER_AT 0x40036636
#define LOCK_EDIT_AT 0x4003613a
#define END_LOCK_EDIT_AT 0x40036622
#define LOCKER_RELATIVE_AT 0x40199202
#define LOCKER_LOCKABLE_AT 0x400acca8
#define PERF_UNDO_AT 0x400ad652
#define PERF_CLEAR_KEEP_AT 0x400ad56a
#define PERF_PASTE_AT 0x400ad800
#define PERF_COPY_AT 0x400ad74a
#define KIT_SET_MASK_AT 0x400a6ea0
#define AMOUNT_SET_AT 0x400b2c6a
#define FX_ID_AT 0x40007070
#define KIT_CHANGED_RESUME_AT 0x400a65aa
#define PRESSED_ONCE_AT 0x40071fa0
#define VIEW_CLOSE_AT 0x40078624
#define POPUP_VTABLE 0x401d70c8
#define QPER_VTABLE 0x40230ff4
#define PAGES_TOP_VTABLE 0x4023502c
#define PERF_VTABLE 0x401e26c4
#define SCENE_VTABLE 0x401e305c
#define MUTE_VTABLE 0x401e2bbc
#define CHROMATIC_VTABLE 0x401e1394

// The sequencer, for the performance lane.
#define PLAYING_A_AT 0x405c8cf8         // both nonzero while it plays
#define PLAYING_B_AT 0x405c8c90
#define SEQ_STEP_AT 0x405c8c94          // u16, the pattern's step
#define SEQ_PULSE_AT 0x405c8c96         // s8, pulse within the step
#define SEQ_SPEED_AT 0x405c8d24         // s8, index into the pulses table
#define PULSES_TABLE_AT 0x401db6f8      // pulses a step: 3, 4, 6, 8, 12, 24, 48
#define NEXT_PULSE_AT 0x405c8b20        // u32, the clock of the next pulse
#define MUSIC_CLOCK_AT 0x8000fe54       // u32, 900000 a pulse
#define LIVE_PATTERN_AT 0x405c8d04      // s8, the pattern playing
#define REC_UI_AT 0x419f28d8            // the record state's object, + 361 LIVE REC
#define GRID_REC_SET_AT 0x400362da      // (record state, on): grid recording
#define LIVE_REC_SET_AT 0x4003638a      // (record state, on): LIVE RECORDING
#define PATTERNS_AT 0x407dd8e3          // 85760 bytes a pattern
#define PATTERN_OF_AT 0x400af0ac
#define PATTERN_TRACK_AT 0x400ab29e
#define STEP_LOCK_SET_AT 0x400c058c
#define STEP_LOCK_GET_AT 0x400bfbbe
#define STEP_AUDIBLE_AT 0x400bff7e
#define STEP_LOCK_TRIG_AT 0x400c000e
#define STEP_MAKE_LOCK_TRIG_AT 0x400c2698
#define ID_FINE_AT 0x400071a6
#define ID_TABLE_AT 0x401bfbc8
#define TRACK_LENGTH_SET_AT 0x400c0ba2  // (track, steps): SCALE's per-track length, with its notice
#define EUCLID_REFRESH_AT 0x400c1a04    // (track, 1): after a length change
#define EUCLID_MODE_AT 0x400c0e6e
#define STEP_LOCKS_CLEAR_AT 0x400c0624  // (track, step)
#define MEMCPY_AT 0x40098bc0            // (to, from, bytes)
#define STEP_COND_SET_AT 0x400c03d6     // (track, step, condition), with its notice
#define STEP_FLAG_SET_AT 0x400c2482     // (track, step, mask, on)
#define PAD_TRACK_AT 0x400aefa2         // (track index): 1 for a pad track
