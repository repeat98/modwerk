/* SPDX-License-Identifier: GPL-3.0-or-later
 * The USB function a module adds to the base's configuration: events.json's ot_usb_functions table.
 *
 * The configuration descriptors a host reads live in four 512-byte slots (usb_base.s: modwerk_cfg_fs and the
 * others, each inside one 4 KiB page, as stock's usb_ep0_send needs). A slot holds the base's own functions (mass
 * storage, the vendor interface, USB MIDI: MODWERK_USB_CFG_BYTES bytes, MODWERK_USB_CFG_INTERFACES interfaces) and,
 * behind them, the contributed function's block. A host reads descriptors only when it enumerates, so a change of
 * the table ends in a reconnect the base makes itself:
 *
 *   the switch (masked)  a function that leaves has its endpoint flushed and disabled: the controller must not
 *                        keep transfer descriptors in memory the pool may hand out again
 *   WAIT (tick)  a second for the host to read the sync's result, then until the control endpoint is idle, no
 *                vendor data stage is open and stock's USB DISK MODE is closed. Then ev_usb_bus_end, USBCMD.RS off
 *                and, at once, the slots and their length rewritten: nothing reads them off the bus
 *   OFF (tick)   half a second off the bus, then RS on again
 *   BACK (tick)  the host resets the bus and enumerates. That reset is the base's own disconnect: ep0.c undoes
 *                no open sync or trial for it. The reconnect is over when the host, after a reset, reaches the
 *                vendor interface; without that for 20 s it counts as unplugged
 *
 * The base raises ev_usb_isr, ev_usb_bus_end, ev_usb_control and ev_usb_frame by walking their rows here, never through the
 * loader's dispatch code (runtime_events.s): the loader holds a switch back while any task's stack holds an address
 * inside that code, and the USB interrupt runs on whichever task it interrupts, so return addresses from there
 * would stay in stack memory and refuse every later removal (seen in the emulator: a rollback refused for good). The
 * walk is safe without that rule: a switch rewrites the rows masked and under the stable lock, which holds the USB
 * interrupt off, so no walk is ever paused part way through a row.
 *
 * A control endpoint that is not idle after ten seconds is not waited for: a pulled cable ends a transfer the same
 * way, and stock's bus reset clears it. The descriptors are copied into the slots; nothing here keeps a pointer
 * into a module past the switch that removes it. A base that links USB Audio in (a development twin) refuses every
 * function. Sys task (the tick) and the loader's masked switch; the controller's registers are written with the
 * USB interrupt held off. Stock addresses: OS 1.40C. */
#include <stdint.h>
#include "loader.h"
#include "modwerk_events.h"
#include "usb_function.h"

#ifndef MW_HOST /* test_usb_function.c maps these onto a model of the controller and of the unit's memory */
#include "usb_base.h" /* MODWERK_USB_CFG_BYTES, MODWERK_USB_CFG_INTERFACES: this base's own configuration */
#define UF_REG(a) (*(volatile uint32_t *)(uintptr_t)(a))
#define UF_UNCACHED(p) ((volatile uint8_t *)((uintptr_t)(p) + 0x08000000u))
#define UF_IMAGE_ADDRESS(p) ((uint32_t)(uintptr_t)(p))
#define UF_CALL(handler) (((unsigned (*)(void))(handler))())
#endif
int modwerk_machine_usb_disk(void); /* runtime.c: stock's USB DISK MODE is open */

#define UF_USBCMD 0xfc0b0140u      /* bit 0, run/stop: the pull-up */
#define UF_SETUPSTAT 0xfc0b01acu
#define UF_PRIME 0xfc0b01b0u
#define UF_FLUSH 0xfc0b01b4u
#define UF_STAT 0xfc0b01b8u
#define UF_COMPLETE 0xfc0b01bcu
#define UF_CTRL3 0xfc0b01ccu       /* ENDPTCTRL3: bit 7 enables OUT, bit 23 IN */
#define UF_EP0_STATE 0x460bb3ecu   /* stock's control transfer state: 11 idle */
#define UF_EP0_AWAITED 0x460bb3f4u /* stock waits for an OUT stage */

