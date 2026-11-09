// SPDX-License-Identifier: GPL-3.0-or-later
// MKI copy (Analog Rytm MKI, OS 1.74) of the MKII base's sendbus.c: the voices come from the MKI's receive
// ring (10 words a frame, the voices first, in voice order), its block read where the hook runs (blk.rx0, set by
// sendbus.s each block), and the FX and SEND pages are plain text on the MKI's 122x32 screen until they are
// designed for it. Everything else is the MKII's.
// Modwerk's Analog Rytm MKII base: the send bus and its effects' list, from Send FX (the same author's module,
// whose effects now come one per module).
//
// Each sound track has a send (the SEND page, behind AMP), kept in the sound. Every audio block the eight
// voices, as the codec brings them back (the signal the delay and reverb sends take), are summed by their
// tracks' sends; the effect the kit names (an mw_fx record, modwerk/fx.h) turns that mono signal into a stereo
// return, which LEV scales and adds to the PRE FX return: it reaches the analog mixer with the delay and the
// reverb, before the distortion and the compressor (sendbus.s).
//
// The FX page (FX track, DELAY pressed again) shows the effect: FUNC + A chooses it among the build's records,
// FUNC + E sets LEV, A-H its eight controls. The effect and its controls are kept in the kit, LEV in the project.
// SRC (the DELAY page key) held + YES sets A-H at random, + NO brings back the values before, once.
// The pages sit in the page keys' lists core-ar2 keeps. A-H take parameter locks as stock's own do (a step held
// in grid recording, or live recording), in stock's lock table on the FX track, which the base saves (locks.c).
//
// With every send at 0 (the default) nothing is added: the unit sounds stock. Firmware routines and data are
// reached at fixed addresses given for each OS release by base.json's cflags.

#include "analog-rytm-mk2/store.h"
#include "fx-tables.h"
#include "modwerk/fx.h"

STORE_FIELD(mw_send_send);            // sound, 7 bits: the track's send
STORE_FIELD(mw_send_a);               // kit, 27 bits: the effect's id << 21 | A-C
STORE_FIELD(mw_send_b);               // kit, 28 bits: D-G
STORE_FIELD(mw_send_c);               // kit, 7 bits: H
STORE_FIELD(mw_send_lev);             // project, 7 bits: LEV
STORE_FIELD(mw_send_d);               // MKI: project, 14 bits: the return's DEL << 7 | REV, as LEV

typedef unsigned long word_t;
typedef unsigned (*is_key_held_t)(int key);
typedef word_t (*project_singleton_t)(void);
typedef int (*track_index_of_t)(void *selection);
typedef word_t (*kit_track_sound_t)(void *kit, int track);
typedef void (*fillrect_t)(void *bmp, int x0, int y0, int x1, int y1, int colour);
typedef void (*text_draw_t)(void *bmp, void *font, int x, int y, int centred, int a5, const char *width, const char *fmt, ...);
typedef word_t (*text_font_t)(void *ctx);

#define IS_KEY_HELD ((is_key_held_t)IS_KEY_HELD_AT)
#define PROJECT_SINGLETON ((project_singleton_t)PROJECT_SINGLETON_AT)
#define TRACK_INDEX_OF ((track_index_of_t)TRACK_INDEX_OF_AT)
#define KIT_TRACK_SOUND ((kit_track_sound_t)KIT_TRACK_SOUND_AT)
#define FILLRECT ((fillrect_t)FILLRECT_AT)
#define TEXT_DRAW ((text_draw_t)TEXT_DRAW_AT)
#define TEXT_FONT ((text_font_t)TEXT_FONT_AT)
#define TEXT_CTX ((void *)TEXT_CTX_AT)
// The codec's input for the block before: 32 frames of 10 words (the eight
// voices, AUDIO IN L/R), each negated as stock's sends read them (MKI).
#define RX_FRAME 10
#define RX(frame, word) (((volatile int *)blk.rx0)[(frame) * RX_FRAME + (word)])
// The voice -> receive word table (eight longwords, 0..7, add 2) and the
// voice -> playing track table (eight bytes) stock's FX sends use.
#define VOICE_SLOT(v) (v)          // MKI: a voice's receive word is its number
#define VOICE_TRACK(v) (((volatile unsigned char *)VOICE_TRACK_AT)[v])
// The PRE return words of output slot s: 32 frames, 16 words a frame, the
// left and right words first; 24-bit values in the low bits.
#define PRE(s, frame) ((volatile int *)(TX_RING_AT + 0x30 + ((s) & 3) * 2048 + (frame) * 64))
// Stock's tempo, in 1/120 BPM (as Loop Sync reads it).
#define TEMPO_WORD (*(volatile int *)TEMPO_WORD_AT)
// The FX track's words as stock's last trig left them, value << 16: its
// smoother state, set at each FX trig (locks, or the kit's words) and never
// touched by the LFO, scenes or performances (they write the effective array).
#define SMOOTH_FX(w) (((volatile unsigned *)SMOOTH_FX_AT)[w] >> 16)

// The firmware returns a pointer in d0, where this compiler reads a0: its
// routines are declared to return a word, and the result cast.
typedef word_t (*singleton_t)(void);
typedef int (*is_live_rec_t)(void *rec);
typedef int (*playing_step_t)(void *seq, int track);
typedef word_t (*pattern_of_t)(void *project);
typedef word_t (*track_pattern_t)(void *pattern, int track);
typedef int (*set_lock_t)(void *tp, int step, int word, int value, int fine);
typedef int (*step_test_t)(void *tp, int step);
typedef void (*add_lock_trig_t)(void *tp, int step, int on);
#define REC_STATE ((singleton_t)REC_STATE_AT)            // the recorder: held trigs, live recording
#define SEQ_STATE ((singleton_t)SEQ_STATE_AT)            // the sequencer: each track's step
#define IS_LIVE_REC ((is_live_rec_t)IS_LIVE_REC_AT)
#define PLAYING_STEP ((playing_step_t)PLAYING_STEP_AT)
#define PATTERN_OF ((pattern_of_t)PATTERN_OF_AT)
#define TRACK_PATTERN ((track_pattern_t)TRACK_PATTERN_AT)
#define SET_LOCK ((set_lock_t)SET_LOCK_AT)               // TrackPattern setLock: checks the step, saves
#define HAS_TRIG ((step_test_t)HAS_TRIG_AT)
#define HAS_TRIG2 ((step_test_t)HAS_TRIG2_AT)
#define ADD_LOCK_TRIG ((add_lock_trig_t)ADD_LOCK_TRIG_AT)
#define REC_HELD_HI 0x158          // the recorder: steps 32-63 held (grid recording only)
#define REC_HELD_LO 0x15c          // steps 0-31
#define TP_LOCKS 44                // a track pattern's lock object
#define VT_LOCK_TABLE 0x28         // the lock object's vtable: the live lock table
#define LOCK_TRACK_BYTES 5674      // the live lock table: a track's 64 steps, then its fine flags
#define LOCK_STEP_BYTES 88         // a step: 42 words, then its lock count
// A-H's locks are words of stock's lock table that no stock parameter uses on
// the FX track: 38-41 hold A-B, C-D, E-F and G-H, a byte each, and word 0
// marks which of the eight a step locks. Stock counts a word under 0x8000 as
// a lock, and saves word 0 (fine, so all its bits) as its own; core-ar2 0.7
// saves words 38-41.
#define LOCK_WORD_MASK 0           // LOCK_MARK | the controls locked << 1
#define LOCK_WORD_FIRST 38
#define LOCK_MARK 0x4000
#define NO_LOCK 0xffff

#define KEY_FUNC 0x80
#define KEY_TRK 0x86
#define KEY_TRIG_LAST 0x0f
#define KEY_PAD_FIRST 0x90
#define KEY_PAD_LAST 0x9b
#define KEY_RECORD 0x50
#define KEY_STOP 0x52
#define KEY_PUSH_FIRST 0x70        // the encoders A-H pressed
#define KEY_PUSH_LAST 0x77
#define KEY_PRESSED 1              // ev_key flags: 1 pressed
#define KEY_YES 0x44
#define KEY_NO 0x45
#define KEY_SRC 0x31               // the FX track's DELAY page key
#define FX_TRACK 12
#define SOUND_TRACKS 12
#define PROJECT_KIT 232            // project + 232: the active kit (MKI; the MKII's is + 352)
#define PROJECT_TRACKSEL 48        // project + 48: the track selection
#define ACC_LIVE_SOUND 0x28        // sound accessor vtable: the live sound
#define ACC_CONFIG_CHANGED 0x10    // sound accessor vtable: the change notice
#define COUNTS 1                   // encoder counts per step (MKI: stock steps a value a count; the MKII's are 2)
#define TYPE_COUNTS 4              // encoder counts per effect step (MKII 8)
#define SYNC_COUNTS 2              // encoder counts per note division (MKII 4)
#define SHOW_TICKS 25              // about 1.2 s of the ~20 Hz tick
#define SHOWN_LEV 8                // shown_knob: LEV
#define PAGE_SHOWN_FX 1            // page: the FX page
#define PAGE_SHOWN_SEND 2          // the SEND page
#define PAGE_SHOWN_SETUP 3         // MKI: the FX track's TYPE and LEV page

#define MODS_END 0x47c00000        // the end of the mods' RAM (elekloader's Analog Rytm MKII ddr), where the work area ends
#define CLEAR_STEP 1024            // work area words cleared a block, the effect silent until it is clean
#define UNITS_PER_BPM 120          // the tempo word's unit
#define DIVS 12                    // note divisions (div_q1000)
#define VOICES 8
#define IDLE_BLOCKS 3000           // 2 s with no send before the effect is left silent
#define LEV_DEFAULT 71             // as loud as 100 was before LEV went up to 2x
#define N24 16                     // samples a block at 24 kHz

// ---------------------------------------------------------------- the FX list

// The effects this build holds: each effect module contributes one record to mw_fx (modwerk/fx.h), a table of
// pointers ending in 0, as core-ar2's machines are. fx_type is a record's place in the list built from it; a kit
// names its effect by the record's id, so a kit whose effect the build does not hold keeps its values and plays
// no return (MISSING).
extern const struct mw_fx *const mw_fx[];
// The work area the effect that runs uses (its delay lines, its tables): the mods' RAM the build leaves free, from
// the end of every mod's .bss (__bss_end, the linker's) to MODS_END. It is sized by the set, so it takes no RAM a mod
// needs, and a set whose modules leave less than an effect asks for does not list that effect.
extern int __bss_end[];
#define ROOM 16                    // the records the chooser lists
#define MISSING 0xff
static const struct mw_fx *list[ROOM];
static int n_fx = -1;              // -1 until the first project: nothing runs
static const struct mw_fx missing = { MW_FX_ABI, 0, 0, 0, 256, 0, "MISSING", { { "", 0, 0, 0 } }, 0, 0, 0 };

static int *work;                  // the work area (below)
static unsigned room;              // its words

