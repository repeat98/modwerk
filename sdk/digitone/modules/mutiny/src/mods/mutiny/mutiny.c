/* SPDX-License-Identifier: GPL-2.0-or-later */
/* MUTINY for the Digitone mk1 OS 1.44: one generative model per synth track. TRIG PARAMETERS on the
 * TRIG page opens the page; YES commits the page the sequencer keys are on, NO cancels the preview
 * or undoes the last commit. This file is the firmware glue; the engine and runtime are separate.
 */
#include "../../src/engine/engine.h"
#include "../../src/runtime/runtime.h"
#include "cmd.h"
#include "commit.h"
#include "digitone-mk1/core3.h"
#include "digitone-mk1/seq.h"
#include "hooks.h"
#include "input.h"
#include "page.h"
#include "playback.h"
#include "port144.h"
#include "storage.h"
#include "tick.h"
#include <stdint.h>

#define TRACKS MU_PORT_TRACKS /* the synth tracks */

#define SHOW_TICKS 120 /* 4 s at 30 Hz, as a stock page shows a turned knob's value */

/* The tracks */
static struct mu_rt rt;
static struct mu_playback pb;
static struct mu_commit undo[TRACKS];
static struct mu_input in;
static struct mu_cycle cyc[TRACKS];
static struct mu_evo evo[TRACKS];   /* one evolution pass per tick, bounded backlog */
static uint32_t passes[TRACKS];     /* TURI's evolve pass: only real playback boundaries */
static struct mu_base base[TRACKS]; /* the sound's own cutoff and level, read each UI tick */
static struct mu_len_memo
    len_memo[TRACKS]; /* the per-step LEN Mutiny wrote, for the next handover */
static struct mu_store save;
static struct mu_key seen[TRACKS];
static uint8_t seen_ok[TRACKS];
static uint8_t dirty[TRACKS]; /* render (and retry) at the next UI tick */
static uint8_t coalesced[TRACKS];
/* The tick's compile-time binding: no setup and no firmware pointer between passes. */
static struct mu_tick tick = {.rt = &rt,
                              .pb = &pb,
                              .save = &save,
                              .cyc = cyc,
                              .evo = evo,
                              .base = base,
                              .seen = seen,
                              .passes = passes,
                              .seen_ok = seen_ok,
                              .dirty = dirty,
                              .coalesced = coalesced};

/* The project */
static void copy(void *dst, const void *src, uint32_t n) {
    uint8_t *d = dst;
    const uint8_t *s = src;
    while (n--)
        *d++ = *s++;
}

/* A struct assignment would become a memcpy call, which the core does not export. */
static void take_recipe(struct mu_track *dst, const struct mu_track *src) {
    copy(dst, src, (uint32_t)sizeof *dst);
}

static void cmd_clear(void);

static void reset_all(void) {
    uint32_t t;
    mu_rt_init(&rt);
    mu_pb_init(&pb);
    mu_in_init(&in); /* held gestures, the held encoder and fractions start clean */
    for (t = 0; t < TRACKS; t++) {
        mu_cycle_reset(&cyc[t]);
        mu_evo_reset(&evo[t]);
        mu_len_memo_init(&len_memo[t]);
        passes[t] = 0;
        seen_ok[t] = 0;
        dirty[t] = 1;
        undo[t].valid = 0;
    }
    mu_store_defaults(&save);
    mu_tick_reset(&tick);
}

static void mut_loaded(int32_t found) {
    uint32_t t;
    /* Pointers can be reused by a different project: cancel pending writes unconditionally. */
    cmd_clear();
    if (!found) {
        reset_all();
        return;
    }
    if (!mu_store_decode(&rt, save.bytes, MU_STORE_BYTES))
        mu_store_defaults(&save);
    mu_pb_init(&pb);
    mu_in_init(&in);
    for (t = 0; t < TRACKS; t++) {
        mu_cycle_reset(&cyc[t]);
        mu_evo_reset(&evo[t]);
        mu_len_memo_init(&len_memo[t]);
        passes[t] = 0;
        seen_ok[t] = 0;
        dirty[t] = 1;
        undo[t].valid = 0;
    }
    mu_tick_reset(&tick);
}

