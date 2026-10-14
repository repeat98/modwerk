/* SPDX-License-Identifier: GPL-2.0-or-later */
/* DT I OS 1.53: one volatile input/main recorder, native ONESHOT playback.
 * Only the UI task allocates. The audio interrupt owns capture/publication.
 * A private descriptor avoids taking a user sample or the audition slots. */
#ifdef DT_LINKABLE
#include "euclidean.h" /* integer types and native-call macros only */
static u32 ram_lock(void){u32 sr;__asm__ volatile("move.w %%sr,%0\n\tmove.w #0x2700,%%sr":"=d"(sr)::"memory");return sr;}
static void ram_unlock(u32 sr){__asm__ volatile("move.w %0,%%sr"::"d"(sr):"memory");}
#else
#include "../digitakt_euclidean/euclidean.h"
#define ram_lock euc_lock
#define ram_unlock euc_unlock
#endif
#include "digitakt-mk1/core3.h"
#ifdef DT_LINKABLE
#include "core21.h" /* Core 2.1 exports no firmware locations */
#endif

#define RAM_R 120
#define RAM_P 121
#define CAPACITY 1584000UL
#define VOICE_ACTIVE(t) (*(volatile u8 *)(0x8000edecUL+94UL*(t)))
enum { EMPTY, RECORDING, READY, NO_MEMORY };
volatile u32 ram_state,ram_count,ram_target,ram_owner,ram_generation;
/* Optional sample-tools client: 1 pins a take for editing, 2 commits PCM.
 * Reset invalidates the token; capture cannot overwrite a pinned buffer. */
volatile u32 ram_editor_busy;
volatile u32 ram_stats[12]; /* starts, finishes, busy, empty plays, plays, resets, blocks */
static short * volatile ram_pcm;
static u32 ram_gain;
static u32 ram_source; /* 0 MAIN, 1 input L, 2 input R, 3 input L+R */
static volatile u32 ram_stop,ram_pending_reset;
/* ABI is native {pointer, rate << 16, sample count, rate factor}. */
u32 ram_descriptor[4]={0x4031abd0,48000UL<<16,248,0x40000000};
extern void core_mtick(void),mp_tick(void *);
extern u32 ram_native_new(u32),ram_native_load(u32,u32,u32);
extern u32 ram_native_set(u32,u32,u32,u32);

/* Normalization. Capture tracks the take's peak; when the take ends it is
 * scaled to full scale in place, so BR (which quantizes on a fixed
 * full-scale grid) acts on it as on a normal sample, and RAM-P1 plays it
 * back with ram_boost instead of a fixed gain. The pass runs in the audio
 * interrupt, NORM_STEP samples a block from each end of the take, so a
 * forward or reverse voice started on the next step reads scaled samples.
 * Each scaled line is pushed from the copyback cache: the voice DMA reads
 * DDR. A commit from Sample Tools runs the same pass at unity to push it. */
