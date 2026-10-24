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
    CHECK(modwerk_fxmap_written == 4);
    CHECK(!strcmp(written, "#MODWERK_FX=9:00000009:1:Nine\r\n#MODWERK_FX=99:00000099:1:Ninety-nine\r\n"
                           "#MODWERK_FX=100:00000100:2:Hundred\r\n#MODWERK_FX=127:00000127:3:Last\r\n"));
    /* The saved lines, loaded into a cleared map: every handle back where it was. */
    modwerk_fxmap_begin(1);
    for (char *line = written, *end; (end = strstr(line, "\r\n")); line = end + 2) *end = 0, modwerk_fxmap_line(line, 0);
    modwerk_fxmap_line("#MODWERK_FX=1270:00000099:1:Too far", 0); /* past the ids: dropped */
    modwerk_fxmap_loaded(0);
    char name[16];
    modwerk_fxmap_name(100, name);
    CHECK(modwerk_fxmap_read == 4 && !strcmp(name, "Hundred") && modwerk_test_map.e[127].layout == 3);
    CHECK(modwerk_fxmap_handle(0x09u) == 9 && modwerk_fxmap_handle(0x99u) == 99 && modwerk_fxmap_handle(0x100u) == 100 &&
          modwerk_fxmap_handle(0x127u) == 127 && !modwerk_fxmap_module(27));
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