const struct core_projdata mut_projdata = {0x4D555432u /* "MUT2" */, sizeof(save), &save,
                                           mut_loaded};

/* The step fire (interrupt level: read one published generation, nothing else) */
void mut_gen_trig(int32_t track, int32_t step, int32_t first, uint32_t *trig) {
    const struct mu_voice *v;
    if ((uint32_t)track >= TRACKS || (uint32_t)step >= MU_STEPS)
        return;
    mu_pb_latch(&pb, (uint8_t)track, first);
    v = mu_pb_step(&pb, (uint8_t)track, (uint32_t)step);
    if (!v)
        return;
    if (v->trig)
        *trig |= SQ_TRIG;
    else
        *trig &= ~SQ_TRIG;
}

/* A stored condition or probability must not gate a generated trig. */
void mut_fire_cond(int32_t track, int32_t step, int32_t *pass) {
    const struct mu_voice *v;
    if ((uint32_t)track >= TRACKS || (uint32_t)step >= MU_STEPS)
        return;
    v = mu_pb_step(&pb, (uint8_t)track, (uint32_t)step);
    if (v && v->trig)
        *pass = 1;
}

void mut_gen_notes(int32_t track, int32_t step, int32_t generated, int8_t notes[SQ_NOTES]) {
    const struct mu_voice *v;
    int32_t i;
    (void)generated;
    if ((uint32_t)track >= TRACKS || (uint32_t)step >= MU_STEPS)
        return;
    v = mu_pb_step(&pb, (uint8_t)track, (uint32_t)step);
    if (!v || !v->trig)
        return;
    notes[0] = (int8_t)v->note;
    for (i = 1; i < SQ_NOTES; i++)
        notes[i] = 0; /* the model plays single notes: drop a stored chord */
}

void mut_fire_vel(int32_t track, int32_t step, int32_t *vel) {
    const struct mu_voice *v;
    if ((uint32_t)track >= TRACKS || (uint32_t)step >= MU_STEPS)
        return;
    v = mu_pb_step(&pb, (uint8_t)track, (uint32_t)step);
    if (v && v->trig)
        *vel = v->vel;
}

int32_t mut_fire_locks(int32_t track, int32_t step, struct sq_lock *out, int32_t room) {
    const struct mu_voice *v;
    int32_t n;
    if ((uint32_t)track >= TRACKS || (uint32_t)step >= MU_STEPS || room < 1)
        return 0;
    v = mu_pb_step(&pb, (uint8_t)track, (uint32_t)step);
    if (!v || !v->trig)
        return 0;
    n = v->nlock < room ? (int32_t)v->nlock : room;
    for (int32_t i = 0; i < n; i++) {
        out[i].slot = v->slot[i];
        out[i].value = v->value[i];
    }
    return n;
}

/* TB3P's held gate: the LEN from the latched generation, never a control edited since. */
int32_t mut_on_len(int32_t track, int32_t step, int32_t len, const uint8_t *trk_data) {
    const struct mu_voice *v;
    if ((uint32_t)track >= TRACKS || (uint32_t)step >= MU_STEPS)
        return len;
    v = mu_pb_step(&pb, (uint8_t)track, (uint32_t)step);
    if (!v || !v->trig || !v->hold)
        return len;
    /* read-only on this path: a memo from another pattern simply carries no provenance */
    return mu_held_len(
        mu_held_base(len, (int8_t)trk_data[MU_PORT_TR_LEN_OFFSET], (uint32_t)step,
                     mu_len_memo_for(&len_memo[track],
                                     mu_port_buffer_guard()))); /* manual LEN, no compounding */
}

/* The device boundary (UI task).
 * The tick's only firmware reads. port144.c implements the adapter; tick.c keeps the copies and no
 * firmware pointer between passes. */

/* The clock and transport, read once, so evolution and the redraw signature agree. */
static void read_clock(struct mu_tick_clock *clock) {
    uint32_t t;
    clock->playing = (uint8_t)mu_port_playing();
    clock->hold_track = (uint8_t)(in.holding && in.h_track < TRACKS ? in.h_track : 0xff);
    for (t = 0; t < TRACKS; t++) {
        clock->last[t] = mu_port_clock_last(t);
        clock->parity[t] = mu_port_clock_parity(t);
    }
}

