// SPDX-License-Identifier: GPL-3.0-or-later
// The development link for the Digitakt II platform (one file, each machine's addresses in its recipe: owner, board,
// 19 November 2026), built for the Digitone II: diagnostics and, while armed, panel keys and encoders over USB MIDI SysEx, in the Analog Rytm MKII
// link's wire format (sdk/machines/analog-rytm-mkii/LINK.md), so one host speaks to both. Development bases only.
// Requests and replies are F0 7D 'M' 'W' 'L' version seq cmd ... F7; a reply's cmd has 0x40 set, then a status.
// Numbers are u32 as five 7-bit bytes, least significant first; byte blocks are 7-bit packed, the first byte's top
// bit in bit 6 of the group's leading byte.
//   ident   0x01 -> link version, messages received, messages dropped, ticks, armed, person at the unit,
//                   presses and turns from a person, events posted, requests refused, RAM boot status and image,
//                   the boot record's address, modules live, the address of the modules' test value
//   disarm  0x02 -> lets go of every key the link holds and turns the arm off
//   key     0x10 ID FLAGS -> a panel key message (flags bit 0 down, 0x10 a release), armed only
//   enc     0x11 N DELTA -> an encoder turn (1-8 A-H, 9 LEVEL), armed only
//   release 0x12 -> lets go of every key the link holds, armed only
//   ramboot 0x14 ULEN UCRC CLEN CCRC -> armed: YES for stock's UPGRADE OS NOW?, and where stock would erase and write
//                   the flash the base resets into the staged image instead (LINK.md, RAM boot). Nothing writes the flash.
//   mem     0x21 ADDR N -> up to 128 bytes of DDR (0x40000000-0x47ffffff) or SRAM (0x80000000-0x8000ffff)
//   diag    0x22 -> the diagnostics log's address and size (read it with mem), frame interrupts and UI ticks so far
//   freeze  0x23 N -> armed: the next UI tick stands still N frames (at most 15 s), audio goes on: a FREEZE test
//   upload  0x30 FRAME -> armed: one request frame of the runtime loader's upload controller (sdk/runtime/upload,
//                   wire v1), 7-bit packed; the reply holds its response frame, packed. One at a time: a frame sent
//                   while one waits is dropped. Modules load to RAM for a trial; ten seconds without a frame during a
//                   trial roll it back once the unit is stopped (LOADER.md). A power cycle ends every module.
// Keys and turns go on the UI task's queue (0x4013747a, queue_put 0x40001896) as the panel's messages do, so the UI
// loop plays them through the core's ev_key/ev_enc sites and stock: modules see them too. A key the link holds reads
// as held to stock's is_key_held (0x4011fac4, which base.json points at mw_link_held). Arm: SETTINGS > REMOTE CTRL, ON
// at every boot of a development base; a press or turn from a person at the panel refuses the host for about three
// seconds and lets go of what it held, and OFF stops it until the next boot.
// Receive (link.s): stock's SysEx router, MIDI task; the link's own messages from USB go into a ring, the router goes
// on as stock. Work: ev_tick (UI task) takes the ring and replies through stock's sysex_send on USB.
#include <stdint.h>
#include "loader.h"                     // the runtime loader (sdk/runtime/loader), staged beside this file
#include "wire.h"
#define COLD __attribute__((cold, noinline))

#define LINK_VERSION 1
#define SYSEX_SEND ((int (*)(const uint8_t *, int, const uint8_t *, int))SYSEX_SEND_AT)   // stock, OS 1.12
// The status byte of stock's USB MIDI receive parser (OS 1.12, 0x4011f3c0, which the USB driver is given): 0xF0
// while a SysEx message is arriving on USB. One byte here; the Rytm's is a word.
#define USB_SYSEX_STATE (*(volatile uint8_t *)USB_SYSEX_STATE_AT)

#define UI_QUEUE ((void *(*)(void))UI_QUEUE_AT)
#define QUEUE_POST ((void (*)(void *, const void *))QUEUE_POST_AT)
#define KEY_INDEX ((const int32_t *)KEY_INDEX_AT)        // is_key_held's tables: id -> bit, -1 for none
#define KEY_BITS ((const volatile uint8_t *)KEY_BITS_AT)
// KEY_IDS (KEY_INDEX's entries), ENC_FIRST, ENC_LAST and KEY_YES come from the recipe (base.json's dev cflags)
#define MSG_KEY 0
#define MSG_ENC 1
#define KEY_DOWN 1
#define KEY_RELEASE 0x10                // flags of a release, as the panel posts it

