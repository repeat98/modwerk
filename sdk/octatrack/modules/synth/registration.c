/* FM Synth's native chooser registration. Part storage uses FLEX plus
 * FM/1 in unused NEIGHBOR bytes. No sample or sample-slot mutation is needed.
 * Derived from Modwerk's MIT Analog BD registration; FM engine: Tim Hastie.
 */
typedef unsigned char u8;
typedef unsigned int u32;
#define U8(a) (*(volatile u8 *)(a))
#define U32(a) (*(volatile u32 *)(a))
#define BANK 0x46c82456u
#define PART_IDX 0x100b14cfu
#define PART_OFF 0x8ed80u
#define PART_STRIDE 6322u
const u8 fm_defaults[12]={64,12,32,64,0,40,0,0,0,0,0,0};
static volatile u8 *part_base(void) {
 return (volatile u8 *)(U32(BANK)+PART_OFF+(U8(PART_IDX)&3)*PART_STRIDE);
}
static unsigned signed_track(const volatile u8 *part,unsigned t) {
 const volatile u8 *s=part+60+30*t;
 return t<8 && part[0x22+t]==1 && s[0]=='F' && s[1]=='M' && s[2]==1;
}
#define IMAGE __attribute__((section(".data"))) /* state in the image, not .bss: a machine group package has none */
static volatile u8 fm_picked IMAGE; /* the base's pick of FM SYNTH asks this before it wakes a resting module */
unsigned fm_admit_track(const volatile u8 *part,unsigned t) { (void)part;fm_picked=1;return t<8; }
/* ev_in_use (Modwerk 0.1.5), from the base's UI tick: nonzero while anything FM Synth plays may be in the project,
 * so the base rests its frame sites (runtime.json "rests") only while they could change nothing. In use: a pick of
 * FM SYNTH (fm_picked, so the base's wake lands before the commit), GLIDE on (sample tracks slide through sy_render),
 * an FM/1 track in the live Part, or, in the sweep, an FM/1 track in any Part of any bank, working or saved, or a FLEX
 * slot holding a legacy FMSYNTH* / SYNTH* marker (poly.s po_slot_marker's test). The sweep reads one Part and one
 * slot a call (128 of each, about two seconds) and keeps FM awake until a whole sweep found neither. */
#define GLIDE_AT 0x100b14edu      /* the bundled quantizer's GLIDE byte, 0 = off */
#define BANK0 0x400e21e0u         /* bank 0; all 16 stay in RAM, 0x9b340 apart */
#define PART_SAVED 0x9504au
#define SLOTS 0x100b14f0u         /* the FLEX slots' settings records, 0x448 each, the path at +0 */
static u8 fm_sweep IMAGE,fm_seen IMAGE,fm_clean IMAGE;
/* poly.s fm_fr, the frame's masks: FR_IDLE 10 (the last answer was 0), FR_REBASE 11 (the first frame after a rest
 * drops the clock's step measured across the frames po_tick missed while its site held stock's bytes). */
extern volatile u8 fm_fr[];
enum { FR_IDLE=10, FR_REBASE=11 };
static unsigned any_signed(const volatile u8 *part) {
 for(unsigned t=0;t<8;++t) if(signed_track(part,t)) return 1;
 return 0;
}
static unsigned slot_marker(unsigned slot) {
 const volatile u8 *p=(const volatile u8 *)(SLOTS+0x448u*slot),*name=p;
 for(unsigned n=255;n;--n) { u8 c=*p++; if(!c) break; if(c=='/') name=p; } /* battery RAM: each byte read once */
 if(name[0]=='F' && name[1]=='M') name+=2;
 return name[0]=='S' && name[1]=='Y' && name[2]=='N' && name[3]=='T' && name[4]=='H';
}
unsigned fm_in_use(void) {
 unsigned k=fm_sweep&7u,bank=U32(BANK);
 if(any_signed((const volatile u8 *)(BANK0+(fm_sweep>>3)*0x9b340u+(k<4?PART_OFF:PART_SAVED)+(k&3)*PART_STRIDE))
    || slot_marker(fm_sweep)) fm_seen=1;
 if(!(fm_sweep=(u8)((fm_sweep+1)&127u))) fm_clean=!fm_seen,fm_seen=0;
 unsigned use=fm_picked || U8(GLIDE_AT) || fm_seen || !fm_clean
  || bank<0x40000000u || bank>=0x47f00000u || any_signed(part_base()); /* no bank yet: awake */
 fm_picked=0;
 if(!use) fm_fr[FR_IDLE]=1;
 else if(fm_fr[FR_IDLE]) fm_fr[FR_REBASE]=1,fm_fr[FR_IDLE]=0;
 return use;
}
unsigned fm_type(unsigned type,const volatile u8 *ptr) {
 volatile u8 *part=part_base();unsigned t=(unsigned)(ptr-(part+0x22));
 return type==1 && t<8 && signed_track(part,t)?5:type;
}
/* Fixed page entry calls the engine's runtime clone builder. */
u32 fm_track_page(const volatile u8 *ptr) { (void)ptr;return ((u32(*)(void))0x400d24d0u)(); }
void fm_ui_tick(void) { U32(0x400d5f38u+5*4)=fm_track_page((void*)0); }
extern int fm_stock_validate(void *part);
int fm_validate_part(u8 *part) {
 u8 saved[8][12];unsigned mask=0;
 const volatile u8 *stock=(const volatile u8 *)0x400d320cu;
 for(unsigned t=0;t<8;++t) if(signed_track(part,t)) {
  mask|=1u<<t;
  for(unsigned k=0;k<12;++k) {unsigned at=(k<6?0x2a:0x1da)+30*t+6+k%6;saved[t][k]=part[at];part[at]=stock[k];}
 }
 int result=fm_stock_validate(part);
 for(unsigned t=0;t<8;++t) if(mask&(1u<<t))
  for(unsigned k=0;k<12;++k) {unsigned at=(k<6?0x2a:0x1da)+30*t+6+k%6;part[at]=saved[t][k];}
 return result;
}
