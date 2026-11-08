/* Perform screen 11 without its keys and pixels (perform_keys.c, perform_draw.c
 * missing or --stub): ▲ leaves, nothing drawn. scripts/build_mixer_ui.py */
#include "perform.h"

extern void perf_leave(void);

void perf_key(int ev, int steps) { if (ev == 68) perf_leave(); (void)steps; }
void perf_draw(void) { }
void perf_poll(void) { }