// The records a module may hold: this ABI, the one send, a known id once, the work area it fits in.
static void build_list(void)
{
    int i, j, n = 0;
    work = (int *)(((unsigned)__bss_end + 15) & ~15u);
    room = (MODS_END - (unsigned)work) / 4;
    for (i = 0; mw_fx[i] && n < ROOM; i++) {
        const struct mw_fx *fx = mw_fx[i];
        int dup = 0;
        for (j = 0; j < n; j++) dup |= list[j]->id == fx->id;
        if (fx->abi == MW_FX_ABI && fx->slot == 0 && fx->id >= 1 && fx->id <= 63 && !dup
            && fx->work <= MW_FX_WORK && fx->work <= room && fx->render && fx->reset)
            list[n++] = fx;
    }
    n_fx = n;
}

static int index_of(unsigned id)
{
    int i;
    for (i = 0; i < n_fx; i++)
        if (list[i]->id == id) return i;
    return MISSING;
}

static int top_of(const struct mw_fx *fx, int k)
{
    int icon = fx->c[k].icon;
    return icon == MW_IC_SYNC ? DIVS - 1 : icon == MW_IC_SWITCH ? 1 : 127;
}

static int bipolar(const struct mw_fx *fx, int k) { return fx->c[k].flags & MW_FX_BIPOLAR; }

// Written by the idle tick and the handlers, read by the audio block: the
// effect, A-H as their knobs set them (the kit's values), LEV. The effects
// read par, A-H as the audio block plays them (play_values: a lock, else the
// knob).
static unsigned char fx_type = MISSING, knob[8], par[8], lev = LEV_DEFAULT;
static unsigned fx_id;             // the kit's effect, by id
static const struct mw_fx *cur(void) { return fx_type < n_fx ? list[fx_type] : &missing; }

static unsigned char send[SOUND_TRACKS];
static int ready;

// The audio block's state. The words of the work area the effect that runs uses, cleared a step a block when it
// starts.
static unsigned clear_at, clear_end;
static int g_voice[VOICES];
// Light blocks (gate.s): every other block only keeps its input (xb) and
// gives back the return the block before worked out for it (ob); the block
// after runs the effect on both inputs, the second time with the effect's
// code and data still in the caches. What a light block touches is kept
// together, on as few cache lines as it can: gate.s works the light blocks
// out and reads it at these offsets.
struct {
    int ob[2][32];         //   0: the return worked out for the next block, a side (24 kHz: the sample before, then 16)
    int xb[32];            // 256: the light block's input, kept for the full block after
    int vl[VOICES][2];     // 384: the voices that send: their word's byte offset in a frame, their gain (Q15)
    int nv;                // 448: how many
    int mode;              // 452: 1 a 24 kHz effect, 3 one whose input is lifted (lift)
    int last;              // 456: the 24 kHz input's last sample (the lift)
    int pv[2];             // 460: a 24 kHz return's last sample given back, a side
    int glev;              // 468: LEV's gain as the block before left it
    int state;             // 472: the next block: 0 full, 1 light (ob holds its return), 2 full with xb kept
    int rtype;             // 476: the effect the full blocks run (run_type)
    int ltrim;             // 480: its trim (Q8)
    const unsigned char *pfx, *plev;   // 484, 488: fx_type and lev
    int pre0, rx0;         // 492, 496: frame 0 of the PRE words (slot 0) and of the receive buffer
    unsigned used;         // 500: the CPU meter: the blocks' time (DMA timer 0)
    int blocks;            // 504: and how many
    int lockw;             // 508: the FX track's word 0 par was worked out with (play_values), ~0 for again
} __attribute__((aligned(16))) mw_send_blk;
#define blk mw_send_blk
_Static_assert(__builtin_offsetof(__typeof__(blk), nv) == 448 && __builtin_offsetof(__typeof__(blk), blocks) == 504, "gate.s");
_Static_assert(sizeof blk == 512, "lockw shares the meter's cache line");
static int run_type = -1, idle;

// UI state.
static int page;                   // the page up, as the last frame drawn told: 0 none, or PAGE_SHOWN_*
static volatile int drawn;         // the pages whose ids stock asked since the last frame, 1 << PAGE_SHOWN_*
static int acc_enc = -1, acc_cnt, acc_func;
static int shown_knob = -1, show_ticks, title_ticks;
static int random_ticks, undo_type = -1;   // SRC + YES's notice; the effect SRC + NO can bring back
static unsigned char undo_knob[8];
static unsigned urnd;
static char *g_ctrl;               // the view controller ev_tick last had: +0x20 asks for a redraw

// The send runs on 16-bit signals (about +-2^15, held within +-2^16): the
// build links no 64-bit arithmetic, and the audio block has little time left.
#define SIG_MAX 65535

static int clamp(int v, int lim) { return v > lim ? lim : v < -lim ? -lim : v; }

// A triangle LFO bent towards a sine: phase -> -32768..32768, a cosine (the
// page draws an LFO's shape with it).
static int lfo(unsigned ph)
{
    int t = (int)(ph >> 15) - 65536;
    int tri = (t < 0 ? -t : t) - 32768;
    int a = tri < 0 ? -tri : tri;
    return (tri * (98304 - a)) >> 16;
}

// A clean state for the effect that starts: the work area is cleared a step a block (mw_send_block), the
// effect's own state at once.
static void reset_state(const struct mw_fx *fx)
{
    clear_at = 0;
    clear_end = fx->work;
    fx->reset(work);
    blk.last = blk.pv[0] = blk.pv[1] = blk.state = 0;
    blk.lockw = ~0;
    blk.pfx = &fx_type;
    blk.plev = &lev;
    blk.pre0 = (int)PRE(0, 0);
}

// The tempo, 1/120 BPM; 120 BPM if stock's word holds no plausible value.
int mw_fx_tempo(void)
{
    int t = TEMPO_WORD;
    return t < 30 * UNITS_PER_BPM || t > 300 * UNITS_PER_BPM ? 120 * UNITS_PER_BPM : t;
}

// gate.s: the input's eight voices and the return, through the EMAC; a
// light block's input (the voices in blk.vl, then the lift) and the return
// worked out for a block (blk.ob, LEV's gain stepped from blk.glev to tlev);
// gate.s calls mw_send_block for a full block.
void mw_send_in8(const volatile int *rx, const int *gain, int *x, int pairs);
void mw_send_out(int *pre, const int *l, const int *r, int g, int step, int half);
void mw_send_inl(void *b, const volatile int *rx);
void mw_send_ret(void *b, volatile int *pre, int tlev);

static void run_fx(int type, const int *x, int *L, int *R) { list[type]->render(x, L, R, par, work); }

// The sequencer's time for the effects (clock.c): worked out each block, then dated for each render.
void mw_clock_block(void);
void mw_clock_date(int back);

// The CPU meter: DMA timer 0's counter, which core-ar2 starts free running
// at the bus clock (its core.s) and stock reads as a time base. gate.s times
// each block (blk.used, blk.blocks); every 1500 blocks, about a second, this
// shows their time over the time they span, in tenths of a percent, with
// FUNC held on the FX page. The mean, not the busiest block: it is the mean
// that leaves the UI its time, and full and light blocks alternate.
#define DTCN0 (*(volatile unsigned *)0xFC07000C)
static unsigned cpu_w0;
static int cpu_shown, cpu_drawn = -1;

// The rare paths sit out of the usual block's way (cold: placed after the
// rest of the code), so that a block touches fewer cache lines.
#define COLD __attribute__((noinline, cold))

void COLD mw_send_meter(void)
{
    unsigned w = (DTCN0 - cpu_w0) / 1000;
    cpu_shown = cpu_w0 && w ? (int)(blk.used / w) : 0;
    cpu_w0 = DTCN0;
    blk.used = blk.blocks = 0;
}

// The pairs' mean and the step back up dull the top of a 24 kHz effect's
// return (-2 dB at 6 kHz, -6 dB at 10 kHz): x + (x - the sample before) / 4
// lifts it back (+2 dB at 6 kHz, +3.4 dB at 10 kHz). The delays keep their sound.
static void lift(int *x)
{
    int f, p = blk.last;
    for (f = 0; f < N24; f++) {
        int s = x[f];
        x[f] = clamp(s + ((s - p) >> 2), SIG_MAX);
        p = s;
    }
    blk.last = p;
}

// A voice's send, Q15, squared as stock's sends.
static int target(int v)
{
    int t = VOICE_TRACK(v), s = t < SOUND_TRACKS ? send[t] : 0;
    return s * s * 2;
}

// Each voice's gain set to its send, and the light block's list of the
// voices that send.
static void COLD set_gains(void)
{
    int v, nv = 0;
    for (v = 0; v < VOICES; v++) {
        int tgt = target(v);
        g_voice[v] = tgt;
        if (tgt) {
            blk.vl[nv][0] = 4 * VOICE_SLOT(v);
            blk.vl[nv][1] = tgt;
            nv++;
        }
    }
    blk.nv = nv;
}

// The voices that send or still fade out.
static int COLD active(void)
{
    int v, n = 0;
    for (v = 0; v < VOICES; v++) n += (target(v) | g_voice[v]) != 0;
    return n;
}

// A new effect starts clean; after 2 s with no send the effect is left
// silent (a clean state once); the work area words a new effect uses are
// cleared a step a block, the effect silent until they are clean. 1: the block stops here, each
// voice's gain set to its send.
static int COLD unusual(int type, int moving)
{
    unsigned f, n;
    if (type != run_type) {
        const struct mw_fx *fx = list[type];
        reset_state(fx);
        run_type = blk.rtype = type;
        blk.ltrim = fx->trim;
        blk.mode = fx->flags & MW_FX_24K ? (fx->flags & MW_FX_LIFT ? 3 : 1) : 0;
    }
    if (idle >= IDLE_BLOCKS) {
        if (idle == IDLE_BLOCKS) {
            reset_state(list[type]);
            idle++;
        }
    } else if (clear_at < clear_end) {
        n = clear_end - clear_at < CLEAR_STEP ? clear_end - clear_at : CLEAR_STEP;
        for (f = 0; f < n; f++) work[clear_at + f] = 0;
        clear_at += n;
    } else {
        return 0;
    }
    if (moving) set_gains();
    return 1;
}

// The input while a send moves: voice by voice down the block (a word every
// 12), each voice's gain stepped from the block before's to its send.
static void COLD input_moving(int half)
{
    int v, f, n = 0, m = half ? N24 : 32, *x = blk.xb;
    for (f = 0; f < m; f++) x[f] = 0;
    for (v = 0; v < VOICES; v++) {
        const volatile int *in = &RX(0, VOICE_SLOT(v));
        int tgt = target(v), g = g_voice[v], st = (tgt - g) / 32;
        if (!tgt && !g) continue;
        n++;
        if (half)
            for (f = 0, st <<= 1; f < N24; f++, in += 2 * RX_FRAME) { g += st; x[f] += (((in[0] >> 16) + (in[RX_FRAME] >> 16)) * g) >> 16; }
        else
            for (f = 0; f < 32; f++, in += RX_FRAME) { g += st; x[f] += ((*in >> 16) * g) >> 15; }   // 16-bit x Q15
    }
    if (n > 1)
        for (f = 0; f < m; f++) x[f] = clamp(x[f], SIG_MAX);
    set_gains();
    if (blk.mode & 2) lift(x);
}

