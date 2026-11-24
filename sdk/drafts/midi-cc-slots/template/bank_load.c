/* SPDX-License-Identifier: MIT
 * Pair result-less bank notifications. No profile, recovery or file mutation
 * is permitted here; the engine task observes the settled project identity.
 */
#include "template.h"
#define LOAD_DEPTH 4
struct load_context { unsigned mask; uint32_t caller; };
static struct load_context loads[LOAD_DEPTH],completed;
static unsigned depth,overflow,pending;

void mt_bank_load(unsigned mask,uint32_t caller){
    if(overflow||depth==LOAD_DEPTH){++overflow;return;}
    loads[depth].mask=mask;loads[depth].caller=caller;++depth;
}
unsigned mt_bank_loaded(void){
    if(overflow){--overflow;return 0;}
    if(!depth)return 0; /* No guessed context for an unmatched post hook. */
    struct load_context done=loads[--depth];
    if(done.caller==0x400853deu){completed=done;pending=1;}
    return 0; /* Required by ev_bank_loaded, not a load-success result. */
}
unsigned mt_bank_load_active(void){return depth||overflow;}
unsigned mt_bank_load_pending(void){return pending;}
unsigned mt_bank_take_completed(unsigned *mask,uint32_t *caller){
    if(depth||overflow||!pending)return 0;
    *mask=completed.mask;*caller=completed.caller;pending=0;return 1;
}
