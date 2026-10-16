#include "euclidean.h"
extern u32 euc_native_key(u32,u32);
u32 euc_key(u32,u32);
static u32 view_table[39],shared_table[5];
u32 euc_view;
static s32 clamp(s32 x,s32 a,s32 b){return x<a?a:x>b?b:x;}
static s8 dial_remainder[8];
static u32 dial_pattern,dial_track,dial_func;
void euc_dial_reset(void){u32 i;for(i=0;i<8;i++)dial_remainder[i]=0;dial_pattern=0;}
/* Four panel counts per whole value. Keep fractional movement between UI
 * events, without acceleration, and discard it on reversal/context changes. */
s32 euc_dial_delta(u32 pattern,u32 track,u32 slot,s32 delta,u32 func){
 s32 sum,steps;
 if(!pattern||track>=16||slot>=8)return 0;
 if(pattern!=dial_pattern||track!=dial_track||func!=dial_func){
  euc_dial_reset();dial_pattern=pattern;dial_track=track;dial_func=func;
 }
 if(!delta)return 0;
 sum=dial_remainder[slot];
 if((sum<0&&delta>0)||(sum>0&&delta<0))sum=0;
 /* Native panel flushes are bounded to +/-30 counts. */
 sum+=clamp(delta,-30,30);steps=sum/4;
 dial_remainder[slot]=sum-steps*4;
 return steps;
}
static u32 current_pattern(void){u32 p=FW(FW_PROJECT)();p=FW(0x40015786)(p);return p?R32(p+0x10):0;}
static u32 current_track(void){u32 p=FW(FW_PROJECT)();return FW(0x4001d24e)(FW(0x40014d86)(p));}
static void dispose(u32 block){if(euc_view==block+16)euc_view=0;FW(FW_VIEW_DTOR)(block+16);}
static void destroy(u32 block){FW(FW_FREE)(block);}
static u32 nothing(void){return 0;}
static const char *const labels[]={"PL1","PL2","LEN","EUC","RO1","RO2","TRO","OP"};
static const char *const names[]={"Pulse Gen 1","Pulse Gen 2","Track Length","Euclidean Mode",
 "Rotation Gen 1","Rotation Gen 2","Track Rotation","Bool Operator"};
static const char *const ops[]={"OR","XOR","AND","SUB"};
static void text(u32 canvas,s32 x,s32 y,const char *s){FW(FW_TEXT)(canvas,FW_FONT_CELL,x,y,2,"%s",s);}
static void number(u32 canvas,s32 x,s32 y,s32 n){FW(FW_TEXT)(canvas,FW_FONT_CELL,x,y,2,"%d",n);}
static void line(u32 canvas,s32 x,s32 y,s32 end,s32 top){FW(FW_RECT)(canvas,x,y,end,top,1);}
/* Original glyphs for the controls absent from DT I. All rendering uses its
 * Bitmap API; the switch, disabled cell, fonts and surrounding
 * parameter-page chrome are the running firmware's own components. */
