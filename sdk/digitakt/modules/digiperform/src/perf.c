/* Digi Perform: performance macros for the Digitakt. Eight macros on the DATA ENTRY knobs A-H, each
 * adding an offset to any number of track parameters at once.
 *
 * The model is the Analog Rytm's: one pool of assignments shared by all macros (Rytm manual 10.4),
 * driven the way the Analog Four drives its macros, by a knob (Analog Four manual 9.3). An entry is
 *
 *      KNOB:  the macro it belongs to, A-H: the entry's index
 *      TRACK: the track whose parameter it moves, 1-8 (a MIDI track 1-8 for a CC slot)
 *      PARAM: one of the sound's parameter slots 1..45 (LFO, SRC, FLTR, AMP pages), or 46..53: a MIDI track's
 *             CC VAL 1..8, sent as MIDI (see IS_CC)
 *      DIR:   + (the knob raises the parameter) or - (it lowers it)
 *
 * There is no depth: a knob spans the parameter's whole range, 0..127 as on its page. When the page
 * opens, each knob picks up the current value of its macro's first entry (inverted for a - entry), so it
 * shows the parameter where it is and nothing jumps. Turning it then moves every entry of the macro by
 * the same amount from that entry's own starting value, clamped at the ends of its range. The change is
 * added after the engine has smoothed and LFO-modulated the parameter words, once per audio block, as
 * Digi Matrix does for its LFO routings. It is never a parameter lock and never changes the stored value:
 * leaving the page, or opening the EDIT view, returns every parameter to what the sound has stored,
 * the way the Analog Rytm's macros let go of a parameter when the pad is released.
 *
 * Storage: the pool belongs to the pattern. Eight entries of 11 bits and a 2-bit version live in the bytes of
 * tracks 5..8's sounds that nothing else claims (kitstore.h): per track, byte 3 bits 0..6, byte 4 and byte 5,
 * 23 bits, 92 in all, read as one stream from track 5 on:
 *
 *      bits 0..87 eight entries of 11 bits, the top bit first: all tracks, track (3), param (6, 0 = empty), negative.
 *                 Params 46..53 are CC slots (0.1.4 on); earlier versions skip any param above 45 as empty
 *      bits 88..89 version, 1 = this layout, 0 = nothing stored (anything else is read as empty)
 *      bits 90..91 reserved, left as they are
 *
 * The macro knobs' own values are not stored: they are picked up from the parameters when the page opens.
 *
 * UI: SETTINGS > PERFORM opens the EDIT view: eight rows, one per knob A-H, each a track, a parameter and a
 * direction; LEVEL or UP/DOWN choose a row, knobs A-C set its track, parameter and direction, YES makes or
 * removes it. A second press of TRIG on the TRIG page opens the PLAY view: eight round knobs like the MIDI
 * CC page's, each with its parameter's track in the knob and its name (four letters) under it, which becomes
 * the value for a second after the knob moves; knobs A-H turn the macros, pressing and turning goes in larger
 * steps, and FUNC + a knob's push opens the EDIT view at that knob. NO goes back, then leaves. FUNC + REC /
 * STOP / PLAY copy, paste and clear the selected knob's assignment.
 *
 * Adapted from Digi Matrix by the digi1_mods authors (MIT), see NOTICE.
 */

/* ---- firmware addresses that moved in OS 1.54 ---- */
#ifdef OS154
#define F_400c19a6 0x400c1bce
#define F_400c257c 0x400c27a4
#define F_400c9812 0x400c9a3a
#define F_40200b0c 0x40200ebc
#define F_4199dc44 0x4199ec44
#define F_ISHELD   0x400d399c
#define F_LABEL_FONT 0x401fe44c
#define F_HDRMSG   0x40093ab0
#define F_PTABLE   0x401aa09c
#define F_ICON_FONT  0x401fce60
#define F_LETTER_FONT 0x401f9510
#define F_TITLE_FONT 0x401fd57c
#define F_PATTERN  0x4197c6c7
#define F_ENC_ACC  0x400c06ae
#define F_ENC_DECAY 0x400c05f4
#define F_APP      0x421fac10
#define F_WIMAGE   0x406490e8
#define F_KIT0     0x4191f018
#define F_CC_SEND  0x400e0b94
#else
#define F_400c19a6 0x400c19a6
#define F_400c257c 0x400c257c
#define F_400c9812 0x400c9812
#define F_40200b0c 0x40200b0c
#define F_4199dc44 0x4199dc44
#define F_ISHELD   0x400d3774
#define F_LABEL_FONT 0x401fe09c
#define F_HDRMSG   0x40093a6c
#define F_PTABLE   0x401a9d9c
#define F_ICON_FONT  0x401fcab0
#define F_LETTER_FONT 0x401f9160
#define F_TITLE_FONT 0x401fd1cc
#define F_PATTERN  0x4197b6c7
#define F_ENC_ACC  0x400c0486
#define F_ENC_DECAY 0x400c03cc
#define F_APP      0x421f9c10
#define F_WIMAGE   0x406480e8
#define F_KIT0     0x4191e018
#define F_CC_SEND  0x400e096c
#endif

typedef unsigned int u32;
typedef unsigned short u16;

#define ENGINE_KIT   (*(unsigned char *volatile *)0x800019ac)
#define UI_KIT       (*(unsigned char *volatile *)F_4199dc44)
#define PATTERN      (*(volatile unsigned char *)F_PATTERN)   /* the pattern being played, 0..127: bank letter and number as the header shows them */
/* the pattern the sequencer plays, as the audio engine has it (fast SRAM, the same on both OS releases): it follows PATTERN at once when stopped,
 * and when the new pattern's sound starts if it plays; PATTERN itself is the selection */
#define EPAT         (*(volatile unsigned char *)0x80001782)
static int engine_sig(void)                 /* the engine's pattern bytes together: the same bytes in its three copies of the track state, all changing at the switch */
{
    static const unsigned short at[6] = {0x1782, 0x1881, 0x29f2, 0x2af1, 0x3050, 0x324d};
    int i, h = 0;
    for (i = 0; i < 6; i++)
        h = h * 31 + *(volatile unsigned char *)(0x80000000 + at[i]);
    return h;
}
#define INVALIDATE   ((void (*)(void *))F_400c9812)
#define FILLRECT     ((void (*)(void *, int, int, int, int, int))F_400c19a6)
#define TEXT         ((void (*)(void *, const void *, int, int, int, const char *, ...))F_400c257c)
#define FONT5        ((const void *)F_40200b0c)
#define ICON_FONT    ((const void *)F_ICON_FONT)        /* the small bold font of the track box's name and the pattern cell */
#define TITLE_FONT   ((const void *)F_TITLE_FONT)       /* the stock pages' title font, 4 x 6, with lower case */
#define LETTER_FONT  ((const void *)F_LETTER_FONT)      /* 5 x 9: the big letter in the track box */
#define LABEL_FONT   ((const void *)F_LABEL_FONT)       /* the stock pages' label font, about 4 px a character */
/* The stock knob graphic, the SRC page's parameter object method (the same address on 1.53 and 1.54):
 * (obj, id, value, flag, -, bmp, x, y). obj is not read. The look depends on the id only; 148 is a MIDI
 * CC VAL knob (ids 148-155), the plain round one (156-163, CC SELECT, are text boxes). value is 8.8, 0..0x7f00; the graphic spans x + 1 to
 * x + 17 and y to y + 16. */
#define KNOB_GFX     ((void (*)(void *, int, int, int, int, void *, int, int))0x4000f2bc)
#define KNOB_ID      148
/* whether a panel key is held; 1 is FUNC (the same call sample-tools uses for FUNC + encoder) */
#define HDR_PIXELS   107                     /* the room for text in the header bar */
#define KEYHELD(k)   (((u32 (*)(int))F_ISHELD)(k))
#define KEY_FUNC     1
static int step_held(void)
{
    int i;
    for (i = 24; i <= 39; i++)
        if (KEYHELD(i))
            return 1;
    return 0;
}

/* The smoothed parameter words the engine plays from: 53 words a voice, slot s of voice v at
 * base + 18 + 106 * v + 2 * s. */
#define VOICE(p, v)  ((volatile short *)((char *)(p) + 18 + 106 * (v)))
/* The firmware's parameter table: 13 words an id, the minimum and the maximum (8.8) in words 2 and 3. Every page
 * knob is one id; the sound's slot s is the id slot_id(s) (checked by turning the knobs of the pages on OS 1.54). */
#define PTABLE       ((volatile int *)F_PTABLE)
static int slot_id(int s)
{
    if (s <= 8)
        return s + 51;                       /* LFO 1 */
    if (s <= 16)
        return s + 52;                       /* LFO 2 */
    if (s <= 24)
        return s + 91;                       /* SRC */
    if (s >= 29 && s <= 32)
        return s + 5;                        /* filter envelope */
    if (s <= 28)
        return s == 25 ? 33 : s == 26 ? 30 : s == 27 ? 32 : 38;   /* type, frequency, resonance, depth */
    if (s <= 35)
        return s == 33 ? 40 : s == 34 ? 41 : 39;   /* the second page's slots run base, width, delay (not the ids' order delay, base, width) */
    return s + 6;                            /* the rest of the filter, then AMP */
}
/* A knob can also move one of a MIDI track's eight CC values (FLTR page, VAL1..VAL8): parameters 46..53, the entry's track then
 * the MIDI track 0..7. Only a slot the track has turned on (FUNC + push on its knob) can be chosen; its CC number and channel are the
 * track's own. The knob never changes the stored value: it sends the stored value moved by the knob, and the stored one again when
 * it lets go. A MIDI track's record is 56 words at kit + 0x59a + 0x70 t: CC VAL n at word 24 + n (8.8, 0..127), and word 55 bit
 * 7 + n set while VAL n is on (measured on OS 1.54 in the emulator). The firmware's ids of VAL1..VAL8 are 148..155. */
#define CC_FIRST   46
#define CC_LAST    53
#define IS_CC(p)   ((p) >= CC_FIRST && (p) <= CC_LAST)
#define CC_SLOT(p) ((p) - CC_FIRST)
#define dest_ok(p) ((p) && ((p) <= DEST_LAST || IS_CC(p)))   /* a parameter this build moves */
#define CC_ID(s)   (148 + (s))
#define CC_REC(kit, t) ((volatile short *)((kit) + 0x59a + 0x70 * (t)))
#define CC_WORD(s) (25 + (s))
#define CC_ON(kit, t, s) (((u16)CC_REC(kit, t)[55] >> (8 + (s))) & 1)
/* the stock CC page's send: (value 8.8, MIDI track 0..7, word index). It queues one message per track and slot with interrupts
 * off (a newer value replaces one not sent yet); the MIDI track's channel and CC SELECT number go with it as for a stock turn */
#define CC_SEND    ((void (*)(int, int, int))F_CC_SEND)
/* The SRC knobs are the machine's own: each machine's SRC layout names its eight ids (SLICE's SLICE knob is not ONESHOT's START). lids[t]
 * holds track t's, read from the layout in the UI while the track's machine stays (lmach[t]); 0 is a knob the machine leaves empty, and it
 * keeps the stock id. The engine reads only these bytes. */
static volatile unsigned char lmach[8] = {255, 255, 255, 255, 255, 255, 255, 255};
static volatile unsigned char lids[8][8];
static volatile short lmin[8][8], lmax[8][8];   /* their ranges (8.8), as the SRC page has them for the machine */
static volatile unsigned char lhas[8];      /* the track's machine has an SRC layout: a 0 in it is a knob the machine does not have */
static unsigned char lrv[8];                /* its ranges were read through the page's knob object (a mod may answer only there) */
static int pid(int t, int p)
{
    int i;
    if (p >= 17 && p <= 24 && t >= 0 && t < 8 && (i = lids[t][p - 17]) != 0)
        return i;
    if (IS_CC(p))
        return CC_ID(CC_SLOT(p));
    return slot_id(p);
}
#define KTRK(e)    (E_ALL(e) ? 0 : E_TRK(e))   /* the track a knob reads: an ALL knob takes track 1's value, so its range and text too */
static int srcknob(int t, int p) { return p >= 17 && p <= 24 && t >= 0 && t < 8 && lids[t][p - 17]; }
/* an SRC knob the track's machine leaves empty: the SRC page draws an empty box there, so nothing to name, show or move */
static int srcempty(int t, int p) { return p >= 17 && p <= 24 && t >= 0 && t < 8 && lhas[t] && !lids[t][p - 17]; }
static int pminw(int t, int p) { return IS_CC(p) ? 0 : srcknob(t, p) ? lmin[t][p - 17] : PTABLE[pid(t, p) * 13 + 2]; }   /* the same in the parameter's own 8.8 words */
static int pmaxw(int t, int p) { return IS_CC(p) ? 0x7f00 : srcknob(t, p) ? lmax[t][p - 17] : PTABLE[pid(t, p) * 13 + 3]; }
static int pmin(int t, int p) { return pminw(t, p) >> 8; }
static int pmax(int t, int p) { return pmaxw(t, p) >> 8; }
static int prange(int t, int p) { return pmax(t, p) > pmin(t, p) ? pmax(t, p) - pmin(t, p) : 1; }

