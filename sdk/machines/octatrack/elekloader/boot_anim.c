/* SPDX-License-Identifier: GPL-3.0-or-later
 * Copyright (C) 2026 Modwerk contributors
 *
 * The base's startup, in place of the stock logo loop: boot_anim.s jumps here from the loop's first
 * instruction (0x400559c6) and goes on with the stock code after the loop (0x40055b7e), which resets
 * every LED.
 *
 * Docking: the mark's ninth dot is a module arriving. First the mark flies in: every pixel of the frame
 * and the tiles comes from far beyond the screen and lands, the frame clockwise, the tiles from the middle
 * one round the ring. The empty corner, the socket, blinks while a light far off on the trig row answers.
 * The module runs along the trig row, turns up into the screen and docks; its wave reveals MODWERK, NEW and
 * the version and rolls on across the whole panel. The lamps stay dark while the mark builds, so the
 * module's light and then its wave are all the panel shows.
 *
 * Screen and lamps are one plane: the LCD sits in the panel (54.2 hundredths of a millimetre per pixel,
 * lamp positions from the stock lamp table), so the module and the wave cross the screen's edge without
 * a break. The lamps are white on an
 * MKII: the startup sets channel A's colour to white at the panel's LED intensity and puts the firmware's
 * own colours back (its pre-logo call) before it returns. An MKI has fixed colours, so there it is channel
 * A's red. Drawing goes through ev_draw on the frame the compositor builds (bus.s); time is the
 * free-running DTIM3 count, as in the stock loop. */
#include <stdint.h>
#include "boot_art.h"
#ifdef MODWERK_DEV
void modwerk_cost_stamp(unsigned k); /* diag.c: the development profile of the base's hooks */
#define MW_STAMP(k) modwerk_cost_stamp(k)
#else
#define MW_STAMP(k) ((void)0)
#endif

#ifdef MODWERK_HOST
void host_clear(void *window, int a, int b);
void host_compose(void);
void host_led_on(int id), host_led_off(int id), host_led_level(int id, int level), host_led_send(void);
void host_palette(int id, int reg, int r, int g, int b);
void host_scheme(int level, int backlight, int lists, int keys);
extern volatile uint32_t host_dtcn3;
extern uint32_t host_mkii, host_intensity;
extern int32_t host_lamps[];
extern const uint32_t host_white[3];
#define lcd_clear host_clear
#define lcd_compose host_compose
#define led_on host_led_on
#define led_off host_led_off
#define led_level host_led_level
#define led_send host_led_send
#define led_palette host_palette
#define led_scheme host_scheme
#define DTCN3 host_dtcn3
#define PANEL_MKII host_mkii
#define LED_INTENSITY host_intensity
#define LAMPS_MKII host_lamps
#define LAMPS_MKI host_lamps
#define WHITE host_white
#else
/* OS 1.40C, as the stock logo loop and the boot sequence around it call them. */
#define lcd_clear ((void (*)(void *, int, int))0x400125ac)  /* (window, 0, -1) blanks it */
#define lcd_compose ((void (*)(void))0x40013abc)            /* windows, then ev_draw, then the changes to the LCD */
#define led_on ((void (*)(int))0x400131a0)
#define led_off ((void (*)(int))0x400131c8)
#define led_level ((void (*)(int, int))0x400135b0)          /* 0-15, sent when it changes */
#define led_send ((void (*)(void))0x400136a8)
#define led_palette ((void (*)(int, int, int, int, int))0x40013368)   /* (id, register 0-2, r, g, b) */
#define led_scheme ((void (*)(int, int, int, int))0x4003f430)       /* (intensity, backlight, lamp lists, keys) */
#define DTCN3 (*(volatile uint32_t *)0xfc07c00c)           /* 132 MHz; any write clears it */
#define PANEL_MKII (*(volatile uint32_t *)0x46c8d18c)
#define LED_INTENSITY (*(volatile uint32_t *)0x800000d0)    /* the setting the boot passes to led_scheme */
#define LAMPS_MKII ((const int32_t *)0x400c0d08)            /* lamp (x, y) in 0.01 mm, 67 lamps */
#define LAMPS_MKI ((const int32_t *)0x400c0f20)             /* 44 lamps */
#define WHITE ((const uint32_t *)0x400abc26)                /* the scheme's colour level per intensity */
#endif

