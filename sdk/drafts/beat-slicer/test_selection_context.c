/* SPDX-License-Identifier: MIT */
#include "selection_context.h"
#define CHECK(x) do { if (!(x)) return __LINE__; } while (0)
static void first(void) {}
static void second(void) {}
static bs_menu_callback table[BS_MENU_ROWS], other[BS_MENU_ROWS];
static struct bs_selection_context context;
static void clear(void *p, uint32_t n) { uint8_t *b=p; for(uint32_t i=0;i<n;++i)b[i]=0; }
static int same(const void *a,const void *b,uint32_t n) {
    const uint8_t *x=a,*y=b;for(uint32_t i=0;i<n;++i)if(x[i]!=y[i])return 0;return 1;
}
static void copied(void *a,const void *b,uint32_t n) {
    uint8_t *x=a;const uint8_t *y=b;for(uint32_t i=0;i<n;++i)x[i]=y[i];
}
static struct bs_selection_binding binding(uint32_t count, uint32_t epoch) {
    struct bs_selection_binding b={0x1234,0x5678,table,first,{17,7},1,epoch,count,count-1};
    for(uint32_t i=0;i<BS_MENU_ROWS;++i)table[i]=other[i]=first;
    return b;
}
static int repeated(void) {
    for(uint32_t count=7;count<=10;count+=3){
        clear(&context,sizeof(context));uint32_t old=0;
        for(uint32_t epoch=1;epoch<=100;++epoch){
            struct bs_selection_binding b=binding(count,epoch);
            uint32_t ticket=0,row=UINT32_MAX;
            CHECK(!bs_selection_take_locked(&context,b.task,first,1,b.owner,epoch,&row));
            CHECK(row==UINT32_MAX);
            CHECK(bs_selection_capture_locked(&context,&b,&ticket)==BS_MENU_OK && ticket==epoch);
            CHECK(!bs_selection_take_locked(&context,b.task,first,1,b.owner,epoch,&row));
            uint32_t denied=UINT32_MAX;
            CHECK(bs_selection_capture_locked(&context,&b,&denied)==BS_MENU_BUSY && denied==UINT32_MAX);
            CHECK(bs_selection_arm_locked(&context,old,b.task,table,b.row,first)==BS_MENU_STALE);
            CHECK(bs_selection_end_locked(&context,old)==BS_MENU_STALE);
            CHECK(bs_selection_arm_locked(&context,ticket,b.task,other,b.row,first)==BS_MENU_STALE);
            CHECK(bs_selection_arm_locked(&context,ticket,b.task+1,table,b.row,first)==BS_MENU_STALE);
            CHECK(bs_selection_arm_locked(&context,ticket,b.task,table,b.row-1,first)==BS_MENU_STALE);
            CHECK(bs_selection_arm_locked(&context,ticket,b.task,table,b.row,second)==BS_MENU_STALE);
            table[b.row]=second;
            CHECK(bs_selection_arm_locked(&context,ticket,b.task,table,b.row,first)==BS_MENU_STALE);
            table[b.row]=first;
            CHECK(bs_selection_arm_locked(&context,ticket,b.task,table,b.row,first)==BS_MENU_OK);
            CHECK(!bs_selection_take_locked(&context,b.task+1,first,1,b.owner,epoch,&row));
            CHECK(!bs_selection_take_locked(&context,b.task,second,1,b.owner,epoch,&row));
            CHECK(!bs_selection_take_locked(&context,b.task,first,2,b.owner,epoch,&row));
            bs_menu_owner retired={17,8},wrong={18,7};
            CHECK(!bs_selection_take_locked(&context,b.task,first,1,retired,epoch,&row));
            CHECK(!bs_selection_take_locked(&context,b.task,first,1,wrong,epoch,&row));
            CHECK(!bs_selection_take_locked(&context,b.task,first,1,b.owner,epoch+1,&row));
            CHECK(row==UINT32_MAX);
            CHECK(bs_selection_take_locked(&context,b.task,first,1,b.owner,epoch,&row) && row==b.row);
            row=UINT32_MAX;
            CHECK(!bs_selection_take_locked(&context,b.task,first,1,b.owner,epoch,&row) && row==UINT32_MAX);
            CHECK(bs_selection_arm_locked(&context,ticket,b.task,table,b.row,first)==BS_MENU_STALE);
            CHECK(bs_selection_capture_locked(&context,&b,&denied)==BS_MENU_BUSY);
            CHECK(bs_selection_end_locked(&context,ticket)==BS_MENU_OK);
            CHECK(!context.binding.callback && !context.binding.table && context.serial==ticket);
            CHECK(!bs_selection_take_locked(&context,b.task,first,1,b.owner,epoch,&row));
            old=ticket;
        }
    }
    return 0;
}
static int invalid(void) {
    for(uint32_t field=0;field<12;++field){
        clear(&context,sizeof(context));struct bs_selection_binding b=binding(7,1);
        if(field==0)b.window=0;
        if(field==1)b.task=0;
        if(field==2)b.table=0;
        if(field==3)b.callback=0;
        if(field==4)b.owner.module=0;
        if(field==5)b.owner.generation=0;
        if(field==6)b.domain=0;
        if(field==7)b.epoch=0;
        if(field==8)b.count=0;
        if(field==9)b.count=BS_MENU_ROWS+1;
        if(field==10)b.row=b.count;
        if(field==11)b.callback=second;
        struct bs_selection_context before;copied(&before,&context,sizeof(before));
        uint32_t ticket=UINT32_MAX;
        CHECK(bs_selection_capture_locked(&context,&b,&ticket)==BS_MENU_INVALID);
        CHECK(ticket==UINT32_MAX && same(&before,&context,sizeof(before)));
    }
    for(uint32_t armed=0;armed<2;++armed){
        clear(&context,sizeof(context));struct bs_selection_binding b=binding(7,1);uint32_t ticket,row=UINT32_MAX;
        CHECK(bs_selection_capture_locked(&context,&b,&ticket)==BS_MENU_OK);
        if(armed)CHECK(bs_selection_arm_locked(&context,ticket,b.task,table,b.row,first)==BS_MENU_OK);
        CHECK(bs_selection_block_locked(&context,ticket)==BS_MENU_OK);
        CHECK(!bs_selection_take_locked(&context,b.task,first,1,b.owner,1,&row) && row==UINT32_MAX);
        CHECK(bs_selection_arm_locked(&context,ticket,b.task,table,b.row,first)==BS_MENU_STALE);
        CHECK(bs_selection_end_locked(&context,ticket)==BS_MENU_OK);
    }
    clear(&context,sizeof(context));context.serial=UINT32_MAX;
    struct bs_selection_binding b=binding(7,1);uint32_t ticket=0;
    CHECK(bs_selection_capture_locked(&context,&b,&ticket)==BS_MENU_EXHAUSTED && !ticket);
    CHECK(context.state==BS_SELECTION_IDLE && context.serial==UINT32_MAX);
    CHECK(bs_selection_end_locked(&context,UINT32_MAX)==BS_MENU_STALE);
    return 0;
}
int bs_selection_selftest(void) { int error=repeated();return error?error:invalid(); }
