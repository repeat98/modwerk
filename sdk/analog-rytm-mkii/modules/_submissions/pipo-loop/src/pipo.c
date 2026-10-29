// SPDX-License-Identifier: GPL-3.0-or-later
// Pipo Loop for the Analog Rytm MKII: ping-pong sample loops.
//
// LOP gets a third value, PIPO (OFF, ON, PIPO): a sample whose effective LOP
// is PIPO plays its loop forward, then backward, and so on. ON stays stock's
// forward loop. The range and the text are build.json's sites; stock reads
// any nonzero LOP as a loop, so a sound saved with PIPO plays as ON on an OS
// without this mod.
//
// The stock sample engine reads each track's effective STA, END and LOP once
// an audio block and plays from STA towards END, backward when END is below
// STA; the play position is an absolute frame index either way. Its prefetch
// copies, a block ahead, a 140-frame window of the sample into SRAM by DMA:
// near the loop's end, the frames up to the end, then the loop's start, so
// the voice wraps mid-block at the exact frame. For a voice in PIPO the
// module turns that wrap into the turn: the gates in audio.s point the DMA
// of the frames past the turn at a buffer holding the loop's frames in
// reverse order (pipo_loop_mirror), so the voice plays straight on into the
// way back, at the exact frame, with stock's own interpolation. The block
// after, this handler moves the position where stock wrapped it to the
// mirrored frame and turns the voice round: while it plays its way back STA
// and END are swapped in the effective parameter array. A new trig starts
// forward again.
//
// The swap does not rely on stock rebuilding the array every block: when the
// values still read as the ones written a block ago, they are put back first.

#include <stdint.h>

#define EFF(t, i) (*(volatile short *)(PARAMS_EFF_AT + (t) * 84 + (i) * 2))
#define IDX_STA 21
#define IDX_END 22
#define IDX_LOP 23
#define VREC(v) (VOICE_REC_AT + (v) * 92)
#define VPOS(v) (*(volatile int *)(VREC(v) + 4))
#define VFRAMES(v) (*(volatile unsigned *)(VREC(v) + 20))
#define OWNER(v) (*(volatile unsigned char *)(VOICE_OWNER_AT + (v)))
#define TRIG_NEXT (*(volatile unsigned *)TRIG_NEXT_AT)   // one bit a voice, as stock's prefetch tests it

#define LOP_PIPO 2          // LOP's third value; stock reads any nonzero LOP as ON
#define VOICES 8
#define TRACKS 12
#define MIN_SPAN 160        // stock plays a loop of at least 141 frames
#define MIRROR 160          // frames in a DMA segment at most (stock: 140 + alignment)
#define TURN_LAG 8          // frames the play position runs ahead of the frames heard (stock's
                            // filter history), measured in rytm-emu: the same at every pitch
#define VDATA(v) (*(volatile short *volatile *)(VREC(v) + 0))

enum { ARM_NONE, ARM_UP, ARM_DOWN };

struct voice {
    int last_pos;                // position a block ago
    int lo, hi;                  // the loop in frames, for c_sta, c_end and c_frames
    int a_lo, a_hi;              // the loop as armed: the one the DMA was mirrored for
    unsigned c_frames;
    short c_sta, c_end;
    short w_sta, w_end;          // what this handler wrote, while wrote is set
    unsigned char fwd;           // STA below END
    unsigned char up;            // the voice moves towards higher frames this block
    unsigned char back;          // playing the way back: STA and END swapped
    unsigned char seen, wrote, track;
    unsigned char arm;           // this block's DMA may carry the turn: ARM_UP at hi, ARM_DOWN at lo
    unsigned char fresh;         // restarted a block ago: the position jumped to STA, not a wrap
};

static struct voice voices[VOICES];
static short mirror[VOICES][MIRROR] __attribute__((aligned(16)));

static int frame_of(unsigned frames, int v8)   // STA/END (8.8, of 120) to stock's frame: ceil(frames * v8 / 30720)
{
    if (v8 < 0)
        v8 = 0;
    return (int)((frames / 30720u) * (unsigned)v8 + ((frames % 30720u) * (unsigned)v8 + 30719u) / 30720u);
}

