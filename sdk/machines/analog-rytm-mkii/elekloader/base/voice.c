// SPDX-License-Identifier: GPL-3.0-or-later
// Modwerk's Analog Rytm MKII base: digital voices (modwerk/voice.h) and the hook
// ev_sound_applied.
//
// A digital voice writes the physical voice's own stream, 32 longs a block at
// 0x80006bf8 + 128v, which stock's mixer (0x4010ea98) sends to that voice's analog
// path, as CP CLASSIC and FUNC. GEN. do. The audio interrupt calls each voice's
// engine after the trig loop (state and timer zeroed together on a new trig) and
// before the mixer; the mixer runs before the block's exit, where ev_render_out
// clears the streams the engines wrote.
//
// The type of a digital voice (808 / 909, say) is a 3-bit field of the sound. Stock
// applies a sound to a track in one routine (kit and sound loads, a trig's sound
// lock, SOUND SETTINGS); the base's gate there (voice.s) keeps each track's type and
// calls ev_sound_applied's subscribers with the sound and the track.

#include <stdint.h>
#include "analog-rytm-mk2/pages.h"
#include "analog-rytm-mk2/store.h"
#include "modwerk/voice.h"
#include "modwerk/dsp.h"

#define VOICES 8
#define TRACKS 12
#define SLOT_FIRST 34
#define SLOTS 10
#define QUIET (1 << 14)             // -102 dB of full scale, before LEV
#define QUIET_BLOCKS 64             // that long below it ends a hit: about 43 ms

// ---- stock OS 1.74 (base.json's cflags) ----
#define VOICE_STATE(v) ((volatile int32_t *)(VOICE_STATE_AT + 32 * (v)))  // +0 state, +4 timer (1/16 blocks)
#define STREAM(v) ((volatile int32_t *)(VOICE_STREAM_AT + 128 * (v)))
#define NOISE_GAIN(v) ((volatile int32_t *)(NOISE_GAIN_AT + 8 * (v)))    // target, current
#define VOICE_TRACK(v) (*(volatile uint8_t *)(VOICE_TRACK_AT + (v)))
#define TRACK_MACHINE(t) (*(volatile uint8_t *)(TRACK_MACHINE_AT + (t)))
#define HIT_VELOCITY(t) (*(volatile uint16_t *)(HIT_VELOCITY_AT + 2 * (t)))  // 8.8
#define DTIM0 (*(volatile uint32_t *)0xFC07000C)                        // core-ar2 starts it, 88000 a block
#define RECORD(id) ((char *)PARAM_RECORDS_AT + 52 * (id))               // owner +0, index +4, centred +20, long +40, short +48
#define RAM_RECORD(id) ((volatile int32_t *)(PARAM_INFO_AT + 84 * (id)))   // +4/+8 count factors, +16 encoder profile, +20 four callbacks
#define REF_PLAIN 113                                                   // BD CLASSIC's SWD: a plain dial
#define REF_CENTRED 108                                                 // BD CLASSIC's TUN: a centred dial
#define RECORD_FIRST 334                                                // the hidden slots 34..43's records
#define RECORD_LAST 407

typedef void (*silence_t)(int32_t v, void *frame);
typedef uint32_t word_t;            // the firmware returns pointers in d0
typedef word_t (*get0_t)(void);
typedef word_t (*get1_t)(word_t);
typedef word_t (*get2_t)(word_t, int);
typedef unsigned (*is_key_held_t)(int key);
typedef int (*is_live_rec_t)(word_t rec);
typedef void (*string_from_cstr_t)(void *string, const char *text, void *allocator);
typedef void (*string_dtor_t)(void *string);
typedef void (*show_header_t)(word_t page_state, void *string);
typedef void (*fillrect_t)(void *bmp, int x0, int y0, int x1, int y1, int colour);
typedef void (*text_draw_t)(void *bmp, void *font, int x, int y, int centred, int a5, const char *width, const char *fmt, ...);
typedef word_t (*text_font_t)(void *ctx);

#define PROJECT_TRACKSEL 48         // the project's track selection
#define PROJECT_TRACKS 352          // its track sounds
#define WRAPPER_SOUND 40            // a track sound wrapper's vtable: its live sound
#define WRAPPER_NOTIFY 16           // and the change notice

