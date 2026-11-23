// SPDX-License-Identifier: GPL-3.0-or-later
// The Model:Cycles' development link over USB MIDI, in development bases only (base.json's dev,
// npm run machine:base -- model-cycles --dev); release bases never carry it. A host on the computer
// asks for the link's identity, reads memory, and presses keys and turns encoders as the panel does. No flash and
// no RAM boot yet.
// After the Analog Rytm MKII's link by Nathaniel Pavel (sdk/machines/analog-rytm-mkii/elekloader/base/link.c),
// with the same wire format, so its host tool's framing applies.
//
// Wire format (SysEx, manufacturer 0x7D, private use):
//   host -> unit  F0 7D 'M' 'W' 'L' 01 seq cmd payload.. F7
//   unit -> host  F0 7D 'M' 'W' 'L' 01 seq cmd|0x40 status payload.. F7
// Numbers are u32 as five 7-bit bytes, least significant first. Byte blocks are 7-bit packed: each
// group of up to 7 bytes follows a byte holding their top bits, the first byte's in bit 6.
//
// Where it runs (OS 1.13, read from the code):
// - Receive: stock's SysEx router (0x400812f6, MIDI task) gets every complete SysEx as (msg, len, port).
//   link.s takes its first instructions: F0 7D 'MWL' is copied into a ring here and goes no further;
//   anything else goes on to stock unchanged (Elektron's F0 00 20 3C, universal F0 7E).
// - Work: ev_tick (UI task) takes the ring, acts and replies with stock's SysEx send (0x400828fe,
//   send(bytes, len, error flag or 0, port)), which writes 144-byte parts. Ports as that routine routes
//   them: 1 the MIDI setting's choice, 2 USB (it writes the USB controller), 3 DIN, 4 both. A request
//   from USB arrives with port 2 (a unit, 23 November 2026); the link serves USB only and drops its
//   messages from any other port. The reply goes back on port 2; IDENT reports the port.
// - Keys and encoders go on the UI task's queue (its address at 0x40148cd0, queue_put 0x40001fba) as the panel's
//   messages do: {type 0 key / 1 encoder, id, flags or a signed step in the top byte, time}. The UI loop
//   (0x400080e6) plays them through the core's ev_key/ev_enc and stock, so modules see them too. Stock's
//   is_key_held (0x4007faf4, the panel's bitmap 0x40f95744 through the table 0x4010ae5c) is pointed at
//   mw_link_held, so a key the link holds reads as held: TRACK + TRIG and FUNC + turn behave as on the panel.
// - Armed at every boot (a development base is meant to be driven); DISARM turns it off until the next boot.
//   A press or turn on the panel is a person at the unit: the link lets go of what it holds and refuses keys and
//   turns for about 3 s.
// - The screen needs no command here: stock answers Elektron's own screenshot request (F0 00 20 3C 10 00,
//   command 0x04) over USB.
#include <stdint.h>

#define LINK_VERSION 1

// Stock, OS 1.13.
#define SYSEX_SEND ((int (*)(const uint8_t *, int, uint8_t *, int))SYSEX_SEND_AT)

#define USB 2                           // the port stock's router reports for USB MIDI (seen on a unit)

#define UI_QUEUE (*(void *volatile *)UI_QUEUE_PTR_AT)
#define QUEUE_POST ((void (*)(void *, const void *))QUEUE_POST_AT)
#define KEY_INDEX ((const int32_t *)KEY_INDEX_AT)          // is_key_held's tables
#define KEY_BITS ((const volatile uint8_t *)KEY_BITS_AT)
#define KEY_IDS 39                      // KEY_INDEX's entries: the panel's key codes 0-38 (TRIG 1-16 are 16-31)
#define ENC_LAST 16                     // the panel posts encoders 0-16
#define MSG_KEY 0
#define MSG_ENC 1
#define KEY_DOWN 1                      // ev_key flags bit 0: down