/* The page state */
static uint8_t open_page, page_track, sel_track;
static uint8_t touched = 0xff, shown;
static uint8_t kept, kept_page, roll;
static void *brain_pt; /* the key dispatcher's screen state */

/* Commands resolve in the UI tick after the pending renders and carry their own track and native
 * context, so a track selected in between never receives another track's write (see cmd.h). */
static struct mu_cmd keep_cmd, no_cmd;
static struct mu_gesture no_gesture;

static void cmd_clear(void) {
    mu_cmd_clear(&keep_cmd);
    mu_cmd_clear(&no_cmd);
    mu_gesture_end(&no_gesture);
}

static void mut_open(void *brain, void *ev, int32_t track) {
    (void)brain, (void)ev;
    cmd_clear(); /* a command from a previous visit never fires into this one */
    open_page = 1;
    page_track = (uint8_t)(track >= 0 && (uint32_t)track < TRACKS ? track : 0);
    sel_track = page_track;
    touched = 0xff;
    shown = 0;
    kept = 0;
}

const struct core_menu_item mut_menu = {"MUTINY", mut_open, 0, 0};

/* Keys whose press the page took: their release is the page's too, and no other release is. */
static uint64_t taken;

static int consume(uint32_t key, uint32_t fl) {
    uint64_t bit = (uint64_t)1 << (key & 63u);
    if (fl & MU_FLAG_PRESS)
        taken |= bit;
    else if (fl & MU_FLAG_RELEASE)
        taken &= ~bit;
    return 1;
}

static int generated_now(uint8_t t) { return rt.t[t].play == MU_PLAY_GENERATED && pb.on[t]; }

static int can_no(uint8_t t) { return rt.t[t].preview || rt.t[t].undo; }

int mut_key(void *brain, void *ev) {
    uint32_t key = mu_port_ev_code(ev), fl = mu_port_ev_flags(ev), act;
    uint8_t *tp;
    brain_pt = brain;
    tp = open_page ? &page_track : &sel_track;
    act = mu_in_key(&in, key, fl, open_page, tp, (uint8_t)mu_port_synth_track_active(),
                    generated_now(open_page ? page_track : sel_track));
    if (act & MU_ACT_SELECT) {
        sel_track = page_track;
        shown = 0;
        touched = 0xff;
        return 0; /* the stock selects the track too */
    }
    if (act & MU_ACT_CLOSE_PASS) {
        open_page = 0;
        cmd_clear(); /* nothing queued survives the page it belonged to */
        mu_in_release_all(&in);
        return 0;
    }
    if (act & MU_ACT_OPEN) {
        mut_open(brain, ev, sel_track);
        return consume(key, fl);
    }
    /* the NO press owns its context even though its action comes with the release */
    if (key == MU_KEY_NO && (fl & MU_FLAG_PRESS) && !(fl & MU_FLAG_REPEAT) && in.no_down &&
        in.no_track < TRACKS)
        mu_gesture_press(&no_gesture, mu_port_pattern(), mu_port_project(), in.no_track, 0);
    if (act & MU_ACT_COMMIT) {
        mu_cmd_arm(&keep_cmd, mu_port_pattern(), mu_port_project(), page_track, mu_port_page());
        return consume(key, fl);
    }
    if (act & MU_ACT_RESET) {
        mu_gesture_end(&no_gesture); /* a reset is not the cancel the press looked like */
        uint8_t knob = in.reset < MU_KNOBS ? in.reset : 0xff;
        uint8_t t = in.reset_track < TRACKS ? in.reset_track : 0xff;
        if (knob != 0xff && t != 0xff) {
            struct mu_rt_track *s = &rt.t[t]; /* the track the gesture formed on */
            uint8_t m = s->recipe.model;
            struct mu_track after;
            int32_t v = mu_knob_default(m, knob);
            take_recipe(&after, &s->recipe);
            if (knob == 0) {
                if ((uint8_t)v != m) {
                    mu_rt_select_model(s, (uint8_t)v);
                    dirty[t] = 1;
                }
            } else if (m && (uint8_t)v != s->recipe.p[m][knob - 1]) {
                after.p[m][knob - 1] = (uint8_t)v;
                mu_rt_edit(s, &after);
                dirty[t] = 1;
            }
            if (t == page_track) { /* the value readout belongs to the page's own track */
                touched = knob;
                shown = SHOW_TICKS;
                kept = 0;
            }
        }
        return consume(key, fl);
    }
    if (act & MU_ACT_CANCEL) {
        /* activate the press's own context; a pattern or project change since then ends it */
        if (!mu_gesture_release(&no_gesture, mu_port_pattern(), mu_port_project(), &no_cmd) ||
            no_cmd.track >= TRACKS || !can_no(no_cmd.track))
            mu_cmd_clear(&no_cmd); /* expired, or nothing of ours to cancel */
        return consume(key, fl);
    }
    if (key == MU_KEY_NO && !(fl & MU_FLAG_PRESS))
        mu_gesture_end(&no_gesture); /* the release ended without a cancel (a turn, a mute, ...) */
    if (act & MU_ACT_REROLL) {
        uint8_t t = in.h_track;
        if (t < TRACKS && rt.t[t].recipe.model) {
            struct mu_track after;
            take_recipe(&after, &rt.t[t].recipe);
            mu_reroll(&after);
            mu_rt_edit(&rt.t[t], &after);
            if (rt.t[t].recipe.model == MU_TB3P)
                roll = 15;
            dirty[t] = 1;
            touched = 7;
            shown = SHOW_TICKS;
            kept = 0;
        }
        return consume(key, fl);
    }
    if (act & (MU_ACT_HOLD | MU_ACT_HOLD_END)) {
        shown = 0; /* the title change is the redraw */
        return consume(key, fl);
    }
    if (act & MU_ACT_SELECT)
        return consume(key, fl);
    if (act & MU_ACT_TAKE)
        return consume(key, fl);
    return 0;
}

