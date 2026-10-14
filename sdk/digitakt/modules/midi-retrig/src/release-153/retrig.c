#include "firmware.h"
/* Digitakt mk1 OS 1.53 / 1.54. Original patch code, no vendor source.
 *
 * The assembly veneers serialize access with the firmware's interrupt mask.
 * Each MIDI track retains one owned payload and its parameter locks. The
 * renderer queues only repeats due in the current audio block, so long LEN
 * values cannot fill the scheduler with distant events. A generation number
 * rejects repeats superseded by a new trig in that same block.
 *
 * Timestamp arithmetic is modular; supported durations are below 2^31.
 * Stock LEN values use half the scheduler's timestamp units. Musical time
 * follows tempo changes automatically. Existing MIDI code handles note-offs.
 */
typedef unsigned int u32;
typedef int i32;
typedef unsigned short u16;
typedef unsigned char u8;
typedef signed char i8;
#define U32(a) (*(volatile u32 *)(a))
#define U16(a) (*(volatile u16 *)(a))
#define NEW 0x4d525431u
#define REPEAT 0x4d525432u
/* Firmware returns pointers in D0; use integer-return prototypes. */
#define GET(a) ((u32)((u32 (*)(void))(a))())
#define CALL1(a,p) ((void (*)(u32))(a))((u32)(p))

struct State { u32 *payload; u32 generation, start, next, duration, period; i32 velocity; };
__attribute__((section(".data"))) struct State states[8] = {0};
__attribute__((section(".data"))) u32 pattern = 0;

static void words(u32 *d, const u32 *s, u32 n) { while (n--) *d++ = *s++; }
static void cancel(struct State *s) {
    if (s->payload) CALL1(FW_PAYLOAD_FREE, s->payload);
    s->payload = 0;
    ++s->generation;
}
void cancel_all(void) { u32 i; for (i=0; i<8; ++i) cancel(states+i); }

static u32 muted(u32 track) {
    u32 mask=U32(FW_MUTE_MASK), solo=U32(FW_SOLO_MASK);
    if (solo) mask=~solo;
    return ((mask | U16(FW_PATTERN_MUTE)) >> (track+8)) & 1;
}

static u32 *clone(const u32 *p) {
    const u32 *locks=(const u32 *)p[9];
    u32 *q, *copy;
    /* Stock allocators do not check empty pools. Keep a spare entry. */
    u32 head=U32(FW_PAYLOAD_HEAD);
    if (!head || !U32(head+44)) return 0;
    if (locks) {
        head=U32(FW_LOCKS_HEAD);
        if (*locks>53 || !head || !U32(head+4)) return 0;
    }
    q=(u32 *)GET(FW_PAYLOAD_ALLOC);
    words(q,p,12);
    q[0]=0; q[9]=0; q[11]=0;
    if (locks) {
        copy=(u32 *)GET(FW_LOCKS_ALLOC);
        words(copy,locks,*locks+2);
        copy[1]=0;
        q[9]=(u32)copy;
    }
    return q;
}

void prepare(u32 *event, const u8 *pattern_data, u32 track, u32 step) {
    const u8 *p=pattern_data + track*0x38f + step;
    event[1]=NEW;
    event[13]=p[0x180]; event[14]=p[0x140]; event[15]=(i8)p[0x1c0];
}

void dispatch(u32 *e, u32 time) {
    u32 track, duration;
    u32 *p;
    struct State *s;
    if (e[0]==2) {
        if (e[4]!=pattern) { cancel_all(); pattern=e[4]; }
        return;
    }
    if (e[0]!=3 || e[2]<8 || e[2]>15 || e[3]!=1) return;
    track=e[2]-8; s=states+track; p=(u32 *)e[4];
    if (e[1]==REPEAT) {
        if (!s->payload || e[13]!=s->generation || muted(track) || U32(FW_MIDI_STOP))
            e[3]=(u32)-1;
        return;
    }
    if (p[2]!=1 || !(p[3]&0x80)) return;
    cancel(s);
    if (e[1]!=NEW || !(p[3]&0x8000) || e[13]>16 || e[14]>126 ||
        muted(track) || U32(FW_MIDI_STOP)) return;
    duration=2*((const u32 *)FW_LENGTH_TABLE)[e[14]];
    s->period=((const u32 *)FW_RATE_TABLE)[e[13]];
    if (s->period>=duration) return;
    s->payload=clone(p);
    if (!s->payload) return;
    s->start=time; s->next=time+s->period; s->duration=duration;
    s->velocity=(i32)e[15];
}

void tick(void) {
    u32 i, now=U32(FW_CLOCK), end=now+2*U32(FW_RENDER_DELTA);
    if (U32(FW_RENDER_DISABLED) || U32(FW_TRANSPORT_FLUSH) || U32(FW_MIDI_STOP)) {
        cancel_all(); return;
    }
    for (i=0; i<8; ++i) {
        struct State *s=states+i;
        u32 *p, *e, elapsed, head;
        i32 velocity;
        if (!s->payload) continue;
        if (muted(i) || (i32)(now-s->start)>=(i32)s->duration) { cancel(s); continue; }
        if ((i32)(s->next-end)>=0 || s->next-s->start>=s->duration) continue;
        /* One due event per audio block; never catch up in an unbounded loop. */
        head=U32(FW_EVENT_HEAD);
        if (!head || !U32(head+72) || !U32(FW_HEADER_HEAD)) { cancel(s); continue; }
        p=clone(s->payload);
        if (!p) { cancel(s); continue; }
        e=(u32 *)GET(FW_EVENT_ALLOC);
        e[0]=3; e[1]=REPEAT; e[2]=i+8; e[3]=1; e[4]=(u32)p;
        e[13]=s->generation;
        elapsed=s->next-s->start;
        /* Fixed-point ramp: avoid 64-bit runtime helpers in the interrupt.
         * Keep note-on velocity at least 1; zero means note-off in MIDI. */
        velocity=(i32)s->payload[7]+(s->velocity*(i32)(elapsed/(s->duration/256)))/256;
        if (velocity<1) velocity=1;
        if (velocity>127) velocity=127;
        p[7]=(u32)velocity;
        ((void (*)(u32 *,u32))FW_SCHEDULE)(e,s->next);
        s->next+=s->period;
    }
}
