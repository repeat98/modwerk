/* SPDX-License-Identifier: GPL-2.0-or-later */
/* core-mc 0.2 for the Model:Cycles (OS 1.13), in C: the firmware locations core exports (mods/core-mc/fw.s;
 * docs/ADAPTING.md, "Firmware locations (core-mc 0.2, Model:Cycles)"). The SDK puts this folder on the include
 * path:
 *
 *     #include "model-cycles/core.h"
 *
 * Every name here is resolved by the linker against the core in the build, so a mod that uses only these names
 * no address of its own. model-cycles/core.inc has the same for assembly. Functions that return a pointer are
 * declared to return uint32_t: the firmware returns it in d0, where gcc for m68k looks in a0. */
#ifndef ELEKLOADER_MODEL_CYCLES_CORE_H
#define ELEKLOADER_MODEL_CYCLES_CORE_H

#include <stdint.h>

/* ---- the project and the UI: call from the UI task (ev_tick, ev_draw, ev_key, ev_enc) ------------- */
extern uint32_t fw_project(void);                       /* the Project singleton, or 0 */
extern uint32_t fw_project_tracks(uint32_t project);    /* its track selection (project + 48) */
extern int32_t fw_selection_active(uint32_t selection); /* the active track, 0-5 */
extern uint32_t fw_ui_states(void);                     /* the UIStates singleton */
extern int8_t fw_value_shown(uint32_t ui_states);       /* nonzero: a parameter's value is on screen */
extern int8_t fw_trig_held(uint32_t ui_states);         /* nonzero: a trig is held, knobs edit its locks */
extern int32_t fw_key_held(int32_t code);               /* nonzero while the key is held */
enum { FW_KEY_FUNC = 1, FW_KEY_TRACK = 2, FW_KEY_RETRIG = 4 };  /* logical codes fw_key_held takes */

/* The active track, or -1 without a project. */
static inline int32_t fw_active_track(void)
{
    uint32_t project = fw_project();
    return project ? fw_selection_active(fw_project_tracks(project)) : -1;
}

/* ---- sounds and kits --------------------------------------------------------------------------- */
extern uint8_t fw_kits[];                               /* the 96 patterns' kits */
#define FW_KIT(n)           (fw_kits + 7094 * (n))      /* pattern n's kit, 0-95 */
#define FW_KIT_SOUND(k, t)  ((k) + 28 + 100 * (t))      /* its track t's sound, 0-5 */
#define FW_KIT_POOL(k, i)   ((k) + 694 + 100 * (i))     /* its pool's sound i, 0-63 */
extern uint8_t *volatile fw_play_kit;                   /* the kit the audio side plays: the current
                                                           pattern's working copy */
#define FW_SOUND_MACHINE    38                          /* a sound's byte: its machine, 0-5 stock */

/* Track t's live sound (0-5), or 0: the project's track object at + 212 + 68 t, then the function at +40 of
 * its vtable. This is the firmware's own walk (0x40023f0a). */
static inline uint8_t *fw_track_sound(int32_t t)
{
    uint8_t *track;
    uint32_t *vt;
    uint32_t project = fw_project();

    if (!project || t < 0 || t > 5)
        return 0;
    track = (uint8_t *)project + 212 + 68 * t;
    vt = *(uint32_t **)track;
    return vt && vt[10] ? (uint8_t *)((uint32_t (*)(uint8_t *))vt[10])(track) : 0;
}

/* ---- the screen: 128 x 64, 1 bit, y = 0 is the bottom row ---------------------------------------- */
/* fill: every step-th row from y0 to y1, x0..x1 each, clipped to the bitmap; colour 0 clears, 1 sets,
 * negative inverts. text: flags 0 from x on, 2 centred on x. A font is an object of two longs that
 * fw_font_make fills from glyphs and fw_font_drop undoes. */
extern void fw_fill(void *bmp, int32_t x0, int32_t y0, int32_t x1, int32_t y1, int32_t colour, int32_t step);
extern void fw_text(void *bmp, const void *font, int32_t x, int32_t y, int32_t flags, const char *fmt, ...);
extern void fw_font_make(void *font, const void *glyphs);
extern void fw_font_drop(void *font);
extern const char fw_font_small[];                      /* glyphs, 5 x 9 pixels */
extern const char fw_font_medium[];                     /* glyphs, 7 x 9 pixels */
extern void fw_view_redraw(void *view);                 /* the screen draws the view again */

/* ---- the +Drive's file system ----------------------------------------------------------------- */
/* Call under its lock. The lock lets its holder in again but does not count, so an inner unlock frees it
 * while the outer work goes on. */
extern volatile uint32_t fw_fs_mounted;                 /* nonzero once the file system is mounted */
extern uint32_t fw_fs_lock_word[];                      /* the lock; [0] is the task that holds it */
extern void *volatile fw_running_task;                  /* the running task */
extern void fw_fs_lock(uint32_t *lock);                 /* fw_fs_lock(fw_fs_lock_word) */
extern void fw_fs_unlock(uint32_t *lock);
extern int32_t fw_fs_entry(uint32_t inode, uint32_t *h);    /* h = {inode, id, size, inode word 16};
                                                               0 for a file, -1 otherwise */
extern int32_t fw_fs_read(void *buf, uint32_t len, uint32_t *fh);  /* fh = {inode, position, -, open};
                                                                       the bytes read, or -1 */
extern int32_t fw_fs_find_id(uint32_t id);              /* the index of id's pair in fw_fs_ids, or -1 */
extern const volatile uint32_t fw_fs_ids[];             /* the files by id: {id, inode} pairs, by id */

#endif
