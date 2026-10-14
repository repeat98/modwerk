/* SPDX-License-Identifier: GPL-2.0-or-later */
/* OS 1.53. Extend the native recorder; copies of loaded samples use its
 * normal trim/preview/save workflow. No custom sound/project format. */
#include <stdint.h>
#include "digitakt-mk1/core3.h"
#include "core21.h" /* Core 2.1 exports no firmware locations */
#include "audio.h"
typedef uint32_t u32;typedef int32_t s32;typedef uint16_t u16;typedef uint8_t u8;
#define R(a) (*(volatile u32 *)(a))
#define F(a) ((u32 (*)())(a))
#define PCM ((int16_t *)0x4237ef90)
#define LOW ((u8 *)0x421fc410)
#define COUNT R(0x4199f104)
#define STATE R(0x4199f114)
#define CAP 1584000UL
#define START(v) R((v)+0x598)
#define END(v) R((v)+0x798)
#define OFFSET(v) R((v)+0x990)
#define TAIL(v) R((v)+0x994)
#define API_TAG 0x52414d31UL
extern u32 se_native_ctor(u32);
extern uint64_t se_native_window(const int16_t *,u32,u32);
extern uint64_t se_src_window(const int16_t *,u32,u32,uint64_t);
extern void se_src_clear(u32,u32);
volatile u32 se_preview_pad,se_preview_base,se_edit_busy;
u32 se_view,se_snap_on=1,se_xfade_ms,se_undo_n,se_undo_a,se_undo_b,se_undo_offset,se_undo_tail;
u32 se_stats[8]; /* snaps, applies, undo, imports, RAM apply, no-memory, busy, previews */
static u32 se_provider,se_token;
static int16_t *se_backup;
static u8 *se_backup_low;
static const char *se_message;
static u32 se_message_ticks;
static u32 se_shared[5];

static void message(const char *s){se_message=s;se_message_ticks=90;}
static void invalidate(u32 v){F(0x400c9a3a)(v);}
static void stop(u32 v){F(0x400a75aa)(v);}
static void release_ram(void){
 if(se_provider){u32 token=se_token;F(se_provider)(2,&token);se_provider=0;}
}
static void clear_edit(void){se_undo_n=0;se_xfade_ms=0;se_message=0;}
u32 se_ctor(u32 view){
 release_ram();clear_edit();se_view=view;
 return se_native_ctor(view);
}
static void refresh(u32 v){
 /* Native worker jobs read the current region; their generation tags
  * reject superseded zoom requests. Overview is rebuilt after PCM edits. */
 F(0x400a80dc)(v);
 invalidate(v);
}
void se_tick(u32 ctrl){
 if(STATE!=4){se_undo_n=0;se_xfade_ms=0;release_ram();}
 if(se_message_ticks){se_message_ticks--;*(u8 *)(ctrl+0x20)=1;if(!se_message_ticks)se_message=0;}
}
/* This hook applies only to the recorder's private audition slot, with its
 * current descriptor. File samples and other machines retain native windows. */
uint64_t se_window(const int16_t *p,u32 len,u32 phase){
 u32 d=0x4031a3a0+130*16;
 if((u16)p[3]==0x8200 && R(d)==se_preview_base && se_preview_base){
  u32 a=se_preview_pad;
  if(se_edit_busy||a>=len)return 0;
  return (u16)p[1]>=0x200?((uint64_t)a<<32)|len:((uint64_t)len<<32)|a;
 }
 return se_src_window(p,len,phase,se_native_window(p,len,phase));
}
static u32 legal(u32 v){return STATE==4&&COUNT>=144&&COUNT<=CAP&&
 OFFSET(v)<=COUNT&&TAIL(v)<=COUNT-OFFSET(v)&&START(v)<END(v)&&
 END(v)<=COUNT-OFFSET(v)-TAIL(v);}
