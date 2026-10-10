/* SPDX-License-Identifier: GPL-3.0-or-later */
#include "vendor.h"

enum { IDLE, RECEIVING, QUEUED, READY, REFUSED };
/* Complete the result before READY becomes visible to the USB ISR. */
#define PUBLISH() __asm__ __volatile__("" ::: "memory")

static uint16_t le16(const uint8_t *p) { return (uint16_t)(p[0] | p[1] << 8); }
static void header(uint8_t *p, enum mv_status status, uint16_t sequence)
{
    p[0]='M'; p[1]='W'; p[2]='U'; p[3]='T'; p[4]=MV_VERSION; p[5]=(uint8_t)status;
    p[6]=(uint8_t)(sequence >> 8); p[7]=(uint8_t)sequence;
}
static void put16(uint8_t *p, uint16_t n) { p[0] = (uint8_t)(n >> 8); p[1] = (uint8_t)n; }
int mv_init(struct mv_transport *t, uint16_t interface, const uint8_t base[MU_DIGEST_BYTES],
            const char *model, uint16_t capabilities)
{
    uint8_t *p = (uint8_t *)t, *id = t->identity;
    uint32_t n = 0;
    for (uint32_t i = 0; i < sizeof *t; ++i) p[i] = 0;
    t->interface = interface;
    while (model && n <= MV_MODEL_BYTES && model[n]) {
        if (n == MV_MODEL_BYTES || model[n] < 0x20 || model[n] > 0x7e) return 0;
        ++n;
    }
    if (!base || !n || capabilities & ~MV_CAN_SUBMIT) return 0;
    id[0]='M'; id[1]='W'; id[2]='U'; id[3]='I'; id[4]=MV_VERSION; id[5]=MU_WIRE_VERSION;
    put16(id+6, capabilities); put16(id+8, MU_WIRE_MAX); put16(id+10, MV_RESULT_BYTES);
    for (uint32_t i = 0; i < MU_DIGEST_BYTES; ++i) id[16+i] = base[i];
    for (uint32_t i = 0; i < n; ++i) id[48+i] = (uint8_t)model[i];
    t->capabilities = capabilities;
    return t->ready = 1;
}
void mv_abandon(struct mv_transport *t)
{
    if (t->phase == RECEIVING) t->phase = REFUSED;
}
struct mv_reply mv_setup(struct mv_transport *t, const uint8_t s[8])
{
    struct mv_reply r = {MV_PASS, 0, 0};
    uint16_t value = le16(s+2), length = le16(s+6);
    mv_abandon(t); /* A new SETUP ends any control transfer in its data stage. */
    if ((s[0] & 0x7fu) != (MV_SUBMIT_TYPE & 0x7fu) || le16(s+4) != t->interface) return r;
    r.action = MV_STALL;
    if (!t->ready) return r;
    if (s[0] == MV_RESULT_TYPE && s[1] == MV_IDENTIFY) {
        if (value == 0 && length == MV_IDENTITY_BYTES) {
            r.action = MV_SEND; r.buffer = t->identity; r.length = MV_IDENTITY_BYTES;
        }
        return r;
    }
    if (!(t->capabilities & MV_CAN_SUBMIT)) return r;
    if (s[0] == MV_SUBMIT_TYPE && s[1] == MV_SUBMIT) {
        /* Never overwrite a queued frame, re-execute a sequence or let a frame
         * overtake an unhandled reset. A refused SETUP received no data. */
        if (length < MU_WIRE_HEADER || length > MU_WIRE_MAX || t->phase == QUEUED ||
            t->resets != t->handled || (t->phase != IDLE && value == t->sequence)) return r;
        t->sequence = value; t->expected = length; t->phase = RECEIVING;
        r.action = MV_RECEIVE; r.buffer = t->frame; r.length = length;
    } else if (s[0] == MV_RESULT_TYPE && s[1] == MV_RESULT && value == 0 && length == MV_RESULT_BYTES) {
        uint8_t phase = t->phase;
        r.action = MV_SEND;
        if (phase == READY) {
            r.buffer = t->result; r.length = MV_RESULT_BYTES;
        } else {
            header(t->status, phase == QUEUED ? MV_PENDING : phase == REFUSED ? MV_REFUSED : MV_NONE, t->sequence);
            r.buffer = t->status; r.length = MV_RESULT_HEADER;
        }
    }
    return r;
}
int mv_data(struct mv_transport *t, uint32_t received)
{
    if (t->phase != RECEIVING) return 0;
    if (received != t->expected) {
        t->phase = REFUSED;
        return 0;
    }
    t->phase = QUEUED;
    return 1;
}
int mv_reset(struct mv_transport *t)
{
    mv_abandon(t);
    t->resets = (uint8_t)(t->resets + 1u);
    return 1;
}
int mv_service(struct mv_transport *t, struct mu_context *c)
{
    int work = 0;
    /* A queued frame always predates any unhandled reset: SUBMIT is refused
     * from the reset until it is handled here. */
    if (t->phase == QUEUED) {
        int done = mu_request(c, t->frame, t->expected, t->result + MV_RESULT_HEADER,
                              MU_WIRE_RESPONSE) == MU_WIRE_RESPONSE;
        header(t->result, done ? MV_READY : MV_REFUSED, t->sequence);
        PUBLISH();
        t->phase = done ? READY : REFUSED;
        work = 1;
    }
    uint8_t resets = t->resets;
    if (resets != t->handled) {
        (void)mu_disconnect(c); /* Controller-defined; failure keeps recovery pending. */
        PUBLISH();
        t->handled = resets;
        work = 1;
    }
    return work;
}
