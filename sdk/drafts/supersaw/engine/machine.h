#ifndef SSM_MACHINE_H
#define SSM_MACHINE_H
#include "ot_records.h"
typedef struct {SSRecordVoice rec;uint32_t frames,fstep;int last_step;} SSMachine;
void ssm_init(SSMachine* s);
void ssm_clock(SSMachine* s,unsigned step);
void ssm_knobs(SSMachine* s,const uint8_t* fp);
void ssm_prepare(SSMachine* s,const uint8_t* fp,int atk,int hold,int rel,int start);
void ssm_kill(SSMachine* s);
void ssm_release(SSMachine* s);
int ssm_render(SSMachine* s,int32_t* stereo,unsigned n);
#endif
