/* SPDX-License-Identifier: MIT
 * Native 1.40C base adapter. The source build checks every owned seam against
 * the private stock image. Enabled only by the private sample-editor option.
 * Flex/Static and inactive recorder metadata only; no PCM access.
 */
#include "sample_editor_board.h"
#ifdef MW_SAMPLE_BOARD_HOST
uint32_t mw_sample_host_read(uint32_t);
void mw_sample_host_write(uint32_t,uint32_t);
#define READ(a) mw_sample_host_read(a)
#define READ_PACKED(a) mw_sample_host_read(a)
#define READ_BYTE(a) (mw_sample_host_read(a)&255u)
#define WRITE(a,v) mw_sample_host_write(a,v)
#else
/* Byte reads also cover the packed engine queue's two-byte aligned fields. */
static uint32_t read32(uint32_t at)
{
    const volatile uint8_t *p=(const volatile uint8_t *)(uintptr_t)at;
    return (uint32_t)p[0]<<24 | (uint32_t)p[1]<<16 | (uint32_t)p[2]<<8 | p[3];
}
#define READ(a) (*(volatile uint32_t *)(uintptr_t)(a))
#define READ_PACKED(a) read32(a)
#define READ_BYTE(a) (*(volatile uint8_t *)(uintptr_t)(a))
#define WRITE(a,v) (*(volatile uint32_t *)(uintptr_t)(a)=(v))
#endif
/* Defined by ep0.c/modset.c; observations only, no transport initialization,
 * work, card IO, or falsely treating an incomplete module set as usable. */
int mw_sample_transport_ready(void);
int mw_sample_storage_ready(void);
int mw_sample_ep0_wake(const void *);
static uint32_t idle_seen,job_active,refresh_pending,position_hint;
static uint32_t waveform_candidate,waveform_seen;
static const void *job_message;
static unsigned owner_hint;
struct mw_sample_editor mw_sample_editor;
/* File-backed settings are written by UI/engine/storage tasks, excluded by
 * the level-4 lock. Recording into the edited buffer and audition are excluded.
 * This service never touches PCM. Keep the level-5 frame and
 * level-6 DMA interrupts running through copies, validation and row writes.
 * Only the final recorder-state check/count publication briefly excludes the
 * level-5 recorder; it never copies a table, waits or calls stock UI code. */
static uint32_t lock(void *unused){(void)unused;return modwerk_machine_lock();}
static void unlock(void *unused,uint32_t sr){(void)unused;modwerk_machine_unlock(sr);}
static int audio_preemptible(void)
{
#ifdef MW_SAMPLE_BOARD_HOST
    int mw_sample_host_audio_preemptible(void);return mw_sample_host_audio_preemptible();
#else
    uint32_t sr;
    __asm__ __volatile__("move.w %%sr,%0" : "=d"(sr));
    return (sr&0x0700u)<0x0500u;
#endif
}
int mw_sample_owner_current_locked(const struct runtime_owner *owner)
{
    if(!owner || !modwerk_runtime_owner_held(owner,&owner_hint))return 0;
    if(position_hint<RUNTIME_MODULES &&
       (uintptr_t)modwerk_runtime_module(position_hint)==owner->owned_extent)return 1;
    for(unsigned i=0;i<RUNTIME_MODULES;++i)
        if((uintptr_t)modwerk_runtime_module(i)==owner->owned_extent){position_hint=i;return 1;}
    return 0;
}
static int owner(void *unused,const struct runtime_owner *value)
{(void)unused;return mw_sample_owner_current_locked(value);}
static int source_not_recording(uint32_t kind,uint32_t slot)
{
    /* A track's loaded file and its recorder are independent. Only an AED
     * source that IS a recorder buffer is gated by that recorder's state. */
    if(kind!=MODWERK_SAMPLE_FLEX || slot<MW_SAMPLE_FILE_SLOTS ||
       slot>=MW_SAMPLE_FILE_SLOTS+MW_SAMPLE_RECORDER_COUNT)return 1;
    unsigned track=slot-MW_SAMPLE_FILE_SLOTS;
    /* Stock alternates two banks. The inactive bank can retain state 2
     * after Stop; pending state 1 or an unknown state still blocks. */
    uint32_t banks=READ(0x80004f18u);
    unsigned selected=(banks>>track)&1u;
    uint32_t active=READ_BYTE(0x80004f1eu+84u*(track+8u*selected));
    uint32_t other=READ_BYTE(0x80004f1eu+84u*(track+8u*(1u-selected)));
    return !active && (other==0u || other==2u);
}
/* Diagnostic timer counts for the bounded final count publication. Physical
 * latency still needs exact-build device measurement; emulator counts are not
 * an SDRAM/cache timing qualification. DMA (level 6) stays enabled. */
