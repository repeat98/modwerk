/* MS-70CDR 2.10 OS addresses chain_keys.c uses (docs/dev/mixer-mode-m3-research.md
 * "M3b"). Stock functions are plain C ABI (args A4, B4, A6, B6, A8, B8). */
#ifndef STOCK_H
#define STOCK_H

/* B14 is the OS's constant data pointer: its variables as absolute addresses,
 * so our far-data C never needs (or writes) B14. */
#define B14 0xC00EF748u
#define BV(off) (*(volatile int *)(B14 + (off)))
#define MODE BV(320)                /* 11 = menu screens, 0 = play */
#define SCREEN BV(352)              /* 3 = Effect Chain */
#define ROW BV(356)                 /* screen row; -2 marks "the chain screen is ours" */
#define ANCHOR BV(128)              /* add: the slot the new effect goes next to */
#define SIDE BV(132)                /* 1: on its left (slot + 1) */
#define MAILBOX BV(656)

#define COUNT (*(volatile int *)0xC009C068)          /* effects in the patch */
#define FX_REC(s) ((volatile int *)(0xC009BF58 + 44 * (s)))   /* [0] on, [1] effect id */
#define DSP_OFF (*(volatile int *)0xC009C060)        /* bit slot: bypassed, DSP full */
#define CURSOR (*(volatile signed char *)0xC009C064) /* play-mode cursor */
#define SW_STATE (*(volatile int *)0xC009DF90)       /* debounced switches: bit clear = down (scanner 0xC00C69A4) */
#define SW_KNOB2 1                                   /* bit 0: events 64 / 65 */

#define FN(addr, ret, args) ((ret (*) args)(addr))
#define V_PDOWN (*(volatile int *)0x1181EA38)        /* hold.inc HV+20: PERFORM footswitch down (looper.S poll) */
#define ZMT_CLAIM (*(volatile int *)0x1181FF1C)      /* transport word 7: the hold claim (looper.S poll clears it) */
#define SLOT_PARAMS(s) (*(volatile int *)(0x11F03004 + 212 * (s) + 4))   /* SLOT_STATE word 1 */
#define LOOPER_SLOT (*(volatile unsigned *)0xC00F3000 == 0x5A4C5301u ? ((volatile int *)0xC00F3000)[10] : -1)
#define ZMT_FTSW (*(volatile int *)0x1181FF18)       /* transport word 6: footswitch down; word 7 (+4) the hold claim */
#define SET_SCREEN FN(0xC00A75E0, void, (int screen, int row))
#define EVENT_POST FN(0xC00CBF40, void, (int mailbox, int bits))  /* display task Event flags: 0x40 = redraw */
#define KEY_POST FN(0xC00D1324, void, (int ev))  /* a key event into the UI mailbox B14[202] (as the timer task) */
#define TIMER6 FN(0xC00C7D60, void, (int on))       /* cursor left hold -> event 230 */
#define TIMER7 FN(0xC00C7D50, void, (int on))       /* cursor right hold -> event 231 */
#define POPUP FN(0xC00CCB00, void, (int, unsigned, unsigned, int))
#define MAX_FX_TEXT 0xC00EBD5F, 0xC00EBD5E           /* "MAX EFFECT UNIT!" */
#define FX_NAME FN(0xC00B056C, const char *, (int slot, int one))
#define SLOT_AT FN(0xC00BA2D8, int, (int cursor))   /* play cursor -> slot, -1 */
#define TYPE_NEXT FN(0xC00CA670, int, (int id, int dir))
#define TYPE_SET FN(0xC00ABACC, int, (int slot, int id))
#define S33_KEYS FN(0xC00A7A6C, int, (long long ev)) /* screens 32/33, the event pair in A5:A4 */
#define BLIT FN(0xC009F9B0, void, (int frame, int x, int y, int w, int h, const unsigned char *src))

/* mixer.S vectors */
#define MV_SWAP FN(0xC00F6000 + 96, void, (int row_a, int row_b))
#define MV_DELETE FN(0xC00F6000 + 112, void, (void))
#define HOLD (*(volatile int *)(0xC00F6000 + 80))    /* polls left to show LIMIT */
#define PAGE (*(volatile int *)(0xC00F6000 + 128))   /* node knob page PG_* (screen 15, pages.c) */

/* node knob pages: the stock Effect View knob page primitives (0xC00CAFA0 draws an effect's
 * page with them; docs/dev/mixer-mode-m3-research.md "M3c"). frame 0 = the LCD frame buffer
 * LCD0, page format; every primitive marks the rows it touches dirty. */
#define LCD0 ((volatile unsigned *)0x11816800)        /* frame 0: 1024 bytes */
#define LCD_DIRTY FN(0xC00A13C0, void, (int frame))   /* every row of the frame to the LCD */
#define KP_TAB FN(0xC00AB238, int, (int frame, int x, int y, int state, const char *text))  /* returns width; state 0 current, 1 right of it, 2 left */
#define KP_TEXT FN(0xC00A0040, void, (int frame, const char *text, int x, int y))   /* 7-px cells */
#define KP_TEXT_R FN(0xC00A9C18, void, (int frame, const char *text, int right, int y))
#define KP_FADER FN(0xC00AA1F8, void, (int frame, int x, int y, int val, int min, int max))  /* 31 x 24 fader, fill (val-min)/(max-min) */
#define KP_KNOB FN(0xC00A95A4, void, (int frame, double frac, int x, int y))  /* round knob, frac = val / max */
#define KP_TOGGLE FN(0xC00A9AD8, void, (int frame, int on, int x, int y))   /* stock: params with max 1 */
#define KP_DIVD FN(0xC00C0980, double, (double a, double b))  /* a / b, stock's (no RTS here) */
#define KP_BOX FN(0xC00AB1B4, void, (int frame, int x, int y, int w, int h))  /* clear a rect and draw its frame: stock (0, 11, 128, 53) */
#define KP_SOFTKEY FN(0xC009F834, void, (int key, const char *text, int arrows))
#define KP_COLX ((const int *)0xC00ECC58)              /* knob column x: 8, 48, 88 */
#define KP_EXIT ((const char *)0xC00EC8D3)             /* stock softkey texts "EXIT", "PAGE" */
#define KP_PAGE ((const char *)0xC00EC8D8)

/* A/B tag, footswitch */
#define FX_TOGGLE FN(0xC00ABCB8, void, (int slot))   /* effect ON <-> OFF (play-mode footswitch press) */
#define FX_EDITED FN(0xC00C75D4, void, (void))       /* then this, as the play-mode press */
#define PARAMS_ANY FN(0xC00BB92C, int, (int slot))   /* Effect View knob pages: the call ab_tag replaces */

#endif
