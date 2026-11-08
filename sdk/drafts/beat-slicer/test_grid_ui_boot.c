/* SPDX-License-Identifier: MIT */
/* Private emulator-only configuration/preview UI. Fixed storage is never
 * reclaimed; owner/source identities are test-owned. Its service is driven by a
 * private runner/tick fixture, not installed in the base. No Apply or hardware
 * qualification. */
#include "editor_menu.h"
#include "preview_session.h"
#include "ui_text.h"
extern uint32_t bs_boot_menu_pending, bs_boot_menu_generation;
extern struct bs_preview_session bs_boot_session;
extern struct bs_plan bs_boot_plan;
extern uint32_t bs_boot_begin(uint32_t, uint32_t, uint32_t);
extern uint32_t bs_boot_step(void), bs_boot_result(void);
enum { UI_CLOSED, UI_CONFIG, UI_REQUESTED, UI_SCANNING, UI_READY, UI_REFUSED };
uint32_t bs_grid_ui_state, bs_grid_ui_epoch, bs_grid_ui_started;
uint32_t bs_grid_ui_tempo, bs_grid_ui_spacing, bs_grid_ui_snap;
uint32_t bs_grid_ui_previews, bs_grid_ui_cancelled;
uint32_t bs_grid_ui_reply;
static int32_t selection, result_selection;
static uint32_t running_epoch;
static const uint32_t spacings[5] = {1, 4, 16, 32, 64};
static char bpm_label[32], spacing_label[32], boundary_label[32], preview_label[32];
static char result_label[32], counts_label[32], fade_label[32];
static const char *const labels[5] = {bpm_label, spacing_label, boundary_label, preview_label, "BACK"};
static const char *const result_labels[4] = {result_label, counts_label, fade_label, "BACK"};
static void bpm(void), spacing(void), boundary(void), preview(void), back(void), result_back(void);
static const bs_menu_callback callbacks[5] = {bpm, spacing, boundary, preview, back};
static const bs_menu_callback result_callbacks[4] = {result_back, result_back, result_back, result_back};
static uint32_t lock(void) {
    uint32_t saved;
    __asm__ __volatile__("move.w %%sr,%0\n\tmove.w #0x2700,%%sr" : "=d"(saved) :: "memory");
    return saved;
}
static void unlock(uint32_t saved) {
    __asm__ __volatile__("move.w %0,%%sr" :: "d"(saved) : "memory");
}
static void text(char *out, const char *in) {
    uint32_t i = 0;
    while (i < 31 && in[i]) { out[i] = in[i]; ++i; }
    out[i] = 0;
}
static void number(char *out, const char *prefix, uint32_t value, const char *suffix) {
    uint32_t i = 0;
    while (prefix[i]) { out[i] = prefix[i]; ++i; }
    if (value >= 10) out[i++] = (char)('0'+value/10);
    out[i++] = (char)('0'+value%10);
    while (*suffix) out[i++] = *suffix++;
    out[i] = 0; /* all callers use <=64 and fixed strings totaling <32 */
}
static int live(void) { return bs_boot_menu_generation == 7; }
static int root_state(void) {
    return bs_grid_ui_state >= UI_CONFIG && bs_grid_ui_state <= UI_SCANNING;
}
static int advance(void) {
    if (bs_grid_ui_epoch == UINT32_MAX) { bs_grid_ui_state = UI_CLOSED; return 0; }
    ++bs_grid_ui_epoch;
    return 1;
}
static void show(uint32_t count, uint32_t initial, int32_t *selected,
        const char *const *names, const bs_menu_callback *actions) {
    ((void (*)(uint32_t, uint32_t, int32_t *, const char *const *, const bs_menu_callback *))
        0x4006d94cu)(count, initial, selected, names, actions);
}
static void root(void) {
    text(bpm_label, bs_grid_ui_tempo ? "BPM: PROJECT" : "BPM: SAMPLE");
    number(spacing_label, "SPACING: ", spacings[bs_grid_ui_spacing], bs_grid_ui_spacing ? " BEATS" : " BEAT");
    text(boundary_label, bs_grid_ui_snap ? "BOUNDARY: SMOOTH" : "BOUNDARY: EXACT");
    text(preview_label, bs_grid_ui_state == UI_CONFIG ? "PREVIEW" : "PREVIEWING...");
    show(5, selection >= 0 && selection < 5 ? (uint32_t)selection : 0, &selection, labels, callbacks);
}
static void changed(uint32_t control) {
    uint32_t saved = lock();
    if (!live() || !root_state() || !advance()) { unlock(saved); return; }
    if (control == 0) bs_grid_ui_tempo ^= 1;
    if (control == 1) bs_grid_ui_spacing = (bs_grid_ui_spacing+1)%5;
    if (control == 2) bs_grid_ui_snap ^= 1;
    bs_grid_ui_state = UI_CONFIG;
    unlock(saved);
    root();
}
static void bpm(void) { changed(0); }
static void spacing(void) { changed(1); }
static void boundary(void) { changed(2); }
static void preview(void) {
    uint32_t saved = lock();
    if (!live() || !root_state() || !advance()) { unlock(saved); return; }
    bs_grid_ui_state = UI_REQUESTED;
    unlock(saved);
    root();
}
static void back(void) {
    uint32_t saved = lock();
    if (root_state()) { (void)advance(); bs_grid_ui_state = UI_CLOSED; }
    unlock(saved);
}
static void result_back(void) {
    uint32_t saved = lock();
    if (!live() || (bs_grid_ui_state != UI_READY && bs_grid_ui_state != UI_REFUSED) || !advance()) {
        unlock(saved); return;
    }
    bs_grid_ui_state = UI_CONFIG;
    unlock(saved);
    root();
}
static int visible(void) {
    const volatile uint32_t *window = (const volatile uint32_t *)0x460e5e30u;
    const volatile uintptr_t *names = (const volatile uintptr_t *)0x460e5e2cu;
    /* Stock close clears its window pointer but retains table pointers. This
     * detects dismissal for cancellation only; it NEVER proves safe reclaim. */
    return *window && *names == (uintptr_t)(root_state() ? labels : result_labels);
}
static void close_owned(void) {
    const volatile uint32_t *window = (const volatile uint32_t *)0x460e5e30u;
    const volatile uintptr_t *names = (const volatile uintptr_t *)0x460e5e2cu;
    if (*window && (*names == (uintptr_t)labels || *names == (uintptr_t)result_labels))
        ((void (*)(void))0x4006d754u)();
    /* Closing does not detach or reclaim any of this fixed fixture storage. */
}
static void result(int ready) {
    if (ready) {
        uint32_t existing = bs_boot_session.snapshot.marker_count;
        if (existing > bs_boot_plan.count ||
            !bs_ui_plan_label(result_label, sizeof result_label, bs_boot_plan.count, bs_boot_plan.bpm24) ||
            !bs_ui_counts_label(counts_label, sizeof counts_label, existing, bs_boot_plan.count-existing)) {
            ready = 0;
            bs_grid_ui_state = UI_REFUSED;
        }
    }
    if (ready) {
        uint32_t fades = bs_boot_plan.end_needs_fade;
        for (uint32_t i=0; i<bs_boot_plan.count; ++i) fades |= bs_boot_plan.needs_fade[i];
        text(fade_label, fades ? "FADES REQUIRED" : "BOUNDARIES QUIET");
    } else {
        text(result_label, "PREVIEW UNAVAILABLE");
        text(counts_label, bs_boot_session.state == BS_SESSION_STALE ? "SOURCE CHANGED" : "CHECK SOURCE / BPM");
        text(fade_label, "NO CHANGES MADE");
    }
    result_selection = 3;
    show(4, 3, &result_selection, result_labels, result_callbacks);
}
uint32_t bs_grid_ui_service(void) {
    uint32_t saved = lock(), state, epoch, tempo, beats, snap;
    if (!live()) {
        bs_boot_menu_pending = 0; bs_grid_ui_state = UI_CLOSED;
    } else if (bs_boot_menu_pending) {
        bs_boot_menu_pending = 0;
        if (!bs_grid_ui_started) {
            bs_grid_ui_started = 1;
            bs_grid_ui_tempo = bs_grid_ui_spacing = 0; bs_grid_ui_snap = 1;
            bs_grid_ui_epoch = 1; bs_grid_ui_state = UI_CONFIG;
            unlock(saved); root(); return UI_CONFIG;
        }
    }
    if (bs_grid_ui_state != UI_CLOSED && !visible()) bs_grid_ui_state = UI_CLOSED;
    state = bs_grid_ui_state; epoch = bs_grid_ui_epoch;
    tempo = bs_grid_ui_tempo; beats = spacings[bs_grid_ui_spacing]; snap = bs_grid_ui_snap;
    unlock(saved);
    if (state == UI_CLOSED || state == UI_CONFIG) {
        if (running_epoch) { bs_session_cancel(&bs_boot_session); running_epoch = 0; ++bs_grid_ui_cancelled; }
        if (state == UI_CLOSED) close_owned();
        return state;
    }
    if (state == UI_REFUSED) return state;
    if (state == UI_READY) {
        if (bs_boot_result()) return UI_READY;
        saved = lock();
        if (live() && bs_grid_ui_epoch == epoch && bs_grid_ui_state == UI_READY && visible()) {
            bs_grid_ui_state = UI_REFUSED;
            unlock(saved); result(0); return UI_REFUSED;
        }
        unlock(saved);
        return bs_grid_ui_state;
    }
    uint32_t session_state;
    if (state == UI_REQUESTED) {
        bs_session_cancel(&bs_boot_session);
        running_epoch = epoch;
        session_state = bs_boot_begin(tempo, snap, beats);
    } else {
        session_state = bs_boot_step();
    }
    bs_grid_ui_reply = session_state;
    saved = lock();
    if (!live() || bs_grid_ui_epoch != epoch || !root_state() || !visible()) {
        unlock(saved); bs_session_cancel(&bs_boot_session); running_epoch = 0; ++bs_grid_ui_cancelled;
        return bs_grid_ui_state;
    }
    if (session_state == BS_SESSION_RUNNING || session_state == BS_SESSION_WAITING) {
        bs_grid_ui_state = UI_SCANNING;
        unlock(saved); return UI_SCANNING;
    }
    unlock(saved);
    int ready = session_state == BS_SESSION_READY && bs_boot_result();
    saved = lock();
    if (!live() || bs_grid_ui_epoch != epoch || !root_state() || !visible()) {
        unlock(saved); bs_session_cancel(&bs_boot_session); running_epoch = 0; ++bs_grid_ui_cancelled;
        return bs_grid_ui_state;
    }
    bs_grid_ui_state = ready ? UI_READY : UI_REFUSED;
    running_epoch = 0;
    if (ready) ++bs_grid_ui_previews;
    unlock(saved);
    result(ready);
    return bs_grid_ui_state;
}
