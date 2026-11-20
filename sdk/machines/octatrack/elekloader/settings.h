/* SPDX-License-Identifier: GPL-3.0-or-later
 * The settings modules add to PROJ > MODWERK > SETTINGS (settings.c; events.json ot_settings). UI task only. */
#ifndef MODWERK_SETTINGS_H
#define MODWERK_SETTINGS_H
#include <stdint.h>
#define MODWERK_SETTINGS_ROOM 8u /* the table's room (events.json) */
/* Each UI tick: after the installed modules changed, every setting's kept choice is applied again. */
void modwerk_settings_tick(void);
/* The settings installed now, in table order: at most MODWERK_SETTINGS_ROOM. The page reads them once a draw or key. */
unsigned modwerk_settings_count(void);
/* Setting i's label and the name of its choice in force; "" for a row that left meanwhile. */
const char *modwerk_settings_name(unsigned i);
const char *modwerk_settings_choice(unsigned i);
/* YES on setting i: its next choice (the first after the last), applied and kept through a power cycle. */
void modwerk_settings_next(unsigned i);
#endif
