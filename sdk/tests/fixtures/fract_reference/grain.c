/* Sample coordinates stay in frames, including at long sample lengths. */
#include "grain.h"
#include "sizes.h"
#include "window.h"
#ifdef OG_NATIVE_STAGE_ONE
#include "source.h"
#endif
/* Density is the first control: 127, three heads a third of a length
 * apart, is what DENS 127 gives (source.c, og_densities); lower densities
 * space births og_hop apart, the historical DENS schedule. OG_FIXED_DENSITY
 * pins it at 127 for a scalar differential oracle. */
#ifdef OG_FIXED_DENSITY
#define DENSITY(p) 127u
#else
#define DENSITY(p) ((unsigned)(p)[0])
#endif
#define SPREAD(p) ((unsigned)(p)[4])
#include "pan.h"
OgGrain og_state={0};
uint32_t og_owner=8;
#ifdef OG_NATIVE_STAGE_ONE
/* Packed UI-only heights use spare bytes beside the single audio state. */
uint8_t og_peak_heights[54]={0};
OgSource og_ui_source={0};
#endif
#ifndef OG_NATIVE_STAGE_ONE
uint32_t og_size(unsigned value) {
    return og_length((value>127?127:value)>>1);
}
#endif
/* Birth spacing: a third of the length at density 127 (no division), else
 * ceil(127*length/(3*density)); 0 schedules no birth. length*127 stays
 * below 2^24. */
uint32_t og_hop(uint32_t length,unsigned density) {
    if (!density) return 0;
    return density==127?(length+OG_MAX_GRAINS-1u)/OG_MAX_GRAINS:
        (length*127u+OG_MAX_GRAINS*density-1u)/(OG_MAX_GRAINS*density);
}
static uint32_t scale(uint32_t n,unsigned v) {
    return (n/127)*v+(n%127)*v/127;
}
void og_stop(OgGrain *s) {
    for (unsigned g=0;g<OG_MAX_GRAINS;++g) s->head[g].length=0;
    s->countdown=0;s->mix=0;s->scan=0;s->fraction=0;
}
void og_reset(OgGrain *s,uint32_t identity) {
    og_stop(s);
    s->seed=0x17349d;s->pan_seed=0x9e3779b9;s->identity=identity;
    for (unsigned g=0;g<OG_MAX_GRAINS;++g) s->head[g].rev_seed=0;
}
static uint32_t random_word(OgGrain *s) {
    s->seed^=s->seed<<13;s->seed^=s->seed>>17;s->seed^=s->seed<<5;
    return s->seed;
}
#ifdef OG_NATIVE_STAGE_ONE
/* Native blocks advance at birth boundaries and once at the end. The
 * generic reference advances every frame. Q12 remainders remain exact. */
void og_scan_advance(OgGrain *s,uint32_t frames,int rate,unsigned count) {
    int fraction=s->fraction+rate*(int)count;
    /* Source geometry is at most 44,860,416 frames; a block adds at most
     * 256 frames. The signed coordinate stays bounded. Floor keeps one
     * nonnegative fractional remainder in either scanning direction. */
    int next=(int)s->scan+(fraction>>12);
    s->fraction=(int16_t)(fraction&4095);
    if ((uint32_t)next>=frames) {
        next%=(int)frames;
        if (next<0) next+=(int)frames;
    }
    s->scan=(uint32_t)next;
}

#define advance_scan og_scan_advance
#else
/* Native blocks advance at birth boundaries and once at the end. The
 * generic reference advances every frame. Q12 remainders remain exact. */
