// SPDX-License-Identifier: GPL-3.0-or-later
// The Digitone II link (base/link.c) on the host, with stock's sysex_send, queue, key tables, upload buffer and frame
// pointers stubbed: run by test_dn2_link.py. Exit 0 and "ok" when every check holds; a failed check prints its line.
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
static int queue_obj;
static void *stub_ui_queue(void) { return &queue_obj; }
struct posted { int32_t kind, id, value; };
static struct posted posted[256];
static int posted_count_host;
static void stub_queue_post(void *q, const void *msg)
{
    const int32_t *m = msg;
    (void)q;
    posted[posted_count_host++ % 256] = (struct posted){ m[0] >> 24, m[1], m[2] };
}
static int32_t key_index[111];
static uint8_t key_bits[16];
static uint8_t usb_state;
static uint32_t upload_words[8 + 2 + 64];       // stock's header, the struct (length, then a 256-byte container)
#define upload ((uint8_t *)upload_words)

#define SYSEX_SEND_AT ((uintptr_t)stub_sysex_send)
#define USB_SYSEX_STATE_AT ((uintptr_t)&usb_state)
#define UI_QUEUE_AT ((uintptr_t)stub_ui_queue)
#define QUEUE_POST_AT ((uintptr_t)stub_queue_post)
#define KEY_INDEX_AT ((uintptr_t)key_index)
#define KEY_BITS_AT ((uintptr_t)key_bits)
#define UPLOAD_AT ((uintptr_t)upload)
// "DDR" for the test: the frame on the screen and, around it, bytes no reply may carry.
static uint8_t ddr[8192];
static uint8_t outside[64];
static uint8_t *frame_pointers[2];
#define FRAME_POINTERS_AT ((uintptr_t)frame_pointers)
#define DDR_START ((uintptr_t)ddr)
#define DDR_END ((uintptr_t)ddr + sizeof ddr)
#define MASK_INTERRUPTS() ((void)0)
// The RAM boot's addresses (where base.json has them): host buffers, never reached by these checks.
static uint8_t ramboot_copy[64];
static uint32_t ramboot_diag[32];
static uint32_t boot_arg;
static void stub_delay(int t) { (void)t; }
static void stub_drain(void) {}
#define RAMBOOT_COPY_AT ((uintptr_t)ramboot_copy)
#define RAMBOOT_DIAG_AT ((uintptr_t)ramboot_diag)
#define BOOT_ARG_AT ((uintptr_t)&boot_arg)
#define STOCK_DELAY_AT ((uintptr_t)stub_delay)
#define STOCK_DRAIN_AT ((uintptr_t)stub_drain)
#include "../machines/digitone-ii/elekloader/base/link.c"

void mw_link_row_label(void) {}
void core_additem(void *menu, const void *r) { (void)menu; (void)r; }
void fw_invalidate(void *view) { (void)view; }
static uint32_t diag_log_words[75];                   // 300 bytes: two whole parts and a short one
#define diag_log ((uint8_t *)diag_log_words)
const volatile void *mw_diag_log_at(void) { return diag_log; }
uint32_t mw_diag_log_bytes(void) { return sizeof diag_log_words; }
uint32_t mw_diag_frames(void) { return 0; }
volatile uint32_t mw_diag_test_freeze;
#include <stdlib.h>
void mw_cache_push(void) {}
void mw_cache_off(void) {}
void mw_link_reset(void) { abort(); }               // the RAM boot's reset: never reached by these checks
void mw_boot_enter(uint32_t arg) { (void)arg; abort(); }

static int failed;
#define CHECK(c) do { if (!(c)) { printf("failed at line %d: %s\n", __LINE__, #c); failed = 1; } } while (0)

#define PANEL_YES 10                                    // the YES key (the SDK guide's key codes)
static int presses_of(int key)
{
    int i, n = 0;
    for (i = 0; i < posted_count_host; i++)
        n += posted[i].kind == MSG_KEY && posted[i].id == key && posted[i].value == KEY_DOWN;
    return n;
}

static int releases_of(int key)
{
    int i, n = 0;
    for (i = 0; i < posted_count_host; i++)
        n += posted[i].kind == MSG_KEY && posted[i].id == key && posted[i].value == KEY_RELEASE;
    return n;
}