int mut_enc(void *brain, void *ev) {
    uint32_t e = mu_port_ev_code(ev), i;
    struct mu_rt_track *s;
    uint8_t m;
    int32_t d, lo, hi, v, per;
    (void)brain;
    if (!open_page || e < 1 || e > 8)
        return 0; /* LEVEL/DATA stays the Digitone's */
    i = e - 1;
    s = &rt.t[page_track];
    m = s->recipe.model;
    if (in.no_down)
        in.no_used = 1;                    /* encoder + NO is the stock reset, not our action */
    per = 4 * mu_knob_step(m, (uint8_t)i); /* 4 counts to a detent; a knob may take more */
    d = mu_in_detents(&in, (uint8_t)i, mu_port_ev_delta(ev), per, page_track, m);
    if (!d)
        return 1;
    if (d > 1 || d < -1)
        d *= mu_knob_fast(m, (uint8_t)i); /* a fast turn travels, as far as the knob allows */
    mu_in_turn_used(&in);
    touched = (uint8_t)i;
    shown = SHOW_TICKS;
    kept = 0;
    if (i == 0) {
        v = (int32_t)m + d;
        v = v < MU_OFF ? MU_OFF : v > MU_MODELS - 1 ? MU_MODELS - 1 : v;
        if ((uint8_t)v != m) {
            mu_rt_select_model(s, (uint8_t)v);
            dirty[page_track] = 1;
        }
        return 1;
    }
    if (m == MU_TB3P && i == 7) { /* SEED: the next or previous of the 65536 seeds */
        v = (int32_t)((uint32_t)mu_acid_seed(&s->recipe) + (uint32_t)d) & 0xffff;
        if ((uint16_t)v != mu_acid_seed(&s->recipe)) {
            struct mu_track after;
            take_recipe(&after, &s->recipe);
            mu_acid_set_seed(&after, (uint32_t)v);
            mu_rt_edit(s, &after);
            dirty[page_track] = 1;
        }
        return 1;
    }
    if (m) {
        struct mu_track after;
        lo = mu_knob_min(m, (uint8_t)i);
        hi = mu_knob_max(m, (uint8_t)i);
        v = (int32_t)s->recipe.p[m][i - 1];
        if (m == MU_EUCL && i == 2) /* HITS: down begins at the count it plays, up at the stored */
            v = mu_in_hits_start(v, (int32_t)mu_loop_len(m, s->recipe.p[m][0], &seen[page_track]),
                                 d);
        v += d;
        v = v < lo ? lo : v > hi ? hi : v;
        if ((uint8_t)v != s->recipe.p[m][i - 1]) {
            take_recipe(&after, &s->recipe);
            after.p[m][i - 1] = (uint8_t)v;
            mu_rt_edit(s, &after);
            dirty[page_track] = 1;
        }
    }
    return 1;
}

