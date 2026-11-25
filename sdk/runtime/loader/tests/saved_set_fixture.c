/* SPDX-License-Identifier: GPL-3.0-or-later
 * Appended to the real loader host suite before a volatile fixture, with the
 * real modset.c (MODWERK_HOST_CARD: its sector store and load) and
 * saved_set_reader.c compiled separately. SYNTHETIC: this pretend card and its
 * file semantics, and the export gate (ep0.c's has its own test). A power loss
 * is the card as it stands before a 512-byte write lands; a failed write lands
 * nothing of its sector. No card, file system or timing is established here. */
#include "volatile_service.h"
struct file_object { uint32_t word[6]; };
const uint8_t modwerk_base_digest[32] = {1, 2, 3};
extern uint8_t modwerk_test_held;
extern int modwerk_test_gate;
extern uint32_t modwerk_test_ticks;
extern volatile uint32_t modwerk_modset_generation, modwerk_modset_count, modwerk_modset_result;
void modwerk_modset_service(void);
int modwerk_modset_export_idle(void);
void modwerk_modset_candidate(const uint8_t *, uint32_t);
void modwerk_modset_accepted(void);
enum { SET_RESTORED = 1, SET_NONE, SET_SKIPPED, SET_FOREIGN, SET_DAMAGED, SET_REFUSED, SET_SAVED, SET_FAILED };
uint8_t modwerk_test_card_io[512], modwerk_test_export_io[512];
#define CARD_BYTES (RUNTIME_POOL_BYTES + 0x1000u)
static uint8_t card[2][CARD_BYTES];
static uint32_t card_length[2], card_present[2];
static unsigned card_writes, card_fail_write, card_keeps, card_bad_read, card_fail_close, card_exporting;
static void (*card_power)(void); /* before each sector write lands */
int modwerk_saved_set_busy(void) { return (int)card_exporting; }
int modwerk_saved_set_safe(void) { return modwerk_modset_export_idle() && !modwerk_runtime_volatile_busy(); }
int olog_stock_open(struct file_object *f, const char *path, const char *mode, void *io, unsigned n)
{
    int which = !strcmp(path, "/MODWERK0.SET") ? 0 : !strcmp(path, "/MODWERK1.SET") ? 1 : -1, write = !strcmp(mode, "w");
    CHECK(which >= 0 && (write || !strcmp(mode, "r")) && n == 512u &&
          (io == modwerk_test_card_io || (!write && io == modwerk_test_export_io)));
    if (which < 0 || (!write && !card_present[which])) return -1;
    if (write) { card_present[which] = 1; if (!card_keeps) card_length[which] = 0; } /* card_keeps: overwrite in place */
    f->word[0] = (uint32_t)which; f->word[1] = 0; f->word[2] = (uint32_t)write; f->word[3] = 0x5e7u;
    return 0;
}
int olog_stock_read(struct file_object *f, void *out, unsigned n)
{
    CHECK(f->word[3] == 0x5e7u && !f->word[2] && n && n <= 512u);
    uint32_t which = f->word[0], at = f->word[1];
    if (at + n > card_length[which]) return 0;
    memcpy(out, card[which] + at, n); f->word[1] = at + n;
    if (card_bad_read && !--card_bad_read) ((uint8_t *)out)[n - 1] ^= 1u; /* one read comes back changed */
    return 1;
}
int olog_stock_write(struct file_object *f, const void *data, unsigned n)
{
    CHECK(f->word[3] == 0x5e7u && f->word[2] && n == 512u);
    uint32_t which = f->word[0], at = f->word[1];
    if (card_power) card_power();
    if (++card_writes == card_fail_write || at + n > CARD_BYTES) return 0;
    memcpy(card[which] + at, data, n); f->word[1] = at + n;
    if (at + n > card_length[which]) card_length[which] = at + n;
    return 1;
}
int olog_stock_close(struct file_object *f) { CHECK(f->word[3] == 0x5e7u); f->word[3] = 0; return card_fail_close ? -1 : 0; }
int modwerk_test_export_size(struct file_object *f) { return (int)card_length[f->word[0]]; }
int modwerk_test_card_size(struct file_object *f) { return (int)card_length[f->word[0]]; }

/* The legacy baseline 111/112 as boot.c records its installs, saved: the RAM set is the live set. */
static void seed_saved_set(void)
{
    modwerk_test_ticks = 200; modwerk_modset_service(); /* the boot restore */
    for (id = 111; id <= 112; ++id) {
        begin(32, 0, 0, 0, 0, 1, (uint8_t)(id == 111 ? 0x11 : 0x12)); site(STOCK + (id == 111 ? 32 : 64), 6);
        modwerk_modset_candidate(p, n); modwerk_modset_accepted();
    }
    modwerk_modset_service(); CHECK(modwerk_modset_result == SET_SAVED && modwerk_modset_count == 2);
}
