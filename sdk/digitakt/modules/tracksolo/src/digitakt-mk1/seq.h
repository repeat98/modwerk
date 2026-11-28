/* SPDX-License-Identifier: GPL-2.0-or-later */
/* seq-events (mods/seq-events-dt1) for the Digitakt mk1: the Digitakt's sizes, then the API every
 * device shares (seq-events.h; docs/ADAPTING.md, "Step-fire events"):
 *
 *     #include "digitakt-mk1/seq.h"
 *
 * The Digitakt keeps no keyboard key: sq_track_info gives SQ_ROOT_NONE and SQ_SCALE_NONE. Its audio
 * tracks play one note: notes[1..] mean something on its MIDI tracks only. */
#ifndef ELEKLOADER_DIGITAKT_MK1_SEQ_H
#define ELEKLOADER_DIGITAKT_MK1_SEQ_H

#define SQ_AUDIO  8                     /* tracks 0-7: the audio tracks */
#define SQ_TRACKS 16                    /* then 8-15: the MIDI tracks */
#define SQ_STEPS  64
#define SQ_NOTES  4                     /* a MIDI track's notes: the note and up to 3 intervals */
#define SQ_SLOTS  53                    /* a step's parameter locks, 0 to SQ_SLOTS - 1 */

#include "seq-events.h"

#endif
