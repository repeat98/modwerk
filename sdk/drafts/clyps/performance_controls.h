/* SPDX-License-Identifier: GPL-3.0-or-later
 * Private panel adapter. The sequencer owns playing, requested and row commits.
 * Reuse the stock timing boundary, the qualified input bus and the edit lock.
 */
enum { CAPTURE, CELL, RESTORE_HOME };
enum { UP = 0x33, DOWN = 0x20, LEFT = 0x34, RIGHT = 0x21, PAGE_KEY = 0x1b };
static uint32_t stock_edges[2];

static void open_view(enum panel_view target)
{
    view = target;
    visible = target != NATIVE;
    row_view = target == ROW;
    locked = !visible && !!(playing || requested);
    end_of_path = missing = refused = 0;
    if (target == CLIP)
        src_cursor = (requested >> (4 * track)) & 15;
}

static void performance_context(void)
{
    if (mode && (stock_window() || GRID_REC || LIVE_REC || REC_HELD ||
                 BYTE(0x80000015u) || !supported())) {
        mode = 0;
        open_view(NATIVE);
    }
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

static void setup_confirm(void)
{
    if (operation == RESTORE_HOME) {
        if (RUNNING) { refused = 1; return; }
        unsigned sr = critical();
        playing = requested = last_row = pending_row = 0;
        restore(sr);
    } else {
        uint32_t refs = playing;
        if (operation == CELL) {
            if (!(defined & (1u << slot))) { missing = 1; return; }
            unsigned shift = 4 * track;
            refs = (rows[slot] & ~(15u << shift)) | (draft << shift);
        }
        if (!valid(refs)) { refused = 1; return; }
        rows[slot] = refs;
        defined |= 1u << slot;
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
        unsigned sr = critical();
        requested = playing;
        pending_row = 0;
        restore(sr);
        return 0;
    }
    if (key == PLAY) return 0;
    if (locked) {
        if (alone(key) && key == ARR && supported()) {
            mode = 1;
            open_view(ROW);
        } else if (alone(key) && key == YES && !RUNNING && supported()) {
            requested = playing = last_row = pending_row = 0;
            mode = 0;
            open_view(NATIVE);
        }
        return 1;
    }
    if (!mode) {
        if (early || key != ARR || !alone(key) || !supported() ||
            GRID_REC || LIVE_REC || REC_HELD || BYTE(0x80000015u)) return 0;
        mode = 1;
        track = BYTE(0x100b14ccu) & 7;
        open_view(ROW);
        return 1;
    }
    if (key == 0x19 || key == 0x1a || key == 0x29 || key == 0x2d ||
        key == 0x2e || key == 0x2f || key == 0x35) {
        /* Yield the complete chord at home. Keep foreign native edits interlocked. */
        mode = 0;
        open_view(NATIVE);
        return locked;
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
        return locked;
    } else if (view == SETUP) {
        if (key == YES) setup_confirm();
        if (key == UP || key == DOWN)
            set_operation(clyps_focus_step(operation, key == UP ? -1 : 1, RESTORE_HOME));
        if (key < 16 && operation == CELL) draft = key;
    } else if (clyps_meta_track_key(key)) {
        track = key - 0x10;
        if (view == CLIP) open_view(CLIP);
        if (view == NATIVE) return 0;
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
            if (view == NATIVE) open_view(NATIVE);
        }
    } else if (key == YES && view == ROW) {
        advance_path();
    } else if (key == YES && view == CLIP) {
        submit_lane(track, src_cursor);
    } else if (view == ROW || view == CLIP) {
        int step = (key == UP || key == LEFT) ? -1 : 1;
        if (key == UP || key == DOWN || key == LEFT || key == RIGHT) {
            if (view == CLIP) src_cursor = clyps_focus_step(src_cursor, step, 15);
            else if (key == UP || key == DOWN) focus_row(clyps_focus_step(slot, step, 15));
            else track = clyps_focus_step(track, step, 7);
        }
    } else return 0;
    return 1;
}

int module_key(int code, int pressed)
{
    performance_context();
    int early = !!(code & 0x100);
    unsigned key = (unsigned)code & ~0x100u;
    if (key >= 64) return key == 64 && !stock_window() && (visible || locked);
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
    if (!visible) return locked && !stock_window();
    if (!alone(64)) return 1;
    unsigned knob = (unsigned)encoder & ~0x100u;
    if (view == ROW && knob == 6) focus_row(clyps_focus_step(slot, delta, 15));
    if (view == CLIP && knob == 6) src_cursor = clyps_focus_step(src_cursor, delta, 15);
    if (view == SETUP && knob == 0 && operation == CELL)
        draft = clyps_focus_step(draft, delta, 15);
    redraw();
    return 1;
}
