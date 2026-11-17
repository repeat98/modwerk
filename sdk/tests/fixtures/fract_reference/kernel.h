/* One head's frames inside a call, mixed by one tight loop a window
 * segment: PCM contiguous (one page, or the join's staged pairs), one
 * direction, all added or all stored, no retirement. og_mix_span splits the
 * span at the window's 1/128 segments itself and adds pcm*env to two
 * accumulator words a frame (or, with `first`, stores it), exactly as 0.9.6
 * summed its packets; each segment's env is og_envelope_shape's (window.h).
 * ColdFire builds run kernel.s (scripts/build.py appends it to the grain
 * unit); host builds run the C twin in pitch.c. The QEMU profiler's
 * kernel-twin rows hold the two equal (scripts/coldfire_profile.py). */
#ifndef GRNYV1_KERNEL_H
#define GRNYV1_KERNEL_H
#include <stddef.h>
#include <stdint.h>
typedef struct {
    uintptr_t pcm;          /* the first frame: a device address (formats 0-3) or int16 pairs (4) */
    int32_t *acc;           /* the call's accumulator, two words a frame */
    uint32_t phase;         /* the head's Q31 window phase at the first frame; the span ends below 2^31 */
    uint32_t step;          /* the phase step a frame */
    const uint16_t *attack; /* the window's attack half, read ascending below `half` */
    const uint16_t *release;/* its release half, by distance from the grain's end */
    uint32_t half;          /* the switch: the attack's segments << 24 (2^30 for Hann); at
                             * exactly this phase the window is the peak, attack[half >> 24] */
    uint16_t gain_l, gain_r;/* PAN, Q8 in 0..256; both 256 = none */
    uint16_t frames;        /* 1..64 */
    uint8_t format;         /* 0 PCM24 mono, 1 PCM24 stereo, 2 PCM16 mono, 3 PCM16 stereo,
                             * 4 the join's int16 pairs (native order: PCM16 stereo on ColdFire) */
    uint8_t first;          /* 1: store instead of add */
} OgSpan;
#if UINTPTR_MAX == 0xffffffffu
_Static_assert(sizeof(OgSpan)==36 && offsetof(OgSpan,half)==24 && offsetof(OgSpan,gain_l)==28 &&
               offsetof(OgSpan,frames)==32 && offsetof(OgSpan,first)==35,
               "OgSpan layout is kernel.s's contract");
#endif
void og_mix_span(const OgSpan *);
/* REV: the same span read downwards, from `pcm` (its first frame) to the
 * frames below it. PCM formats 0-3 only: the join's pairs are staged in
 * playing order and run forwards. */
void og_mix_span_reverse(const OgSpan *);
#endif