static int request(int cmd, uint32_t id, uint32_t v)   // the link's reply status
{
    uint8_t m[32] = { 0xF0, 0x7D, 'M', 'W', 'L', LINK_VERSION, 1, (uint8_t)cmd };
    uint8_t *p = m + HEADER;
    int i;
    for (i = 0; i < 5; i++)
        *p++ = (uint8_t)((id >> (7 * i)) & 0x7f);
    for (i = 0; i < 5; i++)
        *p++ = (uint8_t)((v >> (7 * i)) & 0x7f);
    *p++ = 0xF7;
    act(m, (int)(p - m));
    return last_reply[8];
}

// ---- what a client can read: the link's counters and the screen, nothing at an address it names ----
static int ask1(int cmd, int words, uint32_t a)    // a request with no value or one; -> its status
{
    uint8_t m[32] = { 0xF0, 0x7D, 'M', 'W', 'L', LINK_VERSION, 3, (uint8_t)cmd };
    uint8_t *p = m + HEADER;
    if (words > 0)
        p = put32(p, a);
    *p++ = 0xF7;
    act(m, (int)(p - m));
    return last_reply[8];
}

static void unpack_reply(const uint8_t *src, uint8_t *dst, int n)   // as dn2_link.py's unpack7
{
    int i, k, o = 0;
    for (i = 0; o < n; i += 8)
        for (k = 0; k < 7 && o < n; k++)
            dst[o++] = (uint8_t)(src[i + 1 + k] | (src[i] & (0x40 >> k) ? 0x80 : 0));
}

static int part_fits(uint32_t off, uint32_t *number, uint8_t *out)   // OFF, the copy's number, 128 packed bytes, F7
{
    int expected = HEADER + 1 + 5 + 5 + SCREEN_PART + (SCREEN_PART + 6) / 7 + 1;
    if (last_len != expected || last_reply[last_len - 1] != 0xF7 || get32(last_reply + 9) != off)
        return 0;
    *number = get32(last_reply + 14);
    unpack_reply(last_reply + 19, out, SCREEN_PART);
    return 1;
}

static int request4(int cmd, const uint32_t v[4])     // ramboot's four values
{
    uint8_t m[40] = { 0xF0, 0x7D, 'M', 'W', 'L', LINK_VERSION, 1, (uint8_t)cmd };
    uint8_t *p = m + HEADER;
    int i, k;
    for (k = 0; k < 4; k++)
        for (i = 0; i < 5; i++)
            *p++ = (uint8_t)((v[k] >> (7 * i)) & 0x7f);
    *p++ = 0xF7;
    act(m, (int)(p - m));
    return last_reply[8];
}

// The diagnostics log in parts the unit chooses: the bytes of diag.c's log and nothing past it, with its seq.
static void log_checks(void)
{
    uint8_t part[LOG_PART];
    uint32_t off, n, size = mw_diag_log_bytes();
    int i;
    for (i = 0; i < (int)size; i++)
        diag_log[i] = (uint8_t)(i * 3 + 7);
    ((uint32_t *)diag_log)[4] = 0x1234;               // struct diag_log's seq
    for (off = 0; off < size; off += LOG_PART) {
        n = size - off < LOG_PART ? size - off : LOG_PART;
        CHECK(ask1(CMD_LOG, 1, off) == ST_OK);
        CHECK(last_len == (int)(HEADER + 1 + 5 + 5 + n + (n + 6) / 7 + 1) && get32(last_reply + 9) == off);
        CHECK(get32(last_reply + 14) == 0x1234);
        unpack_reply(last_reply + 19, part, (int)n);
        CHECK(memcmp(part, diag_log + off, n) == 0);
    }
    {
        uint32_t bad[] = { size, size + LOG_PART, 1, 64, LOG_PART + 1, 0x7FFFFFFF, 0xFFFFFF80 };
        for (i = 0; i < (int)(sizeof bad / sizeof bad[0]); i++)
            CHECK(ask1(CMD_LOG, 1, bad[i]) == ST_RANGE && last_len == HEADER + 2);
    }
    CHECK(ask1(CMD_LOG, 0, 0) == ST_BAD && last_len == HEADER + 2);
}

