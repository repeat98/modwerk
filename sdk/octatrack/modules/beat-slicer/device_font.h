/* SPDX-License-Identifier: MIT */
#ifndef BS_DEVICE_FONT_H
#define BS_DEVICE_FONT_H
#include <stdint.h>
const unsigned char *bs_device_home(void);
uint32_t bs_device_text_width(const char *);
void bs_device_popup(unsigned char *,unsigned char *);
void bs_device_small_text(unsigned char *,uint32_t,uint32_t,const char *);
void bs_device_dashed_box(unsigned char *,uint32_t,uint32_t,uint32_t,uint32_t);
#endif
