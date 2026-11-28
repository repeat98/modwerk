/* SPDX-License-Identifier: GPL-3.0-or-later
 * Modwerk's Digitone mk1 base: core_audio, an exclusive or insert owner of the output. Each render block the
 * first record whose on is set owns it (mw_audio_pick, from the voice-loop gate); the master stage then runs
 * stock (no owner), hands the owner the input instead of running (exclusive) or runs first and hands it the
 * stock result (CORE_AUDIO_INSERT). Render interrupt; modules set on and flags from the UI task.
 */
#include "base.h"

#define MW_FRAMES 32
#define MW_USB_WORDS 12
#define MW_KEYS (1u << 19)
#define Q31(x) ((mw_i32)((mw_u32)(x) << 8))   /* 24-bit codec sample to Q1.31 */
static struct mw_audio *owner;
static mw_i32 in_buf[2 * MW_FRAMES], out_buf[2 * MW_FRAMES];

/* Nonzero: skip the main CPU's per-voice filter loop this block. */
int mw_audio_pick(void)
{
    owner = 0;
    for (struct mw_audio *const *next = core_audio; *next; ++next)
        if ((*next)->on && (*next)->render) { owner = *next; break; }
    return owner && !(owner->flags & CORE_AUDIO_INSERT) && owner->flags & CORE_AUDIO_MUTE_VOICES;
}

static void put(mw_i32 *out, mw_i32 *usb, mw_u32 f)
{
    usb[MW_USB_WORDS * f] = out_buf[2 * f];
    usb[MW_USB_WORDS * f + 1] = out_buf[2 * f + 1];
    out[2 * f] = out_buf[2 * f] >> 8;
    out[2 * f + 1] = out_buf[2 * f + 1] >> 8;
}

/* The master stage's call MASTER(out, out2, in, state); samples there are the codec's 24 bits. */
void mw_audio_master(mw_i32 *out, mw_i32 *out2, const mw_i32 *in, void *state)
{
    struct mw_audio *a = owner;
    if (!a) { mw_stock_master(out, out2, in, state); return; }
    mw_i32 *usb = mw_fw_usb_block;
    if (a->flags & CORE_AUDIO_INSERT) {
        mw_stock_master(out, out2, in, state);
        for (mw_u32 i = 0; i < 2 * MW_FRAMES; ++i) in_buf[i] = Q31(out[i]);
        a->render(out_buf, in_buf);
        for (mw_u32 f = 0; f < MW_FRAMES; ++f) put(out, usb, f);
        return;
    }
    int keys = (mw_fw_model_flags & MW_KEYS) != 0;
    for (mw_u32 f = 0; f < MW_FRAMES; ++f) {
        in_buf[2 * f] = Q31(in[2 * f + keys]);
        in_buf[2 * f + 1] = Q31(in[2 * f + !keys]);
    }
    a->render(out_buf, in_buf);
    for (mw_u32 f = 0; f < MW_FRAMES; ++f) {
        put(out, usb, f);
        for (mw_u32 w = 2; w < 10; ++w) usb[MW_USB_WORDS * f + w] = 0;
        usb[MW_USB_WORDS * f + 10] = Q31(in[2 * f]);   /* the input as received */
        usb[MW_USB_WORDS * f + 11] = Q31(in[2 * f + 1]);
    }
    if (keys) mw_clear(out2, 256 * 4);
}
