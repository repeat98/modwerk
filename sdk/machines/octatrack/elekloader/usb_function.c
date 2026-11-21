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
 *   OFF (tick)   half a second off the bus, then RS on again. If the UI tick stops during the
 *                disconnect, the independent frame interrupt reconnects after one second.
 *   BACK (tick)  the host resets the bus and enumerates. That reset is the base's own disconnect: ep0.c undoes
 *                no open sync or trial for it. The reconnect is over when the host, after a reset, reaches the
 *                vendor interface. If the powered link still shows no attachment after three seconds, offer
 *                the same descriptors once more. The original 20-second host deadline still applies.
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
#define UF_REG(a) (*(volatile uint32_t *)(uintptr_t)(a))
#define UF_UNCACHED(p) ((volatile uint8_t *)((uintptr_t)(p) + 0x08000000u))
#define UF_IMAGE_ADDRESS(p) ((uint32_t)(uintptr_t)(p))
#define UF_CALL(handler) (((unsigned (*)(void))(handler))())
#endif
int modwerk_machine_stopped(void);
int modwerk_machine_usb_disk(void); /* runtime.c: stock's USB DISK MODE is open */

#define UF_USBCMD 0xfc0b0140u      /* bit 0, run/stop: the pull-up */
#define UF_PORTSC1 0xfc0b0184u
#define UF_OTGSC 0xfc0b01a4u
#define UF_SESSION_VALID 0x800u    /* OTGSC.BSV */
#define UF_PORT_ACTIVE 0x181u      /* PORTSC1.PR, SUSP or CCS, MCF54455RM section 10.3.4.14 */
#define UF_SETUPSTAT 0xfc0b01acu
#define UF_PRIME 0xfc0b01b0u
#define UF_FLUSH 0xfc0b01b4u
#define UF_STAT 0xfc0b01b8u
#define UF_COMPLETE 0xfc0b01bcu
#define UF_CTRL3 0xfc0b01ccu       /* ENDPTCTRL3: bit 7 enables OUT, bit 23 IN */
#define UF_EP0_STATE 0x460bb3ecu   /* stock's control transfer state: 11 idle */
#define UF_EP0_AWAITED 0x460bb3f4u /* stock waits for an OUT stage */

/* Generated alongside the descriptors in usb_base.s. Keep the layout-specific
 * values in the USB reserve so the shared code and all base-bound module
 * addresses are identical for the linked-audio and MIDI-only variants. */
struct uf_base_configuration { uint16_t bytes; uint8_t interfaces, audio_linked; };
extern const struct uf_base_configuration modwerk_cfg_native;
#define UF_TABLE (MODWERK_OT_USB_FUNCTIONS - RUNTIME_EVENTS)
/* ABI 3 uses modwerk_usb_profiles with zero interfaces/length in its header.
 * Its four pointers each address count entries of this type, one per profile.
 * Corresponding CONFIG and OTHER_SPEED entries must agree on size and count. */
#define MODWERK_USB_SPEED_PROFILES_ABI 3u
#define MODWERK_USB_SPEED_PROFILES_MAX 16u
struct modwerk_usb_profile_block {
    uint16_t interfaces, length;
    const uint8_t *descriptors;
};
/* The 40-byte input variant is admitted only by input-enabled development bases.
 * receive returns the staged length in 64-byte DMA minor loops, or zero. */
struct modwerk_usb_input_profiles {
    struct modwerk_usb_profiles profiles;
    unsigned (*receive)(void);
};


#define UF_RECORD 32u
#define UF_PROFILE_RECORD 36u
#define UF_INPUT_RECORD 40u
#define UF_BLOCK_RECORD 8u
#define UF_SLOT 512u
#define UF_ROOM (UF_SLOT - modwerk_cfg_native.bytes)
#define UF_ENDPOINTS 0x00080008u   /* endpoint 3, OUT and IN, as ENDPTFLUSH bits */
#define UF_GRACE 60u               /* ticks, 60 a second */
#define UF_PATIENCE 600u
#define UF_FRAME_TIMEOUT ((44100u + 15u) / 16u) /* one second in 16-sample blocks */
#define UF_DOWN 30u
#define UF_ATTACH_CHECK 180u       /* ticks after first asserting run/stop */
#define UF_LEASE 1200u
#define UF_FLUSH_SPINS 2000u

