/* SPDX-License-Identifier: GPL-3.0-or-later */
#include "controller_policy.h"
#include "stock_hook_resources.h"
#include <assert.h>
#include <limits.h>
#include <string.h>

/* The packages behind effect handles, as dsp.c's resolver answers: 40 E-Verb 0.1.2, 41 Air Chorus 0.1.3, 42 E-Verb's
 * bytes declaring a different extent, 43 one byte off E-Verb's hash; every other handle has no live module. */
static const unsigned char everb[32] = {0x5f,0x81,0xe7,0x2f,0xbb,0xa4,0x3e,0xa8,0x27,0xec,0x39,0x96,0x50,0x9b,0x50,0xc0,
                                        0x36,0xb4,0x58,0xd4,0xba,0xa8,0x7d,0x80,0x1e,0x57,0xd4,0xb4,0xce,0x16,0x95,0xca};
static const unsigned char chorus[32] = {0x13,0x07,0xd7,0x19,0x58,0xd2,0xa5,0xc7,0xa0,0xe4,0xba,0x8d,0x7f,0x7f,0x53,0xa0,
                                         0xaf,0xc1,0x0b,0xfe,0x40,0x4a,0x32,0x19,0x36,0xe3,0x9a,0x65,0xd2,0x29,0xcc,0x08};
static unsigned char near[32];
const unsigned char *modwerk_controller_effect_package(unsigned id, unsigned *declared)
{
    if (id == 40u) return *declared = 15870u, everb;
    if (id == 41u) return *declared = 16384u, chorus;
    if (id == 42u) return *declared = 16384u, everb;
    if (id == 43u) return *declared = 15870u, near;
    return 0;
}
/* T5's FX2 buffer starts at its block, Y $4000 on core 0 (buffers.c); a key-bus reader claims Y $7E00..$7FFF there. */
static int meets_key_bus(const struct mw_hook_buffer_claim *c) { return 0x4000u + c->words > 0x7e00u; }

int main(void)
{
    unsigned char guard[32], before[32];
    memset(guard, 0xa5, sizeof guard);
    memcpy(before, guard, sizeof guard);
    memcpy(near, everb, sizeof near), near[31] ^= 1u;
    assert(modwerk_controller_policy_entries() == 0);
    /* Closed for everything not reviewed: no module, Air Chorus, a changed extent, a changed package, a bad core. */
    for (unsigned core = 0; core < 2; ++core)
        for (unsigned id = 0; id < 64; ++id)
            if (id != 40u)
                assert(!modwerk_stock_hook_buffer_policy(core, id, (struct mw_hook_buffer_claim *)(void *)guard));
    assert(memcmp(guard, before, sizeof guard) == 0);
    assert(!modwerk_stock_hook_buffer_policy(UINT_MAX, 40u, (struct mw_hook_buffer_claim *)(void *)guard));
    assert(!modwerk_stock_hook_buffer_policy(0, 40u, 0));
    assert(!modwerk_stock_hook_buffer_policy(UINT_MAX, UINT_MAX, 0));
    /* E-Verb 0.1.2 on T5 FX2: its reviewed 15,870 words end at Y $7DFD, clear of the key bus; Air Chorus's whole block
     * (no row, mw_hook_default_claim) reaches $7FFF and meets it, as does a module with no live package behind it. */
    struct mw_hook_buffer_claim claim = {0, 0, 0};
    for (unsigned core = 0; core < 2; ++core) {
        assert(modwerk_stock_hook_buffer_policy(core, 40u, &claim) && claim.words == 15870u && claim.complete == 1 && !claim.head_safe);
        assert(!meets_key_bus(&claim));
    }
    struct mw_hook_buffer_claim whole = {16384u, 1, 0}; /* mw_hook_default_claim(1, 0): a module's whole FX2 block */
    assert(!modwerk_stock_hook_buffer_policy(0, 41u, &whole) && whole.words == 16384u && meets_key_bus(&whole));
    for (unsigned feature = 0; feature < 8; ++feature)
        assert(!modwerk_stock_hook_fixed_ranges_idle(feature));
    assert(!modwerk_stock_hook_fixed_ranges_idle(UINT_MAX));
    return 0;
}
