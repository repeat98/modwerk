/* SPDX-License-Identifier: GPL-3.0-or-later
 * Host check of diag.c: a new log ignores earlier crashes, each start is counted and reports what crashed or stalled
 * since; five minutes of meters make one load record; the CPU at 90 % for a second makes one HOT incident with the
 * unit's context, at most one in ten minutes; five seconds without a UI tick while frames run make a FREEZE, added
 * with its length once the tick moves again, or with length 0 at the next start, each followed by a FREEZE_PC with
 * what the frame interrupt interrupted at 5, 6, 7 and 8 s of it; the frame guard's skips make one
 * SHED, at most one in ten minutes; a boot's first USB re-offer makes one USB incident; LOG pages are 244 bytes. */
#include "diag.c"
#include <stdio.h>

static unsigned failures;
#define CHECK(x) do { if (!(x)) { failures++; fprintf(stderr, "%s:%d: %s\n", __FILE__, __LINE__, #x); } } while (0)
volatile struct diag_log modwerk_test_log;
volatile struct diag_trace modwerk_test_trace;
volatile struct diag_lates modwerk_test_lates;
volatile struct diag_freeze_pc modwerk_test_freeze_pc;
volatile uint16_t modwerk_test_interrupted[4];
volatile uint32_t modwerk_test_tcb;
volatile uint16_t mw_late_ring[8];
volatile uint32_t mw_late_count;
volatile uint32_t mw_frame_last; /* machine_registry.c */
volatile uint32_t modwerk_test_crash[DIAG_CRASH_BYTES / 4u], modwerk_test_stall[DIAG_STALL_BYTES / 4u], modwerk_test_playing, modwerk_test_tempo24,
    modwerk_test_screen, modwerk_test_timer;
uint32_t modwerk_test_modules[16];
const uint8_t modwerk_base_digest[32] = {0x32, 0x0f, 0xc4, 0x54, 9};
volatile uint8_t modwerk_test_running[16];
volatile uint32_t modwerk_status[5], modwerk_runtime_ticks, dl_frames;
void modwerk_track_machines(volatile uint8_t *out) { for (unsigned i = 0; i < 24u; ++i) out[i] = (uint8_t)(i + 1u); }
volatile uint32_t mw_frame_sheds, mw_frame_shed_tracks, mw_frame_brakes, mw_frame_skips, mw_frame_hushes, mw_late_over; /* the frame guard */
volatile uint32_t mw_cpu_refusals, mw_cpu_refusal_tracks; /* ... and its CPU budget */
volatile uint8_t mw_cpu_track_refusals[8];
volatile uint32_t mw_usb_reoffers, mw_usb_reoffer_regs; /* ep0.c's attach watchdog */

/* The battery copy of the current bank: a record's byte above 15 is a value stock's checks fix (to 15, one each); the
 * first settings check does the same for the saved UI state's bank byte. The restore refuses while any is left. */
uint8_t modwerk_test_cs1_parts[8][16], modwerk_test_cs1_patterns[16][16], modwerk_test_ui[0x16], modwerk_test_ui_saved[0x16];
static unsigned restores, restored_bank;
int32_t modwerk_test_settings_check(unsigned which)
{
    if (which || modwerk_test_ui_saved[2] <= 15u) return 0;
    modwerk_test_ui_saved[2] = 15u;
    return 1;
}
int32_t modwerk_test_validate(uint8_t *record)
{
    int32_t fixes = 0;
    for (unsigned i = 0; i < 16u; ++i) if (record[i] > 15u) record[i] = 15u, ++fixes;
    return fixes;
}
static int clean(void)
{
    for (unsigned r = 0; r < 8u; ++r) for (unsigned i = 0; i < 16u; ++i) if (modwerk_test_cs1_parts[r][i] > 15u) return 0;
    for (unsigned r = 0; r < 16u; ++r) for (unsigned i = 0; i < 16u; ++i) if (modwerk_test_cs1_patterns[r][i] > 15u) return 0;
    return modwerk_test_ui_saved[2] <= 15u;
}
int32_t modwerk_test_stock_restore(void)
{
    ++restores;
    if (!clean()) return -1;
    restored_bank = modwerk_test_ui[2]; /* stock puts the bank back where main's copy of the UI state says */
    return 0;
}
static void power_up(void) { for (unsigned i = 0; i < sizeof restore; ++i) ((uint8_t *)&restore)[i] = 0; restores = 0, restored_bank = 99u; }

