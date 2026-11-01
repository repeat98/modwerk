/* SPDX-License-Identifier: GPL-3.0-or-later */
#include <assert.h>
#include <stdio.h>
#include "../src/feedback.h"
static unsigned count, blocked, last_cc, last_value, last_channel;
static unsigned seen[12][7];
static int emit(unsigned ch, unsigned cc, unsigned value)
{
    unsigned p;
    if (blocked) return 0;
    assert(ch < 16 && cc < 128 && value < 128);
    last_cc = cc; last_value = value; last_channel = ch;
    for (p = 0; p < 7; ++p) if (cc == mf_cc[p] && ch < 12) ++seen[ch][p];
    ++count;
    return 1;
}
int main(void)
{
    struct mf_state s = {0};
    unsigned t, p, i;
    mf_reset(&s);
    assert(!mf_flush(&s, emit));
    for (t = 0; t < 12; ++t) for (p = 0; p < 7; ++p) mf_offer(&s,t,p,t,64);
    for (i = 0; i < 21; ++i) assert(mf_flush(&s,emit) == 4);
    assert(count == 84 && !mf_flush(&s,emit));
    for (t = 0; t < 12; ++t) for (p = 0; p < 7; ++p) assert(seen[t][p] == 1);
    /* Background refresh repeats every current assignment without moving
     * the round-robin cursor or discarding the last transmitted values.
     */
    mf_request_refresh(&s);
    for (i = 0; i < 21; ++i) assert(mf_flush(&s,emit) == 4);
    assert(count == 168 && !mf_flush(&s,emit));
    for (t = 0; t < 12; ++t) for (p = 0; p < 7; ++p) assert(seen[t][p] == 2);
    /* Even requests arriving on every tick keep later tracks reachable. */
    for (i = 0; i < 21; ++i) { mf_request_refresh(&s); assert(mf_flush(&s,emit) == 4); }
    for (t = 0; t < 12; ++t) for (p = 0; p < 7; ++p) assert(seen[t][p] == 3);
    /* Clear that deliberate backlog before testing ordinary edits. */
    for (i = 0; i < 21; ++i) mf_flush(&s,emit);
    /* A full wire queue retains the newest edit and sends it once later. */
    blocked = 1;
    mf_offer(&s,0,0,0,1);
    assert(!mf_flush(&s,emit));
    mf_offer(&s,0,0,0,127);
    assert(s.coalesced == 1 && s.deferred == 1);
    blocked = 0;
    assert(mf_flush(&s,emit) == 1 && last_cc == 95 && last_value == 127);
    assert(!mf_flush(&s,emit));
    /* Channel reassignment resends even when the parameter is unchanged. */
    mf_offer(&s,0,0,15,127);
    assert(mf_flush(&s,emit) == 1 && last_channel == 15);
    mf_offer(&s,0,0,16,0);
    assert(!mf_flush(&s,emit));
    mf_offer(&s,0,0,0,-10);
    assert(mf_flush(&s,emit) == 1 && last_value == 0);
    mf_offer(&s,0,0,0,999);
    assert(mf_flush(&s,emit) == 1 && last_value == 127);
    /* Edits that return to the last transmitted value need no feedback. */
    mf_offer(&s,0,0,0,2);
    mf_offer(&s,0,0,0,127);
    assert(!mf_flush(&s,emit));
    mf_reset(&s);
    assert(!mf_flush(&s,emit));
    puts("PASS: 84 assignments, automatic refresh, fair batching, backpressure, coalescing, channels, clamping, reset");
}
