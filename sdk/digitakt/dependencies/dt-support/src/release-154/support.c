/* SPDX-License-Identifier: GPL-2.0-or-later */
/* One owner for the native heap-free hook. Features only discard metadata;
 * the firmware frees the allocation exactly once, after all observers. */
typedef unsigned long u32;
extern void (*const dt_free_observers[])(u32);
extern u32 dt_native_free(u32);
u32 dt_free(u32 address){
 unsigned i;
 for(i=0;dt_free_observers[i];i++)dt_free_observers[i](address);
 return dt_native_free(address);
}
