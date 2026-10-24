/* SPDX-License-Identifier: MIT */
#ifndef BEAT_SLICER_FLEX_COPY_H
#define BEAT_SLICER_FLEX_COPY_H
#include "preview_session.h"
#include <stddef.h>
struct bs_pool_span { const uint8_t *data; uint32_t frames; };
typedef void (*bs_pool_query)(uint32_t entry, uint32_t slot, uint32_t frame, struct bs_pool_span *);
/* Draft binding to a verified firmware's Flex metadata, not an exported ABI.
 * Every pointer/extent and the lookup entry must first be verified by the base.
 * Controls: 44 bytes/slot; format at +0, busy/status at +8, frames at +16.
 * Formats: 16 bytes/entry; frames/page at +4, bytes/frame at +8.
 * Page-map pointers are fetched anew on every copy, never retained across yield.
 */
struct bs_flex_binding {
    const volatile uint32_t *ready, *controls, *formats;
    const volatile uintptr_t *pages_at, *offsets_at;
    const volatile uint16_t *counts;
    const volatile uint32_t *used;
    const uint8_t *pool;
    const uint8_t *pages_region, *offsets_region;
    uint32_t pages_region_bytes, offsets_region_bytes;
    uint32_t pool_bytes, page_bytes, physical_pages, map_capacity, lookup_entry;
    bs_pool_query query;
};
/* Caller holds the SAME verified native ownership boundary as every source/
 * map writer and validates the session token before/after this call. This code
 * provides no lock, generation tracking, hook, source admission or scheduling.
 * Bindings/context outlive the call; every described memory region is readable.
 * No Static/recorder/little-endian source. No raw pointer escapes the copy.
 * Refusal leaves output and bytes unchanged; inputs/outputs must not overlap.
 */
enum bs_provider_reply bs_flex_copy_locked(const struct bs_flex_binding *,
    const struct bs_source_snapshot *, const struct bs_pcm_read *,
    uint8_t *out, uint32_t capacity, uint32_t *bytes);
/* ColdFire-only ABI shim, supplied by flex_lookup.S. It calls a reviewed entry
 * with (slot, frame, forward=1), captures D0/D1 and preserves callee-save state.
 * Never call without the validated lookup preconditions above.
 */
void bs_flex_stock_query(uint32_t entry, uint32_t slot, uint32_t frame, struct bs_pool_span *);
#endif
