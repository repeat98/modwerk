/* SPDX-License-Identifier: MIT */
#ifndef BEAT_SLICER_PREVIEW_ASYNC_H
#define BEAT_SLICER_PREVIEW_ASYNC_H
#include "preview_session.h"
#define BS_ASYNC_PRIVATE_STEPS 8u
/* Proposed fixed-storage UI/engine exchange. It does not install a base service,
 * pin native source memory, authorize Apply or prove loader retirement.
 * One engine consumer owns the session. All other callers use only this API,
 * serialized by the same nonblocking backend boundary as capture/copy. Backend,
 * guard and this object must remain alive until every caller has retired. Caller
 * input/output buffers must not alias this object. Use only after successful init. */
struct bs_async_result {
    uint32_t request, existing;
    struct bs_plan plan;
};
struct bs_preview_async {
    const struct bs_preview_backend *backend;
    void *context;
    struct bs_preview_guard *guard;
    struct bs_preview_session session;
    struct bs_preview_options desired_options;
    uint32_t owner, generation, desired, active, cancel, revoked, fault;
    uint32_t busy, held, published_request, published_state;
    uint32_t last_begin, last_steps;
    struct bs_preview_token published_token;
    struct bs_async_result published, staging;
};
/* Initialize once before publishing the object. Owner identity is nonzero and
 * cannot be reused for this object's lifetime. No admission is enabled here. */
int bs_async_init(struct bs_preview_async *, struct bs_preview_guard *,
    const struct bs_preview_backend *, void *, uint32_t owner, uint32_t generation);
/* On success return a fresh nonzero request sequence. Lock refusal, wrong owner,
 * invalid options, revocation and exhaustion return zero. No session mutation.
 * A new request replaces any older intent; a cancelled old request may finish
 * private arithmetic, but the gate prevents its next source capture/copy. */
uint32_t bs_async_request(struct bs_preview_async *, uint32_t owner, uint32_t generation,
    const struct bs_preview_options *);
uint32_t bs_async_cancel(struct bs_preview_async *, uint32_t owner, uint32_t generation);
/* Permanently stop this owner. Success invalidates publication and gates reads;
 * it does not free storage or establish callback/queue retirement. */
int bs_async_revoke(struct bs_preview_async *, uint32_t owner, uint32_t generation);
/* Engine only. At most budget work calls (1..8), each with at most
 * BS_ASYNC_PRIVATE_STEPS private reader transitions and one live copy, plus
 * optional begin/setup and result validation/publication. last_steps counts
 * work calls, not individual reader transitions. WAITING does not spin. Wake and
 * readiness policy remain external; do not self-wake an unavailable source. */
uint32_t bs_async_service(struct bs_preview_async *, uint32_t budget);
/* UI only. Read copied state for the exact request; a superseded request is
 * STALE. Lock refusal is WAITING. No session storage is inspected. */
uint32_t bs_async_state(struct bs_preview_async *, uint32_t owner, uint32_t generation,
    uint32_t request);
/* UI only. Copy a complete current READY result under ownership. Failure leaves
 * out unchanged. A copied result is not permission to write native markers. */
int bs_async_result(struct bs_preview_async *, uint32_t owner, uint32_t generation,
    uint32_t request, struct bs_async_result *out);
#endif
