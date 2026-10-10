/* SPDX-License-Identifier: GPL-3.0-or-later
 * Authored-only EP0 peer for the TypeScript USB transport: the real vendor
 * transport, controller and decoder behind a byte stream standing in for the
 * control endpoint. The backend is synthetic; no firmware, USB stack or device.
 *
 * Requests: 'O' setup[8] length:u16be data | 'I' setup[8] | 'X'.
 * Replies: OUT 0 ok, 1 stall, 2 transfer error; IN 0 length:u16be data or 1
 * stall; X executed:u32be. The engine task runs after each IN reply, so a
 * first poll reports a pending frame. */
#include "vendor.h"
#include <stdio.h>
#include <string.h>

static int ok(void *p) { (void)p; return 1; }
static int prepare(void *p, const uint8_t *d, uint32_t n) { (void)p; (void)d; (void)n; return 1; }
static enum mu_publication publish(void *p) { (void)p; return MU_APPLIED; }
static int fault(const char *name, const char *want) { return strcmp(name, want) == 0; }

int main(int argc, char **argv)
{
    static uint8_t stage[MU_MAX_BYTES];
    static struct mu_context c;
    static struct mv_transport t;
    uint8_t base[32], session[32], active[32], setup[8], data[MU_WIRE_MAX + 64], head[2];
    const char *name = argc > 1 ? argv[1] : "none";
    unsigned submits = 0, executed = 0, services = 0;
    struct mu_backend b = {0, ok, ok, ok, prepare, ok, publish, ok, ok};
    memset(base, 0x31, 32); memset(session, 0x52, 32); memset(active, 0x41, 32);
    if (!mu_init(&c, stage, sizeof stage, base, session, active, 0, &b)) return 2;
    mv_init(&t, 6);
    for (int kind; (kind = getchar()) != EOF;) {
        if (kind == 'X') {
            uint8_t n[4] = {(uint8_t)(executed >> 24), (uint8_t)(executed >> 16), (uint8_t)(executed >> 8), (uint8_t)executed};
            if (fwrite(n, 1, 4, stdout) != 4) return 4;
        } else if (kind == 'O') {
            if (fread(setup, 1, 8, stdin) != 8 || fread(head, 1, 2, stdin) != 2) return 3;
            uint32_t length = (uint32_t)head[0] << 8 | head[1];
            if (length > sizeof data || fread(data, 1, length, stdin) != length) return 3;
            int first = setup[1] == MV_SUBMIT && ++submits == 1;
            if (first && fault(name, "reset-first")) mv_reset(&t);
            struct mv_reply r = mv_setup(&t, setup);
            int reply = 1;
            if (r.action == MV_RECEIVE) {
                uint32_t delivered = length < r.length ? length : r.length;
                if ((first && fault(name, "short")) || fault(name, "always-short")) delivered--;
                memcpy(r.buffer, data, delivered);
                reply = mv_data(&t, delivered) ? 0 : 1;
                /* Executed, but the host never sees the status stage. */
                if (reply == 0 && first && fault(name, "lost-status")) reply = 2;
            }
            if (putchar(reply) == EOF) return 4;
        } else if (kind == 'I') {
            if (fread(setup, 1, 8, stdin) != 8) return 3;
            struct mv_reply r = mv_setup(&t, setup);
            if (r.action == MV_SEND) {
                uint8_t h[3] = {0, (uint8_t)(r.length >> 8), (uint8_t)r.length};
                if (fwrite(h, 1, 3, stdout) != 3 || fwrite(r.buffer, 1, r.length, stdout) != r.length) return 4;
            } else if (putchar(1) == EOF) return 4;
            /* The engine task: never for "stuck" after the first frame. */
            if (!(fault(name, "stuck") && services)) {
                int queued = t.phase == 2; /* vendor.c's QUEUED */
                if (mv_service(&t, &c) && queued) { executed++; services++; }
            }
            /* Another client's frame lands between two polls. */
            if (fault(name, "other") && executed == 1 && services == 1) {
                uint8_t s[8] = {MV_SUBMIT_TYPE, MV_SUBMIT, (uint8_t)(t.sequence + 7u), (uint8_t)((t.sequence + 7u) >> 8), 6, 0, 48, 0};
                struct mv_reply o = mv_setup(&t, s);
                if (o.action != MV_RECEIVE) return 5;
                memset(o.buffer, 0, 48); memcpy(o.buffer, "MWUP", 4); o.buffer[5] = MU_WIRE_VERSION;
                if (!mv_data(&t, 48) || !mv_service(&t, &c)) return 5;
                services++;
            }
        } else return 3;
        if (fflush(stdout)) return 4;
    }
    return 0;
}