#ifdef MODWERK_USB_AUDIO_LINKED /* build_core.py: this base links USB Audio in (a development twin) */
#define UF_LINKED 1
#else
#define UF_LINKED 0
#endif
#define UF_TABLE (MODWERK_OT_USB_FUNCTIONS - RUNTIME_EVENTS)
#define UF_RECORD 32u
#define UF_SLOT 512u
#define UF_ROOM (UF_SLOT - MODWERK_USB_CFG_BYTES)
#define UF_ENDPOINTS 0x00080008u   /* endpoint 3, OUT and IN, as ENDPTFLUSH bits */
#define UF_GRACE 60u               /* ticks, 60 a second */
#define UF_PATIENCE 600u
#define UF_DOWN 30u
#define UF_LEASE 1200u
#define UF_FLUSH_SPINS 2000u

enum { UF_SETTLED, UF_WAIT, UF_OFF, UF_BACK };

extern uint8_t modwerk_cfg_fs[], modwerk_cfg_hs[], modwerk_cfg_os_fs[], modwerk_cfg_os_hs[];
extern volatile uint32_t modwerk_cfg_len;

/* Written masked at a switch, read by the tick with the USB interrupt held off (no switch runs then). */
static volatile uintptr_t row_record;   /* the function the table holds, 0 for none */
static volatile uint32_t row_endpoints; /* its endpoints */
static volatile uint32_t row_serial;    /* 0 for none; a new number for every function that arrives */
static volatile uint8_t dirty;
static uint32_t serials, live_serial;   /* live: the function the slots describe */
static uint8_t state, reconnects, forced;
static volatile uint8_t reset_seen; /* BACK: the host has reset the bus since the unit came back */
static uint16_t timer, waited;

/* Every handler of a hook the base raises, in the row's order (lower first, then module id); their answers OR'd.
 * From the USB or the frame interrupt, or with them held off. */
static unsigned uf_raise(unsigned hook)
{
    unsigned answer = 0;
    for (uintptr_t volatile *row = modwerk_runtime_event_row[hook - RUNTIME_EVENTS]; *row; ++row) answer |= UF_CALL(*row);
    return answer;
}

static uint32_t uf_word(const uint8_t *p)
{ return (uint32_t)p[0] << 24 | (uint32_t)p[1] << 16 | (uint32_t)p[2] << 8 | p[3]; }
static unsigned uf_half(const uint8_t *p) { return (unsigned)p[0] << 8 | p[1]; }

/* A function's block: whole descriptors, its interfaces numbered from the base's first free one, endpoint 3 only. */
static int uf_block(const uint8_t *p, unsigned length, unsigned interfaces)
{
    unsigned at = 0, seen = 0;
    while (at < length) {
        unsigned n = p[at];
        if (n < 2u || n > length - at) return 0;
        unsigned type = p[at + 1u];
        if (type == 2u || type == 7u || type == 1u) return 0; /* a configuration or device descriptor is the base's */
        if (type == 4u) {
            if (n < 9u || p[at + 2u] < MODWERK_USB_FUNCTION_INTERFACE ||
                p[at + 2u] >= MODWERK_USB_FUNCTION_INTERFACE + interfaces) return 0;
            seen |= 1u << (p[at + 2u] - MODWERK_USB_FUNCTION_INTERFACE);
        }
        if (type == 11u && (n != 8u || p[at + 2u] < MODWERK_USB_FUNCTION_INTERFACE || !p[at + 3u] ||
                            p[at + 2u] + p[at + 3u] > MODWERK_USB_FUNCTION_INTERFACE + interfaces)) return 0;
        if (type == 5u && (n < 7u || (p[at + 2u] & 0x0fu) != MODWERK_USB_FUNCTION_ENDPOINT)) return 0;
        at += n;
    }
    return seen == (1u << interfaces) - 1u;
}

