/* SPDX-License-Identifier: GPL-2.0-or-later */
/* Digitakt I 1.53: independent, ephemeral pitch counters for audio steps. */
#include "digitakt-mk1/core3.h"
#ifdef DT_LINKABLE
#include "core21.h" /* Core 2.1 exports no firmware locations */
#endif
typedef uint32_t u32;
typedef int32_t s32;
typedef uint8_t u8;
#define R(a) (*(volatile u32 *)(a))
#define F(a) ((u32 (*)())(a))
#define ACC 26u
#define RNG 27u
#define DEFAULT_TAG 0xacu
#define STEP_TAG 0xc1u
#define PREPARED 0xacc10000u
#define RESOLVED 0xacc20000u

struct counter { u8 base, amount, range; int8_t next; };
/* UI task allocates once; audio only reads/resets this session-owned table.
 * Saving no ephemeral counters also keeps the shared mod reservation small. */
static struct counter (*counters)[64];
static u32 pattern_seen, reset_seen, ready;
u32 acc_stats[8]; /* prepared, accepted, repeats, resets; diagnostic only */

static int ours(u32 obj,u32 id) {
    return (id==ACC || id==RNG) && obj && R(obj+8)<8;
}
static u8 *data(u32 obj) {
    u32 track=R(obj+4);
    return (u8 *)F(R(R(track)+40))(track);
}
static int valid(u32 id,int v) { return id==ACC ? v>=1 && v<=127 : v>=1 && v<=72; }
static int default_value(const u8 *p,u32 id) {
    int v=p[id==ACC?0x385:0x386];
    return p[0x387]==DEFAULT_TAG && valid(id,v) ? v : (id==ACC?64:12);
}
static int locked_value(const u8 *p,u32 id,u32 step) {
    int v=p[(id==ACC?0x2c0:0x300)+step];
    return p[0x340+step]==STEP_TAG && valid(id,v) ? v : -1;
}
static int effective(const u8 *p,u32 id,u32 step) {
    int v=locked_value(p,id,step);
    return v<0 ? default_value(p,id) : v;
}
static int bound(u32 id,int v) {
    int hi=id==ACC?127:72;
    return v<1?1:(v>hi?hi:v);
}
u32 acc_get(u32 obj,u32 id) {
    u8 *p;
    if (!ours(obj,id)) return F(0x4000f404)(obj,id);
    p=data(obj);
    return (p?default_value(p,id):(id==ACC?64:12))<<8;
}
u32 acc_get_step(u32 obj,u32 id,u32 step) {
    u8 *p; int v;
    if (!ours(obj,id)) return F(0x4000f67c)(obj,id,step);
    p=data(obj); v=p && step<64?locked_value(p,id,step):-1;
    return v<0?0xffffffffu:(u32)v<<8;
}
u32 acc_set(u32 obj,u32 id,u32 value,u32 track,u32 flags,u32 notify) {
    u8 *p;
    if (ours(obj,id) && (p=data(obj))) {
        if (p[0x387]!=DEFAULT_TAG) {
            p[0x385]=64; p[0x386]=12; p[0x387]=DEFAULT_TAG;
        }
        value=bound(id,(s32)value>>8)<<8;
    }
    return F(0x400109d6)(obj,id,value,track,flags,notify);
}
u32 acc_set_step(u32 obj,u32 id,u32 value,u32 step) {
    u8 *p;
    if (ours(obj,id)) {
        p=data(obj);
        if (!p || step>=64 || step>=((u32)p[0x388]<<8|p[0x389])) return 0;
        if (p[0x340+step]!=STEP_TAG) {
            p[0x2c0+step]=255; p[0x300+step]=255; p[0x340+step]=STEP_TAG;
        }
        value=bound(id,(s32)value>>8)<<8;
    }
    return F(0x4000f79c)(obj,id,value,step);
}
u32 acc_change(u32 obj,u32 id,s32 value,s32 delta) {
    if (ours(obj,id)) return bound(id,(value+delta)>>8)<<8;
    return F(0x4000f50a)(obj,id,value,delta);
}
u32 acc_valid(u32 obj,u32 id,s32 value) {
    if (ours(obj,id)) return value>=256 && value<=(id==ACC?127:72)*256;
    return F(0x4000f5da)(obj,id,value);
}
u32 acc_default(u32 obj,u32 id) {
    if (ours(obj,id))
        return F(0x4000fef6)(obj,id,(id==ACC?64:12)<<8,0xffffffffu,0,1,1);
    return F(0x4000ff9a)(obj,id);
}
/* NO+held encoder bypasses the virtual default method. This adapter is
 * installed only at that shortcut's call site, never at the shared setter. */
