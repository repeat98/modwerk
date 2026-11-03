/* SPDX-License-Identifier: GPL-3.0-or-later
 * The two-slot layout's records and choices (slots.h), with no writes: the stub (stub.c) and the base (flash.c)
 * read NOR through the same code, and the host tests run it against their NOR model. */
#include "slots.h"

#ifdef MODWERK_HOST
extern uint8_t modwerk_test_nor[];
#define NOR8(a) modwerk_test_nor[a]
#else
#define NOR8(a) (*(volatile const uint8_t *)(uintptr_t)(a))
#endif

static uint32_t slot_rd32(const uint8_t *p) { return (uint32_t)p[0] << 24 | (uint32_t)p[1] << 16 | (uint32_t)p[2] << 8 | p[3]; }
static void slot_wr32(uint8_t *p, uint32_t v) { p[0] = (uint8_t)(v >> 24); p[1] = (uint8_t)(v >> 16); p[2] = (uint8_t)(v >> 8); p[3] = (uint8_t)v; }
static uint32_t slot_nor32(uint32_t a) { return (uint32_t)NOR8(a) << 24 | (uint32_t)NOR8(a + 1u) << 16 | (uint32_t)NOR8(a + 2u) << 8 | NOR8(a + 3u); }

/* FNV-1a: any byte of the record missing or half programmed changes it. */
uint32_t slot_record_check(const uint8_t *record)
{
    uint32_t h = 0x811c9dc5u;
    for (unsigned i = 0; i < REC_CHECK; ++i) h = (h ^ record[i]) * 0x01000193u;
    return h;
}

void slot_record(uint8_t *page, uint32_t generation, uint32_t length, const uint8_t *identity, int confirmed)
{
    for (unsigned i = 0; i < SLOT_RECORD; ++i) page[i] = 0xff;
    slot_wr32(page + REC_MAGIC, SLOT_MAGIC); slot_wr32(page + REC_GENERATION, generation); slot_wr32(page + REC_LENGTH, length);
    for (unsigned i = 0; i < 32u; ++i) page[REC_IDENTITY + i] = identity ? identity[i] : 0;
    slot_wr32(page + REC_CHECK, slot_record_check(page));
    if (confirmed) page[REC_CONFIRMED] = page[REC_CONFIRMED + 1u] = 0;
}

uint32_t slot_fnv(uint32_t at, uint32_t n)
{
    uint32_t h = 0x811c9dc5u;
    while (n--) h = (h ^ NOR8(at++)) * 0x01000193u;
    return h;
}
int slot_stub_whole(void)
{
    uint32_t len = slot_nor32(SLOT_STUB + SECT), sum = 0, code = slot_nor32(SLOT_STUB + STUB_MARK + 8u);
    if (slot_nor32(SLOT_STUB) != 0x454c454bu || len > STUB_MARK - SECT - 8u) return 0; /* "ELEK" */
    for (uint32_t i = 0; i < len; ++i) sum += NOR8(SLOT_STUB + SECT + 8u + i);
    if (sum != slot_nor32(SLOT_STUB + SECT + 4u) || slot_nor32(SLOT_STUB + STUB_MARK) != 0x4d575354u || /* "MWST" */
        slot_nor32(SLOT_STUB + STUB_MARK + 4u) != (0x55420000u | STUB_VERSION) || !code || code > SLOT_STUB_BYTES - STUB_CODE)
        return 0; /* "UB", the version */
    return slot_fnv(SLOT_STUB + STUB_CODE, code) == slot_nor32(SLOT_STUB + STUB_MARK + 12u);
}

void slot_read(uint32_t base, struct slot_state *s)
{
    uint8_t record[REC_CHECK + 4u];
    for (unsigned i = 0; i < sizeof record; ++i) record[i] = NOR8(base + i);
    s->whole = 0;
    s->generation = slot_rd32(record + REC_GENERATION); s->length = slot_rd32(record + REC_LENGTH);
    for (unsigned i = 0; i < 32u; ++i) s->identity[i] = record[REC_IDENTITY + i];
    unsigned tries = (unsigned)NOR8(base + REC_TRIES) << 8 | NOR8(base + REC_TRIES + 1u);
    s->tries = 0;
    for (unsigned bit = 0; bit < 16u; ++bit) s->tries += !(tries >> bit & 1u);
    s->confirmed = NOR8(base + REC_CONFIRMED) != 0xffu || NOR8(base + REC_CONFIRMED + 1u) != 0xffu; /* even half programmed */
    if (slot_rd32(record + REC_MAGIC) != SLOT_MAGIC || slot_rd32(record + REC_CHECK) != slot_record_check(record)) return;
    if (s->length < SECT + 8u || s->length > SLOT_CONTAINER_MAX) return;
    uint32_t c = base + SLOT_RECORD, len = slot_nor32(c + SECT), sum = 0;
    if (slot_nor32(c) != 0x454c454bu || len > s->length - SECT - 8u) return; /* "ELEK" */
    for (uint32_t i = 0; i < len; ++i) sum += NOR8(c + SECT + 8u + i);
    s->whole = sum == slot_nor32(c + SECT + 4u);
}

int slot_newest(const struct slot_state *s)
{
    if (s[0].whole && s[1].whole) return s[1].generation > s[0].generation;
    return s[0].whole ? 0 : s[1].whole ? 1 : -1;
}
int slot_pick(const struct slot_state *s, int *mark)
{
    int n = slot_newest(s);
    *mark = 0;
    if (n < 0 || s[n].confirmed) return n;
    *mark = s[n].tries < 16u; /* past SLOT_TRIES, a cleared bit records that the other one started (status) */
    if (s[n].tries < SLOT_TRIES) return n;
    return s[!n].whole ? !n : n;
}
int slot_keep(const struct slot_state *s)
{
    int a = s[0].whole && s[0].confirmed, b = s[1].whole && s[1].confirmed;
    if (a && b) return s[1].generation > s[0].generation;
    if (a || b) return b;
    return slot_newest(s) == 1;
}
