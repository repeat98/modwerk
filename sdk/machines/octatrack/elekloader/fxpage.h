/* SPDX-License-Identifier: GPL-3.0-or-later */
#ifndef MODWERK_FXPAGE_H
#define MODWERK_FXPAGE_H
#include <stdint.h>
int modwerk_fxpage_build(unsigned,uint8_t *,uint32_t,unsigned);
void modwerk_fxpage_drop(unsigned);
void modwerk_fxpage_missing(void); /* once: unlisted module handles show MISSING, not NONE */
/* Stable lock held: validation writes nothing; current inspects actual
 * materialized descriptors, formatter code and chooser/wide-table routing. */
int modwerk_fxpage_validate(unsigned,const uint8_t *,uint32_t,unsigned);
int modwerk_fxpage_current(unsigned,const uint8_t *,uint32_t,unsigned);
int modwerk_fxpage_commit_checked(unsigned,uint8_t *,uint32_t,unsigned);
#endif
