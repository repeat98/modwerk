/* SPDX-License-Identifier: GPL-3.0-or-later
 * Modwerk's Digitone mk1 base: the records modules hand it and the firmware locations its C code reads.
 * Layouts are the interface's (sdk/digitone/core/interface.json, core-api.h); firmware locations come from the
 * build's defsym, one value per OS.
 */
#ifndef MODWERK_DIGITONE_BASE_H
#define MODWERK_DIGITONE_BASE_H
#include "event-bus.h"

/* An address as an integer: 32 bits on the unit, wider on a host test. */
typedef __UINTPTR_TYPE__ mw_addr;

/* core_audio: an exclusive or insert owner of the output. Samples: 32 frames of {L, R}, Q1.31. */
struct mw_audio {
    mw_u32 on;
    void (*render)(mw_i32 *out, const mw_i32 *in);
    mw_u32 flags;
};
enum { CORE_AUDIO_MUTE_VOICES = 1, CORE_AUDIO_INSERT = 2 };

/* The interface's tables (zero-terminated pointer arrays the linker builds). */
extern struct mw_parameter *const core_params[];
extern struct mw_page *const core_pages[];
extern struct mw_project_data *const core_projdata[];
extern const struct mw_menu_entry *const core_menu[];
extern struct mw_audio *const core_audio[];

/* Stock facts (SPEC: parameter ids 0-181 stock, 182-184 the slots; KeyEvent key at +12, action at +16). */
#define MW_SLOT_FIRST 182
#define MW_SLOTS 3
#define MW_PARAM_BYTES 60
#define MW_UIREC_BYTES 84
#define MW_SLOT_TABLE_BYTES 228
#define MW_LOOK_PLAIN 24
enum { MW_PRESS = 1, MW_HOLD = 9, MW_RELEASE = 16 };

/* Base internals the site entries call (results as integers: d0). */
void mw_base_init(void);
void mw_params_install(void);
mw_addr mw_uirec(mw_u32 id);
mw_addr mw_page_find(mw_u32 index);
int mw_page_list(void *view, mw_u32 *const *list, mw_u32 **vec);
void mw_pd_save(mw_u8 *file, mw_u32 result);
void mw_pd_load(mw_u8 *file, mw_u32 result);
void mw_pd_new(mw_u8 *ignored, mw_u32 result);
int mw_audio_pick(void);
void mw_audio_master(mw_i32 *out, mw_i32 *out2, const mw_i32 *in, void *state);

/* Firmware locations (defsym, per OS). */
extern mw_u8 mw_fw_params[];                 /* the 60-byte parameter records, by id */
extern mw_u8 mw_fw_uirecs[];                 /* the 84-byte parameter UI records, by id */
extern mw_u32 mw_slot_table[MW_SLOT_TABLE_BYTES / 4];   /* the stock table the slots displace (sites.s) */
extern int mw_stock_key(void *brain, void *event);
extern void mw_stock_master(mw_i32 *out, mw_i32 *out2, const mw_i32 *in, void *state);
extern mw_i32 mw_fw_usb_block[];             /* 32 frames x 12 words */
extern volatile mw_u32 mw_fw_model_flags;    /* bit 19: a Digitone Keys */
extern const mw_u8 mw_fw_font5[];
extern void mw_fw_fillrect(void *bmp, int x0, int y0, int x1, int y1, int colour);
extern void mw_fw_framerect(void *bmp, int x0, int y0, int x1, int y1, int colour);
extern void mw_fw_textf(void *bmp, const void *font, int x, int y, int maxlen, const char *format, ...);

/* Word copies and clears (no library on the unit). */
static inline void mw_copy(void *to, const void *from, mw_u32 bytes)
{
    mw_u8 *t = to;
    const mw_u8 *f = from;
    while (bytes--) *t++ = *f++;
}
static inline void mw_clear(void *to, mw_u32 bytes)
{
    mw_u8 *t = to;
    while (bytes--) *t++ = 0;
}
#endif
