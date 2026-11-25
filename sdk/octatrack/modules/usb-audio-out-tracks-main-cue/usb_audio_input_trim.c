/* SPDX-License-Identifier: GPL-3.0-or-later
 * USB input drift trim.
 *
 * The host sends the input stream on its own clock (an adaptive OUT
 * endpoint); the Octatrack reads it on its own crystal. The two differ by
 * tens of ppm, so the receive ring slowly fills or empties. Once per 16-frame
 * block, before the block goes to the DSP, the receiver calls
 * mwua_input_trim with the ring's fill. A slow average of the fill is held
 * near the fill seen when the stream settled. When the average leaves that
 * band by more than BAND frames, one block reads 17 ring frames (or 15) for
 * its 16, interpolated across the block (four-point Catmull-Rom), so one
 * frame is absorbed in 0.36 ms with no step. Every other block is copied bit
 * for bit.
 *
 * Ring frames are 2 or 4 channels of 24-bit samples in 4-byte little-endian
 * containers (the pad byte first), as the USB packets carry them. The
 * corrected block is written back into the ring where the stock reader
 * picks it up, so the reader and the DSP transfer stay as they are. */
#include <stdint.h>

#define RING_FRAMES 1024u   /* usbaudio_in.s IN_FRAMES */
#define BLOCK 16u
#define AVG_SHIFT 12        /* the fill average: 4,096 blocks, about 1.5 s */
#define SETTLE (1u << AVG_SHIFT) /* blocks averaged before the setpoint is taken */
#define BAND 2              /* frames either side of the setpoint */
#define SPACING 64u         /* blocks between two trims, about 23 ms */

uint8_t mwua_trim_fresh = 1;  /* set by the receiver whenever it refills the cushion */
extern uint32_t mwua_trims;   /* absorbed << 16 | repeated, in the 0x56 counters */
static int32_t average, setpoint;
static uint32_t blocks, quiet;
static int32_t scratch[BLOCK][4];  /* the corrected block, before it goes back into the ring */

static int32_t sample_at(const uint8_t *ring, uint32_t index, unsigned stride, unsigned channel)
{
    const uint8_t *s = ring + (index & (RING_FRAMES - 1u)) * stride + 4u * channel;
    uint32_t v = (uint32_t)s[3] << 24 | (uint32_t)s[2] << 16 | (uint32_t)s[1] << 8;
    return (int32_t)v >> 8;
}

static void sample_put(uint8_t *ring, uint32_t index, unsigned stride, unsigned channel, int32_t value)
{
    uint8_t *s = ring + (index & (RING_FRAMES - 1u)) * stride + 4u * channel;
    s[0] = 0;
    s[1] = (uint8_t)value;
    s[2] = (uint8_t)(value >> 8);
    s[3] = (uint8_t)(value >> 16);
}

/* The signal at frame i + w/16, from frames i-1 .. i+2 (Catmull-Rom, Horner
 * in t = w/16). Samples are halved first so no product leaves 31 bits even
 * for full-scale input that alternates sign every sample; the result is
 * clamped to 24 bits, since the curve can overshoot. */
static int32_t at(const uint8_t *ring, uint32_t i, int32_t w, unsigned stride, unsigned channel)
{
    int32_t s0 = sample_at(ring, i - 1u, stride, channel) >> 1, s1 = sample_at(ring, i, stride, channel) >> 1;
    int32_t s2 = sample_at(ring, i + 1u, stride, channel) >> 1, s3 = sample_at(ring, i + 2u, stride, channel) >> 1;
    int32_t a = 3 * (s1 - s2) + s3 - s0;
    int32_t b = 2 * s0 - 5 * s1 + 4 * s2 - s3 + ((a * w) >> 4);
    int32_t c = s2 - s0 + ((b * w) >> 4);
    int32_t v = 2 * (s1 + ((c * w) >> 5));
    return v > 0x7fffff ? 0x7fffff : v < -0x800000 ? -0x800000 : v;
}

/* One block from 17 frames (step 1) or 15 (step -1): output frame k is the
 * signal at consumed + k * (16 + step) / 16. It is written back to frames
 * consumed + step + k, where the reader takes it next; the block after it
 * starts at consumed + 16 + step, untouched. */
void mwua_input_slip(uint8_t *ring, uint32_t consumed, int step, unsigned channels)
{
    unsigned stride = channels == 4u ? 16u : 8u;
    for (unsigned k = 0; k < BLOCK; ++k) {
        unsigned position = k * (BLOCK + (unsigned)step);  /* in 16ths of a frame from consumed */
        for (unsigned c = 0; c < channels; ++c)
            scratch[k][c] = at(ring, consumed + position / BLOCK, (int32_t)(position % BLOCK), stride, c);
    }
    for (unsigned k = 0; k < BLOCK; ++k)
        for (unsigned c = 0; c < channels; ++c)
            sample_put(ring, consumed + (unsigned)step + k, stride, c, scratch[k][c]);
}

/* Called once per consuming block with the ring's fill before the block is
 * read and the INPUTS mode (3 = four channels). Returns what to add to the
 * reader's position: 0, 1 (one frame absorbed) or -1 (one frame repeated). */
int32_t mwua_input_trim(uint8_t *ring, uint32_t consumed, uint32_t fill, uint32_t inputs)
{
    if (mwua_trim_fresh) {
        mwua_trim_fresh = 0;
        average = 0;
        blocks = quiet = 0;
    }
    if (blocks < SETTLE) {
        /* The setpoint is the plain mean of the first SETTLE fills, in the
         * average's fixed point (fill << AVG_SHIFT) because SETTLE is 2^AVG_SHIFT. */
        average += (int32_t)fill;
        if (++blocks == SETTLE) setpoint = average;
        return 0;
    }
    average += (int32_t)fill - (average >> AVG_SHIFT);
    if (quiet) {
        --quiet;
        return 0;
    }
    int32_t error = average - setpoint, step = 0;
    if (fill < BLOCK + 3u) return 0;  /* the interpolation reads up to frame consumed + 17 */
    if (error > (BAND << AVG_SHIFT)) step = 1;
    else if (error < -(BAND << AVG_SHIFT)) step = -1;
    if (!step) return 0;
    mwua_input_slip(ring, consumed, (int)step, inputs == 3u ? 4u : 2u);
    average -= step * (1 << AVG_SHIFT);  /* the ring now holds one frame less (or more) */
    quiet = SPACING;
    mwua_trims += step > 0 ? 0x10000u : 1u;
    return step;
}
