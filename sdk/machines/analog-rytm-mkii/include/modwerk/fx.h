/* SPDX-License-Identifier: GPL-3.0-or-later */
/* Modwerk's Analog Rytm MKII base: the send effects' list. The base owns the send bus, its return, the SEND and
 * SEND FX pages, the kit's effect and values, their p-locks and a work area; a send effect is a module that
 * contributes one record to the table mw_fx (build.json: "contribute": [{"to": "mw_fx", "data": "my_fx"}]).
 * One effect runs at a time; the chooser lists every record the build holds. */
#ifndef MODWERK_FX_H
#define MODWERK_FX_H

#define MW_FX_ABI 1
#define MW_FX_WORK 16384        /* words of the work area the base lends the effect that runs */
#define MW_FX_N24 16            /* a 24 kHz effect's samples a block (32 at 48 kHz) */

/* mw_fx.flags */
#define MW_FX_24K 1             /* runs at 24 kHz: each pair's mean in, the return brought back up linearly */
#define MW_FX_LIFT 2            /* with MW_FX_24K: the base lifts the input's top (x + (x - the one before) / 4) */

/* mw_fx_control.flags */
#define MW_FX_BIPOLAR 1         /* shown -64..+63, 64 the centre */

/* The page's drawings, one a control. MW_IC_COMB and MW_IC_BAND span their column and the next, whose encoder
 * sets the second value; an MW_IC_SYNC control is a note division (0-11), an MW_IC_SWITCH one 0 or 1. */
enum {
    MW_IC_EMPTY, MW_IC_DIAL, MW_IC_BIP, MW_IC_DEPTH, MW_IC_WIDTH, MW_IC_FDBK, MW_IC_HPF, MW_IC_LPF, MW_IC_STAGES,
    MW_IC_TUNE, MW_IC_COMB, MW_IC_SKIP, MW_IC_NOISE, MW_IC_SLIDE, MW_IC_BITS, MW_IC_DRIVE, MW_IC_STAR, MW_IC_DROP,
    MW_IC_BAND, MW_IC_TYPE, MW_IC_ENV, MW_IC_RECT, MW_IC_SYNC, MW_IC_MOD, MW_IC_SKEW, MW_IC_TILT, MW_IC_T128,
    MW_IC_SWITCH, MW_IC_VBAR, MW_IC_FOLD, MW_IC_TYPE8, MW_IC_SHIFT, MW_IC_BLEND
};

struct mw_fx_control { char label[6]; unsigned char icon, def, flags; };

struct mw_fx {
    unsigned short abi;         /* MW_FX_ABI */
    unsigned short id;          /* sdk/machines/analog-rytm-mkii/fx-ids.json: kept in kits, never reused, 1-63 */
    unsigned char slot;         /* the send: 0 */
    unsigned char flags;        /* MW_FX_24K, MW_FX_LIFT */
    unsigned short trim;        /* the return's level against the chorus's at one LEV, Q8 (256: the same) */
    unsigned work;              /* words of the work area it uses, at most MW_FX_WORK */
    const char *name;           /* the chooser's row and the page's title */
    struct mw_fx_control c[8];  /* A-D on the top row, E-H below */
    /* A clean state: when it is chosen, after two seconds with nothing sent, and at a project load. The work area
     * is cleared by the base, a step a block, before render first runs. */
    void (*reset)(int *work);
    /* One block of the audio interrupt: x the send (16 samples at 24 kHz, else 32; within +-2^16), l and r the
     * return, par A-H as they play (a lock, else the knob). Keep it short: no call that can block. */
    void (*render)(const int *x, int *l, int *r, const unsigned char *par, int *work);
    /* Optional: a control's value as text (a word such as "OFF"), or 0 for the number. */
    const char *(*text)(int k, int v);
};

/* What the base lends every effect. */
extern const unsigned mw_fx_rate[128];          /* an LFO's phase step a frame at 48 kHz, 0.02-10 Hz */
extern const unsigned short mw_fx_onepole[128]; /* a one-pole's coefficient at 48 kHz, Q15, 20 Hz-20 kHz */
int mw_fx_tempo(void);                          /* the tempo, 1/120 BPM (120 BPM when stock's word is not set) */

#endif