static void snap_marker(u32 v,u32 end,s32 dir){
 u32 a=OFFSET(v),p=a+(end?END(v):START(v)),lo=end?a+START(v)+144:a;
 u32 hi=end?COUNT-TAIL(v):a+END(v)-144,q;
 q=se_snap(PCM,COUNT,p,dir,lo,hi,4096,end);
 if(q!=p){if(end)F(0x400a7d42)(v,(s32)(q-p));else F(0x400a7c4a)(v,(s32)(q-p));se_stats[0]++;}
 else if(dir)message("NO CROSSING NEARBY");
}
u32 se_enc(u32 view,u32 ev){
 u32 slot=F(0x400c040e)(ev),result,func=F(0x400d399c)(1);s32 delta;
 if(!legal(view))return F(0x400a7e38)(view,ev);
 delta=(s32)F(0x400c047e)(ev,1,1);
 if(slot==4&&func&&delta){se_snap_on=delta>0;message(se_snap_on?"ZERO SNAP ON":"ZERO SNAP OFF");invalidate(view);return 1;}
 if(slot==5&&func&&delta){s32 n=(s32)se_xfade_ms+delta;if(n<0)n=0;if(n>200)n=200;
  se_xfade_ms=n;message("FUNC+UP: APPLY XFADE");invalidate(view);return 1;}
 if((slot==0||slot==2)&&func&&delta){
  stop(view);snap_marker(view,slot==2,delta>0?1:-1);invalidate(view);return 1;
 }
 result=F(0x400a7e38)(view,ev);
 if(se_snap_on&&(slot==0||slot==2)&&delta)snap_marker(view,slot==2,0);
 return result;
}
u32 se_enc_iface(u32 interface,u32 ev){return se_enc(interface-4,ev);}
u32 se_apply(u32 v){
 u32 a,b,n,i;
 if(!legal(v)||!se_xfade_ms)return 0;
 if(se_undo_n){message("UNDO BEFORE NEXT XFADE");return 0;}
 a=OFFSET(v)+START(v);b=OFFSET(v)+END(v);n=se_xfade_ms*48;
 if(n>(b-a)/2)n=(b-a)/2;
 if(n<2||b-a-n<144)return 0;
 if(!se_backup){se_backup=(int16_t *)fw_op_new(9600*3);
  if(!se_backup){se_stats[5]++;message("NOT ENOUGH MEMORY");return 0;}
  se_backup_low=(u8 *)(se_backup+9600);}
 stop(v);se_edit_busy=1;
 for(i=0;i<n;i++){se_backup[i]=PCM[b-n+i];se_backup_low[i]=LOW[b-n+i];}
 se_undo_a=a;se_undo_b=b;se_undo_offset=OFFSET(v);se_undo_tail=TAIL(v);
 se_crossfade(PCM,a,b,n);for(i=0;i<n;i++)LOW[b-n+i]=0;
 se_undo_n=n;
 /* Use native trim metadata: untouched head/tail can still be untrimmed. */
 OFFSET(v)=a+n;TAIL(v)=COUNT-b;se_edit_busy=0;
 refresh(v);se_xfade_ms=0;se_stats[1]++;message("XFADE APPLIED / DN UNDO");return 1;
}
u32 se_undo(u32 v){
 u32 i,n=se_undo_n;
 if(!legal(v)||!n)return 0;
 stop(v);se_edit_busy=1;
 for(i=0;i<n;i++){PCM[se_undo_b-n+i]=se_backup[i];LOW[se_undo_b-n+i]=se_backup_low[i];}
 OFFSET(v)=se_undo_offset;TAIL(v)=se_undo_tail;se_edit_busy=0;
 refresh(v);START(v)=se_undo_a-OFFSET(v);END(v)=se_undo_b-OFFSET(v);
 F(0x400a7c4a)(v,0);F(0x400a7d42)(v,0);
 se_undo_n=0;se_stats[2]++;message("XFADE UNDONE");return 1;
}
u32 se_rec_key(u32 v,u32 ev){
 u32 key=R(ev+12),flags=R(ev+16);
 /* Close on SRC release so neither edge reaches the underlying page and
  * toggles it back to the waveform. Modified SRC retains native behavior. */
 if(key==20&&!(flags&2)){
  if((flags&25)==16){stop(v);F(0x400c9ade)(v);}
  return 1;
 }
 if(legal(v)&&(flags&11)==3){
  if(key==14){se_apply(v);invalidate(v);return 1;}
  if(key==15){se_undo(v);invalidate(v);return 1;}
  if(key==17&&se_provider){
   u32 args[3]={(u32)(PCM+OFFSET(v)+START(v)),END(v)-START(v),se_token};
   stop(v);
   if(F(se_provider)(1,args)){se_provider=0;se_stats[4]++;message("APPLIED TO RAM-P1");}
   else {release_ram();message("RAM TAKE CHANGED");}
   invalidate(v);return 1;
  }
 }
 if((key==14||key==15||key==17)&&(flags&2))return 1;
 return F(0x400a9784)(v,ev);
}
void se_paint(u32 v,u32 bmp){
 F(0x400a8c94)(v,bmp);
 if(!legal(v))return;
 fw_fillrect((void *)bmp,0,16,127,24,0);
 if(se_message)fw_textf((void *)bmp,fw_font5,0,17,-1,"%s",se_message);
 else fw_textf((void *)bmp,fw_font5,0,17,-1,"Fn E ZC:%s F XF:%dms",se_snap_on?"ON":"OFF",se_xfade_ms);
}
static u32 nothing(void){return 0;}
static void destroy(u32 p){F(0x400d4332)(p);}
static void dispose(u32 p){
 if(se_view==p+16){release_ram();se_view=0;se_undo_n=0;}
 F(0x40161196)(p+16);
}
u32 se_import(u32 parent){
 u32 track=F(0x4001d24e)(R(parent+116)),mode=F(0x4002b5d4)(parent);
 u32 source=0,len=0,provider=0,token=0,slot,i,*block,view,shared[2],data[4];
 if(STATE){F(0x40093ab0)(R(parent+0x6c),"CLEAR RECORDER FIRST");return 0;}
 if(track>=8||!fw_kit)return 0;
 block=(u32 *)fw_op_new(0x9bc);if(!block)return 0;
 if(mode==121){
  u32 desc=core_machine(121);
  if(desc&&R(desc+32)==API_TAG)provider=R(desc+36);
  if(!provider||!F(provider)(0,data)){destroy((u32)block);F(0x40093ab0)(R(parent+0x6c),"RAM EDIT UNAVAILABLE");return 0;}
  source=data[0];len=data[1];token=data[2];
 }else if(mode==0){
  slot=*(u16 *)(FW_SOUND(fw_kit,track)+0x3c)>>8;
  if(slot&&slot<128){source=R(0x4031a3a0+slot*16);len=R(0x4031a3a8+slot*16);
   if(*(u16 *)(0x4031a3a4+slot*16)!=48000)len=0;}
 }
 if(!se_pcm_valid(source,len)||len>CAP){
  if(provider)F(provider)(2,&token);
  destroy((u32)block);
  F(0x40093ab0)(R(parent+0x6c),"48K SAMPLE / MAX 33S");return 0;
 }
 /* A UI-task copy; interrupts remain enabled. RAM's provider pins the take
  * against replacement. This task owns sample selection during the copy. */
 F(0x400e8ae8)(PCM,source,len*2);F(0x400e8514)(LOW,len);
 COUNT=len;STATE=4;
 if(!se_shared[0]){se_shared[0]=(u32)nothing;se_shared[1]=(u32)destroy;
  se_shared[2]=(u32)dispose;se_shared[3]=(u32)destroy;se_shared[4]=(u32)nothing;}
 for(i=0;i<0x9bc/4;i++)block[i]=0;
 block[0]=(u32)se_shared;block[1]=1;block[2]=1;block[3]=(u32)(block+4);view=(u32)(block+4);
 se_ctor(view);se_provider=provider;se_token=token;
 shared[0]=view;shared[1]=(u32)block;
 F(0x400c9b3e)(parent,shared,0);F(0x40137944)(&shared[1]);
 se_stats[3]++;message(provider?"FUNC+RIGHT: APPLY RAM":"EDIT COPY / YES: SAVE");return 1;
}
u32 se_src_key(u32 view,u32 ev){
 u32 key=R(ev+12),flags=R(ev+16),track=F(0x4001d24e)(R(view+116));
 if(flags&1){
  if(key==13&&(flags&2))se_src_clear(8,7); /* reload pattern */
  else if((key==12||key==13)&&F(0x400d399c)(20))se_src_clear(track,7);
  else if(key>=44&&key<=46&&(flags&2))se_src_clear(track,key==44?3:1UL<<(key-44));
 }
 return F(0x4003b272)(view,ev);
}
