/* SPDX-License-Identifier: MIT
 * The board's check for ordinary modules (MODWERK_RUNTIME_UI_ROOTS): a module is not retired (removed, replaced or
 * undone) while the stock UI roots name its allocation, and every present package gets foreign_roots so the loader's
 * paused-task check covers its whole image. Synthetic memory only: the stock roots' addresses come from
 * machine_lifetime.c, and the image sits at a made-up unit address. */
#define MODWERK_HOST
#define MODWERK_RUNTIME_UI_ROOTS
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#define IMAGE_AT 0x40a00000u /* the image's unit address */
#define BSS_AT (IMAGE_AT + 256u) /* past image_bytes, inside the owner's extent */
#define NODE_AT 0x40b00000u /* a stock layer record outside the module */
#define CACHE 0x46c7d8deu
#define CACHE_BYTES 1696u
#define LAYER_ROOT 0x460d165cu
#define DEFS_AT 0x40b00100u /* a stock encoder-definition array (22-byte records, 0xff ends it) */
#define STOCK_HANDLER 0x4007bd64u /* what that entry's word holds in stock */
static uint8_t image[256], cache[CACHE_BYTES], node[28], defs[24];
static uint32_t root;
static int unreadable, owner_known, site_patched;
static uint32_t unit_address(const uint8_t *p) { return IMAGE_AT + (uint32_t)(p - image); }
#define MW_IMAGE_ADDRESS(p) unit_address(p)
static void word(uint8_t *p, uint32_t v) { for (unsigned i = 0; i < 4; ++i) p[i] = (uint8_t)(v >> (24u - 8u * i)); }
static int fake_read(void *context, uint32_t address, void *out, uint32_t length)
{
    (void)context;
    if (unreadable) return 0;
    if (address >= CACHE && address - CACHE + length <= CACHE_BYTES) { memcpy(out, cache + (address - CACHE), length); return 1; }
    if (address == LAYER_ROOT && length == 4) { word(out, root); return 1; }
    if (address >= NODE_AT && address - NODE_AT + length <= sizeof node) { memcpy(out, node + (address - NODE_AT), length); return 1; }
    if (address >= DEFS_AT && address - DEFS_AT + length <= sizeof defs) { memcpy(out, defs + (address - DEFS_AT), length); return 1; }
    if (address >= BSS_AT && address - BSS_AT + length <= 256u) { memset(out, 0, length); return 1; } /* its BSS, all zero */
    return 0;
}
#define MODWERK_UI_ROOTS_READ fake_read
#include "machine_contributors.h"
unsigned modwerk_machine_paused(struct runtime_span *s, unsigned n, const struct runtime_context *c)
{ (void)s; (void)n; (void)c; return 0; }
int modwerk_runtime_owner_at(uintptr_t address, struct runtime_owner *owner)
{
    if (!owner_known || address != (uintptr_t)image) return 0;
    memset(owner, 0, sizeof *owner);
    owner->owned_extent = IMAGE_AT; owner->extent_bytes = 512; owner->image_bytes = sizeof image;
    return 1;
}
/* The loader's view of the leaving module's own sites: with `site_patched`, the module patched the definition's
 * first handler word (DEFS_AT + 2, four bytes) and its switch puts STOCK_HANDLER back there. */
