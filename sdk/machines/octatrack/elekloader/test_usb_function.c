/* SPDX-License-Identifier: GPL-3.0-or-later
 * Host check of the USB function a module contributes (usb_function.c) over a model of the controller's registers:
 * admission takes a whole, in-range record and refuses every other; a function that arrives is put behind the base's
 * own configuration only while the unit is off the bus, after the grace second and an idle control endpoint; one
 * that leaves has its endpoint flushed and disabled at the switch; USB DISK MODE holds a reconnect back for as long
 * as it is open; a control endpoint that never idles is not waited for past ten seconds; the reconnect is over
 * when the host has reset the bus and reached the vendor interface, and a host that does not counts as unplugged
 * once. No stock byte is used. */
#define MW_HOST
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
static unsigned failures;
#define CHECK(x) do { if (!(x)) { failures++; fprintf(stderr, "%s:%d: %s\n", __FILE__, __LINE__, #x); } } while (0)

#define USBCMD 0xfc0b0140u
#define PORTSC1 0xfc0b0184u
#define OTGSC 0xfc0b01a4u
#define SETUPSTAT 0xfc0b01acu
#define FLUSH 0xfc0b01b4u
#define STAT 0xfc0b01b8u
#define COMPLETE 0xfc0b01bcu
#define CTRL3 0xfc0b01ccu
#define EP0_STATE 0x460bb3ecu
#define EP0_AWAITED 0x460bb3f4u
static uint32_t registers[0x100 / 4], stock_state, stock_awaited;
static volatile uint32_t *host_reg(uint32_t a)
{
    if (a == EP0_STATE) return &stock_state;
    if (a == EP0_AWAITED) return &stock_awaited;
    if (a - 0xfc0b0100u < sizeof registers && !(a & 3u)) return &registers[(a - 0xfc0b0100u) / 4u];
    fprintf(stderr, "unmapped %#x\n", a); exit(2);
}
#define UF_REG(a) (*host_reg(a))
#define UF_UNCACHED(p) ((volatile uint8_t *)(p))
#define UF_IMAGE_ADDRESS(p) ((void)(p), 0x40300000u) /* where the switch finds a relocated image */
#define MODWERK_USB_CFG_BYTES 101u
#define MODWERK_USB_CFG_INTERFACES 4u

#include "loader.h"
#include "modwerk_events.h"
/* The hooks' rows hold handlers; here, numbers the walk hands to host_call. */
enum { H_ISR = 1, H_BUS_END, H_CONTROL, H_CONTROL_OTHER, H_FRAME };
static unsigned isrs, bus_ends, controls, others, answer, frames;
static unsigned host_call(uintptr_t handler)
{
    switch (handler) {
    case H_ISR: return ++isrs, 0u;
    case H_BUS_END: return ++bus_ends, 0u;
    case H_CONTROL: return ++controls, answer;
    case H_CONTROL_OTHER: return ++others, 4u;
    case H_FRAME: return ++frames, 0u;
    }
    fprintf(stderr, "uncalled %#lx\n", (unsigned long)handler); exit(2);
}
#define UF_CALL(handler) host_call(handler)
static int locked, usb_disk;
uint32_t modwerk_machine_lock(void) { CHECK(!locked); locked = 1; return 4; }
void modwerk_machine_unlock(uint32_t s) { CHECK(locked && s == 4); locked = 0; }
static int masked;
uint32_t modwerk_machine_mask(void) { CHECK(!masked); masked = 1; return 7; }
void modwerk_machine_unmask(uint32_t s) { CHECK(masked && s == 7); masked = 0; }
static int stopped = 1;
int modwerk_machine_stopped(void) { return stopped; }
int modwerk_machine_usb_disk(void) { return usb_disk; }
uint8_t modwerk_cfg_fs[512], modwerk_cfg_hs[512], modwerk_cfg_os_fs[512], modwerk_cfg_os_hs[512];
volatile uint32_t modwerk_cfg_len_fs = MODWERK_USB_CFG_BYTES, modwerk_cfg_len_hs = MODWERK_USB_CFG_BYTES;
static uintptr_t volatile function_row[2], isr_row[2] = {H_ISR}, bus_end_row[2] = {H_BUS_END}, control_row[3] = {H_CONTROL}, frame_row[2] = {H_FRAME};
#define modwerk_runtime_event_row host_rows
static uintptr_t volatile *const host_rows[RUNTIME_SITE_EVENTS] = {
    [MODWERK_OT_USB_FUNCTIONS - RUNTIME_EVENTS] = function_row, [MODWERK_EV_USB_ISR - RUNTIME_EVENTS] = isr_row,
    [MODWERK_EV_USB_BUS_END - RUNTIME_EVENTS] = bus_end_row, [MODWERK_EV_USB_CONTROL - RUNTIME_EVENTS] = control_row, [MODWERK_EV_USB_FRAME - RUNTIME_EVENTS] = frame_row};
