/* SPDX-License-Identifier: MIT
 * Original bounded boundary search. Uses the native pair reader via the base;
 * no firmware body/table or PCM pointer is embedded or exposed to a package.
 */
#ifndef MW_SAMPLE_EDITOR_SNAP_H
#define MW_SAMPLE_EDITOR_SNAP_H
#include <stdint.h>
#define MW_SNAP_POINTS 65u
#define MW_SNAP_READ_LIMIT 65536u
#define MW_SNAP_STEP_PAIRS 32u
enum { MW_SNAP_WORKING, MW_SNAP_DONE, MW_SNAP_READ_ERROR, MW_SNAP_LIMIT, MW_SNAP_INVALID };
struct mw_sample_snap {
    uint32_t anchors[MW_SNAP_POINTS], points[MW_SNAP_POINTS];
    uint32_t count, frames, minimum, channels, stereo;
    uint32_t index, backward, position, forward, reads, result;
};
typedef int (*mw_snap_reader)(void *,uint32_t,int32_t *,int32_t *);
static inline int mw_snap_crossing(int32_t first,int32_t second)
{return !first || !second || ((first<0)!=(second<0));}
static inline unsigned mw_snap_init(struct mw_sample_snap *s,const uint32_t *starts,
    uint32_t count,uint32_t end,uint32_t frames,uint32_t channels,unsigned stereo)
{
    s->result=MW_SNAP_INVALID;
    if(!count || count>=MW_SNAP_POINTS || !frames || frames>0x7fffffffu ||
       end>frames || !channels || channels>3u)return s->result;
    uint32_t minimum=frames<64u?frames:64u;
    for(uint32_t i=0;i<count;++i) {
        uint32_t next=i+1u<count?starts[i+1u]:end;
        if(starts[i]>=next || next-starts[i]<minimum)return s->result;
    }
    for(uint32_t i=0;i<count;++i)s->anchors[i]=s->points[i]=starts[i];
    s->anchors[count]=s->points[count]=end;
    s->count=count;s->frames=frames;s->minimum=minimum;s->channels=channels;s->stereo=stereo!=0;
    s->index=1;s->backward=0;s->position=s->anchors[1]+1u;
    s->forward=UINT32_MAX;s->reads=0;s->result=MW_SNAP_WORKING;
    return s->result;
}
static inline void mw_snap_direction_done(struct mw_sample_snap *s,uint32_t candidate)
{
    if(!s->backward) {
        s->forward=candidate;s->backward=1;
        s->position=s->anchors[s->index]-1u;return;
    }
    uint32_t i=s->index,anchor=s->anchors[i],f=s->forward,b=candidate;
    /* Match valid stock candidates: nearer wins, ties backward. Keep every
     * ideal anchor independent; only the already-chosen previous boundary
     * constrains admission. Negative/error sentinels are never positions.
     * The final end may move beyond trim, but never beyond actual audio. */
    unsigned good_f=f!=UINT32_MAX && f!=anchor && f<=s->frames &&
        (i==s->count || (f<s->anchors[i+1u] && f<s->anchors[s->count]));
    unsigned good_b=b!=UINT32_MAX && b!=anchor && b>s->points[i-1u] && b>s->anchors[0];
    uint32_t selected=anchor;
    if(good_f && good_b)selected=(f-anchor<anchor-b)?f:b;
    else if(good_f)selected=f;
    else if(good_b)selected=b;
    s->points[i]=selected;
    if(++s->index>s->count) {
        for(uint32_t j=0;j<s->count;++j)
            if(s->points[j]>=s->points[j+1u] ||
               s->points[j+1u]-s->points[j]<s->minimum) {
                s->result=MW_SNAP_INVALID;return;
            }
        s->result=MW_SNAP_DONE;return;
    }
    s->backward=0;s->forward=UINT32_MAX;s->position=s->anchors[s->index]+1u;
}
static inline unsigned mw_snap_step(struct mw_sample_snap *s,mw_snap_reader read,
                                    void *context,uint32_t budget)
{
    if(s->result!=MW_SNAP_WORKING || !read)return s->result;
    while(budget && s->result==MW_SNAP_WORKING) {
        /* Candidates outside these neighbouring boundaries could not be
         * admitted by the chooser. Avoid scanning irrelevant parts of a
         * long/DC source merely to discard the resulting position. */
        if((s->backward && s->position<=s->points[s->index-1u]) ||
           (!s->backward && s->index<s->count && s->position>=s->anchors[s->index+1u])) {
            mw_snap_direction_done(s,UINT32_MAX);continue;
        }
        /* A complete comparison needs two real frames. Exhaustion means no
         * candidate in this direction; it is distinct from an IO/read error. */
        if(s->position>=s->frames-1u) {
            mw_snap_direction_done(s,UINT32_MAX);continue;
        }
        if(s->reads==MW_SNAP_READ_LIMIT){s->result=MW_SNAP_LIMIT;break;}
        int32_t left[2]={0,0},right[2]={0,0};
        ++s->reads;--budget;
        if(!read(context,s->position,left,right)){s->result=MW_SNAP_READ_ERROR;break;}
        unsigned found=(!s->stereo || (s->channels&1u)) && mw_snap_crossing(left[0],left[1]);
        if(s->stereo && (s->channels&2u) && mw_snap_crossing(right[0],right[1]))found=1;
        if(found)mw_snap_direction_done(s,s->position);
        else if(s->backward) {
            if(!s->position)mw_snap_direction_done(s,UINT32_MAX);
            else --s->position;
        } else ++s->position;
    }
    return s->result;
}
#endif
