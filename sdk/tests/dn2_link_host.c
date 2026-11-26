// SPDX-License-Identifier: GPL-3.0-or-later
// The Digitone II link (base/link.c) on the host, with stock's sysex_send, USB parser state and frame pointers
// stubbed: run by test_dn2_link.py. Exit 0 and "ok" when every check holds; a failed check prints its line.
#include <stdint.h>
#include <stdio.h>
#include <string.h>

static uint8_t last_reply[512];
static int last_len, sent_count;
static int stub_sysex_send(const uint8_t *m, int n, const uint8_t *b, int s)
{
    (void)b; (void)s;
    if (n > (int)sizeof last_reply)
        n = (int)sizeof last_reply;
    memcpy(last_reply, m, (size_t)n);
    last_len = n;
    sent_count++;
    return 0;
}
static uint8_t usb_state;
// "DDR" for the test: the frame on the screen and, around it, bytes no reply may carry.
static uint8_t ddr[8192];
static uint8_t outside[64];
static uint8_t *frame_pointers[2];

#define SYSEX_SEND_AT ((uintptr_t)stub_sysex_send)
#define USB_SYSEX_STATE_AT ((uintptr_t)&usb_state)
#define FRAME_POINTERS_AT ((uintptr_t)frame_pointers)
#define DDR_START ((uintptr_t)ddr)
#define DDR_END ((uintptr_t)ddr + sizeof ddr)
#include "../machines/digitone-ii/elekloader/base/link.c"

static int failed;
#define CHECK(c) do { if (!(c)) { printf("failed at line %d: %s\n", __LINE__, #c); failed = 1; } } while (0)

static uint32_t at32(const uint8_t *p) { return get32(p); }

/* Sends one request with `words` u32 values and returns the reply's status (-1: no reply). */
static int request(int cmd, int words, uint32_t a, uint32_t b)
{
    uint8_t m[32] = { 0xF0, 0x7D, 'M', 'W', 'L', LINK_VERSION, 3, (uint8_t)cmd };
    uint8_t *p = m + HEADER;
    int before = sent_count;
    if (words > 0)
        p = put32(p, a);
    if (words > 1)
        p = put32(p, b);
    *p++ = 0xF7;
    act(m, (int)(p - m));
    return sent_count == before ? -1 : last_reply[8];
}

static void unpack(const uint8_t *src, uint8_t *dst, int n)   // as dn2_link.py's unpack7
{
    int i, k, o = 0;
    for (i = 0; o < n; i += 8)
        for (k = 0; k < 7 && o < n; k++)
            dst[o++] = (uint8_t)(src[i + 1 + k] | (src[i] & (0x40 >> k) ? 0x80 : 0));
}

/* The part of the frame in the last reply: OFF, the copy's number, then 128 packed bytes and F7. */
static int part_fits(uint32_t off, uint32_t *number, uint8_t *out)
{
    int expected = HEADER + 1 + 5 + 5 + SCREEN_PART + (SCREEN_PART + 6) / 7 + 1;
    if (last_len != expected || last_reply[last_len - 1] != 0xF7 || at32(last_reply + 9) != off)
        return 0;
    *number = at32(last_reply + 14);
    unpack(last_reply + 19, out, SCREEN_PART);
    return 1;
}

