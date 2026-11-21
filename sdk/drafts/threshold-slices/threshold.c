/* SPDX-License-Identifier: MIT */
#include "threshold.h"
void ts_scan_begin(struct ts_scan *s, uint32_t trim_start, uint32_t trim_end,
    uint32_t rate, uint32_t percent, uint32_t gap_ms)
{
    uint32_t i;
    s->trim_start=trim_start;s->trim_end=trim_end;s->rate=rate?rate:44100u;
    s->percent=percent;s->gap_ms=gap_ms;s->pad=s->rate*2u/1000u;
    s->minimum=s->level=s->peak=0;s->phase=0;s->cursor=trim_start;s->count=0;
    s->status=TS_OK;s->armed=1;s->have_prev=0;s->previous=0;s->envelope=0;
    for(i=0;i<TS_MAX;++i)s->starts[i]=0;
    if(trim_start>=trim_end || trim_end-trim_start<64u){s->phase=2;s->status=TS_SHORT;}
}
static void finish_empty(struct ts_scan *s)
{s->phase=2;s->status=TS_EMPTY;s->count=0;}
static void begin_hits(struct ts_scan *s)
{
    uint32_t gap=s->gap_ms*(s->rate/1000u)+(s->gap_ms*(s->rate%1000u))/1000u;
    s->minimum=gap>64u?gap:64u;
    /* peak * percent / 100 without a 64-bit helper: the ColdFire package links no libgcc. */
    s->level=(s->peak/100u)*s->percent + (s->peak%100u)*s->percent/100u;
    s->cursor=s->trim_start;s->have_prev=0;s->armed=1;s->previous=0;s->envelope=0;
    if(!s->peak || !s->level){finish_empty(s);return;}
    s->count=1;s->starts[0]=s->trim_start;s->phase=1;
}
void ts_scan_begin_peak(struct ts_scan *s, uint32_t trim_start, uint32_t trim_end,
    uint32_t rate, uint32_t percent, uint32_t gap_ms, uint32_t known_peak)
{
    ts_scan_begin(s,trim_start,trim_end,rate,percent,gap_ms);
    if(s->phase>=2u)return;
    s->peak=known_peak;begin_hits(s);
}
static void add_hit(struct ts_scan *s, uint32_t frame)
{
    uint32_t start=frame>s->pad?frame-s->pad:0u, previous=s->starts[s->count-1u];
    if(start<s->trim_start)start=s->trim_start;
    if(start<previous+s->minimum) {
        if(frame<previous+s->minimum)return;
        start=frame;
    }
    if(start>=s->trim_end || s->trim_end-start<64u)return;
    if(s->count>=TS_MAX){s->phase=2;s->status=TS_TOO_MANY;return;}
    s->starts[s->count++]=start;
}
unsigned ts_scan_feed(struct ts_scan *s, uint32_t at, const int32_t *peaks, uint32_t count)
{
    uint32_t i;
    if(s->phase>=2u)return 1;
    if(at!=s->cursor || (count && !peaks)){s->phase=2;s->status=TS_FAILED;return 1;}
    if(s->cursor>=s->trim_end) {
        if(!s->phase)begin_hits(s);
        else if(s->phase==1u) {
            s->phase=2;
            if(s->status==TS_OK && s->count<2u)finish_empty(s);
        }
        return s->phase>=2u;
    }
    for(i=0;i<count && s->phase<2u;++i) {
        int32_t sample=peaks[i]<0?0:peaks[i];
        uint32_t frame=s->cursor;
        if(!s->phase){if((uint32_t)sample>s->peak)s->peak=(uint32_t)sample;}
        else {
            /* Instant attack, release of about 20 ms. A held tone stays up
             * between its zero crossings, so it becomes one slice. */
            uint32_t mag=(uint32_t)sample,release=s->rate/50u;
            if(!release)release=1u;
            if(mag>=s->envelope)s->envelope=mag;
            else {
                uint32_t drop=s->envelope/release;
                if(!drop)drop=1u;
                s->envelope=s->envelope>drop?s->envelope-drop:0u;
            }
            if(s->have_prev && s->armed && (uint32_t)s->previous<=s->level && s->envelope>s->level)
                add_hit(s,frame);
            if(s->envelope<=s->level/2u)s->armed=1;
            else if(s->envelope>s->level)s->armed=0;
            s->previous=(int32_t)s->envelope;s->have_prev=1;
        }
        s->cursor=frame+1u;
        if(s->cursor>=s->trim_end) {
            if(!s->phase)begin_hits(s);
            else if(s->phase==1u) {
                s->phase=2;
                if(s->status==TS_OK && s->count<2u)finish_empty(s);
            }
            return s->phase>=2u;
        }
    }
    return s->phase>=2u;
}
