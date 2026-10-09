/* SPDX-License-Identifier: GPL-3.0-or-later */
#include "wire.h"
static uint32_t read32(const uint8_t *p)
{
    return (uint32_t)p[0]<<24 | (uint32_t)p[1]<<16 | (uint32_t)p[2]<<8 | p[3];
}
static void write32(uint8_t *p, uint32_t n)
{
    for (unsigned i = 0; i < 4; ++i) p[i] = (uint8_t)(n >> (24u-8u*i));
}
static void bytes(uint8_t *to, const uint8_t *from, unsigned n)
{
    for (unsigned i = 0; i < n; ++i) to[i] = from[i];
}
static int session_matches(const uint8_t *a, const uint8_t *b)
{
    unsigned different = 0;
    for (unsigned i = 0; i < MU_DIGEST_BYTES; ++i) different |= (unsigned)(a[i] ^ b[i]);
    return different == 0;
}
static enum mu_result execute(struct mu_context *c, unsigned cmd, uint32_t tx,
                             const uint8_t *body, uint32_t n)
{
    if (cmd == MU_BEGIN) {
        if (n != 72u) return MU_LENGTH;
        struct mu_offer o;
        bytes(o.base, body, MU_DIGEST_BYTES); bytes(o.session, c->session, MU_DIGEST_BYTES);
        bytes(o.digest, body+32, MU_DIGEST_BYTES);
        o.generation = read32(body+64); o.length = read32(body+68); o.transaction = tx;
        return mu_begin(c, &o);
    }
    if (cmd == MU_CHUNK) {
        if (n <= 4u || n > MU_MAX_CHUNK + 4u) return MU_LENGTH;
        return mu_chunk(c, tx, read32(body), body+4, n-4u);
    }
    if (n) return MU_LENGTH;
    if (cmd == MU_HELLO) return MU_OK;
    if (cmd == MU_ENTER) return tx ? MU_STALE : mu_enter(c);
    if (cmd == MU_VERIFY) return mu_verify(c, tx);
    if (cmd == MU_COMMIT) return mu_commit(c, tx);
    if (cmd == MU_ACCEPT) return mu_accept(c, tx);
    if (cmd == MU_ROLLBACK) return mu_rollback(c, tx);
    if (cmd == MU_ABORT) return mu_abort(c, tx);
    if (cmd == MU_LEAVE || cmd == MU_DISCONNECT) {
        if (tx != c->offer.transaction) return MU_STALE;
        return cmd == MU_LEAVE ? mu_leave(c) : mu_disconnect(c);
    }
    return MU_STATE;
}
uint32_t mu_request(struct mu_context *c, const uint8_t *r, uint32_t length, uint8_t *out, uint32_t cap)
{
    if (!c || !c->initialized || !r || !out || cap < MU_WIRE_RESPONSE) return 0;
    unsigned cmd = length >= 8u ? (unsigned)r[6]<<8 | r[7] : 0xffffu;
    uint32_t tx = length >= 12u ? read32(r+8) : 0;
    enum mu_result result = MU_LENGTH;
    if (length >= MU_WIRE_HEADER && length <= MU_WIRE_MAX &&
        r[0]=='M' && r[1]=='W' && r[2]=='U' && r[3]=='P' && r[4]==0 && r[5]==MU_WIRE_VERSION &&
        read32(r+12) == length - MU_WIRE_HEADER) {
        result = cmd != MU_HELLO && !session_matches(r+16, c->session) ? MU_IDENTITY :
            execute(c, cmd, tx, r+MU_WIRE_HEADER, length-MU_WIRE_HEADER);
    }
    out[0]='M'; out[1]='W'; out[2]='U'; out[3]='R'; out[4]=0; out[5]=MU_WIRE_VERSION;
    out[6]=(uint8_t)(cmd>>8); out[7]=(uint8_t)cmd;
    write32(out+8, tx); write32(out+12, MU_WIRE_RESPONSE-16u);
    write32(out+16, (uint32_t)result); write32(out+20, (uint32_t)c->phase);
    write32(out+24, c->active_known); write32(out+28, c->generation);
    write32(out+32, c->last_transaction); write32(out+36, c->offer.transaction);
    write32(out+40, c->received); write32(out+44, c->capacity);
    bytes(out+48, c->base, MU_DIGEST_BYTES); bytes(out+80, c->session, MU_DIGEST_BYTES);
    for (unsigned i=0; i<MU_DIGEST_BYTES; ++i) out[112+i] = c->active_known ? c->active[i] : 0;
    return MU_WIRE_RESPONSE;
}