// The input of two voices or more, steady: through the EMAC, all eight at
// once, each word's gain the sum of its voices'.
static void __attribute__((noinline)) input8(int half)
{
    int v, gw[VOICES];
    for (v = 0; v < VOICES; v++) gw[v] = 0;
    for (v = 0; v < blk.nv; v++) gw[blk.vl[v][0] / 4] += blk.vl[v][1];
    mw_send_in8(&RX(0, 0), gw, blk.xb, half);
    if (blk.mode & 2) lift(blk.xb);
}

// A-H as the full block plays them (par): each control's lock on the FX trig
// that played last (stock left word 0's mark and the pairs in its smoother
// state), else its knob. Worked out again when word 0 is not the one par was
// worked out with (a trig changed it, or the UI asked with ~0), and at every
// block while a lock plays, as another trig may change the pairs alone.
static void COLD play_values(int type, unsigned m)
{
    unsigned mask = (m & 0xc000) == LOCK_MARK ? m >> 1 & 0xff : 0;
    int k;
    blk.lockw = (int)m;
    for (k = 0; k < 8; k++) {
        int v = knob[k];
        if (mask >> k & 1) {
            unsigned w = SMOOTH_FX(LOCK_WORD_FIRST + k / 2);
            int top = top_of(list[type], k);
            v = k & 1 ? (int)(w & 127) : (int)(w >> 8 & 127);
            if (v > top) v = top;
        }
        par[k] = (unsigned char)v;
    }
}

// A full block, from the FX returns' hook (gate.s).
// (On the author's unit, with a busy project, the block's time left the UI
// seconds behind. Its time there goes as much to the cache lines a block
// touches, refilled every block as stock's own work evicts them, as to its
// instructions: hence every loop kept short, the light blocks, the rare
// paths out of the way, and the returns and inputs in blk.)
void mw_send_block(int slot)
{
    int v, n, moving = 0, half, tlev, type = fx_type;
    unsigned m;

    mw_clock_block();
    if (type >= n_fx) {                          // no effect, or the kit's is missing: no return
        if (moving) set_gains();
        run_type = -1;
        blk.state = 0;
        return;
    }

    for (v = 0; v < VOICES; v++) moving |= target(v) != g_voice[v];   // a send moved
    n = moving ? active() : blk.nv;
    if (n) idle = 0;
    else if (idle < IDLE_BLOCKS) idle++;
    if ((type != run_type || idle >= IDLE_BLOCKS || clear_at < clear_end) && unusual(type, moving)) return;

    // A-H: one word read a block, the lock pairs only while a lock plays.
    m = SMOOTH_FX(LOCK_WORD_MASK);
    if ((int)m != blk.lockw || (m & 0xc000) == LOCK_MARK) play_values(type, m);

    // LEV, Q13: 127 is about 2x, 71 about 0.6x; 16 bits -> 24, as the chorus
    // was heard. The gain is stepped across the block. The return goes out a
    // block late: a light block gives back the one worked out for it, a full
    // block the light block's (worked out from its input, xb, now), then
    // works out its own for the block after.
    half = blk.mode & 1;
    tlev = (lev * lev * blk.ltrim) >> 8;
    if (blk.state == 2) {
        mw_clock_date(1);
        run_fx(type, blk.xb, half ? &blk.ob[0][1] : blk.ob[0], half ? &blk.ob[1][1] : blk.ob[1]);
        mw_send_ret(&blk, PRE(slot, 0), tlev);
    }

    // The input, into xb: 32 frames, or for a 24 kHz effect the mean of each
    // pair; one voice needs no clamp: its gain is at most unity.
    if (moving) input_moving(half);
    else if (blk.nv > 1) input8(half);
    else mw_send_inl(&blk, &RX(0, 0));
    mw_clock_date(0);
    run_fx(type, blk.xb, half ? &blk.ob[0][1] : blk.ob[0], half ? &blk.ob[1][1] : blk.ob[1]);
    blk.state = 1;
    blk.glev = tlev;
}

// Everything below runs in the UI task: built for size, as the 128 KB the
// mods share holds core-ar2, every other mod and what is left of it is the
// send effects' work area. The audio block above stays at the build's -O2.
#pragma GCC optimize ("Os")

// ---------------------------------------------------------------- storage

static void *accessor(int track)
{
    char *project = (char *)PROJECT_SINGLETON();
    return (void *)KIT_TRACK_SOUND(project + PROJECT_KIT, track);
}

static void *live_sound(void *acc)
{
    word_t (*get)(void *) = (*(word_t (***)(void *))acc)[ACC_LIVE_SOUND / 4];
    return (void *)get(acc);
}

// The notice stock's sound setters send, without which a sound field is lost
// at a reboot unless the kit is saved (rytm2_mods voice-dac).
static void notify(void *acc)
{
    struct { const void *vtable; unsigned char kind; } info = { (const void *)SOUND_CONFIG_CHANGED_VT, 1 };
    void (*changed)(void *, void *) = (*(void (***)(void *, void *))acc)[ACC_CONFIG_CHANGED / 4];
    changed(acc, &info);
}

// The kit now in use: its first sound sits KIT_SOUND0 bytes in (the layout
// core-ar2's store-check reads), and stock's accessor gives that sound for the
// active kit, so the kit follows LOAD KIT and pattern changes. (The project's
// +352 object is not a kit: fields kept there were never saved; a fixed
// working-kit address did not follow a kit change.)
#define KIT_SOUND0 42

static void *live_kit(void)
{
    char *s = (char *)live_sound(accessor(0));
    return s ? s - KIT_SOUND0 : 0;
}

// The knobs or the effect changed: the next full block works par out again.
// (Written after them: the audio block can come between any two writes.)
static void knobs_moved(void)
{
    __asm__ volatile("" ::: "memory");
    *(volatile int *)&blk.lockw = ~0;
}

static void load_sends(void);      // MKI: the return's DEL and REV (below)

// The kit keeps its effect's id and A-H, each XOR the effect's default, so zero is the list's first effect at
// its defaults: a = id << 21 | A << 14 | B << 7 | C, b = D << 21 | E << 14 | F << 7 | G, c = H.
static void load_kit(void)
{
    unsigned w[3], id;
    int t, k, v, moved;
    w[0] = core_store_get(STORE(mw_send_a), live_kit(), 0);
    w[1] = core_store_get(STORE(mw_send_b), live_kit(), 0);
    w[2] = core_store_get(STORE(mw_send_c), live_kit(), 0);
    id = w[0] >> 21 & 63;
    t = id ? index_of(id) : n_fx > 0 ? 0 : MISSING;
    if (!id && t != MISSING) id = list[t]->id;
    moved = t != fx_type || id != fx_id;
    fx_type = (unsigned char)t;
    fx_id = id;
    for (k = 0; k < 8; k++) {
        unsigned word = w[k < 3 ? 0 : k < 7 ? 1 : 2];
        v = (int)(word >> (k < 3 ? 14 - 7 * k : k < 7 ? 21 - 7 * (k - 3) : 0) & 127);
        if (t != MISSING) {
            v ^= list[t]->c[k].def;
            if (v > top_of(list[t], k)) v = top_of(list[t], k);
        }
        if (v != knob[k]) { knob[k] = (unsigned char)v; moved = 1; }
    }
    if (moved) {                                 // another kit (or effect): SRC + NO has nothing of its to bring back
        knobs_moved();
        undo_type = -1;
    }
    lev = (unsigned char)((core_store_get(STORE(mw_send_lev), 0, 0) & 127) ^ LEV_DEFAULT);
    load_sends();
}

// A missing effect's values stay as the kit has them.
static void save_kit(void)
{
    unsigned w[3] = { fx_id << 21, 0, 0 };
    int k;
    if (fx_type == MISSING)
        return;
    for (k = 0; k < 8; k++) {
        unsigned v = (unsigned)(knob[k] ^ list[fx_type]->c[k].def) & 127;
        if (k < 3) w[0] |= v << (14 - 7 * k);
        else if (k < 7) w[1] |= v << (21 - 7 * (k - 3));
        else w[2] |= v;
    }
    core_store_set(STORE(mw_send_a), live_kit(), 0, w[0]);
    core_store_set(STORE(mw_send_b), live_kit(), 0, w[1]);
    core_store_set(STORE(mw_send_c), live_kit(), 0, w[2]);
}

// A new effect starts from its own defaults.
static void set_type(int t)
{
    int k;
    fx_type = (unsigned char)t;
    fx_id = list[t]->id;
    for (k = 0; k < 8; k++) knob[k] = list[t]->c[k].def;
    knobs_moved();
    save_kit();
}

// ---------------------------------------------------------------- locks
// A-H's locks are set as stock sets its own (TrackPattern setLock on the FX
// track), so stock saves, copies, clears and plays them. UI task only.

static void *fx_track_pattern(void)
{
    return (void *)TRACK_PATTERN((void *)PATTERN_OF((void *)PROJECT_SINGLETON()), FX_TRACK);
}

static volatile unsigned short *lock_word(void *tp, int step, int w)
{
    void *locks = *(void **)((char *)tp + TP_LOCKS);
    char *table = (char *)(*(*(word_t (***)(void *))locks)[VT_LOCK_TABLE / 4])(locks);
    return (volatile unsigned short *)(table + LOCK_TRACK_BYTES * FX_TRACK + LOCK_STEP_BYTES * step + 2 * w);
}

static unsigned lock_mask(void *tp, int step)
{
    unsigned m = *lock_word(tp, step, LOCK_WORD_MASK);
    return (m & 0xc000) == LOCK_MARK ? m >> 1 & 0xff : 0;
}

// control k's lock on a step, or -1
static int lock_get(void *tp, int step, int k)
{
    unsigned w;
    if (!(lock_mask(tp, step) >> k & 1))
        return -1;
    w = *lock_word(tp, step, LOCK_WORD_FIRST + k / 2);
    return k & 1 ? (int)(w & 127) : (int)(w >> 8 & 127);
}

// sets control k's lock on a step to v, or clears it (v < 0): its pair's word,
// then word 0's mask
static void lock_set(void *tp, int step, int k, int v)
{
    unsigned mask = lock_mask(tp, step), w = *lock_word(tp, step, LOCK_WORD_FIRST + k / 2);
    unsigned hi = w == NO_LOCK ? 0 : w >> 8 & 127, lo = w == NO_LOCK ? 0 : w & 127;
    if (v >= 0) mask |= 1u << k; else mask &= ~(1u << k);
    if (k & 1) lo = v >= 0 ? (unsigned)v : 0; else hi = v >= 0 ? (unsigned)v : 0;
    SET_LOCK(tp, step, LOCK_WORD_FIRST + k / 2, mask >> (k & ~1) & 3 ? (int)(hi << 8 | lo) : NO_LOCK, 0);
    SET_LOCK(tp, step, LOCK_WORD_MASK, mask ? (int)(LOCK_MARK | mask << 1) : NO_LOCK, 1);
}