static void pulse(u32 canvas,s32 x){
 line(canvas,x-4,44,x-2,44);line(canvas,x-2,44,x-2,49);
 line(canvas,x-2,49,x,49);line(canvas,x,44,x,49);line(canvas,x,44,x+4,44);
}
static void length_gfx(u32 canvas,s32 x){
 s32 i;for(i=-8;i<=8;i+=2)line(canvas,x+i,47,x+i,47);
 line(canvas,x-8,46,x-8,48);line(canvas,x+8,46,x+8,48);
}
static void rotation_gfx(u32 canvas,s32 x,s32 n,s32 length,u32 track){
 s32 i,p=x+n*8/(length>1?length-1:1);
 line(canvas,x-8,9,x+8,9);
 for(i=-8;i<=8;i+=2)line(canvas,x+i,9,x+i,10);
 if(track&&n==0){for(i=13;i<=19;i+=2)line(canvas,p,i,p,i);}
 else {line(canvas,p-1,17,p+1,17);line(canvas,p-1,16,p+1,16);line(canvas,p,13,p,15);}
}
static void operator_gfx(u32 canvas,s32 x,u32 op){
 /* Standard logic-gate outlines, with a second arc for XOR and an input
  * inversion bubble for SUB (A AND NOT B). Coordinates are cell-local. */
 static const u16 gates[4][9]={
  {0x7c0,0x630,0x418,0x60e,0x307,0x60e,0x418,0x630,0x7c0},
  {0x17c0,0x2630,0x2418,0x260e,0x3307,0x260e,0x2418,0x2630,0x17c0},
  {0x7e0,0x430,0x418,0x40c,0x407,0x40c,0x418,0x430,0x7e0},
  {0x7e0,0x430,0x418,0x40c,0x407,0x240c,0x5418,0x2430,0x7e0}};
 u32 row,bit;for(row=0;row<9;row++)for(bit=0;bit<15;bit++)
  if(gates[op][row]&(1u<<bit))line(canvas,x+7-bit,22-row,x+7-bit,22-row);
 line(canvas,x-8,20,x-4,20);if(op!=3)line(canvas,x-8,16,x-4,16);
}
static void paint(u32 view,u32 canvas){
 u32 pattern=current_pattern(),track=current_track(),i,sr;Euc value={0},*s;s32 length;
 (void)view;
 if(!pattern||track>=16)return;
 if(pattern!=dial_pattern||track!=dial_track)euc_dial_reset();
 length=euc_length(pattern,track);
 sr=euc_lock();s=euc_settings(pattern,0);if(s)value=s[track];euc_unlock(sr);
 /* The compositor has already drawn the native header, track badge and
  * level strip. Replace only the eight cells, on its 26-by-27-pixel grid. */
 FW(FW_RECT)(canvas,19,0,127,53,0);
 FW(FW_RECT)(canvas,0,0,18,26,0);
 if(track<8){
  u32 manager=FW(0x40014d86)(FW(FW_PROJECT)()),level=FW(0x4001fd74)(manager,track);
  FW(FW_PARAM_GFX)(0,10,level,0,0,canvas,-2,7);text(canvas,7,0,"LEV");
 }
 for(i=0;i<8;i++)text(canvas,33+(i%4)*26,i<4?27:0,labels[i]);
 pulse(canvas,33);pulse(canvas,59);
 number(canvas,33,35,value.p1);number(canvas,59,35,value.p2);
 if(*(u8 *)(pattern+0x1ec59)==1){length_gfx(canvas,85);number(canvas,85,35,length);}
 else FW(FW_BLIT)(canvas,FW_DISABLED_CELL,77,34,0);
 FW(FW_PARAM_GFX)(0,23,(u32)value.enabled<<8,0,0,canvas,102,34);
 for(i=0;i<3;i++){
  s32 n=i==0?value.r1:(i==1?value.r2:value.rotation),x=33+i*26;
  rotation_gfx(canvas,x,n,length,i==2);
  if(FW(FW_HELD)(44+i)&255){FW(FW_RECT)(canvas,x-12,0,x+12,6,0);number(canvas,x,0,n);}
 }
 operator_gfx(canvas,111,value.op);text(canvas,111,7,ops[value.op]);
}
static void edit(u32 view,u32 slot,s32 delta,u32 func){
 u32 pattern=current_pattern(),track=current_track(),sr;Euc value={0},*s;s32 length;
 if(!pattern||track>=16||slot>=8||!delta)return;
 length=euc_length(pattern,track);sr=euc_lock();s=euc_settings(pattern,0);if(s)value=s[track];euc_unlock(sr);
 switch(slot){
 case 0:value.p1=clamp(value.p1+delta,0,length);break;
 case 1:value.p2=clamp(value.p2+delta,0,length);break;
 case 2:if(*(u8 *)(pattern+0x1ec59)!=1){
  FW(FW_PARAM_POPUP)(R32(R32(view+0x50)+0x6c),"LEN: PER TRACK ONLY");return;}
  sr=euc_lock();*(u16 *)(pattern+track*TRACK_SIZE+0x388)=clamp(length+delta,2,64);
  euc_unlock(sr);break;
 case 3:if(value.enabled&&delta<0&&func){
  if(!euc_commit(pattern,track))FW(FW_PARAM_POPUP)(R32(R32(view+0x50)+0x6c),"CONVERT: TRY AGAIN");
  FW(FW_INVALIDATE)(view);return;}
  value.enabled=delta>0;break;
 case 4:value.r1=clamp(value.r1+delta,1-length,length-1);break;
 case 5:value.r2=clamp(value.r2+delta,1-length,length-1);break;
 case 6:value.rotation=clamp(value.rotation+delta,1-length,length-1);break;
 case 7:value.op=clamp(value.op+delta,0,3);break;
 }
 euc_set(pattern,track,&value);FW(FW_INVALIDATE)(view);
 if(slot==3||slot==7)FW(FW_PARAM_POPUP)(R32(R32(view+0x50)+0x6c),"%s=%s",names[slot],slot==3?(value.enabled?"ON":"OFF"):ops[value.op]);
 else {s32 v=slot==0?value.p1:slot==1?value.p2:slot==2?euc_length(pattern,track):slot==4?value.r1:slot==5?value.r2:value.rotation;
  FW(FW_PARAM_POPUP)(R32(R32(view+0x50)+0x6c),"%s=%d",names[slot],v);}
}
static u32 encoder(u32 interface,u32 ev){
 u32 slot=FW(FW_ENCODER_INDEX)(ev),func=FW(FW_HELD)(1);s32 delta=(s32)FW(FW_ENCODER_DELTA)(ev,1,1);
 if(slot<8)edit(interface-4,slot,euc_dial_delta(current_pattern(),current_track(),slot,delta,func),func);
 else if(R32(ev+12)==9&&current_track()<8){
  /* LEVEL has no A-H index. Use the native level edit path, including
   * FUNC handling and project notifications, even if opened from MIDI. */
  u8 changed=0;u32 parent=R32(interface-4+0x50);
  FW(0x400309b0)(parent,10,delta*256,func,&changed);
  FW(FW_INVALIDATE)(interface-4);
 }else return 0;
 return 1;
}
static u32 key(u32 view,u32 ev){
 u32 code=R32(ev+12),flags=R32(ev+16),pattern=current_pattern(),track=current_track();Euc *s;
 if((flags&9)==1){
  euc_dial_reset();
  if(code==13){FW(FW_VIEW_CLOSE)(view);return 1;}
  if(code==43){u32 enabled=0,sr=euc_lock();s=euc_settings(pattern,0);if(s)enabled=s[track].enabled;euc_unlock(sr);edit(view,3,enabled?-1:1,flags&2);return 1;}
  /* TRIG, SRC, FLTR, AMP and LFO, and the FUNC shortcuts that open
   * something (TRIG Quantize, FLTR Delay, AMP Reverb, LFO Compressor), leave
   * Euclidean as from any parameter page: close the modal, then give the
   * same press to the parameter page underneath. FUNC + SRC has no native
   * action and stays here. A held FUNC + AMP reopens Euclidean via euc_key. */
  if(code>=19&&code<=23&&!(code==20&&(flags&2))){u32 parent=R32(view+0x50);FW(FW_VIEW_CLOSE)(view);return euc_key(parent,ev);}
 }
 /* Transport and pattern selection remain handled by the application. */
 return FW(FW_VIEW_KEY)(view,ev);
}
u32 euc_open(u32 parent){
 u32 *block,view,shared[2];
 if(euc_view)return 1;
 euc_dial_reset();
 if(!view_table[0]){
  euc_copy(view_table,(void *)(FW_VIEW_TABLE-8),sizeof(view_table));
  view_table[2+2]=(u32)key;view_table[2+4]=(u32)paint;
  view_table[(FW_ENCODER_TABLE-FW_VIEW_TABLE+8)/4+2]=(u32)encoder;
  shared_table[0]=(u32)nothing;shared_table[1]=(u32)destroy;shared_table[2]=(u32)dispose;shared_table[3]=(u32)destroy;shared_table[4]=(u32)nothing;
 }
 block=(u32 *)FW(FW_ALLOC)(0x70);if(!block)return 0;
 block[0]=(u32)shared_table;block[1]=1;block[2]=1;block[3]=(u32)(block+4);view=(u32)(block+4);
 FW(FW_VIEW_CTOR)(view,"Euclidean");
 /* Overlay only the parameter cells: keep the native header, track badge
  * and level control in the compositor's visible view stack. */
 *(u8 *)(view+0x16)=0;
 R32(view)=(u32)(view_table+2);R32(view+4)=(u32)view_table+(FW_ENCODER_TABLE-FW_VIEW_TABLE+8);
 R32(view+0x4c)=current_track();R32(view+0x50)=parent;euc_view=view;
 shared[0]=view;shared[1]=(u32)block;FW(FW_SHOW_MODAL)(parent,shared,0);FW(FW_SHARED_RELEASE)(&shared[1]);
 FW(FW_PARAM_POPUP)(R32(parent+0x6c),"Euclidean");return 1;
}
u32 euc_key(u32 view,u32 ev){
 u32 result;
 /* Hold FUNC+AMP; a short press retains DT I's existing reverb shortcut. */
 if(R32(ev+12)==22&&(R32(ev+16)&11)==11)return euc_open(view);
 result=euc_native_key(view,ev);
 /* AMP release refreshes the native page title (Reverb underneath this
  * modal). Keep its release bookkeeping, then name the visible page.
  * Use the normal popup so encoder values and its timeout still work. */
 if(R32(ev+12)==22&&!(R32(ev+16)&1)&&euc_view&&R32(euc_view+0x50)==view)
  FW(FW_PARAM_POPUP)(R32(view+0x6c),"Euclidean");
 return result;
}
