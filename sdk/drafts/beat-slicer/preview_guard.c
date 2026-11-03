/* SPDX-License-Identifier: MIT */
#include "preview_guard.h"
static void poison(struct bs_preview_guard *g) {
    g->poisoned = 1;
    g->enabled = g->revision = 0;
}
static int idle(const struct bs_preview_guard *g) {
    for (uint32_t i = 0; i < BS_GUARD_WRITERS; ++i)
        if (g->writers[i]) return 0;
    return 1;
}
static uint32_t allocate(struct bs_preview_guard *g) {
    if (g->serial == UINT32_MAX) { poison(g); return 0; }
    return ++g->serial;
}
void bs_guard_init(struct bs_preview_guard *g) {
    if (!g) return;
    g->revision = 1;
    g->serial = g->enabled = g->poisoned = 0;
    for (uint32_t i = 0; i < BS_GUARD_WRITERS; ++i) g->writers[i] = 0;
}
int bs_guard_enable(struct bs_preview_guard *g) {
    if (!g || g->poisoned || !idle(g)) return 0;
    g->enabled = 1;
    return 1;
}
void bs_guard_invalidate(struct bs_preview_guard *g) {
    if (!g || g->poisoned) return;
    if (g->revision == UINT32_MAX) poison(g);
    else ++g->revision;
}
void bs_guard_revoke(struct bs_preview_guard *g) {
    if (!g) return;
    g->enabled = 0;
    bs_guard_invalidate(g);
}
uint32_t bs_guard_writer_begin(struct bs_preview_guard *g) {
    if (!g || g->poisoned) return 0;
    bs_guard_invalidate(g);
    if (g->poisoned) return 0;
    for (uint32_t i = 0; i < BS_GUARD_WRITERS; ++i) {
        if (!g->writers[i]) {
            uint32_t ticket = allocate(g);
            g->writers[i] = ticket;
            return ticket;
        }
    }
    poison(g);
    return 0;
}
int bs_guard_writer_end(struct bs_preview_guard *g, uint32_t ticket) {
    if (!g || !ticket) return 0;
    for (uint32_t i = 0; i < BS_GUARD_WRITERS; ++i) {
        if (g->writers[i] == ticket) { g->writers[i] = 0; return 1; }
    }
    return 0;
}
uint32_t bs_guard_revision(const struct bs_preview_guard *g) {
    return g && g->enabled && !g->poisoned && idle(g) ? g->revision : 0;
}
int bs_guard_acquire(struct bs_preview_guard *g, struct bs_preview_token *out) {
    uint32_t revision = bs_guard_revision(g), operation;
    if (!revision || !out) return 0;
    operation = allocate(g);
    if (!operation) return 0;
    out->operation = operation;
    out->revision = revision;
    return 1;
}
int bs_guard_valid(const struct bs_preview_guard *g, const struct bs_preview_token *token) {
    return token && token->operation && g && token->operation <= g->serial &&
           token->revision && token->revision == bs_guard_revision(g);
}
