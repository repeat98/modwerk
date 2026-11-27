/* SPDX-License-Identifier: GPL-3.0-or-later
 * USB output drift trim (#2263).
 *
 * While the host plays into the Octatrack (INPUTS: an adaptive OUT stream on the host's clock), the
 * recording stream goes out at the host's nominal 11.025 frames a poll too, so both directions run on
 * the host's clock. With the recording on the Octatrack's crystal instead, macOS, which runs a
 * device's input and output in one I/O cycle, let its output buffer slide 2.6 frames a second
 * against what it sent, until it sent stale buffers: a buzz at the I/O buffer's rate after about three
 * minutes (owner's MKII, a Mac, 26 November 2026; a 256-frame buffer moved it from 86 to 172 Hz).
 *
 * The producer still fills the ring on the Octatrack's crystal, so the ring slowly fills or empties.
 * Before a packet is copied, the packet builder calls mwua_output_trim with the ring's fill and the
 * packet's frame count n. A slow average of the fill is held near the fill seen when the stream
 * settled. When the average leaves that band by more than BAND frames, the packet's first SPAN frames
 * are taken from SPAN + 1 ring frames (or SPAN - 1), interpolated (four-point Catmull-Rom), so one
 * frame is absorbed or repeated within 0.1 ms with no step. Every other packet is copied bit for bit.
 *
 * This runs in the frame interrupt, so a slip touches only the words the packet sends
 * (usb_audio_settings.c mwua_sent_words) over SPAN frames: interpolating every word of a whole
 * packet (240 values) made a frame of up to 125 % and late frame entries on the owner's MKII, which
 * held the sequencer back.
 *
 * Ring frames are 20 words, ten stereo pairs of 24-bit samples in 4-byte little-endian containers (the
 * pad byte first), as the packets carry them. The corrected frames are written back where the packet's
 * copy reads them, so the copy stays as it is. */
#include <stdint.h>

#define RING_FRAMES 1024u   /* layouts/usbaudio.s AUD_FRAMES */
#define WORDS 20u           /* a ring frame: tracks 1-8, MAIN, CUE */
#define SPAN 4u             /* frames a slip rewrites */
#define AVG_SHIFT 12        /* the fill average: 4,096 packets, about a second */
#define SETTLE (1u << AVG_SHIFT) /* packets averaged before the setpoint is taken */
#define BAND 2              /* frames either side of the setpoint */
#define SPACING 64u         /* packets between two trims, 16 ms */

extern uint32_t mwua_out_trims;   /* absorbed << 16 | repeated, the sixteenth long of the 0x55 counters */
extern uint32_t mwua_sent_words;  /* usb_audio_settings.c: the words a packet sends */
static int32_t average, setpoint;
static uint32_t packets, quiet, expected = 0xffffffffu;
static int32_t scratch[SPAN][WORDS];  /* the corrected frames, before they go back into the ring */

/* A ring word is the sample's little-endian bytes after a pad byte: the 24-bit sample is the word's
 * top three bytes in little-endian order. */
static uint32_t little(uint32_t v)
{
#if defined(__BYTE_ORDER__) && __BYTE_ORDER__ == __ORDER_BIG_ENDIAN__
    return v >> 24 | (v >> 8 & 0xff00u) | (v << 8 & 0xff0000u) | v << 24;
#else
    return v;
#endif
}
static int32_t sample_at(const uint32_t *ring, uint32_t index, unsigned word)
{
    return (int32_t)little(ring[(index & (RING_FRAMES - 1u)) * WORDS + word]) >> 8;
}
static void sample_put(uint32_t *ring, uint32_t index, unsigned word, int32_t value)
{
    ring[(index & (RING_FRAMES - 1u)) * WORDS + word] = little((uint32_t)value << 8);
}

/* The signal at frame i + t/256, from frames i-1 .. i+2 (Catmull-Rom, Horner in t). Samples are taken
 * at 19 bits first so no product leaves 31 bits even for full-scale input that alternates sign every
 * sample; the result is clamped to 24 bits, since the curve can overshoot. */
static int32_t at(const uint32_t *ring, uint32_t i, int32_t t, unsigned word)
{
    int32_t s0 = sample_at(ring, i - 1u, word) >> 5, s1 = sample_at(ring, i, word) >> 5;
    int32_t s2 = sample_at(ring, i + 1u, word) >> 5, s3 = sample_at(ring, i + 2u, word) >> 5;
    int32_t a = 3 * (s1 - s2) + s3 - s0;
    int32_t b = 2 * s0 - 5 * s1 + 4 * s2 - s3 + ((a * t) >> 8);
    int32_t c = s2 - s0 + ((b * t) >> 8);
    int32_t v = (s1 + ((c * t) >> 9)) * 32;
    return v > 0x7fffff ? 0x7fffff : v < -0x800000 ? -0x800000 : v;
}

/* SPAN packet frames from SPAN + step ring frames, for the words in `words`: packet frame k is the
 * signal at consumed + k (SPAN + step) / SPAN. It is written back to frame consumed + step + k, where
 * the copy takes it next; the frames after it follow on from consumed + step + SPAN, untouched. */
void mwua_output_slip(uint32_t *ring, uint32_t consumed, int step, uint32_t words)
{
    for (unsigned k = 0; k < SPAN; ++k) {
        unsigned position = k * (SPAN + (unsigned)step);  /* in SPANths of a frame from consumed */
        int32_t t = (int32_t)(position % SPAN * (256u / SPAN));
        uint32_t i = consumed + position / SPAN;
        for (unsigned w = 0; w < WORDS; ++w) if (words >> w & 1u) scratch[k][w] = at(ring, i, t, w);
    }
    for (unsigned k = 0; k < SPAN; ++k)
        for (unsigned w = 0; w < WORDS; ++w) if (words >> w & 1u) sample_put(ring, consumed + (unsigned)step + k, w, scratch[k][w]);
}

/* Called once per packet, while the host plays into the unit, with the ring's fill before the packet is
 * taken and its frame count. Returns what to add to the copy's position: 0, 1 (one frame absorbed) or -1
 * (one frame repeated). A packet that does not follow the last one (the first after the host started
 * playing in, or after the ring resynced) settles the setpoint afresh. */
int32_t mwua_output_trim(uint32_t *ring, uint32_t consumed, uint32_t fill, uint32_t n)
{
    if (consumed != expected) average = 0, packets = quiet = 0;
    expected = consumed + n;
    if (n < SPAN) return 0;
    if (packets < SETTLE) {
        /* The setpoint is the plain mean of the first SETTLE fills, in the average's fixed point (fill <<
         * AVG_SHIFT) because SETTLE is 2^AVG_SHIFT. */
        average += (int32_t)fill;
        if (++packets == SETTLE) setpoint = average;
        return 0;
    }
    average += (int32_t)fill - (average >> AVG_SHIFT);
    if (quiet) {
        --quiet;
        return 0;
    }
    int32_t error = average - setpoint, step = 0;
    if (error > (BAND << AVG_SHIFT)) step = 1;
    else if (error < -(BAND << AVG_SHIFT)) step = -1;
    if (!step || fill < n + 3u) return 0;  /* the packet then reads n frames from consumed + step */
    mwua_output_slip(ring, consumed, (int)step, mwua_sent_words);
    average -= step * (1 << AVG_SHIFT);  /* the ring now holds one frame less (or more) */
    quiet = SPACING;
    expected = consumed + (uint32_t)step + n;
    mwua_out_trims += step > 0 ? 0x10000u : 1u;
    return step;
}
