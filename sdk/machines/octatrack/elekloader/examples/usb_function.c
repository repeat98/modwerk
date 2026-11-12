/* SPDX-License-Identifier: GPL-3.0-or-later
 * The smallest module that adds a USB function to the Modwerk base (events.json ot_usb_functions), and the fixture
 * of scripts/verify-octatrack-usb-function.mjs. It contributes two vendor-class interfaces, 4 and 5, with one bulk
 * IN endpoint 3 that it never uses, and subscribes to the three hooks the base raises for a function:
 *
 *   python3 -B sdk/runtime/loader/build.py sdk/machines/octatrack/elekloader/examples/usb_function.c \
 *     -o usb_function.mwrm --subscribe ot_usb_functions:usb_function:50 --subscribe ev_usb_isr:usb_function_isr:50 \
 *     --subscribe ev_usb_bus_end:usb_function_bus_end:50 --subscribe ev_usb_control:usb_function_control:50
 *
 * Installing it makes the base reconnect: the host then reads a configuration with six interfaces. DIAG's value
 * reads back what the hooks saw: bus ends in the top byte, then the class requests it answered, those it was
 * asked about, and 1 once the interrupt hook ran. A real function (USB Audio) also answers SET_INTERFACE and
 * GET_INTERFACE for its interfaces, which are stock sites of its own for now. */
#include "modwerk_module.h"
#include "../../include/modwerk_events.h"

#define SETUP ((const volatile uint8_t *)0x46c8ce08u)  /* the SETUP packet stock read */
#define ENDPTCTRL0 (*(volatile uint32_t *)0xfc0b01c0u)

/* What follows the base's own interfaces in each configuration: an association, the two interfaces, the endpoint
 * (64-byte packets at full speed, 512 at high speed). Every block has the same length. */
#define FUNCTION(packet_low, packet_high) { \
    8, 11, MODWERK_USB_FUNCTION_INTERFACE, 2, 0xff, 0x55, 0, 0, \
    9, 4, MODWERK_USB_FUNCTION_INTERFACE, 0, 0, 0xff, 0x55, 1, 0, \
    9, 4, MODWERK_USB_FUNCTION_INTERFACE + 1, 0, 1, 0xff, 0x55, 2, 0, \
    7, 5, 0x80 | MODWERK_USB_FUNCTION_ENDPOINT, 2, packet_low, packet_high, 0 }
static const uint8_t full[] = FUNCTION(64, 0), high[] = FUNCTION(0, 2);
const struct modwerk_usb_function usb_function = {MODWERK_USB_FUNCTION_ABI, sizeof usb_function, 2, sizeof full,
                                                  0x00080000u /* endpoint 3 IN */, full, high, full, high};

static volatile uint32_t interrupts, ends, asked, answered;

/* The USB interrupt: a function retires its own endpoint's completions here. This one only counts. */
unsigned usb_function_isr(void) { interrupts = interrupts + 1; return 0; }
/* A bus reset, the cable pulled or the base's own reconnect: back to alternate setting 0. */
unsigned usb_function_bus_end(void) { ends = ends + 1; return 0; }
/* A request stock and the base do not know. A class IN request 0x70 to interface 4 is this function's: it refuses
 * it itself, both ways, and says so; every other request is not its own. */
unsigned usb_function_control(void)
{
    asked = asked + 1;
    if (SETUP[0] != 0xa1 || SETUP[1] != 0x70 || SETUP[4] != MODWERK_USB_FUNCTION_INTERFACE || SETUP[5]) return 0;
    ENDPTCTRL0 = ENDPTCTRL0 | 0x00010001u;
    answered = answered + 1;
    return 1;
}
void module_tick(struct modwerk_runtime_api *api)
{
    api->value = (ends & 0xffu) << 24 | (answered & 0xffu) << 16 | (asked & 0xffu) << 8 | (interrupts ? 1u : 0u);
}
