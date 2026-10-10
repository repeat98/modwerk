/* SPDX-License-Identifier: GPL-3.0-or-later
 * OS 1.40C glue for the EP0 vendor transport (sdk/runtime/upload/vendor.c).
 * modwerk_ep0_shim (usb_base.s) calls this from the USB ISR's unknown-request
 * tail. IDENTIFY only: SUBMIT's control OUT data stage is not connected, so
 * the transport is built without MV_CAN_SUBMIT and SUBMIT/RESULT stall. */
#include "vendor.h"
#include "usb_base.h"

#define UNCACHED(p) ((void *)((uintptr_t)(p) + 0x08000000u))
/* The stock copy of the SETUP packet being handled, in USB byte order. */
#define SETUP ((const uint8_t *)0x46c8ce08u)
#define MODWERK_EP0_REFUSE 0xffffffffu

extern const uint8_t modwerk_base_digest[MU_DIGEST_BYTES];
static struct mv_transport transport;
/* usb_ep0_send fills only the first page of its transfer descriptor:
 * 256-byte alignment keeps every reply inside one 4 KiB page. */
static uint8_t reply[256] __attribute__((aligned(256)));
static uint8_t started;
const uint8_t *modwerk_ep0_reply;

/* Bytes to send from modwerk_ep0_reply; 0 for a request that is not ours
 * (the stock STALL); MODWERK_EP0_REFUSE to stall one of ours both ways. The
 * transport and reply are used through the uncached alias: the controller
 * does not snoop the copyback cache. Initialised on the first request; an
 * invalid identity leaves a transport that stalls everything it owns. */
uint32_t modwerk_ep0_dispatch(void);
uint32_t modwerk_ep0_dispatch(void)
{
    struct mv_transport *t = UNCACHED(&transport);
    uint8_t *out = UNCACHED(reply);
    if (!started) {
        (void)mv_init(t, MODWERK_VENDOR_INTERFACE, modwerk_base_digest, MODWERK_MODEL, 0);
        started = 1;
    }
    struct mv_reply r = mv_setup(t, SETUP);
    if (r.action == MV_PASS) return 0;
    /* RECEIVE cannot occur without MV_CAN_SUBMIT; refuse it all the same. */
    if (r.action != MV_SEND || r.length > sizeof reply) return MODWERK_EP0_REFUSE;
    for (uint32_t i = 0; i < r.length; ++i) out[i] = r.buffer[i];
    modwerk_ep0_reply = out;
    return r.length;
}
