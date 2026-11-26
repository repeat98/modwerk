// SPDX-License-Identifier: GPL-3.0-or-later
// The Model:Cycles' link over USB MIDI. Every base carries its part for musicians' units, as the Octatrack's does: a
// host asks for the link's identity (with the set identity), the audio load and the diagnostics log (LOG reads only
// the log), and loads modules without a reflash (UP_PART, UP_RUN, MODS: the runtime loader, modules.c). Development
// bases (base.json's dev, npm run machine:base -- model-cycles --dev, MODWERK_DEV) add what only a developer's unit
// should answer: memory reads, panel keys and encoder turns, and booting an uploaded image from RAM.
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
// - Work: ev_tick (UI task) takes the ring, acts and replies on USB through stock's USB MIDI writer
//   (0x40003396), in 144-byte parts as stock's SysEx send (0x400828fe) does, but under stock's USB lock for the whole
//   reply and never while another sender's SysEx is open (LINK.md). Ports as stock's send routes
//   them: 1 the MIDI setting's choice, 2 USB (it writes the USB controller), 3 DIN, 4 both. A request
//   from USB arrives with port 2 (a unit, 23 November 2026); the link serves USB only and drops its
//   messages from any other port. The reply goes back on port 2; IDENT reports the port.
// Development bases only (MODWERK_DEV):
// - Keys and encoders go on the UI task's queue (its address at 0x40148cd0, queue_put 0x40001fba) as the panel's
//   messages do: {type 0 key / 1 encoder, id, flags or a signed step in the top byte, time}. The UI loop
//   (0x400080e6) plays them through the core's ev_key/ev_enc and stock, so modules see them too. Stock's
//   is_key_held (0x4007faf4, the panel's bitmap 0x40f95744 through the table 0x4010ae5c) is pointed at
//   mw_link_held, so a key the link holds reads as held: a held TRACK or FUNC combines with the next press or turn
//   as on the panel.
// - Armed at every boot (a development base is meant to be driven); DISARM turns it off until the next boot.
//   A press or turn on the panel is a person at the unit: the link lets go of what it holds and refuses keys and
//   turns for about 3 s.
// - RAM boot: the host uploads an image with stock's OS upgrade (SysEx ID 0x11, 0x50/0x51) and sends RAMBOOT with
//   the image's four numbers. Stock keeps the upload at 0x4028da80 (a 32-byte header, byte 0 = 3 when complete;
//   at +0x20 its length, at +0x28 the ELE3 container). The bootstrap stages the flashed, packed MAIN OS at
//   0x40200000 on every boot, which reaches past 0x4028da80, so the link copies the container to COPY first, writes
//   the data cache out, switches it off, writes a mailbox and resets as stock's flash routine does (0x40092304's
//   end). Nothing is erased or written. At the next boot the base's ev_boot gate (before stock copies .data and
//   clears .bss) checks the mailbox after a software reset, the container's CRC32, unpacks its MAIN OS over the
//   running one, checks that CRC32 and enters it as the bootstrap does. A power cycle brings the flashed OS back.
// - The screen needs no command here: stock answers Elektron's own screenshot request (F0 00 20 3C 10 00,
//   command 0x04) over USB.
#include <stdint.h>
#include "diag.h"

#define LINK_VERSION 1

