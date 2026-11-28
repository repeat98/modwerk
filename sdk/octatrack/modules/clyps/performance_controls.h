/* SPDX-License-Identifier: GPL-3.0-or-later
 * Private panel adapter. The sequencer owns playing, requested and row commits.
 * Reuse the stock timing boundary, the qualified input bus and the edit lock.
 */
enum { CAPTURE, CELL, RESTORE_HOME };
enum { UP = 0x33, DOWN = 0x20, LEFT = 0x34, RIGHT = 0x21, PAGE_KEY = 0x1b };
enum { SCENE_A = 0x19, SCENE_B = 0x1a, LEVEL_KNOB = 6 };
enum { TEMPO_KEY = 0x18, FUNC_KEY = 0x2d };
#define STOCK_TRACK (BYTE(0x100b14ccu) & 7u)   /* the track the stock tabs highlight */
static uint32_t stock_edges[2];

/* Physical rows hold exactly the keys a and b, nothing else (a held modifier included). */
static int pair(unsigned a, unsigned b)
{
    for (unsigned row = 0; row < 8; ++row) {
        unsigned allowed = (row == a / 8 ? 1u << (a % 8) : 0) | (row == b / 8 ? 1u << (b % 8) : 0);
        if (BYTE(0x46100b18u + row) & ~allowed)
            return 0;
    }
    return 1;
}

static int held(unsigned key)
{
    return !!(BYTE(0x46100b18u + key / 8) & (1u << (key % 8)));
}

/* The one track key held together with `key`, or TRACKS. */
static unsigned held_track(unsigned key)
{
    for (unsigned t = 0; t < TRACKS; ++t)
        if (held(0x10 + t) && pair(key, 0x10 + t))
            return t;
    return TRACKS;
}

/* Scene A/B alone, or a trig while one scene key is held: stock scene selection (D33). */
static int scene_gesture(unsigned key)
{
    if (key == SCENE_A || key == SCENE_B) return alone(key);
    return key < 16 && ((held(SCENE_A) && pair(key, SCENE_A)) || (held(SCENE_B) && pair(key, SCENE_B)));
}

/* Selective Edit Lock (D33): while CLYPS sources play, the stock page edits the home pattern.
 * Part sound (pages, tracks, scenes, crossfader, plain encoder turns) stays free; trigs, locks,
 * recording, FUNC chords and pattern, part or bank changes stay held. */
static int sound_key(unsigned key)
{
    if (scene_gesture(key)) return 1;
    return alone(key) && ((key >= SRC && key <= SRC + 4) || clyps_meta_track_key(key));
}

/* FUNC + TRACK is the stock mute (D36.01, R1): the pair always reaches the stock. */
static int mute_gesture(unsigned key)
{
    return clyps_meta_track_key(key) && held(FUNC_KEY) && pair(key, FUNC_KEY);
}

/* Track focus is the stock selection (D33): TRACK keys reach the stock, CLYPS reads it back.
 * FUNC + LEVEL may move the Panorama column on its own (D36.01); the next stock track change
 * takes the focus back, and Clip View always shows the stock track. */
static void follow_track(void)
{
    unsigned t = STOCK_TRACK;
    if (t == seen_stock) return;
    seen_stock = t;
    if (t == track) return;
    track = t;
    if (view == CLIP) src_cursor = (requested >> (4 * t)) & 15;
}

static void open_view(enum panel_view target)
{
    if (target == NATIVE && view != NATIVE) mem_track = track;
    if (target == CLIP) { track = seen_stock = STOCK_TRACK; }
    if (target != NATIVE && view == NATIVE) occupancy_all();
    if (target == ROW || target == CLIP) last_view = target;
    view = target;
    visible = target != NATIVE;
    row_view = target == ROW;
    locked = !visible && !!(playing || requested);
    end_of_path = missing = refused = lock_note = 0;
    if (target == CLIP)
        src_cursor = (requested >> (4 * track)) & 15;
}

/* View memory (D33, RAM only): back from the stock pages to the same view and Clip focus. */
static void resume_view(void)
{
    unsigned keep = src_cursor, same = STOCK_TRACK == mem_track;
    track = STOCK_TRACK;
    open_view(last_view);
    if (last_view == CLIP && same) src_cursor = keep;
}

static void performance_context(void)
{
    /* A stock popup (TEMPO, a toast, a dialog) only suspends CLYPS: it keeps its view, its
     * setup and every pending request, gives the popup every key and encoder, draws nothing
     * while it is open and comes back when it closes (D43.04, Jannik 22/11 on Row Edit). */
    if (mode && (GRID_REC || LIVE_REC || REC_HELD || BYTE(0x80000015u) || !supported())) {
        mode = 0;
        open_view(NATIVE);
    }
    if (mode && view != SETUP && !stock_window()) follow_track();
}