#define KEY_FUNC 0x80
#define KEY_NO 0x45
#define KEY_TRIG_LAST 0x0f
#define KEY_PUSH_FIRST 0x70         // the encoders' presses, A..H
#define KEY_PUSH_LAST 0x77
#define KEY_PAD_FIRST 0x90
#define KEY_PAD_LAST 0x9b
#define KEY_PRESSED 1
#define KEY_REPEAT 8
#define BRAIN_VIEWS 32              // ev_key's brain: the view manager
#define MANAGER_LIST 20
#define MANAGER_LAST 24
#define NODE_PREV 4
#define NODE_VIEW 8
#define VT_SCENE_FX 0x401e2ee8      // scene and performance mode's views
#define VT_PERF_FX 0x401e2a54
#define VT_SCENE 0x401e305c
#define VT_PERF 0x401e26c4
#define TAP_TICKS 8                 // about 0.4 s of the UI's 20 Hz
#define TAP_TURNS 3                 // encoder events in a press that make it a turn
#define BRAIN_AT 0x419f28f8          // the UI's brain: +32 its view manager
#define VT_STACK_TOP 0x4023502c      // the stack's top view when nothing (a list, a menu) is pushed above it
#define BADGE_PAPER 1               // the type's name: the bottom bar's lit paper
#define BADGE_INK 1                 // and its dark ink (text_draw's colour)
#define BADGE_ROW 2                 // its bottom row, counted up from the screen's last

STORE_FIELD(mw_voice_type);         // sound, 3 bits

extern const struct mw_voice *const mw_voices[];
extern void (*const ev_sound_applied[])(void *sound, int track);

volatile struct mw_voice_meters mw_voice_meter = { 0xab0cc0de, { { 0, 0, 0 } } };

static struct {
    const struct mw_voice *mv;      // the machine the voice last played
    uint8_t on, vel, type;
    uint8_t delay;                  // samples the hit starts into its block (2 a timer tick)
    uint16_t quiet;
    int32_t pitch, ratio;           // the last block's pitch and its ratio
    int32_t carry[MW_VOICE_FRAMES]; // the last block's samples past its end, for the delay
} run[VOICES];

// The rare paths sit out of the block's way (placed apart from the rest of the code), so
// that a voice's usual block touches fewer cache lines: stock's audio work evicts them
// between blocks.
#define COLD __attribute__((noinline, cold))
static volatile uint8_t type_of[TRACKS];  // each track's type, as its sound was last applied
static uint8_t wrote;               // voices whose stream this block holds an engine's samples
// The render's block sits in the second half of win; a hit that starts d samples into its
// block plays d samples late for its whole length, its last block's tail (carry) put just
// before it, so the level loop reads 32 samples in a row from win + 32 - d.
static int32_t win[2 * MW_VOICE_FRAMES];
static int32_t *const buf = &win[MW_VOICE_FRAMES];

// ---------------------------------------------------------------- the engine

// 2^(n/12), Q28, n = 0..12
static const int32_t SEMI[13] = {
    268435456, 284400209, 301314437, 319234613, 338220558, 358335639, 379646966, 402225607,
    426146809, 451490270, 478340391, 506786532, 536870912,
};

// The note against 60 as a pitch ratio, Q28: pitch is 16.16. -48..+35 semitones.
static int32_t COLD ratio_of(int32_t pitch)
{
    int32_t n = pitch - (60 << 16), semis, f, oct = 0, lo, r;
    n = n > (35 << 16) ? 35 << 16 : n < -(48 << 16) ? -(48 << 16) : n;
    semis = n >> 16;
    f = n & 0xffff;
    while (semis < 0) {
        semis += 12;
        oct--;
    }
    while (semis >= 12) {
        semis -= 12;
        oct++;
    }
    lo = SEMI[semis];
    r = lo + ((SEMI[semis + 1] - lo) >> 8) * (f >> 8);
    return oct >= 0 ? r << oct : r >> -oct;
}

static const struct mw_voice *voice_of_slot(int slot)
{
    const struct mw_voice *const *e;
    for (e = mw_voices; *e; e++)
        if ((*e)->abi == MW_VOICE_ABI && (*e)->slot == slot)
            return *e;
    return 0;
}

