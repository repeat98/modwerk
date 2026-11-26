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
#define DIAG_LOG_REQUEST 37u  /* bRequest of LOG (0xC1, wValue the page, wLength DIAG_PAGE); 31-36 are taken, 38 sets, 39 SLOTS (flash.h) */

enum diag_kind { DIAG_START = 1, DIAG_HOT = 2, DIAG_FREEZE = 3, DIAG_CRASH = 4, DIAG_STALL = 5, DIAG_SET = 6, DIAG_BASE = 7, DIAG_SHED = 8, DIAG_CPU = 9, DIAG_BRAKE = 10, DIAG_USB = 11, DIAG_LATE = 12, DIAG_RESTORE = 13, DIAG_FREEZE_PC = 14 };
/* After the log: crash.c's record (struct crash, 0x100ff800) and dsp.c's stall record (struct stall, 0x100ff900),
 * byte for byte, so the site uploads what a crash or a DSP stall left; each starts with its magic ("MWCR", "MWST"). */
#define DIAG_CRASH_BYTES 180u
#define DIAG_STALL_BYTES 456u
/* After those, the frames before the stall ("MWFT", 0x100ffb30): what the frame interrupt saw in its last
 * DIAG_TRACE_FRAMES frames (46 ms), oldest first, kept at the tick that finds dsp.c's stall record, with its `count`. Each frame: the time
 * since the frame before began, then how long the frame interrupt before it ran, both in DTIM3 counts / 64 (0.485 µs;
 * a frame is 363 µs, so 749), 65535 at most. A long gap after a long run is the frame interrupt's own work; a long gap
 * after a short one is something else holding it off. Frames stop with the DSPs, so the last ones are the lead-up. */
#define DIAG_TRACE_FRAMES 128u
#define DIAG_TRACE_MAGIC 0x4d574654u
struct diag_trace { uint32_t magic, count; uint16_t frame[DIAG_TRACE_FRAMES][2]; };
#define DIAG_TRACE_BYTES 520u
/* And with it ("MWLR", 0x100f9710): the lateness of the last eight frame-interrupt entries, oldest first, in DTCN3
 * counts as the late-entry wait measured them (machine_registry.c): the trace's gaps are stamped later in the frame.
 * Read from battery RAM; LOG does not page it. */
#define DIAG_LATES_MAGIC 0x4d574c52u
struct diag_lates { uint32_t magic, count; uint16_t late[8]; };
/* Where the processor was while the UI tick stood still ("MWFZ", 0x100f9728, bases from 0.8.2): at 5, 6, 7 and 8
 * seconds of a freeze, what the audio frame's eDMA interrupt (level 6, where modwerk_diag_frame runs) interrupted:
 * the program counter and status register of its exception frame, and the kernel's current task (its TCB,
 * 0x800068fc). An interrupted level (SR bits 8-10) above 0 is an interrupt handler that never returns (5: the DSP
 * frame's or the card's); at level 0 the PC is the task that runs (a loop in it, or the idle loop when the UI task
 * waits). `pc` 0xffffffff: the frame was not that interrupt's (never seen). Read from battery RAM at the next start or once the tick moves again, as the FREEZE_PC incident (below). */
#define DIAG_FREEZE_PC_MAGIC 0x4d57465au
#define DIAG_FREEZE_PC_SAMPLES 4u
struct diag_freeze_pc { uint32_t magic, boot, pc[DIAG_FREEZE_PC_SAMPLES], tcb[DIAG_FREEZE_PC_SAMPLES]; uint16_t sr[DIAG_FREEZE_PC_SAMPLES]; };
typedef char diag_trace_layout[sizeof(struct diag_trace) == DIAG_TRACE_BYTES ? 1 : -1];

/* Five minutes of the meters (status.c, per mille), sampled twice a second: `samples` of them, `playing` with the
 * sequencer running. `minute` counts from the start (`boot`). `frame_gap`: the longest time between two audio frames
 * in the window, in µs (a frame is 363 µs; past about 515 µs the DSPs starve), `tick_gap` the longest run of frames
 * without a UI tick (60 ticks a second on the unit, one every 46 frames; 13,781 is the freeze threshold): what a dropout or a hang looks
 * like, where the meters' peaks only show a self-test or an install. */
