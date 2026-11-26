/* SPDX-License-Identifier: GPL-3.0-or-later
 * Every base (base.json's add): the unit's diagnostics log (diag.c) in the Octatrack's layout, version 2
 * (sdk/machines/octatrack/elekloader/diag.h), so the site's parser reads it unchanged (src/engine/elekloader/
 * device-log.ts, big-endian as the ColdFire stores it). sdk/tests/test_machine_base.py checks that the structs and
 * numbers below are the Octatrack's word for word. The link's DIAG gives the log's address and size; a host reads it
 * with LOG, which reads only the log. */
#ifndef MODWERK_CYCLES_DIAG_H
#define MODWERK_CYCLES_DIAG_H
#include <stdint.h>

#define DIAG_MAGIC 0x4d574447u /* "MWDG" */
#define DIAG_VERSION 2u
#define DIAG_LOADS 96u        /* five minutes each: the last eight hours */
#define DIAG_INCIDENTS 32u

enum diag_kind { DIAG_START = 1, DIAG_HOT = 2, DIAG_FREEZE = 3, DIAG_CRASH = 4, DIAG_STALL = 5, DIAG_SET = 6, DIAG_BASE = 7, DIAG_SHED = 8, DIAG_CPU = 9, DIAG_BRAKE = 10, DIAG_USB = 11, DIAG_LATE = 12, DIAG_RESTORE = 13, DIAG_FREEZE_PC = 14 };

struct diag_load {
    uint32_t seq, boot, minute;
    uint16_t cpu_mean, cpu_peak, dsp0_mean, dsp0_peak, dsp1_mean, dsp1_peak, samples, playing, frame_gap, tick_gap;
};
struct diag_incident {
    uint32_t seq, boot, second, a;
    uint16_t kind, cpu, dsp0, dsp1;
    uint8_t machine[24], fx[16], keys[16];
    uint32_t screen, tempo24, playing;
};
struct diag_log {
    uint32_t magic, version, nonce, boot, seq, loads, incidents, crash_seen, stall_seen, freeze_state;
    struct diag_incident freeze;
    struct diag_load load[DIAG_LOADS];
    struct diag_incident incident[DIAG_INCIDENTS];
};
typedef char diag_load_layout[sizeof(struct diag_load) == 32u ? 1 : -1];
typedef char diag_incident_layout[sizeof(struct diag_incident) == 92u ? 1 : -1];
typedef char diag_log_layout[sizeof(struct diag_log) == 40u + 92u + 32u * DIAG_LOADS + 92u * DIAG_INCIDENTS ? 1 : -1];

/* What the Model:Cycles fills (diag.c). Loads: `cpu_mean` and `cpu_peak` the audio's share of the CPU (load.c), the
 * mean of the half-second windows and the dearest codec block, per mille; `samples` the windows; `frame_gap` the
 * longest time between two codec blocks in µs (one is 667 µs); `tick_gap` the longest run of codec blocks without a
 * UI tick (about 50 a tick). The DSP fields and `playing` stay 0: the Model:Cycles has no DSP, and the base does not
 * read the sequencer yet. Incidents: START (a 0) and BASE (a the set identity, link.c) at a boot's first tick, HOT (a the
 * half-seconds at 90 % or more), FREEZE (the UI tick standing still for five seconds while audio runs; a the codec
 * blocks it stood still). `machine`: each track's machine (0-5) in every third byte, from the kit the audio side
 * plays; `keys` the last 16 key ids pressed, oldest first (0xff none); `cpu` the last window's share; `fx`, `screen`,
 * `tempo24` and `playing` 0. The log lives in the base's memory: it starts again at every boot, so `boot` is 1. */
void mw_diag_start(uint32_t nonce, uint32_t set_crc); /* link.c's boot gate */
void mw_diag_block(uint32_t start);                   /* load.c, each codec block: its start in DMA timer 0 ticks */
void mw_diag_window(uint32_t avg, uint32_t wmax);     /* load.c, each window: its share and dearest block, per mille */
void mw_diag_tick(void *ctrl);                        /* ev_tick */
int mw_diag_key(void *brain, char *event);            /* ev_key: remembers presses, takes none */
extern volatile struct diag_log mw_diag_log;
#endif
