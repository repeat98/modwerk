/* SPDX-License-Identifier: GPL-3.0-or-later */
#include "controller_policy.h"
#include "stock_hook_resources.h"

/* No private source-bound controller declarations have been qualified in this bridge: no controller policy entry, and
 * module names, effect IDs and absent policy never establish admission. */
unsigned modwerk_controller_policy_entries(void) { return 0; }

/* Reviewed exact FX2 buffer extents (19 November 2026): the Y words from its block base that the effect, as this exact
 * encoded package (sha256 of the .mwrm the site sends), can write. Each row narrows the whole-block default, so a key-bus
 * reader's claims at the block's tail (+$3E00..+$3FFF) no longer meet a buffer that never reaches them. A row applies
 * only while the installed package is byte for byte the reviewed one and still declares the reviewed extent; any other
 * version falls back to the whole block. No head proof: FX2 block 2 stays closed to them as before.
 *
 * E-Verb 0.1.2 (873d83cc), 15,870 words: one ring under m5 = m4 = $3DFD (everb.asm:17, :589-590); its verify.py gate
 *   "window" (verify.py:41-43) has it never write or read the block's last 514 words on T3 and T7.
 * Mini Verb 0.2.3 (3cbedc9c), 15,870 words: a 15,870-word ring under m = $3DFD, the slot's last $202 words never touched
 *   (miniverb.asm:3-5, :128-129); verify.py:214-224 runs eight moving instances under a 15,870-word guard with no stray
 *   write, and its control catches 0.2.2's whole-block ring.
 * BBD Delay 0.1.2 (16332a40), 8,250 words: every Y write is the clear (16 calls of 256 words from base, bbd.asm:62,
 *   :103-116: base..+$0FFF), the ring under m4 = stages - 2 <= 4,094 (bbd.asm:43, :582-583, :791), the nine clock
 *   sections at base + $2000 + 5 x 0..8 (bbd.asm:489, :509-512, the writes at :987-1036: up to +$202C), the high-pass at
 *   +$2030 (:560-568) and FREQ's bandpass at +$2035..+$2039 (:570-580). Its isolation gate guards only the whole block
 *   (verify.py:466); the extent is from the source.
 * Vibrato 0.1.0 (d4582ab2), 2,048 words: on FX2 it returns at once and writes nothing (vibrato.asm:6-8, :74;
 *   verify_vibrato.py:14, :203-205 guard the FX2 instance); the row is its declared two 1,024-word lines.
 * Air Chorus has no row: its declared 16,384 words reach Y $7FFF, so it really meets the key bus. */
static const struct { unsigned char sha256[32]; uint32_t words; } reviewed[] = {
    {{0x5f,0x81,0xe7,0x2f,0xbb,0xa4,0x3e,0xa8,0x27,0xec,0x39,0x96,0x50,0x9b,0x50,0xc0,0x36,0xb4,0x58,0xd4,0xba,0xa8,0x7d,0x80,0x1e,0x57,0xd4,0xb4,0xce,0x16,0x95,0xca}, 15870u}, /* E-Verb 0.1.2 */
    {{0xee,0xa2,0x5e,0x6c,0xf8,0xac,0x0a,0x39,0xab,0x30,0x0d,0x8b,0xa5,0x43,0xb0,0xd5,0x82,0x9b,0x78,0x9a,0x03,0xe0,0x08,0x1c,0x8d,0x13,0x6c,0x64,0xf2,0xee,0xd5,0x18}, 15870u}, /* Mini Verb 0.2.3 */
    {{0x58,0xb7,0x70,0x69,0x9e,0x28,0xb5,0x53,0x6e,0xf7,0x7b,0x2b,0x78,0x09,0x4a,0x19,0x1f,0x88,0x55,0xc5,0xab,0x75,0xfb,0xa4,0x36,0x4a,0xa5,0x28,0xf8,0xc1,0x3f,0xbc}, 8250u},  /* BBD Delay 0.1.2 */
    {{0xf3,0x11,0xdd,0x62,0x0d,0xaf,0x29,0x6d,0xc6,0xca,0xff,0x7f,0x44,0x25,0x33,0xfe,0x6e,0x72,0x62,0xe2,0xa1,0x83,0x4b,0xbf,0xbc,0x23,0x7f,0xf8,0xc4,0xd3,0xff,0x16}, 2048u},  /* Vibrato 0.1.0 */
};
#define REVIEWED (sizeof reviewed / sizeof reviewed[0])

int modwerk_stock_hook_buffer_policy(unsigned core, unsigned id,
                                    struct mw_hook_buffer_claim *out)
{
    unsigned declared = 0;
    if (core > 1u || !out) return 0;
    const unsigned char *package = modwerk_controller_effect_package(id, &declared);
    if (!package) return 0; /* stock's own effect or no live module behind the handle: the defaults */
    for (unsigned row = 0; row < REVIEWED; ++row) {
        unsigned byte = 0;
        while (byte < 32u && reviewed[row].sha256[byte] == package[byte]) ++byte;
        if (byte < 32u || reviewed[row].words != declared) continue;
        out->words = reviewed[row].words, out->complete = 1, out->head_safe = 0;
        return 1;
    }
    return 0;
}

int modwerk_stock_hook_fixed_ranges_idle(unsigned feature)
{
    (void)feature;
    return 0;
}
