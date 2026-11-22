/* SPDX-License-Identifier: GPL-3.0-or-later
 * The attach watchdog (ep0.c's tick; issue #1985). After a RAM boot the unit sometimes ran the new base with its
 * pull-up on and the bus powered, yet the host never reset or enumerated it: no USB until a power cycle, once
 * also a hub replug (owner's MKII, 22 November 2026, about 5 of 16 boots). A hub re-enumerates a port that sees a
 * fresh attach, so a unit left unattached for USB_ATTACH_WAIT ticks drops its pull-up for USB_ATTACH_OFF ticks and
 * offers itself again, as a replug would; at most USB_ATTACH_TRIES times until the port is active again. A port that
 * is attached, suspended or resetting (PORTSC1 CCS, SUSP or PR), an unpowered bus (OTGSC.BSV off: a pulled cable),
 * a pull-up the base or stock holds off, and a link someone owns (stock's USB DISK MODE, the base's own reconnect,
 * an armed RAM boot: `busy`) are left alone. Pure: the caller reads and writes the registers. */
#ifndef MODWERK_USB_ATTACH_H
#define MODWERK_USB_ATTACH_H
#include <stdint.h>

#define USB_ATTACH_WAIT 300u     /* 5 s of the 60 Hz UI tick: a host enumerates within a second of an attach */
#define USB_ATTACH_OFF 30u       /* 0.5 s off the bus, as usb_function.c's own reconnect */
#define USB_ATTACH_TRIES 5u      /* then a hub that never answers (a host asleep, no host) is left alone */
#define USB_ATTACH_RS 0x1u       /* USBCMD.RS: the pull-up */
#define USB_ATTACH_ACTIVE 0x181u /* PORTSC1 PR, SUSP or CCS (MCF54455RM 10.3.4.14) */
#define USB_ATTACH_BSV 0x800u    /* OTGSC.BSV: the bus is powered */

struct usb_attach { uint16_t detached, off; uint8_t tries; };
enum usb_attach_action { USB_ATTACH_NONE, USB_ATTACH_DROP, USB_ATTACH_OFFER };

/* One UI tick: DROP takes the pull-up off now, OFFER puts it back. */
static inline enum usb_attach_action usb_attach_tick(struct usb_attach *s, uint32_t usbcmd, uint32_t portsc, uint32_t otgsc, int busy)
{
    if (s->off) { /* the offer waits for a link someone took meanwhile: its pull-up must come back */
        if (s->off == 1u && busy) return USB_ATTACH_NONE;
        return --s->off ? USB_ATTACH_NONE : USB_ATTACH_OFFER;
    }
    if (portsc & USB_ATTACH_ACTIVE) { s->detached = 0, s->tries = 0; return USB_ATTACH_NONE; } /* attached: the next loss counts afresh */
    if (busy || !(usbcmd & USB_ATTACH_RS) || !(otgsc & USB_ATTACH_BSV)) { s->detached = 0; return USB_ATTACH_NONE; }
    if (++s->detached < USB_ATTACH_WAIT || s->tries >= USB_ATTACH_TRIES) return USB_ATTACH_NONE;
    s->detached = 0, ++s->tries, s->off = USB_ATTACH_OFF;
    return USB_ATTACH_DROP;
}
#endif
