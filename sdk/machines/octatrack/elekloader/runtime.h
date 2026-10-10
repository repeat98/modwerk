/* SPDX-License-Identifier: GPL-3.0-or-later */
#ifndef MODWERK_RUNTIME_H
#define MODWERK_RUNTIME_H
#include "loader.h"
/* core-ot hook-bus subscribers (build_core.py). */
void modwerk_runtime_tick(void);
void modwerk_runtime_draw(unsigned char *frame);
int modwerk_runtime_key(int code, int pressed);
int modwerk_runtime_enc(int encoder, int delta);
#endif
