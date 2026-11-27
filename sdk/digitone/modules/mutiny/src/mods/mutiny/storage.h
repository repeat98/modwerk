/* SPDX-License-Identifier: GPL-2.0-or-later */
/* MUT2 project record: controls and TB3P seed persist; the source is regenerated on load. */
#ifndef MUTINY_STORAGE_H
#define MUTINY_STORAGE_H

#include "../../src/runtime/runtime.h"
#include <stdint.h>

#define MU_STORE_VER 1u /* layout version inside the MUT2 record */
#define MU_STORE_TRACKS MU_RT_TRACKS
#define MU_STORE_BYTES 116u

/* The core copies this buffer as 32-bit words; the wire format uses explicit byte offsets. */
struct mu_store {
    _Alignas(4) uint8_t bytes[MU_STORE_BYTES];
};

void mu_store_defaults(struct mu_store *s);
int mu_store_valid(const struct mu_store *s);
/* A bad record initializes all tracks OFF/native; valid controls are clamped. */
int mu_store_decode(struct mu_rt *rt, const uint8_t *bytes, uint32_t len);
void mu_store_load(const struct mu_store *s, struct mu_rt *rt);
void mu_store_save(struct mu_store *s, const struct mu_rt *rt);
/* Compare only persisted fields; evolution's transient source does not require a write. */
int mu_store_matches(const struct mu_store *s, const struct mu_rt *rt);

#ifdef MU_STORE_PROBE
extern uint32_t mu_store_probe_saves;
#endif
#endif