#define NORM_STEP 512UL
#define NORM_MAX (64UL<<16) /* x64 at most, for near-silent takes */
#define BOOST_Q12 29600 /* x7.227 in Q12, 1/0.1384 */
static u32 ram_peak,ram_norm_lo,ram_norm_hi,ram_norm_gain;
static volatile u32 ram_boost=BOOST_Q12;
static void norm_range(u32 from,u32 to){
 short *p=ram_pcm;s32 g=(s32)ram_norm_gain;u32 i,a;
 if(g!=65536)for(i=from;i<to;i++)p[i]=(short)((p[i]*g)>>16);
 for(a=(u32)(p+from)&~15UL;a<(u32)(p+to);a+=16)
  __asm__ volatile("cpushl %%dc,(%0)"::"a"(a):"memory");
}
static void norm_step(void){
 u32 lo=ram_norm_lo,hi=ram_norm_hi,end;
 if(lo>=hi)return;
 end=hi-lo>NORM_STEP?lo+NORM_STEP:hi;norm_range(lo,end);lo=end;
 if(lo<hi){end=hi-lo>NORM_STEP?hi-NORM_STEP:lo;norm_range(end,hi);hi=end;}
 ram_norm_lo=lo;ram_norm_hi=hi;
}
static void norm_start(u32 gain){
 ram_norm_gain=gain;ram_norm_lo=0;ram_norm_hi=ram_count;norm_step();
}
static void norm_cancel(void){ram_norm_hi=ram_norm_lo;}
static void silence(void){
 ram_descriptor[0]=0x4031abd0;ram_descriptor[2]=248;
}
static void kill_readers(void){
 u32 t;
 for(t=0;t<8;t++)if(core_track_machine[t]==RAM_P)VOICE_ACTIVE(t)=0;
}
static void finish(void){
 if(ram_state!=RECORDING)return;
 if(ram_count<248){ram_state=EMPTY;silence();return;}
 /* All reads/writes are in the audio IRQ, with a non-yielding publication. */
 {u32 gain=ram_peak?(32767UL<<16)/ram_peak:65536;
  if(gain>NORM_MAX)gain=NORM_MAX;
  if(gain<65536)gain=65536;
  ram_boost=ram_peak?(BOOST_Q12*65536UL)/gain:0;norm_start(gain);}
 ram_descriptor[0]=(u32)ram_pcm;ram_descriptor[2]=ram_count;
 ram_state=READY;ram_generation++;ram_stats[1]++;
}
void ram_reset(void){
 u32 sr=ram_lock();ram_pending_reset=1;ram_stop=0;
 ram_generation++;if(ram_editor_busy!=2)ram_editor_busy=0;
 ram_state=EMPTY;ram_count=0;norm_cancel();silence();kill_readers();ram_stats[5]++;
 ram_unlock(sr);
}
u32 ram_new(u32 project){ram_reset();return ram_native_new(project);}
u32 ram_load(u32 project,u32 slot,u32 message){ram_reset();return ram_native_load(project,slot,message);}
u32 ram_key(u32 brain,u32 event){
 if(R32(event+12)==11&&(R32(event+16)&9)==1)ram_stop=1;
#ifdef DT_LINKABLE
 (void)brain;return 0; /* Observe STOP; core dispatches the native event. */
#else
 return FW(0x400084fe)(brain,event);
#endif
}
void ram_src_draw(u32 view,u32 bmp){
 u32 mode=FW(0x4002b5d4)(view);
 /* The base SRC painter shows the native icon while the machine picker is
  * open, and parameter controls otherwise. Skip only the expanded file
  * waveform: our volatile take has no file waveform to display. */
 if(mode==RAM_R||mode==RAM_P)FW(0x4002b48c)(view,bmp);
 else FW(0x4003a8f4)(view,bmp);
}
u32 ram_tick(u32 ctrl){
 u32 t,need=0;static u32 shown=0xffffffff;u8 *kit=fw_kit;
#ifndef DT_LINKABLE
 core_mtick();mp_tick((void *)ctrl);
#endif
 if(kit)for(t=0;t<8;t++){
  u8 mode=FW_SOUND(kit,t)[FW_SOUND_MACHINE];if(mode==RAM_R||mode==RAM_P)need=1;
 }
 if(!need&&!ram_pcm&&ram_state==NO_MEMORY)ram_state=EMPTY;
 if(need&&!ram_pcm&&ram_state!=NO_MEMORY){
  /* Native buddy allocation rounds to 4 MiB. Keep for the session so no
   * active DMA reader can observe freed/reallocated memory. */
  u32 block=fw_op_new(CAPACITY*2+512);
  if(block){
   FW(0x400e8514)(block,CAPACITY*2+512); /* native zero fill, OS 1.53 */
   ram_pcm=(short *)((block+31)&~15UL);
  }else ram_state=NO_MEMORY;
 }
 if(need&&shown!=ram_state){*(u8 *)(ctrl+0x20)=1;shown=ram_state;}
 return *(u8 *)(ctrl+0x20);
}

/* Before the native pipelined reader. The previous block's start mask is
 * the one native playback consumes now; it already passed mute/conditions. */
