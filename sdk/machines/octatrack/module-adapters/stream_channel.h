/* SPDX-License-Identifier: GPL-3.0-or-later
 * The stream channel (stream_channel.c; stream_probe.py --stream-channel, development twins only, core 0 only). */
#ifndef MODWERK_STREAM_CHANNEL_H
#define MODWERK_STREAM_CHANNEL_H
#include <stdint.h>
/* Core 0's free run in each host bank (stream_probe.py FREE_RUN): the out-region where probe B read, the in-region where
 * wide probe A wrote, 928 words each. */
#define MW_STREAM_OUT_REGION 0x1840u
#define MW_STREAM_IN_REGION 0x1be0u
#define MW_STREAM_OUT_WORDS 0x3a0u
#define MW_STREAM_IN_WORDS 0x3a0u
/* Halfwords a frame all lanes together may carry each way: what the frame interrupt has room for (in proven to 160 and
 * out to 256 on an MKII with probes A and B, 26 November 2026; the Quadraverb's plates need 352 in, not yet proven). */
#define MW_STREAM_IN_MOST 352u
#define MW_STREAM_OUT_MOST 256u
#define MW_STREAM_LANES 8u
struct mw_stream_lane {
    const void *row;                        /* the ot_dsp_effects record whose fill and take serve it */
    uint32_t since, live_from;              /* the frame it opened; take() runs for frames from live_from on */
    uint16_t in_at, in_n, out_at, out_n;    /* its blocks in the regions, words */
    uint8_t slot, open, pad[2];
};
/* UI task. A lane for slot (core 0's: T5-T8, FX1 4-7, FX2 12-15) of in_n and out_n halfwords: its index, -1 no room. */
int mw_stream_open(unsigned slot, const void *row, unsigned in_n, unsigned out_n);
/* 1 once its first fills are sent: the offsets of its blocks in a host bank for the slot's record (0: none that way). */
int mw_stream_ready(int lane, uint32_t *in_offset, uint32_t *out_offset);
void mw_stream_live(int lane, int on); /* the record names its blocks now (1), or is about to name them no more (0) */
void mw_stream_close(int lane);  /* only once the record names them no more */
uint32_t mw_stream_frame(void);
/* The frame path (dsp_hooks.s): state 7's block, its completion, dl_complete's restore, state 0's read, the check
 * after the unmask; dsp.c's recovery. */
unsigned mw_stream_block(void);
void mw_stream_complete(void);
void mw_stream_account(void);
unsigned mw_stream_read(void);
void mw_stream_check(void);
void mw_stream_dma_failed(void);
void mw_stream_read_failed(void);
uint32_t modwerk_machine_mask(void);
void modwerk_machine_unmask(uint32_t);
#ifdef MW_STREAM_TEST
int mw_stream_test_contributed(const void *row);
#endif
extern volatile uint16_t mw_stream_tx[], mw_stream_rx[];
extern volatile uint32_t mw_stream_chains, mw_stream_sent, mw_stream_reads, mw_stream_refused, mw_stream_lost, mw_stream_skipped;
#endif