int modwerk_usb_function_admit(const struct runtime_dsp *d, unsigned operation)
{
    if (!d || !d->present) return RUNTIME_OK;
    uint32_t at = d->hook_offset[MODWERK_OT_USB_FUNCTIONS];
    if (at == RUNTIME_NONE) return RUNTIME_OK;
    if (UF_LINKED) return RUNTIME_CONFLICT; /* its configuration already holds USB Audio, on these interfaces and this endpoint */
    if (operation != RUNTIME_METADATA_PREPARE && operation != RUNTIME_METADATA_SWITCH) return RUNTIME_MALFORMED;
    if (!d->image || (at & 1u) || at > d->image_bytes || d->image_bytes - at < UF_RECORD) return RUNTIME_MALFORMED;
    const uint8_t *record = d->image + at;
    unsigned interfaces = uf_half(record + 8), length = uf_half(record + 10);
    uint32_t endpoints = uf_word(record + 12);
    if (uf_word(record) != MODWERK_USB_FUNCTION_ABI || uf_word(record + 4) != UF_RECORD || interfaces < 1u ||
        interfaces > 4u || length < 9u || length > UF_ROOM || !endpoints || (endpoints & ~UF_ENDPOINTS))
        return RUNTIME_MALFORMED;
    /* PREPARE runs before relocation: the pointer words still hold image offsets (machine_contributors.c). */
    uint32_t base = operation == RUNTIME_METADATA_PREPARE ? 0u : UF_IMAGE_ADDRESS(d->image);
    for (unsigned k = 0; k < 4u; ++k) {
        uint32_t block = uf_word(record + 16u + 4u * k);
        if (block < base || block - base > d->image_bytes || d->image_bytes - (block - base) < length ||
            !uf_block(d->image + (block - base), length, interfaces)) return RUNTIME_MALFORMED;
    }
    return RUNTIME_OK;
}

/* Masked. The bits clear when the controller has let go of the queue; an endpoint that is then disabled is not
 * read again, whatever its transfer descriptors hold. */
static void uf_retire(uint32_t endpoints)
{
    UF_REG(UF_FLUSH) = endpoints;
    for (unsigned n = 0; (UF_REG(UF_FLUSH) & endpoints) && n < UF_FLUSH_SPINS; ++n) {}
    UF_REG(UF_CTRL3) = UF_REG(UF_CTRL3) & ~((endpoints & 0x00080000u ? 0x00800000u : 0u) | (endpoints & 8u ? 0x80u : 0u));
    UF_REG(UF_COMPLETE) = endpoints; /* write one to clear */
}

void modwerk_usb_functions_changed(void)
{
    uintptr_t record = *modwerk_runtime_event_row[UF_TABLE];
    if (record == row_record) return; /* another table changed: the function, or none, stayed */
    if (row_endpoints) uf_retire(row_endpoints);
    row_record = record;
    row_endpoints = record ? ((const struct modwerk_usb_function *)record)->endpoints & UF_ENDPOINTS : 0u;
    if (record && !++serials) ++serials;
    row_serial = record ? serials : 0u;
    dirty = 1;
}

static int uf_idle(void)
{
    return !((UF_REG(UF_PRIME) | UF_REG(UF_FLUSH) | UF_REG(UF_STAT) | UF_REG(UF_COMPLETE)) & 0x00010001u) &&
           !(UF_REG(UF_SETUPSTAT) & 1u) && UF_REG(UF_EP0_STATE) == 11u && !UF_REG(UF_EP0_AWAITED);
}

