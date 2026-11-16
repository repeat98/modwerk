/* SPDX-License-Identifier: MIT
 * Private measurement wrapper, never part of runtime-build.json.
 * The private builder redirects the descriptor to this wrapper and module_tick
 * to fract_probe_tick. The original renderer and UI tick remain unchanged.
 * All base accesses are reads at addresses pinned by the private build receipt.
 */
#include <stdint.h>
#include "render.h"
#include "modwerk_module.h"
#include "probe_addresses.h"

#ifndef FRACT_PROBE_CLOCK
#define FRACT_PROBE_CLOCK() (*(volatile uint32_t *)0xfc07c00cu)
#endif
#ifndef FRACT_PROBE_READ
#define FRACT_PROBE_READ(address) (*(volatile uint32_t *)(uintptr_t)(address))
#endif

void module_tick(struct modwerk_runtime_api *api);
enum { BLOCK_MAX, CALL_MAX, TOTAL, CALLS, CONTEXT, CALLS_MAX, FIELDS };
static volatile uint32_t sequence, counters[FIELDS];
static uint32_t frame_id, block_ticks, block_calls, frame_seen;
static uint32_t last_time, last_idle, last_frames, last_total, last_calls;
static uint32_t pending[16], sending[16], epoch, sending_epoch, page, initialized;

int fract_probe_render(unsigned track, unsigned ping, unsigned start, unsigned end)
{
    uint32_t frame = FRACT_PROBE_READ(FRACT_PROBE_FRAMES);
    uint32_t at = FRACT_PROBE_CLOCK();
    int result = og_machine_render(track, ping, start, end);
    uint32_t elapsed = FRACT_PROBE_CLOCK() - at;
    ++sequence;
    if (!frame_seen || frame != frame_id) {
        frame_seen = 1; frame_id = frame; block_ticks = block_calls = 0;
    }
    block_ticks += elapsed; ++block_calls;
    counters[TOTAL] += elapsed; ++counters[CALLS];
    if (elapsed > counters[CALL_MAX]) counters[CALL_MAX] = elapsed;
    if (block_calls > counters[CALLS_MAX]) counters[CALLS_MAX] = block_calls;
    if (block_ticks > counters[BLOCK_MAX]) {
        counters[BLOCK_MAX] = block_ticks;
        counters[CONTEXT] = (track & 7u) << 16 | (start & 31u) << 8 | (end & 31u);
    }
    ++sequence;
    return result;
}

static uint32_t bounded(uint32_t value, uint32_t *flags)
{
    if (value > 0xfffffu) { *flags |= 4u; return 0xfffffu; }
    return value;
}

/* The renderer is called by the frame IRQ; the UI tick cannot preempt it.
 * Its volatile counter stores are bracketed by odd/even sequence stores.
 * One bounded seqlock attempt; never mask interrupts, wait or write the base.
 * Tags 3/4 are lifetime peaks since probe installation. Tag 8 is the base's
 * longest frame since boot/reset, NOT a window maximum. Other deltas are
 * per publishing window. 132 MHz timer counts are not ColdFire CPU cycles.
 */
void fract_probe_tick(struct modwerk_runtime_api *api)
{
    module_tick(api);
    uint32_t before = sequence, copy[FIELDS];
    if (!(before & 1u)) {
        for (unsigned i = 0; i < FIELDS; ++i) copy[i] = counters[i];
        if (before == sequence) {
            uint32_t now = FRACT_PROBE_CLOCK();
            uint32_t idle = FRACT_PROBE_READ(FRACT_PROBE_IDLE);
            uint32_t frames = FRACT_PROBE_READ(FRACT_PROBE_FRAMES);
            uint32_t elapsed = now - last_time;
            if (initialized && elapsed >= 132000000u) {
                uint32_t flags = 1u;
                if (elapsed > 8u * 132000000u) flags |= 2u;
                pending[0] = 0x46523u; pending[15] = 0x454e4u;
                pending[1] = bounded(elapsed >> 10, &flags);
                pending[2] = bounded((copy[TOTAL] - last_total) >> 10, &flags);
                pending[3] = bounded(copy[BLOCK_MAX], &flags);
                pending[4] = bounded(copy[CALL_MAX], &flags);
                pending[5] = bounded(copy[CALLS] - last_calls, &flags);
                pending[6] = bounded(frames - last_frames, &flags);
                pending[7] = bounded((idle - last_idle) >> 10, &flags);
                pending[8] = bounded(FRACT_PROBE_READ(FRACT_PROBE_FRAME_MAX), &flags);
                pending[9] = bounded(FRACT_PROBE_READ(FRACT_PROBE_SHARE), &flags);
                pending[10] = bounded(FRACT_PROBE_READ(FRACT_PROBE_SHEDS), &flags);
                pending[11] = copy[CONTEXT];
                pending[12] = bounded(copy[CALLS_MAX], &flags);
                pending[13] = 3u; /* protocol version, distinct from the older phase probe */
                if (copy[CALLS_MAX] > 2u) flags |= 8u;
                pending[14] = flags;
                epoch = (epoch + 1u) & 255u;
            }
            if (!initialized || elapsed >= 132000000u) {
                initialized = 1; last_time = now; last_idle = idle;
                last_frames = frames; last_total = copy[TOTAL]; last_calls = copy[CALLS];
            }
        }
    }
    if (!page) {
        for (unsigned i = 0; i < 16u; ++i) sending[i] = pending[i];
        sending_epoch = epoch;
    }
    unsigned tag = page >> 1;
    api->value = tag << 28 | sending_epoch << 20 | sending[tag];
    page = (page + 1u) & 31u;
}
