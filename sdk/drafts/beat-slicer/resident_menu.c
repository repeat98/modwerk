/* SPDX-License-Identifier: MIT */
#include "resident_menu.h"
bs_menu_status bs_resident_menu_materialize_locked(struct bs_resident_menu *r,
    uint32_t count,const char *const *labels,const bs_menu_callback *callbacks,
    uint32_t actions,const bs_menu_action *items,bs_menu_callback trampoline,
    const bs_menu_backend *backend,uint32_t layout,uint32_t domain,uint32_t *token) {
    if(!r || !layout || !domain)return BS_MENU_INVALID;
    if(r->enrolled)return BS_MENU_BUSY;
    bs_menu_status status=bs_menu_open_locked(&r->menu,count,labels,callbacks,actions,items,trampoline,backend,token);
    if(status==BS_MENU_OK){r->enrolled=1;r->layout_generation=layout;r->domain=domain;r->trampoline=trampoline;}
    return status;
}
bs_menu_status bs_resident_menu_reopen_locked(struct bs_resident_menu *r,
    const struct bs_selection_context *c,int native_idle,uint32_t layout,uint32_t *token) {
    if(!r || !c || !token)return BS_MENU_INVALID;
    if(!r->enrolled || layout!=r->layout_generation)return BS_MENU_STALE;
    if(!native_idle || c->state!=BS_SELECTION_IDLE || r->menu.state==BS_MENU_OPEN ||
       r->menu.state==BS_MENU_DISPATCHING)return BS_MENU_BUSY;
    if(r->menu.state!=BS_MENU_RETIRING)return BS_MENU_STALE;
    if(r->menu.serial==UINT32_MAX || c->serial==UINT32_MAX)return BS_MENU_EXHAUSTED;
    for(uint32_t i=0;i<r->menu.count-r->menu.stock_count;++i)
        if(!r->menu.backend.owner_valid(r->menu.backend.context,&r->menu.actions[i].owner))return BS_MENU_STALE;
    /* Tables/actions/backend are intentionally untouched. Only this opening's
     * authority and private selection change, under the same stable boundary. */
    *token=++r->menu.serial;r->menu.selection=-1;r->menu.state=BS_MENU_OPEN;
    return BS_MENU_OK;
}
bs_menu_status bs_resident_menu_retire_locked(struct bs_resident_menu *r,uint32_t token) {
    return r && r->enrolled ? bs_menu_retire_locked(&r->menu,token) : BS_MENU_INVALID;
}
bs_menu_status bs_resident_menu_dispatch_locked(struct bs_resident_menu *r,
    struct bs_selection_context *c,uintptr_t task) {
    if(!r || !c || !r->enrolled)return BS_MENU_INVALID;
    bs_editor_menu *m=&r->menu;
    if(m->state!=BS_MENU_OPEN || c->binding.table!=m->callbacks ||
       c->binding.row<m->stock_count || c->binding.row>=m->count)return BS_MENU_STALE;
    const bs_menu_action *action=&m->actions[c->binding.row-m->stock_count];
    uint32_t row;
    if(!bs_selection_take_locked(c,task,r->trampoline,r->domain,action->owner,m->serial,&row))return BS_MENU_STALE;
    m->selection=(int32_t)row;
    return bs_menu_dispatch_locked(m,m->serial,row);
}