/* ---- the stock knob feel: the firmware's own encoder acceleration, per-parameter step sizes and snaps ---------
 * A page knob's turn goes through the firmware's accelerator (it keeps a state per encoder and decays it ten times
 * a second), scaled by the parameter's plain or push multiplier from its record in the firmware's UI table; with
 * FUNC held the record's snap function picks the value. The macros call the same code on a state of their own. */
#define ENC_DESC     ((const int *(*)(int))0x40065794)
#define ENC_ACC      ((int (*)(void *, int, int, const void *, int))F_ENC_ACC)
#define ENC_DECAY    ((void (*)(void *, void *))F_ENC_DECAY)
static int encst[64];                       /* the accelerator's state, 0x14 bytes an encoder from 0x20, as the firmware clears it */
static unsigned char encinit;
static unsigned char encdiv;
static int selacc[2];                       /* the track and parameter choosers' words that have not made a step yet */
static unsigned char snapprev;              /* the last turn was a FUNC turn the firmware snaps (its own flag at 0x40648ca8) */
#define ENC_LOCK(k) (encst[(0x20 + 0x14 * (k) + 4) / 4])   /* the knob's lock: turns are ignored while it is above 0, and the decay runs it down 10 times a second */

static void enc_reset(void)
{
    int i;
    for (i = 0; i < 64; i++)
        encst[i] = 0;
    for (i = 0; i < 10; i++)
        encst[(0x20 + 0x14 * i + 0x10) / 4] = 0x30;
    encinit = 1;
    encdiv = 0;
    snapprev = 0;
    selacc[0] = selacc[1] = 0;
}

/* a turn of delta raw counts on knob k of the parameter whose firmware id is sid: the accelerated change in the parameter's words */
static int enc_delta(int k, int sid, int delta, int push)
{
    const int *d = ENC_DESC(sid);
    const char *src = (const char *)d[4];
    char cfg[28];
    int i;
    for (i = 0; i < 28; i++)
        cfg[i] = src[i];
    return ENC_ACC(encst, k, delta * (push ? d[2] : d[1]), cfg, push);
}
/* the track and parameter choosers feel like the SAMP selector: the same accelerator and step size run on the SAMP record (id 111), and
 * the words it returns add up to whole steps of 256. sel is 0 for the track chooser and 1 for the parameter chooser (the encoder states 8 and 9). */
#define SEL_ID 111
static int sel_steps(int sel, int delta)
{
    int n;
    selacc[sel] += enc_delta(8 + sel, SEL_ID, delta, 0);
    n = selacc[sel] / 256;
    selacc[sel] -= n * 256;
    return n;
}
/* the firmware's own name and value text for a parameter id (both return a pointer in d0) */
#define STOCK_NAME   ((u32 (*)(int, int))0x4000feac)
#define STOCK_VALUE  ((u32 (*)(int, int))0x400657ee)
/* the header's message, "Name=value", which the stock pages show as a knob turns and then slides away:
 * (header, format, ...). The header is the page view's member at +0x6c. */
#define HDR_MSG      ((void (*)(void *, const char *, ...))F_HDRMSG)

#include "kitstore.h"

#define NENT       8                        /* one assignment a knob */
#define NKNOB      8
#define DEST_FIRST 1
#define DEST_LAST  45
#define KS_SLOT_PERF 49                     /* the marker, kept on tracks 5..8 only: tracks 1..4 use slots 48 and 49 for the EQ */
#define KS_TRACKS    0xf0                   /* tracks 5..8 */

/* ---- the pool ----------------------------------------------------------------------------------- */

#define E_TRK(e)   (((e) >> 10) & 7)
#define E_PAR(e)   (((e) >> 4) & 63)
#define E_NEG(e)   (((e) >> 3) & 1)
#define E_ALL(e)   (((e) >> 13) & 1)         /* the parameter of every audio track, the offset the same for each */
#define TGT(e)     (E_ALL(e) ? 8 : IS_CC(E_PAR(e)) ? 9 + E_TRK(e) : E_TRK(e)) /* the entry's target: a track 0..7, 8 for all, 9..16 a MIDI track */
#define T_MIDI     9                         /* the first MIDI track's target */
#define T_LAST     16
#define ENTRY(t, p, neg) \
    ((u16)(((t) << 10) | ((p) << 4) | ((neg) ? 8 : 0)))

/* the pool is one stream of PBITS bits: track 5's 23 bits, then track 6's, and so on. Bit r of a track's 23:
 * 0..6 are bits 0..6 of byte 3, 7..14 byte 4, 15..22 byte 5 */
#define PBITS      92
#define ENT_BITS   11
#define VER_BIT    (NENT * ENT_BITS)        /* 88: the 2-bit version */
#define VER_NOW    1
static volatile unsigned char *pbyte(unsigned char *kit, int n, int *bit)
{
    int t = 4 + n / 23, r = n % 23;
    if (r < 7) {
        *bit = r;
        return &XB(kit, 6 * t + 3);
    }
    *bit = (r - 7) % 8;
    return &XB(kit, 6 * t + 4 + (r - 7) / 8);
}
static int pget(unsigned char *kit, int n)
{
    int bit;
    volatile unsigned char *p = pbyte(kit, n, &bit);
    return (*p >> bit) & 1;
}
static void pput(unsigned char *kit, int n, int v)
{
    int bit;
    volatile unsigned char *p = pbyte(kit, n, &bit);
    *p = (unsigned char)((*p & ~(1 << bit)) | ((v & 1) << bit));
}
static unsigned char pmask(int n)           /* the bits of byte n the pool owns */
{
    int t = n / 6, r = n % 6;
    if (t < 4)
        return 0;
    return r == 3 ? 0x7f : (r == 4 || r == 5) ? 0xff : 0;
}
static struct kstore store;

static int pver(unsigned char *kit) { return pget(kit, VER_BIT) | pget(kit, VER_BIT + 1) << 1; }

/* The engine reads every entry on every audio block, so a pool is decoded only when its 92 bits have changed:
 * the four 23-bit words are compared with the last ones decoded. The UI (the page, the keys) and the engine
 * (the audio block) each keep a copy of their own: they run at different times, often on different kits while a
 * pattern change is pending, and neither may overwrite the other's half-made decode. */
struct pool {
    u32 w[4];
    u16 e[NENT];
    int ok;
};
static struct pool pool_ui, pool_eng;

/* the 23 pool bits of track t (a constant 4..7): bits 0..6 of byte 3, bytes 4 and 5 */
#define PW(kit, t) ((u32)(XB(kit, 6 * (t) + 3) & 0x7f) | (u32)XB(kit, 6 * (t) + 4) << 7 | (u32)XB(kit, 6 * (t) + 5) << 15)

static void pool_sync(struct pool *pl, unsigned char *kit)
{
    u32 w[4];
    int t, b, n, r = 0, ver;
    w[0] = PW(kit, 4);
    w[1] = PW(kit, 5);
    w[2] = PW(kit, 6);
    w[3] = PW(kit, 7);
    if (pl->ok && w[0] == pl->w[0] && w[1] == pl->w[1] && w[2] == pl->w[2] && w[3] == pl->w[3])
        return;
    ver = (int)(w[3] >> 19 & 3);                 /* stream bits 88, 89 */
    t = 0;
    for (n = 0; n < NENT; n++) {
        int v = 0;
        for (b = 0; b < ENT_BITS; b++) {
            v = (v << 1) | (int)(w[t] >> r & 1);
            if (++r == 23) {
                r = 0;
                t++;
            }
        }
        pl->e[n] = ver != VER_NOW ? 0 :
            (u16)(((v >> 10 & 1) << 13) | ((v >> 7 & 7) << 10) | ((v >> 1 & 63) << 4) | ((v & 1) << 3));
    }
    for (t = 0; t < 4; t++)
        pl->w[t] = w[t];
    pl->ok = 1;
}

/* an entry as the rest of the code reads it: bits 15..13 are unused here, see E_ALL and friends */
static u16 entry(unsigned char *kit, int i)
{
    pool_sync(&pool_ui, kit);
    return pool_ui.e[i];
}

static u32 lock(void)
{
    u32 sr;
    __asm__ volatile("move.w %%sr,%0\n\tmove.w #0x2700,%%sr" : "=d"(sr) : : "memory");
    return sr;
}

static void unlock(u32 sr) { __asm__ volatile("move.w %0,%%sr" : : "d"(sr) : "memory"); }

/* Selecting a pattern while the sequencer plays swaps the kit's bytes at once, but the old pattern plays on until its end. The engine keeps using
 * the old pattern's assignments (a copy taken just before) until the new pattern plays, so the knobs let go then. Otherwise the copy is the UI's
 * decode of the playing kit, refreshed each tick and at each edit: a moved knob's block reads it rather than decoding the kit's bits again. */
static volatile u16 shadow[NENT];
static volatile unsigned char pending;

static void moving_update(void);

/* The Digitakt starts from its working image, not from the saved project: a serialized copy of the project in RAM
 * (F_WIMAGE, 0x372b14 bytes) that every stock edit writes at once and that the firmware writes to the +Drive at
 * power-off; LOAD PROJECT fills it from the project. SAVE PROJECT does not touch it, so the pool bytes, which are
 * only written to the kit, were lost at the next power cycle. So each change of them is copied into the image too.
 * There pattern p's kit starts at +0x310334 + 0xa00 p, track t's sound 0xa0 bytes apart, its spare bytes 8 bytes in
 * (measured: a save writes them to the +Drive at these places, and a cold boot from that image puts them back). Only
 * the bits the pool owns are copied; bit 7 of byte 3 stays the image's own. */
#define KIT_STRIDE 0x91e
static void img_sync(unsigned char *kit)
{
    int d = (int)(kit - (unsigned char *)F_KIT0), t;
    volatile unsigned char *img;
    if (d < 0 || d % KIT_STRIDE || d / KIT_STRIDE >= 128)
        return;                              /* not one of the 128 pattern kits: nothing to mirror */
    img = (volatile unsigned char *)F_WIMAGE + 0x310334 + 0xa00 * (d / KIT_STRIDE);
    for (t = 4; t < 8; t++) {
        volatile unsigned char *r = img + 0xa0 * t + 8;
        r[3] = (unsigned char)((r[3] & 0x80) | (XB(kit, 6 * t + 3) & 0x7f));
        r[0x14] = XB(kit, 6 * t + 4);
        r[0x15] = XB(kit, 6 * t + 5);
    }
}

/* the bytes change with interrupts off, so the engine never reads half of an old entry. A pool with no
 * version of ours is cleared first, and the version set; the reserved bits are never written. */
static void cc_letgo(int k);
static void put_entry(unsigned char *kit, int i, u16 e)
{
    int b, v = ((e >> 13 & 1) << 10) | ((e >> 10 & 7) << 7) | ((e >> 4 & 63) << 1) | (e >> 3 & 1);
    u32 sr;
    if (i >= 0 && i < NENT && e != entry(kit, i))
        cc_letgo(i);                         /* a CC knob reassigned or removed: its synth gets the stored value back */
    sr = lock();
    if (pver(kit) != VER_NOW) {
        for (b = 0; b < VER_BIT; b++)
            pput(kit, b, 0);
        pput(kit, VER_BIT, VER_NOW & 1);
        pput(kit, VER_BIT + 1, VER_NOW >> 1);
    }
    for (b = 0; b < ENT_BITS; b++)
        pput(kit, i * ENT_BITS + b, v >> (ENT_BITS - 1 - b));
    if (!pending && i >= 0 && i < NENT)
        shadow[i] = e;                       /* the engine's copy has the edit at once */
    img_sync(kit);                           /* and the working image, so a power cycle keeps it */
    unlock(sr);
    moving_update();                         /* and so has the list of moved parameters */
}

