// SPDX-License-Identifier: GPL-3.0-or-later
// Sample Rate for the Analog Rytm MKII: a sample's speed down to a stop and
// into reverse, as the Octatrack's RATE with its setting on PTCH.
//
// Stock's sample engine builds each voice's step once a block, in the prefetch,
// from the note, TUN and FIN, clamped to 0.25x..4x. For a sound with SOUND
// SETTINGS > FIN AS RATE on, the gates in audio.s take FIN out of the pitch and
// scale the step by |FIN - 64| / 64, with raw 127 exactly 1x (the Octatrack's
// increment: PTCH's, times that). Below 64 the voice goes backward: stock plays
// a sample backward when END is below STA, so this handler swaps the effective
// STA and END before the prefetch reads them. A trig then starts from END.
//
// The setting is a bit of the sound. Stock copies a sound's settings to the
// audio side, per track, whenever it applies a sound to a track (kit load, sound
// load, a sound lock on a trig, a change in SOUND SETTINGS): the module's copy
// follows there (sample_rate_applied), so the audio code never walks the kit.

#include <stdint.h>
#include "analog-rytm-mk2/store.h"
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
#define ID_FIN 40           // FIN's parameter id
#define STOP 0x4000         // FIN 64 in 8.8: the step scales to 0, and in the pitch no detune
#define FULL 0x7f00         // FIN 127 in 8.8: 1x
#define TURN_LAG 14         // going down, the voice reads this many frames below the same position
#define EDGE 32             // frames from STA or END where a change of direction waits
#define MIN_WAIT 141        // shortest loop stock plays: below it no position is clear of both

STORE_FIELD(sample_rate_on);

unsigned char sample_rate_voices;               // one bit a voice: audio.s scales its step

static volatile unsigned char track_on[TRACKS]; // one byte a track: written from the UI and the audio interrupt

// a voice's last block, and the swap this handler wrote
static unsigned char going_down[VOICES], wrote[VOICES], wrote_track[VOICES];
static short wrote_sta[VOICES], wrote_end[VOICES];

// stock's frames for STA and END (8.8, of 120), audio.s; the DMA follows these frames
void sample_rate_frames(int sta, int end, unsigned frames, int *out);

// From the gate in stock's routine that applies a sound to a track, audio side
void sample_rate_applied(void *sound, int track)
{
    if (track >= 0 && track < TRACKS)
        track_on[track] = (unsigned char)core_store_get(STORE(sample_rate_on), sound, 0);
}

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
    unsigned char mask = 0;
    int v;
    for (v = 0; v < VOICES; v++) {
        int t = OWNER(v), on, down;
        if (wrote[v]) {                  // still as written: stock did not rebuild it
            int w = wrote_track[v];
            if (EFF(w, IDX_STA) == wrote_sta[v] && EFF(w, IDX_END) == wrote_end[v]) {
                EFF(w, IDX_STA) = wrote_end[v];
                EFF(w, IDX_END) = wrote_sta[v];
            }
            wrote[v] = 0;
        }
        if (t >= TRACKS) {
            going_down[v] = 0;
            continue;
        }
        on = track_on[t];
        down = on && EFF(t, IDX_FIN) < STOP;   // switched off going down: back up, as any change of sign
        if (down != going_down[v]) {
            if (turn_round(v, t, (int)(TRIG_NEXT >> v & 1)))
                going_down[v] = (unsigned char)down;
            else
                down = going_down[v];
        }
        if (on)
            mask |= (unsigned char)(1u << v);
        if (down) {
            short sta = EFF(t, IDX_STA), end = EFF(t, IDX_END);
            EFF(t, IDX_STA) = end;
            EFF(t, IDX_END) = sta;
            wrote_sta[v] = end;
            wrote_end[v] = sta;
            wrote_track[v] = (unsigned char)t;
            wrote[v] = 1;
        }
    }
    sample_rate_voices = mask;
}

