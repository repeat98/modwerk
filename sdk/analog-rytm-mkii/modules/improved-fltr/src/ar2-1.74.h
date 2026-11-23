// Analog Rytm MKII OS 1.74 entry points Improved FLTR calls (addresses only; see the module's README).
#define PROJECT_AT 0x4017fa0a           // () -> the project
#define PROJECT_SEQ_AT 0x400ae492       // project -> its sequencer state (project + 48)
#define SELECTED_TRACK_AT 0x400b693e    // sequencer state -> the selected track, 12 the FX track
#define PARAM_TARGET_AT 0x400af51a      // (project, track, 0) -> the track's parameter target
#define PARAM_SET_AT 0x400a906c         // (target, id, value 8.8, track, notify, redraw): stock's setter
#define IS_KEY_HELD_AT 0x40081c28
#define IS_LIVE_REC_AT 0x40036370
#define REC_STATE_AT 0x401816f4
#define STRING_FROM_CSTR_AT 0x401bcff0
#define STRING_DTOR_AT 0x401bb540
#define SHOW_HEADER_AT 0x40035fe8
#define KIT_TRACK_SOUND_AT 0x400a67ca   // (kit, track) -> the track's sound accessor
#define FILLRECT_AT 0x40070726         // (bitmap, x0, y0, x1, y1, colour), y up from the bottom row