#define USB 2
#define AUTO_USB 4
#define ST_OK 0
#define ST_NOT_ARMED 1
#define ST_BAD 2
#define ST_BUSY 3
#define ST_RANGE 4
#define ST_HUMAN 5
#define CMD_IDENT 0x01
#define CMD_DISARM 0x02
#define CMD_KEY 0x10
#define CMD_ENC 0x11
#define CMD_RELEASE_ALL 0x12
#define CMD_RAMBOOT 0x14                // armed: YES at UPGRADE OS NOW?, and the staged image is booted from RAM, never flashed
#define CARRY_TICKS 1800                // a minute: a RAM boot asked for and not reached is cancelled
#define CMD_MEM 0x21
#define CMD_DIAG 0x22                   // the diagnostics log (diag.c): its address and size, frames and ticks
#define CMD_FREEZE_TEST 0x23            // armed: the next UI tick stands still N frames (diag.c), to see a FREEZE logged
#define CMD_UPLOAD 0x30                 // armed: one upload controller frame (runtime.c, the loader's glue)
#define SLOTS 40                        // posted messages, reused in turn (more than PENDING)
#define PENDING 32                      // posted events not yet seen at ev_key/ev_enc
#define HUMAN_TICKS 60                  // about 3 s
#define PEND_TICKS 20                   // about 1 s: a posted event never seen at ev_key/ev_enc is given up
#define HEADER 8                        // F0 7D M W L ver seq cmd
#define RING 8                          // requests waiting for the UI task
#define CMD_BYTES 32                    // a request's bytes, F0..F7 (mem, the longest, is 19)
#define PER_TICK 4                      // requests answered in one tick
#define MEM_MAX 128
#define DDR_END 0x48000000

static uint8_t ring[RING][CMD_BYTES];
static uint8_t ring_len[RING];
static volatile uint32_t ring_head, ring_tail, ring_drops, rx_count;
#define PACKED(n) (((n) + 6) / 7 * 8)  // a block of n bytes, 7-bit packed
// The upload frame waiting for the UI task: its SysEx as received, its length published last (0: the slot is free).
#define UPLOAD_IN (HEADER + PACKED(MU_WIRE_MAX) + 1)
static uint8_t upload_in[UPLOAD_IN];
static volatile uint32_t upload_len;
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
    if (msg[7] == CMD_UPLOAD) {         // too long for the ring: its own slot, one frame at a time
        if (upload_len || len > UPLOAD_IN) {
            ring_drops++;
            return;
        }
        for (i = 0; i < len; i++)
            upload_in[i] = msg[i];
        __asm__ volatile("" ::: "memory");
        upload_len = len;
        return;
    }
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

#define MEM_REPLY (HEADER + 1 + 5 + PACKED(MEM_MAX) + 1)
#define UPLOAD_REPLY (HEADER + 1 + PACKED(MU_WIRE_RESPONSE) + 1)
static uint8_t reply[MEM_REPLY > UPLOAD_REPLY ? MEM_REPLY : UPLOAD_REPLY];


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

extern const volatile void *mw_diag_log_at(void);
extern uint32_t mw_diag_log_bytes(void), mw_diag_frames(void);
extern volatile uint32_t mw_diag_test_freeze;

// ---- arm, the person at the unit, the posted events ---------------------------
static int armed = 1, human_ticks = -1, release_due;
static uint32_t human_count, posted_count, refused_count;
static uint8_t held_bits[KEY_IDS / 8 + 1];
#define HELD(k) (held_bits[(k) >> 3] >> ((k) & 7) & 1)
#define HOLD(k, on) (held_bits[(k) >> 3] = (uint8_t)((held_bits[(k) >> 3] & ~(1 << ((k) & 7))) | (!!(on) << ((k) & 7))))

