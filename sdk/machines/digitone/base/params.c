/* SPDX-License-Identifier: GPL-3.0-or-later
 * Modwerk's Digitone mk1 base: the three parameter slots of core_params (ids 182-184).
 * The stock parameter records are an array by id; the slots take the three records after the stock 182,
 * whose bytes a stock table occupies. The base moves that table to its own RAM (three sites point the stock
 * at it), fills the slots and answers the stock's UI-record lookups for them (sites.s, mw_uirec_d1).
 */
#include "base.h"

static mw_u32 slot_look[MW_SLOTS];
static mw_u32 slot_ui[MW_SLOTS][MW_UIREC_BYTES / 4];

static mw_u8 *slot(mw_u32 k) { return mw_fw_params + (MW_SLOT_FIRST + k) * MW_PARAM_BYTES; }

/* At boot, before any stock code runs: core_params is fixed at link time. */
void mw_params_install(void)
{
    mw_copy(mw_slot_table, slot(0), MW_SLOT_TABLE_BYTES);
    for (mw_u32 k = 0; k < MW_SLOTS; ++k) {
        mw_copy(slot(k), mw_fw_params, MW_PARAM_BYTES);   /* unused: stock "none" */
        slot_look[k] = MW_LOOK_PLAIN;
    }
    for (struct mw_parameter *const *next = core_params; *next; ++next) {
        mw_u32 k = (*next)->id - MW_SLOT_FIRST;
        if (k >= MW_SLOTS) continue;
        mw_copy(slot(k), &(*next)->group, MW_PARAM_BYTES);
        mw_u32 look = (*next)->look;
        slot_look[k] = look && look < MW_SLOT_FIRST ? look : MW_LOOK_PLAIN;
    }
}

/* The UI record of a parameter id: stock's below 182, the slot's own (built on first use from its look's
 * stock record, with the slot's value formatter) for 182-184, stock record 0 above. */
mw_addr mw_uirec(mw_u32 id)
{
    if (id < MW_SLOT_FIRST) return (mw_addr)(mw_fw_uirecs + id * MW_UIREC_BYTES);
    mw_u32 k = id - MW_SLOT_FIRST;
    if (k >= MW_SLOTS) return (mw_addr)mw_fw_uirecs;
    mw_u32 *rec = slot_ui[k];
    if (!rec[0x1c / 4]) {
        mw_copy(rec, mw_fw_uirecs + slot_look[k] * MW_UIREC_BYTES, MW_UIREC_BYTES);
        mw_copy(&rec[0x14 / 4], slot(k) + 0x34, 4);   /* the module record's +56: fmt(value, buf) */
    }
    return (mw_addr)rec;
}

void mw_base_init(void)
{
    mw_params_install();
}