// Stock, OS 1.13: its USB MIDI writer, the lock around it and the writer's SysEx state (LINK.md, "Stock's send
// from two tasks").
#ifdef MODWERK_HOST /* test_link.c: stock's USB writer, upload and the mailbox are the test's */
extern void mw_test_usb_lock(void), mw_test_usb_unlock(void), mw_test_usb_write(int len, const uint8_t *bytes);
extern volatile uint32_t mw_test_midi_on, mw_test_usb_sysex;
#define USB_LOCK mw_test_usb_lock
#define USB_UNLOCK mw_test_usb_unlock
#define USB_WRITE mw_test_usb_write
#define MIDI_ON mw_test_midi_on
#define USB_SYSEX mw_test_usb_sysex
#else
#define USB_LOCK ((void (*)(void))USB_LOCK_AT)         // takes stock's USB MIDI lock, waiting for it
#define USB_UNLOCK ((void (*)(void))USB_UNLOCK_AT)
#define USB_WRITE ((void (*)(int, const uint8_t *))USB_WRITE_AT)   // write(len, bytes): MIDI bytes to USB packets
#define MIDI_ON (*(volatile uint32_t *)MIDI_ON_AT)     // stock's send sends nothing while it is 0
#define USB_SYSEX (*(volatile uint32_t *)USB_SYSEX_AT) // 0xF0 while a SysEx is written but not yet ended
#endif
#define SYSEX_OPEN (USB_SYSEX == 0xF0)
#define OPEN_TICKS 30                   // about a second: longer, and the open SysEx counts as one stock left unended
#define PART 144                        // bytes in one write, as stock's send splits a message

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
#define LOAD_TIMER_NOW (*(volatile uint32_t *)0xfc07000c)  // DMA timer 0, as load.s reads it
#define CMD_DIAG 0x22                   // the Digitone II link's number
#define CMD_LOAD 0x23
#define CMD_LOG 0x24                    // bytes of the diagnostics log, and nothing else
#define CMD_DISARM 0x02
#define CMD_KEY 0x10
#define CMD_ENC 0x11
#define CMD_RELEASE_ALL 0x12
#define CMD_RAMBOOT 0x14
#define CMD_MEM 0x21
// The runtime loader (modules.c). 0x30 stays free: the Digitone II's link takes a whole upload frame there, in one
// SysEx; the Model:Cycles takes a frame in parts, each message under the 128 bytes of stock's own upgrade messages.
#define CMD_UP_PART 0x31               // a part of an upload frame
#define CMD_UP_RUN 0x32                // run the frame, the controller's response back
#define CMD_MODS 0x33                  // the pool and the live modules
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

// RAM boot.
#ifdef MODWERK_HOST
extern uint32_t mw_test_upload[], mw_test_mailbox[];
#define UPLOAD_STATE (*(const volatile uint8_t *)mw_test_upload)
#define STAGED ((const uint32_t *)mw_test_upload + 8)
#define MAILBOX ((volatile uint32_t *)mw_test_mailbox)
#define COPY ((uint8_t *)(mw_test_mailbox + 16))
#define MASK_INTERRUPTS() ((void)0)
#else
#define UPLOAD_STATE (*(const volatile uint8_t *)0x4028da80)  // stock's upload header: 3 when complete
#define STAGED ((const uint32_t *)0x4028daa0)             // its length, its sum, then the ELE3 container
#define MAILBOX ((volatile uint32_t *)0x46000000)          // high DDR: the bootstrap's stage (0x40200000 up) and
#define COPY ((uint8_t *)0x46000040)                      //   the unpacked OS (0x40000400 up) stay below it
#define MASK_INTERRUPTS() __asm__ volatile("move.w #0x2700, %%sr" ::: "memory")
#endif
#define MB_ASKED 0x4d574254             // 'MWBT': boot the copy
#define MB_SPENT 0x4d574255             // 'MWBU': the unpack began
#define MB_BOOTED 0x4d574253            // 'MWBS': the unpacked image checked out and was entered
#define MB_CHECK 0x4d634c6b             // the check word's seed
#define OS_BASE 0x40000400              // MAIN OS: its first long is the entry
#define IMAGE_MAX 0x400000              // the unpacked MAIN OS, well below COPY
#define CONTAINER_MAX 0x1c0000          // the container: flashed from 0x20000, it must end below the OS's stores at 0x1e0000
#define MAIN_OS 3                       // the container's section id
#define BOOT_ARG (*(const uint32_t *)0x4013e4d0)  // where the OS entry keeps what the bootstrap passed it
#define RSR (*(volatile uint8_t *)0xEC090001)     // reset status: bit 5 software reset
#define RSR_SOFT 0x20
// The gate's result, mailbox word 6 (ident reports it): 1 booted from RAM; 2 a mailbox without a software reset;
// 3 check word; 4 lengths; 5 container CRC; 6 no MAIN OS section; 8 failed after the unpack (reset).
#define BOOT_RAM 1
#define BOOT_NOT_SOFT 2
#define BOOT_BAD_CHECK 3
#define BOOT_BAD_BOUNDS 4
#define BOOT_BAD_CRC 5
#define BOOT_NO_OS 6

