#include "ot_records.h"
#include "pitch_fraction.h"
uint32_t ss_ot_pitch_step(int q8){
    q8=saw_clamp(q8,0,127*256);
    unsigned note=(unsigned)q8/256,frac=(unsigned)q8%256;
    return ss_mul_q30(saw_steps[note],ss_fraction[frac]);
}
void ss_ot_init(SSRecordVoice* s){
    ss_init(&s->voice);s->pitch_q8=60*256;s->level=127;s->configured=0;
    for(unsigned i=0;i<6;i++)s->cached[i]=0;
}
int ss_ot_params(SSRecordVoice* s,const uint8_t* p,size_t bytes){
    if(!s||!p||bytes<12)return -1;
    uint16_t w[6];unsigned changed=!s->configured;
    for(unsigned i=0;i<6;i++){
        w[i]=(uint16_t)((unsigned)p[2*i]*256+p[2*i+1]);
        if(w[i]!=s->cached[i])changed=1;
    }
    if(!changed)return 0;
    /* WAVE's word law: 0x4000 = C3, one raw unit = one semitone.
     * WAVE wc_pword clamps at +/-36 semitones; MIDI convention C3 = 48. */
    s->pitch_q8=48*256+saw_clamp((int)w[0]-0x4000,-36*256,36*256);
    s->voice.detune=saw_clamp(w[1]/256,0,127);
    s->voice.mix=saw_clamp(w[2]/256,0,127);
    s->voice.voices=saw_clamp(w[3]/256,0,6)+1;
    s->voice.width=saw_clamp(w[4]/256,0,127);
    s->level=saw_clamp(w[5]/256,0,127);
    saw_config_step(&s->voice.saw,ss_ot_pitch_step(s->pitch_q8),s->voice.detune,
                    s->voice.mix,s->voice.width,s->voice.voices);
    for(unsigned i=0;i<6;i++)s->cached[i]=w[i];
    s->configured=1;return 0;
}
void ss_ot_start(SSRecordVoice* s){
    /* Do not call ss_on: its integer note configuration would lose PTCH fraction. */
    s->voice.on=1;s->voice.stopped=0;
    s->voice.hold_left=s->voice.hold==127?0:
        (amp_hold128[s->voice.hold]*s->voice.fps)/128+1;
}
int ss_ot_payload(SSRecordVoice* s,uint8_t* record,size_t bytes){
    if(!s||!record||bytes<16)return -1;
    unsigned n=record[3]; /* low byte of first big-endian header word */
    if(n>16||bytes<16+8*n||s->voice.pos>16||n>16-s->voice.pos)return -1;
    if(!n)return 0;
    int32_t out[32];
    if(ss_render(&s->voice,out,n))return -1;
    for(unsigned i=0;i<2*n;i++){
        /* Convert to PCM16 before gain; word remains aligned to bits 31..16. */
        int32_t pcm=out[i]/65536;
        uint32_t v=(uint32_t)((pcm*s->level/127)*65536);
        record[16+4*i]=(uint8_t)(v>>24);record[17+4*i]=(uint8_t)(v>>16);
        record[18+4*i]=(uint8_t)(v>>8);record[19+4*i]=(uint8_t)v;
    }
    return 0;
}