/* The score, in ms. Each pixel of the mark sets off at its own time (boot_art.h) and lands FLIGHT later. */
#define FLIGHT 800
#define T_WAIT 1300     /* the socket blinks and the module answers, twice */
#define T_FLY0 1540     /* the module's run */
#define T_DOCK 2260
#define T_WAVE 2260     /* the dock's wave: radius (dt / 40 ms)^2 px */
#define T_END 3500

#define R_HEAD 34       /* px: how far from the module a lamp glows */
#define R_RING 36       /* px: the wave's width on the panel */
#define FADE_MS 200     /* a lamp's afterglow from full to dark */
#define BAND 7          /* px: how far either side of the wave's ring the screen bends */
#define LENS 3          /* px: how far it bends at the ring */
#define SHAKE_MS 90     /* the rows shudder this long at the dock */

static int32_t now, on, lamps;
static int32_t path[4][2];              /* the module's run: a cubic curve, 1/16 px */
static int16_t lamp_x[67], lamp_y[67];  /* lamps in screen pixels */
static int32_t glow[67];                /* 1/16 levels */
static int32_t dot_x[BOOT_DOTS], dot_y[BOOT_DOTS];  /* the mark's pixels in flight, 1/16 px */
static int8_t dot_r[BOOT_DOTS];         /* their blob radius in 1/16 px; 0 landed, -1 not yet on their way */
static unsigned char before[1024];      /* the frame as drawn, for the wave to bend */

#define DOCK_X (BOOT_DISC_X * 16 + BOOT_DISC_W * 8)   /* the detached tile's middle, 1/16 px */
#define DOCK_Y (BOOT_DISC_Y * 16 + BOOT_DISC_H * 8)
#define ZOOM_X BOOT_MID_X                            /* the mark's middle, where the flight converges */
#define ZOOM_Y BOOT_MID_Y

static int32_t span(int32_t t, int32_t t0, int32_t t1) /* 0..4096 */
{
    return t <= t0 ? 0 : t >= t1 ? 4096 : (t - t0) * 4096 / (t1 - t0);
}

static int32_t smooth(int32_t u)
{
    return (u * u >> 12) * (3 * 4096 - 2 * u) >> 12;
}

static void dot(unsigned char *frame, int32_t x, int32_t y)
{
    if ((uint32_t)x < 128 && (uint32_t)y < 64) {
        int32_t bit = 63 - y;
        frame[x * 8 + (bit >> 3)] |= (unsigned char)(0x80 >> (bit & 7));
    }
}

static void blob(unsigned char *frame, int32_t cx, int32_t cy, int32_t r) /* all in 1/16 px */
{
    for (int32_t y = (cy - r) >> 4; y <= (cy + r) >> 4; y++)
        for (int32_t x = (cx - r) >> 4; x <= (cx + r) >> 4; x++) {
            int32_t dx = x * 16 + 8 - cx, dy = y * 16 + 8 - cy;
            if (dx * dx + dy * dy <= r * r)
                dot(frame, x, y);
        }
}

static void bits(unsigned char *frame, int32_t x, int32_t y, const uint8_t *rows, int32_t w, int32_t h)
{
    for (int32_t j = 0; j < h; j++)
        for (int32_t i = 0; i < w; i++)
            if (rows[j] >> (w - 1 - i) & 1)
                dot(frame, x + i, y + j);
}

