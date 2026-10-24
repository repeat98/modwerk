/* SPDX-License-Identifier: GPL-3.0-or-later
 * Module effect handles, per project (build_core.py --dsp-loader; owner, 11 October 2026; the design is
 * docs/OCTATRACK_ELEKLOADER_MIGRATION.md, "Projects across module changes"). A module effect's id is a
 * handle its project gives it, not the module's for good. The map names the module behind each handle:
 * its module id, parameter-layout number and display name. It lives in battery RAM, which survives a
 * power cycle as the project itself does, and in project.work as one '#MODWERK_FX=' line per handle the
 * project uses, which stock's loader skips like any '#' line (fxmap.s). A project without such lines
 * reads today's catalogue assignments (identity.c's modwerk_fx_legacy). */
#include <stdint.h>
#include "fxids.h"
#include "fxmap.h"

struct fx_entry { uint32_t module; uint16_t layout, spare; char name[16]; };
struct fx_map { uint32_t magic, generation; struct fx_entry e[MODWERK_FX_IDS]; uint32_t sum; };
struct fx_legacy { uint32_t module; uint32_t id; char name[16]; };
/* 'MWFX' at 32 ids, as before; another width another magic ('MWF' and the count), so a map of another size is
 * dropped on purpose, not by a checksum that happens to fail. */
#define MAGIC (MODWERK_FX_IDS == 32u ? 0x4d574658u : 0x4d574600u | MODWERK_FX_IDS)
#define LINE "#MODWERK_FX="

extern const struct fx_legacy modwerk_fx_legacy[];     /* identity.c: today's catalogue assignments */
extern const uint32_t modwerk_fx_legacy_count;

#ifdef MODWERK_HOST
struct fx_map modwerk_test_map;
extern uint8_t modwerk_test_live_fx[16]; /* dsp.c's */
uint8_t modwerk_test_banks[16][8][16];
int (*modwerk_test_write)(uint32_t file, const void *data, unsigned length);
#define MAP (&modwerk_test_map)
#define RUNNING(i) modwerk_test_live_fx[i]
#define PART_FX(bank, part, i) modwerk_test_banks[bank][part][i]
unsigned modwerk_test_bank_now;
#define BANK_NOW() modwerk_test_bank_now
#define WRITE modwerk_test_write
#else
/* Battery RAM nothing else uses: stock references nothing in 0x100f859c-0x100fff00 (Octabam's
 * STEP_LOCKS.md), PLAY MODES and PLOCKS P2 hold 0x100f8600-0x100f8f06. */
#define MAP ((volatile struct fx_map *)0x100fe000u)
/* It ends below crash.c's record at 0x100ff800 (128 ids: 3,084 bytes). */
typedef char map_fits[sizeof(struct fx_map) <= 0x1800u ? 1 : -1];
#define RUNNING(i) (((const volatile uint8_t *)0x80000ec4u)[i]) /* what each track runs: FX1 T1-T8, then FX2 */
/* All 16 banks stay in RAM; each holds four working Parts and four saved ones (dsp.c's PART). */
#define PART_FX(bank, part, i) (((const volatile uint8_t *)(0x400e21e0u + (bank) * 0x9b340u + \
    ((part) < 4 ? 0x8ed80u : 0x9504au - 4u * 6322u) + (part) * 6322u))[i])
#define WRITE ((int (*)(uint32_t, const void *, unsigned))0x400166b8u) /* write(file, data, n), the writer's own */
/* The current bank (selection.c): its base, 0 before a project. */
#define BANK_NOW() ((*(volatile const uint32_t *)0x46c82456u - 0x400e21e0u) / 0x9b340u)
#endif

static uint32_t checksum_of(unsigned words) /* the map's first `words` words */
{
    const volatile uint32_t *w = (const volatile uint32_t *)MAP;
    uint32_t sum = 0x5a17u;
    for (unsigned i = 0; i < words; ++i) sum = sum * 31u + w[i];
    return sum;
}
static uint32_t checksum(void) { return checksum_of((sizeof(struct fx_map) - 4u) / 4u); }
/* A map a 32-id base left (magic 'MWFX', 32 entries, its sum after them): the first 32 entries sit where they sat,
 * so a wider base keeps them, clears the rest and seals it as its own. Dropping it would forget, until the next
 * project load from the card, which handle the project gave each module (a RAM boot restores the project from
 * battery RAM, not the card): installs would then take other handles, and the project's would run dry. */
