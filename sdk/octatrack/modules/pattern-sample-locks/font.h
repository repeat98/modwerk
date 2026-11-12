/* SPDX-License-Identifier: MIT */
#ifndef PSL_FONT_H
#define PSL_FONT_H
#include <stdint.h>
void psl_font_text_at(unsigned char *,uint32_t,uint32_t,const char *);
void psl_font_box(unsigned char *,uint32_t,uint32_t,uint32_t,uint32_t);
void psl_font_invert(unsigned char *,uint32_t,uint32_t,uint32_t,uint32_t);
void psl_font_small_text(unsigned char *,uint32_t,uint32_t,const char *);
void psl_font_clear(unsigned char *,uint32_t,uint32_t,uint32_t,uint32_t);
void psl_font_dashed_box(unsigned char *,uint32_t,uint32_t,uint32_t,uint32_t);
#endif