// the steps held in grid recording, 0-31 and 32-63 (stock fills them only then)
static void held_steps(unsigned *lo, unsigned *hi)
{
    char *rec = (char *)REC_STATE();             // a word: see singleton_t
    *lo = *(volatile unsigned *)(rec + REC_HELD_LO);
    *hi = *(volatile unsigned *)(rec + REC_HELD_HI);
}

static int first_held(void)
{
    unsigned lo, hi;
    int s;
    held_steps(&lo, &hi);
    for (s = 0; s < 64; s++)
        if ((s < 32 ? lo >> s : hi >> (s - 32)) & 1)
            return s;
    return -1;
}

// A turn of control k by steps on the FX page: with steps held in grid
// recording, their locks (from the lock, or the knob); in live recording, the
// knob, and a lock on the FX track's step playing, with a lock trig where
// there is none, as stock's recording does. 0: the caller turns the knob.
static int lock_turn(int k, int steps)
{
    void *tp = fx_track_pattern();
    unsigned lo, hi;
    int s, v, any = 0, top = top_of(cur(), k);
    if (!tp)
        return 0;
    held_steps(&lo, &hi);
    for (s = 0; s < 64; s++) {
        if (!((s < 32 ? lo >> s : hi >> (s - 32)) & 1))
            continue;
        v = lock_get(tp, s, k);
        v = (v < 0 ? knob[k] : v) + steps;
        lock_set(tp, s, k, v < 0 ? 0 : v > top ? top : v);
        any = 1;
    }
    if (any || !IS_LIVE_REC((void *)REC_STATE()))
        return any;
    s = PLAYING_STEP((void *)SEQ_STATE(), FX_TRACK);
    if (s < 0 || s > 63)
        return 0;
    if (!HAS_TRIG(tp, s) && !HAS_TRIG2(tp, s))
        ADD_LOCK_TRIG(tp, s, 1);
    v = knob[k] + steps;                         // the knob's new value, which the caller sets too
    lock_set(tp, s, k, v < 0 ? 0 : v > top ? top : v);
    return 0;
}

// An encoder pressed with steps held: their locks of that control cleared.
static int lock_clear(int k)
{
    void *tp = fx_track_pattern();
    unsigned lo, hi;
    int s, any = 0;
    if (!tp)
        return 0;
    held_steps(&lo, &hi);
    for (s = 0; s < 64; s++)
        if ((s < 32 ? lo >> s : hi >> (s - 32)) & 1) {
            if (lock_get(tp, s, k) >= 0)
                lock_set(tp, s, k, -1);
            any = 1;
        }
    return any;
}

// What the FX page shows for A-H: the first held step's locks, else the
// knobs; locked, the controls a held step locks.
static unsigned char disp[8];
static unsigned disp_locked;

static void view_values(void)
{
    void *tp;
    int k, s = page == PAGE_SHOWN_FX ? first_held() : -1;
    disp_locked = 0;
    for (k = 0; k < 8; k++) disp[k] = knob[k];
    if (s < 0 || !(tp = fx_track_pattern()))
        return;
    for (k = 0; k < 8; k++) {
        int v = lock_get(tp, s, k);
        if (v >= 0) {
            disp[k] = (unsigned char)(v > top_of(cur(), k) ? top_of(cur(), k) : v);
            disp_locked |= 1u << k;
        }
    }
}

// ---------------------------------------------------------------- UI

static int selected_track(void)
{
    char *project = (char *)PROJECT_SINGLETON();
    return TRACK_INDEX_OF(project + PROJECT_TRACKSEL);
}

// What the open page shows, folded into one word: a redraw is asked for when
// it changes. (A full page is some 500 drawing calls; drawn at every tick it
// kept the unit's UI busy, and the knobs seemed to lag on the screen.)
static unsigned last_shown = ~0u;

static int sending(void);
static int page_up(int p);

static unsigned shown_state(void)
{
    unsigned h = (unsigned)page * 31u + fx_type * 131u + lev * 7u + (unsigned)(shown_knob + 1) * 977u + (title_ticks != 0) * 5u + (random_ticks != 0) * 11u;
    int k, sel = selected_track();
    view_values();
    for (k = 0; k < 8; k++) h = h * 33u + disp[k];
    h = h * 33u + disp_locked;
    h = h * 33u + (unsigned)sending();
    if (IS_KEY_HELD(KEY_FUNC)) h = h * 33u + 1000u + (unsigned)cpu_shown;
    if (sel >= 0 && sel < SOUND_TRACKS) h = h * 33u + send[sel] + (unsigned)sel * 128u;
    return h;
}

// ev_tick, about 20 Hz: copy each sound's send and the kit's values for the
// audio block, close a page whose track went away, and redraw an open page.
void mw_send_tick(char *ctrl)
{
    int track;
    if (!ready)
        return;
    g_ctrl = ctrl;
    for (track = 0; track < SOUND_TRACKS; track++) {
        void *live = live_sound(accessor(track));
        send[track] = (unsigned char)(live ? core_store_get(STORE(mw_send_send), live, 0) & 127 : 0);
    }
    load_kit();
    if (show_ticks && !--show_ticks) shown_knob = -1;
    if (title_ticks) title_ticks--;
    if (random_ticks) random_ticks--;
    if (page) {
        int sel = selected_track();
        if ((page != PAGE_SHOWN_SEND) != (sel == FX_TRACK) || sel < 0 || sel > FX_TRACK)
            page = 0;
        else if (!page_up(page)) {               // its view stepped on: stock's page, drawn clean
            page = 0;
            ctrl[0x20] = 1;
        }
        if (page && shown_state() != last_shown)  // redraw only on a change, as stock's pages do
            ctrl[0x20] = 1;
        if (page == PAGE_SHOWN_SETUP && cpu_shown / 10 != cpu_drawn)   // the CPU knob follows the meter
            ctrl[0x20] = 1;
    }
}

// SRC + YES on the FX page: A-H at random, a feedback (FDBK) kept below its
// runaway (100 of 127); SRC + NO: the values before it, once. The kit keeps
// them as if turned; locks stay.
static void random_knobs(int roll)
{
    int k;
    if (fx_type == MISSING)
        return;
    for (k = 0; k < 8; k++) {
        if (roll) {
            unsigned v = (unsigned)top_of(list[fx_type], k) + 1;
            undo_knob[k] = knob[k];
            urnd = urnd * 1664525u + DTCN0;
            v = (urnd >> 16) * v >> 16;
            if (list[fx_type]->c[k].icon == MW_IC_FDBK) v = v * 101 >> 7;
            if (list[fx_type]->c[k].icon != MW_IC_EMPTY) knob[k] = (unsigned char)v;
        } else if (undo_type == fx_type) {
            knob[k] = undo_knob[k];
        }
    }
    undo_type = roll ? fx_type : -1;
    random_ticks = roll ? SHOW_TICKS : 0;
    knobs_moved();
    save_kit();
    if (g_ctrl)
        g_ctrl[0x20] = 1;
}

// ev_key: the page keys step through core-ar2's lists, so a page key, a menu
// key or any other key but FUNC, TRK, the trigs, the pads and the transport
// leaves the mod's page as far as this mod knows; the next frame that draws
// one of its pages tells it again (mw_send_draw).
int mw_send_key(void *brain, char *ev)
{
    int key = *(int *)(ev + 12), flags = *(int *)(ev + 16);
    (void)brain;
    if (!ready || !(flags & KEY_PRESSED))
        return 0;
    // TRK lets go of the page as any other key does: a double press opens stock's list, which stock draws without
    // asking the page again, so a page kept would be drawn over it. TRK + a pad still changes track.
    if (key == KEY_FUNC || key <= KEY_TRIG_LAST
        || (key >= KEY_PAD_FIRST && key <= KEY_PAD_LAST) || (key >= KEY_RECORD && key <= KEY_STOP))
        return 0;
    if (page == PAGE_SHOWN_FX && (key == KEY_YES || key == KEY_NO) && IS_KEY_HELD(KEY_SRC)) {
        random_knobs(key == KEY_YES);
        return 1;
    }
    if (page && key >= KEY_PUSH_FIRST && key <= KEY_PUSH_LAST) {
        // with steps held: their locks of that control cleared; otherwise stock's (push + turn is its coarse turn)
        return page == PAGE_SHOWN_FX && lock_clear(key - KEY_PUSH_FIRST);
    }
    page = 0;
    drawn = 0;                                   // what stock asked before the key is the page left
    return 0;
}

// ev_enc: while a page is up, A-H set its controls; on the FX page FUNC + A
// chooses the effect and FUNC + E sets LEV.
int mw_send_enc(void *brain, char *ev)
{
    // MKI: stock turns the pages' knobs (its speed, push + turn coarse, FUNC) and core hands the turn to
    // mw_send_delta; nothing is taken here.
    (void)brain;
    (void)ev;
    return 0;
}

// ev_project: a loaded or new project starts clean. Until the first one the
// kit is not built, so nothing runs.
static void setup_records(void);

void mw_send_project(int how, unsigned dropped)
{
    (void)how;
    (void)dropped;
    page = 0;
    if (n_fx < 0) build_list();
    setup_records();
    idle = IDLE_BLOCKS;                          // cleared at once, then silent until a send
    ready = 1;
}

// ---------------------------------------------------------------- pages
// MKI: the FX and SEND pages are stock parameter pages. core-ar2 lists them behind the page keys (DELAY on the FX
// track steps DELAY, then the FX page; AMP on a sound track steps AMP, then SEND), stock draws them (title, dials,
// labels, value popups), and stock turns their knobs: its own speed, push + turn coarse and FUNC, as on every stock
// page. Core then hands the turn here (core_params' delta, in 8.8), and the get, delta and text below answer for
// the nine ids. The ids are records of the hidden TEST machines, which no machine uses; base.json points their sound
// index nowhere (-1) and their names at the buffers below, which follow the effect. They are records stock turns
// and draws as a plain 0..127 dial (fine step 0x100, coarse 0x800 a count, the plain dial and number), as stock's
// own sound parameters: HH TEST's and CY TEST's.
struct core_page { int page; const char *name; int ids[8]; };
struct core_page_fn { int page; const struct core_page *(*info)(int page); };
struct core_view_page { int view; int page; int (*shown)(void *view); };
struct core_text { void *obj; int id; int value; char *buf; };
struct core_param {
    int first, last;
    int (*get)(int id, int *value);
    int (*delta)(void *view, int id, int delta, int func);
    int (*text)(struct core_text *t);
};

