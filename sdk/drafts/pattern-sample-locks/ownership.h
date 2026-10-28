/* SPDX-License-Identifier: MIT */
#ifndef PSL_OWNERSHIP_H
#define PSL_OWNERSHIP_H
#include "engine.h"
/* Private battery-RAM material, NOT bytes in a stock pattern or Part.
 * One project identity, sparse track/pattern records; bounded capacity. */
#define PSL_NV_BASE 0x100f9000u
#define PSL_NV_HEADER 0x400u
#define PSL_NV_ENTRIES 704u
#define PSL_NV_BYTES (PSL_NV_HEADER+PSL_NV_ENTRIES*16u)
#define PSL_ID_BYTES 512u
int psl_nv_matches(const volatile uint8_t *,const uint8_t identity[PSL_ID_BYTES]);
/* Refuses foreign nonempty storage. First use/project change forgets origins. */
int psl_nv_begin(volatile uint8_t *,const uint8_t identity[PSL_ID_BYTES]);
/* Reserve every needed track before any native mutation; no eviction. */
int psl_nv_reserve(volatile uint8_t *,unsigned row,unsigned tracks);
void psl_nv_read(const volatile uint8_t *,unsigned row,unsigned track,
                 const uint8_t *record,uint8_t owned[PSL_STEPS]);
void psl_nv_invalidate(volatile uint8_t *,unsigned row,unsigned track);
/* Invalidate BEFORE changing either native copy. Publish only AFTER both
 * copies match. A reset between them therefore retains unknown locks. */
void psl_nv_publish(volatile uint8_t *,unsigned row,unsigned track,
                    const uint8_t *record,const uint8_t owned[PSL_STEPS]);
#endif