struct diag_load {
    uint32_t seq, boot, minute;
    uint16_t cpu_mean, cpu_peak, dsp0_mean, dsp0_peak, dsp1_mean, dsp1_peak, samples, playing, frame_gap, tick_gap;
};
/* An incident and what the unit was doing. `a`: START the crash and stall counts seen (crash.c, dsp.c), HOT the
 * half-seconds at 90 % or more, FREEZE the frames the UI stood still (0: it never came back before a restart),
 * CRASH the program counter, STALL the stall's reason, BASE the first four bytes of the base's identity (right after
 * each START: a stall followed by another base was an OS upgrade), SHED the frame guard's skips since the start
 * (machine_registry.c: the tracks it skipped in the top byte, as bits, then the count), CPU the CPU budget's refusals
 * since the start in the low 16 bits (65,535 at most), the tracks refused since the last CPU record in bits 16-23 (so
 * `machine` names whose price it was) and every track refused since the start in the top byte (bases before 0.8.2: a
 * 24-bit count and no recent tracks), USB the controller when the unit
 * offered itself again because the host never enumerated it (usb_attach.h: OTGSC in the high half, PORTSC1 in the low),
 * LATE how many late frame entries the base held since boot (machine_registry.c), each a DSP frame skipped, in the low
 * 24 bits, and in the top byte how many entries since boot came later than the wait can hold (190 µs or more, 255 at
 * most; 0 on bases before it was counted), BRAKE with
 * bit 23 set how many patterns began with module machines silenced as predicted past the frame ceiling (status.c),
 * SET how many modules are installed, their ids in
 * `machine`, `fx` and `keys` read as one run of 56 bytes (14 ids of 4, after a restore from the card and each Keep); after a
 * restore that refused a package, `screen` its module, `tempo24` the refusal, `cpu` and `dsp0` the module pool then (bytes
 * used and the largest free run, in 16-byte units) and `dsp1` the loader's check that refused it (runtime_check: 1 the
 * pool, 2 claims, 3 metadata, 4 the DSP's limits); all three 0 on bases before 0.7.10.
 * RESTORE (bases from 0.8.2, right after the START it belongs to) the values stock's checks had to fix in the
 * battery copy of the current bank at power-up (diag.c modwerk_boot_restore), with `cpu` those in the project's
 * settings and arrangements, `dsp0` in the bank's Parts, `dsp1` in its patterns, `screen` the first record that
 * needed one (1-3 the settings checks, 0x100 + 2 x Part for a saved Part and + 1 for its working copy, 0x200 +
 * pattern) and `tempo24` the restore's result (0 restored with the fixes, 0xffffffff refused: too many to trust).
 * FREEZE_PC (bases from 0.8.2, right after the FREEZE it belongs to, with its boot and second) where the processor
 * was during that freeze (struct diag_freeze_pc): `a`, `screen`, `tempo24` the program counter at 5, 6 and 7 s,
 * `cpu`, `dsp0`, `dsp1` the status register then; `machine` the four current TCBs (big-endian, 16 bytes), then the
 * program counter at 8 s and its status register; 0 where the tick moved again before that sample.
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
#define DIAG_IMAGE_BYTES (sizeof(struct diag_log) + DIAG_CRASH_BYTES + DIAG_STALL_BYTES + DIAG_TRACE_BYTES) /* what LOG pages */
/* Then, in the last page's spare bytes: the frame guard's skips since the start and their tracks as they stand now
 * ("MWSK", count, track mask), then the frame entries since the start later than the late-entry wait can hold
 * (machine_registry.c's mw_late_over; zero on bases before it). A SHED or LATE incident comes at most once in HOT_GAP,
 * so either can be logged inside a later trial's window; a host compares two reads of these counts instead (owner's
 * MKII, 21 November 2026). The four words fill the last page exactly. */
#define DIAG_SHEDS_MAGIC 0x4d57534bu
#define DIAG_SHEDS_BYTES 16u
typedef char diag_sheds_fit[DIAG_IMAGE_BYTES % DIAG_PAGE + DIAG_SHEDS_BYTES <= DIAG_PAGE ? 1 : -1];

void modwerk_diag_tick(void);                          /* ev_tick */
int modwerk_diag_key(int code, int pressed);           /* ev_key: remembers presses, takes none */
void modwerk_diag_frame(void);                         /* dl_frame, in the frame interrupt */
unsigned modwerk_diag_read(uint8_t *out, unsigned page); /* ep0.c LOG: DIAG_PAGE bytes of the log, then the records */
void modwerk_diag_set(void);                           /* modset.c: the installed set changed (restore, Keep) */
int32_t modwerk_boot_restore(void);                    /* status.s mw_boot_restore: the power-up's battery restore of
                                                       * the current bank (stock 0x40025770), in main's init */
void modwerk_diag_refused(uint32_t module, uint32_t refusal, uint32_t used, uint32_t largest, uint32_t check); /* modset.c,
                                                       * before a restore's set record: its first refused package's module and the
                                                       * loader's refusal (screen, tempo24), the module pool when it was refused:
                                                       * bytes used and the largest free run (cpu and dsp0, in 16-byte units), and
                                                       * the loader's check that refused it (dsp1, loader.h runtime_check) */
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
