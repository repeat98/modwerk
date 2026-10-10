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
#define DSP_REPORT_WORDS 34u
int modwerk_dsp_pick(unsigned slot, unsigned track, unsigned row);
unsigned modwerk_dsp_report(uint32_t *out);
#endif
