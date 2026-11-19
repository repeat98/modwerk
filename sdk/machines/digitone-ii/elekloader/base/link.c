// SPDX-License-Identifier: GPL-3.0-or-later
// The Digitone II's development link, stage one: read-only diagnostics over USB MIDI SysEx, in the Analog Rytm MKII
// link's wire format (sdk/machines/analog-rytm-mkii/LINK.md), so one host speaks to both. Development bases only.
// Requests and replies are F0 7D 'M' 'W' 'L' version seq cmd ... F7; a reply's cmd has 0x40 set, then a status.
// Numbers are u32 as five 7-bit bytes, least significant first; byte blocks are 7-bit packed, the first byte's top
// bit in bit 6 of the group's leading byte.
//   ident 0x01 -> link version, messages received, messages dropped, ticks
//   mem   0x21 ADDR N -> up to 128 bytes of DDR (0x40000000-0x47ffffff) or SRAM (0x80000000-0x8000ffff)
// Receive (link.s): stock's SysEx router, MIDI task; the link's own messages from USB go into a ring, the router goes
// on as stock. Work: ev_tick (UI task) takes the ring and replies through stock's sysex_send on USB.
#include <stdint.h>
#define COLD __attribute__((cold, noinline))

#define LINK_VERSION 1
#define SYSEX_SEND ((int (*)(const uint8_t *, int, const uint8_t *, int))SYSEX_SEND_AT)   // stock, OS 1.12
// The status byte of stock's USB MIDI receive parser (OS 1.12, 0x4011f3c0, which the USB driver is given): 0xF0
// while a SysEx message is arriving on USB. One byte here; the Rytm's is a word.
#define USB_SYSEX_STATE (*(volatile uint8_t *)USB_SYSEX_STATE_AT)

#define USB 2
#define AUTO_USB 4
#define ST_OK 0
#define ST_BAD 2
#define ST_RANGE 4
#define CMD_IDENT 0x01
#define CMD_MEM 0x21
#define HEADER 8                        // F0 7D M W L ver seq cmd
#define RING 8                          // requests waiting for the UI task
#define CMD_BYTES 32                    // a request's bytes, F0..F7 (mem, the longest, is 19)
#define PER_TICK 4                      // requests answered in one tick
#define MEM_MAX 128
#define DDR_END 0x48000000

static uint8_t ring[RING][CMD_BYTES];
static uint8_t ring_len[RING];
static volatile uint32_t ring_head, ring_tail, ring_drops, rx_count;
static uint32_t ticks;

// From link.s, in the MIDI task, for every SysEx stock's router gets.
void mw_link_rx(const uint8_t *msg, uint32_t len, uint32_t source)
{
    uint32_t h;
    uint32_t i;
    if (len < HEADER + 1 || msg[0] != 0xF0 || msg[1] != 0x7D || msg[2] != 'M' || msg[3] != 'W' || msg[4] != 'L')
        return;
    if (source != USB && source != AUTO_USB)
        return;                         // ours, but not from USB: never acted on
    rx_count++;
    h = ring_head;
    if (h - ring_tail >= RING || len > CMD_BYTES) {
        ring_drops++;
        return;
    }
    for (i = 0; i < len; i++)
        ring[h % RING][i] = msg[i];
    ring_len[h % RING] = (uint8_t)len;
    __asm__ volatile("" ::: "memory");  // the bytes before the index, also for the compiler
    ring_head = h + 1;                  // published last: the UI task reads it after the bytes
}

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

static void send(uint8_t *end)
{
    *end++ = 0xF7;
    SYSEX_SEND(reply, end - reply, 0, USB);
}

static int readable(uint32_t a, uint32_t n)
{
    if (n == 0 || n > MEM_MAX || a + n < a)
        return 0;
    return (a >= 0x40000000 && a + n <= DDR_END) || (a >= 0x80000000 && a + n <= 0x80010000);
}

static void COLD act(const uint8_t *m, int len)
{
    int seq = m[6], cmd = m[7], n = len - HEADER - 1;
    uint8_t *p;
    if (m[5] != LINK_VERSION || m[len - 1] != 0xF7) {
        send(begin(seq, cmd, ST_BAD));
        return;
    }
    switch (cmd) {
    case CMD_IDENT:
        p = begin(seq, cmd, ST_OK);
        p = put32(p, LINK_VERSION);
        p = put32(p, rx_count);
        p = put32(p, ring_drops);
        p = put32(p, ticks);
        send(p);
        return;
    case CMD_MEM:
        if (n < 10) {
            send(begin(seq, cmd, ST_BAD));
            return;
        } else {
            uint32_t a = get32(m + HEADER), count = get32(m + HEADER + 5);
            if (!readable(a, count)) {
                send(begin(seq, cmd, ST_RANGE));
                return;
            }
            p = begin(seq, cmd, ST_OK);
            p = put32(p, a);
            p = pack(p, (const volatile uint8_t *)a, (int)count);
            send(p);
        }
        return;
    default:
        send(begin(seq, cmd, ST_BAD));
    }
}

void mw_link_tick(void)
{
    int done;
    ticks++;
    for (done = 0; done < PER_TICK && ring_tail != ring_head; done++) {
        uint32_t t = ring_tail;
        if (USB_SYSEX_STATE == 0xF0)
            break;                      // stock is mid-SysEx on USB: next tick
        act(ring[t % RING], ring_len[t % RING]);
        ring_tail = t + 1;
    }
}