#define PAGE_FX 17
#define PAGE_SEND 18
#define PAGE_SETUP 19              // MKI: TYPE (A) and LEV (E), after the FX page
#define VIEW_AMP 3                 // core-ar2's CORE_VIEW_AMP, a sound track's
#define VIEW_DELAY 5               // CORE_VIEW_DELAY, the FX track's
#define ID_SEND 445                // knob A of the SEND page
#define ID_TYPE 455                // knob A of the setup page: the effect
#define ID_LEV 456                 // knob E of the setup page: the return's level
#define ID_DEL 458                 // MKI: knob E of the setup page: the return's send to stock's delay
#define ID_REV 459                 // knob F: and to its reverb
#define ID_CPU 460                 // MKI: knob G of the setup page: the send bus's share of the audio block, read only
#define ID_FIRST 445               // the ids core hands this mod: 445..460
#define ID_LAST 460
#define VIEW_PAGES 124             // a view: its page list (core's copy)
#define VIEW_SEL 140               // and the selected index in it
#define CORE_TEXT_DONE 1
#define CORE_TEXT_STOCK 2

// The records' names: base.json points A-H's records at these, short name and long name.
char mw_send_lbl[8][6];
char mw_send_title[12];
const char mw_send_snd_short[] = "SND";
const char mw_send_snd_long[] = "Send";
const char mw_send_type_short[] = "TYPE";
const char mw_send_type_long[] = "Effect";
const char mw_send_lev_short[] = "LEV";
const char mw_send_lev_long[] = "Level";
const char mw_send_group[] = "SEND FX";
const char mw_send_del_short[] = "DEL";
const char mw_send_del_long[] = "Delay Send";
const char mw_send_rev_short[] = "REV";
const char mw_send_rev_long[] = "Reverb Send";
const char mw_send_cpu_short[] = "CPU";
const char mw_send_cpu_long[] = "CPU load %";

static const int ctl_id[8] = { 446, 447, 448, 449, 451, 452, 453, 454 };   // A-H (450 is CY TEST's selector)
static int ctl_of(int id) { int k; for (k = 0; k < 8; k++) if (ctl_id[k] == id) return k; return -1; }

// The FX page as the effect has it: its name over the page, a control's label on its knob, no knob for an
// empty control. Asked again by every reader of the page (core_page_fns), so it follows the effect at once.
static struct core_page fx_page = { PAGE_FX, mw_send_title, { 0 } };

// Stock's parameter records in RAM (88 bytes an id): the turn's fine and coarse steps, its acceleration, the knob's
// drawing (dial, fader, bipolar dial), the value's printer and FUNC's jump. Each of this mod's records becomes a copy
// of the stock parameter it stands for, so its knob turns, accelerates and draws as that one does.
#define RECORD(id) ((volatile unsigned *)(PARAM_RECORDS_AT + (id) * 88))
#define REC_OVR 59                 // a plain 0..127 dial
#define REC_SEND 60                // AMP's DEL: a send's fader
#define REC_VOL 79                 // DELAY's VOL: a level's fader
#define REC_TIM 72                 // DELAY's TIM: note divisions
#define REC_WID 74                 // DELAY's WID: a bipolar dial
#define REC_FDB 75
#define REC_HPF 76
#define REC_LPF 77

static void copy_record(int to, int from)
{
#ifdef MW_NO_RECORD_COPY                   // a diagnostic build: the records stay as stock has them
    (void)to; (void)from;
    return;
#endif
    volatile unsigned *d = RECORD(to), *f = RECORD(from);
    int i;
    for (i = 0; i < 22; i++) d[i] = f[i];
}

static int template_of(const struct mw_fx_control *c)
{
    switch (c->icon) {
    case MW_IC_SYNC: return REC_TIM;
    case MW_IC_FDBK: return REC_FDB;
    case MW_IC_HPF: return REC_HPF;
    case MW_IC_LPF: return REC_LPF;
    default: return c->flags & MW_FX_BIPOLAR ? REC_WID : REC_OVR;
    }
}

static const struct mw_fx *records_for;   // the effect the controls' records were copied for

static void page_follows(void)
{
    const struct mw_fx *fx = cur();
    int k, i;
    for (i = 0; i < 11 && fx->name[i]; i++) mw_send_title[i] = fx->name[i];
    mw_send_title[i] = 0;
    for (k = 0; k < 8; k++) {
        const struct mw_fx_control *c = &fx->c[k];
        int empty = c->icon == MW_IC_EMPTY;      // MW_IC_SKIP is a knob of its own here (the phaser's FDBK)
        for (i = 0; i < 5 && c->label[i]; i++) mw_send_lbl[k][i] = c->label[i];
        mw_send_lbl[k][i] = 0;
        fx_page.ids[k] = empty ? 0 : ctl_id[k];
    }
    if (fx != records_for) {                     // the records once an effect, not at every reader of the page
        records_for = fx;
        for (k = 0; k < 8; k++)
            if (fx->c[k].icon != MW_IC_EMPTY) copy_record(ctl_id[k], template_of(&fx->c[k]));
    }
}

// The setup page's and SEND's records, once the OS has built its own (a project is up).
static void setup_records(void)
{
    copy_record(ID_SEND, REC_SEND);
    copy_record(ID_DEL, REC_SEND);
    copy_record(ID_REV, REC_SEND);
    copy_record(ID_LEV, REC_VOL);
    copy_record(ID_TYPE, REC_OVR);
    copy_record(ID_CPU, REC_OVR);
}

static const struct core_page *fx_info(int p) { (void)p; page_follows(); return &fx_page; }

// Core asks a page's shown each time the page key steps onto it, with the
// view: kept, it tells which page that view has selected. A frame can ask
// this mod's ids just before the key steps off its page (mw_send_key), so a
// page whose view has stepped on is not up, whatever stock last asked. With
// no send effect installed the key steps over both pages, as on stock.
static char *page_view[4];         // by PAGE_SHOWN_*

static int shown_fx(void *view) { page_view[PAGE_SHOWN_FX] = view; return n_fx > 0; }
static int shown_send(void *view) { page_view[PAGE_SHOWN_SEND] = view; return n_fx > 0; }
static int shown_setup(void *view) { page_view[PAGE_SHOWN_SETUP] = view; return n_fx > 0; }

static int page_up(int p)
{
    char *v = page_view[p];
    return !v || (*(int **)(v + VIEW_PAGES))[*(int *)(v + VIEW_SEL)]
        == (p == PAGE_SHOWN_FX ? PAGE_FX : p == PAGE_SHOWN_SETUP ? PAGE_SETUP : PAGE_SEND);
}

const struct core_page_fn mw_send_page_fx = { PAGE_FX, fx_info };
const struct core_page mw_send_page_send = { PAGE_SEND, "SEND", { ID_SEND } };
const struct core_view_page mw_send_view_fx = { VIEW_DELAY, PAGE_FX, shown_fx };
const struct core_view_page mw_send_view_send = { VIEW_AMP, PAGE_SEND, shown_send };
const struct core_page mw_send_page_setup = { PAGE_SETUP, "SEND FX", { ID_TYPE, 0, 0, 0, ID_DEL, ID_REV, ID_CPU, ID_LEV } };
const struct core_view_page mw_send_view_setup = { VIEW_DELAY, PAGE_SETUP, shown_setup };

// The return's sends to stock's delay and reverb (MKI): 0..127 each, kept with the project as LEV (mw_send_d).
static unsigned char fx_del, fx_rev;

static void load_sends(void)
{
    unsigned w = core_store_get(STORE(mw_send_d), 0, 0);
    fx_del = (unsigned char)(w >> 7 & 127);
    fx_rev = (unsigned char)(w & 127);
}

static void save_sends(void) { core_store_set(STORE(mw_send_d), 0, 0, (unsigned)fx_del << 7 | fx_rev); }

// TYPE on the dial: the effects spread over 0..127, as a stock list value's dial.
static int type_dial(void) { return n_fx > 1 && fx_type != MISSING ? (fx_type * 127 + (n_fx - 1) / 2) / (n_fx - 1) : 0; }

// A control's value on the knob, 0..127 whatever its range, so the dial and a turn cover it as stock's do.
static int dial_of(int k) { int top = top_of(cur(), k); return top == 127 ? knob[k] : (knob[k] * 127 + top / 2) / top; }

static int mw_send_get(int id, int *value)
{
    int sel, k = ctl_of(id);
    if (id == ID_CPU) {
        int c = cpu_shown / 10;
        drawn |= 1 << PAGE_SHOWN_SETUP;
        cpu_drawn = c;
        *value = (c > 127 ? 127 : c) << 8;
        return 1;
    }
    if (id == ID_TYPE || id == ID_LEV || id == ID_DEL || id == ID_REV) {
        drawn |= 1 << PAGE_SHOWN_SETUP;
        *value = (id == ID_TYPE ? type_dial() : id == ID_LEV ? lev : id == ID_DEL ? fx_del : fx_rev) << 8;
        return 1;
    }
    if (k < 0 && id != ID_SEND)
        return 0;
    if (k >= 0) {
        drawn |= 1 << PAGE_SHOWN_FX;
        *value = dial_of(k) << 8;
        return 1;
    }
    drawn |= 1 << PAGE_SHOWN_SEND;
    sel = selected_track();
    *value = (sel >= 0 && sel < SOUND_TRACKS ? send[sel] : 0) << 8;
    return 1;
}

// A turn, as stock worked it out (8.8 of the 0..127 range, coarse while the encoder is pushed): kept to the
// fraction, so slow turns add up as on a stock knob. With FUNC, knob A chooses the effect and knob E sets LEV.
static int frac[12];               // A-H, LEV, SEND, DEL and REV: the turn's remainder, 8.8
static int type_acc;

static int step_by(int *f, int delta)
{
    int v = *f + delta, steps = v / 256;
    *f = v - steps * 256;
    return steps;
}

static int mw_send_delta(void *view, int id, int delta, int func)
{
    int k = ctl_of(id), steps;
    (void)view;
    if (!ready)
        return 1;
    (void)func;                                  // FUNC keeps stock's meaning: its turn arrives as any other
    if (id == ID_CPU)
        return 1;                                // read only
    if (id == ID_TYPE) {                         // one effect a step, as stock steps a list value (FILTER TYP)
        int t;
        if (!(steps = step_by(&type_acc, delta)) || n_fx <= 0)
            return 1;
        t = fx_type == MISSING ? (steps > 0 ? 0 : n_fx - 1) : fx_type + steps;
        t = t < 0 ? 0 : t >= n_fx ? n_fx - 1 : t;
        if (t != fx_type) { set_type(t); page_follows(); }
        return 1;
    }
    if (id == ID_LEV) {
        int v;
        if (!(steps = step_by(&frac[8], delta)))
            return 1;
        v = lev + steps;
        lev = (unsigned char)(v < 0 ? 0 : v > 127 ? 127 : v);
        core_store_set(STORE(mw_send_lev), 0, 0, (unsigned)(lev ^ LEV_DEFAULT));
        return 1;
    }
    if (id == ID_DEL || id == ID_REV) {
        unsigned char *a = id == ID_DEL ? &fx_del : &fx_rev;
        int v;
        if (!(steps = step_by(&frac[id == ID_DEL ? 10 : 11], delta)))
            return 1;
        v = *a + steps;
        *a = (unsigned char)(v < 0 ? 0 : v > 127 ? 127 : v);
        save_sends();
        return 1;
    }
    if (id == ID_SEND) {
        int sel = selected_track(), v;
        void *acc, *live;
        if (sel < 0 || sel >= SOUND_TRACKS || !(steps = step_by(&frac[9], delta)))
            return 1;
        acc = accessor(sel);
        live = live_sound(acc);
        if (!live)
            return 1;
        v = send[sel] + steps;
        send[sel] = (unsigned char)(v < 0 ? 0 : v > 127 ? 127 : v);
        core_store_set(STORE(mw_send_send), live, 0, send[sel]);
        notify(acc);
        return 1;
    }
    if (k < 0)
        return 0;
    {
        int top = top_of(cur(), k), d = dial_of(k), v, want;
        if (!(steps = step_by(&frac[k], delta)))
            return 1;
        d += steps;
        d = d < 0 ? 0 : d > 127 ? 127 : d;
        want = top == 127 ? d : (d * top + 63) / 127;
        if (want == knob[k] && top != 127)       // a short range moves a value once the dial has got there
            return 1;
        if (lock_turn(k, want - knob[k]))
            return 1;
        knob[k] = (unsigned char)want;
        knobs_moved();
        save_kit();
    }
    return 1;
}