/* Drawing */
typedef int32_t (*text_fn)(void *bmp, const void *font, int32_t x, int32_t y, int32_t maxlen,
                           const char *fmt, ...);

static void c_fill(void *ctx, int32_t x0, int32_t y0, int32_t x1, int32_t y1, int32_t colour) {
    (void)ctx;
    fw_fillrect(ctx, x0, y0, x1, y1, colour);
}

static void c_frame(void *ctx, int32_t x0, int32_t y0, int32_t x1, int32_t y1, int32_t colour) {
    (void)ctx;
    fw_framerect(ctx, x0, y0, x1, y1, colour);
}

static void c_text(void *ctx, uint8_t font, int32_t x, int32_t y, const char *s) {
    const void *f = font == MU_FONT_TITLE   ? (const void *)fw_font_title
                    : font == MU_FONT_LABEL ? (const void *)fw_font_label
                                            : (const void *)fw_font5;
    ((text_fn)fw_textf)(ctx, f, x, y, -1, "%s", s);
}

static const struct mu_canvas canvas = {0, c_fill, c_frame, c_text};

static void page_state(struct mu_page_state *st) {
    struct mu_rt_track *s = &rt.t[page_track];
    const struct mu_key *key = mu_tick_key(&tick, page_track);
    struct mu_key fallback;
    const struct mu_preview *preview;
    int32_t len;
    uint32_t i;
    static const struct mu_page_state blank; /* zeros: no struct assignment on the target */
    copy(st, &blank, (uint32_t)sizeof *st);
    copy(&st->recipe, &s->recipe, (uint32_t)sizeof st->recipe);
    if (!key) {
        /* No observation: the fallback only keeps labels readable and never accepts a picture. */
        if (seen_ok[page_track]) {
            copy(&fallback, &seen[page_track], (uint32_t)sizeof fallback);
        } else {
            fallback.note = 60, fallback.root = 0xff, fallback.scale = -1, fallback.len = 0;
        }
        key = &fallback;
    }
    /* The tick prepared this before the frame; drawing only consumes it. An unseen edit leaves the
     * cells blank rather than showing the old recipe. */
    preview = mu_tick_current_preview(&tick, page_track, &st->recipe);
    if (preview)
        copy(&st->preview, preview, (uint32_t)sizeof st->preview);
    for (i = 0; i < MU_KNOBS; i++)
        st->value[i] = i ? s->recipe.p[s->recipe.model][i - 1] : s->recipe.model;
    st->pages = 1;
    st->scale = key->scale;
    st->visible = open_page;
    st->play = s->play;
    st->undo = s->undo;
    st->touched = touched;
    st->shown = shown != 0;
    st->kept = kept;
    st->kept_page = kept_page;
    st->key_page = (uint8_t)(mu_port_page() & 3u);
    st->holding = in.holding;
    st->overload = evo[page_track].desync;
    st->seed = mu_acid_seed(&s->recipe);
    st->roll = (int8_t)roll;
    len = mu_tick_track_len(&tick, page_track);
    if (len >= 0) {
        st->track_len = (uint8_t)(len > 64 ? 64 : len);
        if (len > 16)
            st->pages = (uint32_t)(len + 15) / 16;
        st->playing = (uint8_t)mu_port_playing();
        if (st->playing && mu_port_clock_last(page_track) != SQ_CLOCK_NONE &&
            mu_port_clock_last(page_track) < (uint32_t)len) {
            st->page = (uint8_t)(mu_port_clock_last(page_track) / 16u);
            st->step = (uint8_t)(mu_port_clock_last(page_track) % 16u);
        }
    }
}

