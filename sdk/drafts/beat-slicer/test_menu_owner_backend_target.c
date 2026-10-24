/* SPDX-License-Identifier: MIT */
/* Includes the synthetic owner fixture, not the real runtime loader. */
#include "test_menu_owner_target.c"
#include "menu_owner_backend.h"
static unsigned calls;
static uint32_t last_action;
static int accepted=1,bad_dispatch;
static int receive(void *context,const struct runtime_owner *o,uint32_t action) {
    if(context!=&calls || !same(o,&expected) || !intact || (action!=17 && action!=29))bad_dispatch=1;
    ++calls;last_action=action;return accepted;
}
static void trampoline(void) {}
int bs_owner_backend_target_selftest(void) {
    int result=bs_owner_target_selftest();if(result)return result;
    for(unsigned rows=6;rows<=9;rows+=3) {
        struct bs_menu_owner_lease lease,duplicate;
        struct bs_menu_owner_backend registry,bad;
        bs_editor_menu menu;
        const char *labels[9]={"ONE","TWO","THREE","FOUR","FIVE","SIX","SEVEN","EIGHT","NINE"};
        const bs_menu_callback callbacks[9]={0};
        struct bs_menu_owner_action bindings[2];
        bs_menu_action actions[2];uint32_t token=0;
        clear(positions,sizeof positions);clear(&lease,sizeof lease);clear(&duplicate,sizeof duplicate);
        clear(&registry,sizeof registry);clear(&bad,sizeof bad);clear(&menu,sizeof menu);
        fill(&expected,501+rows);intact=1;positions[127]=&first_image;
        CHECK(bs_menu_owner_bind_locked(&lease,&expected));
        CHECK(bs_menu_owner_bind_locked(&duplicate,&expected));
        bindings[0].lease=&lease;bindings[0].action=17;bindings[1].lease=&lease;bindings[1].action=29;
        for(unsigned i=0;i<2;++i) {
            actions[i].key=i?10:20;actions[i].action=i?29:17;
            actions[i].owner.module=expected.module;actions[i].owner.generation=expected.generation;
            actions[i].label=i?"SECOND":"FIRST";
        }
        CHECK(!bs_menu_owner_backend_get_locked(&registry));
        bindings[1].lease=&duplicate;
        CHECK(!bs_menu_owner_backend_bind_locked(&bad,2,bindings,receive,&calls));
        CHECK(untouched(&bad,sizeof bad));bindings[1].lease=&lease;
        bindings[1].action=17;
        CHECK(!bs_menu_owner_backend_bind_locked(&bad,2,bindings,receive,&calls));
        CHECK(untouched(&bad,sizeof bad));bindings[1].action=29;
        CHECK(bs_menu_owner_backend_bind_locked(&registry,2,bindings,receive,&calls));
        CHECK(!bs_menu_owner_backend_bind_locked(&registry,2,bindings,receive,&calls));
        const bs_menu_backend *backend=bs_menu_owner_backend_get_locked(&registry);CHECK(backend);
        calls=0;bad_dispatch=0;accepted=1;
        CHECK(!backend->owner_valid(backend->context,0));
        CHECK(!backend->invoke(backend->context,&actions[0].owner,0));
        CHECK(!backend->invoke(backend->context,&actions[0].owner,999) && !calls);
        bindings[0].lease=0;bindings[1].action=999;
        CHECK(bs_menu_open_locked(&menu,rows,labels,callbacks,2,actions,trampoline,backend,&token)==BS_MENU_OK);
        CHECK(menu.labels[rows][0]=='S' && menu.labels[rows+1][0]=='F');
        CHECK(bs_menu_dispatch_locked(&menu,token,rows)==BS_MENU_OK);
        CHECK(calls==1 && last_action==29 && !bad_dispatch);
        CHECK(bs_menu_dispatch_locked(&menu,token,rows+1)==BS_MENU_STALE && calls==1);
        /* Synthetic model has no native menu references. */
        CHECK(bs_menu_detached_locked(&menu,token)==BS_MENU_OK);
        CHECK(bs_menu_open_locked(&menu,rows,labels,callbacks,2,actions,trampoline,backend,&token)==BS_MENU_OK);
        accepted=0;CHECK(bs_menu_dispatch_locked(&menu,token,rows+1)==BS_MENU_CALLBACK_FAILED);
        CHECK(calls==2 && last_action==17 && !bad_dispatch);accepted=1;
        CHECK(bs_menu_detached_locked(&menu,token)==BS_MENU_OK);
        CHECK(bs_menu_open_locked(&menu,rows,labels,callbacks,2,actions,trampoline,backend,&token)==BS_MENU_OK);
        positions[127]=&other_image;
        CHECK(bs_menu_dispatch_locked(&menu,token,rows)==BS_MENU_STALE && calls==2);
        CHECK(lease.state==BS_MENU_OWNER_RETIRED);
        positions[127]=&first_image;
        CHECK(!backend->owner_valid(backend->context,&actions[0].owner));
        CHECK(!backend->invoke(backend->context,&actions[0].owner,17) && calls==2 && !bad_dispatch);
    }
    return 0;
}
