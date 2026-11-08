/* SPDX-License-Identifier: GPL-3.0-or-later
 * The module store (store.c): what fxmap.c's project-file seams and the UI tick call. */
#ifndef MODWERK_STORE_H
#define MODWERK_STORE_H
#include <stdint.h>
void modwerk_store_begin(uint32_t storing);      /* the loader's head, each pass */
void modwerk_store_line(const char *line);       /* each '#' line of the storing pass */
void modwerk_store_loaded(int32_t result);       /* the load's end: negative failed */
void modwerk_store_write(uint32_t file);         /* the writer: every module's lines */
void modwerk_store_tick(void);                   /* ev_tick: the only code that changes the store */
extern volatile uint32_t modwerk_store_refused;  /* blocks the store had no room for, since the start */
#endif
