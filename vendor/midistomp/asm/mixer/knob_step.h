/* Knob turns speed up when turned fast, exactly as the stock effect parameters: knob_step() (pages.c) is
 * the C port of the stock step 0xC00ABE58 (called at 0xC00AC12C), with its tick source, its last-turn
 * time (B14[37]) and its gate (the same knob as the key loop's previous event, 0xC009D024).
 * Callers: pages.c pages_key (node knob pages), perform_engine.c perf_turn (Perform knobs). */
#ifndef KNOB_STEP_H
#define KNOB_STEP_H

#ifndef KS_TICKS                /* the host test (tests/test_knob_step.py) brings its own */
#define KS_TICKS() ((int (*)(void))0xC00DEE20)()          /* stock getTicks */
#define KS_DIV(a, b) ((int (*)(int, int))0xC00DB5A0)(a, b)  /* stock signed divide (no RTS here) */
#define KS_LAST (*(volatile int *)0xC009D024)              /* the key loop's previous event */
#define KS_TIME (*(volatile int *)(0xC00EF748 + 37 * 4))  /* B14[37]: the last accelerated turn */
#endif

int knob_step(int ev, int steps, int range);    /* turn event 160-162, detents, max - min -> steps */
#endif