#include "usb_function.c"
const struct uf_base_configuration modwerk_cfg_native = {
    MODWERK_USB_CFG_BYTES, MODWERK_USB_CFG_INTERFACES,
#ifdef MODWERK_USB_AUDIO_LINKED
    1
#else
    0
#endif
};
#undef modwerk_runtime_event_row

/* An audio-like function: an association over interfaces 4 and 5, a control interface, a streaming interface with
 * two alternate settings and an IN endpoint 3. */
static const uint8_t block[] = {
    8, 11, 4, 2, 1, 0, 0x20, 0,
    9, 4, 4, 0, 0, 1, 1, 0x20, 0,
    9, 0x24, 1, 0, 2, 4, 9, 0, 0,
    9, 4, 5, 0, 0, 1, 2, 0x20, 0,
    9, 4, 5, 1, 1, 1, 2, 0x20, 0,
    7, 5, 0x83, 5, 0x40, 0, 1,
};
#define BLOCK (sizeof block)
static uint8_t other[4][BLOCK];
static struct modwerk_usb_function function;

/* A package image as the loader's admission sees it: the 32-byte record, then the four blocks. */
#define RECORD_AT 8u
#define BLOCKS_AT 64u
static uint8_t image[BLOCKS_AT + 4u * BLOCK + 8u];
static void put32(uint8_t *p, uint32_t v) { p[0] = (uint8_t)(v >> 24), p[1] = (uint8_t)(v >> 16), p[2] = (uint8_t)(v >> 8), p[3] = (uint8_t)v; }
static void put16(uint8_t *p, unsigned v) { p[0] = (uint8_t)(v >> 8), p[1] = (uint8_t)v; }
static void package(uint32_t base)
{
    memset(image, 0, sizeof image);
    uint8_t *r = image + RECORD_AT;
    put32(r, MODWERK_USB_FUNCTION_ABI), put32(r + 4, 32u), put16(r + 8, 2u), put16(r + 10, BLOCK), put32(r + 12, 0x00080000u);
    for (unsigned k = 0; k < 4u; ++k) {
        put32(r + 16u + 4u * k, base + BLOCKS_AT + k * BLOCK);
        memcpy(image + BLOCKS_AT + k * BLOCK, block, BLOCK);
    }
}
static struct runtime_dsp candidate(void)
{
    struct runtime_dsp d;
    memset(&d, 0, sizeof d);
    for (unsigned e = 0; e < RUNTIME_HOOKS; ++e) d.hook_offset[e] = RUNTIME_NONE;
    d.present = 1, d.image = image, d.image_bytes = sizeof image, d.hook_offset[MODWERK_OT_USB_FUNCTIONS] = RECORD_AT;
    return d;
}
static int admit(unsigned operation) { struct runtime_dsp d = candidate(); return modwerk_usb_function_admit(&d, operation); }