static void cancel_pending(void)
{
    unsigned sr = critical();
    requested = playing;
    org_req[0] = org_play[0];
    org_req[1] = org_play[1];
    pending_row = 0;
    restore(sr);
}

static void go_home(void)
{
    unsigned sr = critical();
    playing = requested = last_row = pending_row = 0;
    ORIGIN_CLEAR();
    restore(sr);
}

static void advance_path(void)
{
    if (pending_row) return;
    /* last_row is one-based; it is the zero-based index of the next slot. */
    for (unsigned index = last_row; index < 16; ++index) {
        if (defined & (1u << index)) {
            submit(rows[index], index + 1);
            return;
        }
    }
    end_of_path = 1;
}

/* Cell Launch (D33): one lane takes its source from Row n. The path position, the other lanes
 * and the stored Row stay as they are; the stock wrap commits it like any request. */
static void cell_launch(unsigned lane, unsigned n)
{
    end_of_path = 0;
    missing = !(defined & (1u << n));
    if (missing) return;
    unsigned shift = 4 * lane;
    submit_from((requested & ~(15u << shift)) | (rows[n] & (15u << shift)), 0, lane, n + 1);
}

static void setup_confirm(void)
{
    if (operation == RESTORE_HOME) {
        if (RUNNING) { refused = 1; return; }
        go_home();
    } else {
        uint32_t refs = playing;
        if (operation == CELL) {
            if (!(defined & (1u << slot))) { missing = 1; return; }
            unsigned shift = 4 * track;
            refs = (rows[slot] & ~(15u << shift)) | (draft << shift);
        }
        if (!valid(refs)) { refused = 1; return; }
        unsigned sr = critical();
        if (bank_uncertain) {
            restore(sr);
            refused = 1;
            return;
        }
        rows[slot] = refs;
        defined |= 1u << slot;
        /* A lane that came from the edited cell no longer matches it. */
        if (operation == CELL) {
            if (origin(org_play, track) == slot + 1) set_origin(org_play, track, 0);
            if (origin(org_req, track) == slot + 1) set_origin(org_req, track, 0);
        }
        restore(sr);
    }
    open_view(ROW);
}

static void set_operation(unsigned choice)
{
    operation = choice;
    draft = (rows[slot] >> (4 * track)) & 15;
}

static int performance_press(unsigned key, int early)
{
    if (key == STOP) {
        cancel_pending();
        return 0;
    }
    if (key == PLAY) return 0;
    /* FUNC is a modifier and never leaves CLYPS (D43.03); FUNC + TRACK mutes (R1 native mutes);
     * TEMPO opens the stock tempo popup on the stock clock (D43.04). None of them edits a
     * sequence, so they reach the stock in every view and under the edit lock. */
    if (key == FUNC_KEY || mute_gesture(key) || (key == TEMPO_KEY && alone(key))) {
        if (locked && lock_note) { lock_note = 0; redraw(); }
        return 0;
    }
    if (locked) {
        if (alone(key) && key == ARR && supported()) {
            mode = 1;
            resume_view();
        } else if (alone(key) && key == YES && !RUNNING && supported()) {
            go_home();
            mode = 0;
            open_view(NATIVE);
        } else if (sound_key(key)) {
            if (lock_note) { lock_note = 0; redraw(); }
            return 0;
        } else lock_note = 1;
        return 1;
    }
    if (!mode) {
        if (early || key != ARR || !alone(key) || !supported() ||
            GRID_REC || LIVE_REC || REC_HELD || BYTE(0x80000015u)) return 0;
        mode = 1;
        resume_view();
        return 1;
    }
    if (key == 0x29 || key == 0x2e || key == 0x2f || key == 0x35) {
        /* REC, PATTERN, BANK and MIDI open their stock modes: yield the complete chord at home.
         * Keep foreign native edits interlocked. */
        mode = 0;
        open_view(NATIVE);
        return locked;
    }
    if (view != SETUP && scene_gesture(key)) return 0;   /* Scenes stay live under CLYPS */
    if (key < 16 && view != SETUP) {
        unsigned lane = held_track(key);
        if (lane < TRACKS) {                              /* TRACK first, then TRIG */
            if (view == ROW) cell_launch(lane, key);
            else if (view == CLIP) { submit_lane(lane, key); if (lane == track && !refused) src_cursor = key; }
            return view != NATIVE;
        }
    }
    if (!alone(key)) return visible;
    if (key == ARR) {
        open_view(view == ROW ? CLIP : ROW);
    } else if (key == NO) {
        if (view == SETUP) open_view(ROW);
        else {
            if (view == NATIVE) mode = 0;
            open_view(NATIVE);
        }
    } else if (key >= SRC && key <= SRC + 4 && view != SETUP) {
        open_view(NATIVE);
        return 0;                                         /* the sound page opens, lock or not */
    } else if (view == SETUP) {
        if (key == YES) setup_confirm();
        if (key == UP || key == DOWN)
            set_operation(clyps_focus_step(operation, key == UP ? -1 : 1, RESTORE_HOME));
        if (key < 16 && operation == CELL) draft = key;
    } else if (clyps_meta_track_key(key)) {
        /* The stock selects and CLYPS follows. The key also takes the Panorama column back
         * when FUNC + LEVEL moved it away from a stock track that does not change. */
        track = key - 0x10;
        return 0;
    } else if (view == ROW && key == PAGE_KEY) {
        open_view(SETUP);
        set_operation(CAPTURE);
    } else if (key < 16) {
        if (view == ROW) {
            end_of_path = 0;
            missing = !(defined & (1u << key));
            if (!missing) submit(rows[key], key + 1);
        } else {
            submit_lane(track, key);
            /* The hand that launched is where the eye looks: focus follows a TRIG launch. */
            if (view == CLIP && !refused) src_cursor = key;
            if (view == NATIVE) open_view(NATIVE);
        }
    } else if (key == YES && view == ROW) {
        advance_path();
    } else if (key == YES && view == CLIP) {
        submit_lane(track, src_cursor);
    } else if (view == ROW || view == CLIP) {
        /* Panorama columns follow the TRACK keys only, so LEFT/RIGHT cannot split the
         * CLYPS focus from the stock tab. */
        int step = (key == UP || key == LEFT) ? -1 : 1;
        if (view == CLIP && (key == UP || key == DOWN || key == LEFT || key == RIGHT))
            src_cursor = clyps_focus_step(src_cursor, step, 15);
        else if (view == ROW && (key == UP || key == DOWN))
            focus_row(clyps_focus_step(slot, step, 15));
    } else return 0;
    return 1;
}

