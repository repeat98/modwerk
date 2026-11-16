// SPDX-License-Identifier: GPL-3.0-or-later
// The Rytm's development link over USB MIDI, in development bases only (base.json's dev,
// npm run machine:base -- analog-rytm-mkii --dev); release bases never carry it.
// A host on the computer's USB port asks for the unit's identity, its screen and
// read-only memory, and, while the unit is armed on its own panel, presses keys and
// turns encoders as the panel does. Built so an agent can flash or RAM-boot a test image (stock's
// OS upgrade, then a remote YES) and run a test without a hand on the unit.
//
// Wire format (SysEx, manufacturer 0x7D, private use):
//   host -> unit  F0 7D 'M' 'W' 'L' 01 seq cmd payload.. F7
//   unit -> host  F0 7D 'M' 'W' 'L' 01 seq cmd|0x40 status payload.. F7
// Numbers are u32 as five 7-bit bytes, least significant first. Byte blocks (screen,
// memory) are 7-bit packed: each group of up to 7 bytes follows a byte holding their
// top bits, the first byte's in bit 6 (the Elektron framing, as ekproto.py packs it).
//
// Where it runs (OS 1.74, read from the code):
// - Receive: stock's SysEx router (0x40083dd8, MIDI task) gets every complete SysEx
//   as (msg, len, iface) and drops anything that is not F0 00 20 3C. link.s takes the
//   router's first instructions: F0 7D 'MWL' from USB (iface 2, or 4 on the auto
//   channel) is copied into a ring here and goes no further; anything else goes on
//   to stock unchanged. DIN (iface 8 / 0x10) is never served.
// - Work: ev_tick (UI task, about 20 Hz) takes the ring, acts and replies through
//   stock's sysex_send on USB (never from the audio
//   interrupt; waits a tick while stock is mid-SysEx on USB).
// - Keys and encoders: posted on the UI task's queue (0x4011fb56, queue_put
//   0x400013b2) as the panel's messages are, so the UI loop (0x400a46f0) plays them
//   through the core's ev_key/ev_enc sites and stock: modules see them too. The
//   queue holds message pointers, so each posted message stays in a slot of its own
//   until long after the loop took it. A key held from here also reads as held to
//   stock's is_key_held (0x40081c28, which base.json points at mw_link_held), which only sees the panel's
//   bitmap otherwise: FUNC + turn and every other held-key test behave as on the panel.
// - Arm: GLOBAL > REMOTE CONTROL. Keys and encoders from the host need it; identity,
//   screen and memory reads do not. It is ON at every boot, power-on included (the
//   10 Nov 2026: a development image is meant to be driven): the row turns it
//   OFF until the next boot, and a power cycle no longer stops a host: only a person at
//   the panel or OFF does. The project carry bit (CONFIRM sets it, the boot clears it) no
//   longer decides anything; it stays for the storage layout. carry_ticks, in RAM, still
//   bounds a RAM boot request.
// - A key or turn from the panel while armed is a person at the unit: the link
//   refuses keys and turns for HUMAN_TICKS after it and says so, so a host stops.
//   The link tells its own events from the panel's by the order they were posted, and a
//   module's replay of a key from the panel's by the bitmap (mw_link_key).
// - RAM boot (stage 2): the host sends an image with stock's OS upgrade and, instead
//   of CONFIRM, RAMBOOT with the image's lengths and CRCs. Stock validates the upload
//   and saves the working state as for a flash; where its job calls the routine that
//   erases, writes and resets (0x4004dc14 -> 0x4009f404), link.s goes to
//   mw_link_ramboot_go instead: no flash write, a mailbox beside the upload in DDR,
//   then stock's own reset. The flashed OS boots as ever; before it clears .bss
//   (which holds the upload), mw_boot_gate finds the mailbox, checks the upload
//   against the host's CRC, unpacks its MAIN OS over the running image with its own
//   depacker (nothing of the bootstrap is called: a MKII did not hold the 1.74
//   container's bootstrap bytes in SRAM, 9 Nov 2026), checks the result and enters it. Nothing is written to
//   flash: a power cycle brings the flashed OS back. Any check that fails before the
//   unpack boots the flashed OS; one that fails after it resets, and the spent
//   mailbox then boots the flashed OS. IDENT reports which of these happened.
//   A request a person's press, a disarm or a minute without a reset cancels still
//   never flashes: until the carry ends (at most two minutes after RAMBOOT) the job's
//   call resets without a mailbox, so the flashed OS comes back unwritten (and a hand
//   upgrade in that time must be done again).

