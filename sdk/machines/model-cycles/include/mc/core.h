/* SPDX-License-Identifier: GPL-2.0-or-later */
#ifndef MODWERK_MC_CORE_H
#define MODWERK_MC_CORE_H

#include "../model-cycles/core.h"

/* What Modwerk's Model:Cycles base adds to core-mc 0.3 (OS 1.13).
 *
 * ev_key_leds handlers, void f(void *mgr), run every key-LED frame after the LEDs are cleared and before the stock
 * views set theirs. fw_led_set(mgr, led, state) lights an LED with state 2 and turns it off with 1; the first setter
 * of an LED wins, so a handler's LED stays over the views'. TRIG n is LED n. A module whose LEDs change asks for a
 * frame by setting *((unsigned char *)ctrl + 0x21) = 1 in its ev_tick handler. */
enum { FW_LED_OFF = 1, FW_LED_ON = 2 };
extern void fw_led_set(void *mgr, int32_t led, int32_t state);

#endif
