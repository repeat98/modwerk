/* SPDX-License-Identifier: MIT
 * Proposed shared Octatrack sample-editor interface. Not released capability.
 * The base owns source access, confirmation and publication; packages own their
 * algorithms and controls. No PCM or instrument pointer crosses this API.
 */
#ifndef MODWERK_SAMPLE_EDITOR_H
#define MODWERK_SAMPLE_EDITOR_H
#include <stdint.h>
#define MODWERK_SAMPLE_EDITOR_ABI 1u
#define MODWERK_SAMPLE_EDITOR_SLICES 64u
#define MODWERK_SAMPLE_ACTION_BYTES 64u

enum modwerk_sample_kind { MODWERK_SAMPLE_STATIC, MODWERK_SAMPLE_FLEX };
enum modwerk_sample_reply {
    MODWERK_SAMPLE_OK, MODWERK_SAMPLE_BUSY, MODWERK_SAMPLE_STALE,
    MODWERK_SAMPLE_UNSUPPORTED, MODWERK_SAMPLE_INVALID,
    MODWERK_SAMPLE_PRESERVATION, MODWERK_SAMPLE_CONFIRMING,
    MODWERK_SAMPLE_APPLIED, MODWERK_SAMPLE_NO_CHANGE, MODWERK_SAMPLE_FAULT
};
struct modwerk_slice_record { uint32_t start, end, loop; };
struct modwerk_sample_view {
    uint32_t kind, slot, frames, frame_rate;
    uint32_t trim_start, trim_end, loop, sample_bpm24, project_bpm24;
    uint32_t count;
    struct modwerk_slice_record records[MODWERK_SAMPLE_EDITOR_SLICES];
} __attribute__((aligned(4)));
/* A proposed edit, never a native write. The base independently checks bounds,
 * complete-record/ordinal preservation and the still-current captured source.
 * There is no promise of amplitude analysis or click-free playback here. */
struct modwerk_sample_grid {
    uint32_t count;
    uint32_t starts[MODWERK_SAMPLE_EDITOR_SLICES];
} __attribute__((aligned(4)));
struct modwerk_sample_editor_api {
    uint32_t abi, bytes;
    /* Functions live in the base. The opening's token is passed BY VALUE to
     * open(), never read later from a mutable shared API object. Tokens cannot
     * survive source, project, writer or owner retirement, or be reused. */
    unsigned (*copy)(uint32_t token, struct modwerk_sample_view *);
    /* Copies the proposal before returning. CONFIRMING means the BASE owns the
     * normal instrument confirmation; it does not mean markers were applied.
     * The module must leave its own modal before the base shows that prompt.
     * NO/cancellation changes nothing. YES revalidates before one publication.
     * No project/sample save is implicit, and no slice Undo is supplied. */
    unsigned (*confirm)(uint32_t token, const struct modwerk_sample_grid *);
    void (*cancel)(uint32_t token);
    /* Optional size-checked extension. Replace the active slice table, after
     * the base warns REPLACE SLICES? when the captured count is nonzero.
     * Older callers keep the preservation-only confirm() above. */
    unsigned (*replace)(uint32_t token, const struct modwerk_sample_grid *);
};
/* One typed contribution to the proposed base-owned action table. The record
 * is 64 bytes and four-byte aligned on ColdFire; label is inline, printable,
 * NUL + zero padding. ColdFire C otherwise permits two-byte struct alignment.
 * open is relocated with the package and must lie in its initialized image.
 * The base copies metadata and retains an image-relative offset plus the full
 * published owner, never a module label/callback in stock's menu arrays.
 * open runs synchronously in the UI task and cannot block. Retained views must
 * be the package's own copies. It receives only a fresh token and the immutable base API. Existing runtime
 * tick/draw/key/encoder hooks drive the module's own dialog afterwards.
 */
struct modwerk_sample_action {
    uint32_t abi, bytes, action, flags;
    void (*open)(uint32_t token, const struct modwerk_sample_editor_api *);
    char label[32];
    uint32_t reserved[3];
} __attribute__((aligned(4)));
#if UINTPTR_MAX == 0xffffffffu
typedef char modwerk_sample_action_size[
    sizeof(struct modwerk_sample_action)==MODWERK_SAMPLE_ACTION_BYTES ? 1 : -1];
#endif
#endif