// A hit starts in this block: its delay into the block, stock's silence of the voice, the
// velocity and type it plays with, and the machine's hit.
static void COLD start_hit(const struct mw_voice *mv, int32_t v, unsigned track, volatile int32_t *st,
                           void *frame, struct mw_voice_play *p)
{
    int k, vel = HIT_VELOCITY(track) >> 8, type = type_of[track];
    st[0] = 1;
    run[v].delay = (uint8_t)(st[1] > 0 ? 2 * st[1] : 0);
    for (k = 0; k < MW_VOICE_FRAMES; k++)
        run[v].carry[k] = 0;
    ((silence_t)SILENCE_AT)(v, frame);
    run[v].mv = mv;
    run[v].vel = (uint8_t)(vel < 1 ? 1 : vel > 127 ? 127 : vel);
    run[v].type = (uint8_t)(type < mv->types ? type : 0);
    run[v].on = 1;
    run[v].quiet = 0;
    p->velocity = run[v].vel;
    p->type = run[v].type;
    mv->hit(v, p);
}

void mw_voice_run(const struct mw_voice *mv, int32_t v, void *frame, uint16_t *blk, int32_t pitch)
{
    volatile int32_t *st, *a;
    struct mw_voice_play p;
    uint32_t macsr, acc, ext, acc1, acc2, acc3, ext23, t0, dt;
    unsigned track;
    int k, lev;

    if ((uint32_t)v >= VOICES || !mv || mv->abi != MW_VOICE_ABI)
        return;
    track = VOICE_TRACK(v);
    if (track >= TRACKS)
        return;
    st = VOICE_STATE(v);
    a = STREAM(v);

    // Stock's mixers keep EMAC state across the block: put it back after. A voice may use
    // all four accumulators. The accumulators move with MACSR 0 both ways (the EMAC's own
    // context save): stock runs some mixers with saturation on (MACSR 0xa0, 0x80), under which
    // a read could come back saturated.
    __asm__ volatile ("move.l %%macsr,%0\n\tmove.l #0,%%macsr\n\tmove.l %%acc0,%1\n\tmove.l %%accext01,%2\n\t"
                      "move.l %%acc1,%3\n\tmove.l %%acc2,%4\n\tmove.l %%acc3,%5\n\tmove.l %%accext23,%6\n\t"
                      "move.l #0x20,%%macsr\n\tmove.l #0,%%acc0\n\tmove.l #0,%%acc1\n\tmove.l #0,%%acc2\n\t"
                      "move.l #0,%%acc3\n\tmove.l #0,%%accext01\n\tmove.l #0,%%accext23"
                      : "=d"(macsr), "=d"(acc), "=d"(ext), "=d"(acc1), "=d"(acc2), "=d"(acc3), "=d"(ext23));

    for (k = 0; k < 8; k++) {
        int w = (int16_t)blk[k] >> 8;   // modulation can push a live word past either end
        p.knob[k] = (uint8_t)(w < 0 ? 0 : w > 127 ? 127 : w);
    }
    p.track = (uint8_t)track;
    if (pitch != run[v].pitch || !run[v].ratio) {
        run[v].pitch = pitch;
        run[v].ratio = ratio_of(pitch);
    }
    p.ratio = run[v].ratio;
    p.pad = 0;

    // A trig zeroes the state and sets the timer to when it starts, in 2-sample ticks
    // (stock's engines read timer & 15 within the block); the timer falls by 16 a block
    // after the engines. A trig still a block or more away (a MIDI note's, 16 and up)
    // waits with its state left at 0; one in this block (0..15) starts here. A state
    // of 0 with an older timer is the boot value: no hit.
    if (st[0] == 0 && st[1] >= 16) {
        /* not yet */
    } else if (st[0] == 0 && st[1] > -32) {
        start_hit(mv, v, track, st, frame, &p);
    } else if (st[0] == 0) {
        st[0] = 1;
    }
    NOISE_GAIN(v)[0] = NOISE_GAIN(v)[1] = 0;

    if (!run[v].on || run[v].mv != mv) {
        for (k = 0; k < MW_VOICE_FRAMES; k++)
            a[k] = 0;                   // another machine's last block may still be here
    } else {
        p.velocity = run[v].vel;
        p.type = run[v].type;
        t0 = DTIM0;
        mv->render(v, &p, buf);
        dt = DTIM0 - t0;
        if (mv->slot >= SLOT_FIRST && mv->slot < SLOT_FIRST + SLOTS) {
            volatile struct mw_voice_meter *m = &mw_voice_meter.m[mv->slot - SLOT_FIRST];
            m->blocks++;
            m->ticks += dt;
            if (dt > m->max)
                m->max = dt;
        }
        lev = p.knob[0];
        {
            int32_t gain = (int32_t)((uint32_t)(lev * lev) * 133144u);  // LEV^2, Q31
            uint32_t loud = 0;          // any sample at or past QUIET either way
            __asm__ volatile ("move.l #0,%%acc0\n\tmove.l #0,%%acc1\n\tmove.l #0,%%accext01" ::);  // whatever render left
            int d = run[v].delay;
            const int32_t *x = buf - d;
            for (k = 0; k < d; k++)     // a hit d samples into its block: the last block's tail first
                win[MW_VOICE_FRAMES - d + k] = run[v].carry[k];
            for (k = 0; k < MW_VOICE_FRAMES; k += 2) {     // two samples a turn on ACC0 and ACC1
                int32_t x0 = x[k], x1 = x[k + 1], y0, y1;
                __asm__ volatile ("mac.l %2,%4,%%acc0\n\tmac.l %3,%4,%%acc1\n\t"
                                  "movclr.l %%acc0,%0\n\tmovclr.l %%acc1,%1"
                                  : "=&d"(y0), "=&d"(y1) : "r"(x0), "r"(x1), "r"(gain));
                loud |= ((uint32_t)(x0 + (QUIET - 1)) > 2u * (QUIET - 1))
                        | ((uint32_t)(x1 + (QUIET - 1)) > 2u * (QUIET - 1));
                a[k] = y0;
                a[k + 1] = y1;
            }
            for (k = 0; k < d; k++)
                run[v].carry[k] = buf[MW_VOICE_FRAMES - d + k];
            wrote |= (uint8_t)(1u << v);
            if (loud)
                run[v].quiet = 0;
            else if (++run[v].quiet >= QUIET_BLOCKS)
                run[v].on = 0;
        }
    }

    __asm__ volatile ("move.l #0,%%macsr\n\tmove.l %1,%%acc0\n\tmove.l %2,%%accext01\n\t"
                      "move.l %3,%%acc1\n\tmove.l %4,%%acc2\n\tmove.l %5,%%acc3\n\tmove.l %6,%%accext23\n\t"
                      "move.l %0,%%macsr"
                      :: "d"(macsr), "d"(acc), "d"(ext), "d"(acc1), "d"(acc2), "d"(acc3), "d"(ext23));
}

