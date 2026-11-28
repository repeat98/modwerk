/* SPDX-License-Identifier: GPL-3.0-or-later
 * Modwerk's ABI declarations, from elekloader's public FORMAT/ADAPTING guides
 * (irpina, GPL-2.0-or-later). No upstream core implementation is included.
 */
#ifndef MODWERK_CORE_API_H
#define MODWERK_CORE_API_H

typedef __UINT32_TYPE__ mw_u32;
typedef __INT32_TYPE__ mw_i32;
typedef __UINT8_TYPE__ mw_u8;

typedef void (*mw_tick_handler)(void *ctrl);
typedef void (*mw_draw_handler)(void *bmp, void *ctrl);
typedef int (*mw_input_handler)(void *brain, void *event);
typedef void (*mw_settings_handler)(void *menu);
typedef void (*mw_render_handler)(void);
typedef void (*mw_voice_handler)(int voice, int track, void *event);
typedef int (*mw_hold_handler)(void *brain, void *event, int track);
typedef int (*mw_cc_handler)(int track, int cc, int value, int flags);
typedef void (*mw_queue_handler)(void *event, int time);
typedef void (*mw_leds_handler)(void *mgr);

struct mw_machine {
    mw_u32 id;
    const char *name, *short_name;
    const void *icon;
    mw_u32 params, render;
};
struct mw_parameter {
    mw_u32 id, group, slot;
    mw_i32 min, max, initial;
    mw_u32 flags;
    mw_i32 cc, reserved_32, reserved_36;
    mw_u32 reserved_40;
    const char *name, *group_name, *short_name;
    void (*format)(int value, char *buffer);
    const char *empty;
    mw_u32 look;
};
struct mw_page {
    mw_u32 index, after;
    const char *short_title, *title;
    mw_u32 ids[8], kind;
    void *view;
    mw_u32 position;
};
struct mw_project_data {
    mw_u32 tag, size;
    void *data;
    void (*loaded)(int found);
};
struct mw_menu_entry {
    const char *name;
    void (*open)(void *brain, void *event, int track);
};

/* These belong to the completed per-machine core, not the boot-only probe. */
extern mw_u8 core_track_machine[8];
const struct mw_machine *core_machine(int id);
void core_additem(void *menu, const void *row);
int core_page_open(void *brain, void *event, int key, struct mw_page *page);
int core_page_shown(void *brain, const struct mw_page *page);
extern const mw_u32 core_zero[];

#ifdef __m68k__
_Static_assert(sizeof(void *) == 4, "Core ABI needs 32-bit pointers");
_Static_assert(sizeof(struct mw_machine) == 24, "Machine descriptor ABI");
_Static_assert(sizeof(struct mw_parameter) == 68, "Parameter descriptor ABI");
_Static_assert(sizeof(struct mw_page) == 60, "Page descriptor ABI");
_Static_assert(sizeof(struct mw_project_data) == 16, "Project descriptor ABI");
_Static_assert(sizeof(struct mw_menu_entry) == 8, "Menu descriptor ABI");
#endif
#endif
