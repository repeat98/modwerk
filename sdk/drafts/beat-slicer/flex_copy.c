/* SPDX-License-Identifier: MIT */
#include "flex_copy.h"
static int range(uintptr_t p, uint32_t n, const uint8_t *base, uint32_t size, uint32_t alignment) {
    return p && base && !(p%alignment) && p >= (uintptr_t)base && n <= size &&
        p-(uintptr_t)base <= size-n && (uintptr_t)base <= UINTPTR_MAX-size;
}
enum bs_provider_reply bs_flex_copy_locked(const struct bs_flex_binding *b,
        const struct bs_source_snapshot *s, const struct bs_pcm_read *r,
        uint8_t *out, uint32_t capacity, uint32_t *bytes) {
    uint32_t format, width, per_page, owned, used, offset, page, within, physical;
    uint32_t expected_run, count, n, i;
    const volatile uint32_t *control, *offsets;
    const volatile uint16_t *pages;
    const uint8_t *expected;
    struct bs_pool_span span;
    if (!b || !s || !r || !out || !bytes || !b->ready || !b->controls || !b->formats ||
        !b->pages_at || !b->offsets_at || !b->counts || !b->used || !b->pool || !b->query ||
        !b->lookup_entry || !b->page_bytes || !b->physical_pages || !b->map_capacity ||
        b->map_capacity > 0x7fffffffu ||
        b->physical_pages > 0xffffffffu/b->page_bytes ||
        b->physical_pages*b->page_bytes > b->pool_bytes ||
        (uintptr_t)b->pool > UINTPTR_MAX-b->pool_bytes)
        return BS_PROVIDER_UNSUPPORTED;
    if (s->kind != BS_SOURCE_FLEX || s->slot >= 128 || !s->frames || s->frames > 0x7fffffffu ||
        s->format.little_endian || (s->format.bits != 16 && s->format.bits != 24) ||
        (s->format.channels != 1 && s->format.channels != 2)) return BS_PROVIDER_UNSUPPORTED;
    if (!r->count || r->count > BS_PCM_BLOCK_FRAMES || r->first >= s->frames ||
        r->count > s->frames-r->first) return BS_PROVIDER_FAILED;
    width = s->format.bits/8*s->format.channels;
    if (capacity < r->count*width) return BS_PROVIDER_FAILED;
    if (!*b->ready) return BS_PROVIDER_UNSUPPORTED;
    control = b->controls+11*s->slot;
    format = control[0];
    if (format > 3 || control[2] || control[4] != s->frames ||
        (format & 2 ? 16u : 24u) != s->format.bits ||
        (format & 1 ? 2u : 1u) != s->format.channels || b->page_bytes%width)
        return BS_PROVIDER_UNSUPPORTED;
    per_page = b->page_bytes/width;
    if (b->formats[4*format+1] != per_page || b->formats[4*format+2] != width)
        return BS_PROVIDER_UNSUPPORTED;
    used = *b->used; owned = b->counts[s->slot];
    pages = (const volatile uint16_t *)*b->pages_at;
    offsets = (const volatile uint32_t *)*b->offsets_at;
    if (!used || used > b->map_capacity || !owned ||
        owned < 1+(s->frames-1)/per_page) return BS_PROVIDER_UNSUPPORTED;
    if (!range((uintptr_t)pages, used*2, b->pages_region, b->pages_region_bytes, 2) ||
        !range((uintptr_t)offsets, 128*4, b->offsets_region, b->offsets_region_bytes, 4))
        return BS_PROVIDER_UNSUPPORTED;
    offset = offsets[s->slot];
    if (offset > used || owned > used-offset) return BS_PROVIDER_UNSUPPORTED;
    page = r->first/per_page; within = r->first%per_page;
    if (page >= owned) return BS_PROVIDER_UNSUPPORTED;
    physical = pages[offset+page];
    if (physical >= b->physical_pages) return BS_PROVIDER_UNSUPPORTED;
    expected = b->pool+physical*b->page_bytes+within*width;
    expected_run = per_page-within;
    if (expected_run > s->frames-r->first) expected_run = s->frames-r->first;
    span.data = 0; span.frames = 0;
    b->query(b->lookup_entry, s->slot, r->first, &span);
    if (span.data != expected || span.frames != expected_run) return BS_PROVIDER_FAILED;
    count = r->count < expected_run ? r->count : expected_run;
    n = count*width;
    for (i = 0; i < n; ++i) out[i] = span.data[i];
    *bytes = n;
    return BS_PROVIDER_READY;
}
