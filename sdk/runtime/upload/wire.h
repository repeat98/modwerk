/* SPDX-License-Identifier: GPL-3.0-or-later */
#ifndef MODWERK_UPLOAD_WIRE_H
#define MODWERK_UPLOAD_WIRE_H
#include "upload.h"
#define MU_WIRE_VERSION 1u
#define MU_WIRE_HEADER 48u
#define MU_WIRE_RESPONSE 144u
#define MU_WIRE_MAX (MU_WIRE_HEADER + 4u + MU_MAX_CHUNK)
enum mu_command {
    MU_HELLO, MU_ENTER, MU_BEGIN, MU_CHUNK, MU_VERIFY, MU_COMMIT,
    MU_ACCEPT, MU_ROLLBACK, MU_ABORT, MU_LEAVE, MU_DISCONNECT
};
/* Decode one complete bounded frame on the controller's owner task. Output
 * must be separate from request/staging/context; short output cannot mutate.
 * Returns response bytes, or zero if no safe response can be produced. */
uint32_t mu_request(struct mu_context *, const uint8_t *, uint32_t, uint8_t *, uint32_t);
#endif
