/* SPDX-License-Identifier: MIT */
#ifndef BEAT_SLICER_FLEX_SOURCE_H
#define BEAT_SLICER_FLEX_SOURCE_H
#include "flex_metadata.h"
#include "flex_copy.h"

/* Composition of the tested metadata and bounded-copy components. The base
 * supplies verified regions, non-reused lifetimes and real writer ownership.
 * This does not discover/enable admission, assign stock addresses or install
 * hooks. Bindings/callbacks/context remain stable until all sessions retire.
 * A single background owner uses this object; no concurrent session/reentry.
 */
struct bs_flex_source {
    const struct bs_flex_metadata_binding *metadata;
    const struct bs_flex_binding *pcm;
    const struct bs_source_lifetime *identity;
    int (*try_lock)(void *);
    void (*unlock)(void *);
    void *context;
    uint32_t held; /* zero before first use; never reset while owned */
};
extern const struct bs_preview_backend bs_flex_source_backend;
/* Candidate-side complete table capture, under the SAME source lock. It binds
 * to the already validated snapshot identity. No marker publication occurs.
 */
enum bs_provider_reply bs_flex_source_markers_locked(struct bs_flex_source *,
    const struct bs_source_snapshot *, struct bs_marker_table *);
#endif
