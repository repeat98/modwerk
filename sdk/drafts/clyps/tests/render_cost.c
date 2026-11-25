/* SPDX-License-Identifier: GPL-3.0-or-later
 * Host wall time per draw on a fully populated page. This is not a device meter.
 * The opaque compiler barrier makes each complete 1024-byte frame observable.
 */
#include <stdio.h>
#include <time.h>
#define CLYPS_HOST_TEST
#include "../live_module.c"

static uint8_t host_byte(uintptr_t a)
{
    if (a < BANK_BASE || a >= BANK_BASE+16*PATTERN_BYTES) return 0;
    switch ((a-BANK_BASE)%PATTERN_BYTES) {
    case 0x8e51: case 0x8e53: return 16;
    case 0x8e52: case 0x8e54: return 2;
    default: return 0;
    }
}
static uint32_t host_long(uintptr_t a) { (void)a; return 0; }

static uint64_t now(void)
{
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC,&ts);
    return (uint64_t)ts.tv_sec*1000000000u+(unsigned)ts.tv_nsec;
}
int main(void)
{
    unsigned char frame[1024];
    defined=65535;
    for (unsigned i=0; i<16; ++i) rows[i]=0x76543210u+i;
    visible=row_view=1;
#ifdef CLYPS_PERFORMANCE
    mode=1;
    const enum panel_view views[]={ROW,CLIP,SETUP};
    const char *names[]={"row","clip","setup"};
#else
    const char *names[]={"legacy-row"};
#endif
    for (unsigned i=0; i<sizeof(names)/sizeof(*names); ++i) {
#ifdef CLYPS_PERFORMANCE
        open_view(views[i]);
#endif
        for (unsigned batch=0; batch<7; ++batch) {
            uint64_t begin=now();
            for (unsigned n=0; n<20000; ++n) {
                module_draw(frame);
                __asm__ volatile ("" : : "r"(frame) : "memory");
            }
            printf("%s %llu\n",names[i],(unsigned long long)((now()-begin)/20000));
        }
    }
    return 0;
}
