/* SPDX-License-Identifier: GPL-3.0-or-later
 * Internal stopped-editor primitive. Caller owns one project's session and
 * supplies its committed bank. No input callbacks or native pattern access.
 */
#ifndef CLYPS_REFERENCE_CLIPBOARD_H
#define CLYPS_REFERENCE_CLIPBOARD_H
#include <stdint.h>

enum clyps_object { CLYPS_EMPTY, CLYPS_ROW, CLYPS_CELL };
struct clyps_location {
    enum clyps_object kind;
    unsigned bank, row, track; /* zero-based; track is ignored for rows */
};
struct clyps_clipboard {
    struct clyps_location source;
    uint32_t value;
};

static inline void clyps_clip_clear(struct clyps_clipboard *clip)
{
    *clip = (struct clyps_clipboard){0};
}

static inline int clyps_location_valid(struct clyps_location where)
{
    return where.bank < 16 && where.row < 16 &&
           (where.kind == CLYPS_ROW || (where.kind == CLYPS_CELL && where.track < 8));
}

static inline int clyps_clip_copy(struct clyps_clipboard *clip,
                                  const uint32_t rows[16], uint16_t defined,
                                  struct clyps_location from)
{
    clyps_clip_clear(clip);
    if (!clyps_location_valid(from) || !(defined & (1u << from.row)))
        return 0;
    clip->source = from;
    clip->value = rows[from.row];
    if (from.kind == CLYPS_CELL)
        clip->value = (clip->value >> (4 * from.track)) & 15u;
    return 1;
}

/* Call only on actual paste/confirmation. No staged write on cancellation.
 * The adapter must validate the resulting grid before publishing live rows.
 * This function can operate on an editor's staging bank. */
static inline int clyps_clip_paste(const struct clyps_clipboard *clip,
                                   uint32_t rows[16], uint16_t *defined,
                                   struct clyps_location to, int replace)
{
    if (!clyps_location_valid(to) || to.kind != clip->source.kind ||
        to.bank != clip->source.bank)
        return 0;
    unsigned bit = 1u << to.row;
    if ((*defined & bit) && !replace)
        return 0;
    if (to.kind == CLYPS_ROW) {
        rows[to.row] = clip->value;
        *defined |= bit;
    } else {
        if (!(*defined & bit) || to.track != clip->source.track)
            return 0;
        unsigned shift = 4 * to.track;
        rows[to.row] = (rows[to.row] & ~(15u << shift)) | (clip->value << shift);
    }
    return 1;
}
#endif
