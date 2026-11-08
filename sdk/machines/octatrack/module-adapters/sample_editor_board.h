/* SPDX-License-Identifier: MIT */
#ifndef MODWERK_SAMPLE_EDITOR_BOARD_H
#define MODWERK_SAMPLE_EDITOR_BOARD_H
#include "sample_editor_service.h"
#include "sample_editor_actions.h"
extern struct mw_sample_editor mw_sample_editor;
extern const struct modwerk_sample_editor_api mw_sample_editor_api;
void mw_sample_editor_bootstrap(void);
int mw_sample_owner_current_locked(const struct runtime_owner *);
void mw_sample_owner_changing(const struct runtime_dsp *);
void mw_sample_engine_idle(void);
void mw_sample_engine_job(const void *);
/* Called only by the guarded native command-16 dispatch seam, not inferred
 * from a reusable queue record's opcode. Access remains closed until idle. */
void mw_sample_waveform_job(const void *);
void mw_sample_refresh_ui(void);
/* The UI task's base-owned menu/confirmation adapter. */
void mw_sample_ui_tick(void);
int mw_sample_ui_key(int,int);
void mw_sample_menu_retire_locked(const struct runtime_dsp *);
#endif
