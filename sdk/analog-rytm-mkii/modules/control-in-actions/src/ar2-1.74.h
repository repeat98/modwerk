// SPDX-License-Identifier: GPL-3.0-or-later
// Stock routines and data on Analog Rytm MKII OS 1.74, read from the OS's code.

// The control inputs (EXP/CV IN 1 and 2), ports 0 and 1.
#define CI_SETTINGS_AT 0x400fa7e4   // (port, record*): the port's settings, below
#define CI_SOURCE 0x8000fcf8        // + 4 * port: the level the kit's macro plays
#define CI_PORTS 2

// The converter, as the audio interrupt's 0x4013f394 reads it once a block
// (1,500 a second): the result word at 0xfc094012 + 2 * port, signed, which it
// smooths by 2% a block into 0x419f0310 + 4 * port, the word 0x4013f5ac reads.
// 0x4013f5c6 is 0x4013f5ac's conversion turned round.
#define CI_RESULT 0xfc094012        // + 2 * port: the converter's latest result
#define CI_TO_RESULT_AT 0x4013f5c6  // (port, mV) -> the result that reads as it

// The UI task's queue, as the audio interrupt reports to it (0x4013f53e):
// 0x4011fb56 returns it, 0x400013b2 (queue, message) adds a message from an
// interrupt, and the UI loop (0x400a46f0) takes each message by its first
// byte. Type 0 is a key: the key at +4, its flags at +8, its time at +12, played
// through KEYDISP at 0x400a4838, the core's ev_key site.
#define UI_QUEUE_AT 0x4011fb56
#define QUEUE_POST_AT 0x400013b2
#define MESSAGE_KEY 0

// The settings record 0x400fa7e4 fills, 32 bytes, each field a long.
#define REC_MODE 0                  // 0 OFF, 1 CV, 2 EXPR, 3 FSW (stock's menu stops at 2)
#define REC_EXPR_MIN 12             // EXPRESSION LEARN's levels, mV
#define REC_EXPR_MAX 16
#define REC_FSW_LOW 20              // ACTION LEARN's (stock FOOTSWITCH LEARN) lowest level, mV (REVERSE swaps)
#define REC_FSW_HIGH 24             // and its highest, mV; the pressed level
#define REC_DEST 28                 // the ACTION row (stock FOOTSW DEST), 0..6 with the module; stored as a byte, read into the long
#define REC_BYTES 32
#define MODE_FSW 3

// The ACTION row's names: the menu draws entry n from 0x419f000c + 4n (the
// lookup at 0x40131462), entry 0 stock's OFF.
#define OFF_TEXT 0x4025469e

// FILL (key 0xb2): 0x4193c020 is set while FILL is held or latched. The FILL
// key routine (0x4003cc94) latches for a press flagged FUNC and double
// press (bits 1 and 2), as FUNC + FILL FILL, keeps the latch through a
// release flagged FUNC, and ends it on a plain FILL release.
#define FILL_ON 0x4193c020
#define FLAG_FUNC 2
#define FLAG_DOUBLE 4

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

// Live recording, on the app (*0x419f28d8, which 0x401816f4 returns). Stock's
// RECORD + PLAY (0x4004190a) turns grid and step recording off, then live
// recording on; leaving live recording (0x4004196c) turns only live
// recording off. RECORD + STOP (0x40041ada) turns step recording on.
#define APP_SINGLETON_AT 0x401816f4
#define LIVE_REC_AT 0x40036370      // (app) -> live recording on
#define GRID_REC_SET_AT 0x400362da  // (app, on): grid recording
#define STEP_REC_SET_AT 0x400363cc  // (app, on): step recording, with grid recording on
#define APP_REC_OK 353              // app + 353: the record setters and 0x400363bc act only while set
#define APP_GRID_REC 360            // app + 360: grid recording on
#define APP_LIVE_REC 361            // app + 361: live recording on
#define APP_STEP_REC 362            // app + 362: step recording on

// The mode screens' view classes (pad tracks, then the FX track's).
#define MUTE_VTABLE 0x401e2bbc
#define CHROMATIC_VTABLE 0x401e1394
#define SCENE_VTABLE 0x401e305c
#define SCENE_FX_VTABLE 0x401e2ee8
#define PERF_VTABLE 0x401e26c4
#define PERF_FX_VTABLE 0x401e2a54

// GLOBAL > CONTROL > CONTROL INPUT's view, as its draw (0x40130510) and
// update (0x4013092e) read it; the record at +436 is the menu's own copy,
// saved by 0x401314fc.
#define VIEW_PORT 432
#define VIEW_RECORD 436             // the menu's copy of the settings record
#define VIEW_EXPR_MIN 448           // the menu's copy of REC_EXPR_MIN
#define VIEW_EXPR_MAX 452
#define VIEW_FSW_LOW 456            // the menu's copy of REC_FSW_LOW
#define VIEW_FSW_HIGH 460
#define VIEW_LEARN 468              // 2 EXPRESSION LEARN, 3 FOOTSWITCH LEARN open, else 0
#define LEARN_EXPR 2
#define LEARN_FSW 3
#define VIEW_BASE 56                // the view's View part, as 0x4013092e passes it on
#define VIEW_INVALIDATE_AT 0x40078580 // (view + VIEW_BASE): draw it again

// The draw's branch for EXPR (0x4013077c: MODE 2 or not), the EXPR bars
// and the draw's end.
#define DRAW_EXPR_AT 0x40130784
#define DRAW_END_AT 0x4013091a

// Screen drawing, as the draw calls it: (screen, ...), colour 1.
#define DRAW_FRAME_AT 0x4007050a    // (x1, y1, x2, y2, colour): a rectangle's outline
#define DRAW_FILL_AT 0x40070a38     // (x1, y1, x2, y2, colour): a filled rectangle
#define DRAW_HLINE_AT 0x4006fbd8    // (x1, y, x2, colour)
#define DRAW_VLINE_AT 0x4006fdc0    // (x, y1, y2, colour)
