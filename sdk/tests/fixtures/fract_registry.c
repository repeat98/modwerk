/* Authored integration: real FRACT descriptor/START/render and real base
 * registry. AB/FM, native packet producer, timer and MMIO remain test models.
 * The generated include uses the private FR/1 boot profile only. */
#define OG_FIXTURE_REGISTRY
#define main fract_fixture_main
#include "fract_machine.c"
#undef main
#undef U8
#undef U32
#define main registry_regression_main
#define voices registry_voices
#include "registry_fixture.c"
#undef voices
#undef main

static uint8_t *registry_memory(uintptr_t at, unsigned count) {
    for (unsigned i = 0; i < sizeof segments / sizeof *segments; ++i)
        if (at >= segments[i].base && at - segments[i].base < segments[i].size) {
            assert(count <= segments[i].size - (at - segments[i].base));
            return segments[i].bytes + at - segments[i].base;
        }
    fprintf(stderr, "unmapped registry address %#lx/%u\n", (unsigned long)at, count);
    assert(!"unexpected registry memory access");
    return NULL;
}
static uint32_t registry_word(uintptr_t at) {
    /* Secondary native modal is closed in this fixture. */
    return at == 0x460e5e30u ? 0 : host_u32((uint32_t)at);
}
static unsigned control_offset(unsigned track, unsigned k) {
    return (k < 6 ? 0x2a : 0x1da) + 30 * track + 6 + k % 6;
}
static void choose(unsigned track, unsigned row) {
    unsigned type = mw_assign(part0(), track, row);
    assert(type != (unsigned)-1);
    part0()[0x22 + track] = sram[0x22 + track] = (uint8_t)type;
}
static unsigned pool_opens, pool_lefts;
static void fixture_pool_open(void) {
    ++pool_opens;
    unsigned t = U8(0x100b14ccu);
    /* The native open routine asks the chooser before publishing its window. */
    assert(mw_chooser_type(1, slot(t)) == 1);
    put_u32(0x460e70e0u, 1); put_u32(0x460e739au, 1);
}
static void fixture_pool_left(unsigned key, unsigned edge) {
    assert(key == 52 && edge == 1); ++pool_lefts;
    put_u32(0x460e739au, 0);
}
static void prepare_audio(unsigned track, unsigned ping) {
    machine_tracks = (uint8_t)(1u << track); /* native producer's fixture only */
    source_record = 0x80000510u + ping * 384u + track * 48u;
    current_ping = ping;
    packet_cursor = 0x80001c90u + ping * 0xa80u + track * 336u;
    stock_packet_frames = 16;
    for (unsigned k = 0; k < 6; ++k) {
        put(source_record + 2 * k, 2, part0()[control_offset(track, k)] * 256u);
        put(source_record + 24 + k, 1, part0()[control_offset(track, 6 + k)]);
    }
    expected_sample = 0; expected_flags = 0xc0;
    expected_pitch = 64; /* unused legacy SETUP E is ignored */
}
static void reset_registry(void) {
    rows(NULL, 0, NULL, 0);
    memset(bank, 0, sizeof bank); memset(sram, 0, sizeof sram);
    memset(misc, 0, sizeof misc); memset((void *)start_row, 0, sizeof start_row);
    memset((void *)start_refused, 0, sizeof start_refused);
    put_u32(BANK, 0x46000000u); fresh(); host_timer = 0;
    mw_frame_share = FRAME / 5u * 4u;
    og_controls_tracks = 0; fixture_control_writes = 0;
    fixture_main_writes = 0;
    memset(live_controls, 0xa5, sizeof live_controls);
}
int main(void) {
    assert(!registry_regression_main()); /* retain all base fixture checks */
    const void *all[] = {&A, &F, &og_machine_descriptor};
    unsigned renders = 0;
    for (unsigned track = 0; track < 8; ++track)
      for (unsigned ping = 0; ping < 2; ++ping) {
        reset_registry(); fixture(3, 2049);
        rows(all, 3, NULL, 0);
        start_row[0] = (uintptr_t)&og_machine_start_descriptor;
        assert(!strcmp(mw_name(5), "ANALOG BD"));
        assert(!strcmp(mw_name(6), "FM SYNTH"));
        assert(!strcmp(mw_name(7), "FRACT"));
        assert(code[0x0b] == 8 && code[0x21] == 7);
        choose(track, 7);
        /* Native commit must finish before the live cache receives all12
         * values. Subsequent ticks must not override locks or modulation. */
        assert(!fixture_control_writes && og_controls_tracks == (1u << track));
        og_machine_descriptor.ui_tick();
        assert(fixture_control_writes == 6 && !og_controls_tracks);
        assert(fixture_main_writes == 6);
        assert(fixture_control_track == track && fixture_control_index == 5 &&
               fixture_control_value == og_machine_defaults[5]);
        for (unsigned i = 0; i < sizeof live_controls; ++i)
            assert(live_controls[i] == (i >= 72*track+32 && i < 72*track+38 ?
                og_machine_defaults[6+i-(72*track+32)] : 0xa5));
        og_machine_descriptor.ui_tick(); assert(fixture_control_writes == 6);
        U8(0x100b14ccu) = (uint8_t)track;
        assert(mw_type(1, slot(track)) == 7);
        assert(mw_page(slot(track)) == og_machine_descriptor.track_page(slot(track)));
        for (unsigned k = 0; k < 12; ++k)
            assert(part0()[control_offset(track, k)] == og_machine_defaults[k] &&
                   sram[control_offset(track, k)] == og_machine_defaults[k]);
        assert(og_machine_owns(track)); /* actual FR/1 predicate, no bitmask */
        assert(!og_machine_owns((track + 1) % 8));
        prepare_audio(track, ping);
        unsigned starts = stock_start_calls;
        assert(selected_start(track, 0, 0xc0, fallback_start) == 0x100);
        assert(stock_start_calls == starts + 1);
        uint8_t controls_before[sizeof lanes]; memcpy(controls_before, lanes, sizeof lanes);
        mw_frame_t0 = host_timer;
        unsigned stock_before = stock_render_calls;
        assert(mw_source_render_impl(track, ping, 0, 16) == 37);
        assert(stock_render_calls == stock_before + 1 && og_owner == track);
        assert(!memcmp(controls_before, lanes, sizeof lanes));
        ++renders;
        /* Force the actual base guard to shed before entering FRACT. */
        fresh(); mw_frame_t0 = host_timer; host_timer += FRAME;
        unsigned silent_before = (unsigned)silent_renders;
        assert(mw_source_render_impl(track, ping, 0, 16) == -9);
        assert((unsigned)silent_renders == silent_before + 1);
        assert(stock_render_calls == stock_before + 1);
        fresh(); mw_frame_t0 = host_timer; prepare_audio(track, ping);
        assert(mw_source_render_impl(track, ping, 0, 16) == 37);
        /* Assignment leaves real grain state before clearing the signature. */
        choose(track, 1);
        assert(og_owner == 8 && !og_machine_owns(track));
        assert(!part0()[SIG + 30 * track]);
    }
    /* Direct pool: browser confirmation preserves FR:1 and all 12 bytes.
     * Exercise a non-first machine row; LEFT goes back to FRACT, not FLEX. */
    reset_registry(); fixture(3, 2049); rows(all, 3, NULL, 0);
    choose(0, 7); U8(0x100b14ccu) = 0;
    og_machine_descriptor.ui_tick();
    unsigned published = fixture_control_writes;
    for (unsigned k = 0; k < 12; ++k)
        part0()[control_offset(0,k)] = sram[control_offset(0,k)] = (uint8_t)(9*k+3);
    uint8_t pool_saved[PART_STRIDE]; memcpy(pool_saved, (const void *)part0(), sizeof pool_saved);
    assert(mw_chooser_type(1, slot(0)) == 7 && mw_row_has_pool(7));
    og_machine_descriptor.pool_open();
    assert(pool_opens == 1 && og_pool_direct && mw_chooser_type(1, slot(0)) == 1);
    assert(mw_chooser_type(1, slot(1)) == 1); /* unsigned track remains native */
    choose(0, 1); /* stock browser YES commits the backing FLEX row */
    og_machine_descriptor.ui_tick(); assert(fixture_control_writes == published);
    assert(!memcmp(pool_saved, (const void *)part0(), sizeof pool_saved));
    assert(mw_type(1, slot(0)) == 7);
    og_machine_descriptor.pool_left(52, 1);
    assert(pool_lefts == 1 && !og_pool_direct && mw_chooser_type(1, slot(0)) == 7);
    /* Closing/cancelling the native window clears browser-only identity. */
    put_u32(0x460e70e0u, 0); og_machine_descriptor.pool_open();
    assert(pool_opens == 2); put_u32(0x460e70e0u, 0);
    og_machine_descriptor.ui_tick(); assert(!og_pool_direct);
    choose(0, 1); assert(!og_machine_owns(0));
    for (unsigned k = 0; k < 12; ++k)
        assert(part0()[control_offset(0,k)] == stockdef[k] && sram[control_offset(0,k)] == stockdef[k]);
    /* A different track/Part invalidates a pending browser immediately. */
    choose(0, 7); og_machine_descriptor.pool_open(); assert(og_pool_direct);
    U8(0x100b14ccu) = 1; og_machine_descriptor.ui_tick(); assert(!og_pool_direct);
    U8(0x100b14ccu) = 0; put_u32(0x460e70e0u, 0);
    og_machine_descriptor.pool_open(); assert(og_pool_direct);
    U8(0x100b14cfu) = 1; og_machine_descriptor.ui_tick(); assert(!og_pool_direct);
    U8(0x100b14cfu) = 0; put_u32(0x460e70e0u, 0);
    /* Pending selection must not target a different current Part. */
    choose(0, 1); choose(0, 7);
    published = fixture_control_writes; U8(0x100b14cfu) = 1;
    og_machine_descriptor.ui_tick(); assert(fixture_control_writes == published && !og_controls_tracks);
    U8(0x100b14cfu) = 0; og_machine_descriptor.ui_tick();
    assert(fixture_control_writes == published);
    puts("direct FRACT pool: confirmation, LEFT, cancel, defaults and context: OK");
    /* Boot-like validation: FR/1 controls survive before modules load; the
     * missing module is silent and never starts stock FLEX with custom bytes. */
    reset_registry(); fixture(3, 2049); rows(all, 3, NULL, 0); choose(3, 7);
    for (unsigned k = 0; k < 12; ++k) {
        part0()[control_offset(3, k)] = (uint8_t)(255 - 11 * k);
        stockdef[k] = (uint8_t)(k + 20);
    }
    uint8_t saved[PART_STRIDE]; memcpy(saved, (const void *)part0(), sizeof saved);
    rows(NULL, 0, NULL, 0);
    assert(mw_validate(part0()) == 11 && !memcmp(seen, stockdef, 12));
    assert(!memcmp(saved, (const void *)part0(), sizeof saved));
    assert(mw_source_render_impl(3, 0, 0, 16) == -9);
    unsigned fallbacks = fallback_calls;
    assert(selected_start(3, 0, 0xc0, fallback_start) == 0 && fallback_calls == fallbacks);
    rows(all, 3, NULL, 0); start_row[0] = (uintptr_t)&og_machine_start_descriptor;
    fresh(); prepare_audio(3, 0); mw_frame_t0 = host_timer;
    assert(selected_start(3, 0, 0xc0, fallback_start) == 0x100);
    assert(mw_source_render_impl(3, 0, 0, 16) == 37 && og_owner == 3);
    /* Synthetic test price only: exercise admission without claiming a FRACT
     * cycle measurement or installing a paid prototype. */
    Machine paid = og_machine_descriptor;
    paid.flags |= MODWERK_MACHINE_CF_RENDER;
    paid.source_voice = 411; paid.source_engine = 3; paid.source_kind = 1;
    const void *priced[] = {&A, &F, &paid};
    choose(3, 1); rows(priced, 3, NULL, 0); room = 0;
    memcpy(saved, (const void *)part0(), sizeof saved);
    uint8_t mirror[PART_STRIDE]; memcpy(mirror, sram, sizeof mirror);
    assert(mw_assign(part0(), 3, 7) == (unsigned)-1);
    assert(!memcmp(saved, (const void *)part0(), sizeof saved));
    assert(!memcmp(mirror, sram, sizeof mirror));
    assert(!failures);
    printf("%u FRACT registry renders; guard, boot protection, START, removal and refusal: OK\n", renders);
    return 0;
}