enum { UF_SETTLED, UF_WAIT, UF_OFF, UF_BACK };

extern uint8_t modwerk_cfg_fs[], modwerk_cfg_hs[], modwerk_cfg_os_fs[], modwerk_cfg_os_hs[];
extern volatile uint32_t modwerk_cfg_len_fs, modwerk_cfg_len_hs;

/* Written masked at a switch, read by the tick with the USB interrupt held off (no switch runs then). */
static volatile uintptr_t row_record;   /* the function the table holds, 0 for none */
static volatile uint32_t row_endpoints; /* its endpoints */
static volatile uint32_t row_serial;    /* 0 for none; a new number for every function that arrives */
static volatile uint8_t dirty;
static uint32_t serials, live_serial;   /* live: the function the slots describe */
static volatile uint8_t state, reconnects;
static uint8_t forced, live_profile, panel_reconnect, retried;
static volatile uint8_t reset_seen; /* BACK: the host has reset the bus since the unit came back */
static volatile uint16_t timer, frames_to_attach;
static uint8_t off_ticks;
static uint16_t waited;

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
static int uf_block(const uint8_t *p, unsigned length, unsigned interfaces, uint32_t endpoints)
{
    if (interfaces < 1u || interfaces > 4u || length < 9u || length > UF_ROOM) return 0;
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
        if (type == 5u) {
            if (n < 7u || (p[at + 2u] & 0x7fu) != MODWERK_USB_FUNCTION_ENDPOINT) return 0;
            if (!(endpoints & (p[at + 2u] & 0x80u ? 0x00080000u : 0x00000008u))) return 0;
        }
        at += n;
    }
    return seen == (1u << interfaces) - 1u;
}

static const uint8_t *uf_span(const struct runtime_dsp *d, uint32_t base, uint32_t address, unsigned length)
{
    if (address < base || address - base > d->image_bytes || length > d->image_bytes - (address - base)) return 0;
    return d->image + (address - base);
}

