/* SPDX-License-Identifier: GPL-3.0-or-later
 * OS 1.40C glue for the EP0 vendor transport (sdk/runtime/upload/vendor.c).
 *
 * USB ISR (usb_base.s shims): modwerk_ep0_dispatch from the unknown-request
 * tail, modwerk_ep0_poll at the start of the transfer path, and
 * modwerk_ep0_bus_reset at bus reset and session end. Engine task:
 * modwerk_engine_idle, chained before the logger's idle hook.
 *
 * A SUBMIT data stage goes into a descriptor of our own with
 * interrupt-on-complete. The stock completion loop may take its completion
 * bit (harmlessly, in its idle state 11 with no awaited OUT descriptor), but
 * the completion raises the USB interrupt again, and the poll finishes the
 * transfer from the descriptor itself. No ISR spin waits for the host.
 *
 * The controller's backend is boot.c's: the runtime loader's for module
 * packages, plus whole OS images for a RAM boot. */
#ifdef MODWERK_DSP_LOADER
#include "selftest.h"
#include "fxids.h"
#include "diag.h"
#endif
#include "vendor.h"
#include "usb_base.h"
#include "runtime.h"
#include "boot.h"
#include "flash.h"
#ifdef MODWERK_RUNTIME_VOLATILE_JOURNAL
#include "volatile_service.h"
#endif
#ifdef MODWERK_SAVED_SET_EXPORT
#include "saved_set_session.h"
#endif
#ifdef MODWERK_DEV
void modwerk_cost_stamp(unsigned k); /* diag.c: the development profile of the base's hooks */
#define MW_STAMP(k) modwerk_cost_stamp(k)
#else
#define MW_STAMP(k) ((void)0)
#endif

#define UNCACHED(p) ((void *)((uintptr_t)(p) + 0x08000000u))
#define REG(a) (*(volatile uint32_t *)(a))
/* The stock copy of the SETUP packet being handled, in USB byte order. */
#define SETUP ((const uint8_t *)0x46c8ce08u)
#define ENDPTSETUPSTAT REG(0xfc0b01acu)
#define ENDPTPRIME REG(0xfc0b01b0u)
#define ENDPTSTAT REG(0xfc0b01b8u)
#define ENDPTFLUSH REG(0xfc0b01b4u)
#define ENDPTCOMPLETE REG(0xfc0b01bcu)
#define ENDPTCTRL0 REG(0xfc0b01c0u)
/* Stock EP0 state: 10 while an IN stage is pending, 11 when idle. */
#define EP0_STATE REG(0x460bb3ecu)
/* Stock's awaited OUT descriptor; null unless one of its own OUT stages runs. */
#define EP0_OUT_AWAITED REG(0x460bb3f4u)
/* Points at the EP0 OUT queue head. */
#define EP0_OUT_QH REG(0x46c8ce18u)
#define ENGINE_QUEUE ((void *)0x460d17ceu)
/* kernel post(queue, message): never blocks, masks interrupts itself; the
 * stock USB ISR posts with it. */
#define POST ((void (*)(void *, const void *))0x40000c3cu)
/* Stock status IN: a zero-length IN on EP0, state 10. Uses d0/a0/a1 only. */
#define STATUS_IN ((void (*)(void))0x4001d524u)

#define DTD_ACTIVE 0x80u
#define DTD_ERRORS 0x68u /* halted, data buffer error, transaction error */
#define DTD_IOC 0x8000u

#define MODWERK_EP0_REFUSE 0xffffffffu
#define MODWERK_EP0_RECEIVING 0xfffffffeu

struct dtd { uint32_t next, token, page[5], reserved; };

extern const uint8_t modwerk_base_digest[MU_DIGEST_BYTES];
static struct mv_transport transport;
/* usb_ep0_send fills only the first page of its transfer descriptor:
 * 256-byte alignment keeps every reply inside one 4 KiB page. */
static uint8_t reply[512] __attribute__((aligned(512))); /* within one 4 KiB page */
static struct dtd data_dtd __attribute__((aligned(32)));
static uint8_t started, receiving;
#ifdef MODWERK_RUNTIME_VOLATILE_JOURNAL
static struct mvs_service volatile_service __attribute__((aligned(16)));
#define VOLATILE_SERVICE ((struct mvs_service *)UNCACHED(&volatile_service))
static uint8_t volatile_started, volatile_receiving;
#endif
static volatile uint8_t wake_posted;
static volatile uint8_t held; /* a frame put off until settled: the tick wakes the engine to look again */
static uint32_t expected, frames, refusals, resets;
/* Hardware-run evidence for DIAG: what the data stage path saw last. */
static uint32_t primes, completions, submit_state, last_token, last_received, prime_status, qh_next, frame_head, abandons;
/* The tick's catch-ups and refusals (modwerk_ep0_tick), the descriptor's token at the last abandon (not active: the
 * data had come) and the queue head's overlay token at the last refusal (what the controller had received). */
