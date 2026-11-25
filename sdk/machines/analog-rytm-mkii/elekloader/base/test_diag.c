// SPDX-License-Identifier: GPL-3.0-or-later
// diag.c and load.c on the host (sdk/tests/test_machine_base.py): the log's records as the audio interrupt and the UI
// tick fill them, and LOAD's figures. cc -std=c99 -DMODWERK_HOST -I. -I../../include diag.c load.c test_diag.c
#include <stdio.h>
#include <string.h>
#include "diag.h"

volatile int mw_test_playing;
volatile uint32_t mw_test_timer = 0xfffff000u;   // wraps in the first second: gaps are unsigned differences
volatile uint32_t core_audio_load;
extern uint32_t mw_load_avg, mw_load_wmax, mw_load_peak, mw_load_windows, mw_load_blocks;
void mw_load_out(void);
uint32_t mw_load_tenths(uint32_t l);

static int failed;
#define CHECK(c) do { if (!(c)) { fprintf(stderr, "%s:%d: %s\n", __FILE__, __LINE__, #c); failed = 1; } } while (0)

#define BLOCK 88000u                             // timer counts a block: what the unit's timer gives (about 132 MHz)
static void blocks(unsigned n, int ticking, uint32_t load)  // n audio blocks at a load (256ths), a UI tick every 75
{
    for (unsigned i = 0; i < n; i++) {
        mw_test_timer += BLOCK;
        core_audio_load = load;
        mw_load_out();
        if (ticking && i % 75u == 74u)
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
    mw_diag_start(0x1234u, 0xf2fe7324u);
    CHECK(mw_diag_log.magic == DIAG_MAGIC && mw_diag_log.version == 2u && mw_diag_log.boot == 1u && mw_diag_log.nonce == 0x1234u);
    // A slow start before the UI's first tick is no freeze, and START and BASE wait for that tick.
    blocks(8000, 0, 128);
    CHECK(mw_diag_log.freeze_state == 0 && mw_diag_log.incidents == 0u);
    mw_diag_tick(0);
    CHECK(mw_diag_log.incidents == 2u && mw_diag_log.seq == 2u);
    CHECK(mw_diag_log.incident[0].kind == DIAG_START && mw_diag_log.incident[0].seq == 1u);
    CHECK(mw_diag_log.incident[1].kind == DIAG_BASE && mw_diag_log.incident[1].a == 0xf2fe7324u);
    CHECK(mw_diag_log.incident[1].keys[0] == 0xff && mw_diag_log.incident[1].second == 5u);  // 8,000 blocks: 5.3 s

    // LOAD: windows of 750 blocks. 128 of 256 is 50 %; a block at the whole period reads 100 % at most.
    CHECK(mw_load_windows == 10u && mw_load_avg == 500u && mw_load_tenths(mw_load_wmax) == 500u);
    core_audio_load = 300;                       // the core never gives more than 256: clamped
    mw_load_out();
    CHECK(mw_load_tenths(mw_load_peak) == 1000u && mw_load_blocks == 8001u);
    blocks(249, 0, 128);                         // 8,000 + 1 + 249: eleven whole windows, so later ones start with a call

    // Finish the record the start-up began, so the next one holds only what follows.
    mw_diag_tick(0);
    while (mw_diag_log.loads == 0u)
        blocks(750, 1, 100);
    mw_diag_tick(0);
    // Five minutes at 74 %, playing for half of it: one load record, written by the tick.
    unsigned before = mw_diag_log.loads;
    for (unsigned w = 0; w < 600u; w++) {
        mw_test_playing = w < 300u;
        blocks(750, 1, 190);                     // 190/256 = 742 per mille
    }
    mw_diag_tick(0);
    CHECK(mw_diag_log.loads == before + 1u);
    const volatile struct diag_load *l = &mw_diag_log.load[mw_diag_log.loads - 1u];
    CHECK(l->boot == 1u && l->samples == 600u && l->cpu_mean >= 742u && l->cpu_mean <= 743u);
    CHECK(l->playing == 299u || l->playing == 300u);  // the window that ends is counted with the state at its end
    CHECK(l->frame_gap == 666u);                 // a block is 667 µs, whatever the timer's rate
    CHECK(l->tick_gap == 74u);
    CHECK(l->dsp0_mean == 0u && l->dsp1_peak == 0u);

    // Keys: the last presses, oldest first; a release is not a press.
    key(16, 1), key(16, 0), key(9, 1);
    // One second at 90 % or more after the first minute: a HOT incident, once.
    mw_test_playing = 1;
    mw_diag_window(950, 990);
    mw_diag_window(960, 990);
    mw_diag_window(970, 990);
    mw_diag_tick(0);
    CHECK(last()->kind == DIAG_HOT && last()->a == 2u && last()->cpu == 970u && last()->playing == 1u);
    CHECK(last()->keys[14] == 16 && last()->keys[15] == 9 && last()->keys[13] == 0xff);
    unsigned hot = mw_diag_log.incidents;
    mw_diag_window(100, 100);
    mw_diag_window(950, 990);
    mw_diag_window(950, 990);
    mw_diag_tick(0);
    CHECK(mw_diag_log.incidents == hot);         // not again within ten minutes

    // The UI stands still for six seconds while audio runs: a FREEZE once it ticks again, with the blocks after the
    // first (which follows the last tick).
    blocks(9000, 0, 100);
    CHECK(mw_diag_log.freeze_state == 1u && mw_diag_log.incidents == hot);
    mw_diag_tick(0);
    CHECK(mw_diag_log.freeze_state == 0u && last()->kind == DIAG_FREEZE && last()->a == 8999u);
    CHECK(last()->seq == mw_diag_log.seq);

    // A ring past its size keeps the newest.
    for (unsigned i = 0; i < 40u; i++) {
        blocks(8000, 0, 100);
        mw_diag_tick(0);
    }
    CHECK(mw_diag_log.incidents == hot + 41u && last()->kind == DIAG_FREEZE);

    if (!failed)
        puts("diag ok");
    return failed;
}