static void dotted(unsigned char *frame, int32_t x, int32_t y, int32_t w, int32_t h)
{
    for (int32_t i = 0; i < w; i++)
        for (int32_t j = 0; j < h; j++)
            if ((i == 0 || j == 0 || i == w - 1 || j == h - 1) && (i + j) % 2 == 0)
                dot(frame, x + i, y + j);
}

static int32_t isqrt(uint32_t v)
{
    uint32_t r = 0, b = 1u << 30;
    while (b > v) b >>= 2;
    for (; b; b >>= 2)
        if (v >= r + b) v -= r + b, r = (r >> 1) + b;
        else r >>= 1;
    return (int32_t)r;
}

/* The mark in flight at time t: a pixel at progress p (0-4096) is (its offset from the middle) / p out,
 * so it comes from far beyond the panel and slows into place, a blob that shrinks to one pixel. */
static void fly(int32_t t)
{
    for (int i = 0; i < BOOT_DOTS; i++) {
        int32_t p = (t - boot_dots[i].delay) * 4096 / FLIGHT, fx = boot_dots[i].x * 16 + 8, fy = boot_dots[i].y * 16 + 8;
        if (p <= 0) {
            dot_r[i] = -1;
            continue;
        }
        if (p >= 4096) {
            dot_x[i] = fx, dot_y[i] = fy, dot_r[i] = 0;
            continue;
        }
        int32_t scale = (4096 << 12) / (p < 64 ? 64 : p), size = 2304 / p;   /* the stock sprites' 144 / progress */
        dot_x[i] = ZOOM_X + ((fx - ZOOM_X) * scale >> 12);
        dot_y[i] = ZOOM_Y + ((fy - ZOOM_Y) * scale >> 12);
        dot_r[i] = (int8_t)(8 * (size > 6 ? 6 : size));
    }
}

/* Where the module is at time t (1/16 px): along the curve, easing in and out, docked from T_DOCK on. */
static void module(int32_t t, int32_t *x, int32_t *y)
{
    int32_t u = smooth(span(t, T_FLY0, T_DOCK)), a = 4096 - u;
    int32_t w[4] = {(a * a >> 12) * a >> 12, 3 * ((a * a >> 12) * u >> 12), 3 * ((a * u >> 12) * u >> 12), (u * u >> 12) * u >> 12};
    *x = *y = 0;
    for (int k = 0; k < 4; k++)
        *x += w[k] * path[k][0] >> 12, *y += w[k] * path[k][1] >> 12;
}

static int32_t wave(int32_t t) /* px */
{
    int32_t dt = t - T_WAVE;
    return dt <= 0 ? 0 : dt * dt / 1600;
}

static int near(int32_t x, int32_t y, int32_t r) /* is pixel (x, y) within r px of the dock */
{
    int32_t dx = x * 16 + 8 - DOCK_X, dy = y * 16 + 8 - DOCK_Y;
    return dx * dx + dy * dy <= r * r * 256;
}

static int lit(const unsigned char *frame, int32_t x, int32_t y)
{
    int32_t bit = 63 - y;
    return (uint32_t)x < 128 && (uint32_t)y < 64 && frame[x * 8 + (bit >> 3)] >> (7 - (bit & 7)) & 1;
}

/* The wave bends what it passes: within BAND px of the ring each pixel shows what lies up to LENS px
 * nearer the dock, so the logo bulges outwards as the ring goes through; at the dock the rows shudder.
 * Only the band is redrawn, the whole frame only while the rows shudder. */