static volatile uint32_t caught, stalled, abandoned_token, stuck_overlay;
static uint32_t waited; /* ticks the primed data stage has not completed */
const uint8_t *modwerk_ep0_reply;
/* The engine ignores messages whose first byte is above 45 and returns to
 * its receive, where the idle hook runs: a wake-up and nothing else. */
static const uint8_t wake_message[4] __attribute__((aligned(4))) = {0xff, 0, 0, 0};

static struct mu_context controller;
static uint8_t controller_started;
#ifdef MODWERK_SAVED_SET_EXPORT
/* Source-linked BSS reservation: ISR and engine use only its uncached alias. */
struct msx_session modwerk_saved_set_export __attribute__((aligned(4)));
#define SAVED_SET ((struct msx_session *)UNCACHED(&modwerk_saved_set_export))
int modwerk_modset_export_idle(void);
int modwerk_dsp_export_idle(void);
int octamod_log_can_flush(void);
int modwerk_saved_set_busy(void) { return msx_session_active(SAVED_SET); }
static int saved_set_structural_safe(void)
{
#ifdef MODWERK_RUNTIME_VOLATILE_JOURNAL
    if(modwerk_runtime_volatile_busy() || modwerk_volatile_busy(VOLATILE_SERVICE)) return 0;
#endif
    if (receiving || held || (controller_started && controller.phase != MU_NORMAL) ||
        !modwerk_modset_export_idle() || !modwerk_dsp_export_idle() ||
        !modwerk_machine_stopped() || REG(0x460d1cb8u) != 1u || REG(0x460e76a0u)) return 0;
#ifdef MODWERK_RESIDENT_STOCK_HOOKS
    /* Mandatory board-owned ACK/reset state. No permissive weak default. */
    int modwerk_stock_hook_export_idle(void);
    if (!modwerk_stock_hook_export_idle()) return 0;
#endif
    return 1;
}
int modwerk_saved_set_safe(void)
{
    uint32_t lock = modwerk_machine_lock();
    int safe = msx_session_reading(SAVED_SET) && saved_set_structural_safe() && octamod_log_can_flush();
    modwerk_machine_unlock(lock);
    return safe;
}
#elif defined(MODWERK_RESIDENT_STOCK_HOOKS)
/* No saved-set export in this base, so no export session is ever busy. The resident stock hooks and the controller
 * board ask before their writes (resident_base.patch, controller_board.c). */
int modwerk_saved_set_busy(void) { return 0; }
#endif
#ifdef MODWERK_RUNTIME_VOLATILE_JOURNAL
/* Called only while the loader retains the real board stable lock. No new
 * lock, work, logger flush or transport initialization occurs here. */
int modwerk_machine_journal_begin_safe(void)
{
#ifdef MODWERK_SAVED_SET_EXPORT
    const struct mv_transport *t = UNCACHED(&transport);
    return started && !wake_posted && t->resets == t->handled && t->lapses == t->lapses_handled &&
        !modwerk_saved_set_busy() && saved_set_structural_safe();
#else
    return 0;
#endif
}
#endif
/* A host session is open (an install, a trial, its self-test): dsp.c moves no code meanwhile. */
int modwerk_upload_busy(void);
int modwerk_upload_busy(void) {
#ifdef MODWERK_RUNTIME_VOLATILE_JOURNAL
    if(modwerk_runtime_volatile_busy() || modwerk_volatile_busy(VOLATILE_SERVICE)) return 1;
#endif
#ifdef MODWERK_SAVED_SET_EXPORT
    if (modwerk_saved_set_busy()) return 1;
#endif
    return controller_started && controller.phase != MU_NORMAL;
}

static void wake(void)
{
    if (wake_posted) return;
    wake_posted = 1;
    POST(ENGINE_QUEUE, wake_message);
}

static struct mv_transport *vendor(void)
{
    struct mv_transport *t = UNCACHED(&transport);
    if (!started) {
        (void)mv_init(t, MODWERK_VENDOR_INTERFACE, modwerk_base_digest, MODWERK_MODEL, MV_CAN_SUBMIT);
        started = 1;
    }
    return t;
}

static void flush_receive(void)
{
    ENDPTFLUSH = 1u;
    for (uint32_t i = 0; (ENDPTFLUSH & 1u) && i < 100000u; ++i) {}
}

