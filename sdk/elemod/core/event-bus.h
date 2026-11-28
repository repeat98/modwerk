/* SPDX-License-Identifier: GPL-3.0-or-later */
#ifndef MODWERK_EVENT_BUS_H
#define MODWERK_EVENT_BUS_H
#include "core-api.h"

/* The linker emits ordered function-pointer tables and one null sentinel. */
extern mw_tick_handler ev_tick[];
extern mw_draw_handler ev_draw[];
extern mw_input_handler ev_key[], ev_enc[];
extern mw_settings_handler ev_settings[];
extern mw_render_handler ev_render_in[], ev_render_out[];
#ifdef MODWERK_DIGITONE
extern mw_voice_handler ev_voice_on[];
extern mw_hold_handler ev_hold[];
extern mw_cc_handler ev_midi_cc[];
extern mw_queue_handler ev_note_queue[];
extern mw_leds_handler ev_key_leds[];
/* The base's Mod Menu, ahead of the tick, draw, key and encoder handlers (nonzero: taken). */
void mw_menu_tick(void *ctrl);
void mw_menu_draw(void *bmp);
int mw_menu_key(void *brain, void *event);
int mw_menu_enc(void *brain, void *event);
#endif

void mw_dispatch_tick(void *ctrl);
void mw_dispatch_draw(void *bmp, void *ctrl);
int mw_dispatch_key(void *brain, void *event);
int mw_dispatch_enc(void *brain, void *event);
void mw_dispatch_settings(void *menu);
void mw_dispatch_render_in(void);
void mw_dispatch_render_out(void);
#ifdef MODWERK_DIGITONE
void mw_dispatch_voice(int voice, int track, void *event);
int mw_dispatch_hold(void *brain, void *event, int track);
int mw_dispatch_midi_cc(int track, int cc, int value, int flags);
void mw_dispatch_note_queue(void *event, int time);
void mw_dispatch_key_leds(void *mgr);
#endif
#endif
