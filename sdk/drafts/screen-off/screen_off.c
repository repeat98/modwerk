/* SPDX-License-Identifier: MIT
 * Copyright (C) 2026 jonathanwardle1992-beep
 *
 * SCREEN OFF. Hold UP and tap NO: the composed frame is cleared until the
 * same chord. Every other key and every knob still reaches the firmware, so
 * the machine keeps working while the glass stays black. UP alone and NO
 * alone are left to stock (NO still disarms, or steps back in a list).
 *
 * The chord is the press of NO while UP is already down. A repeat of that
 * NO does not toggle again. The matching release is taken too, so stock
 * does not also see it. The screen comes back only on the next chord.
 *
 * UP counts as down when this hook saw it go down, or when the panel's
 * held-key row still has it (0x46100b18, the bytes stock's own key parser
 * updates before it posts the event). A press that happened before the
 * module was installed never arrives here, and an earlier base handler can
 * take that press; the row still shows the key under the finger.
 *
 * Panel codes are the MKII map (UP 0x33, NO 0x32); MKI and MKII share them.
 * The blank is the 1024-byte composed frame, cleared in the UI draw hook,
 * not a change to the OLED power command. Turning the blank on or off asks
 * the UI loop to compose (the same mark the base uses, 0x4004d948), because
 * the chord is taken and stock would not redraw it.
 *
 * State lives in initialised data. A bad magic word is a fresh module:
 * screen on, nothing held. screen_off.s is the same decisions for the unit.
 */
#include <stdint.h>

#define KEY_NO 0x32
#define KEY_UP 0x33
#define MAGIC 0x534f4631u /* "SOF1" */
#define FRAME 1024
#define HELD_ROWS 0x46100b18u /* boot.c: one bit per key, row = code >> 3 */

struct so {
    uint32_t magic;
    uint8_t up, off, no_down, take;
    uint32_t toggles;
};

static struct so so;
static struct so *volatile so_at = &so;

#ifdef SO_HOST
static int redraws;
static int so_row_up; /* the panel row, which the host has no copy of */
int so_redraw_count(void) { return redraws; }
struct so *so_state_for_test(void) { return so_at; }
void so_test_up_held(int held) { so_row_up = held ? 1 : 0; }
static void request_redraw(void) { redraws++; }
#else
static void request_redraw(void)
{
    ((void (*)(int))0x4004d948u)(-1); /* mark the display; the UI loop flushes it */
}
#endif

static struct so *ready(void)
{
    struct so *s = so_at;
    if (s->magic == MAGIC) return s;
    uint8_t *p = (uint8_t *)s;
    for (unsigned i = 0; i < sizeof *s; ++i) p[i] = 0;
    s->magic = MAGIC;
    return s;
}

static int up_is_down(const struct so *s)
{
    if (s->up) return 1;
#ifdef SO_HOST
    return so_row_up;
#else
    unsigned code = KEY_UP;
    uint8_t row = *(volatile uint8_t *)(HELD_ROWS + (code >> 3));
    return (row & (uint8_t)(1u << (code & 7u))) != 0;
#endif
}

int so_key(int code, int pressed)
{
    struct so *s = ready();
    if (code == KEY_UP) {
        s->up = pressed ? 1u : 0u;
        return 0;
    }
    if (code != KEY_NO) return 0;
    if (!pressed) {
        int take = s->take ? 1 : 0;
        s->no_down = 0;
        s->take = 0;
        return take;
    }
    if (s->no_down) return s->take ? 1 : 0;
    s->no_down = 1;
    if (!up_is_down(s)) return 0;
    s->off ^= 1u;
    s->take = 1;
    s->toggles++;
    request_redraw();
    return 1;
}

void so_draw(unsigned char *frame)
{
    struct so *s = ready();
    if (!s->off || !frame) return;
    for (int i = 0; i < FRAME; ++i) frame[i] = 0;
}

struct so_api { volatile uint32_t value; };

void so_tick(struct so_api *api)
{
    struct so *s = ready();
    api->value = (s->toggles << 1) | s->off;
}

#ifdef SO_HOST
_Static_assert(sizeof(struct so) == 12, "screen-off state layout");
#endif