#include <stdint.h>
#define COLD __attribute__((cold, noinline))     // sized, not timed: what runs once at boot or per host command.
                                                 // GCC sizes what only cold code calls too: mark that `hot` if timed
#include "analog-rytm-mk2/store.h"

#define LINK_VERSION 1

// Stock, OS 1.74.
#define SYSEX_SEND ((int (*)(const uint8_t *, int, const uint8_t *, int))SYSEX_SEND_AT)
#define USB_SYSEX_STATE (*(volatile uint32_t *)USB_SYSEX_STATE_AT)
#define UI_QUEUE ((void *(*)(void))UI_QUEUE_AT)
#define QUEUE_POST ((void (*)(void *, const void *))QUEUE_POST_AT)
#define VIEW_INVALIDATE ((void (*)(void *))VIEW_INVALIDATE_AT)
#define FILLRECT ((void (*)(void *, int, int, int, int, int))FILLRECT_AT)
#define SEQ_PLAYING (*(volatile int *)SEQ_PLAYING_AT)
// The frame on the screen, 1024 bytes. Stock keeps two frame pointers side by side: it sends the one it drew
// (0x40287b68) to the display, then swaps them, so the sent frame is the second (0x40287b6c). The first is the
// frame before it until the next draw, which a view that draws only on an event shows as a screen one key late.
#define FB_FRONT (*(uint8_t *volatile *)FB_FRONT_AT)
#define KEY_INDEX ((const int32_t *)0x418d0be0)       // is_key_held's tables
#define KEY_BITS ((const volatile uint8_t *)0x418d1340)
#define KEY_IDS 200                     // KEY_INDEX's entries (stock fills 0x418d0be0..0x418d0eff)
#define OS_BUILD ((const char *)0x402728bd)            // the container's build, "0176" on 1.74
#define LABEL ((const char *)0x402728c9)               // the version the unit shows: "1.74", or the image's
                                                       // label (link-image.mjs --version), e.g. "XX01"
#define RSR (*(volatile uint8_t *)0xEC090001)          // reset status: bit 5 software reset
#define RSR_SOFT 0x20

#define USB 2
#define AUTO_USB 4
#define MSG_KEY 0
#define MSG_ENC 1
#define KEY_YES 0x44
#define KEY_DOWN 1                      // ev_key flags bit 0: down
#define ENC_LAST 8                      // A..H, then LEVEL

// Commands and replies.
#define CMD_IDENT 0x01
#define CMD_DISARM 0x02
#define CMD_KEY 0x10
#define CMD_ENC 0x11
#define CMD_RELEASE_ALL 0x12
#define CMD_CONFIRM 0x13                // YES pressed and let go, for stock's UPGRADE OS NOW?: sets the carry
#define CMD_RAMBOOT 0x14                // as CONFIRM, but the staged image is booted from RAM, not flashed
#define CMD_SCREEN 0x20
#define CMD_MEM 0x21
#define ST_OK 0
#define ST_NOT_ARMED 1
#define ST_BAD 2
#define ST_BUSY 3
#define ST_RANGE 4
#define ST_HUMAN 5

#define RING 8                          // commands waiting for the UI task
#define CMD_BYTES 48                    // a command's bytes, F0..F7 (the longest, RAMBOOT, is 29)
#define SLOTS 40                        // posted messages, reused in turn (more than PENDING)
#define PENDING 32                      // posted events not yet seen at ev_key/ev_enc
#define PER_TICK 6                      // commands acted on in one tick
#define HUMAN_TICKS 60                  // about 3 s
#define CARRY_TICKS 1200                // about a minute
#define MEM_MAX 128
#define SCREEN_PART 512                 // a screen reply's bytes: the host asks for both halves
#define HEADER 8                        // F0 7D M W L ver seq cmd
#define PEND_TICKS 20                   // about 1 s: a posted event never seen at ev_key/ev_enc is given up
#define DDR_END 0x48000000              // the DDR the OS maps cached (0x40000000-0x47ffffff)

