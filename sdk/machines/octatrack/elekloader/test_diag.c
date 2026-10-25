/* SPDX-License-Identifier: GPL-3.0-or-later
 * Host check of diag.c: a new log ignores earlier crashes, each start is counted and reports what crashed or stalled
 * since; five minutes of meters make one load record; the CPU at 90 % for a second makes one HOT incident with the
 * unit's context, at most one in ten minutes; five seconds without a UI tick while frames run make a FREEZE, added
 * with its length once the tick moves again, or with length 0 at the next start; the frame guard's skips make one
 * SHED, at most one in ten minutes; LOG pages are 244 bytes. */
#include "diag.c"
#include <stdio.h>

static unsigned failures;
#define CHECK(x) do { if (!(x)) { failures++; fprintf(stderr, "%s:%d: %s\n", __FILE__, __LINE__, #x); } } while (0)
volatile struct diag_log modwerk_test_log;
volatile uint32_t modwerk_test_crash[DIAG_CRASH_BYTES / 4u], modwerk_test_stall[DIAG_STALL_BYTES / 4u], modwerk_test_playing, modwerk_test_tempo24,
    modwerk_test_screen, modwerk_test_timer;
uint32_t modwerk_test_modules[16];
const uint8_t modwerk_base_digest[32] = {0x32, 0x0f, 0xc4, 0x54, 9};
volatile uint8_t modwerk_test_running[16];
volatile uint32_t modwerk_status[5], modwerk_runtime_ticks, dl_frames;
void modwerk_track_machines(volatile uint8_t *out) { for (unsigned i = 0; i < 24u; ++i) out[i] = (uint8_t)(i + 1u); }
volatile uint32_t mw_frame_sheds, mw_frame_shed_tracks; /* machine_registry.c's frame guard */

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
    modwerk_diag_refused(0x773c84aau, 7u); /* a restore refused Ringmod SC (in use): its record says so, once */
    modwerk_diag_set();
    CHECK(LOG->incidents == 3u && last()->kind == DIAG_SET && last()->a == 2u && last()->machine[0] == 0x95u && last()->machine[3] == 0x96u);
    CHECK(last()->screen == 0x773c84aau && last()->tempo24 == 7u && !refused_module && !refused_code);
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

    /* The UI stands still for six seconds while frames run, then moves again. */
    modwerk_status[0] = 100u;
    before = LOG->incidents;
    for (unsigned f = 0; f < FREEZE_FRAMES + 2756u; ++f) modwerk_diag_frame();
    CHECK(LOG->freeze_state == 1u && LOG->freeze.kind == DIAG_FREEZE && LOG->freeze.boot == 4u && LOG->freeze.fx[0] == 33u);
    CHECK(LOG->incidents == before);
    tick(), modwerk_diag_frame(); /* the UI moves; the next frame sees it */
    CHECK(LOG->freeze_state == 2u && LOG->incidents == before);
    tick();
    CHECK(LOG->freeze_state == 0u && LOG->incidents == before + 1u && last()->kind == DIAG_FREEZE && last()->a == FREEZE_FRAMES + 2755u); /* the first frame only saw the tick move */
    CHECK(last()->seq == LOG->seq && last()->boot == 4u);

    /* Frozen until a power cycle: the next start adds it with length 0, under the session it happened in. */
    for (unsigned f = 0; f <= FREEZE_FRAMES; ++f) modwerk_diag_frame();
    CHECK(LOG->freeze_state == 1u);
    restart();
    CHECK(LOG->boot == 5u && LOG->freeze_state == 0u);
    CHECK(LOG->incident[(LOG->incidents - 3u) % DIAG_INCIDENTS].kind == DIAG_FREEZE && LOG->incident[(LOG->incidents - 3u) % DIAG_INCIDENTS].a == 0u);
    CHECK(LOG->incident[(LOG->incidents - 3u) % DIAG_INCIDENTS].boot == 4u && LOG->incident[(LOG->incidents - 2u) % DIAG_INCIDENTS].kind == DIAG_START && last()->kind == DIAG_BASE && last()->boot == 5u);

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
    CHECK(modwerk_diag_read(page, end / DIAG_PAGE) == DIAG_PAGE && page[end % DIAG_PAGE] == 0 && page[DIAG_PAGE - 1u] == 0);
    CHECK(DIAG_PAGE % 64u != 0u);

    if (failures) fprintf(stderr, "%u failure(s)\n", failures);
    else puts("diag: start, crash and stall, load, HOT, freeze, restart and LOG pages passed");
    return failures != 0;
}
