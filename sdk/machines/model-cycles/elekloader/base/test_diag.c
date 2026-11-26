// SPDX-License-Identifier: GPL-3.0-or-later
// diag.c on the host (sdk/tests/test_machine_base.py): the log's records as the audio interrupt and the UI tick fill
// them, with a made-up kit. cc -std=c99 -DMODWERK_HOST diag.c test_diag.c
#include <stdio.h>
#include <string.h>
#include "diag.h"

uint8_t *volatile mw_test_play_kit;
static uint8_t kit[7094];
static int failed;
#define CHECK(c) do { if (!(c)) { fprintf(stderr, "%s:%d: %s\n", __FILE__, __LINE__, #c); failed = 1; } } while (0)

#define BLOCK 90112u
static uint32_t now;
static void blocks(unsigned n, int ticking)  // n codec blocks, 667 µs apart, a UI tick every 50 while ticking
{
    for (unsigned i = 0; i < n; i++) {
        now += BLOCK;
        mw_diag_block(now);
        if (ticking && i % 50u == 49u)
            mw_diag_tick(0);
    }
}
static const volatile struct diag_incident *last(void)
{
    return &mw_diag_log.incident[(mw_diag_log.incidents - 1u) % DIAG_INCIDENTS];
}
static void key(int id, int flags)
{
    char ev[20] = {0};
    int32_t k = id, f = flags;
    memcpy(ev + 12, &k, 4), memcpy(ev + 16, &f, 4);
    CHECK(mw_diag_key(0, ev) == 0);
}

int main(void)
{
    for (unsigned t = 0; t < 6u; t++)
        kit[28 + 100 * t + 38] = (uint8_t)(5 - t);

    mw_test_play_kit = (uint8_t *)0;            // at the boot gate stock's memory is not set up yet
    mw_diag_start(0x1234u, 0xf2fe7324u);
    CHECK(mw_diag_log.magic == DIAG_MAGIC && mw_diag_log.version == 2u && mw_diag_log.boot == 1u);
    // A slow start before the UI's first tick is no freeze, and START and BASE wait for that tick.
    blocks(8000, 0);
    CHECK(mw_diag_log.freeze_state == 0 && mw_diag_log.incidents == 0u);
    mw_test_play_kit = kit;
    mw_diag_tick(0);
    CHECK(mw_diag_log.incidents == 2u && mw_diag_log.seq == 2u);
    CHECK(mw_diag_log.incident[0].kind == DIAG_START && mw_diag_log.incident[0].seq == 1u);
    CHECK(mw_diag_log.incident[1].kind == DIAG_BASE && mw_diag_log.incident[1].a == 0xf2fe7324u);
    CHECK(mw_diag_log.incident[1].machine[0] == 5 && mw_diag_log.incident[1].machine[15] == 0 && mw_diag_log.incident[1].keys[0] == 0xff);

    // Five minutes at 74 %: one load record, written by the tick.
    for (unsigned w = 0; w < 600u; w++) {
        blocks(750, 1);
        mw_diag_window(740, w == 300u ? 851u : 800u);
    }
    CHECK(mw_diag_log.loads == 0u);
    mw_diag_tick(0);
    CHECK(mw_diag_log.loads == 1u);
    const volatile struct diag_load *l = &mw_diag_log.load[0];
    CHECK(l->seq == 3u && l->boot == 1u && l->minute == 5u);
    CHECK(l->cpu_mean == 740u && l->cpu_peak == 851u && l->samples == 600u && l->playing == 0u);
    CHECK(l->frame_gap == 666u);                 // 90,112 ticks at 135.168 MHz
    CHECK(l->tick_gap == 49u);
    CHECK(l->dsp0_mean == 0u && l->dsp1_peak == 0u);

    // Keys: the last presses, oldest first; a release is not a press.
    key(16, 1), key(16, 0), key(9, 1);
    // One second at 90 % or more after the first minute: a HOT incident, once.
    mw_diag_window(950, 990);
    mw_diag_window(960, 990);
    mw_diag_window(970, 990);
    mw_diag_tick(0);
    CHECK(last()->kind == DIAG_HOT && last()->a == 2u && last()->cpu == 970u);
    CHECK(last()->keys[14] == 16 && last()->keys[15] == 9 && last()->keys[13] == 0xff);
    mw_diag_window(100, 100);
    mw_diag_window(950, 990);
    mw_diag_window(950, 990);
    mw_diag_tick(0);
    CHECK(last()->kind == DIAG_HOT && mw_diag_log.incidents == 3u);  // not again within ten minutes

    // The UI stands still for six seconds while audio runs: a FREEZE once it ticks again, with the blocks after the
    // first (which follows the last tick).
    blocks(9000, 0);
    CHECK(mw_diag_log.freeze_state == 1u && mw_diag_log.incidents == 3u);
    mw_diag_tick(0);
    CHECK(mw_diag_log.freeze_state == 0u && last()->kind == DIAG_FREEZE && last()->a == 8999u && last()->machine[3] == 4);
    CHECK(last()->seq == mw_diag_log.seq);

    // A ring past its size keeps the newest.
    for (unsigned i = 0; i < 40u; i++) {
        blocks(8000, 0);
        mw_diag_tick(0);
    }
    CHECK(mw_diag_log.incidents == 44u && last()->kind == DIAG_FREEZE);

    // The longest freeze since the last record shows in the next one.
    for (unsigned w = 0; w < 600u; w++)
        mw_diag_window(740, 800);
    mw_diag_tick(0);
    CHECK(mw_diag_log.loads == 2u && mw_diag_log.load[1].tick_gap == 8999u);

    if (!failed)
        puts("diag ok");
    return failed;
}
