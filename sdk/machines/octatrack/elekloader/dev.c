/* SPDX-License-Identifier: GPL-3.0-or-later
 * Development bases only (build_core.py --dev): drive and watch the unit over
 * the vendor interface, so a bug can be reproduced without anyone at it.
 * Never in a base users install.
 *
 *   KEY    0xC1, bRequest 5, wValue = code | pressed << 8, wLength 1:
 *          the key as the panel reports it (boot.c); replies 1.
 *   STATE  0xC1, bRequest 6, wValue 0, wLength 2: {stopped, recording}.
 *   PANEL  0xC1, bRequest 8, wValue = first | second << 8, wLength 1: an
 *          encoder turn {0x30 | encoder 0..6, signed delta} or the fader
 *          {0x40, 0..255} as the panel sends it; replies 1.
 *   LOADER 0xC1, bRequest 9, wValue 0, wLength 60 (bases built with
 *          --dsp-loader): 15 big-endian words of the DSP loader's state.
 *   REPORT 0xC1, bRequest 11, wValue 0, wLength 4 x DSP_REPORT_WORDS (--dsp-loader):
 *          modwerk_dsp_report's big-endian words (dsp.c).
 *   PROBE  0xC1, bRequest 12, wValue = core 0/1, wLength 1 (--dsp-loader):
 *          modwerk_dsp_probe(core), one no-op packet; replies its result.
 *   METER  0xC1, bRequest 13, wValue = core 0/1, wLength 1 (--dsp-loader): read the
 *          load meter's last window back (REPORT shows it); replies 1 when started.
 *   MEM    0xC1, bRequest 15, wValue = an address's high half, wLength 1: kept for MEM;
 *          bRequest 16, wValue = its low half, wLength 1-511 but never a multiple of 64: that
 *          many bytes from there, for the host to decode the UI (device.mjs ui). Read-only, and
 *          only RAM the base knows is RAM: the OS image and base, stock's variables, the
 *          0x80000000 block and battery RAM. Anything else is not answered.
 *   SCREEN 0xC1, bRequest 7, wValue 0, wLength 1028: "MWLC" and the last
 *          composed 128x64 frame (ev_draw: 8 bytes a column, bit 7 = row 0).
 *
 * Replies are never a whole number of 64-byte packets (vendor.h). */
#include "boot.h"
#include "usb_base.h"
#include "loader.h"
#ifdef MODWERK_DSP_LOADER
#include "transfer.h"
#include "selection.h"
#include "allocator.h"
#include "runtime.h"
#include "fxids.h"
fx_set modwerk_dsp_used(void);
int modwerk_dsp_probe(unsigned core);
int modwerk_dsp_meter_read(unsigned core, unsigned first, unsigned words);
extern volatile uint32_t modwerk_dsp_missing;
#endif

#define UNCACHED(p) ((uint8_t *)((uintptr_t)(p) + 0x08000000u))

static uint32_t mem_high;
static int ram(uint32_t at, uint32_t n)
{
    static const uint32_t spans[4][2] = {{0x40000400u, 0x40d00000u}, {0x46000000u, 0x47000000u},
                                         {0x80000000u, 0x80010000u}, {0x100f0000u, 0x10100000u}};
    for (unsigned i = 0; i < 4u; ++i) if (at >= spans[i][0] && at + n <= spans[i][1] && at + n > at) return 1;
    return 0;
}
/* One 4 KiB page: usb_ep0_send fills only the first page of its descriptor. */
static uint8_t screen[1028] __attribute__((aligned(2048)));

/* ev_draw, after the modules' own drawing (order 95). */
void modwerk_dev_draw(unsigned char *frame);
void modwerk_dev_draw(unsigned char *frame)
{
    uint8_t *s = UNCACHED(screen);
    for (unsigned i = 0; i < 1024; ++i) s[4 + i] = frame[i];
}

/* From ep0.c's unknown-request tail, for requests the transport stalls: a
 * reply length with *reply set, or 0 when the request is not one of these. */
