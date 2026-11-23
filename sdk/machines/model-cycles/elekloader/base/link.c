// SPDX-License-Identifier: GPL-3.0-or-later
// The Model:Cycles' development link over USB MIDI, in development bases only (base.json's dev,
// npm run machine:base -- model-cycles --dev); release bases never carry it. A host on the computer
// asks for the link's identity and reads memory. Read-only: no keys, no flash, no RAM boot yet.
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
// - The screen needs no command here: stock answers Elektron's own screenshot request (F0 00 20 3C 10 00,
//   command 0x04) over USB.
#include <stdint.h>

#define LINK_VERSION 1

// Stock, OS 1.13.
#define SYSEX_SEND ((int (*)(const uint8_t *, int, uint8_t *, int))SYSEX_SEND_AT)

#define USB 2                           // the port stock's router reports for USB MIDI (seen on a unit)

#define CMD_IDENT 0x01
#define CMD_MEM 0x21
#define ST_OK 0
#define ST_BAD 2
#define ST_RANGE 4

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
        send(p, port);
        return;
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
    for (done = 0; done < PER_TICK && ring_tail != ring_head; done++) {
        uint32_t t = ring_tail;
        act(ring[t % RING], ring_len[t % RING], ring_port[t % RING]);
        ring_tail = t + 1;
    }
}
