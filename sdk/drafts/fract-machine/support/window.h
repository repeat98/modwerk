#ifndef GRNYV1_WINDOW_H
#define GRNYV1_WINDOW_H
#include <stdint.h>

/* Q31 phase is in [0, 2^31]; the result is a Q15 amplitude in [0, 32768].
 * Hann is the default; smoothstep is an explicit comparison build. */
#ifndef OG_WINDOW_SMOOTHSTEP
static inline __attribute__((always_inline)) unsigned og_window(uint32_t phase) {
    unsigned u=(phase<(1u<<30)?phase:(1u<<31)-phase)>>15;
    /* Preserve the checked Hann approximation and every integer rounding.
     * product <= 8192 and curve <= 9344 fit in 16 bits; u <= 32768.
     * Word multiplies reduce encoding size without adding a multiply.
     * Halving the final signed factor and shifting by 14 is exact. */
    unsigned product=(unsigned)(uint16_t)u*(uint16_t)(32768u-u)>>15;
    unsigned curve=product+(((unsigned)(uint16_t)product*(uint16_t)product>>15)*9u>>4);
    return (unsigned)((int)u+((int16_t)((int)u-16384)*(int16_t)curve>>14));
}
#else
static inline __attribute__((always_inline)) unsigned og_window(uint32_t phase) {
    unsigned envelope=(phase<(1u<<30)?phase:(1u<<31)-phase)>>15;
    unsigned square=envelope*envelope>>15;
    return square*(98304u-2u*envelope)>>15;
}
#endif
/* Three-head Q15 envelope. The default uses 64 linear segments over half
 * a Hann window: only one word multiply per sample, no divisions/floats.
 * The 130-byte authored table is rounded from 21845*(1-cos(pi*i/64))/2.
 * Q16 interpolation keeps the analytic error below five Q15 units.
 * Peak 21845=floor(65536/3) bounds any three full-scale windows in int32. */
#ifndef OG_WINDOW_SMOOTHSTEP
#if defined(OG_NATIVE_STAGE_ONE) && !defined(OG_WINDOW_STORAGE)
extern const uint16_t og_hann_gain[65];
#else
#ifdef OG_NATIVE_STAGE_ONE
const
#else
static const
#endif
uint16_t og_hann_gain[65] = {
    0,13,53,118,210,327,470,638,
    831,1049,1290,1554,1841,2149,2479,2829,
    3199,3587,3993,4416,4854,5307,5774,6253,
    6743,7243,7752,8269,8792,9320,9852,10387,
    10922,11458,11993,12525,13053,13576,14093,14602,
    15102,15592,16071,16538,16991,17429,17852,18258,
    18646,19016,19366,19696,20004,20291,20555,20796,
    21014,21207,21375,21518,21635,21727,21792,21832,
    21845,
};
#endif
#endif
/* SHPE (scripts/shapes.py, shapes.h): 32 rows beside Hann, each an attack
 * half read ascending below its switch and a release half read by distance
 * from the grain's end, interpolated like og_hann_gain. A grain latches its
 * row at birth (og_shape_of); row 0 is Hann. */
#if defined(OG_NATIVE_STAGE_ONE) && !defined(OG_WINDOW_STORAGE)
#define OG_SHAPE_DECLARE
#elif defined(OG_NATIVE_STAGE_ONE)
#define OG_SHAPE_STORAGE const
#else
#define OG_SHAPE_STORAGE static const
#endif
#include "shapes.h"
/* The row of a grain born at SHPE `value` (0..127) and SIZE index `size`
 * (0..63): 64 is Hann; 65..127 sharp steps 1..16 (rows 1..16) and 63..0
 * soft steps 1..16 (rows 17..32), each capped at that SIZE's steepest
 * click-free step. */
static inline unsigned og_shape_of(unsigned value,unsigned size) {
    if (value==64) return 0;
    unsigned cap=og_shape_caps[size];
    if (value>64) {
        unsigned step=((value-64)*OG_SHAPE_SHARP+62)/63,most=(cap>>4)+1;
        return step<most?step:most;
    }
    unsigned step=((64-value)*OG_SHAPE_SOFT+63)>>6,most=(cap&15)+1;
    return OG_SHAPE_SHARP+(step<most?step:most);
}
static inline __attribute__((always_inline)) unsigned og_envelope(uint32_t phase) {
#ifndef OG_WINDOW_SMOOTHSTEP
    uint32_t p=phase<(1u<<30)?phase:(1u<<31)-phase;
    unsigned i=p>>24;
    if (i==64) return og_hann_gain[64];
    unsigned left=og_hann_gain[i];
    unsigned delta=og_hann_gain[i+1]-left;
    return left+((unsigned)(uint16_t)delta*(uint16_t)(p>>8)>>16);
#else
    return (unsigned)(uint16_t)og_window(phase)*21845u>>15;
#endif
}
/* Row `shape`'s envelope at Q31 phase, as mix_head's runs interpolate it. */
static inline unsigned og_envelope_shape(unsigned shape,uint32_t phase) {
    if (!shape) return og_envelope(phase);
    uint32_t row=og_shape_rows[shape-1],segments=row&255u,p;
    const uint16_t *t;
    if (phase<segments<<24) {p=phase;t=og_shape_gain+(row>>8&4095u);}
    else {
        p=(1u<<31)-phase;t=og_shape_gain+(row>>20);
        if ((p>>24)==128u-segments) return t[128u-segments];
    }
    unsigned i=p>>24;
    return t[i]+((unsigned)(uint16_t)(t[i+1]-t[i])*(uint16_t)(p>>8)>>16);
}
#endif
