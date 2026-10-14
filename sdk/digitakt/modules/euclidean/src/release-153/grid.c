/* UI-only adapters. Native Track getters and data-copy algorithms keep their
 * original indices; only held-trig consumers and LED queries are remapped. */
#include "euclidean.h"
extern u32 euc_native_grid(u32,u32),euc_native_selected(u32,u32,u32);
extern s32 euc_native_first(u32);
static u32 active(u32 *pattern,u32 *track){
 u32 project=FW(FW_PROJECT)(),obj=FW(0x40015786)(project),sr,on=0;Euc *s;
 *pattern=obj?R32(obj+0x10):0;*track=FW(0x4001d24e)(FW(0x40014d86)(project));
 if(!*pattern||*track>=16)return 0;
 sr=euc_lock();s=euc_settings(*pattern,0);if(s)on=s[*track].enabled;euc_unlock(sr);return on;
}
static u32 held(u32 ui,u32 step){return (R32(ui+(step<32?0x15c:0x158))>>(step%32))&1;}
u32 euc_selected(u32 ui,u32 callback,u32 unlimited){
 u32 pattern,track,step,result=0;u8 stop=0;
 if(!active(&pattern,&track))return euc_native_selected(ui,callback,unlimited);
 if(!R32(callback+8))return 0;
 for(step=0;step<(u32)euc_length(pattern,track);step++)if(held(ui,step)){
  s32 source=euc_step(pattern,track,step);
  if(source>=0){result=FW(R32(callback+12))(callback,source,&stop);if(stop)break;}
 }
 return result;
}
s32 euc_first(u32 ui){
 u32 pattern,track,step;
 if(!active(&pattern,&track))return euc_native_first(ui);
 for(step=0;step<(u32)euc_length(pattern,track);step++)if(held(ui,step)){
  s32 source=euc_step(pattern,track,step);if(source>=0)return source;
 }
 return -1;
}
u32 euc_grid(u32 view,u32 ev){
 u32 code=R32(ev+12),flags=R32(ev+16),pattern,track,ui=R32(view+0x78),page,step;
 if(code>=24&&code<40&&(FW(FW_GRID_REC)(ui)&255)&&!FW(FW_HELD)(2)&&!FW(FW_HELD)(3)&&active(&pattern,&track)){
  page=FW(0x4001d422)(R32(view+0x80));step=page*16+code-24;
  if(step<64){
   if(!(flags&1))FW(FW_SET_HELD)(ui,step,0);
   else if((flags&9)==1&&euc_step(pattern,track,step)>=0)FW(FW_SET_HELD)(ui,step,1);
   FW(FW_INVALIDATE)(view);
  }
  /* A generated hit can be held for normal parameter locking. Blank
   * positions cannot create unrelated ordinary trigs while EUC is on. */
  return 1;
 }
 return euc_native_grid(view,ev);
}
static s32 display_step(u32 object,s32 step,u32 *enabled){
 u32 data=FW(R32(R32(object)+0x28))(object),track=R32(object+0x38),pattern,sr;Euc *s;
 *enabled=0;if(!data||track>=16)return step;
 pattern=data-track*TRACK_SIZE;
 sr=euc_lock();s=euc_settings(pattern,0);if(s)*enabled=s[track].enabled;euc_unlock(sr);
 return *enabled?euc_step(pattern,track,step):step;
}
u32 euc_led_note(u32 object,s32 step){u32 on;s32 source=display_step(object,step,&on);return on?(source>=0):FW(0x400240ea)(object,step);}
u32 euc_led_lock(u32 object,s32 step){u32 on;s32 source=display_step(object,step,&on);return on?(source>=0&&(FW(0x40024146)(object,source)&255)):FW(0x40024146)(object,step);}
