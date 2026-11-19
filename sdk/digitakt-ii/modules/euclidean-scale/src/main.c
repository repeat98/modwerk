/* SPDX-License-Identifier: GPL-3.0-or-later */
#include "pitch.h"
#include "../../../../machines/digitakt-ii/include/mk2/core.h"

enum {
    KEY_AMP = 4, KEY_NO = 12, KEY_FUNC = 17, KEY_PLAY = 20, KEY_STOP = 21,
    KEY_ENCODER_A = 41, KEY_ENCODER_B = 42, KEY_ENCODER_C = 43, KEY_ENCODER_D = 44, KEY_ENCODER_H = 48,
    ENCODER_A = 1, ENCODER_C = 3, ENCODER_D = 4,
    KEY_PRESS = 1, KEY_FUNC_HELD = 2, KEY_REPEAT = 8, KEY_RELEASE = 16,
    EUCLIDEAN_VIEW_VTABLE = 0x401f94e0,
    EUCLIDEAN_TRACK_SOURCE = 0x74, STOCK_SELECTED_TRACK = 0x4004abb8,
    STOCK_PAGE_DOTS = 0x4006b02e, STOCK_DRAW_IMAGE = 0x40114168,
    STOCK_DISABLED_CONTROL = 0x44f34768,
};

typedef void (*page_dots_fn)(void *, void *, int, int, int);
typedef void (*draw_image_fn)(void *, const void *, int, int, int);
typedef uint32_t (*selected_track_fn)(const void *);

static volatile uint32_t *edited;
static uint32_t consumed[2];
static unsigned int dirty;
static unsigned int shortcut_from_overlay;

/* FUNC can add the quick-mute view above the visible stock page. */
static int parameter_page_visible(const uint8_t *controller)
{
    const uint8_t *sentinel = controller + 0x14;
    const uint8_t *top = *(const uint8_t *const *)(controller + 0x18);
    if (!top || top == sentinel) {
        return 0;
    }
    const uintptr_t *visible = *(const uintptr_t *const *)(top + 8);
    if (visible && *visible == (uintptr_t)fw_vt_func) {
        top = *(const uint8_t *const *)(top + 4);
        visible = top && top != sentinel ? *(const uintptr_t *const *)(top + 8) : 0;
    }
    return visible && (*visible == (uintptr_t)fw_vt_main || *visible == EUCLIDEAN_VIEW_VTABLE);
}

static volatile uint32_t *current_track(void)
{
    const uint8_t *controller = (const uint8_t *)fw_brain() + 0x40;
    if (!parameter_page_visible(controller)) {
        return 0;
    }
    const uint8_t *sentinel = controller + 0x14;
    const uint8_t *node = *(const uint8_t *const *)sentinel;
    const uint8_t *euclidean = 0;
    for (unsigned int i = 0; i < 32 && node && node != sentinel; ++i) {
        const uint8_t *view = *(const uint8_t *const *)(node + 8);
        if (view && *(const uintptr_t *)view == EUCLIDEAN_VIEW_VTABLE) {
            euclidean = view;
            break;
        }
        node = *(const uint8_t *const *)node;
    }
    if (!euclidean) {
        return 0;
    }

    const void *source = *(const void *const *)(euclidean + EUCLIDEAN_TRACK_SOURCE);
    const int pattern = core_kit_on();
    if (!source || (unsigned int)pattern >= EUC_PATTERNS) {
        return 0;
    }

    /* Read the stock page's track source even before its editor cache is populated. */
    const selected_track_fn selected_track = (selected_track_fn)(uintptr_t)STOCK_SELECTED_TRACK;
    const uint32_t track = selected_track(source);
    if (track >= EUC_TRACKS) {
        return 0;
    }
    return &euclidean_state[(unsigned int)pattern * EUC_TRACKS + track];
}

static void close_page(void)
{
    edited = 0;
    dirty = 1;
}

void euclidean_tick(uint8_t *controller)
{
    if (edited && edited != current_track()) {
        close_page();
    }
    if (dirty) {
        controller[0x20] = 1;
        dirty = 0;
    }
}

int euclidean_key(void *brain, const uint32_t *event)
{
    const uint32_t key = event[3];
    const uint32_t flags = event[4];
    if (key >= 64) {
        return 0;
    }
    uint32_t *const keys = &consumed[key / 32];
    const uint32_t mask = UINT32_C(1) << (key % 32);
    if (*keys & mask) {
        if (flags & KEY_RELEASE) {
            *keys &= ~mask;
        }
        return 1;
    }
    const uint32_t press = flags & (KEY_PRESS | KEY_FUNC_HELD | KEY_REPEAT);
    const int shortcut = key == KEY_AMP && press == (KEY_PRESS | KEY_FUNC_HELD);
    if ((flags & KEY_PRESS) && key != KEY_FUNC && !shortcut) {
        shortcut_from_overlay = 0;
    }
    if (shortcut) {
        if (!parameter_page_visible((const uint8_t *)brain + 0x40)) {
            shortcut_from_overlay = 1;
            return 0;
        }
        /* Leave the next AMP chord to stock after it dismisses an overlay. */
        if (shortcut_from_overlay) {
            shortcut_from_overlay = 0;
            return 0;
        }
        if (edited) {
            close_page();
        } else if (!(edited = current_track())) {
            return 0;
        }
    } else if (!edited || !(flags & KEY_PRESS)) {
        return 0;
    } else if (edited != current_track()) {
        close_page();
        return 0;
    } else if (key == KEY_ENCODER_B && press == KEY_PRESS) {
        const uint32_t state = euclidean_track_state(edited);
        const uint32_t generation = (state & EUC_GENERATION) + 1u;
        euclidean_set_track_state(edited, (state & EUC_RANGE) | EUC_ENABLED
                                | (generation <= EUC_GENERATION ? generation : 1u));
    } else if ((key == KEY_ENCODER_C || key == KEY_ENCODER_D) && press == KEY_PRESS) {
        euclidean_set_track_state(edited, euclidean_track_state(edited) & ~EUC_RANGE);
    } else if (key == KEY_NO && press == KEY_PRESS) {
        close_page();
    } else if (key == KEY_FUNC || key == KEY_PLAY || key == KEY_STOP) {
        return 0;
    } else if (key >= KEY_ENCODER_A && key <= KEY_ENCODER_H) {
        /* Other encoder presses have no assignment on the Scale page. */
    } else {
        close_page();
        return 0;
    }

    *keys |= mask;
    dirty = 1;
    return 1;
}

