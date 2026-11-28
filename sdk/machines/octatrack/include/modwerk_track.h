/* SPDX-License-Identifier: MIT */
#ifndef MODWERK_TRACK_H
#define MODWERK_TRACK_H
#include <stdint.h>

/* Proposed returning-processor service. A module owns its values and project
 * files. entry must resolve inside its exact published trusted controller.
 * Each packed word is T1..T4 or T5..T8, most significant byte first, 0..128.
 * 1: both cores acknowledged these exact bytes/epoch/revision; 0: pending;
 * negative: unavailable/closed. Never call from the audio interrupt. */
int modwerk_track_controls(uintptr_t entry,uint32_t epoch,uint32_t revision,
                           uint32_t tracks_lo,uint32_t tracks_hi);

/* Read-only publication identity for this execution image. Unrelated module
 * changes preserve it; republishing the same predecessor after Undo changes it.
 * Zero means absent or exhausted: do not infer continuity or readiness. */
uint32_t modwerk_track_publication(uintptr_t entry);
#endif
