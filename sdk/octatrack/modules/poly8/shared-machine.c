/* SPDX-License-Identifier: MIT
 * Shared native machine registration for POLY8 compositions.
 * Chooser seams derive from Sam Banks / Modwerk Analog BD and VECTOR.
 * Each machine keeps its own signed FLEX state, defaults, pages and engine.
 */
#include <stdint.h>
#include <stddef.h>
#define U8(a) (*(volatile uint8_t *)(uintptr_t)(a))
#define U32(a) (*(volatile uint32_t *)(uintptr_t)(a))
#define BANK 0x46c82456u
#define PART_OFF 0x8ed80u
#define PART_STRIDE 6322u
#define SRAM_PART 0x100a4eceu
#define SIG 60u
#define WEAK __attribute__((weak))
typedef volatile uint8_t Part;
extern unsigned pm_type(unsigned,const Part *),pm_chooser_type(unsigned,const Part *);
extern unsigned pm_assign(Part *,unsigned,unsigned),pm_selected(void);
extern void pm_ui_tick(void),pm_clear_extensions(unsigned),pm_pool_choice_open(void),pm_stock_pool_open(void);
extern void pm_pool_left(unsigned,unsigned),pm_pool_right(unsigned,unsigned);
extern unsigned st_type(unsigned,const Part *) WEAK,st_chooser_type(unsigned,const Part *) WEAK;
extern unsigned st_assign(Part *,unsigned,unsigned) WEAK;
extern void st_ui_tick(void) WEAK,st_pool_choice_open(void) WEAK;
extern void st_pool_left(unsigned,unsigned) WEAK,st_pool_right(unsigned,unsigned) WEAK;
extern unsigned ab_type(unsigned,const Part *) WEAK,ab_admit_track(const Part *,unsigned) WEAK;
extern void ab_ui_tick(void) WEAK,ab_engine_open(void) WEAK;
extern uint32_t ab_track_page(const Part *) WEAK;
extern const uint8_t ab_defaults[12] WEAK;
extern unsigned fm_type(unsigned,const Part *) WEAK,fm_admit_track(const Part *,unsigned) WEAK;
extern void fm_ui_tick(void) WEAK;
extern uint32_t fm_track_page(const Part *) WEAK;
extern const uint8_t fm_defaults[12] WEAK;
extern int mr_stock_validate(uint8_t *);
extern int vector_validate_part(uint8_t *,int (*)(uint8_t *)) WEAK;
enum { STOCK=0,POLY=1,AB=2,VECTOR=3,FM=4 };
static const char *const labels[4]={"POLY8","ANALOG BD","VECTOR","FM SYNTH"};
/* Bounded table: five stock machines and up to four signed machines. */
extern const char *mr_src_names[9];
extern uint32_t mr_pb_table[9];
/* The platform loads PROGBITS only; it does not zero a runtime's BSS.
 * An explicit zero initializer keeps this flag in the loaded image under
 * -fno-zero-initialized-in-bss. Untouched SDRAM must never skip tables(). */