// A value's text, for the knob and stock's popup: the effect's word (OFF, a division), a bipolar value from -64,
// the bits left; anything else as stock prints it.
static int mw_send_text(struct core_text *t)
{
    int k = ctl_of(t->id), v;
    const char *w;
    if (t->id == ID_TYPE) {                      // the effect's name, as much as the knob's text holds
        const char *n = cur()->name;
        int i;
        drawn |= 1 << PAGE_SHOWN_SETUP;
        for (i = 0; i < 4 && n[i]; i++) t->buf[i] = n[i];
        t->buf[i] = 0;
        return CORE_TEXT_DONE;
    }
    if (t->id == ID_CPU) {
        drawn |= 1 << PAGE_SHOWN_SETUP;
        t->value = (cpu_shown / 10) << 8;
        return CORE_TEXT_STOCK;
    }
    if (t->id == ID_LEV || t->id == ID_DEL || t->id == ID_REV) {
        drawn |= 1 << PAGE_SHOWN_SETUP;
        t->value = (t->id == ID_LEV ? lev : t->id == ID_DEL ? fx_del : fx_rev) << 8;
        return CORE_TEXT_STOCK;
    }
    if (k < 0 && t->id != ID_SEND)
        return 0;
    drawn |= 1 << (k >= 0 ? PAGE_SHOWN_FX : PAGE_SHOWN_SEND);
    if (k < 0)
        return CORE_TEXT_STOCK;
    v = knob[k];
    w = cur()->text ? cur()->text(k, v) : 0;
    if (w) {
        int i;
        for (i = 0; i < 5 && w[i]; i++) t->buf[i] = w[i];
        t->buf[i] = 0;
        return CORE_TEXT_DONE;
    }
    if (cur()->c[k].icon == MW_IC_BITS) v = 16 - v * 15 / 127;
    else if (bipolar(cur(), k)) v -= 64;
    {
        char d[4];
        int i = 0, n = 0;
        if (v < 0) { t->buf[n++] = '-'; v = -v; }
        do { d[i++] = (char)('0' + v % 10); v /= 10; } while (v && i < 3);
        while (i) t->buf[n++] = d[--i];
        t->buf[n] = 0;
    }
    return CORE_TEXT_DONE;
}

const struct core_param mw_send_params = { ID_FIRST, ID_LAST, mw_send_get, mw_send_delta, mw_send_text };

// ---------------------------------------------------------------- drawing
// In screen rows here: y counts down from the top (0) to the bottom (63).

static void *g_bmp;

// The bitmap as stock's fillrect (FILLRECT_AT, read for OS 1.74) addresses
// it: +4 width, +8 height, +12 words a column, +16 the words. Each column is
// a run of 32-bit words, the bitmap's row r at bit 31 - (r & 31) of word
// r >> 5. A point is set here directly: through fillrect a page took some
// 500 calls a frame and the screen lagged behind the knobs on the unit.
static unsigned *g_words;
static int g_w, g_h, g_stride;

static void bitmap_open(void *bmp)
{
    char *b = (char *)bmp;
    g_bmp = bmp;
    g_w = *(int *)(b + 4);
    g_h = *(int *)(b + 8);
    g_stride = *(int *)(b + 12);
    g_words = *(unsigned **)(b + 16);
}

static void px(int x, int y, int c)
{
    int r = 63 - y;
    unsigned *w, bit;
    if (x < 0 || x >= g_w || r < 0 || r >= g_h || x >= 128 || y < 0)
        return;
    w = g_words + x * g_stride + (r >> 5);
    bit = 0x80000000u >> (r & 31);
    if (c) *w |= bit;
    else *w &= ~bit;
}

static void rect(int x0, int y0, int x1, int y1, int c) { FILLRECT(g_bmp, x0, 63 - y1, x1, 63 - y0, c); }

// A box with its corners left out, as Elektron's widgets have them.
static void box(int x0, int y0, int x1, int y1)
{
    rect(x0 + 1, y0, x1 - 1, y0, 1); rect(x0 + 1, y1, x1 - 1, y1, 1);
    rect(x0, y0 + 1, x0, y1 - 1, 1); rect(x1, y0 + 1, x1, y1 - 1, 1);
}

static void line_to(int x0, int y0, int x1, int y1)
{
    int dx = x1 > x0 ? x1 - x0 : x0 - x1, dy = y1 > y0 ? y1 - y0 : y0 - y1;
    int sx = x1 > x0 ? 1 : -1, sy = y1 > y0 ? 1 : -1, err = dx - dy, i;
    for (i = 0; i < 160; i++) {                  // bounded: a draw handler must return
        int e2 = 2 * err;
        px(x0, y0, 1);
        if (x0 == x1 && y0 == y1) break;
        if (e2 > -dy) { err -= dy; x0 += sx; }
        if (e2 < dx) { err += dx; y0 += sy; }
    }
}

// 5 x 7 capitals and digits for the title bar, the effect number and SND.
static const unsigned char big_font[26][7] = {
    {14,17,17,31,17,17,17},{30,17,17,30,17,17,30},{14,17,16,16,16,17,14},{30,17,17,17,17,17,30},{31,16,16,30,16,16,31},
    {31,16,16,30,16,16,16},{14,17,16,23,17,17,15},{17,17,17,31,17,17,17},{14,4,4,4,4,4,14},{7,2,2,2,2,18,12},
    {17,18,20,24,20,18,17},{16,16,16,16,16,16,31},{17,27,21,21,17,17,17},{17,25,21,19,17,17,17},{14,17,17,17,17,17,14},
    {30,17,17,30,16,16,16},{14,17,17,17,21,18,13},{30,17,17,30,20,18,17},{15,16,16,14,1,1,30},{31,4,4,4,4,4,4},
    {17,17,17,17,17,17,14},{17,17,17,17,17,10,4},{17,17,17,21,21,21,10},{17,17,10,4,10,17,17},{17,17,10,4,4,4,4},
    {31,1,2,4,8,16,31},
};
static const unsigned char big_digits[10][7] = {
    {14,17,19,21,25,17,14},{4,12,4,4,4,4,14},{14,17,1,2,4,8,31},{30,1,1,14,1,1,30},{2,6,10,18,31,2,2},
    {31,16,30,1,1,17,14},{6,8,16,30,17,17,14},{31,1,2,4,8,8,8},{14,17,17,14,17,17,14},{14,17,17,15,1,2,12},
};

static void big_text(const char *t, int x, int y, int c)
{
    for (; *t; t++, x += 6) {
        const unsigned char *g = *t >= 'A' && *t <= 'Z' ? big_font[*t - 'A'] : *t >= '0' && *t <= '9' ? big_digits[*t - '0'] : 0;
        int r, k;
        if (!g) continue;
        for (r = 0; r < 7; r++)
            for (k = 0; k < 5; k++)
                if (g[r] & (16 >> k)) px(x + k, y + r, c);
    }
}

// v with digits figures (leading zeros), or as few as it needs (digits 0).
static void big_number(int v, int digits, int x, int y)
{
    char t[4];
    int n = digits ? digits : v >= 100 ? 3 : v >= 10 ? 2 : 1;
    t[n] = 0;
    while (n--) { t[n] = (char)('0' + v % 10); v /= 10; }
    big_text(t, x, y, 1);
}

static void *font(void) { return (void *)TEXT_FONT(TEXT_CTX); }

// A label in stock's font, centred on cx, its bottom row at screen row y.
static void label(int cx, int y, const char *t) { TEXT_DRAW(g_bmp, font(), cx, 63 - y, 1, 0, t[0] && t[1] && t[2] && t[3] && t[4] ? "XXXXX" : "XXXX", "%s", t); }
static void label_value(int cx, int y, int v) { TEXT_DRAW(g_bmp, font(), cx, 63 - y, 1, 0, "XXXX", "%d", v); }

static void dial(int cx, int cy, int v)
{
    unsigned i;
    for (i = 0; i < sizeof ring_dx; i++) px(cx + ring_dx[i], cy + ring_dy[i], 1);
    line_to(cx, cy, cx + ptr_dx[v & 127], cy + ptr_dy[v & 127]);
}

static void circle5(int cx, int cy)
{
    unsigned i;
    for (i = 0; i < sizeof c5_dx; i++) px(cx + c5_dx[i], cy + c5_dy[i], 1);
}

// kind MW_IC_LPF, MW_IC_HPF or MW_IC_BAND (a peak, res 0..127 tall).
static void filter_curve(int x0, int y0, int x1, int y1, int kind, int v, int res)
{
    // the corner stays inside the box at both ends, so the slope always shows
    int x, w = x1 - x0 - 12, fx = x0 + 6 + w * v / 127, top = y0 + 4, bot = y1 - 2, last = -1;
    box(x0, y0, x1, y1);
    for (x = x0 + 2; x <= x1 - 2; x++) {
        int d = kind == MW_IC_LPF ? x - fx : kind == MW_IC_HPF ? fx - x : x > fx ? x - fx : fx - x;
        int y = d <= 0 ? top : top + d * 2;
        if (kind == MW_IC_BAND && d < 3) y -= res / 32 - d > 0 ? res / 32 - d : 0;
        if (y > bot) y = bot;
        if (last >= 0 && (y - last > 1 || last - y > 1)) line_to(x - 1, last, x, y);
        else px(x, y, 1);
        last = y;
    }
}

static void tri_wave(int x0, int y, int w, int amp, int cycles, int dotted)
{
    int i, last = 0;
    for (i = 0; i < w; i++) {
        int p = i * cycles * 256 / w % 256, t = p < 64 ? p : p < 192 ? 128 - p : p - 256;   // -64..64
        int yy = y - amp * t / 64;
        if (dotted) { if (!(i & 1)) px(x0 + i, yy, 1); }
        else if (i && (yy - last > 1 || last - yy > 1)) line_to(x0 + i - 1, last, x0 + i, yy);
        else px(x0 + i, yy, 1);
        last = yy;
    }
}

