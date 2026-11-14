/* SPDX-License-Identifier: GPL-3.0-or-later */
#ifndef CHORD_ARP_PANEL_H
#define CHORD_ARP_PANEL_H

#include <stdint.h>

enum { CHORD, ARP, RHYTHM, GROOVE, PAGE_COUNT, AUDIO_TRACKS = 16 };

struct chord_arp_settings {
    int8_t values[PAGE_COUNT][8];
    uint8_t manual_range;
};

/* Audio scheduling can interrupt panel edits. Each control is a byte. */
extern volatile struct chord_arp_settings chord_arp_tracks[AUDIO_TRACKS];
void chord_arp_intervals(const volatile int8_t chord[8], uint8_t extensions[4]);

#ifdef CHORD_ARP_TRIAL
extern volatile uint32_t chord_arp_project_generation;
int chord_arp_trial_repeat_max(int division);
int chord_arp_note_trig(unsigned int pattern, unsigned int track, unsigned int step);
#endif

#endif
