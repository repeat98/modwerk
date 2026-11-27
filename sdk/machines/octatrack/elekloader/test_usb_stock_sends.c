/* SPDX-License-Identifier: GPL-3.0-or-later
 * Host check of usb_stock_sends.h: a bus reset clears the token of every stock send slot (4-15, slot 15 included,
 * which stock's own ring reset leaves), leaves EP0's descriptors and the mass-storage receive slot alone, asks the
 * controller to flush EP1's transmit side, and never waits on a flush that does not finish. */
#include "usb_stock_sends.h"
#include <stdio.h>

static unsigned failures;
#define CHECK(x) do { if (!(x)) { failures++; fprintf(stderr, "%s:%d: %s\n", __FILE__, __LINE__, #x); } } while (0)

int main(void)
{
    uint32_t pool[16 * 8];
    for (unsigned i = 0; i < 16u * 8u; ++i) pool[i] = 0xa5a5a5a5u;
    for (unsigned s = 0; s < 16u; ++s) pool[8u * s + 1u] = 0x00248080u; /* 36 bytes, IOC, ACTIVE */
    uint32_t flush = 0;
    usb_stock_sends_retire(pool, &flush);
    for (unsigned s = 0; s < 16u; ++s) {
        CHECK(pool[8u * s + 1u] == (s >= 4u ? 0u : 0x00248080u)); /* EP0 (0-1) and the receive slot (2) kept */
        CHECK(pool[8u * s] == 0xa5a5a5a5u && pool[8u * s + 2u] == 0xa5a5a5a5u); /* only the token is touched */
    }
    /* The model's flush register never clears: the wait is bounded and the slots are still retired. */
    CHECK(flush == USB_STOCK_SEND_EP1_IN);
    if (failures) return 1;
    puts("usb_stock_sends: ok");
    return 0;
}
