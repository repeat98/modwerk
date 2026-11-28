/* SPDX-License-Identifier: GPL-2.0-or-later */
/* Analog Rytm MKII core (Modwerk): parameter pages and parameter overrides.
 *
 * A module contributes pointers to these records to the tables core_pages, core_page_fns, core_params and
 * core_view_pages (build.json: data 00000000 with one abs32 relocation to the record). The core asks the entries in
 * table order and takes the first answer. A page a module adds needs an id stock does not use (0..11 on the MKII,
 * 0..10 on the MKI) and no other module uses. */
#ifndef ELEKLOADER_AR2_PAGES_H
#define ELEKLOADER_AR2_PAGES_H

#include <stdint.h>

/* A page: its title and the parameter ids on knobs A..H (0 for none). From name on it is stock's own page entry. */
struct core_page {
    int32_t page;
    const char *name;
    int32_t ids[8];
};

/* A page whose contents are decided when it is asked for: info returns the page, or 0 to let others answer. */
struct core_page_fn {
    int32_t page;
    const struct core_page *(*info)(int32_t page);
};

/* The arguments of stock's value-text routine, in place: a text handler may change id and value. */
struct core_text {
    void *obj;
    int32_t id;
    int32_t value;                        /* 8.8 */
    char *buf;
};

/* What a text handler returns. */
#define CORE_TEXT_PASS 0                  /* ask the next entry */
#define CORE_TEXT_DONE 1                  /* buf holds the text */
#define CORE_TEXT_STOCK 2                 /* let stock write it, with id and value as they are now */

/* Parameter ids first..last. A function left 0 passes.
 * get: stores the value (8.8) and returns 1, or returns 0.
 * delta: a knob turn, delta in 8.8, func 1 while FUNC is held; returns 1 when it took the turn (the core redraws the
 *        view and stock makes no lock), 0 to pass.
 * text: returns a CORE_TEXT_* value. */
struct core_param {
    int32_t first, last;
    int (*get)(int32_t id, int32_t *value);
    int (*delta)(void *view, int32_t id, int32_t delta, int32_t func);
    int (*text)(struct core_text *t);
};

/* The views whose page key steps through a list of pages, and their stock pages. */
#define CORE_VIEW_SRC 0                   /* page 0 */
#define CORE_VIEW_SAMPLE 1                /* pages 4, 5 */
#define CORE_VIEW_FILTER 2                /* page 6 */
#define CORE_VIEW_AMP 3                   /* page 7 */
#define CORE_VIEW_LFO 4                   /* page 3 */
#define CORE_VIEW_DELAY 5                 /* page 8, FX track */
#define CORE_VIEW_REVERB 6                /* page 9, FX track */
#define CORE_VIEW_DIST 7                  /* page 10, FX track */
#define CORE_VIEW_COMP 8                  /* page 11, FX track */
#define CORE_VIEW_FX_LFO 9                /* page 3, FX track */

/* A page added behind a view's stock pages. shown 0: always; otherwise the page key skips it while shown(view)
 * returns 0. */
struct core_view_page {
    int32_t view;
    int32_t page;
    int32_t (*shown)(void *view);
};

#endif
