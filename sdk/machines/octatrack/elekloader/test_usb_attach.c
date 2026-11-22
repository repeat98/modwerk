/* SPDX-License-Identifier: GPL-3.0-or-later
 * Host check of usb_attach.h (#1985): a powered, pulled-up port the host never attached is dropped after
 * USB_ATTACH_WAIT ticks and offered again USB_ATTACH_OFF ticks later, at most USB_ATTACH_TRIES times until it is
 * attached again; an attached, suspended or resetting port, an unpowered bus, a pull-up held off and a busy link are
 * left alone. */
#include "usb_attach.h"
#include <stdio.h>

static unsigned failures;
#define CHECK(x) do { if (!(x)) { failures++; fprintf(stderr, "%s:%d: %s\n", __FILE__, __LINE__, #x); } } while (0)
#define RS USB_ATTACH_RS
#define BSV USB_ATTACH_BSV
#define CCS 0x1u
#define SUSP 0x80u
#define PR 0x100u

/* Ticks until the first action; the action through *what. */
static unsigned until_action(struct usb_attach *s, uint32_t cmd, uint32_t port, uint32_t otg, int busy, unsigned limit, enum usb_attach_action *what)
{
    for (unsigned t = 1; t <= limit; ++t) {
        enum usb_attach_action a = usb_attach_tick(s, cmd, port, otg, busy);
        if (a != USB_ATTACH_NONE) { *what = a; return t; }
    }
    *what = USB_ATTACH_NONE;
    return 0;
}

int main(void)
{
    enum usb_attach_action what;
    struct usb_attach s = {0, 0, 0};
    /* Left alone: attached, suspended, resetting; no bus power; the pull-up off; a busy link. */
    CHECK(until_action(&s, RS, CCS, BSV, 0, 2000u, &what) == 0);
    CHECK(until_action(&s, RS, SUSP, BSV, 0, 2000u, &what) == 0);
    CHECK(until_action(&s, RS, PR, BSV, 0, 2000u, &what) == 0);
    CHECK(until_action(&s, RS, 0, 0, 0, 2000u, &what) == 0);
    CHECK(until_action(&s, 0, 0, BSV, 0, 2000u, &what) == 0);
    CHECK(until_action(&s, RS, 0, BSV, 1, 2000u, &what) == 0);
    /* Never enumerated: dropped after the wait, offered again after the off time. */
    CHECK(until_action(&s, RS, 0, BSV, 0, 2000u, &what) == USB_ATTACH_WAIT && what == USB_ATTACH_DROP);
    CHECK(until_action(&s, 0, 0, BSV, 0, 2000u, &what) == USB_ATTACH_OFF && what == USB_ATTACH_OFFER);
    /* A host that still never answers: at most USB_ATTACH_TRIES drops in all. */
    unsigned drops = 1;
    for (unsigned i = 0; i < 20u; ++i) {
        if (!until_action(&s, RS, 0, BSV, 0, 2000u, &what) || what != USB_ATTACH_DROP) break;
        ++drops;
        CHECK(until_action(&s, 0, 0, BSV, 0, 2000u, &what) == USB_ATTACH_OFF && what == USB_ATTACH_OFFER);
    }
    CHECK(drops == USB_ATTACH_TRIES);
    /* Attached again: the next loss counts afresh. */
    CHECK(usb_attach_tick(&s, RS, CCS, BSV, 0) == USB_ATTACH_NONE);
    CHECK(until_action(&s, RS, 0, BSV, 0, 2000u, &what) == USB_ATTACH_WAIT && what == USB_ATTACH_DROP);
    CHECK(until_action(&s, 0, 0, BSV, 0, 2000u, &what) == USB_ATTACH_OFF && what == USB_ATTACH_OFFER);
    /* An attach part way through the wait starts it over. */
    for (unsigned t = 0; t < USB_ATTACH_WAIT - 1u; ++t) CHECK(usb_attach_tick(&s, RS, 0, BSV, 0) == USB_ATTACH_NONE);
    CHECK(usb_attach_tick(&s, RS, CCS, BSV, 0) == USB_ATTACH_NONE);
    CHECK(until_action(&s, RS, 0, BSV, 0, 2000u, &what) == USB_ATTACH_WAIT && what == USB_ATTACH_DROP);
    if (failures) return 1;
    puts("usb_attach: ok");
    return 0;
}
