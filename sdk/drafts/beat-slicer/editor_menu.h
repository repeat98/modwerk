/* SPDX-License-Identifier: MIT */
#ifndef BS_EDITOR_MENU_H
#define BS_EDITOR_MENU_H
#include <stdint.h>

/* Proposed base-owned composition, NOT a registered hook or exported ABI.
 * All calls require the SAME stable loader/editor lock, held through dispatch.
 * Inputs must already be admitted/readable. Callbacks may not wait or reenter.
 * Storage, trampoline and backend code live in the base, never a module pool. */
#define BS_MENU_STOCK_ROWS 9u
#define BS_MENU_ACTIONS 4u
#define BS_MENU_ROWS (BS_MENU_STOCK_ROWS + BS_MENU_ACTIONS)
#define BS_MENU_LABEL_BYTES 32u
typedef void (*bs_menu_callback)(void);
typedef struct { uint32_t module, generation; } bs_menu_owner;
typedef struct {
    uint32_t key, action;
    bs_menu_owner owner;
    const char *label;
} bs_menu_action;
typedef struct {
    void *context;
    int (*owner_valid)(void *, const bs_menu_owner *);
    int (*invoke)(void *, const bs_menu_owner *, uint32_t action);
} bs_menu_backend;
typedef enum {
    BS_MENU_OK, BS_MENU_INVALID, BS_MENU_BUSY, BS_MENU_STALE,
    BS_MENU_EXHAUSTED, BS_MENU_CALLBACK_FAILED
} bs_menu_status;
typedef enum { BS_MENU_CLOSED, BS_MENU_OPEN, BS_MENU_DISPATCHING,
               BS_MENU_RETIRING } bs_menu_state;
typedef struct {
    uint32_t serial, count, stock_count;
    int32_t selection;
    bs_menu_state state;
    char text[BS_MENU_ROWS][BS_MENU_LABEL_BYTES];
    const char *labels[BS_MENU_ROWS];
    bs_menu_callback callbacks[BS_MENU_ROWS];
    bs_menu_action actions[BS_MENU_ACTIONS];
    bs_menu_backend backend;
} bs_editor_menu;

/* Zero-initialize once, before first publication. Never reset serial to reuse
 * an exhausted menu. Never move/copy this object while its pointers are live. */
bs_menu_status bs_menu_open_locked(bs_editor_menu *, uint32_t stock_count,
    const char *const *stock_labels, const bs_menu_callback *stock_callbacks,
    uint32_t action_count, const bs_menu_action *, bs_menu_callback trampoline,
    const bs_menu_backend *, uint32_t *token);
/* Stock selection must already have closed the displayed menu. Only contributed
 * rows enter this function. The wrapper captures token/row before any yield.
 * Owner validity and invocation share the caller's uninterrupted stable lock. */
bs_menu_status bs_menu_dispatch_locked(bs_editor_menu *, uint32_t token, uint32_t row);
/* Close/sample switch/owner removal first retires dispatch. Arrays stay intact.
 * DISPATCHING returns BUSY: never reclaim module code while callback is active. */
bs_menu_status bs_menu_retire_locked(bs_editor_menu *, uint32_t token);
/* Trusted adapter acknowledgement: all native menu references are detached and
 * no old selection/callback can run. Merely hiding the menu is NOT sufficient.
 * Until this is established, keep storage pinned and refuse another open. */
bs_menu_status bs_menu_detached_locked(bs_editor_menu *, uint32_t token);
#endif