#define OLD_WORDS ((8u + 24u * 32u) / 4u)
static int widened(void)
{
    if (MODWERK_FX_IDS == 32u || MAP->magic != 0x4d574658u || ((const volatile uint32_t *)MAP)[OLD_WORDS] != checksum_of(OLD_WORDS))
        return 0;
    for (unsigned k = 32; k < MODWERK_FX_IDS; ++k) {
        volatile struct fx_entry *e = &MAP->e[k];
        e->module = 0, e->layout = 0, e->spare = 0;
        for (unsigned i = 0; i < 16u; ++i) e->name[i] = 0;
    }
    MAP->magic = MAGIC, MAP->generation = MAP->generation + 1u, MAP->sum = checksum();
    return 1;
}
static void put(volatile struct fx_entry *e, uint32_t module, unsigned layout, const char *name);
/* No map this base can read (a fresh battery, another layout): today's catalogue assignments, as a project without
 * '#MODWERK_FX=' lines gets at its load. An empty map instead would let installs take the handles a project names
 * for its modules, and those would then run dry. */
static void seeded(void)
{
    for (unsigned k = 0; k < MODWERK_FX_IDS; ++k) put(&MAP->e[k], 0, 0, 0);
    for (unsigned i = 0; i < modwerk_fx_legacy_count; ++i)
        if (modwerk_fx_legacy[i].id < MODWERK_FX_IDS)
            put(&MAP->e[modwerk_fx_legacy[i].id], modwerk_fx_legacy[i].module, 0, modwerk_fx_legacy[i].name);
    MAP->magic = MAGIC, MAP->generation = 1, MAP->sum = checksum();
}
/* The whole check (the map's 3 KB in battery RAM, uncached: about 420 µs on the unit, 2.5 % of the CPU when it ran on
 * every tick, 20 October 2026) once in 60 calls; between, the magic and the generation word, which every writer here
 * changes when it seals the map, so a change by this base is seen at once and damage within a second. */
static uint32_t checked_generation, checked_at, checks;
static int valid(void)
{
    ++checks;
    if (checked_at && checks - checked_at < 60u && MAP->magic == MAGIC && MAP->generation == checked_generation) return 1;
    if (!((MAP->magic == MAGIC && MAP->sum == checksum()) || widened())) seeded();
    checked_at = checks, checked_generation = MAP->generation;
    return 1;
}
static void seal(void)
{
    MAP->magic = MAGIC;
    MAP->generation = MAP->generation + 1u;
    MAP->sum = checksum();
}
static void put(volatile struct fx_entry *e, uint32_t module, unsigned layout, const char *name)
{
    e->module = module, e->layout = (uint16_t)layout, e->spare = 0;
    unsigned i = 0;
    for (; name && i < 15u && name[i]; ++i) e->name[i] = name[i];
    for (; i < 16u; ++i) e->name[i] = 0;
}

/* Where the project names `id` first, for status.c's MISSING page: the current bank first, its working Parts before
 * the saved copies, then the other banks in order. 0 when nowhere, 1 a working Part, 2 only a saved copy; with the
 * bank (0-15), Part (0-3) and track (0-7). */
int modwerk_fxmap_where(unsigned id, unsigned *bank, unsigned *part, unsigned *track)
{
    unsigned now = BANK_NOW();
    if (now > 15u) now = 0; /* before a project the base reads as 0, below the first bank */
    for (unsigned b = 0; b < 16u; ++b) {
        unsigned at = !b ? now : b - 1u < now ? b - 1u : b;
        for (unsigned p = 0; p < 8u; ++p)
            for (unsigned i = 0; i < 16u; ++i)
                if (PART_FX(at, p, i) == id) { *bank = at, *part = p & 3u, *track = i & 7u; return p < 4u ? 1 : 2; }
    }
    return 0;
}
/* The module effect ids the project names anywhere: what runs, and every bank's Parts, working and saved. */
fx_set modwerk_fxmap_used(void)
{
    fx_set used = {{0}};
    for (unsigned i = 0; i < 16u; ++i) used = fx_with(used, RUNNING(i));
    for (unsigned bank = 0; bank < 16u; ++bank)
        for (unsigned part = 0; part < 8u; ++part)
            for (unsigned i = 0; i < 16u; ++i) used = fx_with(used, PART_FX(bank, part, i));
    return fx_and(used, modwerk_fx_modules);
}
#ifdef MODWERK_DEV
extern volatile uint32_t modwerk_cost[28]; /* diag.h: [18] this function's time, [19] its calls */
uint32_t modwerk_fxmap_generation(void)
{
    uint32_t t0 = *(volatile uint32_t *)0xfc07c00cu, g = valid() ? MAP->generation : 0;
    modwerk_cost[18] += *(volatile uint32_t *)0xfc07c00cu - t0; ++modwerk_cost[19];
    return g;
}
#else
uint32_t modwerk_fxmap_generation(void) { return valid() ? MAP->generation : 0; }
#endif
/* The module the map names at handle `id`, 0 none. */
uint32_t modwerk_fxmap_module(unsigned id) { return id < MODWERK_FX_IDS && valid() ? MAP->e[id].module : 0; }
/* The handle the map gives `module`, -1 none. */
int modwerk_fxmap_handle(uint32_t module)
{
    if (!module || !valid()) return -1;
    for (unsigned k = 0; k < MODWERK_FX_IDS; ++k) if (fx_in(modwerk_fx_modules, k) && MAP->e[k].module == module) return (int)k;
    return -1;
}
/* The name the map records at `id`, else today's catalogue name for it (no project loaded under this
 * base yet), NUL-ended in `out` (16 bytes); "" none. */
