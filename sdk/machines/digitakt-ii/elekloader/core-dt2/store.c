/* SPDX-License-Identifier: GPL-2.0-or-later */
/* Modwerk's Digitakt II core: the modules' kit data (core_kitdata) and project data (core_projdata).
 *
 * Kit data: KIT_ROOM (146) bytes after each serialized kit record's end mark, at record + KIT_PAD. The area is the
 * mark 'K', a big-endian layout id (CRC-16/CCITT-FALSE over each descriptor's tag and big-endian size, in table
 * order; 0 becomes 1), then every descriptor's block back to back, stopping at the first that does not fit; the
 * rest is zero. Kits copied in RAM carry their blocks: into a project kit directly, into any other buffer through a
 * shadow kept by its address, which a later save of that buffer writes.
 *
 * Project data: the project file's header gap (+0x1c .. +0x200): 'ELKP', then records {tag, size, data}, then a
 * zero tag. Bytes in either place that are not the core's are never written, and are counted in
 * core_store_conflicts. */
#include <stdint.h>
#include "digitakt-mk2/core.h"

#define AREA 146 /* = KIT_ROOM; store.s refuses another value */
#define MARK 0x4b
#define HEAD 3
#define SHADOWS 8
#define GAP_AT 0x1c
#define GAP 484
#define ELKP 0x454c4b50u
#define KIT_TAIL 0x138 /* the pattern object's word naming the kit on */

#ifdef MODWERK_HOST
extern uintptr_t core_store_host[5]; /* the host test's kits and pattern object, in core_store_layout's order */
#define LAYOUT(i) core_store_host[i]
#else
extern const uint32_t core_store_layout[5];
#define LAYOUT(i) ((uintptr_t)core_store_layout[i])
#endif
#define FW_KITS LAYOUT(0)
#define KIT_SIZE LAYOUT(1)
#define KIT_PAD LAYOUT(2)
#define PATTERN_OBJ LAYOUT(4)

extern const core_kitdata_t *const core_kitdata[];
extern const core_projdata_t *const core_projdata[];

volatile uint32_t core_store_conflicts;

static struct {
    uintptr_t addr; /* 0: free */
    uint8_t bytes[AREA];
} shadows[SHADOWS];
static unsigned int next_shadow;
static uint8_t scratch[AREA]; /* not on the stack: memcpy runs on small task stacks */
static uint16_t layout_id;    /* 0 until computed */

static void zero(uint8_t *p, uint32_t n)
{
    for (uint32_t i = 0; i < n; ++i)
        p[i] = 0;
}

static void copy(uint8_t *dst, const uint8_t *src, uint32_t n)
{
    for (uint32_t i = 0; i < n; ++i)
        dst[i] = src[i];
}

static int blank(const uint8_t *p, uint32_t n)
{
    for (uint32_t i = 0; i < n; ++i)
        if (p[i])
            return 0;
    return 1;
}

static uint32_t get32(const uint8_t *p)
{
    return (uint32_t)p[0] << 24 | (uint32_t)p[1] << 16 | (uint32_t)p[2] << 8 | p[3];
}

static void put32(uint8_t *p, uint32_t v)
{
    p[0] = (uint8_t)(v >> 24);
    p[1] = (uint8_t)(v >> 16);
    p[2] = (uint8_t)(v >> 8);
    p[3] = (uint8_t)v;
}

static uint16_t crc16(uint16_t crc, const uint8_t *p, uint32_t n)
{
    for (uint32_t i = 0; i < n; ++i) {
        crc ^= (uint16_t)(p[i] << 8);
        for (int bit = 0; bit < 8; ++bit)
            crc = crc & 0x8000 ? (uint16_t)(crc << 1 ^ 0x1021) : (uint16_t)(crc << 1);
    }
    return crc;
}

static uint16_t layout(void)
{
    if (!layout_id) {
        uint16_t crc = 0xffff;
        for (const core_kitdata_t *const *d = core_kitdata; *d; ++d) {
            uint8_t size[4];
            put32(size, (*d)->size);
            crc = crc16(crc16(crc, (const uint8_t *)(*d)->tag, 4), size, 4);
        }
        layout_id = crc ? crc : 1;
    }
    return layout_id;
}

/* Project kit n for a RAM address, or -1 for any other buffer. */
static int kit_index(const void *addr)
{
    const uintptr_t a = (uintptr_t)addr;
    if (a < FW_KITS || (a - FW_KITS) % KIT_SIZE)
        return -1;
    const uintptr_t n = (a - FW_KITS) / KIT_SIZE;
    return n < CORE_KITS ? (int)n : -1;
}

static void pack(int kit, uint8_t *area)
{
    zero(area, AREA);
    area[0] = MARK;
    area[1] = (uint8_t)(layout() >> 8);
    area[2] = (uint8_t)layout();
    uint32_t at = HEAD;
    for (const core_kitdata_t *const *d = core_kitdata; *d; ++d) {
        const uint32_t size = (*d)->size;
        if (size > AREA - at)
            break;
        copy(area + at, (const uint8_t *)(*d)->data + (uint32_t)kit * size, size);
        at += size;
    }
}