struct pend { uint8_t kind, id; int8_t value; };
static struct pend pend[PENDING];
static uint32_t pend_head, pend_tail, pend_seen;
static int pend_age;
static int32_t slots[SLOTS][4];
static uint32_t slot_next;

static int panel_down(int key)          // the panel's own bitmap, as stock reads it
{
    int32_t index;
    if ((unsigned)key >= KEY_IDS)
        return 0;
    index = KEY_INDEX[key];
    return index >= 0 && (KEY_BITS[index >> 3] >> (index & 7) & 1);
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
    if (pend_head - pend_tail >= PENDING)
        return 0;                       // the loop is behind: the host retries
    m = slots[slot_next++ % SLOTS];
    m[0] = kind << 24;
    m[1] = id;
    m[2] = kind == MSG_KEY ? value : (int32_t)((uint32_t)(uint8_t)value << 24);
    m[3] = 0;                           // the event's time
    pend[pend_head % PENDING] = (struct pend){ (uint8_t)kind, (uint8_t)id, (int8_t)(kind == MSG_KEY ? value & 1 : value) };
    pend_head++;
    QUEUE_POST(UI_QUEUE(), m);
    posted_count++;
    return 1;
}

static int release_all(void)            // -> 1 when any key was held; one the queue cannot take now stays due
{
    int k, any = 0;
    release_due = 0;
    for (k = 0; k < KEY_IDS; k++)
        if (HELD(k)) {
            any = 1;
            if (post(MSG_KEY, k, KEY_RELEASE))
                HOLD(k, 0);
            else
                release_due = 1;
        }
    return any;
}

// ---- RAM boot (LINK.md): the Analog Rytm MKII link's, at OS 1.12's addresses --------------
// Stock's upload buffer (0x40122574): a 32-byte header, then the upload's struct (its length, then the container from
// +8). The mailbox is written over that header, which the receiver is done with once the job runs. Unlike the Rytm's,
// the staged upload cannot stay where it is across the reset: the bootstrap reads the flashed image's packed MAIN OS
// to 0x40400000 on every start, inside it. So before the reset the container is copied to COPY, in DDR that neither
// the bootstrap nor stock's start (it clears 0x402fb000-0x466b8c50 after the gate) touches; the CRCs stand guard.
#define MAILBOX ((volatile uint32_t *)UPLOAD_AT)          // the recipe's: stock's upload buffer
#define STAGED ((const uint32_t *)(UPLOAD_AT + 32))
#define COPY ((uint8_t *)RAMBOOT_COPY_AT)                // the recipe's
#define MB_ASKED 0x4d574254             // 'MWBT': boot the copied image
#define MB_SPENT 0x4d574255             // 'MWBU': the unpack began
#define MB_BOOTED 0x4d574253            // 'MWBS': the unpacked image checked out and was entered
#define MB_CHECK 0x52794c6b             // the check word's seed
#define OS_BASE 0x40000400              // MAIN OS: its first long is the entry
#define IMAGE_MAX (UPLOAD_AT - OS_BASE)  // the unpacked OS must end below the mailbox
// CONTAINER_MAX, the recipe's: COPY + it stays below the mod area
#define MAIN_OS 3
// Diagnostics of the reset, outside the mod area and 64 KB under the boot stack's top, as the Rytm's: DIAG by the
// gate (0-7 the mailbox as found, 8-11 the staged struct's first words, 12-13 MARK as found, 14 RSR); MARK on the way
// to a RAM boot's reset (0 DIAG_MARK + flags, 1 DIAG_STAGE + how far it came). Written only at boot, before stock
// runs, and on the way to the reset, so stock may use this RAM in between.
#define DIAG ((volatile uint32_t *)RAMBOOT_DIAG_AT)      // the recipe's
#define MARK ((volatile uint32_t *)(RAMBOOT_DIAG_AT + 0x3c))
#define DIAG_MARK 0x4d570000            // + person presses << 8 + due (bits 0-1), 4 armed, 8 stock's struct is STAGED, 16 its length matches
#define DIAG_STAGE 0x4d575400           // + 1 the command was taken, 2 stock's job reached the site, 3 its wait returned,
                                        //   4 the drain returned, 5 written with the data cache off, 6 copied
