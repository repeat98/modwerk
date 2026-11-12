// SPDX-License-Identifier: GPL-3.0-or-later
// Improved SMPL for the Analog Rytm MKII: FIN's knob is RATE on every sound, a
// sample's speed down to a stop and into reverse, as the Octatrack's RATE with its
// setting on PTCH; TUN turns in cents; and the SMPL key opens the waveform view.
//
// Stock's sample engine builds each voice's step once a block, in the prefetch,
// from the note, TUN and FIN, clamped to 0.25x..4x. The gates in audio.s take FIN
// out of the pitch and scale the step by |FIN - 64| / 64, with raw 127 exactly 1x
// (the Octatrack's increment: PTCH's, times that). FIN's default is 127, so a new
// sound plays at 1x; a sound saved with FIN at 64, stock's default, stops. Below
// 64 the voice goes backward: stock plays a sample backward when END is below
// STA, so this handler swaps the effective STA and END before the prefetch reads
// them. A trig then starts from END. Stock rebuilds the array every block before
// this runs, so the swap lasts one block.

#include <stdint.h>
#include "analog-rytm-mk2/pages.h"

#define EFF(t, i) (*(volatile short *)(PARAMS_EFF_AT + (t) * 84 + (i) * 2))
#define IDX_FIN 18
#define IDX_STA 21
#define IDX_END 22
#define IDX_LOP 23
#define VPOS(v) (*(volatile int *)(VOICE_REC_AT + (v) * 92 + 4))
#define VFRAMES(v) (*(volatile unsigned *)(VOICE_REC_AT + (v) * 92 + 20))
#define VDOWN(v) (*(volatile unsigned char *)(VOICE_REC_AT + (v) * 92 + 42))
#define OWNER(v) (*(volatile unsigned char *)(VOICE_OWNER_AT + (v)))
#define TRIG_NEXT (*(volatile unsigned *)TRIG_NEXT_AT)   // one bit a voice, as stock's prefetch tests it

#define VOICES 8
#define TRACKS 12
#define STOP 0x4000         // FIN 64 in 8.8: the step scales to 0, and in the pitch no detune
#define TURN_LAG 14         // going down, the voice reads this many frames below the same position
#define EDGE 32             // frames from STA or END where a change of direction waits
#define MIN_WAIT 141        // shortest loop stock plays: below it no position is clear of both

static unsigned char going_down[VOICES];        // the way each voice went last block
static unsigned char going_any;                  // any of them going down

// stock's frames for STA and END (8.8, of 120), audio.s; the DMA follows these frames
void sample_rate_frames(int sta, int end, unsigned frames, int *out);

// RATE's sign changes on this voice. Going down the voice reads TURN_LAG frames
// below the same position, so the position moves to keep the frames heard. Near
// STA or END of a loop the change waits: a voice just past an edge (LOP PIPO
// leaves it there) sent back over it wraps by a whole loop, and RATE comes through
// zero slowly, so it can sit there a while. 0 while it waits. A trig does not
// wait, and the prefetch places a voice that starts.
static int turn_round(int v, int t, int trig)
{
    int f[2], lo, hi, p = VPOS(v), inner;
    int sta = EFF(t, IDX_STA), end = EFF(t, IDX_END);
    sample_rate_frames(sta < 0 ? 0 : sta, end < 0 ? 0 : end, VFRAMES(v), f);
    lo = f[0] < f[1] ? f[0] : f[1];
    hi = f[0] < f[1] ? f[1] : f[0];
    inner = p >= lo + EDGE && p < hi - EDGE;
    if (inner) {
        if (!trig)
            VPOS(v) = p + (VDOWN(v) ? -TURN_LAG : TURN_LAG);    // stock's direction: LOP PIPO may have its own
        return 1;
    }
    return trig || !(EFF(t, IDX_LOP) >> 8) || hi - lo < MIN_WAIT;
}

