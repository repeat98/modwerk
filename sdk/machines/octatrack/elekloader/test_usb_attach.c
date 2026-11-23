/* SPDX-License-Identifier: GPL-3.0-or-later
 * Host check of usb_attach.h (#1985): a powered, pulled-up port no host has addressed is dropped after
 * USB_ATTACH_WAIT ticks and offered again USB_ATTACH_OFF ticks later, at most USB_ATTACH_TRIES times until a host
 * enumerates it, whatever PORTSC1 says of CCS and SUSP; an addressed or resetting port, an unpowered bus, a pull-up
 * held off and a busy link are left alone, and an address from before a pulled cable counts only after a reset. */
#include "usb_attach.h"
#include <stdio.h>

static unsigned failures;
#define CHECK(x) do { if (!(x)) { failures++; fprintf(stderr, "%s:%d: %s\n", __FILE__, __LINE__, #x); } } while (0)
#define RS USB_ATTACH_RS
#define BSV USB_ATTACH_BSV
#define CCS 0x1u
#define SUSP 0x80u
#define PR 0x100u

#define IDLE 0x0885u /* what the MKII read before the host reset it: CCS, PE, SUSP, address 0 */

/* Ticks until the first action; the action through *what. */
static unsigned until_action(struct usb_attach *s, uint32_t cmd, uint32_t port, uint32_t otg, unsigned addr, int busy, unsigned limit, enum usb_attach_action *what)
{
    for (unsigned t = 1; t <= limit; ++t) {
        enum usb_attach_action a = usb_attach_tick(s, cmd, port, otg, addr, busy);
        if (a != USB_ATTACH_NONE) { *what = a; return t; }
    }
    *what = USB_ATTACH_NONE;
    return 0;
}

