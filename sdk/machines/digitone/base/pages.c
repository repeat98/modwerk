/* SPDX-License-Identifier: GPL-3.0-or-later
 * Modwerk's Digitone mk1 base: the mod pages of core_pages (27-30). The stock looks a page record up by its
 * index and builds each page key's list of pages; the base answers its own indices and inserts each mod page
 * after the stock page its record names (sites.s, mw_page_rec and mw_view_init).
 */
#include "base.h"

#define MW_PAGE_FIRST 27
#define MW_LIST_MAX 28     /* a longer stock list is left as it is */
#define MW_LIST_ROOM 32
static mw_u32 page_list[MW_LIST_ROOM];

/* A mod page's stock record (its entry + 8), or 0 for stock's. */
mw_addr mw_page_find(mw_u32 index)
{
    if (index < MW_PAGE_FIRST) return 0;
    for (struct mw_page *const *next = core_pages; *next; ++next)
        if ((*next)->index == index) return (mw_addr)&(*next)->short_title;
    return 0;
}

/* A key's page list {begin, end, capacity} with every mod page after the stock page it follows, in vec;
 * 0 to keep the stock list. Each placed page learns its view and position. */
int mw_page_list(void *view, mw_u32 *const *list, mw_u32 **vec)
{
    if (!core_pages[0]) return 0;
    const mw_u32 *begin = list[0], *end = list[1];
    if ((mw_addr)end < (mw_addr)begin || (mw_addr)end - (mw_addr)begin > MW_LIST_MAX * 4) return 0;
    mw_u32 n = 0;
    for (const mw_u32 *e = begin; e < end; ++e) {
        page_list[n++] = *e;
        for (struct mw_page *const *next = core_pages; *next && n < MW_LIST_ROOM; ++next)
            if ((*next)->after == *e) {
                (*next)->view = view;
                (*next)->position = n;
                page_list[n++] = (*next)->index;
            }
        if (n == MW_LIST_ROOM) break;
    }
    vec[0] = page_list;
    vec[1] = vec[2] = page_list + n;
    return 1;
}

#define MW_VIEW_PAGE(view) (*(volatile mw_u32 *)((mw_u8 *)(view) + 0x90))

int core_page_open(void *brain, void *event, int key, struct mw_page *page)
{
    if (!page || !page->view) return 0;
    mw_u32 copy[8];
    mw_copy(copy, event, sizeof copy);
    copy[3] = (mw_u32)key;
    for (int i = 0; i < 8; ++i) {
        copy[4] = MW_PRESS;
        mw_stock_key(brain, copy);
        copy[4] = MW_RELEASE;
        mw_stock_key(brain, copy);
        if (MW_VIEW_PAGE(page->view) == page->position) break;
    }
    return 1;
}

/* A pointer-sized field (32 bits on the unit; a host test's may sit unaligned). */
static mw_addr field(const void *at, mw_u32 offset)
{
    mw_addr value;
    mw_copy(&value, (const mw_u8 *)at + offset, sizeof value);
    return value;
}

int core_page_shown(void *brain, const struct mw_page *page)
{
    if (!brain || !page || !page->view) return 0;
    mw_addr shown = field(brain, 0x54);   /* the screen shown; 0x5c the one on top: equal when no overlay */
    if (!shown || shown != field(brain, 0x5c)) return 0;
    mw_addr screen = field((void *)shown, 8);
    return screen && field((void *)screen, 0xc0) == (mw_addr)page->view && MW_VIEW_PAGE(page->view) == page->position;
}
