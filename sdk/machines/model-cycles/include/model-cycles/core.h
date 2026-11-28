/* SPDX-License-Identifier: GPL-3.0-or-later */
#ifndef MODWERK_MODEL_CYCLES_CORE_H
#define MODWERK_MODEL_CYCLES_CORE_H

#include <stdint.h>

/* Modwerk's Model:Cycles core (OS 1.13): the OS's own routines and data by name. Each name resolves at link time
 * against the core in the build (fw.s), so a module that uses only these carries no stock address of its own.
 *
 * The stock routines return every result in d0, pointers too; GCC reads a returned pointer from a0, so a routine
 * that returns a pointer is declared to return uint32_t here. Call the project and UI routines from the UI task
 * only: ev_tick, ev_draw, ev_key and ev_enc handlers. */

/* Project and UI state. */
extern uint32_t fw_project(void);                       /* the Project, or 0 */
extern uint32_t fw_project_tracks(uint32_t project);    /* its track selection (project + 48) */
extern int32_t fw_selection_active(uint32_t selection); /* the active track, 0-5 */
extern uint32_t fw_ui_states(void);                     /* the UIStates */
extern int8_t fw_value_shown(uint32_t ui_states);       /* nonzero while a parameter value is on screen */
extern int8_t fw_trig_held(uint32_t ui_states);         /* nonzero while a trig is held: knobs edit its locks */
extern int32_t fw_key_held(int32_t code);               /* nonzero while logical key `code` is held */

enum { FW_KEY_FUNC = 1, FW_KEY_TRACK = 2, FW_KEY_RETRIG = 4 };

/* Kits: 96, one per pattern, 7094 bytes apart. Each holds the six track sounds at +28 and a pool of 64 sounds at
 * +694, 100 bytes per sound; a sound's machine (0-5 on stock) is its byte +38. fw_play_kit points at the kit the
 * audio side plays, the current pattern's working copy. */
extern uint8_t fw_kits[];
extern uint8_t *volatile fw_play_kit;
#define FW_KIT(n) (fw_kits + 7094 * (n))
#define FW_KIT_SOUND(k, t) ((k) + 28 + 100 * (t))
#define FW_KIT_POOL(k, i) ((k) + 694 + 100 * (i))
#define FW_SOUND_MACHINE 38

/* Screen: 128 x 64, one bit per pixel, y = 0 the bottom row. fw_fill fills every `step`-th row from y0 to y1,
 * columns x0 to x1, clipped: colour 0 clears, 1 sets, negative inverts. fw_text flags: 0 draws from x rightwards,
 * 2 centres on x. A font is two longs {vtable, glyphs}: fw_font_make fills it from a glyph table, fw_font_drop
 * undoes that. fw_view_redraw sets the view's byte +32 so the screen draws it again. */
extern void fw_fill(void *bmp, int32_t x0, int32_t y0, int32_t x1, int32_t y1, int32_t colour, int32_t step);
extern void fw_text(void *bmp, const void *font, int32_t x, int32_t y, int32_t flags, const char *fmt, ...);
extern void fw_font_make(void *font, const void *glyphs);
extern void fw_font_drop(void *font);
extern const char fw_font_small[];  /* 5 x 9 glyphs */
extern const char fw_font_medium[]; /* 7 x 9 glyphs */
extern void fw_view_redraw(void *view);

/* +Drive file system, called under its lock: fw_fs_lock(fw_fs_lock_word) ... fw_fs_unlock(fw_fs_lock_word). The
 * lock lets its holder take it again but does not count, so an inner unlock frees it; word 0 is the holding task,
 * to compare with fw_running_task. fw_fs_mounted is nonzero once mounted. fw_fs_ids holds {id, inode} word pairs
 * sorted by id (their count is the word before it); fw_fs_find_id(id) gives a pair's index or -1.
 * fw_fs_entry(inode, h) fills h = {inode, id, size, inode word 16} and returns 0 for a file, -1 otherwise.
 * fw_fs_read(buf, len, fh), fh = {inode, position, unused, open}, returns the bytes read or -1. */
extern volatile uint32_t fw_fs_mounted;
extern uint32_t fw_fs_lock_word[];
extern void *volatile fw_running_task;
extern void fw_fs_lock(uint32_t *lock);
extern void fw_fs_unlock(uint32_t *lock);
extern int32_t fw_fs_entry(uint32_t inode, uint32_t *h);
extern int32_t fw_fs_read(void *buf, uint32_t len, uint32_t *fh);
extern int32_t fw_fs_find_id(uint32_t id);
extern const volatile uint32_t fw_fs_ids[];

/* The active track 0-5, or -1 without a project. */
static inline int32_t fw_active_track(void)
{
    uint32_t project = fw_project();
    return project ? fw_selection_active(fw_project_tracks(project)) : -1;
}

/* Track t's live sound (t 0-5), or 0: the track object's vtable word +40, called with the object, as the OS does. */
static inline uint8_t *fw_track_sound(int32_t t)
{
    uint32_t project = fw_project();
    uint32_t track;
    const uint32_t *vtable;
    if (!project || t < 0 || t > 5)
        return 0;
    track = project + 212 + 68 * (uint32_t)t;
    vtable = (const uint32_t *)(uintptr_t)*(const uint32_t *)(uintptr_t)track;
    if (!vtable || !vtable[10])
        return 0;
    return (uint8_t *)(uintptr_t)((uint32_t (*)(uint32_t))(uintptr_t)vtable[10])(track);
}

#endif
