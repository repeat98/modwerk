/* Mixer Mode: shared by the C section (chain_keys.c model and keys, chain_draw.c
 * pixels, engine.c audio, pages.c node knob pages, pedal_in.c PEDAL INPUT).
 * Design: docs/dev/mixer-ui-mockup.html v20, docs/dev/v2.0-brief.md "Effect Chain screen".
 * Build: TI cl6x, C6740 EABI, far data, no RTS (scripts/build_mixer_ui.py). */
#ifndef CHAIN_H
#define CHAIN_H

#define PRE 0                   /* bus codes, as LAYOUT (mixer.S) */
#define BUS_A 1
#define BUS_B 2
#define POST 3

/* Cursor items: a slot 0-5, or one of these. */
#define IT_ROUTE 0x10
#define IT_MIX 0x11
#define IT_IN 0x12
#define IT_OUT 0x13

/* Mixer data (mixer.S, BASE 0xC00F6000). */
#define MIXER_BASE 0xC00F6000u
#define SHOWN (*(volatile unsigned char *)(MIXER_BASE + 78))  /* LIMIT tag shown */
#define PEDAL (*(volatile unsigned char *)(MIXER_BASE + 176)) /* PEDAL INPUT: 1 = STEREO (pedal_in.c) */
#define IDLE (*(volatile unsigned char *)(MIXER_BASE + 177))  /* IDLE KALEIDO 0 OFF, 1-4 10 S..2 MIN (pedal_in.c) */
#define IDLE_SHOWN (*(volatile unsigned char *)(MIXER_BASE + 178)) /* KALEIDO opened by idle_ev (master.c MS_IDLE_SHOWN) */
#define MENUSCR ((volatile unsigned char *)(MIXER_BASE + 184))
#define LIVE ((volatile unsigned char *)(MIXER_BASE + 224))   /* [24] settings of the patch played */
#define LAYOUT (LIVE + 12)      /* [6] bus of each slot (settings 12-17) */
#define R50 ((volatile unsigned char *)0xC0116000u)  /* record 50 as in flash (below looper region 1): globals + settings table (pages.c) + Perform (perform_store.c) */
#define R50_SIZE (824 + 4 + 50 * 208)
#define R50_COPY 0xC0106DC0u    /* [R50_SIZE] the record store compaction buffer (mixer-m2.yaml) */

/* Settings: LIVE[S_*]. Levels 0-150, 100 = unity; Send and Crossfade 0-100. */
#define S_MODE 0                /* 0 Serial, 1 Parallel, 2 Split, 3 Mono Serial (2, 3: STEREO only) */
#define S_SEND 1
#define S_IN 2                  /* Input Level (Split: Input L) */
#define S_RA 3                  /* [ROUTE] Bus A / B Level */
#define S_RB 4
#define S_XF 5
#define S_MASTER 6              /* Master (Output Split: Master L) */
#define S_CURVE 7               /* 0 Smooth, 1 DJ, 2 Cut */
#define S_MA 8                  /* [MIX] Bus A / B Level */
#define S_MB 9
#define S_PHASE 10              /* 0 Normal, 1 Invert (Bus B) */
#define S_INR 18                /* Input R (Split input) */
#define S_MR 19                 /* Master R (Output Split) */
#define S_OUT 20                /* Output Mode: 0 Stereo, 1 Mono, 2 Split (A -> L, B -> R) */
#define S_MUTEA 21              /* 0 Off, 1 On */
#define S_MUTEB 22
#define S_SOLO 23               /* 0 Off, 1 A, 2 B */
#define NSET 24

/* The mode that plays: Split and Mono Serial fall back with a MONO input. */
static inline int eff_mode(void)
{
    int m = LIVE[S_MODE] & 3;
    return m > 1 && !PEDAL ? m == 2 : m;
}

/* Parallel, and Send and Crossfade point at opposite buses: nothing comes out
 * (mockup silent()): a ! on [MIX]. */