uint32_t mw_sample_commit_max,mw_sample_commit_last,mw_sample_commit_spans;
#ifdef MW_SAMPLE_BOARD_HOST
uint32_t mw_sample_host_commit_lock(void);
void mw_sample_host_commit_unlock(uint32_t);
static uint32_t commit_lock(void){return mw_sample_host_commit_lock();}
static void commit_unlock(uint32_t saved){mw_sample_host_commit_unlock(saved);}
#else
static uint32_t commit_at;
static uint32_t commit_lock(void)
{
    uint32_t sr;
    __asm__ __volatile__("move.w %%sr,%0" : "=d"(sr) :: "memory");
    if((sr&0x0700u)<0x0500u)
        __asm__ __volatile__("move.w %0,%%sr" :: "d"((sr&~0x0700u)|0x0500u) : "memory");
    commit_at=READ(0xfc07c00cu);return sr;
}
static void commit_unlock(uint32_t saved)
{
    uint32_t elapsed=READ(0xfc07c00cu)-commit_at;
    __asm__ __volatile__("move.w %0,%%sr" :: "d"(saved) : "memory");
    mw_sample_commit_last=elapsed;++mw_sample_commit_spans;
    if(elapsed>mw_sample_commit_max)mw_sample_commit_max=elapsed;
}
#endif
static int source_stable(const struct mw_sample_capture *before,uint32_t settings)
{
    const struct modwerk_sample_view *v=&before->view;
    if(!source_not_recording(v->kind,v->slot) || READ_PACKED(0x460d17d2u) || READ(0x460e6bccu))return 0;
    uint32_t controls=(v->kind?0x46c922c4u:0x46c90a78u)+44u*v->slot;
    for(uint32_t i=0;i<11u;++i)if(READ(controls+4u*i)!=before->controls[i])return 0;
    return READ(settings+276u)==v->sample_bpm24 && READ(0x80001814u)==v->project_bpm24 &&
        READ(settings+300u)==v->trim_start && READ(settings+304u)==v->trim_end && READ(settings+308u)==v->loop;
}
static int ready(void *unused)
{
    (void)unused;
    return audio_preemptible() && idle_seen && !job_active && !READ_PACKED(0x460d17d2u) && !READ(0x460e6bccu) &&
        READ(0x460d1cb8u)==1u && !READ(0x460e76a0u) &&
        mw_sample_transport_ready() && mw_sample_storage_ready();
}
static unsigned capture(void *unused,struct mw_sample_capture *out)
{
    (void)unused;
    /* Recording is a source change, not a transient display job. Cancel the
     * intent instead of queueing YES to apply automatically after recording. */
    uint32_t kind=READ(0x46c8d1a0u),slot=READ(0x46c8d19cu);
    if(!source_not_recording(kind,slot))return MODWERK_SAMPLE_STALE;
    unsigned recorder=kind==MODWERK_SAMPLE_FLEX && slot>=MW_SAMPLE_FILE_SLOTS;
    uint32_t slots=MW_SAMPLE_FILE_SLOTS+(kind==MODWERK_SAMPLE_FLEX?MW_SAMPLE_RECORDER_COUNT:0u);
    if(kind>MODWERK_SAMPLE_FLEX || slot>=slots || !READ(0x46105408u))return MODWERK_SAMPLE_UNSUPPORTED;
    uint32_t controls=(kind?0x46c922c4u:0x46c90a78u)+44u*slot;
    uint32_t settings=(kind?0x100b14f0u:0x100d5b30u)+1096u*slot;
    for(uint32_t i=0;i<11u;++i)out->controls[i]=READ(controls+4u*i);
    if(out->controls[0]>3u || out->controls[2] || (!recorder && !out->controls[4]) ||
       out->controls[4]>0x7fffffffu || (!kind && out->controls[9]==UINT32_MAX))return MODWERK_SAMPLE_UNSUPPORTED;
    struct modwerk_sample_view *v=&out->view;
    v->kind=kind;v->slot=slot;v->frames=out->controls[4];v->frame_rate=44100u;
    v->sample_bpm24=READ(settings+69u*4u);v->project_bpm24=READ(0x80001814u);
    v->trim_start=READ(settings+75u*4u);v->trim_end=READ(settings+76u*4u);v->loop=READ(settings+77u*4u);
    v->count=READ(settings+273u*4u);
    if(v->count>64u || (v->frames?(v->trim_start>=v->trim_end || v->trim_end>v->frames):
       (!recorder || v->trim_start || v->trim_end)))return MODWERK_SAMPLE_UNSUPPORTED;
    for(uint32_t i=0;i<64u;++i) {
        v->records[i].start=READ(settings+312u+12u*i);
        v->records[i].end=READ(settings+316u+12u*i);
        v->records[i].loop=READ(settings+320u+12u*i);
    }
    return MODWERK_SAMPLE_OK;
}
static int store_rows(uint32_t settings,const struct modwerk_slice_record *records)
{
    /* Match stock grid publication: readers see no active rows while their
     * contents change, then the new count. Frame and DMA service stay enabled.
     * A failed count clear must not expose partially replaced active rows. */
    WRITE(settings+1092u,0);
    if(READ(settings+1092u))return 0;
    for(uint32_t i=0;i<64u;++i) {
        WRITE(settings+312u+12u*i,records[i].start);
        WRITE(settings+316u+12u*i,records[i].end);
        WRITE(settings+320u+12u*i,records[i].loop);
    }
    return 1;
}
static int rows_match(uint32_t settings,const struct modwerk_slice_record *records)
{
    for(uint32_t i=0;i<64u;++i)
        if(READ(settings+312u+12u*i)!=records[i].start ||
           READ(settings+316u+12u*i)!=records[i].end ||
           READ(settings+320u+12u*i)!=records[i].loop)return 0;
    return 1;
}
static int matches(uint32_t settings,uint32_t count,const struct modwerk_slice_record *records)
{return READ(settings+1092u)==count && rows_match(settings,records);}
static int store(uint32_t settings,uint32_t count,const struct modwerk_slice_record *records)
{
    if(!store_rows(settings,records))return 0;
    WRITE(settings+1092u,count);return 1;
}
static unsigned publish(void *unused,const struct mw_sample_capture *before,const struct mw_sample_edit *edit)
{
    (void)unused;
    const struct modwerk_sample_view *v=&before->view;
    uint32_t settings=(v->kind?0x100b14f0u:0x100d5b30u)+1096u*v->slot;
    /* Source/owner/ready were checked under this SAME metadata-writer lock.
     * Audio frames and DMA remain serviceable; no UI/engine writer can run.
     * Reset native selected-row state before any bindings can change. */
    if(matches(settings,edit->count,edit->records))return MODWERK_SAMPLE_NO_CHANGE;
    if(!matches(settings,v->count,v->records))return MODWERK_SAMPLE_FAULT;
    uint32_t selected=READ(0x400ceb3cu);
    WRITE(0x400ceb3cu,UINT32_MAX);
    if(READ(0x400ceb3cu)!=UINT32_MAX) {
        /* Do not publish a new table with an unretired stock row binding. */
        WRITE(0x400ceb3cu,selected);
        return READ(0x400ceb3cu)==selected?MODWERK_SAMPLE_NO_CHANGE:MODWERK_SAMPLE_FAULT;
    }
    unsigned stale=0;
    if(store_rows(settings,edit->records) && rows_match(settings,edit->records)) {
        /* All long work remains preemptible. A start before this atomic
         * decision wins and cancels the edit; a start after the count store
         * observes an already-complete grid. No recorder is skipped/retried.
         * The stock recorder changes extent/trim, not marker rows/count, in
         * the audited preparation/recording paths. Deferred marker cleanup is
         * an engine task, still excluded by the outer metadata lock. */
        unsigned recorder=v->kind==MODWERK_SAMPLE_FLEX && v->slot>=MW_SAMPLE_FILE_SLOTS;
        uint32_t saved=recorder?commit_lock():0;
        stale=!source_stable(before,settings);
        unsigned applied=0;
        if(!stale && !READ(settings+1092u)) {
            WRITE(settings+1092u,edit->count);
            applied=READ(settings+1092u)==edit->count;
        }
        if(recorder)commit_unlock(saved);
        if(applied){refresh_pending=1;return MODWERK_SAMPLE_APPLIED;}
    }
    /* Roll back every active/inactive record and selected row before releasing
     * the lock. This is failure recovery, not user slice history. */
    store(settings,v->count,v->records);WRITE(0x400ceb3cu,selected);
    return matches(settings,v->count,v->records) && READ(0x400ceb3cu)==selected?
        (stale?MODWERK_SAMPLE_STALE:MODWERK_SAMPLE_NO_CHANGE):MODWERK_SAMPLE_FAULT;
}
static const struct mw_sample_backend backend={0,lock,unlock,ready,owner,capture,publish};
void mw_sample_editor_bootstrap(void)
{
    if(!mw_sample_editor.initialized)(void)mw_sample_editor_init(&mw_sample_editor,&backend);
}
/* Base API buffers must belong to the exact active owner's data extent; a
 * mistaken package pointer may not write base state, stock, another owner or
 * freed memory. copy's destination is BSS, not initialized code/metadata. */
