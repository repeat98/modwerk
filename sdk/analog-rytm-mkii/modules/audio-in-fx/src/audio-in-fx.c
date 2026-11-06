// SPDX-License-Identifier: GPL-3.0-or-later
// Audio In FX: the AUDIO IN jacks into the analog mix before the distortion, and into the delay and the reverb.
//
// On stock AUDIO IN's two words in the receive buffer go to the sampler, its monitor and USB. This mod adds
// them to the words stock's own paths use: the PRE return's DAC words, which join the analog mix before DIST and
// COMP, and the delay's and reverb's send buffers. Two knobs on the stock DISTORTION page set the levels: D into
// the mix, E into both effects. Both are real stock parameters on the FX track's two unused words, 29 and 0, so
// stock saves them with the kit and gives them parameter locks, scene and performance locks, copy, clear and
// paste. Both at 0 leave every word as stock wrote it.
#include <stdint.h>

#include "analog-rytm-mk2/pages.h"
#include "ar2-1.74.h"

#define PAGE_DIST 10
#define ID_IN 445                       // hidden TEST records, renamed and pointed at FX words in build.json
#define ID_FX 446
#define ID_DIST_AMT 90                  // shows the values as stock shows AMT
#define WORD_IN 29                      // their FX track words
#define WORD_FX 0

enum { IN, FX, KNOBS };

#define FRAMES 32
#define RX_FRAME_WORDS 12               // the receive buffer's frame
#define RX_AUDIO_IN 10                  // AUDIO IN L and R in it
#define TX_FRAME_WORDS 16               // an output slot's frame
#define TX_PRE 12                       // the PRE return's words in it
#define TX_SLOT_BYTES 2048
#define ENGINE_FX 0x8000fb98            // the engine's words for the FX track, 8.8: the kit's value with stock's
                                        // parameter, scene and performance locks applied, smoothed
#define KNOB_D 3                        // encoder D
#define SNAP_UNITY 110                  // FUNC + turn stops at 0, here and 127: stock's default VOL
#define SNAP_TOP 127
#define KEY_FUNC 0x80
#define KEY_TRIG_LAST 0x0f
#define KEY_PUSH_A 0x70                 // the encoders' presses
#define KEY_PUSH_D 0x73
#define KEY_PUSH_H 0x77
#define KEY_PRESSED 1                   // ev_key's flags
#define KEY_INDEX 12                    // ev_key's event: the key
#define KEY_FLAGS 16                    // and its flags
#define ENC_INDEX 12                    // ev_enc's event: the encoder
#define CTRL_REDRAW 0x20                // ev_tick's ctrl: asks for a redraw

#define KEY_NO 0x45
#define KEY_PAD_FIRST 0x90
#define KEY_PAD_LAST 0x9b
#define BRAIN_VIEWS 32                  // ev_key's brain: the view manager
#define MANAGER_LIST 20                 // its list of views, the sentinel
#define MANAGER_LAST 24                 // its top list node
#define NODE_PREV 4                     // a node's previous node
#define NODE_VIEW 8                     // a node's view
#define VT_SCENE_FX 0x401e2ee8          // scene mode's view on the FX track (rytm-emu, OS 1.74)
#define VT_PERF_FX 0x401e2a54           // performance mode's view there
#define VT_SCENE 0x401e305c             // the two on a pad track, as other mods test them
#define VT_PERF 0x401e26c4              // (pad tracks)
#define KEY_REPEAT 8                    // ev_key's flags: a held key's repeat
#define TAP_TICKS 8                     // about 0.4 s of the UI's 20 Hz
#define TAP_TURNS 3                     // encoder events in a press that make it a turn
#define JUMP_TICKS 9                    // FUNC: a jump at most every 0.45 s, stock VOL's pace
#define ID_TABLE 0x401bfbc8             // stock's id table, 52 bytes an id: the names
#define ID_STRIDE 52
#define ID_LONG 40
#define ID_SHORT 48

// Stock's RAM parameter records, 84 bytes an id: +4 and +8 the encoder's count factors, +0x24 the knob's draw
// callback, a 16-byte std::function. VOL's draws a bar. The other words are bound to their own parameter: leave them.
#define PARAM_INFO 0x419a4888
#define PARAM_STRIDE 84
#define PARAM_RANGE 4
#define PARAM_DRAW 0x24
#define PARAM_DRAW_WORDS 4
#define ID_DELAY_VOL 79

