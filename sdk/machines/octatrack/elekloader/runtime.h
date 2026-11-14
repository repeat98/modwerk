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
#endif
