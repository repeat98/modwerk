// SPDX-License-Identifier: GPL-3.0-or-later
// Stock routines and data on Analog Rytm MKII OS 1.74, read from the OS's code.

// The control inputs (EXP/CV IN 1 and 2), ports 0 and 1.
#define CI_SETTINGS_AT 0x400fa7e4   // (port, record*): the port's settings, below
#define CI_MILLIVOLTS_AT 0x4013f5ac // (port) -> the smoothed level, calibrated, in mV
#define CI_SOURCE 0x8000fcf8        // + 4 * port: the level the kit's macro plays
#define CI_PORTS 2

// The settings record 0x400fa7e4 fills, 32 bytes, each field a long.
#define REC_MODE 0                  // 0 OFF, 1 CV, 2 EXPR, 3 FSW (stock's menu stops at 2)
#define REC_FSW_LOW 20              // FOOTSWITCH LEARN's lowest level, mV (REVERSE swaps)
#define REC_FSW_HIGH 24             // and its highest, mV; the pressed level
#define REC_DEST 28                 // FOOTSW DEST, 0..5 in stock's list
#define REC_BYTES 32
#define MODE_FSW 3

// The panel's key path: Brain::key(brain, event), the core's KEYDISP.
#define BRAIN_AT 0x419f28f8         // *: the brain
#define KEY_DISPATCH_AT 0x400a0336
#define KEY_EVENT_CTOR_AT 0x40071e7c // (event, key, flags, 0, 127)
#define KEY_EVENT_DTOR_AT 0x4018984e
#define KEY_EVENT_BYTES 24
#define BRAIN_VIEWS 32              // brain + 32: the view manager
#define MANAGER_LIST 20             // view manager + 20: its list of views
#define MANAGER_LAST 24             // view manager + 24: the top view's list node
#define NODE_PREV 4
#define NODE_VIEW 8

// Which keys stock reads as held: a bit per key in 0x418d1340, its index in
// the long at 0x418d0be0 + 4 * key (negative for none), as 0x40081c28 reads it.
#define KEY_BIT_INDEX 0x418d0be0
#define KEY_BITS 0x418d1340

// Live recording, on the app.
#define APP_SINGLETON_AT 0x401816f4
#define LIVE_REC_AT 0x40036370      // (app) -> live recording on

// The mode screens' view classes (pad tracks, then the FX track's).
#define MUTE_VTABLE 0x401e2bbc
#define CHROMATIC_VTABLE 0x401e1394
#define SCENE_VTABLE 0x401e305c
#define SCENE_FX_VTABLE 0x401e2ee8
#define PERF_VTABLE 0x401e26c4
#define PERF_FX_VTABLE 0x401e2a54
