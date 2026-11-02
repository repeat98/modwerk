/* SPDX-License-Identifier: MIT */
#include "flex_source.h"

static int consistent(const struct bs_flex_source *s) {
    return s && s->metadata && s->pcm && s->identity &&
        s->metadata->ready == s->pcm->ready &&
        s->metadata->controls == s->pcm->controls;
}
static int identity(const struct bs_flex_source *s, const struct bs_source_snapshot *v) {
    const struct bs_source_lifetime *id = s->identity;
    return v && v->owner_id && v->owner_generation && v->sample_id && v->sample_generation &&
        v->editor_generation && v->playback_generation && v->slot < 128 &&
        v->kind == BS_SOURCE_FLEX && v->owner_id == id->owner_id &&
        v->owner_generation == id->owner_generation && v->sample_id == id->sample_id &&
        v->sample_generation == id->sample_generation && v->editor_generation == id->editor_generation &&
        v->playback_generation == id->playback_generation && v->slot == id->slot;
}
static int acquire(void *context) {
    struct bs_flex_source *s = context;
    if (!s || s->held || !s->try_lock || !s->unlock || !s->try_lock(s->context)) return 0;
    s->held = 1;
    return 1;
}
static void release(void *context) {
    struct bs_flex_source *s = context;
    if (!s || !s->held) return;
    s->held = 0;
    s->unlock(s->context);
}
static enum bs_provider_reply capture(void *context, struct bs_source_snapshot *out) {
    struct bs_flex_source *s = context;
    if (!s || !s->held) return BS_PROVIDER_FAILED;
    if (!consistent(s)) return BS_PROVIDER_UNSUPPORTED;
    return bs_flex_snapshot_locked(s->metadata, s->identity, out);
}
static enum bs_provider_reply copied(void *context, const struct bs_source_snapshot *v,
        const struct bs_pcm_read *read, uint8_t *out, uint32_t capacity, uint32_t *bytes) {
    struct bs_flex_source *s = context;
    if (!s || !s->held) return BS_PROVIDER_FAILED;
    if (!consistent(s) || !identity(s, v)) return BS_PROVIDER_UNSUPPORTED;
    /* Session capture/revalidation and this copy share ownership. The native
     * copy separately verifies current control/format/extent and map geometry. */
    return bs_flex_copy_locked(s->pcm, v, read, out, capacity, bytes);
}
const struct bs_preview_backend bs_flex_source_backend = {acquire, release, capture, copied};
enum bs_provider_reply bs_flex_source_markers_locked(struct bs_flex_source *s,
        const struct bs_source_snapshot *v, struct bs_marker_table *out) {
    if (!s || !s->held) return BS_PROVIDER_FAILED;
    if (!consistent(s) || !identity(s, v)) return BS_PROVIDER_UNSUPPORTED;
    return bs_flex_markers_locked(s->metadata, s->identity, out);
}
