/* SPDX-License-Identifier: GPL-3.0-or-later */
#ifndef MODWERK_RUNTIME_H
#define MODWERK_RUNTIME_H
#include "loader.h"
/* core-ot hook-bus subscribers (build_core.py). */
void modwerk_runtime_tick(void);
void modwerk_runtime_draw(unsigned char *frame);
int modwerk_runtime_key(int code, int pressed);
int modwerk_runtime_enc(int encoder, int delta);
/* DSP effects (dsp.c, --dsp-loader bases): a development pick, and the loader's report. */
#include "fxids.h"
/* Never a multiple of 16: 4 x words must not fill whole 64-byte packets. Past 32 ids, the used and dry masks' other
 * words and a pad follow the 78 (dsp.c modwerk_dsp_report, version 12). */
#define DSP_REPORT_WORDS (78u + (MODWERK_FX_WORDS > 1u ? 2u * (MODWERK_FX_WORDS - 1u) + 1u : 0u))
int modwerk_dsp_pick(unsigned slot, unsigned track, unsigned row);
/* A key or a panel report from USB or the self-test, rung at the next tick once no physical report is half sent
 * (#1110); 0 when 16 already wait. Safe from an interrupt. */
int modwerk_remote_key(unsigned code, int pressed);
int modwerk_remote_bytes(uint8_t first, uint8_t second);
int modwerk_dsp_probe(unsigned core); /* one PROBE packet: 1 sent, 0 busy */
unsigned modwerk_dsp_report(uint32_t *out);
/* runtime.c: the per-track renderer slots follow a renderer-table site that went back to stock (finding 30). */
void modwerk_machine_retarget(volatile uint32_t *slot, unsigned n, uint32_t gone, uint32_t now);
void modwerk_machine_types_restored(volatile uint32_t *slots, uint32_t address, uint32_t length, const uint8_t *patched,
                                    const uint8_t *stock);
/* runtime.c: the transport long (0x800065b8) and the 16 track bytes (0x80006500) read stopped: rewound (0) or paused,
 * the position kept (2). */
int modwerk_machine_transport_stopped(uint32_t word, const volatile uint8_t *tracks);
/* runtime.c: why the unit counts as not stopped, so a host's change waits (upload `unsafe`): the reason in the low
 * nibble, the track in the high one (recorders 0-7, track bytes 0-15). The self-test record carries it to a host in
 * the top byte of `refusal` (selftest.h). */
enum { MACHINE_BUSY_RECORDING = 1, /* the row track t records into is not idle: pending or recording */
       MACHINE_BUSY_RECORDER,      /* its other row is neither idle nor the 2 a retriggered recording leaves */
       MACHINE_BUSY_TRANSPORT,     /* the transport long is neither rewound (0) nor paused (2) */
       MACHINE_BUSY_TRACK,         /* track byte t (0-15) is neither 0 nor 2 */
       MACHINE_BUSY_JOURNAL };     /* the loader's volatile journal is not idle */
unsigned modwerk_machine_recorder_busy(const volatile uint8_t *rows, uint32_t banks);
unsigned modwerk_machine_busy_reason(const volatile uint8_t *rows, uint32_t banks, uint32_t word, const volatile uint8_t *tracks);
unsigned modwerk_machine_busy(void); /* the unit's own reason now, the journal first; 0 when a change may begin */
#endif