int main(void)
{
    uint8_t got[FRAME_BYTES], part[SCREEN_PART];
    uint32_t number = 0, n2 = 0, off;
    int i;

    for (i = 0; i < (int)sizeof ddr; i++)
        ddr[i] = (uint8_t)(0xA5 ^ i);              // what lies around the frame
    memset(outside, 0x5A, sizeof outside);
    frame_pointers[0] = ddr;                         // the frame stock draws next
    frame_pointers[1] = ddr + 2048;                  // the frame on the screen
    for (i = 0; i < FRAME_BYTES; i++)
        frame_pointers[1][i] = (uint8_t)(i * 7 + 1);

    // ident: the link's own counters.
    CHECK(request(CMD_IDENT, 0, 0, 0) == ST_OK);
    CHECK(at32(last_reply + 9) == LINK_VERSION);

    // A part before any part 0 has no copy to come from.
    CHECK(request(CMD_SCREEN, 1, 128, 0) == ST_RANGE);
    CHECK(last_len == HEADER + 2);

    // The whole frame: part 0 copies it, the rest come from the copy even if stock draws meanwhile.
    CHECK(request(CMD_SCREEN, 1, 0, 0) == ST_OK);
    CHECK(part_fits(0, &number, got));
    CHECK(number == 1);
    for (i = 0; i < FRAME_BYTES; i++)
        frame_pointers[1][i] ^= 0xFF;                // a draw between the parts
    for (off = SCREEN_PART; off < FRAME_BYTES; off += SCREEN_PART) {
        CHECK(request(CMD_SCREEN, 1, off, 0) == ST_OK);
        CHECK(part_fits(off, &n2, got + off));
        CHECK(n2 == number);
    }
    for (i = 0; i < FRAME_BYTES; i++)
        CHECK(got[i] == (uint8_t)(i * 7 + 1));       // one frame, not torn
    CHECK(request(CMD_SCREEN, 1, 0, 0) == ST_OK);    // a new part 0 takes the new frame
    CHECK(part_fits(0, &n2, part));
    CHECK(n2 == 2 && part[0] == (uint8_t)(1 ^ 0xFF));

    // Refusals: no offset past the frame or between parts, and nothing but the status goes back.
    {
        uint32_t bad[] = { 1, 64, 127, 129, FRAME_BYTES, FRAME_BYTES + SCREEN_PART, 0x7FFFFFFF, 0xFFFFFF80 };
        for (i = 0; i < (int)(sizeof bad / sizeof bad[0]); i++) {
            CHECK(request(CMD_SCREEN, 1, bad[i], 0) == ST_RANGE);
            CHECK(last_len == HEADER + 2);
        }
    }
    CHECK(request(CMD_SCREEN, 0, 0, 0) == ST_BAD);   // no offset at all

    // A frame pointer that does not lie wholly in DDR is never read.
    frame_pointers[1] = outside;
    CHECK(request(CMD_SCREEN, 1, 0, 0) == ST_RANGE);
    frame_pointers[1] = ddr + sizeof ddr - FRAME_BYTES + 1;
    CHECK(request(CMD_SCREEN, 1, 0, 0) == ST_RANGE);
    frame_pointers[1] = 0;
    CHECK(request(CMD_SCREEN, 1, 0, 0) == ST_RANGE);
    CHECK(request(CMD_SCREEN, 1, SCREEN_PART, 0) == ST_OK);   // the earlier copy stays as it was
    CHECK(part_fits(SCREEN_PART, &n2, part) && n2 == 2);

    // The old mem request and every other command: refused, whatever address they name.
    {
        uint32_t addrs[] = { (uint32_t)(uintptr_t)ddr, 0x40000000, 0x47f00000, 0x80000000, 0x402a10c8, 0 };
        for (i = 0; i < (int)(sizeof addrs / sizeof addrs[0]); i++) {
            CHECK(request(0x21, 2, addrs[i], 16) == ST_BAD);
            CHECK(last_len == HEADER + 2);
        }
        for (i = 0; i < 0x40; i++)
            if (i != CMD_IDENT && i != CMD_SCREEN) {
                CHECK(request(i, 2, 0x40000000, 128) == ST_BAD);
                CHECK(last_len == HEADER + 2);
            }
    }

    // A request in another link version is refused too.
    {
        uint8_t m[] = { 0xF0, 0x7D, 'M', 'W', 'L', LINK_VERSION + 1, 4, CMD_SCREEN, 0, 0, 0, 0, 0, 0xF7 };
        act(m, (int)sizeof m);
        CHECK(last_reply[8] == ST_BAD && last_len == HEADER + 2);
    }

    if (!failed)
        printf("ok\n");
    return failed;
}
