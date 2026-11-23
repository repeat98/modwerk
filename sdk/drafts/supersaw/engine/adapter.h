#ifndef SS_ADAPTER_H
#define SS_ADAPTER_H
#include "saw_fixed.h"
#include "amp_tables.h"
/* Laboratory API. No stock pointers, hooks, firmware or hidden global state.
 * Exactly one frame() followed by render chunks totalling 16 samples.
 * An event can be delivered between chunks for a sub-frame note start.
 * AMP targets tick once per frame. Caller owns record headers and DSP bypass.
 */
typedef struct {
    SawFixed saw;
    uint32_t gain, from, target, hold_left, fps;
    unsigned pos;
    int note, detune, mix, width, voices, atk, hold, rel, on, stopped;
} SSVoice;
void ss_init(SSVoice* s);
void ss_controls(SSVoice* s,int detune,int mix,int width,int voices);
void ss_amp(SSVoice* s,int atk,int hold,int rel,unsigned frames_per_step);
void ss_on(SSVoice* s,int midi_note);
void ss_off(SSVoice* s);
void ss_stop(SSVoice* s);
int ss_frame(SSVoice* s);
int ss_render(SSVoice* s,int32_t* stereo,unsigned n);
#endif
