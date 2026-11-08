/* SPDX-License-Identifier: MIT */
#include "menu_owner_backend.h"
static int identity(const struct bs_menu_owner_lease *lease,const bs_menu_owner *owner) {
    return owner && owner->module && owner->generation &&
        lease->owner.module==owner->module && lease->owner.generation==owner->generation;
}
static int valid(void *context,const bs_menu_owner *owner) {
    struct bs_menu_owner_backend *b=context;
    if(!b || !b->bound)return 0;
    for(uint32_t i=0;i<b->count;++i)
        if(identity(b->actions[i].lease,owner))return bs_menu_owner_current_locked(b->actions[i].lease);
    return 0;
}
static int invoke(void *context,const bs_menu_owner *owner,uint32_t action) {
    struct bs_menu_owner_backend *b=context;
    if(!b || !b->bound || !action)return 0;
    for(uint32_t i=0;i<b->count;++i) {
        struct bs_menu_owner_action *entry=&b->actions[i];
        if(entry->action==action && identity(entry->lease,owner)) {
            if(!bs_menu_owner_current_locked(entry->lease))return 0;
            return b->invoke(b->context,&entry->lease->owner,action);
        }
    }
    return 0;
}
int bs_menu_owner_backend_bind_locked(struct bs_menu_owner_backend *b,uint32_t count,
    const struct bs_menu_owner_action *actions,bs_menu_owner_invoke dispatch,void *context) {
    if(!b || b->bound || !count || count>BS_MENU_ACTIONS || !actions || !dispatch)return 0;
    for(uint32_t i=0;i<count;++i) {
        if(!actions[i].lease || !actions[i].action || !bs_menu_owner_current_locked(actions[i].lease))return 0;
        for(uint32_t j=0;j<i;++j) {
            const struct runtime_owner *left=&actions[i].lease->owner,*right=&actions[j].lease->owner;
            if(left->module==right->module && left->generation==right->generation &&
               (actions[i].lease!=actions[j].lease || actions[i].action==actions[j].action))return 0;
        }
    }
    for(uint32_t i=0;i<count;++i) {
        b->actions[i].lease=actions[i].lease;b->actions[i].action=actions[i].action;
    }
    b->count=count;b->invoke=dispatch;b->context=context;
    b->backend.context=b;b->backend.owner_valid=valid;b->backend.invoke=invoke;
    b->bound=1;return 1;
}
const bs_menu_backend *bs_menu_owner_backend_get_locked(struct bs_menu_owner_backend *b) {
    return b && b->bound?&b->backend:0;
}

int bs_menu_owner_backend_transition_locked(struct bs_menu_owner_backend *b,
    const struct runtime_dsp *from,const struct runtime_dsp *to,
    enum runtime_metadata_operation operation) {
    struct runtime_owner outgoing;
    if(!b || !b->bound || !b->count || b->count>BS_MENU_ACTIONS || !from || !to ||
       (operation!=RUNTIME_METADATA_PREPARE && operation!=RUNTIME_METADATA_SWITCH))return RUNTIME_MALFORMED;
    if(operation==RUNTIME_METADATA_PREPARE || !from->image || from->image==to->image)return RUNTIME_OK;
    if(!modwerk_runtime_owner_snapshot(from->image,&outgoing) ||
       !bs_menu_owner_published_locked(&outgoing))return RUNTIME_BUSY;
    /* Validate the admitted registry before any retirement. Full ledger checks
     * make module/generation matching sufficient; neither is trusted alone. */
    for(uint32_t i=0;i<b->count;++i) {
        const struct bs_menu_owner_lease *lease=b->actions[i].lease;
        if(!lease || !b->actions[i].action ||
           (lease->state!=BS_MENU_OWNER_LIVE && lease->state!=BS_MENU_OWNER_RETIRED))return RUNTIME_MALFORMED;
        if(lease->owner.module==outgoing.module && lease->owner.generation==outgoing.generation &&
           !bs_menu_owner_published_locked(&lease->owner))return RUNTIME_BUSY;
    }
    for(uint32_t i=0;i<b->count;++i) {
        struct bs_menu_owner_lease *lease=b->actions[i].lease;
        if(lease->owner.module==outgoing.module && lease->owner.generation==outgoing.generation)
            bs_menu_owner_retire_locked(lease);
    }
    return RUNTIME_OK;
}
