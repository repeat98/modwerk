/* SPDX-License-Identifier: MIT */
/* Private fixed-lifetime source fixture, sharing recorder/engine exclusion.
 * No production source ABI or module package. One borrowed-main consumer only. */
#define bs_worker_test_guard bs_recorder_test_guard
#include "test_source_boot.c"
/* The emulator's borrowed-call interface does not pop cdecl arguments. Keep
 * every driver entry zero-argument; production work belongs to its own service. */
uint32_t bs_recorder_preview_begin(void) { return bs_boot_begin(BS_SAMPLE_BPM,1,1); }
uint32_t bs_recorder_preview_work(void) { return bs_session_work(&bs_boot_session,8); }
uint32_t bs_recorder_preview_state(void) { return bs_boot_session.state; }
uint32_t bs_recorder_preview_revision(void) { return bs_boot_session.token.revision; }