static uint32_t prime_receive(uint8_t *buffer,uint32_t length)
{
        /* Stock's completion loop handles an EP0 OUT completion harmlessly
         * only in its idle state (11) with no awaited OUT descriptor; in any
         * other state it spins on the bit forever. This new SETUP has ended
         * whatever transfer stock was tracking (its SETUP path also cleared
         * the EP0 completion bits), so take EP0 into the idle state for ours.
         * On hardware the state was not idle here: a fast host's SETUP can
         * clear the previous IN completion before stock processes it. */
        submit_state = EP0_STATE << 16 | (EP0_OUT_AWAITED != 0);
        EP0_STATE = 11u;
        EP0_OUT_AWAITED = 0;
        struct dtd *d = UNCACHED(&data_dtd);
        uint32_t at = (uint32_t)(uintptr_t)buffer;
        d->next = 1u;
        d->token = length << 16 | DTD_IOC | DTD_ACTIVE;
        d->page[0] = at;
        for (uint32_t i = 1; i < 5; ++i) d->page[i] = (at & ~0xfffu) + 0x1000u * i;
        volatile uint32_t *qh = (volatile uint32_t *)(uintptr_t)EP0_OUT_QH;
        /* ZLT off: with it on (stock's setting) a stage of whole 64-byte packets
         * waits for a zero-length packet the host never sends (hardware, usbtest9). */
        qh[0] |= 1u << 29;
        qh[2] = (uint32_t)(uintptr_t)d;
        ENDPTPRIME = ENDPTPRIME | 1u;
        ++primes, waited = 0;
        qh_next = qh[2];
        prime_status = ENDPTPRIME << 16 | (ENDPTSTAT & 0xffffu);
        expected = length;
        receiving = 1;
        return MODWERK_EP0_RECEIVING;
}

/* DIAG (0xC1, bRequest 4, wValue 0, wLength 68, never a multiple of 64; see
 * vendor.h): read-only counters for a hardware run, big-endian after "MWUD",
 * version 3 and three zero bytes:
 * runtime ticks, the test module's value, whether a module is active, frames
 * received, our refusals, bus resets, data stages primed and completed, the
 * stock EP0 state (high 16 bits) and awaited-OUT flag at the last SUBMIT,
 * the last descriptor token and received count, ENDPTPRIME (high) and
 * ENDPTSTAT (low) right after priming, the queue head's next pointer read
 * back, the first four bytes received, and data stages abandoned. */
static int diag(const uint8_t *s, uint8_t *out)
{
    if (s[0] != MV_RESULT_TYPE || s[1] != 4 || s[2] || s[3] || s[4] != MODWERK_VENDOR_INTERFACE || s[5] ||
        s[6] != 68 || s[7]) return 0;
    uint32_t words[15] = {modwerk_runtime_calls(), modwerk_runtime_value(), modwerk_runtime_active() != 0,
                          frames, refusals, resets, primes, completions, submit_state, last_token,
                          last_received, prime_status, qh_next, frame_head, abandons};
    out[0] = 'M'; out[1] = 'W'; out[2] = 'U'; out[3] = 'D'; out[4] = 3; out[5] = out[6] = out[7] = 0;
    for (uint32_t i = 0; i < 60; ++i) out[8 + i] = (uint8_t)(words[i / 4] >> (24 - 8 * (i % 4)));
    return 1;
}

/* What Windows asks before it binds WinUSB to the vendor interface: the BOS
 * descriptor (GET_DESCRIPTOR 0x0F) and the Microsoft OS 2.0 descriptor set
 * (vendor device request, wIndex 7); both from usb_base.py. Replies are cut
 * to wLength, so neither needs a zero-length packet. */
static uint32_t windows(const uint8_t *s, uint8_t *out)
{
    const uint8_t *blob;
    uint32_t n, want = s[6] | (uint32_t)s[7] << 8;
    if (s[0] == 0x80 && s[1] == 6 && s[3] == 0x0f && !s[2] && !s[4] && !s[5])
        blob = modwerk_bos, n = MODWERK_BOS_BYTES;
    else if (s[0] == 0xc0 && s[1] == MODWERK_MS_VENDOR_CODE && !s[2] && !s[3] && s[4] == MODWERK_MS_OS_20_INDEX && !s[5])
        blob = modwerk_msos20, n = MODWERK_MSOS20_BYTES;
    else return 0;
    if (n > want) n = want;
    for (uint32_t i = 0; i < n; ++i) out[i] = blob[i];
    modwerk_ep0_reply = out;
    return n;
}

/* Unknown-request tail. A length sends modwerk_ep0_reply; 0 leaves a request
 * that is not ours to the stock STALL; REFUSE stalls EP0 both ways; RECEIVING
 * returns with our data stage primed and no status yet. */
