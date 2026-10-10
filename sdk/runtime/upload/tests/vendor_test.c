/* SPDX-License-Identifier: GPL-3.0-or-later
 * EP0 transport state machine against the real controller. vendor.c is
 * compiled with its controller calls renamed to the counters below, so every
 * execution is observed. No firmware, USB stack or device. */
#include "vendor.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static unsigned executed, disconnected, failures;
uint32_t counted_request(struct mu_context *c, const uint8_t *r, uint32_t n, uint8_t *out, uint32_t cap)
{
    executed++;
    return mu_request(c, r, n, out, cap);
}
enum mu_result counted_disconnect(struct mu_context *c)
{
    disconnected++;
    return mu_disconnect(c);
}
#define CHECK(x) do { if (!(x)) { failures++; fprintf(stderr, "%s:%d: %s\n", __FILE__, __LINE__, #x); } } while (0)

static int ok(void *p) { (void)p; return 1; }
static int prepare(void *p, const uint8_t *d, uint32_t n) { (void)p; (void)d; (void)n; return 1; }
static enum mu_publication publish(void *p) { (void)p; return MU_APPLIED; }
static uint8_t stage[65536], base[32], session[32], active[32];
static struct mu_context controller;
static struct mv_transport t;

static void reset_all(void)
{
    struct mu_backend b = {0, ok, ok, ok, prepare, ok, publish, ok, ok};
    memset(base, 0x31, 32); memset(session, 0x52, 32); memset(active, 0x41, 32);
    memset(&controller, 0, sizeof controller);
    if (!mu_init(&controller, stage, sizeof stage, base, session, active, 0, &b)) abort();
    if (!mv_init(&t, 6, base, "OCTATRACK TEST", MV_CAN_SUBMIT)) abort();
    executed = disconnected = 0;
}
static void put32(uint8_t *p, uint32_t n) { p[0]=(uint8_t)(n>>24); p[1]=(uint8_t)(n>>16); p[2]=(uint8_t)(n>>8); p[3]=(uint8_t)n; }
static uint32_t get32(const uint8_t *p) { return (uint32_t)p[0]<<24 | (uint32_t)p[1]<<16 | (uint32_t)p[2]<<8 | p[3]; }
/* A wire frame: HELLO echoes any transaction, so it tags executions. */
static uint32_t frame(uint8_t *f, unsigned command, uint32_t tx, uint32_t body)
{
    memset(f, 0, MU_WIRE_HEADER + body);
    memcpy(f, "MWUP", 4); f[5] = MU_WIRE_VERSION; f[6] = (uint8_t)(command >> 8); f[7] = (uint8_t)command;
    put32(f+8, tx); put32(f+12, body); memcpy(f+16, session, 32);
    return MU_WIRE_HEADER + body;
}
static void setup(uint8_t *s, uint8_t type, uint8_t request, uint16_t value, uint16_t index, uint16_t length)
{
    s[0]=type; s[1]=request; s[2]=(uint8_t)value; s[3]=(uint8_t)(value>>8);
    s[4]=(uint8_t)index; s[5]=(uint8_t)(index>>8); s[6]=(uint8_t)length; s[7]=(uint8_t)(length>>8);
}
static struct mv_reply ask(uint8_t type, uint8_t request, uint16_t value, uint16_t index, uint16_t length)
{
    uint8_t s[8];
    setup(s, type, request, value, index, length);
    return mv_setup(&t, s);
}
static struct mv_reply result(void) { return ask(MV_RESULT_TYPE, MV_RESULT, 0, 6, MV_RESULT_BYTES); }
static int submit(uint16_t sequence, const uint8_t *f, uint32_t n)
{
    struct mv_reply r = ask(MV_SUBMIT_TYPE, MV_SUBMIT, sequence, 6, (uint16_t)n);
    if (r.action != MV_RECEIVE) return 0;
    if (r.buffer != t.frame || r.length != n) { failures++; return 0; }
    memcpy(r.buffer, f, n);
    return mv_data(&t, n);
}
static int status_is(struct mv_reply r, enum mv_status status, uint16_t sequence)
{
    uint32_t want = status == MV_READY ? MV_RESULT_BYTES : MV_RESULT_HEADER;
    return r.action == MV_SEND && r.length == want && !memcmp(r.buffer, "MWUT", 4) &&
        r.buffer[4] == MV_VERSION && r.buffer[5] == status &&
        (r.buffer[6] << 8 | r.buffer[7]) == sequence;
}