#define RING 8                          // commands waiting for the UI task
#define CMD_BYTES 128                   // a command's bytes, F0..F7 (MEM is 20, an UP_PART at most 124)
#define PER_TICK 4                      // commands acted on in one tick
#define MEM_MAX 128
#define HEADER 8                        // F0 7D M W L ver seq cmd
#define DDR_END 0x48000000              // the DDR the OS maps (0x40000000-0x47ffffff)

static uint8_t ring[RING][CMD_BYTES];
static uint8_t ring_len[RING];
static uint8_t ring_port[RING];
static volatile uint32_t ring_head, ring_tail, ring_drops, rx_count;
static uint32_t ticks, sent_count, send_fails, last_port;
// The set's identity, taken at boot: the CRC32 of the .run block (the base and every linked module, as the linker
// placed them) before any handler has run, and its length. A host computes the same from a built image.
static uint32_t run_crc, run_bytes;
// load.c: the audio load
extern uint32_t mw_load_avg, mw_load_wmax, mw_load_peak, mw_load_windows, mw_load_blocks;
extern uint32_t mw_load_tenths(uint32_t ticks);
extern uint8_t __run_start[], __run_words[];
// modules.c: loading modules over the link
extern void mw_modules_identity(uint32_t crc);
extern unsigned mw_modules_part(uint32_t offset, const uint8_t *packed, unsigned n);
extern unsigned mw_modules_run(uint32_t length, uint8_t *out);
extern unsigned mw_modules_list(uint32_t first, unsigned most, uint8_t *out);
extern void mw_modules_tick(void);

#ifdef MODWERK_DEV
// ---- arm, the person at the unit, the posted events ---------------------------
static int armed = 1, human_ticks = -1, release_due, ramboot_due;
static uint32_t ramboot[4];             // from the host: unpacked length and CRC, container length and CRC
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

#endif

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
#define UP_RESPONSE 144                 // the upload controller's response (wire.h MU_WIRE_RESPONSE)
#define MODS_MOST 3                     // inventory entries in one MODS reply
static uint8_t reply[HEADER + 1 + (UP_RESPONSE / 7 + 1) * 8 + 1];   // the largest: UP_RUN's (MEM's is 167)
static uint8_t up_out[UP_RESPONSE];

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

// Stock's send releases its lock after every 144-byte part, so another task's part could land between two of a
// reply's (and the reverse), which breaks both SysEx. The link writes the whole reply under the lock, and never
// while another sender's SysEx is open. A reply that meets an open SysEx is held, not dropped (its request has run:
// an UP_RUN may have kept or undone a set), and goes out at a later tick; the link acts on no request while one is
// held (mw_link_tick). An open SysEx that lasts more than OPEN_TICKS no longer holds it. The link answers USB only.
static int reply_held;                  // the bytes of a reply in reply[] not yet written
static uint32_t open_ticks;             // ticks the current open SysEx has lasted

static int sysex_holds(void)
{
    return SYSEX_OPEN && open_ticks <= OPEN_TICKS;
}

static void write_held(void)
{
    int k;
    USB_LOCK();
    if (sysex_holds()) {                // opened since the tick looked (a writer that takes no lock): a later tick
        USB_UNLOCK();
        return;
    }
    for (k = 0; k < reply_held; k += PART)
        USB_WRITE(reply_held - k < PART ? reply_held - k : PART, reply + k);
    USB_UNLOCK();
    reply_held = 0;
    sent_count++;
}