uint32_t modwerk_ep0_dispatch(void);
uint32_t modwerk_ep0_dispatch(void)
{
    struct mv_transport *t = vendor();
    uint8_t *out = UNCACHED(reply);
#ifdef MODWERK_RUNTIME_VOLATILE_JOURNAL
    /* A new SETUP abandons an incomplete private OUT. Unknown writes trigger
     * board expiry/recovery, never controller adoption or frame replay. */
    if(receiving && volatile_receiving) {
        receiving=volatile_receiving=0;++abandons;flush_receive();
        modwerk_volatile_reset(VOLATILE_SERVICE);wake();
    }
    if(SETUP[1]>=34u && SETUP[1]<=36u) {
        uint32_t length=(uint32_t)SETUP[6]|(uint32_t)SETUP[7]<<8;
        if(SETUP[2] || SETUP[3] || SETUP[4]!=MODWERK_VENDOR_INTERFACE || SETUP[5]) return MODWERK_EP0_REFUSE;
        if(SETUP[1]!=34u) {
            if(SETUP[0]!=MV_RESULT_TYPE || length!=MVS_STATUS_BYTES) return MODWERK_EP0_REFUSE;
            if(!volatile_started) { wake();return MODWERK_EP0_REFUSE; }
            modwerk_ep0_reply=out;return modwerk_volatile_status(VOLATILE_SERVICE,out);
        }
        if(SETUP[0]!=MV_SUBMIT_TYPE || !volatile_started || length<MVS_HEADER_BYTES ||
           length>MVS_FRAME_BYTES || !(length%64u) || VOLATILE_SERVICE->queued ||
           (controller_started && controller.phase!=MU_NORMAL) || receiving || held
#ifdef MODWERK_SAVED_SET_EXPORT
           || modwerk_saved_set_busy()
#endif
           ) return MODWERK_EP0_REFUSE;
        /* Only the bounded completed frame is queued. No parser, allocation,
         * source declaration, Begin or publication work runs in the ISR. */
        volatile_receiving=1;
        return prime_receive(t->frame,length);
    }
    if((modwerk_runtime_volatile_busy() || modwerk_volatile_busy(VOLATILE_SERVICE)) &&
       SETUP[0]==MV_SUBMIT_TYPE) return MODWERK_EP0_REFUSE;
#endif
#ifdef MODWERK_SAVED_SET_EXPORT
    /* The export lease freezes controller mutation before SETUP can reserve
     * a receiving frame. The completed queued frame also blocks export begin. */
    if (modwerk_saved_set_busy() && SETUP[0] == MV_SUBMIT_TYPE && SETUP[1] == MV_SUBMIT &&
        SETUP[4] == MODWERK_VENDOR_INTERFACE && !SETUP[5]) return MODWERK_EP0_REFUSE;
#endif
    struct mv_reply r = mv_setup(t, SETUP);
    if (receiving) { /* mv_setup abandoned it; take it off the queue too. */
        receiving = 0;
        ++abandons;
        flush_receive();
    }
    if (r.action == MV_PASS) return windows(SETUP, out);
    if (r.action == MV_STALL && diag(SETUP, out)) { /* mv_setup stalls requests it does not know */
        modwerk_ep0_reply = out;
        return 68;
    }
    /* CAPABILITIES (0xC1, bRequest 29, wValue 0, wLength 12): MWCP v1,
     * loader ABI, feature bits, site/copy bounds. Older bases stall; canSubmit
     * alone does not imply that a package's runtime ABI is supported. */
    if (r.action == MV_STALL && SETUP[0] == MV_RESULT_TYPE && SETUP[1] == 29 && !SETUP[2] && !SETUP[3] &&
        SETUP[4] == MODWERK_VENDOR_INTERFACE && !SETUP[5] && SETUP[6] == 12u && !SETUP[7]) {
        modwerk_ep0_reply = out;
        unsigned n = modwerk_runtime_capabilities(out);
        out[6] |= 1u; /* feature bit 8: this base writes its own container to NOR over USB (flash.c) */
        return n;
    }
    /* SLOTS (0xC1, bRequest 39, wValue 0, wLength 24): the two-slot layout as the engine last read it (flash.h),
     * zeros before its first look. Read-only; bases before the two slots stall it. */
    if (r.action == MV_STALL && SETUP[0] == MV_RESULT_TYPE && SETUP[1] == 39 && !SETUP[2] && !SETUP[3] &&
        SETUP[4] == MODWERK_VENDOR_INTERFACE && !SETUP[5] && SETUP[6] == FLASH_SLOTS_BYTES && !SETUP[7]) {
        for (unsigned i = 0; i < FLASH_SLOTS_BYTES; ++i) out[i] = modwerk_flash_slots[i];
        modwerk_ep0_reply = out;
        return FLASH_SLOTS_BYTES;
    }
#ifdef MODWERK_RUNTIME_SETS
    /* Exact baseline identity; only cached copies in the ISR. A stale cache
     * wakes its engine owner and refuses this read until it is refreshed. */
    if(r.action==MV_STALL && SETUP[0]==MV_RESULT_TYPE && SETUP[1]==38u && !SETUP[2] && !SETUP[3] &&
       SETUP[4]==MODWERK_VENDOR_INTERFACE && !SETUP[5] && SETUP[6]==40u && !SETUP[7]) {
        unsigned n=modwerk_runtime_set_identity(out);
        if(!n) { wake();return MODWERK_EP0_REFUSE; }
        modwerk_ep0_reply=out;return n;
    }
#endif
    /* INVENTORY (0xC1, bRequest 27, wValue the first entry, wLength 316): the installed modules (loader.c
     * modwerk_runtime_list), so the site can make the unit match a module set; 13 a page, so a host asks on from
     * wValue 13 while a page comes back full. Read-only. */
    if (r.action == MV_STALL && SETUP[0] == MV_RESULT_TYPE && SETUP[1] == 27 && SETUP[2] < RUNTIME_MODULES && !SETUP[3] &&
        SETUP[4] == MODWERK_VENDOR_INTERFACE && !SETUP[5] && (SETUP[6] | SETUP[7] << 8) == 4u + 24u * 13u) {
        modwerk_ep0_reply = out;
        return modwerk_runtime_list(out, SETUP[2], 13u);
    }
#ifdef MODWERK_SAVED_SET_EXPORT
    if (r.action == MV_STALL && SETUP[1] >= 31u && SETUP[1] <= 33u) {
        uint32_t lock = modwerk_machine_lock();
        int begin_safe = !wake_posted && t->resets == t->handled && t->lapses == t->lapses_handled &&
                         saved_set_structural_safe();
        unsigned n = msx_session_request(SAVED_SET, SETUP, out, MODWERK_VENDOR_INTERFACE, begin_safe);
        modwerk_machine_unlock(lock);
        if (n) {
            if (SAVED_SET->file.status == MSX_PENDING) wake();
            modwerk_ep0_reply = out;
            return n;
        }
        return MODWERK_EP0_REFUSE;
    }
#endif
#ifdef MODWERK_DSP_LOADER
    /* LOAD: one cached snapshot, no meter request or task message. */
    if (r.action == MV_STALL && SETUP[0] == MV_RESULT_TYPE && SETUP[1] == 30 && !SETUP[2] && !SETUP[3] &&
        SETUP[4] == MODWERK_VENDOR_INTERFACE && !SETUP[5] && SETUP[6] == 48u && !SETUP[7]) {
        unsigned modwerk_status_load(uint8_t *);
        modwerk_ep0_reply = out;
        return modwerk_status_load(out);
    }
    /* LOG (0xC1, bRequest 37, wValue the page, wLength 244): diag.c's diagnostics log, a page at a time, from
     * battery RAM; the site uploads it only with the member's consent. Read-only. */
    if (r.action == MV_STALL && SETUP[0] == MV_RESULT_TYPE && SETUP[1] == DIAG_LOG_REQUEST && !SETUP[3] &&
        SETUP[4] == MODWERK_VENDOR_INTERFACE && !SETUP[5] && (SETUP[6] | SETUP[7] << 8) == DIAG_PAGE) {
        modwerk_ep0_reply = out;
        return modwerk_diag_read(out, SETUP[2]);
    }
    /* MISSING (0xC1, bRequest 14, wValue the first entry, wLength 316): the modules the project names that are not
     * installed (dsp.c modwerk_dsp_missing_list), so the host can offer them; at most 13 a page, so a host asks on
     * from wValue 13 while a page comes back full (page 0 is the reply from before pages). Read-only. */
    if (r.action == MV_STALL && SETUP[0] == MV_RESULT_TYPE && SETUP[1] == 14 && SETUP[2] < MODWERK_FX_IDS && !SETUP[3] &&
        SETUP[4] == MODWERK_VENDOR_INTERFACE && !SETUP[5] && (SETUP[6] | SETUP[7] << 8) == 4u + 24u * MODWERK_MISSING_PAGE) {
        unsigned modwerk_dsp_missing_list(uint8_t *, unsigned, unsigned);
        modwerk_ep0_reply = out;
        return modwerk_dsp_missing_list(out, SETUP[2], MODWERK_MISSING_PAGE);
    }
    /* SELFTEST (0xC1, bRequest 21, wValue 1 start or 0 read, wLength 96): dsp.c's self-test (PROJ > MODWERK > SELF
     * TEST), which the site runs on a trial before it is kept; the record either way (selftest.h). */
    if (r.action == MV_STALL && SETUP[0] == MV_RESULT_TYPE && SETUP[1] == 21 && SETUP[2] <= 1u && !SETUP[3] &&
        SETUP[4] == MODWERK_VENDOR_INTERFACE && !SETUP[5] && (SETUP[6] | SETUP[7] << 8) == sizeof modwerk_selftest) {
#ifdef MODWERK_SAVED_SET_EXPORT
        if (SETUP[2] && modwerk_saved_set_busy()) return MODWERK_EP0_REFUSE;
#endif
#ifdef MODWERK_RUNTIME_VOLATILE_JOURNAL
        if(SETUP[2] && (modwerk_runtime_volatile_busy() || modwerk_volatile_busy(VOLATILE_SERVICE))) return MODWERK_EP0_REFUSE;
#endif
        if (SETUP[2]) (void)modwerk_selftest_start();
        modwerk_selftest_refresh();
        for (unsigned i = 0; i < sizeof modwerk_selftest; ++i) out[i] = ((const volatile uint8_t *)&modwerk_selftest)[i];
        modwerk_ep0_reply = out;
        return sizeof modwerk_selftest;
    }
#endif
#ifdef MODWERK_DEV
    if (r.action == MV_STALL) { /* development bases: KEY and SCREEN (dev.c) */
#ifdef MODWERK_RUNTIME_VOLATILE_JOURNAL
        if(modwerk_runtime_volatile_busy() || modwerk_volatile_busy(VOLATILE_SERVICE)) return MODWERK_EP0_REFUSE;
#endif
#ifdef MODWERK_SAVED_SET_EXPORT
        if (modwerk_saved_set_busy()) return MODWERK_EP0_REFUSE;
#endif
        uint32_t modwerk_dev_request(const uint8_t *, const uint8_t **, uint8_t *);
        uint32_t n = modwerk_dev_request(SETUP, &modwerk_ep0_reply, out);
        if (n) return n;
    }
#endif
    if (r.action == MV_RECEIVE) return prime_receive(r.buffer,r.length);
    if (r.action != MV_SEND || r.length > sizeof reply) { ++refusals; return MODWERK_EP0_REFUSE; }
    for (uint32_t i = 0; i < r.length; ++i) out[i] = r.buffer[i];
    modwerk_ep0_reply = out;
    return r.length;
}

