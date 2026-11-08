/* SPDX-License-Identifier: GPL-3.0-or-later */
#ifndef MODWERK_FLASH_H
#define MODWERK_FLASH_H
#include "upload.h"
/* The plain ELEK container a host stages to write NOR (flash.c); the kit's
 * .bin is this container ciphered. 740 KB today; grows with the base. */
#define FLASH_CONTAINER_BYTES 0xd0000u
/* Why the last container was refused or the write failed, 0 after an accepted one.
 * The self-test record reports it as 100 + this (dsp.c), apart from the loader's. */
enum flash_refusal { FLASH_OK, FLASH_FORMAT, FLASH_DEPACK, FLASH_ENTRY, FLASH_BOOTSTRAP, FLASH_PROTECTED, FLASH_OTHER_BASE, FLASH_WRITE,
    FLASH_LAYOUT /* NOR holds neither one whole base nor the two-slot layout: nothing written */ };
extern volatile uint32_t modwerk_flash_refusal;
/* The RAM boot's backend, plus NOR writes of the running base's own container. */
extern const struct mu_backend modwerk_flash_backend;
/* The running base's packed .run digest, taken by .boot before stock's start reuses its RAM. */
void modwerk_flash_snapshot(void);
/* The bounded decoder for the kit's section stream (codec/elz.py): the output
 * length, or -1 unless the end marker lands exactly on `in_len` and the
 * output fits `out_max`. */
long modwerk_flash_depack(const uint8_t *in, uint32_t in_len, uint8_t *out, uint32_t out_max);
/* SLOTS (ep0.c, vendor request 39): "MWSS"; the layout (0 one copy, 1 two slots, 2 neither); the slot this base
 * runs from (0 A, 1 B, 0xff none: RAM-booted, or the copied old base); flags (1 the stub went back to the older
 * slot after the newest one's tries, 2 the running slot is confirmed); 0; then per slot from byte 8, 8 bytes each:
 * its generation (u32), state (1 whole, 2 confirmed), tries used, 0, 0. */
#define FLASH_SLOTS_BYTES 24u
extern volatile uint8_t modwerk_flash_slots[FLASH_SLOTS_BYTES];
/* The 60 Hz tick (ep0.c): 1 when the engine has work here (modwerk_flash_service): the first look at the slots,
 * the confirm. It shows BASE UPDATED or UPDATE UNDONE once after a start. */
int modwerk_flash_tick(void);
/* Set by ep0.c at a host's first request after a start: a computer talks to this base over USB. */
extern volatile int modwerk_flash_host;
void modwerk_flash_service(void);
/* A write while the OS runs on (this base's own, no restart after): 1 + per mille done, 0 none (status.c's box). */
extern volatile uint32_t modwerk_flash_progress;
#endif