static void advance_scan(OgGrain *s,uint32_t frames,int rate,unsigned count) {
    int fraction=s->fraction+rate*(int)count;
    /* Source geometry is at most 44,860,416 frames; a block adds at most
     * 256 frames. The signed coordinate stays bounded. Floor keeps one
     * nonnegative fractional remainder in either scanning direction. */
    int next=(int)s->scan+(fraction>>12);
    s->fraction=(int16_t)(fraction&4095);
    if ((uint32_t)next>=frames) {
        next%=(int)frames;
        if (next<0) next+=(int)frames;
    }
    s->scan=(uint32_t)next;
}
#endif
/* A successful birth puts its reader's index in *born (OG_MAX_GRAINS: none). */
static uint32_t birth(OgGrain *s,uint32_t frames,const uint8_t *p,unsigned *born) {
    uint32_t wait=~0u;
    for (unsigned g=0;g<OG_MAX_GRAINS;++g) {
        OgHead *h=s->head+g;
        if (h->length) {
            uint32_t remaining=h->length-h->age;
            if (remaining<wait) wait=remaining;
            continue;
        }
        *born=g;
        uint32_t target=scale(frames-1,p[2]);
        target+=s->scan;
        if (target>=frames) target-=frames;
        /* FULL preserves historical positions; LOCAL caps the circular
         * window at two seconds independently of source duration. */
        if (SPREAD(p)) {
            /* Quadratic width gives fine jitter near zero and the selected
             * circular extent at 127. Q15 preserves every native control. */
            unsigned gain=(SPREAD(p)*SPREAD(p)*32768u+8064u)/16129u;
            uint32_t extent=frames-1;
            if (s->spread_mode && extent>88200u) extent=88200u;
            uint32_t width=(extent>>15)*gain+((extent&32767u)*gain>>15);
            /* Full-word multiply-high scaling avoids the 16-bit position
             * grid on long sources. Four bounded word products; no int64,
             * division by sample length or rejection loop in a birth. */
            uint32_t word=random_word(s),range=width+1;
            unsigned low=(unsigned)(uint16_t)range*(uint16_t)word;
            unsigned mid=(range>>16)*(uint16_t)word+(low>>16);
            uint32_t offset=(range>>16)*(word>>16)+(mid>>16);
            mid=(unsigned)(uint16_t)range*(word>>16)+(mid&65535u);
            offset+=mid>>16;
            target+=offset;
            if (target>=frames) target-=frames;
            offset=width/2;
            target=target>=offset?target-offset:frames-(offset-target);
        }
        h->start=h->cursor=target;h->age=h->phase=0;
#ifdef OG_NATIVE_STAGE_ONE
        h->length=og_size(p[1]);
#else
        h->length=og_length(p[1]>>1);
#endif
        /* SHPE: the window this grain keeps for life, so an edit never
         * changes a sounding envelope (no zipper). */
        h->shape=(uint8_t)og_shape_of(p[OG_SHPE],p[1]>>1);
        /* REV: with probability p[OG_REV]/127 (127 - REVS: og_render) the
         * grain reads its span backwards, from the span's last frame. Each
         * reader draws from its own 16-bit xorshift (7, 9, 8) sequence, so
         * REVS moves neither SPRD's nor PAN's draws, and nothing is drawn at
         * 0 (REVS 127), where its bytes stay zero. */
        unsigned reverse=0;
        if (p[OG_REV]) {
            unsigned x=h->rev_seed?h->rev_seed:OG_REV_SEED^(g<<12);
            x^=(x<<7)&65535u;x^=x>>9;x^=(x<<8)&65535u;
            h->rev_seed=(uint16_t)x;
            reverse=(x*127u>>16)<p[OG_REV];
            if (reverse) h->start=h->cursor=(target+h->length-1u)%frames;
        }
        h->reverse=(uint8_t)reverse;
        h->step=(1u<<31)/(h->length-1);
        pan_birth(s,h,p[5]);
        /* Round upward so an odd-length head retires before reuse. */
        return og_hop(h->length,DENSITY(p));
    }
    /* A SIZE edit may find all readers occupied. Retry at the first
     * retirement; a failed birth must not schedule a new long-grain hop. */
    return wait;
}
/* floor(c*a/b) for a, b in 1..2^23, without 64-bit arithmetic (the units
 * link no libgcc): exact while c*a fits 32 bits, else c drops just enough
 * low bits, a relative error below 2^-8. */