static void admission(void)
{
    struct runtime_dsp d = candidate();
    d.hook_offset[MODWERK_OT_USB_FUNCTIONS] = RUNTIME_NONE;
    CHECK(modwerk_usb_function_admit(&d, RUNTIME_METADATA_PREPARE) == RUNTIME_OK); /* no function: not this check's */
    d = candidate(), d.present = 0;
    CHECK(modwerk_usb_function_admit(&d, RUNTIME_METADATA_PREPARE) == RUNTIME_OK); /* a removal */
    package(0);
#ifdef MODWERK_USB_AUDIO_LINKED /* a base that links USB Audio in: its configuration has no room for a function */
    CHECK(admit(RUNTIME_METADATA_PREPARE) == RUNTIME_CONFLICT);
    package(0x40300000u);
    CHECK(admit(RUNTIME_METADATA_SWITCH) == RUNTIME_CONFLICT);
    return;
#endif
    CHECK(admit(RUNTIME_METADATA_PREPARE) == RUNTIME_OK);
    CHECK(admit(RUNTIME_METADATA_SWITCH) == RUNTIME_MALFORMED); /* offsets are not addresses once it is relocated */
    CHECK(admit(0) == RUNTIME_MALFORMED);
    package(0x40300000u);
    CHECK(admit(RUNTIME_METADATA_SWITCH) == RUNTIME_OK);
    CHECK(admit(RUNTIME_METADATA_PREPARE) == RUNTIME_MALFORMED);
#define REFUSED(change) do { package(0); change; CHECK(admit(RUNTIME_METADATA_PREPARE) == RUNTIME_MALFORMED); } while (0)
    uint8_t *r = image + RECORD_AT, *b = image + BLOCKS_AT;
    REFUSED(put32(r, 2u));                         /* another ABI */
    REFUSED(put32(r + 4, 28u));                    /* another record size */
    REFUSED(put16(r + 8, 0u));                     /* no interface */
    REFUSED(put16(r + 8, 5u));                     /* more than four */
    REFUSED(put16(r + 8, 3u));                     /* an interface it declares and never describes */
    REFUSED(put16(r + 10, 8u));                    /* too short for one interface */
    REFUSED(put16(r + 10, 512u - MODWERK_USB_CFG_BYTES + 1u)); /* past the slot */
    REFUSED(put32(r + 12, 0u));                    /* no endpoint */
    REFUSED(put32(r + 12, 0x00040000u));           /* endpoint 2 is USB MIDI's */
    REFUSED(put32(r + 12, 0x00080001u));           /* the control endpoint */
    REFUSED(put32(r + 16, sizeof image - BLOCK + 1u)); /* a block that leaves the image */
    REFUSED(put32(r + 28, 0xfffffff0u));
    REFUSED(b[0] = 1);                             /* a descriptor shorter than its header */
    REFUSED(b[BLOCK - 7u] = 9);                    /* the last one runs past the block */
    REFUSED(b[1] = 2);                             /* a configuration descriptor is the base's */
    REFUSED(b[2] = 3);                             /* the association starts on USB MIDI's interface */
    REFUSED(b[3] = 3);                             /* and reaches past its own */
    REFUSED(b[8 + 2] = 3);                         /* an interface of the base's */
    REFUSED(b[8 + 9 + 9 + 2] = 6);                 /* an interface past its count */
    REFUSED(b[BLOCK - 5u] = 0x82);                 /* USB MIDI's endpoint */
    REFUSED(b[2u * BLOCK + 8u + 2u] = 2);          /* every block is checked, the third too */
    d = candidate(), d.image_bytes = RECORD_AT + 31u;
    CHECK(modwerk_usb_function_admit(&d, RUNTIME_METADATA_PREPARE) == RUNTIME_MALFORMED); /* a cut record */
    d = candidate(), d.hook_offset[MODWERK_OT_USB_FUNCTIONS] = RECORD_AT + 1u;
    CHECK(modwerk_usb_function_admit(&d, RUNTIME_METADATA_PREPARE) == RUNTIME_MALFORMED); /* an odd offset */
}

static void profile_admission(void)
{
    uint8_t bytes[BLOCKS_AT + 8u * BLOCK];
    struct runtime_dsp d = candidate();
    d.image = bytes;
    d.image_bytes = sizeof bytes;
    for (unsigned relocated = 0; relocated <= 1; ++relocated) {
        uint32_t base = relocated ? UF_IMAGE_ADDRESS(bytes) : 0;
        unsigned operation = relocated ? RUNTIME_METADATA_SWITCH : RUNTIME_METADATA_PREPARE;
        package(base);
        memcpy(bytes,image,BLOCKS_AT);
        uint8_t *record = bytes+RECORD_AT;
        put32(record,MODWERK_USB_PROFILES_ABI); put32(record+4,36); put16(record+32,2);
        record[34] = 1; record[35] = 0;
        for (unsigned k=0; k<4; ++k) {
            put32(record+16+4*k,base+BLOCKS_AT+2*k*BLOCK);
            memcpy(bytes+BLOCKS_AT+2*k*BLOCK,block,BLOCK);
            memcpy(bytes+BLOCKS_AT+(2*k+1)*BLOCK,block,BLOCK);
        }
        CHECK(modwerk_usb_function_admit(&d,operation) == RUNTIME_OK);
        record[34] = 2;
        CHECK(modwerk_usb_function_admit(&d,operation) == RUNTIME_MALFORMED);
        record[34] = 0;
        --d.image_bytes;
        CHECK(modwerk_usb_function_admit(&d,operation) == RUNTIME_MALFORMED);
        ++d.image_bytes;
        bytes[BLOCKS_AT+7*BLOCK] = 1;
        CHECK(modwerk_usb_function_admit(&d,operation) == RUNTIME_MALFORMED);
    }
}