static void routing(void)
{
    reset_all();
    CHECK(status_is(result(), MV_NONE, 0));
    CHECK(ask(0x80, 6, 0x0100, 0, 18).action == MV_PASS);           /* GET_DESCRIPTOR */
    CHECK(ask(0x21, 1, 0x0100, 6, 4).action == MV_PASS);             /* Class, our interface. */
    CHECK(ask(0xa1, 1, 0x0100, 3, 4).action == MV_PASS);             /* Audio's clock source. */
    CHECK(ask(MV_SUBMIT_TYPE, MV_SUBMIT, 1, 5, 48).action == MV_PASS); /* Another interface. */
    CHECK(ask(0xc0, 0x55, 0, 0, 60).action == MV_PASS);              /* Audio counters, device recipient. */
    CHECK(ask(MV_SUBMIT_TYPE, 9, 1, 6, 48).action == MV_STALL);
    CHECK(ask(MV_RESULT_TYPE, MV_SUBMIT, 0, 6, MV_RESULT_BYTES).action == MV_STALL);
    CHECK(ask(MV_RESULT_TYPE, MV_RESULT, 1, 6, MV_RESULT_BYTES).action == MV_STALL);
    CHECK(ask(MV_RESULT_TYPE, MV_RESULT, 0, 6, MV_RESULT_BYTES - 1).action == MV_STALL);
    CHECK(ask(MV_RESULT_TYPE, MV_RESULT, 0, 6, MV_RESULT_BYTES + 1).action == MV_STALL);
    CHECK(ask(MV_SUBMIT_TYPE, MV_SUBMIT, 1, 6, MU_WIRE_HEADER - 1).action == MV_STALL);
    CHECK(ask(MV_SUBMIT_TYPE, MV_SUBMIT, 1, 6, MU_WIRE_MAX + 1).action == MV_STALL);
    CHECK(ask(MV_SUBMIT_TYPE, MV_SUBMIT, 1, 6, MU_WIRE_MAX).action == MV_RECEIVE);
    CHECK(executed == 0 && !mv_service(&t, &controller));
}

