#ifndef FRACT_MACHINE_RENDER_H
#define FRACT_MACHINE_RENDER_H
#include "machine.h"

/* SRC layout: main POS SIZE REVS SPRD SPCE SHPE;
 * setup PAN in A, SRNG in C, four unused slots. SCAN=64 and DENS=127
 * are fixed, including when legacy unused bytes contain other values.
 * Main values are read from
 * published words, setup from published bytes. Native pitch is fixed neutral.
 * The registry invokes this callback; it has no fetch-site detour. */
int og_machine_render(unsigned track, unsigned ping, unsigned start, unsigned end);
/* Base-dispatched through the separate experimental ot_machine_starts record. */
int og_machine_start(unsigned track, unsigned sample, unsigned flags);
#endif
