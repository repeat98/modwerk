/* SPDX-License-Identifier: GPL-3.0-or-later
 * Modwerk's Digitone mk1 base: project data (core_projdata). The stock serializer writes a project file's
 * header up to 0x1c and keeps 0x1c-0x200 as they are. Every Modwerk writer shares one list there: 'ELKP' at
 * 0x1c, then records {tag, size, size bytes}, ended by a zero tag (KitBank's layout). The base rewrites only
 * its modules' tags and keeps every other record; on load it also reads a list kept at 0x20 (records from
 * 0x24) by older cores. With no core_projdata entry it never touches the header.
 * sites.s calls these after the stock serializer, deserializer, project init and template copy.
 */
#include "base.h"

#define MW_PD_MAGIC 0x454c4b50u   /* "ELKP" */
#define MW_PD_GAP 0x1c
#define MW_PD_END 0x200
static mw_u8 kept[MW_PD_END - MW_PD_GAP];

static mw_u32 rd(const mw_u8 *p) { return (mw_u32)p[0] << 24 | (mw_u32)p[1] << 16 | (mw_u32)p[2] << 8 | p[3]; }
static void wr(mw_u8 *p, mw_u32 v) { p[0] = (mw_u8)(v >> 24); p[1] = (mw_u8)(v >> 16); p[2] = (mw_u8)(v >> 8); p[3] = (mw_u8)v; }

/* The first record of a file's list, or 0 when it has none. */
static mw_u8 *records(mw_u8 *file)
{
    if (rd(file + MW_PD_GAP) == MW_PD_MAGIC) return file + MW_PD_GAP + 4;
    if (rd(file + 0x20) == MW_PD_MAGIC) return file + 0x24;
    return 0;
}

/* The record at p, if whole: its tag (0 ends the list) and size; -1 when it runs past the header. */
static int record(const mw_u8 *p, const mw_u8 *end, mw_u32 *tag, mw_u32 *size)
{
    if ((mw_addr)(end - p) < 4) return -1;
    *tag = rd(p);
    if (!*tag) return 0;
    if ((mw_addr)(end - p) < 8) return -1;
    *size = rd(p + 4);
    return *size > (mw_addr)(end - p) - 8 ? -1 : 1;
}

static int ours(mw_u32 tag)
{
    for (struct mw_project_data *const *next = core_projdata; *next; ++next)
        if ((*next)->tag == tag) return 1;
    return 0;
}

void mw_pd_save(mw_u8 *file, mw_u32 result)
{
    (void)result;
    if (!file || !core_projdata[0]) return;
    mw_u8 *end = file + MW_PD_END, *p = records(file);
    mw_u32 n = 0, tag, size;
    if (p) {
        for (int r; (r = record(p, end, &tag, &size)); p += 8 + size) {
            if (r < 0) return;   /* a broken list: left alone */
            if (!ours(tag)) { mw_copy(kept + n, p, 8 + size); n += 8 + size; }
        }
    } else if (rd(file + MW_PD_GAP)) return;   /* another tool's data: left alone */
    mw_u8 *at = file + MW_PD_GAP;
    wr(at, MW_PD_MAGIC);
    at += 4;
    mw_copy(at, kept, n);
    at += n;
    for (struct mw_project_data *const *next = core_projdata; *next; ++next) {
        const struct mw_project_data *e = *next;
        mw_addr room = (mw_addr)(end - at);   /* for its tag, its size and the end tag too */
        if (!e->tag || !e->data || room < 12 || e->size > room - 12) continue;
        wr(at, e->tag);
        wr(at + 4, e->size);
        mw_copy(at + 8, e->data, e->size);
        at += 8 + e->size;
    }
    wr(at, 0);
}

void mw_pd_load(mw_u8 *file, mw_u32 result)
{
    if (!(result & 0xff)) return;   /* the stock load failed */
    mw_u8 *end = file ? file + MW_PD_END : 0;
    for (struct mw_project_data *const *next = core_projdata; *next; ++next) {
        struct mw_project_data *e = *next;
        int found = 0;
        if (e->data) mw_clear(e->data, e->size);
        mw_u32 tag, size;
        for (mw_u8 *p = file ? records(file) : 0; p && record(p, end, &tag, &size) > 0; p += 8 + size)
            if (tag == e->tag) {
                if (e->data) mw_copy(e->data, p + 8, size < e->size ? size : e->size);
                found = 1;
                break;
            }
        if (e->loaded) e->loaded(found);
    }
}

void mw_pd_new(mw_u8 *ignored, mw_u32 result)
{
    (void)ignored, (void)result;
    for (struct mw_project_data *const *next = core_projdata; *next; ++next) {
        if ((*next)->data) mw_clear((*next)->data, (*next)->size);
        if ((*next)->loaded) (*next)->loaded(0);
    }
}
