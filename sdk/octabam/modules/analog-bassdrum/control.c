/* Native source renderer + stock-page registration, derived from the measured
 * Machinedrum Part/chooser seams and the stock kind-table renderer ABI.
 * The synthesis is upstream of AMP and both FX slots: 808 and 909 on the DSP via ab_glue.asm.
 */
#include "engine.h"
#define U8(a) (*(volatile uint8_t *)(uintptr_t)(a))
#define U32(a) (*(volatile uint32_t *)(uintptr_t)(a))
#define BANK 0x46c82456u
#define PART_IDX 0x100b14cfu
#define PART_OFF 0x8ed80u
#define PART_STRIDE 0x18b2u
#define SIG 60u
#define DESC_SIZE 0x1cau
static uint8_t desc[2][DESC_SIZE] = {{0}};
uint32_t ab_desc_p = 0;
extern void ab_stock_pool_open(void);
static unsigned ab_window_track = 0xff;
static unsigned ab_open_delay = 0;
#define AB_OPEN_TICKS 12u  /* about 200 ms of UI ticks (60 a second): past a double tap's last release */
static uint32_t ab_chooser_row = 0;
uint32_t ab_render_calls = 0, ab_hits = 0;
static unsigned signed_track(const volatile uint8_t *part, unsigned t) {
    const volatile uint8_t *s=part+SIG+30*t;
    return t<8 && part[0x22+t]==1 && s[0]=='A' && s[1]=='B' && s[2]==1;
}
/* Each core owns four independent voice slots, addressed by track. */
unsigned ab_admit_track(const volatile uint8_t *part, unsigned track) {
    (void)part;
    return track<8;
}
static volatile uint8_t *part_base(void) {
    return (volatile uint8_t *)(uintptr_t)(U32(BANK)+PART_OFF+(U8(PART_IDX)&3)*PART_STRIDE);
}
/* Track double-tap must not open FLEX's sample pool for a synthesized source. */
unsigned ab_selected_source(void) {
    unsigned track=U8(0x100b14ccu);
    return !U8(0x80000015u) && track<8 && signed_track(part_base(),track);
}
unsigned ab_type(unsigned type, const volatile uint8_t *ptr) {
    volatile uint8_t *part=part_base();
    uintptr_t t=(uintptr_t)ptr-(uintptr_t)(part+0x22);
    return type==1 && t<8 && signed_track(part,(unsigned)t) ? 5 : type;
}
static void put32(uint8_t *p,uint32_t v) {
    p[0]=(uint8_t)(v>>24); p[1]=(uint8_t)(v>>16); p[2]=(uint8_t)(v>>8); p[3]=(uint8_t)v;
}
static void text(uint8_t *p,const char *s,unsigned n) {
    unsigned i=0; for (;i+1<n && s[i];++i) p[i]=(uint8_t)s[i];
    for (;i<n;++i) p[i]=0;
}
/* The model switch's words: the stored byte is the engine id (0 = 808, 1 = 909). */
void ab_model_fmt(char *out,int value) {
    text((uint8_t*)out,value ? "909" : "808",4);
}
void ab_lpf_fmt(char *out,int value) {
    if(value==127) { text((uint8_t*)out,"OFF",4); return; }   /* fully clockwise: no filter */
    if(value==63) { text((uint8_t*)out,"ORIG",5); return; }
    unsigned hz=ab_lpf_frequency((unsigned)value),n=0;
    char digits[5];
    do { digits[n++]=(char)('0'+hz%10); hz/=10; } while(hz && n<5);
    unsigned i=0; while(n) out[i++]=digits[--n]; out[i]=0;
}
static uint32_t page_for(unsigned model) {
    if (!ab_desc_p) {
        const volatile uint8_t *src=(const volatile uint8_t *)0x400d3176u;
        static const char *const names[2][12]={
            {"PTCH","DCAY","TONE","ATK","SWEP","SAT","TYPE","FIXD","ACNT","LOW","HIGH","LPF"},
            {"PTCH","DCAY","TUNE","ATK","TDEP","SAT","TYPE","FIXD","ACNT","LOW","HIGH","LPF"}
        };
        for(unsigned m=0;m<2;++m) {
            uint8_t *d=desc[m];
            for(unsigned i=0;i<DESC_SIZE;++i) d[i]=src[i];
            text(d+0x3c,"SYN",5); text(d+0x41,"ANALOG BD",13);
            for(unsigned i=0;i<12;++i) {
                text(d+0x4e + 6*i,names[m][i],6);
                d[0x96+i]=ab_defaults[i];
                put32(d+0xa2+4*i,0);
                put32(d+0xd2+4*i,i==6?2:128);
                put32(d+0x102+4*i,i==11 ? (uint32_t)(uintptr_t)ab_lpf_fmt:
                                  i==6 ? (uint32_t)(uintptr_t)ab_model_fmt:0);
                put32(d+0x132+4*i,0);
                put32(d+0x162+4*i,0);
            }
            /* SETUP: TYPE FIXD ACNT / LOW HIGH LPF on both models. TYPE (slot 6) and FIXD (slot 7) are
             * stock's two-state L/R switch, as the AMP SETUP page's SYNC is: its widget, no handler of its
             * own; FIXD takes SYNC's own OFF/ON words. */
            put32(d+0xd2+4*7,2);
            put32(d+0x102+4*7,0x4003c14cu);
            put32(d+0x132+4*6,0x40046f10u);
            put32(d+0x132+4*7,0x40046f10u);
            put32(d+0x1c2,0x1111); put32(d+0x1c6,0x11111111u);
        }
        ab_desc_p=(uint32_t)(uintptr_t)(desc[0]+0x38);
    }
    return (uint32_t)(uintptr_t)(desc[model!=0]+0x38);
}
uint32_t ab_track_page(const volatile uint8_t *type_ptr) {
    volatile uint8_t *part=part_base();
    uintptr_t track=(uintptr_t)type_ptr-(uintptr_t)(part+0x22);
    /* Until a track is Analog BD (SRC SETUP previews it on a FLEX track), its TYPE slot holds FLEX's
     * LOOP byte: preview the 808 page, the default the assignment gives, not FLEX's value as a model. */
    return page_for(track<8 && signed_track(part,(unsigned)track) ? part[0x1da+6+30*track] : 0);
}
/* Card builds only (the USB package build sets this to 0): the base there opens a pool-less machine's track
 * window on its machine list itself. */
