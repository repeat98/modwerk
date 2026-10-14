#include "firmware.h"
/* Digitakt mk1 OS 1.53/1.54 CC names. Original patch code; no DSP changes. */
typedef unsigned long u32;
typedef unsigned char u8;
#define R32(a) (*(u32 *)(a))
#define FW(a) ((u32 (*)())(a))
#define KIT_BASE FW_KIT_BASE
#define KIT_SIZE 0x91eUL
#define MIDI_OFF 0x59aUL
#define MIDI_SIZE 0x70UL
#define TEMP_COUNT 64

typedef char Names[8][8][6];
Names pattern_names[128];
struct Temporary { u32 address, kind, owner; Names names; };
/* Clipboard storage is UI-owned. Allocate before taking the IRQ lock;
 * keeping it for the session leaves no dangling pointers in copy callbacks. */
static struct Temporary *temporary;
u32 temporary_count;
u32 stats[16]; /* accepts, saves, loads, invalid/absent, copies, clears,
                  frees, allocation failures, peak temporaries, opens */
u32 released_key;
static const char fallback[8][6]={"VAL1","VAL2","VAL3","VAL4","VAL5","VAL6","VAL7","VAL8"};
extern u32 stock_save(u32,u32,u32), stock_load(u32,u32);
extern u32 stock_clear_kit(u32), stock_clear_midi(u32), stock_free(u32);

static u32 lock(void) {
 u32 sr;__asm__ volatile("move.w %%sr,%0\n\tmove.w #0x2700,%%sr":"=d"(sr)::"memory");return sr;
}
static void unlock(u32 sr) {__asm__ volatile("move.w %0,%%sr"::"d"(sr):"memory");}
static void copy(void *dst,const void *src,u32 n) {
 u8 *d=dst;const u8 *s=src;while(n--)*d++=*s++;
}
static void zero(void *dst,u32 n) {u8 *d=dst;while(n--)*d++=0;}
static int index_of(u32 kit) {
 u32 n=kit-KIT_BASE;
 return n<128*KIT_SIZE && !(n%KIT_SIZE) ? (int)(n/KIT_SIZE) : -1;
}
/* Temporary names follow the ownership of native clipboard/import objects.
 * No eviction: a live clipboard can never silently acquire another object's names. */
static char *temp_names(u32 address,u32 kind,u32 create,u32 owner) {
 u32 i,sr;struct Temporary *free=0;
 if(!temporary&&create&&address){
  struct Temporary *p=(struct Temporary *)FW(FW_ALLOC)(TEMP_COUNT*sizeof(*p));
  if(p){zero(p,TEMP_COUNT*sizeof(*p));temporary=p;}
 }
 if(!temporary){if(create)stats[7]++;return 0;}
 sr=lock();
 for(i=0;i<TEMP_COUNT;i++) {
  if(temporary[i].address==address && temporary[i].kind==kind) {
   unlock(sr);return (char *)temporary[i].names;
  }
  if(!temporary[i].address&&!free)free=&temporary[i];
 }
 if(create&&free&&address) {
  zero(free->names,sizeof(Names));free->kind=kind;free->owner=owner;free->address=address;
  temporary_count++;if(temporary_count>stats[8])stats[8]=temporary_count;
  unlock(sr);return (char *)free->names;
 }
 if(create)stats[7]++;
 unlock(sr);return 0;
}
static char *kit_names(u32 kit,u32 create) {
 int index=index_of(kit);
 if(index>=0)return (char *)pattern_names[index];
 return temp_names(kit,1,create,kit);
}
static char *track_names(u32 midi,u32 create) {
 u32 n=midi-KIT_BASE,t,k,i,sr;
 if(n<128*KIT_SIZE) {
  k=n/KIT_SIZE;n=n%KIT_SIZE;
  if(n>=MIDI_OFF&&n<MIDI_OFF+8*MIDI_SIZE&&(n-MIDI_OFF)%MIDI_SIZE==0)
   return (char *)pattern_names[k][(n-MIDI_OFF)/MIDI_SIZE];
 }
 sr=lock();
 for(i=0;temporary&&i<TEMP_COUNT;i++)if(temporary[i].address&&temporary[i].kind==1) {
  n=midi-temporary[i].address;
  if(n>=MIDI_OFF&&n<MIDI_OFF+8*MIDI_SIZE&&(n-MIDI_OFF)%MIDI_SIZE==0) {
   t=(n-MIDI_OFF)/MIDI_SIZE;unlock(sr);return (char *)temporary[i].names[t];
  }
 }
 unlock(sr);return temp_names(midi,2,create,midi);
}
#include "name_codec.h"