/* ---- the parameters a macro can move: the sound's slots 1..45 ------------------------------------ */

static const char *const dnames[DEST_LAST + 1] = {
    0,
    "L1.SPD", "L1.MUL", "L1.FADE", "L1.DEST", "L1.WAVE", "L1.PHAS", "L1.MODE", "L1.DEP",
    "L2.SPD", "L2.MUL", "L2.FADE", "L2.DEST", "L2.WAVE", "L2.PHAS", "L2.MODE", "L2.DEP",
    "SRC.TUNE", "SRC.PLAY", "SRC.BITR", "SRC.SAMP", "SRC.STRT", "SRC.LEN", "SRC.LOOP", "SRC.LVL",
    "FLT.TYPE", "FLT.FREQ", "FLT.RESO", "FLT.ENV", "FLT.ATK", "FLT.DEC", "FLT.SUS", "FLT.REL",
    "FLT.BASE", "FLT.WDTH", "FLT.DEL", "FLT.SRR", "FLT.ROUT",
    "AMP.ATK", "AMP.HOLD", "AMP.DEC", "AMP.OVER", "AMP.DEL", "AMP.REV", "AMP.PAN", "AMP.VOL"
};
#define DEFAULT_PARAM 17                    /* SRC.TUNE */
/* the order the lists step through the parameters: SRC, FILTER, AMP, LFO 1, LFO 2 (the sound's slots run LFO 1, LFO 2, SRC, FILTER, AMP) */
#define OPOS(p)    ((p) >= 17 ? (p) - 17 : (p) + 28)
#define OPAR(i)    ((i) <= 28 ? (i) + 17 : (i) - 28)
static const char *const knobname[NKNOB] = {"A", "B", "C", "D", "E", "F", "G", "H"};

/* ---- the audio engine: after the LFO stage ------------------------------------------------------ */

static volatile unsigned char macro[NKNOB]; /* the knobs' values, 0..127 */
static volatile unsigned char rest[NKNOB];  /* the value a knob picked up: no change from its entries */
static volatile short restw[NKNOB];         /* the parameter's own word then */
static volatile short fine[NKNOB];          /* a part of a step on top of the knob's whole steps: FUNC + turn lands on the snap value exactly */
static volatile unsigned char live[NKNOB];  /* the knob has picked up and moves its entries */
static volatile unsigned char capture;      /* the next audio block picks the knobs up */
static volatile unsigned char capmask;      /* ... or only these knobs (bit k: knob k): a knob just assigned */
static volatile unsigned char moving;       /* the knobs moved off where they picked up (bit k), kept by the UI: with none, and nothing to pick up, the audio block has nothing to do */
static unsigned char eng_full;              /* this block picks knobs up: it decodes the playing kit itself (pool_sync), as the copy may not be taken yet */
static u16 peng(int k) { return pending || !eng_full ? shadow[k] : pool_eng.e[k]; }   /* after pool_sync(&pool_eng) when eng_full */
static volatile unsigned char trackt;       /* ticks left after a pattern change in which a knob nobody has turned follows its parameter as the new sound settles */

static void take(void *words, u16 e, int k) /* the knob picks up its parameter's value as it stands */
{
    int p = E_PAR(e), t = KTRK(e), v;
    restw[k] = VOICE(words, t)[p];           /* all tracks: the knob takes track 1's value */
    v = restw[k] >> 8;
    v = v < pmin(t, p) ? pmin(t, p) : v > pmax(t, p) ? pmax(t, p) : v;
    rest[k] = macro[k] = (unsigned char)(E_NEG(e) ? pmax(t, p) + pmin(t, p) - v : v);
    live[k] = 1;
}

/* The moved parameters, as the audio block applies them: for each knob off its pick-up point and each track it moves, the parameter's
 * word (its byte offset in the smoothed words), the offset to add and that track's range. The UI builds it after a turn, an edit, a
 * let-go and each tick, from the assignments the engine plays (shadow), so the block only adds and clamps: on the unit the audio
 * render runs from main RAM through the cache, and every instruction and byte the block touches costs the render more than its count.
 * Two lists: the block runs as an interrupt, so it has finished with the one in use before the UI writes the other. */
struct mvent { u16 off; short x, lo, hi; unsigned char k; };
static struct mvent mvbuf[2][NKNOB * 8];
static struct mvent *volatile mv_list;
static volatile unsigned char mv_n;
static unsigned char mv_side;
static volatile unsigned char eng_drop;     /* knobs the block picked up since the list was built: their entries wait for the next list */
static volatile unsigned char eng_seq;      /* counts the block's pick-ups, so a list built across one is not taken as new */
static void moving_update(void)
{
    int k, t, n = 0;
    unsigned char m = 0, seq = eng_seq;
    struct mvent *l = mvbuf[mv_side];
    for (k = 0; k < NKNOB; k++) {
        u16 e = shadow[k];
        int p = E_PAR(e), x, t0, t1;
        if (!live[k] || (macro[k] == rest[k] && !fine[k]) || !p || p > DEST_LAST)
            continue;
        x = ((int)macro[k] - (int)rest[k]) * 256 + fine[k];   /* 256 per knob step: the parameter's own unit */
        if (E_NEG(e))
            x = -x;
        t0 = E_ALL(e) ? 0 : E_TRK(e);
        t1 = E_ALL(e) ? 7 : E_TRK(e);
        for (t = t0; t <= t1; t++) {         /* each track moves by the same amount from its own value, inside its range */
            if (srcempty(t, p))
                continue;                    /* the track's machine has no such knob */
            l[n].off = (u16)(18 + 106 * t + 2 * p);
            l[n].x = (short)x;
            l[n].lo = (short)pminw(t, p);
            l[n].hi = (short)pmaxw(t, p);
            l[n].k = (unsigned char)k;
            n++;
        }
        m |= (unsigned char)(1 << k);
    }
    {
        u32 sr = lock();
        mv_list = l;
        mv_n = (unsigned char)n;
        moving = n ? m : 0;
        if (seq == eng_seq)
            eng_drop = 0;                    /* the list knows every pick-up so far */
        unlock(sr);
    }
    mv_side ^= 1;
}

void digiperform_post(void *words)
{
    unsigned char *kit = ENGINE_KIT;
    int k;
    unsigned char tk = 0;                    /* the knobs picked up in this block */
    if (!kit || !(moving | capture | capmask | trackt))
        return;                              /* the usual case: no knob moved, so no work in the audio block */
    eng_full = capture || capmask || trackt;
    if (eng_full && !pending)
        pool_sync(&pool_eng, kit);           /* a pick-up decodes the kit; a moved knob alone reads the UI's copy */
    if (capture || capmask) {                /* the page is opening: every knob takes its parameter's value; or one knob was just assigned */
        for (k = 0; k < NKNOB; k++) {
            u16 e = peng(k);
            int p = E_PAR(e);
            if (!capture && !(capmask >> k & 1))
                continue;
            live[k] = 0;
            fine[k] = 0;
            tk |= (unsigned char)(1 << k);
            if (!p || p > DEST_LAST)
                continue;
            take(words, e, k);
        }
        capture = 0;
        capmask = 0;
    }
    if (trackt) {                            /* the new pattern's sound is still settling: a knob not yet turned shows where its parameter is going */
        for (k = 0; k < NKNOB; k++) {
            u16 e = peng(k);
            int p = E_PAR(e);
            if (live[k] && (macro[k] != rest[k] || fine[k]))
                continue;
            tk |= (unsigned char)(1 << k);
            if (!p || p > DEST_LAST)
                live[k] = 0;
            else
                take(words, e, k);
        }
    }
    if (tk) {
        eng_drop |= tk;
        eng_seq++;
    }
    {
        const struct mvent *l = mv_list;
        int i, n = mv_n;
        for (i = 0; i < n; i++, l++) {       /* the moved parameters: add, clamp, as the UI prepared them */
            volatile short *w = (volatile short *)((char *)words + l->off);
            int y = l->x + *w;
            if (eng_drop >> l->k & 1)
                continue;                    /* picked up since the list was built: no offset yet */
            if (y < 0)
                y = 0;
            else if (y > l->hi)
                y = l->hi;
            if (y < l->lo)
                y = l->lo;
            *w = (short)y;
        }
    }
}

/* ---- SETTINGS > PERFORM ---------------------------------------------------------- */

int digiperform_open;                       /* the page is up */
static int editing;                         /* EDIT view, else PLAY view */
static int cursor;                          /* the entry under the cursor, 0..NENT - 1 */
static int sel;                             /* the selected macro: the knob turned last */
static u16 clipb[NENT];                     /* the copied page: all eight assignments */
static int nclipb;                          /* there is one */
static u16 undob[NENT];                     /* the page as it was before the last paste or clear */
static unsigned char *undo_kit;             /* the pattern's kit the buffer belongs to */
static int undo_kind;                       /* 1: a paste can be undone, 2: a clear, 0: none */
static int trig_down;                       /* TRIG is held on the page: its values show, REC / PLAY / STOP work on the page */
static int trig_used;                       /* ... and a key was pressed with it, so letting go does not leave the page */
static volatile int hold_t;                 /* UI ticks TRIG has been down: a short press is a tap, a longer one a hold */
static int trig_rep;                        /* the first repeat event of the held TRIG came: the stock page shows its values from then on, and so does this one */
static int trig_pend;                       /* TRIG was pressed on the stock TRIG page: a tap, on its release, opens this page */
#define TAP_TICKS 15                        /* half a second */
static unsigned char press_ev[64];          /* the TRIG press, replayed for the stock page when the press was a plain tap */
static void *tap_view;                      /* the TRIG page's view, and its stock key handler, for that replay */
static int (*tap_stock)(void *, void *);
static const char *dlg_text;                /* the box over the page: what it says, and for how long (ticks) */
static volatile int dlg_t;
#define DIALOG(v, t) do { dlg_text = (t); dlg_t = 45; } while (0)
static int lastep = -1;                     /* the engine's pattern bytes the page last saw */
static unsigned char *kitseen;              /* the kit the page last saw */
static unsigned char engchg;                /* ticks left since the engine changed on its own: a selection now is that change */
static int pendt;                           /* ticks a selected pattern has been waiting to play */
static int lastpat = -1;                    /* the pattern the page last saw, to notice a change */
static int recap;                           /* ticks until the knobs pick up again after a pattern reload */
static volatile unsigned char show[NKNOB];  /* ticks left of the value shown for a knob, then its label again */
static int acc[NKNOB];                      /* turns not yet making a step: the PLAY knobs */
static void *settings_view;                 /* the SETTINGS menu's view while its EDIT view is open: repainted when NO goes back to it */
static unsigned char no_up;                 /* NO closed the EDIT view of SETTINGS: swallow its release */
static int from_trig;                       /* opened from the TRIG page: play only, the other keys still work */
int digiperform_title_on;                   /* the TRIG page's title reads "Perform mode" (perf_glue.s) */
static void *trig_view;                     /* the TRIG page's view, for the header's message */
void *digiperform_bodyview;                 /* that view while the page is open over it: its body is not drawn (perf_glue.s) */
static unsigned char left_frame;            /* the page just closed: one frame, so the stock page draws its body again at once */
static int top;                             /* the first row the EDIT view shows */
static int dk;                              /* the knob being assigned from the PLAY view, 1..8, or 0: none */
static int dstage;                          /* 0: its track is being chosen, 1: its parameter */
static int dtrk;                            /* the track so far: 0..7, 8 all; it starts on track 1 */
static int dpar;                            /* the parameter so far */

/* ---- the CC knobs: sent from the UI, never through the audio block ---------------------------------------------------- */

static unsigned char *cc_kit[NKNOB];        /* where a CC knob's stored value is: the kit, MIDI track and slot it picked up from */
static unsigned char cc_t[NKNOB], cc_s[NKNOB], cc_neg[NKNOB];
static unsigned char cc_sent[NKNOB];        /* it sent a moved value: letting go sends the stored one again */

