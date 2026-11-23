#ifndef SAW_FIXED_H
#define SAW_FIXED_H
#include <stdint.h>
#include "tables.h"

/* Original C99 desktop portability study. Not an Octabam ABI/module.
 * Phase: unsigned Q0.32. Table: signed PCM16. Gains: Q0.15.
 * 44.1 kHz only. Controls are applied between blocks, not concurrently.
 * Caller provides note envelope. No allocation, math library or floats.
 */
typedef struct {
    uint32_t phase[7], step[7];
    int32_t gain_l[7], gain_r[7];
    uint8_t table[7], voices;
} SawFixed;
typedef struct { int16_t l, r; } SawStereo;
/* Exact unsigned 32x32 >> 30; caller keeps the result within uint32. */
static inline uint32_t ss_mul_q30(uint32_t a,uint32_t b){
    uint32_t a0=a&65535,a1=a>>16,b0=b&65535,b1=b>>16;
    uint32_t low=a0*b0,t=a1*b0+(low>>16);
    low=(low&65535)|(t<<16);
    uint32_t hi=a1*b1+(t>>16),u=a0*b1,next=low+(u<<16);
    hi+=(u>>16)+(next<low);
    return (hi<<2)|(next>>30);
}
static inline int saw_clamp(int x,int lo,int hi){return x<lo?lo:x>hi?hi:x;}
static inline void saw_init(SawFixed* s){
    unsigned i;
    for(i=0;i<7;i++){
        s->phase[i]=UINT32_C(743029342)+i*UINT32_C(588410519);
        s->step[i]=0;s->gain_l[i]=s->gain_r[i]=0;s->table[i]=8;
    }
    s->voices=1;
}
static inline void saw_config_step(SawFixed* s,uint32_t base,int detune,int mix,int width,int voices){
    static const int pan[7]={0,-127,83,-38,38,-83,127};
    int i;detune=saw_clamp(detune,0,127);
    mix=saw_clamp(mix,0,127);width=saw_clamp(width,0,127);
    voices=saw_clamp(voices,1,7);s->voices=(uint8_t)voices;
    for(i=0;i<7;i++){
        uint32_t step=ss_mul_q30(base,saw_ratios[detune][i]);
        s->step[i]=(uint32_t)step;
        s->table[i]=0;
        /* Harmonics below 90% Nyquist: conservative, stepped timbre. */
        while(s->table[i]<8 && step>UINT32_C(3865470566)/(2*saw_harmonics[s->table[i]]))s->table[i]++;
        int gain=(i==0?127:mix)*32767/(127+(voices-1)*mix);
        /* First gentle trim: at most +0.5 dB (Q15 34710/32768).
         * Mono and MIX 0 stay bit-identical; ramp by the side-oscillator weight.
         * Existing conservative normalization leaves ample coherent-peak headroom. */
        int trim=32768+1942*(voices-1)*mix/(6*127);
        gain=gain*trim/32768;
        int p=pan[i]*width/127;
        /* Linear pan keeps total L+R gain constant and needs no sqrt. */
        s->gain_l[i]=gain*(127-p)/254;
        s->gain_r[i]=gain*(127+p)/254;
    }
}
static inline void saw_config(SawFixed* s,int note,int detune,int mix,int width,int voices){
    saw_config_step(s,saw_steps[saw_clamp(note,0,127)],detune,mix,width,voices);
}
static inline SawStereo saw_tick(SawFixed* s){
    int32_t l=0,r=0;unsigned i;
    for(i=0;i<s->voices;i++){
        unsigned index=s->phase[i]>>23;
        uint32_t frac=(s->phase[i]>>8)&32767;
        const int16_t* t=saw_tables[s->table[i]];
        int32_t a=t[index],b=t[(index+1)&511];
        int32_t v=a+(int32_t)(((b-a)*(int32_t)frac)/32768);
        l+=v*s->gain_l[i];r+=v*s->gain_r[i];
        s->phase[i]+=s->step[i];
    }
    SawStereo o={(int16_t)(l/32768),(int16_t)(r/32768)};
    return o;
}
#endif