/* The USB interrupt held off and the unit off the bus. Through the uncached alias: the controller reads memory. */
static void uf_compose(void)
{
    const struct modwerk_usb_function *f = (const struct modwerk_usb_function *)row_record;
    uint8_t *const slot[4] = {modwerk_cfg_fs, modwerk_cfg_hs, modwerk_cfg_os_fs, modwerk_cfg_os_hs};
    const uint8_t *const block[4] = {f ? f->fs : 0, f ? f->hs : 0, f ? f->os_fs : 0, f ? f->os_hs : 0};
    unsigned length = f && f->length <= UF_ROOM ? f->length : 0u, interfaces = length ? f->interfaces : 0u;
    unsigned total = MODWERK_USB_CFG_BYTES + length;
    for (unsigned k = 0; k < 4u; ++k) {
        volatile uint8_t *to = UF_UNCACHED(slot[k]);
        to[2] = (uint8_t)total, to[3] = (uint8_t)(total >> 8);
        to[4] = (uint8_t)(MODWERK_USB_CFG_INTERFACES + interfaces);
        for (unsigned i = 0; i < length; ++i) to[MODWERK_USB_CFG_BYTES + i] = block[k][i];
    }
    modwerk_cfg_len = total;
    live_serial = length ? row_serial : 0u;
}

int modwerk_usb_function_tick(int quiet)
{
    uint32_t lock;
    switch (state) {
    case UF_SETTLED:
        if (!dirty) break;
        lock = modwerk_machine_lock();
        dirty = 0;
        if (row_serial != live_serial) state = UF_WAIT, timer = UF_GRACE, waited = 0;
        modwerk_machine_unlock(lock);
        break;
    case UF_WAIT:
        if (timer) { --timer; break; }
        if (modwerk_machine_usb_disk()) break; /* never under a mounted card, however long it stays */
        lock = modwerk_machine_lock();
        dirty = 0;
        if (row_serial == live_serial) state = UF_SETTLED; /* it came and went before the host saw it */
        else if ((quiet && uf_idle()) || waited >= UF_PATIENCE) {
            if (!(quiet && uf_idle())) ++forced;
            (void)uf_raise(MODWERK_EV_USB_BUS_END);
            UF_REG(UF_USBCMD) = UF_REG(UF_USBCMD) & ~1u;
            uf_compose();
            state = UF_OFF, timer = UF_DOWN;
        } else ++waited;
        modwerk_machine_unlock(lock);
        break;
    case UF_OFF:
        if (timer) { --timer; break; }
        lock = modwerk_machine_lock();
        UF_REG(UF_USBCMD) = UF_REG(UF_USBCMD) | 1u;
        modwerk_machine_unlock(lock);
        ++reconnects;
        reset_seen = 0;
        state = UF_BACK, timer = UF_LEASE;
        break;
    default:
        if (timer && --timer) break;
        state = UF_SETTLED;
        return 1; /* nobody reached the vendor interface: as unplugged */
    }
    return 0;
}

/* A request on the vendor interface before the bus reset is not the host coming back: a later reset would
 * otherwise count as a pulled cable and undo an open trial. */
void modwerk_usb_function_host(void) { if (state == UF_BACK && reset_seen) state = UF_SETTLED; }
int modwerk_usb_reconnecting(void) { return state == UF_OFF || state == UF_BACK; }
void modwerk_usb_function_isr(void) { (void)uf_raise(MODWERK_EV_USB_ISR); }
void modwerk_usb_function_bus_end(void)
{
    if (state == UF_BACK) reset_seen = 1;
    (void)uf_raise(MODWERK_EV_USB_BUS_END);
}
unsigned modwerk_usb_function_control(void) { return uf_raise(MODWERK_EV_USB_CONTROL); }
/* The frame interrupt's block (usb_base.s modwerk_usb_frame_shim), in a base that does not link USB Audio in. */
void modwerk_usb_function_frame(void) { (void)uf_raise(MODWERK_EV_USB_FRAME); }

unsigned modwerk_usb_function_status(uint8_t *out)
{
    out[0] = state == UF_SETTLED && dirty ? UF_WAIT : state;
    out[1] = live_serial != 0u;
    out[2] = row_serial != 0u;
    out[3] = reconnects, out[4] = forced;
    out[5] = out[6] = out[7] = 0;
    return MODWERK_USB_FUNCTION_STATUS_BYTES;
}
