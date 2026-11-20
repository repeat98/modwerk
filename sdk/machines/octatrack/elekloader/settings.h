/* SPDX-License-Identifier: GPL-3.0-or-later
 * The settings modules add to PROJ > MODWERK > SETTINGS (settings.c; events.json ot_settings). UI task only. */
#ifndef MODWERK_SETTINGS_H
#define MODWERK_SETTINGS_H
#ifdef MODWERK_HOST
#include "../include/modwerk_events.h"
#else
#include "modwerk_events.h"
#endif
#define MODWERK_SETTINGS_ROOM 8u /* the table's room (events.json) */
/* Each UI tick: after the installed modules changed, every setting's kept choice is applied again. */
void modwerk_settings_tick(void);
/* The settings installed now, in table order: at most MODWERK_SETTINGS_ROOM. The page reads them once a draw or key. */
unsigned modwerk_settings_count(void);
unsigned modwerk_settings_presets(uint8_t *out);
/* A single draw's copy of an installed setting. Do not retain pointers into module images across an Undo. */
#define MODWERK_SETTING_OPTIONS 6u
struct modwerk_setting_view {
    uint32_t epoch;
    unsigned count, active;
    char label[16], choices[MODWERK_SETTING_PAGE_ROOM][16];
    unsigned fields;
    char values[MODWERK_SETTING_PAGE_ROOM][16];
};
unsigned modwerk_settings_read(unsigned i, struct modwerk_setting_view *view);
unsigned modwerk_settings_field(unsigned i, unsigned field, struct modwerk_setting_view *view);
void modwerk_settings_choose(unsigned i, uint32_t epoch, unsigned field, unsigned choice);
/* Apply the highlighted index only while the same installation is still on screen. */
void modwerk_settings_select(unsigned i, uint32_t epoch, unsigned choice);
#endif
