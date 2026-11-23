/* SPDX-License-Identifier: GPL-3.0-or-later
 * Track-local SRC, ARR Meta, and modal editing input callbacks. Included by
 * the module after its platform and sequencer adapters are defined.
 */
/* Stock can close its popup on key-down. Keep repeats and release with it. */
static uint32_t popup_keys[2];

int module_key(int code, int pressed)
{
    /* Revision 2 of the private bus offers an early copy of each event.
     * Opening ARR still goes through the ordinary base shortcut ordering. */
    check_src_context();
    int early = !!(code & 0x100);
    code &= ~0x100;
    if ((unsigned)code >= 64)
        return !stock_window() && (visible || locked);
    unsigned i = (unsigned)code >> 5;
    uint32_t bit = 1u << ((unsigned)code & 31u);
    if (!pressed) {
        unsigned taken = consumed[i] & bit;
        consumed[i] &= ~bit;
        popup_keys[i] &= ~bit;
        return !!taken;
    }
    if (consumed[i] & bit)
        return 1;
    if (stock_window()) {
        popup_keys[i] |= bit;
        return 0;
    }
    if ((popup_keys[i] & bit) || (early && !visible && !locked))
        return 0;
    if (visible && !src_list && clyps_meta_track_key((unsigned)code))
        return 0;
    if (code == PLAY || code == STOP) {
        if ((locked || visible) && !alone(code)) {
            consumed[i] |= bit;
            return 1;
        }
        if (code == STOP) {
            unsigned sr = critical();
            requested = playing;
            pending_row = 0;
            restore(sr);
        }
        return 0;
    }
    if (locked) {
        consumed[i] |= bit;
        if (!stock_window() && code == ARR && alone(ARR)) {
            locked = 0;
            visible = 1;
            row_view = armed = 0;
        } else if (code == YES && !RUNNING && alone(YES) && supported()) {
            /* Explicit handoff: both current and pending sources are home
             * before any subsequent input can reach a native edit handler. */
            requested = playing = last_row = pending_row = 0;
            locked = visible = armed = 0;
        }
        redraw();
        return 1;
    }
    if (!visible && (code != ARR || ARRANGER || GRID_REC || LIVE_REC || REC_HELD ||
                     stock_window() || BYTE(0x80000015u)))
        return 0;
    if (!visible && code == ARR && !alone(ARR)) return 0;
    consumed[i] |= bit;
    if (visible && !alone(code)) return 1;
    missing = 0;
    if (src_list) {
        if (code == YES) submit_lane(track, src_cursor);
        else if (code == ARR) src_list = 0;
        else if (code == NO || code == SRC) {
            src_list = visible = 0;
            locked = !!(playing || requested);
        }
        redraw();
        return 1;
    }
    if (editing) {
        if (code < 16) draft = (unsigned)code;
        if (code == NO) editing = 0;
        if (code == YES) {
            unsigned shift = 4*track;
            uint32_t refs = (rows[slot] & ~(15u << shift)) | (draft << shift);
            refused = !valid(refs);
            if (!refused) rows[slot] = refs;
            editing = 0;
        }
        redraw();
        return 1;
    }
    if (code == NO) {
        locked = !!(playing || requested);
        visible = armed = 0;
    } else if (code == ARR && !visible) {
        if (!alone(ARR) || GRID_REC || LIVE_REC || REC_HELD) {
            /* Leave the native editor in possession of its held releases. */
            return 1;
        }
        visible = 1;
        zoom = 0;
        row_view = armed = 0;
        refused = !supported();
    } else if (code == SRC && stock_src_available() && supported()) {
        unsigned selected = BYTE(0x100b14ccu);
        if (selected < TRACKS) {
            track = selected;
            src_cursor = (requested >> (4 * track)) & 15u;
            src_list = 1;
            row_view = armed = 0;
        }
    } else if (code == 0x1b) {  /* PAGE within the modal only */
        zoom ^= 1;
        armed = 0;
    } else if (code == ARR) {
        row_view ^= 1;
        armed = 0;
    } else if (row_view && code == YES) {
        if (zoom) {
            missing = !(defined & (1u<<slot));
            refused = !supported();
            if (!missing && !refused) {
                draft = (rows[slot] >> (4*track)) & 15u;
                editing = 1;
            }
        } else armed ^= 1;
    } else if (code < 16 && row_view) {
        focus_row((unsigned)code);
        if (armed) {
            armed = 0;
            refused = !valid(playing);
            if (!refused) {
                rows[slot] = playing;
                defined |= 1u << slot;
            }
        } else if (defined & (1u << slot)) {
            submit(rows[slot], slot+1);
        } else {
            missing = 1;
        }
    } else if (code < 16 && track < TRACKS) {
        submit_lane(track, (unsigned)code);
    }
    redraw();
    return 1;
}

int module_enc(int encoder, int delta)
{
    check_src_context();
    if (stock_window()) return 0;
    if (visible && !editing && (encoder & ~0x100) == 6 && alone(64)) {
        unsigned value = clyps_focus_step(src_list ? src_cursor : row_view ? slot : track,
                                          delta, src_list || row_view ? 15 : 7);
        if (src_list) src_cursor = value;
        else if (row_view) focus_row(value); else track = value;
        redraw();
    }
    return visible || locked;
}