// RAM boot. Stock's SysEx upgrade receiver (OS 1.74) keeps its state at 0x403c8b00
// (0x40084900 returns it): a 32-byte header, then at +0x20 the staged struct the
// job gets from 0x40083ea4 = length, checksum, then the ELE3 container. The mailbox
// is written over that header, which the receiver is done with once the job runs.
// The flashed image unpacks to 0x40000400 and must end below 0x403c8b00, as must
// the one booted from RAM (IMAGE_MAX). Not checked: a flashed image whose packed
// MAIN OS is over 0x1c8b00 bytes (the bootstrap reads it to 0x40200000) would run
// into the mailbox on the way up; the container CRC then fails and the flashed OS
// boots.
#define MAILBOX ((volatile uint32_t *)0x403c8b00)
#define STAGED ((const uint32_t *)0x403c8b20)
#define MB_ASKED 0x4d574254             // 'MWBT': boot the staged image
#define MB_SPENT 0x4d574255             // 'MWBU': the unpack began
#define MB_BOOTED 0x4d574253            // 'MWBS': the unpacked image checked out and was entered
#define MB_CHECK 0x52794c6b             // the check word's seed
#define OS_BASE 0x40000400              // MAIN OS: its first long is the entry
#define IMAGE_MAX 0x3c8700
#define CONTAINER_MAX 0x400000
#define MAIN_OS 3                       // the container's section id
#define SRAM_PROBE ((const uint8_t *)0x80000030)  // IDENT reports the CRC32 of these bytes as the gate
#define SRAM_PROBE_BYTES 356            //   found them, before stock's 0x400007e4 fills SRAM: the 1.74
                                        //   container's bootstrap has its depacker there (0x581c36a4)
// Diagnostics of the reset: the top 68 bytes of the mod area, above every
// module's .bss (a set must leave ramSpare >= 68; nothing checks it). The core's
// boot hook copies .run and zeroes .bss only, so they keep what was written.
// DIAG, by the gate: 0-7 the mailbox as found, 8-11 the staged struct's first words,
// 12-13 MARK as found, 14 RSR. MARK, on the way to a RAM boot's reset: 0 DIAG_MARK +
// flags, 1 DIAG_STAGE + how far it came; the gate clears both.
#define DIAG ((volatile uint32_t *)0x47bfffbc)
#define MARK ((volatile uint32_t *)0x47bffff8)
#define DIAG_MARK 0x4d570000            // + panel events << 8 (8 bits) + due (bits 0-1), 4 armed, 8 stock's struct is STAGED, 16 its length matches
#define DIAG_STAGE 0x4d575400           // + 1 the command was taken, 2 stock's job reached the site, 3 its wait
                                        //   returned, 4 the drain returned, 5 written with the data cache off
#define BOOT_ARG (*(const uint32_t *)0x40272874)  // what the bootstrap passed the OS entry
#define STOCK_DELAY ((void (*)(int))0x40098c84)   // stock's wait before its reset

// What the last boot did, for IDENT.
#define BOOT_FLASH 0                    // no request: the flashed OS
#define BOOT_RAM 1                      // this image was booted from RAM
#define BOOT_NOT_SOFT 2                 // a request, but not after a software reset
#define BOOT_BAD_CHECK 3                // the mailbox's check word
#define BOOT_BAD_BOUNDS 4
#define BOOT_BAD_CRC 5                  // the upload did not survive the reset
#define BOOT_NO_OS 6                    // no MAIN OS section where the table says
                                        // 7: no longer given (was: SRAM does not hold the 1.74 bootstrap's depacker)
#define BOOT_FAILED 8                   // the unpacked image was wrong: reset, and this is the flashed OS

STORE_FIELD(mw_link_carry);             // project, 1 bit: armed across the YES's reset

// ---- the ring the router fills ------------------------------------------------
static uint8_t ring[RING][CMD_BYTES];
static uint8_t ring_len[RING];
static volatile uint32_t ring_head, ring_tail, ring_drops, rx_count;

// From link.s, in the MIDI task, for every SysEx stock's router gets. 1: taken.
int mw_link_rx(const uint8_t *msg, int len, int iface)
{
    uint32_t h;
    int i;
    if (len < HEADER + 1 || msg[1] != 0x7D || msg[2] != 'M' || msg[3] != 'W' || msg[4] != 'L')
        return 0;
    if (iface != USB && iface != AUTO_USB)
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
    __asm__ volatile("" ::: "memory");  // the bytes before the index, also for the compiler
    ring_head = h + 1;                  // published last: the UI task reads it after the bytes
    return 1;
}

