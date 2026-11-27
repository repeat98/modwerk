/* SPDX-License-Identifier: GPL-2.0-or-later */
/* MUTINY's Digitone mk1 OS 1.44 port: every undocumented address, native-buffer access and
 * non-drawing adapter. Callers hold no firmware pointer between calls; the commit context belongs
 * to the caller and lasts one operation (port144.h has each number's source). */
#include "port144.h"
#include "commit.h"
#include "digitone-mk1/core3.h"
#include "digitone-mk1/seq.h"
#include "tick.h"
#include <stdint.h>

/* commit.h's mu_device contract: offsets 0..975 are track data, 976.. the lock area. */
static int in_ddr(const uint8_t *p) {
    uintptr_t a = (uintptr_t)p;
    return a >= (uintptr_t)MU_PORT_DDR_LO && a < (uintptr_t)MU_PORT_DDR_HI;
}

static uint8_t native_get(void *ctx, uint32_t off) {
    const struct mu_port_native *d = ctx;
    return d->pattern[mu_port_native_offset(d->track, off)];
}

static void native_put(void *ctx, uint32_t off, uint8_t value) {
    const struct mu_port_native *d = ctx;
    if (fw_pattern != d->pattern)
        return; /* the pattern moved: never write the plan into another buffer */
    ((uint8_t *)d->pattern)[mu_port_native_offset(d->track, off)] = value;
}

static uint32_t native_identity(void *ctx) {
    (void)ctx;
    return mu_port_buffer_guard(); /* the live guard, not a value captured before the operation */
}

static void native_bind(struct mu_port_native *ctx, struct mu_device *dev, uint32_t track,
                        uint8_t *pattern) {
    ctx->pattern = pattern;
    ctx->track = track;
    dev->ctx = ctx;
    dev->get = native_get;
    dev->put = native_put;
    dev->identity = native_identity;
}

void mu_port_native_device(struct mu_port_native *ctx, struct mu_device *dev, uint32_t track) {
    native_bind(ctx, dev, track, fw_pattern);
}

int mu_port_native_ready(struct mu_port_native *ctx, struct mu_device *dev, uint32_t track) {
    uint8_t *pattern = fw_pattern;
    if (!in_ddr(pattern))
        return 0;
    native_bind(ctx, dev, track, pattern);
    return 1;
}

void *mu_port_pattern(void) { return fw_pattern; }

void *mu_port_project(void) { return fw_project; }

int mu_port_playing(void) { return fw_transport == 1; }

uint32_t mu_port_page(void) { return *(const volatile uint32_t *)MU_PORT_PAGE_AT; }

uint32_t mu_port_clock_last(uint32_t track) {
    return track < SQ_TRACKS ? sq_clock[track].last : SQ_CLOCK_NONE;
}

uint32_t mu_port_clock_parity(uint32_t track) {
    return track < SQ_TRACKS ? sq_clock[track].parity : 0u;
}

int mu_port_synth_track_active(void) { return (uint32_t)fw_active_track <= 3u; }

int mu_port_overlay_open(const void *brain) {
    return *(const uint32_t *)((const uint8_t *)brain + MU_PORT_BRAIN_VIEW_OFFSET) !=
           *(const uint32_t *)((const uint8_t *)brain + MU_PORT_BRAIN_OVERLAY_OFFSET);
}

void mu_port_request_redraw(void *ctrl) { *((uint8_t *)ctrl + MU_PORT_CTRL_REDRAW_OFFSET) = 1; }

void mu_port_led_set(void *mgr, int32_t led, int32_t mode, int32_t colour) {
    typedef void (*led_fn)(void *mgr, int32_t led, int32_t mode, int32_t colour);
    ((led_fn)(uintptr_t)MU_PORT_LED_SET_AT)(mgr, led, mode, colour);
}

uint32_t mu_port_buffer_guard(void) {
    return (uint32_t)(uintptr_t)fw_pattern ^ ((uint32_t)(uintptr_t)fw_project >> 4);
}

/* The UI tick's device boundary (declared by tick.h) */
int32_t mu_dev_track_info(int32_t track, struct mu_track_info *out) {
    struct sq_track info;
    if (track < 0 || (uint32_t)track >= MU_PORT_TRACKS)
        return -1;
    if (sq_track_info(track, &info, sizeof info) != 0)
        return -1;
    out->len = info.len;
    out->master = info.master;
    out->note = info.note;
    out->root = info.root;
    out->scale = info.scale == SQ_SCALE_NONE ? -1 : info.scale;
    return 0;
}

int32_t mu_dev_sound_base(struct mu_base out[MU_PORT_TRACKS]) {
    uint8_t *kit = fw_kit;
    uint32_t t;
    if (!kit)
        return -1;
    for (t = 0; t < MU_PORT_TRACKS; t++) {
        out[t].freq = FW_SOUND_SLOT(kit, t, MU_PORT_SOUND_FREQ_SLOT); /* FLTR FREQ, measured 1.44 */
        out[t].vol = FW_SOUND_SLOT(kit, t, MU_PORT_SOUND_VOL_SLOT);   /* AMP VOL, measured 1.44 */
    }
    return 0;
}
