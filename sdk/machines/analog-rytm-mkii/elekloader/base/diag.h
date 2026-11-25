/* SPDX-License-Identifier: GPL-3.0-or-later
 * Every base (base.json's common): the unit's diagnostics log (diag.c) in the Octatrack's layout, version 2
 * (sdk/machines/octatrack/elekloader/diag.h), so the site's parser reads it unchanged (src/engine/elekloader/
 * device-log.ts, big-endian as the ColdFire stores it), as the Model:Cycles' base does. sdk/tests/test_machine_base.py
 * checks that the structs and numbers below are the Octatrack's word for word, and every kind here is the Octatrack's.
 * The link's DIAG gives the log's address and size; a host reads it with LOG, which reads only the log (LINK.md). */
#ifndef MODWERK_RYTM_DIAG_H
#define MODWERK_RYTM_DIAG_H
#include <stdint.h>

#define DIAG_MAGIC 0x4d574447u /* "MWDG" */
#define DIAG_VERSION 2u
#define DIAG_LOADS 96u        /* five minutes each: the last eight hours */
#define DIAG_INCIDENTS 32u

enum diag_kind { DIAG_START = 1, DIAG_HOT = 2, DIAG_FREEZE = 3, DIAG_BASE = 7 };

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

/* What the Rytm fills (diag.c), all of it on the UI task. Loads: `cpu_mean` and `cpu_peak` the audio block's share of
 * its period (load.c, from the CPU mark's sums of the core's core_audio_load), the mean of the half-second looks and
 * the dearest block, per mille; `samples` the looks; `playing` the looks that ended with the sequencer playing;
 * `frame_gap` 0 (only the audio interrupt sees the blocks' spacing, and nothing of the log runs there); `tick_gap` the
 * longest time between two UI ticks, in audio blocks (about 75 a tick). The DSP fields stay 0: the Rytm's audio runs on the ColdFire. Incidents: START (a 0) and BASE (a the set
 * identity, link.c) at a boot's first tick, HOT (a the half-seconds at 90 % or more), FREEZE (the UI standing still
 * five seconds or more, logged when it comes back; a the audio blocks it stood still). `keys` the last 16 key ids pressed, oldest
 * first (0xff none); `cpu` the last window's share; `playing` 1 while the sequencer plays. `machine`, `fx`, `screen`
 * and `tempo24` stay 0: the base does not read them yet. The log lives in the base's memory: it starts again at every
 * boot, so `boot` is 1. */
void mw_diag_start(uint32_t nonce, uint32_t set_crc); /* link.c's boot gate */
void mw_diag_window(uint32_t avg, uint32_t wmax, uint32_t blocks); /* load.c, each look: share, dearest block, blocks */
void mw_diag_tick(void *ctrl);                        /* ev_tick */
int mw_diag_key(void *brain, char *event);            /* ev_key: remembers presses, takes none */
extern volatile struct diag_log mw_diag_log;
#endif
