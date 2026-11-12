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
unsigned fm_admit_track(const volatile u8 *part,unsigned t) { (void)part;return t<8; }
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
