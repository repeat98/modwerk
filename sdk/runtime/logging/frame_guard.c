/* Original frame guard for loader-free builds, the USB base's (machine_registry.c) on stock's record packer.
 * The frame interrupt renders each track's source twice a frame; kept near a whole frame by module voices (POLY8,
 * VECTOR, FM Synth) it stops the DSP's audio for good (docs/OCTATRACK_HARDWARE_TRAPS.md). So the interrupt has a
 * budget: each frame earns SHARE, short frames save up to BURST, long ones spend it. A module machine's render that
 * would overdraw renders stock's silent source instead: a dropout on that track, never a frozen unit. Stock tracks and
 * Analog BD (its voice is the DSP's) always render. A skipped render comes back when the budget has room for its last
 * cost, or, every PROBE frames, when it would overdraw by at most SLACK. */
#include <stdint.h>
#include "octamod_log_port.h"
#ifndef OLOG_DTCN3
#define OLOG_DTCN3 (*(volatile uint32_t *)0xfc07c00cu) /* the frame timer: 132 MHz, free-running */
#define OLOG_RAM(a) ((const volatile uint8_t *)(uintptr_t)(a))
#define OLOG_SILENT ((Render *)0x400047f0u)          /* stock's silent source */
#endif
#define FRAME 47891u /* 16 samples at 44.1 kHz, in DTCN3 counts */
#define SHARE (FRAME / 5u * 4u)
#define BURST (FRAME / 2u)
#define SLACK (FRAME / 10u)
#define PROBE 1024u /* frames, about 0.37 s */
typedef int Render(unsigned track, unsigned ping, unsigned start, unsigned end);
Render *volatile olog_render_fn = 0; /* the packer's renderer for this call, set by the hook */
volatile uint32_t olog_frame_t0 = 0, olog_frame_sheds = 0, olog_frame_shed_tracks = 0;
volatile uint32_t olog_machine_mask = 0; /* the tracks the hooks guard; a track's other renders go straight through */
static int32_t credit = 0;
static uint32_t cost[16] = {0}, after[16] = {0}, end_at[16] = {0}, timed = 0; /* [track], [8 + track] */
static uint16_t skipped[16] = {0};
/* The STATIC and FLEX tracks whose Part slot carries a ColdFire machine's signature, as the card machine registry
 * and FM Synth read it (shared-machine.c owner(), poly.s fm_is_native). */
static uint32_t machines(void)
{
    uint32_t bank = *(const volatile uint32_t *)OLOG_RAM(0x46c82456u), mask = 0;
    if (bank < 0x40000000u || bank >= 0x47f00000u) return 0;
    const volatile uint8_t *part = OLOG_RAM(bank + 0x8ed80u + (*OLOG_RAM(0x100b14cfu) & 3u) * 6322u);
    for (unsigned t = 0; t < 8u; ++t) {
        const volatile uint8_t *s = part + 60u + 30u * t;
        if (part[0x22u + t] <= 1u && ((s[0] == 'P' && s[1] == 'L' && s[2] == 1u) || (s[0] == 'F' && s[1] == 'M' && s[2] == 1u) ||
                                      (s[0] == 'S' && s[1] == '2' && (s[2] == 1u || s[2] == 2u))))
            mask |= 1u << t;
    }
    return mask;
}
void olog_frame_exit(void)
{
    uint32_t now = OLOG_DTCN3, d = now - olog_frame_t0;
    int32_t c = credit + (int32_t)SHARE - (int32_t)d;
    credit = c > (int32_t)BURST ? (int32_t)BURST : c < -(int32_t)FRAME ? -(int32_t)FRAME : c;
    for (unsigned k = 0; k < 16u; ++k) if (timed >> k & 1u) after[k] = now - end_at[k];
    timed = 0;
    olog_machine_mask = machines(); /* for the next frame: a Part change reaches the guard one frame late */
}
/* Called by the hooks for a track in olog_machine_mask only. */
static int guarded(unsigned k, unsigned track, unsigned ping, unsigned start, unsigned end)
{
    Render *f = olog_render_fn;
    uint32_t at = OLOG_DTCN3; int r;
    int32_t over = (int32_t)(at - olog_frame_t0 + cost[k] + after[k]) - credit - (int32_t)SHARE;
    if (over > 0 && (over > (int32_t)SLACK || ++skipped[k] < PROBE)) {
        olog_frame_sheds = olog_frame_sheds + 1u, olog_frame_shed_tracks |= 1u << track;
        r = OLOG_SILENT(track, ping, start, end);
    } else {
        skipped[k] = 0;
        r = f(track, ping, start, end);
        uint32_t c = OLOG_DTCN3 - at, fall = cost[k] - (cost[k] >> 3);
        cost[k] = c > fall ? c : fall; /* a rise at once, a fall by an eighth a frame */
    }
    end_at[k] = OLOG_DTCN3, timed |= 1u << k;
    return r;
}
int olog_render_first(unsigned track, unsigned ping, unsigned start, unsigned end)
{
    return guarded(track & 7u, track, ping, start, end);
}
int olog_render_second(unsigned track, unsigned ping, unsigned start, unsigned end)
{
    return guarded(8u + (track & 7u), track, ping, start, end);
}
/* GRD 0001: the renders silenced since the last record and their tracks, at most one record per 10 s. Called from
 * the engine's idle point before the recorder (package.py), never from the interrupt. */
void olog_frame_report(void)
{
    static uint32_t reported = 0, at = 0;
    uint32_t sheds = olog_frame_sheds, now = octamod_log_ticks();
    if (sheds == reported || (uint32_t)(now - at) < 600u) return;
    octamod_log_event(OLOG_W, OLOG_TAG('G', 'R', 'D', 0), 1, sheds - reported, olog_frame_shed_tracks);
    reported = sheds, at = now, olog_frame_shed_tracks = 0;
}