// ---- arm, the person at the unit, the posted events ---------------------------
static int armed, booted, carry_ticks, human_ticks = -1, ui_dirty, release_due;
static uint32_t human_count, posted_count, refused_count, boot_rsr, ticks;
static uint8_t held_bits[32];           // keys this link holds down, a bit each
int mw_link_ramboot_due;                // link.s reads it where stock's job would flash:
                                        //   0 flash, 1 RAM boot, 2 cancelled (reset, no write)
static uint32_t ramboot[4];             // from the host: unpacked length and CRC, container length and CRC
static uint32_t boot_status, boot_depack_crc, boot_image;
#define HELD(k) (held_bits[(k) >> 3] >> ((k) & 7) & 1)
#define HOLD(k, on) (held_bits[(k) >> 3] = (uint8_t)((held_bits[(k) >> 3] & ~(1 << ((k) & 7))) | (!!(on) << ((k) & 7))))

struct pend { uint8_t kind, id; int8_t value; };
static struct pend pend[PENDING];
static uint32_t pend_head, pend_tail, pend_seen;
static int pend_age;
static int32_t slots[SLOTS][4];
static uint32_t slot_next;

// The panel's own key bitmap, as stock's is_key_held reads it: never the link's holds,
// never a key a module plays through core_key.
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
    int32_t index;
    if ((unsigned)key < 256 && HELD(key))
        return 1;
    index = KEY_INDEX[key];             // as stock reads it, for any id stock asks about
    if (index < 0)
        return 0;
    return (KEY_BITS[index >> 3] >> (index & 7)) & 1;
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
    m[3] = 0;                           // the event's time, as Control In Actions posts
    pend[pend_head % PENDING] = (struct pend){ (uint8_t)kind, (uint8_t)id, (int8_t)(kind == MSG_KEY ? value & 1 : value) };
    pend_head++;
    QUEUE_POST(UI_QUEUE(), m);
    posted_count++;
    return 1;
}

// Lets go of every key the link holds. A release the queue cannot take now stays held
// and due: the next tick tries again. -> 1 when any key was held.
static int release_all(void)
{
    int k, any = 0;
    release_due = 0;
    for (k = 0; k < 256; k++)
        if (HELD(k)) {
            any = 1;
            if (post(MSG_KEY, k, 0x10)) // a release, as Control In Actions sends one
                HOLD(k, 0);
            else
                release_due = 1;
        }
    return any;
}

// Off, and nothing the link held stays held: the releases are posted where the queue
// takes them, and the link's own marks are cleared either way, so is_key_held never
// reports a key the link pressed once it is disarmed.
static void ramboot_cancel(void)
{
    if (mw_link_ramboot_due)
        mw_link_ramboot_due = 2;
}

static void disarm(void)
{
    int k;
    if (armed) {
        release_all();
        armed = 0;
        ui_dirty = 1;
    }
    for (k = 0; k < 32; k++)
        held_bits[k] = 0;
    release_due = 0;
    ramboot_cancel();
}

static void set_carry(int on)
{
    core_store_set(STORE(mw_link_carry), 0, 0, (unsigned)on);
    carry_ticks = on ? CARRY_TICKS : 0;
    mw_link_ramboot_due = 0;            // a RAM boot is asked for after this, and ends with the carry
}

// Is this event the next one the link posted? Pops it if so. A key matches by id and
// its down bit, a turn by encoder.
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

// A person pressed or turned something. -> 1 when the link held keys: that first press
// is taken, so it never combines with a key the link still held (FUNC + X).
static int human(void)
{
    human_count++;
    ramboot_cancel();                   // never a flash where the host asked for a RAM boot
    if (!armed)
        return 0;
    human_ticks = 0;
    return release_all();
}

