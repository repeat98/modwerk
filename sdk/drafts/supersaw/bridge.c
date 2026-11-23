/* SPDX-License-Identifier: MIT */
#include "bridge.h"
void sw_usb_note_start(SWUSBVoice *v)
{
    if (!v) return;
    if (!v->ready) { ssm_init(&v->engine); v->ready = 1; }
    unsigned next=v->generation+1u;
    v->generation=next?next:1u;
    v->pending_release = 0;
    v->pending_kill = 0;
    v->pending_start = 1;
}
void sw_usb_note_release(SWUSBVoice *v)
{
    /* Task callbacks publish one aligned word; only the audio interrupt edits
     * the live engine. An accepted START has priority over a queued release. */
    if (!v) return;
    unsigned ticket=v->generation;
    if (!v->pending_start) v->pending_release = ticket;
}
void sw_usb_leave(SWUSBVoice *v)
{
    if (!v) return;
    if (v->ready) ssm_kill(&v->engine);
    v->ready = v->pending_start = v->transport = v->pending_release = v->pending_kill = 0;
}
void sw_usb_note_kill(SWUSBVoice *v)
{
    /* A native voice reset can run in a task. Publish a generation ticket;
     * the renderer alone kills the engine. A later START clears the ticket. */
    if (v && v->ready) v->pending_kill = v->generation;
}
int sw_usb_packet(SWUSBVoice *v, const SWUSBFrame *f, unsigned start,
                  unsigned end, uint32_t *packet, unsigned capacity_words)
{
    if (!v || !f || !packet || start > end || end > 16u) return -1;
    unsigned n = end - start;
    if (capacity_words < 4u + 2u*n) return -1;
    int32_t pcm[32];
    if (v->ready) {
        if (v->pending_kill) {
            if (v->pending_kill == v->generation) {
                ssm_kill(&v->engine);
                v->pending_start = 0;
            }
            v->pending_kill = 0;
        }
        if (v->pending_release) {
            if (!v->pending_start && v->pending_release==v->generation)
                ssm_release(&v->engine);
            v->pending_release = 0;
        }
        if (end == 16u) {
            if (!f->transport && v->transport) ssm_kill(&v->engine);
            v->transport = f->transport;
            ssm_clock(&v->engine, f->step);
            ssm_prepare(&v->engine, f->params, (int)f->attack,
                        (int)f->hold, (int)f->release, (int)v->pending_start);
            v->pending_start = 0;
        } else ssm_knobs(&v->engine, f->params);
        if (ssm_render(&v->engine, pcm, n)) return -1;
    } else for (unsigned i = 0; i < 2u*n; ++i) pcm[i] = 0;
    packet[0] = n; packet[1] = start;
    packet[2] = 0x04000000u; packet[3] = start << 26;
    for (unsigned i = 0; i < 2u*n; ++i) packet[4u+i] = (uint32_t)pcm[i];
    return (int)(4u + 2u*n);
}
