#include "machine.h"
typedef char ssm_fits_state[(sizeof(SSMachine)<=460)?1:-1];
void ssm_init(SSMachine* s){ss_ot_init(&s->rec);s->frames=s->fstep=0;s->last_step=-1;}
void ssm_clock(SSMachine* s,unsigned step){
    ++s->frames;
    if((int)step!=s->last_step){
        uint32_t d=s->frames-s->fstep;
        if(s->last_step>=0&&d>=16&&d<=65535)s->rec.voice.fps=d;
        s->fstep=s->frames;s->last_step=(int)step;
    }
}
void ssm_knobs(SSMachine* s,const uint8_t* fp){(void)ss_ot_params(&s->rec,fp,12);}
void ssm_prepare(SSMachine* s,const uint8_t* fp,int atk,int hold,int rel,int start){
    ssm_knobs(s,fp);
    ss_amp(&s->rec.voice,atk,hold,rel,s->rec.voice.fps);
    if(start)ss_ot_start(&s->rec);
    /* WAVE's scheduler updates the target on the last call of a frame.
     * The old segment keeps the previous target. A new segment ramps over n. */
    s->rec.voice.pos=16;(void)ss_frame(&s->rec.voice);
}
void ssm_kill(SSMachine* s){
    ss_stop(&s->rec.voice);s->rec.voice.gain=s->rec.voice.from=s->rec.voice.target=0;
}
void ssm_release(SSMachine* s){ss_off(&s->rec.voice);}
static inline int32_t ssm_ramp_div(int32_t x,unsigned n){
    switch(n){case 1:return x;case 2:return x/2;case 4:return x/4;
    case 8:return x/8;case 16:return x/16;default:return x/(int32_t)n;}
}
int ssm_render(SSMachine* s,int32_t* out,unsigned n){
    if(!s||!out||n>16)return -1;
    if(!n)return 0;
    int32_t from=(int32_t)s->rec.voice.gain,to=(int32_t)s->rec.voice.target;
    /* Keep free-running phases exactly, including modular wrap, at zero output. */
    if((!from&&!to)||!s->rec.level){
        for(unsigned j=0;j<s->rec.voice.saw.voices;j++)
            s->rec.voice.saw.phase[j]+=s->rec.voice.saw.step[j]*(uint32_t)n;
        for(unsigned i=0;i<2*n;i++)out[i]=0;
        s->rec.voice.gain=s->rec.voice.target;s->rec.voice.pos=16;return 0;
    }
    for(unsigned i=0;i<n;i++){
        int32_t g=from==to?from:from+ssm_ramp_div((to-from)*(int32_t)(i+1),n);
        SawStereo v=saw_tick(&s->rec.voice.saw);
        int32_t l=((int32_t)v.l*g/32768)*s->rec.level/127;
        int32_t r=((int32_t)v.r*g/32768)*s->rec.level/127;
        out[2*i]=l*65536;out[2*i+1]=r*65536;
    }
    s->rec.voice.gain=s->rec.voice.target;s->rec.voice.pos=16;return 0;
}
