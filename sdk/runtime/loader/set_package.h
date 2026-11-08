/* SPDX-License-Identifier: GPL-3.0-or-later
 * MWMS v1: one stopped module-set transaction, over the production lifecycle.
 * Header: magic, version u16, count u16, total u32, reserved-zero u32,
 * exact base SHA-256, baseline MWS1 SHA-256. Then length u32 and an MWRM
 * package per change, zero padded to four bytes. No firmware or addresses.
 * One change per module; predecessors remain allocation roots until Keep.
 */
#ifndef MODWERK_SET_PACKAGE_H
#define MODWERK_SET_PACKAGE_H
#include <stdint.h>
#include "loader.h"
#define RUNTIME_SET_MAGIC 0x4d574d53u
#define RUNTIME_SET_HEADER 80u
#define RUNTIME_SET_CHANGES RUNTIME_MODULES /* a set may change every installed module at once */
static inline uint32_t runtime_set_u32(const uint8_t *p)
{ return (uint32_t)p[0]<<24 | (uint32_t)p[1]<<16 | (uint32_t)p[2]<<8 | p[3]; }
/* Full bounds, padding and duplicate checks precede any allocation. */
static inline int runtime_set_parse(const uint8_t *data, uint32_t bytes,
    const uint8_t *package[RUNTIME_SET_CHANGES], uint32_t length[RUNTIME_SET_CHANGES])
{
    if (!data || bytes < RUNTIME_SET_HEADER || runtime_set_u32(data) != RUNTIME_SET_MAGIC ||
        data[4] || data[5] != 1u || data[6] || !data[7] || data[7] > RUNTIME_SET_CHANGES ||
        runtime_set_u32(data+8) != bytes || runtime_set_u32(data+12)) return 0;
    uint32_t at = RUNTIME_SET_HEADER;
    unsigned count = data[7];
    for (unsigned i=0; i<count; ++i) {
        if (bytes-at < 4u) return 0;
        uint32_t n = runtime_set_u32(data+at); at += 4u;
        if (n < 32u || n > bytes-at) return 0;
        const uint8_t *p = data+at;
        if (runtime_set_u32(p) != 0x4d57524du || p[4] || p[5] < 4u || p[5] > RUNTIME_ABI || !runtime_set_u32(p+28)) return 0;
        for (unsigned k=0; k<i; ++k) if (runtime_set_u32(package[k]+28) == runtime_set_u32(p+28)) return 0;
        package[i]=p; length[i]=n; at += n;
        unsigned pad = (4u-n%4u)%4u;
        if (pad > bytes-at) return 0;
        for (unsigned k=0; k<pad; ++k) if (data[at+k]) return 0;
        at += pad;
    }
    return at == bytes ? (int)count : 0;
}
#endif
