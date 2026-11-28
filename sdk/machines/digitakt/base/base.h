/* SPDX-License-Identifier: GPL-3.0-or-later
 * Modwerk's Digitakt mk1 base: the records modules hand it and the firmware locations its C code reads.
 * Layouts are the interface's (sdk/digitakt/core/interface.json); firmware locations come from the build's defsym.
 */
#ifndef MODWERK_DIGITAKT_BASE_H
#define MODWERK_DIGITAKT_BASE_H
#include "core-api.h"

typedef __INT16_TYPE__ mw_i16;
typedef __UINT16_TYPE__ mw_u16;
/* An address as an integer: 32 bits on the unit (the site entries read it from d0), wider on a host test. */
typedef __UINTPTR_TYPE__ mw_addr;

/* A knob of a machine's SRC page (40 bytes). */
struct mw_knob {
    const char *name, *lname, *lfo, *lfo_long;
    mw_u8 look, flags;
    mw_u16 reserved;
    mw_i32 min, max, def;
    int (*fmt)(char *buf, int value, int ctx, int machine);
    union {
        int (*gfx)(int value);
        int (*draw)(void *bmp, int x, int y, int value, int flag);
    };
};
enum { MW_HIDDEN = 1, MW_RANGE = 2, MW_DEFAULT = 4, MW_NOT_SAMPLE = 8, MW_DRAW = 16 };

/* A machine's SRC page (336 bytes), named by its descriptor's tail. */
struct mw_ui {
    const void *abi;
    mw_u8 page_from, flags;
    mw_u16 reserved;
    const char *group;
    void (*on_switch)(int track, int from, mw_u8 *sound);
    struct mw_knob knob[8];
};
/* A descriptor with a page: struct mw_machine, then the tag and the page. */
struct mw_machine_ui {
    struct mw_machine machine;
    mw_u32 tag;
    const struct mw_ui *ui;
};
#define MW_UI_TAG 0x55493330u   /* "UI30" */

extern const struct mw_machine *const core_machines[];
extern const char cm_ui_v3[], cm_ui_v31[];
extern mw_u8 mw_samp_table[128];

/* Base internals the site entries call (results as integers: d0). */
mw_addr mw_find(mw_u32 id);
mw_addr mw_field(mw_u32 id, mw_u32 offset);
mw_addr mw_stock_layout(mw_u32 machine);
void mw_base_init(void);
void mw_pages_init(void);

/* Firmware locations (defsym, per OS). */
extern mw_u8 *volatile mw_fw_kit;
extern volatile mw_u32 mw_fw_active_track;
extern const mw_u8 mw_fw_sample_knobs[4];
extern const mw_u8 mw_fw_src_param_vt[], mw_fw_sound_ref_vt[];
extern int mw_fw_item_id(void *item);
extern void mw_fw_blit(void *bmp, const void *icon, int x, int y, int mode);

#define MW_SOUND(kit, track) ((kit) + 0x20 + 0xa2 * (track))
#define MW_SOUND_MACHINE 0x7e

#ifdef __m68k__
_Static_assert(sizeof(struct mw_knob) == 40, "Knob ABI");
_Static_assert(sizeof(struct mw_ui) == 336, "Page ABI");
_Static_assert(sizeof(struct mw_machine_ui) == 32, "Descriptor tail ABI");
#endif
#endif