#define AB_CARD_WINDOW 1
/* The track window (double tap, or another track's window switched to this one with its TRACK key) shows an
 * Analog BD track on its machine column: Analog BD has no pool, and stock's handling of the second TRACK
 * press and its release puts the (empty) pool column back. The window opens or switches with the track's own
 * row highlighted; learn that row then, so a pool column reached from another row (RIGHT on FLEX) is left alone. */
static void ab_card_window(void) {
    if(ab_open_delay && !--ab_open_delay && ab_selected_source() && !U32(0x460e70e0u) && !U32(0x460e5e30u))
        ab_stock_pool_open();   /* the column is set below, in the same tick, before the window is drawn */
    uint32_t window=U32(0x460e70e0u); unsigned track=U8(0x100b14ccu);
    if(!window) ab_window_track=0xff;
    else if(ab_selected_source()) {
        if(track!=ab_window_track) { ab_window_track=track; ab_chooser_row=U32(0x460e738eu); }
        if(U32(0x460e739au) && U32(0x460e738eu)==ab_chooser_row) {
            ((void (*)(void))0x4007893cu)();
            if(U32(0x460e738eu)!=ab_chooser_row)
                ((void (*)(uint32_t,uint32_t))0x4007edb0u)(0x460e7386u,ab_chooser_row);
        }
    } else ab_window_track=track;
}
/* TYPE (slot 6) and FIXD (slot 7) are two-state switches, which draw nothing for other values. A track set up
 * with 0.1.5 can hold one there (FIXD's slot was ACCNT's): put the selected track's back in range, TYPE to
 * 909 (the DSP played any nonzero byte as 909) and FIXD to OFF (0.1.5's varying 909), in both Part copies and
 * the live controls, with the stock SRC SETUP editor's dirty flags. */
static void ab_clamp_switches(volatile uint8_t *part) {
    unsigned track=U8(0x100b14ccu)&7, index=U8(PART_IDX)&3;
    if(!signed_track(part,track)) return;
    for(unsigned k=0;k<2;++k) {
        unsigned offset=0x1da+6+30*track+k;
        uint8_t value=part[offset];
        if(value<=1) continue;
        value=k ? 0 : 1;
        part[offset]=value;
        U8(0x100a4eceu+PART_STRIDE*index+offset)=value;
        U8(0x80000830u+72*track+k)=value;
        U8(U32(BANK)+0x95048u)|=(uint8_t)(1u<<index);
        U8(0x100b145eu)|=(uint8_t)(1u<<index);
        U32(U32(BANK)+0x9b332u)=1;
        U32(0x100f8598u)=1;
    }
}
void ab_ui_tick(void) {
    if(U32(BANK)<0x40000000u || U32(BANK)>=0x48000000u) {
        U32(0x400d5f38u+5*4)=page_for(0); return;
    }
    if(AB_CARD_WINDOW) ab_card_window();
    volatile uint8_t *part=part_base();
    ab_clamp_switches(part);
    U32(0x400d5f38u+5*4)=ab_track_page(part+0x22+(U8(0x100b14ccu)&7));
}
/* Validator temporarily sees stock FLEX defaults for every AB track. All
 * twelve original bytes are restored. Every other Part byte is checked by
 * stock's real validator. The assembly trampoline skips our own detour. */