static void send(uint8_t *end, int port)
{
    (void)port;
    *end++ = 0xF7;
    if (!MIDI_ON) {                     // stock's send would send nothing either
        send_fails++;
        return;
    }
    reply_held = (int)(end - reply);
    write_held();
}

#ifdef MODWERK_DEV
static int readable(uint32_t a, uint32_t n)
{
    if (n == 0 || n > MEM_MAX || a + n < a)
        return 0;
    return (a >= 0x40000000 && a + n <= DDR_END) || (a >= 0x80000000 && a + n <= 0x80010000);
}
#endif

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
#ifdef MODWERK_DEV
        p = put32(p, (uint32_t)armed);
        p = put32(p, human_ticks >= 0 && human_ticks < HUMAN_TICKS);
        p = put32(p, human_count);
        p = put32(p, posted_count);
        p = put32(p, refused_count);
        p = put32(p, MAILBOX[0]);
        p = put32(p, MAILBOX[6]);
        p = put32(p, MAILBOX[4]);
#else
        for (int i = 0; i < 8; i++)     // the same fields: a release base has no keys and no RAM boot, so never
            p = put32(p, 0);            // armed, and the RAM-boot words are 0 (the mailbox holds whatever DDR does)
#endif
        p = put32(p, run_crc);
        p = put32(p, run_bytes);
        send(p, port);
        return;
    case CMD_DIAG:                      // where the log is and its size: a host reads it with LOG
        p = begin(seq, cmd, ST_OK);
        p = put32(p, (uint32_t)(uintptr_t)&mw_diag_log);
        p = put32(p, sizeof mw_diag_log);
        send(p, port);
        return;
    case CMD_LOAD:                      // the last window's share, its dearest block, the dearest since boot
        p = begin(seq, cmd, ST_OK);
        p = put32(p, mw_load_avg);
        p = put32(p, mw_load_tenths(mw_load_wmax));
        p = put32(p, mw_load_tenths(mw_load_peak));
        p = put32(p, mw_load_windows);
        p = put32(p, mw_load_blocks);
        send(p, port);
        return;
    case CMD_LOG: {                     // offset into the log and a count, as MEM's reply: offset, count, bytes
        uint32_t at, count;
        if (n < 10) {
            send(begin(seq, cmd, ST_BAD), port);
            return;
        }
        at = get32(a);
        count = get32(a + 5);
        if (count == 0 || count > MEM_MAX || at > sizeof mw_diag_log || count > sizeof mw_diag_log - at) {
            send(begin(seq, cmd, ST_RANGE), port);
            return;
        }
        p = begin(seq, cmd, ST_OK);
        p = put32(p, at);
        p = put32(p, count);
        p = pack(p, (const volatile uint8_t *)&mw_diag_log + at, (int)count);
        send(p, port);
        return;
    }
#ifdef MODWERK_DEV
    case CMD_RAMBOOT: {
        int status = ST_OK, i;
        if (!armed)
            status = ST_NOT_ARMED;
        else if (human_ticks >= 0 && human_ticks < HUMAN_TICKS)
            status = ST_HUMAN;
        else if (n < 20)
            status = ST_BAD;
        else if (ramboot_due)
            status = ST_BUSY;           // one accepted already: its copy is a few ticks away
        else {
            uint32_t r[4];              // stored only once they pass: the copy reads ramboot[]
            for (i = 0; i < 4; i++)
                r[i] = get32(a + 5 * i);
            if (UPLOAD_STATE != 3 || STAGED[0] != r[2] || r[2] < 0x30 || r[2] > CONTAINER_MAX || r[0] - 1 >= IMAGE_MAX)
                status = ST_RANGE;      // no complete upload of that length
            else {
                for (i = 0; i < 4; i++)
                    ramboot[i] = r[i];
                ramboot_due = 1;        // after this reply: the next tick copies and resets
            }
        }
        if (status != ST_OK)
            refused_count++;
        send(begin(seq, cmd, status), port);
        return;
    }
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
        p = pack(p, (const volatile uint8_t *)(uintptr_t)addr, (int)count);
        send(p, port);
        return;
    }
