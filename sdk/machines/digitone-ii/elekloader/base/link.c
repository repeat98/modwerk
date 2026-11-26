// SPDX-License-Identifier: GPL-3.0-or-later
// The Digitone II's development link: diagnostics and, while armed, panel keys and encoders over USB MIDI SysEx, in the Analog Rytm MKII
// link's wire format (sdk/machines/analog-rytm-mkii/LINK.md), so one host speaks to both. Development bases only.
// Requests and replies are F0 7D 'M' 'W' 'L' version seq cmd ... F7; a reply's cmd has 0x40 set, then a status.
// Numbers are u32 as five 7-bit bytes, least significant first; byte blocks are 7-bit packed, the first byte's top
// bit in bit 6 of the group's leading byte.
//   ident   0x01 -> link version, messages received, messages dropped, ticks, armed, person at the unit,
//                   presses and turns from a person, events posted, requests refused
//   disarm  0x02 -> turns the arm off and lets go of every key the link holds (a release the queue cannot take yet
//                   follows from the UI tick)
//   key     0x10 ID FLAGS -> a panel key message (flags bit 0 down, 0x10 a release), armed only; refused while an
//                   OS upload waits at UPGRADE OS NOW? (a flash needs a person's YES)
//   enc     0x11 N DELTA -> an encoder turn (1-8 A-H, 9 LEVEL), armed only, refused as key
//   release 0x12 -> lets go of every key the link holds, armed only
//   screen  0x20 OFF -> 128 bytes of the frame on the screen from OFF (0, 128 ... 896), with the frame's number
//   diag    0x22 -> the diagnostics log's size, frame interrupts and UI ticks so far (and where it is, for reference)
//   freeze  0x23 N -> armed: the next UI tick stands still N frames (at most 15 s), audio goes on: a FREEZE test
//   log     0x24 OFF -> up to 128 bytes of the diagnostics log from OFF (0, 128 ...), with the log's seq
// The device chooses what each request returns: there is no request for an address the host names, so a client
// reads the link's counters, the screen and the diagnostics log, and posts keys and turns, and reaches nothing else.
// Keys and turns go on the UI task's queue (0x4013747a, queue_put 0x40001896) as the panel's messages do, so the UI
// loop plays them through the core's ev_key/ev_enc sites and stock: modules see them too. A key the link holds reads
// as held to stock's is_key_held (0x4011fac4, which base.json points at mw_link_held). Arm: SETTINGS > REMOTE CTRL, ON
// at every boot of a development base; a press or turn from a person at the panel refuses the host for about three
// seconds and lets go of what it held, and OFF stops it until the next boot.
// Receive (link.s): stock's SysEx router, MIDI task; the link's own messages from USB go into a ring, the router goes
// on as stock. Work: ev_tick (UI task) takes the ring and replies through stock's sysex_send on USB.
#include <stdint.h>
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
// Stock's OS upload buffer (OS 1.12, 0x40122574 returns it): header byte 0 is 3 once an upload is complete, which is
// when stock asks UPGRADE OS NOW?. Boot clears it (0x402fb000-0x466b8c50).
#define UPLOAD_STATE (*(const volatile uint8_t *)UPLOAD_AT)
#define KEY_IDS 111                     // KEY_INDEX's entries
#define MSG_KEY 0
#define MSG_ENC 1
#define KEY_DOWN 1
#define KEY_RELEASE 0x10                // flags of a release, as the panel posts it
#define ENC_FIRST 1                     // A..H are 1..8, LEVEL 9 (seen on a unit)
#define ENC_LAST 9

#define USB 2
#define AUTO_USB 4
#define ST_OK 0
#define ST_NOT_ARMED 1
#define ST_BAD 2
#define ST_BUSY 3
#define ST_RANGE 4
#define ST_HUMAN 5
#define ST_FLASH 6                      // an OS upload waits at UPGRADE OS NOW?: only a person confirms it
#define CMD_IDENT 0x01
#define CMD_DISARM 0x02
#define CMD_KEY 0x10
#define CMD_ENC 0x11
#define CMD_RELEASE_ALL 0x12
#define CMD_SCREEN 0x20
#define CMD_DIAG 0x22                   // the diagnostics log (diag.c): its size, frames and ticks
#define CMD_FREEZE_TEST 0x23            // armed: the next UI tick stands still N frames (diag.c), to see a FREEZE logged
#define CMD_LOG 0x24                    // a part of the diagnostics log, as the screen's: the unit chooses the bytes
#define LOG_PART 128
#define SLOTS 40                        // posted messages, reused in turn (more than PENDING)
#define PENDING 32                      // posted events not yet seen at ev_key/ev_enc
#define HUMAN_TICKS 60                  // about 3 s
#define PEND_TICKS 20                   // about 1 s: a posted event never seen at ev_key/ev_enc is given up
#define HEADER 8                        // F0 7D M W L ver seq cmd
#define RING 8                          // requests waiting for the UI task
#define CMD_BYTES 32                    // a request's bytes, F0..F7 (key and enc, the longest, are 19)
#define PER_TICK 4                      // requests answered in one tick
#define FRAME_BYTES 1024                // 128x64 pixels, 1 bit each
#define SCREEN_PART 128                 // a screen reply's bytes
// Stock keeps two frame pointers side by side (OS 1.12, FRAME_POINTERS_AT 0x402a10c8): it sends the one it drew to
// the display, then swaps them (0x40131fd2), so the frame on the screen is the second.
#define FRAME_ON_SCREEN (((uint8_t *const volatile *)FRAME_POINTERS_AT)[1])
#ifndef DDR_START                       // a host test names its own
#define DDR_START 0x40000000u
#define DDR_END 0x48000000u
#endif

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