static unsigned tables_ready=0;
static void tables(void);
static unsigned present(unsigned kind) {
 return kind==POLY || (kind==AB && ab_type) || (kind==VECTOR && st_type) || (kind==FM && fm_type);
}
unsigned mr_row(unsigned kind) {
 unsigned row=5;
 for(unsigned k=POLY;k<=FM;++k) if(present(k)) { if(k==kind) return row; ++row; }
 return 0;
}
static unsigned row_owner(unsigned row) {
 unsigned at=5;
 for(unsigned k=POLY;k<=FM;++k) if(present(k)) { if(at==row) return k; ++at; }
 return STOCK;
}
static unsigned valid_bank(void) { uint32_t b=U32(BANK);return b>=0x40000000u && b<0x47f00000u; }
static Part *current_part(void) { return (Part *)(uintptr_t)(U32(BANK)+PART_OFF+(U8(0x100b14cfu)&3u)*PART_STRIDE); }
static unsigned owner(const Part *part,unsigned t) {
 if(t>=8 || part[0x22+t]>1) return STOCK;
 const Part *s=part+SIG+30*t;
 if(s[0]=='P' && s[1]=='L' && s[2]==1) return POLY;
 if(s[0]=='A' && s[1]=='B' && s[2]==1) return AB;
 if(s[0]=='S' && s[1]=='2' && (s[2]==1 || s[2]==2)) return VECTOR;
 if(s[0]=='F' && s[1]=='M' && s[2]==1) return FM;
 return STOCK;
}
unsigned mr_current_owner(void) {
 return valid_bank() && !U8(0x80000015u)?owner(current_part(),U8(0x100b14ccu)):STOCK;
}
static void names(void) {
 if(!tables_ready) { tables(); tables_ready=1; }
 for(unsigned k=POLY;k<=FM;++k) if(present(k)) mr_src_names[mr_row(k)]=labels[k-1];
}
const char *mr_name(unsigned row) {
 names();return row<9 && (row<5 || row_owner(row))?mr_src_names[row]:mr_src_names[1];
}
unsigned mr_type(unsigned type,const Part *ptr) {
 names();
 if(!valid_bank()) return type;
 Part *part=current_part();uintptr_t t=(uintptr_t)ptr-(uintptr_t)(part+0x22);
 unsigned kind=t<8?owner(part,(unsigned)t):STOCK;
 return kind && present(kind) && type<2?mr_row(kind):type;
}
unsigned mr_chooser_type(unsigned type,const Part *ptr) {
 unsigned kind=valid_bank()?owner(current_part(),U8(0x100b14ccu)):STOCK;
 if(kind==POLY && pm_chooser_type(type,ptr)!=5) return type;
 if(kind==VECTOR && st_chooser_type && st_chooser_type(type,ptr)!=5) return type;
 return mr_type(type,ptr);
}
unsigned mr_backing(void) {
 if(!valid_bank() || U8(0x100b14ccu)>=8) return 1;
 unsigned pool=current_part()[0x22+U8(0x100b14ccu)];return pool<2?pool:1;
}
unsigned mr_assign(Part *part,unsigned track,unsigned row) {
 if(!valid_bank() || track>=8) return row<5?row:1;
 uint32_t offset=(uint32_t)(uintptr_t)part-U32(BANK)-PART_OFF;
 if(offset%PART_STRIDE || offset/PART_STRIDE>=4) return (unsigned)-1;
 unsigned next=row_owner(row),old=owner(part,track);
 Part *mirror=(Part *)(uintptr_t)(SRAM_PART+offset);
 if(next==POLY) return pm_assign(part,track,1); /* Admission precedes every mutation. */
 if(next==AB && (!ab_admit_track || !ab_admit_track(part,track))) return (unsigned)-1;
 if(next==FM && (!fm_admit_track || !fm_admit_track(part,track))) return (unsigned)-1;
 if(next && old==POLY) pm_clear_extensions(track);
 if(next==VECTOR) return st_assign(part,track,1);
 if(next==AB || next==FM) {
  if(old!=next) {
   const uint8_t *defaults=next==AB?ab_defaults:fm_defaults;
   for(unsigned k=0;k<12;++k) {
    unsigned at=(k<6?0x2a:0x1da)+30*track+6+k%6;
    part[at]=mirror[at]=defaults[k];
   }
  }
  unsigned sig=SIG+30*track;
  part[sig]=mirror[sig]=next==AB?'A':'F';
  part[sig+1]=mirror[sig+1]=next==AB?'B':'M';
  part[sig+2]=mirror[sig+2]=1;
  return 1;
 }
 /* Browser YES retains the signed owner; ordinary machine selection clears it. */
 if(old==POLY) { unsigned pool=pm_assign(part,track,0);if(owner(part,track)==POLY) return pool;pm_clear_extensions(track); }
 else if(old==VECTOR && st_assign) { unsigned pool=st_assign(part,track,0);if(owner(part,track)==VECTOR) return pool; }
 else if(old && present(old)) {
  unsigned sig=SIG+30*track;for(unsigned k=0;k<3;++k) part[sig+k]=mirror[sig+k]=0;
 }
 return row<5?row:1;
}
static void tables(void) {
 for(unsigned row=0;row<5;++row) mr_pb_table[row]=U32(0x400d5f38u+4*row);
 unsigned kind=mr_current_owner();
 const Part *ptr=valid_bank()?current_part()+0x22+U8(0x100b14ccu):(const Part *)0;
 mr_pb_table[mr_row(POLY)]=0x400d31aeu;
 if(ab_track_page) mr_pb_table[mr_row(AB)]=ptr?ab_track_page(ptr):0x400d31aeu;
 if(st_type) mr_pb_table[mr_row(VECTOR)]=kind==VECTOR && mr_backing()==0?0x400d301cu:0x400d31aeu;
 if(fm_track_page) mr_pb_table[mr_row(FM)]=fm_track_page(ptr);
}
void mr_ui_tick(void) {
 names();
 pm_ui_tick();
 if(st_ui_tick) st_ui_tick(); /* VECTOR must observe transport on any track. */
 if(ab_ui_tick) ab_ui_tick();
 if(fm_ui_tick) fm_ui_tick();
 tables();
 if(!valid_bank()) return;
 unsigned kind=mr_current_owner();
 Part *ptr=current_part()+0x22+U8(0x100b14ccu);
 uint32_t page=kind==AB && ab_track_page?ab_track_page(ptr):
               kind==FM && fm_track_page?fm_track_page(ptr):
               mr_backing()==0?0x400d301cu:0x400d31aeu;
 U32(0x400d5f4cu)=page;
}
uint32_t mr_page(const Part *ptr) {
 if(!tables_ready) { tables(); tables_ready=1; }
 if(!valid_bank()) return 0;
 uintptr_t t=(uintptr_t)ptr-(uintptr_t)(current_part()+0x22);
 unsigned kind=t<8?owner(current_part(),(unsigned)t):STOCK;
 if(kind==AB && ab_track_page) return ab_track_page(ptr);
 if(kind==FM && fm_track_page) return fm_track_page(ptr);
 return 0;
}
int mr_validate(Part *part) {
 uint8_t saved[8][12];unsigned mask=0;
 const Part *stock=(const Part *)0x400d320cu;
 for(unsigned t=0;t<8;++t) {
  unsigned kind=owner(part,t);
  if((kind==AB || kind==FM) && present(kind)) {
   mask|=1u<<t;
   for(unsigned k=0;k<12;++k) {unsigned at=(k<6?0x2a:0x1da)+30*t+6+k%6;saved[t][k]=part[at];part[at]=stock[k];}
  }
 }
 /* Keep VECTOR 0.2.4's packed-setting protection when our shared detour
  * replaces its entry. The adapter still invokes the real stock validator. */
 int result=vector_validate_part?vector_validate_part((uint8_t *)part,mr_stock_validate):
                                  mr_stock_validate((uint8_t *)part);
 for(unsigned t=0;t<8;++t) if(mask&(1u<<t))
  for(unsigned k=0;k<12;++k) {unsigned at=(k<6?0x2a:0x1da)+30*t+6+k%6;part[at]=saved[t][k];}
 return result;
}
unsigned mr_open_pool(void) {
 unsigned kind=mr_current_owner();
 if(kind==POLY) pm_pool_choice_open();
 else if(kind==VECTOR && st_pool_choice_open) st_pool_choice_open();
 else if(kind==AB && ab_engine_open) ab_engine_open();
 else if(kind==FM) { pm_stock_pool_open();
  if(U32(0x460e70e0u) && U32(0x460e739au)) ((void (*)(void))0x4007893cu)();
  if(U32(0x460e70e0u)) ((void (*)(unsigned,unsigned))0x4007edb0u)(0x460e7386u,mr_row(FM));
 }
 return kind && present(kind);
}
void mr_pool_left(unsigned key,unsigned edge) {
 unsigned returning=U32(0x460e739au);
 unsigned kind=mr_current_owner();
 if(kind==POLY) pm_pool_left(key,edge);
 else if(kind==VECTOR && st_pool_left) st_pool_left(key,edge);
 else ((void (*)(unsigned,unsigned))0x4007893cu)(key,edge);
 /* Legacy callbacks return to row five; restore this build's actual row. */
 if(returning && kind && present(kind) && U32(0x460e70e0u) && !U32(0x460e739au))
  ((void (*)(unsigned,unsigned))0x4007edb0u)(0x460e7386u,mr_row(kind));
}
void mr_pool_right(unsigned key,unsigned edge) {
 unsigned row=U32(0x460e738eu),kind=row_owner(row);
 if(kind && kind==mr_current_owner() && !U32(0x460e739au)) {
  ((void (*)(void))0x400789e4u)();(void)mr_open_pool();
 }
 else ((void (*)(unsigned,unsigned))0x4007909cu)(key,edge);
}

