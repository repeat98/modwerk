/* SPDX-License-Identifier: GPL-3.0-or-later
 * The attach watchdog (ep0.c's tick; issue #1985). After a RAM boot the unit sometimes ran the new base with its
 * pull-up on and the bus powered, yet the host never reset or enumerated it: no USB until a power cycle, once
 * also a hub replug (owner's MKII, 22 November 2026, about 5 of 16 boots). A hub re-enumerates a port that sees a
 * fresh attach, so a unit left unenumerated for USB_ATTACH_WAIT ticks drops its pull-up for USB_ATTACH_OFF ticks and
 * offers itself again, as a replug would; at most USB_ATTACH_TRIES times until a host enumerates it.
 * Enumerated means the host gave the unit an address (DEVICEADDR.USBADR), which a bus reset clears. PORTSC1 does not
 * tell: a pulled-up port no host has reset yet already reads CCS, PE and SUSP with address 0 (0x0885, owner's MKII,
 * 23 November 2026, the first tick after a RAM boot), so the first version, which left any CCS or SUSP port alone,
 * never acted: that morning a twin ran 15 minutes off USB with no re-offer in its log. An address from before a
 * pulled cable or a pull-up taken off counts only once the bus was reset or the address read 0 since (`fresh`):
 * the register keeps the old address until a reset (after a forced drop on the MKII it still read 4 with the port
 * back at 0x0885, 117 ms before the host's reset), so a port that never resets the unit would pass for enumerated
 * after the first re-offer. A resetting port (PR), an unpowered
 * bus (OTGSC.BSV off: a pulled cable), a pull-up the base or stock holds off, and a link someone owns (stock's
 * USB DISK MODE, the base's own reconnect, an armed RAM boot: `busy`) are left alone. A host that suspends the unit
 * keeps its address. Pure: the caller reads and writes the registers. */
#ifndef MODWERK_USB_ATTACH_H
#define MODWERK_USB_ATTACH_H
#include <stdint.h>

#define USB_ATTACH_WAIT 300u     /* 5 s of the 60 Hz UI tick: a host enumerates within a second of an attach */
#define USB_ATTACH_OFF 30u       /* 0.5 s off the bus, as usb_function.c's own reconnect */
#define USB_ATTACH_TRIES 5u      /* then a hub that never answers (a host asleep, no host) is left alone */
#define USB_ATTACH_RS 0x1u       /* USBCMD.RS: the pull-up */
#define USB_ATTACH_PR 0x100u     /* PORTSC1.PR: the host resets the port (MCF54455RM 10.3.4.14) */
#define USB_ATTACH_BSV 0x800u    /* OTGSC.BSV: the bus is powered */

struct usb_attach { uint16_t detached, off; uint8_t tries, fresh; };
enum usb_attach_action { USB_ATTACH_NONE, USB_ATTACH_DROP, USB_ATTACH_OFFER };

/* One UI tick: DROP takes the pull-up off now, OFFER puts it back. `addr` is DEVICEADDR.USBADR, 0 until a host
 * has addressed the unit. */
static inline enum usb_attach_action usb_attach_tick(struct usb_attach *s, uint32_t usbcmd, uint32_t portsc, uint32_t otgsc, unsigned addr, int busy)
{
    if (s->off) { /* the offer waits for a link someone took meanwhile: its pull-up must come back */
        if (s->off == 1u && busy) return USB_ATTACH_NONE;
        return --s->off ? USB_ATTACH_NONE : USB_ATTACH_OFFER;
    }
    if (!(otgsc & USB_ATTACH_BSV) || !(usbcmd & USB_ATTACH_RS)) { s->detached = 0, s->fresh = 0; return USB_ATTACH_NONE; } /* off the bus: its address is history */
    if ((portsc & USB_ATTACH_PR) || !addr) s->fresh = 1;
    if ((portsc & USB_ATTACH_PR) || (addr && s->fresh)) { s->detached = 0, s->tries = 0; return USB_ATTACH_NONE; } /* enumerated: the next loss counts afresh */
    if (busy) { s->detached = 0; return USB_ATTACH_NONE; }
    if (++s->detached < USB_ATTACH_WAIT || s->tries >= USB_ATTACH_TRIES) return USB_ATTACH_NONE;
    s->detached = 0, s->fresh = 0, ++s->tries, s->off = USB_ATTACH_OFF;
    return USB_ATTACH_DROP;
}
#endif