/* Start of the transfer path, before stock reads a new SETUP. */
void modwerk_ep0_poll(void);
void modwerk_ep0_poll(void)
{
    if (!receiving) return;
    struct mv_transport *t = vendor();
    if (ENDPTSETUPSTAT & 1u) { /* The host gave this data stage up. */
        receiving = 0;
        ++abandons;
        abandoned_token = ((volatile struct dtd *)UNCACHED(&data_dtd))->token;
#ifdef MODWERK_RUNTIME_VOLATILE_JOURNAL
        if(volatile_receiving) { volatile_receiving=0;modwerk_volatile_reset(VOLATILE_SERVICE);wake(); }
        else
#endif
        mv_abandon(t);
        flush_receive();
        return;
    }
    uint32_t token = ((volatile struct dtd *)UNCACHED(&data_dtd))->token;
    if (token & DTD_ACTIVE) return;
    receiving = 0;
    ENDPTCOMPLETE = 1u; /* Ours, if the stock loop has not taken it. */
    uint32_t received = token & DTD_ERRORS ? 0 : expected - (token >> 16 & 0x7fffu);
    const volatile uint8_t *head = t->frame;
    ++completions; last_token = token; last_received = received;
    frame_head = (uint32_t)head[0] << 24 | (uint32_t)head[1] << 16 | (uint32_t)head[2] << 8 | head[3];
    int accepted;
#ifdef MODWERK_RUNTIME_VOLATILE_JOURNAL
    if(volatile_receiving) { volatile_receiving=0;accepted=received==expected &&
        modwerk_volatile_queue(VOLATILE_SERVICE,t->frame,received); }
    else
#endif
    accepted=mv_data(t,received);
    if (accepted) {
        ++frames;
        STATUS_IN();
        wake();
    } else {
        ++refusals;
        ENDPTCTRL0 = ENDPTCTRL0 | 0x00010001u; /* Refuse the status stage. */
    }
}