#define CMD_IDENT 0x01
#define CMD_DISARM 0x02
#define CMD_KEY 0x10
#define CMD_ENC 0x11
#define CMD_RELEASE_ALL 0x12
#define CMD_MEM 0x21
#define ST_OK 0
#define ST_NOT_ARMED 1
#define ST_BAD 2
#define ST_BUSY 3
#define ST_RANGE 4
#define ST_HUMAN 5
#define SLOTS 40                        // posted messages, reused in turn (more than PENDING)
#define PENDING 32                      // posted events not yet seen at ev_key/ev_enc
#define HUMAN_TICKS 90                  // ticks a person's press blocks the link (about 3 s)
#define PEND_TICKS 30                   // about 1 s: a posted event never seen at ev_key/ev_enc is given up

#define RING 8                          // commands waiting for the UI task
#define CMD_BYTES 32                    // a command's bytes, F0..F7 (MEM is 20)
#define PER_TICK 4                      // commands acted on in one tick
#define MEM_MAX 128
#define HEADER 8                        // F0 7D M W L ver seq cmd
#define DDR_END 0x48000000              // the DDR the OS maps (0x40000000-0x47ffffff)

static uint8_t ring[RING][CMD_BYTES];
static uint8_t ring_len[RING];
static uint8_t ring_port[RING];
static volatile uint32_t ring_head, ring_tail, ring_drops, rx_count;
static uint32_t ticks, sent_count, send_fails, last_port;

// ---- arm, the person at the unit, the posted events ---------------------------
static int armed = 1, human_ticks = -1, release_due;
static uint32_t human_count, posted_count, refused_count;
static uint8_t held_bits[8];            // keys this link holds down, a bit each
#define HELD(k) (held_bits[(k) >> 3] >> ((k) & 7) & 1)
#define HOLD(k, on) (held_bits[(k) >> 3] = (uint8_t)((held_bits[(k) >> 3] & ~(1 << ((k) & 7))) | (!!(on) << ((k) & 7))))

struct pend { uint8_t kind, id; int8_t value; };
static struct pend pend[PENDING];
static uint32_t pend_head, pend_tail, pend_seen;
static int pend_age;
static int32_t slots[SLOTS][4];
static uint32_t slot_next;

// The panel's own key bitmap, as stock's is_key_held reads it.
static int panel_down(int key)
{
    int32_t index;
    if ((unsigned)key >= KEY_IDS)
        return 0;
    index = KEY_INDEX[key];
    if (index < 0)
        return 0;
    return (KEY_BITS[index >> 3] >> (index & 7)) & 1;
}

int mw_link_held(int key)               // stock's is_key_held, and the link's holds
{
    if ((unsigned)key < KEY_IDS && HELD(key))
        return 1;
    return panel_down(key);
}

static int post(int kind, int id, int value)
{
    int32_t *m;
    if (pend_head - pend_tail >= PENDING || !UI_QUEUE)
        return 0;                       // the loop is behind: the host retries
    m = slots[slot_next++ % SLOTS];
    m[0] = kind << 24;
    m[1] = id;
    m[2] = kind == MSG_KEY ? value : (int32_t)((uint32_t)(uint8_t)value << 24);
    m[3] = 0;
    pend[pend_head % PENDING] = (struct pend){ (uint8_t)kind, (uint8_t)id, (int8_t)(kind == MSG_KEY ? value & 1 : value) };
    pend_head++;
    QUEUE_POST(UI_QUEUE, m);
    posted_count++;
    return 1;
}

// Lets go of every key the link holds. A release the queue cannot take now stays held and due.
static int release_all(void)
{
    int k, any = 0;
    release_due = 0;
    for (k = 0; k < KEY_IDS; k++)
        if (HELD(k)) {
            any = 1;
            if (post(MSG_KEY, k, 0))
                HOLD(k, 0);
            else
                release_due = 1;
        }
    return any;
}

static void disarm(void)
{
    int k;
    if (armed) {
        release_all();
        armed = 0;
    }
    for (k = 0; k < 8; k++)
        held_bits[k] = 0;
    release_due = 0;
}

