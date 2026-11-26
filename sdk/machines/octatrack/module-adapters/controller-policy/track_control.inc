/* SPDX-License-Identifier: MIT
 * Included by controller_board.c, under its stable lock. Copies bytes only;
 * never retains module pointers. Outstanding owned jobs fence retirement.
 * Four controls per core, all checked before reserve/submit. DSP maps to its
 * ledger's state cells; no package can supply a DSP address.
 */
int modwerk_dsp_track_charge(uint32_t,unsigned,unsigned,int);
int modwerk_dsp_track_fits(uint32_t,unsigned,unsigned);
void modwerk_dsp_track_tick(void);
uint32_t modwerk_track_publication(uintptr_t entry)
{
    uint32_t irq=modwerk_machine_lock(),serial=0;
    struct runtime_owner o;uintptr_t image;
    if(modwerk_controller_write_resolve(entry,&o,&image)==1)
        serial=modwerk_runtime_publication(o.owned_extent+o.image_offset);
    modwerk_machine_unlock(irq);return serial;
}
static struct {
    uint32_t module, generation, epoch, revision, completed_epoch, completed_revision;
    uint16_t pair[2][2];
    uint8_t pending[2], acknowledged[2], slot, stuck, reserved;
} tc;
static int track_capacity(const struct mw_controller_slot *s,const struct runtime_module *m)
{
    return s->binding.identity.feature!=16u || (m &&
        modwerk_dsp_track_fits(s->binding.identity.module,m->dsp.cycles,m->dsp.kind));
}
static int track_prepare(unsigned at)
{
    const struct mw_controller_slot *s=&REGISTRY.slots[at];
    if(s->binding.identity.feature!=16u)return 1;
    const struct runtime_module *m=module_of(&s->binding);
    if(!m || !track_capacity(s,m) || !modwerk_dsp_track_charge(s->binding.identity.module,m->dsp.cycles,m->dsp.kind,1))return 0;
    if(!tc.reserved || tc.generation!=s->binding.generation){
        tc.epoch=tc.completed_epoch=tc.completed_revision=0;
        tc.acknowledged[0]=tc.acknowledged[1]=0;
    }
    tc.module=s->binding.identity.module;tc.generation=s->binding.generation;tc.slot=(uint8_t)at;tc.reserved=1;
    return 1;
}
static int track_jobs(const struct mw_controller_slot *s)
{return tc.generation==s->binding.generation && (tc.pending[0] || tc.pending[1] || tc.stuck);}
static struct dl_owned_job tc_job[2];
static void track_poll(void)
{
    for(unsigned c=0;c<2;++c)if(tc.pending[c]){
        int status=dl_owned_job_poll(&tc_job[c],0);
        if(!status)continue;
        if(status!=1 || dl_owned_job_release(&tc_job[c])!=1){
            tc.stuck=1;dl_owned_fail_closed(c);mask_known&=(uint8_t)~(1u<<c);
            continue; /* preserve pending and generation: never retire unknown work */
        }
        tc.pending[c]=0;tc.acknowledged[c]=1;
    }
    if(tc.acknowledged[0] && tc.acknowledged[1]){
        tc.completed_epoch=tc.epoch;tc.completed_revision=tc.revision;
    }
    /* Run after controller ACK polling, before advance can restore this image.
     * Off masks alone also occur before an ENABLE ACK: they cannot release it. */
    if(tc.reserved && !tc.stuck && mask_known==3u && !(mask[0]&16u) && !(mask[1]&16u) &&
       !tc.pending[0] && !tc.pending[1] && tc.slot<MW_CONTROLLER_SLOTS){
        const struct mw_controller_slot *s=&REGISTRY.slots[tc.slot];
        if(s->binding.generation==tc.generation && s->state==MW_CTL_RETIRING &&
           !s->job_state[0] && !s->job_state[1]){
            modwerk_dsp_track_charge(tc.module,0,0,0);tc.reserved=0;
            tc.epoch=tc.completed_epoch=tc.completed_revision=0;
            tc.acknowledged[0]=tc.acknowledged[1]=0;
        }
    }
}
/* Result 1 means both cores acknowledged EXACTLY this epoch/revision/value.
 * 0 pending/unready; -1 closed. Called only from module_tick's own image. */