void modwerk_fxmap_name(unsigned id, char *out)
{
    out[0] = 0;
    if (id >= MODWERK_FX_IDS) return;
    if (valid() && MAP->e[id].module) for (unsigned i = 0; i < 16u; ++i) out[i] = MAP->e[id].name[i];
    else for (unsigned i = 0; i < modwerk_fx_legacy_count; ++i)
        if (modwerk_fx_legacy[i].id == id) for (unsigned c = 0; c < 16u; ++c) out[c] = modwerk_fx_legacy[i].name[c];
    out[15] = 0;
}
/* The module behind handle `id`: the map's entry, else today's catalogue assignment; 0 when neither names one. */
int modwerk_fxmap_describe(unsigned id, uint32_t *module, uint16_t *layout, char *name)
{
    *module = 0, *layout = 0;
    modwerk_fxmap_name(id, name);
    if (id >= MODWERK_FX_IDS) return 0;
    if (valid() && MAP->e[id].module) *module = MAP->e[id].module, *layout = MAP->e[id].layout;
    else for (unsigned i = 0; i < modwerk_fx_legacy_count; ++i) if (modwerk_fx_legacy[i].id == id) *module = modwerk_fx_legacy[i].module;
    return *module != 0;
}
/* A module took handle `id` (dsp.c, at its switch): the map names it there. */
void modwerk_fxmap_assign(unsigned id, uint32_t module, unsigned layout, const char *name)
{
    if (!fx_in(modwerk_fx_modules, id)) return;
    if (!valid()) { MAP->generation = 0; for (unsigned k = 0; k < MODWERK_FX_IDS; ++k) put(&MAP->e[k], 0, 0, 0); }
    put(&MAP->e[id], module, layout, name);
    seal();
}

/* Journal checks never repair/seed a map or adopt a new generation. */
uint32_t modwerk_fxmap_checked_generation(void)
{ return MAP->magic==MAGIC && MAP->generation && MAP->sum==checksum()?MAP->generation:0; }
int modwerk_fxmap_allows_checked(unsigned id,uint32_t module)
{ return id<MODWERK_FX_IDS && modwerk_fxmap_checked_generation() && (!MAP->e[id].module || MAP->e[id].module==module); }
int modwerk_fxmap_current(unsigned id,uint32_t module,unsigned layout,const char *name)
{
    if(id>=MODWERK_FX_IDS || !modwerk_fxmap_checked_generation() || MAP->e[id].module!=module || MAP->e[id].layout!=layout) return 0;
    for(unsigned i=0;i<16u;++i) if(MAP->e[id].name[i]!=(name?name[i]:0)) return 0;
    return 1;
}
int modwerk_fxmap_assign_checked(unsigned id,uint32_t module,unsigned layout,const char *name)
{
    if(!fx_in(modwerk_fx_modules,id) || !module || !name || name[15] || !modwerk_fxmap_checked_generation() || MAP->generation==UINT32_MAX) return 0;
    put(&MAP->e[id],module,layout,name);seal();
    return modwerk_fxmap_current(id,module,layout,name);
}

/* The project file (fxmap.s). The loader parses project.work twice; the storing pass fills `staged`,
 * and the map takes it once the engine says the load succeeded. */