void pipo_loop_audio(void)
{
    unsigned trig = TRIG_NEXT;
    int v;
    for (v = 0; v < VOICES; v++) {
        struct voice *p = &voices[v];
        int t = OWNER(v), sta, end, pos;
        unsigned frames;
        if (p->wrote) {                  // still as written: stock did not rebuild it
            if (EFF(p->track, IDX_STA) == p->w_sta && EFF(p->track, IDX_END) == p->w_end) {
                EFF(p->track, IDX_STA) = p->w_end;
                EFF(p->track, IDX_END) = p->w_sta;
            }
            p->wrote = 0;
        }
        if (t >= TRACKS || !(EFF(t, IDX_LOP) >> 8)) {   // no voice, or LOP OFF: nothing to follow
            p->back = 0;
            p->seen = 0;
            p->arm = ARM_NONE;
            continue;
        }
        pos = VPOS(v);
        sta = EFF(t, IDX_STA);
        end = EFF(t, IDX_END);
        frames = VFRAMES(v);
        if (sta != p->c_sta || end != p->c_end || frames != p->c_frames) {
            int a = frame_of(frames, sta), b = frame_of(frames, end);
            p->lo = a < b ? a : b;
            p->hi = a < b ? b : a;
            if (p->hi > (int)frames)
                p->hi = (int)frames;
            p->fwd = a < b;
            p->c_sta = sta;
            p->c_end = end;
            p->c_frames = frames;
        }
        if (trig & (1u << v)) {          // restarts from STA this block
            p->back = 0;
            p->arm = ARM_NONE;
            p->fresh = 1;
        } else if (p->fresh)
            p->fresh = 0;
        else if (p->seen && p->arm) {  // did the voice pass the turn the DMA carried?
            int x = 0, r = 0, turned = 1;
            if (p->arm == ARM_UP) {      // past hi, or wrapped by stock to lo + (x - hi)
                if (pos >= p->a_hi)
                    x = pos;
                else if (pos < p->last_pos)
                    x = pos - p->a_lo + p->a_hi;
                else
                    turned = 0;
                r = 2 * p->a_hi - 1 - x + TURN_LAG;
            } else {                     // below lo, or wrapped by stock to hi - (lo - x)
                if (pos < p->a_lo)
                    x = pos;
                else if (pos > p->last_pos)
                    x = pos - p->a_hi + p->a_lo;
                else
                    turned = 0;
                r = 2 * p->a_lo - 1 - x + TURN_LAG;
            }
            if (turned) {                // where the mirrored frames put it, the way back
                int fr = (int)VFRAMES(v);
                if (r < 0)
                    r = 0;
                if (r > fr - 1)
                    r = fr - 1;
                VPOS(v) = r;
                pos = r;
                p->back ^= 1;
            }
        }
        p->last_pos = pos;
        p->seen = 1;
        if ((EFF(t, IDX_LOP) >> 8) != LOP_PIPO     // OFF, or ON: stock's loop
            || p->hi - p->lo < MIN_SPAN) {
            p->back = 0;
            p->arm = ARM_NONE;
        }
        p->up = p->fwd ^ p->back;
        if ((EFF(t, IDX_LOP) >> 8) == LOP_PIPO && p->hi - p->lo >= MIN_SPAN) {
            p->arm = p->up ? ARM_UP : ARM_DOWN;
            p->a_lo = p->lo;             // a block on, the turn is judged against this loop even
            p->a_hi = p->hi;             // if STA or END (an LFO, a turn) has moved since
        }
        if (p->back) {
            EFF(t, IDX_STA) = (short)end;
            EFF(t, IDX_END) = (short)sta;
            p->w_sta = (short)end;
            p->w_end = (short)sta;
            p->wrote = 1;
            p->track = (unsigned char)t;
        }
    }
}

// From the gates in audio.s, as stock's prefetch sets up the DMA of a voice's
// window that wraps at the loop's end. which 1: the segment after hi (stock:
// the loop's start, from wrap_al), for a voice going up; which 2: the main
// segment (stock: from ws_al up to hi), for a voice going down, which reads
// it backward after lo. Returns a buffer of len frames to copy instead,
// holding the loop's frames the other way round from the turn on, or 0 to
// leave stock's.
void *pipo_loop_mirror(int v, int which, int ws_al, int wrap_al, int len)
{
    struct voice *p;
    volatile short *data;
    short *m;
    int frames, i, n, lo, hi;
    if (v < 0 || v >= VOICES || len <= 0 || len > MIRROR)
        return 0;
    p = &voices[v];
    if (p->arm != (which == 1 ? ARM_UP : ARM_DOWN))
        return 0;
    data = VDATA(v);
    frames = (int)VFRAMES(v);
    lo = p->a_lo;
    hi = p->a_hi;
    if (!data || wrap_al != (lo & ~7) || hi > frames)
        return 0;                    // not the window the module expects
    m = mirror[v];
    if (which == 1) {                // window index of hi holds frame hi - 1, then hi - 2, ...
        int off = lo - wrap_al;
        for (i = 0; i < len; i++) {
            n = i < off ? hi - off + i : hi - 1 - (i - off);
            m[i] = data[n < 0 ? 0 : n >= frames ? frames - 1 : n];
        }
    } else {                         // below hi's window index: lo, lo + 1, ... read backward
        int nh = hi - ws_al;
        if (nh <= 0 || nh > MIRROR)
            return 0;
        for (i = 0; i < len; i++) {
            n = i < nh ? lo + (nh - 1 - i) : lo + (i - nh);
            m[i] = data[n < 0 ? 0 : n >= frames ? frames - 1 : n];
        }
    }
    for (i = 0; i < len * 2; i += 16) { // the DMA reads memory, not the data cache: push the
        char *l = (char *)m + i;        // line from every way of its set (the address's low bits
        int w;                          // pick the way, as in poly8)
        for (w = 0; w < 4; w++)
            __asm__ volatile ("cpushl %%dc,(%0)" : : "a" (l + w) : "memory");
    }
    __asm__ volatile ("nop" : : : "memory");   // the pushes reach memory before the DMA starts
    return m;
}
