/* Original DT I adaptation of the observed DT II integer generator. */
#include "euclidean.h"
Euc euc_patterns[128][16];
struct Temp {u32 address,kind; Euc settings[16];} euc_temp[64];
u32 euc_stats[16];
struct Cache {u32 pattern,length; Euc settings; s8 map[64];} euc_cache[32];
extern u32 euc_native_audio(u32,u32,u32,s32,u32,u32,u32);
extern u32 euc_native_midi(u32,u32,u32,s32,u32,u32,u32);
extern u32 euc_native_save(u32,u32,u32),euc_native_load(u32,u32,u32);
extern u32 euc_native_copy(u32,u32,u32),euc_native_clear(u32,u32);
extern u32 euc_native_track_mirror(u32);
extern u32 free_hook(u32);

u32 euc_lock(void) {
 u32 sr;__asm__ volatile("move.w %%sr,%0\n\tmove.w #0x2700,%%sr":"=d"(sr)::"memory");return sr;
}
void euc_unlock(u32 sr) {__asm__ volatile("move.w %0,%%sr"::"d"(sr):"memory");}
void euc_copy(void *dst,const void *src,u32 n){u8 *d=dst;const u8 *s=src;while(n--)*d++=*s++;}
void euc_zero(void *dst,u32 n){u8 *d=dst;while(n--)*d++=0;}
/* GCC emits these even with -ffreestanding for aggregate assignments. */
void *memcpy(void *dst,const void *src,u32 n){euc_copy(dst,src,n);return dst;}
void *memset(void *dst,int value,u32 n){u8 *d=dst;while(n--)*d++=value;return dst;}
static s32 clamp(s32 x,s32 a,s32 b){return x<a?a:x>b?b:x;}
static s32 index_of(u32 pattern){u32 n=pattern-FW_PATTERN_BASE;return n<128*PATTERN_SIZE&&!(n%PATTERN_SIZE)?(s32)(n/PATTERN_SIZE):-1;}
static Euc *temporary(u32 address,u32 kind,u32 create) {
 u32 i;struct Temp *free=0;
 for(i=0;i<64;i++){
  if(euc_temp[i].address==address&&euc_temp[i].kind==kind)return euc_temp[i].settings;
  if(!euc_temp[i].address&&!free)free=&euc_temp[i];
 }
 if(create&&free&&address){free->kind=kind;euc_zero(free->settings,112);free->address=address;return free->settings;}
 if(create)euc_stats[7]++;
 return 0;
}
Euc *euc_settings(u32 pattern,u32 create){s32 n=index_of(pattern);return n>=0?euc_patterns[n]:temporary(pattern,1,create);}
static Euc *track_settings(u32 address,u32 create){
 u32 n=address-FW_PATTERN_BASE,i,t;Euc *s;
 if(n<128*PATTERN_SIZE){t=n%PATTERN_SIZE;if(t<16*TRACK_SIZE&&!(t%TRACK_SIZE))return &euc_patterns[n/PATTERN_SIZE][t/TRACK_SIZE];}
 for(i=0;i<64;i++)if(euc_temp[i].address&&euc_temp[i].kind==1){
  t=address-euc_temp[i].address;if(t<16*TRACK_SIZE&&!(t%TRACK_SIZE))return &euc_temp[i].settings[t/TRACK_SIZE];
 }
 s=temporary(address,2,create);return s;
}
s32 euc_length(u32 pattern,u32 track){
 s32 n=*(short *)(pattern+(*(u8 *)(pattern+0x1ec59)==1?track*TRACK_SIZE+0x388:0x1ec54));
 return clamp(n,1,64);
}
static u32 pulse(s32 step,s32 length,s32 count,s32 rotate){s32 x=((step-rotate)*count)%length;return (x<0?x+length:x)<count;}
/* Caller holds the interrupt lock while a shared cache is inspected/rebuilt. */
static s8 *map(u32 pattern,u32 track,const Euc *s) {
 u32 slot=track,i;struct Cache *c=&euc_cache[slot];s32 length=euc_length(pattern,track),ordinal=0;
 if(c->pattern&&c->pattern!=pattern){slot+=16;c=&euc_cache[slot];}
 if(c->pattern==pattern&&c->length==(u32)length){
  for(i=0;i<sizeof(Euc)&&((u8 *)&c->settings)[i]==((const u8 *)s)[i];i++);
  if(i==sizeof(Euc))return c->map;
 }
 c->pattern=pattern;c->length=length;c->settings=*s;
 for(i=0;i<64;i++){
  u32 hit=0;
  if(i<(u32)length){
   s32 r=clamp(s->rotation,1-length,length-1);
   u32 a=pulse(i,length,clamp(s->p1,0,length),clamp(s->r1,1-length,length-1)+r);
   u32 b=pulse(i,length,clamp(s->p2,0,length),clamp(s->r2,1-length,length-1)+r);
   hit=s->op==0?a|b:s->op==1?a^b:s->op==2?a&b:a&!b;
  }
  c->map[i]=hit?ordinal++:-1;
 }
 euc_stats[0]++;return c->map;
}
s32 euc_step(u32 pattern,u32 track,s32 step) {
 Euc *s;u32 sr;s32 result=step;
 if(!pattern||track>=16||step<0||step>=64)return step;
 sr=euc_lock();s=euc_settings(pattern,0);
 if(s&&s[track].enabled)result=map(pattern,track,&s[track])[step];
 euc_unlock(sr);return result;
}
void euc_notify(u32 pattern,u32 track) {
 u32 project,obj;
 if(index_of(pattern)<0)return;
 project=FW(FW_PROJECT)();obj=FW(0x40015786)(project);
 if(obj&&R32(obj+0x10)==pattern){
  FW(R32(R32(obj)+0x10))(obj,0);
  /* Pattern::changed refreshes child mirrors individually. The extension
   * spans the whole record, so also queue Pattern::updateMirror explicitly. */
  FW(0x4001300e)(obj,R32(obj+0x20));
 }
 if(R32(FW_CURRENT_PATTERN)==pattern)FW(0x4006fb82)(track);
}
u32 euc_set(u32 pattern,u32 track,const Euc *value){
 u32 sr;Euc *s;
 if(!pattern||track>=16||!value||value->enabled>1||value->p1>64||value->p2>64||
    value->r1< -63||value->r1>63||value->r2< -63||value->r2>63||
    value->rotation< -63||value->rotation>63||value->op>3)return 0;
 sr=euc_lock();s=euc_settings(pattern,1);if(s)s[track]=*value;euc_unlock(sr);
 if(!s)return 0;
 euc_stats[1]++;euc_notify(pattern,track);return 1;
}
static u32 event(u32 midi,u32 track,u32 pattern,u32 kit,s32 step,u32 buffer,u32 timing){
 u32 force=0,sr;Euc *s;
 if(track<16&&pattern&&step>=0&&step<64&&(!buffer||buffer==FW_EVENT_CACHE+track*0x4c)){
  sr=euc_lock();s=euc_settings(pattern,0);
  if(s&&s[track].enabled){step=map(pattern,track,&s[track])[step];force=1;}
  euc_unlock(sr);if(step<0){euc_stats[3]++;return 0;}if(force)euc_stats[2]++;
 }
 return midi?euc_native_midi(track,pattern,kit,step,buffer,timing,force):euc_native_audio(track,pattern,kit,step,buffer,timing,force);
}
u32 euc_audio(u32 t,u32 p,u32 k,s32 s,u32 e,u32 m){return event(0,t,p,k,s,e,m);}
u32 euc_midi(u32 t,u32 p,u32 k,s32 s,u32 e,u32 m){return event(1,t,p,k,s,e,m);}