/* Bus reset or session end: the controller's disconnect, on the engine. */
void modwerk_ep0_bus_reset(void);
void modwerk_ep0_bus_reset(void)
{
    struct mv_transport *t = vendor();
    ++resets;
#ifdef MODWERK_RUNTIME_VOLATILE_JOURNAL
    volatile_receiving=0;modwerk_volatile_reset(VOLATILE_SERVICE);wake();
#endif
#ifdef MODWERK_SAVED_SET_EXPORT
    msx_session_reset(SAVED_SET); /* running latch remains held until engine I/O returns */
#endif
    if (receiving) {
        receiving = 0;
        flush_receive();
    }
    if (mv_reset(t)) wake();
}

/* Sys task, core-ot's 60 Hz ev_tick: a host silent for 10 s while an upload
 * or trial is open is handled as unplugged (mv_tick). */
#define HOST_TIMEOUT_TICKS 600u
int modwerk_modset_due(void); /* modset.c: a kept set waits for its save */
void modwerk_ep0_tick(void);
static void ep0_tick(void);
void modwerk_ep0_tick(void)
{
    MW_STAMP(2); ep0_tick(); MW_STAMP(3);
}
static void ep0_tick(void)
{
#ifdef MODWERK_RUNTIME_VOLATILE_JOURNAL
    if(volatile_started && modwerk_volatile_tick(VOLATILE_SERVICE,modwerk_runtime_ticks)) wake();
#endif
#ifdef MODWERK_SAVED_SET_EXPORT
    msx_session_tick(SAVED_SET); /* only export traffic renews this independent lease */
#endif
    /* A host's first request after 10 s of quiet: the unit says a host is linked (owner, 11 October 2026). */
    static uint8_t heard;
    static uint32_t quiet = HOST_TIMEOUT_TICKS;
    uint8_t activity = vendor()->activity;
    if (activity != heard) {
        if (quiet >= HOST_TIMEOUT_TICKS) ((void (*)(const char *, unsigned))0x4005a2b8u)("MODWERK CONNECTED", 0x60);
        heard = activity, quiet = 0;
        modwerk_flash_host = 1; /* a computer talks to this base: flash.c may confirm its slot */
    } else if (quiet < HOST_TIMEOUT_TICKS) ++quiet;
    if (started && controller_started && mv_tick(vendor(), controller.phase != MU_NORMAL, HOST_TIMEOUT_TICKS)) wake();
    if (controller_started && controller.disconnecting) wake(); /* finish all rows of an abandoned set */
    if (modwerk_boot_tick()) wake(); /* an armed RAM boot is due */
    if (modwerk_flash_tick()) wake(); /* the slots' first look, or the confirm (flash.c) */
    if (held) held = 0, wake(); /* the engine runs only when woken; an idle unit sends it nothing else */
    /* A kept set the card gate held back (playing, the card busy) or a failed write whose retry is due: twice a
     * second. Only an OUT frame wakes the engine, and a host waiting for the save only reads, so without this the
     * set stayed unsaved until the host's next command (owner's MKII, 20 October 2026: 20 s after a Keep). */
    static uint8_t save_wait;
    if (controller_started && ++save_wait >= 30u) {
        save_wait = 0;
        if (modwerk_modset_due()) wake();
    }
    /* A data stage that completes inside the ISR after its poll, while stock's completion loop runs, can lose its
     * interrupt to that loop: no status stage, and the host's transfer times out (owner's MKII, 11 October 2026, a
     * chunk now and then). Look again here with USB held off. A data stage can also stop half way: 64 bytes of a 120-byte frame came on the owner's MKII and the rest never
     * did, while the host waited on a status stage the base never sends (a browser may wait for ever). Half a
     * second without completion: refuse the frame and stall EP0, so the host's transfer fails at once and it
     * submits again (a refused frame never ran). */
    if (receiving) {
        uint32_t lock = modwerk_machine_lock();
        if (receiving && !(((volatile struct dtd *)UNCACHED(&data_dtd))->token & DTD_ACTIVE)) ++caught, modwerk_ep0_poll();
        else if (receiving && ++waited >= 30u) {
            stuck_overlay = ((volatile uint32_t *)(uintptr_t)EP0_OUT_QH)[3];
            receiving = 0, waited = 0, ++stalled;
#ifdef MODWERK_RUNTIME_VOLATILE_JOURNAL
            if(volatile_receiving) { volatile_receiving=0;modwerk_volatile_reset(VOLATILE_SERVICE);wake(); }
            else
#endif
            mv_abandon(vendor());
            flush_receive();
            ENDPTCTRL0 = ENDPTCTRL0 | 0x00010001u; /* both ways; the next SETUP clears it */
        }
        modwerk_machine_unlock(lock);
    }
}