// ev_render_out, after the mixer: clear the streams the engines wrote this block.
void mw_voice_render_out(void)
{
    int v, k;
    for (v = 0; wrote; v++, wrote >>= 1)
        if (wrote & 1)
            for (k = 0; k < MW_VOICE_FRAMES; k++)
                STREAM(v)[k] = 0;
}

// ---------------------------------------------------------------- ev_sound_applied

// From voice.s, at stock's routine that applies a sound to a track (a2 the sound,
// d2 the track): the track's type, then every subscriber.
void mw_voice_applied(void *sound, int track)
{
    void (*const *f)(void *, int);
    if (sound && (unsigned)track < TRACKS)
        type_of[track] = (uint8_t)core_store_get(STORE(mw_voice_type), sound, 0);
    for (f = ev_sound_applied; *f; f++)
        (*f)(sound, track);
}

// ---------------------------------------------------------------- the page

static int asked, page_up, redraw, reread, dialled;
static int tap_ticks = -1, tap_turns, tap_enc = -1;

static word_t project(void) { return ((get0_t)PROJECT_SINGLETON_AT)(); }

static int selected_track(void)
{
    return (int)((get1_t)TRACK_INDEX_OF_AT)(project() + PROJECT_TRACKSEL);
}

static unsigned char *sound_of(int track, word_t *wrapper)
{
    word_t w = ((get2_t)KIT_TRACK_SOUND_AT)(project() + PROJECT_TRACKS, track);
    if (wrapper)
        *wrapper = w;
    return w ? (unsigned char *)(*(get1_t *)(*(word_t *)w + WRAPPER_SOUND))(w) : 0;
}

// The selected track's digital voice, or 0.
static const struct mw_voice *selected(int *track)
{
    int t = selected_track();
    *track = t;
    return (unsigned)t < TRACKS ? voice_of_slot(TRACK_MACHINE(t)) : 0;
}

// The record of mv's tapped knob: its slot's record at tap_index.
static char *tap_record(const struct mw_voice *mv)
{
    int id;
    for (id = RECORD_FIRST; id <= RECORD_LAST; id++) {
        char *r = RECORD(id);
        if (*(int32_t *)r == mv->slot && *(int32_t *)(r + 4) == mv->tap_index)
            return r;
    }
    return 0;
}

static void set_label(const struct mw_voice *mv, int type)
{
    char *r;
    if (mv->types < 2 || !mv->labels || !(r = tap_record(mv)))
        return;
    *(const char **)(r + 48) = mv->labels[2 * type];
    *(const char **)(r + 40) = mv->labels[2 * type + 1];
}