static uint8_t reply[HEADER + 1 + 5 * 9 + (SCREEN_PART / 7 + 1) * 8 + 1];
// The frame as it was when OFF 0 was asked for: the later parts come from this copy, so the eight parts are one frame.
static uint8_t frame[FRAME_BYTES];
static uint32_t frame_number;           // 0 until the first copy

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

// An OS upload is staged: a flash is one YES away, so the link neither presses nor holds a key until the next boot.
static int flash_waits(void)
{
    return UPLOAD_STATE == 3;
}

int mw_link_held(int key)               // stock's is_key_held, and the link's holds
{
    if ((unsigned)key < KEY_IDS && HELD(key) && !flash_waits())
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

// New presses stop at once; a release the queue cannot take now stays held and due, and the UI tick posts it when
// there is room, so stock never keeps a key down that the link pressed.
static void disarm(void)
{
    if (armed)
        release_all();
    armed = 0;
}

// A press or turn the link posted that stock would get while UPGRADE OS NOW? waits: taken before stock, counted as
// refused. The check where the host asks (ST_FLASH) cannot see one already in stock's queue when the upload completes.
static void held_back(void)
{
    refused_count++;
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

static int person_at_panel(void)        // a person pressed or turned something in the last HUMAN_TICKS ticks
{
    return human_ticks >= 0 && human_ticks < HUMAN_TICKS;
}

static int human(void)                  // a person pressed or turned something; -> 1 takes that first press
{
    int any;
    human_count++;
    if (!armed)
        return 0;
    human_ticks = 0;
    any = release_all();
    return flash_waits() ? 0 : any;     // at UPGRADE OS NOW? a person's press always reaches stock: their YES or NO
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
    int mine = (uint32_t)key < KEY_IDS && ours(MSG_KEY, key, flags);
    person = (uint32_t)key < KEY_IDS && !mine && (flags & KEY_DOWN) && (!replay || panel_down(key));
    last_key = key;
    last_tick = ticks;
    if (mine) {                         // nothing the link queued reaches UPGRADE OS NOW?, a press or a release: stock
        if (!flash_waits())             // takes the release of a YES it saw go down as the answer (on a unit, 26 Nov)
            return 0;
        held_back();
        return 1;
    }
    return person ? human() : 0;
}

int mw_link_enc(void *brain, char *event)
{
    int32_t enc = *(int32_t *)(event + 12);
    (void)brain;
    if (enc < ENC_FIRST || enc > ENC_LAST)
        return 0;
    if (ours(MSG_ENC, enc, 0)) {        // nor a turn the link queued
        if (!flash_waits())
            return 0;
        held_back();
        return 1;
    }
    return human();
}

// OFF 0 copies the frame on the screen, if stock's pointer to it lies wholly in DDR; 0 when it does not.
static int take_frame(void)
{
    const uint8_t *fb = FRAME_ON_SCREEN;
    int i;
    if ((uintptr_t)fb < DDR_START || (uintptr_t)fb > DDR_END - FRAME_BYTES)
        return 0;
    for (i = 0; i < FRAME_BYTES; i++)
        frame[i] = fb[i];
    frame_number++;
    return 1;
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
        p = put32(p, (uint32_t)person_at_panel());
        p = put32(p, human_count);
        p = put32(p, posted_count);
        p = put32(p, refused_count);
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
    case CMD_LOG:                       // the log's own bytes only, from where diag.c keeps it
        if (n < 5) {
            send(begin(seq, cmd, ST_BAD));
            return;
        } else {
            uint32_t off = get32(m + HEADER), size = mw_diag_log_bytes();
            const volatile uint8_t *log = (const volatile uint8_t *)mw_diag_log_at();
            if (off >= size || off % LOG_PART) {
                send(begin(seq, cmd, ST_RANGE));
                return;
            }
            p = begin(seq, cmd, ST_OK);
            p = put32(p, off);
            p = put32(p, ((const volatile uint32_t *)log)[4]);   // struct diag_log's seq: raised by every record
            p = pack(p, log + off, size - off < LOG_PART ? (int)(size - off) : LOG_PART);
            send(p);
        }
        return;
    case CMD_FREEZE_TEST:
        if (!armed)
            status = ST_NOT_ARMED;
        else if (person_at_panel())
            status = ST_HUMAN;          // as for keys: the musician comes first
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
    case CMD_KEY:
    case CMD_ENC:
    case CMD_RELEASE_ALL:
        if (!armed)
            status = ST_NOT_ARMED;
        else if (person_at_panel())
            status = ST_HUMAN;
        else if (cmd == CMD_RELEASE_ALL)
            release_all();
        else if (flash_waits())
            status = ST_FLASH;
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
    case CMD_SCREEN:
        if (n < 5) {
            send(begin(seq, cmd, ST_BAD));
            return;
        } else {
            uint32_t off = get32(m + HEADER);
            if (off >= FRAME_BYTES || off % SCREEN_PART || (off == 0 ? !take_frame() : !frame_number)) {
                send(begin(seq, cmd, ST_RANGE));
                return;
            }
            p = begin(seq, cmd, ST_OK);
            p = put32(p, off);
            p = put32(p, frame_number);
            p = pack(p, frame + off, SCREEN_PART);
            send(p);
        }
        return;
    default:                            // anything else, the old mem (0x21) included
        send(begin(seq, cmd, ST_BAD));
    }
}

void mw_link_tick(void)
{
    int done;
    ticks++;
    if (human_ticks >= 0 && human_ticks < HUMAN_TICKS)
        human_ticks++;
    if (release_due)
        release_all();
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