// A sine-like wave (the LFO's shape), cycles across w pixels.
static void sine_wave(int x0, int y, int w, int amp, int cycles)
{
    int i, last = 0;
    unsigned step = 0xffffffffu / (unsigned)w * (unsigned)cycles;
    for (i = 0; i < w; i++) {
        int yy = y - ((amp * lfo(i * step + 0xc0000000u)) >> 15);
        if (i && (yy - last > 1 || last - yy > 1)) line_to(x0 + i - 1, last, x0 + i, yy);
        else px(x0 + i, yy, 1);
        last = yy;
    }
}

static void circle(int cx, int cy, int r)
{
    int x = r, y = 0, err = 1 - r, i;
    for (i = 0; i <= r && y <= x; i++, y++) {    // bounded: an octant
        px(cx + x, cy + y, 1); px(cx - x, cy + y, 1); px(cx + x, cy - y, 1); px(cx - x, cy - y, 1);
        px(cx + y, cy + x, 1); px(cx - y, cy + x, 1); px(cx + y, cy - x, 1); px(cx - y, cy - x, 1);
        if (err < 0) err += 2 * y + 3;
        else { x--; err += 2 * (y - x) + 3; }
    }
}

static const char type8_name[8][5] = { "LP4", "LP2", "BP2", "HP2", "LPN", "NOT1", "NOT2", "OFF" };

static void slider(int cx, int cy, int v)
{
    box(cx - 9, cy - 3, cx + 9, cy + 3);
    rect(cx - 7, cy - 1, cx - 7 + v * 14 / 127, cy + 1, 1);
}

static void widget(int k, int cx, int cy, int v, int next)
{
    static const signed char star_x[6] = { 6, 5, 3, 0, -3, -5 }, star_y[6] = { 0, 3, 5, 6, 5, 3 };
    static const signed char nz_x[10] = { -2, 1, -1, 2, 0, -2, 2, -3, 1, 3 }, nz_y[10] = { 3, 1, -1, 4, 5, -3, -5, 0, -3, 2 };
    int i;
    switch (cur()->c[k].icon) {
    case MW_IC_NOISE:                               // a tall box, more grains the higher
        box(cx - 5, cy - 9, cx + 5, cy + 8);
        for (i = 0; i < 2 + v * 8 / 127; i++) px(cx + nz_x[i], cy + nz_y[i], 1);
        break;
    case MW_IC_SLIDE: slider(cx, cy, v); break;
    case MW_IC_BITS: {                              // stairs: fewer, taller steps the fewer bits
        int n = 2 + v * 5 / 127, x = cx - 9, y = cy + 6, sw = 18 / n, sh = 12 / n;
        for (i = 0; i < n; i++) {
            line_to(x, y, x + sw, y);
            line_to(x + sw, y, x + sw, y - sh);
            x += sw; y -= sh;
        }
        break;
    }
    case MW_IC_DRIVE: {                             // a dotted dial
        unsigned j;
        for (j = 0; j < sizeof ring_dx; j += 3) px(cx + ring_dx[j], cy + ring_dy[j], 1);
        line_to(cx, cy, cx + ptr_dx[v & 127], cy + ptr_dy[v & 127]);
        break;
    }
    case MW_IC_STAR: {
        int r = 5 + v * 2 / 127;
        for (i = 0; i < 6; i++)
            line_to(cx - star_x[i] * r / 6, cy - star_y[i] * r / 6, cx + star_x[i] * r / 6, cy + star_y[i] * r / 6);
        break;
    }
    case MW_IC_DROP:                                // a face, sadder past the middle
        circle(cx, cy, 7);
        px(cx - 3, cy - 2, 1); px(cx + 3, cy - 2, 1);
        for (i = -3; i <= 3; i++) px(cx + i, v < 64 ? cy + 1 + (9 - i * i) / 3 : cy + 4 - (9 - i * i) / 3, 1);
        break;
    case MW_IC_BAND:                                // spans its column and the next
        filter_curve(cx - 11, cy - 9, cx + 37, cy + 8, MW_IC_BAND, v, next);
        break;
    case MW_IC_TYPE:
        filter_curve(cx - 10, cy - 9, cx + 10, cy + 8, v < 43 ? MW_IC_LPF : v < 86 ? MW_IC_BAND : MW_IC_HPF, 64, 0);
        break;
    case MW_IC_TILT:                                // signed: low-pass, flat, high-pass
        if (v == 64) { box(cx - 10, cy - 9, cx + 10, cy + 8); rect(cx - 8, cy - 5, cx + 8, cy - 5, 1); }
        else filter_curve(cx - 10, cy - 9, cx + 10, cy + 8, v < 64 ? MW_IC_LPF : MW_IC_HPF, v < 64 ? v * 2 : (v - 64) * 2, 0);
        break;
    case MW_IC_ENV: {                               // an ADSR, the attack as set
        int xa = cx - 10 + v * 6 / 127, xd = xa + 4, xs = cx + 5;
        line_to(cx - 11, cy + 7, xa, cy - 7); line_to(xa, cy - 7, xd, cy - 1);
        line_to(xd, cy - 1, xs, cy - 1); line_to(xs, cy - 1, cx + 11, cy + 7);
        rect(xa - 1, cy - 8, xa + 1, cy - 6, 1); rect(xd - 1, cy - 2, xd + 1, cy, 1); rect(xs - 1, cy - 2, xs + 1, cy, 1);
        break;
    }
    case MW_IC_RECT: {                              // a sine, its lower half folded up as set
        int last = 0;
        unsigned step = 0xffffffffu / 21;
        for (i = 0; i < 21; i++) {
            int s = lfo(i * step + 0xc0000000u), yy;
            if (s < 0) s += (-2 * s) * v / 127;
            yy = cy + 2 - ((5 * s) >> 15);
            if (i && (yy - last > 1 || last - yy > 1)) line_to(cx - 11 + i, last, cx - 10 + i, yy);
            else px(cx - 10 + i, yy, 1);
            last = yy;
        }
        for (i = cy - 7; i <= cy + 7; i += 2) px(cx + 3, i, 1);
        break;
    }
    case MW_IC_T128: {                              // 128th notes: a note's name where one fits, over a slider
        static const unsigned char n128[14] = { 1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64, 96, 128 };
        static const char name128[14][6] = { "1/128", "1/64", "1/64.", "1/32", "1/32.", "1/16", "1/16.", "1/8", "1/8.", "1/4", "1/4.", "1/2", "1/2.", "1" };
        int j, shown = 0;
        for (j = 0; j < 14; j++)
            if (n128[j] == v + 1) { label(cx, cy - 1, name128[j]); shown = 1; }
        if (!shown) label_value(cx, cy - 1, v + 1);
        rect(cx - 9, cy + 3, cx + 9, cy + 3, 1);
        i = cx - 9 + v * 18 / 127;
        rect(i - 1, cy + 1, i + 1, cy + 5, 1);
        break;
    }
    case MW_IC_SWITCH:                              // OFF / ON
        box(cx - 10, cy - 7, cx + 10, cy + 5);
        if (v) box(cx - 8, cy - 5, cx + 8, cy + 3);
        TEXT_DRAW(g_bmp, font(), cx, 63 - (cy + 2), 1, 0, "OFF", v ? "ON" : "OFF");
        break;
    case MW_IC_VBAR:                                // a band's gain: a tall slider
        box(cx - 4, cy - 9, cx + 4, cy + 8);
        i = v * 15 / 127;
        if (i) rect(cx - 2, cy + 6 - i, cx + 2, cy + 6, 1);
        break;
    case MW_IC_FOLD: {                              // a sine folded back on itself, more the higher
        int last = 0, a = 4 + v / 12;
        unsigned st = 0xffffffffu / 21;
        for (i = 0; i < 21; i++) {
            int y = (a * lfo(i * st + 0xc0000000u)) >> 15, yy;   // -a..a over a height of 6
            while (y > 6 || y < -6) y = y > 0 ? 12 - y : -12 - y;
            yy = cy - y;
            if (i && (yy - last > 1 || last - yy > 1)) line_to(cx - 11 + i, last, cx - 10 + i, yy);
            else px(cx - 10 + i, yy, 1);
            last = yy;
        }
        break;
    }
    case MW_IC_TYPE8:
        box(cx - 11, cy - 8, cx + 11, cy + 8);
        label(cx, cy + 3, type8_name[v >> 4]);
        break;
    case MW_IC_SHIFT: {                             // three lines moved along by the shift
        int o = (v - 64) / 16;
        rect(cx - 10, cy + 6, cx + 10, cy + 6, 1);
        for (i = -8; i <= 2; i += 5) line_to(cx + i + o, cy + 6, cx + i + o, cy - 2);
        line_to(cx + 5, cy - 6, cx + 10, cy - 6);
        if (v >= 64) { line_to(cx + 8, cy - 8, cx + 10, cy - 6); line_to(cx + 8, cy - 4, cx + 10, cy - 6); }
        else { line_to(cx + 7, cy - 8, cx + 5, cy - 6); line_to(cx + 7, cy - 4, cx + 5, cy - 6); }
        break;
    }
    case MW_IC_BLEND:                               // one sideband to the other
        sine_wave(cx - 10, cy, 21, 5, 1);
        tri_wave(cx - 10, cy, 21, 1 + v / 26, 1, 1);
        break;
    case MW_IC_SYNC:                                // the division over a slider
        label(cx, cy - 1, div_name[v < DIVS ? v : DIVS - 1]);
        rect(cx - 9, cy + 3, cx + 9, cy + 3, 1);
        i = cx - 9 + v * 18 / (DIVS - 1);
        rect(i - 1, cy + 1, i + 1, cy + 5, 1);
        break;
    case MW_IC_MOD:
        sine_wave(cx - 10, cy - 3, 21, 1 + v / 43, 3);
        tri_wave(cx - 10, cy + 4, 21, 1 + v / 43, 3, 0);
        break;
    case MW_IC_SKEW: {                              // one line forking in two, the longer side as set
        int s = (v - 64) / 10;
        line_to(cx - 9, cy, cx - 4, cy);
        line_to(cx - 4, cy, cx + 4, cy - 5); line_to(cx + 4, cy - 5, cx + 9 - (s > 0 ? 0 : -s), cy - 5);
        line_to(cx - 4, cy, cx + 4, cy + 5); line_to(cx + 4, cy + 5, cx + 9 - (s < 0 ? 0 : s), cy + 5);
        break;
    }
    case MW_IC_DIAL: dial(cx, cy, v); break;
    case MW_IC_BIP:                                 // a dial with - and + under it
        dial(cx, cy, v);
        rect(cx - 9, cy + 7, cx - 8, cy + 7, 1);
        rect(cx + 7, cy + 7, cx + 9, cy + 7, 1); rect(cx + 8, cy + 6, cx + 8, cy + 8, 1);
        break;
    case MW_IC_DEPTH:
        tri_wave(cx - 10, cy - 1, 21, 1 + v / 32, 1, 0);
        tri_wave(cx - 10, cy + 3, 21, 1, 1, 1);
        break;
    case MW_IC_WIDTH: i = 1 + v * 5 / 127; circle5(cx - i, cy); circle5(cx + i, cy); break;
    case MW_IC_FDBK: {
        unsigned j;
        for (j = 0; j < sizeof fb_dx; j++) px(cx + fb_dx[j], cy + fb_dy[j], 1);
        line_to(cx + 5, cy - 5, cx + 8, cy - 2); line_to(cx + 5, cy - 5, cx + 2, cy - 5);
        break;
    }
    case MW_IC_HPF: case MW_IC_LPF:
        filter_curve(cx - 10, cy - 9, cx + 10, cy + 8, cur()->c[k].icon, v, 0);
        break;
    case MW_IC_STAGES: {
        int n = 1 + v * 3 / 127;                 // one box per stage pair: 2, 4, 6 or 8 stages
        for (i = 0; i < n; i++) box(cx - 11 + i * 4, cy - 6, cx - 9 + i * 4, cy + 6);
        break;
    }
    case MW_IC_TUNE: {
        int x;
        for (x = cx - 9; x <= cx + 9; x++) {
            int y;
            for (y = cy - 8 + (x - cx + 9) / 2; y <= cy + 8; y++)
                if (!((x + y) % 3)) px(x, y, 1);
        }
        x = cx - 9 + v * 18 / 127;
        line_to(x, cy - 9, x, cy + 2); rect(x - 1, cy + 1, x + 1, cy + 3, 1);
        break;
    }
    case MW_IC_COMB:                                // spans its column and the next
        box(cx - 11, cy - 9, cx + 37, cy + 8);
        tri_wave(cx - 9, cy, 45, 2 + (next > 64 ? next - 64 : 64 - next) / 16, 2 + v / 32, 0);
        break;
    case MW_IC_EMPTY:
        for (i = -9; i <= 9; i += 2) { px(cx + i, cy - 8, 1); px(cx + i, cy + 8, 1); }
        for (i = -8; i <= 8; i += 2) { px(cx - 9, cy + i, 1); px(cx + 9, cy + i, 1); }
        break;
    }
}

