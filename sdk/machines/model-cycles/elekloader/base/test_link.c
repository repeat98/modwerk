// SPDX-License-Identifier: GPL-3.0-or-later
// link.c on the host (sdk/tests/test_machine_base.py), a development base's link: requests go in through
// mw_link_rx as stock's router hands them over, mw_link_tick acts on them, the replies come back through stock's send.
// RAMBOOT: a request that fails the checks starts no copy; one that comes during the ticks after an accepted one is
// refused BUSY and leaves the accepted numbers as they were; the copy (here mw_test_ramboot) takes them.
// Replies: a reply longer than one 144-byte part goes out whole under stock's USB lock, and no request is acted on
// while another sender's SysEx is open. A reply that meets a SysEx opened between the tick's look and the lock is held,
// not dropped, and no request is acted on until it is out; an open SysEx stops holding it after about a second.
// cc -std=c99 -DMODWERK_HOST -DMODWERK_DEV -DUI_QUEUE_PTR_AT=0 -DQUEUE_POST_AT=0 -DKEY_INDEX_AT=0 -DKEY_BITS_AT=0
//   link.c test_link.c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "diag.h"

int mw_link_rx(const uint8_t *msg, int len, int port);
void mw_link_tick(char *ctrl);

static int failed;
#define CHECK(c) do { if (!(c)) { fprintf(stderr, "%s:%d: %s\n", __FILE__, __LINE__, #c); failed = 1; } } while (0)

// What link.c takes from stock, the other base files and link.s.
uint32_t mw_test_upload[64], mw_test_mailbox[64];
volatile struct diag_log mw_diag_log;
uint32_t mw_load_avg, mw_load_wmax, mw_load_peak, mw_load_windows, mw_load_blocks;
uint8_t __run_start[4], __run_words[1];
uint32_t mw_load_tenths(uint32_t ticks) { return ticks; }
void mw_diag_start(uint32_t nonce, uint32_t set_crc) { (void)nonce; (void)set_crc; }
void mw_modules_identity(uint32_t crc) { (void)crc; }
unsigned mw_modules_part(uint32_t offset, const uint8_t *packed, unsigned n) { (void)offset; (void)packed; return n; }
unsigned mw_modules_run(uint32_t length, uint8_t *out) { (void)length; (void)out; return 0; }
unsigned mw_modules_list(uint32_t first, unsigned most, uint8_t *out) { (void)first; (void)most; (void)out; return 0; }
void mw_modules_tick(void) {}
void mw_cache_off(void) {}
void mw_link_reset(void) { abort(); }
void mw_boot_enter(uint32_t arg) { (void)arg; abort(); }

// Stock's USB writer: the bytes of the reply being written, the lock's depth, the writes made outside it.
static uint8_t last_reply[512];
static int last_len, locked, unlocked_writes, writes, open_on_lock, order[8], replies;
volatile uint32_t mw_test_midi_on = 1, mw_test_usb_sysex;
void mw_test_usb_lock(void)
{
    locked++;
    if (open_on_lock) { open_on_lock = 0; mw_test_usb_sysex = 0xF0; }   // another sender began a SysEx just before
}
void mw_test_usb_unlock(void) { locked--; }
void mw_test_usb_write(int len, const uint8_t *bytes)
{
    if (locked != 1) unlocked_writes++;
    if (bytes[0] == 0xF0) {                 // a new reply: its seq, in the order written
        last_len = 0;
        if (replies < 8) order[replies++] = bytes[6];
    }
    CHECK(len <= 144 && last_len + len <= (int)sizeof last_reply);
    memcpy(last_reply + last_len, bytes, (size_t)len);
    last_len += len;
    writes++;
}
static uint32_t booted[4];
static int boots;
void mw_test_ramboot(const uint32_t *numbers)
{
    memcpy(booted, numbers, sizeof booted);
    boots++;
}

