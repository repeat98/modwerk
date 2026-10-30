/* SPDX-License-Identifier: MIT */
/* Octatrack board boundary. Include only with the reviewed helper/collector
 * sources and fixed declarations storage. An empty storage refuses groups. */
#include "machine_admission.h"
#include "table_admission.h"
#include "machine_contributors.h"
#include "sample_editor_actions.h"
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
    /* No root reads for ordinary modules, including the default empty base. */
    unsigned family=table_metadata_family(modwerk_table_declarations,from)|table_metadata_family(modwerk_table_declarations,to);
    /* A machine contributed to the base's ot_machines table: an independent package, never a group. */
    int contributor=machine_contribution(from) || machine_contribution(to);
    if(!((from->flags|to->flags)&RUNTIME_GROUP_METADATA) && !family && !contributor) {to->foreign_roots=0;return RUNTIME_OK;}
    uint32_t bank=*(volatile uint32_t *)(uintptr_t)0x46c82456u;
    if(contributor) {
        to->foreign_roots=0;
        int why=machine_contributor_admission(from,to,board_read,0,bank,operation);
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