int modwerk_track_controls(uintptr_t entry,uint32_t epoch,uint32_t revision,uint32_t tracks_lo,uint32_t tracks_hi)
{
    uint32_t irq=modwerk_machine_lock();int result=-2;
    struct runtime_owner o;uintptr_t image;
    if(closed || tc.stuck || !epoch ||
       modwerk_controller_write_resolve(entry,&o,&image)!=1)goto done;
#ifdef MS_TRACK_CONTROL_HOST
    extern uintptr_t ms_track_test_pc(void);
    uintptr_t pc=ms_track_test_pc();
#else
    uintptr_t pc=(uintptr_t)__builtin_return_address(0);
#endif
    uintptr_t running=o.owned_extent+o.image_offset;
    if(pc<running || pc-running>=o.image_bytes)goto done;
    const struct mw_controller_write_policy *p=row_for(o.controller_sha256,o.module,o.image_bytes);
    struct mw_controller_binding b;
    if(!p || p->identity.feature!=16u || !binding_of(&o,p,&b))goto done;
    unsigned at=slot_of(&b);
    if(at>=MW_CONTROLLER_SLOTS || want[at].quiesce)goto done;
    modwerk_controller_lease_seen|=16u; /* request placement before the first ready call */
    if(REGISTRY.slots[at].state!=MW_CTL_ACTIVE || !mw_controller_control_write_allowed(&REGISTRY,&b))goto done;
    result=0;
    for(unsigned i=0;i<4;++i)if(((tracks_lo>>(8u*i))&255u)>128u || ((tracks_hi>>(8u*i))&255u)>128u)goto done;
    if(tc.pending[0] || tc.pending[1])goto done;
    const struct runtime_module *m=module_of(&b);
    if(!m || !tc.reserved || tc.generation!=b.generation || !track_capacity(&REGISTRY.slots[at],m)){result=-3;goto done;}
    tc.module=b.identity.module;
    uint16_t pair[2][2]={{(uint16_t)(tracks_hi>>16),(uint16_t)tracks_hi},
                         {(uint16_t)(tracks_lo>>16),(uint16_t)tracks_lo}};
    unsigned reset=tc.generation!=b.generation || tc.epoch!=epoch;
    int equal=tc.generation==b.generation && tc.epoch==epoch && tc.revision==revision;
    for(unsigned c=0;c<2;++c)for(unsigned k=0;k<2;++k)equal=equal && tc.pair[c][k]==pair[c][k];
    if(equal && tc.completed_epoch==epoch && tc.completed_revision==revision){result=1;goto done;}
    /* Reserve both cores first. A failed reserve transmits nothing. */
    if(!dl_owned_command_reserve(0,b.generation,12u,reset?0x110u:16u,pair[0][0],pair[0][1],&tc_job[0]))goto done;
    if(!dl_owned_command_reserve(1,b.generation,12u,reset?0x110u:16u,pair[1][0],pair[1][1],&tc_job[1])){
        if(dl_owned_cancel(&tc_job[0])!=1){tc.stuck=1;dl_owned_fail_closed(0);}
        goto done;
    }
    tc.module=b.identity.module;tc.generation=b.generation;tc.epoch=epoch;tc.revision=revision;tc.slot=(uint8_t)at;
    tc.completed_epoch=0;tc.completed_revision=0;
    for(unsigned c=0;c<2;++c){
        tc.pair[c][0]=pair[c][0];tc.pair[c][1]=pair[c][1];tc.acknowledged[c]=0;tc.pending[c]=1;
        if(dl_owned_submit(&tc_job[c])!=1){tc.stuck=1;dl_owned_fail_closed(c);}
    }
 done:if(tc.stuck)result=-1;modwerk_machine_unlock(irq);return result;
}
