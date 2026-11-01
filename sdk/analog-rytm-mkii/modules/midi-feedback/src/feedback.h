/* SPDX-License-Identifier: GPL-3.0-or-later */
#ifndef MIDI_FEEDBACK_H
#define MIDI_FEEDBACK_H
#include <stdint.h>
#define MF_TRACKS 12
#define MF_PARAMS 7
#define MF_COUNT (MF_TRACKS * MF_PARAMS)
#define MF_BUDGET 4
struct mf_cell { uint8_t value, channel, sent_value, sent_channel, valid, sent, refresh; };
struct mf_state { struct mf_cell cells[MF_COUNT]; unsigned cursor, coalesced, deferred; };
typedef int (*mf_send)(unsigned channel, unsigned cc, unsigned value);
void mf_reset(struct mf_state *s);
void mf_request_refresh(struct mf_state *s);
void mf_offer(struct mf_state *s, unsigned track, unsigned parameter, int channel, int value);
unsigned mf_flush(struct mf_state *s, mf_send send);
extern const uint8_t mf_cc[MF_PARAMS];
#endif