extern void ab_list_draw(void) WEAK,st_list_draw(void) WEAK,pm_lipm_draw(void);
extern void fresh_bind(void) WEAK;
extern const uint8_t KEYMASK WEAK;
uintptr_t mr_list_target(void) {
 unsigned kind=mr_current_owner();
 return (uintptr_t)(kind==AB && ab_list_draw?ab_list_draw:
                    kind==VECTOR && st_list_draw?st_list_draw:pm_lipm_draw);
}
unsigned mr_row_has_pool(unsigned row) { unsigned kind=row_owner(row);return kind && kind!=FM; }
unsigned mr_mute_suppressed(unsigned track) {
 if(!fresh_bind || track>=8) return 0;
 unsigned mode=U32(0x800000dcu);if(mode!=1 && mode!=2) return 0;
 unsigned state=U32(0x80000008u),solo=state&255u;
 unsigned silenced=(state&(1u<<(8+track))) || (solo && !(solo&(1u<<track)));
 return silenced && (!&KEYMASK || !(KEYMASK&(1u<<track)));
}

extern void ab_engine_left(unsigned,unsigned) WEAK,st_pool_choice_left(unsigned,unsigned) WEAK;
void mr_choice_left(unsigned key,unsigned edge) {
 unsigned kind=mr_current_owner();
 if(kind==AB && ab_engine_left) ab_engine_left(key,edge);
 else if(kind==VECTOR && st_pool_choice_left) st_pool_choice_left(key,edge);
 if(kind && present(kind) && U32(0x460e70e0u) && !U32(0x460e739au))
  ((void (*)(unsigned,unsigned))0x4007edb0u)(0x460e7386u,mr_row(kind));
}

extern int ab_render(unsigned,unsigned,unsigned,unsigned) WEAK,sy_render(unsigned,unsigned,unsigned,unsigned) WEAK;
int mr_source_render_impl(unsigned track,unsigned ping,unsigned start,unsigned end) {
 unsigned kind=valid_bank()?owner(current_part(),track):STOCK;
 if(kind==AB && ab_render) return ab_render(track,ping,start,end);
 if(kind!=POLY && kind!=VECTOR && sy_render) return sy_render(track,ping,start,end);
 return ((int (*)(unsigned,unsigned,unsigned,unsigned))0x40004008u)(track,ping,start,end);
}
