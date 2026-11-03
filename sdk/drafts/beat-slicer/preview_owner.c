/* SPDX-License-Identifier: MIT */
#include "preview_owner.h"
int bs_preview_owner_transition_locked(uint32_t count,const struct bs_preview_owner_binding *bindings,
    const struct runtime_dsp *from,const struct runtime_dsp *to,enum runtime_metadata_operation operation) {
    struct runtime_owner outgoing;
    if(count>BS_PREVIEW_OWNER_BINDINGS || (count && !bindings) || !from || !to ||
       (operation!=RUNTIME_METADATA_PREPARE && operation!=RUNTIME_METADATA_SWITCH))return RUNTIME_MALFORMED;
    if(operation==RUNTIME_METADATA_PREPARE || !count || !from->image || from->image==to->image)return RUNTIME_OK;
    if(!modwerk_runtime_owner_snapshot(from->image,&outgoing) ||
       !bs_menu_owner_published_locked(&outgoing))return RUNTIME_BUSY;
    for(uint32_t i=0;i<count;++i) {
        const struct bs_menu_owner_lease *lease=bindings[i].lease;
        const struct bs_preview_async *a=bindings[i].preview;
        if(!lease || !a || !a->guard || !a->backend || !a->backend->try_lock || !a->backend->unlock ||
           !a->backend->capture || !a->backend->copy_ready ||
           (lease->state!=BS_MENU_OWNER_LIVE && lease->state!=BS_MENU_OWNER_RETIRED) ||
           !a->owner || !a->generation || a->owner!=lease->owner.module || a->generation!=lease->owner.generation)
            return RUNTIME_MALFORMED;
        for(uint32_t j=0;j<i;++j)if(bindings[j].preview==a)return RUNTIME_MALFORMED;
        if(lease->owner.module==outgoing.module && lease->owner.generation==outgoing.generation &&
           !bs_menu_owner_published_locked(&lease->owner))return RUNTIME_BUSY;
    }
    for(uint32_t i=0;i<count;++i) {
        struct bs_preview_async *a=bindings[i].preview;
        if(a->owner==outgoing.module && a->generation==outgoing.generation &&
           !bs_async_revoke(a,a->owner,a->generation))return RUNTIME_BUSY;
    }
    return RUNTIME_OK;
}