void ram_audio(u32 params,u32 machines,u32 starts,u32 stops,u32 velocities){
 u32 t,previous=R32(0x8000122c);
 if(ram_pending_reset){ram_pending_reset=0;kill_readers();previous=0;}
 if(ram_stop||stops==0xffffffffUL){ram_stop=0;finish();previous=0;}
 for(t=0;t<8;t++){
  u32 mode=core_track_machine[t];u16 *p=(u16 *)(params+t*106+0x34);
  if(mode==RAM_R&&(previous&(1UL<<t))){
   if(ram_state==RECORDING||ram_editor_busy){ram_stats[2]++;continue;}
   if(ram_pcm){
    u32 index=p[0]>>8,steps,tempo=FW(0x400770c8)();
    if(index>7)index=7;
    steps=1UL<<index;
    if(tempo<120)tempo=120;
    ram_target=(steps*5760000UL/(tempo*4))*60;
    if(ram_target>CAPACITY)ram_target=CAPACITY;
    if(ram_target<248)ram_target=248;
    ram_gain=p[7]>>8;if(ram_gain>127)ram_gain=127;
    ram_source=p[2]>>8;if(ram_source>3)ram_source=0;
    ram_count=0;ram_peak=0;norm_cancel();ram_owner=t;ram_state=RECORDING;silence();kill_readers();ram_stats[0]++;
   }
  }
 }
 for(t=0;t<8;t++)if(core_track_machine[t]==RAM_P){
  *(u16 *)(params+t*106+0x3a)=0x8300;
  if(previous&(1UL<<t))ram_stats[ram_state==READY?4:3]++;
 }
 FW(0x40075184)(params,machines,starts,stops,velocities);
}
/* After native playback, before overdrive/filter/envelope. */
void ram_gate(s32 *blocks){
 u32 t,i;
 for(t=0;t<8;t++)if(core_track_machine[t]==RAM_R||
    (core_track_machine[t]==RAM_P&&ram_state!=READY)){
  for(i=0;i<32;i++)blocks[t*32+i]=0;
  VOICE_ACTIVE(t)=0;
 }
}
/* Replaces the renderer's call to the main mixer. Native playback scales a
 * sample by about 0.138 on its way to MAIN (LEV 100, AMP VOL 110, track
 * level 100, centre pan), so a take captured from MAIN played back at 1/7.
 * Boost RAM-P1's post-amp block before the mixer, which feeds MAIN and both
 * sends from it: a take then plays at the level it was recorded. There a
 * full-scale take is 0.73 of full scale at default LEV; saturate above.
 * Takes are stored normalized, so the gain is per take: ram_boost is the
 * fixed x7.227 divided by the take's normalization gain. */
#define TRACK_BLOCKS ((s32 *)0x80001a18UL)
u32 ram_mix(u32 out,u32 bus,u32 params){
 u32 t,i;s32 boost=(s32)ram_boost,limit=boost?0x7fffffff/boost:0;
 for(t=0;t<8;t++)if(core_track_machine[t]==RAM_P){
  s32 *b=TRACK_BLOCKS+t*32;
  for(i=0;i<32;i++){
   s32 v=b[i]>>12;
   b[i]=!boost?0:v>limit?0x7fffffff:v< -limit?(s32)0x80000001:v*boost;
  }
 }
 return FW(0x40071c20)(out,bus,params);
}
void ram_capture(u32 external,u32 usb,u32 main,u32 tracks){
 u32 n,i;const s32 *mix;
 u32 peak;
 FW(0x40076650)(external,usb,main,tracks); /* ordinary sampling unchanged */
 if(ram_state==READY)norm_step();
 if(ram_state!=RECORDING)return;
 mix=(const s32 *)(ram_source?external:main);
 n=ram_target-ram_count;if(n>32)n=32;
 for(i=0;i<n;i++){
  s32 v;
  if(ram_source==1)v=mix[i*2]>>16;
  else if(ram_source==2)v=mix[i*2+1]>>16;
  else v=((mix[i*2]>>16)+(mix[i*2+1]>>16))/2;
  v=v*(s32)ram_gain/100;
  if(v>32767)v=32767;
  if(v< -32768)v= -32768;
  ram_pcm[ram_count+i]=(short)v;
  peak=v<0?-v:v;if(peak>ram_peak)ram_peak=peak;
 }
 ram_count+=n;ram_stats[6]++;
 if(ram_count==ram_target)finish();
}

