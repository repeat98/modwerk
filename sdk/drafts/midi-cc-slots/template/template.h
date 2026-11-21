/* SPDX-License-Identifier: MIT */
#ifndef MIDI_TEMPLATE_H
#define MIDI_TEMPLATE_H
#include "../profile.h"
extern uint8_t mt_work[MM_PROFILE_BYTES];
extern char mt_command[16];
int mt_channels(unsigned write,uint8_t values[1024]);
int mt_preflight(const uint8_t values[1024],uint8_t fingerprints[128]);
int mt_persist(const uint8_t values[1024],const uint8_t fingerprints[128]);
/* MAP2 journals retain each disk copy separately after the native RAM map. */
#define MT_DISK_CHANNELS 1216
int mt_preflight_bank(const uint8_t values[1024],uint8_t fingerprints[128],uint8_t disk_channels[2048],unsigned bank);
int mt_persist_bank(const uint8_t values[1024],const uint8_t fingerprints[128],unsigned bank);
int mt_restore_bank(const uint8_t disk_channels[2048],const uint8_t fingerprints[128],unsigned bank);
void mt_request(void);
unsigned mt_progress(void);
unsigned mt_failure(void);
int mt_cancel_held(void);
unsigned mt_confirm_held(void);
int mt_view_key(int code);
void mt_reload_project(void);
int mt_stopped(void);
int mt_writable(void);
int mt_ui_context(void);
int mt_key(int code,int down);
int mt_runtime_key(int code,int pressed);
int mt_runtime_enc(int code,int delta);
void mt_clone_begin(void);
void mt_clone_finish(void);
void mt_project_loaded(unsigned caller);
unsigned mt_initialized(void);
unsigned mt_busy(void);
#endif
