/* SPDX-License-Identifier: MIT */
/* Private resident UI plus recorder guard composition; no production ABI. */
#define bs_recorder_engine_idle bs_recorder_engine_idle_only
#define bs_recorder_engine_job bs_recorder_engine_job_only
#include "test_recorder_engine.c"
#undef bs_recorder_engine_idle
#undef bs_recorder_engine_job
void bs_async_engine_idle(void);
void bs_async_engine_job(const uint8_t *);
uint32_t bs_engine_test_init(void) { return bs_recorder_engine_init(); }
uint32_t bs_engine_test_enable(void) { return bs_recorder_engine_enable(); }
void bs_engine_test_idle(void) { bs_recorder_engine_idle_only(0); }
void bs_engine_test_job(void) { bs_recorder_engine_job_only(0); }
void bs_recorder_engine_idle(uint32_t *saved_frame) {
    (void)saved_frame;bs_async_engine_idle();
}
void bs_recorder_engine_job(uint32_t *saved_frame) {
    bs_async_engine_job((const uint8_t *)(uintptr_t)saved_frame[10]);
}