/* The high-speed function exposes a third streaming interface with EP3 OUT. */
static const uint8_t input_desc[] = {
    9, 4, 6, 0, 0, 1, 2, 0x20, 0,
    9, 4, 6, 1, 1, 1, 2, 0x20, 0,
    7, 5, 0x03, 5, 96, 0, 2,
};
#define TABLE_AT 64u
#define SPEED_BLOCKS_AT (TABLE_AT + 8u * UF_BLOCK_RECORD)
#define DUPLEX_LEN (BLOCK + sizeof input_desc)

static void speed_package(uint8_t *bytes, uint32_t base)
{
    memset(bytes, 0, SPEED_BLOCKS_AT + BLOCK + DUPLEX_LEN);
    uint8_t *record = bytes + RECORD_AT;
    put32(record, MODWERK_USB_SPEED_PROFILES_ABI);
    put32(record + 4, UF_PROFILE_RECORD);
    put32(record + 12, UF_ENDPOINTS);
    put16(record + 32, 2);
    record[34] = 1;
    memcpy(bytes + SPEED_BLOCKS_AT, block, BLOCK);
    uint8_t *duplex = bytes + SPEED_BLOCKS_AT + BLOCK;
    memcpy(duplex, block, BLOCK);
    duplex[3] = 3;
    memcpy(duplex + BLOCK, input_desc, sizeof input_desc);
    for (unsigned k = 0; k < 4u; ++k) {
        unsigned table = TABLE_AT + 2u * k * UF_BLOCK_RECORD;
        put32(record + 16u + 4u * k, base + table);
        for (unsigned i = 0; i < 2u; ++i) {
            uint8_t *entry = bytes + table + i * UF_BLOCK_RECORD;
            unsigned duplex_at_speed = i && (k & 1u);
            put16(entry, duplex_at_speed ? 3u : 2u);
            put16(entry + 2, duplex_at_speed ? DUPLEX_LEN : BLOCK);
            put32(entry + 4, base + SPEED_BLOCKS_AT + (duplex_at_speed ? BLOCK : 0u));
        }
    }
}

static void speed_admission(void)
{
    uint8_t bytes[SPEED_BLOCKS_AT + BLOCK + DUPLEX_LEN];
    struct runtime_dsp d = candidate();
    d.image = bytes;
    d.image_bytes = sizeof bytes;
    for (unsigned relocated = 0; relocated < 2u; ++relocated) {
        uint32_t base = relocated ? UF_IMAGE_ADDRESS(bytes) : 0;
        unsigned operation = relocated ? RUNTIME_METADATA_SWITCH : RUNTIME_METADATA_PREPARE;
        uint8_t *r = bytes + RECORD_AT;
        uint8_t *other_hs = bytes + TABLE_AT + 7u * UF_BLOCK_RECORD;
#define BAD_SPEED(change) do { speed_package(bytes, base); change; \
        CHECK(modwerk_usb_function_admit(&d, operation) == RUNTIME_MALFORMED); } while (0)
        speed_package(bytes, base);
        CHECK(modwerk_usb_function_admit(&d, operation) == RUNTIME_OK);
        BAD_SPEED(put32(r + 12, 0x00080000u)); /* The high-speed OUT endpoint must be retired at switch. */
        BAD_SPEED(put32(r + 16, base + TABLE_AT + 1u));
        BAD_SPEED(put16(r + 8, 2u));
        BAD_SPEED(put16(r + 32, MODWERK_USB_SPEED_PROFILES_MAX + 1u));
        BAD_SPEED(r[35] = 2u);
        BAD_SPEED(put16(other_hs + 2, DUPLEX_LEN - 1u));
        BAD_SPEED(put32(other_hs + 4, base + sizeof bytes - DUPLEX_LEN + 1u));
#undef BAD_SPEED
    }
}

