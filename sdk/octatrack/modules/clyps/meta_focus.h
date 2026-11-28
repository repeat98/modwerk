/* SPDX-License-Identifier: GPL-3.0-or-later */
#ifndef CLYPS_META_FOCUS_H
#define CLYPS_META_FOCUS_H

static inline int clyps_meta_track_key(unsigned key)
{
    return key >= 0x10 && key < 0x18;
}

/* LEVEL edits the focused row or track. Clamp before addition for large deltas. */
static inline unsigned clyps_focus_step(unsigned current, int delta, unsigned last)
{
    if (delta < -(int)current) return 0;
    if (delta > (int)(last - current)) return last;
    return (unsigned)((int)current + delta);
}
#endif