static void bend(unsigned char *frame, int32_t t, int32_t r)
{
    int32_t cx = DOCK_X >> 4, cy = DOCK_Y >> 4, shake = t >= T_DOCK && t < T_DOCK + SHAKE_MS ? T_DOCK + SHAKE_MS - t : 0;
    int32_t lo = r > BAND ? (r - BAND) * (r - BAND) : 0, hi = (r + BAND) * (r + BAND), reach = r + BAND;
    int32_t x0 = shake || cx - reach < 0 ? 0 : cx - reach, x1 = shake || cx + reach > 127 ? 127 : cx + reach;
    int32_t y0 = shake || cy - reach < 0 ? 0 : cy - reach, y1 = shake || cy + reach > 63 ? 63 : cy + reach;
    for (int i = 0; i < 1024; i++)
        before[i] = frame[i];
    for (int32_t y = y0; y <= y1; y++) {
        int32_t off = shake ? ((y * 7 + t / 20 * 13) % 5 - 2) * shake / SHAKE_MS : 0;
        for (int32_t x = x0; x <= x1; x++) {
            int32_t dx = x - cx, dy = y - cy, d2 = dx * dx + dy * dy, sx = x - off, sy = y, in = r > 0 && d2 > lo && d2 < hi;
            if (!in && !shake)
                continue;
            if (in) {
                int32_t d = isqrt((uint32_t)d2), off2 = d - r, s = LENS * (BAND - (off2 < 0 ? -off2 : off2)) / BAND;
                if (d > 0)
                    sx = cx + dx * (d - s) / d - off, sy = cy + dy * (d - s) / d;
            }
            int32_t bit = 63 - y;
            unsigned char mask = (unsigned char)(0x80 >> (bit & 7));
            if (lit(before, sx, sy))
                frame[x * 8 + (bit >> 3)] |= mask;
            else
                frame[x * 8 + (bit >> 3)] &= (unsigned char)~mask;
        }
    }
}

static void boot_draw(unsigned char *frame);
void modwerk_boot_draw(unsigned char *frame)
{
    MW_STAMP(12); boot_draw(frame); MW_STAMP(20);
}
static void boot_draw(unsigned char *frame)
{
    int32_t t = now, r = wave(t);
    if (!on)
        return;
    for (int i = 0; i < BOOT_DOTS; i++)
        if (dot_r[i] == 0)
            dot(frame, dot_x[i] >> 4, dot_y[i] >> 4);
        else if (dot_r[i] > 0)
            blob(frame, dot_x[i], dot_y[i], dot_r[i]);
    if (t >= T_WAIT && t < T_DOCK && (t >= T_FLY0 || (t - T_WAIT) % 120 < 60))   /* the socket */
        dotted(frame, BOOT_DISC_X, BOOT_DISC_Y, BOOT_DISC_W, BOOT_DISC_H);
    if (t >= T_FLY0 && t < T_DOCK) {   /* the module on the screen, with a short streak */
        for (int k = 2; k >= 0; k--) {
            int32_t x, y;
            module(t - 25 * k, &x, &y);
            blob(frame, x, y, 56 - 16 * k);
        }
    } else if (t >= T_DOCK) {
        bits(frame, BOOT_DISC_X, BOOT_DISC_Y, boot_disc, BOOT_DISC_W, BOOT_DISC_H);
        if (t < T_DOCK + 40)   /* the clunk */
            for (int i = -1; i <= BOOT_DISC_W; i++)
                for (int j = -1; j <= BOOT_DISC_H; j++)
                    dot(frame, BOOT_DISC_X + i, BOOT_DISC_Y + j);
    }
    if (r) {
        for (int32_t x = 0; x < BOOT_WORD_W; x++)   /* what the wave has passed shows */
            for (int32_t y = 0; y < BOOT_WORD_H; y++)
                if (boot_word[x] >> y & 1 && near(BOOT_WORD_X + x, BOOT_WORD_Y + y, r))
                    dot(frame, BOOT_WORD_X + x, BOOT_WORD_Y + y);
        for (int g = 0; g < BOOT_GLYPHS; g++)
            for (int i = 0; i < boot_glyph[g].count; i++) {
                const uint8_t *p = boot_ink[boot_glyph[g].first + i];
                if (near(p[0], p[1], r))
                    dot(frame, p[0], p[1]);
            }
    }
    if ((r > 0 && r < 110) || (t >= T_DOCK && t < T_DOCK + SHAKE_MS))   /* until it has left the screen */
        bend(frame, t, r);   /* no outline: the wave shows only in what it bends, as on card builds */
}