static inline int mix_silent(void)
{
    int s = LIVE[S_SEND], x = LIVE[S_XF];
    return eff_mode() == 1 && LIVE[S_OUT] != 2 && ((s == 0 && x == 100) || (s == 100 && x == 0));
}

/* UI state: the 8 bytes at +136. */
#define UI ((volatile unsigned char *)(MIXER_BASE + 136))
#define UI_CUR 0                /* cursor item */
#define UI_SEL 1                /* 1: the item is selected (CHO look) */
#define UI_BUSROW 2             /* BUS_A or BUS_B: the bus row browsing walks */
#define UI_DELP 3               /* 1: DELETE? waits for a knob 2 press */
#define UI_ADDBUS 4             /* 0xFF, or the bus mv_add gives the next added effect */
#define UI_FROMCHAIN 5          /* 1: node pages opened from here, EXIT returns; 2: an add */
#define UI_PFIRST 6             /* node page range (PG_*) knob 3 press walks */
#define UI_PLAST 7

/* The chain as the screen shows it, built from the live patch. Slots stay
 * sorted by zone (PRE..., A..., B..., POST...), so each list is in slot
 * order; signal order = slot order = right to left on screen. */
typedef struct {
    int n;                      /* effects in the patch, 0-6 */
    int mode;                   /* eff_mode(): 0 Serial, 1 Parallel, 2 Split, 3 Mono Serial */
    int stereo;                 /* PEDAL INPUT STEREO: IN and the lines before [ROUTE] are double */
    int out;                    /* LIVE[S_OUT]: [MIX] icon and the lines after it */
    int mute[2];                /* Bus A / B muted at [MIX] (Solo applied; Parallel / Split only) */
    int silent;                 /* Send and Crossfade point at opposite buses: ! on [MIX] */
    int nz[4];                  /* effects per zone, indexed by bus code */
    unsigned char z[4][6];      /* slots per zone, in slot order */
    const char *name[6];        /* per slot: 10 chars, 2 lines of 5 (stock cover text) */
    unsigned char on[6];        /* per slot: 0 = drawn dotted (OFF or DSP-off) */
    unsigned char full[6];      /* per slot: 1 = bypassed by DSP FULL ("FULL" as name line 2) */
    int cur, sel, busrow, delp; /* UI state, as above */
    int limit;                  /* 1: LIMIT tag over OUT */
} Chain;

void chain_build(Chain *c);     /* chain_keys.c */
void blit_fb(unsigned char fb[64][16]);  /* chain_keys.c: fb to the LCD */

/* chain_draw.c: the whole 128 x 64 screen into fb, 1 bit per pixel,
 * row-major, bit 7 of byte 0 = pixel (0,0), 1 = ink. The caller sends it
 * to the LCD. */
void chain_draw(const Chain *c, unsigned char fb[64][16]);

/* Node knob pages: each node's knobs 3 per page, no gaps (as stock): IN 1-2 knobs = 1 page,
 * [ROUTE] 4 = 2, [MIX] 9 = 3, OUT 1-2 = 1. PAGE walks PG_IN..PG_OUT (mixer.S knows PG_OUT). */
#define PG_IN 0
#define PG_ROUTE 1
#define PG_MIX 3
#define PG_OUT 6
#define PG_N 7
typedef struct {
    const char *name;           /* tab row: "IN", "[ROUTE]", "[MIX]", "OUT" */
    int page, npages;           /* this node's page 0.., and how many */
    int warn;                   /* 1: a ! tab after the name ([MIX] silent) */
    const char *label[3];       /* per knob, 0 = no knob */
    const char *text[3];        /* the value as shown; "-" = does nothing now */
    int val[3], max[3], type[3]; /* knob fill = val / max; type: pages.c FADER / KNOB / TOGGLE */
    int limit;                  /* 1: LIMIT tag (OUT, while the limiter cuts) */
} Pages;

void pages_build(Pages *p);     /* pages.c, from PAGE and LIVE; drawn with stock calls */

#endif