#define KIT_WORD 0x784                  // word 29 in a live kit
#define KIT_SOUND0 42                   // a live kit's first sound
#define PROJECT_KIT 352                 // the project's active kit
#define ACC_LIVE_SOUND 40               // a sound accessor's vtable: the live sound
#define LOCK_NONE 0xffff
#define FX_TRACK 12
#define STEPS 64
#define TP_LOCKS 44                     // a track pattern's lock object
#define VT_LOCK_TABLE 0x28              // its vtable: the live lock table
#define LOCK_TRACK_BYTES 5674           // the table: a track's 64 steps, then its fine flags
#define LOCK_STEP_BYTES 88              // a step: 42 words, then its lock count
#define REC_HELD_HI 0x158               // the recorder: steps 32-63 held (grid recording only)
#define REC_HELD_LO 0x15c               // steps 0-31

// The firmware returns a pointer in d0, where this compiler reads a0: its routines are declared to return a word.
typedef uint32_t word_t;
typedef unsigned (*is_key_held_t)(int key);
typedef word_t (*singleton_t)(void);
typedef word_t (*kit_track_sound_t)(void *kit, int track);
typedef word_t (*param_target_t)(void *project, int track, int a);
typedef void (*param_set_t)(word_t target, int id, int value, int track, int notify, int redraw);
typedef int (*is_live_rec_t)(void *rec);
typedef word_t (*pattern_of_t)(void *project);
typedef word_t (*track_pattern_t)(void *pattern, int track);
typedef int (*set_lock_t)(void *tp, int step, int word, int value, int fine);
typedef int (*view_lock_delta_t)(void *view, int id, int delta);
typedef void (*string_from_cstr_t)(void *string, const char *text, void *allocator);
typedef void (*string_dtor_t)(void *string);
typedef void (*show_header_t)(void *page_state, void *string);

static int gain[KNOBS];                 // Q11, as the last block ended
static int asked, page_up, redraw;      // the page was asked for; it is on screen; a jump wants a redraw
static volatile int mono;               // the input summed, on both paths
static int tap_ticks = -1, tap_turns;   // UI ticks since D's press, -1 with no tap open; turns in the press
static unsigned ui_ticks = 100, jump_tick[KNOBS];   // ev_tick's count; each knob's last FUNC jump

static const int word_of[KNOBS] = { WORD_IN, WORD_FX };

static volatile int *draw_of(int id)
{
    return (volatile int *)(PARAM_INFO + id * PARAM_STRIDE + PARAM_DRAW);
}

static volatile int *range_of(int id)
{
    return (volatile int *)(PARAM_INFO + id * PARAM_STRIDE + PARAM_RANGE);
}

// Apart, so GCC's late combine cannot make the post-increment both words of one move: m68k_codegen.py refuses it.
__attribute__((noinline)) static void copy_word(volatile int *to, const volatile int *from)
{
    *to = *from;
}

extern const char audio_in_fx_short_in[], audio_in_fx_long_in[];
static const char short_mono[] = "MNO";
static const char long_mono[] = "Input Mono";

// Bar D's names follow the setting, STE or MNO: stock reads them from the id table in RAM on each draw.
static void set_mono(int on)
{
    char *row = (char *)ID_TABLE + ID_IN * ID_STRIDE;
    mono = on;
    *(const char **)(row + ID_SHORT) = on ? short_mono : audio_in_fx_short_in;
    *(const char **)(row + ID_LONG) = on ? long_mono : audio_in_fx_long_in;
}

// ev_project: a project loaded or made, at boot too: stereo, and both knobs drawn as stock's VOL bar.
void audio_in_fx_project(int how, unsigned dropped)
{
    int k, w;
    (void)how;
    (void)dropped;
    set_mono(0);
    for (k = 0; k < KNOBS; k++) {
        for (w = 0; w < PARAM_DRAW_WORDS; w++)
            copy_word(draw_of(ID_IN + k) + w, draw_of(ID_DELAY_VOL) + w);
        copy_word(range_of(ID_IN + k), range_of(ID_DELAY_VOL));
        copy_word(range_of(ID_IN + k) + 1, range_of(ID_DELAY_VOL) + 1);
    }
}

// ---------------------------------------------------------------- audio

// Knob to gain: squared as stock's levels are, Q11, so 110 is 1 and 127 about 1.33.
static int gain_of(int knob_value)
{
    return knob_value * knob_value * 1387 >> 13;
}