void mut_draw(void *bmp, void *ctrl) {
    struct mu_page_state st;
    (void)ctrl;
    if (!open_page)
        return;
    page_state(&st);
    {
        struct mu_canvas cv;
        cv.ctx = bmp;
        cv.fill = canvas.fill;
        cv.frame = canvas.frame;
        cv.text = canvas.text;
        mu_page_draw(&cv, &st);
    }
}

/* The trig keys */
#define LED_ON 2 /* mode: lit in the colour; 1 is off */
#define LED_OFF 1
#define COL_WHITE 20  /* the stock palette: the playhead */
#define COL_RED 3     /* a note trig */
#define COL_DIM 4     /* half red */
#define COL_YELLOW 23 /* a note slid into (TB3P) */

void mut_leds(void *mgr) {
    struct mu_track_info info;
    uint32_t i, last = 0, page = 0, step = 0;
    uint8_t playing = 0, keys[16];
    if (!open_page || in.func || !pb.on[page_track])
        return; /* with FUNC held the stock's green mute colours are the ones to show */
    if (mu_dev_track_info(page_track, &info) != 0)
        return;
    page = mu_port_page();
    if (page > 3u)
        page = 0;
    last = mu_port_clock_last(page_track);
    if (mu_port_playing() && last != SQ_CLOCK_NONE && last < (uint32_t)info.len &&
        last / 16u == page) {
        playing = 1;
        step = last % 16u;
    }
    mu_pb_keys(&pb, page_track, (uint8_t)page, (uint32_t)info.len, playing, (uint8_t)step, keys);
    for (i = 0; i < 16; i++) {
        int32_t colour;
        if (!keys[i]) {
            mu_port_led_set(mgr, (int32_t)i + 1, LED_OFF, 0);
            continue;
        }
        colour = keys[i] == 4   ? COL_WHITE
                 : keys[i] == 5 ? COL_YELLOW
                 : keys[i] == 3 ? COL_RED
                                : COL_DIM;
        mu_port_led_set(mgr, (int32_t)i + 1, LED_ON, colour);
    }
}

/* Commit and undo (UI task) */
static int do_commit(uint8_t t, uint8_t page) {
    static struct mu_native plan; /* 11 KB: not on the UI task's stack */
    struct mu_port_native native;
    struct mu_device dev;
    struct mu_track_info info;
    const struct mu_snapshot *snap;
    uint32_t first, len;
    if (!mu_port_native_ready(&native, &dev, t))
        return 0;
    if (rt.t[t].play != MU_PLAY_GENERATED || !pb.on[t] || mu_tick_dirty(&tick, t))
        return 0; /* an unrendered edit would commit a generation the recipe no longer matches */
    if (mu_dev_track_info((int32_t)t, &info) != 0 || info.len < 1)
        return 0;
    if (!mu_commit_page(page, info.len, &first, &len))
        return 0;
    snap = &pb.buf[t][pb.cur[t]];
    if (!snap->valid || (uint32_t)snap->gen != pb.gen[t])
        return 0;
    if (!mu_commit_prepare(&dev, &undo[t], snap->step, first, len, &plan, &len_memo[t]))
        return 0;
    if (!mu_commit_apply(&dev, &undo[t], &plan))
        return 0;
    kept_page = page;
    mu_rt_committed(&rt.t[t]);
    mu_pb_off(&pb, (uint8_t)t);
    dirty[t] = 1;
    return 1;
}

static int do_no(uint8_t t) {
    struct mu_port_native native;
    struct mu_device dev;
    if (rt.t[t].preview)
        return mu_rt_cancel(&rt.t[t]);
    if (!rt.t[t].undo || !undo[t].valid)
        return 0;
    mu_port_native_device(&native, &dev, t);
    if (!mu_commit_undo(&dev, &undo[t]))
        return 0;
    return mu_rt_uncommit(&rt.t[t]);
}