static void identity(void)
{
    static const uint8_t head[16] = {'M','W','U','I', MV_VERSION, MU_WIRE_VERSION, 0, MV_CAN_SUBMIT,
                                     MU_WIRE_MAX >> 8, MU_WIRE_MAX & 0xff, 0, MV_RESULT_BYTES, 0, 0, 0, 0};
    uint8_t model[16] = "OCTATRACK TEST";
    reset_all();
    struct mv_reply r = ask(MV_RESULT_TYPE, MV_IDENTIFY, 0, 6, MV_IDENTITY_BYTES);
    CHECK(r.action == MV_SEND && r.length == MV_IDENTITY_BYTES && r.buffer == t.identity);
    CHECK(!memcmp(r.buffer, head, 16) && !memcmp(r.buffer + 16, base, 32) && !memcmp(r.buffer + 48, model, 16));
    CHECK(ask(MV_RESULT_TYPE, MV_IDENTIFY, 1, 6, MV_IDENTITY_BYTES).action == MV_STALL);
    CHECK(ask(MV_RESULT_TYPE, MV_IDENTIFY, 0, 6, MV_IDENTITY_BYTES - 1).action == MV_STALL);
    CHECK(ask(MV_SUBMIT_TYPE, MV_IDENTIFY, 0, 6, MV_IDENTITY_BYTES).action == MV_STALL);
    /* IDENTIFY in a data stage still abandons that frame. */
    CHECK(ask(MV_SUBMIT_TYPE, MV_SUBMIT, 9, 6, 48).action == MV_RECEIVE);
    CHECK(ask(MV_RESULT_TYPE, MV_IDENTIFY, 0, 6, MV_IDENTITY_BYTES).action == MV_SEND && mv_data(&t, 48) == 0);
    CHECK(status_is(result(), MV_REFUSED, 9));
    /* Without the data stage connected, only IDENTIFY answers. */
    CHECK(mv_init(&t, 6, base, "X", 0));
    CHECK(ask(MV_RESULT_TYPE, MV_IDENTIFY, 0, 6, MV_IDENTITY_BYTES).action == MV_SEND && t.identity[7] == 0);
    CHECK(ask(MV_SUBMIT_TYPE, MV_SUBMIT, 1, 6, 48).action == MV_STALL && result().action == MV_STALL);
    /* Refused identities leave a transport that answers nothing of its own. */
    const char *models[] = {"", "SEVENTEEN CHARSXX", "TAB\tNAME", 0};
    for (unsigned i = 0; i < 4; ++i) {
        CHECK(!mv_init(&t, 6, base, models[i], MV_CAN_SUBMIT));
        CHECK(ask(MV_RESULT_TYPE, MV_IDENTIFY, 0, 6, MV_IDENTITY_BYTES).action == MV_STALL);
        CHECK(ask(MV_SUBMIT_TYPE, MV_SUBMIT, 1, 6, 48).action == MV_STALL);
        CHECK(ask(0x80, 6, 0x0100, 0, 18).action == MV_PASS);
    }
    CHECK(!mv_init(&t, 6, base, "OK", 2) && !mv_init(&t, 6, 0, "OK", 0));
    CHECK(mv_init(&t, 6, base, "SIXTEEN CHARS XX", 0) && !memcmp(t.identity + 48, "SIXTEEN CHARS XX", 16));
}

static void exchange(void)
{
    uint8_t f[MU_WIRE_MAX], copy[MU_WIRE_MAX], expected[MU_WIRE_RESPONSE];
    struct mu_context twin;
    reset_all();
    uint32_t n = frame(f, MU_HELLO, 0x01020304u, 0);
    memcpy(&twin, &controller, sizeof twin);
    CHECK(mu_request(&twin, f, n, expected, sizeof expected) == MU_WIRE_RESPONSE);
    CHECK(submit(0xfffe, f, n));
    CHECK(status_is(result(), MV_PENDING, 0xfffe));
    memcpy(copy, t.frame, n);
    /* Busy: nothing is received over a queued frame, whatever its sequence. */
    CHECK(ask(MV_SUBMIT_TYPE, MV_SUBMIT, 7, 6, (uint16_t)n).action == MV_STALL);
    CHECK(!memcmp(copy, t.frame, n) && executed == 0);
    CHECK(mv_service(&t, &controller) && executed == 1);
    struct mv_reply r = result();
    CHECK(status_is(r, MV_READY, 0xfffe) && !memcmp(r.buffer + MV_RESULT_HEADER, expected, MU_WIRE_RESPONSE));
    CHECK(status_is(result(), MV_READY, 0xfffe)); /* Reading is side-effect free. */
    CHECK(!mv_service(&t, &controller) && executed == 1);
    /* A sequence is never executed twice; a new one wraps through zero. */
    CHECK(ask(MV_SUBMIT_TYPE, MV_SUBMIT, 0xfffe, 6, (uint16_t)n).action == MV_STALL);
    CHECK(submit(0xffff, f, n) && mv_service(&t, &controller));
    CHECK(submit(0, f, n) && mv_service(&t, &controller) && executed == 3);
    CHECK(status_is(result(), MV_READY, 0));
    CHECK(mv_data(&t, n) == 0 && status_is(result(), MV_READY, 0));
}

