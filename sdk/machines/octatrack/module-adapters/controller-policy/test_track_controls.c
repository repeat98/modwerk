/* SPDX-License-Identifier: MIT
 * Actual private Base service with synthetic ownership/transport facts.
 * This does not qualify hardware ACKs or execute any firmware.
 */
#define MS_TRACK_CONTROL_HOST 1
#include <stdint.h>
#include <assert.h>
#include <string.h>
#include <stdio.h>
#define MW_CONTROLLER_SLOTS 2
#define MW_CTL_ACTIVE 7
#define MW_CTL_RETIRING 9
struct dl_owned_job {uint32_t generation,ticket;unsigned core;};
struct runtime_owner {uint32_t generation,module;uintptr_t owned_extent;uint32_t image_offset,image_bytes;uint8_t controller_sha256[32];};
struct mw_controller_identity {uint32_t feature,module;};
struct mw_controller_binding {struct mw_controller_identity identity;uint32_t generation;};
struct mw_controller_slot {struct mw_controller_binding binding;unsigned state,job_state[2];};
struct mw_controller_write_policy {struct mw_controller_identity identity;};
struct runtime_module {struct {unsigned cycles,kind;} dsp;};
static unsigned closed,mask[2]={16,16},mask_known=3,modwerk_controller_lease_seen;
static struct {struct mw_controller_slot slots[2];} registry;
#define REGISTRY registry
static struct {unsigned quiesce;} want[2];
static unsigned owner_ok=1,control_ok=1,budget_ok=1,reserve_fail,submit_fail,release_fail,cancel_fail;
static unsigned pending[2],submitted[2],poll_status[2],reserves,submits,cancels,failures,flags[2],hiword[2],loword[2];
static uint32_t generation=1;
static uintptr_t return_pc=0x1008;
static uint32_t modwerk_machine_lock(void){return 0;}
static void modwerk_machine_unlock(uint32_t v){assert(v==0);}
static int modwerk_controller_write_resolve(uintptr_t entry,struct runtime_owner *o,uintptr_t *image){
 assert(entry==0x1000);memset(o,0,sizeof *o);o->owned_extent=0x1000;o->image_bytes=32;o->generation=generation;o->module=100;*image=0x5000;return (int)owner_ok;
}
static const struct mw_controller_write_policy *row_for(const uint8_t *p,uint32_t m,uint32_t n){
 (void)p;assert(m==100 && n==32);static const struct mw_controller_write_policy policy={{16,100}};return &policy;
}
static int binding_of(const struct runtime_owner *o,const struct mw_controller_write_policy *p,struct mw_controller_binding *b){b->generation=o->generation;b->identity=p->identity;return 1;}
static unsigned slot_of(const struct mw_controller_binding *b){assert(b->identity.feature==16);return 0;}
static int mw_controller_control_write_allowed(void *r,const struct mw_controller_binding *b){(void)r;(void)b;return (int)control_ok;}
static const struct runtime_module *module_of(const struct mw_controller_binding *b){(void)b;static const struct runtime_module m={{448,1}};return &m;}
static uint32_t modwerk_runtime_publication(uintptr_t image){assert(image==0x1000);return 17;}
static unsigned charged,released;
int modwerk_dsp_track_fits(uint32_t module,unsigned cycles,unsigned kind){assert(module==100 && cycles==448 && kind==1);return (int)budget_ok;}
void modwerk_dsp_track_tick(void){}
int modwerk_dsp_track_charge(uint32_t module,unsigned cycles,unsigned kind,int on){assert(module==100);if(on){assert(cycles==448&&kind==1);if(budget_ok)charged=1;}else{assert(charged);charged=0;++released;}return (int)budget_ok;}
uintptr_t ms_track_test_pc(void){return return_pc;}
static int dl_owned_command_reserve(unsigned c,uint32_t g,unsigned op,unsigned id,unsigned a,unsigned b,struct dl_owned_job *j){
 assert(op==12 && g==generation && c<2);++reserves;if(reserve_fail==c+1)return 0;
 assert(!pending[c]);pending[c]=1;j->core=c;j->generation=g;j->ticket=1;flags[c]=id;hiword[c]=a;loword[c]=b;return 1;
}
static int dl_owned_cancel(const struct dl_owned_job *j){++cancels;if(cancel_fail)return 0;pending[j->core]=0;return 1;}
static int dl_owned_submit(const struct dl_owned_job *j){++submits;if(submit_fail==j->core+1)return 0;submitted[j->core]=1;return 1;}
static int dl_owned_job_poll(const struct dl_owned_job *j,void *p){(void)p;return (int)poll_status[j->core];}
static int dl_owned_job_release(const struct dl_owned_job *j){if(release_fail)return 0;pending[j->core]=submitted[j->core]=0;return 1;}
static void dl_owned_fail_closed(unsigned c){assert(c<2);++failures;}
#include "track_control.inc"
static int send(uint32_t e,uint32_t r){return modwerk_track_controls(0x1000,e,r,0x01020304u,0x05060708u);}
int main(void){
 assert(modwerk_track_publication(0x1000)==17);owner_ok=0;assert(!modwerk_track_publication(0x1000));owner_ok=1;
 registry.slots[0].state=MW_CTL_ACTIVE;registry.slots[0].binding.generation=1;
 registry.slots[0].binding.identity.feature=16;registry.slots[0].binding.identity.module=100;
 /* ENABLE preparation reserves before either mask is on. Off masks while
    INITIALIZING/PUBLISHING must never release this reservation. */
 mask[0]=mask[1]=0;budget_ok=0;assert(!track_prepare(0) && !charged);
 budget_ok=1;assert(track_prepare(0) && charged);track_poll();assert(charged && !released);
 mask[0]=mask[1]=16;
 assert(!send(1,1) && submits==2 && track_jobs(&registry.slots[0]));
 assert(flags[0]==0x110 && hiword[0]==0x0506 && loword[0]==0x0708 && hiword[1]==0x0102);
 assert(!send(2,1) && submits==2);poll_status[0]=1;track_poll();assert(!send(1,1));
 poll_status[1]=1;track_poll();assert(send(1,1)==1 && !track_jobs(&registry.slots[0]));
 assert(!send(2,1) && flags[0]==0x110);track_poll();assert(send(2,1)==1);
 assert(!send(2,2) && flags[0]==16);track_poll();assert(send(2,2)==1);
 unsigned before=submits;return_pc=0x2000;assert(send(2,3)<1&&submits==before);return_pc=0x1008;
 owner_ok=0;assert(send(2,3)<1&&submits==before);owner_ok=1;
 budget_ok=0;assert(send(2,3)<0&&submits==before);budget_ok=1;
 reserve_fail=2;assert(!send(2,3)&&submits==before&&cancels==1&&!pending[0]);reserve_fail=0;
 /* Partial DISABLE, unknown masks and pending controller jobs retain charge. */
 registry.slots[0].state=MW_CTL_RETIRING;mask[0]=0;track_poll();assert(charged);
 mask[1]=0;mask_known=1;track_poll();assert(charged);mask_known=3;
 registry.slots[0].job_state[1]=1;track_poll();assert(charged);registry.slots[0].job_state[1]=0;
 track_poll();assert(!charged && released==1 && !tc.completed_epoch);
 /* Capacity returned before final ACK: retirement finalizes before restore,
    and identical epoch/revision/values must still be resent after RESET. */
 registry.slots[0].state=MW_CTL_ACTIVE;assert(track_prepare(0));mask[0]=mask[1]=16;
 assert(!send(2,2) && flags[0]==0x110);track_poll();assert(send(2,2)==1);
 assert(!send(2,3)&&flags[0]==16);track_poll();
 assert(modwerk_track_controls(0x1000,2,4,0xffffffff,0)<1);
 assert(!send(2,4));poll_status[1]=(unsigned)-1;track_poll();assert(tc.stuck && failures && send(2,4)==-1);
 puts("PASS: actual Base control service, both-core ACK fence, scoped reset, byte order, owner/PC/budget rejection, partial reserve and uncertain-job retention");
}