// A panel key's press that is not the link's is a person. A module's own key messages
// (Control In Actions posts 'CIA1') are not panel keys. A release alone is not one
// either: the YES that armed the link is let go after it. A press of the key whose event
// was just dispatched, in the same tick, is what a module playing a held-back tap again
// through core_key looks like (Quick Mod Assign's LFO tap, inside the release's own
// dispatch): it counts only when the panel's bitmap holds that key down. Any other press
// counts whatever the bitmap says, so a tap let go before the UI loop takes it is seen.
static int32_t last_key = -1;
static uint32_t last_tick;
int mw_link_key(void *brain, char *event)
{
    int32_t key = *(int32_t *)(event + 12), flags = *(int32_t *)(event + 16);
    int replay = key == last_key && ticks == last_tick, person;
    (void)brain;
    person = (uint32_t)key < 256 && !ours(MSG_KEY, key, flags) && (flags & KEY_DOWN)
        && (!replay || panel_down(key));
    last_key = key;
    last_tick = ticks;
    return person ? human() : 0;
}

int mw_link_enc(void *brain, char *event)
{
    int32_t enc = *(int32_t *)(event + 12);
    (void)brain;
    if ((uint32_t)enc <= ENC_LAST && !ours(MSG_ENC, enc, 0))
        return human();
    return 0;
}

// ev_project: the first call is the boot's project load. A project saved within the
// minute after a confirm keeps the carry bit in its file: any later load clears it
// unless a confirm is still running.
void mw_link_project(int how, unsigned dropped)
{
    (void)how;
    (void)dropped;
    if (booted) {
        if (!carry_ticks && core_store_get(STORE(mw_link_carry), 0, 0))
            set_carry(0);
        return;
    }
    booted = 1;
    boot_rsr = RSR;
    armed = 1;                          // on at every boot; the row turns it off
    human_ticks = -1;
    ui_dirty = 1;
    set_carry(0);
}

// ---- replies ---------------------------------------------------------------
static uint8_t reply[HEADER + 1 + 5 + (SCREEN_PART / 7 + 1) * 8 + 1];

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
    int seq = m[6], cmd = m[7], n = len - HEADER - 1, status = ST_OK;
    const uint8_t *a = m + HEADER;
    uint8_t *p;
    int i;
    if (m[5] != LINK_VERSION) {
        send(begin(seq, cmd, ST_BAD));
        return;
    }
    switch (cmd) {
    case CMD_IDENT:
        p = begin(seq, cmd, ST_OK);
        p = put32(p, LINK_VERSION);
        p = put32(p, (uint32_t)armed);
        p = put32(p, human_ticks >= 0 && human_ticks < HUMAN_TICKS);
        p = put32(p, human_count);
        p = put32(p, posted_count);
        p = put32(p, refused_count);
        p = put32(p, ring_drops);
        p = put32(p, rx_count);
        p = put32(p, ticks);
        p = put32(p, boot_rsr);
        p = put32(p, SEQ_PLAYING != 0);
        for (i = 0; i < 4; i++)
            *p++ = LABEL[i] & 0x7f;
        for (i = 0; i < 4; i++)
            *p++ = OS_BUILD[i] & 0x7f;
        p = put32(p, boot_status);
        p = put32(p, boot_depack_crc);
        p = put32(p, boot_image);
        send(p);
        return;
    case CMD_DISARM:
        disarm();
        send(begin(seq, cmd, ST_OK));
        return;
    case CMD_SCREEN: {                  // payload: the first byte wanted (0 or 512)
        uint8_t *fb = FB_FRONT;
        uint32_t off = n >= 5 ? get32(a) : 0;
        if ((uint32_t)fb < 0x40000000 || (uint32_t)fb > DDR_END - 1024 || off >= 1024) {
            send(begin(seq, cmd, ST_RANGE));
            return;
        }
        p = put32(begin(seq, cmd, ST_OK), off);
        send(pack(p, fb + off, 1024 - off < SCREEN_PART ? (int)(1024 - off) : SCREEN_PART));
        return;
    }
    case CMD_MEM: {
        uint32_t addr, count;
        if (n < 10) {
            send(begin(seq, cmd, ST_BAD));
            return;
        }
        addr = get32(a);
        count = get32(a + 5);
        if (!readable(addr, count)) {
            send(begin(seq, cmd, ST_RANGE));
            return;
        }
        p = put32(begin(seq, cmd, ST_OK), addr);
        send(pack(p, (const volatile uint8_t *)addr, (int)count));
        return;
    }
    case CMD_KEY:
    case CMD_ENC:
    case CMD_RELEASE_ALL:
    case CMD_CONFIRM:
    case CMD_RAMBOOT:
        if (!armed || !booted)          // before the boot's settle its set_carry(0) would drop a request
            status = ST_NOT_ARMED;
        else if (human_ticks >= 0 && human_ticks < HUMAN_TICKS)
            status = ST_HUMAN;
        else if (cmd == CMD_RELEASE_ALL)
            release_all();
        else if (cmd == CMD_CONFIRM || cmd == CMD_RAMBOOT) {
            if (cmd == CMD_RAMBOOT && n < 20)
                status = ST_BAD;
            else if (pend_head - pend_tail > PENDING - 2)
                status = ST_BUSY;
            else {
                post(MSG_KEY, KEY_YES, KEY_DOWN);
                post(MSG_KEY, KEY_YES, 0x10);
                set_carry(1);           // this YES starts stock's OS upgrade
                if (cmd == CMD_RAMBOOT) {
                    for (i = 0; i < 4; i++)
                        ramboot[i] = get32(a + 5 * i);
                    mw_link_ramboot_due = 1;
                    MARK[1] = DIAG_STAGE | 1;
                }
            }
        } else if (n < 10)
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
        send(begin(seq, cmd, status));
        return;
    default:
        send(begin(seq, cmd, ST_BAD));
    }
}

