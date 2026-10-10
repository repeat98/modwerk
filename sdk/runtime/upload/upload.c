/* SPDX-License-Identifier: GPL-3.0-or-later
 * No OS calls, malloc, filesystem, raw destination addresses or flash writes.
 * Preparation/publishing is deliberately impossible without a complete adapter. */
#include "upload.h"

enum { OUTCOME_NONE, OUTCOME_ABORT, OUTCOME_ACCEPT, OUTCOME_ROLLBACK };
static void copy(void *dst, const void *src, uint32_t n)
{
    volatile uint8_t *d = dst; const uint8_t *s = src;
    for (uint32_t i = 0; i < n; ++i) {
        uint8_t value = s[i];
        /* Separate the read and write: the port has not qualified a combined
         * displaced/postincrement MOVE. See octabam's allocator copy trap. */
#ifdef __m68k__
        __asm__ volatile ("" : "+d" (value) : : "memory");
#else
        __asm__ volatile ("" : "+r" (value) : : "memory");
#endif
        d[i] = value;
    }
}
static int equal(const uint8_t *a, const uint8_t *b, uint32_t n)
{
    unsigned different = 0;
    for (uint32_t i = 0; i < n; ++i) different |= (unsigned)(a[i] ^ b[i]);
    return different == 0;
}
static int live(const struct mu_context *c) { return c && c->initialized; }
static int safe(struct mu_context *c) { return c->backend.safe(c->backend.user) == 1; }
static int token(const struct mu_context *c, uint32_t tx) { return tx && tx == c->offer.transaction; }
static int matches(const struct mu_offer *a, const struct mu_offer *b)
{
    return a->transaction == b->transaction && a->generation == b->generation &&
        a->length == b->length && equal(a->base, b->base, MU_DIGEST_BYTES) &&
        equal(a->session, b->session, MU_DIGEST_BYTES) && equal(a->digest, b->digest, MU_DIGEST_BYTES);
}
static enum mu_result discard(struct mu_context *c)
{
    if (c->prepared && c->backend.discard(c->backend.user) != 1) {
        c->phase = MU_RECOVERY;
        return MU_NEEDS_RECOVERY;
    }
    c->prepared = c->publication_started = c->received = 0;
    c->phase = MU_READY;
    c->outcome = OUTCOME_ABORT;
    return MU_OK;
}
static int digest_matches(struct mu_context *c)
{
    uint8_t digest[MU_DIGEST_BYTES];
    mu_sha256(c->staging, c->offer.length, digest);
    return equal(digest, c->offer.digest, MU_DIGEST_BYTES);
}
int mu_init(struct mu_context *c, uint8_t *stage, uint32_t capacity, const uint8_t *base,
            const uint8_t *session, const uint8_t *active, uint32_t generation,
            const struct mu_backend *b)
{
    if (!c) return 0;
    uint8_t *p = (uint8_t *)c;
    for (uint32_t i = 0; i < sizeof *c; ++i) p[i] = 0;
    if (!stage || !capacity || capacity > MU_MAX_BYTES || !base || !session || !active || !b ||
        !b->enter || !b->safe || !b->leave || !b->prepare || !b->discard || !b->publish ||
        !b->restore || !b->retire) return 0;
    unsigned nonce = 0;
    for (uint32_t i = 0; i < MU_DIGEST_BYTES; ++i) nonce |= session[i];
    if (!nonce) return 0; /* Adapter must supply a fresh boot/session identity. */
    c->staging = stage; c->capacity = capacity; c->generation = generation;
    copy(c->base, base, MU_DIGEST_BYTES); copy(c->session, session, MU_DIGEST_BYTES);
    copy(c->active, active, MU_DIGEST_BYTES); copy(&c->backend, b, sizeof *b);
    c->phase = MU_NORMAL; c->active_known = c->initialized = 1;
    return 1;
}
enum mu_result mu_enter(struct mu_context *c)
{
    if (!live(c)) return MU_STATE;
    if (c->phase == MU_READY) return safe(c) ? MU_OK : MU_UNSAFE;
    if (c->phase != MU_NORMAL && c->phase != MU_TRIAL) return MU_STATE;
    unsigned trial = c->phase == MU_TRIAL;
    int held = c->backend.enter(c->backend.user); /* 0: not stopped (playing or recording) */
    if (held != 1) return held == 0 ? MU_UNSAFE : MU_BACKEND;
    c->phase = trial ? MU_PENDING : MU_READY;
    return safe(c) ? MU_OK : MU_UNSAFE;
}
enum mu_result mu_begin(struct mu_context *c, const struct mu_offer *o)
{
    if (!live(c) || !o) return MU_STATE;
    if ((c->phase == MU_RECEIVING || c->phase == MU_VERIFIED) && matches(&c->offer, o))
        return safe(c) ? MU_OK : MU_UNSAFE;
    if (c->phase != MU_READY) return MU_STATE;
    if (!equal(o->base, c->base, MU_DIGEST_BYTES) || !equal(o->session, c->session, MU_DIGEST_BYTES))
        return MU_IDENTITY;
    if (!o->transaction || o->transaction <= c->last_transaction || o->generation != c->generation)
        return MU_STALE;
    /* Leave a generation for publication and another for confirmed rollback. */
    if (!o->length || o->length > c->capacity || c->generation > UINT32_MAX - 2u) return MU_LIMIT;
    if (!safe(c)) return MU_UNSAFE;
    copy(&c->offer, o, sizeof *o);
    c->last_transaction = o->transaction; c->received = c->prepared = c->publication_started = 0;
    c->outcome = OUTCOME_NONE; c->phase = MU_RECEIVING;
    return MU_OK;
}
enum mu_result mu_chunk(struct mu_context *c, uint32_t tx, uint32_t offset, const uint8_t *data, uint32_t n)
{
    if (!live(c) || c->phase != MU_RECEIVING) return MU_STATE;
    if (!token(c, tx)) return MU_STALE;
    if (!data || !n || n > MU_MAX_CHUNK || offset > c->offer.length || n > c->offer.length - offset)
        return MU_LENGTH;
    if (!safe(c)) return MU_UNSAFE;
    if (offset < c->received) {
        if (n > c->received - offset) return MU_CONFLICT; /* No partially overlapping retries. */
        return equal(c->staging + offset, data, n) ? MU_OK : MU_CONFLICT;
    }
    if (offset != c->received) return MU_LENGTH;
    copy(c->staging + offset, data, n); c->received += n;
    return MU_OK;
}
enum mu_result mu_verify(struct mu_context *c, uint32_t tx)
{
    if (!live(c)) return MU_STATE;
    if (!token(c, tx)) return MU_STALE;
    if (c->phase == MU_VERIFIED) return MU_OK;
    if (c->phase != MU_RECEIVING) return MU_STATE;
    if (c->received != c->offer.length) return MU_LENGTH;
    if (!safe(c)) return MU_UNSAFE;
    if (!digest_matches(c)) return MU_HASH;
    c->prepared = 1; /* A partial prepare must also be cleaned up on refusal. */
    if (c->backend.prepare(c->backend.user, c->staging, c->offer.length) != 1) {
        enum mu_result result = discard(c);
        return result == MU_OK ? MU_REJECTED : result;
    }
    if (!safe(c)) {
        enum mu_result result = discard(c);
        return result == MU_OK ? MU_UNSAFE : result;
    }
    c->phase = MU_VERIFIED;
    return MU_OK;
}
enum mu_result mu_commit(struct mu_context *c, uint32_t tx)
{
    if (!live(c)) return MU_STATE;
    if (!token(c, tx)) return MU_STALE;
    if (c->phase == MU_PENDING || c->phase == MU_TRIAL || (c->outcome == OUTCOME_ACCEPT &&
        (c->phase == MU_READY || c->phase == MU_NORMAL))) return MU_OK;
    if (c->phase == MU_RECOVERY) return MU_NEEDS_RECOVERY;
    if (c->phase != MU_VERIFIED) return MU_STATE;
    if (!safe(c)) return MU_UNSAFE;
    if (!digest_matches(c)) {
        enum mu_result result = discard(c);
        return result == MU_OK ? MU_HASH : result;
    }
    /* Hashing is task work; recheck the hold immediately before publication. */
    if (!safe(c)) return MU_UNSAFE;
    copy(c->previous, c->active, MU_DIGEST_BYTES);
    c->publication_started = 1;
    enum mu_publication result = c->backend.publish(c->backend.user);
    if (result == MU_UNCHANGED) {
        c->publication_started = 0;
        enum mu_result cleanup = discard(c);
        return cleanup == MU_OK ? MU_BACKEND : cleanup;
    }
    if (result != MU_APPLIED) {
        c->active_known = 0; c->phase = MU_RECOVERY;
        return MU_NEEDS_RECOVERY;
    }
    copy(c->active, c->offer.digest, MU_DIGEST_BYTES); ++c->generation;
    c->phase = MU_PENDING;
    return MU_OK;
}
enum mu_result mu_accept(struct mu_context *c, uint32_t tx)
{
    if (!live(c)) return MU_STATE;
    if (!token(c, tx)) return MU_STALE;
    if (c->outcome == OUTCOME_ACCEPT && (c->phase == MU_READY || c->phase == MU_NORMAL)) return MU_OK;
    if (c->phase != MU_PENDING) return MU_STATE;
    if (!safe(c)) return MU_UNSAFE;
    if (c->backend.retire(c->backend.user) != 1) return MU_BACKEND;
    c->prepared = c->publication_started = 0; c->phase = MU_READY; c->outcome = OUTCOME_ACCEPT;
    return MU_OK;
}
enum mu_result mu_abort(struct mu_context *c, uint32_t tx)
{
    if (!live(c)) return MU_STATE;
    if (!token(c, tx)) return MU_STALE;
    if (c->outcome == OUTCOME_ABORT && c->phase == MU_READY) return MU_OK;
    if (c->phase != MU_RECEIVING && c->phase != MU_VERIFIED) return MU_STATE;
    return discard(c);
}
enum mu_result mu_rollback(struct mu_context *c, uint32_t tx)
{
    if (!live(c)) return MU_STATE;
    if (!token(c, tx)) return MU_STALE;
    if (c->outcome == OUTCOME_ROLLBACK && (c->phase == MU_READY || c->phase == MU_NORMAL)) return MU_OK;
    if (c->phase != MU_PENDING && c->phase != MU_RECOVERY) return MU_STATE;
    if (!safe(c)) return MU_UNSAFE;
    if (!c->publication_started) return discard(c);
    if (c->backend.restore(c->backend.user) != 1) {
        c->phase = MU_RECOVERY; c->active_known = 0;
        return MU_NEEDS_RECOVERY;
    }
    copy(c->active, c->previous, MU_DIGEST_BYTES); ++c->generation;
    c->active_known = 1; c->prepared = c->publication_started = 0;
    c->phase = MU_READY; c->outcome = OUTCOME_ROLLBACK;
    return MU_OK;
}
enum mu_result mu_leave(struct mu_context *c)
{
    if (!live(c)) return MU_STATE;
    if (c->phase == MU_NORMAL || c->phase == MU_TRIAL) return MU_OK;
    if ((c->phase != MU_READY && c->phase != MU_PENDING) || !c->active_known) return MU_STATE;
    if (c->backend.leave(c->backend.user) != 1) return MU_BACKEND;
    c->phase = c->phase == MU_PENDING ? MU_TRIAL : MU_NORMAL;
    return MU_OK;
}
int mu_disconnecting;
enum mu_result mu_disconnect(struct mu_context *c)
{
    if (!live(c)) return MU_STATE;
    enum mu_result result = MU_OK;
    if (c->phase == MU_TRIAL) {
        mu_disconnecting = 1;
        result = mu_enter(c);
        mu_disconnecting = 0;
        if (result != MU_OK) return result;
    }
    if (c->phase == MU_RECEIVING || c->phase == MU_VERIFIED) result = mu_abort(c, c->offer.transaction);
    else if (c->phase == MU_PENDING || c->phase == MU_RECOVERY) result = mu_rollback(c, c->offer.transaction);
    return result == MU_OK ? mu_leave(c) : result;
}
