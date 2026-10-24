/* SPDX-License-Identifier: MIT */
#ifndef BEAT_SLICER_PREVIEW_SESSION_H
#define BEAT_SLICER_PREVIEW_SESSION_H
#include "pcm_reader.h"
#include "preview_guard.h"
#define BS_SESSION_BYTES (BS_PCM_BLOCK_FRAMES * 6u)
/* Proposed base-side adapter, not an installed service/ABI or native lock.
 * One background owner calls a session. Backend functions/context and guard
 * must outlive it. Native enablement still requires complete writer coverage.
 */
enum bs_source_kind { BS_SOURCE_FLEX, BS_SOURCE_STATIC };
struct bs_marker_record { uint32_t start, end, loop; };
struct bs_source_snapshot {
    uint32_t owner_id, owner_generation, sample_id, sample_generation, editor_generation;
    uint32_t kind, slot, frames, sample_rate;
    struct bs_pcm_format format;
    uint32_t trim_start, trim_end, loop, sample_bpm24, project_bpm24, playback_generation;
    uint32_t marker_count;
    struct bs_marker_record markers[BS_MAX_SLICES];
};
enum bs_provider_reply { BS_PROVIDER_FAILED = -2, BS_PROVIDER_UNSUPPORTED = -1,
                         BS_PROVIDER_PENDING = 0, BS_PROVIDER_READY = 1 };
struct bs_preview_backend {
    /* Nonblocking. Return 1 only with exclusive ownership; 0 means retry later.
     * Every native writer/guard call, snapshot, map lookup and copy must use
     * this SAME verified boundary. Masking alone is not that proof.
     */
    int (*try_lock)(void *);
    void (*unlock)(void *);
    /* Called only while locked. Fill every scalar and the active records.
     * IDs/generations are base-owned nonzero lifetimes, never reused slot IDs.
     * PENDING/UNSUPPORTED/FAILED need not fill out. No retained output pointer.
     */
    enum bs_provider_reply (*capture)(void *, struct bs_source_snapshot *out);
    /* Called only while locked. Copy a whole-frame prefix into out, respecting
     * capacity and request extent. No raw pool pointer escapes. Return PENDING
     * instead of waiting/allocating/doing filesystem IO; external prefetch must
     * be bounded, owned and revalidated independently. No callbacks may reenter
     * the session. The backend must never write beyond capacity, even on error.
     */
    enum bs_provider_reply (*copy_ready)(void *, const struct bs_source_snapshot *,
        const struct bs_pcm_read *, uint8_t *out, uint32_t capacity, uint32_t *bytes);
};
enum bs_session_state { BS_SESSION_IDLE, BS_SESSION_RUNNING, BS_SESSION_WAITING,
    BS_SESSION_READY, BS_SESSION_CANCELLED, BS_SESSION_STALE,
    BS_SESSION_UNSUPPORTED, BS_SESSION_FAILED };
struct bs_preview_options { uint32_t beats, snap, tempo_source; };
struct bs_preview_session {
    struct bs_preview_guard *guard;
    const struct bs_preview_backend *backend;
    void *context;
    struct bs_preview_token token;
    struct bs_preview_options options;
    uint32_t state, captured;
    struct bs_source_snapshot snapshot, observed;
    struct bs_pcm_reader reader;
    uint32_t starts[BS_MAX_SLICES];
    uint8_t packed[BS_SESSION_BYTES];
};
void bs_session_init(struct bs_preview_session *, struct bs_preview_guard *,
                     const struct bs_preview_backend *, void *);
/* begin cancels any older preview before attempting a fresh capture. WAITING
 * retains options; step retries. No hook, IO, source write or guard enablement.
 */
enum bs_session_state bs_session_begin(struct bs_preview_session *, const struct bs_preview_options *);
/* One bounded transition; WAITING never spins. The backend's duration still
 * needs a real-unit budget. READY is revalidated by step and result as well.
 */
enum bs_session_state bs_session_step(struct bs_preview_session *);
void bs_session_cancel(struct bs_preview_session *);
/* Explicit current-state revalidation under lock. Failure leaves out unchanged.
 * A result is a preview only: it grants no permission to Apply native markers.
 * out must not alias session storage.
 */
int bs_session_result(struct bs_preview_session *, struct bs_plan *out);
/* Base-side composition only: same result validation, but the caller already
 * owns this session's backend lock and must keep it through its whole operation.
 * Never call from an unlocked/UI callback or reenter a session. No native write
 * is authorized by this helper. The normal result API acquires the lock itself.
 */
int bs_session_result_locked(struct bs_preview_session *, struct bs_plan *out);
#endif