static void screen_checks(void)
{
    uint8_t got[FRAME_BYTES], part[SCREEN_PART];
    uint32_t number = 0, n2 = 0, off;
    int i;
    for (i = 0; i < (int)sizeof ddr; i++)
        ddr[i] = (uint8_t)(0xA5 ^ i);
    memset(outside, 0x5A, sizeof outside);
    frame_pointers[0] = ddr;                         // the frame stock draws next
    frame_pointers[1] = ddr + 2048;                  // the frame on the screen
    for (i = 0; i < FRAME_BYTES; i++)
        frame_pointers[1][i] = (uint8_t)(i * 7 + 1);

    CHECK(ask1(CMD_SCREEN, 1, 128) == ST_RANGE && last_len == HEADER + 2);   // no copy yet
    CHECK(ask1(CMD_SCREEN, 1, 0) == ST_OK && part_fits(0, &number, got) && number == 1);
    for (i = 0; i < FRAME_BYTES; i++)
        frame_pointers[1][i] ^= 0xFF;                // stock draws between the parts
    for (off = SCREEN_PART; off < FRAME_BYTES; off += SCREEN_PART)
        CHECK(ask1(CMD_SCREEN, 1, off) == ST_OK && part_fits(off, &n2, got + off) && n2 == number);
    for (i = 0; i < FRAME_BYTES; i++)
        CHECK(got[i] == (uint8_t)(i * 7 + 1));       // one frame, not torn
    CHECK(ask1(CMD_SCREEN, 1, 0) == ST_OK && part_fits(0, &n2, part) && n2 == 2 && part[0] == (uint8_t)(1 ^ 0xFF));
    {
        uint32_t bad[] = { 1, 64, 127, 129, FRAME_BYTES, FRAME_BYTES + SCREEN_PART, 0x7FFFFFFF, 0xFFFFFF80 };
        for (i = 0; i < (int)(sizeof bad / sizeof bad[0]); i++)
            CHECK(ask1(CMD_SCREEN, 1, bad[i]) == ST_RANGE && last_len == HEADER + 2);
    }
    CHECK(ask1(CMD_SCREEN, 0, 0) == ST_BAD);
    frame_pointers[1] = outside;                     // a pointer not wholly in DDR is never read
    CHECK(ask1(CMD_SCREEN, 1, 0) == ST_RANGE);
    frame_pointers[1] = ddr + sizeof ddr - FRAME_BYTES + 1;
    CHECK(ask1(CMD_SCREEN, 1, 0) == ST_RANGE);
    frame_pointers[1] = 0;
    CHECK(ask1(CMD_SCREEN, 1, 0) == ST_RANGE);
    CHECK(ask1(CMD_SCREEN, 1, SCREEN_PART) == ST_OK && part_fits(SCREEN_PART, &n2, part) && n2 == 2);

    // The old mem, and every command the link does not have: refused with nothing but the status.
    {
        uint32_t addrs[] = { (uint32_t)(uintptr_t)ddr, 0x40000000, 0x47f00000, 0x80000000, 0x402a10c8, 0 };
        for (i = 0; i < (int)(sizeof addrs / sizeof addrs[0]); i++)
            CHECK(request(0x21, addrs[i], 16) == ST_BAD && last_len == HEADER + 2);
        for (i = 0; i < 0x40; i++)
            if (i != CMD_IDENT && i != CMD_SCREEN && i != CMD_DISARM && i != CMD_KEY && i != CMD_ENC && i != CMD_RELEASE_ALL
                && i != CMD_DIAG && i != CMD_FREEZE_TEST && i != CMD_LOG && i != CMD_RAMBOOT && i != CMD_BOOTDIAG)
                CHECK(request(i, 0x40000000, 128) == ST_BAD && last_len == HEADER + 2);
    }
    {
        uint8_t m[] = { 0xF0, 0x7D, 'M', 'W', 'L', LINK_VERSION + 1, 4, CMD_SCREEN, 0, 0, 0, 0, 0, 0xF7 };
        act(m, (int)sizeof m);
        CHECK(last_reply[8] == ST_BAD && last_len == HEADER + 2);
    }
}

static int ui_sees_key(int key, int flags)             // stock's loop passes a posted key to ev_key; 1: taken, stock never sees it
{
    char event[20] = { 0 };
    memcpy(event + 12, &key, 4);
    memcpy(event + 16, &flags, 4);
    return mw_link_key(0, event);
}

static int ui_sees_enc(int enc)
{
    char event[20] = { 0 };
    memcpy(event + 12, &enc, 4);
    return mw_link_enc(0, event);
}

