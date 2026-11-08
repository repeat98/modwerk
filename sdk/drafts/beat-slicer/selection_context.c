/* SPDX-License-Identifier: MIT */
#include "selection_context.h"
static int matches(const struct bs_selection_context *c, uint32_t ticket) {
    return c && ticket && c->serial == ticket && c->state != BS_SELECTION_IDLE;
}
bs_menu_status bs_selection_capture_locked(struct bs_selection_context *c,
    const struct bs_selection_binding *b, uint32_t *ticket) {
    if (!c || !b || !ticket) return BS_MENU_INVALID;
    if (c->state != BS_SELECTION_IDLE) return BS_MENU_BUSY;
    if (c->serial == UINT32_MAX) return BS_MENU_EXHAUSTED;
    if (!b->window || !b->task || !b->table || !b->callback ||
        !b->owner.module || !b->owner.generation || !b->domain || !b->epoch ||
        !b->count || b->count > BS_MENU_ROWS || b->row >= b->count ||
        b->table[b->row] != b->callback) return BS_MENU_INVALID;
#define COPY(field) c->binding.field = b->field
    COPY(window); COPY(task); COPY(table); COPY(callback); COPY(owner.module);
    COPY(owner.generation); COPY(domain); COPY(epoch); COPY(count); COPY(row);
#undef COPY
    *ticket = ++c->serial;
    c->state = BS_SELECTION_CAPTURED;
    return BS_MENU_OK;
}
bs_menu_status bs_selection_arm_locked(struct bs_selection_context *c, uint32_t ticket,
    uintptr_t task, const bs_menu_callback *table, uint32_t row, bs_menu_callback callback) {
    if (!matches(c,ticket) || c->state != BS_SELECTION_CAPTURED) return BS_MENU_STALE;
    if (task != c->binding.task || table != c->binding.table || row != c->binding.row ||
        callback != c->binding.callback || table[row] != callback) return BS_MENU_STALE;
    c->state = BS_SELECTION_ARMED;
    return BS_MENU_OK;
}
int bs_selection_take_locked(struct bs_selection_context *c, uintptr_t task,
    bs_menu_callback callback, uint32_t domain, bs_menu_owner owner, uint32_t epoch,
    uint32_t *row) {
    if (!c || !row || c->state != BS_SELECTION_ARMED || task != c->binding.task ||
        callback != c->binding.callback || domain != c->binding.domain ||
        owner.module != c->binding.owner.module || owner.generation != c->binding.owner.generation ||
        epoch != c->binding.epoch) return 0;
    c->state = BS_SELECTION_CONSUMED;
    *row = c->binding.row;
    return 1;
}
bs_menu_status bs_selection_block_locked(struct bs_selection_context *c, uint32_t ticket) {
    if (!matches(c,ticket)) return BS_MENU_STALE;
    c->state = BS_SELECTION_BLOCKED;
    return BS_MENU_OK;
}
bs_menu_status bs_selection_end_locked(struct bs_selection_context *c, uint32_t ticket) {
    if (!matches(c,ticket)) return BS_MENU_STALE;
    c->state = BS_SELECTION_IDLE;
    c->binding.window = c->binding.task = 0;
    c->binding.table = 0; c->binding.callback = 0;
    c->binding.owner.module = c->binding.owner.generation = 0;
    c->binding.domain = c->binding.epoch = c->binding.count = c->binding.row = 0;
    return BS_MENU_OK;
}