static void cc_letgo(int k)                 /* the synth gets the stored value back */
{
    if (cc_sent[k] && cc_kit[k]) {
        int w = CC_REC(cc_kit[k], cc_t[k])[CC_WORD(cc_s[k])];
        CC_SEND(w < 0 ? 0 : w > 0x7f00 ? 0x7f00 : w & ~0xff, cc_t[k], CC_WORD(cc_s[k]));
    }
    cc_sent[k] = 0;
}

static void cc_take(unsigned char *kit, int k, u16 e)   /* the knob picks up the stored CC value */
{
    int s = CC_SLOT(E_PAR(e)), t = E_TRK(e), v;
    cc_letgo(k);
    restw[k] = CC_REC(kit, t)[CC_WORD(s)];
    v = restw[k] >> 8;
    v = v < 0 ? 0 : v > 127 ? 127 : v;
    rest[k] = macro[k] = (unsigned char)(E_NEG(e) ? 127 - v : v);
    fine[k] = 0;
    cc_kit[k] = kit;
    cc_t[k] = (unsigned char)t;
    cc_s[k] = (unsigned char)s;
    cc_neg[k] = (unsigned char)E_NEG(e);
    live[k] = 1;
}

static void cc_out(int k)                   /* the knob's value goes out, as the stock CC page sends a turn */
{
    int x = ((int)macro[k] - (int)rest[k]) * 256 + fine[k], w;
    if (!cc_kit[k] || !live[k])
        return;
    if (cc_neg[k])
        x = -x;
    w = restw[k] + x;
    w = w < 0 ? 0 : w > 0x7f00 ? 0x7f00 : w;
    CC_SEND(w & ~0xff, cc_t[k], CC_WORD(cc_s[k]));
    cc_sent[k] = 1;
}

static void release(void)                   /* every parameter goes back to what the sound stores */
{
    int k;
    for (k = 0; k < NKNOB; k++) {
        cc_letgo(k);
        live[k] = 0;
    }
    moving_update();                         /* the block lets go at once */
}

static void leave(void)
{
    if (digiperform_bodyview)
        left_frame = 1;
    digiperform_bodyview = 0;
    digiperform_open = 0;
    trig_view = 0;
    recap = 0;
    trackt = 0;
    lastpat = -1;
    lastep = -1;
    kitseen = 0;
    engchg = 0;
    pending = 0;
    encinit = 0;
    from_trig = 0;
    digiperform_title_on = 0;
    editing = 0;
    capture = 0;
    dk = 0;
    trig_down = 0;
    dlg_t = 0;
    release();
}

void digiperform_select(void **payload)     /* YES on the PERFORM row */
{
    digiperform_open = 1;
    settings_view = *payload;
    editing = 1;                            /* SETTINGS goes straight to the assignments */
    cursor = 0;
    release();
    from_trig = 0;
    digiperform_title_on = 0;
    INVALIDATE((char *)*payload + 0x38);
}

void digiperform_change(void **payload, int unused, int delta)
{
    (void)unused;
    (void)delta;
    INVALIDATE((char *)*payload + 0x38);
}

void digiperform_rowdraw(void *a, void *b, void *bmp, int x, int y)
{
    static const unsigned short icon[9] = {0x1ff, 0x1bb, 0x155, 0x1bb, 0x1ff, 0x1bb, 0x155, 0x1bb, 0x1ff};
    int r, c, c0;
    (void)a;
    (void)b;
    TEXT(bmp, FONT5, 108, y + 2, -1, "%c%02d", 'A' + (PATTERN >> 4 & 7), (PATTERN & 15) + 1);   /* the pattern whose assignments the page edits */
    for (r = 0; r < 9; r++)                 /* the row's icon, 9 x 9, left of the name like the stock rows' */
        for (c = 0; c < 9; c++) {
            if (!(icon[r] >> (8 - c) & 1))
                continue;
            for (c0 = c; c < 8 && (icon[r] >> (7 - c) & 1); c++)
                ;
            FILLRECT(bmp, x + c0, y + 8 - r, x + c, y + 8 - r, -1);
        }
}

/* ---- copy, paste, clear of the page: hold TRIG and press REC, STOP, PLAY, as for the stock pages ----- */

static void put_page(unsigned char *kit, const u16 *p)
{
    int i;
    for (i = 0; i < NENT; i++)
        put_entry(kit, i, p[i]);
    capture = 1;                             /* every knob picks its parameter up again */
}

static void page_key(unsigned char *kit, int id)
{
    int i;
    u16 now[NENT];
    if (id == 9) {                           /* REC: copy the page's track and parameters */
        for (i = 0; i < NENT; i++)
            clipb[i] = entry(kit, i);
        nclipb = 1;
        DIALOG(trig_view, "COPY PAGE PERF");
        return;
    }
    for (i = 0; i < NENT; i++)
        now[i] = entry(kit, i);
    if (undo_kind == (id == 11 ? 1 : 2) && undo_kit == kit) {   /* the same key again: take it back */
        put_page(kit, undob);
        undo_kind = 0;
        DIALOG(trig_view, id == 11 ? "UNDO PASTE" : "UNDO CLEAR");
        return;
    }
    if (id == 11 && !nclipb)
        return;                              /* nothing copied yet */
    for (i = 0; i < NENT; i++)
        undob[i] = now[i];
    undo_kit = kit;
    undo_kind = id == 11 ? 1 : 2;
    if (id == 11) {                          /* STOP: paste over everything, assigned or not */
        put_page(kit, clipb);
        DIALOG(trig_view, "PASTE PAGE PERF");
    } else {                                 /* PLAY: every knob unassigned */
        for (i = 0; i < NENT; i++)
            now[i] = 0;
        put_page(kit, now);
        DIALOG(trig_view, "CLEAR PAGE PERF");
    }
}

/* ---- the page ----------------------------------------------------------------------------------- */


/* the label under a knob: the one the Digitakt's own page puts there. The track's digit is drawn in the knob. */
static const char names4[DEST_LAST + 1][7] = {
    "",
    "L1.SP", "L1.MU", "L1.FD", "L1.DS", "L1.WV", "L1.PH", "L1.MD", "L1.DP",
    "L2.SP", "L2.MU", "L2.FD", "L2.DS", "L2.WV", "L2.PH", "L2.MD", "L2.DP",
    "TUNE", "PLAY", "BR", "SAMP", "STRT", "LEN", "LOOP", "LEV",
    "F.TYP", "F.FRQ", "F.RES", "F.ENV", "F.ATK", "F.DEC", "F.SUS", "F.REL",
    "F.BAS", "F.WID", "F.DEL", "F.SRR", "F.ROU",
    "A.ATK", "A.HLD", "A.DEC", "A.OVR", "A.DEL", "A.REV", "A.PAN", "A.VOL"
};

/* An SRC knob's names, values and range come from the SRC page's own routines, asked for the knob's track: that track made
 * the active one and its machine's SRC layout asked for, so a mod that renames a knob for its machine names it here too.
 * Interrupts are off while the active track is borrowed. */
#ifdef OS154
#define F_ACTIVE_TRACK 0x4197c6b4
#else
#define F_ACTIVE_TRACK 0x4197b6b4
#endif
#define ACTIVE_TRACK (*(volatile u32 *)F_ACTIVE_TRACK)
#define SRC_LAYOUT   ((const u32 *(*)(int))0x400657cc)   /* (machine): 44 bytes, the knobs' ids at +8 (A..H), 0 an empty knob */
#define MACHINE(kit, t) ((kit)[0x9e + 0xa2 * (t)])
/* the knob's track made the active one and its machine's layout asked for, as the SRC page has them; the caller has interrupts off */
static u32 borrow(unsigned char *kit, int t)
{
    u32 at = ACTIVE_TRACK;
    ACTIVE_TRACK = (u32)t;
    SRC_LAYOUT(MACHINE(kit, t));
    return at;
}
static void unborrow(unsigned char *kit, u32 at)
{
    ACTIVE_TRACK = at;
    if (at < 8)
        SRC_LAYOUT(MACHINE(kit, at));
}
/* The firmware's range of an id, (id; a0 = out {min, max, default}) -> a0: what the SRC page clamps a knob to. It is read the way the
 * knob-turn function reads it, at its call (with the page's knob object in a2, as there), since a mod may answer at that call
 * rather than in the function; without a page the function is called directly. Returns whether the knob object was there. */
#define SITE_RANGE 0x4000f534
static void *widget(int id);
static int id_range(int id, int *out)
{
    const u16 *c = (const u16 *)SITE_RANGE;
    u32 f = c[0] == 0x4eb9 ? *(const u32 *)(SITE_RANGE + 2) : 0x40078f0c;
    void *o = widget(id);
    register int *a0 __asm__("a0") = out;
    if (!o)
        f = 0x40078f0c;
    __asm__ volatile("movea.l %3,%%a2\n\tmove.l %2,-(%%sp)\n\tjsr (%1)\n\taddq.l #4,%%sp"
                     : "+a"(a0) : "a"(f), "d"(id), "r"(o) : "d0", "d1", "a1", "a2", "memory", "cc");
    return o != 0;
}
static unsigned char wides[8][8];           /* the widest value text of each track's SRC knobs (0: not measured), kept with lids */
static char lsn[8][8][8], lln[8][8][20];    /* their short and long names, read once (lnv[t]) while the machine stays */
static unsigned char lnv[8];
/* the tracks' SRC ids, read again where a track's machine changed */
static void lid_refresh(unsigned char *kit)
{
    int t, i;
    u32 sr, at;
    if (!kit)
        return;
    for (t = 0; t < 8; t++) {
        const u32 *lay;
        if (MACHINE(kit, t) == lmach[t] && (lrv[t] || !(trig_view || tap_view)))
            continue;                        /* known, and read through the page's knob object where there is one */
        sr = lock();
        at = borrow(kit, t);
        lay = SRC_LAYOUT(MACHINE(kit, t));
        for (i = 0; i < 8; i++) {
            u32 id = lay ? lay[2 + i] : 0;
            int r[3];
            if (id > 0xa3)
                id = 0;
            r[0] = PTABLE[(id ? id : slot_id(17 + i)) * 13 + 2];
            r[1] = PTABLE[(id ? id : slot_id(17 + i)) * 13 + 3];
            lrv[t] = 1;
            if (id && !id_range((int)id, r))
                lrv[t] = 0;
            lmin[t][i] = (short)r[0];
            lmax[t][i] = (short)(r[1] > r[0] ? r[1] : r[0]);
            lids[t][i] = (unsigned char)id;   /* last: the engine reads the range once the id is there */
            wides[t][i] = 0;
            lnv[t] = 0;
        }
        lhas[t] = lay != 0;
        lmach[t] = MACHINE(kit, t);
        unborrow(kit, at);
        unlock(sr);
    }
}
static int tw(const char *s);
static int same(const char *a, const char *b)
{
    while (*a && *a == *b)
        a++, b++;
    return *a == *b;
}

/* A parameter's names as the SRC page has them: the stock pages fetch them at these two calls (the label drawer's short name, the turn
 * handler's long name), so they are called the way those pages call them, with the knob's track borrowed. A call that is no longer a plain
 * jsr falls back to the stock name function. */
#define SITE_SHORT 0x40030daa
#define SITE_LONG  0x40032d36
typedef const char *(*namefn)(void *, int);
static namefn site_fn(u32 site, u32 stock)
{
    const u16 *c = (const u16 *)site;
    return (namefn)(c[0] == 0x4eb9 ? *(const u32 *)(site + 2) : stock);
}
static void *widget(int id)                 /* the page's knob object for the id, on the active track (the label drawer's own call); none without a page */
{
    void *v = trig_view ? trig_view : tap_view;
    return v ? ((void *(*)(void *, int, int))(*(void ***)v)[0xa4 / 4])(v, id, -1) : 0;
}
static int slen(const char *a)
{
    int n = 0;
    while (a[n])
        n++;
    return n;
}
static void cpy(char *d, const char *a, int n)
{
    int len = 0;
    while (a && a[len] && len < n) {
        d[len] = a[len];
        len++;
    }
    d[len] = 0;
}
/* the label call as the CC page makes it: (view, id) on the stack, and the view in a4 and the id in d2 as they are at the call
 * (a mod there may read the registers rather than the stack) */
