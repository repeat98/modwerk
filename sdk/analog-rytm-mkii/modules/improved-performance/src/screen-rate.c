// SPDX-License-Identifier: GPL-3.0-or-later
// Improved Performance's screen rate for the Analog Rytm MKII (Nathaniel Pavel): while the UI falls behind, it
// redraws the screen half as often, so that the waiting key, pad, knob and note messages are taken sooner.
//
// Stock OS 1.74's UI task takes keys, pads, encoders and live recording's notes from one queue, and from its
// 60 Hz timer message runs, every third time, the frame step: module ticks (ev_tick), the page's draw (ev_draw),
// the lights and the display, 20 times a second. Under heavy audio load the frame step alone can take most of
// what the UI task gets, and the queue backs up: on the author's MKII, in overloaded test images (92 % audio
// load), the queue grew by about 17 messages a second.
// While more than FRAME_BACKLOG messages wait (keys, pads, encoders, notes, and the 60 Hz timer messages themselves, so a
// UI stall of more than about 150 ms counts too), every other frame step is left out (the frame rate halves, and
// module ticks with it; tick-counted timeouts, Improved Performance's own looks included, last up to twice as long); as soon as the queue is short again the screen runs at full rate. In the same overloaded
// images the UI then took about twice as many messages a second and the queue shrank. Below that backlog (every
// capture of normal and live playing so far: the deepest queue was 8) nothing changes.
//
// The site is the frame step's call, the `jsr` at 0x400a4a32 (build.json): stock pushes its one argument before
// and pops it after, and reads no register from the call. Nothing else in the image branches into those 6 bytes.

#include <stdint.h>

#define UI_QUEUE_COUNT (*(volatile uint32_t *)(UI_QUEUE_AT + 4))   // messages waiting in the UI task's queue
#define FRAME_STEP ((void (*)(void *))FRAME_STEP_AT)
#ifndef FRAME_BACKLOG
#define FRAME_BACKLOG 8
#endif

void ip_frame_gate(void *arg)
{
    static uint8_t skipped;
    if (!skipped && (int32_t)UI_QUEUE_COUNT > FRAME_BACKLOG) {   // a test build sets -1: always every other
        skipped = 1;
        return;
    }
    skipped = 0;
    FRAME_STEP(arg);
}