uint32_t modwerk_dev_request(const uint8_t *s, const uint8_t **reply, uint8_t *out);
uint32_t modwerk_dev_request(const uint8_t *s, const uint8_t **reply, uint8_t *out)
{
    uint32_t want = s[6] | (uint32_t)s[7] << 8;
    if (s[0] != 0xc1 || s[4] != MODWERK_VENDOR_INTERFACE || s[5]) return 0;
    if (s[1] == 5 && want == 1 && s[2] < 64u && s[3] <= 1u) {
        modwerk_post_key(s[2], s[3]);
        out[0] = 1;
        *reply = out;
        return 1;
    }
    if (s[1] == 17 && want == 1 && !s[2] && !s[3]) { /* CRASH TEST: an illegal instruction on the next tick (crash.c) */
        extern volatile uint32_t modwerk_crash_test;
        modwerk_crash_test = 1;
        out[0] = 1;
        *reply = out;
        return 1;
    }
    if (s[1] == 28 && want == 1 && s[2] >= 1u && s[2] <= 10u && !s[3]) { /* FREEZE TEST: diag.c holds the UI tick s[2] seconds */
        extern volatile uint32_t modwerk_diag_test_freeze;
        modwerk_diag_test_freeze = s[2];
        out[0] = 1;
        *reply = out;
        return 1;
    }
    if (s[1] == 18 && want == 1 && !s[2] && !s[3]) { /* STALL RECORD TEST: dsp.c's record, reason 0, nothing recovered */
        void modwerk_dsp_stall_record(unsigned reason);
        modwerk_dsp_stall_record(0);
        out[0] = 1;
        *reply = out;
        return 1;
    }
    if (s[1] == 19 && want == 1 && s[2] <= 1u && !s[3]) { /* PEEK STORM on (1) or off (0): build_core.py's transfer.c edit */
        extern volatile uint32_t dl_storm;
        dl_storm = s[2];
        out[0] = 1;
        *reply = out;
        return 1;
    }
    if (s[1] == 20 && want == 1) { /* MASK TEST: dsp.c's next tick masks interrupts for s[2] | s[3] << 8 microseconds */
        extern volatile uint32_t modwerk_dsp_mask_test;
        modwerk_dsp_mask_test = s[2] | (uint32_t)s[3] << 8;
        out[0] = 1;
        *reply = out;
        return 1;
    }
    if (s[1] == 22 && want == 1 && s[2] <= 9u && !s[3]) { /* HOLD TEST: ep0.c holds host frames s[2] seconds, as after a boot */
        extern volatile uint32_t modwerk_ep0_hold_until;
        modwerk_ep0_hold_until = modwerk_runtime_ticks + 60u * s[2];
        out[0] = 1;
        *reply = out;
        return 1;
    }
    if (s[1] == 15 && want == 1) {
        mem_high = s[2] | (uint32_t)s[3] << 8;
        out[0] = 1;
        *reply = out;
        return 1;
    }
    if (s[1] == 16 && want && want < 512u && want % 64u) {
        uint32_t at = mem_high << 16 | s[2] | (uint32_t)s[3] << 8;
        if (!ram(at, want)) return 0;
        for (uint32_t i = 0; i < want; ++i) out[i] = ((const volatile uint8_t *)(uintptr_t)at)[i];
        *reply = out;
        return want;
    }
    if (s[1] == 6 && want == 2 && !s[2] && !s[3]) {
        out[0] = (uint8_t)modwerk_machine_stopped();
        out[1] = (uint8_t)modwerk_boot_recording();
        *reply = out;
        return 2;
    }
    if (s[1] == 8 && want == 1 && ((s[2] >= 0x30u && s[2] <= 0x36u && s[3]) || s[2] == 0x40u)) {
        modwerk_panel_bytes(s[2], s[3]);
        out[0] = 1;
        *reply = out;
        return 1;
    }
#ifdef MODWERK_DSP_LOADER
    /* LOADER: frames, accepted/rejected per core, errors, requests, the cores' job
     * status (0 pending, 1 complete, -1 failure, -2 idle), pools, refusals, missing. */
    if (s[1] == 9 && want == 60 && !s[2] && !s[3]) {
        uint32_t w[15] = {dl_frames, dl_accepted[0], dl_accepted[1], dl_rejected[0], dl_rejected[1], dl_errors,
                          dl_request_probe, dl_request_stage, (uint32_t)dl_job_status(0), (uint32_t)dl_job_status(1),
                          dl_pool_words[0], dl_pool_words[1], dl_selection_refused, modwerk_dsp_missing, modwerk_dsp_used().w[0]};
        for (unsigned i = 0; i < 60; ++i) out[i] = (uint8_t)(w[i / 4] >> (24 - 8 * (i % 4)));
        *reply = out;
        return 60;
    }
    if (s[1] == 12 && want == 1 && s[2] <= 1u && !s[3]) {
        out[0] = (uint8_t)modwerk_dsp_probe(s[2]);
        *reply = out;
        return 1;
    }
    /* MEMORY MAP: the module pool, each core's code arena, buffer blocks, then 32 packages a page (wValue the page;
     * past the last the request stalls, so a host reads on until then). Page 0 is the layout from before pages. */
    if (s[1] == 24 && want == 276u && s[2] < MODWERK_FX_WORDS && !s[3]) {
        extern struct dl_package dl_catalog[MODWERK_FX_IDS];
        extern const uint16_t modwerk_dsp_arena[2];
        int dl_placed(unsigned c, unsigned p);
        uint32_t dl_buffers_in_use(void);
        uint32_t largest, words[3];
        words[0] = modwerk_runtime_free(&largest), words[1] = largest, words[2] = dl_buffers_in_use();
        out[0] = 'M', out[1] = 'W', out[2] = 'M', out[3] = 'P';
        for (unsigned i = 0; i < 3u; ++i)
            for (unsigned b = 0; b < 4u; ++b) out[(i < 2u ? 4u + 4u * i : 16u) + b] = (uint8_t)(words[i] >> (24 - 8 * b));
        out[12] = (uint8_t)(modwerk_dsp_arena[0] >> 8), out[13] = (uint8_t)modwerk_dsp_arena[0];
        out[14] = (uint8_t)(modwerk_dsp_arena[1] >> 8), out[15] = (uint8_t)modwerk_dsp_arena[1];
        for (unsigned c = 0; c < 2u; ++c) /* per package: where its code starts (0xffff none) and its words */
            for (unsigned i = 0; i < 32u; ++i) {
                unsigned p = 32u * s[2] + i;
                int at = p < MODWERK_FX_IDS ? dl_placed(c, p) : -1;
                uint8_t *e = out + 20u + 4u * (32u * c + i);
                uint16_t where = at < 0 ? 0xffffu : (uint16_t)at, n = at < 0 ? 0 : dl_catalog[p].words;
                e[0] = (uint8_t)(where >> 8), e[1] = (uint8_t)where, e[2] = (uint8_t)(n >> 8), e[3] = (uint8_t)n;
            }
        *reply = out;
        return 276;
    }
    if (s[1] == 25 && want == 8 && s[2] <= 1u && !s[3]) { /* COMPACT: start packing the code (1), or read: step, counts */
        extern volatile uint32_t modwerk_dsp_compact_step, modwerk_dsp_compact_counts;
        int modwerk_dsp_compact(void);
        uint32_t step = s[2] ? (uint32_t)modwerk_dsp_compact() : modwerk_dsp_compact_step, counts = modwerk_dsp_compact_counts;
        for (unsigned b = 0; b < 4u; ++b) out[b] = (uint8_t)(step >> (24 - 8 * b)), out[4 + b] = (uint8_t)(counts >> (24 - 8 * b));
        *reply = out;
        return 8;
    }
    if (s[1] == 29 && want == 28u) { /* GUARD: the frame guard (machine_registry.c); wValue its share in per mille of a frame
                                        * (0 keeps it): since the last read the longest frame interrupt, the latest start, the
                                        * time in it (/256) and its frames; the skips, their tracks; the share */
        extern volatile uint32_t mw_frame_max, mw_frame_late_max, mw_frame_busy, mw_frame_count, mw_frame_sheds,
            mw_frame_shed_tracks, mw_frame_share;
        unsigned mille = s[2] | (unsigned)s[3] << 8;
        if (mille) mw_frame_share = 47891u / 100u * mille / 10u;
        uint32_t v[7] = {mw_frame_max, mw_frame_late_max, mw_frame_busy, mw_frame_count, mw_frame_sheds, mw_frame_shed_tracks,
                         mw_frame_share};
        mw_frame_max = mw_frame_late_max = mw_frame_busy = mw_frame_count = 0;
        for (unsigned i = 0; i < 28u; ++i) out[i] = (uint8_t)(v[i / 4u] >> (24 - 8 * (i % 4u)));
        *reply = out;
        return 28;
    }
    if (s[1] == 23 && want == 4 && !s[2] && !s[3]) { /* GAP: the longest time between two frames since the last read, DTCN3 counts */
        extern volatile uint32_t dl_frame_gap;
        uint32_t gap = dl_frame_gap;
        dl_frame_gap = 0;
        out[0] = (uint8_t)(gap >> 24), out[1] = (uint8_t)(gap >> 16), out[2] = (uint8_t)(gap >> 8), out[3] = (uint8_t)gap;
        *reply = out;
        return 4;
    }
#ifdef MODWERK_DSP_XWATCH
    /* XWATCH (probe X bases): wValue core | 0x100 starts reading the X watch's words on that core (1 started, 0 busy:
     * ask again); wValue core reads them back: the core read, bits read (96 done), changed, first, its value, passes. */
    if (s[1] == 26 && s[2] <= 1u && s[3] <= 1u && want == (s[3] ? 1u : 24u)) {
        extern volatile int32_t modwerk_dsp_xwatch_core;
        extern volatile uint32_t modwerk_dsp_xwatch_bits, modwerk_dsp_xwatch[4];
        int modwerk_dsp_xwatch_read(unsigned core);
        if (s[3]) out[0] = (uint8_t)modwerk_dsp_xwatch_read(s[2]);
        else {
            uint32_t w[6] = {(uint32_t)modwerk_dsp_xwatch_core, modwerk_dsp_xwatch_bits, modwerk_dsp_xwatch[0], modwerk_dsp_xwatch[1],
                             modwerk_dsp_xwatch[2], modwerk_dsp_xwatch[3]};
            for (unsigned i = 0; i < 24u; ++i) out[i] = (uint8_t)(w[i / 4] >> (24 - 8 * (i % 4)));
        }
        *reply = out;
        return s[3] ? 1 : 24;
    }
#endif
    if (s[1] == 13 && want == 1 && s[2] <= 1u && !s[3]) {
        out[0] = (uint8_t)modwerk_dsp_meter_read(s[2], 0, 5);
        *reply = out;
        return 1;
    }
    if (s[1] == 11 && want == 4u * DSP_REPORT_WORDS && !s[2] && !s[3]) {
        uint32_t w[DSP_REPORT_WORDS];
        modwerk_dsp_report(w);
        for (unsigned i = 0; i < 4u * DSP_REPORT_WORDS; ++i) out[i] = (uint8_t)(w[i / 4] >> (24 - 8 * (i % 4)));
        *reply = out;
        return 4u * DSP_REPORT_WORDS;
    }
#endif
    if (s[1] == 7 && want == sizeof screen && !s[2] && !s[3]) {
        uint8_t *u = UNCACHED(screen);
        u[0] = 'M'; u[1] = 'W'; u[2] = 'L'; u[3] = 'C';
        *reply = u;
        return sizeof screen;
    }
    return 0;
}
