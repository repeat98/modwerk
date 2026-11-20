/* SPDX-License-Identifier: MIT */
#ifndef PSL_UI_H
#define PSL_UI_H
#include "engine.h"
#include "modwerk_events.h"
/* Native services called only in the UI task. No callback/label is published
 * into stock UI storage: it keeps its original four Part Edit rows. */
int psl_native_source(struct psl_source *);
int psl_native_context(uint32_t bank, unsigned pattern, unsigned part);
int psl_native_popup(void);
void psl_native_redraw(void);
int psl_native_commit(struct psl_plan *);
/* 0 stopped, 1 playing/independent tracks, 2 recorder active. */
unsigned psl_native_transport(void);
void psl_ui_start(unsigned which); /* 0 Lock, 1 Clear */
extern struct modwerk_part_menu psl_part_menu; /* contributed to ot_part_menu */
unsigned psl_ui_phase(void);
void psl_native_text(unsigned char *,unsigned,unsigned,const char *);
#endif
