/* SPDX-License-Identifier: MIT
 * Host check of ot_lfo_pmtr_dest (lfo_pmtr_dest.c): count poke, PMTR beq nop,
 * label resolve, destination halfword pick, first-index-wins. No stock bytes. */
#define MW_HOST
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
static unsigned failures;
#define CHECK(x) do { if (!(x)) { failures++; fprintf(stderr, "%s:%d: %s\n", __FILE__, __LINE__, #x); } } while (0)

static uint8_t count_word[4] = {0, 0, 0, 30}; /* stock PMTR count 30 */
static uint8_t beq_word[2] = {0x67, 0x34}; /* stock beq.s at 0x4003923c */
static uint8_t *host_at(uint32_t a)
{
    if (a == 0x400d38a8u) return count_word;
    if (a == 0x4003923cu) return beq_word;
    fprintf(stderr, "unmapped %#x\n", a); exit(2);
}

#include "loader.h"
#include "modwerk_events.h"
static uintptr_t volatile lfo_row[17];
static int masked;
uint32_t modwerk_machine_mask(void) { CHECK(!masked); masked = 1; return 3; }
void modwerk_machine_unmask(uint32_t s) { CHECK(masked && s == 3); masked = 0; }
void modwerk_machine_flush_data(uint32_t a, uint32_t n) { CHECK(masked); (void)a; (void)n; }
uint8_t *modwerk_machine_code(uint32_t a) { return host_at(a); }
void modwerk_machine_invalidate_code(void) {}
#define modwerk_runtime_event_row host_rows
static uintptr_t volatile *const host_rows[RUNTIME_SITE_EVENTS] = {
    [MODWERK_OT_LFO_PMTR_DEST - RUNTIME_EVENTS] = lfo_row};
#include "lfo_pmtr_dest.c"
#undef modwerk_runtime_event_row

static uint16_t words_a[8], words_b[8];
static const char lbl_prob[] = "PROB";
static const char lbl_rst[] = "RST";
static struct modwerk_lfo_pmtr_dest a = {30, MODWERK_LFO_PMTR_AUDIO, lbl_prob, words_a, 0};
static struct modwerk_lfo_pmtr_dest b = {31, MODWERK_LFO_PMTR_AUDIO, lbl_rst, words_b, 0};
static const char lbl_dup[] = "XX";
static struct modwerk_lfo_pmtr_dest dup = {30, MODWERK_LFO_PMTR_AUDIO, lbl_dup, words_b, 0};

static void set_rows(const struct modwerk_lfo_pmtr_dest *const *rows, unsigned n)
{
    unsigned i;
    for (i = 0; i < n; ++i) lfo_row[i] = (uintptr_t)rows[i];
    lfo_row[n] = 0;
    (void)rows;
}

int main(void)
{
    const struct modwerk_lfo_pmtr_dest *one[] = {&a};
    const struct modwerk_lfo_pmtr_dest *two[] = {&a, &b};
    const struct modwerk_lfo_pmtr_dest *clash[] = {&a, &dup, &b};

    CHECK(mw_lfo_pmtr_label(29) == 0);
    CHECK(mw_lfo_pmtr_resolve(30, 0) == 0);

    masked = 1; set_rows(one, 1); modwerk_lfo_pmtr_tables_changed(); masked = 0;
    CHECK(count_word[0] == 0 && count_word[1] == 0 && count_word[2] == 0 && count_word[3] == 31);
    CHECK(beq_word[0] == 0x4e && beq_word[1] == 0x71); /* nop; fall-through 0x4003923e */
    CHECK(strcmp(mw_lfo_pmtr_label(30), "PROB") == 0);
    CHECK(mw_lfo_pmtr_resolve(30, 3) == words_a + 3);
    CHECK(mw_lfo_pmtr_resolve(31, 0) == 0);

    masked = 1; set_rows(two, 2); modwerk_lfo_pmtr_tables_changed(); masked = 0;
    CHECK(count_word[3] == 32);
    CHECK(beq_word[0] == 0x4e && beq_word[1] == 0x71);
    CHECK(strcmp(mw_lfo_pmtr_label(31), "RST") == 0);

    masked = 1; set_rows(clash, 3); modwerk_lfo_pmtr_tables_changed(); masked = 0;
    CHECK(count_word[3] == 32); /* duplicate 30 ignored: still two unique indexes */
    CHECK(strcmp(mw_lfo_pmtr_label(30), "PROB") == 0); /* first wins */

    masked = 1; lfo_row[0] = 0; modwerk_lfo_pmtr_tables_changed(); masked = 0;
    CHECK(count_word[3] == 30);
    CHECK(beq_word[0] == 0x4e && beq_word[1] == 0x71); /* base keeps the owned nop */

    if (failures) { fprintf(stderr, "%u failure(s)\n", failures); return 1; }
    puts("ok");
    return 0;
}