extern int ab_stock_validate(void *part);
int ab_validate_part(uint8_t *part) {
    uint8_t saved[8][12]; unsigned mask=0;
    const volatile uint8_t *stock=(const volatile uint8_t *)0x400d320cu;
    for(unsigned t=0;t<8;++t) if(signed_track(part,t)) {
        mask|=1u<<t;
        for(unsigned k=0;k<12;++k) {
            unsigned at=(k<6?0x2a:0x1da)+30*t+6+k%6;
            saved[t][k]=part[at]; part[at]=stock[k];
        }
    }
    int result=ab_stock_validate(part);
    for(unsigned t=0;t<8;++t) if(mask&(1u<<t))
        for(unsigned k=0;k<12;++k) {
            unsigned at=(k<6?0x2a:0x1da)+30*t+6+k%6;
            part[at]=saved[t][k];
        }
    return result;
}
/* ABI measured at 4000d430/4000d518. Every track is rendered twice per
 * frame around its event's sample offset; the second call has end=16.
 * Header: source count, ring start, Q26 source rate, Q26 read position.
 * Stock transport converts the high 24 bits of each L/R long to DSP words.
 */
int ab_render(unsigned track,unsigned ping,unsigned start,unsigned end) {
    if(track>=8 || !signed_track(part_base(),track)) {
        return ((int (*)(unsigned,unsigned,unsigned,unsigned))0x40004008u)(track,ping,start,end);
    }
    ++ab_render_calls;
    volatile uint32_t *cursor=(volatile uint32_t *)(uintptr_t)U32(0x80001c80u);
    volatile uint16_t *fp=(volatile uint16_t *)(uintptr_t)U32(0x800062a8u);
    uint8_t p[12];
    for(unsigned k=0;k<12;++k) {
        p[k]=k<6 ? (uint8_t)(fp[k]>>8)
                 : U8(0x80000810u+72*track+0x20+k-6);
    }
    /* FIXD is ON only at its stored 1. A 0.1.5 track keeps ACCNT (0-127) in this slot until it is set again,
     * and plays FIXD OFF meanwhile, not ON for any nonzero accent. */
    p[7]=p[7]==1;
    /* The stock builder calls twice, before and after the event offset.
     * Reserve the same space as FLEX so every later track keeps its record
     * boundary. Once the second segment exists, replace the start with a
     * control record: two signature halves, trig flag, then twelve knobs.
     * The transport sends each long as high/low 16-bit DSP words. */
    {
        unsigned n=end>start && end<=16 ? end-start:0;
        for(unsigned i=0;i<4+2*n;++i) cursor[i]=0;
        if(end==16) {
            /* On the first hit the first renderer can still be stock FLEX.
             * Use the packer's fixed slot, not that second call's cursor. */
            volatile uint32_t *record=(volatile uint32_t *)(uintptr_t)
                (0x80001c90u+(ping&1)*0xa80u+336u*track);
            unsigned trig=(U8(0x46104d0cu+track)&16)!=0;
            record[0]=0xab090000u; record[1]=0x09090000u|trig;
            record[2]=record[3]=0;
            for(unsigned k=0;k<6;++k) record[4+k]=((uint32_t)p[2*k]<<16)|p[2*k+1];
            if(trig) ++ab_hits;
        }
        U32(0x80001c80u)=(uint32_t)(uintptr_t)(cursor+4+2*n);
        return 0;
    }
}

/* Sample-pool sized engine browser: stock list navigation and window chrome.
 * Pin the destination at open, so a track/Part change cannot edit another voice.
 * Entries retain the stored MODEL ids; adding a label alone never adds DSP code.
 */
