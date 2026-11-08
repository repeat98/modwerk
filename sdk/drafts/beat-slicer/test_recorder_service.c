/* SPDX-License-Identifier: MIT */
/* Private fixed-owner engine service, not a published source/loader ABI. */
#define bs_worker_test_guard bs_recorder_test_guard
#include "test_source_boot.c"
#include "preview_async.h"
#include "engine_boundary.h"
extern struct bs_engine_boundary bs_recorder_engine_boundary;
struct bs_preview_async bs_recorder_service;
struct bs_async_result bs_recorder_service_result_copy;
uint32_t bs_recorder_service_initialized,bs_recorder_service_calls;
uint32_t bs_recorder_service_requests,bs_recorder_service_request_id;
uint32_t bs_recorder_service_steps,bs_recorder_service_begins,bs_recorder_service_max_steps;
uint32_t bs_recorder_service_posted,bs_recorder_service_consumed,bs_recorder_service_pending;
uint32_t bs_recorder_service_last_state;
uint32_t bs_recorder_wake_audit_enabled,bs_recorder_wake_audit_count;
uint32_t bs_recorder_wake_audit[4][3];
static uint32_t blocked_ticket;
static const uint8_t foreign_message[4] __attribute__((aligned(4)))={255,0,0,0};
static const uint8_t wake_message[4] __attribute__((aligned(4)))={255,0,0,0};
static uint32_t mask(void) {
    uint32_t sr=0;
    __asm__ __volatile__("move.w %%sr,%0\n\tmove.w #0x2700,%%sr" : "+d"(sr) :: "memory","cc");
    return sr;
}
static void restore(uint32_t sr) {
    __asm__ __volatile__("move.w %0,%%sr" :: "d"(sr) : "memory","cc");
}
static void wake(void) {
    uint32_t sr=mask();
    if(!bs_recorder_service_pending) {
        bs_recorder_service_pending=1;++bs_recorder_service_posted;
        ((void (*)(void *,const void *))0x40000c3cu)((void *)0x460d17ceu,wake_message);
    }
    restore(sr);
}
int bs_recorder_service_wake_job(const uint8_t *message) {
    uint32_t sr=mask();
    int own=bs_recorder_service_initialized && message==wake_message &&
        bs_recorder_service_pending && bs_engine_quiescent_locked(&bs_recorder_engine_boundary);
    if(bs_recorder_wake_audit_enabled) {
        uint32_t index=bs_recorder_wake_audit_count++;
        if(index<4) {
            bs_recorder_wake_audit[index][0]=(uint32_t)(uintptr_t)message;
            bs_recorder_wake_audit[index][1]=(uint32_t)own;
            bs_recorder_wake_audit[index][2]=bs_recorder_service_pending;
        }
    }
    if(own){bs_recorder_service_pending=0;++bs_recorder_service_consumed;}
    restore(sr);
    return own;
}
void bs_recorder_service_idle(void) {
    if(!bs_recorder_service_initialized)return;
    ++bs_recorder_service_calls;
    bs_recorder_service_last_state=bs_async_service(&bs_recorder_service,1);
    bs_recorder_service_steps+=bs_recorder_service.last_steps;
    bs_recorder_service_begins+=bs_recorder_service.last_begin;
    if(bs_recorder_service.last_steps>bs_recorder_service_max_steps)
        bs_recorder_service_max_steps=bs_recorder_service.last_steps;
    if(bs_recorder_service_last_state==BS_SESSION_RUNNING)wake();
}
uint32_t bs_recorder_service_init(void) {
    if(bs_recorder_service_initialized || bs_boot_init())return 1;
    if(!bs_async_init(&bs_recorder_service,&bs_recorder_test_guard,&bs_flex_source_backend,&source,1,2))return 1;
    bs_recorder_service_initialized=1;return 0;
}
/* Zero-argument producer/observer entries: the driver never services a session. */
uint32_t bs_recorder_preview_begin(void) {
    const struct bs_preview_options options={1,1,BS_SAMPLE_BPM};
    uint32_t request=bs_async_request(&bs_recorder_service,1,2,&options);
    if(request){++bs_recorder_service_requests;bs_recorder_service_request_id=request;wake();}
    return request;
}
/* Dense-table measurement uses a grid wider than the one-second source, so
 * all 64 stock records remain and no extra start exceeds marker capacity. */
uint32_t bs_recorder_preview_dense_begin(void) {
    const struct bs_preview_options options={64,0,BS_SAMPLE_BPM};
    uint32_t request=bs_async_request(&bs_recorder_service,1,2,&options);
    if(request){++bs_recorder_service_requests;bs_recorder_service_request_id=request;wake();}
    return request;
}
uint32_t bs_recorder_preview_state(void) {
    return bs_async_state(&bs_recorder_service,1,2,bs_recorder_service_request_id);
}
uint32_t bs_recorder_preview_revision(void) { return bs_recorder_service.published_token.revision; }
uint32_t bs_recorder_service_result(void) {
    return (uint32_t)bs_async_result(&bs_recorder_service,1,2,bs_recorder_service_request_id,&bs_recorder_service_result_copy);
}

/* Private lifecycle controls; none grants source admission or frees an owner. */
uint32_t bs_recorder_service_wake_audit_begin(void) {
    uint32_t sr=mask();
    int ready=!bs_recorder_service_pending && bs_engine_quiescent_locked(&bs_recorder_engine_boundary);
    if(ready){bs_recorder_wake_audit_count=0;bs_recorder_wake_audit_enabled=1;}
    restore(sr);return !ready;
}
uint32_t bs_recorder_service_wake_audit_end(void) {
    uint32_t sr=mask();bs_recorder_wake_audit_enabled=0;
    uint32_t count=bs_recorder_wake_audit_count;restore(sr);return count;
}
uint32_t bs_recorder_service_foreign_then_own(void) {
    uint32_t sr=mask();
    if(bs_recorder_service_pending){restore(sr);return 1;}
    ((void (*)(void *,const void *))0x40000c3cu)((void *)0x460d17ceu,foreign_message);
    wake();
    restore(sr);return 0;
}
uint32_t bs_recorder_service_block(void) {
    uint32_t sr=mask();
    if(!blocked_ticket)blocked_ticket=bs_guard_writer_begin(&bs_recorder_test_guard);
    uint32_t ticket=blocked_ticket;restore(sr);return ticket;
}
uint32_t bs_recorder_service_unblock(void) {
    uint32_t sr=mask();
    int ok=bs_guard_writer_end(&bs_recorder_test_guard,blocked_ticket);
    if(ok)blocked_ticket=0;
    restore(sr);if(ok)wake();return !ok;
}
uint32_t bs_recorder_service_cancel(void) {
    uint32_t request=bs_async_cancel(&bs_recorder_service,1,2);
    if(request){bs_recorder_service_request_id=request;wake();}
    return request;
}
uint32_t bs_recorder_service_revoke(void) {
    int ok=bs_async_revoke(&bs_recorder_service,1,2);
    if(ok)wake();
    return !ok;
}