static int32_t format_int(char *b,int32_t v,int32_t ctx,int32_t machine){
 char tmp[4];u32 n=(u16)v>>8,i=0,j=0;(void)ctx;(void)machine;
 do{tmp[i++]='0'+n%10;n/=10;}while(n&&i<4);
 while(i)b[j++]=tmp[--i];
 b[j]=0;return 1;
}
static int32_t format_state(char *b,int32_t v,int32_t ctx,int32_t machine){
 const char *s=ram_state==NO_MEMORY?"NO RAM":!ram_pcm?"WAIT":
  ram_state==RECORDING?"REC":ram_state==READY?"READY":"EMPTY";
 (void)v;(void)ctx;(void)machine;while((*b++=*s++));return 1;
}
static int32_t format_length(char *b,int32_t v,int32_t ctx,int32_t machine){
 u32 index=(u16)v>>8;if(index>7)index=7;
 return format_int(b,(1UL<<index)*256,ctx,machine);
}
static int32_t format_source(char *b,int32_t v,int32_t ctx,int32_t machine){
 static const char *const names[]={"MAIN","IN L","IN R","IN LR"};
 u32 index=(u16)v>>8;const char *s=names[index<4?index:0];
 (void)ctx;(void)machine;while((*b++=*s++));return 1;
}
static int32_t length_graph(void *bmp,int32_t x,int32_t y,int32_t value,int32_t flag){
 char b[8];(void)flag;format_length(b,value,0,RAM_R);
 fw_textf(bmp,fw_font5,x+3,y+5,8,"%s",b);return 1;
}
static int32_t state_graph(void *bmp,int32_t x,int32_t y,int32_t value,int32_t flag){
 char b[8];(void)flag;format_state(b,value,0,RAM_R);
 fw_textf(bmp,fw_font5,x-3,y+5,8,"%s",b);return 1;
}
static int32_t source_graph(void *bmp,int32_t x,int32_t y,int32_t value,int32_t flag){
 char b[8];(void)flag;format_source(b,value,0,RAM_R);
 fw_textf(bmp,fw_font5,x-3,y+5,8,"%s",b);return 1;
}
static void record_switch(int32_t t,int32_t from,uint8_t *sound){
 (void)from;
 *(u16 *)(sound+0x36)=4*256;*(u16 *)(sound+0x38)=0;
 *(u16 *)(sound+0x3a)=0;*(u16 *)(sound+0x44)=100*256;
 if(t<8){fw_set_param(4*256,t,17);fw_set_param(0,t,18);fw_set_param(0,t,19);fw_set_param(100*256,t,24);}
}
static void play_switch(int32_t t,int32_t from,uint8_t *sound){
 (void)from;*(u16 *)(sound+0x38)=3*256;if(t<8)fw_set_param(3*256,t,18);
}
u32 ram_set(u32 object,u32 mode,u32 channel,u32 send){
 u32 old=FW(0x4002200a)(object),result=ram_native_set(object,mode,channel,send),t;
 u8 *sound=(u8 *)FW(R32(R32(object)+0x28))(object),*kit=fw_kit;
 /* Only explicit native machine selection resets source defaults. Polling
  * mode changes would also reset saved settings on project/sound loading. */
 if(result&&sound&&old!=mode&&sound[0x7e]==mode&&(mode==RAM_R||mode==RAM_P)){
  for(t=0;t<8;t++)if(kit&&FW_SOUND(kit,t)==sound)break;
  if(mode==RAM_R)record_switch(t,old,sound);else play_switch(t,old,sound);
 }
 return result;
}
#define HIDDEN { .flags=CM_HIDDEN }
static const struct cm_ui record_ui={
 .abi=cm_ui_v31,.page_from=0,.group="RAM RECORD",
 .knob={
  {.name="RLEN",.lname="Record steps",.look=0x6d,.flags=CM_RANGE|CM_DEFAULT|CM_DRAW,
   .min=0,.max=7*256,.def=4*256,.fmt=format_length,.draw=length_graph},
  {.name="TAKE",.lname="RAM take",.flags=CM_RANGE|CM_DEFAULT|CM_DRAW,
   .min=0,.max=0,.def=0,.fmt=format_state,.draw=state_graph},
  {.name="SRCE",.lname="Record source",.look=0x6d,.flags=CM_RANGE|CM_DEFAULT|CM_DRAW,
   .min=0,.max=3*256,.def=0,.fmt=format_source,.draw=source_graph},
  HIDDEN,HIDDEN,HIDDEN,HIDDEN,
  {.name="RLEV",.lname="Record level",.flags=CM_RANGE|CM_DEFAULT,
   .min=0,.max=127*256,.def=100*256,.fmt=format_int}
 }};