// Stock asks each knob's value text when it draws a page: a hidden machine's knob
// means its SYNTH page is on screen. A digital voice's knobs (but LEV) read as
// numbers, -64..+63 when centred; any other machine's are stock's.
static int knob_text(struct core_text *t)
{
    char *r = RECORD(t->id), *b = t->buf;
    int v = t->value >> 8, n = 0;
    char digits[4];
    asked = 1;
    if (!voice_of_slot(*(int32_t *)r) || *(int32_t *)(r + 4) == 9)
        return CORE_TEXT_PASS;
    if (*(int32_t *)(r + 20)) {
        v -= 64;
        if (v > 0)
            *b++ = '+';
    }
    if (v < 0) {
        *b++ = '-';
        v = -v;
    }
    do {
        digits[n++] = (char)('0' + v % 10);
        v /= 10;
    } while (v && n < 3);
    while (n)
        *b++ = digits[--n];
    *b = 0;
    return CORE_TEXT_DONE;
}

// A digital voice's slot keeps the hidden records' stock widgets: give each knob
// but LEV a plain or a centred dial, as core_machine_knob.centred asks, by taking
// the reference dial's count factors, encoder profile and callbacks (their storage
// holds the same flags for every dial). Once, after the OS built the records.
static void dials(void)
{
    const struct mw_voice *const *e;
    int id, k;
    for (e = mw_voices; *e; e++)
        for (id = RECORD_FIRST; id <= RECORD_LAST; id++) {
            char *r = RECORD(id);
            volatile int32_t *to, *from;
            if (*(int32_t *)r != (*e)->slot || *(int32_t *)(r + 4) == 9)
                continue;
            to = RAM_RECORD(id);
            from = RAM_RECORD(*(int32_t *)(r + 20) ? REF_CENTRED : REF_PLAIN);
            to[1] = from[1];
            to[2] = from[2];
            for (k = 4; k < 21; k++)
                to[k] = from[k];
        }
}

const struct core_param mw_voice_params = { RECORD_FIRST, RECORD_LAST, 0, 0, knob_text };

// Nothing (a list, a menu, a popup) is pushed above the page.
static int page_on_top(void)
{
    char *brain = *(char **)BRAIN_AT, *manager, *last;
    if (!brain || !(manager = *(char **)(brain + BRAIN_VIEWS)) || !(last = *(char **)(manager + MANAGER_LAST)))
        return 0;
    return **(word_t **)(last + NODE_VIEW) == VT_STACK_TOP;
}

// ev_draw: the page is up while stock asks its knobs; a typed voice's type name
// goes in the bottom bar, right of the pattern, unless something is open above it.
void mw_voice_draw(void *bmp, void *ctrl)
{
    int t;
    const struct mw_voice *mv;
    (void)ctrl;
    if (asked)
        page_up = 1;
    asked = 0;
    if (!page_up || !(mv = selected(&t)) || mv->types < 2 || !mv->names || !page_on_top())
        return;
    ((fillrect_t)FILLRECT_AT)(bmp, 96, 0, 127, 8, BADGE_PAPER);
    ((text_draw_t)TEXT_DRAW_AT)(bmp, (void *)((text_font_t)TEXT_FONT_AT)((void *)TEXT_CTX_AT), 112, BADGE_ROW, 1,
                                BADGE_INK, "XXXX", "%s", mv->names[type_of[t] < mv->types ? type_of[t] : 0]);
}

// Each track's type from its kit sound.
static void reread_types(void)
{
    int t;
    unsigned char *sound;
    for (t = 0; t < TRACKS; t++)
        type_of[t] = (sound = sound_of(t, 0)) ? (uint8_t)core_store_get(STORE(mw_voice_type), sound, 0) : 0;
}

// ev_tick: the selected track's tapped knob names follow its type.
void mw_voice_tick(char *ctrl)
{
    int t;
    const struct mw_voice *mv;
    if (reread) {
        reread = 0;
        reread_types();
    }
    if (!dialled) {
        dialled = 1;
        dials();
    }
    mv = selected(&t);
    if (mv)
        set_label(mv, type_of[t] < mv->types ? type_of[t] : 0);
    if (tap_ticks >= 0 && ++tap_ticks > TAP_TICKS)
        tap_ticks = -1;
    if (redraw) {
        redraw = 0;
        ctrl[0x20] = 1;
    }
}

