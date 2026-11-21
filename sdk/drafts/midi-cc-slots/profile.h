/* SPDX-License-Identifier: MIT */
#ifndef MIDI_MODE_PROFILE_H
#define MIDI_MODE_PROFILE_H
#include <stdint.h>
#define MM_PROFILE_BYTES 4096u
extern char names_store[8][16];
void mm_profile_service(void);
void mm_profile_tick(void *api);
void mm_profile_changed(void);
char *mm_profile_name(unsigned track);
char *mm_profile_edit(unsigned track);
void mm_profile_name_changed(char *slot);
unsigned mm_profile_bank(void);
unsigned mm_profile_status(void);
unsigned mm_profile_ready(void);
/* Platform boundary: file access is called only by the engine service. */
int mm_profile_directory(char *out, unsigned size);
/* Read: 0 missing, 1 exact record, 2 truncated record with >=8-byte header,
 * -1 I/O/unsafe size. Only owned truncated peers may be replaced. */
int mm_profile_file(unsigned write, const char *path, uint8_t *data, unsigned size);
int mm_profile_gate(void);
void mm_profile_context(unsigned *bank, unsigned *part, uint8_t channels[8]);
void mm_profile_apply(const uint8_t channels[8]);
int mm_profile_wake(void);
void mm_profile_redraw(unsigned status);
#endif
