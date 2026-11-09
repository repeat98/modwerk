/* SPDX-License-Identifier: GPL-2.0-or-later */
#ifndef MODWERK_DT2_CORE_H
#define MODWERK_DT2_CORE_H

#include "../digitakt-mk2/core.h"

/* OS 1.17 bindings used by Modwerk's scheduler and module pages.
 * Firmware routines returning pointers return them in d0, where GCC expects
 * an integer result. Declare those used as pointers with a uintptr_t result. */
extern void fw_fillrect(void *bmp, int x0, int y0, int x1, int y1, int colour);
extern int fw_textf(void *bmp, const void *font, int x, int y, unsigned int flags, const char *fmt, ...);
extern const char fw_font[], fw_font_narrow[], fw_vt_main[], fw_vt_func[];
extern void fw_invalidate(void *view);
extern int fw_key_down(int code);
extern void fw_enc_init(void *block);
extern int fw_enc_list(void *block, void *event, const void *cfg);
extern const char fw_enc_param[];
extern uintptr_t fw_ui_states(void);
extern uintptr_t fw_brain(void);
extern void fw_str_new(void *str, const char *cstr, void *alloc);
extern void *fw_memcpy(void *dst, const void *src, uint32_t size);
extern char fw_patterns[];
extern const char fw_pattern_size[];

#endif
