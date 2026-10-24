/* SPDX-License-Identifier: MIT */
#ifndef BS_DEVICE_FONT_H
#define BS_DEVICE_FONT_H
#include <stdint.h>
void bs_device_text_at(unsigned char *,uint32_t,uint32_t,const char *);
void bs_device_box(unsigned char *,uint32_t,uint32_t,uint32_t,uint32_t);
void bs_device_invert(unsigned char *,uint32_t,uint32_t,uint32_t,uint32_t);
void bs_device_text(unsigned char *,uint32_t,const char *);
#endif