static volatile struct diag_incident *last(void) { return &LOG->incident[(LOG->incidents - 1u) % DIAG_INCIDENTS]; }
static void restart(void) { started = 0, ticks = 0, n = cpu_sum = cpu_peak = played = hot_run = hot_count = hot_at = 0; modwerk_diag_tick(); }
/* One UI tick, as the base runs it: runtime.c's count, then the subscribers. */
static void tick(void) { modwerk_runtime_ticks = modwerk_runtime_ticks + 1u; modwerk_diag_tick(); }

int main(void)
{
    modwerk_test_crash[0] = 0x4d574352u, modwerk_test_crash[1] = 2, modwerk_test_crash[3] = 0x40012345u;
    for (unsigned i = 0; i < sizeof modwerk_test_log; ++i) ((volatile uint8_t *)&modwerk_test_log)[i] = 0xa5;
    restart();
    CHECK(LOG->magic == DIAG_MAGIC && LOG->version == DIAG_VERSION && LOG->boot == 1u);
    CHECK(LOG->incidents == 2u && LOG->incident[0].kind == DIAG_START && LOG->incident[0].seq == 1u && LOG->incident[0].a == 2u << 16); /* old crashes: no CRASH */
    CHECK(last()->kind == DIAG_BASE && last()->a == 0x320fc454u && last()->keys[0] == 0xffu); /* the base, right after each start */
    CHECK(LOG->loads == 0u && LOG->freeze_state == 0u);
    /* The installed set, after a restore or a Keep: the ids as one run of bytes. */
    modwerk_test_modules[0] = 0x95cff696u, modwerk_test_modules[1] = 0xbcf0d674u;
    modwerk_diag_refused(0x773c84aau, 7u, 786400u, 1000u, 2u); /* a restore refused Ringmod SC (in use): its record says so,
                                                               * once, with the module pool then in 16-byte units and the check */
    modwerk_diag_set();
    CHECK(LOG->incidents == 3u && last()->kind == DIAG_SET && last()->a == 2u && last()->machine[0] == 0x95u && last()->machine[3] == 0x96u);
    CHECK(last()->screen == 0x773c84aau && last()->tempo24 == 7u && !refused_module && !refused_code);
    CHECK(last()->cpu == 49150u && last()->dsp0 == 63u && last()->dsp1 == 2u && !refused_used && !refused_largest && !refused_check);
    CHECK(last()->machine[4] == 0xbcu && last()->machine[7] == 0x74u && last()->machine[8] == 0u && last()->keys[0] == 0u);
    modwerk_test_modules[0] = modwerk_test_modules[1] = 0;

    /* A crash and a stall since the last start. */
    modwerk_test_crash[1] = 3, modwerk_test_stall[0] = 0x4d575354u, modwerk_test_stall[1] = 1, modwerk_test_stall[2] = 2;
    restart();
    CHECK(LOG->boot == 2u && LOG->incidents == 7u); /* START, BASE, CRASH, STALL after the first boot's three */
    CHECK(LOG->incident[3].kind == DIAG_START && LOG->incident[4].kind == DIAG_BASE && LOG->incident[5].kind == DIAG_CRASH && LOG->incident[5].a == 0x40012345u);
    CHECK(LOG->incident[6].kind == DIAG_STALL && LOG->incident[6].a == 2u && LOG->incident[6].fx[0] == 0 && LOG->incident[6].keys[0] == 0xffu);
    restart();
    CHECK(LOG->boot == 3u && LOG->incidents == 9u); /* nothing new crashed: START and BASE only */

    /* Five minutes of meters: CPU 40 % then 60 %, playing half the time. */
    for (unsigned s = 0; s < WINDOW; ++s) {
        modwerk_status[0] = s < WINDOW / 2u ? 400u : 600u, modwerk_status[1] = 100u, modwerk_status[2] = 300u;
        modwerk_status[3] = 200u, modwerk_status[4] = 250u, modwerk_test_playing = s % 2u;
        for (unsigned t = 0; t < 30u; ++t) {
            tick();
            /* frames: 2.7 a tick, 363 µs apart (47,916 counts), one of them 2 ms late; the UI stood still for 7 frames once */
            for (unsigned f = 0; f < 3u; ++f) { modwerk_test_timer += s == 100u && t == 3u && f == 1u ? 264000u : 47916u; modwerk_diag_frame(); }
            if (s == 200u && t == 7u) for (unsigned f = 0; f < 7u; ++f) { modwerk_test_timer += 47916u; modwerk_diag_frame(); }
        }
    }
    CHECK(LOG->loads == 1u && LOG->load[0].seq == LOG->seq && LOG->load[0].boot == 3u && LOG->load[0].minute == 5u);
    CHECK(LOG->load[0].cpu_mean == 500u && LOG->load[0].cpu_peak == 600u && LOG->load[0].dsp0_mean == 100u && LOG->load[0].dsp0_peak == 300u);
    CHECK(LOG->load[0].dsp1_mean == 200u && LOG->load[0].dsp1_peak == 250u && LOG->load[0].samples == WINDOW && LOG->load[0].playing == WINDOW / 2u);
    CHECK(LOG->load[0].frame_gap == 2000u && LOG->load[0].tick_gap == 10u && frame_gap <= 47916u && tick_gap <= 3u); /* the late frame; 3 + 7 frames without a tick; then the window's maxima start over */

    /* Not in the first minute after a start (the project load). */
    restart();
    modwerk_status[0] = 950u;
    unsigned at_start = LOG->incidents;
    for (unsigned t = 0; t < 3000u; ++t) tick();
    CHECK(LOG->incidents == at_start);
    modwerk_status[0] = 100u;
    for (unsigned t = 0; t < 4000u; ++t) tick();
    /* The CPU at 90 % for a second, with keys pressed before: one HOT with the context, then none for ten minutes. */
    for (int code = 0; code < 20; ++code) modwerk_diag_key(code, 1), modwerk_diag_key(code, 0);
    modwerk_test_running[0] = 33, modwerk_test_running[15] = 7, modwerk_test_screen = 0x400cbf2cu, modwerk_test_tempo24 = 120u * 24u, modwerk_test_playing = 1;
    modwerk_status[0] = 950u;
    unsigned before = LOG->incidents;
    for (unsigned t = 0; t < 60u; ++t) tick();
    CHECK(LOG->incidents == before + 1u && last()->kind == DIAG_HOT && last()->cpu == 950u && last()->a == 2u);
    CHECK(last()->fx[0] == 33u && last()->fx[15] == 7u && last()->screen == 0x400cbf2cu && last()->tempo24 == 2880u && last()->playing == 1u);
    CHECK(last()->machine[0] == 1u && last()->machine[23] == 24u && last()->keys[0] == 4u && last()->keys[15] == 19u);
    modwerk_status[0] = 100u;
    for (unsigned t = 0; t < 60u; ++t) tick();
    modwerk_status[0] = 950u;
    for (unsigned t = 0; t < 60u; ++t) tick();
    CHECK(LOG->incidents == before + 1u);

    /* The frame guard skipped renders on T2 and T6: one SHED with the tracks and the count, then none for ten
     * minutes however many more it skips. */
    modwerk_status[0] = 100u;
    before = LOG->incidents;
    mw_frame_sheds = 300u, mw_frame_shed_tracks = 1u << 1 | 1u << 5;
    tick();
    CHECK(LOG->incidents == before + 1u && last()->kind == DIAG_SHED && last()->a == (0x22u << 24 | 300u) && last()->machine[0] == 1u);
    mw_frame_sheds = 900u;
    for (unsigned t = 0; t < HOT_GAP - 1u; ++t) tick();
    CHECK(LOG->incidents == before + 1u);
    tick();
    CHECK(LOG->incidents == before + 2u && last()->kind == DIAG_SHED && (last()->a & 0xffffffu) == 900u);
    /* The brake: every time it catches the frame interrupt falling behind, with the tracks shed. */
    mw_frame_brakes = 1u;
    tick();
    CHECK(LOG->incidents == before + 3u && last()->kind == DIAG_BRAKE && last()->a == (0x22u << 24 | 1u));
    tick();
    CHECK(LOG->incidents == before + 3u);
    mw_frame_brakes = 2u;
    tick();
    CHECK(LOG->incidents == before + 4u && last()->kind == DIAG_BRAKE && (last()->a & 0xffffffu) == 2u);
    /* The attach watchdog offered the unit again (#1985): one USB incident a boot, with OTGSC and PORTSC1. */
    mw_usb_reoffer_regs = 0x0800u << 16 | 0x1000u, mw_usb_reoffers = 1u;
    tick();
    CHECK(LOG->incidents == before + 5u && last()->kind == DIAG_USB && last()->a == (0x0800u << 16 | 0x1000u));
    mw_usb_reoffers = 2u; /* a boot's later ones are not logged: five with no host would crowd the log */
    tick();
    CHECK(LOG->incidents == before + 5u);
    tick();
    CHECK(LOG->incidents == before + 5u);
    /* A late frame entry held, a skipped DSP frame: the count since boot, at most once in HOT_GAP. */
    mw_frame_skips = 3u;
    tick();
    CHECK(LOG->incidents == before + 6u && last()->kind == DIAG_LATE && last()->a == 3u);
    mw_frame_skips = 9u;
    for (unsigned t = 0; t < HOT_GAP - 1u; ++t) tick();
    CHECK(LOG->incidents == before + 6u);
    tick();
    CHECK(LOG->incidents == before + 7u && last()->kind == DIAG_LATE && last()->a == 9u);
    /* An entry later than the wait can hold logs the same incident with nothing more held: the count in the top byte,
     * under the same limit. */
    mw_late_over = 1u;
    for (unsigned t = 0; t < HOT_GAP - 1u; ++t) tick();
    CHECK(LOG->incidents == before + 7u);
    tick();
    CHECK(LOG->incidents == before + 8u && last()->kind == DIAG_LATE && last()->a == (1u << 24 | 9u));
    mw_late_over = 300u;
    for (unsigned t = 0; t < HOT_GAP; ++t) tick();
    CHECK(LOG->incidents == before + 9u && last()->kind == DIAG_LATE && last()->a == (255u << 24 | 9u)); /* 255 at most */
    before += 2u;
    /* A pattern begun with module machines silenced, as predicted: a brake incident with bit 23, once in HOT_GAP. */
    mw_frame_hushes = 2u;
    tick();
    CHECK(LOG->incidents == before + 8u && last()->kind == DIAG_BRAKE && last()->a == (1u << 23 | 2u));
    mw_frame_hushes = 3u;
    tick();
    CHECK(LOG->incidents == before + 8u);

    /* The CPU budget refused a machine on T4: one incident with the track, the tracks since the last one and the count. */
    before = LOG->incidents;
    mw_cpu_refusals = 2u, mw_cpu_refusal_tracks = 1u << 3, mw_cpu_track_refusals[3] = 2u;
    tick();
    CHECK(LOG->incidents == before + 1u && last()->kind == DIAG_CPU && last()->a == (0x08u << 24 | 0x08u << 16 | 2u));
    tick();
    CHECK(LOG->incidents == before + 1u);
    /* Ten minutes on (HOT_GAP), one on T6: the record names T6 alone as its own, T4 and T6 since the start. */
    mw_cpu_refusals = 3u, mw_cpu_refusal_tracks |= 1u << 5, ++mw_cpu_track_refusals[5], cpu_at = 0;
    tick();
    CHECK(LOG->incidents == before + 2u && last()->kind == DIAG_CPU && last()->a == (0x28u << 24 | 0x20u << 16 | 3u));

    /* The UI stands still for six seconds while frames run, then moves again. The frame interrupt interrupted a task
     * (level 0) at 0x40015520 each time (channel 1's vector): one FREEZE_PC sample at 5 s; the tick moved before the one at 6 s. */
    modwerk_status[0] = 100u;
    modwerk_test_interrupted[0] = 0x4000u | 0x49u << 2, modwerk_test_interrupted[1] = 0x2000u;
    modwerk_test_interrupted[2] = 0x4001u, modwerk_test_interrupted[3] = 0x5520u, modwerk_test_tcb = 0x46c7bed8u;
    before = LOG->incidents;
    for (unsigned f = 0; f < FREEZE_FRAMES + 2756u; ++f) modwerk_diag_frame();
    CHECK(LOG->freeze_state == 1u && LOG->freeze.kind == DIAG_FREEZE && LOG->freeze.boot == 4u && LOG->freeze.fx[0] == 33u);
    CHECK(LOG->incidents == before && FREEZE_PC->magic == DIAG_FREEZE_PC_MAGIC && FREEZE_PC->boot == 4u && FREEZE_PC->pc[1] == 0u);
    tick(), modwerk_diag_frame(); /* the UI moves; the next frame sees it */
    CHECK(LOG->freeze_state == 2u && LOG->incidents == before);
    tick();
    CHECK(LOG->freeze_state == 0u && LOG->incidents == before + 2u);
    volatile struct diag_incident *frozen = &LOG->incident[(LOG->incidents - 2u) % DIAG_INCIDENTS];
    CHECK(frozen->kind == DIAG_FREEZE && frozen->a == FREEZE_FRAMES + 2755u); /* the first frame only saw the tick move */
    CHECK(last()->kind == DIAG_FREEZE_PC && last()->seq == LOG->seq && last()->boot == 4u && last()->second == frozen->second);
    CHECK(last()->a == 0x40015520u && last()->cpu == 0x2000u && last()->screen == 0u && last()->tempo24 == 0u && last()->dsp0 == 0u);
    CHECK(last()->machine[0] == 0x46u && last()->machine[3] == 0xd8u && last()->machine[4] == 0u && last()->keys[0] == 0xffu);
    CHECK(FREEZE_PC->magic == 0u);

    /* Frozen until a power cycle, inside an interrupt handler at level 3 for the last two samples: the next start adds the
     * freeze with length 0 and its four samples, under the session it happened in. */
    for (unsigned f = 0; f <= FREEZE_FRAMES + 2756u; ++f) modwerk_diag_frame();
    modwerk_test_interrupted[1] = 0x2300u, modwerk_test_interrupted[3] = 0x5526u, modwerk_test_tcb = 0x460ddde4u;
    for (unsigned f = 0; f < 2u * 2756u; ++f) modwerk_diag_frame();
    CHECK(LOG->freeze_state == 1u);
    restart();
    CHECK(LOG->boot == 5u && LOG->freeze_state == 0u);
    CHECK(LOG->incident[(LOG->incidents - 4u) % DIAG_INCIDENTS].kind == DIAG_FREEZE && LOG->incident[(LOG->incidents - 4u) % DIAG_INCIDENTS].a == 0u);
    frozen = &LOG->incident[(LOG->incidents - 3u) % DIAG_INCIDENTS];
    CHECK(frozen->kind == DIAG_FREEZE_PC && frozen->boot == 4u && frozen->a == 0x40015520u && frozen->screen == 0x40015520u && frozen->tempo24 == 0x40015526u);
    CHECK(frozen->cpu == 0x2000u && frozen->dsp0 == 0x2000u && frozen->dsp1 == 0x2300u && frozen->machine[11] == 0xe4u && frozen->machine[15] == 0xe4u);
    CHECK(frozen->machine[16] == 0x40u && frozen->machine[19] == 0x26u && frozen->machine[20] == 0x23u && frozen->machine[21] == 0u);
    CHECK(LOG->incident[(LOG->incidents - 4u) % DIAG_INCIDENTS].boot == 4u && LOG->incident[(LOG->incidents - 2u) % DIAG_INCIDENTS].kind == DIAG_START && last()->kind == DIAG_BASE && last()->boot == 5u);

    /* A frame that is not the frame transfer's (the DSP frame's vector, never seen): its program counter is all ones. */
    modwerk_test_interrupted[0] = 0x4000u | 0x41u << 2;
    tick(), modwerk_diag_frame(); /* the tick moves: a new count */
    for (unsigned f = 0; f < FREEZE_FRAMES; ++f) modwerk_diag_frame();
    tick(), modwerk_diag_frame(), tick();
    CHECK(last()->kind == DIAG_FREEZE_PC && last()->a == 0xffffffffu && last()->boot == 5u);
    modwerk_test_interrupted[0] = 0x4000u | 0x48u << 2;

    /* Frames before the first tick of a start belong to nobody. */
    started = 0;
    for (unsigned f = 0; f < FREEZE_FRAMES + 1u; ++f) modwerk_diag_frame();
    CHECK(LOG->freeze_state == 0u);
    modwerk_diag_tick();

    /* The ring wraps: the newest 32 incidents, each with a seq above the last. */
    for (unsigned i = 0; i < 40u; ++i) restart();
    CHECK(LOG->incidents > DIAG_INCIDENTS && last()->seq == LOG->seq);
    for (unsigned i = 1; i < DIAG_INCIDENTS; ++i) {
        uint32_t a = LOG->incident[(LOG->incidents - 1u - i) % DIAG_INCIDENTS].seq, b = LOG->incident[(LOG->incidents - i) % DIAG_INCIDENTS].seq;
        CHECK(a < b);
    }

    /* LOG pages: 244 bytes each, the log byte for byte, then zeros. */
    uint8_t page[DIAG_PAGE];
    CHECK(modwerk_diag_read(page, 0) == DIAG_PAGE && page[0] == ((const uint8_t *)&modwerk_test_log)[0]);
    /* After the log: crash.c's record, then dsp.c's, then zeros (diag.h). */
    modwerk_test_stall[0] = 0x4d575354u;
    unsigned at = (unsigned)sizeof(struct diag_log), stall_at = at + DIAG_CRASH_BYTES, end = (unsigned)DIAG_IMAGE_BYTES;
    const volatile uint8_t *cb = (const volatile uint8_t *)modwerk_test_crash, *sb = (const volatile uint8_t *)modwerk_test_stall; /* the host's byte order */
    CHECK(modwerk_diag_read(page, at / DIAG_PAGE) == DIAG_PAGE && page[at % DIAG_PAGE] == cb[0] && page[at % DIAG_PAGE + 3u] == cb[3] && (cb[0] == 'M' || cb[3] == 'M'));
    CHECK(modwerk_diag_read(page, stall_at / DIAG_PAGE) == DIAG_PAGE && page[stall_at % DIAG_PAGE] == sb[0] && page[stall_at % DIAG_PAGE + 3u] == sb[3]);
    /* Then the guard's skips as they stand ("MWSK", count, tracks), the entries later than the wait can hold, then zeros. */
    mw_frame_sheds = 0x01020304u, mw_frame_shed_tracks = 0x21u, mw_late_over = 0x0a0b0c0du;
    CHECK(modwerk_diag_read(page, end / DIAG_PAGE) == DIAG_PAGE && page[end % DIAG_PAGE] == 'M' && page[end % DIAG_PAGE + 3u] == 'K' &&
          page[end % DIAG_PAGE + 4u] == 1u && page[end % DIAG_PAGE + 7u] == 4u && page[end % DIAG_PAGE + 11u] == 0x21u &&
          page[end % DIAG_PAGE + 12u] == 0x0au && page[end % DIAG_PAGE + 15u] == 0x0du);
    CHECK(end % DIAG_PAGE + DIAG_SHEDS_BYTES == DIAG_PAGE); /* the last page, filled */
    { unsigned zeros = 1; modwerk_diag_read(page, end / DIAG_PAGE + 1u); for (unsigned i = 0; i < DIAG_PAGE; ++i) zeros &= !page[i]; CHECK(zeros); }
    mw_late_over = 0;
    CHECK(DIAG_PAGE % 64u != 0u);

    /* The frames before a stall: the last DIAG_TRACE_FRAMES, oldest first, the newest last; a gap and a run past the
     * field's range stay at its top; LOG pages them after the stall record. */
    for (unsigned f = 0; f < DIAG_TRACE_FRAMES + 5u; ++f) { modwerk_test_timer += 47936u + 64u * f; mw_frame_last = 6400u; modwerk_diag_frame(); }
    modwerk_test_timer += 0x1000000u, mw_frame_last = 0x800000u, modwerk_diag_frame();
    TRACE->magic = 0, tick();
    CHECK(TRACE->magic == 0); /* no new stall record: nothing kept */
    for (unsigned i = 0; i < 11u; ++i) mw_late_ring[mw_late_count & 7u] = (uint16_t)(100u + i), mw_late_count = mw_late_count + 1u;
    modwerk_test_stall[1] = 4, tick(); /* dsp.c's record, found at the next tick */
    CHECK(TRACE->magic == DIAG_TRACE_MAGIC && TRACE->count == 4u);
    CHECK(LATES->magic == DIAG_LATES_MAGIC && LATES->count == 4u && LATES->late[0] == 103u && LATES->late[7] == 110u); /* oldest first */
    CHECK(TRACE->frame[0][0] == 749u + 6u && TRACE->frame[0][1] == 100u && TRACE->frame[1][0] == 749u + 7u);
    CHECK(TRACE->frame[DIAG_TRACE_FRAMES - 2u][0] == 749u + DIAG_TRACE_FRAMES + 4u && TRACE->frame[DIAG_TRACE_FRAMES - 1u][0] == 65535u && TRACE->frame[DIAG_TRACE_FRAMES - 1u][1] == 65535u);
    unsigned trace_at = stall_at + DIAG_STALL_BYTES;
    const volatile uint8_t *tb = (const volatile uint8_t *)TRACE;
    CHECK(end == trace_at + DIAG_TRACE_BYTES && modwerk_diag_read(page, trace_at / DIAG_PAGE) == DIAG_PAGE && page[trace_at % DIAG_PAGE] == tb[0] && page[trace_at % DIAG_PAGE + 3u] == tb[3]);

    /* The power-up's battery restore (#2201). A clean battery copy: stock's restore runs once and nothing is logged. */
    restart(); /* the stall above, seen at a start */
    power_up();
    modwerk_test_ui[2] = modwerk_test_ui_saved[2] = 3u;
    before = LOG->incidents;
    CHECK(modwerk_boot_restore() == 0 && restores == 1u && restored_bank == 3u);
    restart();
    CHECK(LOG->incidents == before + 2u && last()->kind == DIAG_BASE); /* START and BASE only */
    /* One value out of range in Part 2's working copy (stock alone would refuse the whole bank and start it empty): it
     * is fixed as a file load fixes it, the bank comes back, and RESTORE names the record. */
    power_up();
    modwerk_test_cs1_parts[2u * 1u + 1u][5] = 40u;
    CHECK(modwerk_boot_restore() == 0 && restores == 1u && restored_bank == 3u && modwerk_test_cs1_parts[3][5] == 15u);
    before = LOG->incidents;
    restart();
    CHECK(LOG->incidents == before + 3u && last()->kind == DIAG_RESTORE && last()->a == 1u && last()->second == 0u);
    CHECK(last()->cpu == 0u && last()->dsp0 == 1u && last()->dsp1 == 0u && last()->screen == 0x103u && last()->tempo24 == 0u);
    /* A pattern and the saved UI state's bank: main took the UI state before the checks, so it is taken again, fixed,
     * before stock restores the bank there. */
    power_up();
    modwerk_test_cs1_patterns[9][0] = 200u, modwerk_test_ui_saved[2] = 0xeeu, modwerk_test_ui[2] = 0xeeu;
    CHECK(modwerk_boot_restore() == 0 && restores == 1u && modwerk_test_ui[2] == 15u && restored_bank == 15u);
    restart();
    CHECK(last()->kind == DIAG_RESTORE && last()->a == 2u && last()->cpu == 1u && last()->dsp1 == 1u && last()->screen == 1u);
    /* More fixes than a battery copy that kept its contents needs: refused as stock refuses it, and logged. */
    power_up();
    for (unsigned r = 0; r < 8u; ++r) for (unsigned i = 0; i < 9u; ++i) modwerk_test_cs1_parts[r][i] = 0xffu;
    CHECK(modwerk_boot_restore() == -1 && restores == 0u);
    restart();
    CHECK(last()->kind == DIAG_RESTORE && last()->a == 72u && last()->dsp0 == 72u && last()->screen == 0x100u && last()->tempo24 == 0xffffffffu);
    power_up();

    if (failures) fprintf(stderr, "%u failure(s)\n", failures);
    else puts("diag: start, crash and stall, load, HOT, freeze, restart, LOG pages, the frames before a stall and the power-up's restore passed");
    return failures != 0;
}
