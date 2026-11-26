/* SPDX-License-Identifier: MIT
 * Separate returning-track reservation, included by dsp.c. Does not own a source
 * voice or an FX slot. source_charge() includes it in every effect admission.
 */
static uint32_t track_owner,track_cycles;
static uint32_t track_quote;
static volatile uint32_t track_clock,track_pause_until;
#ifdef MS_TRACK_BUDGET_HOST
uint16_t ms_track_budget_lock(void);
void ms_track_budget_unlock(uint16_t);
#else
static uint16_t ms_track_budget_lock(void){uint16_t s;__asm__ volatile("move.w %%sr,%0\n\tmove.w #0x2700,%%sr":"=d"(s)::"memory","cc");return s;}
static void ms_track_budget_unlock(uint16_t s){__asm__ volatile("move.w %0,%%sr"::"d"(s):"memory","cc");}
#endif
void modwerk_dsp_track_tick(void){++track_clock;}
static void track_pause_request(void){track_pause_until=track_clock+3u;}
int modwerk_dsp_track_fits(uint32_t module,unsigned cycles,unsigned kind)
{
    if(!module || !cycles || cycles>65535u || !kind || kind>RUNTIME_HARDWARE ||
       (track_owner && track_owner!=module) || (int32_t)(track_pause_until-track_clock)>0)return 0;
    uint32_t charge=charged(cycles,(uint8_t)kind);
    for(unsigned c=0;c<2;++c){
        uint32_t sum=voice_slots(c)+modwerk_dsp_source_charge(c)-track_cycles+charge;
        if(sum>(c?MODWERK_DSP_ALLOWANCE1:MODWERK_DSP_ALLOWANCE0))return 0;
    }
    return 1;
}
int modwerk_dsp_track_charge(uint32_t module,unsigned cycles,unsigned kind,int on)
{
    if(!on){if(track_owner==module){track_owner=track_cycles=0;dl_residency_nudge();}return 1;}
    if(!module || !cycles || cycles>65535u || !kind || kind>RUNTIME_HARDWARE)return 0;
    uint32_t quote=charged(cycles,(uint8_t)kind);
    uint16_t irq=ms_track_budget_lock();
    if(track_owner && track_owner!=module){ms_track_budget_unlock(irq);return 0;}
    track_quote=quote;ms_track_budget_unlock(irq);
    if(!modwerk_dsp_track_fits(module,cycles,kind))return 0;
    /* A sequencer boundary (IPL5) can interrupt the controller's IPL4 lock.
     * Only final lease validation + reservation publication need IPL7. Part
     * scans, transport waits and coefficient work stay outside this interval. */
    irq=ms_track_budget_lock();
    int okay=(int32_t)(track_pause_until-track_clock)<=0 && (!track_owner || track_owner==module);
    if(okay){track_owner=module;track_cycles=track_quote=quote;}
    ms_track_budget_unlock(irq);return okay;
}
/* Publication only: ordinary FX picks keep their original refusal policy.
 * Bounded slot-cost reads, no Part scan, allocation, DSP I/O or voice shedding.
 * Refresh while a target waits, including already-bound targets; cancellation
 * expires the absolute lease without retaining a module or request pointer. */
int modwerk_dsp_track_target(const uint8_t ids[16])
{
    if(!ids){track_pause_request();return !track_cycles;}
    if(!track_quote)return 1;
    uint32_t slots[2]={0,0};
    for(unsigned i=0;i<16u;++i){
        unsigned id=ids[i];
        uint32_t cost=id<MODWERK_FX_IDS?dl_catalog[id].cycles:0u;
        uint32_t held=dl_slot_cycles(i);if(held>cost)cost=held;
        slots[source_core(i&7u)]+=cost;
    }
    for(unsigned c=0;c<2u;++c)
        if(slots[c]+modwerk_dsp_source_charge(c)-track_cycles+track_quote>
           (c?MODWERK_DSP_ALLOWANCE1:MODWERK_DSP_ALLOWANCE0)){
            track_pause_request();return !track_cycles;
        }
    return 1;
}
