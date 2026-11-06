/* SPDX-License-Identifier: MIT
 * CREATE THRESHOLD SLICES. Instrument access is the shared sample-editor API.
 * Includes are relative to sdk/drafts/threshold-slices/.
 */
#include "../../runtime/loader/modwerk_module.h"
#include "../../machines/octatrack/include/modwerk_sample_editor.h"
#include "threshold.h"
#include "device_font.h"

#define YES 0x31
#define NO 0x32
#define UP 0x33
#define DOWN 0x20
#define READS_PER_TICK 8u
static const uint32_t levels[10]={10,20,30,40,50,60,70,80,90,100};
static const uint32_t gaps[6]={10,20,50,100,200,400};
static const struct modwerk_sample_editor_api *editor;
static const struct modwerk_sample_editor_read_api *reader;
static struct modwerk_sample_view view;
static struct modwerk_sample_grid proposal;
static struct ts_scan scan;
static int32_t block[MODWERK_SAMPLE_READ_FRAMES];
static uint32_t got_frames;
static uint32_t token,active,level=3,gap=2,channel,reply,unsupported,pending_confirm;
static int encoder_counts[3];
static uint32_t consumed[2];
#define COUNTS_PER_STEP 4

static void close_editor(void)
{
    if(active && editor)editor->cancel(token);
    active=0;token=0;editor=0;reader=0;pending_confirm=0;unsupported=0;
    encoder_counts[0]=encoder_counts[1]=encoder_counts[2]=0;
}
static int readable(void)
{
    return active && reader && !unsupported && view.frames && view.trim_start<view.trim_end;
}
static void restart(void)
{
    pending_confirm=0;reply=MODWERK_SAMPLE_OK;
    if(!readable())return;
    ts_scan_begin(&scan,view.trim_start,view.trim_end,view.frame_rate,levels[level],gaps[gap]);
}
static void pull(void)
{
    uint32_t step;
    if(!readable() || scan.phase>=2u)return;
    for(step=0;step<READS_PER_TICK && scan.phase<2u;++step) {
        uint32_t remain=scan.cursor<view.trim_end?view.trim_end-scan.cursor:0u,ask,why;
        if(!remain){ts_scan_feed(&scan,scan.cursor,0,0);break;}
        ask=remain>MODWERK_SAMPLE_READ_FRAMES?MODWERK_SAMPLE_READ_FRAMES:remain;
        if(ask>1u && (ask&1u))ask--;
        /* The base reads pairs. The last frame of the file has no partner, so
         * count it as silence and let the scan finish. */
        if(ask==1u && scan.cursor+1u>=view.frames) {
            int32_t quiet=0;
            ts_scan_feed(&scan,scan.cursor,&quiet,1u);
            continue;
        }
        why=reader->read(token,scan.cursor,ask,channel,block,MODWERK_SAMPLE_READ_FRAMES,&got_frames);
        if(why==MODWERK_SAMPLE_BUSY){reply=MODWERK_SAMPLE_BUSY;return;}
        reply=MODWERK_SAMPLE_OK;
        if(why==MODWERK_SAMPLE_STALE){close_editor();return;}
        if(why!=MODWERK_SAMPLE_OK || !got_frames){scan.phase=2;scan.status=TS_FAILED;return;}
        ts_scan_feed(&scan,scan.cursor,block,got_frames);
    }
}
static void confirm_when_ready(void)
{
    uint32_t i;
    if(!readable() || scan.phase<2u || scan.status!=TS_OK || scan.count<2u){pending_confirm=0;return;}
    proposal.count=scan.count;
    for(i=0;i<TS_MAX;++i)proposal.starts[i]=i<scan.count?scan.starts[i]:0;
    reply=editor->replace(token,&proposal);
    pending_confirm=reply==MODWERK_SAMPLE_BUSY;
    if(reply==MODWERK_SAMPLE_CONFIRMING){active=0;token=0;editor=0;reader=0;}
}
void ts_device_open(uint32_t opened,const struct modwerk_sample_editor_api *api)
{
    close_editor();
    if(!opened || !api || api->abi!=MODWERK_SAMPLE_EDITOR_ABI || api->bytes<sizeof *api ||
       !api->copy || !api->confirm || !api->cancel || !api->replace)return;
    editor=api;token=opened;active=1;reply=MODWERK_SAMPLE_OK;
    if(api->bytes<sizeof(struct modwerk_sample_editor_read_api)){unsupported=1;return;}
    reader=(const struct modwerk_sample_editor_read_api *)api;
    if(!reader->read){unsupported=1;reader=0;return;}
    if(editor->copy(token,&view)!=MODWERK_SAMPLE_OK){close_editor();return;}
    restart();
}
const struct modwerk_sample_action ts_sample_action={
    MODWERK_SAMPLE_EDITOR_ABI,MODWERK_SAMPLE_ACTION_BYTES,0x54534c31u,0,ts_device_open,
    "CREATE THRESHOLD SLICES",{0,0,0}
};
void module_tick(struct modwerk_runtime_api *api)
{
    if(pending_confirm && readable() && scan.phase>=2u)confirm_when_ready();
    else pull();
    api->value=0x54530000u | (active?0x100u:0u) | (pending_confirm?0x200u:0u) | (reply<<10) | scan.status;
}
static int step_value(int current,int delta,int count)
{
    int next=current+delta;
    if(next<0)next=0;
    if(next>=count)next=count-1;
    return next;
}
static int adjust(int encoder,int delta)
{
    if(encoder==0)level=(uint32_t)step_value((int)level,delta,(int)(sizeof levels/sizeof levels[0]));
    else if(encoder==1)gap=(uint32_t)step_value((int)gap,delta,(int)(sizeof gaps/sizeof gaps[0]));
    else channel=(uint32_t)step_value((int)channel,delta,3);
    restart();return 1;
}
int module_enc(int encoder,int delta)
{
    int *counts,steps;
    if(!active)return 0;
    if(encoder>=3 && encoder<6)return 1;
    if(encoder<0 || encoder>=6){close_editor();return 0;}
    if(unsupported)return 1;
    pending_confirm=0;
    counts=&encoder_counts[encoder];
    if((*counts>0 && delta<0) || (*counts<0 && delta>0))*counts=0;
    steps=delta/COUNTS_PER_STEP;
    *counts+=delta%COUNTS_PER_STEP;
    steps+=*counts/COUNTS_PER_STEP;
    *counts%=COUNTS_PER_STEP;
    return steps?adjust(encoder,steps):1;
}
int module_key(int code,int pressed)
{
    uint32_t mask,bank;
    if(code<0 || code>=64)return 0;
    mask=1u<<((unsigned)code%32u);bank=(unsigned)code/32u;
    if(!pressed) {
        if(!(consumed[bank]&mask))return 0;
        consumed[bank]&=~mask;return 1;
    }
    if(consumed[bank]&mask)return 1;
    if(!active)return 0;
    if(code!=YES && code!=NO && code!=UP && code!=DOWN){close_editor();return 0;}
    consumed[bank]|=mask;
    if(code==NO){close_editor();return 1;}
    if(code==UP || code==DOWN || unsupported)return 1;
    if(scan.phase<2u)return 1;
    pending_confirm=1;confirm_when_ready();return 1;
}
static void text(char *out,const char *in)
{while(*in)*out++=*in++;*out=0;}
static char *number(char *out,uint32_t value)
{
    if(value>=100)*out++=(char)('0'+value/100u);
    if(value>=10)*out++=(char)('0'+value/10u%10u);
    *out++=(char)('0'+value%10u);*out=0;return out;
}
static void center(unsigned char *frame,uint32_t x,uint32_t width,uint32_t y,const char *value)
{
    uint32_t n=0,pixels;while(value[n])++n;
    pixels=n?4u*n-1u:0;
    ts_device_small_text(frame,x+(pixels<width?(width-pixels)/2u:0u),y,value);
}
static void right(unsigned char *frame,uint32_t edge,uint32_t y,const char *value)
{
    uint32_t n=0,pixels;while(value[n])++n;
    pixels=n?4u*n-1u:0;
    ts_device_small_text(frame,pixels<=edge+1u?edge+1u-pixels:0u,y,value);
}
static uint32_t progress(void)
{
    uint32_t span=view.trim_end-view.trim_start,into,pct;
    if(scan.phase>=2u)return 100u;
    if(!span || scan.cursor<view.trim_start)return 0;
    into=scan.cursor-view.trim_start;if(into>span)into=span;
    pct=into*50u/span;return scan.phase?pct+50u:pct;
}
void module_draw(unsigned char *frame)
{
    char line[32],*at;
    if(!active || !frame)return;
    ts_device_clear(frame,3,1,122,62);
    ts_device_text_at(frame,4,4,"THRESHOLD SLICES");
    ts_device_invert(frame,4,3,120,9);
    ts_device_dashed_box(frame,6,15,81,38);
    ts_device_dashed_box(frame,33,15,1,38);
    ts_device_dashed_box(frame,60,15,1,38);
    ts_device_dashed_box(frame,6,34,81,1);
    center(frame,7,26,18,"THR");
    center(frame,34,25,18,"GAP");
    center(frame,61,26,18,"CH");
    center(frame,6,81,56,"YES:OK NO:BACK");
    number(line,levels[level]);center(frame,7,26,26,line);
    number(line,gaps[gap]);center(frame,34,25,26,line);
    center(frame,61,26,26,channel==1?"L":channel==2?"R":"L+R");
    if(unsupported)text(line,"NO READ");
    else if(!view.frames || (view.trim_end<=view.trim_start))text(line,"EMPTY");
    else if(scan.phase<2u) {
        at=number(line,progress());text(at,"%");
    }     else if(scan.status==TS_TOO_MANY)text(line,"OVER64");
    else if(scan.status==TS_SHORT)text(line,"SHORT");
    else if(scan.status==TS_EMPTY)text(line,"EMPTY");
    else if(scan.status!=TS_OK)text(line,"CHECK");
    else if(reply==MODWERK_SAMPLE_BUSY)text(line,"WAIT");
    else if(reply!=MODWERK_SAMPLE_OK)text(line,"REFUSED");
    else if(scan.count<2u)text(line,"EMPTY");
    else text(line,view.count?"REPLACE":"CREATE");
    right(frame,120,20,line);
    at=number(line,scan.phase>=2u && scan.status==TS_OK?scan.count:0);text(at," SLICE");
    right(frame,120,31,line);
    ts_device_box(frame,3,1,122,62);
}