u32 save_hook(u32 dst,u32 kit,u32 options) {
 u32 result=stock_save(dst,kit,options),sr;char *p;Names snapshot;
 if(result&255) {
  p=kit_names(kit,0);sr=lock();if(p)copy(snapshot,p,sizeof(snapshot));else zero(snapshot,sizeof(snapshot));unlock(sr);
  if(!pack_names((u8 *)(dst+0x900),snapshot))zero((void *)(dst+0x900),256);
  stats[1]++;
 }
 return result;
}
u32 load_hook(u32 kit,u32 src) {
 u32 result=stock_load(kit,src),sr;char *p;Names decoded;
 if(result&255) {
  if(!unpack_names(decoded,(const u8 *)(src+0x900))){zero(decoded,sizeof(decoded));stats[3]++;}
  p=kit_names(kit,1);if(p){sr=lock();copy(p,decoded,sizeof(decoded));unlock(sr);}
  stats[2]++;
 }
 return result;
}
u32 clear_kit_hook(u32 kit) {
 char *p=kit_names(kit,1);u32 sr;
 if(p){sr=lock();zero(p,sizeof(Names));unlock(sr);}stats[5]++;
 return stock_clear_kit(kit);
}
u32 clear_midi_hook(u32 midi) {
 char *p=track_names(midi,1);u32 sr;
 if(p){sr=lock();zero(p,48);unlock(sr);}stats[5]++;
 return stock_clear_midi(midi);
}
u32 copy_hook(u32 dst,u32 src,u32 size) {
 char *d=0,*s=0;u32 n=0,sr;
 if(size==KIT_SIZE){
  s=kit_names(src,0);d=kit_names(dst,0);
  /* Only PatternAndKitCopy payloads are non-project destinations at the
   * patched native kit-copy call sites. Record their allocation owner. */
  if(!d)d=temp_names(dst,1,1,dst-0x1ec6c);
  n=sizeof(Names);
 } else if(size==MIDI_SIZE){
  s=track_names(src,0);d=track_names(dst,0);
  if(!d)d=temp_names(dst,2,1,dst-4);
  n=48;
 }
 if(d){sr=lock();if(s)copy(d,s,n);else zero(d,n);unlock(sr);stats[4]++;}
 return FW(FW_MEMCPY)(dst,src,size);
}
#ifdef DT_LINKABLE
void ccn_cleanup(u32 address) {
#else
u32 free_hook(u32 address) {
#endif
 u32 i,sr;
 if(temporary_count&&address) {
  sr=lock();
  for(i=0;i<TEMP_COUNT;i++) {
   if(temporary[i].address&&temporary[i].owner==address) {
    temporary[i].address=0;temporary_count--;stats[6]++;
   }
  }
  unlock(sr);
 }
#ifndef DT_LINKABLE
 return stock_free(address);
#endif
}
/* Drawing temporarily unbinds MidiPreset's writable backing pointer. Read
 * the view's stable pattern/track identity, not that transient pointer. */
u32 page_label(u32 view,u32 parameter) {
 u32 k,t;char *p;
 if(parameter>=0x94&&parameter<0x9c) {
  t=FW(FW_SELECTED_TRACK)(R32(view+0x74))-8;
  k=FW(FW_KIT_INDEX)(R32(view+0x78));
  if(k<128&&t<8){p=pattern_names[k][t][parameter-0x94];if(*p)return (u32)p;}
 }
 return FW(FW_PARAMETER_LABEL)(0,parameter);
}
static u32 manager(u32 *dst,const u32 *src,u32 op) {
 if(op==0)dst[0]=0;
 else if(op==1)dst[0]=(u32)src;
 else if(op==2){dst[0]=src[0];dst[1]=src[1];}
 return 0;
}
/* Inline callback context: page, packed original kit/track/slot.
 * Using the captured kit prevents modal edits from following a pattern change. */
static void accepted(const u32 *ctx,const char **str,u32 unused) {
 u32 view=ctx[0],id=ctx[1],k=id>>6,t=(id>>3)&7,s=id&7,i,sr,kit_active;
 char text[6];(void)unused;
 if(k>=128)return;
 for(i=0;i<5&&(*str)[i];i++)text[i]=(*str)[i];
 for(;i<6;i++)text[i]=0;
 sr=lock();copy(pattern_names[k][t][s],text,6);unlock(sr);stats[0]++;
 kit_active=R32(view+0x78);
 /* KitActive::changed(index, nullptr) updates this kit's mirror and observers. */
 FW(R32(R32(kit_active)+0x5c))(kit_active,k,0);
 FW(FW_INVALIDATE)(view);
}
u32 key_hook(u32 view,u32 event) {
 u32 key=R32(event+12),flags=R32(event+16),slot=key-40,t,parameter,cb[4],title,initial,shared[2];
 u32 *block;char heading[]="CC1 NAME";int k;
 if((flags&1)&&!(flags&8))released_key=0;
 if(key==released_key&&(flags&16)){released_key=0;return 1;}
 if(slot<8&&(flags&0xb)==0xb) {
  t=FW(FW_SELECTED_TRACK)(R32(view+0x74))-8;
  parameter=FW(R32(R32(view)+0x9c))(view,slot);
  k=FW(FW_KIT_INDEX)(R32(view+0x78));
  if(k>=0&&k<128&&t<8&&parameter>=0x94&&parameter<0x9c) {
   cb[0]=view;cb[1]=(k<<6)|(t<<3)|slot;cb[2]=(u32)manager;cb[3]=(u32)accepted;
   heading[2]+=(char)slot;
   block=(u32 *)FW(FW_ALLOC)(0xb0);
   if(!block){released_key=key;return 1;}
   FW(FW_STRING_CTOR)(&title,heading,0);
   FW(FW_STRING_CTOR)(&initial,pattern_names[k][t][slot][0]?pattern_names[k][t][slot]:fallback[slot],0);
   block[0]=FW_SHARED_VTABLE;block[1]=1;block[2]=1;block[3]=(u32)(block+4);
   FW(FW_NAME_VIEW_CTOR)(block+4,&title,&initial,0,5,0,cb);
   *((u8 *)(block+4)+0x94)=1;R32((u32)(block+4)+0x9c)=slot+1;
   shared[0]=(u32)(block+4);shared[1]=(u32)block;stats[9]++;
   FW(FW_SHOW_MODAL)(view,shared,0);
   FW(FW_SHARED_RELEASE)(&shared[1]);FW(FW_STRING_DTOR)(&title);FW(FW_STRING_DTOR)(&initial);
   released_key=key;return 1;
  }
 }
 return FW(FW_NATIVE_KEY)(view-4,event);
}