static void unpack(int kit, const uint8_t *area)
{
    int fits = area[0] == MARK && (uint16_t)(area[1] << 8 | area[2]) == layout();
    uint32_t at = HEAD;
    for (const core_kitdata_t *const *d = core_kitdata; *d; ++d) {
        const core_kitdata_t *const data = *d;
        uint8_t *const block = (uint8_t *)data->data + (uint32_t)kit * data->size;
        fits = fits && data->size <= AREA - at;
        if (fits) {
            copy(block, area + at, data->size);
            at += data->size;
        } else {
            zero(block, data->size);
        }
        if (data->changed)
            data->changed(kit, fits);
    }
}

static uint8_t *shadow_of(const void *addr)
{
    for (unsigned int i = 0; i < SHADOWS; ++i)
        if (shadows[i].addr == (uintptr_t)addr)
            return shadows[i].bytes;
    return 0;
}

static void shadow_set(const void *addr, const uint8_t *bytes)
{
    uint8_t *slot = shadow_of(addr);
    if (!slot) {
        shadows[next_shadow].addr = (uintptr_t)addr;
        slot = shadows[next_shadow].bytes;
        next_shadow = (next_shadow + 1) % SHADOWS;
    }
    copy(slot, bytes, AREA);
}

static void shadow_drop(const void *addr)
{
    for (unsigned int i = 0; i < SHADOWS; ++i)
        if (shadows[i].addr == (uintptr_t)addr)
            shadows[i].addr = 0;
}

int core_kit_on(void)
{
    const uint8_t *const pattern = *(const uint8_t *const *)PATTERN_OBJ;
    if (!pattern)
        return -1;
    const uint32_t kit = *(const uint32_t *)(pattern + KIT_TAIL);
    return kit < CORE_KITS ? (int)kit : -1;
}

uint32_t core_kitdata_room(void)
{
    return AREA - HEAD;
}

void core_kitdata_save(uint8_t *record, const uint8_t *kit)
{
    if (!core_kitdata[0])
        return;
    uint8_t *const area = record + KIT_PAD;
    if (area[0] != MARK && !blank(area, AREA)) {
        ++core_store_conflicts;
        return;
    }
    const int n = kit_index(kit);
    const uint8_t *shadow;
    if (n >= 0)
        pack(n, area);
    else if ((shadow = shadow_of(kit)))
        copy(area, shadow, AREA);
    else
        zero(area, AREA);
}

void core_kitdata_load(uint8_t *kit, const uint8_t *record)
{
    if (!core_kitdata[0])
        return;
    const uint8_t *const area = record + KIT_PAD;
    const int ours = area[0] == MARK;
    if (!ours && !blank(area, AREA))
        ++core_store_conflicts;
    const int n = kit_index(kit);
    if (n >= 0)
        unpack(n, area);
    else if (ours)
        shadow_set(kit, area);
    else
        shadow_drop(kit);
}

void core_kit_copied(void *dst, const void *src)
{
    if (!core_kitdata[0] || dst == src)
        return;
    const int s = kit_index(src);
    const uint8_t *shadow;
    int have = 1;
    if (s >= 0)
        pack(s, scratch);
    else if ((shadow = shadow_of(src)))
        copy(scratch, shadow, AREA);
    else
        have = 0;
    const int d = kit_index(dst);
    if (d >= 0) {
        if (have)
            unpack(d, scratch);
    } else if (have) {
        shadow_set(dst, scratch);
    } else {
        shadow_drop(dst);
    }
}

void core_projdata_save(uint8_t *file)
{
    if (!core_projdata[0])
        return;
    uint8_t *const gap = file + GAP_AT;
    if (get32(gap) != ELKP && !blank(gap, GAP)) {
        ++core_store_conflicts;
        return;
    }
    zero(gap, GAP);
    put32(gap, ELKP);
    uint32_t at = 4;
    for (const core_projdata_t *const *d = core_projdata; *d; ++d) {
        const core_projdata_t *const data = *d;
        if (GAP - at < 12 || data->size > GAP - at - 12)
            continue; /* a later, smaller block may still fit */
        copy(gap + at, (const uint8_t *)data->tag, 4);
        put32(gap + at + 4, data->size);
        copy(gap + at + 8, data->data, data->size);
        at += 8 + data->size;
    }
}

void core_projdata_load(const uint8_t *file)
{
    const uint8_t *const gap = file + GAP_AT;
    const int ours = get32(gap) == ELKP;
    if (!ours && !blank(gap, GAP))
        ++core_store_conflicts;
    for (const core_projdata_t *const *d = core_projdata; *d; ++d) {
        const core_projdata_t *const data = *d;
        int found = 0;
        zero(data->data, data->size);
        for (uint32_t at = 4; ours && GAP - at >= 8;) {
            const uint32_t tag = get32(gap + at), size = get32(gap + at + 4);
            if (!tag || size > GAP - at - 8)
                break; /* the end, or a corrupt record */
            if (tag == get32((const uint8_t *)data->tag)) {
                copy(data->data, gap + at + 8, size < data->size ? size : data->size);
                found = 1;
                break;
            }
            at += 8 + size;
        }
        if (data->loaded)
            data->loaded(found);
    }
}
