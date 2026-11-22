// SPDX-License-Identifier: GPL-3.0-or-later
// The Digitone II link's key handling (base/link.c) on the host, with stock's queue, key tables and upload buffer
// stubbed: run by test_dn2_link.py. Exit 0 when every check holds; a failed check prints its line.
#include <stdint.h>
#include <stdio.h>
#include <string.h>

static int sent_status[64], sent_count;
static int stub_sysex_send(const uint8_t *m, int n, const uint8_t *b, int s)
{
    (void)b; (void)s;
    if (n >= 9 && sent_count < 64)
        sent_status[sent_count++] = m[8];
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
static uint8_t usb_state, upload[64];

#define SYSEX_SEND_AT ((uintptr_t)stub_sysex_send)
#define USB_SYSEX_STATE_AT ((uintptr_t)&usb_state)
#define UI_QUEUE_AT ((uintptr_t)stub_ui_queue)
#define QUEUE_POST_AT ((uintptr_t)stub_queue_post)
#define KEY_INDEX_AT ((uintptr_t)key_index)
#define KEY_BITS_AT ((uintptr_t)key_bits)
#define UPLOAD_AT ((uintptr_t)upload)
#include "../machines/digitone-ii/elekloader/base/link.c"

void mw_link_row_label(void) {}
void core_additem(void *menu, const void *r) { (void)menu; (void)r; }
void fw_invalidate(void *view) { (void)view; }
static uint8_t diag_log[64];
const volatile void *mw_diag_log_at(void) { return diag_log; }
uint32_t mw_diag_log_bytes(void) { return sizeof diag_log; }
uint32_t mw_diag_frames(void) { return 0; }
volatile uint32_t mw_diag_test_freeze;

static int failed;
#define CHECK(c) do { if (!(c)) { printf("failed at line %d: %s\n", __LINE__, #c); failed = 1; } } while (0)

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
    return sent_status[sent_count - 1];
}

static void ui_sees_key(int key, int flags)            // stock's loop passes a posted key to ev_key
{
    char event[20] = { 0 };
    memcpy(event + 12, &key, 4);
    memcpy(event + 16, &flags, 4);
    mw_link_key(0, event);
}

static void ui_sees_enc(int enc)
{
    char event[20] = { 0 };
    memcpy(event + 12, &enc, 4);
    mw_link_enc(0, event);
}

int main(void)
{
    int i;
    for (i = 0; i < 111; i++)
        key_index[i] = i < 100 ? i : -1;

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
    upload[0] = 0;
    CHECK(request(CMD_KEY, 10, KEY_DOWN) == ST_OK);

    // The FREEZE test waits for the musician as keys do: refused while a person was just at the panel, then taken.
    ui_sees_key(20, KEY_DOWN);                          // a press the link did not post: a person
    CHECK(request(CMD_FREEZE_TEST, 1500, 0) == ST_HUMAN && mw_diag_test_freeze == 0);
    for (i = 0; i < HUMAN_TICKS - 1; i++)
        mw_link_tick();
    CHECK(request(CMD_FREEZE_TEST, 1500, 0) == ST_HUMAN && mw_diag_test_freeze == 0);
    mw_link_tick();
    CHECK(request(CMD_FREEZE_TEST, 1500, 0) == ST_OK && mw_diag_test_freeze == 1500);
    CHECK(request(CMD_FREEZE_TEST, 15u * 1500u + 1, 0) == ST_BAD);

    if (!failed)
        printf("ok\n");
    return failed;
}