// The selected track's sound, for the row, the knob's label and its value.
// Stock returns pointers in d0: these are integers, cast where used.
typedef uint32_t (*get0_t)(void);
typedef uint32_t (*get1_t)(uint32_t);
typedef uint32_t (*get2_t)(uint32_t, int);
typedef uint32_t (*get3_t)(uint32_t, int, int);
typedef void (*set_value_t)(uint32_t, int, int, int, int, int);
typedef void (*text_t)(void *, const void *, int, int, int, int, int, const char *);
typedef void (*invalidate_t)(void *);
#define PROJECT ((get0_t)PROJECT_AT)
#define TRACK_SELECTION ((get1_t)TRACK_SELECTION_AT)
#define TRACK_INDEX_OF ((get1_t)TRACK_INDEX_OF_AT)
#define KIT_TRACK_SOUND ((get2_t)KIT_TRACK_SOUND_AT)
#define PARAM_TARGET ((get3_t)PARAM_TARGET_AT)
#define PARAM_SET ((set_value_t)PARAM_SET_AT)
#define DRAW_TEXT ((text_t)DRAW_TEXT_AT)
#define VIEW_INVALIDATE ((invalidate_t)VIEW_INVALIDATE_AT)
#define SOUND_OF_WRAPPER 40          // the wrapper's vtable: its live sound, or 0
#define NOTIFY_OF_WRAPPER 16         // and the change notice
#define LIVE_SOUND_FIN 0x38          // FIN's word in a live sound
#define PROJECT_TRACKS 352           // the project's track sounds

struct picked {
    uint32_t project, wrapper;
    unsigned char *sound;
    int track;
};

static int pick(struct picked *p)
{
    p->project = PROJECT();
    p->track = (int)TRACK_INDEX_OF(TRACK_SELECTION(p->project));
    if ((unsigned)p->track >= TRACKS)
        return 0;
    p->wrapper = KIT_TRACK_SOUND(p->project + PROJECT_TRACKS, p->track);
    p->sound = (unsigned char *)(*(get1_t *)(*(uint32_t *)p->wrapper + SOUND_OF_WRAPPER))(p->wrapper);
    return p->sound != 0;
}

int sample_rate_selected(void)   // nonzero while FIN is RATE on the selected track's sound
{
    struct picked p;
    return pick(&p) && core_store_get(STORE(sample_rate_on), p.sound, 0);
}

// FIN at its detune's rest would stop the sample, so switching on takes it to
// 1x, and switching off takes 1x back to rest. Any other value stays: it may be
// a sound's real detune, or the RATE to come back to.
static void set_on(void **menu, int on)
{
    struct picked p;
    struct {
        const void *vtable;
        unsigned char changed;
    } info = {(const void *)CONFIG_CHANGED_INFO, 1};
    int fin;
    if (!pick(&p) || (int)core_store_get(STORE(sample_rate_on), p.sound, 0) == on)
        return;
    core_store_set(STORE(sample_rate_on), p.sound, 0, (unsigned)on);
    ((void (*)(uint32_t, void *))*(uint32_t *)(*(uint32_t *)p.wrapper + NOTIFY_OF_WRAPPER))(p.wrapper, &info);
    fin = *(short *)(p.sound + LIVE_SOUND_FIN);
    if (on && fin == STOP)
        PARAM_SET(PARAM_TARGET(p.project, p.track, 0), ID_FIN, FULL, p.track, 1, 1);
    else if (!on && fin >= FULL)
        PARAM_SET(PARAM_TARGET(p.project, p.track, 0), ID_FIN, STOP, p.track, 1, 1);
    VIEW_INVALIDATE((char *)*menu + 56);
}

// The SOUND SETTINGS row. core_additem builds it from four callbacks, each
// called as its std::function's invoker: the first argument is the function's
// payload, which holds the menu for select and change.
extern void sample_rate_row_label(void);
extern void core_additem(void *menu, const void *row);

static void row_select(void **menu, void *item)
{
    (void)item;
    set_on(menu, !sample_rate_selected());
}

static void row_draw(void **menu, void *item, void *bitmap, int x, int y)
{
    (void)menu;
    (void)item;
    DRAW_TEXT(bitmap, (const void *)FONT_AT, x + 19, y + 2, 2, 0, 0, sample_rate_selected() ? "ON" : "OFF");
}

static void row_change(void **menu, void *item, int dir)
{
    (void)item;
    if (dir)
        set_on(menu, dir > 0);
}

static const void *const row[4] = {
    (const void *)sample_rate_row_label, (const void *)row_select,
    (const void *)row_draw, (const void *)row_change,
};

void sample_rate_add_row(void *menu)
{
    core_additem(menu, row);
}

// FIN's value on the knob while it is RATE: its raw 0..127, as the Octatrack's
static int value_text(struct core_text *t)
{
    int v = t->value >> 8;
    char *s = t->buf;
    if (!sample_rate_selected())
        return CORE_TEXT_PASS;
    if (v < 0)
        v = 0;
    if (v > 127)
        v = 127;
    if (v >= 100)
        *s++ = '1';
    if (v >= 10)
        *s++ = (char)('0' + v / 10 % 10);
    *s++ = (char)('0' + v % 10);
    *s = 0;
    return CORE_TEXT_DONE;
}

const struct core_param sample_rate_param = {ID_FIN, ID_FIN, 0, 0, value_text};
