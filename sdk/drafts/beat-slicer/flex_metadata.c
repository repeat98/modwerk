/* SPDX-License-Identifier: MIT */
#include "flex_metadata.h"
#include <stddef.h>

static int aligned(const volatile uint32_t *p) {
    return p && !((uintptr_t)p & 3u);
}
static int region(const volatile uint32_t *p, uint32_t words) {
    return aligned(p) && (uintptr_t)p <= UINTPTR_MAX-words*4u;
}
/* Copy two records per loop to bound address/branch overhead while preserving
 * every inactive row and the original volatile read order. */
typedef char bs_records_divisible_2[(BS_MAX_SLICES % 2) == 0 ? 1 : -1];
static void copy_records(struct bs_marker_record *out, const volatile uint32_t *source) {
    for (uint32_t i=0;i<BS_MAX_SLICES;i+=2) {
        out[0].start=source[0]; out[0].end=source[1]; out[0].loop=source[2];
        out[1].start=source[3]; out[1].end=source[4]; out[1].loop=source[5];
        out+=2; source+=6;
    }
}
static int valid(const struct bs_flex_metadata_binding *b, const struct bs_source_lifetime *id) {
    const volatile uint32_t *c, *s;
    if (!b || !id || !id->owner_id || !id->owner_generation || !id->sample_id ||
        !id->sample_generation || !id->editor_generation || !id->playback_generation || id->slot >= 128 ||
        !aligned(b->ready) || !region(b->controls,(id->slot+1)*11) ||
        !region(b->settings,(id->slot+1)*274) ||
        !aligned(b->editor_kind) || !aligned(b->editor_slot) || !aligned(b->project_bpm24) ||
        b->control_words < (id->slot+1)*11 || b->setting_words < (id->slot+1)*274)
        return 0;
    if (!*b->ready || *b->editor_kind != 1 || *b->editor_slot != id->slot) return 0;
    c = b->controls+id->slot*11; s = b->settings+id->slot*274;
    return c[0] <= 3 && !c[2] && c[4] && c[4] <= 0x7fffffffu &&
        s[75] < s[76] && s[76] <= c[4] && s[273] <= BS_MAX_SLICES;
}
enum bs_provider_reply bs_flex_snapshot_locked(const struct bs_flex_metadata_binding *b,
        const struct bs_source_lifetime *id, struct bs_source_snapshot *out) {
    const volatile uint32_t *c, *s;
    uint32_t format;
    if (!out || !valid(b,id)) return BS_PROVIDER_UNSUPPORTED;
    c = b->controls+id->slot*11; s = b->settings+id->slot*274; format = c[0];
    out->owner_id=id->owner_id; out->owner_generation=id->owner_generation;
    out->sample_id=id->sample_id; out->sample_generation=id->sample_generation;
    out->editor_generation=id->editor_generation; out->playback_generation=id->playback_generation;
    out->kind=BS_SOURCE_FLEX; out->slot=id->slot; out->frames=c[4]; out->sample_rate=44100;
    out->format.bits=format&2?16:24; out->format.channels=format&1?2:1; out->format.little_endian=0;
    out->trim_start=s[75]; out->trim_end=s[76]; out->loop=s[77];
    out->sample_bpm24=s[69]; out->project_bpm24=*b->project_bpm24; out->marker_count=s[273];
    copy_records(out->markers,s+78);
    return BS_PROVIDER_READY;
}
enum bs_provider_reply bs_flex_markers_locked(const struct bs_flex_metadata_binding *b,
        const struct bs_source_lifetime *id, struct bs_marker_table *out) {
    const volatile uint32_t *s;
    if (!out || !valid(b,id)) return BS_PROVIDER_UNSUPPORTED;
    s = b->settings+id->slot*274;
    out->count=s[273];
    copy_records(out->records,s+78);
    return BS_PROVIDER_READY;
}