// A knob's value as the engine plays it: 0 to 127.
static int engine_value(int k)
{
    int v = ((volatile int16_t *)ENGINE_FX)[word_of[k]] >> 8;
    return v < 0 ? 0 : v > SNAP_TOP ? SNAP_TOP : v;
}

// A frame's input, over 13 bits. Mono is L + R on both sides, so a source on one jack keeps its level. Input
// words over 13 bits, and L + R in mono, by a Q11 gain below 2731 stay within 31 bits, in the receive words'
// scale over 4.
static inline void read_input(volatile int *rx, int *in, int sum)
{
    in[0] = rx[0] >> 13;
    in[1] = rx[1] >> 13;
    if (sum)
        in[0] = in[1] = in[0] + in[1];
}

// Stock's PRE words are 24 bits, negated. Sign extend, add, saturate, and keep the top byte clear as stock does.
// The gain steps across the block, so a knob's move does not step the audio.
static void add_pre(volatile int *pre, int *g, int to)
{
    volatile int *rx = (volatile int *)RX_AT + RX_AUDIO_IN;
    int g16 = *g << 5, step = to - *g, sum = mono, n, c, v, w, in[2];

    for (n = 0; n < FRAMES; n++) {
        v = g16 >> 5;
        g16 += step;
        read_input(rx, in, sum);
        for (c = 0; c < 2; c++) {
            w = (pre[c] << 8 >> 8) - (in[c] * v >> 6);
            if (w > 0x7fffff) w = 0x7fffff;
            else if (w < -0x800000) w = -0x800000;
            pre[c] = w & 0xffffff;
        }
        rx += RX_FRAME_WORDS;
        pre += TX_FRAME_WORDS;
    }
    *g = to;
}

// Both send buffers, 32 stereo frames each in the receive words' scale, by one gain.
static void add_sends(int *g, int to)
{
    volatile int *rx = (volatile int *)RX_AT + RX_AUDIO_IN;
    volatile int *del = (volatile int *)DELAY_SEND_AT, *rev = (volatile int *)REVERB_SEND_AT;
    int g16 = *g << 5, step = to - *g, sum = mono, n, c, v, w, x, in[2];

    for (n = 0; n < FRAMES; n++) {
        v = g16 >> 5;
        g16 += step;
        read_input(rx, in, sum);
        for (c = 0; c < 2; c++) {
            x = in[c] * v;
            w = x + (del[c] >> 2);
            if (w > 0x1fffffff) w = 0x1fffffff;
            else if (w < -0x20000000) w = -0x20000000;
            del[c] = w << 2;
            w = x + (rev[c] >> 2);
            if (w > 0x1fffffff) w = 0x1fffffff;
            else if (w < -0x20000000) w = -0x20000000;
            rev[c] = w << 2;
        }
        rx += RX_FRAME_WORDS;
        del += 2;
        rev += 2;
    }
    *g = to;
}

// From the gate at the delay's entry: stock has mixed the voices into both sends and read this block's input, and
// neither effect has run.
void audio_in_fx_block(void)
{
    int to_in = gain_of(engine_value(IN)), to_fx = gain_of(engine_value(FX));

    if (to_in | gain[IN])
        add_pre((volatile int *)(TX_RING_AT + (*(volatile int *)TX_SLOT_AT & 3) * TX_SLOT_BYTES) + TX_PRE, &gain[IN], to_in);
    if (to_fx | gain[FX])
        add_sends(&gain[FX], to_fx);
}

// ---------------------------------------------------------------- the page

const char audio_in_fx_short_in[] = "STE";
const char audio_in_fx_short_fx[] = "IFX";
const char audio_in_fx_long_in[] = "Input Stereo";
const char audio_in_fx_long_fx[] = "Input To FX";

static const struct core_page dist_page = {
    PAGE_DIST, "DISTORTION", { 90, 91, 80, ID_IN, ID_FX, 0, 81, 89 }
};

// Every reader of the page asks this, the knobs' draw among them: so the page is on screen when a compose asks.
static const struct core_page *dist_info(int32_t page)
{
    (void)page;
    asked = 1;
    return &dist_page;
}

const struct core_page_fn audio_in_fx_page = { PAGE_DIST, dist_info };

static void *fx_pattern(void)
{
    return (void *)((track_pattern_t)TRACK_PATTERN_AT)((void *)((pattern_of_t)PATTERN_OF_AT)((void *)((singleton_t)PROJECT_AT)()), FX_TRACK);
}

