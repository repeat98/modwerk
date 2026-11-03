/* SPDX-License-Identifier: GPL-3.0-or-later
 * The self-test's record: dsp.c runs the test, status.c shows it, dev.c (request 21) hands it to a host. */
#ifndef MODWERK_SELFTEST_H
#define MODWERK_SELFTEST_H
#include <stdint.h>

enum { SELFTEST_IDLE, SELFTEST_RUNNING, SELFTEST_PASSED, SELFTEST_FAILED };
enum { SELFTEST_CONFIGURATION = 1, SELFTEST_TOGETHER, SELFTEST_STRESS, SELFTEST_RESTORE }; /* phases */
/* failed: what went wrong, bits */
#define SELFTEST_BROKEN 1u       /* a module's stock-code sites no longer hold its patches */
#define SELFTEST_REFUSED 2u      /* a set that ran was refused when placed again */
#define SELFTEST_STOPPED 4u      /* frames stopped */
#define SELFTEST_PEAK 8u         /* a DSP core peaked over 90 % of a frame */
#define SELFTEST_COUNTED 16u     /* a stall, a loader rejection, error or rollback was counted */
#define SELFTEST_NOT_BACK 32u    /* the tracks did not get back what they ran */
#define SELFTEST_ABORTED 64u     /* NO, or the transport started */
#define SELFTEST_NOT_LOADED 128u /* a DSP module ran on neither core, even with that core's other slots NONE */
#define SELFTEST_CPU 256u        /* the ColdFire peaked over 90 % */
#define SELFTEST_LATE 512u       /* a frame came late: interrupts held off too long (the DSP stalls of 11 October 2026) */
#define SELFTEST_CORRUPT 1024u   /* a module's code on a DSP does not sum as its package */
#define SELFTEST_FEATURE 2048u   /* a live module requires a base feature that cannot come up this boot (the key bus with a
                                  * DSP core's state lost, controller_board.c): it would only pass its audio */
#define SELFTEST_FRAME_LIMIT 68000u /* DTCN3 counts between two frames: one is about 47,900 (16 samples at 132 MHz) */

struct selftest {
    uint32_t state, phase, failed;
    uint32_t modules, dsp, intact;  /* modules live, of them with DSP effects, live modules whose sites hold */
    uint32_t ran, peak[2], cpu;     /* DSP modules that ran; peaks per mille: T1-4 (core 1), T5-8 (core 0), the CPU */
    uint32_t done, total;           /* progress: steps done of all */
    uint8_t track[8];               /* each track's effect id in the last batch, 0 none */
    uint32_t gap;                   /* the longest time between two frames while it ran, DTCN3 counts */
    uint32_t saved, saved_count, live; /* now: the card's set (modset.c's result: 7 saved, 1 restored), its modules, modules live */
    uint32_t culprit;               /* the module behind the first failure (its runtime id), 0 none: the one that failed
                                     * alone, or the dearest of the batch that overloaded or ran late */
    char culprit_name[16];          /* its name as the chooser shows it, empty when it brings no effect */
    uint32_t refusal;               /* now: the loader's last refusal (loader.h), so a host can say why it refused */
};
typedef char selftest_size[sizeof(struct selftest) == 96u ? 1 : -1]; /* not a whole number of 64-byte EP0 packets */
extern volatile struct selftest modwerk_selftest;
int modwerk_selftest_start(void); /* 1 when it started: stopped, the loader idle */
void modwerk_selftest_refresh(void); /* the record's "now" fields, before a host reads it */
void modwerk_selftest_abort(void);
extern volatile uint32_t modwerk_selftest_key; /* a key the test pressed (code + 1, 0 none): status.c lets it through */
#endif
