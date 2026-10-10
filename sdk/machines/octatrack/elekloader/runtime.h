/* SPDX-License-Identifier: GPL-3.0-or-later */
#ifndef MODWERK_RUNTIME_H
#define MODWERK_RUNTIME_H
#include "upload.h"
#define RUNTIME_HEADER_BYTES 16u
#define RUNTIME_SLOT_BYTES 16384u
struct modwerk_runtime_api { volatile uint32_t value; };
typedef void (*runtime_entry)(struct modwerk_runtime_api *);
extern const struct mu_backend modwerk_runtime_backend;
extern uint8_t modwerk_runtime_staging[RUNTIME_HEADER_BYTES + RUNTIME_SLOT_BYTES];
void modwerk_runtime_tick(void);
uint32_t modwerk_runtime_value(void);
runtime_entry modwerk_runtime_active(void);
#endif
