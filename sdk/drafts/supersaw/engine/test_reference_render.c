/* Frozen scalar V0.26 oracle. Test only; never linked into the firmware. */
#include "machine.h"
#define ssm_render reference_ssm_render
int ssm_render(SSMachine* s,int32_t* out,unsigned n){
    if(!s||!out||n>16)return -1;
    if(!n)return 0;
    int32_t from=(int32_t)s->rec.voice.gain,to=(int32_t)s->rec.voice.target;
    for(unsigned i=0;i<n;i++){
        int32_t g=from+(to-from)*(int32_t)(i+1)/(int32_t)n;
        SawStereo v=saw_tick(&s->rec.voice.saw);
        int32_t l=((int32_t)v.l*g/32768)*s->rec.level/127;
        int32_t r=((int32_t)v.r*g/32768)*s->rec.level/127;
        out[2*i]=l*65536;out[2*i+1]=r*65536;
    }
    s->rec.voice.gain=s->rec.voice.target;s->rec.voice.pos=16;return 0;
}