static void light(int32_t t, int32_t dt)
{
    int32_t mx = 0, my = 0, flying = t >= T_FLY0 && t < T_DOCK + 60, r = wave(t);
    if (flying)
        module(t, &mx, &my), mx >>= 4, my >>= 4;
    for (int i = 0; i < lamps; i++) {
        int32_t px = lamp_x[i], py = lamp_y[i], best = 0, level, d;
        /* far off, the module answering the socket */
        if (i == 0 && t >= T_WAIT && t < T_FLY0 && (t - T_WAIT) % 120 < 60)
            best = 15;
        if (flying) {
            d = isqrt((uint32_t)((px - mx) * (px - mx) + (py - my) * (py - my)));
            level = 15 - d * 15 / R_HEAD;
            if (level > best) best = level;
        }
        if (r > 0 && r < 600) {
            int32_t ox = px - (DOCK_X >> 4), oy = py - (DOCK_Y >> 4);
            d = isqrt((uint32_t)(ox * ox + oy * oy)) - r;
            level = 15 - (d < 0 ? -d : d) * 15 / R_RING;
            if (level > best) best = level;
        }
        int32_t g = glow[i] - dt * 16 * 15 / FADE_MS;
        glow[i] = best * 16 > g ? best * 16 : g < 0 ? 0 : g;
        led_level(2 * i, glow[i] >> 4);
    }
}

void modwerk_boot_run(void *window)
{
    const int32_t *table = PANEL_MKII ? LAMPS_MKII : LAMPS_MKI;
    /* Where the LCD's top left corner sits on each panel, in the table's units. The MKII's is measured
     * against the panel drawing; the MKI's is an estimate from its lamp layout. */
    int32_t x0 = PANEL_MKII ? 12627 : 9332, y0 = PANEL_MKII ? 13659 : 12734, then = 0;
    lamps = PANEL_MKII ? 67 : 44;
    for (int i = 0; i < lamps; i++) {
        lamp_x[i] = (int16_t)((table[2 * i] - x0) * 10 / 542);
        lamp_y[i] = (int16_t)((y0 - table[2 * i + 1]) * 10 / 542);
        glow[i] = 0;
    }
    /* the run: from beyond trig 1 along the trig row, then up through the keys under the screen */
    path[0][0] = (lamp_x[0] - 40) * 16, path[0][1] = lamp_y[0] * 16;
    path[1][0] = DOCK_X + 150 * 16, path[1][1] = (lamp_y[0] + 20) * 16;
    path[2][0] = DOCK_X, path[2][1] = DOCK_Y + 150 * 16;
    path[3][0] = DOCK_X, path[3][1] = DOCK_Y;
    for (int id = 0; id < 2 * lamps; id++)
        led_level(id, 0);
    if (PANEL_MKII) {   /* channel A white, at the panel's intensity */
        int32_t level = (int32_t)WHITE[LED_INTENSITY > 2 ? 2 : LED_INTENSITY];
        for (int i = 0; i < lamps; i++)
            led_palette(2 * i, 1, level, level, level);
    }
    for (int i = 0; i < lamps; i++)
        led_on(2 * i), led_off(2 * i + 1);
    led_send();
    DTCN3 = 0;
    on = 1;
    for (;;) {
        int32_t t = (int32_t)(DTCN3 / 132000u);
        if (t >= T_END)
            break;
        now = t;
        fly(t);
        lcd_clear(window, 0, -1);
        lcd_compose();
        light(t, t - then);
        led_send();
        then = t;
    }
    on = 0;
    if (PANEL_MKII)   /* the firmware's colours as it set them before the logo; it sets the keys' after it */
        led_scheme((int)LED_INTENSITY, 0, 1, 0);
}
