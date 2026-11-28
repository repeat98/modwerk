/* SPDX-License-Identifier: MIT
 * Actual generated frame transport; only timer/HF2-HF3 hardware is modelled.
 */
#include <assert.h>
#include <stdio.h>
#include "transfer.h"
volatile uint32_t test_clock;
volatile uint32_t modwerk_cost[28];
static unsigned flags[2];
unsigned modwerk_dsp_flags(unsigned c){return flags[c];}
void modwerk_diag_frame(void){}
void dl_selection_tick(void){}
void dl_residency_tick(void){}
void dl_show_message(const char *s,unsigned n){(void)s;(void)n;}
void modwerk_cost_stamp(unsigned n){(void)n;}
int modwerk_status_refused(unsigned n){(void)n;return 0;}
static void ack(unsigned c,unsigned refuse){flags[c]^=1u;flags[c]=(flags[c]&1u)|(refuse?2u:0u);dl_frame();}
static void sum(unsigned c){unsigned s=0;for(unsigned i=0;i<64;++i)s+=dl_tx[c][i];assert(!(s&65535));}
int main(void){
    struct dl_owned_job j,k;static uint32_t initial[192];
    for(unsigned c=0;c<2;++c){
        assert(!dl_owned_command_reserve(c,1,13,16,0,0,&j));
        assert(!dl_owned_command_reserve(c,1,13,0x200,0,0,&j));
        assert(!dl_owned_command_reserve(c,1,13,0,65536,0,&j));
        assert(!dl_owned_command_reserve(c,1,13,0,0,65536,&j));
        assert(!dl_owned_reset_reserve(c,1,16,1023,2,initial,&j));
        assert(!dl_owned_reset_reserve(c,1,16,1839,1,initial,&j));
        assert(!dl_owned_reset_reserve(c,1,16,1838,2,initial,&j));
        for(unsigned member=0;member<16;++member){
            unsigned id=member|0x100u;
            assert(dl_owned_command_reserve(c,0x54500001,13,id,0x0102,0x7f80,&j));
            assert(!dl_command_start(c,10,0,0,0));
            assert(!dl_owned_command_reserve(c,77,DL_PROBE,0,0,0,&k));
            assert(dl_owned_submit(&j)==1);dl_frame();sum(c);
            assert(dl_tx[c][2]==13 && dl_tx[c][4]==id && dl_tx[c][5]==0x0102 && dl_tx[c][7]==0x7f80);
            assert(!dl_owned_job_release(&j));assert(!dl_owned_job_poll(&j,0));
            ack(c,0);assert(dl_owned_job_poll(&j,0)==1);
            k=j;k.generation^=1u;assert(!dl_owned_job_release(&k));
            assert(dl_owned_job_release(&j)==1 && !dl_owned_holder(c));
        }
        assert(dl_owned_reset_reserve(c,0x54500001,16,1024,1,initial,&j));
        assert(dl_owned_submit(&j)==1);dl_frame();sum(c);
        assert(dl_tx[c][2]==11 && dl_tx[c][4]==1 && dl_tx[c][5]==1024 && dl_tx[c][7]==16);
        ack(c,0);assert(dl_owned_job_poll(&j,0)==1 && dl_owned_job_release(&j)==1);
        /* Older resident CAS/reset packets still share the same owned lane. */
        assert(dl_owned_command_reserve(c,77,10,0,5,0,&j));assert(dl_owned_submit(&j)==1);
        dl_frame();sum(c);assert(dl_tx[c][2]==10 && dl_tx[c][5]==5);
        ack(c,0);assert(dl_owned_job_poll(&j,0)==1 && dl_owned_job_release(&j)==1);
        assert(dl_owned_command_reserve(c,0x54500001,13,0,0,0,&j));assert(dl_owned_submit(&j)==1);dl_frame();
        ack(c,1);assert(dl_owned_job_poll(&j,0)==-1 && dl_owned_closed(c));
        assert(dl_owned_job_release(&j)==1);
        assert(!dl_owned_command_reserve(c,77,DL_PROBE,0,0,0,&k));
    }
    puts("PASS: actual frame transport, 32 scoped member packets, legacy coexistence, reset boundaries, exact ownership, delayed/refused ACK and fail-closed retention");
}
