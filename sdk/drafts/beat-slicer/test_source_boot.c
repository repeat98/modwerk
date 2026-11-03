/* SPDX-License-Identifier: MIT */
/* PRIVATE FULL-BOOT EMULATOR FIXTURE ONLY. Addresses are observations of the
 * pinned 1.40C MAIN, not an ABI. Admission/lifetimes are synthetic; masking is
 * not proof of complete writer ownership or safe hardware latency. Nothing
 * here is linked into a module or published base. */
#include "flex_source.h"
extern struct bs_preview_guard bs_worker_test_guard;
static struct bs_flex_metadata_binding metadata;
static struct bs_flex_binding pcm;
static struct bs_source_lifetime lifetime;
static struct bs_flex_source source;
struct bs_preview_session bs_boot_session;
/* The resident async UI has its own copied result. Omit this unused direct
 * result path only in that private composition; direct preview fixtures keep it. */
#ifndef BS_BOOT_NO_DIRECT_RESULT
struct bs_plan bs_boot_plan;
#endif
uint32_t bs_boot_queries, bs_boot_locks, bs_boot_unlocks;
static uint32_t saved_sr;
static int lock(void *context) {
    (void)context;
    __asm__ __volatile__("move.w %%sr,%0\n\tmove.w #0x2700,%%sr" : "=d"(saved_sr) :: "memory");
    ++bs_boot_locks;
    return 1;
}
static void unlock(void *context) {
    (void)context;
    ++bs_boot_unlocks;
    __asm__ __volatile__("move.w %0,%%sr" :: "d"(saved_sr) : "memory");
}
static void query(uint32_t entry, uint32_t slot, uint32_t frame, struct bs_pool_span *span) {
    ++bs_boot_queries;
    bs_flex_stock_query(entry, slot, frame, span);
}
uint32_t bs_boot_init(void) {
    metadata.ready = (const volatile uint32_t *)0x46105408u;
    metadata.controls = (const volatile uint32_t *)0x46c922c4u;
    metadata.control_words = 128*11;
    metadata.settings = (const volatile uint32_t *)0x100b14f0u;
    metadata.setting_words = 128*274;
    metadata.editor_kind = (const volatile uint32_t *)0x46c8d1a0u;
    metadata.editor_slot = (const volatile uint32_t *)0x46c8d19cu;
    metadata.project_bpm24 = (const volatile uint32_t *)0x80001814u;
    pcm.ready = metadata.ready; pcm.controls = metadata.controls;
    pcm.formats = (const volatile uint32_t *)0x80003c20u;
    pcm.pages_at = (const volatile uintptr_t *)0x80006914u;
    pcm.offsets_at = (const volatile uintptr_t *)0x80006918u;
    pcm.used = (const volatile uint32_t *)0x8000691cu;
    pcm.counts = (const volatile uint16_t *)0x46c75e88u;
    pcm.pool = (const uint8_t *)0x40a955e0u;
    pcm.pages_region = (const uint8_t *)0x46c2e9c0u;
    pcm.offsets_region = (const uint8_t *)0x46c2e580u;
    pcm.pages_region_bytes = 14602*2; pcm.offsets_region_bytes = 128*4;
    /* Eight reserved top pages; usable capacity excludes unused physical 0. */
    pcm.page_bytes = 6144; pcm.physical_pages = 14595;
    pcm.pool_bytes = 14595*6144; pcm.map_capacity = 14594;
    pcm.lookup_entry = 0x4009499cu; pcm.query = query;
    lifetime.owner_id = 1; lifetime.owner_generation = 2;
    lifetime.sample_id = 3; lifetime.sample_generation = 4;
    lifetime.editor_generation = 5; lifetime.playback_generation = 6;
    lifetime.slot = *metadata.editor_slot;
    source.metadata = &metadata; source.pcm = &pcm; source.identity = &lifetime;
    source.try_lock = lock; source.unlock = unlock; source.context = 0; source.held = 0;
    bs_session_init(&bs_boot_session, &bs_worker_test_guard, &bs_flex_source_backend, &source);
    return 0;
}
uint32_t bs_boot_begin(uint32_t tempo, uint32_t snap, uint32_t beats) {
    struct bs_preview_options options = {beats, snap, tempo};
    return bs_session_begin(&bs_boot_session, &options);
}
uint32_t bs_boot_step(void) { return bs_session_step(&bs_boot_session); }
#ifndef BS_BOOT_NO_DIRECT_RESULT
uint32_t bs_boot_result(void) { return (uint32_t)bs_session_result(&bs_boot_session, &bs_boot_plan); }
#endif