static uint32_t rescale(uint32_t c,uint32_t a,uint32_t b) {
    unsigned shift=0;
    while ((c>>shift)>0xffffffffu/a) ++shift;
    return ((c>>shift)*a/b)<<shift;
}
/* SIZE changes envelope velocity, never its current amplitude or source clock.
 * A shaped grain keeps the row it was born with, and a row is click-free
 * only down to the SIZE whose cap admits it (og_shape_floor): below that the
 * grain plays on at that SIZE's speed, finishing a little later than the new
 * SIZE asks (at most 2,004 frames for row 16), so no SIZE move plays a
 * window faster than a birth may. Hann, row 0, is admitted at every SIZE.
 * Rescale the pending birth from the old SIZE's to the new SIZE's window
 * phase to preserve three-way overlap; with no grain sounding, it stays.
 * At density 127 the product stays below 2^31 (exact); a sparse DENS can
 * leave a pending wait of many lengths, rescaled within 2^-8. Floor can
 * advance a pending birth by less than one frame; occupied heads retry at
 * their first retirement. */
static void retime(OgGrain *s,unsigned old_size,unsigned length) {
    unsigned step=(1u<<31)/(length-1),live=0,wait=~0u;
    for(unsigned g=0;g<OG_MAX_GRAINS;++g) {
        OgHead *h=s->head+g;
        if(!h->length)continue;
        unsigned own=step;
        if(h->shape) {
            uint32_t shortest=og_length(og_shape_floor[h->shape-1]);
            if(length<shortest) own=(1u<<31)/(shortest-1);
        }
        unsigned life=((1u<<31)-h->phase)/own+1;
        h->length=h->age+life;h->step=own;live=1;
        if(life<wait)wait=life;
    }
    if(live && s->countdown) s->countdown=rescale(s->countdown,(1u<<31)/(og_length(old_size)-1),step);
    if(DENSITY(s->params)==127 && s->countdown>wait)s->countdown=wait;
}

#ifdef OG_NATIVE_STAGE_ONE
#include "kernel.h"
#ifndef U8
#define U8(a) (*(volatile uint8_t *)(uintptr_t)(a))
#define U16(a) (*(volatile uint16_t *)(uintptr_t)(a))
#define U32(a) (*(volatile uint32_t *)(uintptr_t)(a))
#endif
/* A call accumulates in its own audio words (on the unit, on-chip SRAM). A
 * settled call (mix 256) does so all at once; on the entry ramp, which mixes
 * in the dry input those words hold, it runs in chunks of at most OG_CHUNK
 * frames whose dry samples are saved first. The join's PCM is staged
 * OG_JOIN_FRAMES frames at a time. */
enum { OG_CHUNK=16, OG_JOIN_FRAMES=8 };
/* One frame's PCM at a device address, as the native decoders read it
 * (24-bit sources contribute their upper 16 bits); 0 is silence. */
static void frame_pcm(unsigned format,uintptr_t a,int32_t *pcm) {
    if (!a) {pcm[0]=pcm[1]=0;return;}
    if (format==3) {uint32_t pair=U32(a);pcm[0]=(int16_t)(pair>>16);pcm[1]=(int16_t)pair;}
    else if (format==2) pcm[0]=pcm[1]=(int16_t)U16(a);
    else {
        pcm[0]=(int16_t)((U8(a)<<8)|U8(a+1));
        pcm[1]=format==1?(int16_t)((U8(a+3)<<8)|U8(a+4)):pcm[0];
    }
}
/* The endpoint the last 128 frames of a long source fade towards (0.9.6's
 * joined_pcm): frame 0's PCM, primed once per call, valid only if its page
 * is. 0 not needed yet, 1 primed and valid, 2 primed and invalid. */