static volatile unsigned short *lock_word(void *tp, int step, int word)
{
    void *locks = *(void **)((char *)tp + TP_LOCKS);
    char *table = (char *)(*(*(word_t (***)(void *))locks)[VT_LOCK_TABLE / 4])(locks);
    return (volatile unsigned short *)(table + LOCK_TRACK_BYTES * FX_TRACK + LOCK_STEP_BYTES * step + 2 * word);
}

// The live kit's FX word, 8.8.
static volatile unsigned short *kit_word(int word)
{
    char *project = (char *)((singleton_t)PROJECT_AT)();
    void *acc = (void *)((kit_track_sound_t)KIT_TRACK_SOUND_AT)(project + PROJECT_KIT, 0);
    word_t (*get)(void *) = (*(word_t (***)(void *))acc)[ACC_LIVE_SOUND / 4];
    char *sound = (char *)get(acc);
    return sound ? (volatile unsigned short *)(sound - KIT_SOUND0 + KIT_WORD) + (word - WORD_IN) : 0;
}

// The steps held in grid recording; stock fills them only then.
static int held(int step)
{
    char *rec = (char *)((singleton_t)REC_STATE_AT)();
    unsigned lo = *(volatile unsigned *)(rec + REC_HELD_LO), hi = *(volatile unsigned *)(rec + REC_HELD_HI);
    return (step < 32 ? lo >> step : hi >> (step - 32)) & 1;
}

static int snap(int v, int up)
{
    if (up) return v < SNAP_UNITY ? SNAP_UNITY : SNAP_TOP;
    return v > SNAP_UNITY ? SNAP_UNITY : 0;
}

// FUNC: one jump, at most every JUMP_TICKS. 1: the turn may jump now.
static int jump_due(int k)
{
    if (ui_ticks - jump_tick[k] < JUMP_TICKS)
        return 0;
    jump_tick[k] = ui_ticks;
    redraw = 1;
    return 1;
}

// FUNC + turn with steps held in grid recording: their locks to the next stop, from the kit's value where none.
// 1: steps were held.
static int lock_snap(int k, int d)
{
    void *tp = fx_pattern();
    volatile unsigned short *kw = kit_word(word_of[k]);
    int step, any = 0, cur;

    for (step = 0; tp && kw && step < STEPS; step++)
        if (held(step)) {
            cur = *lock_word(tp, step, word_of[k]);
            cur = (cur == LOCK_NONE ? *kw : cur) >> 8;
            ((set_lock_t)SET_LOCK_AT)(tp, step, word_of[k], snap(cur, d > 0) << 8, 1);
            any = 1;
        }
    return any;
}

// A turn's delta reaches core_params with no trig held. A plain one goes on to stock. FUNC + turn (the key read
// directly: the func argument is stock's own flag) jumps between the stops, paced by stock's delta and JUMP_TICKS.
static int delta(void *view, int32_t id, int32_t d, int32_t func)
{
    int k = id - ID_IN;
    volatile unsigned short *kw;

    (void)view;
    (void)func;
    if (!((is_key_held_t)IS_KEY_HELD_AT)(KEY_FUNC))
        return 0;
    if (!d || !jump_due(k) || lock_snap(k, d) || !(kw = kit_word(word_of[k])))
        return 1;
    ((param_set_t)PARAM_SET_AT)(((param_target_t)PARAM_TARGET_AT)((void *)((singleton_t)PROJECT_AT)(), FX_TRACK, 0),
                                id, snap(*kw >> 8, d > 0) << 8, FX_TRACK, 1, 1);
    return 1;
}

static int text(struct core_text *t)
{
    t->id = ID_DIST_AMT;
    return CORE_TEXT_STOCK;
}

const struct core_param audio_in_fx_params = { ID_IN, ID_FX, 0, delta, text };

// Stock's parameter page view hands a held trig's turn to this slot of its vtable (build.json points it here). A
// FUNC turn on D or E jumps the held steps' locks between the stops; everything else is stock's.
int audio_in_fx_view_lock_delta(void *view, int id, int d)
{
    int k = id - ID_IN;

    if (k < 0 || k >= KNOBS || !((is_key_held_t)IS_KEY_HELD_AT)(KEY_FUNC))
        return ((view_lock_delta_t)VIEW_LOCK_DELTA_AT)(view, id, d);
    if (d && jump_due(k))
        lock_snap(k, d);
    return 1;
}

