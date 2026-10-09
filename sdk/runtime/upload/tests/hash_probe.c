/* SPDX-License-Identifier: GPL-3.0-or-later */
#include "upload.h"
#include <stdio.h>
static uint8_t bytes[MU_MAX_BYTES];
int main(void)
{
    uint8_t digest[MU_DIGEST_BYTES];
    size_t n = fread(bytes, 1, sizeof bytes, stdin);
    if (ferror(stdin) || fgetc(stdin) != EOF) return 1;
    mu_sha256(bytes, (uint32_t)n, digest);
    for (unsigned i = 0; i < MU_DIGEST_BYTES; ++i) printf("%02x", digest[i]);
    putchar('\n'); return 0;
}
