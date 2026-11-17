/* Perform mode: shared by perform_engine.c (grid, moves, targets, LED, audio
 * block), perform_keys.c (gestures, play and setup keys), perform_draw.c
 * (screen 11 pixels) and perform_store.c (record 50 table).
 * Design: docs/dev/v2.0-brief.md Phase 3, docs/dev/perform-ui-mockup.html (v14),
 * docs/dev/perform-mode-p0.md (decisions), docs/dev/perform-mode-plan.md (build plan).
 * Build: TI cl6x, C6740 EABI, far data, no RTS, never touch B14
 * (scripts/build_mixer_ui.py links it with the mixer C). */
#ifndef PERFORM_H
#define PERFORM_H

/* ---- Controls and gestures -------------------------------------------- */
#define C_K1 0                  /* knobs 1-3: turn, press, hold */
#define C_K2 1
#define C_K3 2
#define C_LEFT 3                /* cursor ◄ ▼ ►: press, hold (▲ always leaves) */
#define C_DOWN 4
#define C_RIGHT 5
#define C_FTSW 6                /* footswitch: press, hold (no double: the looper keeps its own) */
#define NCTL 7

#define G_TURN 0
#define G_PRESS 1
#define G_HOLD 2

/* Moves of one control, in storage order. Knob: TURN_F, PRESS_A, PRESS_F,
 * HOLD_A, HOLD_R, HOLD_F (6). Button and footswitch: the last 5 (no turn). */
#define M_TURN_F 0
#define M_PRESS_A 1
#define M_PRESS_F 2
#define M_HOLD_A 3
#define M_HOLD_R 4
#define M_HOLD_F 5
#define NMOVE_CTL 6

/* LOOPER menu rows (only in a patch with GRDLOOP): one target and one action each. */
#define L_REC_START 0
#define L_REC_END 1
#define L_PLAY 2
#define L_STOP 3
#define L_DELETE 4
#define L_LOOP_START 5          /* each pass */
#define NLOOP 6

/* ---- Targets: one byte ------------------------------------------------- *
 * 0-127   a MIDI CC as the midi-cc chart and the mixer CCs 85-101 read it,
 *         so a target moves exactly as that CC from MIDI would.
 * 0x80+s  FX(s+1) Ftsw: the looper's footswitch in slot s (writes its press
 *         counter, services word 11).
 * 0xFF    no target. */
#define T_NONE 0xFF
#define T_FTSW 0x80
#define IS_FTSW(t) (((t) & 0xF8) == T_FTSW)

/* ---- A move: four bytes ---------------------------------------------- *
 * bits 0-15  VALUE in the target's own units (an effect knob's own steps, a mixer level)
 * bits 16-20 NEXT 0-10 (table below), 31 = unused move (VALUE "-")
 * bits 21-24 LAG 0-15 (table below) */
#define MV_VALUE(m) ((m) & 0xFFFF)
#define MV_NEXT(m) ((m) >> 16 & 31)
#define MV_LAG(m) ((m) >> 21 & 15)
#define MV(v, n, l) ((unsigned)((v) | (n) << 16 | (l) << 21))
#define MV_UNUSED MV(0, NX_UNUSED, 0)

/* NEXT: 0 NOW; 1-4 = 1,2,4,8 BEAT; 5-10 = 1,2,4,8,16,32 BAR (v2.0 saved 11-16 = CYC: now 32 BAR).
 * Action / Release: the next line of that grid, counted from bar 1.
 * Follow: exactly that long after its Action / Release landed (Turn: the next line).
 * No clock running: the grid runs at the pedal tempo from bar 1 (entering Perform,
 * then the first footswitch press). */
#define NX_NOW 0
#define NX_BEAT 1
#define NX_BAR 5
#define NX_N 11
#define NX_UNUSED 31

/* LAG: 0 OFF, 1 MICRO, 2-4 = 50/100/500 ms, 5 = 1 s, 6-9 = 1,2,4,8 BEAT,
 * 10-15 = 1,2,4,8,16,32 BAR. Beats and bars follow tempo changes. */
#define LG_OFF 0
#define LG_MICRO 1
#define LG_N 16

/* ---- One patch's table: PT_SIZE bytes in record 50 --------------------- */
typedef struct {
    unsigned char cycle;                    /* CYCLE in bars 1-32, 0 = none (looper's own knob) */
    unsigned char target[NCTL];             /* T_* */
    unsigned char loop_target[NLOOP];
    unsigned char loop_on;                  /* LOOPER menu: 1 = the loop events fire (byte 15, the alignment gap, is perform_store's PT_OK) */
    unsigned move[NCTL][NMOVE_CTL];         /* [ctl][M_*]; buttons/footswitch leave M_TURN_F unused */
    unsigned loop_move[NLOOP];
} PerfPatch;                                /* 1 + 7 + 6 + 1 + 1 pad + 168 + 24 = 208 */
#define PT_SIZE 208

/* ---- Runtime (perform_engine.c owns it) -------------------------------- */
#define NSLOT 16                /* moves at once: a lag running or a move waiting */

typedef struct {
    int beat;                   /* beats since bar 1 (4/4), -1 = no grid yet */
    int frac;                   /* position in the beat, 0..65535 */
    int running;                /* MIDI clock running or pedal tempo grid */
    int bpm_x10;                /* tempo, for lags in beats and bars and the blink */
} PerfGrid;

extern PerfPatch perf_patch;    /* the patch played */
extern PerfGrid perf_grid;
extern volatile int perf_on;    /* 1 while screen 11 shows PERFORM (play), 2 SETUP, 0 out */
extern volatile int perf_led;   /* the play screen's blink for the LED, -1 = the looper's level */

/* Engine API (audio block and 16 ms poll). */
void perf_block(void);                        /* top of engine_run: grid, due moves, lags, LED */
void perf_gesture(int ctl, int gesture, int phase); /* phase 0 press/turn, 1 release (hold) */
void perf_momentary(int ctl, int phase);       /* HOLD FOR MOMENTARY: 0 hold seen, 1 release */
void perf_turn(int ctl, int steps);           /* knob turn: moves the target now, schedules TURN_F */
void perf_loop_event(int ev);                 /* L_*: from the looper's state words */
void perf_reset(void);                        /* MIDI Start/Stop, patch change: cancel all */
int perf_native(int target);                  /* live value in the target's own range, -1 none */
int perf_pending(int ctl);                    /* grid units (1/8 beat) to its next waiting move, -1 none (blink) */

/* Storage (perform_store.c): the patch's entry in record 50, keyed like the mixer table. */
void perf_load(int patch);                    /* -> perf_patch (defaults when none) */
int perf_save(int patch);                     /* 1 when record 50 changed */

/* Screen 11 (perform_keys.c / perform_draw.c). */
void perf_key(int ev, int steps);
void perf_draw(void);
void perf_poll(void);                         /* 16 ms: gesture timers, blink, redraw */

#endif