static void speed_compose(void)
{
    struct modwerk_usb_profile_block ordinary = {2u, BLOCK, block};
    uint8_t full[2 * BLOCK], duplex[DUPLEX_LEN];
    memcpy(full, block, BLOCK);
    memcpy(full + BLOCK, block, BLOCK);
    memcpy(duplex, block, BLOCK);
    duplex[3] = 3;
    memcpy(duplex + BLOCK, input_desc, sizeof input_desc);
    struct modwerk_usb_profile_block fs[] = {ordinary, {2u, BLOCK, full + BLOCK}};
    struct modwerk_usb_profile_block hs[] = {ordinary, {3u, DUPLEX_LEN, duplex}};
    struct modwerk_usb_profiles profiles = {
        {MODWERK_USB_SPEED_PROFILES_ABI, UF_PROFILE_RECORD, 0, 0, UF_ENDPOINTS,
         (const uint8_t *)fs, (const uint8_t *)hs, (const uint8_t *)fs, (const uint8_t *)hs}, 2, 1, 0
    };
    function_row[0] = (uintptr_t)&profiles;
    modwerk_usb_functions_changed();
    uf_compose();
    CHECK(profiles.active == 1);
    CHECK(modwerk_cfg_len_fs == MODWERK_USB_CFG_BYTES + BLOCK);
    CHECK(modwerk_cfg_len_hs == MODWERK_USB_CFG_BYTES + DUPLEX_LEN);
    CHECK(modwerk_cfg_fs[4] == MODWERK_USB_CFG_INTERFACES + 2u);
    CHECK(modwerk_cfg_hs[4] == MODWERK_USB_CFG_INTERFACES + 3u);
    CHECK(modwerk_cfg_os_fs[2] == modwerk_cfg_fs[2] && modwerk_cfg_os_fs[4] == modwerk_cfg_fs[4]);
    CHECK(modwerk_cfg_os_hs[2] == modwerk_cfg_hs[2] && modwerk_cfg_os_hs[4] == modwerk_cfg_hs[4]);
    CHECK(!memcmp(modwerk_cfg_hs + MODWERK_USB_CFG_BYTES, duplex, sizeof duplex));
    CHECK(!memcmp(modwerk_cfg_fs + MODWERK_USB_CFG_BYTES, block, BLOCK));
    profiles.requested = 0;
    uf_compose();
    CHECK(profiles.active == 0);
    CHECK(modwerk_cfg_len_fs == modwerk_cfg_len_hs && modwerk_cfg_hs[4] == modwerk_cfg_fs[4]);
    function_row[0] = 0;
    modwerk_usb_functions_changed();
    uf_compose();
    CHECK(modwerk_cfg_len_fs == MODWERK_USB_CFG_BYTES && modwerk_cfg_len_hs == MODWERK_USB_CFG_BYTES);
}

