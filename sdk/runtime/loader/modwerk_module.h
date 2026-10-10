/* SPDX-License-Identifier: GPL-3.0-or-later
 * What a runtime module sees (ABI 2, README.md): build it with build.py.
 * Define any of these handlers. They are the events every Elekloader core's
 * hook bus has, with its conventions (Elekloader docs/ADAPTING.md), and run
 * in the machine's UI task, never at interrupt level. Key codes, encoder
 * numbers and the frame's layout are the machine's own. The module's data
 * is reached through an uncached alias: keep it small and off hot paths.
 * There is no C library. */
#ifndef MODWERK_MODULE_H
#define MODWERK_MODULE_H
#include <stdint.h>
/* value: read back through the base's diagnostics, for tests. */
struct modwerk_runtime_api { volatile uint32_t value; };
void module_tick(struct modwerk_runtime_api *api); /* the UI tick (Octatrack: 60 a second) */
void module_draw(unsigned char *frame); /* each composed frame, before it goes to the screen */
int module_key(int code, int pressed); /* nonzero takes the key from the firmware */
int module_enc(int encoder, int delta); /* nonzero takes the turn from the firmware */
#endif
