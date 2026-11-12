/* SPDX-License-Identifier: MIT
 * Private T06 diagnostics. Audio paths only increment fixed RAM counters.
 * The existing core logger appends these snapshots; its engine task alone
 * checkpoints them with the normal stopped/recorder/USB gates and backoff.
 */
#include <stdint.h>
extern void octamod_log_event(unsigned,uint32_t,uint16_t,uint32_t,uint32_t)
    __attribute__((weak));
extern volatile uint32_t poly_diag_render_begin,poly_diag_render_end;
extern volatile uint32_t poly_diag_fetch_calls,poly_diag_fetch_frames;
extern volatile uint32_t poly_diag_command_calls,poly_diag_amp_calls;
extern volatile uint8_t poly_extra_voices[31][168],poly_extra_track[31];
extern volatile uint32_t poly_voice_selector;
volatile uint32_t poly_diag_key_calls=0,poly_diag_record_calls=0;
volatile uint32_t poly_diag_record_last=0;
static uint32_t diag_tick=0,diag_state=UINT32_MAX,diag_started=0;
static uint32_t diag_keys=0,diag_records=0;
#define POLY_DIAG_TAG 0x504f4c59u
static void diag_emit(unsigned code,uint32_t a,uint32_t b) {
    if(octamod_log_event) octamod_log_event('I',POLY_DIAG_TAG,(uint16_t)code,a,b);
}
void pm_diagnostic_tick(void) {
    if(!octamod_log_event) return;
    uint32_t tick=U32(0x460d5de0u);
    if((uint32_t)(tick-diag_tick)<60u) return;
    diag_tick=tick;
    uint32_t state=(U32(TRANSPORT)&255u)|((U32(0x460d172au)&255u)<<8)|
        ((U32(0x460d1736u)&255u)<<16)|((U32(0x460d1e70u)!=0)<<24)|
        ((U32(0x460e70e0u)!=0)<<25);
    unsigned active=0,highest=0;
    for(unsigned t=0;t<8;++t)
        if(valid_bank() && pm_is_poly_track(t) && U8(0x800049d8u+168u*t)) ++active;
    for(unsigned i=0;i<31;++i) if(poly_extra_voices[i][0]) {++active;highest=i+1;}
    uint32_t keys=poly_diag_key_calls,records=poly_diag_record_calls;
    if(!diag_started) {diag_emit(4,0x00020500u,8);diag_started=1;}
    /* A stopped, unchanged unit produces no periodic records/card writes. */
    if(state==diag_state && !state && !active && keys==diag_keys && records==diag_records) return;
    diag_state=state;diag_keys=keys;diag_records=records;
    diag_emit(1,state,(U8(TRACK_IDX)<<24)|(U8(PART_IDX)<<16)|
        (U8(PATTERN_IDX)<<8)|U8(0x46104d15u));
    diag_emit(2,poly_diag_render_begin,poly_diag_render_end);
    diag_emit(3,poly_diag_fetch_calls,poly_diag_fetch_frames);
    diag_emit(5,keys,records);
    diag_emit(7,poly_diag_command_calls,poly_diag_amp_calls);
    diag_emit(6,poly_diag_record_last,(active<<24)|(highest<<16)|
        ((poly_voice_selector&255u)<<8)|(U32(0x460d16f0u)&255u));
}
