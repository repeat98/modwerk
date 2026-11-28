/* SPDX-License-Identifier: GPL-3.0-or-later
 * Stock's USB DISK replies (INQUIRY, REQUEST SENSE, READ CAPACITY and the status after each) go out through transfer
 * descriptors 4-15 of its pool (0x46c95000, 32 bytes each, the token in the second long, ACTIVE in bit 7), taken in
 * turn inside the USB interrupt (level 4), which spins until the next one is inactive (OS 1.40C 0x4001cc2c, 0x4001c8e6
 * and the status sender's 0x4001cee6-0x4001cef2). The base always offers mass storage, so a host probes it after every
 * reconnect. A bus reset or session end leaves a reply primed before it ACTIVE for good: the controller retires nothing
 * once the bus is gone, and stock's own ring reset clears slots 4-14 only. When the ring came round to that slot the
 * interrupt spun forever: USB and the UI dead, the audio frames running, until a power cycle (owner's MKII, 27 November
 * 2026: freeze PC 0x4001cc30, level 4, a USB Audio install a minute after a rollback; a beta unit on 0.8.2 the same
 * day: PC 0x4001cee6-0x4001cef0, level 4, host reconnects after an idle laptop). After a reset the slots carry nothing,
 * so ep0.c's bus-reset hook flushes the mass-storage IN endpoint (EP1) and clears every send slot's token, as stock's
 * reset clears 4-14. */
#ifndef USB_STOCK_SENDS_H
#define USB_STOCK_SENDS_H
#include <stdint.h>

#define USB_STOCK_SEND_FIRST 4u
#define USB_STOCK_SEND_LAST 15u
#define USB_STOCK_SEND_EP1_IN 0x00020000u /* ENDPTFLUSH: bit 16 + 1, EP1's transmit side */
#define USB_STOCK_SEND_SPINS 4096u        /* a flush finishes in microseconds; never wait on it without a bound */

/* pool: the descriptor pool through the uncached alias; flush: ENDPTFLUSH. Interrupt context, or the USB interrupt
 * held off: stock's sender runs in that interrupt, so no reply is being queued meanwhile. */
static inline void usb_stock_sends_retire(volatile uint32_t *pool, volatile uint32_t *flush)
{
    *flush = USB_STOCK_SEND_EP1_IN;
    for (unsigned n = 0; (*flush & USB_STOCK_SEND_EP1_IN) && n < USB_STOCK_SEND_SPINS; ++n) {}
    for (unsigned s = USB_STOCK_SEND_FIRST; s <= USB_STOCK_SEND_LAST; ++s) pool[8u * s + 1u] = 0;
}
#endif