u32 acc_clear_default(u32 obj,u32 id,u32 value,u32 track,u32 flags,u32 send,u32 notify) {
    if(ours(obj,id))value=(id==ACC?64:12)<<8;
    return F(0x4000fef6)(obj,id,value,track,flags,send,notify);
}
/* Native track/trig paste copies all three spare note lanes. Before its
 * normal changed notification publishes a MIDI track, discard tagged audio
 * settings so they cannot become MIDI chord notes. Untagged MIDI data is
 * untouched. This vtable belongs to the pattern's indexed TrackReference. */
u32 acc_track_changed(u32 obj,u32 info) {
    u32 t=R(obj+0x38),step;
    u8 *p;
    if(t>=8 && t<16 && (p=(u8 *)F(R(R(obj)+40))(obj))) {
        if(p[0x387]==DEFAULT_TAG)p[0x385]=p[0x386]=p[0x387]=64;
        for(step=0;step<64;step++)if(p[0x340+step]==STEP_TAG)
            p[0x2c0+step]=p[0x300+step]=p[0x340+step]=255;
    }
    return F(0x400274dc)(obj,info);
}
/* Labels/popups have no parameter owner. They are UI-only calls; query the
 * selected track, leaving the native descriptors and MIDI mappings intact. */
static int audio_ui(u32 id) {
    if (!ready || (id!=ACC && id!=RNG)) return 0;
    return F(0x4001d24e)(F(0x40014d86)(F(0x4013865a)()))<8;
}
u32 acc_short(u32 obj,u32 id) {
    (void)obj;
    if (audio_ui(id)) return (u32)(id==ACC?"ACC":"RNG");
    return R(0x401a9d9c+(id<164?id:0)*52+48);
}
u32 acc_long(u32 obj,u32 id) {
    (void)obj;
    if (audio_ui(id)) return (u32)(id==ACC?"Note Accumulator":"Accumulator Range");
    return R(0x401a9d9c+(id<164?id:0)*52+40);
}
u32 acc_clear_popup(u32 ui,const char *fmt,const char *name) {
    if(audio_ui(ACC)) {
        if((u32)name==R(0x401a9d9c+ACC*52+40))name="Note Accumulator";
        if((u32)name==R(0x401a9d9c+RNG*52+40))name="Accumulator Range";
    }
    return F(0x40093a6c)(ui,fmt,name);
}
static void format(u32 id,s32 value,char *buf) {
    int n=value>>8;
    if(id==ACC && ready && !counters){
        const char *s="NO RAM";while((*buf++=*s++));return;
    }
    if (id==ACC) {
        n-=64;
        if (!n) { buf[0]='O';buf[1]='F';buf[2]='F';buf[3]=0;return; }
        *buf++=n<0?'-':'+';
        if(n<0)n=-n;
    }
    if(n>=10)*buf++='0'+n/10;
    *buf++='0'+n%10; *buf=0;
}
u32 acc_text(u32 obj,u32 id,s32 value,char *buf) {
    if (ours(obj,id)) { format(id,value,buf); return 0; }
    return F(0x4000f324)(obj,id,value,buf);
}
extern u32 acc_stock_popup(u32,s32);
u32 acc_popup(u32 id,s32 value) {
    static char buf[12];
    if (!audio_ui(id)) return acc_stock_popup(id,value);
    format(id,value,buf);return (u32)buf;
}
u32 acc_gfx(u32 obj,u32 id,s32 value,u32 flag,u32 unused,u32 bmp,s32 x,s32 y) {
    if(ours(obj,id)) {
        char buf[12];
        format(id,value,buf);
        /* Match the native extra-note cell's centered value coordinates.
         * Its stock formatter is signed; RNG needs an unsigned number. */
        return F(0x400c25c0)(bmp,0x4208cc70,x+9,y+6,2,"%s",buf);
    }
    return F(0x4000f2bc)(obj,id,value,flag,unused,bmp,x,y);
}
void acc_tick(void *ctrl) {
    u32 i;struct counter (*p)[64];
    (void)ctrl;
    if(!counters){
        p=(struct counter (*)[64])fw_op_new(8*64*sizeof(struct counter));
        if(p){
            for(i=0;i<8*64;i++)((u32 *)p)[i]=0;
            __asm__ volatile("":::"memory");counters=p;
        }else acc_stats[4]++;
    }
    R(0x4197cfd4)=ACC; R(0x4197cfd8)=RNG;
    ready=1;
}