static uint32_t engine_bank = 0;
static unsigned engine_part = 0, engine_track = 0;
void ab_engine_select(unsigned model) {
    unsigned track=engine_track, part=engine_part;
    if(model>1 || U32(BANK)!=engine_bank || (U8(PART_IDX)&3)!=part ||
       U8(0x100b14ccu)!=track || !ab_selected_source()) return;
    unsigned offset=0x1da+6+30*track;
    part_base()[offset]=(uint8_t)model;
    U8(0x100a4eceu+PART_STRIDE*part+offset)=(uint8_t)model;
    U8(0x80000830u+72*track)=(uint8_t)model;
    /* Same dirty flags and bank notification as the stock SRC SETUP editor. */
    U8(engine_bank+0x95048u)|=(uint8_t)(1u<<part);
    U8(0x100b145eu)|=(uint8_t)(1u<<part);
    U32(engine_bank+0x9b332u)=1;
    U32(0x100f8598u)=1;
    ((void (*)(void))0x40027e00u)();
    ab_ui_tick();
    ((void (*)(void))0x4004d948u)();
}
static void engine_808(void) { ab_engine_select(0); }
static void engine_909(void) { ab_engine_select(1); }
static const char *const engine_labels[]={"001 808", "002 909"};
unsigned ab_engine_draw(void) {
    uint32_t window=U32(0x460e5e30u);
    if(!window || U32(0x460e5e2cu)!=(uint32_t)(uintptr_t)engine_labels) return 0;
    void *surface=(void *)(uintptr_t)(window+0x24);
    ((void (*)(void *))0x4003567cu)(surface);
    int height=(int)U32(window+0x28);
    for(unsigned row=0;row<sizeof(engine_labels)/sizeof(engine_labels[0]);++row) {
        int y=height-23-7*(int)row;
        ((void (*)(uint32_t,void *,int,int,int,const char *))0x40012bd8u)
            (0x400ba876u,surface,5,y,-1,engine_labels[row]);
        if(row==U32(0x460e5e40u))
            ((void (*)(void *,int,int,int,int,int))0x40012254u)
                (surface,3,y-1,(int)U32(window+0x24)-5,y+5,-1);
    }
    U32(0x46c7c72cu)=1;
    return 1;
}
void ab_engine_open(void) {
    static void (*const handlers[])(void)={engine_808, engine_909};
    /* 0.1.6: the 808/909 choice is the TYPE switch on SRC SETUP, so the double-tap shows stock's machine
     * list: the UI tick opens the track's window and puts it on the machine column (ab_ui_tick). */
    /* Open it a few UI ticks later, once the double tap's last key release has passed: a release
     * while the window is open moves it back to the pool column (a visible flicker). */
    if(ab_selected_source() && !U32(0x460e5e30u) && !U32(0x460e70e0u)) ab_open_delay=AB_OPEN_TICKS;
    /* Everything below is the 0.1.5 engine browser, unreachable since 0.1.6. It stays compiled because the card
     * build's list hooks (machine.s ab_list_draw, manifest.py's ab_engine_left) and the CF verifier
     * (verify_analog_bassdrum_cf.py: ab_engine_select) still name its symbols; removing it means removing those too. */
    if(1) return;
    if(!ab_selected_source() || U32(0x460e5e30u)) return;
    engine_bank=U32(BANK);
    engine_part=U8(PART_IDX)&3;
    engine_track=U8(0x100b14ccu);
    unsigned model=part_base()[0x1da+6+30*engine_track]!=0;
    /* Use the stock sample pool's 110 x 64 window at x=-1, y=0.
     * The stock list controller supplies arrows, LEVEL, YES and NO; only
     * its row content and drawing differ from the ordinary sample browser.
     */
    ((void (*)(uint32_t,unsigned,unsigned))0x4007ec60u)
        (0x460e5e38u,6,sizeof(engine_labels)/sizeof(engine_labels[0]));
    ((void (*)(uint32_t,unsigned))0x4007edb0u)(0x460e5e38u,model);
    U32(0x460e5e28u)=(uint32_t)(uintptr_t)handlers;
    U32(0x460e5e2cu)=(uint32_t)(uintptr_t)engine_labels;
    U32(0x460e5e34u)=0;
    uint32_t window=((uint32_t (*)(int,int,int,int,int,uint32_t))0x4005829cu)
        (110,64,-1,0,1,0x4006d754u);
    U32(0x460e5e30u)=window;
    if(!window) return;
    ((void (*)(uint32_t,const char *,unsigned))0x400570b8u)(window,"\xab MACHINE:ANALOG BD",0);
    ((void (*)(uint32_t))0x40031494u)(0x400ce0c4u);
    ab_engine_draw();
}

/* Horizontal navigation mirrors STATIC/FLEX: LEFT returns to the machine
 * column, RIGHT on the signed Analog BD row returns to its engine pool.
 * Other generic lists keep their original no-op LEFT binding. */
void ab_engine_left(void) {
    if(!U32(0x460e5e30u) ||
       U32(0x460e5e2cu)!=(uint32_t)(uintptr_t)engine_labels) return;
    ((void (*)(void))0x4006d754u)();
    ab_stock_pool_open();
    ((void (*)(void))0x4007893cu)();
}
void ab_engine_right(unsigned key,unsigned value) {
    if(U32(0x460e70e0u) && !U32(0x460e739au) &&
       U32(0x460e738eu)==5 && ab_selected_source()) {
        return; /* 0.1.6: no engine browser; RIGHT on the Analog BD row does nothing */
    }
    ((void (*)(unsigned,unsigned))0x4007909cu)(key,value);
}