int euclidean_encoder(void *brain, const int32_t *event)
{
    (void)brain;
    if (!edited || edited != current_track()) {
        return 0;
    }
    const int32_t encoder = event[3];
    const int32_t delta = event[4];
    if (!delta || (encoder != ENCODER_A && encoder != ENCODER_C && encoder != ENCODER_D)) {
        return 1;
    }
    const uint32_t state = euclidean_track_state(edited);
    uint32_t next;
    if (encoder == ENCODER_A) {
        next = delta > 0 ? state | EUC_ENABLED : state & EUC_RANGE;
    } else {
        next = euclidean_turn_octave(state, encoder == ENCODER_D, delta);
    }
    if (state != next) {
        euclidean_set_track_state(edited, next);
        dirty = 1;
    }
    return 1;
}

static void draw_scale_switch(void *bitmap, int enabled)
{
    fw_fillrect(bitmap, 26, 38, 40, 46, 1);
    fw_fillrect(bitmap, 25, 39, 41, 45, 1);
    fw_fillrect(bitmap, 24, 40, 42, 44, 1);
    fw_fillrect(bitmap, 25, 40, 41, 44, 0);
    fw_fillrect(bitmap, 26, 39, 40, 45, 0);
    if (enabled) {
        fw_fillrect(bitmap, 27, 40, 33, 44, 1);
        fw_fillrect(bitmap, 26, 41, 33, 43, 1);
    }
    const int thumb = enabled ? 35 : 26;
    fw_fillrect(bitmap, thumb + 1, 40, thumb + 3, 44, 1);
    fw_fillrect(bitmap, thumb, 41, thumb + 4, 43, 1);
}

static void draw_octave_bound(void *bitmap, int x, uint32_t state, int upper)
{
    fw_textf(bitmap, fw_font_narrow, x, 26, 0, "%s", upper ? "HI" : "LO");
    fw_fillrect(bitmap, x - 3, 34, x + 15, 52, 1);
    fw_fillrect(bitmap, x - 2, 35, x + 14, 51, 0);
    if (state & EUC_RANGE) {
        const int octave = euclidean_octave_bound(state, upper);
        const int inset = !octave ? 5 : octave <= -10 || octave >= 10 ? 1 : 3;
        fw_textf(bitmap, fw_font_narrow, x + inset, 40, 0, octave > 0 ? "+%d" : "%d", octave);
    } else {
        fw_textf(bitmap, fw_font_narrow, x - 1, 40, 0, "%s", "AUTO");
    }
}

void euclidean_draw(void *bitmap, void *controller)
{
    const volatile uint32_t *track = current_track();
    if (!track) {
        return;
    }

    const int scale_page = edited == track;
    if (scale_page) {
        fw_fillrect(bitmap, 17, 0, 127, 53, 0);
        const uint32_t state = euclidean_track_state(track);
        draw_scale_switch(bitmap, (state & EUC_ENABLED) != 0);
        fw_fillrect(bitmap, 55, 38, 63, 46, 1);
        fw_fillrect(bitmap, 56, 39, 62, 45, 0);
        fw_fillrect(bitmap, 58, 41, 60, 43, 1);
        fw_textf(bitmap, fw_font_narrow, 26, 26, 0, "%s", "SCF");
        fw_textf(bitmap, fw_font_narrow, 52, 26, 0, "%s", "RNN");
        draw_octave_bound(bitmap, 77, state, 0);
        draw_octave_bound(bitmap, 103, state, 1);

        /* Match the stock parameter grid for the four unassigned knobs. */
        const draw_image_fn draw_image = (draw_image_fn)(uintptr_t)STOCK_DRAW_IMAGE;
        const void *const disabled = (const void *)(uintptr_t)STOCK_DISABLED_CONTROL;
        for (int slot = 4; slot < 8; ++slot) {
            draw_image(bitmap, disabled, 25 + 26 * (slot % 4), 34 - 27 * (slot / 4), 0);
        }
    }

    /* Stock ParameterPageView renderer. Its first argument is unused. */
    const page_dots_fn page_dots = (page_dots_fn)(uintptr_t)STOCK_PAGE_DOTS;
    page_dots(controller, bitmap, 2, scale_page, 7);
}