/* A sound's FREQ/VOL move republishes the accent locks of a generating track, and nothing else. */

void mut_tick(void *ctrl) {
    static uint32_t sig;
    struct mu_tick_clock clock;
    uint32_t h, rearm;
    uint32_t act = mu_in_tick(&in, rt.t[in.h_down ? in.h_track : page_track].recipe.model);
    read_clock(&clock);
    if (act & MU_ACT_MENU) { /* the core's Mod Menu is over the page: hand the screen back */
        open_page = 0;
        cmd_clear();
        mu_in_release_all(&in);
    }
    if (act)
        shown = 0; /* the title changes: redraw */
    if (shown)
        shown--;
    if (roll)
        roll--;
    if (open_page && brain_pt && mu_port_overlay_open(brain_pt)) {
        open_page = 0; /* a menu or a browser is over the pages: hand the screen back */
        cmd_clear();
    }
    /* One observation per relevant track, every pending render, at most one evolution pass. */
    rearm = mu_tick_run(&tick, &clock, page_track);
    if (rearm)
        sq_rearm(rearm);
    /* after the pending render, so YES commits the generation the recipe describes */
    if (keep_cmd.req) {
        uint8_t t = keep_cmd.track;
        int live = t < TRACKS && mu_cmd_holds(&keep_cmd, mu_port_pattern(), mu_port_project());
        int ok = live && do_commit(t, keep_cmd.page);
        keep_cmd.req = 0;
        if (t == page_track) { /* the status line describes the page's own track */
            kept = ok ? 1 : (live && rt.t[t].play == MU_PLAY_GENERATED) ? 2 : 0;
            if (!ok)
                kept_page = 0;
            touched = 0xff;
            shown = SHOW_TICKS;
        }
    }
    if (no_cmd.req) {
        uint8_t t = no_cmd.track;
        int live = t < TRACKS && mu_cmd_holds(&no_cmd, mu_port_pattern(), mu_port_project());
        int ok = live && do_no(t);
        no_cmd.req = 0;
        if (ok) {
            dirty[t] = 1;
            if (t == page_track) {
                kept = 0;
                shown = SHOW_TICKS;
            }
        }
    }
    /* One preview preparation, after the commands and only while the page is visible. */
    mu_tick_prepare(&tick, page_track, open_page);
    /* one serialization for this batch's final semantic state, after any command that changed it */
    mu_tick_flush(&tick);
    h = (uint32_t)(open_page | page_track << 1 | (touched + 1u) << 4 | in.holding << 14 |
                   (shown != 0) << 15 | (uint32_t)kept << 16 | (uint32_t)roll << 18 |
                   (uint32_t)coalesced[page_track] << 26 | (uint32_t)evo[page_track].desync << 27);
    if (open_page) {
        uint32_t i, m = rt.t[page_track].recipe.model;
        h = h * 31u + m;
        for (i = 0; i < MU_PARAMS; i++)
            h = h * 31u + rt.t[page_track].recipe.p[m][i];
        h = h * 31u + mu_acid_seed(&rt.t[page_track].recipe);
        for (i = 0; i < MU_SRC; i++)
            h = h * 31u + rt.t[page_track].recipe.src.g[i] + 7u * rt.t[page_track].recipe.src.p[i] +
                13u * rt.t[page_track].recipe.src.a[i];
        h = h * 31u + pb.gen[page_track];
        h = h * 31u + (uint32_t)rt.t[page_track].play + 3u * rt.t[page_track].preview +
            5u * rt.t[page_track].undo;
        if (mu_tick_observed(&tick, page_track))
            h = h * 31u + (uint32_t)(mu_tick_track_len(&tick, page_track) + 15) / 16u;
        h = h * 31u + (uint32_t)(clock.playing ? clock.last[page_track] / 16u : 0u);
        h = h * 31u + mu_port_page();
    }
    if (shown == 0 && kept && rt.t[page_track].play == MU_PLAY_NATIVE)
        kept = 0; /* the commit's message is transient; the title carries the state afterwards */
    if (h != sig) {
        sig = h;
        mu_port_request_redraw(ctrl); /* a redraw */
    }
}