void mw_link_tick(char *ctrl)
{
    int done;
    ticks++;
    if (!booted && ticks > 200)
        mw_link_project(1, 0);          // no project load seen at boot: settle the carry anyway
    if (human_ticks >= 0 && human_ticks < HUMAN_TICKS)
        human_ticks++;
    if (carry_ticks && !--carry_ticks) {
        if (mw_link_ramboot_due == 1) { // no reset came: a second minute as cancelled, so a
            mw_link_ramboot_due = 2;    //   job that is only slow still never flashes
            carry_ticks = CARRY_TICKS;
        } else
            set_carry(0);               // the upgrade did not start
    }
    if (release_due)
        release_all();
    // A posted event the loop took without passing it to ev_key/ev_enc (or one the
    // queue lost) would hold the head of pend for good: every later event of the
    // link would then count as a person's. Give it up after about a second.
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
    if (ui_dirty) {
        ui_dirty = 0;
        ctrl[0x20] = 1;
    }
}

// ---- RAM boot ---------------------------------------------------------------
extern void core_finish_drain(void);    // core-ar2/finish.s: masks interrupts, lets the panel and UART queues empty
extern void mw_cache_push(void);        // link.s: every dirty line of the data cache out to DDR
extern void mw_cache_off(void);         // link.s: the same, then the data cache off
extern void mw_link_reset(void) __attribute__((noreturn));
extern void mw_boot_enter(uint32_t arg) __attribute__((noreturn));

static uint32_t mb_check(const volatile uint32_t *mb)
{
    return (mb[1] ^ mb[2]) + (mb[3] ^ mb[4]) + MB_CHECK;
}

