/* SPDX-License-Identifier: GPL-2.0-or-later */
/* Kit A/B for the Digitakt mk1 (OS 1.54), after the Analog Rytm mod of the same name.
 *
 * Hold TRK and press NO: the active pattern's kit switches to its temp-saved copy (B, what FUNC+NO
 * would bring back), and your edited kit (A) is kept aside. Hold TRK and press NO again: your edits
 * come back. Nothing is overwritten: the temp copy stays as it was, so FUNC+YES / FUNC+NO work as
 * before. Change pattern while you hear B and your edits are put back into the pattern you left.
 *
 * How it works, in the firmware's own terms (OS 1.54, found by reading its code):
 *   - Project::instance()              0x40138882, the live project
 *   - the active pattern's index        0x40092890(0x401389c4())
 *   - a pattern's kit                   project->vtable[10](project) + 0xf6341c + 2334 * pattern
 *   - reload(project, temp, pattern, seq, kit)   0x40017c16, what FUNC+NO and the KIT menu's
 *                                       RELOAD KIT FROM SAVED call; seq 0, kit 1 reloads the kit only
 *   - kit_changed(project + 0xec, pattern, 0)    0x4013c42c, what that reload calls after it writes
 *                                       the kit, so the sound engine and the screens take it
 * Going to B is the stock reload. Coming back writes the kept bytes where the reload wrote, then
 * makes the same kit_changed call the reload makes.
 *
 * Before it touches anything it checks that the kit address it worked out is the one the sequencer
 * plays (core's fw_kit). If they differ it does nothing and says so. */
#include <stdint.h>
#include "digitakt-mk1/core3.h"

#define KIT_SIZE   2334
#define KIT_OFF    0x00f6341cu

typedef uint32_t (*u32_fn)(void);
typedef int32_t (*pat_fn)(uint32_t ui);
typedef int32_t (*reload_fn)(uint32_t project, int32_t temp, int32_t pattern, int32_t seq, int32_t kit);
typedef void (*changed_fn)(uint32_t listeners, int32_t pattern, int32_t flags);
typedef uint32_t (*vfn)(uint32_t self);

#define PROJECT    ((u32_fn)PROJECT_AT)
#define UI_STATE   ((u32_fn)UI_STATE_AT)
#define CUR_PAT    ((pat_fn)CUR_PAT_AT)
#define RELOAD     ((reload_fn)RELOAD_AT)
#define KIT_CHANGED ((changed_fn)KIT_CHANGED_AT)

/* key events: +12 the key, +16 the flags */
#define E_KEY      12
#define E_FLAGS    16
#define F_REPEAT   0x08
#define F_RELEASE  0x10
#define F_DOWN     0x01                         /* the firmware's own "is it down" (0x400c33fc) */
#define IS_UP(f)   (!((f) & F_DOWN) || ((f) & F_RELEASE))
#define K_TRK      2
#define K_NO       13

static uint8_t kept[KIT_SIZE];          /* A: your edited kit while B plays */
static int32_t in_b;                    /* 1 while the temp copy (B) is loaded */
static int32_t b_pattern = -1;          /* the pattern B was loaded into */
static int32_t trk_held;
static int32_t swallow_no;              /* the NO we took: its repeats and release are ours too */

static const char *msg;                 /* the pop-up's text, and how many ticks it stays */
static int32_t msg_ticks;
static int32_t redraw;

static void say(const char *text)
{
    msg = text;
    msg_ticks = 36;                     /* about 1.2 s at 30 ticks a second */
    redraw = 1;
}

static void copy(uint8_t *to, const uint8_t *from, int32_t n)
{
    while (n-- > 0)
        *to++ = *from++;
}

static uint32_t project_kit(uint32_t project, int32_t pattern)
{
    uint32_t vt = *(const uint32_t *)project;
    vfn base_of = *(const vfn *)(vt + 40);
    return base_of(project) + KIT_OFF + (uint32_t)KIT_SIZE * (uint32_t)pattern;
}

static int32_t active_pattern(void)
{
    return CUR_PAT(UI_STATE());
}

static void to_b(void)
{
    uint32_t project = PROJECT();
    int32_t pattern = active_pattern();
    uint32_t kit = project_kit(project, pattern);
    if (kit != (uint32_t)fw_kit) {      /* not the kit the sequencer plays: leave everything alone */
        say("KIT A/B: NO KIT FOUND");
        return;
    }
    copy(kept, (const uint8_t *)kit, KIT_SIZE);
    if (!(RELOAD(project, 1, pattern, 0, 1) & 0xff)) {
        copy((uint8_t *)kit, kept, KIT_SIZE);   /* in case the reload stopped half-way */
        KIT_CHANGED(project + 0xec, pattern, 0);
        say("NO TEMP SAVE YET");
        return;
    }
    in_b = 1;
    b_pattern = pattern;
    say("KIT B: SAVED");
}

static void to_a(void)
{
    uint32_t project = PROJECT();
    uint32_t kit = project_kit(project, b_pattern);
    copy((uint8_t *)kit, kept, KIT_SIZE);
    KIT_CHANGED(project + 0xec, b_pattern, 0);
    in_b = 0;
    b_pattern = -1;
    say("KIT A: YOUR EDITS");
}

int32_t kitab_key(void *brain, void *ev)
{
    int32_t key = *(int32_t *)((char *)ev + E_KEY);
    int32_t flags = *(int32_t *)((char *)ev + E_FLAGS);
    (void)brain;
    if (key == K_TRK)
        trk_held = !IS_UP(flags);
    if (key == K_NO && swallow_no) {
        if (IS_UP(flags))
            swallow_no = 0;
        return 1;
    }
    if (key == K_NO && trk_held && !IS_UP(flags) && !(flags & F_REPEAT)) {
        swallow_no = 1;
        if (in_b)
            to_a();
        else
            to_b();
        return 1;
    }
    return 0;
}

void kitab_tick(void *ctrl)
{
    if (in_b && active_pattern() != b_pattern) {
        /* the pattern changed while B played: your edits go back into the pattern you left (it is
         * not playing now, so there is nothing to tell the engine) */
        uint32_t project = PROJECT();
        copy((uint8_t *)project_kit(project, b_pattern), kept, KIT_SIZE);
        in_b = 0;
        b_pattern = -1;
        say("KIT A KEPT");
    }
    if (msg_ticks > 0 && --msg_ticks == 0)
        redraw = 1;                     /* one more frame, to clear the pop-up */
    if (redraw || msg_ticks > 0) {
        *((uint8_t *)ctrl + 0x20) = 1;
        redraw = 0;
    }
}

static int32_t text_len(const char *s)
{
    int32_t n = 0;
    while (s[n])
        n++;
    return n;
}

void kitab_draw(void *bmp, void *ctrl)
{
    (void)ctrl;
    if (in_b) {                         /* a small "B" in the top-right corner while B plays */
        fw_fillrect(bmp, 119, 55, 127, 63, 0);
        fw_framerect(bmp, 119, 55, 127, 63, 1);
        fw_textf(bmp, fw_font5, 122, 57, 2, "B");
    }
    if (msg_ticks > 0 && msg) {
        int32_t w = text_len(msg) * 4;
        int32_t x0 = 64 - w / 2 - 5, x1 = 64 + w / 2 + 4;
        fw_fillrect(bmp, x0, 24, x1, 38, 0);
        fw_framerect(bmp, x0, 24, x1, 38, 1);
        fw_textf(bmp, fw_font5, 64 - w / 2, 29, 24, "%s", msg);
    }
}
