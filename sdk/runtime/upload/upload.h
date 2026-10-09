/* SPDX-License-Identifier: GPL-3.0-or-later */
#ifndef MODWERK_UPLOAD_H
#define MODWERK_UPLOAD_H
#include <stdint.h>

#define MU_DIGEST_BYTES 32u
#define MU_MAX_CHUNK 4096u
#define MU_MAX_BYTES 1048576u /* Protocol bound; not a hardware reservation. */

enum mu_phase { MU_NORMAL, MU_READY, MU_RECEIVING, MU_VERIFIED, MU_PENDING, MU_TRIAL, MU_RECOVERY };
enum mu_result {
    MU_OK, MU_STATE, MU_UNSAFE, MU_IDENTITY, MU_LIMIT, MU_STALE,
    MU_LENGTH, MU_CONFLICT, MU_HASH, MU_REJECTED, MU_BACKEND, MU_NEEDS_RECOVERY
};
/* UNCHANGED is a positive acknowledgement that old dispatch is intact.
 * Anything else, including an invalid reply, requires confirmed rollback. */
enum mu_publication { MU_UNCHANGED = 0, MU_APPLIED = 1, MU_UNCERTAIN = 2 };

struct mu_offer {
    uint8_t base[MU_DIGEST_BYTES], session[MU_DIGEST_BYTES], digest[MU_DIGEST_BYTES];
    uint32_t transaction, generation, length;
};
struct mu_backend {
    void *user;
    int (*enter)(void *); /* Hold transport/recording and quiesce callbacks. */
    int (*safe)(void *);  /* Actual device state, never host-supplied flags. */
    int (*leave)(void *);
    int (*prepare)(void *, const uint8_t *, uint32_t); /* Parse, admit, relocate off-line. */
    int (*discard)(void *); /* Idempotently release candidate resources only. */
    enum mu_publication (*publish)(void *); /* Coordinated dispatch acknowledgement. */
    int (*restore)(void *); /* Both cores confirmed using the previous set. */
    int (*retire)(void *); /* Both cores retired previous references; then free them. */
};
/* One engine-task owner; serialized calls, exclusive staging region. This is
 * a C API, NOT a wire layout. The USB adapter must decode bounded requests. */
struct mu_context {
    uint8_t *staging;
    uint32_t capacity, received, generation, last_transaction;
    uint8_t base[MU_DIGEST_BYTES], session[MU_DIGEST_BYTES];
    uint8_t active[MU_DIGEST_BYTES], previous[MU_DIGEST_BYTES];
    struct mu_offer offer;
    struct mu_backend backend;
    enum mu_phase phase;
    unsigned initialized, prepared, publication_started, active_known, outcome;
};
int mu_init(struct mu_context *, uint8_t *, uint32_t, const uint8_t *,
            const uint8_t *, const uint8_t *, uint32_t, const struct mu_backend *);
enum mu_result mu_enter(struct mu_context *);
enum mu_result mu_begin(struct mu_context *, const struct mu_offer *);
enum mu_result mu_chunk(struct mu_context *, uint32_t, uint32_t, const uint8_t *, uint32_t);
enum mu_result mu_verify(struct mu_context *, uint32_t);
enum mu_result mu_commit(struct mu_context *, uint32_t);
enum mu_result mu_accept(struct mu_context *, uint32_t);
enum mu_result mu_abort(struct mu_context *, uint32_t);
enum mu_result mu_rollback(struct mu_context *, uint32_t);
enum mu_result mu_leave(struct mu_context *);
enum mu_result mu_disconnect(struct mu_context *);
void mu_sha256(const uint8_t *, uint32_t, uint8_t[MU_DIGEST_BYTES]);
#endif
