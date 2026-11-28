#ifndef SS_OT_RECORDS_H
#define SS_OT_RECORDS_H
#include <stddef.h>
#include "adapter.h"
/* Byte-oriented records, explicitly big endian on both host and ColdFire.
 * Caller supplies real source record and its writable capacity.
 * No firmware addresses, hooks, renderer callback or ownership changes.
 * Proposed source page: TUNE DETN MIX OSC WIDE LEVL.
 * OSC raw 0..6 means 1..7 oscillators, never chord polyphony.
 */
typedef struct {
    SSVoice voice;
    int pitch_q8, level;
    uint16_t cached[6];
    unsigned configured;
} SSRecordVoice;
void ss_ot_init(SSRecordVoice* s);
uint32_t ss_ot_pitch_step(int midi_q8);
int ss_ot_params(SSRecordVoice* s,const uint8_t* playback,size_t bytes);
/* Call once before 16 audio samples. START must precede this call at offset 0.
 * For a mid-frame START, call ss_ot_start between source segments. AMP target
 * then updates on the following frame (same <=16-sample latency as V0.4).
 */
void ss_ot_start(SSRecordVoice* s);
int ss_ot_payload(SSRecordVoice* s,uint8_t* record,size_t bytes);
#endif