// Each block, before the prefetch
void sample_rate_block(void)
{
    unsigned char down_now = 0;
    unsigned swapped = 0;       // one bit a track: EFF is a track's, so swap it once a block
    int v;
    // No track below 0 and no voice still going down: the loop below would change
    // nothing, so skip it (the audio interrupt runs this every block).
    if (!going_any) {
        int t;
        for (t = 0; t < TRACKS && EFF(t, IDX_FIN) >= STOP; t++)
            ;
        if (t == TRACKS)
            return;
    }
    for (v = 0; v < VOICES; v++) {
        int t = OWNER(v), down;
        if (t >= TRACKS) {
            going_down[v] = 0;
            continue;
        }
        down = EFF(t, IDX_FIN) < STOP;
        if (down != going_down[v]) {
            if (turn_round(v, t, (int)(TRIG_NEXT >> v & 1)))
                going_down[v] = (unsigned char)down;
            else
                down = going_down[v];
        }
        if (down && !(swapped >> t & 1)) {
            short sta = EFF(t, IDX_STA);
            swapped |= 1u << t;
            EFF(t, IDX_STA) = EFF(t, IDX_END);
            EFF(t, IDX_END) = sta;
        }
        if (going_down[v])
            down_now = 1;
    }
    going_any = down_now;
}

// Fine TUNE. TUN's value is an 8.8 word, and stock's engine, sound, kit, SysEx and
// scene and performance locks keep its low byte: a fraction of a semitone plays,
// saves and loads on stock OS too, which only shows the whole number. A plain turn
// of TUN moves 1 cent a count, with stock's acceleration; a press and turn moves
// whole semitones and keeps the cents, as stock's STA and END turn fine and
// coarse. Stock adds every turn of TUN, the sound's or a held trig's lock, at one
// place (0x400a88ea, audio.s): there a plain turn's count becomes cents.
#define ID_TUN 39
#define TUN_REST 0x4000
#define REC_TUN (0x419a4888 + 84 * ID_TUN)   // TUN's RAM parameter record
#define REC_STEP 4          // its turn: factor plain, factor pressed, 0, profile
#define ENC_PRESSED 20      // the event's byte, set while the knob is held down

static int fine_turn;       // the UI tick's turn is a plain one (no knob held down)

// A knob's turn profile (stock's, 0x4006eb06): three flags, then the plain and
// the pressed curve, each {acceleration, counts a step, units a step}. TUN's own
// sets both rounding flags, so every step is a whole semitone; this one rounds
// only pressed turns, so a plain step is the record's factor in raw units, and
// takes STA's acceleration (0x4006ead8) on the plain curve, so a quick spin
// covers ground.
static struct {
    unsigned char on, whole, whole_pressed, pad;
    int32_t plain[3], pressed[3];
} fine_profile = {1, 0, 1, 0, {18, 3, 1}, {2, 3, 1}};

// Cents from TUN's word, rounded to the nearest
static int cents_of(int word)
{
    int d = (word - TUN_REST) * 100;
    return d >= 0 ? (d + 128) / 256 : -((-d + 128) / 256);
}

// On even words only: a lock save keeps bits 15 to 1 (0x40009216), so an odd
// word would come back a cent off. 1/128 semitone still gives every cent its word.
static int word_of(int cents)
{
    int d = cents * 128;
    return TUN_REST + 2 * (d >= 0 ? (d + 50) / 100 : -((-d + 50) / 100));
}

// From the gate at the add: the delta stock is about to add to TUN's value cur
int sample_rate_tun_delta(int cur, int delta)
{
    if (!fine_turn)
        return delta;
    return word_of(cents_of(cur) + delta) - cur;
}