void modwerk_runtime_site_view(const void *at, uint32_t address, uint8_t *out, uint32_t length)
{
    uint8_t stock[4];
    if (at != image || !site_patched) return;
    word(stock, STOCK_HANDLER);
    for (uint32_t a = address; a < address + length; ++a)
        if (a >= DEFS_AT + 2u && a < DEFS_AT + 6u) out[a - address] = stock[a - DEFS_AT - 2u];
}
#include "machine_admission_runtime.c"
static int failures;
#define CHECK(x) do { if (!(x)) { failures++; fprintf(stderr, "%s:%d: %s\n", __FILE__, __LINE__, #x); } } while (0)
static void ordinary(struct runtime_dsp *d, const uint8_t *at)
{
    memset(d, 0, sizeof *d);
    d->present = 1; d->image = at; d->image_bytes = sizeof image;
    for (unsigned i = 0; i < RUNTIME_HOOKS; ++i) d->hook_offset[i] = RUNTIME_NONE;
}
static void clear_roots(void)
{ memset(cache, 0, sizeof cache); memset(node, 0, sizeof node); memset(defs, 0, sizeof defs); root = 0; unreadable = 0; site_patched = 0; }
int main(void)
{
    static uint8_t other[256];
    struct runtime_dsp none = {0}, live, next, empty = {0};
    ordinary(&live, image);
    /* Installing into a free position reads nothing and marks the package for the paused-task check. */
    clear_roots(); unreadable = 1;
    ordinary(&next, other);
    CHECK(modwerk_machine_metadata_admit(&none, &next, 0, RUNTIME_METADATA_PREPARE) == RUNTIME_OK);
    CHECK(next.foreign_roots == 1);
    /* Removal with nothing open: admitted, at PREPARE and at SWITCH. */
    clear_roots();
    empty.foreign_roots = 1;
    CHECK(modwerk_machine_metadata_admit(&live, &empty, 0, RUNTIME_METADATA_PREPARE) == RUNTIME_OK);
    CHECK(empty.foreign_roots == 0);
    CHECK(modwerk_machine_metadata_admit(&live, &empty, 0, RUNTIME_METADATA_SWITCH) == RUNTIME_OK);
    /* Its key layer on top (the layer root names a record in its code): refused, removal and replacement alike. */
    root = IMAGE_AT + 0x40u;
    CHECK(modwerk_machine_metadata_admit(&live, &empty, 0, RUNTIME_METADATA_PREPARE) == RUNTIME_UI_OPEN);
    CHECK(modwerk_machine_metadata_admit(&live, &empty, 0, RUNTIME_METADATA_SWITCH) == RUNTIME_UI_OPEN);
    ordinary(&next, other);
    CHECK(modwerk_machine_metadata_admit(&live, &next, 0, RUNTIME_METADATA_PREPARE) == RUNTIME_UI_OPEN);
    /* A stock layer whose key definitions point into the module: refused. */
    clear_roots();
    root = NODE_AT; word(node + 4, IMAGE_AT + 0x80u);
    CHECK(modwerk_machine_metadata_admit(&live, &empty, 0, RUNTIME_METADATA_PREPARE) == RUNTIME_UI_OPEN);
    /* #1386: a stock layer's encoder definition whose handler names the module. Where stock wrote it (a window the
     * module opened, say), refused; where the module's own site patched it (Micro Timing's LEVEL entry), its switch
     * puts stock's handler back, so removal and Undo go ahead, also after the page has been opened. */
    clear_roots();
    root = NODE_AT; word(node + 8, DEFS_AT); word(defs + 2, IMAGE_AT + 0x20u); defs[22] = 0xffu;
    CHECK(modwerk_machine_metadata_admit(&live, &empty, 0, RUNTIME_METADATA_SWITCH) == RUNTIME_UI_OPEN);
    site_patched = 1;
    CHECK(modwerk_machine_metadata_admit(&live, &empty, 0, RUNTIME_METADATA_SWITCH) == RUNTIME_OK);
    CHECK(modwerk_machine_metadata_admit(&live, &empty, 0, RUNTIME_METADATA_PREPARE) == RUNTIME_OK);
    word(defs + 6, IMAGE_AT + 0x24u); /* a second handler outside the site still holds it */
    CHECK(modwerk_machine_metadata_admit(&live, &empty, 0, RUNTIME_METADATA_SWITCH) == RUNTIME_UI_OPEN);
    /* A cached key callback naming the module: refused. */
    clear_roots();
    word(cache + 100, IMAGE_AT + 0x10u);
    CHECK(modwerk_machine_metadata_admit(&live, &empty, 0, RUNTIME_METADATA_PREPARE) == RUNTIME_UI_OPEN);
    /* A root into its BSS: past image_bytes, so only the owner's extent sees it. */
    clear_roots();
    root = BSS_AT;
    owner_known = 0;
    CHECK(modwerk_machine_metadata_admit(&live, &empty, 0, RUNTIME_METADATA_PREPARE) != RUNTIME_UI_OPEN);
    owner_known = 1;
    CHECK(modwerk_machine_metadata_admit(&live, &empty, 0, RUNTIME_METADATA_PREPARE) == RUNTIME_UI_OPEN);
    /* Roots that cannot be read refuse rather than admit. */
    clear_roots(); unreadable = 1;
    CHECK(modwerk_machine_metadata_admit(&live, &empty, 0, RUNTIME_METADATA_PREPARE) == RUNTIME_UI_OPEN);
    /* Re-admitting the same image (nothing is retired) reads nothing. */
    ordinary(&next, image);
    CHECK(modwerk_machine_metadata_admit(&live, &next, 0, RUNTIME_METADATA_SWITCH) == RUNTIME_OK);
    CHECK(next.foreign_roots == 1);
    if (failures) return 1;
    puts("Module UI roots: removal, replacement and Undo refused while a window or key layer names the module; foreign roots for every package.");
    return 0;
}
