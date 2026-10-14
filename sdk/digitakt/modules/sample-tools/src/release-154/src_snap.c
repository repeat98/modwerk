/* SPDX-License-Identifier: GPL-2.0-or-later */
/* OS 1.53: FUNC turns on the existing ONESHOT / RAM-P1 SRC page.
 * Searches run only in the UI task. The audio hook reads a bounded cache;
 * it never scans PCM, allocates, or changes a stored sound parameter. */
#include <stdint.h>
#include "digitakt-mk1/core3.h"
#include "core21.h" /* Core 2.1 exports no firmware locations */
#include "audio.h"
typedef uint32_t u32;typedef int32_t s32;typedef uint16_t u16;
#define R(a) (*(volatile u32 *)(a))
#define F(a) ((u32 (*)())(a))
#define PATTERN R(0x4199ec38)
#define API_TAG 0x52414d31UL
extern uint64_t se_native_window(const int16_t *,u32,u32);
struct Snap {
 u32 pattern,source,length,slot,provider,generation,mask;
 int16_t raw[3];u16 pad;
 u32 point[3];
};
static struct Snap positions[8];
static u32 file_generation[128];
extern u32 se_native_register(u32,u32,u32,u32);
static u32 lock(void);
static void unlock(u32);
u32 se_register(u32 slot,u32 pcm,u32 bytes,u32 rate){
 u32 i,sr=lock();
 if(slot<128)file_generation[slot]++;
 for(i=0;i<8;i++)if(positions[i].slot==slot)positions[i].mask=0;
 unlock(sr);return se_native_register(slot,pcm,bytes,rate);
}
u32 se_src_stats[4]; /* accepted, no crossing, unsupported/context, applied windows */
static u32 lock(void){u32 sr;__asm__ volatile("move.w %%sr,%0\n\tmove.w #0x2700,%%sr":"=d"(sr)::"memory");return sr;}
static void unlock(u32 sr){__asm__ volatile("move.w %0,%%sr"::"d"(sr):"memory");}
void se_src_clear(u32 track,u32 mask){
 u32 i,sr=lock();
 for(i=0;i<8;i++)if(i==track||track==8)positions[i].mask&=~mask;
 unlock(sr);
}
static void popup(u32 v,const char *s){F(0x40093ab0)(R(v+0x6c),s);}
static u32 get(u32 v,u32 id){unsigned char flag;return F(0x4003171c)(v,id,&flag);}
/* q <= n <= 64M; long division without a 64-bit runtime dependency. */
u32 se_src_scale(u32 q,u32 n){
 u32 bit,r=0,v=0;if(!n||q>n)return 0;
 for(bit=16384;bit;bit>>=1){
  r=r*2+((30720&bit)?q:0);v*=2;
  while(r>=n){r-=n;v++;}
 }
 return v+(r>=n-r);
}
static u32 matches(const struct Snap *s,const int16_t *p,u32 len){
 u32 d[4];
 if(!s->mask||s->pattern!=PATTERN||s->length!=len||(u16)p[3]!=(s->slot<<8))return 0;
 if(s->provider){
  if(!F(s->provider)(3,d)||d[0]!=s->source||d[1]!=len||d[2]!=s->generation)return 0;
 }else if(s->slot>=128||file_generation[s->slot]!=s->generation||
          R(0x4031a3a0+s->slot*16)!=s->source||R(0x4031a3a8+s->slot*16)!=len)return 0;
 return 1;
}
static u32 mask_for(const struct Snap *s,const int16_t *p){
 u32 mask=s->mask;
 if(p[4]!=s->raw[0])mask&=~3UL;
 if(p[5]!=s->raw[1])mask&=~2UL;
 if(p[6]!=s->raw[2])mask&=~4UL;
 return mask;
}
static u32 pcm_position(s32 value,u32 len){
 if(value<0)value=0;
 if(value>30720)value=30720;
 return (len/30720)*value+((len%30720)*value)/30720;
}
/* Initial [start,end] in source order, even when playback is reversed. */
static void points(const struct Snap *s,const int16_t *p,u32 len,u32 *a,u32 *b,u32 *c){
 u32 mask=matches(s,p,len)?mask_for(s,p):0;
 /* The render's EMAC mode is task-specific. Do not call its conversion
  * routine from the UI task, or change the UI task's EMAC registers. */
 *a=pcm_position(p[4],len);*b=pcm_position((s32)p[4]+p[5],len);
 if(mask&1)*a=s->point[0];
 if(mask&2)*b=s->point[1];
 if(!p[6])*c=*a;
 else if(mask&4)*c=s->point[2];
 else *c=pcm_position((s32)p[6]-1,len);
}
uint64_t se_src_window(const int16_t *p,u32 len,u32 phase,uint64_t native){
 u32 offset=(u32)p-(u32)fw_voice_params,t=offset/106,a,b,tmp,mask,loop;
 const struct Snap *s;
 if(t>=8||offset%106)return native;
 s=&positions[t];
 if(!s->mask||!matches(s,p,len)||R(0x8000edc4+t*94)!=s->source)return native;
 mask=mask_for(s,p);if(!mask)return native;
 a=native>>32;b=(u32)native;
 if((u16)p[1]<0x200){tmp=a;a=b;b=tmp;}
 loop=!phase&&((u16)p[1]>>8==1||(u16)p[1]>>8==2);
 if(loop&&p[6]&&p[6]-1>p[4]+p[5]){tmp=a;a=b;b=tmp;}
 if(loop&&p[6]){if(mask&4)a=s->point[2];}
 else if(mask&1)a=s->point[0];
 if(mask&2)b=s->point[1];
 if(a>b){tmp=a;a=b;b=tmp;}
 /* Native playback widens shorter windows. Never claim an exact marker
  * where that safety floor would move it again. */
 if(b>len||b-a<144)return native;
 se_src_stats[3]++;
 return (u16)p[1]>=0x200?((uint64_t)a<<32)|b:((uint64_t)b<<32)|a;
}
u32 se_src_adjust(u32 v,u32 knob,s32 direction){
 u32 t=F(0x4001d24e)(R(v+116)),mode=F(0x4002b5d4)(v),d[4],provider=0;
 u32 slot,a,b,c,pos,q,lo,hi,i,value,mask,sr;int16_t p[8];struct Snap next;
 if(t>=8||(mode!=0&&mode!=121)||knob<4||knob>6)return 0;
 /* A held trig selects a different parameter-lock context. This gesture
  * edits base markers only; never leak one step's exact offset to others. */
 if((F(0x40093470)(R(v+0x6c))&255)||F(0x400d399c)(2)){
  popup(v,"RELEASE TRIG / TRK");se_src_stats[2]++;return 1;
 }
 for(i=24;i<40;i++)if(F(0x400d399c)(i)){
  popup(v,"RELEASE TRIG / TRK");se_src_stats[2]++;return 1;
 }
 for(i=0;i<8;i++)p[i]=get(v,108+i);
 slot=(u16)p[3]>>8;
 if(mode==121){
  u32 desc=core_machine(121);
  if(desc&&R(desc+32)==API_TAG)provider=R(desc+36);
  /* A 1.1.0 provider has no identity query: do not enable exact playback
   * offsets on an implementation that cannot detect replacement takes. */
  if(!provider||!F(provider)(3,d)||!F(provider)(0,d))goto unavailable;
  slot=131;p[3]=0x8300;
 }else{
  if(!slot||slot>=128)goto unavailable;
  d[0]=R(0x4031a3a0+slot*16);d[1]=R(0x4031a3a8+slot*16);d[2]=file_generation[slot];
 }
 if(!se_pcm_valid(d[0],d[1]))goto unpin;
 F(0x400e8ae8)(&next,&positions[t],sizeof next);
 if(!matches(&next,p,d[1])||next.source!=d[0]||next.generation!=d[2])next.mask=0;
 points(&next,p,d[1],&a,&b,&c);
 if(a>b||b>d[1]||b-a<144)goto unpin;
 pos=knob==4?a:knob==5?b:c;lo=0;hi=d[1]-1;
 if(knob==4)hi=b-144;
 if(knob==5){lo=a+144;hi=d[1];}
 if(knob==6){if(c<b)hi=b-144;else lo=b+144;}
 q=se_snap((const int16_t *)d[0],d[1],pos,direction,lo,hi,4096,knob==5);
 if(!provider&&(file_generation[slot]!=d[2]||R(0x4031a3a0+slot*16)!=d[0]||R(0x4031a3a8+slot*16)!=d[1]))goto unpin;
 if(q==pos){popup(v,"NO CROSSING NEARBY");se_src_stats[1]++;goto done;}
 value=se_src_scale(q,d[1]);
 if(knob==5){if(value<(u16)p[4])goto unpin;value-=(u16)p[4];}
 if(knob==6){value++;if(value>30720)value=30720;}
 mask=next.mask&mask_for(&next,p);
 if(knob==4)mask&=~2UL; /* LEN stays native; its end follows the new STRT. */
 next.pattern=PATTERN;next.source=d[0];next.length=d[1];next.slot=slot;
 next.provider=provider;next.generation=d[2];next.mask=0;
 /* The native method takes a delta, and performs normal kit/engine
  * notification. Passing an absolute LEN would clamp it to its maximum. */
 F(0x400309b0)(v,108+knob,(s32)value-p[knob],0,0);
 for(i=0;i<3;i++)next.raw[i]=get(v,112+i);
 if((u16)next.raw[knob-4]!=value)goto unpin;
 next.point[knob-4]=q;next.mask=mask|(1UL<<(knob-4));
 sr=lock();F(0x400e8ae8)(&positions[t],&next,sizeof next);unlock(sr);
 F(0x400c050c)(v+0x94);F(0x4003a430)(v);F(0x400c9a3a)(v);
 popup(v,"ZERO CROSSING");se_src_stats[0]++;
done:
 if(provider)F(provider)(2,&d[2]);
 return 1;
unpin:
 if(provider)F(provider)(2,&d[2]);
unavailable:
 popup(v,"SNAP UNAVAILABLE");se_src_stats[2]++;return 1;
}
u32 se_src_enc(u32 v,u32 ev){
 u32 slot=F(0x400c040e)(ev),t; s32 delta;
 /* Only turn events, not encoder pushes or reset gestures. */
 if((F(0x400c03e6)(ev,-3)&255)&&slot>=4&&slot<=6){
  delta=(s32)F(0x400c047e)(ev,1,1);
  if(delta&&F(0x400d399c)(1)&&se_src_adjust(v,slot,delta>0?1:-1))return 1;
  t=F(0x4001d24e)(R(v+116));
  if(t<8){u32 sr=lock();positions[t].mask&=slot==4?~3UL:~(1UL<<(slot-4));unlock(sr);}
 }
 if(slot==3&&(F(0x400c03e6)(ev,-3)&255))se_src_clear(F(0x4001d24e)(R(v+116)),7);
 return F(0x4003b548)(v,ev);
}
u32 se_src_enc_iface(u32 v,u32 ev){return se_src_enc(v-4,ev);}
