/* SPDX-License-Identifier: GPL-3.0-or-later
 * Actual generated frame jobs. The clock is a host fixture; packet logic,
 * HF2/HF3 acknowledgement and timeout ownership are the production source. */
#include <assert.h>
#include "transfer.h"
int dl_hook_reset_start(unsigned,unsigned,unsigned,unsigned,const uint32_t *);
volatile uint32_t test_clock;
static unsigned flags[2];
unsigned modwerk_dsp_flags(unsigned core) { return flags[core]; }
void dl_selection_tick(void) {}
void dl_residency_tick(void) {}
void dl_show_message(const char *text,unsigned duration) { (void)text; (void)duration; }
static void answer(unsigned core,unsigned refused) {
    flags[core]=(flags[core]^1u)&1u;
    if(refused) flags[core]|=2u;
    dl_frame();
}
static void checksum(unsigned core) {
    unsigned sum=0;
    for(unsigned i=0;i<DL_WORDS;++i) sum+=dl_tx[core][i];
    assert(!(sum&65535u));
}
int main(void) {
    enum { RESET_DATA=8*DL_DATA }; /* DL_RESET_DATA, in the owned header this test's transfer.h lacks */
    uint32_t words[RESET_DATA+1];
    for(unsigned i=0;i<RESET_DATA+1;++i) words[i]=(0x123456u+i*0x731u)&0xffffffu;
    assert(!dl_hook_reset_start(0,1,0,0,words));
    assert(!dl_hook_reset_start(0,1,0,RESET_DATA+1,words));
    assert(!dl_hook_reset_start(2,1,0,1,words));
    assert(!dl_hook_reset_start(1,2,0,1,words));
    assert(!dl_hook_reset_start(0,16,0,1,words));
    assert(!dl_hook_reset_start(0,8,513,2,words)); /* the key bus: one owned range per chunk, the window's 514 then 512 */
    assert(!dl_hook_reset_start(1,8,1026,1,words) && !dl_hook_reset_start(1,8,1020,7,words));
    assert(!dl_hook_reset_start(0,1,527,2,words));
    assert(!dl_hook_reset_start(0,1,1042,1,words));
    words[0]=0x1000000u;
    assert(!dl_hook_reset_start(0,4,0,1,words)); words[0]=0x123456u;
    for(unsigned core=0;core<2;++core) {
        assert(dl_hook_reset_start(core,1,528,24,words));
        assert(!dl_command_start(core,10,0,1,0));
        dl_frame(); checksum(core);
        assert(dl_tx[core][2]==11u && dl_tx[core][3]==core && dl_tx[core][4]==24u);
        assert(dl_tx[core][5]==528u && dl_tx[core][7]==1u);
        for(unsigned i=0;i<24;++i)
            assert((((uint32_t)dl_tx[core][8+2*i]<<8)|dl_tx[core][9+2*i])==words[i]);
        assert(dl_job_status(core)==0); dl_job_release(core);
        assert(dl_job_status(core)==0); /* release cannot abandon a pending ACK */
        answer(core,0); assert(dl_job_status(core)==1); dl_job_release(core);
        /* One job, several packets: one a frame, each with its own offset, done once the last is answered. */
        assert(dl_hook_reset_start(core,1,528,50,words));
        for(unsigned k=0;k<3;++k) {
            unsigned n=k<2 ? 24u:2u;
            dl_frame(); checksum(core);
            assert(dl_tx[core][2]==11u && dl_tx[core][4]==n && dl_tx[core][5]==528u+24u*k && dl_tx[core][7]==1u);
            for(unsigned i=0;i<n;++i)
                assert((((uint32_t)dl_tx[core][8+2*i]<<8)|dl_tx[core][9+2*i])==words[24u*k+i]);
            assert(dl_job_status(core)==0);
            flags[core]=(flags[core]^1u)&1u; /* answered; the next packet goes in the next frame */
        }
        dl_frame(); assert(dl_job_status(core)==1); dl_job_release(core);
        assert(!dl_command_start(core,10,0,16,0)); /* no such feature (8 is the key bus, on both cores) */
        assert(!dl_command_start(core,10,0,1,1));
        if(core) assert(!dl_command_start(core,10,0,2,0));
        assert(dl_command_start(core,10,0,5,0)); dl_frame(); checksum(core);
        assert(dl_tx[core][4]==0 && dl_tx[core][5]==5 && dl_tx[core][7]==0);
        answer(core,1); assert(dl_job_status(core)==-1); dl_job_release(core);
        assert(dl_hook_reset_start(core,4,3775,1,words)); dl_frame();
        for(unsigned i=0;i<64;++i) dl_frame();
        assert(dl_job_status(core)==-1); dl_job_release(core);
        assert(dl_job_status(core)==-2);
    }
    return 0;
}
