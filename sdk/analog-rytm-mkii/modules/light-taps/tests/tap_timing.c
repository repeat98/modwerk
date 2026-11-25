// SPDX-License-Identifier: GPL-3.0-or-later
// Host test of Light Taps' timing: src/main.c's light_taps_event and
// light_taps_poll, compiled for this computer with the panel driver's four
// addresses replaced. test_tap_timing.py builds and runs it; each case prints
// "ok NAME" or "FAIL NAME: why", and the exit status counts the failures.

#include <stdio.h>
#include <string.h>

#define LIGHT_TAPS_HOST
static int strike_codes[12] = {0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11};
static int queue, posts, last_code, last_velocity, last_type;
static unsigned host_now;
static void host_post(void *q, void *event)
{
    unsigned char *e = event;
    if (q != &queue)
        return;
    posts++;
    last_type = e[0];
    memcpy(&last_code, e + 4, sizeof last_code);
    last_velocity = e[8];
}
#define QUEUE ((void *)&queue)
#define STRIKE_CODE(pad) (strike_codes[pad])
#define NOW host_now
#define POST host_post

#include "../src/main.c"

static int failures;

static void reset(unsigned start)
{
    memset((void *)waiting, 0, sizeof waiting);
    memset((void *)recent, 0, sizeof recent);
    memset((void *)held, 0, sizeof held);
    memset((void *)releases_seen, 0, sizeof releases_seen);
    ms = start;
    posts = last_code = last_velocity = last_type = 0;
    on = 1;
}

static void tick(unsigned n)
{
    while (n--)
        light_taps_poll();
}

static void press(int pad)
{
    char ev[16] = {0};
    int code = PAD_KEY + pad;
    memcpy(ev + 4, &code, sizeof code);
    ev[11] = 1;                     // the flags long's low byte: pressed
    light_taps_event(ev);
}

static void release(int pad)
{
    char ev[16] = {0};
    int code = PAD_KEY + pad;
    memcpy(ev + 4, &code, sizeof code);
    light_taps_event(ev);           // pressed bit clear
}

static void strike(int pad)
{
    char ev[16] = {0};
    ev[0] = 3;
    memcpy(ev + 4, &strike_codes[pad], sizeof strike_codes[pad]);
    ev[8] = 100;
    light_taps_event(ev);
}

static void expect(const char *name, int wanted)
{
    if (posts == wanted)
        printf("ok %s\n", name);
    else {
        printf("FAIL %s: %d light taps posted, wanted %d\n", name, posts, wanted);
        failures++;
    }
}

int main(void)
{
    reset(100);
    press(6);
    tick(2);
    expect("no light tap before 3 ms", 0);
    tick(1);
    expect("a light tap 3 ms after a press with no strike", 1);
    if (last_type != 3 || last_code != 6 || last_velocity != TAP_VELOCITY) {
        printf("FAIL the light tap's record: type %d code %d velocity %d\n", last_type, last_code, last_velocity);
        failures++;
    } else
        printf("ok the light tap's record: a strike for pad 6 at velocity %d\n", TAP_VELOCITY);

    reset(100);
    press(6);
    strike(6);
    tick(10);
    expect("a firm hit, press then strike: no light tap", 0);

    reset(100);
    strike(6);
    tick(2);
    press(6);
    tick(10);
    expect("a firm hit, strike 2 ms before its press: no light tap", 0);

    reset(100);
    strike(6);
    tick(10);
    press(6);
    tick(3);
    expect("a fresh light tap 10 ms after a firm hit", 1);

    // The maintainer's case: a genuine strike just before the panel counter's
    // 4096 ms wrap, then a fresh light tap a full wrap later, which the 12-bit
    // stamps took for a press 0-3 ms after the strike.
    reset(4094);
    strike(6);
    tick(4096);
    press(6);
    tick(3);
    expect("a strike just before the 4096 ms wrap, a fresh light tap a full wrap later", 1);

    reset(100);
    strike(6);
    tick(4096 * 3 + 1);
    press(6);
    tick(3);
    expect("a fresh light tap three wraps and 1 ms after a strike", 1);

    // Across this count's own wrap, after about 49 days.
    reset(0xfffffffeu);
    strike(6);
    tick(3);
    press(6);
    tick(10);
    expect("a strike 3 ms before the count's own wrap, its press after it: no light tap", 0);
    tick(100);
    press(6);
    tick(3);
    expect("a fresh light tap after the count's own wrap", 1);

    reset(100);
    on = 0;
    press(6);
    tick(10);
    expect("LIGHT TAPS off: no light tap", 0);

    reset(100);
    press(3);
    press(9);
    tick(3);
    expect("two pads tapped together: two light taps", 2);

    reset(100);
    press(5);
    tick(3);
    release(5);
    press(5);
    tick(5);
    for (int r = 0; r < 20; r++) {  // held for two seconds; the panel repeats the key
        press(5);
        tick(100);
    }
    release(5);
    expect("a held light tap: one soft hit, key repeats ignored", 2);

    reset(100);
    press(5);
    strike(5);
    tick(5);
    release(5);
    press(5);
    strike(5);
    for (int r = 0; r < 20; r++) {
        press(5);
        tick(100);
    }
    release(5);
    expect("a held firm hit: no light taps from its key repeats", 0);

    reset(100);
    for (int r = 0; r < 3; r++) {   // a panel that posts no releases
        press(2);
        tick(50);
    }
    expect("no releases ever posted: every press still plays", 3);

    reset(100);
    press(4);
    tick(3);
    release(4);
    tick(20);
    press(4);
    tick(3);
    release(4);
    expect("tap, release, tap again: two light taps", 2);

    return failures;
}
