/* SPDX-License-Identifier: MIT */
#include "resident_menu.h"
#define CHECK(x) do { if(!(x))return __LINE__; } while(0)
static struct bs_resident_menu resident;
static struct bs_selection_context selection;
static uint32_t generation,invokes,bad;
static void stock(void) {}
static void trampoline(void) {}
static const char *const labels[9]={"A","B","C","D","E","F","G","H","I"};
static const bs_menu_callback callbacks[9]={stock,stock,stock,stock,stock,stock,stock,stock,stock};
static const bs_menu_action action={123,1,{17,7},"BEAT GRID"};
static void clear(void *p,uint32_t n){uint8_t *b=p;for(uint32_t i=0;i<n;++i)b[i]=0;}
static void copy(void *a,const void *b,uint32_t n){uint8_t *x=a;const uint8_t *y=b;for(uint32_t i=0;i<n;++i)x[i]=y[i];}
static int same(const void *a,const void *b,uint32_t n){const uint8_t *x=a,*y=b;for(uint32_t i=0;i<n;++i)if(x[i]!=y[i])return 0;return 1;}
static int valid(void *context,const bs_menu_owner *owner){
    return context==&resident && owner->module==17 && owner->generation==generation;
}
static int invoke(void *context,const bs_menu_owner *owner,uint32_t id){
    if(!valid(context,owner) || id!=1 || resident.menu.state!=BS_MENU_DISPATCHING ||
       selection.state!=BS_SELECTION_CONSUMED){bad=1;return 0;}
    uint32_t token=99;
    if(bs_resident_menu_reopen_locked(&resident,&selection,1,1,&token)!=BS_MENU_BUSY || token!=99 ||
       bs_resident_menu_retire_locked(&resident,resident.menu.serial)!=BS_MENU_BUSY)bad=1;
    ++invokes;return 1;
}
static const bs_menu_backend backend={&resident,valid,invoke};
static int materialize(uint32_t count,uint32_t *token){
    clear(&resident,sizeof(resident));clear(&selection,sizeof(selection));generation=7;invokes=bad=0;
    return bs_resident_menu_materialize_locked(&resident,count,labels,callbacks,1,&action,trampoline,&backend,1,1,token);
}
static int immutable(const bs_editor_menu *saved){
    const bs_editor_menu *m=&resident.menu;
    return same(m->text,saved->text,sizeof(m->text)) && same(m->labels,saved->labels,sizeof(m->labels)) &&
        same(m->callbacks,saved->callbacks,sizeof(m->callbacks)) && same(m->actions,saved->actions,sizeof(m->actions)) &&
        same(&m->backend,&saved->backend,sizeof(m->backend)) && m->count==saved->count && m->stock_count==saved->stock_count;
}
static int repeated(void){
    for(uint32_t count=6;count<=9;count+=3){
        uint32_t token=0;CHECK(materialize(count,&token)==BS_MENU_OK && token==1);
        bs_editor_menu frozen;copy(&frozen,&resident.menu,sizeof(frozen));
        struct bs_selection_context old;clear(&old,sizeof(old));
        for(uint32_t round=0;round<100;++round){
            CHECK(token==round+1 && immutable(&frozen));
            if(round)CHECK(bs_resident_menu_dispatch_locked(&resident,&old,0x5678)==BS_MENU_STALE && invokes==round);
            struct bs_selection_binding b={0x1234,0x5678,resident.menu.callbacks,trampoline,{17,7},1,token,count+1,count};
            uint32_t ticket=0,out=99;
            CHECK(bs_selection_capture_locked(&selection,&b,&ticket)==BS_MENU_OK);
            CHECK(bs_resident_menu_dispatch_locked(&resident,&selection,b.task)==BS_MENU_STALE);
            CHECK(bs_selection_arm_locked(&selection,ticket,b.task,b.table,b.row,trampoline)==BS_MENU_OK);
            copy(&old,&selection,sizeof(old));
            CHECK(bs_resident_menu_dispatch_locked(&resident,&selection,b.task+1)==BS_MENU_STALE);
            CHECK(bs_resident_menu_dispatch_locked(&resident,&selection,b.task)==BS_MENU_OK && invokes==round+1 && !bad);
            CHECK(bs_resident_menu_dispatch_locked(&resident,&selection,b.task)==BS_MENU_STALE);
            CHECK(bs_resident_menu_reopen_locked(&resident,&selection,1,1,&out)==BS_MENU_BUSY && out==99);
            CHECK(bs_selection_end_locked(&selection,ticket)==BS_MENU_OK);
            CHECK(bs_resident_menu_reopen_locked(&resident,&selection,0,1,&out)==BS_MENU_BUSY && out==99);
            CHECK(bs_resident_menu_reopen_locked(&resident,&selection,1,2,&out)==BS_MENU_STALE && out==99);
            CHECK(bs_resident_menu_materialize_locked(&resident,count,labels,callbacks,1,&action,trampoline,&backend,1,1,&out)==BS_MENU_BUSY && out==99);
            if(round<99)CHECK(bs_resident_menu_reopen_locked(&resident,&selection,1,1,&token)==BS_MENU_OK);
        }
        CHECK(immutable(&frozen) && invokes==100);
        CHECK(bs_resident_menu_reopen_locked(&resident,&selection,1,1,&token)==BS_MENU_OK);
        struct bs_selection_binding b={0x1234,0x5678,resident.menu.callbacks,stock,{17,7},1,token,count+1,0};
        uint32_t ticket;
        CHECK(bs_selection_capture_locked(&selection,&b,&ticket)==BS_MENU_OK);
        CHECK(bs_selection_arm_locked(&selection,ticket,b.task,b.table,0,stock)==BS_MENU_OK);
        CHECK(bs_resident_menu_dispatch_locked(&resident,&selection,b.task)==BS_MENU_STALE && invokes==100);
        CHECK(bs_selection_end_locked(&selection,ticket)==BS_MENU_OK);
        CHECK(bs_resident_menu_retire_locked(&resident,token)==BS_MENU_OK);
        generation=8;uint32_t out=99;
        CHECK(bs_resident_menu_reopen_locked(&resident,&selection,1,1,&out)==BS_MENU_STALE && out==99 && immutable(&frozen));
    }
    return 0;
}
static int exhaustion(void){
    for(uint32_t which=0;which<2;++which){
        uint32_t token=0;CHECK(materialize(6,&token)==BS_MENU_OK);
        CHECK(bs_resident_menu_retire_locked(&resident,token)==BS_MENU_OK);
        if(which)selection.serial=UINT32_MAX;else resident.menu.serial=UINT32_MAX;
        token=99;CHECK(bs_resident_menu_reopen_locked(&resident,&selection,1,1,&token)==BS_MENU_EXHAUSTED && token==99);
    }
    return 0;
}
int bs_resident_selftest(void){int error=repeated();return error?error:exhaustion();}