static unsigned status(unsigned k) { uint8_t out[8]; CHECK(modwerk_usb_function_status(out) == 8u); return out[k]; }
static unsigned ticks(unsigned n, int quiet) { unsigned lapsed = 0; while (n--) lapsed += (unsigned)modwerk_usb_function_tick(quiet); return lapsed; }
static int attached(void) { return (int)(UF_REG(USBCMD) & 1u); }
static void base_slots(void)
{
    uint8_t *const slot[4] = {modwerk_cfg_fs, modwerk_cfg_hs, modwerk_cfg_os_fs, modwerk_cfg_os_hs};
    for (unsigned k = 0; k < 4u; ++k) {
        memset(slot[k], 0, 512), memset(slot[k], 0xb0 + (int)k, MODWERK_USB_CFG_BYTES);
        slot[k][2] = MODWERK_USB_CFG_BYTES, slot[k][3] = 0, slot[k][4] = MODWERK_USB_CFG_INTERFACES;
    }
}
static void describes(int with)
{
    uint8_t *const slot[4] = {modwerk_cfg_fs, modwerk_cfg_hs, modwerk_cfg_os_fs, modwerk_cfg_os_hs};
    unsigned total = MODWERK_USB_CFG_BYTES + (with ? BLOCK : 0u);
    CHECK(modwerk_cfg_len_fs == total && modwerk_cfg_len_hs == total);
    for (unsigned k = 0; k < 4u; ++k) {
        CHECK(slot[k][2] == (uint8_t)total && slot[k][3] == (uint8_t)(total >> 8));
        CHECK(slot[k][4] == MODWERK_USB_CFG_INTERFACES + (with ? 2u : 0u));
        CHECK(slot[k][0] == 0xb0 + k && slot[k][MODWERK_USB_CFG_BYTES - 1u] == 0xb0 + k); /* the base's part stays */
        if (with) CHECK(!memcmp(slot[k] + MODWERK_USB_CFG_BYTES, other[k], BLOCK));
    }
}
/* The host is back: its bus reset, then a request on the vendor interface. */
static void back(void) { modwerk_usb_function_bus_end(); modwerk_usb_function_host(); }
static void arrive(void) { function_row[0] = (uintptr_t)&function; modwerk_usb_functions_changed(); }
static void leave(void) { function_row[0] = 0; modwerk_usb_functions_changed(); }