#endif
    case CMD_UP_PART:                   // offset, then up to 96 bytes packed
        if (n < 7 || !mw_modules_part(get32(a), a + 5, (unsigned)(n - 5))) {
            send(begin(seq, cmd, n < 7 ? ST_BAD : ST_RANGE), port);
            return;
        }
        send(begin(seq, cmd, ST_OK), port);
        return;
    case CMD_UP_RUN: {                  // the frame's length; the controller's 144-byte response, packed
        unsigned got = n < 5 ? 0 : mw_modules_run(get32(a), up_out);
        if (got != UP_RESPONSE) {
            send(begin(seq, cmd, n < 5 ? ST_BAD : ST_RANGE), port);
            return;
        }
        send(pack(begin(seq, cmd, ST_OK), up_out, UP_RESPONSE), port);
        return;
    }
    case CMD_MODS: {                    // from the n-th live module: free, largest run, refusal, count, entries
        unsigned got = mw_modules_list(n >= 5 ? get32(a) : 0, MODS_MOST, up_out);
        send(pack(begin(seq, cmd, ST_OK), up_out, (int)got), port);
        return;
    }
    default:
        send(begin(seq, cmd, ST_BAD), port);
    }
}

#ifdef MODWERK_DEV
extern void mw_cache_off(void);         // link.s: every dirty line of the data cache out, then the cache off
extern void mw_link_reset(void) __attribute__((noreturn));
extern void mw_boot_enter(uint32_t arg) __attribute__((noreturn));

static uint32_t mb_check(const volatile uint32_t *mb)
{
    return (mb[1] ^ mb[2]) + (mb[3] ^ mb[4]) + MB_CHECK;
}

// The container to COPY, the cache out and off, the mailbox straight to DDR, then stock's reset. The upload
// came through the data cache, and a soft reset does not write dirty lines out (the Rytm's lesson).
#ifdef MODWERK_HOST
extern void mw_test_ramboot(const uint32_t *numbers);  // instead of the copy and the reset
static void mw_link_ramboot_go(void)
{
    ramboot_due = 0;
    mw_test_ramboot(ramboot);
}
#else
static void __attribute__((noinline, noreturn)) mw_link_ramboot_go(void)
{
    volatile uint32_t *mb = MAILBOX;
    const uint8_t *from = (const uint8_t *)(STAGED + 2);
    uint32_t i;
    MASK_INTERRUPTS();
    for (i = 0; i < ramboot[2]; i++)
        COPY[i] = from[i];
    mw_cache_off();                     // no memory write may come between its push and its switch: it has none
    mb[1] = ramboot[2];
    mb[2] = ramboot[3];
    mb[3] = ramboot[0];
    mb[4] = ramboot[1];
    mb[5] = mb_check(mb);
    mb[6] = 0;
    mb[0] = MB_ASKED;
    mw_link_reset();
}
#endif
#endif

void mw_link_tick(char *ctrl)
{
    int done;
    (void)ctrl;
    ticks++;
#ifdef MODWERK_DEV
    if (ramboot_due && !reply_held && ++ramboot_due > 3)
        mw_link_ramboot_go();           // a few ticks after the reply is out
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
#endif
    open_ticks = SYSEX_OPEN ? open_ticks + 1 : 0;
    if (reply_held && !sysex_holds())
        write_held();
    // Another sender's SysEx open, or a reply held: the next request waits for a later tick.
    for (done = 0; done < PER_TICK && ring_tail != ring_head && !sysex_holds() && !reply_held; done++) {
        uint32_t t = ring_tail;
        act(ring[t % RING], ring_len[t % RING], ring_port[t % RING]);
        ring_tail = t + 1;
    }
    mw_modules_tick();
}

// ---- the boot gate: the set identity; in development bases, the RAM boot -------
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

