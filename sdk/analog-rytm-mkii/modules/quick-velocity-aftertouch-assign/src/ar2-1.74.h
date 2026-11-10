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

// The LFO: a sound's (or the FX track's) parameters 64..71 in its parameter
// set. DST holds the destination's parameter index << 8 (the index the mod
// slots store; 0 none); DEP 0..32767, 16384 for 0 (shown -128.00..+127.99).
// Stock's LFO destination list (0x400aa602 -> 0x400aa280) offers the set's
// parameters whose flags hold every bit of LFO_DEST_MASK.
#define LFO_DEST_MASK 0x600
#define ID_LFO_FIRST 64
#define ID_LFO_DST 67
#define ID_LFO_DEP 71
#define ID_LFO_LAST 71
#define DEP_CENTRE 16384
#define DEP_MAX 32767
#define SET_READ 0x28                   // parameter set: read(set, id)
#define SET_VALUE_AT 0x400a906c         // (set, id, value, -1, 0, 1): stock's setter, clamped, with its notice

// A turn, as a page view makes it (0x4003a028..0x4003a10e): the encoder
// event (+12 the knob, +16 its clicks, +20 pushed) times the parameter's step
// (0x4006efca: record + 4, or + 8 pushed), then the view's knob accumulator
// at view + 144, 0x4006f1fa(accumulator, knob, delta, profile, pushed), with
// a copy of the 28-byte turn profile the record points to at + 16; it answers
// the parameter's change (0 for none). The accumulator keeps each knob's speed
// and is a timer that slows it down every 10 ms (0x4006f088). The record is
// 0x400ff5c2(id).
#define PARAM_RECORD_AT 0x400ff5c2
#define ENC_DELTA_AT 0x4006efca
#define ENC_ACCUMULATE_AT 0x4006f1fa
#define RECORD_STEP 4
#define RECORD_STEP_PUSHED 8
#define RECORD_PROFILE 16               // record + 16: the turn profile's address
#define PROFILE_BYTES 28
#define ENC_KNOB 12
#define ENC_PUSHED 20
#define KNOBS 8                         // the parameter knobs A..H, 0..7
#define VIEW_ACCUMULATOR 144

// The page holder, the bottom view (MainView): its key handler (vtable + 8,
// 0x400cc928) shows a sound's pages, which it keeps as shared pointers; the
// LFO page's view at + 248, its DEP on knob H.
#define HOLDER_VTABLE 0x401e20d4
#define HOLDER_LFO_VIEW 248
#define KNOB_DEP 7

// The LFO page key. Its press shows the LFO page (the page holder's key
// handler, 0x400cc928, calls 0x400cbbd6 on a fresh press). Stock has one LFO
// page; a second press steps only to a page a module adds behind it through
// core-ar2's page cycle (LFO RND), on the release. The module replays a tap it held
// back (the press, then the release) through core-ar2's core_key: every ev_key
// handler, then Brain::key (0x400a0336), each event built by 0x40071e7c.
#define KEY_EVENT_CTOR_AT 0x40071e7c    // (event, key, flags, 0, 127)
#define KEY_EVENT_DTOR_AT 0x4018984e
#define KEY_EVENT_BYTES 24

#define POPUP_VTABLE 0x401d70c8
#define PAGES_TOP_VTABLE 0x4023502c
#define PERF_VTABLE 0x401e26c4           // PerformanceView
#define PERF_EDIT_VTABLE 0x401e2a54      // PerformanceEditView: what the PERF key opens
#define SCENE_VTABLE 0x401e305c          // SceneSelectView
#define SCENE_EDIT_VTABLE 0x401e2ee8     // SceneEditView: what the SCNE key opens
#define MUTE_VTABLE 0x401e2bbc
#define CHROMATIC_VTABLE 0x401e1394