#define USB 2
static uint8_t *put32(uint8_t *p, uint32_t v)
{
    for (int i = 0; i < 5; i++, v >>= 7)
        *p++ = v & 0x7f;
    return p;
}
static void ramboot(int seq, uint32_t ulen, uint32_t ucrc, uint32_t clen, uint32_t ccrc)
{
    uint8_t m[64] = {0xF0, 0x7D, 'M', 'W', 'L', 1, (uint8_t)seq, 0x14}, *p = m + 8;
    p = put32(put32(put32(put32(p, ulen), ucrc), clen), ccrc);
    *p++ = 0xF7;
    CHECK(mw_link_rx(m, (int)(p - m), USB) == 1);
}
static int status(int seq)  // the last reply's status, once it answers seq's RAMBOOT
{
    return last_len > 8 && last_reply[6] == seq && last_reply[7] == (0x14 | 0x40) ? last_reply[8] : -1;
}
static void log_read(int seq, uint32_t at, uint32_t count)
{
    uint8_t m[32] = {0xF0, 0x7D, 'M', 'W', 'L', 1, (uint8_t)seq, 0x24}, *p = m + 8;
    p = put32(put32(p, at), count);
    *p++ = 0xF7;
    CHECK(mw_link_rx(m, (int)(p - m), USB) == 1);
}

int main(void)
{
    const uint32_t clen = 0x1000;
    ((uint8_t *)mw_test_upload)[0] = 3;     // stock's upload header: complete
    mw_test_upload[8] = clen;               // its length

    ramboot(1, 0x2000, 0x55555555u, 0xffffffffu, 0x66666666u);
    mw_link_tick(0);
    CHECK(status(1) == 4);                  // RANGE: no upload of that length, and no copy
    for (int i = 0; i < 6; i++)
        mw_link_tick(0);
    CHECK(boots == 0);

    ramboot(2, 0x2000, 0x11111111u, clen, 0x22222222u);
    mw_link_tick(0);
    CHECK(status(2) == 0);                  // accepted: the copy follows a few ticks later
    ramboot(3, 0x2000, 0x33333333u, 0xffffffffu, 0x44444444u);
    mw_link_tick(0);
    CHECK(status(3) == 3);                  // BUSY while the accepted one waits for its copy
    for (int i = 0; i < 4 && !boots; i++)
        mw_link_tick(0);
    CHECK(boots == 1);
    CHECK(booted[0] == 0x2000 && booted[1] == 0x11111111u && booted[2] == clen && booted[3] == 0x22222222u);

    // LOG's 128 bytes: a reply of two parts, both under the lock, ending in F7
    writes = 0;
    log_read(4, 0, 128);
    mw_link_tick(0);
    CHECK(writes == 2 && last_len > 144 && last_reply[last_len - 1] == 0xF7 && last_reply[6] == 4);
    CHECK(unlocked_writes == 0 && locked == 0);

    // another sender's SysEx open: the request waits, then is answered once it has ended
    writes = 0;
    mw_test_usb_sysex = 0xF0;
    log_read(5, 0, 16);
    for (int i = 0; i < 5; i++)
        mw_link_tick(0);
    CHECK(writes == 0);
    mw_test_usb_sysex = 0;
    mw_link_tick(0);
    CHECK(writes == 1 && last_reply[6] == 5 && last_reply[8] == 0);

    // a SysEx opens between the tick's look and the lock: the reply is held, the next request waits behind it
    writes = 0;
    open_on_lock = 1;
    log_read(6, 0, 16);
    mw_link_tick(0);
    CHECK(writes == 0 && locked == 0);
    log_read(7, 0, 16);
    for (int i = 0; i < 3; i++)
        mw_link_tick(0);
    CHECK(writes == 0);
    replies = 0;
    mw_test_usb_sysex = 0;
    mw_link_tick(0);                        // the held reply first, then the request behind it
    CHECK(writes == 2 && replies == 2 && order[0] == 6 && order[1] == 7);

    // a SysEx left open (no F7): after about a second the request is answered anyway
    writes = 0;
    mw_test_usb_sysex = 0xF0;
    log_read(8, 0, 16);
    for (int i = 0; i < 30; i++)
        mw_link_tick(0);
    CHECK(writes == 0);
    for (int i = 0; i < 3 && !writes; i++)
        mw_link_tick(0);
    CHECK(writes == 1 && last_reply[6] == 8);
    mw_test_usb_sysex = 0;
    CHECK(unlocked_writes == 0 && locked == 0);
    return failed;
}
