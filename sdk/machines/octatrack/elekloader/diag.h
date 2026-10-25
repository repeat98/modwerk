/* SPDX-License-Identifier: GPL-3.0-or-later
 * The unit's diagnostics log (diag.c): its layout, read byte for byte by the site (src/engine/elekloader/
 * device-log.ts parses it big-endian, as the ColdFire stores it). A new layout needs a new DIAG_VERSION. */
#ifndef MODWERK_DIAG_H
#define MODWERK_DIAG_H
#include <stdint.h>

#define DIAG_MAGIC 0x4d574447u /* "MWDG" */
#define DIAG_VERSION 2u
#define DIAG_LOADS 96u        /* five minutes each: the last eight hours */
#define DIAG_INCIDENTS 32u
#define DIAG_PAGE 244u        /* ep0.c's LOG reply: never a whole multiple of 64 bytes (OCTATRACK_HARDWARE_TRAPS.md) */
#define DIAG_LOG_REQUEST 37u  /* bRequest of LOG (0xC1, wValue the page, wLength DIAG_PAGE); 31-36 are taken */

enum diag_kind { DIAG_START = 1, DIAG_HOT = 2, DIAG_FREEZE = 3, DIAG_CRASH = 4, DIAG_STALL = 5, DIAG_SET = 6, DIAG_BASE = 7, DIAG_SHED = 8 };
/* After the log: crash.c's record (struct crash, 0x100ff800) and dsp.c's stall record (struct stall, 0x100ff900),
 * byte for byte, so the site uploads what a crash or a DSP stall left; each starts with its magic ("MWCR", "MWST"). */
#define DIAG_CRASH_BYTES 180u
#define DIAG_STALL_BYTES 456u

/* Five minutes of the meters (status.c, per mille), sampled twice a second: `samples` of them, `playing` with the
 * sequencer running. `minute` counts from the start (`boot`). `frame_gap`: the longest time between two audio frames
 * in the window, in µs (a frame is 363 µs; past about 515 µs the DSPs starve), `tick_gap` the longest run of frames
 * without a UI tick (a tick is every 2.7 frames; 13,781 is the freeze threshold): what a dropout or a hang looks
 * like, where the meters' peaks only show a self-test or an install. */
struct diag_load {
    uint32_t seq, boot, minute;
    uint16_t cpu_mean, cpu_peak, dsp0_mean, dsp0_peak, dsp1_mean, dsp1_peak, samples, playing, frame_gap, tick_gap;
};
/* An incident and what the unit was doing. `a`: START the crash and stall counts seen (crash.c, dsp.c), HOT the
 * half-seconds at 90 % or more, FREEZE the frames the UI stood still (0: it never came back before a restart),
 * CRASH the program counter, STALL the stall's reason, BASE the first four bytes of the base's identity (right after
 * each START: a stall followed by another base was an OS upgrade), SHED the frame guard's skips since the start
 * (machine_registry.c: the tracks it skipped in the top byte, as bits, then the count), SET how many modules are installed, their ids in
 * `machine`, `fx` and `keys` read as one run of 56 bytes (14 ids of 4, after a restore from the card and each Keep).
 * `machine`: each track's type byte and machine signature
 * (machine_registry.c), `fx` what each slot runs (FX1 T1-T8, then FX2), `keys` the last 16 key codes pressed,
 * oldest first (0xff none), `screen` stock's top input layer, `tempo24` the tempo times 24. */
struct diag_incident {
    uint32_t seq, boot, second, a;
    uint16_t kind, cpu, dsp0, dsp1;
    uint8_t machine[24], fx[16], keys[16];
    uint32_t screen, tempo24, playing;
};
/* `loads` and `incidents`: written so far; record n is at n % the ring's size. `freeze`: the frame interrupt's one
 * slot (freeze_state 1 while the UI stands still, 2 once it moved again), which the tick or the next start adds to
 * the incidents, so only the tick writes the rings. */
struct diag_log {
    uint32_t magic, version, nonce, boot, seq, loads, incidents, crash_seen, stall_seen, freeze_state;
    struct diag_incident freeze;
    struct diag_load load[DIAG_LOADS];
    struct diag_incident incident[DIAG_INCIDENTS];
};
typedef char diag_load_layout[sizeof(struct diag_load) == 32u ? 1 : -1];
typedef char diag_incident_layout[sizeof(struct diag_incident) == 92u ? 1 : -1];
typedef char diag_log_layout[sizeof(struct diag_log) == 40u + 92u + 32u * DIAG_LOADS + 92u * DIAG_INCIDENTS ? 1 : -1];
#define DIAG_IMAGE_BYTES (sizeof(struct diag_log) + DIAG_CRASH_BYTES + DIAG_STALL_BYTES) /* what LOG pages */

void modwerk_diag_tick(void);                          /* ev_tick */
int modwerk_diag_key(int code, int pressed);           /* ev_key: remembers presses, takes none */
void modwerk_diag_frame(void);                         /* dl_frame, in the frame interrupt */
unsigned modwerk_diag_read(uint8_t *out, unsigned page); /* ep0.c LOG: DIAG_PAGE bytes of the log, then the records */
void modwerk_diag_set(void);                           /* modset.c: the installed set changed (restore, Keep) */
void modwerk_diag_refused(uint32_t module, uint32_t refusal); /* modset.c, before a restore's set record: its first refused
                                                       * package's module and the loader's refusal (screen, tempo24) */
#ifdef MODWERK_DEV
/* Development builds: what the base's own hooks cost, in DTIM3 counts (132 MHz), read over MEM. The tick chain is
 * stamped in its order (runtime_tick 1, ep0_tick 2 and its end 3, dl_ui 4, status_tick 5 and its end 6, crash_tick 7,
 * diag_tick 8 and its end 9), so cost[k] is the time from stamp k to stamp k + 1: [1] runtime_tick, [2] ep0_tick,
 * [3] dsp_tick, [4] dl_ui, [5] status_tick, [6] controller_tick, [7] crash_tick, [8] diag_tick; [0] the whole chain,
 * [15] its ticks. The draw chain: [12] boot_draw to the end of status_draw (stamps 12, 13). [14] mw_ui_tick (14, 15).
 * [10] dl_frame's body, [11] its frames (transfer.c, build_core.py). [18] the fx map check's time, [19] its calls
 * (fxmap.c). [24] mg_tick (stamps 24, 25); [25] the dearest MIDI generator knob turn with its regeneration, [26] their
 * count and [27] their time (stamps 26, 27; midi_generators.c). */
extern volatile uint32_t modwerk_cost[28];
void modwerk_cost_stamp(unsigned k);
#endif
#endif
