// SPDX-License-Identifier: GPL-3.0-or-later
// diag.c and load.c on the host (sdk/tests/test_machine_base.py): the log's records and LOAD's figures as the CPU mark's
// looks (load.c's mw_load_look) and the UI tick fill them. cc -std=c99 -DMODWERK_HOST -I. diag.c load.c test_diag.c
#include <stdio.h>
#include <string.h>
#include "diag.h"

volatile int mw_test_playing;
volatile uint32_t mw_test_timer = 0xfffff000u;   // wraps in the first second: gaps are unsigned differences
extern uint32_t mw_load_avg, mw_load_wmax, mw_load_peak, mw_load_windows, mw_load_blocks;
void mw_load_look(uint32_t sum, uint32_t blocks, uint32_t peak);
uint32_t mw_load_tenths(uint32_t l);

static int failed;
#define CHECK(c) do { if (!(c)) { fprintf(stderr, "%s:%d: %s\n", __FILE__, __LINE__, #c); failed = 1; } } while (0)

#define BLOCK 88000u                             // timer counts a block: what the unit's timer gives (about 132 MHz)
// One look of 750 blocks (half a second) at a load (256ths) with its dearest block, the UI ticking ten times in it,
// as the CPU mark's tick hands it over (every tenth UI tick).
static void look(uint32_t load, uint32_t dearest)
{
    for (unsigned t = 0; t < 10u; t++) {
        mw_test_timer += 75u * BLOCK;
        mw_diag_tick(0);
    }
    mw_load_look(750u * load, 750u, dearest);
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
    // A set hot from boot: a HOT once the first minute is over, though the run of hot looks began in it.
    mw_diag_start(0x99u, 0x1u);
    mw_diag_tick(0);
    for (unsigned w = 0; w < 200u; w++)
        mw_load_look(750u * 245u, 750u, 250u);   // 957 per mille
    CHECK(last()->kind == DIAG_HOT && last()->a == 121u);   // the half-seconds hot so far: 121, the first after SETTLED
    // The nonce takes the timer at the first tick too, so a boot that starts like the last one still gets its own.
    CHECK(mw_diag_log.nonce != 0x99u);

    mw_diag_start(0x1234u, 0xf2fe7324u);
    CHECK(mw_diag_log.magic == DIAG_MAGIC && mw_diag_log.version == 2u && mw_diag_log.boot == 1u && mw_diag_log.nonce == 0x1234u);
    CHECK(mw_diag_log.incidents == 0u);          // START and BASE wait for the first tick
    mw_diag_tick(0);
    CHECK(mw_diag_log.incidents == 2u && mw_diag_log.seq == 2u);
    CHECK(mw_diag_log.incident[0].kind == DIAG_START && mw_diag_log.incident[0].seq == 1u);
    CHECK(mw_diag_log.incident[1].kind == DIAG_BASE && mw_diag_log.incident[1].a == 0xf2fe7324u);
    CHECK(mw_diag_log.incident[1].keys[0] == 0xff && mw_diag_log.incident[1].second == 0u);

    // LOAD from the looks: 128 of 256 is 50 %; the dearest block reads its own; a figure past the period is clamped.
    // (load.c's counts run from boot: the scenario above already counted its looks.)
    uint32_t windows = mw_load_windows, blocks = mw_load_blocks;
    look(128u, 140u);
    CHECK(mw_load_avg == 500u && mw_load_tenths(mw_load_wmax) == 546u && mw_load_windows == windows + 1u && mw_load_blocks == blocks + 750u);
    mw_load_look(750u * 128u, 750u, 300u);
    CHECK(mw_load_tenths(mw_load_peak) == 1000u);
    mw_load_look(0u, 0u, 0u);                    // a look without blocks changes nothing
    CHECK(mw_load_windows == windows + 2u);
    mw_load_look(30000u * 200u, 30000u, 200u);   // a long look (a stalled UI): the mean still fits 32 bits
    CHECK(mw_load_avg == 781u);

    // Finish the record the start-up began, so the next one holds only what follows.
    while (mw_diag_log.loads == 0u)
        look(100u, 100u);
    // About five minutes at 74 %, playing for half of it: one load record.
    unsigned before = mw_diag_log.loads;
    for (unsigned w = 0; w < 600u; w++) {
        mw_test_playing = w < 300u;
        look(190u, w == 300u ? 218u : 200u);     // 190/256 = 742 per mille
    }
    CHECK(mw_diag_log.loads == before + 1u);
    const volatile struct diag_load *l = &mw_diag_log.load[mw_diag_log.loads - 1u];
    CHECK(l->boot == 1u && l->samples == 600u && l->cpu_mean == 742u && l->cpu_peak == 851u);
    CHECK(l->playing == 300u && l->frame_gap == 0u);
    CHECK(l->tick_gap == 75u);                   // ten ticks a look, 75 blocks apart
    CHECK(l->dsp0_mean == 0u && l->dsp1_peak == 0u);

    // Keys: the last presses, oldest first; a release is not a press.
    key(16, 1), key(16, 0), key(9, 1);
    // One second at 90 % or more after the first minute: a HOT incident, once.
    mw_test_playing = 1;
    unsigned hot = mw_diag_log.incidents;
    mw_load_look(750u * 243u, 750u, 250u);
    mw_load_look(750u * 246u, 750u, 250u);
    CHECK(mw_diag_log.incidents == hot + 1u && last()->kind == DIAG_HOT && last()->a == 2u && last()->cpu == 960u && last()->playing == 1u);
    CHECK(last()->keys[14] == 16 && last()->keys[15] == 9 && last()->keys[13] == 0xff);
    mw_load_look(750u * 248u, 750u, 250u);
    CHECK(mw_diag_log.incidents == hot + 1u);    // a run logs once
    mw_load_look(750u * 100u, 750u, 100u);
    mw_load_look(750u * 246u, 750u, 250u);
    mw_load_look(750u * 246u, 750u, 250u);
    CHECK(mw_diag_log.incidents == hot + 1u);    // not again within ten minutes

    // The UI stands still for six seconds: a FREEZE at the tick that comes back, with the blocks it stood still. (Two
    // looks first, half a second apart each, to give the block's length again after the timer-less looks above.)
    look(100u, 100u);
    look(100u, 100u);
    mw_test_timer += 9000u * BLOCK;
    mw_diag_tick(0);
    CHECK(last()->kind == DIAG_FREEZE && last()->a == 9000u && last()->seq == mw_diag_log.seq);
    unsigned frozen = mw_diag_log.incidents;
    mw_test_timer += 5000u * BLOCK;              // three and a third seconds: no freeze
    mw_diag_tick(0);
    CHECK(mw_diag_log.incidents == frozen);

    // A ring past its size keeps the newest.
    for (unsigned i = 0; i < 40u; i++) {
        mw_test_timer += 8000u * BLOCK;
        mw_diag_tick(0);
    }
    CHECK(mw_diag_log.incidents == frozen + 40u && last()->kind == DIAG_FREEZE && last()->a == 8000u);

    if (!failed)
        puts("diag ok");
    return failed;
}
