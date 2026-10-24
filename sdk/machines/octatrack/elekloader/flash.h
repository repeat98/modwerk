/* SPDX-License-Identifier: GPL-3.0-or-later */
#ifndef MODWERK_FLASH_H
#define MODWERK_FLASH_H
#include "upload.h"
/* The plain ELEK container a host stages to write NOR (flash.c); the kit's
 * .bin is this container ciphered. 740 KB today; grows with the base. */
#define FLASH_CONTAINER_BYTES 0xd0000u
/* Why the last container was refused or the write failed, 0 after an accepted one.
 * The self-test record reports it as 100 + this (dsp.c), apart from the loader's. */
enum flash_refusal { FLASH_OK, FLASH_FORMAT, FLASH_DEPACK, FLASH_ENTRY, FLASH_BOOTSTRAP, FLASH_PROTECTED, FLASH_OTHER_BASE, FLASH_WRITE };
extern volatile uint32_t modwerk_flash_refusal;
/* The RAM boot's backend, plus NOR writes of the running base's own container. */
extern const struct mu_backend modwerk_flash_backend;
/* The running base's packed .run digest, taken by .boot before stock's start reuses its RAM. */
void modwerk_flash_snapshot(void);
/* The bounded decoder for the kit's section stream (codec/elz.py): the output
 * length, or -1 unless the end marker lands exactly on `in_len` and the
 * output fits `out_max`. */
long modwerk_flash_depack(const uint8_t *in, uint32_t in_len, uint8_t *out, uint32_t out_max);
#endif