static const char *label_call(void *view, int id)
{
    namefn f = site_fn(SITE_SHORT, 0x4000fe8a);
    register const char *r __asm__("d0");
    __asm__ volatile("move.l %2,%%d2\n\tmovea.l %1,%%a4\n\tmove.l %2,-(%%sp)\n\tmove.l %1,-(%%sp)\n\tjsr (%3)\n\taddq.l #8,%%sp"
                     : "=r"(r) : "a"(view), "d"(id), "a"(f) : "d1", "d2", "a0", "a1", "a4", "memory", "cc");
    return r;
}
/* the name of parameter p on track t, short (the label) or long (the header): the SRC page's, read for all the track's knobs at once
 * when its machine changes (the stock calls run with interrupts off, so not every frame); 0 when the machine has no knob there */
static const char *src_name(unsigned char *kit, int t, int p, int lng)
{
    int i;
    u32 sr, at;
    if (!kit || p < 17 || p > 24 || t < 0 || t > 7)
        return 0;
    lid_refresh(kit);
    if (!lids[t][p - 17])
        return 0;
    if (!lnv[t]) {
        sr = lock();
        at = borrow(kit, t);
        for (i = 0; i < 8; i++) {
            int id = lids[t][i];
            void *o = id ? widget(id) : 0;
            cpy(lsn[t][i], id ? label_call(o, id) : 0, 7);   /* a mod at the site may read the id from d2 (CC Names does) */
            cpy(lln[t][i], id ? site_fn(SITE_LONG, 0x4000feac)(o, id) : 0, 19);
        }
        lnv[t] = 1;
        unborrow(kit, at);
        unlock(sr);
    }
    return lng ? lln[t][p - 17] : lsn[t][p - 17];
}
/* A CC slot's label as the MIDI track's CC page has it: the page's label call (0x40030daa) asked for VAL n with a copy of the TRIG
 * page's view whose selected track (+0x74) is the MIDI track. Stock answers "VAL1".."VAL8"; a mod that names CC slots answers its
 * name. The copy's track object is ours: its method at +0x28 returns a record whose word at +8 is the track, 8..15 for MIDI. */
static u32 ccf_rec[4];
static u32 ccf_get(void *o) { (void)o; return (u32)ccf_rec; }
static void *ccf_vt[16];
static void *ccf_obj[1];
static u32 ccf_view[0x80 / 4];
static char ccn[8][8][8];                   /* the labels, read once a tick at most (ccn_tick) */
static unsigned char ccn_ok[8];
static const char *cc_name(int t, int s)
{
    if (t < 0 || t > 7 || s < 0 || s > 7)
        return "";
    if (!(ccn_ok[t] >> s & 1)) {
        void *v = trig_view ? trig_view : tap_view;
        const char *a;
        if (v) {
            int i;
            for (i = 0; i < 0x80 / 4; i++)
                ccf_view[i] = ((u32 *)v)[i];
            ccf_vt[0x28 / 4] = (void *)ccf_get;
            ccf_obj[0] = ccf_vt;
            ccf_rec[2] = (u32)(8 + t);
            ccf_view[0x74 / 4] = (u32)ccf_obj;
            a = label_call(ccf_view, CC_ID(s));
        } else {
            a = ((const char *(*)(void *, int))0x4000fe8a)(0, CC_ID(s));
        }
        cpy(ccn[t][s], a, 7);
        ccn_ok[t] |= (unsigned char)(1 << s);
    }
    return ccn[t][s];
}
static void ccn_tick(void)                  /* a renamed slot shows its new name within a tick */
{
    int t;
    for (t = 0; t < 8; t++)
        ccn_ok[t] = 0;
}
/* the label under a knob (the module's names, the SRC page's, the CC page's) */
static const char *plabel(unsigned char *kit, int t, int p)
{
    const char *n;
    if (IS_CC(p))
        return cc_name(t, CC_SLOT(p));
    if (p < 1 || p > DEST_LAST)
        return "";
    n = src_name(kit, t, p, 0);
    return n && *n ? n : names4[p];
}

/* the parameter's word as the knob has it: where it picked up, moved by the knob, inside the parameter's range */
static int shown_word(unsigned char *kit, int k)
{
    u16 e = entry(kit, k);
    int p = E_PAR(e), t = KTRK(e), x = ((int)macro[k] - (int)rest[k]) * 256 + fine[k];
    if (E_NEG(e))
        x = -x;
    x += restw[k];
    return x < pminw(t, p) ? pminw(t, p) : x > pmaxw(t, p) ? pmaxw(t, p) : x;
}

/* the firmware's text for a value, into b (n characters at most) */
#define SITE_VALUE 0x40032d16                 /* the turn handler's call for the header's value text, (id, value) */
static int value_raw(char *b, int n, int t, int p, int w)
{
    const u16 *c = (const u16 *)SITE_VALUE;
    const char *a = srcknob(t, p) && c[0] == 0x4eb9 ?
        ((const char *(*)(int, int))*(const u32 *)(SITE_VALUE + 2))(pid(t, p), w) : (const char *)STOCK_VALUE(pid(t, p), w);
    int len = 0;
    while (a && a[len] && len < n) {
        b[len] = a[len];
        len++;
    }
    b[len] = 0;
    return len;
}
/* ... an SRC knob's with its track borrowed, as the SRC page formats it */
static struct { short w; unsigned char t, p, m, ok; char s[12]; } vcache[8];   /* the last texts: a value shown each frame is formatted once */
static unsigned char vnext;
static int value_text(char *b, int n, unsigned char *kit, int t, int p, int w)
{
    u32 sr, at;
    int i;
    char full[12];                           /* formatted whole, then cut to n: the cache keeps the whole text, so a knob's short copy never stands in for the header's */
    if (!kit || p < 17 || p > 24 || t < 0 || t > 7)
        return value_raw(b, n, t, p, w);
    lid_refresh(kit);
    for (i = 0; i < 8; i++)
        if (vcache[i].ok && vcache[i].w == w && vcache[i].t == t && vcache[i].p == p && vcache[i].m == lmach[t]) {
            cpy(b, vcache[i].s, n);
            return slen(b);
        }
    sr = lock();
    at = borrow(kit, t);
    value_raw(full, 11, t, p, w);
    unborrow(kit, at);
    unlock(sr);
    i = vnext++ & 7;
    vcache[i].w = (short)w;
    vcache[i].t = (unsigned char)t;
    vcache[i].p = (unsigned char)p;
    vcache[i].m = lmach[t];
    cpy(vcache[i].s, full, 11);
    vcache[i].ok = 1;
    cpy(b, full, n);
    return slen(b);
}

/* the pixels n characters of s take in a font: its width for each character (word 2 of the font points at the table) and one pixel after each */
static int adv(const void *font, const char *s, int n)
{
    const unsigned char *w = ((const unsigned char *const *)font)[2];
    int a = 0;
    for (; *s && n--; s++)
        a += w[(unsigned char)*s] + 1;
    return a;
}

/* the widest the parameter's value gets in the header, over its whole range: the name is fitted to that once, so it does not change as the knob turns */
static int worst_value(unsigned char *kit, int t, int p)
{
    static unsigned char wide[64];          /* by parameter: the module's and the CC slots */
    unsigned char *w = p >= 17 && p <= 24 && kit ? &wides[t][p - 17] : &wide[p];
    char b[12];
    int v;
    if (!*w) {
        int src = p >= 17 && p <= 24 && kit;
        if (src)
            lid_refresh(kit);
        for (v = pmin(t, p); v <= pmax(t, p); v++) {
            int a;
            u32 sr = 0, at = 0;
            if (src) {                       /* a borrow for each value: interrupts stay off for one value's text, never the whole range (Overbridge's USB waits meanwhile) */
                sr = lock();
                at = borrow(kit, t);
            }
            value_raw(b, 11, t, p, v * 256);
            if (src) {
                unborrow(kit, at);
                unlock(sr);
            }
            a = adv(TITLE_FONT, b, 99);
            if (a > *w)
                *w = (unsigned char)a;
        }
    }
    return *w;
}

/* the box at the left: the page's icon, 15 x 24 pixels from the left edge */
static const u16 perf_icon[24] = {
    0, 14798, 9512, 9676, 14632, 8488, 0, 3084, 4626, 8481, 13107, 16191,
    16191, 16191, 16191, 9767, 16962, 26214, 32382, 32382, 32382, 32382, 15420, 6168
};

/* a text's width in the label font: the last character has no gap after it */
static int tw(const char *s)
{
    int a = adv(LABEL_FONT, s, 99);
    return a ? a - 1 : 0;
}

/* the knob graphic's ring by rows from its middle: the run of pixels each side lies ring_lo..ring_hi from the centre column */
static const signed char ring_lo[9] = { 8, 8, 8, 7, 7, 6, 5, 3, 0 };
static const signed char ring_hi[9] = { 8, 8, 8, 7, 7, 6, 5, 4, 2 };

/* the track's number as the trig keys label it: audio 1..8, MIDI 9..16 */
static int trk_num(int tgt) { return tgt >= T_MIDI ? tgt - T_MIDI + 9 : tgt + 1; }
/* the target's mark in the middle of a knob: the track's number (two digits, 7 px, for MIDI 10..16), A for all audio tracks */
static void track_mark(void *bmp, int x, int ky, int tgt)
{
    if (tgt == 8)
        TEXT(bmp, FONT5, x + 8, ky + 6, -1, "A");
    else
        TEXT(bmp, FONT5, trk_num(tgt) > 9 ? x + 6 : x + 8, ky + 6, -1, "%d", trk_num(tgt));
}
/* the mark's highlight while its track is chosen: a pixel round the number */
static void mark_box(void *bmp, int x, int ky, int tgt)
{
    int w = tgt != 8 && trk_num(tgt) > 9;
    FILLRECT(bmp, w ? x + 5 : x + 7, ky + 5, w ? x + 13 : x + 11, ky + 11, -1);
}

/* the knob being assigned (Perform Quick Assign): first its track (the knob empty, the track's mark highlighted), then its parameter (the knob empty, the label highlighted) */
static void draw_draft(void *bmp, unsigned char *kit, int x, int ky, int ly, int k)
{
    int d, tx;
    for (d = -8; d <= 8; d++) {             /* the knob graphic's ring, with no needle, pixel for pixel as the stock draws it: no value yet */
        int a = d < 0 ? -d : d;
        FILLRECT(bmp, x + 9 - ring_hi[a], ky + 8 + d, x + 9 - ring_lo[a], ky + 8 + d, 1);
        FILLRECT(bmp, x + 9 + ring_lo[a], ky + 8 + d, x + 9 + ring_hi[a], ky + 8 + d, 1);
    }
    track_mark(bmp, x, ky, dtrk);
    if (dstage == 0) {
        mark_box(bmp, x, ky, dtrk);          /* the mark, highlighted until the track is chosen */
        TEXT(bmp, LABEL_FONT, x + 8, ly, -1, "%s", knobname[k]);
        return;
    }
    {
        const char *n = plabel(kit, dtrk >= T_MIDI ? dtrk - T_MIDI : dtrk == 8 ? 0 : dtrk, dpar);   /* the SRC or CC page's name */
        tx = x + 9 - tw(n) / 2;
        TEXT(bmp, LABEL_FONT, tx, ly, -1, "%s", n);
        FILLRECT(bmp, tx - 1, ly - 1, tx + tw(n), ly + 5, -1);   /* the label, highlighted: a pixel clear on each side */
    }
}

/* the MIDI CC page's cell for an unassigned knob, 17 x 17 as the stock draws it: a dotted box with a cross */
static void draw_off(void *bmp, int x, int y)
{
    int i;
    for (i = 0; i < 8; i++) {
        FILLRECT(bmp, x + 2 + 2 * i, y + 16, x + 2 + 2 * i, y + 16, 1);    /* top */
        FILLRECT(bmp, x + 2 + 2 * i, y, x + 2 + 2 * i, y, 1);              /* bottom */
        FILLRECT(bmp, x + 1, y + 1 + 2 * i, x + 1, y + 1 + 2 * i, 1);      /* left */
        FILLRECT(bmp, x + 17, y + 1 + 2 * i, x + 17, y + 1 + 2 * i, 1);    /* right */
    }
    for (i = 0; i < 5; i++) {                                              /* the cross, 9 x 9 round the middle */
        FILLRECT(bmp, x + 5 + i, y + 12 - i, x + 5 + i, y + 12 - i, 1);
        FILLRECT(bmp, x + 13 - i, y + 12 - i, x + 13 - i, y + 12 - i, 1);
        FILLRECT(bmp, x + 5 + i, y + 4 + i, x + 5 + i, y + 4 + i, 1);
        FILLRECT(bmp, x + 13 - i, y + 4 + i, x + 13 - i, y + 4 + i, 1);
    }
}

