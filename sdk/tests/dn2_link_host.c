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
    return sent_status[sent_count - 1];
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
    CHECK(ui_sees_key(9, KEY_RELEASE) == 0);           // stock's loop takes the release
    upload[0] = 0;
    CHECK(request(CMD_KEY, 10, KEY_DOWN) == ST_OK);
    CHECK(ui_sees_key(10, KEY_DOWN) == 0);
    CHECK(request(CMD_KEY, 10, KEY_RELEASE) == ST_OK);
    CHECK(ui_sees_key(10, KEY_RELEASE) == 0);

    // The upload completes while a press and a turn the link posted are still in stock's queue: they were accepted
    // before the prompt, so the request's check cannot stop them. At dispatch the link takes them before stock sees
    // them; a release the link posted still reaches stock, and a person's YES and NO always do.
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
        CHECK(ui_sees_key(PANEL_YES, KEY_RELEASE) == 0); // the link's release passes
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

    if (!failed)
        printf("ok\n");
    return failed;
}