// ev_draw, after a compose: stock asks for the page only while it draws or uses it. A compose that does not ask
// says nothing, as a knob's press redraws the header alone; ev_key takes page_up down, and the next compose brings
// it back.
void audio_in_fx_draw(void *bmp, void *ctrl)
{
    (void)bmp;
    (void)ctrl;
    if (asked)
        page_up = 1;
    asked = 0;
}

// ev_tick, about 20 Hz.
void audio_in_fx_tick(char *ctrl)
{
    ui_ticks++;
    if (tap_ticks >= 0 && ++tap_ticks > TAP_TICKS)
        tap_ticks = -1;
    if (redraw) {
        redraw = 0;
        ctrl[CTRL_REDRAW] = 1;
    }
}

// ev_enc: a click of D's tap nudges the encoder, so the first turns of a press are not a turn. Every other turn goes on.
int audio_in_fx_enc(void *brain, char *event)
{
    int k = *(int *)(event + ENC_INDEX) - KNOB_D;

    (void)brain;
    if (k < 0 || k >= KNOBS || !page_up)
        return 0;
    if (k == 0 && tap_ticks >= 0) {
        if (++tap_turns < TAP_TURNS)
            return 1;
        tap_ticks = -1;
    }
    return 0;
}

// Scene or performance mode: its view anywhere in the stack.
static int scene_or_perf(void *brain)
{
    char *manager = *(char **)((char *)brain + BRAIN_VIEWS);
    char *list = manager + MANAGER_LIST, *node;

    for (node = *(char **)(manager + MANAGER_LAST); node && node != list; node = *(char **)(node + NODE_PREV)) {
        word_t vtable = **(word_t **)(node + NODE_VIEW);
        if (vtable == VT_SCENE_FX || vtable == VT_PERF_FX || vtable == VT_SCENE || vtable == VT_PERF)
            return 1;
    }
    return 0;
}

// A press with a trig, FUNC or NO down is stock's, and so is any press in live recording. A pad counts only in
// scene and performance mode, where a held pad is the scene or performance being edited: elsewhere stock's key
// table can read a pad as down with none pressed (a unit, after scene and performance tests).
static int plain_press(void *brain)
{
    is_key_held_t key_held = (is_key_held_t)IS_KEY_HELD_AT;
    int key;

    if (key_held(KEY_FUNC) || key_held(KEY_NO) || ((is_live_rec_t)IS_LIVE_REC_AT)((void *)((singleton_t)REC_STATE_AT)()))
        return 0;
    for (key = 0; key <= KEY_TRIG_LAST; key++)
        if (key_held(key))
            return 0;
    if (scene_or_perf(brain))
        for (key = KEY_PAD_FIRST; key <= KEY_PAD_LAST; key++)
            if (key_held(key))
                return 0;
    for (key = 0; key < STEPS; key++)
        if (held(key))
            return 0;
    return 1;
}

// Stock writes a knob's name in the header at its press, and the tap acts at the release, so it writes it again.
static void show_name(void)
{
    uint32_t string[2];
    char allocator;

    ((string_from_cstr_t)STRING_FROM_CSTR_AT)(string, mono ? long_mono : audio_in_fx_long_in, &allocator);
    ((show_header_t)SHOW_HEADER_AT)((void *)((singleton_t)REC_STATE_AT)(), string);
    ((string_dtor_t)STRING_DTOR_AT)(string);
}

// ev_key: a tap of D, pressed and let go inside TAP_TICKS as a plain press, turns mono over. Stock's press only
// shows the parameter, so it goes on as ever. Any other key may leave the page, at its press or its release: a
// redraw says if it did not.
int audio_in_fx_key(void *brain, char *event)
{
    int key = *(int *)(event + KEY_INDEX), flags = *(int *)(event + KEY_FLAGS);

    if (flags & KEY_REPEAT)
        return 0;
    if (key != KEY_FUNC && key > KEY_TRIG_LAST && (key < KEY_PUSH_A || key > KEY_PUSH_H)) {
        page_up = 0;
        asked = 0;
        redraw = 1;
    }
    if (key != KEY_PUSH_D || !page_up)
        return 0;
    if (flags & KEY_PRESSED) {
        tap_ticks = plain_press(brain) ? 0 : -1;
        tap_turns = 0;
        return 0;
    }
    if (tap_ticks >= 0 && plain_press(brain)) {
        set_mono(!mono);
        show_name();
        redraw = 1;
    }
    tap_ticks = -1;
    return 0;
}
