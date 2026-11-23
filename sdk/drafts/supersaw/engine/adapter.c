#include "adapter.h"
void ss_init(SSVoice* s){
    saw_init(&s->saw);s->gain=s->from=s->target=s->hold_left=0;s->fps=345;
    s->pos=16;s->note=60;s->detune=64;s->mix=102;s->width=114;s->voices=7;
    s->atk=0;s->hold=127;s->rel=64;s->on=s->stopped=0;
    saw_config(&s->saw,s->note,s->detune,s->mix,s->width,s->voices);
}
void ss_controls(SSVoice* s,int d,int m,int w,int v){
    s->detune=saw_clamp(d,0,127);s->mix=saw_clamp(m,0,127);
    s->width=saw_clamp(w,0,127);s->voices=saw_clamp(v,1,7);
    saw_config(&s->saw,s->note,s->detune,s->mix,s->width,s->voices);
}
void ss_amp(SSVoice* s,int a,int h,int r,unsigned fps){
    s->atk=saw_clamp(a,0,127);s->hold=saw_clamp(h,0,127);s->rel=saw_clamp(r,0,127);
    s->fps=fps<1?1:fps>65535?65535:fps;
}
void ss_on(SSVoice* s,int note){
    s->note=saw_clamp(note,0,127);s->on=1;s->stopped=0;
    s->hold_left=s->hold==127?0:(amp_hold128[s->hold]*s->fps)/128+1;
    /* Continue phases and current gain on a warm retrigger. */
    ss_controls(s,s->detune,s->mix,s->width,s->voices);
}
void ss_off(SSVoice* s){s->on=0;s->hold_left=0;}
void ss_stop(SSVoice* s){ss_off(s);s->stopped=1;}
int ss_frame(SSVoice* s){
    if(!s||s->pos!=16)return -1;
    s->from=s->gain;s->target=s->gain;s->pos=0;
    if(s->on&&s->hold_left&&!--s->hold_left)s->on=0;
    if(s->on){
        uint32_t g=s->gain+amp_atk_step[s->atk];
        s->target=g>32768?32768:g;
    }else{
        unsigned rel=s->stopped?0:(unsigned)s->rel;
        uint32_t k=amp_rel_k[rel];
        if(k){
            uint32_t d=(s->gain*k)/65536;
            if(d<1)d=1;
            s->target=s->gain>d?s->gain-d:0;
            if(s->target<=64)s->target=0;
        }
    }
    return 0;
}
int ss_render(SSVoice* s,int32_t* out,unsigned n){
    if(!s||!out||n<1||n>16||s->pos>16||n>16-s->pos)return -1;
    for(unsigned i=0;i<n;i++){
        unsigned p=++s->pos;
        int32_t g=(int32_t)s->from+((int32_t)s->target-(int32_t)s->from)*(int32_t)p/16;
        SawStereo v=saw_tick(&s->saw);
        /* int16 * Q15 fits int32; signed multiplication avoids UB shifts. */
        out[2*i]=((int32_t)v.l*g/32768)*65536;
        out[2*i+1]=((int32_t)v.r*g/32768)*65536;
        s->gain=(uint32_t)g;
    }
    return 0;
}