/* where the knob graphic's needle stands, 0..127, for the parameter's value m: along its range; Tune's is drawn as -60..+60, so 0 is the middle and +24 stops short of the end */
static int knob_pos(int t, int p, int m)
{
    int x = p == 17 && pid(t, p) == slot_id(17) ? (m - pmin(t, p)) * 127 / 120 : (m - pmin(t, p)) * 127 / prange(t, p);
    return x < 0 ? 0 : x > 127 ? 127 : x;
}

/* A knob on an SRC parameter the track's machine does not have (its machine changed since), or on a CC slot turned off since,
 * is unassigned, the way a knob the musician frees is: nothing to name or move. Run where the assignments are shown; the engine skips such a knob meanwhile. */
static void drop_empty(unsigned char *kit)
{
    int k;
    if (!kit)
        return;
    lid_refresh(kit);
    for (k = 0; k < NKNOB; k++) {
        u16 e = entry(kit, k);
        if (dk == k + 1 || !E_PAR(e) || (!srcempty(KTRK(e), E_PAR(e)) && !(IS_CC(E_PAR(e)) && !CC_ON(kit, E_TRK(e), CC_SLOT(E_PAR(e))))))
            continue;                        /* kept: not an SRC knob the machine lacks, nor a CC slot turned off */
        put_entry(kit, k, 0);
        live[k] = 0;
        show[k] = 0;
    }
}

static void draw_play(void *bmp, unsigned char *kit)
{
    int k, r, c, c0;
    drop_empty(kit);
    for (r = 0; r < 24; r++)
        for (c = 0; c < 15; c++) {
            if (!(perf_icon[r] >> (14 - c) & 1))
                continue;
            for (c0 = c; c < 14 && (perf_icon[r] >> (13 - c) & 1); c++)
                ;
            FILLRECT(bmp, c0, 50 - r, c, 50 - r, 1);
        }
    for (k = 0; k < NKNOB; k++) {
        int x = 24 + 26 * (k & 3), ky = k < 4 ? 34 : 7, ly = ky - 7;
        u16 e = kit ? entry(kit, k) : 0;
        if (dk == k + 1) {
            draw_draft(bmp, kit, x, ky, ly, k);
            continue;
        }
        if (dest_ok(E_PAR(e)))
            KNOB_GFX(0, KNOB_ID, live[k] ? knob_pos(KTRK(e), E_PAR(e), macro[k]) << 8 : 0, 0, 0, bmp, x, ky);
        else {
            draw_off(bmp, x, ky);
        }
        if (dest_ok(E_PAR(e))) {
            char b[8];
            int tx;
            if ((show[k] || (trig_down && trig_rep)) && live[k])   /* just turned, or TRIG held a moment: the value, as the MIDI CC page shows it */
                value_text(b, 5, kit, KTRK(e), E_PAR(e), shown_word(kit, k));
            else
                cpy(b, plabel(kit, KTRK(e), E_PAR(e)), 7);     /* the module's name, or the SRC or CC page's */
            FILLRECT(bmp, trk_num(TGT(e)) > 9 && !E_ALL(e) ? x + 5 : x + 6, ky + 5, trk_num(TGT(e)) > 9 && !E_ALL(e) ? x + 13 : x + 12, ky + 11, 0);   /* room round the number: the needle starts clear of it */
            track_mark(bmp, x, ky, TGT(e));                      /* the parameter's track, in the middle of the knob (its glyph is 3 px wide) */
            tx = x + 9 - tw(b) / 2;                              /* centred on the knob by the font's own widths */
            TEXT(bmp, LABEL_FONT, tx, ly, -1, "%s", b);
        } else {                                    /* no parameter: the MIDI CC page's unassigned knob, named by its letter */
            TEXT(bmp, LABEL_FONT, x + 8, ly, -1, "%s", knobname[k]);
        }
    }
}

/* the firmware's box for "COPY PAGE ...": black, a white frame, the words in the label font with 9 clear pixels each side, centred, about a second and a half */
static void draw_dialog(void *bmp)
{
    int w = tw(dlg_text), x0 = 64 - (w + 19) / 2, x1 = x0 + w + 18;
    FILLRECT(bmp, x0, 23, x1, 41, 0);
    FILLRECT(bmp, x0, 41, x1, 41, 1);
    FILLRECT(bmp, x0, 23, x1, 23, 1);
    FILLRECT(bmp, x0, 23, x0, 41, 1);
    FILLRECT(bmp, x1, 23, x1, 41, 1);
    TEXT(bmp, LABEL_FONT, x0 + 9, 30, -1, "%s", dlg_text);
}

static void draw_edit(void *bmp, unsigned char *kit)
{
    int i, r;
    drop_empty(kit);
    TEXT(bmp, TITLE_FONT, 2, 56, -1, "Perform Mode Edit");
    TEXT(bmp, FONT5, 106, 56, -1, "%c%02d", 'A' + (PATTERN >> 4 & 7), (PATTERN & 15) + 1);   /* the pattern being edited, on the title's baseline */
    FILLRECT(bmp, 0, 54, 127, 63, -1);              /* the title on a white bar, as in the stock pages' */
    if (cursor < top)
        top = cursor;
    if (cursor > top + 5)
        top = cursor - 5;
    for (r = 0; r < 6; r++) {                       /* six rows fit: a space under the title, a pixel above and below each row's text, one clear pixel between rows */
        u16 e;
        int y = 47 - 8 * r, p;
        i = top + r;
        e = kit ? entry(kit, i) : 0;
        p = E_PAR(e);
        TEXT(bmp, FONT5, 2, y, -1, "%s", knobname[i]);
        if (!p) {
            TEXT(bmp, FONT5, 14, y, -1, "- - -");
        } else {
            if (E_ALL(e))
                TEXT(bmp, FONT5, 14, y, -1, "ALL");
            else
                TEXT(bmp, FONT5, 14, y, -1, "T%d", trk_num(TGT(e)));   /* MIDI tracks 9..16, as the trig keys label them */
            if (IS_CC(p))
                TEXT(bmp, FONT5, 34, y, -1, "CC.%s", cc_name(E_TRK(e), CC_SLOT(p)));   /* the CC page's name for the slot */
            else {
                char nb[12];
                int nl;
                lid_refresh(kit);
                nb[0] = 'S'; nb[1] = 'R'; nb[2] = 'C'; nb[3] = '.';
                {
                    const char *sn = src_name(kit, KTRK(e), p, 0);
                    cpy(nb + 4, sn, 7);
                    nl = sn ? slen(nb + 4) : 0;
                }
                if (nl && p <= DEST_LAST && !same(nb + 4, names4[p]))   /* the machine names it its own way */
                    TEXT(bmp, FONT5, 34, y, -1, "%s", nb);
                else
                    TEXT(bmp, FONT5, 34, y, -1, "%s", p <= DEST_LAST ? dnames[p] : "--");
            }
            TEXT(bmp, FONT5, 100, y, -1, "%s", E_NEG(e) ? "-" : "+");
        }
        if (i == cursor)
            FILLRECT(bmp, 0, y - 1, 127, y + 5, -1);/* the cursor's row, inverted: a pixel above and below the text */
    }
}

/* the screen saver's state, in the application object the firmware keeps a pointer to: 0 awake, 1 dimmed (after 5 minutes, only the display's brightness), 2 off (after 60 minutes: the firmware blanks its own screen) */
#define SAVER_OFF    2
static int screen_off(void)
{
    unsigned char *app = *(unsigned char *volatile *)F_APP;
    return app && *(volatile int *)(app + 0xe8) == SAVER_OFF;
}

void digiperform_draw(void *bmp, void *ctrl)
{
    unsigned char *kit = UI_KIT;
    (void)ctrl;
    if (!digiperform_open || screen_off())      /* the page stays open under the saver and comes back with the next key */
        return;
    FILLRECT(bmp, 0, 0, 127, from_trig && !editing ? 53 : 63, 0);   /* the PLAY view leaves the TRIG page's header */
    if (editing)
        draw_edit(bmp, kit);
    else
        draw_play(bmp, kit);
    if (dlg_t > 0 && !editing)
        draw_dialog(bmp);
}

/* what the page draws depends on, folded into one word: the tick asks for a frame when it changes */
static u32 lastsig = 0xffffffffu;
static unsigned char idle_frames;
static u32 frame_sig(void)
{
    unsigned char *kit = UI_KIT;
    u32 h = 2166136261u;
    int k;
#define MIX(x) (h = (h ^ (u32)(x)) * 16777619u)
    MIX((u32)kit);
    MIX(PATTERN);
    MIX(editing | dk << 1 | dstage << 5 | (dlg_t > 0) << 6 | (trig_down && trig_rep) << 7);
    MIX(dtrk | dpar << 8 | cursor << 16 | top << 24);
    for (k = 0; k < NENT && kit; k++)
        MIX(entry(kit, k));
    for (k = 0; k < NKNOB; k++) {
        MIX(macro[k] | live[k] << 8 | (show[k] != 0) << 9);
        MIX(fine[k]);
    }
    for (k = 0; k < 8; k++)
        MIX(lmach[k]);
#undef MIX
    return h;
}

void digiperform_tick(void *ctrl)           /* the page's state each UI tick, and a frame when what it shows changed */
{
    moving_update();
    digiperform_bodyview = digiperform_open && from_trig ? trig_view : 0;
    if (left_frame && !digiperform_open) {
        left_frame = 0;
        *((volatile char *)ctrl + 0x20) = 1;
    }
    if (kstore_tick(&store, UI_KIT, KS_SLOT_PERF, KS_TRACKS, pmask) == KS_RESTORED) {   /* a sound load keeps the pool */
        u32 sr = lock();
        img_sync(UI_KIT);
        unlock(sr);
    }
    if ((trig_pend || trig_down) && hold_t < 255)
        hold_t++;
    if (digiperform_open) {
        int k;
        for (k = 0; k < NKNOB; k++)
            if (show[k])
                show[k]--;
        {
            int ep = engine_sig(), sw = 0;
            unsigned char *kp = UI_KIT;
            if (PATTERN != lastpat) {        /* a pattern was selected */
                if (lastpat >= 0) {
                    if (ep == lastep && kp == kitseen && !engchg) {
                        pending = 1;         /* the old one plays on: its knobs keep their offsets */
                        pendt = 0;
                    } else {
                        sw = 1;              /* the engine changed with the selection: that is the change */
                    }
                }
                lastpat = PATTERN;
            }
            if (engchg)
                engchg--;
            if (!pending && lastep != -1 && ep != lastep) {
                sw = 1;                      /* the engine moved first, before the selection showed: the same change */
                engchg = 30;
            }
            if (pending && (ep != lastep || kp != kitseen || ++pendt > 2400))
                sw = 1;                      /* the new pattern plays now (or, as a last resort, it has been 80 s) */
            if (sw) {                        /* every knob lets go, and the new sound's own values come back */
                pending = 0;
                release();
                capture = 1;                 /* the knobs show the new sound at once, and follow it while it settles */
                trackt = 60;
            }
            if (!pending) {
                int j;
                lastep = ep;
                kitseen = kp;
                for (j = 0; kp && j < NENT; j++)
                    shadow[j] = entry(kp, j);
            }
        }
        ccn_tick();                          /* the CC labels are read again this tick */
        if (!editing) {                      /* a CC knob not picked up yet takes the stored value (the audio block leaves them alone) */
            unsigned char *kc = UI_KIT;
            for (k = 0; kc && k < NKNOB; k++) {
                u16 e = entry(kc, k);
                if (IS_CC(E_PAR(e)) && !live[k] && CC_ON(kc, E_TRK(e), CC_SLOT(E_PAR(e))))
                    cc_take(kc, k, e);
            }
        }
        if (!encinit)
            enc_reset();
        if (++encdiv >= 3) {                 /* the firmware decays an accelerator ten times a second */
            encdiv = 0;
            ENC_DECAY(encst, 0);
        }
        if (recap && !--recap)
            capture = 1;
        if (trackt)
            trackt--;
        if (dlg_t > 0)
            dlg_t--;
        if (!screen_off() && (frame_sig() != lastsig || ++idle_frames >= 30)) {   /* under the saver the firmware's blank screen stays: no frame is asked for */
            lastsig = frame_sig();           /* a frame only when what the page shows changed (and once a second): a frame */
            idle_frames = 0;                 /* each tick took the UI's time from the turns when the audio left it little (Digi Mono + Overbridge) */
            *((volatile char *)ctrl + 0x20) = 1;
        }
    } else {
        lastsig = 0xffffffffu;               /* the page opens on a new frame */
    }
}

