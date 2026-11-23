/* Exact V0.26 scalar oracle versus optimized renderer; host sanitizers. */
#include "machine.c"
#include <assert.h>
#include <stdio.h>
#include <string.h>
int reference_ssm_render(SSMachine*,int32_t*,unsigned);
static uint32_t rng=0x7a62435u;
static uint32_t next(void){rng=rng*1664525u+1013904223u;return rng;}
static unsigned long calls=0,samples=0;
static void compare(SSMachine* a,SSMachine* b,unsigned n){
 int32_t x[40],y[40];for(unsigned i=0;i<40;i++)x[i]=y[i]=0x12345678;
 assert(ssm_render(a,x,n)==reference_ssm_render(b,y,n));
 assert(!memcmp(x,y,sizeof x));assert(!memcmp(a,b,sizeof *a));
 ++calls;if(n<=16)samples+=n;
}
int main(void){
 SSMachine a,b;memset(&a,0,sizeof a);ssm_init(&a);b=a;
 assert(ssm_render(0,0,16)==reference_ssm_render(0,0,16));
 int32_t tmp[32];assert(ssm_render(&a,0,16)==reference_ssm_render(&b,0,16));
 assert(ssm_render(0,tmp,16)==reference_ssm_render(0,tmp,16));
 unsigned endpoints[]={0,1,64,32767,32768},levels[]={0,1,80,127};
 for(unsigned v=1;v<=7;v++)for(unsigned from=0;from<5;from++)for(unsigned to=0;to<5;to++)for(unsigned n=0;n<=17;n++)for(unsigned l=0;l<4;l++){
  uint8_t fp[12]={64,128,127,0,127,0,(uint8_t)(v-1),0,127,0,127,0};
  ssm_prepare(&a,fp,0,127,127,1);a.rec.voice.gain=endpoints[from];a.rec.voice.target=endpoints[to];a.rec.level=levels[l];
  for(unsigned j=0;j<7;j++)a.rec.voice.saw.phase[j]=UINT32_MAX-j*17;
  b=a;compare(&a,&b,n);
 }
 for(unsigned frame=0;frame<100000;frame++){
  uint8_t fp[12];for(unsigned i=0;i<6;i++){fp[2*i]=(uint8_t)(next()%128);fp[2*i+1]=(uint8_t)next();}fp[6]=(uint8_t)(next()%7);
  if(frame%11==0)fp[10]=0;
  int atk=(int)(next()%128),hold=frame%4?127:(int)(next()%128),rel=(int)(next()%128),start=frame%7==0;
  ssm_clock(&a,frame/64);ssm_clock(&b,frame/64);
  ssm_prepare(&a,fp,atk,hold,rel,start);ssm_prepare(&b,fp,atk,hold,rel,start);
  if(frame%17==0){ssm_kill(&a);ssm_kill(&b);}else if(frame%13==0){ssm_release(&a);ssm_release(&b);}
  unsigned n=1+next()%16;compare(&a,&b,n);
  if(frame%3==0){fp[10]=(uint8_t)(next()%128);fp[6]=(uint8_t)(next()%7);ssm_knobs(&a,fp);ssm_knobs(&b,fp);}
  compare(&a,&b,16-n);
 }
 printf("PASS: %lu calls, %lu stereo samples, exact PCM32 and entire state; ramps/chunks/zero level/STOP/release/restart/phase wrap/nulls/invalid size\n",calls,samples);
}
