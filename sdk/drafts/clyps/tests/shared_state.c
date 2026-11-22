/* Compile the actual UI and S1 handlers with synthetic OS reads. */
#include <assert.h>
#include <string.h>
#define CLYPS_HOST_TEST
#include "../live_module.c"
static unsigned selected, run, popup, pool, page, midi, scene, record, message, setup;
static uint32_t host_long(uintptr_t a)
{
    switch (a) {
    case 0x800065b8: return run;
    case 0x460e5e30: return popup;
    case 0x460d1e70: return message;
    case 0x460d175c: return setup;
    case 0x460e70e0: return pool;
    case 0x460d1736: return record;
    default: return 0;
    }
}
static uint8_t host_byte(uintptr_t a)
{
    if (a == 0x100b14cc) return selected;
    if (a == 0x46c7d8d8) return page;
    if (a == 0x80000015) return midi;
    if (a == 0x46100b1b) return scene;
    if (a >= BANK_BASE && a < BANK_BASE + 16*PATTERN_BYTES) {
        unsigned offset = (a-BANK_BASE) % PATTERN_BYTES;
        if (offset==0x8e51 || offset==0x8e53) return 16;
        if (offset==0x8e52 || offset==0x8e54) return 2;
    }
    return 0;
}
static void tap(int code)
{
    assert(module_key(code,1));
    assert(module_key(0x100 | code,0));
}
/* Requests on either side of a native wrap callback, using real SRC/ARR handlers. */
static void row_boundary(void)
{
    clyps_bank_load(0,0);
    run=0;
    tap(ARR);
    for (unsigned t=0;t<8;++t) {
        if (t) assert(module_enc(6,1));
        tap((int)t+1);
    }
    const uint32_t all = 0x87654321u;
    assert(playing==all && requested==all);
    tap(ARR); tap(YES); tap(15);  /* save row 16 */
    assert(defined==(1u<<15) && rows[15]==all);
    tap(ARR); tap(0);             /* restore T8 at stop */
    assert(playing==0x07654321u);
    run=1;
    clyps_wrap();
    tap(ARR); tap(15);            /* just after wrap: still queued */
    assert(playing==0x07654321u && requested==all && pending_row==16);
    clyps_wrap();
    assert(playing==all && !pending_row && last_row==16);
    tap(ARR); tap(1); tap(2);     /* latest request wins */
    assert(requested==0x27654321u && playing==all);
    assert(!module_key(STOP,1) && !module_key(STOP,0));
    assert(requested==all);
    clyps_wrap();
    assert(playing==all);
    int home=0, foreign=4;
    clyps_audio_source(&home,8,0);
    clyps_audio_source(&home,7,1);
    clyps_audio_source(&foreign,7,0);
    assert(home==0 && foreign==4);
    tap(NO);
    assert(locked);
    tap(YES);
    assert(locked && playing==all);
    run=0; tap(YES);
    assert(!locked && !requested && !playing);
    clyps_bank_load(0,0);
    assert(!defined);
}
int main(void)
{
    row_boundary();
    unsigned char frame[1024];
    tap(ARR);
    for (int t=0; t<8; ++t) {
        assert(!module_key(0x110+t,1) && !module_key(0x10+t,1));
        assert(!module_key(0x110+t,0) && !module_key(0x10+t,0));
        assert(!requested && !playing && track==0);
    }
    assert(module_enc(6,7) && track==7);
    tap(ARR);
    assert(module_enc(6,15) && slot==15 && track==7);
    tap(NO);

    for (unsigned lane=0; lane<8; ++lane) {
        selected=lane;
        clyps_bank_load(0,0);
        run=1;
        assert(!module_key(SRC,1) && !module_key(SRC,0));
        tap(ARR); tap(SRC);
        assert(src_list && track==lane);
        for (unsigned ref=0; ref<16; ++ref) {
            if (ref) assert(module_enc(6,1));
            assert(src_cursor==ref && requested==playing);
            uint32_t before=playing;
            tap(YES);
            assert(playing==before && requested==(ref<<(4*lane)));
            memset(frame,0xa5,sizeof frame);
            module_draw(frame);
            for (unsigned x=0;x<128;++x)
                assert(frame[x*8]==0xa5 && frame[x*8+7]==0xa5);
            clyps_wrap();
            for (unsigned t=0;t<8;++t) {
                int pattern=0;
                clyps_audio_source(&pattern,t,0);
                assert(pattern==(int)(t==lane ? ref : 0));
            }
        }
        tap(ARR);
        assert(visible && !src_list);
        tap(NO);
        assert(locked && !visible);
        run=0; tap(YES);
        assert(!locked && !playing && !requested && !visible);
    }
    for (unsigned i=0;i<8;++i) {
        clyps_bank_load(0,0); selected=1;
        tap(ARR); tap(SRC);
        assert(src_list);
        unsigned *condition[]={&popup,&pool,&page,&midi,&scene,&record,&message,&setup};
        *condition[i]=(i==4 ? 2 : 1);
        memset(frame,0x69,sizeof frame);
        module_draw(frame);
        assert(!src_list && !visible);
        for (unsigned j=0;j<sizeof frame;++j) assert(frame[j]==0x69);
        assert(!module_key(YES,1) && !module_key(YES,0));
        *condition[i]=0;
    }
    return 0;
}