#define RSR (*(volatile uint8_t *)0xEC090001)      // reset status: bit 5 software reset
#define RSR_SOFT 0x20
#define BOOT_ARG (*(const uint32_t *)BOOT_ARG_AT)   // what the bootstrap passed the OS entry
#define STOCK_DELAY ((void (*)(int))STOCK_DELAY_AT)  // stock's wait before its reset
#define STOCK_DRAIN ((void (*)(void))STOCK_DRAIN_AT) // what stock calls with interrupts masked before its reset

#define BOOT_FLASH 0                    // no request: the flashed OS
#define BOOT_RAM 1                      // this image was booted from RAM
#define BOOT_NOT_SOFT 2                 // a request, but not after a software reset
#define BOOT_BAD_CHECK 3
#define BOOT_BAD_BOUNDS 4
#define BOOT_BAD_CRC 5                  // the copy did not survive the reset
#define BOOT_NO_OS 6
#define BOOT_FAILED 8                   // the unpacked image was wrong: reset, and this is the flashed OS

// ---- RAM boot state ----------------------------------------------------------------
int mw_link_ramboot_due;                // link.s reads it where stock's job would flash: 0 flash, 1 RAM boot, 2 cancelled
static uint32_t ramboot[4];             // from the host: unpacked length and CRC, container length and CRC
static uint32_t ramboot_ticks;          // ticks since the request; it is cancelled after a minute, forgotten after two
static uint32_t boot_status, boot_image;
static void ramboot_cancel(void)
{
    if (mw_link_ramboot_due)
        mw_link_ramboot_due = 2;        // the job's call then resets without a mailbox: nothing flashed, nothing booted
}

static void disarm(void)
{
    ramboot_cancel();
    unsigned k;
    if (armed)
        release_all();
    armed = 0;
    for (k = 0; k < sizeof held_bits; k++)
        held_bits[k] = 0;
    release_due = 0;
}

static int ours(int kind, int id, int value)    // the next event the link posted? pops it if so
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

static int human(void)                  // a person pressed or turned something; -> 1 takes that first press
{
    human_count++;
    ramboot_cancel();                   // never a flash where the host asked for a RAM boot
    if (!armed)
        return 0;
    human_ticks = 0;
    return release_all();
}

// ev_key, ev_enc: (brain, event); the key or encoder at event + 12, a key's flags at + 16. A release alone is not a
// person; a press the link did not post is, unless it is the key just dispatched in this tick again and the panel's
// bitmap does not hold it (a module replaying a tap through core_key).
static int32_t last_key = -1;
static uint32_t last_tick;
int mw_link_key(void *brain, char *event)
{
    int32_t key = *(int32_t *)(event + 12), flags = *(int32_t *)(event + 16);
    int replay = key == last_key && ticks == last_tick, person;
    (void)brain;
    person = (uint32_t)key < KEY_IDS && !ours(MSG_KEY, key, flags) && (flags & KEY_DOWN) && (!replay || panel_down(key));
    last_key = key;
    last_tick = ticks;
    return person ? human() : 0;
}

int mw_link_enc(void *brain, char *event)
{
    int32_t enc = *(int32_t *)(event + 12);
    (void)brain;
    if (enc >= ENC_FIRST && enc <= ENC_LAST && !ours(MSG_ENC, enc, 0))
        return human();
    return 0;
}

static int readable(uint32_t a, uint32_t n)
{
    if (n == 0 || n > MEM_MAX || a + n < a)
        return 0;
    return (a >= 0x40000000 && a + n <= DDR_END) || (a >= 0x80000000 && a + n <= 0x80010000);
}