// From link.s, in stock's upgrade job where it would erase and write the flash, when
// the host asked for a RAM boot: stock has validated the upload and saved the working
// state. As stock's routine ends: its wait, the drain, then the reset. The reset does
// not write the data cache's dirty lines to DDR (on a MKII a mailbox written
// through the cache and pushed with cpushl alone, was not there after it), so before
// the mailbox: every dirty line out (the upload came through the cache), then the
// data cache off, and the mailbox goes straight to DDR. An upload that is not the one
// the host described is not booted: the reset then brings the flashed OS back, with
// nothing written.
void COLD mw_link_ramboot_go(const uint32_t *st)
{
    volatile uint32_t *mb = MAILBOX;
    MARK[1] = DIAG_STAGE | 2;
    mw_cache_push();
    STOCK_DELAY(3000000);
    MARK[1] = DIAG_STAGE | 3;
    mw_cache_push();
    core_finish_drain();                // interrupts stay masked from here
    MARK[1] = DIAG_STAGE | 4;
    MARK[0] = DIAG_MARK | (human_count & 0xff) << 8 | (mw_link_ramboot_due & 3) | (armed ? 4 : 0)
        | (st == STAGED ? 8 : 0) | (st == STAGED && st[0] == ramboot[2] ? 16 : 0);
    mw_cache_off();                     // no memory write may come between its push and its switch: it has none
    MARK[1] = DIAG_STAGE | 5;
    if (mw_link_ramboot_due == 1 && st == STAGED && st[0] == ramboot[2] && armed) {
        mb[1] = ramboot[2];
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

// From link.s at boot (OS 1.74 0x400008c6): after the core's boot hook (this code is
// in place, its .bss zeroed), before stock fills SRAM and clears its own .bss. The
// data cache is off here. Returns to boot the image that is running; does not return
// when it unpacks and enters the staged one.
void COLD mw_boot_gate(void)
{
    volatile uint32_t *mb = MAILBOX;
    const uint8_t *c = (const uint8_t *)(STAGED + 2), *e;
    uint32_t magic = mb[0], clen, ulen, off, plen, i, count, arg;
    boot_depack_crc = crc32(SRAM_PROBE, SRAM_PROBE_BYTES);
    if (magic != MB_BOOTED) {           // an image entered from RAM keeps the snapshot of the boot that entered it
        volatile uint32_t *d = DIAG;
        for (i = 0; i < 12; i++)        // the mailbox, then the staged struct behind it
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
        boot_image = mb[4];             // which image: the flash's label is all stock shows
    }
    if (magic != MB_ASKED)
        return;
    clen = mb[1];
    ulen = mb[3];
    boot_status = BOOT_BAD_CHECK;
    if (mb[5] != mb_check(mb))
        return;
    boot_status = BOOT_BAD_BOUNDS;
    if (ulen - 1 >= IMAGE_MAX || clen < 0x30 || clen > CONTAINER_MAX || STAGED[0] != clen)
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

// The armed mark, on every frame: a black notch at the right end of the header bar,
// columns 126-127, rows 2-6 from the top, beside stock's transport icon (x 121-125),
// which it leaves alone. Screens without the white header show it as nothing. On the unit it merges
// with the stop square and no one sees it: the GLOBAL row is what tells a person. Kept because the
// rig's whole-screen references were recorded with it.
void mw_link_draw(void *bmp, void *ctrl)
{
    (void)ctrl;
    if (armed)
        FILLRECT(bmp, 126, 57, 127, 61, 0);
}

// ---- GLOBAL > REMOTE CONTROL ---------------------------------------------------
extern void mw_link_row_label(void);
extern void core_additem(void *menu, const void *row);
// An integer, so the pointer comes back in d0 whatever the compiler's pointer convention.
// REMOTE CONTROL: ON is cut at the right edge beside the icon (17 characters fit): CTRL.
uint32_t mw_link_row_text(void) { return (uint32_t)(armed ? "REMOTE CTRL: ON" : "REMOTE CTRL: OFF"); }

// Stock's icon drawer (OS 1.74): (bitmap, icon, x, y, centre). GLOBAL's own rows draw
// their icon with it from their draw callback, passing the callback's bitmap, x and y
// on and centre false (0x400da2cc and the rows after it); this row does the same with
// stock's 9 x 9 wrench, a static icon object of the OS (0x419f0c58).
typedef void (*draw_icon_t)(void *bitmap, const void *icon, int x, int y, int centre);
#define DRAW_ICON ((draw_icon_t)0x400716e0)
#define ICON_WRENCH ((const void *)0x419f0c58)

static void COLD set_armed(void **menu, int on)
{
    if (on && !armed) {
        armed = 1;
        human_ticks = -1;
        pend_tail = pend_head;          // nothing the link posted before is still due
        ui_dirty = 1;
    } else if (!on)
        disarm();
    VIEW_INVALIDATE((char *)*menu + 56);
}

static void row_select(void **menu, void *item) { (void)item; set_armed(menu, !armed); }
static void row_draw(void **menu, void *item, void *bitmap, int x, int y) { (void)menu; (void)item; DRAW_ICON(bitmap, ICON_WRENCH, x, y, 0); }
static void row_change(void **menu, void *item, int dir) { (void)item; if (dir) set_armed(menu, dir > 0); }

static const void *const row[4] = {
    (const void *)mw_link_row_label, (const void *)row_select, (const void *)row_draw, (const void *)row_change,
};

void COLD mw_link_settings(void *menu)
{
    core_additem(menu, row);
}