int main(void)
{
    admission();
    if (!modwerk_cfg_native.audio_linked) {
        profile_admission();
        speed_admission();
    }
#ifdef MODWERK_USB_AUDIO_LINKED
    if (failures) return 1;
    puts("usb function: a base with USB Audio linked in refuses every function");
    return 0;
#endif

    for (unsigned k = 0; k < 4u; ++k) { memcpy(other[k], block, BLOCK); other[k][BLOCK - 3u] = (uint8_t)(0x40u + k); }
    function = (struct modwerk_usb_function){MODWERK_USB_FUNCTION_ABI, 32u, 2u, BLOCK, 0x00080000u, other[0], other[1], other[2], other[3]};
    base_slots();
    UF_REG(USBCMD) = 0x00080001u, UF_REG(CTRL3) = 0x00880000u, stock_state = 11u;

    /* Nothing contributed: nothing happens, however long. */
    CHECK(!ticks(5000, 1) && attached() && !status(0) && !status(1) && !status(2) && !status(3) && !bus_ends);
    modwerk_usb_functions_changed(); /* another table changed */
    CHECK(!status(0) && !ticks(100, 1) && attached());

    /* A function arrives: a second of grace, an idle control endpoint, then off the bus with the slots rewritten. */
    arrive();
    CHECK(status(0) == 1u && !status(1) && status(2) == 1u && !UF_REG(FLUSH)); /* due; nothing to retire */
    CHECK(!ticks(61, 1) && attached());                 /* the grace second: the host reads the sync's result */
    stock_state = 5u;                                   /* a control transfer is under way */
    CHECK(!ticks(20, 1) && attached() && !modwerk_usb_reconnecting());
    stock_state = 11u, UF_REG(SETUPSTAT) = 1u;          /* a SETUP stock has not read */
    CHECK(!ticks(20, 1) && attached());
    UF_REG(SETUPSTAT) = 0, UF_REG(STAT) = 0x00010000u;  /* the control endpoint primed */
    CHECK(!ticks(20, 1) && attached());
    UF_REG(STAT) = 0x00080000u;                         /* another endpoint's traffic does not hold it */
    CHECK(!ticks(20, 0) && attached());                 /* the base's own vendor data stage does */
    CHECK(!ticks(1, 1) && !attached() && bus_ends == 1u && modwerk_usb_reconnecting() && status(0) == 2u);
    describes(1);
    CHECK(status(1) == 1u && UF_REG(USBCMD) == 0x00080000u); /* only run/stop changed */
    CHECK(!ticks(30, 1) && !attached());                /* half a second off the bus */
    CHECK(!ticks(1, 1) && attached() && status(0) == 3u && status(3) == 1u && modwerk_usb_reconnecting());
    CHECK(!ticks(500, 1) && modwerk_usb_reconnecting()); /* the host enumerates and the site opens the unit again */
    modwerk_usb_function_host();                        /* a request before the host reset the bus: not back yet */
    CHECK(modwerk_usb_reconnecting() && status(0) == 3u);
    back();
    CHECK(!modwerk_usb_reconnecting() && !status(0) && !ticks(5000, 1) && attached() && bus_ends == 2u && !status(4));
    modwerk_usb_function_bus_end();                     /* a reset once it is settled is the host's own */
    CHECK(!modwerk_usb_reconnecting() && bus_ends == 3u);
    modwerk_usb_functions_changed();                    /* another module's table: the function stayed */
    CHECK(!status(0) && !UF_REG(FLUSH));

    /* It leaves: its endpoint is flushed and disabled at the switch; the reconnect takes it out of the slots. A host
     * that never reaches the vendor interface again counts as unplugged, once. */
    leave();
    CHECK(UF_REG(FLUSH) == 0x00080000u && UF_REG(CTRL3) == 0x00080000u && UF_REG(COMPLETE) == 0x00080000u);
    CHECK(status(0) == 1u && status(1) == 1u && !status(2)); /* the host still sees it until the reconnect */
    describes(1);
    UF_REG(FLUSH) = 0, UF_REG(COMPLETE) = 0;
    CHECK(!ticks(62, 1) && !attached() && bus_ends == 4u);
    describes(0);
    CHECK(!status(1) && !ticks(31, 1) && attached() && status(3) == 2u);
    modwerk_usb_function_bus_end();                     /* the host reset the bus and never spoke to the base */
    CHECK(!ticks(1199, 1) && modwerk_usb_reconnecting());
    CHECK(ticks(1, 1) == 1u && !modwerk_usb_reconnecting() && !status(0));
    CHECK(!ticks(5000, 1));

    /* It came and went before the host saw it: no reconnect, but its endpoint is still retired. */
    arrive(), ticks(30, 1), leave();
    CHECK(UF_REG(FLUSH) == 0x00080000u);
    UF_REG(FLUSH) = 0, UF_REG(COMPLETE) = 0;
    CHECK(!ticks(5000, 1) && attached() && status(3) == 2u && !status(0) && bus_ends == 5u);
    describes(0);

    /* USB DISK MODE holds a reconnect back for as long as it is open. */
    usb_disk = 1, arrive();
    CHECK(!ticks(20000, 1) && attached() && status(0) == 1u && !status(4));
    usb_disk = 0;
    CHECK(!ticks(1, 1) && !attached());
    describes(1);
    CHECK(!ticks(31, 1) && attached());
    back();
    CHECK(!modwerk_usb_reconnecting());

    /* A replaced module (another image) is a function that left and one that arrived: retired, then a reconnect. */
    static struct modwerk_usb_function update;
    update = function;
    function_row[0] = (uintptr_t)&update, modwerk_usb_functions_changed();
    CHECK(UF_REG(FLUSH) == 0x00080000u && status(0) == 1u && status(2) == 1u);
    UF_REG(FLUSH) = 0, UF_REG(COMPLETE) = 0;

    /* A control endpoint that never idles is waited for ten seconds, then not. */
    stock_awaited = 1u;
    CHECK(!ticks(61 + 600, 1) && attached() && !status(4));
    CHECK(!ticks(1, 1) && !attached() && status(4) == 1u);
    describes(1);
    stock_awaited = 0;
    CHECK(!ticks(31, 1) && attached() && status(3) == 4u);
    back();
    CHECK(!modwerk_usb_reconnecting());

    /* The interrupt's hooks pass through; a function's answer to a class request reaches ep0.c. */
    modwerk_usb_function_isr(), modwerk_usb_function_bus_end();
    CHECK(isrs == 1u && bus_ends == 10u && !modwerk_usb_function_control() && controls == 1u);
    answer = 1u;
    CHECK(modwerk_usb_function_control() == 1u && !locked);
    control_row[1] = H_CONTROL_OTHER;                   /* every handler runs, the answers OR'd */
    CHECK(modwerk_usb_function_control() == 5u && controls == 3u && others == 1u);
    isr_row[0] = 0;                                     /* nobody subscribes: nothing is called */
    modwerk_usb_function_isr();
    CHECK(isrs == 1u);
    modwerk_usb_function_frame(), modwerk_usb_function_frame();  /* the frame interrupt's block */
    CHECK(frames == 2u && isrs == 1u && !locked);
    /* A format selected on the panel changes both descriptors and the producer
     * only while detached. A class-only host can finish this reconnect. */
    static uint8_t choices[2][BLOCK];
    memcpy(choices[0], block, BLOCK);
    memcpy(choices[1], block, BLOCK);
    choices[1][BLOCK-3] = 96u;
    struct modwerk_usb_profiles profiles = {
        {MODWERK_USB_PROFILES_ABI,36,2,BLOCK,0x80000u,choices[0],choices[0],choices[0],choices[0]}, 2,0,0};
    function_row[0] = (uintptr_t)&profiles;
    modwerk_usb_functions_changed();
    stock_state = 11u; UF_REG(FLUSH) = UF_REG(COMPLETE) = UF_REG(STAT) = UF_REG(SETUPSTAT) = 0;
    ticks(100,1); back();
    profiles.requested = 1;
    stopped = 0;
    ticks(2000,1);
    CHECK(attached() && profiles.active == 0 && status(0) == 1u);
    stopped = 1;
    ticks(1,1);
    CHECK(!attached() && profiles.active == 1 && !memcmp(modwerk_cfg_hs+MODWERK_USB_CFG_BYTES,choices[1],BLOCK));
    ticks(31,1);
    answer = 1; control_row[0] = H_CONTROL;
    modwerk_usb_function_bus_end(); modwerk_usb_function_control();
    CHECK(attached() && !status(0) && !ticks(1300,1));

    /* A host can reset during the disconnect. If the UI tick then stalls while audio
     * frames run, the prepared original configuration must still come back on USB. */
    leave();
    UF_REG(FLUSH) = UF_REG(COMPLETE) = 0;
    ticks(62, 1);
    CHECK(!attached() && status(0) == 2u);
    unsigned prior_reconnects = status(3);
    modwerk_usb_function_bus_end();
    for (unsigned n = 0; n < 2756u; ++n) modwerk_usb_function_frame();
    CHECK(!attached());
    modwerk_usb_function_frame();
    CHECK(attached() && status(0) == 3u && status(3) == prior_reconnects + 1u);
    describes(0);
    modwerk_usb_function_host(); /* The reset before reattachment cannot settle it. */
    CHECK(status(0) == 3u);
    modwerk_usb_function_bus_end();
    modwerk_usb_function_host();
    CHECK(!status(0) && !ticks(1300, 1) && status(3) == prior_reconnects + 1u);

    /* A valid cable session and a run command do not prove physical attachment.
     * Check the same installation against each link status. A second attach
     * must keep the original deadline and the already published descriptors. */
    struct link_case { unsigned session, port; int retry; } cases[] = {
        {0x800, 0, 1}, {0, 0, 0}, {0x800, 1, 0}, {0x800, 0x100, 0}, {0x800, 0x80, 0}
    };
    for (unsigned k = 0; k < sizeof cases / sizeof cases[0]; ++k) {
        UF_REG(OTGSC) = cases[k].session;
        UF_REG(PORTSC1) = cases[k].port;
        arrive();
        CHECK(!ticks(62 + 31, 1) && attached() && status(0) == 3u);
        unsigned first_attach = status(3);
        CHECK(!ticks(180, 1));
        CHECK(attached() == !cases[k].retry);
        CHECK(!ticks(31, 1) && attached());
        CHECK(status(3) == first_attach + (unsigned)cases[k].retry);
        describes(1);
        CHECK(!ticks(1200 - 211 - 1, 1) && ticks(1, 1) == 1u);
        CHECK(!status(0) && status(3) == first_attach + (unsigned)cases[k].retry);
        leave();
        UF_REG(FLUSH) = UF_REG(COMPLETE) = 0;
        CHECK(!ticks(62 + 31, 1) && attached());
        back();
    }

    /* With the cable still powered, a successful second attachment settles
     * the existing trial. Do not treat the remaining lease as a disconnect. */
    UF_REG(OTGSC) = 0x800;
    UF_REG(PORTSC1) = 0;
    arrive();
    CHECK(!ticks(62 + 31 + 180, 1) && !attached());
    CHECK(!ticks(31, 1) && attached());
    UF_REG(PORTSC1) = 1u;
    back();
    CHECK(!status(0) && !ticks(1200, 1));
    describes(1);

    if (failures) return 1;
    speed_compose();
    puts("usb function: admission, slots, reconnect and its holds pass");
    return 0;
}