typedef struct {unsigned state;int32_t pcm[2];} OgJoin;
static void join_prime(const OgSource *s,unsigned format,OgJoin *j) {
    uint32_t remaining;uintptr_t a=og_locate(s,0,&remaining);
    j->state=a?1:2;
    frame_pcm(format,a,j->pcm);
}
/* Where a reader left off in a call: the address of its next frame and the
 * page's frames from it in its direction (0: none). A birth splits the call
 * into spans, and the readers that go on find their page here instead of
 * locating it again; a birth clears its reader's. */
typedef struct {uintptr_t page;uint32_t remaining;} OgPlace;
/* One head's `live` frames from (cursor, phase) into acc, as spans of
 * og_mix_span split where the page or the join span changes and where the
 * fill ends; the kernel splits each span at the window's segments. `span`
 * arrives with the head's step, PAN gains and window halves. Frames below
 * `fill` already hold a sum and are added to; the rest are stored
 * (kernel.h's first), so no accumulator needs clearing. The last 128 frames
 * of a long source are read as 0.9.6's joined_pcm read them, into int16
 * pairs on the stack that the spans then read as format 4. An unmapped page
 * plays silence, as in 0.9.6. Returns the new fill. */
static unsigned mix_head(const OgSource *s,OgSpan *span,unsigned format,uint32_t cursor,uint32_t phase,
                         unsigned live,int32_t *acc,unsigned fill,OgJoin *join,unsigned reverse,
                         OgPlace *place) {
    unsigned bpf=s->bytes*s->channels;
    uint32_t frames=s->frames,step=span->step,remaining=0;
    uintptr_t page=0;
    page=place->page;remaining=place->remaining;
    /* kernel.s reads these pairs as longwords: 4-aligned, since og_fetch
     * hands og_render a 4-aligned stack (an int16_t array is otherwise
     * aligned to 2). */
    int16_t joined[2*OG_JOIN_FRAMES] __attribute__((aligned(4)));
    for (unsigned j=0;j<live;) {
        uint32_t edge=frames-1-cursor;
        uintptr_t a;
        unsigned n;
        intptr_t stride;   /* bytes from frame to frame: negative read backwards */
        void (*mix)(const OgSpan *)=og_mix_span;
        if (s->join_mode && edge<128) {
            /* 0.9.6 read these frames through joined_pcm, then stored
             * int16 packet samples before PAN and the window. A reversed
             * head stages them downwards, in playing order, until it leaves
             * the span at its first frame, frames-128. `remaining` counts
             * the page's frames left in the reading direction. */
            if (!join->state) join_prime(s,format,join);
            n=live-j;
            if (reverse) {if (n>128-edge) n=128-edge;}
            else if (n>edge+1) n=edge+1;
            if (n>OG_JOIN_FRAMES) n=OG_JOIN_FRAMES;
            for (unsigned k=0;k<n;++k) {
                uint32_t f=reverse?cursor-k:cursor+k;
                if (!remaining) {
                    page=og_locate(s,f,&remaining);
                    if (page && reverse) remaining=f%(6144u/bpf)+1u;
                }
                int32_t pcm[2];frame_pcm(format,page,pcm);
                if (join->state==1 && page)
                    for (unsigned c=0;c<2;++c)
                        pcm[c]=(int16_t)(pcm[c]+(((join->pcm[c]-pcm[c])*(int)(128-(frames-1-f)))>>7));
                joined[2*k]=(int16_t)pcm[0];joined[2*k+1]=(int16_t)pcm[1];
                if (page) {page=reverse?page-bpf:page+bpf;--remaining;}
            }
            a=(uintptr_t)joined;stride=4;span->format=4;
        } else {
            if (!remaining) {
                page=og_locate(s,cursor,&remaining);
                if (!page) {   /* unmapped: silence for this frame, as 0.9.6 */
                    if (j>=fill) {acc[2*j]=acc[2*j+1]=0;fill=j+1;}
                    ++j;phase+=step;
                    if (reverse) cursor=cursor?cursor-1:frames-1;
                    else if (++cursor==frames) cursor=0;
                    continue;
                }
                /* Backwards, the page's frames down to its first. */
                if (reverse) remaining=cursor%(6144u/bpf)+1u;
            }
            n=live-j;
            if (n>remaining) n=remaining;
            if (!reverse && s->join_mode && edge-128<n) n=edge-127;   /* stop at the join span */
            a=page;span->format=(uint8_t)format;
            if (reverse) {stride=-(intptr_t)bpf;mix=og_mix_span_reverse;}
            else stride=(intptr_t)bpf;
            page+=(uintptr_t)(stride*(intptr_t)n);remaining-=n;
        }
        if (reverse) cursor=cursor>=n?cursor-n:frames-(n-cursor);
        else {
            cursor+=n;
            if (cursor==frames) cursor=0;
        }
        /* Split again where the fill ends: at most two spans. */
        for (unsigned end=j+n;j<end;) {
            unsigned k=end-j;
            if (j<fill && j+k>fill) k=fill-j;
            span->pcm=a;span->acc=acc+2*j;span->phase=phase;
            span->frames=(uint16_t)k;span->first=(uint8_t)(j>=fill);
            mix(span);
            if (j+k>fill) fill=j+k;
            j+=k;a+=(uintptr_t)(stride*(intptr_t)k);phase+=k*step;
        }
    }
    place->page=page;place->remaining=remaining;
    return fill;
}
/* The native engine: the same schedule, births, retiming, SCAN clock, PAN
 * and entry ramp as 0.9.6's packet engine at unity, frame for frame. Births
 * fall on span starts; within a span every live head mixes independently.
 * Each head's fields are read once a span and written back once. */