static struct fx_entry staged[MODWERK_FX_IDS];
static int staging;
static unsigned lines;
volatile uint32_t modwerk_fxmap_read, modwerk_fxmap_written; /* lines the last load took, the last save wrote */
/* Nonzero from the loader's first pass until the load's end has sealed its map: the tracks may already run the loading
 * project's handles under the last project's map (dsp.c's MISSING popup waits). Another task reads it. */
static volatile int loading;
int modwerk_fxmap_loading(void) { return loading; }
void modwerk_fxmap_begin(uint32_t storing)
{
    loading = 1;
    if (!storing) return;
    for (unsigned k = 0; k < MODWERK_FX_IDS; ++k) put(&staged[k], 0, 0, 0);
    staging = 1, lines = 0;
}
static const char *number(const char *s, unsigned base, uint32_t *out)
{
    uint32_t v = 0;
    unsigned digits = 0;
    for (;; ++s, ++digits) {
        unsigned c = (unsigned char)*s, d = c - '0' < 10u ? c - '0' : (c | 0x20u) - 'a' < 6u && base == 16u ? (c | 0x20u) - 'a' + 10u : 99u;
        if (d >= base) break;
        v = v * base + d;
    }
    *out = v;
    return digits && digits <= 8u && *s == ':' ? s + 1 : 0;
}
void modwerk_fxmap_line(const char *line, uint32_t parse_only)
{
    if (parse_only || !staging) return;
    for (unsigned i = 0; LINE[i]; ++i) if (line[i] != LINE[i]) return;
    uint32_t id, module, layout;
    const char *s = line + sizeof LINE - 1u;
    if (!(s = number(s, 10, &id)) || !(s = number(s, 16, &module)) || !(s = number(s, 10, &layout))) return;
    if (!fx_in(modwerk_fx_modules, id) || !module || layout > 0xffffu) return; /* only module handles */
    put(&staged[id], module, layout, s);
    ++lines;
}
void modwerk_fxmap_loaded(int32_t result)
{
    if (!staging) { loading = 0; return; }
    staging = 0;
    if (result < 0) { loading = 0; return; } /* a failed load keeps the project that is still there */
    modwerk_fxmap_read = lines;
    if (lines) for (unsigned k = 0; k < MODWERK_FX_IDS; ++k) put(&MAP->e[k], staged[k].module, staged[k].layout, staged[k].name);
    else {
        for (unsigned k = 0; k < MODWERK_FX_IDS; ++k) put(&MAP->e[k], 0, 0, 0);
        for (unsigned i = 0; i < modwerk_fx_legacy_count; ++i)
            if (modwerk_fx_legacy[i].id < MODWERK_FX_IDS)
                put(&MAP->e[modwerk_fx_legacy[i].id], modwerk_fx_legacy[i].module, 0, modwerk_fx_legacy[i].name);
    }
    seal();
    loading = 0; /* after the seal: a tick between would see the old generation and a half-written map */
}
/* One line per handle the project uses: "#MODWERK_FX=27:873d83cc:1:E-Verb\r\n". */
void modwerk_fxmap_write(uint32_t file)
{
    modwerk_fxmap_written = 0;
    if (!valid()) return;
    fx_set used = modwerk_fxmap_used();
    for (unsigned k = 0; k < MODWERK_FX_IDS; ++k) {
        if (!fx_in(used, k) || !MAP->e[k].module) continue;
        char line[64];
        unsigned n = 0;
        for (const char *p = LINE; *p; ++p) line[n++] = *p;
        if (k >= 100u) line[n++] = (char)('0' + k / 100u); /* 100-127 at 128 ids */
        if (k >= 10u) line[n++] = (char)('0' + k / 10u % 10u);
        line[n++] = (char)('0' + k % 10u);
        line[n++] = ':';
        for (int shift = 28; shift >= 0; shift -= 4) line[n++] = "0123456789abcdef"[MAP->e[k].module >> shift & 15u];
        line[n++] = ':';
        char digits[5];
        unsigned layout = MAP->e[k].layout, d = 0;
        do { digits[d++] = (char)('0' + layout % 10u); layout /= 10u; } while (layout);
        while (d) line[n++] = digits[--d];
        line[n++] = ':';
        for (unsigned i = 0; i < 15u && MAP->e[k].name[i]; ++i) line[n++] = MAP->e[k].name[i];
        line[n++] = '\r', line[n++] = '\n';
        WRITE(file, line, n);
        modwerk_fxmap_written = modwerk_fxmap_written + 1u;
    }
}
