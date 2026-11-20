/* SPDX-License-Identifier: GPL-3.0-or-later
 * Host test of settings.c: the table's rows, the kept choices and when they are applied. Run by
 * sdk/tests/test_settings.py. */
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#define ST_HOST
#define CHECK(c) do { if (!(c)) { fprintf(stderr, "line %d: %s\n", __LINE__, #c); failures++; } } while (0)
static int failures;
static uint32_t store[32], epoch = 2, masked;
static uintptr_t volatile table_row[12];
static uint32_t host_mask(void) { CHECK(!masked); masked = 1; return 7u; }
static void host_unmask(uint32_t m) { CHECK(masked && m == 7u); masked = 0; }
static uint32_t host_epoch(void) { return epoch; }
#define ST_STORE ((volatile uint32_t *)store)
#define ST_MASK() host_mask()
#define ST_UNMASK(m) host_unmask(m)
#define ST_EPOCH() host_epoch()
#define ST_ROW() table_row
#include "settings.c"

static unsigned applied[3], calls[3];
static void apply0(unsigned c) { CHECK(!masked); applied[0] = c, ++calls[0]; }
static void apply1(unsigned c) { CHECK(!masked); applied[1] = c, ++calls[1]; }
static void apply2(unsigned c) { CHECK(!masked); applied[2] = c, ++calls[2]; }
static const char *const three[] = {"ALL CHANNELS", "OFF", "MAIN + CUE ONLY"}, *const two[] = {"ALL CHANNELS", "OFF"};

int main(void)
{
    struct modwerk_setting usb = {MODWERK_SETTING_ABI, "USB AUDIO", 3, three, apply0, 0},
                           other = {MODWERK_SETTING_ABI, "OTHER", 2, two, apply1, 0}, bad = usb;
    CHECK(sizeof(void *) != 4 || sizeof usb == 24);

    struct modwerk_setting_view view;

    /* Nothing installed, a store that is not ours: no row, nothing applied, nothing written. */
    memset(store, 0xa5, sizeof store);
    modwerk_settings_tick();
    CHECK(!modwerk_settings_count() && !calls[0] && store[0] == 0xa5a5a5a5u && !modwerk_settings_read(0, &view));
    modwerk_settings_select(0, epoch, 1u);
    CHECK(store[0] == 0xa5a5a5a5u);

    /* A module arrives: its first choice is applied once for the change, not every tick. */
    table_row[0] = (uintptr_t)&usb, epoch = 4;
    modwerk_settings_tick(), modwerk_settings_tick();
    CHECK(modwerk_settings_count() == 1u && calls[0] == 1u && applied[0] == 0u);
    CHECK(modwerk_settings_read(0, &view) && !strcmp(view.label, "USB AUDIO") && view.count == 3u && view.active == 0u);
    CHECK(store[0] == 0xa5a5a5a5u); /* reading formats nothing */

    /* Both the active choice and alternatives are readable without applying anything. Only explicit selection writes. */
    CHECK(!strcmp(view.choices[0], "ALL CHANNELS") && !strcmp(view.choices[1], "OFF") && !strcmp(view.choices[2], "MAIN + CUE ONLY"));
    modwerk_settings_select(0, view.epoch, 3u);
    modwerk_settings_select(0, view.epoch - 2u, 1u);
    CHECK(calls[0] == 1u && store[0] == 0xa5a5a5a5u);
    modwerk_settings_select(0, epoch, 1u);
    CHECK(applied[0] == 1u && calls[0] == 2u && store[0] == ST_MAGIC && modwerk_settings_read(0, &view) && view.active == 1u);
    modwerk_settings_select(0, epoch, 2u);
    CHECK(applied[0] == 2u && modwerk_settings_read(0, &view) && view.active == 2u);
    modwerk_settings_select(0, epoch, 0u);
    CHECK(applied[0] == 0u);
    modwerk_settings_select(0, epoch, 1u), modwerk_settings_select(0, epoch, 2u);
    CHECK(applied[0] == 2u);

    /* A change under way (odd epoch) waits; when it is done every kept choice is applied again. */
    epoch = 5;
    modwerk_settings_tick();
    CHECK(calls[0] == 6u);
    table_row[1] = (uintptr_t)&other, epoch = 6;
    modwerk_settings_tick();
    CHECK(calls[0] == 7u && applied[0] == 2u && calls[1] == 1u && applied[1] == 0u && modwerk_settings_count() == 2u);

    /* Another build of the same module offers fewer choices: the first one, and the kept value stays for the build
     * that offers it. */
    struct modwerk_setting small = {MODWERK_SETTING_ABI, "USB AUDIO", 2, two, apply2, 0};
    table_row[0] = (uintptr_t)&small, epoch = 8;
    modwerk_settings_tick();
    CHECK(calls[2] == 1u && applied[2] == 0u && modwerk_settings_read(0, &view) && view.active == 0u && view.count == 2u);
    table_row[0] = (uintptr_t)&usb, epoch = 10;
    modwerk_settings_tick();
    CHECK(applied[0] == 2u);

    /* A power cycle: the base's RAM is new, the store is not. */
    st_seen = 1u, applied[0] = 9u;
    modwerk_settings_tick();
    CHECK(applied[0] == 2u);

    /* Records the base does not take are no rows: a wrong ABI, no label, one choice, seven, no apply. */
    bad.abi = 2, table_row[0] = (uintptr_t)&bad;
    CHECK(modwerk_settings_count() == 1u && modwerk_settings_read(0, &view) && !strcmp(view.label, "OTHER"));
    bad = usb, bad.count = 1;
    CHECK(modwerk_settings_count() == 1u);
    bad.count = 7;
    CHECK(modwerk_settings_count() == 1u);
    bad = usb, bad.apply = 0;
    CHECK(modwerk_settings_count() == 1u);
    bad = usb, bad.label = "";
    CHECK(modwerk_settings_count() == 1u);
    table_row[0] = (uintptr_t)&usb;

    /* A full store: a ninth setting takes the entry its hash names, and the others keep theirs. */
    struct modwerk_setting many[8];
    char names[8][4];
    for (unsigned i = 0; i < 8u; ++i) {
        names[i][0] = 'S', names[i][1] = (char)('0' + i), names[i][2] = 0;
        many[i] = other, many[i].label = names[i];
        table_row[0] = (uintptr_t)&many[i], table_row[1] = 0;
        modwerk_settings_select(0, epoch, 1u);
    }
    unsigned usb_kept = 0, others_kept = 0;
    for (unsigned i = 0; i < MODWERK_SETTINGS_ROOM; ++i) {
        usb_kept += store[1u + 2u * i] == st_key("USB AUDIO");
        others_kept += store[1u + 2u * i] != 0u;
    }
    CHECK(others_kept == MODWERK_SETTINGS_ROOM && usb_kept <= 1u);
    table_row[0] = (uintptr_t)&many[7];
    CHECK(modwerk_settings_read(0, &view) && view.active == 1u);

    if (failures) return 1;
    puts("settings: rows, kept choices and their application pass");
    return 0;
}
