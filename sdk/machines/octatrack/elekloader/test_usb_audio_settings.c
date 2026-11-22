/* SPDX-License-Identifier: GPL-3.0-or-later */
#include <assert.h>
#include <string.h>
#include "../module-adapters/usb_audio_settings.c"

volatile uint8_t mwua_requested, mwua_active;
static uint32_t input[3*20], output[3*20];
static uint32_t select_option(uint32_t saved, const char *field, const char *option)
{
    struct modwerk_choice_page group = {0}, page = {0};
    audio_page(saved, MODWERK_SETTING_FIELDS, &group);
    for (unsigned i=0; i<group.count; ++i) if (!strcmp(group.names[i],field)) {
        audio_page(saved, i, &page);
        for (unsigned j=0; j<page.count; ++j) if (!strcmp(page.names[j],option))
            return audio_choose(saved,i,j);
    }
    assert(0);
    return 0;
}
static void verify_pairs(const unsigned *pairs, unsigned n, unsigned fs)
{
    memset(output, 0xff, sizeof output);
    mwua_copy(output, input, 3, fs);
    for (unsigned f=0; f<3; ++f) for (unsigned i=0; i<n; ++i) for (unsigned side=0; side<2; ++side)
        assert(output[(f*n+i)*2+side] == (pairs[i] == SILENCE ? 0 : input[f*20+pairs[i]*2+side]));
    if (n < 10) assert(output[3*n*2] == UINT32_MAX);
}
static void apply(uint32_t w)
{
    audio_apply(w);
    mwua_active = mwua_requested;
    mwua_begin_frame();
}
int main(void)
{
    for (unsigned i=0; i<60; ++i) input[i]=0x100+i*19;
    apply(1); assert(mwua_off && mwua_active==USB20);
    apply(2); assert(!mwua_off && !mwua_direct);
    verify_pairs((unsigned[]){10,10,10,10,10,10,10,10,8,9},10,0);
    assert(select_option(0,"OUTPUT MODE","OFF") == 1);
    assert(select_option(1,"OUTPUT MODE","MAIN + CUE ONLY") == 2);
    assert(select_option(2,"OUTPUT MODE","ALL CHANNELS") == 0);
    uint32_t w=0;
    apply(w); assert(mwua_direct && mwua_fs_sum && !mwua_post);
    for (unsigned i=0; i<LAYOUTS; ++i) {
        w=select_option(w,"LAYOUT",layouts[i]);
        apply(w); assert(mwua_active==profiles[i] && mwua_pairs==counts[i]);
        unsigned expected[10];
        for (unsigned j=0; j<counts[i]; ++j) expected[j]=first[i]+j;
        verify_pairs(expected,counts[i],0);
        if (i<=TRACKS) {
            w=select_option(w,"TRACK TAP","POST LEVEL");
            apply(w); assert(mwua_post && mwua_fs_sum);
            w=select_option(w,"TRACK TAP","PRE LEVEL");
            apply(w); assert(!mwua_post && mwua_fs_sum);
        } else verify_pairs(expected,1,1);
    }
    w=select_option(w,"LAYOUT",layouts[0]); apply(w);
    w=select_option(w,"SEND TO","OUTBOX 8");
    audio_apply(w); mwua_begin_frame();
    assert(mwua_requested==OUTBOX8 && mwua_active==USB20 && mwua_pairs==10);
    mwua_active=mwua_requested; mwua_begin_frame();
    w=select_option(w,"ASSIGN IN ORDER","ASSIGN"); apply(w);
    verify_pairs((unsigned[]){0,1,2,3},4,0);
    w=select_option(w,"OUT 1/2","CUE");
    w=select_option(w,"OUT 3/4","TRACK 8");
    w=select_option(w,"OUT 5/6","OFF");
    w=select_option(w,"OUT 7/8","CUE"); apply(w);
    verify_pairs((unsigned[]){9,7,10,9},4,0);
    verify_pairs((unsigned[]){9},1,1);
    w=select_option(w,"OUTPUT MODE","MAIN + CUE ONLY"); apply(w);
    verify_pairs((unsigned[]){9,10,10,9},4,0);
    w=select_option(w,"LAYOUT","MAIN"); apply(w);
    verify_pairs((unsigned[]){10,10,10,10},4,0);
    w=select_option(w,"ASSIGN IN ORDER","ASSIGN"); apply(w);
    verify_pairs((unsigned[]){8,10,10,10},4,0);
    return 0;
}
