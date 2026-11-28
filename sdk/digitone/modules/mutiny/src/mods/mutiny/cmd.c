/* SPDX-License-Identifier: GPL-2.0-or-later */
#include "cmd.h"

void mu_cmd_arm(struct mu_cmd *c, const void *pat, const void *proj, uint32_t track,
                uint32_t page) {
    c->pat = pat;
    c->proj = proj;
    c->track = (uint8_t)(track > 0xffu ? 0xffu : track);
    c->page = (uint8_t)(page > 3u ? 3u : page);
    c->req = 1;
}

void mu_cmd_clear(struct mu_cmd *c) { c->req = 0; }

int mu_cmd_holds(const struct mu_cmd *c, const void *pat, const void *proj) {
    /* no pattern is no context: a command made while nothing was loaded never applies */
    return c->req && c->pat != 0 && c->pat == pat && c->proj == proj;
}

void mu_gesture_press(struct mu_gesture *g, const void *pat, const void *proj, uint32_t track,
                      uint32_t page) {
    mu_cmd_arm(&g->cmd, pat, proj, track, page);
    g->owned = 1;
}

int mu_gesture_release(struct mu_gesture *g, const void *pat, const void *proj,
                       struct mu_cmd *out) {
    int ok = g->owned && mu_cmd_holds(&g->cmd, pat, proj);
    if (ok) { /* field copies: the target has no memcpy for a struct assignment */
        out->pat = g->cmd.pat;
        out->proj = g->cmd.proj;
        out->track = g->cmd.track;
        out->page = g->cmd.page;
        out->req = 1;
    }
    g->owned = 0;
    mu_cmd_clear(&g->cmd);
    return ok;
}

void mu_gesture_end(struct mu_gesture *g) {
    g->owned = 0;
    mu_cmd_clear(&g->cmd);
}
