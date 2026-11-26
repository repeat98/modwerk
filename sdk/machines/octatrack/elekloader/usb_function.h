/* SPDX-License-Identifier: GPL-3.0-or-later
 * The USB function a module adds to the base's configuration (usb_function.c; events.json ot_usb_functions). */
#ifndef MODWERK_USB_FUNCTION_H
#define MODWERK_USB_FUNCTION_H
#include <stdint.h>
struct runtime_dsp;

/* The loader's admission (machine_admission_runtime.c), PREPARE with image offsets and SWITCH with addresses: a
 * loader refusal for a package whose ot_usb_functions record the base cannot put into its configuration. */
int modwerk_usb_function_admit(const struct runtime_dsp *to, unsigned operation);
/* Masked, right after a switch rewrote the tables (machine_registry.c's modwerk_machine_tables_changed). */
void modwerk_usb_functions_changed(void);
/* The sys task's 60 Hz tick (ep0.c). quiet: no vendor data stage is open. Returns 1 when the host did not come
 * back to the vendor interface in time after a reconnect: handle it as unplugged. */
int modwerk_usb_function_tick(int quiet);
/* The host spoke to the vendor interface (ep0.c): after its bus reset, a reconnect is over. */
void modwerk_usb_function_host(void);
/* The unit is off the bus or just back by the base's own doing: the bus reset that follows undoes nothing, and
 * the host's silence does not count yet. */
int modwerk_usb_reconnecting(void);
/* The USB interrupt (ep0.c): ev_usb_isr, ev_usb_bus_end; ev_usb_control's answer (nonzero: a function answered). */
void modwerk_usb_function_isr(void);
void modwerk_usb_function_bus_end(void);
unsigned modwerk_usb_function_control(void);
/* The frame interrupt, every 16-sample block (base_usb_functions.py FRAME_SHIM): ev_usb_frame. */
void modwerk_usb_function_frame(void);
/* USB FUNCTION (0xC1, bRequest 41, wValue 0, wLength 8): [0] 0 settled, 1 a reconnect is due, 2 off the bus,
 * 3 back on the bus and waiting for the host to reset it and reach this interface; [1] 1 while the configuration the host reads holds a function; [2] 1 while a
 * module contributes one; [3] reconnects made, modulo 256; [4] of them, those that did not wait for an idle
 * control endpoint; [5]-[7] 0. */
#define MODWERK_USB_FUNCTION_STATUS_BYTES 8u
unsigned modwerk_usb_function_status(uint8_t *out);
/* What the host streams now: bit 0 to it (EP3 IN), bit 1 from it (EP3 OUT); status.c books it (#2251). */
unsigned modwerk_usb_function_streams(void);
#endif
