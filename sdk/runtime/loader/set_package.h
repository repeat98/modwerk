/* SPDX-License-Identifier: GPL-3.0-or-later
 * MWMS v1: one stopped module-set transaction, over the production lifecycle.
 * Header: magic, version u16, count u16, total u32, reserved-zero u32,
 * exact base SHA-256, baseline MWS1 SHA-256. Then length u32 and an MWRM
 * package per change, zero padded to four bytes. No firmware or addresses.
 * One change per module; predecessors remain allocation roots until Keep.
 * v2 (capability 4096) appends, after the last package, a count u32 and that many
 * (module u32, in use u16, wake u16, rest u16, zero u16) entries: what each measured catalogue
 * module adds to the frame interrupt's share, per mille of a frame, as the site measured it on a
 * unit (sdk/machines/octatrack/frame-costs.json): on a track or slot it takes, once
 * when a resting module wakes, and installed on none. Each at most 2000 (0 0 0: measured to cost
 * nothing), modules in ascending order. A base that took v2 replaces its table with these; v1 leaves it as it was.
 */
#ifndef MODWERK_SET_PACKAGE_H
#define MODWERK_SET_PACKAGE_H
#include <stdint.h>
#include "loader.h"
#define RUNTIME_SET_MAGIC 0x4d574d53u
#define RUNTIME_SET_HEADER 80u
#define RUNTIME_SET_CHANGES RUNTIME_MODULES /* a set may change every installed module at once */
#define RUNTIME_SET_COSTS 128u /* v2's cost table: at most this many modules */
#define RUNTIME_SET_COST_BYTES 12u /* one entry */
static inline uint32_t runtime_set_u32(const uint8_t *p)
{ return (uint32_t)p[0]<<24 | (uint32_t)p[1]<<16 | (uint32_t)p[2]<<8 | p[3]; }
/* Full bounds, padding and duplicate checks precede any allocation. */
static inline int runtime_set_parse(const uint8_t *data, uint32_t bytes,
    const uint8_t *package[RUNTIME_SET_CHANGES], uint32_t length[RUNTIME_SET_CHANGES])
{
    if (!data || bytes < RUNTIME_SET_HEADER || runtime_set_u32(data) != RUNTIME_SET_MAGIC ||
        data[4] || (data[5] != 1u && data[5] != 2u) || data[6] || !data[7] || data[7] > RUNTIME_SET_CHANGES ||
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
    if (data[5] == 2u) {
        if (bytes-at < 4u) return 0;
        uint32_t n = runtime_set_u32(data+at); at += 4u;
        if (n > RUNTIME_SET_COSTS || n*RUNTIME_SET_COST_BYTES > bytes-at) return 0;
        for (uint32_t k=0, last=0; k<n; ++k, at += RUNTIME_SET_COST_BYTES) {
            uint32_t module = runtime_set_u32(data+at), use = (uint32_t)data[at+4]<<8 | data[at+5], wake = (uint32_t)data[at+6]<<8 | data[at+7],
                rest = (uint32_t)data[at+8]<<8 | data[at+9];
            if (module <= last || use > 2000u || wake > 2000u || rest > 2000u || data[at+10] || data[at+11]) return 0;
            last = module;
        }
    }
    return at == bytes ? (int)count : 0;
}
/* v2's cost table, after runtime_set_parse accepted `data`: its entries in *table, their count; 0 for v1. */
static inline unsigned runtime_set_costs(const uint8_t *data, uint32_t bytes, const uint8_t **table)
{
    *table = 0;
    if (!data || bytes < RUNTIME_SET_HEADER || data[5] != 2u) return 0;
    uint32_t at = RUNTIME_SET_HEADER;
    for (unsigned i=0; i<data[7]; ++i) { uint32_t n = runtime_set_u32(data+at); at += 4u + n + (4u-n%4u)%4u; }
    *table = data+at+4u;
    return runtime_set_u32(data+at);
}
#endif
