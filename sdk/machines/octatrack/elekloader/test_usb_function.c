/* SPDX-License-Identifier: GPL-3.0-or-later
 * Host check of the USB function a module contributes (usb_function.c) over a model of the controller's registers:
 * admission takes a whole, in-range record and refuses every other; a function that arrives is put behind the base's
 * own configuration only while the unit is off the bus, after the grace second and an idle control endpoint; one
 * that leaves has its endpoint flushed and disabled at the switch; USB DISK MODE holds a reconnect back for as long
 * as it is open; a control endpoint that never idles is not waited for past ten seconds; a host that does not come
 * back counts as unplugged once. No stock byte is used. */
#define MW_HOST
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
static unsigned failures;
#define CHECK(x) do { if (!(x)) { failures++; fprintf(stderr, "%s:%d: %s\n", __FILE__, __LINE__, #x); } } while (0)

#define USBCMD 0xfc0b0140u
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
const unsigned char modwerk_raise_ev_usb_isr[1], modwerk_raise_ev_usb_bus_end[1], modwerk_raise_ev_usb_control[1];
static unsigned isrs, bus_ends, controls, answer;
static unsigned host_raise(const unsigned char *entry)
{
    if (entry == modwerk_raise_ev_usb_isr) return ++isrs, 0u;
    if (entry == modwerk_raise_ev_usb_bus_end) return ++bus_ends, 0u;
    CHECK(entry == modwerk_raise_ev_usb_control);
    return ++controls, answer;
}
#define UF_RAISE(entry) host_raise(entry)
static int locked, usb_disk;
uint32_t modwerk_machine_lock(void) { CHECK(!locked); locked = 1; return 4; }
void modwerk_machine_unlock(uint32_t s) { CHECK(locked && s == 4); locked = 0; }
int modwerk_machine_usb_disk(void) { return usb_disk; }
uint8_t modwerk_cfg_fs[512], modwerk_cfg_hs[512], modwerk_cfg_os_fs[512], modwerk_cfg_os_hs[512];
volatile uint32_t modwerk_cfg_len = MODWERK_USB_CFG_BYTES;
static uintptr_t volatile function_row[2];
#define modwerk_runtime_event_row host_rows
static uintptr_t volatile *const host_rows[RUNTIME_SITE_EVENTS] = {[MODWERK_OT_USB_FUNCTIONS - RUNTIME_EVENTS] = function_row};
#include "usb_function.c"
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
    CHECK(modwerk_cfg_len == total);
    for (unsigned k = 0; k < 4u; ++k) {
        CHECK(slot[k][2] == (uint8_t)total && slot[k][3] == (uint8_t)(total >> 8));
        CHECK(slot[k][4] == MODWERK_USB_CFG_INTERFACES + (with ? 2u : 0u));
        CHECK(slot[k][0] == 0xb0 + k && slot[k][MODWERK_USB_CFG_BYTES - 1u] == 0xb0 + k); /* the base's part stays */
        if (with) CHECK(!memcmp(slot[k] + MODWERK_USB_CFG_BYTES, other[k], BLOCK));
    }
}
static void arrive(void) { function_row[0] = (uintptr_t)&function; modwerk_usb_functions_changed(); }
static void leave(void) { function_row[0] = 0; modwerk_usb_functions_changed(); }

int main(void)
{
    admission();

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
    modwerk_usb_function_host();
    CHECK(!modwerk_usb_reconnecting() && !status(0) && !ticks(5000, 1) && attached() && bus_ends == 1u && !status(4));
    modwerk_usb_functions_changed();                    /* another module's table: the function stayed */
    CHECK(!status(0) && !UF_REG(FLUSH));

    /* It leaves: its endpoint is flushed and disabled at the switch; the reconnect takes it out of the slots. A host
     * that never reaches the vendor interface again counts as unplugged, once. */
    leave();
    CHECK(UF_REG(FLUSH) == 0x00080000u && UF_REG(CTRL3) == 0x00080000u && UF_REG(COMPLETE) == 0x00080000u);
    CHECK(status(0) == 1u && status(1) == 1u && !status(2)); /* the host still sees it until the reconnect */
    describes(1);
    UF_REG(FLUSH) = 0, UF_REG(COMPLETE) = 0;
    CHECK(!ticks(62, 1) && !attached() && bus_ends == 2u);
    describes(0);
    CHECK(!status(1) && !ticks(31, 1) && attached() && status(3) == 2u);
    CHECK(!ticks(1199, 1) && modwerk_usb_reconnecting());
    CHECK(ticks(1, 1) == 1u && !modwerk_usb_reconnecting() && !status(0));
    CHECK(!ticks(5000, 1));

    /* It came and went before the host saw it: no reconnect, but its endpoint is still retired. */
    arrive(), ticks(30, 1), leave();
    CHECK(UF_REG(FLUSH) == 0x00080000u);
    UF_REG(FLUSH) = 0, UF_REG(COMPLETE) = 0;
    CHECK(!ticks(5000, 1) && attached() && status(3) == 2u && !status(0) && bus_ends == 2u);
    describes(0);

    /* USB DISK MODE holds a reconnect back for as long as it is open. */
    usb_disk = 1, arrive();
    CHECK(!ticks(20000, 1) && attached() && status(0) == 1u && !status(4));
    usb_disk = 0;
    CHECK(!ticks(1, 1) && !attached());
    describes(1);
    CHECK(!ticks(31, 1) && attached());
    modwerk_usb_function_host();

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
    modwerk_usb_function_host();

    /* The interrupt's hooks pass through; a function's answer to a class request reaches ep0.c. */
    modwerk_usb_function_isr(), modwerk_usb_function_bus_end();
    CHECK(isrs == 1u && bus_ends == 5u && !modwerk_usb_function_control() && controls == 1u);
    answer = 1u;
    CHECK(modwerk_usb_function_control() == 1u && !locked);
    if (failures) return 1;
    puts("usb function: admission, slots, reconnect and its holds pass");
    return 0;
}