#define KEYID(ev)   (*(int *)((char *)(ev) + 12))
#define KEYDOWN(ev)  (*(int *)((char *)(ev) + 16) & 1)
/* a fresh press, as the firmware tests it: down, and not an auto-repeat */
#define KEYPRESS(ev) ((*(int *)((char *)(ev) + 16) & 9) == 1)
#define KEY_TRIG     19

/* is the track's parameter already assigned to a knob other than k? Each can have one only. */
static int taken(unsigned char *kit, int k, int t, int p)
{
    int j;
    lid_refresh(kit);
    if (IS_CC(p) != (t >= T_MIDI))
        return 1;                            /* a CC slot only on a MIDI track, a sound's parameter only on an audio one */
    if (IS_CC(p) && !CC_ON(kit, t - T_MIDI, CC_SLOT(p)))
        return 1;                            /* a CC slot the MIDI track has not turned on */
    if (!IS_CC(p) && srcempty(t == 8 ? 0 : t, p))
        return 1;                            /* a knob the track's machine does not have (all tracks: track 1's, as they follow it) */
    for (j = 0; j < NENT; j++) {
        u16 e = entry(kit, j);
        if (j != k && E_PAR(e) == p && (TGT(e) == 8 || t == 8 || TGT(e) == t))   /* all tracks meets every track */
            return 1;
    }
    return 0;
}

/* the first parameter target tgt has free for knob k, in the lists' order (SRC.TUNE on, or VAL1 on); 0: none */
static int first_free(unsigned char *kit, int k, int tgt)
{
    int q, p;
    if (tgt >= T_MIDI) {
        for (q = 0; q < 8; q++)
            if (!taken(kit, k, tgt, CC_FIRST + q))
                return CC_FIRST + q;
        return 0;
    }
    for (q = 0; q < DEST_LAST; q++) {
        p = OPAR((OPOS(DEFAULT_PARAM) + q) % DEST_LAST);
        if (!taken(kit, k, tgt, p))
            return p;
    }
    return 0;
}
/* the entry for target tgt (0..7, 8 all, 9..16 a MIDI track) and parameter p */
static u16 tgt_entry(int tgt, int p, int neg)
{
    return tgt == 8 ? (u16)(0x2000 | ENTRY(0, p, neg)) : ENTRY(tgt >= T_MIDI ? tgt - T_MIDI : tgt, p, neg);
}
/* n steps from parameter p through the ones target tgt has free for knob k: the sound's in the lists' order, or the CC slots */
static int step_param(unsigned char *kit, int k, int tgt, int p, int n)
{
    int cc = tgt >= T_MIDI, len = cc ? 8 : DEST_LAST;
    int v = cc ? CC_SLOT(p) : OPOS(p);
    for (; n; n += n > 0 ? -1 : 1) {
        int w = v + (n > 0 ? 1 : -1);
        while (w >= 0 && w < len && taken(kit, k, tgt, cc ? CC_FIRST + w : OPAR(w)))
            w += n > 0 ? 1 : -1;
        if (w < 0 || w >= len)
            break;
        v = w;
    }
    return cc ? CC_FIRST + v : OPAR(v);
}
/* n steps from target v through the targets (1..8, ALL, M1..M8) that have parameter p free for knob k, or for a target of the
 * other kind (audio or MIDI) any free parameter; *pp becomes the parameter the new target takes */
static int step_target(unsigned char *kit, int k, int v, int *pp, int n)
{
    int p = *pp;
    for (; n; n += n > 0 ? -1 : 1) {
        int w = v + (n > 0 ? 1 : -1), q = 0;
        while (w >= 0 && w <= T_LAST) {
            q = IS_CC(p) == (w >= T_MIDI) && !taken(kit, k, w, p) ? p : first_free(kit, k, w);
            if (q)
                break;
            w += n > 0 ? 1 : -1;
        }
        if (w < 0 || w > T_LAST)
            break;
        v = w;
        p = q;
    }
    *pp = p;
    return v;
}

/* the row's assignment made: the first parameter nobody has, from SRC.TUNE on track 1 */
static void make_entry(unsigned char *kit, int k)
{
    int t, q, p;
    for (t = 0; t < 8; t++)
        for (q = 0; q < DEST_LAST; q++) {
            p = OPAR((OPOS(DEFAULT_PARAM) + q) % DEST_LAST);
            if (!taken(kit, k, t, p)) {
                put_entry(kit, k, ENTRY(t, p, 0));
                return;
            }
        }
}

/* a click in the draft: the track is set, then the parameter, and the assignment is made */
static void draft_click(unsigned char *kit)
{
    int k = dk - 1;
    if (dstage == 0) {
        dpar = first_free(kit, k, dtrk);     /* the first parameter this track has free, from SRC.TUNE on, or its first CC slot turned on */
        if (!dpar)
            return;                          /* nothing free here: the track stays to be chosen */
        dstage = 1;
        selacc[1] = 0;
    } else {
        put_entry(kit, k, tgt_entry(dtrk, dpar, 0));
        capmask |= (unsigned char)(1 << k);  /* the knob takes the parameter's value (a CC knob: the tick picks it up) */
        show[k] = 0;
        dk = 0;
    }
}

/* a turn of the draft's knob: n steps through the tracks (1..8, all, then the MIDI tracks with a CC slot free) or through the free parameters */
static void draft_turn(unsigned char *kit, int n)
{
    int k = dk - 1;
    if (dstage == 0) {
        int v = dtrk;
        for (; n; n += n > 0 ? -1 : 1) {
            int w = v + (n > 0 ? 1 : -1);
            while (w >= T_MIDI && w <= T_LAST && !first_free(kit, k, w))
                w += n > 0 ? 1 : -1;         /* a MIDI track with no CC slot turned on, or all of them on knobs already */
            if (w < 0 || w > T_LAST)
                break;
            v = w;
        }
        dtrk = v;
        return;
    }
    dpar = step_param(kit, k, dtrk, dpar, n);
}

/* a tap of TRIG on the TRIG page: the Perform page opens over it */
static void open_page(void)
{
    digiperform_open = 1;
    from_trig = 1;
    trig_view = tap_view;
    digiperform_bodyview = tap_view;
    trig_down = 0;
    digiperform_title_on = 1;                /* the stock page starts its title again, and shows ours */
    editing = 0;
    cursor = 0;
    sel = 0;
    capture = 1;
    if (tap_stock)
        tap_stock(tap_view, press_ev);
}

int digiperform_key(void *brain, void *ev)
{
    int id = KEYID(ev);
    unsigned char *kit = UI_KIT;
    (void)brain;
    if (!digiperform_open) {
        if (trig_pend) {
            if (id == KEY_TRIG && !KEYDOWN(ev)) {
                trig_pend = 0;
                if (hold_t < TAP_TICKS && tap_view)
                    open_page();             /* a tap: the Perform page. A hold was the stock page's: its values, and TRIG + REC / STOP / PLAY */
            } else if (id != KEY_TRIG && KEYPRESS(ev)) {
                trig_pend = 0;               /* a key with TRIG held (copy, paste, a step ...): the stock page's gesture */
            }
        }
        if (no_up && id == 13) {             /* the NO that closed SETTINGS' EDIT view: its release must not reach the menu, which would close as well */
            no_up = 0;
            if (!KEYDOWN(ev))
                return 1;                    /* a new press is not that release: it goes on to the menu */
        }
        return 0;
    }
    if (from_trig) {                         /* the TRIG page's second page: the sequencer stays in reach */
        if (KEYPRESS(ev) && (((id == 2 || id == 3 || id == 18) && KEYHELD(KEY_FUNC)) ||
                             (id == 1 && (KEYHELD(2) || KEYHELD(3) || KEYHELD(18))))) {
            leave();                         /* FUNC + TRK (chords), PTN (metronome) or PAGE (scale): their stock pages stay up after the keys are released, so the stock TRIG page takes over */
            return 0;
        }
        if (id >= 14 && id <= 17 && KEYPRESS(ev) && step_held()) {
            leave();                         /* a step and LEFT / RIGHT (microtiming) or UP / DOWN (retrig): the stock TRIG page takes it from here */
            return 0;
        }
        if (id == KEY_TRIG) {                /* TRIG: held, it shows the values and takes REC / STOP / PLAY; a tap goes back to the first page */
            if (KEYHELD(KEY_FUNC)) {         /* FUNC + TRIG is the stock quantize page's */
                if (KEYPRESS(ev))
                    leave();
                return 0;
            }
            if (KEYPRESS(ev)) {
                int i;
                trig_down = 1;
                trig_used = 0;
                trig_rep = 0;
                hold_t = 0;
                for (i = 0; i < 64; i++)
                    press_ev[i] = ((unsigned char *)ev)[i];
            } else if (KEYDOWN(ev)) {
                if (trig_down)
                    trig_rep = 1;            /* a down event that is no fresh press: the key's repeat, which the stock page waits for too */
            } else if (trig_down) {
                int tap = !trig_used && hold_t < TAP_TICKS;   /* held longer, the page stays and its names come back */
                void *v = tap_view;
                trig_down = 0;
                if (tap) {
                    leave();
                    if (v && tap_stock)
                        tap_stock(v, press_ev);   /* the stock page sees the press now, and shows its own title */
                }
            }
            return 0;
        }
        if (id == 5 || id == 6 || id == 7 || id == 8 || (id >= 20 && id <= 23)) {   /* PTN (3) and BANK (4) pick another pattern: the page stays */
            leave();                         /* another page or a menu: the firmware takes it from here */
            return 0;
        }
        if (!editing) {
            if (id == 13 && KEYHELD(KEY_FUNC) && !dk) {   /* FUNC + NO reloads the pattern, the stock way: the sound's own values come back */
                if (KEYPRESS(ev)) {
                    release();               /* the offsets go at once; the knobs pick the reloaded values up when they have settled */
                    recap = 20;
                }
                return 0;
            }
            if (id >= 40 && id <= 47) {      /* a knob's push */
                int k = id - 40;
                if (dk) {                    /* a knob is being assigned: its push goes on, the others do nothing */
                    if (KEYPRESS(ev) && k == dk - 1 && kit)
                        draft_click(kit);
                    return 1;
                }
                if (!KEYHELD(KEY_FUNC))
                    return 0;
                if (KEYPRESS(ev) && kit) {   /* FUNC + push: assign an empty knob, or remove an assigned one */
                    if (E_PAR(entry(kit, k))) {
                        put_entry(kit, k, 0);
                        live[k] = 0;
                    } else {
                        dk = k + 1;
                        dstage = 0;
                        dtrk = 0;
                        selacc[0] = 0;
                    }
                }
                return 1;
            }
            if (id == 12)
                return 1;                    /* YES edits through FUNC + a knob's push */
            if (id != 9 && id != 10 && id != 11 && id != 13)
                return 0;                    /* trig keys, FUNC, TRK, PAGE, arrows: as usual */
        } else if ((id < 9 || id > 15) && (id < 40 || id > 47)) {
            return 0;                        /* the EDIT view takes REC .. DOWN and the knobs' pushes, nothing else */
        }
    } else if (id == 3 || id == 4 || (id >= 24 && id <= 39 && (KEYHELD(3) || KEYHELD(4)))) {
        return 0;                            /* SETTINGS' EDIT view: PTN and BANK, and the trigs with them, still pick a pattern */
    }
    if (id == 9 || id == 10 || id == 11) {   /* REC, PLAY, STOP */
        if (!trig_down || editing)
            return 0;                        /* plain, they still work */
        if (KEYPRESS(ev) && kit) {           /* TRIG + REC copies the page, + STOP pastes it, + PLAY clears it */
            trig_used = 1;
            page_key(kit, id);
        }
        return 1;
    }
    if (!KEYDOWN(ev))
        return 1;
    if (id >= 40 && id <= 47) {              /* EDIT: a push selects the knob's row, again it makes or removes the assignment */
        if (!editing || !KEYPRESS(ev) || !kit)
            return 1;
        if (cursor != id - 40) {
            cursor = id - 40;
        } else {
            if (E_PAR(entry(kit, cursor)))
                put_entry(kit, cursor, 0);
            else
                make_entry(kit, cursor);
        }
        return 1;
    }
    switch (id) {
    case 13:                                 /* NO: the EDIT view goes back (to PLAY, or to SETTINGS where it was opened), whether or not FUNC is still held */
        if (!editing && dk) {                /* PLAY, a knob being assigned: NO drops it, the knob stays empty */
            dk = 0;
        } else if (!editing) {               /* PLAY: NO puts every moved knob back, as stock's NO does for Control All; the page stays */
            int k;
            for (k = 0; k < NKNOB; k++)
                if (live[k]) {
                    macro[k] = rest[k];
                    fine[k] = 0;
                    show[k] = 0;
                    cc_letgo(k);             /* a CC knob sends the stored value again */
                }
            moving_update();
        } else if (editing && from_trig) {
            editing = 0;
            capture = 1;                     /* back to PLAY: the knobs pick up again */
        } else {
            leave();
            no_up = 1;                       /* back to the SETTINGS page: the menu is still there, and gets neither this press nor its release */
            if (settings_view)
                INVALIDATE((char *)settings_view + 0x38);   /* ... and is drawn again */
        }
        break;
    case 14:                                 /* UP */
        if (editing && cursor > 0)
            cursor--;
        break;
    case 15:                                 /* DOWN */
        if (editing && cursor < NENT - 1)
            cursor++;
        break;
    case 12:                                 /* YES: make or remove the row's assignment */
        if (editing && kit) {
            if (E_PAR(entry(kit, cursor)))
                put_entry(kit, cursor, 0);
            else
                make_entry(kit, cursor);
        }
        break;
    default:
        break;
    }
    return 1;
}

