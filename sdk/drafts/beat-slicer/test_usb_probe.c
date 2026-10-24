/* SPDX-License-Identifier: MIT */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "planner.h"
#include "../../runtime/loader/modwerk_module.h"
static unsigned calls,fail_at;
int bs_probe_test_planner(const struct bs_request *request,struct bs_plan *plan) {
    if(++calls==fail_at)return BS_READ_ERROR;
    return bs_preview(request,plan);
}
int main(int argc,char **argv) {
    fail_at=argc>1?(unsigned)atoi(argv[1]):0;
    struct modwerk_runtime_api api={0};
    unsigned char guarded[1056];memset(guarded,0xa5,sizeof guarded);
    for(unsigned i=0;i<20;++i){module_tick(&api);module_draw(guarded+16);}
    uint32_t expected=fail_at?(0x42534600u|fail_at):0x42534f4bu;
    if(api.value!=expected || calls!=(fail_at==1?1u:2u))return 1;
    for(unsigned i=0;i<16;++i)if(guarded[i]!=0xa5 || guarded[1040+i]!=0xa5)return 2;
    unsigned lit=0;for(unsigned i=16;i<1040;++i)lit+=guarded[i]!=0;
    if(!lit)return 3;
    puts("PASS USB probe: planner outcome, one-shot work and bounded display");return 0;
}
