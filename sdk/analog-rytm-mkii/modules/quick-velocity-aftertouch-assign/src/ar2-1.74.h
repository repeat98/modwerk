// SPDX-License-Identifier: GPL-3.0-or-later
// Stock routines and data on Analog Rytm MKII OS 1.74, read from the OS's code.

#define PROJECT_SINGLETON_AT 0x4017fa0a     // the project
#define PROJECT_KIT_AT 0x400ae4ca           // project -> its kit (project + 352)
#define PROJECT_SEQ_AT 0x400ae492           // project -> sequencer state (project + 48)
#define SELECTED_TRACK_AT 0x400b693e        // sequencer state -> selected track, 12 the FX track
#define KIT_TRACK_AT 0x400a67ca             // kit, track -> the track's sound object
#define TRACK_VEL_CONF_AT 0x400bcb4a        // sound object -> velocity mod config (+36: its set)
#define TRACK_AT_CONF_AT 0x400bcb56         // sound object -> aftertouch mod config (+44: its set)
#define KIT_PARAM_SET_AT 0x400a648e         // kit, track -> the sound's parameter set
#define FIXED_VEL_GET_AT 0x400b7724         // sequencer state -> FIX on
#define FIXED_VEL_SET_AT 0x400b7702         // sequencer state, on
#define IS_KEY_HELD_AT 0x40081c28
#define STRING_FROM_CSTR_AT 0x401bcff0
#define STRING_DTOR_AT 0x401bb540
#define MEM_NEW_AT 0x40082a40
#define POPUP_CTOR_AT 0x40076754
#define SHARED_PTR_CTOR_AT 0x401832ec
#define SHARED_PTR_RELEASE_AT 0x40170bd8
#define SHOW_POPUP_AT 0x40079462

// The parameter id table: 469 rows of 52 bytes. Row + 0 the category (61 the
// TRIG page), + 4 the parameter's index in the sound (the mod slots' stored
// destination).
#define PARAM_TABLE 0x401bfbc8
#define PARAM_ROWS 469
#define PARAM_ROW_BYTES 52
#define ROW_CATEGORY 0
#define ROW_INDEX 4
#define CATEGORY_TRIG 61

// A mod slot set (the velocity or aftertouch ParameterSet). Four slots, each
// an amount (8.8, whole steps, -128..127) and a destination, the parameter
// index of a sound, 0 for none. Stock's MODULATION SETUP reads and writes
// them through these, and the writers send stock's change notice.
#define SLOTS_COUNT 8       // count(set)
#define SLOTS_SET_DEST 32   // set_dest(set, slot, logical id)
#define SLOTS_DEST 36       // dest(set, slot): the stored index
#define SLOTS_SET_AMOUNT 40 // set_amount(set, slot, amount 8.8), clamped by stock
#define SLOTS_AMOUNT 44     // amount(set, slot): 8.8
#define VEL_SET 36          // velocity mod config + 36: its set
#define AT_SET 44           // aftertouch mod config + 44: its set

// The sound's parameter set: logical id of a parameter index for this sound's
// machine, which stock's destination list tests against flag 0x200.
#define SOUND_SET_ID_OF 76
#define PARAM_FLAGS_AT 0x40007234
#define FLAG_MOD_DEST 0x200

// The parameter UI's locker: while one is set and lock edit is on, stock draws
// each knob the locker has inverted with the locker's value, as for a held
// performance pad (QPERF reads the same routines).
#define PARAM_UI_AT 0x401816f4
#define SET_LOCKER_AT 0x40036616
#define GET_LOCKER_AT 0x40036636
#define LOCK_EDIT_AT 0x4003613a
#define END_LOCK_EDIT_AT 0x40036622
#define LOCKER_RELATIVE_AT 0x40199202     // PerformanceParamLocker: relative values
#define LOCKER_LOCKABLE_AT 0x400acca8     // PerformanceParamLocker: lockable(id)

#define POPUP_VTABLE 0x401d70c8
#define PAGES_TOP_VTABLE 0x4023502c
#define PERF_VTABLE 0x401e26c4           // PerformanceView
#define PERF_EDIT_VTABLE 0x401e2a54      // PerformanceEditView: what the PERF key opens
#define SCENE_VTABLE 0x401e305c          // SceneSelectView
#define SCENE_EDIT_VTABLE 0x401e2ee8     // SceneEditView: what the SCNE key opens
#define MUTE_VTABLE 0x401e2bbc
#define CHROMATIC_VTABLE 0x401e1394