/* The encoders report 4 for each click (the emulator's turn 1 gives 4; the stock pages count in clicks). */
#define CLICK   4

/* a turn of delta, with what is left over from earlier turns in *a; the steps of per raw units it makes */
static int steps(int *a, int delta, int per)
{
    int n;
    *a += delta;
    n = *a / per;
    *a -= n * per;
    return n;
}

int digiperform_enc(void *brain, void *ev)
{
    int id = *(int *)((char *)ev + 12);
    int delta = *(int *)((char *)ev + 16);
    unsigned char *kit;
    u16 e;
    int v, n;
    (void)brain;
    if (!digiperform_open)
        return 0;
    if (from_trig && (id < 1 || id > (editing ? 9 : NKNOB)))
        return 0;                            /* LEVEL and the rest keep their stock job */
    kit = UI_KIT;
    if (!kit || !delta)
        return 1;
    if (!editing) {                          /* PLAY: knob A-H (ids 1..8) is macro 0..7 */
        if (dk) {                            /* a knob is being assigned: its turns choose, the others do nothing */
            if (id == dk)
                draft_turn(kit, sel_steps(dstage ? 1 : 0, delta));
            return 1;
        }
        if (id >= 1 && id <= NKNOB) {
            sel = id - 1;
            lid_refresh(kit);
            if (live[sel] && !srcempty(KTRK(entry(kit, sel)), E_PAR(entry(kit, sel)))) {
                u16 se = entry(kit, sel);
                int p = E_PAR(se), t = KTRK(se), sid, cur, d, w, x, m, swallowed = 0;
                lid_refresh(kit);
                sid = pid(t, p);
                cur = shown_word(kit, sel);
                {                            /* the knob's track borrowed: a mod answers the step size for the track's machine */
                    u32 bs = 0, ba = 0;
                    if (srcknob(t, p)) {
                        bs = lock();
                        ba = borrow(kit, t);
                    }
                    d = enc_delta(sel, sid, delta, KEYHELD(39 + id));   /* the stock feel: accelerated, scaled by the parameter's step size */
                    if (srcknob(t, p)) {
                        unborrow(kit, ba);
                        unlock(bs);
                    }
                }
                if (d) {                     /* the firmware locks a knob for 4 decay ticks (0.4 s) when FUNC starts snapping it and after each snap, and ignores its turns meanwhile */
                    int sn = KEYHELD(KEY_FUNC) && sid != 0x27;
                    if (!snapprev && sn)
                        ENC_LOCK(sel) = 4;
                    snapprev = (unsigned char)sn;
                    if (ENC_LOCK(sel) > 0) {
                        d = 0;
                        swallowed = 1;
                    }
                }
                if (E_NEG(se))
                    d = -d;                  /* an inverted knob turns the parameter the other way */
                n = d != 0;
                if (n) {
                    const int *ds;
                    u32 bs = 0, ba = 0;
                    if (srcknob(t, p)) {
                        bs = lock();
                        ba = borrow(kit, t);
                    }
                    ds = ENC_DESC(sid);
                    if (KEYHELD(KEY_FUNC) && sid != 0x27 && ds[19])
                        ENC_LOCK(sel) = 4;
                    w = KEYHELD(KEY_FUNC) && sid != 0x27 && ds[19] ?        /* FUNC + turn: the parameter's own snap */
                        ((int (*)(const void *, int, int, int, int, int))ds[20])(ds + 17, cur, d, pminw(t, p), pmaxw(t, p), PTABLE[sid * 13 + 4]) : cur + d;
                    if (srcknob(t, p)) {
                        unborrow(kit, ba);
                        unlock(bs);
                    }
                    w = w < pminw(t, p) ? pminw(t, p) : w > pmaxw(t, p) ? pmaxw(t, p) : w;
                    x = w - restw[sel];
                    if (E_NEG(se))
                        x = -x;
                    m = (x >= 0 ? (x + 128) >> 8 : -((-x + 128) >> 8));      /* whole knob steps, and what is left over as the fine part */
                    v = rest[sel] + m;
                    v = v < pmin(t, p) ? pmin(t, p) : v > pmax(t, p) ? pmax(t, p) : v;
                    macro[sel] = (unsigned char)v;
                    fine[sel] = (short)(x - (v - rest[sel]) * 256);
                    moving_update();         /* the block plays the turn at once */
                    if (IS_CC(p))
                        cc_out(sel);         /* a CC knob: the moved value goes out now */
                }
                if (!swallowed)
                    show[sel] = 36;          /* the value shows for about a second (the tick is 30 Hz) */
                if (n && trig_view) {        /* and in the header, as the stock pages do: Name=value, then it slides away */
                    char vb[12];
                    static char hb[40];      /* "Trk1 Frequency", or "All Frequency", the message's name part */
                    const char *nm = (const char *)STOCK_NAME(0, sid);
                    int q = 0;
                    u16 se = entry(kit, sel);
                    if (src_name(kit, t, p, 1) && *src_name(kit, t, p, 1))
                        nm = src_name(kit, t, p, 1);   /* the SRC page's own long name for the track's machine */
                    if (IS_CC(p) && !same(cc_name(t, CC_SLOT(p)), (const char *)((u32 (*)(int, int))0x4000fe8a)(0, sid)))
                        nm = cc_name(t, CC_SLOT(p));   /* a slot named on the CC page: its name rather than "CC1 Value" */
                    value_text(vb, 11, kit, t, p, shown_word(kit, sel));
                    if (E_ALL(se)) {
                        hb[q++] = 'A'; hb[q++] = 'l'; hb[q++] = 'l';
                    } else if (IS_CC(p)) {
                        int tn = 9 + E_TRK(se);   /* Trk9..Trk16, as the trig keys label the MIDI tracks */
                        hb[q++] = 'T'; hb[q++] = 'r'; hb[q++] = 'k';
                        if (tn > 9)
                            hb[q++] = '1';
                        hb[q++] = (char)('0' + tn % 10);
                    } else {
                        hb[q++] = 'T'; hb[q++] = 'r'; hb[q++] = 'k'; hb[q++] = (char)('1' + E_TRK(se));
                    }
                    hb[q++] = ' ';
                    {                        /* a shared name gets its page's prefix; if the message would be wider than the header's bar the prefix goes, and then the name gives way to the label under the knob */
                        const char *lb = plabel(kit, t, p);
                        int pl = 0, rw;
                        while (lb[pl] && lb[pl] != '.')
                            pl++;
                        pl = lb[pl] == '.' ? pl + 1 : 0;           /* "L1.", "F.", "A.": the label's own prefix */
                        hb[q] = 0;
                        rw = adv(TITLE_FONT, hb, 99) + adv(TITLE_FONT, "=", 1) + worst_value(kit, t, p) - 1;
                        if (rw + adv(TITLE_FONT, lb, pl) + adv(TITLE_FONT, nm, 99) > HDR_PIXELS)
                            pl = 0;          /* too wide: the name without its prefix */
                        if (rw + adv(TITLE_FONT, nm, 99) > HDR_PIXELS) {
                            nm = lb;         /* still too wide: the label under the knob */
                            pl = 0;
                        }
                        for (n = 0; n < pl; n++)
                            hb[q++] = lb[n];
                    }
                    while (*nm && q < 39)
                        hb[q++] = *nm++;
                    hb[q] = 0;
                    HDR_MSG(*(void **)((char *)trig_view + 0x6c), "%s=%s", hb, vb);
                }
            } else if (!E_PAR(entry(kit, sel)) && trig_view) {   /* an empty knob: the MIDI CC page's message, which slides away by itself */
                if (steps(&acc[sel], delta, CLICK))
                    HDR_MSG(*(void **)((char *)trig_view + 0x6c), "%s", "Func+Press to enable");
            }
        }
        return 1;
    }
    if (id == 9) {                           /* LEVEL: the cursor */
        if (delta > 0 && cursor < NENT - 1)
            cursor++;
        else if (delta < 0 && cursor > 0)
            cursor--;
        return 1;
    }
    e = entry(kit, cursor);
    if (!E_PAR(e))
        return 1;                            /* an empty row: YES makes it first */
    switch (id) {
    case 1:                                  /* track: the ones that have this parameter free, 1..8, ALL, then M1..M8 (a CC slot) */
        {
            int p = E_PAR(e);
            n = sel_steps(0, delta);
            v = step_target(kit, cursor, TGT(e), &p, n);
            e = tgt_entry(v, p, E_NEG(e));
        }
        break;
    case 2:                                  /* parameter: the ones this track has free (a MIDI track: its CC slots turned on) */
        n = sel_steps(1, delta);
        e = tgt_entry(TGT(e), step_param(kit, cursor, TGT(e), E_PAR(e), n), E_NEG(e));
        break;
    case 3:                                  /* direction: right +, left - */
        e = (u16)((e & ~8) | (delta < 0 ? 8 : 0));
        break;
    default:
        break;
    }
    put_entry(kit, cursor, e);
    return 1;
}

/* The key handler of the audio TRIG page (ParametersSeqNoteView), vtable slot 2, run first by perf_glue.s.
 * A page view keeps the key it belongs to at +0x88; on the TRIG page a second press of TRIG does nothing
 * stock, so it opens this page. Every other key goes on to the stock handler. The MIDI tracks' pages are
 * not hooked. */
int digiperform_trigkey(void *view, void *ev, int (*stock)(void *, void *))
{
    int i;
    if (KEYID(ev) != KEY_TRIG || !KEYPRESS(ev) || *(int *)((char *)view + 0x88) != KEY_TRIG || KEYHELD(KEY_FUNC))
        return 0;                            /* FUNC + TRIG is the stock quantize page */
    if (digiperform_open)
        return 0;
    tap_view = view;                         /* the release decides: a tap opens the page, a hold stays the stock page's (digiperform_key) */
    tap_stock = stock;
    for (i = 0; i < 64; i++)
        press_ev[i] = ((unsigned char *)ev)[i];   /* kept, to start the header's title again */
    trig_pend = 1;
    hold_t = 0;
    return 0;                                /* not taken: the stock page shows its values while TRIG is down */
}
