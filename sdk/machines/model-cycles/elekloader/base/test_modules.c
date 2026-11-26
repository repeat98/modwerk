// SPDX-License-Identifier: GPL-3.0-or-later
// modules.c on the host (sdk/tests/test_machine_base.py): the link's upload transport between mc_link.py's framing
// and the Octatrack's upload controller and loader. The test writes one request a line and reads the answer:
//   P offset hex    an UP_PART's packed bytes -> the bytes taken
//   R length        an UP_RUN                 -> the controller's response in hex, or an empty line
//   T n             n UI ticks                -> the lapses counted so far
//   S 0 or 1        the transport playing (0) or stopped (1), as runtime.c reads it -> the same
// cc -std=c99 -DMODWERK_HOST -I sdk/runtime/loader -I sdk/runtime/upload test_modules.c modules.c runtime.c
//   sdk/runtime/loader/loader.c sdk/runtime/upload/{upload,wire,sha256}.c
#include <stdio.h>
#include <stdint.h>
#include <string.h>

unsigned mw_modules_part(uint32_t offset, const uint8_t *packed, unsigned n);
unsigned mw_modules_run(uint32_t length, uint8_t *out);
void mw_modules_identity(uint32_t crc);
void mw_modules_tick(void);
extern volatile uint32_t mw_modules_lapses;
extern int modwerk_test_stopped;

int main(void)
{
    static char hex[512];
    uint8_t b[256], out[144];
    char op;
    unsigned v;
    mw_modules_identity(0x12345678u);
    while (scanf(" %c %u", &op, &v) == 2) {
        if (op == 'P') {
            unsigned n;
            if (scanf("%511s", hex) != 1) return 1;
            n = (unsigned)strlen(hex) / 2u;
            for (unsigned i = 0; i < n; i++) sscanf(hex + 2 * i, "%2hhx", &b[i]);
            printf("%u\n", mw_modules_part(v, b, n));
        } else if (op == 'R') {
            unsigned k = mw_modules_run(v, out);
            for (unsigned i = 0; i < k; i++) printf("%02x", out[i]);
            printf("\n");
        } else if (op == 'S') {
            modwerk_test_stopped = (int)v;
            printf("%u\n", v);
        } else {
            while (v--) mw_modules_tick();
            printf("%u\n", (unsigned)mw_modules_lapses);
        }
        fflush(stdout);
    }
    return 0;
}