void acc_reset(void) {
    u32 i; u32 *p=(u32 *)counters;
    if(p)for(i=0;i<8*64;i++)p[i]=0;
    pattern_seen=0; acc_stats[3]++;
}
void acc_render(void) {
    u32 stopped=R(0x4199e120)||R(0x4199e130)||R(0x421b5e24);
    if(stopped && !reset_seen)acc_reset();
    reset_seen=stopped;
}
/* Audio-only spare words +28/+32/+64 are not consumed by the stock audio
 * dispatcher. Native 76-byte cache/retrig copies preserve them. e[6] stays
 * untouched: native note-off matching must retain the original NOTE. */
void acc_prepare(u32 *e,u32 track,const u8 *pattern,u32 step,u32 cache) {
    const u8 *p;
    e[7]=0; e[8]=0; e[16]=0;
    if(track>=8 || step>=64 || (cache && cache!=0x421fa664+track*76))return;
    p=pattern+track*0x38f;
    e[7]=PREPARED|step; e[8]=(u32)pattern;
    e[16]=(effective(p,ACC,step)<<8)|effective(p,RNG,step);
    acc_stats[0]++;
}
void acc_accept(u32 *e) {
    u32 track=e[2],step=e[7]&63,settings=e[16];
    int base=e[6],amount=(settings>>8)-64,range=settings&255,offset,next;
    struct counter *c;
    const u8 *sound=(const u8 *)(e[11]?e[11]:e[10]);
    if(!counters || track>=8 || e[3]!=1 || (e[9]&0x10081)!=0x10081)return;
    if((e[7]&0xffff0000)==RESOLVED) { acc_stats[2]++;return; }
    if((e[7]&0xffff0000)!=PREPARED || (e[9]&0x40000))return;
    /* acc_pattern_s resets at the actual render transition, even without
     * notes. This fallback also initializes isolated/first accepted events. */
    if(e[8]!=pattern_seen) { acc_reset();pattern_seen=e[8]; }
    c=&counters[track][step];
    if(!amount || (sound && sound[0x7e]==120) || base<12 || base>84) {
        c->base=0;return;
    }
    if(c->base!=base || c->amount!=(settings>>8) || c->range!=range) {
        c->base=base;c->amount=settings>>8;c->range=range;c->next=0;
    }
    offset=c->next;
    next=offset+amount;
    if(next>range || next<-range || base+next<12 || base+next>84)next=0;
    c->next=next;
    e[16]=base+offset; e[7]=RESOLVED|step;
    acc_stats[1]++;
}
