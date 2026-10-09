/* SPDX-License-Identifier: GPL-3.0-or-later
 * Authored-only protocol peer for TypeScript interoperability/fault checks.
 * The backend is synthetic: no firmware, audio, hardware or module executor. */
#include "wire.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <errno.h>

struct fault { const char *name; unsigned restores; };
static int is(void *p, const char *name) { return strcmp(((struct fault *)p)->name, name) == 0; }
static int enter(void *p) { return !is(p, "enter"); }
static int safe(void *p) { return !is(p, "unsafe"); }
static int leave(void *p) { return !is(p, "leave"); }
static int prepare(void *p, const uint8_t *data, uint32_t length)
{
    (void)data; (void)length;
    return !is(p, "prepare") && !is(p, "discard");
}
static int discard(void *p) { return !is(p, "discard"); }
static enum mu_publication publish(void *p)
{
    return is(p, "publish") ? MU_UNCERTAIN : is(p, "unchanged") ? MU_UNCHANGED : MU_APPLIED;
}
static int restore(void *p)
{
    struct fault *f = p;
    return !is(p, "restore") || f->restores++ != 0;
}
static int retire(void *p) { return !is(p, "retire"); }
int main(int argc, char **argv)
{
    static uint8_t stage[MU_MAX_BYTES];
    uint8_t base[32], session[32], active[32], frame[MU_WIRE_MAX], response[MU_WIRE_RESPONSE], header[4];
    struct fault f = {argc > 1 ? argv[1] : "none", 0};
    uint32_t generation = 0;
    if (argc > 2) {
        char *end = NULL;
        errno = 0;
        unsigned long long value = strtoull(argv[2], &end, 10);
        if (errno || !end || *end || value > UINT32_MAX) return 2;
        generation = (uint32_t)value;
    }
    memset(base, 0x31, sizeof base); memset(session, 0x52, sizeof session); memset(active, 0x41, sizeof active);
    struct mu_context c;
    struct mu_backend b = {&f, enter, safe, leave, prepare, discard, publish, restore, retire};
    if (!mu_init(&c, stage, sizeof stage, base, session, active, generation, &b)) return 2;
    for (;;) {
        size_t n = fread(header, 1, sizeof header, stdin);
        if (!n && feof(stdin)) return 0;
        if (n != sizeof header) return 3;
        uint32_t length = (uint32_t)header[0]<<24 | (uint32_t)header[1]<<16 | (uint32_t)header[2]<<8 | header[3];
        if (length > sizeof frame || fread(frame, 1, length, stdin) != length) return 3;
        if (mu_request(&c, frame, length, response, sizeof response) != sizeof response ||
            fwrite(response, 1, sizeof response, stdout) != sizeof response || fflush(stdout)) return 4;
    }
}