static void incomplete(void)
{
    uint8_t f[MU_WIRE_MAX];
    reset_all();
    uint32_t n = frame(f, MU_ENTER, 0, 0);
    struct mv_reply r = ask(MV_SUBMIT_TYPE, MV_SUBMIT, 3, 6, (uint16_t)n);
    CHECK(r.action == MV_RECEIVE);
    memcpy(r.buffer, f, n);
    CHECK(mv_data(&t, n - 1) == 0 && status_is(result(), MV_REFUSED, 3));
    CHECK(!mv_service(&t, &controller) && executed == 0 && controller.phase == MU_NORMAL);
    /* A SETUP in the data stage abandons the frame, including stock ones. */
    CHECK(ask(MV_SUBMIT_TYPE, MV_SUBMIT, 4, 6, (uint16_t)n).action == MV_RECEIVE);
    CHECK(status_is(result(), MV_REFUSED, 4) && mv_data(&t, n) == 0);
    CHECK(ask(MV_SUBMIT_TYPE, MV_SUBMIT, 5, 6, (uint16_t)n).action == MV_RECEIVE);
    mv_abandon(&t);
    CHECK(mv_data(&t, n) == 0 && status_is(result(), MV_REFUSED, 5));
    CHECK(!mv_service(&t, &controller) && executed == 0 && controller.phase == MU_NORMAL);
    /* The refused sequence is spent; the next one executes normally. */
    CHECK(ask(MV_SUBMIT_TYPE, MV_SUBMIT, 5, 6, (uint16_t)n).action == MV_STALL);
    CHECK(submit(6, f, n) && mv_service(&t, &controller) && controller.phase == MU_READY);
}

static void resets(void)
{
    uint8_t f[MU_WIRE_MAX];
    reset_all();
    uint32_t n = frame(f, MU_ENTER, 0, 0);
    CHECK(submit(1, f, n) && mv_service(&t, &controller) && controller.phase == MU_READY);
    /* Reset in a data stage: refused, and no frame overtakes the disconnect. */
    CHECK(ask(MV_SUBMIT_TYPE, MV_SUBMIT, 2, 6, (uint16_t)n).action == MV_RECEIVE);
    CHECK(mv_reset(&t) && status_is(result(), MV_REFUSED, 2));
    CHECK(ask(MV_SUBMIT_TYPE, MV_SUBMIT, 3, 6, (uint16_t)n).action == MV_STALL);
    CHECK(mv_service(&t, &controller) && disconnected == 1 && executed == 1);
    CHECK(controller.phase == MU_NORMAL);
    /* Reset after a frame is queued: that frame runs first, then disconnect. */
    CHECK(submit(3, f, n));
    CHECK(mv_reset(&t) && mv_reset(&t));
    CHECK(mv_service(&t, &controller) && executed == 2 && disconnected == 2);
    struct mv_reply r = result();
    CHECK(status_is(r, MV_READY, 3) && get32(r.buffer + MV_RESULT_HEADER + 16) == MU_OK &&
          get32(r.buffer + MV_RESULT_HEADER + 20) == MU_READY);
    CHECK(controller.phase == MU_NORMAL && !mv_service(&t, &controller));
    /* A controller that cannot answer leaves the frame refused, not ready. */
    controller.initialized = 0;
    CHECK(submit(4, f, n) && mv_service(&t, &controller) && status_is(result(), MV_REFUSED, 4));
}

/* Random host, bus and engine events. Invariants: every accepted frame
 * executes exactly once and in order, nothing else executes, queued frames
 * are never written, and every reply is a well-formed header or result. */
