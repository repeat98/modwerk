/* SPDX-License-Identifier: MIT */
/* Private composition of the original source fixture and copied UI/engine
 * exchange. The compiler replaces test_source_boot.o with this translation unit.
 * No source service, package, base hook or hardware qualification is published. */
#include "test_source_boot.c"
#include "preview_async.h"
#include "engine_boundary.h"
extern void bs_engine_test_idle(void), bs_engine_test_job(void);
extern struct bs_engine_boundary bs_engine_test_boundary;
extern uint32_t bs_grid_ui_state, bs_grid_ui_epoch;
struct bs_preview_async bs_async_fixture;
uint32_t bs_async_initialized, bs_async_engine_calls, bs_async_engine_steps;
uint32_t bs_async_engine_begins, bs_async_engine_max_steps, bs_async_engine_state;
uint32_t bs_async_posted, bs_async_consumed, bs_async_wake_pending;
uint32_t bs_ui_job_count, bs_ui_job_trace[32][4], bs_ui_readonly_jobs, bs_ui_ordinary_jobs;
uint32_t bs_async_private_waveform_reads;
static const uint8_t wake_message[4] __attribute__((aligned(4)))={255,0,0,0};
static const uint8_t foreign_message[4] __attribute__((aligned(4)))={255,0,0,0};
static uint32_t mask(void) {
    uint32_t value;
    __asm__ __volatile__("move.w %%sr,%0\n\tmove.w #0x2700,%%sr" : "=d"(value) :: "memory");
    return value;
}
static void restore(uint32_t value) {
    __asm__ __volatile__("move.w %0,%%sr" :: "d"(value) : "memory");
}
static void post(const void *message) {
    ((void (*)(void *,const void *))0x40000c3cu)((void *)0x460d17ceu,message);
}
void bs_async_wake(void) {
    uint32_t saved=mask();
    if(!bs_async_wake_pending){bs_async_wake_pending=1;++bs_async_posted;post(wake_message);}
    restore(saved);
}
uint32_t bs_async_fixture_init(void) {
    if(bs_async_initialized || bs_boot_init())return 1;
    if(!bs_async_init(&bs_async_fixture,&bs_worker_test_guard,&bs_flex_source_backend,&source,1,2))return 1;
    bs_async_initialized=1;return 0;
}
uint32_t bs_async_allow_private_waveform_reads(void) {
    if(bs_async_initialized)return 1;
    bs_async_private_waveform_reads=1;return 0;
}
static uint32_t packed(const uint8_t *p) {
    return (uint32_t)p[0]<<24|(uint32_t)p[1]<<16|(uint32_t)p[2]<<8|p[3];
}
void bs_async_engine_job(const uint8_t *message) {
    uint32_t saved=mask();
    uint32_t index=bs_ui_job_count++%32;
    bs_ui_job_trace[index][0]=message?*message:256;
    bs_ui_job_trace[index][1]=bs_grid_ui_state;
    bs_ui_job_trace[index][2]=bs_grid_ui_epoch;
    bs_ui_job_trace[index][3]=bs_boot_queries;
    if(message==wake_message && bs_async_wake_pending){
        bs_async_wake_pending=0;++bs_async_consumed;
    } else if(bs_async_private_waveform_reads && message && *message==16 &&
        packed(message+2)==1 && packed(message+6)<128 &&
        bs_engine_test_boundary.guard && bs_engine_test_boundary.idle_seen &&
        !bs_engine_test_boundary.ticket && !bs_engine_test_boundary.fault){
        /* Explicit fixed-input private experiment only. Mutable queued-record
         * stability remains unproved; the production boundary stays conservative. */
        ++bs_ui_readonly_jobs;
    } else {++bs_ui_ordinary_jobs;bs_engine_test_job();}
    restore(saved);
}
void bs_async_engine_idle(void) {
    bs_engine_test_idle();
    if(!bs_async_initialized)return;
    ++bs_async_engine_calls;
    bs_async_engine_state=bs_async_service(&bs_async_fixture,1);
    bs_async_engine_steps+=bs_async_fixture.last_steps;
    bs_async_engine_begins+=bs_async_fixture.last_begin;
    if(bs_async_fixture.last_steps>bs_async_engine_max_steps)bs_async_engine_max_steps=bs_async_fixture.last_steps;
    if(bs_async_engine_state==BS_SESSION_RUNNING)bs_async_wake();
}
uint32_t bs_ui_foreign_event(void) {post(foreign_message);return 0;}
