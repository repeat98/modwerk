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
 * The controller's backend is runtime.c's single module slot. */
#include "vendor.h"
#include "usb_base.h"
#include "runtime.h"

#define UNCACHED(p) ((void *)((uintptr_t)(p) + 0x08000000u))
#define REG(a) (*(volatile uint32_t *)(a))
/* The stock copy of the SETUP packet being handled, in USB byte order. */
#define SETUP ((const uint8_t *)0x46c8ce08u)
#define ENDPTSETUPSTAT REG(0xfc0b01acu)
#define ENDPTPRIME REG(0xfc0b01b0u)
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
static uint8_t reply[256] __attribute__((aligned(256)));
static struct dtd data_dtd __attribute__((aligned(32)));
static uint8_t started, receiving;
static volatile uint8_t wake_posted;
static uint32_t expected, frames, refusals, resets;
const uint8_t *modwerk_ep0_reply;
/* The engine ignores messages whose first byte is above 45 and returns to
 * its receive, where the idle hook runs: a wake-up and nothing else. */
static const uint8_t wake_message[4] __attribute__((aligned(4))) = {0xff, 0, 0, 0};

static struct mu_context controller;
static uint8_t controller_started;

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

/* DIAG (0xC1, bRequest 4, wValue 0, wLength 32): read-only counters for a
 * hardware run, big-endian after "MWUD", version 1 and three zero bytes:
 * runtime ticks, the test module's value, whether a module is active, frames
 * received, our refusals and bus resets. */
static int diag(const uint8_t *s, uint8_t *out)
{
    if (s[0] != MV_RESULT_TYPE || s[1] != 4 || s[2] || s[3] || s[4] != MODWERK_VENDOR_INTERFACE || s[5] ||
        s[6] != 32 || s[7]) return 0;
    uint32_t words[6] = {modwerk_runtime_calls(), modwerk_runtime_value(), modwerk_runtime_active() != 0,
                         frames, refusals, resets};
    out[0] = 'M'; out[1] = 'W'; out[2] = 'U'; out[3] = 'D'; out[4] = 1; out[5] = out[6] = out[7] = 0;
    for (uint32_t i = 0; i < 24; ++i) out[8 + i] = (uint8_t)(words[i / 4] >> (24 - 8 * (i % 4)));
    return 1;
}

/* Unknown-request tail. A length sends modwerk_ep0_reply; 0 leaves a request
 * that is not ours to the stock STALL; REFUSE stalls EP0 both ways; RECEIVING
 * returns with our data stage primed and no status yet. */
uint32_t modwerk_ep0_dispatch(void);
uint32_t modwerk_ep0_dispatch(void)
{
    struct mv_transport *t = vendor();
    uint8_t *out = UNCACHED(reply);
    struct mv_reply r = mv_setup(t, SETUP);
    if (receiving) { /* mv_setup abandoned it; take it off the queue too. */
        receiving = 0;
        flush_receive();
    }
    if (r.action == MV_PASS) return 0;
    if (r.action == MV_STALL && diag(SETUP, out)) { /* mv_setup stalls requests it does not know */
        modwerk_ep0_reply = out;
        return 32;
    }
    if (r.action == MV_RECEIVE) {
        /* Only from stock's idle state: in state 10 its completion loop
         * would spin on our completion bit. A refusal is retryable. */
        if (EP0_STATE != 11u || EP0_OUT_AWAITED) {
            mv_abandon(t);
            ++refusals;
            return MODWERK_EP0_REFUSE;
        }
        struct dtd *d = UNCACHED(&data_dtd);
        uint32_t at = (uint32_t)(uintptr_t)r.buffer;
        d->next = 1u;
        d->token = r.length << 16 | DTD_IOC | DTD_ACTIVE;
        d->page[0] = at;
        for (uint32_t i = 1; i < 5; ++i) d->page[i] = (at & ~0xfffu) + 0x1000u * i;
        ((volatile uint32_t *)(uintptr_t)EP0_OUT_QH)[2] = (uint32_t)(uintptr_t)d;
        ENDPTPRIME = ENDPTPRIME | 1u;
        expected = r.length;
        receiving = 1;
        return MODWERK_EP0_RECEIVING;
    }
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
        mv_abandon(t);
        flush_receive();
        return;
    }
    uint32_t token = ((volatile struct dtd *)UNCACHED(&data_dtd))->token;
    if (token & DTD_ACTIVE) return;
    receiving = 0;
    ENDPTCOMPLETE = 1u; /* Ours, if the stock loop has not taken it. */
    uint32_t received = token & DTD_ERRORS ? 0 : expected - (token >> 16 & 0x7fffu);
    if (mv_data(t, received)) {
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
    if (receiving) {
        receiving = 0;
        flush_receive();
    }
    if (mv_reset(t)) wake();
}

/* Engine task, on every return to its receive. Cheap unless woken. */
void modwerk_engine_idle(void);
void modwerk_engine_idle(void)
{
    if (!wake_posted) return;
    wake_posted = 0;
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
        if (!mu_init(&controller, modwerk_runtime_staging, sizeof modwerk_runtime_staging,
                     modwerk_base_digest, session, modwerk_base_digest, 0, &modwerk_runtime_backend)) return;
        controller_started = 1;
    }
    (void)mv_service(UNCACHED(&transport), &controller);
}