static void random_events(void)
{
    uint8_t f[MU_WIRE_MAX], queued[MU_WIRE_MAX];
    unsigned accepted = 0, queued_length = 0;
    uint32_t pending_tag = 0, tag = 0;
    (void)queued_length;
    uint16_t sequence = 0;
    int have_queue = 0, any = 0;
    reset_all();
    srand(31415);
    for (unsigned step = 0; step < 400000; ++step) {
        unsigned event = (unsigned)rand() % 9;
        if (event < 3) {
            uint32_t body = (unsigned)rand() % 4 == 0 ? (unsigned)rand() % (MU_WIRE_MAX - MU_WIRE_HEADER + 8) : 0;
            uint32_t n = frame(f, MU_HELLO, ++tag, body > MU_WIRE_MAX - MU_WIRE_HEADER ? 0 : body);
            uint16_t length = (uint16_t)((unsigned)rand() % 16 == 0 ? (unsigned)rand() % (MU_WIRE_MAX + 64) : n);
            uint16_t value = (unsigned)rand() % 8 == 0 ? sequence : (uint16_t)(sequence + 1u);
            int was_queued = have_queue;
            struct mv_reply r = ask(MV_SUBMIT_TYPE, MV_SUBMIT, value, 6, length);
            if (was_queued) CHECK(r.action == MV_STALL && !memcmp(queued, t.frame, queued_length));
            if (r.action != MV_RECEIVE) continue;
            CHECK(length >= MU_WIRE_HEADER && length <= MU_WIRE_MAX && (!any || value != sequence));
            sequence = value; any = 1;
            uint32_t delivered = (unsigned)rand() % 8 == 0 ? (unsigned)rand() % (length + 1u) : length;
            memcpy(r.buffer, f, delivered < n ? delivered : n);
            if ((unsigned)rand() % 16 == 0) { mv_abandon(&t); delivered = length; CHECK(!mv_data(&t, delivered)); continue; }
            int queuedNow = mv_data(&t, delivered);
            CHECK(queuedNow == (delivered == length));
            if (queuedNow) { accepted++; have_queue = 1; queued_length = length; memcpy(queued, t.frame, length); pending_tag = tag; }
        } else if (event < 5) {
            struct mv_reply r = result();
            CHECK(r.action == MV_SEND && (r.length == MV_RESULT_HEADER || r.length == MV_RESULT_BYTES));
            CHECK(!memcmp(r.buffer, "MWUT", 4) && (r.buffer[6] << 8 | r.buffer[7]) == sequence);
            CHECK((r.length == MV_RESULT_BYTES) == (r.buffer[5] == MV_READY));
            CHECK(r.buffer[5] != MV_PENDING || have_queue);
        } else if (event < 7) {
            unsigned before = executed;
            mv_service(&t, &controller);
            if (have_queue) {
                CHECK(executed == before + 1);
                struct mv_reply r = result();
                CHECK(r.length == MV_RESULT_BYTES && get32(r.buffer + MV_RESULT_HEADER + 8) == pending_tag);
                have_queue = 0;
            } else CHECK(executed == before);
        } else if (event == 7) {
            mv_reset(&t);
        } else {
            /* Arbitrary SETUPs, some on this interface. One that starts a
             * submission spends its sequence and is abandoned unfilled. */
            uint8_t s[8];
            for (unsigned i = 0; i < 8; ++i) s[i] = (uint8_t)rand();
            s[4] = (uint8_t)(rand() % 8); s[5] = 0;
            if ((unsigned)rand() % 2) { s[0] = MV_SUBMIT_TYPE; s[1] = (uint8_t)(rand() % 3); }
            struct mv_reply r = mv_setup(&t, s);
            if (r.action == MV_RECEIVE) {
                uint16_t value = (uint16_t)(s[2] | s[3] << 8);
                CHECK(!have_queue && (!any || value != sequence));
                sequence = value; any = 1;
                mv_abandon(&t);
            }
        }
    }
    mv_service(&t, &controller);
    CHECK(executed == accepted && t.resets == t.handled);
    printf("random events: %u accepted frames executed once each, %u disconnects\n", accepted, disconnected);
}

int main(void)
{
    routing(); identity(); exchange(); incomplete(); resets(); random_events();
    if (failures) { fprintf(stderr, "%u vendor transport checks failed\n", failures); return 1; }
    puts("Vendor transport: routing, identity, exchange, incomplete frames, resets and random events passed.");
    return 0;
}
