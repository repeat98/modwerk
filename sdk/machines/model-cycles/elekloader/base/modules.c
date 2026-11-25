/* SPDX-License-Identifier: GPL-3.0-or-later
 * Every base (base.json's add): loading modules without a reflash over the link. The
 * Octatrack's upload controller (sdk/runtime/upload: wire envelope version 1) drives the runtime loader's backend
 * (sdk/runtime/loader); where the Octatrack carries one wire frame in an EP0 data stage, the link carries it in parts
 * (link.c: UP_PART, then UP_RUN), each SysEx under 128 bytes as stock's own upgrade messages are. Frames run on the UI
 * task (ev_tick), the controller's one owner; nothing here runs in the MIDI task or an interrupt.
 *
 * Trial, Keep and Undo are the Octatrack's: a set loads to RAM and runs on trial; the host's ACCEPT keeps it until
 * the next power cycle (this base saves nothing), its ROLLBACK or ten seconds without a link request in any phase
 * but the normal one put the previous set back (as an unplugged Octatrack does). A power cycle always restores the
 * stock state. */
#include <stdint.h>
#include "loader.h"
#include "wire.h"

#define STAGING_BYTES 32768u            /* the largest package this base takes; larger ones are refused (LIMIT) */
#define LAPSE_TICKS 300u                /* about ten seconds of UI ticks */

static uint8_t staging[STAGING_BYTES] __attribute__((aligned(16)));
static struct mu_context mu;
static uint8_t frame[MU_WIRE_MAX];
static uint8_t base_digest[MU_DIGEST_BYTES];
static int started;
static uint32_t quiet, set_crc;
volatile uint32_t mw_modules_frames, mw_modules_lapses;

/* The base's identity for BEGIN: the SHA-256 of the set identity (link.c's CRC of the .run block), big-endian. */
void mw_modules_identity(uint32_t crc)
{
    uint8_t b[4] = {(uint8_t)(crc >> 24), (uint8_t)(crc >> 16), (uint8_t)(crc >> 8), (uint8_t)crc};
    set_crc = crc;
    mu_sha256(b, 4, base_digest);
}

static int start(void)
{
    /* A per-boot session nonce, not a secret: timer counts bound to the base identity. */
    uint32_t seed[5 + MU_DIGEST_BYTES / 4];
    uint8_t session[MU_DIGEST_BYTES];
    if (started) return 1;
#ifdef MODWERK_HOST
    seed[0] = seed[1] = seed[2] = 1u;
#else
    seed[0] = *(volatile uint32_t *)0xfc07000cu, seed[1] = *(volatile uint32_t *)0xfc07400cu;
    seed[2] = *(volatile uint32_t *)0xfc07800cu;
#endif
    seed[3] = set_crc, seed[4] = 0x4d575553u;
    for (unsigned i = 0; i < MU_DIGEST_BYTES; ++i) ((uint8_t *)&seed[5])[i] = base_digest[i];
    mu_sha256((const uint8_t *)seed, sizeof seed, session);
    session[0] |= 1u;
    started = mu_init(&mu, staging, STAGING_BYTES, base_digest, session, base_digest, 0, &modwerk_runtime_backend);
    return started;
}

/* UP_PART: 7-bit packed bytes (link.c's pack) at `offset` of the frame. Returns the bytes taken, 0 when they do not
 * fit the frame or the packing is malformed. */
unsigned mw_modules_part(uint32_t offset, const uint8_t *packed, unsigned n)
{
    unsigned i = 0, out = 0;
    quiet = 0;
    while (i < n) {
        uint8_t top = packed[i++];
        if (top & 0x80) return 0;
        for (unsigned k = 0; k < 7u && i < n; ++k, ++i) {
            if (packed[i] & 0x80 || offset + out >= MU_WIRE_MAX) return 0;
            frame[offset + out++] = (uint8_t)(packed[i] | (top & (0x40u >> k) ? 0x80u : 0u));
        }
    }
    return out;
}

/* UP_RUN: the frame's first `length` bytes, as one wire request. The 144-byte response goes to out; 0 when there is
 * none to give (a malformed frame, no controller). */
unsigned mw_modules_run(uint32_t length, uint8_t *out)
{
    quiet = 0;
    if (length < MU_WIRE_HEADER || length > MU_WIRE_MAX || !start()) return 0;
    mw_modules_frames = mw_modules_frames + 1u;
    return mu_request(&mu, frame, length, out, MU_WIRE_RESPONSE);
}

/* MODS: the pool's free bytes and largest run, the last refusal, the live count, then up to `most` entries of the
 * inventory from `first` (modwerk_runtime_list: "MWI", the count, then 24 bytes an entry). */
unsigned mw_modules_list(uint32_t first, unsigned most, uint8_t *out)
{
    uint32_t largest, free = modwerk_runtime_free(&largest);
    uint32_t words[4] = {free, largest, (uint32_t)modwerk_runtime_refusal(), modwerk_runtime_active()};
    for (unsigned w = 0; w < 4u; ++w)
        for (unsigned b = 0; b < 4u; ++b) out[4u * w + b] = (uint8_t)(words[w] >> (24u - 8u * b));
    return 16u + modwerk_runtime_list(out + 16, first > 255u ? 255u : first, most);
}

/* ev_tick, through link.c: a host that went quiet mid-upload or mid-trial counts as unplugged, so its set goes back;
 * a rollback that playback blocks is retried each tick. */
void mw_modules_tick(void)
{
    if (!started) return;
    if (mu.phase != MU_NORMAL && ++quiet >= LAPSE_TICKS) {
        quiet = 0;
        mw_modules_lapses = mw_modules_lapses + 1u;
        (void)mu_disconnect(&mu);
    } else if (mu.disconnecting)
        (void)mu_disconnect(&mu);
}
