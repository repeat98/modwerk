/* One native owner, three fixed sample-reading heads. No audio allocation. */
#ifndef GRNYV1_GRAIN_H
#define GRNYV1_GRAIN_H
#include <stddef.h>
#include <stdint.h>
enum { OG_MAX_GRAINS=3, OG_PACKET_FRAMES=8 };
/* The engine's controls (og_engine, og_grain_all): DENS SIZE POS SCAN SPRD
 * PAN, the six the state keeps (OgGrain.params), then SHPE and REV, latched
 * by each grain at its birth. REV is the reverse probability in 127ths,
 * which og_render reads from the page's REVS as 127 - REVS (REVS reads as a
 * direction: 127 forwards, 0 every grain reversed). OG_REV_SEED starts
 * reader 0's REV sequence (reader g's is OG_REV_SEED ^ g << 12). */
enum { OG_SHPE=6, OG_REV=7, OG_PARAMS=8, OG_REV_SEED=0xace1 };
#ifdef __mcoldfire__
/* Every ColdFire unit includes this header and is built with -malign-int
 * (scripts/build.py): longwords on 0 mod 4 in the pool and on the stack. */
_Static_assert(_Alignof(uint32_t)==4,"ColdFire units are built with -malign-int");
#endif
typedef struct {
    uint32_t start, cursor, age, length, phase, step;
    uint16_t left, right;
    /* PTCH's rate and fraction until 0.10.0; all zero at SHPE 64, REVS 127. */
    uint8_t shape;           /* SHPE: its window row (window.h), latched at birth; 0 is Hann. */
    uint8_t reverse;         /* REV: 1 reads the span backwards, latched at birth. */
    uint16_t rev_seed;       /* REV: this reader's 16-bit sequence; 0 until its first draw. */
} OgHead;
typedef struct {
    OgHead head[OG_MAX_GRAINS];
    uint32_t scan, seed, identity, countdown;
    uint16_t mix;
    int16_t fraction;
    uint8_t params[6];
    int8_t pitch;            /* Published PITCH minus 64, in -64..63. */
    uint8_t spread_mode;     /* 0: whole source, 1: local two-second window. */
    uint32_t pan_seed;
} OgGrain;
_Static_assert(sizeof(OgHead)==32 && sizeof(OgGrain)==128,"Fixed native grain ABI");
_Static_assert(offsetof(OgHead,shape)==28 && offsetof(OgHead,reverse)==29 && offsetof(OgHead,rev_seed)==30,
               "SHPE's and REV's latches in PTCH's former bytes");
_Static_assert(offsetof(OgGrain,pitch)==122 && offsetof(OgGrain,spread_mode)==123 &&
               offsetof(OgGrain,pan_seed)==124,"Packed pitch and scatter controls");
_Static_assert(OG_MAX_GRAINS*OG_PACKET_FRAMES*2*sizeof(int16_t)==96,"Bounded native PCM packet");
/* The generic per-frame engine, kept as the research reference; the native
 * build runs og_engine (source.h). */
typedef void (*OgRead)(void *,uint32_t,int32_t *);
extern OgGrain og_state;
#ifndef OG_NATIVE_STAGE_ONE
/* The six historical controls, at SHPE 64 (Hann) and REV 0 (REVS 127). */
void og_grain(OgGrain *,uint32_t,const uint8_t *,int32_t *,unsigned,OgRead,void *);
/* All OG_PARAMS controls: the reference for og_engine's other shapes. */
void og_grain_all(OgGrain *,uint32_t,const uint8_t *,int32_t *,unsigned,OgRead,void *);
#endif
void og_reset(OgGrain *,uint32_t);
uint32_t og_size(unsigned value); /* Native helper requires value in 0..127. */
/* Internal scheduler: length in 441..88200, density in 0..127. */
uint32_t og_hop(uint32_t length,unsigned density);
void og_stop(OgGrain *);
/* Internal native helper: valid source geometry, count <= 64 and Q12 rate
 * in -16384..15876. The fractional remainder is always in 0..4095. */
void og_scan_advance(OgGrain *,uint32_t,int,unsigned);
#endif
