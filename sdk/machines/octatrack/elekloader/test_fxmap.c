/* SPDX-License-Identifier: GPL-3.0-or-later
 * Host check of the project's handle map at 128 effect ids (cc -DMODWERK_HOST -DMODWERK_FX_IDS=128u): a handle past 99
 * goes into project.work as three digits and comes back as the same handle (docs/OCTATRACK_MORE_EFFECT_IDS.md). Its own
 * file: test_dsp.c's admission checks count on its module handles being 26, 27 and 40 only. */
#include "fxmap.c"
#include <stdio.h>
#include <string.h>
typedef char ids_128[MODWERK_FX_IDS == 128u ? 1 : -1];
const fx_set modwerk_fx_modules = {{1u << 9, 0, 0, 1u << (99 - 96) | 1u << (100 - 96) | 1u << (127 - 96)}};
const struct fx_legacy modwerk_fx_legacy[] = {{0x873d83ccu, 27, "E-Verb"}};
const uint32_t modwerk_fx_legacy_count = 1;
uint8_t modwerk_test_live_fx[16];
/* machine_registry.c's map as fxmap.c meets it: map entry 2 is POLY8, the one machine the project uses; a load stages. */
static unsigned mc_staged, mc_loaded = 99, mc_lo, mc_hi;
static uint8_t mc_sig[2];
static uint32_t mc_module;
static char mc_name[16];
void modwerk_machine_map_begin(void) { mc_staged = 0; }
void modwerk_machine_map_stage(const uint8_t *sig, unsigned lo, unsigned hi, uint32_t module, const char *name)
{ ++mc_staged, mc_sig[0] = sig[0], mc_sig[1] = sig[1], mc_lo = lo, mc_hi = hi, mc_module = module, strncpy(mc_name, name, 15); }
void modwerk_machine_map_loaded(int ok) { mc_loaded = (unsigned)ok; }
int modwerk_machine_map_line(unsigned k, uint8_t *sig, unsigned *lo, unsigned *hi, uint32_t *module, char *name)
{
    if (k != 2u) return 0;
    sig[0] = 'P', sig[1] = 'L', *lo = 1, *hi = 1, *module = 0x9fa85eefu;
    memset(name, 0, 16), strcpy(name, "POLY8");
    return 1;
}
static char written[512];
static int capture(uint32_t file, const void *data, unsigned length)
{
    (void)file;
    strncat(written, (const char *)data, length);
    return 1;
}
static unsigned failures;
#define CHECK(x) do { if (!(x)) { failures++; fprintf(stderr, "%s:%d: %s\n", __FILE__, __LINE__, #x); } } while (0)
int main(void)
{
    modwerk_test_write = capture;
    modwerk_test_live_fx[0] = 9, modwerk_test_live_fx[1] = 99, modwerk_test_live_fx[2] = 100, modwerk_test_live_fx[8] = 127;
    modwerk_fxmap_assign(9, 0x09u, 1, "Nine");
    modwerk_fxmap_assign(99, 0x99u, 1, "Ninety-nine");
    modwerk_fxmap_assign(100, 0x100u, 2, "Hundred");
    modwerk_fxmap_assign(127, 0x127u, 3, "Last");
    modwerk_fxmap_write(7);
    CHECK(modwerk_fxmap_written == 4 && modwerk_fxmap_machines_written == 1);
    CHECK(!strcmp(written, "#MODWERK_FX=9:00000009:1:Nine\r\n#MODWERK_FX=99:00000099:1:Ninety-nine\r\n"
                           "#MODWERK_FX=100:00000100:2:Hundred\r\n#MODWERK_FX=127:00000127:3:Last\r\n"
                           "#MODWERK_MC=504c:1:1:9fa85eef:POLY8\r\n")); /* the machines the project uses, after the effects */
    /* The saved lines, loaded into a cleared map: every handle back where it was. */
    modwerk_fxmap_begin(1);
    for (char *line = written, *end; (end = strstr(line, "\r\n")); line = end + 2) *end = 0, modwerk_fxmap_line(line, 0);
    modwerk_fxmap_line("#MODWERK_FX=1270:00000099:1:Too far", 0); /* past the ids: dropped */
    modwerk_fxmap_line("#MODWERK_MC=5753:9:3:00000077:Backwards", 0); /* a range that ends before it starts: dropped */
    modwerk_fxmap_line("#MODWERK_MC=5753:1:15:00000000:No module", 0);
    modwerk_fxmap_loaded(0);
    /* The machine line staged as written, apart from the effects' lines: a project without effect lines still reads
     * the catalogue's handles. */
    CHECK(mc_staged == 1 && mc_loaded == 1 && mc_sig[0] == 'P' && mc_sig[1] == 'L' && mc_lo == 1 && mc_hi == 1);
    CHECK(mc_module == 0x9fa85eefu && !strcmp(mc_name, "POLY8") && modwerk_fxmap_read == 4 && modwerk_fxmap_machines_read == 1);
    char name[16];
    modwerk_fxmap_name(100, name);
    CHECK(modwerk_fxmap_read == 4 && !strcmp(name, "Hundred") && modwerk_test_map.e[127].layout == 3);
    CHECK(modwerk_fxmap_handle(0x09u) == 9 && modwerk_fxmap_handle(0x99u) == 99 && modwerk_fxmap_handle(0x100u) == 100 &&
          modwerk_fxmap_handle(0x127u) == 127 && !modwerk_fxmap_module(27));
    /* The handle cache: a reassignment (a write and a seal) is answered at once, and so is an entry written before
     * its seal (a project load), whatever was asked before. */
    CHECK(modwerk_fxmap_handle(0x99u) == 99 && modwerk_fxmap_handle(0x55u) == -1);
    modwerk_fxmap_assign(99, 0x55u, 1, "Moved");
    CHECK(modwerk_fxmap_handle(0x99u) == -1 && modwerk_fxmap_handle(0x55u) == 99);
    put(&modwerk_test_map.e[99], 0x99u, 1, "Back");                        /* unsealed, as a load writes */
    CHECK(modwerk_fxmap_handle(0x99u) == 99 && modwerk_fxmap_handle(0x55u) == -1);
    modwerk_fxmap_assign(99, 0x99u, 1, "Ninety-nine");
    /* Damage that leaves the generation (a bad battery): found by the whole check within a second of DTIM3, however
     * few or many calls came between. */
    CHECK(modwerk_fxmap_module(99) == 0x99u);                                /* the last seal checked */
    unsigned before = checks;
    modwerk_test_map.e[100].module = 0x77u;                                 /* the sum no longer matches */
    modwerk_test_now += CHECK_EVERY / 2u;
    CHECK(modwerk_fxmap_module(100) == 0x77u);                              /* half a second: not checked yet */
    modwerk_test_now += CHECK_EVERY / 2u;
    CHECK(modwerk_fxmap_module(100) != 0x77u && checks == before + 2u);     /* a second: reseeded */
    modwerk_fxmap_assign(9, 0x09u, 1, "Nine");
    modwerk_fxmap_assign(99, 0x99u, 1, "Ninety-nine");
    modwerk_fxmap_assign(100, 0x100u, 2, "Hundred");
    modwerk_fxmap_assign(127, 0x127u, 3, "Last");
    /* Where a handle is named (the MISSING page): the current bank first, a working Part before a saved copy. */
    unsigned bank, part, track;
    CHECK(!modwerk_fxmap_where(99, &bank, &part, &track));
    modwerk_test_banks[2][5][9] = 99;                                         /* bank C, saved Part 2, FX2 T2 */
    CHECK(modwerk_fxmap_where(99, &bank, &part, &track) == 2 && bank == 2 && part == 1 && track == 1);
    modwerk_test_banks[6][3][4] = 99;                                         /* bank G, working Part 4, FX1 T5 */
    CHECK(modwerk_fxmap_where(99, &bank, &part, &track) == 2 && bank == 2);   /* bank order: C before G */
    modwerk_test_bank_now = 6;
    CHECK(modwerk_fxmap_where(99, &bank, &part, &track) == 1 && bank == 6 && part == 3 && track == 4);
    modwerk_test_banks[6][3][4] = 0, modwerk_test_bank_now = 15;
    CHECK(modwerk_fxmap_where(99, &bank, &part, &track) == 2 && bank == 2);   /* the current bank last of all: still found */
    modwerk_test_bank_now = 99;                                                    /* no project: from bank A */
    CHECK(modwerk_fxmap_where(99, &bank, &part, &track) == 2 && bank == 2);
    if (failures) { fprintf(stderr, "%u handle map checks failed\n", failures); return 1; }
    puts("Octatrack handle map: ids 9, 99, 100 and 127 saved to project.work and loaded back passed.");
    return 0;
}
