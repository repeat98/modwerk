/* SPDX-License-Identifier: GPL-3.0-or-later */
#ifndef MODWERK_UPLOAD_VENDOR_H
#define MODWERK_UPLOAD_VENDOR_H
#include "wire.h"

/* EP0 vendor transport for the upload controller (development only).
 * The vendor interface has no endpoints: EP3 OUT, the only free endpoint,
 * stays available for USB Audio In. Nothing connects this to the USB stack. */
#define MV_SUBMIT_TYPE 0x41u /* Host to device, vendor, interface. */
#define MV_RESULT_TYPE 0xc1u /* Device to host, vendor, interface. */
#define MV_SUBMIT 1u /* wValue = sequence, data stage = one complete frame. */
#define MV_RESULT 2u /* wValue = 0, wLength = MV_RESULT_BYTES. */
#define MV_IDENTIFY 3u /* wValue = 0, wLength = MV_IDENTITY_BYTES; answered in the ISR. */
#define MV_VERSION 1u
#define MV_RESULT_HEADER 8u
#define MV_RESULT_BYTES (MV_RESULT_HEADER + MU_WIRE_RESPONSE)
/* IDENTIFY, big-endian: "MWUI", transport and wire versions (u8 each),
 * capabilities (u16), maximum frame and result lengths (u16 each), four
 * reserved zero bytes, base digest (32), model (16 ASCII, zero-padded). */
#define MV_IDENTITY_BYTES 64u
#define MV_MODEL_BYTES 16u
/* SUBMIT/RESULT carry frames. Clear while the glue cannot receive a data
 * stage: both requests then stall and the host can see why. */
#define MV_CAN_SUBMIT 1u

/* What the host learns about its latest sequence. REFUSED: never executed. */
enum mv_status { MV_NONE, MV_PENDING, MV_READY, MV_REFUSED };
/* PASS: not addressed to this interface; the caller keeps its own handling. */
enum mv_action { MV_PASS, MV_STALL, MV_RECEIVE, MV_SEND };
struct mv_reply { enum mv_action action; uint8_t *buffer; uint32_t length; };

/* Ownership: the USB ISR calls mv_setup/mv_data/mv_reset; the controller's
 * engine-task owner calls mv_service. The ISR never touches a QUEUED frame
 * and the engine only completes QUEUED, so each phase change has one writer.
 * The glue must place this structure on the uncached alias (the controller
 * does not snoop the copyback cache) and keep MV_SEND buffers within one
 * transfer-descriptor page or link the page fix. */
struct mv_transport {
    uint8_t frame[MU_WIRE_MAX];
    uint8_t result[MV_RESULT_BYTES]; /* Engine-written; sent only when READY. */
    uint8_t status[MV_RESULT_HEADER]; /* ISR-written short reply otherwise. */
    uint8_t identity[MV_IDENTITY_BYTES]; /* Constant after mv_init. */
    uint32_t expected;
    uint16_t interface, sequence, capabilities;
    uint8_t ready;
    volatile uint8_t phase;
    volatile uint8_t resets, handled; /* ISR-only and engine-only writers. */
};

/* Zero when the model is not 1-16 printable ASCII characters or an unknown
 * capability is set; the transport then answers nothing (every request stalls). */
int mv_init(struct mv_transport *, uint16_t interface, const uint8_t base[MU_DIGEST_BYTES],
            const char *model, uint16_t capabilities);
/* SETUP for any unhandled request. RECEIVE: fill buffer with exactly length
 * bytes, then call mv_data. A SETUP during a data stage abandons that frame. */
struct mv_reply mv_setup(struct mv_transport *, const uint8_t setup[8]);
/* The control transfer in progress ended without its data stage, for
 * example a SETUP the stock stack handled itself. */
void mv_abandon(struct mv_transport *);
/* Data stage complete. Non-zero: acknowledge status and wake the owner. */
int mv_data(struct mv_transport *, uint32_t received);
/* Bus reset or unplug. Non-zero: wake the owner. */
int mv_reset(struct mv_transport *);
/* Engine task only. Non-zero when it did work. */
int mv_service(struct mv_transport *, struct mu_context *);
#endif
