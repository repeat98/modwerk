/* SPDX-License-Identifier: MIT
 * POLY pool registration adapted from Modwerk VECTOR (repeat98). */
#include <stdint.h>
#include <stddef.h>
#define U8(a) (*(volatile uint8_t *)(uintptr_t)(a))
#define U32(a) (*(volatile uint32_t *)(uintptr_t)(a))
#define BANK_PTR 0x46c82456u
#define PART_IDX 0x100b14cfu
#define TRACK_IDX 0x100b14ccu
#define PATTERN_IDX 0x100b14d0u
#define PART_OFF 0x8ed80u
#define PART_STRIDE 0x18b2u
#define PATTERN_STRIDE 0x8ed8u
#define SRAM_PART 0x100a4eceu
#define SRAM_PATTERNS 0x1001614eu
#define TRANSPORT 0x800065b8u
#define KEY_CACHE 0x46c7d8deu
#define LAYERS 0x460d165cu
#define PAGE_KIND 0x46c7d8d8u
#define SCREEN_DIRTY 0x46c7c72cu
#define SIGNATURE 0x3cu
#define SETTINGS2 0x1ecu
extern void pm_stock_pool_open(void);
static uint32_t pool_bank = 0, pool_part = 0, pool_track = 0;
static uint32_t pool_direct = 0;
static uint32_t pool_browse = 0, limit_pending = 0;
void pm_diagnostic_tick(void);
unsigned pm_selected(void);
void pm_pool_choice_open(void);
static unsigned pool_context(void) {
    return U32(BANK_PTR)==pool_bank && (U8(PART_IDX)&3u)==pool_part &&
           U8(TRACK_IDX)==pool_track && pm_selected();
}
static void redraw(void) {
    ((void (*)(int))0x4004d948u)(-1);
    U32(SCREEN_DIRTY)=1;
}
static int valid_bank(void) { uint32_t b=U32(BANK_PTR); return b>=0x40000000u && b<0x47f00000u; }
static volatile uint8_t *current_part(void) {
    return (volatile uint8_t *)(uintptr_t)(U32(BANK_PTR)+PART_OFF+(U8(PART_IDX)&3u)*PART_STRIDE);
}
static int signed_track(const volatile uint8_t *p, unsigned t) {
    if(t>=8 || p[0x22u+t]!=1) return 0;
    const volatile uint8_t *s=p+SIGNATURE+30u*t;
    return s[0]=='P' && s[1]=='L' && s[2]==1;
}
unsigned pm_selected(void) {
    return valid_bank() && !U8(0x80000015u) && signed_track(current_part(),U8(TRACK_IDX));
}
unsigned pm_type(unsigned type, const volatile uint8_t *ptr) {
    if(!valid_bank()) return type;
    volatile uint8_t *p=current_part();
    uintptr_t t=(uintptr_t)ptr-(uintptr_t)(p+0x22);
    return t<8 && type<2 && signed_track(p,(unsigned)t) ? 5 : type;
}
/* Only the stock sample-slot browser sees the backing machine id. All SRC
 * drawers and the machine chooser continue to identify the track as POLY. */
unsigned pm_chooser_type(unsigned type, const volatile uint8_t *ptr) {
    return pool_direct && pool_context() && ptr==current_part()+0x22u+pool_track
        ? pool_browse : pm_type(type,ptr);
}
static void dirty_part(unsigned part) {
    U8(U32(BANK_PTR)+0x95048u)|=(uint8_t)(1u<<part);
    U8(0x100b145eu)|=(uint8_t)(1u<<part);
    U32(U32(BANK_PTR)+0x9b332u)=1; U32(0x100f8598u)=1;
    ((void (*)(void))0x40027e00u)();
}
static void no_timestretch(volatile uint8_t *part, volatile uint8_t *mirror, unsigned t) {
    /* POLY has independent playback heads. TSTR cannot follow independent pitches. */
    for(unsigned pool=0;pool<2;++pool) part[0x1dau+30u*t+6u*pool+4u]=
        mirror[0x1dau+30u*t+6u*pool+4u]=0;
}
/* PL/1 marks POLY without replacing the native backing-machine byte.
 * Only three unused NEIGHBOR bytes are owned, mirrored with the Part. */