static const struct cm_ui play_ui={
 .abi=cm_ui_v3,.page_from=0,.group="RAM PLAY",
 .knob={{0},{0},{0},HIDDEN,{0},{0},{0},{0}}
};
const struct cm_machine ram_record_machine={RAM_R,"RAM-R1","RAMR",0,0,RAM_R,CM_UI_TAG,&record_ui};
/* Optional versioned API discovered through the machine descriptor, so
 * sample-tools remains installable without RAM machines. No raw private
 * symbol addresses or unguarded access to an old module's PCM. */
u32 ram_editor(u32 operation,u32 *args){
 u32 sr,i,token;
 if(!args)return 0;
 sr=ram_lock();
 /* Read-only identity query, including from the playback window. Unlike
  * pinning, this never suppresses a future record trig. */
 if(operation==3){
  if(ram_state!=READY||ram_norm_lo<ram_norm_hi){ram_unlock(sr);return 0;}
  args[0]=(u32)ram_pcm;args[1]=ram_count;args[2]=ram_generation;args[3]=48000;
  ram_unlock(sr);return 1;
 }
 if(operation==0){
  if(ram_state!=READY||ram_editor_busy||ram_norm_lo<ram_norm_hi){ram_unlock(sr);return 0;}
  ram_editor_busy=1;args[0]=(u32)ram_pcm;args[1]=ram_count;
  args[2]=ram_generation;args[3]=48000;ram_unlock(sr);return 1;
 }
 token=args[operation==1?2:0];
 if(!ram_editor_busy||token!=ram_generation){ram_unlock(sr);return 0;}
 if(operation==2){ram_editor_busy=0;ram_unlock(sr);return 1;}
 if(operation!=1||ram_editor_busy!=1||ram_state!=READY||args[1]<248||args[1]>CAPACITY){ram_unlock(sr);return 0;}
 ram_editor_busy=2;ram_state=4;silence();kill_readers();ram_unlock(sr);
 for(i=0;i<args[1];i++)ram_pcm[i]=((const short *)args[0])[i];
 sr=ram_lock();
 if(token!=ram_generation){ram_editor_busy=0;ram_unlock(sr);return 0;}
 ram_count=args[1];norm_start(65536); /* edited PCM keeps the take's boost */
 ram_descriptor[0]=(u32)ram_pcm;ram_descriptor[2]=ram_count;
 ram_generation++;ram_state=READY;ram_editor_busy=0;ram_unlock(sr);return 1;
}
const struct {struct cm_machine machine;u32 tag;u32 (*editor)(u32,u32 *);} ram_play_machine={
 {RAM_P,"RAM-P1","RAMP",0,0,0,CM_UI_TAG,&play_ui},0x52414d31UL,ram_editor};
#ifndef DT_LINKABLE
const struct cm_machine *const core_machines[]={&ram_record_machine,&ram_play_machine.machine,0};
void (*const ev_render_voices[])(s32 *)={ram_gate,0};
#endif
