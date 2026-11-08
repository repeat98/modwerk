/* SPDX-License-Identifier: MIT */
#ifndef MODWERK_SAMPLE_EDITOR_SERVICE_H
#define MODWERK_SAMPLE_EDITOR_SERVICE_H
#include "modwerk_sample_editor.h"
#include "loader.h"
#define MW_SAMPLE_FILE_SLOTS 128u
#define MW_SAMPLE_RECORDER_COUNT 8u

/* Base-owned state. The board must install and prove writer/recorder/project
 * invalidation and its serialization before making this service available.
 * capture/owner/publish are synchronous, bounded, non-reentrant and called with
 * that same lock held. No firmware/UI call which can yield belongs in them.
 * ready refuses recording into the edited source, unsettled jobs, incomplete module sets and
 * unqualified source states. Empty queue alone is never sufficient. */
struct mw_sample_capture {
    struct modwerk_sample_view view;
    uint32_t controls[11];
};
struct mw_sample_edit {
    uint32_t count;
    struct modwerk_slice_record records[MODWERK_SAMPLE_EDITOR_SLICES];
};
struct mw_sample_backend {
    void *context;
    uint32_t (*lock)(void *);
    void (*unlock)(void *, uint32_t);
    int (*ready)(void *);
    int (*owner)(void *, const struct runtime_owner *);
    unsigned (*capture)(void *, struct mw_sample_capture *);
    /* Exactly one atomic attempt. On failure restore and verify the complete
     * prior table BEFORE returning NO_CHANGE. An unverified failure returns
     * FAULT and permanently disables this service for the boot. STALE means
     * a recorder/source change won publication and the complete marker table
     * was restored and verified; it consumes the intent without a retry.
     * Recorder extent/trim/PCM changes must never be rolled back. No disk save,
     * PCM mutation, normalizing old rows or user history is permitted. */
    unsigned (*publish)(void *, const struct mw_sample_capture *, const struct mw_sample_edit *);
};
enum mw_sample_state { MW_SAMPLE_CLOSED, MW_SAMPLE_OPEN, MW_SAMPLE_PROMPT };
struct mw_sample_editor {
    const struct mw_sample_backend *backend;
    uint32_t initialized, revision, serial, opened_revision, state, poisoned, replacing;
    struct runtime_owner owner;
    struct mw_sample_capture before, observed;
    struct mw_sample_edit edit;
};
/* Init ONCE at cold boot, before native writers start. Zero storage required.
 * Never reset for project/module/source changes or restore an old serial. */
int mw_sample_editor_init(struct mw_sample_editor *, const struct mw_sample_backend *);
unsigned mw_sample_editor_begin(struct mw_sample_editor *, const struct runtime_owner *, uint32_t *token);
unsigned mw_sample_editor_copy(struct mw_sample_editor *, uint32_t token, struct modwerk_sample_view *);
unsigned mw_sample_editor_confirm(struct mw_sample_editor *, uint32_t token, const struct modwerk_sample_grid *);
unsigned mw_sample_editor_replace(struct mw_sample_editor *, uint32_t token, const struct modwerk_sample_grid *);
/* Invoked only by the base's verified stock confirmation dispatch, with the
 * token captured when THAT prompt was shown. Revalidate source/owner on YES.
 * NO just cancels. BUSY retains the prompt for a later revalidated attempt;
 * consume before publication, so a write can never be retried. */
unsigned mw_sample_editor_answer(struct mw_sample_editor *, uint32_t token, unsigned yes);
void mw_sample_editor_cancel(struct mw_sample_editor *, uint32_t token);
/* Caller already holds the verified source/loader lock. All relevant native
 * writers call changed BEFORE mutation. Retire before unpublishing an owner;
 * an unchanged companion owner does not cancel this editor. */
void mw_sample_editor_changed_locked(struct mw_sample_editor *);
void mw_sample_editor_retire_locked(struct mw_sample_editor *, const struct runtime_owner *);
#endif