// TUN's value text, as stock's LFO depth (0x400fbbda, "%c%d.%02d"): a sign and
// two places, "+3.00", "-0.02", and "(0)" at zero
static int tun_text(struct core_text *t)
{
    int c = cents_of(t->value), a = c < 0 ? -c : c;
    char *b = t->buf;
    if (!c) {
        *b++ = '(';
        *b++ = '0';
        *b++ = ')';
    } else {
        *b++ = c < 0 ? '-' : '+';
        if (a >= 1000)
            *b++ = (char)('0' + a / 1000);
        *b++ = (char)('0' + a / 100 % 10);
        *b++ = '.';
        *b++ = (char)('0' + a / 10 % 10);
        *b++ = (char)('0' + a % 10);
    }
    *b = 0;
    return CORE_TEXT_DONE;
}

const struct core_param sample_rate_tun_param = {ID_TUN, ID_TUN, 0, 0, tun_text};

int sample_rate_turn(void *brain, char *event)
{
    (void)brain;
    fine_turn = !event[ENC_PRESSED];
    return 0;
}

// The SMPL key opens the SAMPLE view's waveform page, never its knob page. Every
// page view keeps its own copy of its page list (core-ar2's pages.s), a vector at
// +124..+128, and shows the page at index +140; the SAMPLE view's is stock's 4
// (the knobs) then 5 (the waveform), and it draws by the index. Where the list
// is exactly that, its end moves back one entry and the index goes to 1: with
// one page counted the SMPL key has nothing to cycle to, the view draws the
// waveform, and page 5 still sits at index 1 for any reader. A list a mod has
// added pages to is left as it is. The view sits in the view manager's stack below the screen's overlays,
// so the whole stack is searched, every tick: stock builds the views once, but
// would build them again (with the knob page) if every holder let them go. The
// change normally lands at boot, before the first SMPL press sets the header.
#define BRAIN (*(char *volatile *)BRAIN_AT)
#define BRAIN_VIEWS 32      // the brain's view manager
#define MANAGER_LIST 20     // the manager's sentinel node
#define MANAGER_LAST 24     // its top view's node
#define NODE_PREV 4
#define NODE_VIEW 8
#define VIEW_PAGES 124      // a page view's page ids, begin and end
#define VIEW_SEL 140        // the index of the page shown
#define PAGE_KNOBS 4
#define PAGE_WAVE 5
#define STACK_MAX 32        // views searched at most
typedef void (*invalidate_t)(void *);
#define VIEW_INVALIDATE ((invalidate_t)VIEW_INVALIDATE_AT)
extern char sample_rate_vt_sample[];    // the SAMPLE view's vtable

static char *sample_view(void)          // the SAMPLE view in the view stack, or 0
{
    char *views = BRAIN ? *(char **)(BRAIN + BRAIN_VIEWS) : 0, *node, *view;
    int n;
    if (!views)
        return 0;
    node = *(char **)(views + MANAGER_LAST);
    for (n = 0; node && node != views + MANAGER_LIST && n < STACK_MAX; n++) {
        view = *(char **)(node + NODE_VIEW);
        if (view && *(char **)view == sample_rate_vt_sample)
            return view;
        node = *(char **)(node + NODE_PREV);
    }
    return 0;
}

static void waveform_page(void)
{
    char *view = sample_view();
    int *pages;
    if (!view)
        return;
    pages = *(int **)(view + VIEW_PAGES);
    if (*(int **)(view + VIEW_PAGES + 4) != pages + 2 || pages[0] != PAGE_KNOBS || pages[1] != PAGE_WAVE)
        return;
    *(int **)(view + VIEW_PAGES + 4) = pages + 1;   // one page: the key has nothing to cycle to
    *(int *)(view + VIEW_SEL) = 1;                   // and the view draws its second, the waveform
    VIEW_INVALIDATE(view);
}

void sample_rate_tick(void *ctrl)
{
    volatile uint32_t *rec = (volatile uint32_t *)(REC_TUN + REC_STEP);
    (void)ctrl;
    fine_turn = 0;
    // A plain step is 1 unit (a cent, at the add), a pressed one a whole semitone.
    // Stock fills the record at boot; written each tick, it holds whatever ran since.
    rec[0] = 1;
    rec[1] = 1;
    rec[2] = 0;
    rec[3] = (uint32_t)&fine_profile;
    waveform_page();
}