static void COLD act(const uint8_t *m, int len)
{
    int seq = m[6], cmd = m[7], n = len - HEADER - 1, status = ST_OK;
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
        p = put32(p, (uint32_t)armed);
        p = put32(p, human_ticks >= 0 && human_ticks < HUMAN_TICKS);
        p = put32(p, human_count);
        p = put32(p, posted_count);
        p = put32(p, refused_count);
        p = put32(p, boot_status);
        p = put32(p, boot_image);
        p = put32(p, (uint32_t)DIAG);
        p = put32(p, modwerk_runtime_active());
        p = put32(p, (uint32_t)&modwerk_runtime_api.value);
        send(p);
        return;
    case CMD_DIAG:
        p = begin(seq, cmd, ST_OK);
        p = put32(p, (uint32_t)mw_diag_log_at());
        p = put32(p, mw_diag_log_bytes());
        p = put32(p, mw_diag_frames());
        p = put32(p, ticks);
        send(p);
        return;
    case CMD_FREEZE_TEST:
        if (!armed)
            status = ST_NOT_ARMED;
        else if (n < 5 || get32(m + HEADER) > 15u * 1500u)
            status = ST_BAD;
        else
            mw_diag_test_freeze = get32(m + HEADER);
        if (status != ST_OK)
            refused_count++;
        send(begin(seq, cmd, status));
        return;
    case CMD_DISARM:
        disarm();
        send(begin(seq, cmd, ST_OK));
        return;
    case CMD_RAMBOOT:
        if (!armed)
            status = ST_NOT_ARMED;
        else if (human_ticks >= 0 && human_ticks < HUMAN_TICKS)
            status = ST_HUMAN;
        else if (n < 20)
            status = ST_BAD;
        else if (pend_head - pend_tail > PENDING - 2)
            status = ST_BUSY;
        else {
            int i;
            for (i = 0; i < 4; i++)
                ramboot[i] = get32(m + HEADER + 5 * i);
            mw_link_ramboot_due = 1;
            ramboot_ticks = 0;
            MARK[1] = DIAG_STAGE | 1;
            post(MSG_KEY, KEY_YES, KEY_DOWN);
            post(MSG_KEY, KEY_YES, KEY_RELEASE);
        }
        if (status != ST_OK)
            refused_count++;
        send(begin(seq, cmd, status));
        return;
    case CMD_KEY:
    case CMD_ENC:
    case CMD_RELEASE_ALL:
        if (!armed)
            status = ST_NOT_ARMED;
        else if (human_ticks >= 0 && human_ticks < HUMAN_TICKS)
            status = ST_HUMAN;
        else if (cmd == CMD_RELEASE_ALL)
            release_all();
        else if (n < 10)
            status = ST_BAD;
        else {
            uint32_t id = get32(m + HEADER), v = get32(m + HEADER + 5);
            if (cmd == CMD_KEY ? id >= KEY_IDS || KEY_INDEX[id] < 0 : id < ENC_FIRST || id > ENC_LAST)
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
        send(begin(seq, cmd, status));
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

// ---- upload: the runtime loader's controller (sdk/runtime/upload) over the link -----------------------------------
// One owner, the UI task: the controller, the loader's admission and switches run here, never in the MIDI task.
#define HOST_TICKS 300                  // ten seconds without a frame during an upload or a trial: the host is gone
#define STAGING ((uint8_t *)STAGING_AT) // DDR nothing else uses (base.json): the received package
_Static_assert(STAGING_BYTES >= RUNTIME_PACKAGE_BYTES, "the staging region holds the largest package");
static struct mu_context controller;
static uint8_t controller_started, upload_frame[MU_WIRE_MAX], upload_out[MU_WIRE_RESPONSE];
static uint32_t upload_quiet;

// The 7-bit blocks back to bytes; -1 when a byte has its top bit or the bytes overflow `most`.
static int unpack(const uint8_t *p, int n, uint8_t *out, int most)
{
    int i, k, got = 0;
    for (i = 0; i < n; i += 8) {
        uint8_t top = p[i];
        for (k = 1; k < 8 && i + k < n; k++) {
            if (p[i + k] & 0x80 || got >= most)
                return -1;
            out[got++] = (uint8_t)(p[i + k] | (top & (0x40 >> (k - 1)) ? 0x80 : 0));
        }
    }
    return got;
}

static int COLD upload_start(void)
{
    // The base's identity for the host's offers, and a per-boot session: not secrets, the controller's freshness.
    static const char base[] = "Modwerk Digitone II OS 1.12 development base, link upload v1";
    uint8_t digest[MU_DIGEST_BYTES], session[MU_DIGEST_BYTES];
    uint32_t seed[4] = {ticks, rx_count, *(volatile uint32_t *)0xfc080004u /* PIT0's count */, 0x4d575553u};
    mu_sha256((const uint8_t *)base, sizeof base - 1, digest);
    mu_sha256((const uint8_t *)seed, sizeof seed, session);
    session[0] |= 1u;
    if (!mu_init(&controller, STAGING, STAGING_BYTES, digest, session, digest, 0, &modwerk_runtime_backend))
        return 0;
    controller_started = 1;
    return 1;
}

static void COLD upload(const uint8_t *m, int len)
{
    int seq = m[6], status = ST_OK, n = 0;
    if (m[5] != LINK_VERSION || m[len - 1] != 0xF7)
        status = ST_BAD;
    else if (!armed)
        status = ST_NOT_ARMED;
    else if (human_ticks >= 0 && human_ticks < HUMAN_TICKS)
        status = ST_HUMAN;
    else if (!controller_started && !upload_start())
        status = ST_BUSY;
    else {
        int frame = unpack(m + HEADER, len - HEADER - 1, upload_frame, sizeof upload_frame);
        n = frame < 0 ? 0 : (int)mu_request(&controller, upload_frame, (uint32_t)frame, upload_out, sizeof upload_out);
        if (!n)
            status = ST_BAD;
        upload_quiet = 0;
    }
    if (status != ST_OK)
        refused_count++;
    send(n ? pack(begin(seq, CMD_UPLOAD, ST_OK), upload_out, n) : begin(seq, CMD_UPLOAD, status));
}

// A host silent for HOST_TICKS while an upload or a trial is open is handled as unplugged: the controller discards
// what it staged, and rolls a trial back once the unit is stopped, retried each tick until it is.
static void upload_tick(void)
{
    if (!controller_started || controller.phase == MU_NORMAL)
        return;
    if (upload_quiet < HOST_TICKS)
        upload_quiet++;
    else
        (void)mu_disconnect(&controller);
}

void mw_link_tick(void)
{
    int done;
    ticks++;
    if (human_ticks >= 0 && human_ticks < HUMAN_TICKS)
        human_ticks++;
    if (release_due)
        release_all();
    if (mw_link_ramboot_due && ++ramboot_ticks >= CARRY_TICKS) {
        if (mw_link_ramboot_due == 1)
            mw_link_ramboot_due = 2;    // no reset came: a second minute as cancelled, so a slow job still never flashes
        else
            mw_link_ramboot_due = 0;
        ramboot_ticks = 0;
    }
    // A posted event the loop never passed to ev_key/ev_enc would hold the head of pend for good, and every later
    // event of the link would count as a person's: give it up after about a second.
    if (pend_head == pend_tail || pend_tail != pend_seen) {
        pend_seen = pend_tail;
        pend_age = 0;
    } else if (++pend_age > PEND_TICKS) {
        pend_tail = pend_seen = pend_head;
        pend_age = 0;
    }
    for (done = 0; done < PER_TICK && ring_tail != ring_head; done++) {
        uint32_t t = ring_tail;
        if (USB_SYSEX_STATE == 0xF0)
            break;                      // stock is mid-SysEx on USB: next tick
        act(ring[t % RING], ring_len[t % RING]);
        ring_tail = t + 1;
    }
    if (upload_len && USB_SYSEX_STATE != 0xF0) {
        upload(upload_in, (int)upload_len);
        upload_len = 0;                 // the slot is free once the reply is out
    }
    upload_tick();
}

// ---- SETTINGS > REMOTE CTRL ----------------------------------------------------
extern void mw_link_row_label(void);
extern void core_additem(void *menu, const void *row);
extern void fw_invalidate(void *view);        // the core's (fw.s): a view's redraw, a menu's at menu + 0x38
// An integer, so the pointer comes back in d0 whatever the compiler's pointer convention.
uint32_t mw_link_row_text(void) { return (uint32_t)(armed ? "REMOTE CTRL: ON" : "REMOTE CTRL: OFF"); }

static void COLD set_armed(void **menu, int on)
{
    if (on && !armed) {
        armed = 1;
        human_ticks = -1;
        pend_tail = pend_head;          // nothing the link posted before is still due
    } else if (!on)
        disarm();
    fw_invalidate((char *)*menu + 0x38);
}

static void row_select(void **menu, void *item) { (void)item; set_armed(menu, !armed); }
static void row_draw(void **menu, void *item, void *bitmap, int x, int y) { (void)menu; (void)item; (void)bitmap; (void)x; (void)y; }
static void row_change(void **menu, void *item, int dir) { (void)item; if (dir) set_armed(menu, dir > 0); }

static const void *const row[4] = {
    (const void *)mw_link_row_label, (const void *)row_select, (const void *)row_draw, (const void *)row_change,
};

void COLD mw_link_settings(void *menu)
{
    core_additem(menu, row);
}

extern void mw_cache_push(void);
extern void mw_cache_off(void);
extern void mw_link_reset(void) __attribute__((noreturn));
extern void mw_boot_enter(uint32_t arg) __attribute__((noreturn));

static uint32_t mb_check(const volatile uint32_t *mb)
{
    return (mb[1] ^ mb[2]) + (mb[3] ^ mb[4]) + MB_CHECK;
}

// From link.s, in stock's upgrade job where it would erase and write the flash, when the host asked for a RAM boot:
// stock has validated the upload and saved the working state. As stock's routine ends: its wait, the drain, then the
// reset; before it every dirty line out and the data cache off, so the copy and the mailbox go straight to DDR. An
// upload that is not the one the host described is not booted: the reset brings the flashed OS back, nothing written.
void COLD mw_link_ramboot_go(const uint32_t *st)
{
    volatile uint32_t *mb = MAILBOX;
    uint32_t i, clen = ramboot[2];
    MARK[1] = DIAG_STAGE | 2;
    mw_cache_push();
    STOCK_DELAY(3000000);
    MARK[1] = DIAG_STAGE | 3;
    mw_cache_push();
    __asm__ volatile("move.w #0x2700, %sr");
    STOCK_DRAIN();
    MARK[1] = DIAG_STAGE | 4;
    MARK[0] = DIAG_MARK | (human_count & 0xff) << 8 | (mw_link_ramboot_due & 3) | (armed ? 4 : 0)
        | (st == STAGED ? 8 : 0) | (st == STAGED && st[0] == clen ? 16 : 0);
    mw_cache_off();
    MARK[1] = DIAG_STAGE | 5;
    if (mw_link_ramboot_due == 1 && st == STAGED && st[0] == clen && clen <= CONTAINER_MAX && armed) {
        const uint8_t *from = (const uint8_t *)(st + 2);
        for (i = 0; i < clen; i++)
            COPY[i] = from[i];
        MARK[1] = DIAG_STAGE | 6;
        mb[1] = clen;
        mb[2] = ramboot[3];
        mb[3] = ramboot[0];
        mb[4] = ramboot[1];
        mb[5] = mb_check(mb);
        mb[0] = MB_ASKED;
    }
    mw_link_reset();
}

static uint32_t __attribute__((noinline)) crc32(const uint8_t *p, uint32_t n)  // zlib's
{
    uint32_t c = ~0u;
    int k;
    while (n--) {
        c ^= *p++;
        for (k = 0; k < 8; k++)
            c = (c >> 1) ^ (0xedb88320 & -(c & 1));
    }
    return ~c;
}

static uint32_t be32(const uint8_t *p)
{
    return (uint32_t)p[0] << 24 | (uint32_t)p[1] << 16 | (uint32_t)p[2] << 8 | p[3];
}

// The Rytm link's depacker, the format src/engine/elektron/codec/depack.ts reads: a u32 stream length, a u32 sum,
// then the stream; 0 for a stream that is wrong, does not end at its length or would pass max.
#define INLINE static inline __attribute__((always_inline))
struct bits { const uint8_t *p, *end; uint32_t tag; int bad; };
INLINE uint32_t dp_byte(struct bits *s)
{
    if (s->p >= s->end) {
        s->bad = 1;
        return 0;
    }
    return *s->p++;
}
INLINE uint32_t dp_bit(struct bits *s)
{
    if (!(s->tag & 0xff))
        s->tag = dp_byte(s) << 1 | 1;
    s->tag <<= 1;
    return s->tag >> 9 & 1;
}
INLINE uint32_t dp_gamma(struct bits *s)
{
    uint32_t v = 1;
    for (;;) {
        v = v << 1 | dp_bit(s);
        if (dp_bit(s))
            return v;
        if (v > 0x2000000 || s->bad) {
            s->bad = 1;
            return v;
        }
    }
}
#define DP_BIAS 767
#define DP_REUSE 2
#define DP_FAR 3328
static uint32_t __attribute__((noinline, hot)) depack(const uint8_t *sec, uint32_t plen, uint8_t *out, uint32_t max)
{
    struct bits s;
    uint32_t n = 0, last = 1, off, count, g, len = be32(sec);
    if (plen < 8 || len > plen - 8)
        return 0;
    s.p = sec + 8;
    s.end = s.p + len;
    s.tag = 0;
    s.bad = 0;
    for (;;) {
        if (dp_bit(&s)) {
            if (n >= max)
                return 0;
            out[n++] = dp_byte(&s);
        } else {
            g = dp_gamma(&s);
            if (g == DP_REUSE)
                off = last;
            else {
                off = (g << 8) + dp_byte(&s);
                if (off == DP_BIAS)
                    break;
                off = last = off - DP_BIAS;
            }
            count = dp_bit(&s) << 1;
            count |= dp_bit(&s);
            if (!count)
                count = dp_gamma(&s) + 2;
            if (off > DP_FAR)
                count++;
            count++;
            if (off == 0 || off > n || count > max - n)
                return 0;
            do {
                out[n] = out[n - off];
                n++;
            } while (--count);
        }
        if (s.bad)
            return 0;
    }
    return s.bad || s.p != s.end ? 0 : n;
}

// From link.s at boot (0x4000053e): after the core's boot hook, before stock fills SRAM and clears its RAM, with the
// data cache off. Returns to boot the image that is running; does not return when it unpacks and enters the copied one.
void COLD mw_boot_gate(void)
{
    volatile uint32_t *mb = MAILBOX;
    const uint8_t *c = COPY, *e;
    uint32_t magic = mb[0], clen, ulen, off, plen, i, count, arg;
    if (magic != MB_BOOTED) {
        volatile uint32_t *d = DIAG;
        for (i = 0; i < 12; i++)
            d[i] = mb[i];
        d[12] = MARK[0];
        d[13] = MARK[1];
        MARK[0] = MARK[1] = 0;
        d[14] = RSR;
    }
    if (magic != MB_ASKED && magic != MB_SPENT && magic != MB_BOOTED)
        return;
    mb[0] = 0;                          // one shot, whatever happens next
    boot_status = BOOT_NOT_SOFT;        // a mailbox DDR kept over a power cycle says nothing
    if (!(RSR & RSR_SOFT))
        return;
    boot_status = BOOT_FAILED;
    if (magic == MB_BOOTED) {
        boot_status = BOOT_RAM;
        boot_image = mb[4];
    }
    if (magic != MB_ASKED)
        return;
    clen = mb[1];
    ulen = mb[3];
    boot_status = BOOT_BAD_CHECK;
    if (mb[5] != mb_check(mb))
        return;
    boot_status = BOOT_BAD_BOUNDS;
    if (ulen - 1 >= IMAGE_MAX || clen < 0x30 || clen > CONTAINER_MAX)
        return;
    boot_status = BOOT_BAD_CRC;
    if (crc32(c, clen) != mb[2])
        return;
    boot_status = BOOT_NO_OS;
    count = be32(c + 0x1c);
    for (i = 0, e = c + 0x20;; i++, e += 16) {
        if (i >= count || i >= 16 || (uint32_t)(e + 16 - c) > clen)
            return;
        if (be32(e) == MAIN_OS)
            break;
    }
    off = be32(e + 4);
    plen = be32(e + 8);
    if (be32(e + 12) != OS_BASE || plen < 8 || off > clen || plen > clen - off)
        return;
    arg = BOOT_ARG;                     // inside the image the unpack overwrites
    __asm__ volatile("move.w #0x2700, %sr");
    mb[0] = MB_SPENT;                   // from here the running image is gone: enter the new one or reset
    if (depack(c + off, plen, (uint8_t *)OS_BASE, ulen) == ulen && crc32((const uint8_t *)OS_BASE, ulen) == mb[4]) {
        mb[0] = MB_BOOTED;
        mw_boot_enter(arg);
    }
    mw_link_reset();
}