/* Engine task, on every return to its receive. Cheap unless woken. */
void modwerk_engine_idle(void);
void modwerk_modset_service(void); /* modset.c: the module set restored after boot, saved after a change */
int modwerk_modset_restored(void);
extern volatile uint32_t modwerk_runtime_ticks;
#ifdef MODWERK_DSP_LOADER
int dl_publication_idle(void);
#endif
/* After a boot the saved set is restored and its DSP code loaded first; a host frame meanwhile waits, pending (the
 * host polls it). An install in that window raced the restore on the owner's MKII (11 October 2026): an update was
 * refused as busy while the restored code loaded, and the restore reloads the card's set over one changed before
 * it, so it would put a removed module back. shortcut: past ten seconds hosts go ahead regardless,
 * so a restore the gate holds back longer (USB disk mode or playback right after boot) can still meet an install;
 * have the restore skip a set changed before it if that shows up. */
#ifdef MODWERK_DEV
volatile uint32_t modwerk_ep0_hold_until; /* dev.c's HOLD TEST: hold as after a boot until this tick */
#endif
static int settled(void)
{
#ifdef MODWERK_DEV
    if ((int32_t)(modwerk_ep0_hold_until - modwerk_runtime_ticks) > 0) return 0;
#endif
    if (modwerk_runtime_ticks > 600u) return 1;
#ifdef MODWERK_DSP_LOADER
    if (!dl_publication_idle()) return 0;
#endif
    return modwerk_modset_restored();
}
void modwerk_engine_idle(void)
{
#ifdef MODWERK_SAVED_SET_EXPORT
    /* Engine only; no ISR card work. Reader rechecks the complete gate before
     * each bounded sector and after close. Interrupted publication is fenced. */
    if (modwerk_saved_set_busy()) {
        wake_posted = 0; /* consume the coalesced export wake; release can queue a fresh operation */
        msx_session_service(SAVED_SET, modwerk_saved_set_safe, modwerk_saved_set_read, mu_sha256);
        return;
    }
#endif
    modwerk_modset_service();
#ifdef MODWERK_RUNTIME_SETS
    modwerk_runtime_set_refresh();
#endif
    if (!wake_posted) return;
    wake_posted = 0;
    if (!settled()) { held = 1; (void)mv_service_held(UNCACHED(&transport), &controller); return; }
    if (!controller_started) {
        /* A per-boot session nonce, not a secret: timer counts and the USB
         * frame index at the first request, bound to this base identity. */
        uint32_t seed[6 + MU_DIGEST_BYTES / 4];
        uint8_t session[MU_DIGEST_BYTES];
        seed[0] = REG(0xfc07000cu); seed[1] = REG(0xfc07400cu);
        seed[2] = REG(0xfc07800cu); seed[3] = REG(0xfc07c00cu);
        seed[4] = REG(0xfc0b014cu); seed[5] = 0x4d575553u;
        for (uint32_t i = 0; i < MU_DIGEST_BYTES; ++i) ((uint8_t *)&seed[6])[i] = modwerk_base_digest[i];
        mu_sha256((const uint8_t *)seed, sizeof seed, session);
        session[0] |= 1u;
        if (!mu_init(&controller, modwerk_boot_staging(), BOOT_IMAGE_BYTES,
                     modwerk_base_digest, session, modwerk_base_digest, 0, &modwerk_flash_backend)) return;
        controller_started = 1;
    }
#ifdef MODWERK_RUNTIME_VOLATILE_JOURNAL
    if(!volatile_started) {
        if(!modwerk_volatile_init(VOLATILE_SERVICE,modwerk_boot_staging(),BOOT_IMAGE_BYTES,
            modwerk_base_digest,controller.session)) return;
        volatile_started=1;
    }
    modwerk_volatile_service(VOLATILE_SERVICE,modwerk_runtime_ticks);
    if(modwerk_runtime_volatile_busy() || modwerk_volatile_busy(VOLATILE_SERVICE)) return;
#endif
    (void)mv_service(UNCACHED(&transport), &controller);
#ifdef MODWERK_RUNTIME_VOLATILE_JOURNAL
    /* Legacy publication can change the inventory. Refresh the engine-owned
     * cached digest before a host reads it; ISR reads do no hashing. */
    modwerk_volatile_service(VOLATILE_SERVICE,modwerk_runtime_ticks);
#endif
    modwerk_modset_service(); /* a set this pass accepted is saved now: the one above ran before the host's command */
    modwerk_flash_service(); /* the slots read once after start, and the confirm (flash.c) */
    modwerk_boot_service(); /* an armed RAM boot, once due (boot.c): does not return then */
}