// Is this event the next one the link posted? Pops it if so.
static int ours(int kind, int id, int value)
{
    struct pend *p;
    if (pend_head == pend_tail)
        return 0;
    p = &pend[pend_tail % PENDING];
    if (p->kind != kind || p->id != (uint8_t)id || (kind == MSG_KEY && (value & 1) != p->value))
        return 0;
    pend_tail++;
    return 1;
}

// A person pressed or turned something. -> 1 when the link held keys: that first press is taken,
// so it never combines with a key the link still held.
static int human(void)
{
    human_count++;
    if (!armed)
        return 0;
    human_ticks = 0;
    return release_all();
}

// ev_key, first in order: a panel press that is not the link's is a person.
int mw_link_key(void *brain, char *event)
{
    int32_t key = *(int32_t *)(event + 12), flags = *(int32_t *)(event + 16);
    (void)brain;
    if ((uint32_t)key < KEY_IDS && !ours(MSG_KEY, key, flags) && (flags & KEY_DOWN))
        return human();
    return 0;
}

int mw_link_enc(void *brain, char *event)
{
    int32_t enc = *(int32_t *)(event + 12);
    (void)brain;
    if ((uint32_t)enc <= ENC_LAST && !ours(MSG_ENC, enc, 0))
        return human();
    return 0;
}

// From link.s, in the MIDI task, for every SysEx stock's router gets. 1: taken.
int mw_link_rx(const uint8_t *msg, int len, int port)
{
    uint32_t h;
    int i;
    if (len < HEADER + 1 || msg[1] != 0x7D || msg[2] != 'M' || msg[3] != 'W' || msg[4] != 'L')
        return 0;
    if (port != USB)
        return 1;                       // ours, but not from USB: dropped, never acted on
    rx_count++;
    h = ring_head;
    if (h - ring_tail >= RING || len > CMD_BYTES) {
        ring_drops++;
        return 1;
    }
    for (i = 0; i < len; i++)
        ring[h % RING][i] = msg[i];
    ring_len[h % RING] = (uint8_t)len;
    ring_port[h % RING] = (uint8_t)port;
    __asm__ volatile("" ::: "memory");  // the bytes before the index, also for the compiler
    ring_head = h + 1;                  // published last: the UI task reads it after the bytes
    return 1;
}

// ---- replies ---------------------------------------------------------------
static uint8_t reply[HEADER + 1 + 5 + (MEM_MAX / 7 + 1) * 8 + 1];

static uint8_t *put32(uint8_t *p, uint32_t v)
{
    int i;
    for (i = 0; i < 5; i++, v >>= 7)
        *p++ = v & 0x7f;
    return p;
}

static uint32_t get32(const uint8_t *p)
{
    return p[0] | (uint32_t)p[1] << 7 | (uint32_t)p[2] << 14 | (uint32_t)p[3] << 21 | (uint32_t)(p[4] & 0x0f) << 28;
}

static uint8_t *pack(uint8_t *p, const volatile uint8_t *src, int n)
{
    int i, k;
    for (i = 0; i < n; i += 7) {
        uint8_t *top = p++;
        *top = 0;
        for (k = 0; k < 7 && i + k < n; k++) {
            uint8_t b = src[i + k];
            if (b & 0x80)
                *top |= 0x40 >> k;
            *p++ = b & 0x7f;
        }
    }
    return p;
}

static uint8_t *begin(int seq, int cmd, int status)
{
    uint8_t *p = reply;
    *p++ = 0xF0;
    *p++ = 0x7D;
    *p++ = 'M';
    *p++ = 'W';
    *p++ = 'L';
    *p++ = LINK_VERSION;
    *p++ = (uint8_t)seq;
    *p++ = (uint8_t)(cmd | 0x40);
    *p++ = (uint8_t)status;
    return p;
}

static void send(uint8_t *end, int port)
{
    *end++ = 0xF7;
    if (SYSEX_SEND(reply, end - reply, 0, port))
        sent_count++;
    else
        send_fails++;
}

