/* SPDX-License-Identifier: GPL-3.0-or-later */
#ifndef CHORD_ARP_LOCKS_H
#define CHORD_ARP_LOCKS_H

#include "panel.h"

enum { CHORD_ARP_LOCK_CAPACITY = 128 };
struct chord_arp_saved_lock {
    uint8_t pattern, track, step;
    uint8_t mask[4];
    int8_t values[PAGE_COUNT][8];
};

uint32_t chord_arp_lock_read(unsigned int pattern, unsigned int track, unsigned int step,
                             struct chord_arp_settings *result);
int chord_arp_lock_set(unsigned int pattern, unsigned int track, unsigned int step,
                        unsigned int page, unsigned int knob, int8_t value,
                        int8_t low, int8_t high);
void chord_arp_lock_clear(unsigned int pattern, unsigned int track, unsigned int step,
                           uint32_t controls);
uint32_t chord_arp_lock_mask(unsigned int page, unsigned int knob);
void chord_arp_locks_prune(unsigned int pattern,
                           int (*active)(unsigned int, unsigned int, unsigned int));
void chord_arp_locks_reset(void);
unsigned int chord_arp_locks_snapshot(struct chord_arp_saved_lock *saved);

#endif