// A value shown by name, as the effect gives it (OFF, RAND, a ratio), or 0 for the number.
static const char *special(int k)
{
    const struct mw_fx *fx = cur();
    return fx->text ? fx->text(k, disp[k]) : 0;
}

static int sending(void)
{
    int t, n = 0;
    for (t = 0; t < SOUND_TRACKS; t++) n += send[t] != 0;
    return n;
}

static const char *const track_names[SOUND_TRACKS] = { "BD", "SD", "RS", "CP", "BT", "LT", "MT", "HT", "CH", "OH", "CY", "CB" };

// MKI: the FX page as plain text until it is designed for the 122x32 screen: the effect's name, SND (or CPU
// with FUNC) and LEV in the left box, the eight controls' labels and values in two rows on the right, a label
// inverted while the step held locks it.
#define MKI_LINE(i) (25 - 8 * (i))  // text lines, up from the bottom
static int mki_col(int k) { return 60 + 17 * (k & 3); }

static void __attribute__((noinline)) draw_fx(void)
{
    int k, func = IS_KEY_HELD(KEY_FUNC) != 0, n = func ? (cpu_shown + 5) / 10 : sending();
    FILLRECT(g_bmp, 0, 0, 121, 31, 0);
    TEXT_DRAW(g_bmp, font(), 1, MKI_LINE(0), 0, 0, "XXXXXXXXXX", "%s", random_ticks ? "RANDOM" : cur()->name);
    TEXT_DRAW(g_bmp, font(), 1, MKI_LINE(1), 0, 0, "XXX 99", func ? "CPU %d" : "SND %d", n > 99 ? 99 : n);
    TEXT_DRAW(g_bmp, font(), 1, MKI_LINE(2), 0, 0, "LEV 127", "LEV %d", lev);
    for (k = 0; k < 8; k++) {
        const struct mw_fx_control *c = &cur()->c[k];
        int cx = mki_col(k), ly = k < 4 ? MKI_LINE(0) : MKI_LINE(2), v = disp[k];
        if (c->icon == MW_IC_SKIP || c->icon == MW_IC_EMPTY)
            continue;
        TEXT_DRAW(g_bmp, font(), cx, ly, 1, (int)(disp_locked >> k & 1), "XXXX", "%s", c->label);
        if (special(k)) TEXT_DRAW(g_bmp, font(), cx, ly - 8, 1, 0, "XXXX", "%s", special(k));
        else if (c->icon == MW_IC_BITS) TEXT_DRAW(g_bmp, font(), cx, ly - 8, 1, 0, "XXXX", "%d", 16 - v * 15 / 127);
        else TEXT_DRAW(g_bmp, font(), cx, ly - 8, 1, 0, "XXXX", "%d", bipolar(cur(), k) ? v - 64 : v);
    }
}

// MKI: the SEND page: SND and the selected track's send at A, over stock's knob area.
static void __attribute__((noinline)) draw_send(void)
{
    int sel = selected_track();
    FILLRECT(g_bmp, 52, 0, 121, 31, 0);
    if (sel < 0 || sel >= SOUND_TRACKS)
        return;
    TEXT_DRAW(g_bmp, font(), mki_col(0), MKI_LINE(0), 1, 0, "XXXX", "SND");
    TEXT_DRAW(g_bmp, font(), mki_col(0), MKI_LINE(1), 1, 0, "XXXX", "%d", send[sel]);
}

// ev_draw, after stock composed the frame: a page of this mod's whose id
// stock just asked is the one up (a frame that asked none, such as a header
// redraw, leaves it as it was; a key leaves it, mw_send_key), while its view
// still has it selected (page_up).
// Stock's popups and notices (KIT 1 SAVED!, COPY PATTERN, BANK A : CHOOSE
// PTN, the tempo) are windows the view controller draws over the page's
// view, in drawAll (ring head ctrl + 20, under the lock at ctrl + 4): each
// is added after stock's footer bar while it is up. ev_draw comes after
// drawAll, so a page of this mod's covered them: they are drawn again over
// it, but the title window, whose place the page takes.
struct win_node { struct win_node *next, *prev; void *win; };
typedef void (*win_draw_t)(void *win, void *bmp);
typedef void (*lock_guard_t)(void *guard, void *mutex);
typedef void (*unlock_guard_t)(void *guard);
#define LOCK_GUARD ((lock_guard_t)LOCK_GUARD_AT)     // stock's scoped lock: takes the mutex
#define UNLOCK_GUARD ((unlock_guard_t)UNLOCK_GUARD_AT)   // and gives it back
#define VC_MUTEX 4                 // the view controller: its windows' lock
#define VC_WINDOWS 20              // and their ring's head
#define WIN_DRAW 16                // a window's vtable: draw(win, bmp)
#define WIN_COVERED 23             // a window: 1 while a full-screen menu (KIT ...) covers it, and drawAll skips it

static void __attribute__((noinline)) draw_popups(char *ctrl, void *bmp)
{
    struct win_node *head = (struct win_node *)(ctrl + VC_WINDOWS), *n;
    struct { void *mutex; unsigned char held, pad[3]; } guard;   // as drawAll's
    int after = 0;
    LOCK_GUARD(&guard, ctrl + VC_MUTEX);
    for (n = head->next; n != head; n = n->next) {
        win_draw_t draw = *(win_draw_t *)(*(char **)n->win + WIN_DRAW);
        if ((word_t)draw == FOOTER_DRAW_AT) after = 1;
        else if (after && (word_t)draw != TITLE_DRAW_AT) draw(n->win, bmp);
    }
    UNLOCK_GUARD(&guard);
}

void mw_send_draw(void *bmp, void *ctrl)
{
    int d = drawn, was = page;
    drawn = 0;
    if (d & 1 << PAGE_SHOWN_FX) page = PAGE_SHOWN_FX;
    else if (d & 1 << PAGE_SHOWN_SETUP) page = PAGE_SHOWN_SETUP;
    else if (d & 1 << PAGE_SHOWN_SEND) page = PAGE_SHOWN_SEND;
    if (page && !page_up(page))
        page = 0;
    // A full-screen menu over the page's view (the KIT menu, OS UPGRADE): stock's
    // alone, as its own pages are (the page was drawn under it, mixed with it).
    // MKI: its windows have no covered flag (WIN_COVERED), so this check is left out.
    if (!page)
        return;
    if (page != was) {                           // just opened
        acc_enc = -1;
        shown_knob = -1;
        title_ticks = SHOW_TICKS;
    }
    last_shown = shown_state();
    // MKI: stock draws the pages (they are stock parameter pages); nothing is drawn here.
    (void)bmp;
    (void)ctrl;
}

// ---------------------------------------------------------------- the return's sends (MKI)
// Stock's send routine builds the delay's and the reverb's input for the block, then runs them; mw_send_sends_gate
// (sendbus.s) comes in between. Stock builds the inputs from the voices: per voice, its receive word times a gain
// of (send x 256)^2 / 2 (a centred voice, each side), / 2^31. The effect's return is in the units of a receive word / 2^16, so adding amt^2 x the return gives the level
// a voice with the same signal and send gets. The gain moves over the block, as stock's does. Each side to its side.
#define DEL_IN ((volatile int *)DELAY_IN_AT)     // 32 frames of {L, R}, then the reverb's 256 bytes on
static int sent_k[2];

static int sat_add(int a, int b)
{
    int s = (int)((unsigned)a + (unsigned)b);
    if (b > 0 && s < a) return 0x7fffffff;
    if (b < 0 && s > a) return (int)0x80000000;
    return s;
}

void mw_send_sends(void)
{
    int dest, c, f;
    if (!ready || idle >= IDLE_BLOCKS || run_type < 0 || run_type == MISSING)
        return;
    for (dest = 0; dest < 2; dest++) {
        int amt = dest ? fx_rev : fx_del, k1 = amt * amt, k0 = sent_k[dest];
        volatile int *in = DEL_IN + dest * 64;
        sent_k[dest] = k1;
        if (!k0 && !k1)
            continue;
        for (c = 0; c < 2; c++) {
            const int *ob = blk.ob[c];
            int half = blk.mode & 1, k = k0 * 32, dk = k1 - k0;    // k: the gain x 32, stepped each frame
            for (f = 0; f < 32; f++) {
                int x = half ? (f & 1 ? ob[(f >> 1) + 1] : (ob[f >> 1] + ob[(f >> 1) + 1]) >> 1) : ob[f];
                k += dk;
                x = x > 65535 ? 65535 : x < -65535 ? -65535 : x;
                in[f * 2 + c] = sat_add(in[f * 2 + c], x * (k >> 5));
            }
        }
    }
}
