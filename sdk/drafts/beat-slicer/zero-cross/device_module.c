/* SPDX-License-Identifier: MIT
 * Basic Beat Slicer controller. All instrument access is through the proposed
 * shared base editor API. Native UI drawing is isolated in device_font.c;
 * there is no PCM reader or sample writer in this package.
 */
#include "../../../runtime/loader/modwerk_module.h"
#include "sample_options.h"
#include "grid_preview.h"
#include "device_font.h"

#define YES 0x31
#define NO 0x32
#define UP 0x33
#define DOWN 0x20
static const struct modwerk_sample_editor_api *editor;
static struct modwerk_sample_view view;
static struct bs_grid_plan plan;
static struct modwerk_sample_grid proposal;
static const uint32_t spacings[6]={1,2,4,16,32,64};
static uint32_t token,active,tempo_source,spacing,reply,geometry,dirty,captured;
static uint32_t pending_confirm;
static uint32_t snap;
/* The base supplies a fresh stock frame on every composition. Keep our pixels,
 * not the caller's frame pointer, so idle draws still cover the stock editor. */
static unsigned char popup[1024] __attribute__((aligned(4)));
static unsigned char popup_mask[1024] __attribute__((aligned(4)));
static uint32_t popup_key[10], popup_valid;
static int encoder_counts[3];
#define COUNTS_PER_STEP 4
static uint32_t consumed[2];
enum { DEVICE_SHORT_TRIM=16 };
#define STOCK_MIN_SLICE_FRAMES 64u

static void close_editor(void)
{
    if(active && editor)editor->cancel(token);
    active=0;token=0;editor=0;pending_confirm=0;popup_valid=0;
    encoder_counts[0]=encoder_counts[1]=encoder_counts[2]=0;
}
static const struct modwerk_sample_editor_options_api *options_api(void)
{
    return editor && editor->bytes>=sizeof(struct modwerk_sample_editor_options_api)?
        (const struct modwerk_sample_editor_options_api *)(const void *)editor:0;
}
static unsigned refresh(unsigned validate)
{
    if(!active || !editor)return 0;
    if(!captured || validate) {
        unsigned current=editor->copy(token,&view);
        if(current==MODWERK_SAMPLE_BUSY){reply=MODWERK_SAMPLE_BUSY;return 0;}
        if(current!=MODWERK_SAMPLE_OK){close_editor();return 0;}
        captured=1;
        if(reply==MODWERK_SAMPLE_BUSY)reply=MODWERK_SAMPLE_OK;
    }
    if(!dirty)return 1;
    dirty=0;
    if(view.count>BS_MAX_SLICES){geometry=BS_INVALID;return 1;}
    if(view.kind==MODWERK_SAMPLE_FLEX && view.slot>=128u && view.slot<136u &&
       !view.frames && !view.trim_start && !view.trim_end) {
        /* Empty recorder slots are valid editor sources. There is no audio
         * extent to divide and no reserved-memory placeholder to populate. */
        plan.count=0;
        for(uint32_t i=0;i<BS_MAX_SLICES;++i)plan.starts[i]=0;
        geometry=BS_OK;return 1;
    }
    uint32_t minimum=view.frames<STOCK_MIN_SLICE_FRAMES?view.frames:STOCK_MIN_SLICE_FRAMES;
    if(!minimum || view.trim_start>=view.trim_end || view.trim_end-view.trim_start<minimum) {
        geometry=DEVICE_SHORT_TRIM;return 1;
    }
    /* A replacement is a fresh grid. The base retains the old table until
     * explicit stock confirmation and independently validates this proposal. */
    uint32_t grid_end=view.trim_end-(minimum-1u);
    struct bs_grid_request request={view.frame_rate,view.trim_start,grid_end,
        view.sample_bpm24,view.project_bpm24,spacings[spacing],tempo_source,0,0};
    geometry=bs_grid_preview(&request,&plan);return 1;
}
static void confirm_when_ready(void)
{
    if(!active || !captured || dirty || geometry!=BS_OK ||
       (!plan.count && !view.count)){pending_confirm=0;return;}
    proposal.count=plan.count;
    for(uint32_t i=0;i<BS_MAX_SLICES;++i)proposal.starts[i]=plan.starts[i];
    const struct modwerk_sample_editor_options_api *options=options_api();
    reply=snap?(options && options->replace_options?
        options->replace_options(token,&proposal,MODWERK_SAMPLE_SNAP_ZERO):MODWERK_SAMPLE_UNSUPPORTED):
        editor->replace(token,&proposal);
    pending_confirm=reply==MODWERK_SAMPLE_BUSY;
    if(reply==MODWERK_SAMPLE_CONFIRMING) {
        /* The base owns the copied plan and the remaining stock question. */
        active=0;token=0;editor=0;
    }
}
void bs_device_open(uint32_t opened,const struct modwerk_sample_editor_api *api)
{
    close_editor();
    if(!opened || !api || api->abi!=MODWERK_SAMPLE_EDITOR_ABI || api->bytes<sizeof *api ||
       !api->copy || !api->confirm || !api->cancel || !api->replace)return;
    editor=api;token=opened;active=1;dirty=1;captured=0;
    if(!options_api() || !options_api()->replace_options)snap=0;
    geometry=BS_INVALID;reply=MODWERK_SAMPLE_OK;
    refresh(0);
}
/* Relocated function pointer, copied inline label. The base validates this
 * complete descriptor before admission and again under its native owner lock. */