int main(void)
{
    int i;
    for (i = 0; i < 111; i++)
        key_index[i] = i < 100 ? i : -1;

    screen_checks();
    log_checks();

    // Disarm with a held key and a full queue: the release waits, then arrives once when there is room.
    CHECK(request(CMD_KEY, 5, KEY_DOWN) == ST_OK);
    ui_sees_key(5, KEY_DOWN);
    while (post(MSG_ENC, 1, 1))
        ;                                               // the UI loop is behind: the queue is full
    disarm();
    CHECK(releases_of(5) == 0);
    CHECK(mw_link_held(5));                            // stock still sees the key the link pressed
    CHECK(request(CMD_KEY, 6, KEY_DOWN) == ST_NOT_ARMED);  // and no new press is taken
    mw_link_tick();
    CHECK(releases_of(5) == 0);                        // still no room
    for (i = 0; i < PENDING; i++)
        ui_sees_enc(1);                                 // the loop catches up
    mw_link_tick();
    CHECK(releases_of(5) == 1);
    CHECK(!mw_link_held(5));
    mw_link_tick();
    mw_link_tick();
    CHECK(releases_of(5) == 1);                        // once

    // Disarm with room: the release goes at once, as before.
    set_armed((void **)&(void *){ upload }, 1);
    CHECK(request(CMD_KEY, 7, KEY_DOWN) == ST_OK);
    ui_sees_key(7, KEY_DOWN);
    disarm();
    CHECK(releases_of(7) == 1 && !mw_link_held(7));

    // An OS upload waits at UPGRADE OS NOW?: no remote key, encoder or hold until a person confirms.
    set_armed((void **)&(void *){ upload }, 1);
    CHECK(request(CMD_KEY, 9, KEY_DOWN) == ST_OK);    // held before the upload completes
    ui_sees_key(9, KEY_DOWN);
    upload[0] = 3;
    CHECK(!mw_link_held(9));                           // stock's is_key_held no longer sees it
    CHECK(request(CMD_KEY, KEY_INDEX[10] >= 0 ? 10 : 9, KEY_DOWN) == ST_FLASH);
    CHECK(request(CMD_ENC, 1, 1) == ST_FLASH);
    CHECK(request(CMD_RELEASE_ALL, 0, 0) == ST_OK);    // letting go stays allowed
    CHECK(releases_of(9) == 1);
    CHECK(ui_sees_key(9, KEY_RELEASE) == 1);           // taken: stock would answer the prompt with it
    upload[0] = 0;
    CHECK(request(CMD_KEY, 10, KEY_DOWN) == ST_OK);
    CHECK(ui_sees_key(10, KEY_DOWN) == 0);
    CHECK(request(CMD_KEY, 10, KEY_RELEASE) == ST_OK);
    CHECK(ui_sees_key(10, KEY_RELEASE) == 0);

    // The upload completes while a press and a turn the link posted are still in stock's queue: they were accepted
    // before the prompt, so the request's check cannot stop them. At dispatch the link takes them before stock sees
    // them, a release the link posted too (stock takes a YES key-up as the answer), and a person's YES and NO always
    // reach stock.
    for (i = 0; i <= HUMAN_TICKS; i++)
        mw_link_tick();                                // past the person's interval
    {
        uint32_t refused = refused_count;
        int yes = presses_of(PANEL_YES), key = KEY_INDEX[12] >= 0 ? 12 : 10;
        CHECK(request(CMD_KEY, PANEL_YES, KEY_DOWN) == ST_OK);    // queued, not yet dispatched
        CHECK(request(CMD_ENC, 2, 1) == ST_OK);
        CHECK(presses_of(PANEL_YES) == yes + 1);
        upload[0] = 3;                                 // UPGRADE OS NOW? opens
        CHECK(ui_sees_key(PANEL_YES, KEY_DOWN) == 1);    // taken: stock never sees the link's YES
        CHECK(ui_sees_enc(2) == 1);
        CHECK(refused_count == refused + 2);
        CHECK(pend_head == pend_tail);                 // both popped: the next event is not mistaken for the link's
        CHECK(request(CMD_RELEASE_ALL, 0, 0) == ST_OK);
        CHECK(ui_sees_key(PANEL_YES, KEY_RELEASE) == 1); // the link's release is taken too
        CHECK(refused_count == refused + 3);
        CHECK(!mw_link_held(PANEL_YES));
        CHECK(ui_sees_key(PANEL_YES, KEY_DOWN) == 0);    // a person's YES: stock gets it
        CHECK(ui_sees_key(PANEL_YES, KEY_RELEASE) == 0);
        CHECK(request(CMD_KEY, key, KEY_DOWN) != ST_OK);  // the link presses nothing at the prompt
        CHECK(ui_sees_key(key, KEY_DOWN) == 0);        // a person's NO (any key): stock gets it
        upload[0] = 0;
    }

    // A person's press while the link holds a key: taken (it lets the link's keys go) outside the prompt, passed
    // through at the prompt, where it is the person's answer.
    for (i = 0; i <= HUMAN_TICKS; i++)
        mw_link_tick();
    CHECK(request(CMD_KEY, 9, KEY_DOWN) == ST_OK);
    CHECK(ui_sees_key(9, KEY_DOWN) == 0);
    upload[0] = 3;
    CHECK(ui_sees_key(PANEL_YES, KEY_DOWN) == 0);
    CHECK(!mw_link_held(9));
    upload[0] = 0;

    // The FREEZE test waits for the musician as keys do: refused while a person was just at the panel, then taken.
    ui_sees_key(20, KEY_DOWN);                          // a press the link did not post: a person
    CHECK(request(CMD_FREEZE_TEST, 1500, 0) == ST_HUMAN && mw_diag_test_freeze == 0);
    for (i = 0; i < HUMAN_TICKS - 1; i++)
        mw_link_tick();
    CHECK(request(CMD_FREEZE_TEST, 1500, 0) == ST_HUMAN && mw_diag_test_freeze == 0);
    mw_link_tick();
    CHECK(request(CMD_FREEZE_TEST, 1500, 0) == ST_OK && mw_diag_test_freeze == 1500);
    CHECK(request(CMD_FREEZE_TEST, 15u * 1500u + 1, 0) == ST_BAD);

    for (i = 0; i <= HUMAN_TICKS; i++)
        mw_link_tick();                                // past the person's interval
#ifdef CMD_RAMBOOT
    // RAM boot: YES only while UPGRADE OS NOW? waits for the upload the host describes; otherwise the panel is left alone.
    {
        uint8_t *container = (uint8_t *)(upload_words + 10);
        uint32_t args[4] = { 0x200000, 0x2f2c3b6e, 256, 0 };
        int yes = presses_of(PANEL_YES), posts = posted_count_host, i;
        for (i = 0; i < 256; i++)
            container[i] = (uint8_t)(i * 13 + 5);
        args[3] = crc32(container, 256);                // the host's CRC of the container it sent (zlib's)
        CHECK(crc32_nibble(container, 256) == args[3]);
        CHECK(crc32_nibble((const uint8_t *)"123456789", 9) == 0xcbf43926);   // zlib's check value
        upload_words[8] = 256;
        upload[0] = 0;
        CHECK(request4(CMD_RAMBOOT, args) == ST_NO_PROMPT && presses_of(PANEL_YES) == yes && !mw_link_ramboot_due);
        upload[0] = 3;
        upload_words[8] = 260;                          // another upload's length
        CHECK(request4(CMD_RAMBOOT, args) == ST_NO_PROMPT && presses_of(PANEL_YES) == yes && !mw_link_ramboot_due);
        upload_words[8] = 256;
        container[100] ^= 0x01;                         // another container of the same size: one bit apart
        CHECK(request4(CMD_RAMBOOT, args) == ST_NO_PROMPT && !mw_link_ramboot_due);
        CHECK(posted_count_host == posts);              // the panel is left alone: nothing posted, no YES
        container[100] ^= 0x01;
        args[2] = CONTAINER_MAX + 1;                    // a length past the copy's room is never read
        upload_words[8] = CONTAINER_MAX + 1;
        CHECK(request4(CMD_RAMBOOT, args) == ST_NO_PROMPT && posted_count_host == posts);
        args[2] = 256;
        upload_words[8] = 256;
        CHECK(request4(CMD_RAMBOOT, args) == ST_OK && presses_of(PANEL_YES) == yes + 1 && mw_link_ramboot_due == 1);
        CHECK(ui_sees_key(PANEL_YES, KEY_DOWN) == 0);     // ramboot's own YES answers the prompt: stock gets both
        CHECK(ui_sees_key(PANEL_YES, KEY_RELEASE) == 0);
        CHECK(pend_head == pend_tail);
        upload[0] = 0;
    }
#endif


    // bootdiag: the gate's 15 words and the two marks, nothing else.
    for (i = 0; i < 32; i++)
        ramboot_diag[i] = 0x11110000u + (uint32_t)i;
    CHECK(ask1(CMD_BOOTDIAG, 0, 0) == ST_OK && last_len == HEADER + 1 + 17 * 5 + 1);
    for (i = 0; i < 17; i++)
        CHECK(get32(last_reply + 9 + 5 * i) == 0x11110000u + (uint32_t)i);   // DIAG 0-14, then MARK at 0x3c: words 15, 16

    if (!failed)
        printf("ok\n");
    return failed;
}
