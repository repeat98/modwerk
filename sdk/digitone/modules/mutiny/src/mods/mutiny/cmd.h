/* SPDX-License-Identifier: GPL-2.0-or-later */
/* MUTINY commands: YES and NO resolve in the UI tick after the pending renders, so a command
 * carries the track and pattern/project pointers it was made in. It applies only while that
 * context holds; a held key is captured at its press and ends if the context changes. */
#ifndef MUTINY_CMD_H
#define MUTINY_CMD_H

#include <stdint.h>

struct mu_cmd {
    const void *pat;  /* the live pattern pointer when the command was made: a rule-out guard */
    const void *proj; /* the live project pointer when the command was made: a rule-out guard */
    uint8_t req;      /* 1: a command is waiting for the UI tick */
    uint8_t page;
    uint8_t track; /* the synth track it belongs to */
};

/* A gesture whose press is owned but whose action is decided later. */
struct mu_gesture {
    struct mu_cmd cmd;
    uint8_t owned; /* the module took the press */
};

void mu_cmd_arm(struct mu_cmd *c, const void *pat, const void *proj, uint32_t track, uint32_t page);
void mu_cmd_clear(struct mu_cmd *c);
/* The command is waiting and its native context is still this one. */
int mu_cmd_holds(const struct mu_cmd *c, const void *pat, const void *proj);

void mu_gesture_press(struct mu_gesture *g, const void *pat, const void *proj, uint32_t track,
                      uint32_t page);
/* Activate the gesture into `out` at its release, but only while the context captured at the press
 * still holds. The pointers passed here are compared, never captured. -> 1 when `out` is armed.
 * The gesture always ends, so a refused activation leaves nothing behind. */
int mu_gesture_release(struct mu_gesture *g, const void *pat, const void *proj, struct mu_cmd *out);
/* End the gesture without producing a command (a reset, a turn, a page close). */
void mu_gesture_end(struct mu_gesture *g);

#endif
