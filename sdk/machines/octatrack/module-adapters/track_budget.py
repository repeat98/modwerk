# SPDX-License-Identifier: MIT
"""Preserve bank/request intent while a returning processor relinquishes cycles."""
def once(source,old,new):
    if source.count(old)!=1:raise ValueError('Track-budget Base source drift: '+old[:80])
    return source.replace(old,new)

def dsp(source,budget):
    source=once(source,'uint32_t modwerk_dsp_source_charge(unsigned core)\n{\n    uint32_t sum = 0;',
'''static uint32_t track_owner,track_cycles;
static void track_pause_request(void);
uint32_t modwerk_dsp_source_charge(unsigned core)
{
    uint32_t sum = track_cycles;''')
    source=once(source,'static void make_way(const uint32_t was[16])\n{',
'''static void make_way(const uint32_t was[16])
{
    /* Keep the reservation until both DISABLE ACKs. The allocator refuses
     * meanwhile; charge release nudges its unchanged automatic selection. */
    if(track_cycles)for(unsigned c=0;c<2u;++c)
        if(bank_booking(was,c)+modwerk_dsp_source_charge(c)>
           (c?MODWERK_DSP_ALLOWANCE1:MODWERK_DSP_ALLOWANCE0)){
            track_pause_request();return;
        }''')
    return source+'\n'+budget.replace('static uint32_t track_owner,track_cycles;','')
