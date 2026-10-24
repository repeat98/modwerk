/* SPDX-License-Identifier: MIT
 * Basic Beat Slicer controller. All instrument access is through the proposed
 * shared base editor API; no stock address, PCM reader or native writer here.
 */
#include "../../runtime/loader/modwerk_module.h"
#include "../../machines/octatrack/include/modwerk_sample_editor.h"
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
static const uint32_t spacings[5]={1,4,16,32,64};
static uint32_t token,active,tempo_source,spacing,reply,geometry,dirty,captured;
static uint32_t pending_confirm;
static uint32_t consumed[2];
enum { DEVICE_SHORT_TRIM=16 };
#define STOCK_MIN_SLICE_FRAMES 64u

static void close_editor(void)
{
    if(active && editor)editor->cancel(token);
    active=0;token=0;editor=0;pending_confirm=0;
}
static unsigned refresh(void)
{
    if(!active || !editor)return 0;
    unsigned current=editor->copy(token,&view);
    if(current==MODWERK_SAMPLE_BUSY){reply=MODWERK_SAMPLE_BUSY;return 0;}
    if(current!=MODWERK_SAMPLE_OK){close_editor();return 0;}
    captured=1;
    if(reply==MODWERK_SAMPLE_BUSY)reply=MODWERK_SAMPLE_OK;
    if(!dirty)return 1;
    dirty=0;
    if(view.count>BS_MAX_SLICES){geometry=BS_INVALID;return 1;}
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
    if(!active || !captured || dirty || geometry!=BS_OK){pending_confirm=0;return;}
    proposal.count=plan.count;
    for(uint32_t i=0;i<BS_MAX_SLICES;++i)proposal.starts[i]=plan.starts[i];
    reply=editor->replace(token,&proposal);
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
    geometry=BS_INVALID;reply=MODWERK_SAMPLE_OK;
    refresh();
}
/* Relocated function pointer, copied inline label. The base validates this
 * complete descriptor before admission and again under its native owner lock. */
const struct modwerk_sample_action bs_sample_action={
    MODWERK_SAMPLE_EDITOR_ABI,MODWERK_SAMPLE_ACTION_BYTES,0x446c151du,0,bs_device_open,
    "BEAT SLICER",{0,0,0}
};
void module_tick(struct modwerk_runtime_api *api)
{
    if(active && refresh() && pending_confirm)confirm_when_ready();
    api->value=0x42530000u | (active?0x100u:0u) | (pending_confirm?0x200u:0u) |
        (reply<<10) | geometry;
}
static int cycle(int current,int delta,int count)
{
    int next=current+delta%count;
    if(next<0)next+=count;
    if(next>=count)next-=count;
    return next;
}
int module_enc(int encoder,int delta)
{
    if(!active)return 0;
    pending_confirm=0;
    if(encoder==0)tempo_source=(uint32_t)cycle((int)tempo_source,delta,2);
    else if(encoder==1)spacing=(uint32_t)cycle((int)spacing,delta,5);
    else {close_editor();return 0;}
    reply=MODWERK_SAMPLE_OK;dirty=1;refresh();return 1;
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
    if(code==UP || code==DOWN)return module_enc(1,code==UP?1:-1);
    pending_confirm=1;
    if(refresh())confirm_when_ready();
    return 1;
}
static void text(char *out,const char *in)
{while(*in)*out++=*in++;*out=0;}
static char *append(char *out,const char *in)
{while(*in)*out++=*in++;*out=0;return out;}
static char *number(char *out,uint32_t value)
{
    if(value>=100)*out++=(char)('0'+value/100u);
    if(value>=10)*out++=(char)('0'+value/10u%10u);
    *out++=(char)('0'+value%10u);*out=0;return out;
}
void module_draw(unsigned char *frame)
{
    if(!active || !frame)return;
    char line[32],*at;
    for(uint32_t i=0;i<1024;++i)frame[i]=0;
    bs_device_box(frame,0,0,128,64);
    bs_device_text_at(frame,30,2,"BEAT SLICER");
    bs_device_invert(frame,1,1,126,10);
    if(!captured || dirty) {
        bs_device_text(frame,26,"WAITING FOR SOURCE");
        bs_device_text(frame,55,"NO:BACK");return;
    }
    at=append(line,tempo_source?"A BPM:PROJECT ":"A BPM:SAMPLE ");
    uint32_t bpm=tempo_source?view.project_bpm24:view.sample_bpm24;
    if(bpm>=720 && bpm<=7200) {
        at=number(at,bpm/24u);*at++='.';
        uint32_t fraction=(bpm%24u*100u+12u)/24u;
        *at++=(char)('0'+fraction/10u);*at++=(char)('0'+fraction%10u);*at=0;
    } else text(at,"NONE");
    bs_device_text(frame,15,line);
    at=append(line,"B STEP:");at=number(at,spacings[spacing]);append(at,spacing?" BEATS":" BEAT");
    bs_device_text(frame,25,line);
    at=append(line,"SLICES:");at=number(at,plan.count);
    at=append(at,view.kind==MODWERK_SAMPLE_FLEX?" FLEX ":" STATIC ");number(at,view.slot+1u);
    bs_device_text(frame,35,line);
    if(geometry==DEVICE_SHORT_TRIM)text(line,"TRIM TOO SHORT");
    else if(geometry==BS_TOO_MANY)text(line,"OVER 64 SLICES");
    else if(geometry!=BS_OK)text(line,"CHECK BPM / TRIM");
    else if(reply==MODWERK_SAMPLE_BUSY)text(line,"WAITING FOR SOURCE");
    else if(reply!=MODWERK_SAMPLE_OK)text(line,"EDIT REFUSED");
    else if(view.count){at=append(line,"REPLACE ");at=number(at,view.count);append(at," SLICES");}
    else text(line,"NEW SLICE GRID");
    bs_device_text(frame,45,line);
    bs_device_text(frame,55,"YES:OK      NO:BACK");
}