int main(void)
{
    enum usb_attach_action what;
    struct usb_attach s = {0, 0, 0, 0};
    /* Left alone: addressed (running or suspended), resetting; no bus power; the pull-up off; a busy link. */
    CHECK(usb_attach_tick(&s, RS, IDLE, BSV, 0, 0) == USB_ATTACH_NONE); /* the address read 0 once: a later one is this host's */
    CHECK(until_action(&s, RS, CCS, BSV, 4, 0, 2000u, &what) == 0);
    CHECK(until_action(&s, RS, CCS | SUSP, BSV, 4, 0, 2000u, &what) == 0);
    CHECK(until_action(&s, RS, PR, BSV, 0, 0, 2000u, &what) == 0);
    CHECK(until_action(&s, RS, 0, 0, 0, 0, 2000u, &what) == 0);
    CHECK(until_action(&s, 0, 0, BSV, 0, 0, 2000u, &what) == 0);
    CHECK(until_action(&s, RS, 0, BSV, 0, 1, 2000u, &what) == 0);
    /* Never enumerated: dropped after the wait, offered again after the off time. */
    CHECK(until_action(&s, RS, 0, BSV, 0, 0, 2000u, &what) == USB_ATTACH_WAIT && what == USB_ATTACH_DROP);
    CHECK(until_action(&s, 0, 0, BSV, 0, 0, 2000u, &what) == USB_ATTACH_OFF && what == USB_ATTACH_OFFER);
    /* The port the unit showed with no host answering, connected and suspended at address 0, is not enumerated. */
    CHECK(until_action(&s, RS, IDLE, BSV, 0, 0, 2000u, &what) == USB_ATTACH_WAIT && what == USB_ATTACH_DROP);
    CHECK(until_action(&s, 0, IDLE, BSV, 0, 0, 2000u, &what) == USB_ATTACH_OFF && what == USB_ATTACH_OFFER);
    /* A host that still never answers: at most USB_ATTACH_TRIES drops in all. */
    unsigned drops = 2;
    for (unsigned i = 0; i < 20u; ++i) {
        if (!until_action(&s, RS, IDLE, BSV, 0, 0, 2000u, &what) || what != USB_ATTACH_DROP) break;
        ++drops;
        CHECK(until_action(&s, 0, IDLE, BSV, 0, 0, 2000u, &what) == USB_ATTACH_OFF && what == USB_ATTACH_OFFER);
    }
    CHECK(drops == USB_ATTACH_TRIES);
    /* Enumerated again: the next loss counts afresh. */
    CHECK(usb_attach_tick(&s, RS, PR, BSV, 0, 0) == USB_ATTACH_NONE && usb_attach_tick(&s, RS, CCS, BSV, 4, 0) == USB_ATTACH_NONE); /* reset, then addressed */
    CHECK(until_action(&s, RS, IDLE, BSV, 0, 0, 2000u, &what) == USB_ATTACH_WAIT && what == USB_ATTACH_DROP);
    CHECK(until_action(&s, 0, 0, BSV, 0, 0, 2000u, &what) == USB_ATTACH_OFF && what == USB_ATTACH_OFFER);
    /* An address part way through the wait starts it over. */
    for (unsigned t = 0; t < USB_ATTACH_WAIT - 1u; ++t) CHECK(usb_attach_tick(&s, RS, IDLE, BSV, 0, 0) == USB_ATTACH_NONE);
    CHECK(usb_attach_tick(&s, RS, PR, BSV, 0, 0) == USB_ATTACH_NONE && usb_attach_tick(&s, RS, CCS, BSV, 4, 0) == USB_ATTACH_NONE); /* reset, then addressed */
    CHECK(until_action(&s, RS, IDLE, BSV, 0, 0, 2000u, &what) == USB_ATTACH_WAIT && what == USB_ATTACH_DROP);
    /* A link taken during the off time: the offer waits for it, then comes. */
    CHECK(until_action(&s, 0, 0, BSV, 0, 1, 2000u, &what) == 0);
    CHECK(until_action(&s, 0, 0, BSV, 0, 0, 2000u, &what) == 1u && what == USB_ATTACH_OFFER);
    /* A pulled cable, then a port that never resets the unit: the address from before the pull does not count. */
    CHECK(usb_attach_tick(&s, RS, PR, BSV, 0, 0) == USB_ATTACH_NONE && usb_attach_tick(&s, RS, CCS, BSV, 4, 0) == USB_ATTACH_NONE); /* reset, then addressed */
    CHECK(usb_attach_tick(&s, RS, 0, 0, 4, 0) == USB_ATTACH_NONE);
    CHECK(until_action(&s, RS, IDLE, BSV, 4, 0, 2000u, &what) == USB_ATTACH_WAIT && what == USB_ATTACH_DROP);
    CHECK(until_action(&s, 0, IDLE, BSV, 4, 0, 2000u, &what) == USB_ATTACH_OFF && what == USB_ATTACH_OFFER);
    /* And after that re-offer too: the register keeps the address until a reset, so every try is still made. */
    drops = 1;
    for (unsigned i = 0; i < 20u; ++i) {
        if (!until_action(&s, RS, IDLE, BSV, 4, 0, 2000u, &what) || what != USB_ATTACH_DROP) break;
        ++drops;
        CHECK(until_action(&s, 0, 0x0004u, BSV, 4, 0, 2000u, &what) == USB_ATTACH_OFF && what == USB_ATTACH_OFFER);
    }
    CHECK(drops == USB_ATTACH_TRIES);
    /* The pull-up held off by someone else, then back with the old address and no reset: not enumerated either. */
    CHECK(usb_attach_tick(&s, RS, PR, BSV, 0, 0) == USB_ATTACH_NONE);
    CHECK(usb_attach_tick(&s, RS, CCS, BSV, 4, 0) == USB_ATTACH_NONE);
    CHECK(usb_attach_tick(&s, 0, 0x0004u, BSV, 4, 0) == USB_ATTACH_NONE);
    CHECK(until_action(&s, RS, IDLE, BSV, 4, 0, 2000u, &what) == USB_ATTACH_WAIT && what == USB_ATTACH_DROP);
    CHECK(until_action(&s, 0, 0x0004u, BSV, 4, 0, 2000u, &what) == USB_ATTACH_OFF && what == USB_ATTACH_OFFER);
    /* The same replug into a host that resets and addresses it: enumerated. */
    CHECK(usb_attach_tick(&s, RS, PR, BSV, 0, 0) == USB_ATTACH_NONE);
    CHECK(until_action(&s, RS, CCS, BSV, 7, 0, 2000u, &what) == 0);
    if (failures) return 1;
    puts("usb_attach: ok");
    return 0;
}