unsigned pm_assign(volatile uint8_t *part, unsigned t, unsigned enabled) {
    if(!valid_bank() || t>=8) return 1;
    uint32_t offset=(uint32_t)(uintptr_t)part-U32(BANK_PTR)-PART_OFF;
    if(offset%PART_STRIDE || offset/PART_STRIDE>=4) return 1;
    volatile uint8_t *mirror=(volatile uint8_t *)(uintptr_t)(SRAM_PART+offset);
    unsigned pool=1; /* STATIC needs an independent streaming-cache implementation. */
    unsigned sig=SIGNATURE+30u*t;
    unsigned was_poly=signed_track(part,t) || part[0x22u+t]==5;
    if(pool_direct && pool_context() && part==current_part() && t==pool_track)
        enabled=2; /* Slot YES preserves POLY and the saved LOOP choice. */
    if(enabled) {
        /* One POLY per Part (the eight audio tracks), including both SRC
         * commit paths and sample-browser confirmation. Refusal occurs before
         * marker, settings or sample writes. Inactive Parts may each own one. */
        for(unsigned other=0;other<8;++other)
            if(other!=t && (signed_track(part,other) || part[0x22u+other]==5))
                { limit_pending=1; return (unsigned)-1; }
        part[sig]='P'; part[sig+1]='L'; part[sig+2]=1;
        no_timestretch(part,mirror,t);
    } else if(signed_track(part,t)) {
        part[sig]=part[sig+1]=part[sig+2]=0;
    }
    /* Stage all reads before stores: MOVE.B (a0)+,(a0,delta) otherwise
     * shifts the battery-RAM marker by one byte on this m68k backend. */
    uint8_t sig0=part[sig],sig1=part[sig+1],sig2=part[sig+2];
    mirror[sig]=sig0; mirror[sig+1]=sig1; mirror[sig+2]=sig2;
    if(enabled==1) {
        /* Only a new machine assignment takes the default; sample-browser
         * confirmation and saved Parts retain the musician's LOOP choice. */
        if(!was_poly)
            part[0x1dau+30u*t+6u*pool]=mirror[0x1dau+30u*t+6u*pool]=0;
    }
    return pool;
}
/* Explicit double-TRACK/RIGHT browsing opens the native FLEX slots. Machine
 * assignment leaves the stock page in place, like FLEX/STATIC. LEFT returns
 * to the machine list; YES retains native sample-browser behavior. */
unsigned pm_pool_choice_draw(void) { return 0; }
void pm_pool_choice_open(void) {
    if(!pm_selected() || U32(0x460e5e30u) || U32(0x460e70e0u)) return;
    pool_bank=U32(BANK_PTR); pool_part=U8(PART_IDX)&3u; pool_track=U8(TRACK_IDX);
    pool_browse=1; pool_direct=1;
    pm_stock_pool_open();
    redraw();
}
void pm_pool_left(unsigned key,unsigned edge) {
    if(!U32(0x460e70e0u)) return;
    /* The slot browser was opened with FLEX's id. Restore the native list
     * cursor as well as the POLY identity before drawing its machine pane.
     * Repeated LEFT must not reset a machine the user has since browsed to. */
    unsigned returning=pool_direct && pool_context() && U32(0x460e739au);
    pool_direct=0;
    if(returning)
        ((void (*)(unsigned,unsigned))0x4007edb0u)(0x460e7386u,5);
    ((void (*)(unsigned,unsigned))0x4007893cu)(key,edge);
}
void pm_pool_right(unsigned key,unsigned edge) {
    if(U32(0x460e70e0u) && !U32(0x460e739au) && U32(0x460e738eu)==5 && pm_selected()) {
        ((void (*)(void))0x400789e4u)();
        pm_pool_choice_open();
        return;
    }
    ((void (*)(unsigned,unsigned))0x4007909cu)(key,edge);
}

/* Legacy POLY95 raw type 5 is upgraded to signed FLEX in both Part copies.
 * No sample, SRC, AMP or FX settings are changed. */
extern volatile uint32_t pm_ui_ticks;
void pm_ui_tick(void) {
    ++pm_ui_ticks;                     /* the voice governor's sign that the UI runs (pool.c) */
    pm_diagnostic_tick();
    if(!valid_bank()) return;
    /* The stock commit finishes installing its menu layer before the next
     * UI tick. Opening here keeps the acknowledgement above that layer. */
    if(limit_pending) {
        limit_pending=0;
        /* Duration zero installs stock's NO-dismissed input layer. Bound its
         * native timer afterwards: stock's timeout closes both the window and
         * that input layer, so an unattended refusal cannot retain the panel. */
        ((void (*)(const char *,unsigned))0x4005a2b8u)("ONE POLY8 PER PART",0);
        if(U32(0x460d1e70u)) U32(0x460d1e6cu)=120;
    }
    unsigned part=U8(PART_IDX)&3u;
    volatile uint8_t *p=current_part();
    volatile uint8_t *mirror=(volatile uint8_t *)(uintptr_t)(SRAM_PART+part*PART_STRIDE);
    unsigned changed=0;
    for(unsigned t=0;t<8;++t) if(p[0x22+t]==5) {
        unsigned sig=SIGNATURE+30*t;
        p[sig]=mirror[sig]='P'; p[sig+1]=mirror[sig+1]='L'; p[sig+2]=mirror[sig+2]=1;
        p[0x22+t]=mirror[0x22+t]=1; no_timestretch(p,mirror,t); changed=1;
    }
    if(changed) dirty_part(part);
    if(pool_direct && (!U32(0x460e70e0u) || !pool_context())) pool_direct=0;
    unsigned t=U8(TRACK_IDX), pool=t<8?p[0x22+t]:1;
    U32(0x400d5f4cu)=pool==0?0x400d301cu:0x400d31aeu;
}

unsigned pm_is_poly_track(unsigned track) {
    return track<8 && valid_bank() &&
        (signed_track(current_part(),track) || current_part()[0x22u+track]==5);
}