int modwerk_usb_function_admit(const struct runtime_dsp *d, unsigned operation)
{
    if (!d || !d->present) return RUNTIME_OK;
    uint32_t at = d->hook_offset[MODWERK_OT_USB_FUNCTIONS];
    if (at == RUNTIME_NONE) return RUNTIME_OK;
    if (modwerk_cfg_native.audio_linked) return RUNTIME_CONFLICT;
    if (operation != RUNTIME_METADATA_PREPARE && operation != RUNTIME_METADATA_SWITCH) return RUNTIME_MALFORMED;
    if (!d->image || (at & 1u) || at > d->image_bytes || d->image_bytes - at < UF_RECORD) return RUNTIME_MALFORMED;
    const uint8_t *record = d->image + at;
    unsigned abi = uf_word(record), size = uf_word(record + 4), profiles = 1;
    unsigned interfaces = uf_half(record + 8), length = uf_half(record + 10);
    uint32_t endpoints = uf_word(record + 12);
    int variable = abi == MODWERK_USB_SPEED_PROFILES_ABI;
    int input = variable && size == UF_INPUT_RECORD;
#ifndef MODWERK_USB_INPUT
    if (input) return RUNTIME_CONFLICT;
#endif
    if (!endpoints || (endpoints & ~UF_ENDPOINTS)) return RUNTIME_MALFORMED;
    if (abi == MODWERK_USB_PROFILES_ABI || variable) {
        if ((size != UF_PROFILE_RECORD && !input) || d->image_bytes - at < size) return RUNTIME_MALFORMED;
        profiles = uf_half(record + 32);
        if (!profiles || profiles > (variable ? MODWERK_USB_SPEED_PROFILES_MAX : 8u) ||
            record[34] >= profiles || record[35] >= profiles) return RUNTIME_MALFORMED;
    } else if (abi != MODWERK_USB_FUNCTION_ABI || size != UF_RECORD) return RUNTIME_MALFORMED;
    if (variable && (interfaces || length)) return RUNTIME_MALFORMED;

    /* PREPARE sees image offsets. SWITCH sees relocated addresses. */
    uint32_t base = operation == RUNTIME_METADATA_PREPARE ? 0u : UF_IMAGE_ADDRESS(d->image);
    if (input) {
        uint32_t handler = uf_word(record + UF_PROFILE_RECORD);
        if (!handler || (handler & 1u) || !uf_span(d, base, handler, 2u) || endpoints != UF_ENDPOINTS)
            return RUNTIME_MALFORMED;
    }
    const uint8_t *speed_tables[2];
    for (unsigned k = 0; k < 4u; ++k) {
        uint32_t address = uf_word(record + 16u + 4u * k);
        if (variable && (address & 3u)) return RUNTIME_MALFORMED;
        const uint8_t *blocks = uf_span(d, base, address, profiles * (variable ? UF_BLOCK_RECORD : length));
        if (!blocks) return RUNTIME_MALFORMED;
        if (variable && k < 2u) speed_tables[k] = blocks;
        const uint8_t *same_speed = variable && k >= 2u ? speed_tables[k - 2u] : 0;
        for (unsigned i = 0; i < profiles; ++i) {
            unsigned n = length, count = interfaces;
            const uint8_t *block = blocks + i * length;
            if (variable) {
                const uint8_t *entry = blocks + i * UF_BLOCK_RECORD;
                if (same_speed && uf_word(entry) != uf_word(same_speed + i * UF_BLOCK_RECORD))
                    return RUNTIME_MALFORMED;
                count = uf_half(entry);
                n = uf_half(entry + 2);
                block = uf_span(d, base, uf_word(entry + 4), n);
            }
            if (!block || !uf_block(block, n, count, endpoints)) return RUNTIME_MALFORMED;
        }
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

/* Read under the machine lock. ABI 1 has a single immutable profile. */
static unsigned uf_requested(void)
{
    const struct modwerk_usb_profiles *p = (const void *)row_record;
    if (!p || p->function.abi == MODWERK_USB_FUNCTION_ABI) return 0;
    unsigned index = p->requested;
    return index < p->count ? index : 0u;
}

#ifdef MODWERK_USB_INPUT
/* OctaBam's USB receive priority, measured by Bryan Tysinger on MKII.
 * Change it only while the controller is detached. Restore exactly what the
 * base had before the duplex profile on Undo or when the player selects OFF. */
#define USB_BURST_CONTROL 0xfc040024u
#define USB_SDRAM_PRIORITY 0xfc004200u
#define USB_SDRAM_ARBITRATION 0xfc004210u
#define USB_SRAM_PRIORITY 0xfc004400u
#define USB_SRAM_ARBITRATION 0xfc004410u
static uint32_t saved_burst, saved_sdram_priority, saved_sdram_arb, saved_sram_priority, saved_sram_arb;
static uint8_t usb_first;
static void uf_input_priority(int enabled)
{
    if (enabled == usb_first) return;
    if (enabled) {
        saved_burst = UF_REG(USB_BURST_CONTROL);
        saved_sdram_priority = UF_REG(USB_SDRAM_PRIORITY);
        saved_sdram_arb = UF_REG(USB_SDRAM_ARBITRATION);
        saved_sram_priority = UF_REG(USB_SRAM_PRIORITY);
        saved_sram_arb = UF_REG(USB_SRAM_ARBITRATION);
        UF_REG(USB_BURST_CONTROL) = saved_burst | 0x3ffu;
        UF_REG(USB_SDRAM_PRIORITY) = UF_REG(USB_SRAM_PRIORITY) = 0x60504321u;
        UF_REG(USB_SDRAM_ARBITRATION) = UF_REG(USB_SRAM_ARBITRATION) = 0x10u;
    } else {
        UF_REG(USB_SDRAM_ARBITRATION) = saved_sdram_arb;
        UF_REG(USB_SRAM_ARBITRATION) = saved_sram_arb;
        UF_REG(USB_SDRAM_PRIORITY) = saved_sdram_priority;
        UF_REG(USB_SRAM_PRIORITY) = saved_sram_priority;
        UF_REG(USB_BURST_CONTROL) = saved_burst;
    }
    usb_first = (uint8_t)enabled;
}
#endif

/* The USB interrupt held off and the unit off the bus. Through the uncached alias: the controller reads memory. */
static void uf_compose(void)
{
    const struct modwerk_usb_function *f = (const struct modwerk_usb_function *)row_record;
    uint8_t *const slot[4] = {modwerk_cfg_fs, modwerk_cfg_hs, modwerk_cfg_os_fs, modwerk_cfg_os_hs};
    const uint8_t *const block[4] = {f ? f->fs : 0, f ? f->hs : 0, f ? f->os_fs : 0, f ? f->os_hs : 0};
    live_profile = (uint8_t)uf_requested();
    if (f && f->abi != MODWERK_USB_FUNCTION_ABI)
        ((struct modwerk_usb_profiles *)row_record)->active = live_profile;
    for (unsigned k = 0; k < 4u; ++k) {
        const uint8_t *from = block[k];
        unsigned length = 0, interfaces = 0;
        if (f && f->abi == MODWERK_USB_SPEED_PROFILES_ABI) {
            const struct modwerk_usb_profile_block *entry = (const void *)from;
            entry += live_profile;
            length = entry->length, interfaces = entry->interfaces, from = entry->descriptors;
        } else if (f) {
            length = f->length, interfaces = f->interfaces;
            from += live_profile * length;
        }
        volatile uint8_t *to = UF_UNCACHED(slot[k]);
        unsigned total = modwerk_cfg_native.bytes + length;
        to[2] = (uint8_t)total, to[3] = (uint8_t)(total >> 8);
        to[4] = (uint8_t)(modwerk_cfg_native.interfaces + interfaces);
        for (unsigned i = 0; i < length; ++i) to[modwerk_cfg_native.bytes + i] = from[i];
        if (k == 0u) modwerk_cfg_len_fs = total;
        if (k == 1u) {
            modwerk_cfg_len_hs = total;
#ifdef MODWERK_USB_INPUT
            uf_input_priority(f && f->abi == MODWERK_USB_SPEED_PROFILES_ABI &&
                              f->bytes == UF_INPUT_RECORD && interfaces == 3u);
#endif
        }
    }
    live_serial = f ? row_serial : 0u;
}

/* Called with the USB interrupt held off by the frame interrupt or by the tick's full mask.
 * The configuration slots have already been written. Allow the host to reset as soon as RS is set. */
static void uf_wait_to_attach(void)
{
    off_ticks = UF_DOWN;
    frames_to_attach = UF_FRAME_TIMEOUT;
    state = UF_OFF; /* publish last to the frame interrupt */
}

static void uf_attach(void)
{
    reset_seen = 0;
    state = UF_BACK;
    UF_REG(UF_USBCMD) = UF_REG(UF_USBCMD) | 1u;
    ++reconnects;
}

int modwerk_usb_function_tick(int quiet)
{
    uint32_t lock;
    switch (state) {
    case UF_SETTLED:
        if (!dirty && !row_record) break;
        lock = modwerk_machine_lock();
        dirty = 0;
        if (row_serial != live_serial || uf_requested() != live_profile) state = UF_WAIT, timer = UF_GRACE, waited = 0;
        modwerk_machine_unlock(lock);
        break;
    case UF_WAIT:
        if (timer) { --timer; break; }
        if (modwerk_machine_usb_disk()) break; /* never under a mounted card, however long it stays */
        lock = modwerk_machine_lock();
        dirty = 0;
        if (row_serial == live_serial && uf_requested() == live_profile) state = UF_SETTLED; /* it came and went before the host saw it */
        else if (!modwerk_machine_stopped() && row_serial == live_serial) { /* defer a panel format change */ }
        else if ((quiet && uf_idle()) || waited >= UF_PATIENCE) {
            if (!(quiet && uf_idle())) ++forced;
            (void)uf_raise(MODWERK_EV_USB_BUS_END);
            UF_REG(UF_USBCMD) = UF_REG(UF_USBCMD) & ~1u;
            panel_reconnect = row_serial == live_serial;
            if (panel_reconnect && row_endpoints) uf_retire(row_endpoints);
            uf_compose();
            timer = UF_LEASE;
            retried = 0;
            uf_wait_to_attach();
        } else ++waited;
        modwerk_machine_unlock(lock);
        break;
    case UF_OFF:
        /* The frame interrupt can complete this transition between the switch and the mask. */
        lock = modwerk_machine_mask();
        if (state == UF_OFF) {
            if (retried && timer) --timer; /* the second detach is inside the original lease */
            if (off_ticks) --off_ticks;
            else uf_attach();
        }
        modwerk_machine_unmask(lock);
        break;
    default:
        if (timer && --timer) {
            if (timer != UF_LEASE - UF_ATTACH_CHECK || retried) break;
            /* RS requests attachment. CCS reports the result. Leave an attached, suspended
             * or resetting port, a real unplug, and an active disk session to their owners. */
            lock = modwerk_machine_lock();
            if (state == UF_BACK && !reset_seen && quiet && !modwerk_machine_usb_disk() &&
                (UF_REG(UF_OTGSC) & UF_SESSION_VALID) && !(UF_REG(UF_PORTSC1) & UF_PORT_ACTIVE) &&
                (UF_REG(UF_USBCMD) & 1u)) {
                retried = 1;
                UF_REG(UF_USBCMD) = UF_REG(UF_USBCMD) & ~1u;
                uf_wait_to_attach();
            }
            modwerk_machine_unlock(lock);
            break;
        }
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
unsigned modwerk_usb_function_control(void)
{
    unsigned answered = uf_raise(MODWERK_EV_USB_CONTROL);
    /* A standalone audio host enumerating a panel change can acknowledge its
     * class interface. A package upload retains the vendor reconnect lease. */
    if (answered && panel_reconnect && state == UF_BACK && reset_seen) state = UF_SETTLED;
    return answered;
}
#ifdef MODWERK_USB_INPUT
static volatile uint8_t input_dma_failed;
void modwerk_usb_input_dma_failed(void) { input_dma_failed = 1; }

/* The guarded state-7 eDMA scheduler calls this once, before a loader write.
 * The package prepares a complete 3- or 5-minor-loop block in fixed SRAM.
 * The completion path owns only SRAM, so it can finish after a module leaves. */
unsigned modwerk_usb_input_block(void)
{
    const struct modwerk_usb_profiles *profile = (const void *)row_record;
    if (input_dma_failed || !profile || profile->function.abi != MODWERK_USB_SPEED_PROFILES_ABI ||
        profile->function.bytes != UF_INPUT_RECORD) return 0;
    const struct modwerk_usb_input_profiles *input = (const void *)profile;
    unsigned loops = UF_CALL((uintptr_t)input->receive);
    return loops == 3u || loops == 5u ? loops : 0u;
}
#endif

/* The frame interrupt's block (usb_base.s modwerk_usb_frame_shim), in a base that does not link USB Audio in. */
void modwerk_usb_function_frame(void)
{
    if (state == UF_OFF && !--frames_to_attach) uf_attach();
    (void)uf_raise(MODWERK_EV_USB_FRAME);
}

unsigned modwerk_usb_function_status(uint8_t *out)
{
    out[0] = state == UF_SETTLED && dirty ? UF_WAIT : state;
    out[1] = live_serial != 0u;
    out[2] = row_serial != 0u;
    out[3] = reconnects, out[4] = forced;
    out[5] = out[6] = out[7] = 0;
    return MODWERK_USB_FUNCTION_STATUS_BYTES;
}
