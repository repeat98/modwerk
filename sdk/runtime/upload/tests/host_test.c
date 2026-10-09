/* SPDX-License-Identifier: GPL-3.0-or-later
 * Fault injection against real controller bytes; no firmware or USB access. */
#include "wire.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>

struct fixture {
    struct mu_context c;
    struct mu_backend b;
    struct mu_offer o;
    uint8_t guarded[1026], payload[128], old[MU_DIGEST_BYTES];
    int held, playing, recording, callbacks, enter_ok, leave_ok, prepare_ok;
    int discard_ok, restore_ok, retire_ok, prepare_plays, unsafe_at;
    enum mu_publication publication;
    unsigned enters, leaves, prepares, discards, publishes, restores, retires, safe_calls;
    unsigned cores[2], candidate, retained;
};
static int enter(void *u)
{
    struct fixture *f = u; ++f->enters;
    if (!f->enter_ok || f->playing || f->recording || f->callbacks) return 0;
    f->held = 1; return 1;
}
static int safe(void *u)
{
    struct fixture *f = u; ++f->safe_calls;
    if (f->unsafe_at && f->safe_calls == (unsigned)f->unsafe_at) f->playing = 1;
    return f->held && !f->playing && !f->recording && !f->callbacks;
}
static int leave(void *u)
{
    struct fixture *f = u; ++f->leaves;
    if (!f->leave_ok) return 0;
    f->held = 0; return 1;
}
static int prepare(void *u, const uint8_t *bytes, uint32_t n)
{
    struct fixture *f = u; ++f->prepares;
    assert(f->held && n == f->o.length && !memcmp(bytes, f->payload, n));
    assert(f->cores[0] == f->cores[1]);
    f->candidate = 1;
    if (f->prepare_plays) f->playing = 1;
    return f->prepare_ok;
}
static int discard(void *u)
{
    struct fixture *f = u; ++f->discards;
    assert(f->cores[0] == f->cores[1]);
    if (!f->discard_ok) return 0;
    f->candidate = 0; return 1;
}
static enum mu_publication publish(void *u)
{
    struct fixture *f = u; ++f->publishes;
    assert(f->held && !f->playing && !f->recording && !f->callbacks && f->candidate);
    if (f->publication == MU_UNCHANGED) return f->publication;
    f->retained = 1; f->cores[0] = 1;
    if (f->publication == MU_APPLIED) f->cores[1] = 1;
    return f->publication;
}
static int restore(void *u)
{
    struct fixture *f = u; ++f->restores; assert(f->held);
    if (!f->restore_ok) return 0;
    f->cores[0] = f->cores[1] = 0; f->candidate = f->retained = 0; return 1;
}
static int retire(void *u)
{
    struct fixture *f = u; ++f->retires;
    assert(f->held && f->cores[0] == 1 && f->cores[1] == 1 && f->retained);
    if (!f->retire_ok) return 0;
    f->retained = 0; return 1;
}
static void init(struct fixture *f)
{
    memset(f, 0, sizeof *f); memset(f->guarded, 0xa5, sizeof f->guarded);
    memset(f->old, 0xaa, sizeof f->old);
    for (unsigned i = 0; i < sizeof f->payload; ++i) f->payload[i] = (uint8_t)(i * 13u);
    memset(f->o.base, 1, MU_DIGEST_BYTES); memset(f->o.session, 2, MU_DIGEST_BYTES);
    f->o.transaction = 10; f->o.generation = 4; f->o.length = sizeof f->payload;
    mu_sha256(f->payload, f->o.length, f->o.digest);
    f->b = (struct mu_backend){f,enter,safe,leave,prepare,discard,publish,restore,retire};
    f->enter_ok=f->leave_ok=f->prepare_ok=f->discard_ok=f->restore_ok=f->retire_ok=1;
    f->publication = MU_APPLIED;
    assert(mu_init(&f->c, f->guarded + 1, 1024, f->o.base, f->o.session, f->old, 4, &f->b));
}
static void invariant(const struct fixture *f)
{
    assert(f->guarded[0] == 0xa5 && f->guarded[1025] == 0xa5);
    assert(f->c.received <= f->c.offer.length && f->c.offer.length <= f->c.capacity);
    if (f->c.phase == MU_NORMAL || f->c.phase == MU_TRIAL) assert(!f->held);
    if (!f->c.active_known) assert(f->c.phase == MU_RECOVERY && f->held);
}
static void staged(struct fixture *f)
{
    assert(mu_enter(&f->c) == MU_OK);
    assert(mu_begin(&f->c, &f->o) == MU_OK);
    assert(mu_chunk(&f->c, 10, 0, f->payload, f->o.length) == MU_OK);
}
static void verified(struct fixture *f) { staged(f); assert(mu_verify(&f->c, 10) == MU_OK); }
static void active(struct fixture *f) { verified(f); assert(mu_commit(&f->c, 10) == MU_OK); }
static void success(void)
{
    struct fixture f; init(&f); staged(&f);
    assert(mu_begin(&f.c, &f.o) == MU_OK && f.c.received == 128);
    assert(mu_chunk(&f.c, 10, 0, f.payload, 128) == MU_OK);
    assert(mu_verify(&f.c, 10) == MU_OK && mu_verify(&f.c, 10) == MU_OK && f.prepares == 1);
    assert(mu_commit(&f.c, 10) == MU_OK && mu_commit(&f.c, 10) == MU_OK && f.publishes == 1);
    assert(f.c.generation == 5 && !memcmp(f.c.active, f.o.digest, MU_DIGEST_BYTES) && f.retained);
    assert(mu_leave(&f.c) == MU_OK && f.c.phase == MU_TRIAL && f.retained);
    /* Audio diagnostics can run here, retaining the rollback set. */
    assert(mu_accept(&f.c, 10) == MU_STATE && mu_begin(&f.c, &f.o) == MU_STATE);
    assert(mu_commit(&f.c, 10) == MU_OK && f.publishes == 1);
    assert(mu_enter(&f.c) == MU_OK && f.c.phase == MU_PENDING);
    assert(mu_accept(&f.c, 10) == MU_OK && mu_accept(&f.c, 10) == MU_OK && f.retires == 1);
    assert(mu_leave(&f.c) == MU_OK && mu_commit(&f.c, 10) == MU_OK && !f.retained);
    invariant(&f);
}
static void input_refusals(void)
{
    struct fixture f; init(&f);
    assert(mu_begin(&f.c, &f.o) == MU_STATE);
    f.recording = 1; assert(mu_enter(&f.c) == MU_BACKEND && !f.held);
    f.recording = 0; assert(mu_enter(&f.c) == MU_OK);
    struct mu_offer o = f.o;
    o.base[0] ^= 1; assert(mu_begin(&f.c, &o) == MU_IDENTITY); o = f.o;
    o.session[0] ^= 1; assert(mu_begin(&f.c, &o) == MU_IDENTITY); o = f.o;
    o.generation--; assert(mu_begin(&f.c, &o) == MU_STALE); o = f.o;
    o.transaction = 0; assert(mu_begin(&f.c, &o) == MU_STALE); o = f.o;
    o.length = 0; assert(mu_begin(&f.c, &o) == MU_LIMIT);
    o.length = 1025; assert(mu_begin(&f.c, &o) == MU_LIMIT);
    f.playing = 1; assert(mu_begin(&f.c, &f.o) == MU_UNSAFE); f.playing = 0;
    assert(mu_begin(&f.c, &f.o) == MU_OK);
    assert(mu_chunk(&f.c, 9, 0, f.payload, 8) == MU_STALE);
    assert(mu_chunk(&f.c, 10, UINT32_MAX, f.payload, 8) == MU_LENGTH);
    assert(mu_chunk(&f.c, 10, 0, f.payload, UINT32_MAX) == MU_LENGTH);
    assert(mu_chunk(&f.c, 10, 0, f.payload, 0) == MU_LENGTH);
    assert(mu_chunk(&f.c, 10, 0, 0, 8) == MU_LENGTH);
    assert(mu_chunk(&f.c, 10, 1, f.payload, 8) == MU_LENGTH);
    assert(mu_verify(&f.c, 10) == MU_LENGTH && f.prepares == 0);
    assert(mu_chunk(&f.c, 10, 0, f.payload, 8) == MU_OK);
    assert(mu_chunk(&f.c, 10, 4, f.payload + 4, 8) == MU_CONFLICT);
    uint8_t different[8] = {0};
    assert(mu_chunk(&f.c, 10, 0, different, 8) == MU_CONFLICT);
    assert(f.c.received == 8 && !memcmp(f.c.staging, f.payload, 8) && f.publishes == 0);
    assert(mu_abort(&f.c, 10) == MU_OK && mu_begin(&f.c, &f.o) == MU_STALE);
    invariant(&f);
}
static void corruption(void)
{
    struct fixture f; init(&f); staged(&f); f.c.staging[0] ^= 1;
    assert(mu_verify(&f.c, 10) == MU_HASH && !f.prepares && !f.publishes);
    assert(mu_disconnect(&f.c) == MU_OK && !memcmp(f.c.active, f.old, MU_DIGEST_BYTES));
    init(&f); verified(&f); f.c.staging[0] ^= 1;
    assert(mu_commit(&f.c, 10) == MU_HASH && !f.publishes && f.discards == 1 && !f.candidate);
    invariant(&f);
}
static void prepare_failure(void)
{
    struct fixture f; init(&f); staged(&f); f.prepare_ok = 0;
    assert(mu_verify(&f.c, 10) == MU_REJECTED && f.discards == 1 && !f.candidate);
    init(&f); staged(&f); f.prepare_plays = 1;
    assert(mu_verify(&f.c, 10) == MU_UNSAFE && f.discards == 1 && !f.publishes);
    init(&f); staged(&f); f.prepare_ok = f.discard_ok = 0;
    assert(mu_verify(&f.c, 10) == MU_NEEDS_RECOVERY && f.c.phase == MU_RECOVERY);
    assert(mu_leave(&f.c) == MU_STATE && !f.leaves && f.candidate);
    f.discard_ok = 1;
    assert(mu_disconnect(&f.c) == MU_OK && f.discards == 2 && !f.candidate && !f.restores);
    invariant(&f);
}
static void stopped_activation(void)
{
    struct fixture f; init(&f); verified(&f); f.recording = 1;
    assert(mu_commit(&f.c, 10) == MU_UNSAFE && !f.publishes);
    f.recording = 0; f.callbacks = 1;
    assert(mu_commit(&f.c, 10) == MU_UNSAFE && !f.publishes);
    f.callbacks = 0; f.unsafe_at = (int)f.safe_calls + 2;
    assert(mu_commit(&f.c, 10) == MU_UNSAFE && !f.publishes);
    f.playing = 0; f.unsafe_at = 0;
    assert(mu_commit(&f.c, 10) == MU_OK);
    invariant(&f);
}
static void publication_failures(void)
{
    struct fixture f; init(&f); verified(&f); f.publication = MU_UNCHANGED;
    assert(mu_commit(&f.c, 10) == MU_BACKEND && f.c.phase == MU_READY && !f.retained && !f.candidate);
    init(&f); verified(&f); f.publication = MU_UNCERTAIN; f.restore_ok = 0;
    assert(mu_commit(&f.c, 10) == MU_NEEDS_RECOVERY && !f.c.active_known && f.retained);
    assert(mu_commit(&f.c, 10) == MU_NEEDS_RECOVERY && f.publishes == 1);
    assert(mu_accept(&f.c, 10) == MU_STATE && mu_leave(&f.c) == MU_STATE);
    assert(mu_disconnect(&f.c) == MU_NEEDS_RECOVERY && !f.leaves && f.retained);
    f.restore_ok = 1;
    assert(mu_disconnect(&f.c) == MU_OK && f.c.active_known && f.c.generation == 5);
    assert(!memcmp(f.c.active, f.old, MU_DIGEST_BYTES) && !f.retained && !f.candidate);
    assert(mu_rollback(&f.c, 10) == MU_OK && f.restores == 2);
    init(&f); verified(&f); f.publication = (enum mu_publication)99;
    assert(mu_commit(&f.c, 10) == MU_NEEDS_RECOVERY && mu_leave(&f.c) == MU_STATE);
    invariant(&f);
}
static void rollback_and_disconnect(void)
{
    struct fixture f; init(&f); staged(&f);
    assert(mu_disconnect(&f.c) == MU_OK && !f.publishes && !f.discards);
    init(&f); verified(&f);
    assert(mu_disconnect(&f.c) == MU_OK && f.discards == 1 && !f.publishes);
    init(&f); active(&f);
    assert(mu_leave(&f.c) == MU_OK && f.retained);
    f.playing = 1;
    assert(mu_disconnect(&f.c) == MU_BACKEND && f.c.phase == MU_TRIAL && f.retained);
    f.playing = 0;
    assert(mu_disconnect(&f.c) == MU_OK && f.c.generation == 6 && !f.retained);
    assert(mu_rollback(&f.c, 10) == MU_OK && f.restores == 1);
    assert(mu_accept(&f.c, 10) == MU_STATE && !f.retires);
    assert(!memcmp(f.c.active, f.old, MU_DIGEST_BYTES));
    invariant(&f);
}
static void retirement_and_retries(void)
{
    struct fixture f; init(&f); active(&f); f.retire_ok = 0;
    assert(mu_accept(&f.c, 10) == MU_BACKEND && f.retained && f.c.phase == MU_PENDING);
    assert(mu_begin(&f.c, &f.o) == MU_STATE && mu_abort(&f.c, 10) == MU_STATE);
    assert(mu_rollback(&f.c, 10) == MU_OK && f.c.generation == 6);
    init(&f); active(&f); f.leave_ok = 0;
    assert(mu_leave(&f.c) == MU_BACKEND && f.c.phase == MU_PENDING && f.retained);
    f.leave_ok = 1;
    assert(mu_accept(&f.c, 10) == MU_OK && mu_leave(&f.c) == MU_OK);
    assert(mu_enter(&f.c) == MU_OK); f.o.transaction++; f.o.generation = 5;
    assert(mu_begin(&f.c, &f.o) == MU_OK && mu_chunk(&f.c, 10, 0, f.payload, 8) == MU_STALE);
    assert(mu_abort(&f.c, 10) == MU_STALE && mu_commit(&f.c, 10) == MU_STALE);
    invariant(&f);
}
static void initialization_and_exhaustion(void)
{
    struct fixture f; init(&f); struct mu_backend b = f.b; b.restore = 0;
    assert(!mu_init(&f.c, f.guarded + 1, 1024, f.o.base, f.o.session, f.old, 4, &b));
    assert(mu_enter(&f.c) == MU_STATE);
    init(&f);
    assert(!mu_init(&f.c, f.guarded + 1, MU_MAX_BYTES + 1u, f.o.base, f.o.session, f.old, 4, &f.b));
    init(&f); memset(f.o.session, 0, MU_DIGEST_BYTES);
    assert(!mu_init(&f.c, f.guarded + 1, 1024, f.o.base, f.o.session, f.old, 4, &f.b));
    init(&f); f.c.generation = f.o.generation = UINT32_MAX - 1u;
    assert(mu_enter(&f.c) == MU_OK && mu_begin(&f.c, &f.o) == MU_LIMIT);
    init(&f); f.c.generation = f.o.generation = UINT32_MAX - 2u;
    active(&f); assert(mu_rollback(&f.c, 10) == MU_OK && f.c.generation == UINT32_MAX);
    f.o.generation = UINT32_MAX; f.o.transaction++;
    assert(mu_begin(&f.c, &f.o) == MU_LIMIT);
    invariant(&f);
}
static uint32_t rng(uint32_t *seed) { *seed = *seed * 1664525u + 1013904223u; return *seed; }
static void malformed_chunks(void)
{
    struct fixture f; init(&f); staged(&f); assert(mu_abort(&f.c, 10) == MU_OK);
    f.o.transaction++; assert(mu_begin(&f.c, &f.o) == MU_OK);
    uint32_t seed = 73;
    for (unsigned i = 0; i < 10000; ++i) {
        uint8_t before[1024]; memcpy(before, f.c.staging, sizeof before);
        uint32_t received = f.c.received, offset = rng(&seed), n = rng(&seed), tx = rng(&seed);
        enum mu_result r = mu_chunk(&f.c, tx, offset, f.payload, n);
        assert(r != MU_OK && received == f.c.received && !memcmp(before, f.c.staging, sizeof before));
        invariant(&f);
    }
}
static void hash_vectors(void)
{
    const char *expected = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
    uint8_t bytes[MU_DIGEST_BYTES]; char hex[65];
    mu_sha256((const uint8_t *)"abc", 3, bytes);
    for (unsigned i = 0; i < MU_DIGEST_BYTES; ++i) snprintf(hex + i * 2, 3, "%02x", bytes[i]);
    assert(!strcmp(hex, expected));
}
static void put32(uint8_t *p, uint32_t n)
{
    for (unsigned i=0; i<4; ++i) p[i]=(uint8_t)(n>>(24u-8u*i));
}
static void frame(struct fixture *f, uint8_t *r, unsigned cmd, uint32_t tx, uint32_t size)
{
    memset(r, 0, MU_WIRE_HEADER);
    memcpy(r, "MWUP", 4); r[5]=MU_WIRE_VERSION; r[7]=(uint8_t)cmd;
    put32(r+8, tx); put32(r+12, size); memcpy(r+16, f->o.session, MU_DIGEST_BYTES);
}
static enum mu_result request(struct fixture *f, uint8_t *r, uint32_t length)
{
    uint8_t guarded[MU_WIRE_RESPONSE+2]; memset(guarded, 0xa5, sizeof guarded);
    assert(mu_request(&f->c, r, length, guarded+1, MU_WIRE_RESPONSE)==MU_WIRE_RESPONSE);
    assert(guarded[0]==0xa5 && guarded[MU_WIRE_RESPONSE+1]==0xa5);
    assert(!memcmp(guarded+1, "MWUR", 4)); invariant(f);
    return (enum mu_result)guarded[20]; /* BE result low byte at response offset 19. */
}
static void wire_protocol(void)
{
    struct fixture f; init(&f); uint8_t r[MU_WIRE_MAX], out[MU_WIRE_RESPONSE];
    frame(&f,r,MU_ENTER,0,0);
    assert(!mu_request(&f.c,r,MU_WIRE_HEADER,out,MU_WIRE_RESPONSE-1) && !f.enters);
    r[5]++; assert(request(&f,r,MU_WIRE_HEADER)==MU_LENGTH && !f.enters); r[5]--;
    r[16]^=1; assert(request(&f,r,MU_WIRE_HEADER)==MU_IDENTITY && !f.enters);
    frame(&f,r,MU_HELLO,0,0); memset(r+16,0,32);
    assert(request(&f,r,MU_WIRE_HEADER)==MU_OK && !f.enters);
    frame(&f,r,MU_ENTER,0,0); assert(request(&f,r,MU_WIRE_HEADER)==MU_OK);
    frame(&f,r,MU_BEGIN,10,72);
    memcpy(r+MU_WIRE_HEADER,f.o.base,32); memcpy(r+MU_WIRE_HEADER+32,f.o.digest,32);
    put32(r+MU_WIRE_HEADER+64,4); put32(r+MU_WIRE_HEADER+68,128);
    assert(request(&f,r,MU_WIRE_HEADER+71)==MU_LENGTH && f.c.phase==MU_READY);
    assert(request(&f,r,MU_WIRE_HEADER+72)==MU_OK);
    frame(&f,r,MU_CHUNK,10,132); put32(r+MU_WIRE_HEADER,0);
    memcpy(r+MU_WIRE_HEADER+4,f.payload,128);
    r[16]^=1; assert(request(&f,r,MU_WIRE_HEADER+132)==MU_IDENTITY && !f.c.received); r[16]^=1;
    assert(request(&f,r,MU_WIRE_HEADER+132)==MU_OK && f.c.received==128);
    frame(&f,r,MU_VERIFY,10,0); assert(request(&f,r,MU_WIRE_HEADER)==MU_OK);
    frame(&f,r,MU_COMMIT,10,0); assert(request(&f,r,MU_WIRE_HEADER)==MU_OK);
    frame(&f,r,MU_LEAVE,9,0); assert(request(&f,r,MU_WIRE_HEADER)==MU_STALE && !f.leaves);
    frame(&f,r,MU_LEAVE,10,0); assert(request(&f,r,MU_WIRE_HEADER)==MU_OK && f.c.phase==MU_TRIAL);
    frame(&f,r,MU_DISCONNECT,10,0);
    assert(request(&f,r,MU_WIRE_HEADER)==MU_OK && !f.retained && f.restores==1);
    frame(&f,r,MU_HELLO,0,0);
    for (unsigned n=0; n<MU_WIRE_HEADER; ++n) assert(request(&f,r,n)==MU_LENGTH);
    frame(&f,r,255,0,0); assert(request(&f,r,MU_WIRE_HEADER)==MU_STATE);
    assert(request(&f,r,UINT32_MAX)==MU_LENGTH);
    uint32_t seed=1776;
    for (unsigned i=0; i<10000; ++i) {
        for (unsigned j=0; j<sizeof r; ++j) r[j]=(uint8_t)(rng(&seed)>>24);
        r[0]=0; /* Malformed envelope, independent of random command bytes. */
        uint32_t n=rng(&seed)%(MU_WIRE_MAX+1u);
        assert(request(&f,r,n)==MU_LENGTH && f.enters==2 && f.publishes==1);
    }
}
int main(void)
{
    hash_vectors(); success(); input_refusals(); corruption(); prepare_failure();
    stopped_activation(); publication_failures(); rollback_and_disconnect();
    retirement_and_retries(); initialization_and_exhaustion(); malformed_chunks(); wire_protocol();
    puts("Upload controller: 12 fault/acceptance groups passed; 20,000 malformed chunks/frames refused.");
    return 0;
}