static int readable(uint32_t a, uint32_t n)
{
    if (n == 0 || n > MEM_MAX || a + n < a)
        return 0;
    return (a >= 0x40000000 && a + n <= DDR_END) || (a >= 0x80000000 && a + n <= 0x80010000);
}

static void act(const uint8_t *m, int len, int port)
{
    int seq = m[6], cmd = m[7], n = len - HEADER - 1;
    const uint8_t *a = m + HEADER;
    uint8_t *p;
    last_port = (uint32_t)port;
    if (m[5] != LINK_VERSION) {
        send(begin(seq, cmd, ST_BAD), port);
        return;
    }
    switch (cmd) {
    case CMD_IDENT:
        p = begin(seq, cmd, ST_OK);
        p = put32(p, LINK_VERSION);
        p = put32(p, rx_count);
        p = put32(p, ring_drops);
        p = put32(p, ticks);
        p = put32(p, (uint32_t)port);
        p = put32(p, sent_count);
        p = put32(p, send_fails);
        p = put32(p, (uint32_t)armed);
        p = put32(p, human_ticks >= 0 && human_ticks < HUMAN_TICKS);
        p = put32(p, human_count);
        p = put32(p, posted_count);
        p = put32(p, refused_count);
        send(p, port);
        return;
    case CMD_DISARM:
        disarm();
        send(begin(seq, cmd, ST_OK), port);
        return;
    case CMD_KEY:
    case CMD_ENC:
    case CMD_RELEASE_ALL: {
        int status = ST_OK;
        if (!armed)
            status = ST_NOT_ARMED;
        else if (human_ticks >= 0 && human_ticks < HUMAN_TICKS)
            status = ST_HUMAN;
        else if (cmd == CMD_RELEASE_ALL)
            release_all();
        else if (n < 10)
            status = ST_BAD;
        else {
            uint32_t id = get32(a), v = get32(a + 5);
            if (cmd == CMD_KEY ? id >= KEY_IDS || KEY_INDEX[id] < 0 : id > ENC_LAST)
                status = ST_BAD;        // only the panel's own keys and encoders
            else if (cmd == CMD_KEY) {
                if (!post(MSG_KEY, (int)id, (int)v))
                    status = ST_BUSY;
                else
                    HOLD(id, v & KEY_DOWN);
            } else if (!post(MSG_ENC, (int)id, (int)(int8_t)v))
                status = ST_BUSY;
        }
        if (status != ST_OK)
            refused_count++;
        send(begin(seq, cmd, status), port);
        return;
    }
    case CMD_MEM: {
        uint32_t addr, count;
        if (n < 10) {
            send(begin(seq, cmd, ST_BAD), port);
            return;
        }
        addr = get32(a);
        count = get32(a + 5);
        if (!readable(addr, count)) {
            send(begin(seq, cmd, ST_RANGE), port);
            return;
        }
        p = begin(seq, cmd, ST_OK);
        p = put32(p, addr);
        p = put32(p, count);
        p = pack(p, (const volatile uint8_t *)addr, (int)count);
        send(p, port);
        return;
    }
    default:
        send(begin(seq, cmd, ST_BAD), port);
    }
}

void mw_link_tick(char *ctrl)
{
    int done;
    (void)ctrl;
    ticks++;
    if (human_ticks >= 0 && human_ticks < HUMAN_TICKS)
        human_ticks++;
    if (release_due)
        release_all();
    // A posted event the loop took without passing it to ev_key/ev_enc would hold the head of pend
    // for good: every later event of the link would then count as a person's. Give it up after a second.
    if (pend_head == pend_tail || pend_tail != pend_seen) {
        pend_seen = pend_tail;
        pend_age = 0;
    } else if (++pend_age > PEND_TICKS) {
        pend_tail = pend_seen = pend_head;
        pend_age = 0;
    }
    for (done = 0; done < PER_TICK && ring_tail != ring_head; done++) {
        uint32_t t = ring_tail;
        act(ring[t % RING], ring_len[t % RING], ring_port[t % RING]);
        ring_tail = t + 1;
    }
}