static int buffer(const void *p,uint32_t bytes,unsigned output)
{
    const struct runtime_owner *o=&mw_sample_editor.owner;
    if(!p || !mw_sample_owner_current_locked(o) || o->image_offset>o->extent_bytes ||
       o->image_bytes>o->extent_bytes-o->image_offset || o->owned_extent>UINTPTR_MAX-o->extent_bytes)return 0;
    uintptr_t low=o->owned_extent+o->image_offset,high=o->owned_extent+o->extent_bytes;
    if(output)low+=o->image_bytes;
    uintptr_t at=(uintptr_t)p;
    return !(at&3u) && at>=low && at<=high && bytes<=high-at;
}
static unsigned api_copy(uint32_t token,struct modwerk_sample_view *out)
{
    uint32_t saved=modwerk_machine_lock();
    unsigned why=buffer(out,sizeof *out,1)?mw_sample_editor_copy(&mw_sample_editor,token,out):MODWERK_SAMPLE_INVALID;
    modwerk_machine_unlock(saved);return why;
}
static unsigned api_confirm(uint32_t token,const struct modwerk_sample_grid *grid)
{
    uint32_t saved=modwerk_machine_lock();
    unsigned why=buffer(grid,sizeof *grid,0)?mw_sample_editor_confirm(&mw_sample_editor,token,grid):MODWERK_SAMPLE_INVALID;
    modwerk_machine_unlock(saved);return why;
}
static void api_cancel(uint32_t token)
{
    uint32_t saved=modwerk_machine_lock();
    mw_sample_editor_cancel(&mw_sample_editor,token);
    modwerk_machine_unlock(saved);
}
static unsigned api_replace(uint32_t token,const struct modwerk_sample_grid *grid)
{
    uint32_t saved=modwerk_machine_lock();
    unsigned why=buffer(grid,sizeof *grid,0)?mw_sample_editor_replace(&mw_sample_editor,token,grid):MODWERK_SAMPLE_INVALID;
    modwerk_machine_unlock(saved);return why;
}
const struct modwerk_sample_editor_api mw_sample_editor_api={
    MODWERK_SAMPLE_EDITOR_ABI,sizeof(struct modwerk_sample_editor_api),api_copy,api_confirm,api_cancel,api_replace
};
void mw_sample_owner_changing(const struct runtime_dsp *from)
{
    uint32_t saved=modwerk_machine_mask();
    mw_sample_menu_retire_locked(from);
    const struct runtime_owner *o=&mw_sample_editor.owner;
    if(from && from->present && o->module==from->module &&
       o->owned_extent<=UINTPTR_MAX-o->image_offset &&
       o->owned_extent+o->image_offset==(uintptr_t)from->image)
        mw_sample_editor_retire_locked(&mw_sample_editor,o);
    modwerk_machine_unmask(saved);
}
void mw_sample_engine_job(const void *message)
{
    uint32_t saved=modwerk_machine_mask();
    mw_sample_editor_bootstrap();
    if(job_active)mw_sample_editor_changed_locked(&mw_sample_editor);
    job_active=1;
    waveform_candidate=waveform_seen=0;job_message=0;
    /* A possible display read stays INACCESSIBLE for its entire execution.
     * Its byte alone never makes it read-only: the separately guarded native
     * dispatcher branch must confirm what actually ran. A mutated/unknown
     * dispatch retires the token at idle before access can reopen. */
    if(!mw_sample_ep0_wake(message)) {
        if(message && *(const volatile uint8_t *)message==16u) {
            waveform_candidate=1;job_message=message;
        } else mw_sample_editor_changed_locked(&mw_sample_editor);
    }
    modwerk_machine_unmask(saved);
}
void mw_sample_waveform_job(const void *message)
{
    uint32_t saved=modwerk_machine_mask();
    const volatile uint8_t *p=message;
    if(job_active && waveform_candidate && message==job_message && p) {
        uint32_t kind=(uint32_t)p[2]<<24 | (uint32_t)p[3]<<16 | (uint32_t)p[4]<<8 | p[5];
        uint32_t slot=(uint32_t)p[6]<<24 | (uint32_t)p[7]<<16 | (uint32_t)p[8]<<8 | p[9];
        /* Only the actual guarded stock display branch is classified.
         * Static error/status changes still fail the complete recapture; no
         * PCM analysis, pointer lease or arbitrary callback is authorized. */
        uint32_t slots=MW_SAMPLE_FILE_SLOTS+(kind==MODWERK_SAMPLE_FLEX?MW_SAMPLE_RECORDER_COUNT:0u);
        if(kind<=MODWERK_SAMPLE_FLEX && slot<slots && source_not_recording(kind,slot))waveform_seen=1;
    }
    modwerk_machine_unmask(saved);
}
void mw_sample_engine_idle(void)
{
    uint32_t saved=modwerk_machine_mask();
    mw_sample_editor_bootstrap();
    if(waveform_candidate && !waveform_seen)mw_sample_editor_changed_locked(&mw_sample_editor);
    waveform_candidate=waveform_seen=0;job_message=0;job_active=0;idle_seen=1;
    modwerk_machine_unmask(saved);
}
void mw_sample_refresh_ui(void)
{
    if(!refresh_pending)return;
    uint32_t saved=modwerk_machine_lock();refresh_pending=0;
    const struct modwerk_sample_view *v=&mw_sample_editor.before.view;
    if(READ(0x46c8d1a0u)==v->kind && READ(0x46c8d19cu)==v->slot) {
#ifdef MW_SAMPLE_BOARD_HOST
        void mw_sample_host_refresh(void);mw_sample_host_refresh();
#else
        ((void (*)(void))0x40070cbcu)();
        ((void (*)(void))0x400718f8u)();
        ((void (*)(void))0x4006dbdcu)();
#endif
    }
    modwerk_machine_unlock(saved);
}
