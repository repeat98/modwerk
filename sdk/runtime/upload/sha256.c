/* SPDX-License-Identifier: GPL-3.0-or-later
 * Original freestanding SHA-256 implementation. All input lengths are bounded
 * by the upload controller; no heap or firmware-derived data. */
#include "upload.h"
static uint32_t rotate(uint32_t n, unsigned bits) { return n >> bits | n << (32u - bits); }
static void block(uint32_t h[8], const uint8_t bytes[64])
{
    static const uint32_t k[64] = {
        0x428a2f98u,0x71374491u,0xb5c0fbcfu,0xe9b5dba5u,0x3956c25bu,0x59f111f1u,0x923f82a4u,0xab1c5ed5u,
        0xd807aa98u,0x12835b01u,0x243185beu,0x550c7dc3u,0x72be5d74u,0x80deb1feu,0x9bdc06a7u,0xc19bf174u,
        0xe49b69c1u,0xefbe4786u,0x0fc19dc6u,0x240ca1ccu,0x2de92c6fu,0x4a7484aau,0x5cb0a9dcu,0x76f988dau,
        0x983e5152u,0xa831c66du,0xb00327c8u,0xbf597fc7u,0xc6e00bf3u,0xd5a79147u,0x06ca6351u,0x14292967u,
        0x27b70a85u,0x2e1b2138u,0x4d2c6dfcu,0x53380d13u,0x650a7354u,0x766a0abbu,0x81c2c92eu,0x92722c85u,
        0xa2bfe8a1u,0xa81a664bu,0xc24b8b70u,0xc76c51a3u,0xd192e819u,0xd6990624u,0xf40e3585u,0x106aa070u,
        0x19a4c116u,0x1e376c08u,0x2748774cu,0x34b0bcb5u,0x391c0cb3u,0x4ed8aa4au,0x5b9cca4fu,0x682e6ff3u,
        0x748f82eeu,0x78a5636fu,0x84c87814u,0x8cc70208u,0x90befffau,0xa4506cebu,0xbef9a3f7u,0xc67178f2u
    };
    uint32_t w[64];
    for (unsigned i = 0; i < 16; ++i) {
        const uint8_t *p = bytes + 4u * i;
        w[i] = (uint32_t)p[0] << 24 | (uint32_t)p[1] << 16 | (uint32_t)p[2] << 8 | p[3];
    }
    for (unsigned i = 16; i < 64; ++i) {
        uint32_t a = w[i-15], b = w[i-2];
        w[i] = w[i-16] + (rotate(a,7)^rotate(a,18)^(a>>3)) + w[i-7] + (rotate(b,17)^rotate(b,19)^(b>>10));
    }
    uint32_t a=h[0], b=h[1], c=h[2], d=h[3], e=h[4], f=h[5], g=h[6], v=h[7];
    for (unsigned i = 0; i < 64; ++i) {
        uint32_t t1 = v + (rotate(e,6)^rotate(e,11)^rotate(e,25)) + ((e&f)^(~e&g)) + k[i] + w[i];
        uint32_t t2 = (rotate(a,2)^rotate(a,13)^rotate(a,22)) + ((a&b)^(a&c)^(b&c));
        v=g; g=f; f=e; e=d+t1; d=c; c=b; b=a; a=t1+t2;
    }
    h[0]+=a; h[1]+=b; h[2]+=c; h[3]+=d; h[4]+=e; h[5]+=f; h[6]+=g; h[7]+=v;
}
void mu_sha256(const uint8_t *input, uint32_t length, uint8_t out[MU_DIGEST_BYTES])
{
    static const uint32_t initial[8] = {0x6a09e667u,0xbb67ae85u,0x3c6ef372u,0xa54ff53au,0x510e527fu,0x9b05688cu,0x1f83d9abu,0x5be0cd19u};
    uint32_t h[8];
    for (unsigned i = 0; i < 8; ++i) h[i] = initial[i];
    uint32_t at = 0;
    while (length - at >= 64u) { block(h, input + at); at += 64u; }
    uint8_t tail[64];
    for (unsigned i = 0; i < 64; ++i) tail[i] = 0;
    unsigned n = (unsigned)(length - at);
    for (unsigned i = 0; i < n; ++i) tail[i] = input[at+i];
    tail[n] = 0x80;
    if (n >= 56u) { block(h, tail); for (unsigned i = 0; i < 64; ++i) tail[i] = 0; }
    /* uint32_t bytes -> at most 35 bits. Avoid 64-bit runtime helpers on ColdFire. */
    uint32_t high = length >> 29, low = length << 3;
    for (unsigned i = 0; i < 4; ++i) {
        tail[56+i] = (uint8_t)(high >> (24u-8u*i)); tail[60+i] = (uint8_t)(low >> (24u-8u*i));
    }
    block(h, tail);
    for (unsigned i = 0; i < 8; ++i) for (unsigned j = 0; j < 4; ++j)
        out[4u*i+j] = (uint8_t)(h[i] >> (24u-8u*j));
}