#ifdef MODWERK_DEV
static uint32_t be32(const uint8_t *p)
{
    return (uint32_t)p[0] << 24 | (uint32_t)p[1] << 16 | (uint32_t)p[2] << 8 | p[3];
}

// Modwerk's own depacker for a packed section, the format sdk/firmware_codec/elz.py
// reads: a u32 stream length, a u32 sum (not checked), then the stream. Control bits
// come most significant first from tag bytes fetched as needed, between whole payload
// bytes. A 1 bit is a literal byte; a 0 bit a match: an offset (or the last one
// again) and a length, partly Elias-gamma coded. Returns the bytes written to out;
// 0 for a stream that is wrong, does not end at its length or would pass max.
// Timed, not sized: the data cache is off where this runs, so the loop's state
// should stay in registers: helpers inlined, and `hot`, or its cold caller has GCC
// size it and reread max from the stack per token. Time on a unit: not measured.
#define INLINE static inline __attribute__((always_inline))
struct bits {
    const uint8_t *p, *end;
    uint32_t tag;                       // the tag bits left, then a 1 marker
    int bad;                            // ran out of input, or a gamma value too long
};

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
    return s->tag >> 9 & 1;             // bit 9 and above are not looked at again
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

#define DP_BIAS 767                     // added to an offset before it is coded; a coded BIAS ends the stream
#define DP_REUSE 2                      // the offset gamma value for "the last offset again"
#define DP_FAR 3328                     // offsets above this code their length one shorter
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
                off = (g << 8) + dp_byte(&s);   // 32 bits: the end marker's gamma value wraps to BIAS
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

#endif

// ev_boot, first: after the core's boot (the mods' code in place, their .bss zeroed), before stock copies .data and
// clears .bss. The data cache is off here. Returns to boot the flashed image; does not return when it unpacks and
// enters the copy.
#ifdef MODWERK_DEV
static void ramboot_gate(void)
{
    volatile uint32_t *mb = MAILBOX;
    const uint8_t *c = COPY, *e;
    uint32_t magic = mb[0], clen, ulen, off, plen, i, count, arg;
    if (magic != MB_ASKED && magic != MB_SPENT)
        return;
    mb[0] = 0;                          // one shot, whatever happens next
    if (magic == MB_SPENT) {
        mb[6] = 8;                      // the last unpack did not end in the image: this is its reset
        return;
    }
    mb[6] = BOOT_NOT_SOFT;              // a mailbox DDR kept over a power cycle says nothing
    if (!(RSR & RSR_SOFT))
        return;
    clen = mb[1];
    ulen = mb[3];
    mb[6] = BOOT_BAD_CHECK;
    if (mb[5] != mb_check(mb))
        return;
    mb[6] = BOOT_BAD_BOUNDS;
    if (ulen - 1 >= IMAGE_MAX || clen < 0x30 || clen > CONTAINER_MAX)
        return;
    mb[6] = BOOT_BAD_CRC;
    if (crc32(c, clen) != mb[2])
        return;
    mb[6] = BOOT_NO_OS;
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
    MASK_INTERRUPTS();
    mb[0] = MB_SPENT;                   // from here the running image is gone: enter the new one or reset
    if (depack(c + off, plen, (uint8_t *)OS_BASE, ulen) == ulen && crc32((const uint8_t *)OS_BASE, ulen) == mb[4]) {
        mb[6] = BOOT_RAM;
        mb[0] = MB_BOOTED;
        mw_boot_enter(arg);
    }
    mw_link_reset();
}
#endif

void mw_boot_gate(void)
{
    run_bytes = (uint32_t)(uintptr_t)__run_words * 4;  // first: no handler has written to .run yet
    run_crc = crc32(__run_start, run_bytes);
    mw_modules_identity(run_crc);
    mw_diag_start(LOAD_TIMER_NOW ^ run_crc, run_crc);
#ifdef MODWERK_DEV
    ramboot_gate();
#endif
}