const struct modwerk_sample_action bs_sample_action={
    MODWERK_SAMPLE_EDITOR_ABI,MODWERK_SAMPLE_ACTION_BYTES,0x446c151du,0,bs_device_open,
    "CREATE BEAT GRID",{0,0,0}
};
void module_tick(struct modwerk_runtime_api *api)
{
    /* The options are a copied snapshot. Idle ticks must not repeatedly copy
     * live metadata or flash readiness for ordinary waveform work.
     * Parameter edits use that snapshot;
     * YES still obtains/revalidates a fresh source. */
    if(active && (dirty || !captured || pending_confirm) && refresh(pending_confirm) && pending_confirm)
        confirm_when_ready();
    api->value=0x42530000u | (active?0x100u:0u) | (pending_confirm?0x200u:0u) |
        (reply<<10) | geometry;
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
    pending_confirm=0;
    if(encoder==0)tempo_source=(uint32_t)step_value((int)tempo_source,delta,2);
    else if(encoder==1)spacing=(uint32_t)step_value((int)spacing,delta,(int)(sizeof spacings/sizeof spacings[0]));
    else if(encoder==2) {
        const struct modwerk_sample_editor_options_api *options=options_api();
        if(!options || !options->replace_options){snap=0;reply=MODWERK_SAMPLE_UNSUPPORTED;return 1;}
        snap=(uint32_t)step_value((int)snap,delta,2);
    }
    else {close_editor();return 0;}
    reply=MODWERK_SAMPLE_OK;dirty=1;refresh(0);return 1;
}
int module_enc(int encoder,int delta)
{
    if(!active)return 0;
    /* Unassigned D-F fields belong to this popup too; they do not dismiss it
     * or change the stock page hidden underneath. */
    if(encoder>=3 && encoder<6)return 1;
    if(encoder<0 || encoder>=6){close_editor();return 0;}
    pending_confirm=0;
    if(reply==MODWERK_SAMPLE_BUSY)reply=MODWERK_SAMPLE_OK;
    int *counts=&encoder_counts[encoder];
    if((*counts>0 && delta<0) || (*counts<0 && delta>0))*counts=0;
    /* Split the quotient before accumulating, so even a large signed input
     * cannot overflow the small residual. */
    int steps=delta/COUNTS_PER_STEP;
    *counts+=delta%COUNTS_PER_STEP;
    steps+=*counts/COUNTS_PER_STEP;
    *counts%=COUNTS_PER_STEP;
    return steps?adjust(encoder,steps):1;
}
int module_key(int code,int pressed)
{
    if(code<0 || code>=64)return 0;
    uint32_t mask=1u<<((unsigned)code%32u),bank=(unsigned)code/32u;
    if(!pressed) {
        if(!(consumed[bank]&mask))return 0;
        consumed[bank]&=~mask;return 1;
    }
    if(consumed[bank]&mask)return 1;
    if(!active)return 0;
    if(code!=YES && code!=NO && code!=UP && code!=DOWN) {
        /* Transport, recorder, Part/project and other stock gestures pass only
         * after retiring our token. No hidden global key takeover. */
        close_editor();return 0;
    }
    consumed[bank]|=mask;
    if(code==NO){close_editor();return 1;}
    if(code==UP || code==DOWN) {
        pending_confirm=0;
        if(reply==MODWERK_SAMPLE_BUSY)reply=MODWERK_SAMPLE_OK;
        return 1;
    }
    pending_confirm=1;
    if(refresh(1))confirm_when_ready();
    return 1;
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
    uint32_t pixels=bs_device_text_width(value);
    bs_device_small_text(frame,x+(pixels<width?(width-pixels)/2u:0u),y,value);
}
static void right(unsigned char *frame,uint32_t edge,uint32_t y,const char *value)
{
    uint32_t pixels=bs_device_text_width(value);
    bs_device_small_text(frame,pixels<=edge+1u?edge+1u-pixels:0u,y,value);
}
static void render_popup(unsigned char *frame,unsigned char *mask)
{
    char line[32],*at;
    bs_device_popup(frame,mask);
    bs_device_dashed_box(frame,11,15,73,38);
    bs_device_dashed_box(frame,35,15,1,38);
    bs_device_dashed_box(frame,59,15,1,38);
    bs_device_dashed_box(frame,11,34,73,1);
    center(frame,12,23,18,"BPM");
    center(frame,36,23,18,"BEATS");
    center(frame,60,23,18,"SNAP");
    center(frame,60,23,26,snap?"ON":"OFF");
    center(frame,11,73,56,"YES:OK NO:BACK");
    if(!captured || dirty) {
        center(frame,12,23,26,"WAIT");
        return;
    }
    center(frame,12,23,26,tempo_source?"PROJ":"SAMPLE");
    number(line,spacings[spacing]);
    center(frame,36,23,26,line);
    uint32_t bpm=tempo_source?view.project_bpm24:view.sample_bpm24;
    if(bpm>=720 && bpm<=7200) {
        at=number(line,bpm/24u);*at++='.';
        uint32_t fraction=(bpm%24u*100u+12u)/24u;
        *at++=(char)('0'+fraction/10u);*at++=(char)('0'+fraction%10u);*at=0;
    } else text(line,"NONE");
    right(frame,114,20,line);
    at=number(line,geometry==BS_OK?plan.count:0);text(at," SLICE");
    right(frame,114,31,line);
    if(geometry==DEVICE_SHORT_TRIM)text(line,"SHORT");
    else if(geometry==BS_TOO_MANY)text(line,"OVER64");
    else if(geometry!=BS_OK)text(line,"CHECK");
    else if(reply==MODWERK_SAMPLE_BUSY)text(line,"WAIT");
    else if(reply==MODWERK_SAMPLE_UNSUPPORTED)text(line,"NO SNAP");
    else if(reply!=MODWERK_SAMPLE_OK)text(line,"REFUSED");
    else if(!plan.count && !view.count)text(line,"EMPTY");
    else text(line,view.count?"REPLACE":"CREATE");
    right(frame,114,42,line);

}

void module_draw(unsigned char *frame)
{
    if(!active || !frame)return;
    uint32_t key[10]={captured,dirty,tempo_source,spacing,
        tempo_source?view.project_bpm24:view.sample_bpm24,
        geometry,plan.count,reply,view.count,snap};
    unsigned changed=!popup_valid;
    for(unsigned i=0;i<10;++i)if(key[i]!=popup_key[i])changed=1;
    if(changed) {
        render_popup(popup,popup_mask);
        for(unsigned i=0;i<10;++i)popup_key[i]=key[i];
        popup_valid=1;
    }
    const unsigned char *home=bs_device_home();
    if(!home)return;
    for(unsigned i=0;i<1024u;++i) {
        unsigned m=popup_mask[i];
        frame[i]=m==255u?popup[i]:m?
            (unsigned char)((home[i]&~m)|(popup[i]&m)):home[i];
    }
}
