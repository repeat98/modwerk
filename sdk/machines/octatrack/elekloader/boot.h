/* SPDX-License-Identifier: GPL-3.0-or-later */
#ifndef MODWERK_BOOT_H
#define MODWERK_BOOT_H
#include "upload.h"
#define BOOT_IMAGE_BYTES 0x140000u /* boot.s STAGE_MAX: a base's MAIN image is about 1.19 MB */
/* At the start of the base's .bss reserve, which stock never touches and a
 * soft reset keeps (boot.s offsets): the mailbox, the copy stub, the image.
 * The image is also where the controller stages every package. */
struct modwerk_boot_stage { uint32_t mailbox[16]; uint8_t stub[256]; uint8_t image[BOOT_IMAGE_BYTES]; };
extern struct modwerk_boot_stage modwerk_boot_stage;
/* The runtime loader's backend, plus whole OS images (boot.c). */
extern const struct mu_backend modwerk_boot_backend;
uint8_t *modwerk_boot_staging(void); /* uncached */
int modwerk_boot_tick(void);         /* sys task: nonzero when an armed boot is due; wake the engine */
void modwerk_boot_service(void);
/* A key press or release as the panel reports it (codes 0..63, PANEL.md). */
void modwerk_post_key(unsigned code, int pressed);
/* Two bytes as the panel sends them (PANEL.md: 0x2n key row, 0x3n encoder delta, 0x40 fader). */
void modwerk_panel_bytes(uint8_t first, uint8_t second);
int modwerk_boot_recording(void);                    /* any track recorder not idle */     /* engine task: runs a due boot; does not return then */
#endif
