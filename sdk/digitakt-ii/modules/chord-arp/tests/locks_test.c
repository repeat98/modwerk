/* SPDX-License-Identifier: GPL-3.0-or-later */
#include <assert.h>
#include "locks.h"

volatile struct chord_arp_settings chord_arp_tracks[AUDIO_TRACKS];

int main(void)
{
    struct chord_arp_settings result;
    chord_arp_tracks[3].values[CHORD][0] = 1;
    assert(!chord_arp_lock_read(4, 3, 127, &result));
    assert(chord_arp_lock_set(4, 3, 127, CHORD, 0, 2, 0, 0));
    assert(chord_arp_lock_set(4, 3, 127, ARP, 2, -1, 0, 2));
    assert(chord_arp_lock_set(4, 3, 127, ARP, 3, 1, -1, 2));
    assert(chord_arp_lock_read(4, 3, 127, &result) ==
           (chord_arp_lock_mask(CHORD, 0) | chord_arp_lock_mask(ARP, 2)));
    assert(result.values[CHORD][0] == 2 && result.manual_range);
    assert(result.values[ARP][2] == -1 && result.values[ARP][3] == 1);
    assert(!chord_arp_lock_read(3, 3, 127, &result));
    assert(!chord_arp_lock_read(4, 2, 127, &result));
    assert(!chord_arp_lock_read(4, 3, 126, &result));

    chord_arp_lock_clear(4, 3, 127, chord_arp_lock_mask(ARP, 3));
    assert(chord_arp_lock_read(4, 3, 127, &result) == chord_arp_lock_mask(CHORD, 0));
    assert(!result.manual_range);
    chord_arp_lock_clear(4, 3, 127, UINT32_MAX);
    assert(!chord_arp_lock_read(4, 3, 127, &result));

    for (unsigned int step = 0; step < 128; ++step) {
        assert(chord_arp_lock_set(0, 0, step, CHORD, 0, 1, 0, 0));
    }
    assert(!chord_arp_lock_set(0, 1, 0, CHORD, 0, 1, 0, 0));
    chord_arp_lock_clear(0, 0, 16, UINT32_MAX);
    assert(chord_arp_lock_set(0, 1, 0, CHORD, 0, 1, 0, 0));
    assert(chord_arp_lock_read(0, 0, 17, &result));
    chord_arp_locks_reset();
    assert(!chord_arp_lock_read(0, 0, 17, &result));
    assert(!chord_arp_lock_read(0, 1, 0, &result));
    assert(chord_arp_lock_set(1, 1, 0, CHORD, 0, 1, 0, 0));
    return 0;
}