// ev_project: read each track's type again at the next tick, in case a load applied
// none. Not here: the kit may not be built yet.
void mw_voice_project(int how, unsigned dropped)
{
    (void)how;
    (void)dropped;
    reread = 1;
}

static int scene_or_perf(void *brain)
{
    char *manager = *(char **)((char *)brain + BRAIN_VIEWS);
    char *list = manager + MANAGER_LIST, *node;
    for (node = *(char **)(manager + MANAGER_LAST); node && node != list; node = *(char **)(node + NODE_PREV)) {
        word_t vt = **(word_t **)(node + NODE_VIEW);
        if (vt == VT_SCENE_FX || vt == VT_PERF_FX || vt == VT_SCENE || vt == VT_PERF)
            return 1;
    }
    return 0;
}

// A press with a trig, FUNC or NO down is stock's, and so is any press in live
// recording or with a pad held in scene or performance mode.
static int plain_press(void *brain)
{
    is_key_held_t held = (is_key_held_t)IS_KEY_HELD_AT;
    int key;
    if (held(KEY_FUNC) || held(KEY_NO) || ((is_live_rec_t)IS_LIVE_REC_AT)(((get0_t)REC_STATE_AT)()))
        return 0;
    for (key = 0; key <= KEY_TRIG_LAST; key++)
        if (held(key))
            return 0;
    if (scene_or_perf(brain))
        for (key = KEY_PAD_FIRST; key <= KEY_PAD_LAST; key++)
            if (held(key))
                return 0;
    return 1;
}

// The tap: step the selected track's sound to its next type.
static void step_type(const struct mw_voice *mv, int track)
{
    struct { const void *vtable; unsigned char changed; } info = { (const void *)SOUND_CONFIG_CHANGED_VT, 1 };
    word_t wrapper;
    uint32_t string[2];
    char allocator;
    unsigned char *sound = sound_of(track, &wrapper);
    int type;
    if (!sound)
        return;
    type = (int)core_store_get(STORE(mw_voice_type), sound, 0) + 1;
    if (type >= mv->types)
        type = 0;
    core_store_set(STORE(mw_voice_type), sound, 0, (unsigned)type);
    ((void (*)(word_t, void *))*(word_t *)(*(word_t *)wrapper + WRAPPER_NOTIFY))(wrapper, &info);
    type_of[track] = (uint8_t)type;
    set_label(mv, type);
    // stock wrote the knob's name in the header at the press; the tap acts at the release
    ((string_from_cstr_t)STRING_FROM_CSTR_AT)(string, mv->labels[2 * type + 1], &allocator);
    ((show_header_t)SHOW_HEADER_AT)(((get0_t)REC_STATE_AT)(), string);
    ((string_dtor_t)STRING_DTOR_AT)(string);
    redraw = 1;
}

// ev_key: a tap (press and release inside TAP_TICKS, a plain press) of the machine's
// tap encoder on its SYNTH page steps the type. Stock's press only shows the
// parameter, so it goes on as ever.
int mw_voice_key(void *brain, char *ev)
{
    int key = *(int *)(ev + 12), flags = *(int *)(ev + 16), t;
    const struct mw_voice *mv;
    if (flags & KEY_REPEAT)
        return 0;
    if (key != KEY_FUNC && key > KEY_TRIG_LAST && (key < KEY_PUSH_FIRST || key > KEY_PUSH_LAST)) {
        page_up = 0;                    // any other key may leave the page; the next draw says if not
        asked = 0;
        redraw = 1;
        return 0;
    }
    if (key < KEY_PUSH_FIRST || key > KEY_PUSH_LAST || !page_up)
        return 0;
    mv = selected(&t);
    if (!mv || mv->types < 2 || !mv->labels || key - KEY_PUSH_FIRST != mv->tap_encoder)
        return 0;
    if (flags & KEY_PRESSED) {
        tap_ticks = plain_press(brain) ? 0 : -1;
        tap_turns = 0;
        tap_enc = mv->tap_encoder;
        return 0;
    }
    if (tap_ticks >= 0 && plain_press(brain))
        step_type(mv, t);
    tap_ticks = -1;
    return 0;
}

// ev_enc: a click nudges the encoder, so the first turns of a tap's press are not a turn.
int mw_voice_enc(void *brain, char *ev)
{
    (void)brain;
    if (tap_ticks < 0 || *(int *)(ev + 12) != tap_enc)
        return 0;
    if (++tap_turns < TAP_TURNS)
        return 1;
    tap_ticks = -1;
    return 0;
}
