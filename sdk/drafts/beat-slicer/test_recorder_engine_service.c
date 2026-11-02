/* SPDX-License-Identifier: MIT */
/* Private composition; all ordinary jobs remain conservative writers. */
#define bs_recorder_engine_idle bs_recorder_engine_idle_only
#define bs_recorder_engine_job bs_recorder_engine_job_only
#include "test_recorder_engine.c"
#undef bs_recorder_engine_idle
#undef bs_recorder_engine_job
void bs_recorder_service_idle(void);
int bs_recorder_service_wake_job(const uint8_t *);
void bs_recorder_engine_idle(uint32_t *saved_frame) {
    bs_recorder_engine_idle_only(saved_frame);
    bs_recorder_service_idle();
}
void bs_recorder_engine_job(uint32_t *saved_frame) {
    /* D0-D7 then A0-A6: A2 is saved word ten at the verified job site. */
    if(!bs_recorder_service_wake_job((const uint8_t *)(uintptr_t)saved_frame[10]))
        bs_recorder_engine_job_only(saved_frame);
}
