/* SPDX-License-Identifier: MIT */
#ifndef MIDI_BANKS_H
#define MIDI_BANKS_H
#include <stdint.h>
struct mt_bank_file {uint32_t word[6];};
int mt_bank_open(struct mt_bank_file*,const char*,unsigned write);
int mt_bank_close(struct mt_bank_file*);
int mt_bank_seek(struct mt_bank_file*,unsigned offset);
int mt_bank_read(struct mt_bank_file*,uint8_t*,unsigned length);
int mt_bank_write(struct mt_bank_file*,const uint8_t*,unsigned length);
int mt_bank_size(struct mt_bank_file*);
#endif
