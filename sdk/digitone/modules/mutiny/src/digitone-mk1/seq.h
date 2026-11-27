/* SPDX-License-Identifier: GPL-2.0-or-later */
/* seq-events (mods/seq-events-dn1) for the Digitone mk1: the Digitone's sizes, then the API every
 * device shares (seq-events.h; docs/ADAPTING.md, "Step-fire events"):
 *
 *     #include "digitone-mk1/seq.h"
 *
 * The Digitone keeps a key for every track: sq_track_info never gives SQ_ROOT_NONE. */
#ifndef ELEKLOADER_DIGITONE_MK1_SEQ_H
#define ELEKLOADER_DIGITONE_MK1_SEQ_H

#define SQ_AUDIO  4                     /* tracks 0-3: the synth tracks */
#define SQ_TRACKS 8                     /* then 4-7: the MIDI tracks */
#define SQ_STEPS  64
#define SQ_NOTES  8                     /* a step's notes: the note and up to 7 intervals (a chord) */
#define SQ_SLOTS  79                    /* a sound's parameter slots, 0 to SQ_SLOTS - 1 */

#include "seq-events.h"

#endif
