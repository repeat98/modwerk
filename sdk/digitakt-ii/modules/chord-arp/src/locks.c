/* SPDX-License-Identifier: GPL-3.0-or-later */
#include "locks.h"

enum { PATTERNS = 128, STEPS = 128, LOCKS = CHORD_ARP_LOCK_CAPACITY };

struct step_lock {
    uint32_t mask;
    uint8_t next;
    uint8_t step;
    int8_t values[PAGE_COUNT][8];
};

/* The UI publishes nodes and values before their link or mask. The sequencer
 * can interrupt the UI and only reads the published entries. Zero is no link. */
static volatile uint8_t heads[PATTERNS][AUDIO_TRACKS];
static volatile struct step_lock locks[LOCKS];

static volatile uint8_t *step_link(unsigned int pattern, unsigned int track, unsigned int step)
{
    if (pattern >= PATTERNS || track >= AUDIO_TRACKS || step >= STEPS) {
        return 0;
    }
    volatile uint8_t *link = &heads[pattern][track];
    while (*link && locks[*link - 1].step != step) {
        link = &locks[*link - 1].next;
    }
    return link;
}

uint32_t chord_arp_lock_mask(unsigned int page, unsigned int knob)
{
    if (page == ARP && (knob == 2 || knob == 3)) {
        return UINT32_C(3) << (ARP * 8 + 2);
    }
    return UINT32_C(1) << (page * 8 + knob);
}

uint32_t chord_arp_lock_read(unsigned int pattern, unsigned int track, unsigned int step,
                             struct chord_arp_settings *result)
{
    volatile uint8_t *const link = step_link(pattern, track, step);
    if (!link || !*link) {
        return 0;
    }
    const volatile struct step_lock *const lock = &locks[*link - 1];
    const uint32_t mask = lock->mask;
    const volatile struct chord_arp_settings *const track_settings = &chord_arp_tracks[track];
    for (unsigned int page = 0; page < PAGE_COUNT; ++page) {
        for (unsigned int knob = 0; knob < 8; ++knob) {
            const uint32_t bit = UINT32_C(1) << (page * 8 + knob);
            result->values[page][knob] = mask & bit ? lock->values[page][knob] : track_settings->values[page][knob];
        }
    }
    result->manual_range = mask & chord_arp_lock_mask(ARP, 2) ? 1 : track_settings->manual_range;
    return mask;
}

int chord_arp_lock_set(unsigned int pattern, unsigned int track, unsigned int step,
                        unsigned int page, unsigned int knob, int8_t value,
                        int8_t low, int8_t high)
{
    volatile uint8_t *const link = step_link(pattern, track, step);
    if (!link) {
        return 0;
    }
    unsigned int index = *link;
    if (!index) {
        for (unsigned int i = 0; i < LOCKS && !index; ++i) {
            if (!locks[i].mask) {
                index = i + 1;
            }
        }
        if (!index) {
            return 0;
        }
        locks[index - 1].step = (uint8_t)step;
        locks[index - 1].next = 0;
    }
    volatile struct step_lock *const lock = &locks[index - 1];
    if (page == ARP && (knob == 2 || knob == 3) &&
        !(lock->mask & chord_arp_lock_mask(ARP, knob))) {
        lock->values[ARP][2] = low;
        lock->values[ARP][3] = high;
    }
    lock->values[page][knob] = value;
    lock->mask |= chord_arp_lock_mask(page, knob);
    *link = (uint8_t)index;
    return 1;
}

void chord_arp_lock_clear(unsigned int pattern, unsigned int track, unsigned int step,
                           uint32_t controls)
{
    volatile uint8_t *const link = step_link(pattern, track, step);
    if (!link || !*link) {
        return;
    }
    volatile struct step_lock *const lock = &locks[*link - 1];
    const uint32_t remaining = lock->mask & ~controls;
    if (!remaining) {
        *link = lock->next;
    }
    lock->mask = remaining;
}

void chord_arp_locks_prune(unsigned int pattern,
                           int (*active)(unsigned int, unsigned int, unsigned int))
{
    if (pattern >= PATTERNS) {
        return;
    }
    for (unsigned int track = 0; track < AUDIO_TRACKS; ++track) {
        volatile uint8_t *link = &heads[pattern][track];
        while (*link) {
            volatile struct step_lock *const lock = &locks[*link - 1];
            if (active(pattern, track, lock->step)) {
                link = &lock->next;
            } else {
                *link = lock->next;
                lock->mask = 0;
            }
        }
    }
}

void chord_arp_locks_reset(void)
{
    for (unsigned int pattern = 0; pattern < PATTERNS; ++pattern) {
        for (unsigned int track = 0; track < AUDIO_TRACKS; ++track) {
            heads[pattern][track] = 0;
        }
    }
    for (unsigned int index = 0; index < LOCKS; ++index) {
        locks[index].mask = 0;
    }
}

unsigned int chord_arp_locks_snapshot(struct chord_arp_saved_lock *saved)
{
    unsigned int count = 0;
    for (unsigned int pattern = 0; pattern < PATTERNS; ++pattern) {
        for (unsigned int track = 0; track < AUDIO_TRACKS; ++track) {
            unsigned int index = heads[pattern][track];
            while (index && index <= LOCKS && count < LOCKS) {
                const volatile struct step_lock *const lock = &locks[index - 1];
                struct chord_arp_saved_lock *const entry = &saved[count++];
                entry->pattern = (uint8_t)pattern;
                entry->track = (uint8_t)track;
                entry->step = lock->step;
                const uint32_t mask = lock->mask;
                for (unsigned int i = 0; i < 4; ++i) {
                    entry->mask[i] = (uint8_t)(mask >> (8 * i));
                }
                for (unsigned int page = 0; page < PAGE_COUNT; ++page) {
                    for (unsigned int knob = 0; knob < 8; ++knob) {
                        entry->values[page][knob] = lock->values[page][knob];
                    }
                }
                index = lock->next;
            }
        }
    }
    return count;
}