int module_key(int code, int pressed)
{
    performance_context();
    int early = !!(code & 0x100);
    unsigned key = (unsigned)code & ~0x100u;
    if (key >= 64) return 0;               /* crossfader: always the stock's (D33) */
    unsigned word = key >> 5;
    uint32_t bit = 1u << (key & 31);
    if (!pressed) {
        int owned = !!(consumed[word] & bit);
        consumed[word] &= ~bit;
        stock_edges[word] &= ~bit;
        return owned;
    }
    if (consumed[word] & bit) return 1;
    if (stock_window()) stock_edges[word] |= bit;
    if (stock_edges[word] & bit) return 0;
    if (!performance_press(key, early)) return 0;
    consumed[word] |= bit;
    redraw();
    return 1;
}

int module_enc(int encoder, int delta)
{
    performance_context();
    if (stock_window()) return 0;          /* the TEMPO popup or a dialog owns the encoders */
    if (!visible) {
        if (!locked) return 0;
        /* A plain turn (with FUNC, a fine turn; with a scene key, a scene lock) edits the Part.
         * With a trig held it would write a lock into the home pattern. */
        if ((alone(64) || alone(FUNC_KEY) || alone(SCENE_A) || alone(SCENE_B)) && !GRID_REC && !LIVE_REC && !REC_HELD) {
            if (lock_note) { lock_note = 0; redraw(); }
            return 0;
        }
        lock_note = 1;
        redraw();
        return 1;
    }
    unsigned knob = (unsigned)encoder & ~0x100u;
    /* FUNC + LEVEL moves the Panorama column (D36.01). Focus only: no launch, no source. */
    if (view == ROW && knob == LEVEL_KNOB && held(FUNC_KEY) && alone(FUNC_KEY)) {
        track = clyps_focus_step(track, delta, TRACKS - 1);
        redraw();
        return 1;
    }
    if (!alone(64)) return 1;
    /* LEVEL navigates only: it never launches (D33). */
    if (view == ROW && knob == LEVEL_KNOB) focus_row(clyps_focus_step(slot, delta, 15));
    if (view == CLIP && knob == LEVEL_KNOB) src_cursor = clyps_focus_step(src_cursor, delta, 15);
    if (view == SETUP && knob == LEVEL_KNOB) set_operation(clyps_focus_step(operation, delta, RESTORE_HOME));
    if (view == SETUP && knob == 0 && operation == CELL)
        draft = clyps_focus_step(draft, delta, 15);
    redraw();
    return 1;
}
