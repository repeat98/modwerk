/* SPDX-License-Identifier: GPL-3.0-or-later
 * Original Modwerk implementation of the documented event ABI. Firmware hooks
 * call these only after their adapters have preserved the interrupted context.
 */
#include "event-bus.h"

void mw_dispatch_tick(void *ctrl) {
#ifdef MODWERK_DIGITONE
    mw_menu_tick(ctrl);
#endif
    for (mw_tick_handler *next = ev_tick; *next; ++next) (*next)(ctrl);
}
void mw_dispatch_draw(void *bmp, void *ctrl) {
    for (mw_draw_handler *next = ev_draw; *next; ++next) (*next)(bmp, ctrl);
#ifdef MODWERK_DIGITONE
    mw_menu_draw(bmp);
#endif
}
int mw_dispatch_key(void *brain, void *event) {
#ifdef MODWERK_DIGITONE
    if (mw_menu_key(brain, event)) return 1;
#endif
    for (mw_input_handler *next = ev_key; *next; ++next) {
        int result = (*next)(brain, event);
        if (result) return result;
    }
    return 0;
}
int mw_dispatch_enc(void *brain, void *event) {
#ifdef MODWERK_DIGITONE
    if (mw_menu_enc(brain, event)) return 1;
#endif
    for (mw_input_handler *next = ev_enc; *next; ++next) {
        int result = (*next)(brain, event);
        if (result) return result;
    }
    return 0;
}
void mw_dispatch_settings(void *menu) {
    for (mw_settings_handler *next = ev_settings; *next; ++next) (*next)(menu);
}
void mw_dispatch_render_in(void) {
    for (mw_render_handler *next = ev_render_in; *next; ++next) (*next)();
}
void mw_dispatch_render_out(void) {
    for (mw_render_handler *next = ev_render_out; *next; ++next) (*next)();
}
#ifdef MODWERK_DIGITONE
void mw_dispatch_voice(int voice, int track, void *event) {
    for (mw_voice_handler *next = ev_voice_on; *next; ++next) (*next)(voice, track, event);
}
int mw_dispatch_hold(void *brain, void *event, int track) {
    for (mw_hold_handler *next = ev_hold; *next; ++next) {
        int result = (*next)(brain, event, track);
        if (result) return result;
    }
    return 0;
}
int mw_dispatch_midi_cc(int track, int cc, int value, int flags) {
    for (mw_cc_handler *next = ev_midi_cc; *next; ++next) {
        int result = (*next)(track, cc, value, flags);
        if (result) return result;
    }
    return 0;
}
void mw_dispatch_note_queue(void *event, int time) {
    for (mw_queue_handler *next = ev_note_queue; *next; ++next) (*next)(event, time);
}
void mw_dispatch_key_leds(void *mgr) {
    for (mw_leds_handler *next = ev_key_leds; *next; ++next) (*next)(mgr);
}
#endif