void og_engine(OgGrain *s,const OgSource *src,const uint8_t *p,int32_t *audio,unsigned count) {
    uint32_t frames=src->frames;
    if (count-1u>=64 || !frames || frames>44860416u) return;
    unsigned size=s->params[1]>>1,previous=s->params[0];
    /* The clamped controls go to the state, as 0.9.6 kept them; the call
     * reads its stack copy. */
    uint8_t q[OG_PARAMS];
    for (unsigned k=0;k<OG_PARAMS;++k) q[k]=p[k]>127?127:p[k];
    for (unsigned k=0;k<6;++k) s->params[k]=q[k];
    if (size!=(unsigned)(q[1]>>1)) retime(s,size,og_size(q[1]));
    /* A density edit keeps the pending birth's place in its interval (the
     * historical DENS rule): the wait scales by old/new, rounded up.
     * Leaving or entering density 0 restarts the schedule. */
    if (!previous || !q[0]) s->countdown=0;
    else if (previous!=q[0]) s->countdown=(s->countdown*previous+q[0]-1u)/q[0];
    /* The clamped bipolar delta is -64..63; a word multiply is sufficient. */
    int16_t delta=(int16_t)((int)q[3]-64);
    int rate=delta*(delta<0?-delta:delta)*4; /* Q12; fine motion near centre. */
    unsigned format=(src->bytes==2?2u:0u)+(src->channels==2),advanced=0,mix=s->mix;
    uint32_t countdown=s->countdown;
    OgJoin join={0,{0,0}};
    OgSpan span;
    OgPlace places[OG_MAX_GRAINS];
    for (unsigned g=0;g<OG_MAX_GRAINS;++g) places[g].remaining=0;
    for (unsigned base=0;base<count;) {
        int32_t *acc=audio+2*base;
        int16_t dry[2*OG_CHUNK];
        unsigned chunk=count-base,ramp=mix<256;
        if (ramp) {
            if (chunk>OG_CHUNK) chunk=OG_CHUNK;
            for (unsigned k=0;k<2*chunk;++k) dry[k]=(int16_t)(acc[k]>>16);
        }
        for (unsigned i=0;i<chunk;) {
            if (!countdown && q[0]) {
                if (rate) og_scan_advance(s,frames,rate,base+i-advanced);
                advanced=base+i;
                unsigned born=OG_MAX_GRAINS;
                countdown=birth(s,frames,q,&born);
                if (born<OG_MAX_GRAINS) places[born].remaining=0;
            }
            unsigned m=chunk-i,fill=0;
            if (q[0]) {   /* density 0: no birth, the live grains finish */
                if (m>countdown) m=countdown;
                countdown-=m;
            }
            for (unsigned g=0;g<OG_MAX_GRAINS;++g) {
                OgHead *h=s->head+g;
                uint32_t length=h->length;
                if (!length) continue;
                uint32_t age=h->age,step=h->step,phase=h->phase,cursor=h->cursor;
                unsigned len=length-age;
                if (len>m) len=m;
                /* The retiring frame's window is zero: it adds nothing. */
                unsigned live=length-1u-age;
                if (live>len) live=len;
                /* SHPE's and REV's latches in one pool read, and the two
                 * PAN gains in another: the pool is uncached on the unit. */
                union {uint16_t word;uint8_t byte[2];} latch;
                __builtin_memcpy(&latch.word,&h->shape,2);
                unsigned reverse=latch.byte[1];
                if (live) {
                    /* The head's window halves (window.h): Hann's are
                     * og_hann_gain twice, switching at 2^30. */
                    unsigned shape=latch.byte[0];
                    span.attack=span.release=og_hann_gain;span.half=1u<<30;
                    if (shape) {
                        uint32_t row=og_shape_rows[shape-1];
                        span.attack=og_shape_gain+(row>>8&4095u);span.release=og_shape_gain+(row>>20);
                        span.half=row<<24;
                    }
                    span.step=step;__builtin_memcpy(&span.gain_l,&h->left,4);
                    fill=mix_head(src,&span,format,cursor,phase,live,acc+2*i,fill,&join,reverse,places+g);
                }
                age+=len;
                if (age==length) h->length=0;
                h->age=age;h->phase=phase+len*step;
                if (reverse) {
                    unsigned back=len<frames?len:len%frames;
                    cursor=cursor>=back?cursor-back:cursor+frames-back;
                } else {
                    cursor+=len;
                    if (cursor-frames<len) cursor%=frames;
                }
                h->cursor=cursor;
            }
            /* Frames no head reached are silence. */
            for (;fill<m;++fill) acc[2*(i+fill)]=acc[2*(i+fill)+1]=0;
            i+=m;
        }
        if (ramp) {
            for (unsigned f=0;f<chunk;++f) {
                if (mix<256) {
                    /* Entry ramp: dry*256 is a multiple of 256, so this is
                     * exactly (dry*(256-mix)+wet*mix)>>8, and wet at 256. */
                    mix+=4;
                    for (unsigned c=0;c<2;++c) {
                        int32_t d=dry[2*f+c],wet=acc[2*f+c]>>16;
                        acc[2*f+c]=(d+(((wet-d)*(int)mix)>>8))*65536;
                    }
                } else for (unsigned c=0;c<2;++c)
                    acc[2*f+c]=(int32_t)((uint32_t)acc[2*f+c]&0xffff0000u);
            }
        } else {
            /* The mask in a register: ColdFire ands it into memory in one
             * instruction a word (it has no andi to memory). */
            uint32_t *w=(uint32_t *)acc,*end=w+2*chunk,mask=0xffff0000u;
            do {*w++&=mask;*w++&=mask;} while (w!=end);
        }
        base+=chunk;
    }
    s->countdown=countdown;s->mix=(uint16_t)mix;
    if (rate) og_scan_advance(s,frames,rate,count-advanced);
}
#else
void og_grain(OgGrain *s,uint32_t frames,const uint8_t *p,int32_t *audio,
              unsigned count,OgRead read,void *context) {
    if (count-1u>=64 || !frames || frames>44860416u) return;
    uint8_t all[OG_PARAMS]={p[0],p[1],p[2],p[3],p[4],p[5],64,0};
    og_grain_all(s,frames,all,audio,count,read,context);
}
void og_grain_all(OgGrain *s,uint32_t frames,const uint8_t *p,int32_t *audio,
                  unsigned count,OgRead read,void *context) {
    if (count-1u>=64 || !frames || frames>44860416u) return;
    unsigned size=s->params[1]>>1;
#ifndef OG_FIXED_DENSITY
    unsigned previous_density=s->params[0];
#endif
    uint8_t q[OG_PARAMS];
    for (unsigned k=0;k<OG_PARAMS;++k) q[k]=p[k]>127?127:p[k];
#ifdef OG_FIXED_DENSITY
    q[0]=127;
#endif
    for (unsigned k=0;k<6;++k) s->params[k]=q[k];
    p=q;
    unsigned density=DENSITY(p);
    /* Preserve the pending launch phase through density automation. Repeated
     * edits must not force a birth on every block. Rounding adds at most one
     * frame per edit; valid schedules keep the numerator below 11,201,526.
     * SIZE keeps live phases; resuming from zero restarts scheduling. */
#ifdef OG_FIXED_DENSITY
    if (size!=(unsigned)(p[1]>>1)) retime(s,size,og_size(p[1]));
#else
    if (size!=(unsigned)(p[1]>>1)) retime(s,size,og_size(p[1]));
    if (!previous_density || !density) s->countdown=0;
    else if (previous_density!=density)
        s->countdown=(s->countdown*previous_density+density-1u)/density;
#endif
    /* The clamped bipolar delta is -64..63; a word multiply is sufficient. */
    int16_t delta=(int16_t)((int)p[3]-64);
    int rate=delta*(delta<0?-delta:delta)*4; /* Q12; fine motion near centre. */
    for (unsigned i=0;i<count;++i) {
        if (density) {
            if (!s->countdown) {unsigned born;s->countdown=birth(s,frames,p,&born);}
            --s->countdown;
        }
        int32_t sum[2]={0,0};
        for (unsigned g=0;g<OG_MAX_GRAINS;++g) {
            OgHead *h=s->head+g;
            if (!h->length) continue;
            int32_t pcm[2];read(context,h->cursor,pcm);
            /* Q31 phase also works for two-second grains. Force the last
             * sample to zero so integer step rounding cannot leave a click. */
            unsigned envelope=og_envelope_shape(h->shape,h->phase);
            /* Retire at the zero endpoint instead of comparing age twice.
             * The already prefetched last PCM frame and cursor still advance. */
            if (h->age+1==h->length) {envelope=0;h->length=0;}
            sum[0]+=((pcm[0]*(int32_t)h->left)>>8)*(int32_t)envelope;
            sum[1]+=((pcm[1]*(int32_t)h->right)>>8)*(int32_t)envelope;
            if (h->reverse) h->cursor=h->cursor?h->cursor-1:frames-1;
            else if (++h->cursor==frames) h->cursor=0;
            h->phase+=h->step;
            ++h->age;
        }
        /* DENS controls births, not bypass. At zero, live Hann tails finish
         * and the wet output becomes silent; the scan clock keeps running. */
        /* Reset starts at zero and the fixed four-unit entry ramp reaches
         * 256 exactly. DENS never changes this insertion gain. */
        if (s->mix<256) s->mix+=4;
        for (unsigned ch=0;ch<2;++ch) {
            int32_t dry=audio[2*i+ch]>>16,wet=sum[ch]>>16;
            int32_t mixed=s->mix==256?wet:(dry*(256-s->mix)+wet*s->mix)>>8;
            audio[2*i+ch]=mixed*65536;
        }
        if (rate) advance_scan(s,frames,rate,1);
    }
}
#endif
