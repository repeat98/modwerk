/* SPDX-License-Identifier: GPL-2.0-or-later */
/* Analog Rytm MKII core (Modwerk): fields modules keep with the unit's own data.
 *
 * A module declares each field in build.json (name, scope, bits). The site's linker places it from the build's
 * lockfile and defines the field's symbol as an absolute value, its descriptor: the scope in bits 28..31, the width
 * (1..32) in bits 22..27 and the first bit in bits 0..21, bits counted from the most significant one. A field reads
 * 0 until it is set, and also when the stored data was written by a different layout.
 *
 *   scope    item              index          room per item
 *   sound    the live sound    unused         56 bits
 *   kit      the live kit      unused         64 bits
 *   global   unused            slot 0..3      40 bits
 *   track    the live pattern  track 0..12    as the build's split gives
 *   pattern  the live pattern  unused         as the build's split gives
 *   project  unused            unused         what the split leaves
 *
 * Both calls mask interrupts for the whole access, so the UI, an event handler and the audio interrupt may all use
 * them. An ev_project handler, void f(int how, unsigned dropped), runs after a project is created (how
 * CORE_PROJECT_NEW, dropped 0) or loaded, at boot too (how CORE_PROJECT_LOADED): dropped has STORE_DROPPED(scope)
 * set for each of the global, track, pattern and project scopes that came in as zeros. */
#ifndef ELEKLOADER_AR2_STORE_H
#define ELEKLOADER_AR2_STORE_H

#define STORE_FIELD(sym) extern char sym[]
#define STORE(sym) ((unsigned)(sym))
#define STORE_SCOPE(f) ((f) >> 28)
#define STORE_BITS(f) (((f) >> 22) & 63)
#define STORE_OFFSET(f) ((f) & 0x3fffff)

#define STORE_SOUND 1
#define STORE_KIT 2
#define STORE_GLOBAL 3
#define STORE_TRACK 4
#define STORE_PATTERN 5
#define STORE_PROJECT 6

#define CORE_PROJECT_NEW 0
#define CORE_PROJECT_LOADED 1
#define STORE_DROPPED(scope) (1u << (scope))

unsigned core_store_get(unsigned field, void *item, int index);
void core_store_set(unsigned field, void *item, int index, unsigned value);

#endif
