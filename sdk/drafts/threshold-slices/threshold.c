/* SPDX-License-Identifier: MIT */
#include "threshold.h"
void ts_scan_begin(struct ts_scan *s, uint32_t trim_start, uint32_t trim_end,
    uint32_t rate, uint32_t percent, uint32_t gap_ms)
{
    uint32_t i;
    s->trim_start=trim_start;s->trim_end=trim_end;s->rate=rate?rate:44100u;
    s->percent=percent;s->gap_ms=gap_ms;s->pad=s->rate*2u/1000u;
    s->minimum=s->level=s->peak=0;s->phase=0;s->cursor=trim_start;s->count=0;
    s->status=TS_OK;s->armed=1;s->have_prev=0;s->previous=0;
    for(i=0;i<TS_MAX;++i)s->starts[i]=0;
    if(trim_start>=trim_end || trim_end-trim_start<64u){s->phase=2;s->status=TS_SHORT;}
}
static void finish_empty(struct ts_scan *s)
{s->phase=2;s->status=TS_EMPTY;s->count=0;}
static void begin_hits(struct ts_scan *s)
{
    uint32_t gap=s->gap_ms*(s->rate/1000u)+(s->gap_ms*(s->rate%1000u))/1000u;
    s->minimum=gap>64u?gap:64u;
    s->level=(uint32_t)(((uint64_t)s->peak*s->percent)/100u);
    s->cursor=s->trim_start;s->have_prev=0;s->armed=1;s->previous=0;
    if(!s->peak || !s->level){finish_empty(s);return;}
    s->count=1;s->starts[0]=s->trim_start;s->phase=1;
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
            if(s->have_prev && s->armed && (uint32_t)s->previous<=s->level && (uint32_t)sample>s->level)
                add_hit(s,frame);
            if((uint32_t)sample<=s->level/2u)s->armed=1;
            else if((uint32_t)sample>s->level)s->armed=0;
            s->previous=sample;s->have_prev=1;
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