/* Versioned 88-byte extension in measured, native-ignored record padding. */
static u32 crc(const u8 *p,u32 n){u32 c=~0UL,i;while(n--){c^=*p++;for(i=0;i<8;i++)c=(c>>1)^(0xedb88320UL&-(c&1));}return ~c;}
static u32 offset(u32 i){return i<16?4+i*TRACK_SIZE+0x38e:0x61b8+i-16;}
static void putbits(u8 *p,u32 *bit,u32 value,u32 count){while(count--){u32 b=(*bit)++;p[b/8]|=((value>>count)&1)<<(7-b%8);}}
static u32 getbits(const u8 *p,u32 *bit,u32 count){u32 v=0;while(count--){u32 b=(*bit)++;v=(v<<1)|((p[b/8]>>(7-b%8))&1);}return v;}
void euc_pack(u32 dest,const Euc *settings){
 u8 bytes[88];u32 i,bit=64,c;euc_zero(bytes,88);
 bytes[0]='E';bytes[1]='U';bytes[2]='C';bytes[3]='1';bytes[4]=1;bytes[5]=76;
 for(i=0;i<16;i++){
  Euc empty={0};const Euc *s=settings?&settings[i]:&empty;
  putbits(bytes,&bit,s->p1,7);putbits(bytes,&bit,s->p2,7);
  putbits(bytes,&bit,s->r1+63,7);putbits(bytes,&bit,s->r2+63,7);putbits(bytes,&bit,s->rotation+63,7);
  putbits(bytes,&bit,s->enabled,1);putbits(bytes,&bit,s->op,2);
 }
 c=crc(bytes,84);for(i=0;i<4;i++)bytes[84+i]=c>>(24-i*8);
 for(i=0;i<88;i++)*(u8 *)(dest+offset(i))=bytes[i];
}
u32 euc_unpack(Euc *settings,u32 src){
 u8 b[88];u32 i,bit=64,c=0;
 euc_zero(settings,112);for(i=0;i<88;i++)b[i]=*(u8 *)(src+offset(i));
 for(i=0;i<4;i++)c=(c<<8)|b[84+i];
 if(b[0]!='E'||b[1]!='U'||b[2]!='C'||b[3]!='1'||b[4]!=1||b[5]!=76||b[6]||b[7]||c!=crc(b,84))return 0;
 for(i=0;i<16;i++){
  Euc *s=&settings[i];s->p1=getbits(b,&bit,7);s->p2=getbits(b,&bit,7);
  s->r1=(s32)getbits(b,&bit,7)-63;s->r2=(s32)getbits(b,&bit,7)-63;s->rotation=(s32)getbits(b,&bit,7)-63;
  s->enabled=getbits(b,&bit,1);s->op=getbits(b,&bit,2);
  if(s->p1>64||s->p2>64||s->r1>63||s->r2>63||s->rotation>63){euc_zero(settings,112);return 0;}
 }return 1;
}
u32 euc_save(u32 dst,u32 src,u32 options){
 Euc snapshot[16],*s;u32 result=euc_native_save(dst,src,options),sr;
 if(result&255){sr=euc_lock();s=euc_settings(src,0);if(s)euc_copy(snapshot,s,112);else euc_zero(snapshot,112);euc_unlock(sr);euc_pack(dst,snapshot);euc_stats[4]++;}return result;
}
u32 euc_load(u32 dst,u32 src,u32 context){
 Euc decoded[16],*s;u32 result=euc_native_load(dst,src,context),sr;
 if(result&255){if(!euc_unpack(decoded,src))euc_stats[6]++;sr=euc_lock();s=euc_settings(dst,1);if(s)euc_copy(s,decoded,112);euc_unlock(sr);euc_stats[5]++;}return result;
}
u32 euc_track_mirror(u32 callback){
 u32 result=euc_native_track_mirror(callback),ctx=R32(callback),dst=R32(ctx+4);
 u32 offset=dst-FW_PATTERN_MIRROR,n=offset/0x6200,sr;Euc snapshot[16];
 if(n<128&&offset%0x6200>=4&&offset%0x6200<4+16*TRACK_SIZE&& !((offset%0x6200-4)%TRACK_SIZE)){
  sr=euc_lock();euc_copy(snapshot,euc_patterns[n],112);euc_unlock(sr);
  euc_pack(FW_PATTERN_MIRROR+n*0x6200,snapshot);
 }
 return result;
}
u32 euc_memcpy(u32 dst,u32 src,u32 size){
 Euc *d=0,*s=0;u32 n=0,sr;
 if(size==PATTERN_SIZE||size==TRACK_SIZE){
  sr=euc_lock();
  if(size==PATTERN_SIZE){s=euc_settings(src,0);d=euc_settings(dst,1);n=112;}
  else{s=track_settings(src,0);d=track_settings(dst,1);n=7;}
  if(d){if(s)euc_copy(d,s,n);else euc_zero(d,n);}euc_unlock(sr);euc_stats[8]++;
 }
 return euc_native_copy(dst,src,size);
}
u32 euc_clear(u32 track,u32 locks){u32 sr=euc_lock();Euc *s=track_settings(track,0);if(s)euc_zero(s,7);euc_unlock(sr);return euc_native_clear(track,locks);}
#ifdef DT_LINKABLE
void euc_cleanup(u32 address){
#else
u32 euc_free(u32 address){
#endif
 u32 sr=euc_lock(),i;
 for(i=0;i<64;i++)if(euc_temp[i].address==address||euc_temp[i].address==address+4)euc_temp[i].address=0;
 euc_unlock(sr);
#ifndef DT_LINKABLE
 return free_hook(address);
#endif
}

extern u32 euc_equal(const void *,const void *,u32);
u32 euc_commit(u32 pattern,u32 track){
 u8 *saved,*staged;u32 sr,i,j,base=pattern+track*TRACK_SIZE,locks=pattern+0x38f0+track*0x1b35;
 u32 size=TRACK_SIZE+0x1b35,result=0;Euc *s,value;s8 mapping[64];s32 length;
 if(!pattern||track>=16)return 0;
 sr=euc_lock();s=euc_settings(pattern,0);
 if(!s||!s[track].enabled){euc_unlock(sr);return 0;}
 euc_unlock(sr);
 /* No allocator, expansion or lock-summary scan runs with IRQs masked.
  * Keep an immutable snapshot beside the staged result so edits arriving
  * during preparation can be detected rather than silently overwritten. */
 saved=(u8 *)FW(FW_ALLOC)(size*2);if(!saved){euc_stats[11]++;return 0;}
 staged=saved+size;
 sr=euc_lock();s=euc_settings(pattern,0);
 if(!s||!s[track].enabled){euc_unlock(sr);FW(FW_FREE)(saved);return 0;}
 value=s[track];length=euc_length(pattern,track);
 euc_copy(mapping,map(pattern,track,&value),64);
 euc_native_copy((u32)saved,base,TRACK_SIZE);
 euc_native_copy((u32)(saved+TRACK_SIZE),locks,0x1b35);euc_unlock(sr);
 euc_native_copy((u32)staged,(u32)saved,size);
 for(i=0;i<64;i++){
  s32 from=mapping[i];
  *(u16 *)(staged+2*i)=from>=0?(*(u16 *)(saved+2*from)|1):(i&1?0x10:0);
  for(j=0x80;j<0x380;j+=64){
   u8 v=from>=0?saved[j+from]:(j==0x100||j==0x1c0?0:j==0x140?46:j==0x180?9:255);
   staged[j+i]=v;
  }
  if(from>=0)euc_native_copy((u32)(staged+TRACK_SIZE+i*0x6c),(u32)(saved+TRACK_SIZE+from*0x6c),0x6c);
  else{for(j=0;j<0x6a;j+=2)*(u16 *)(staged+TRACK_SIZE+i*0x6c+j)=0xffff;*(u16 *)(staged+TRACK_SIZE+i*0x6c+0x6a)=0;}
 }
 for(j=0;j<53;j++){u8 any=0;for(i=0;i<64;i++)if(*(short *)(staged+TRACK_SIZE+i*0x6c+j*2)>=0)any=1;staged[TRACK_SIZE+0x1b00+j]=any;}
 /* Native bulk copies support the firmware's unaligned track records.
  * The final check and publication are one short, consistent transaction. */
 sr=euc_lock();s=euc_settings(pattern,0);
 if(s&&euc_equal(&s[track],&value,sizeof value)&&euc_length(pattern,track)==length&&
    euc_equal((void *)base,saved,TRACK_SIZE)&&euc_equal((void *)locks,saved+TRACK_SIZE,0x1b35)){
  euc_native_copy(base,(u32)staged,TRACK_SIZE);
  euc_native_copy(locks,(u32)(staged+TRACK_SIZE),0x1b35);
  s[track].enabled=0;result=1;
 }else euc_stats[10]++;
 euc_unlock(sr);FW(FW_FREE)(saved);
 if(result){euc_stats[9]++;euc_notify(pattern,track);}return result;
}
