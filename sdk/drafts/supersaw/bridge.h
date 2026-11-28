/* SPDX-License-Identifier: MIT */
#ifndef SUPERSAW_USB_BRIDGE_H
#define SUPERSAW_USB_BRIDGE_H
#include "engine/machine.h"
typedef struct {
    SSMachine engine;
    unsigned ready, pending_start, transport;
    volatile unsigned generation;
    volatile unsigned pending_release;
    volatile unsigned pending_kill;
} SWUSBVoice;
typedef struct {
    uint8_t params[12]; /* Six big-endian halfwords, including pitch fractions. */
    unsigned attack, hold, release, step, transport;
} SWUSBFrame;
void sw_usb_note_start(SWUSBVoice *v);
void sw_usb_note_release(SWUSBVoice *v);
void sw_usb_note_kill(SWUSBVoice *v);
void sw_usb_leave(SWUSBVoice *v);
/* Four header words then n interleaved PCM32 stereo pairs. No stock calls.
 * Invalid input changes neither the voice nor the output. START is consumed
 * only by the last segment, matching the V0.27 frame scheduler. */
int sw_usb_packet(SWUSBVoice *v, const SWUSBFrame *f, unsigned start,
                  unsigned end, uint32_t *packet, unsigned capacity_words);
#endif
