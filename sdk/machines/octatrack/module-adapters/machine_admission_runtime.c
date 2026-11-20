/* SPDX-License-Identifier: MIT */
/* Octatrack board boundary. Include only with the reviewed helper/collector
 * sources and fixed declarations storage. An empty storage refuses groups. */
#include "machine_admission.h"
#include "table_admission.h"
#include "machine_contributors.h"
#include "sample_editor_actions.h"
int modwerk_machine_image_validate(const struct runtime_dsp *d)
{
    /* Pure format/address validation. Do not run SWITCH admission here: it can retire saved Part signatures. */
    return machine_contributor_validate(d,RUNTIME_METADATA_SWITCH);
}
static int board_read(void *context,uint32_t address,void *out,uint32_t length)
{
    (void)context;
    uint32_t physical=address>=0x48000400u && address<0x4ff00000u?address-0x08000000u:address;
    if(!((physical>=0x40000400u && physical<0x47f00000u && length<=0x47f00000u-physical) ||
         (address>=0x10000000u && address<0x10100000u && length<=0x10100000u-address))) return 0;
    const volatile uint8_t *from=(const volatile uint8_t *)(uintptr_t)address;uint8_t *to=out;
    for(uint32_t i=0;i<length;i++) to[i]=from[i];
    return 1;
}
#ifdef MODWERK_RUNTIME_UI_ROOTS
/* A host test supplies its own reader and image addresses; the unit reads its own memory. */
#ifndef MODWERK_UI_ROOTS_READ
#define MODWERK_UI_ROOTS_READ board_read
#endif
#ifndef MW_IMAGE_ADDRESS
#define MW_IMAGE_ADDRESS(p) ((uint32_t)(uintptr_t)(p))
#endif
/* The roots as the switch will leave them: the leaving module's own sites read as stock (loader.c
 * modwerk_runtime_site_view). A stock definition the module itself patched to call its code is put back by that
 * switch, so it does not hold the module: Micro Timing points TRACK TRIG EDIT's LEVEL entry (0x400d01f2) at its own
 * handler, and once the page had been opened its layer stayed reachable, refusing every Undo and recover until a
 * power cycle (#1386, an MKII, 19 November 2026). */
static int ui_read_after(void *image,uint32_t address,void *out,uint32_t length)
{
    if(!MODWERK_UI_ROOTS_READ(0,address,out,length)) return 0;
    uint32_t physical=address>=0x48000400u && address<0x4ff00000u?address-0x08000000u:address;
    modwerk_runtime_site_view(image,physical,out,length);
    return 1;
}
#endif
int modwerk_machine_metadata_admit(const struct runtime_dsp *from,struct runtime_dsp *to,
    const struct runtime_context *context,enum runtime_metadata_operation operation)
{
#ifndef MODWERK_HOST
    uint32_t sr;
    __asm__ __volatile__("move.w %%sr,%0" : "=d"(sr) :: "memory");
    if((sr&0x0700u)<0x0400u) return RUNTIME_BUSY;
#endif
#ifdef MODWERK_RESIDENT_STOCK_HOOKS
    /* Trusted resident controllers (controller_board.c): disabled before unpublishing. */
    {
        int modwerk_controller_admit(const struct runtime_dsp *,const struct runtime_dsp *,enum runtime_metadata_operation);
        int why=modwerk_controller_admit(from,to,operation);
        if(why) return why;
    }
#endif
    {
        int why=mw_sample_action_admission(from,to,operation);
        if(why) return why;
    }
    /* Also examines START-only and truncated declarations: they must not bypass admission just because they have
     * no complete ot_machines record. No stock roots/MMIO are read for this format and same-package check. */
    {
        int why=machine_contributor_validate(to,operation);
        if(why) return why;
    }
    unsigned family=table_metadata_family(modwerk_table_declarations,from)|table_metadata_family(modwerk_table_declarations,to);
    /* A machine contributed to the base's ot_machines table: an independent package, never a group. */
    int contributor=machine_contribution(from) || machine_contribution(to);
    if(!((from->flags|to->flags)&RUNTIME_GROUP_METADATA) && !family && !contributor) {
#ifdef MODWERK_RUNTIME_UI_ROOTS
        /* Any module may open a window or push a key layer whose callbacks run its code (the Tuner's UP + TEMPO
         * window). Before its image is retired (removed, replaced or undone), the stock UI roots must not name any
         * of its allocation, code, data or BSS: refused while they do. Contributed machines run their UI and Part checks below. */
        if(from->present && from->image_bytes && from->image!=to->image) {
            uint32_t lo=MW_IMAGE_ADDRESS(from->image),hi=lo+from->image_bytes;
            struct runtime_owner owner;
            if(modwerk_runtime_owner_at((uintptr_t)from->image,&owner) && owner.extent_bytes)
                lo=(uint32_t)owner.owned_extent,hi=lo+owner.extent_bytes;
            if(machine_ui_lifetime(ui_read_after,(void *)(uintptr_t)from->image,lo,hi)!=MACHINE_CLEAR) return RUNTIME_UI_OPEN;
        }
        /* And a task paused inside its code (between opening a window and pushing its layer, say) keeps the old
         * image: the loader's paused-task and reclaim checks cover the whole image (loader.c retiring()). */
        to->foreign_roots=to->present;
#else
        to->foreign_roots=0;
#endif
        return RUNTIME_OK;
    }
    uint32_t bank=*(volatile uint32_t *)(uintptr_t)0x46c82456u;
    if(contributor) {
        to->foreign_roots=0;
        /* VECTOR owns a stock key definition. Its original handler is restored by
         * the switch, while cached callbacks and all Part copies remain live roots. */
#ifdef MODWERK_RUNTIME_UI_ROOTS
        machine_memory_read read_ui=ui_read_after;
#else
        machine_memory_read read_ui=board_read;
#endif
        int why=machine_contributor_admission(from,to,read_ui,board_read,(void *)from->image,bank,operation);
        if(why) return why;
        if(!((from->flags|to->flags)&RUNTIME_GROUP_METADATA) && !family) return RUNTIME_OK;
    }
    int why=machine_metadata_admission(modwerk_machine_declarations,from,to,board_read,0,bank);
    if(why) return why;
    why=table_machine_association(modwerk_machine_declarations,modwerk_table_declarations,from);
    if(why) return why;
    why=table_machine_association(modwerk_machine_declarations,modwerk_table_declarations,to);
    if(why) return why;
    if(family) {
        struct runtime_span span[RUNTIME_PAUSED];
        unsigned count=modwerk_machine_paused(span,RUNTIME_PAUSED,context);
        why=table_metadata_admission(modwerk_table_declarations,from,to,operation,board_read,0,span,count);
        if(why) return why;
    }
    to->foreign_roots=to->present && ((to->flags&RUNTIME_GROUP_METADATA) || table_metadata_family(modwerk_table_declarations,to) ||
                                      machine_contribution(to));
    return RUNTIME_OK;
}
