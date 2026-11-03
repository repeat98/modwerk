/* SPDX-License-Identifier: MIT */
#include "editor_menu.h"

static uint32_t label_length(const char *s) {
    uint32_t n;
    if (!s) return 0;
    for (n = 0; n < BS_MENU_LABEL_BYTES; ++n) {
        if (!s[n]) return n;
        /* Menu labels are printable ASCII, not control sequences. */
        if ((unsigned char)s[n] < 32u || (unsigned char)s[n] > 126u) return 0;
    }
    return 0;
}
static void copy_label(bs_editor_menu *m, uint32_t row, const char *s) {
    uint32_t i;
    for (i = 0; i < BS_MENU_LABEL_BYTES; ++i) {
        m->text[row][i] = *s;
        if (*s) ++s;
    }
    m->labels[row] = m->text[row];
}
bs_menu_status bs_menu_open_locked(bs_editor_menu *m, uint32_t stock_count,
    const char *const *stock_labels, const bs_menu_callback *stock_callbacks,
    uint32_t action_count, const bs_menu_action *actions,
    bs_menu_callback trampoline, const bs_menu_backend *backend, uint32_t *token) {
    uint32_t i, j, order[BS_MENU_ACTIONS];
    if (!m || !token) return BS_MENU_INVALID;
    if (m->state != BS_MENU_CLOSED) return BS_MENU_BUSY;
    if (m->serial == UINT32_MAX) return BS_MENU_EXHAUSTED;
    if ((stock_count != 6u && stock_count != 9u) || !stock_labels || !stock_callbacks ||
        !action_count || action_count > BS_MENU_ACTIONS || !actions || !trampoline ||
        !backend || !backend->owner_valid || !backend->invoke) return BS_MENU_INVALID;
    for (i = 0; i < stock_count; ++i)
        if (!label_length(stock_labels[i])) return BS_MENU_INVALID;
    for (i = 0; i < action_count; ++i) {
        if (!actions[i].key || !actions[i].action || !actions[i].owner.module ||
            !actions[i].owner.generation || !label_length(actions[i].label)) return BS_MENU_INVALID;
        for (j = 0; j < i; ++j)
            if (actions[i].key == actions[j].key) return BS_MENU_INVALID;
        if (!backend->owner_valid(backend->context, &actions[i].owner)) return BS_MENU_STALE;
        order[i] = i;
    }
    /* Deterministic ordering independent of registration/load order. */
    for (i = 1; i < action_count; ++i) {
        uint32_t at = order[i];
        for (j = i; j && actions[order[j - 1]].key > actions[at].key; --j)
            order[j] = order[j - 1];
        order[j] = at;
    }
    /* No fallible operation after this point; failures leave menu/token intact. */
    for (i = 0; i < stock_count; ++i) {
        copy_label(m, i, stock_labels[i]);
        m->callbacks[i] = stock_callbacks[i];
    }
    for (i = 0; i < action_count; ++i) {
        j = stock_count + i;
        copy_label(m, j, actions[order[i]].label);
        m->actions[i].key = actions[order[i]].key;
        m->actions[i].action = actions[order[i]].action;
        m->actions[i].owner.module = actions[order[i]].owner.module;
        m->actions[i].owner.generation = actions[order[i]].owner.generation;
        m->actions[i].label = m->text[j];
        m->callbacks[j] = trampoline;
    }
    m->backend.context = backend->context;
    m->backend.owner_valid = backend->owner_valid;
    m->backend.invoke = backend->invoke;
    m->count = stock_count + action_count;
    m->stock_count = stock_count;
    m->selection = -1;
    *token = ++m->serial;
    m->state = BS_MENU_OPEN;
    return BS_MENU_OK;
}
bs_menu_status bs_menu_dispatch_locked(bs_editor_menu *m, uint32_t token, uint32_t row) {
    bs_menu_action *a;
    int result;
    if (!m || !token) return BS_MENU_INVALID;
    if (m->state == BS_MENU_DISPATCHING) return BS_MENU_BUSY;
    if (m->state != BS_MENU_OPEN || token != m->serial) return BS_MENU_STALE;
    if (row < m->stock_count || row >= m->count) return BS_MENU_INVALID;
    m->state = BS_MENU_RETIRING;
    a = &m->actions[row - m->stock_count];
    if (!m->backend.owner_valid(m->backend.context, &a->owner)) return BS_MENU_STALE;
    m->state = BS_MENU_DISPATCHING;
    result = m->backend.invoke(m->backend.context, &a->owner, a->action);
    m->state = BS_MENU_RETIRING;
    return result ? BS_MENU_OK : BS_MENU_CALLBACK_FAILED;
}
bs_menu_status bs_menu_retire_locked(bs_editor_menu *m, uint32_t token) {
    if (!m || !token) return BS_MENU_INVALID;
    if (m->state == BS_MENU_DISPATCHING) return BS_MENU_BUSY;
    if (m->serial != token || m->state == BS_MENU_CLOSED) return BS_MENU_STALE;
    m->state = BS_MENU_RETIRING;
    return BS_MENU_OK;
}
bs_menu_status bs_menu_detached_locked(bs_editor_menu *m, uint32_t token) {
    if (!m || !token) return BS_MENU_INVALID;
    if (m->state == BS_MENU_DISPATCHING || m->state == BS_MENU_OPEN) return BS_MENU_BUSY;
    if (m->serial != token || m->state != BS_MENU_RETIRING) return BS_MENU_STALE;
    m->state = BS_MENU_CLOSED;
    return BS_MENU_OK;
}
