/* SPDX-License-Identifier: GPL-3.0-or-later */
#ifndef MODWERK_CONTROLLER_BOARD_H
#define MODWERK_CONTROLLER_BOARD_H
#include "controller_transport.h"
#include "controller_write_lease.h"

/* The Octatrack board's controller providers (controller_transport.h) and the
 * lifecycle of the resident Sidechain (1) and Output Matrix (2) engines.
 * Authority is the exact compiled trust rows (controller_write_policy.c) and
 * the loader's own owner ledger: a live module whose encoded package, module
 * id and image match a row is that controller. Empty rows (the default) make
 * every package an ordinary one and drive nothing. Analog BD (4) is bound the
 * same way on both cores; its engine and its reset's words are its package's
 * (ABI 10), which the trust row does not pin: a row pins the controller digest.
 *
 * Install: the package's CF sites publish as for any module; the tick then
 * reserves and binds its exact owner generation, resets the feature's DSP
 * state on every required core, enables its dormant hooks and publishes it
 * ACTIVE. Only PUBLISHING/ACTIVE bindings grant write leases, so the module's
 * leased entries replay stock until then. An image headed by an MWPP record
 * extends a stock effect's page in place while ACTIVE (Sidechain's KEY page on
 * COMPRESSOR): applied over the exact stock bytes, restored before disable.
 * Removal/replacement: admission asks the tick to disable the hooks first and
 * refuses the CF switch (RUNTIME_BUSY, the host retries) until every required
 * core ACKed the disable; Matrix also refuses while MATRIX is selected, and a
 * retained UI root refuses as RUNTIME_IN_USE. A disabled generation whose
 * image stays published (removal abandoned, journal rollback) is restored
 * through a complete reset. Unknown DSP state quarantines: everything stays
 * held, nothing is retried, until reboot. */

/* ev_tick, sys task. Takes the stable lock; drives at most one job per core. */
void modwerk_controller_tick(void);
/* machine_admission_runtime.c, under the stable lock, PREPARE and SWITCH. */
int modwerk_controller_admit(const struct runtime_dsp *from, const struct runtime_dsp *to,
                             enum runtime_metadata_operation operation);
/* Features whose resident DSP ranges a registry slot holds (reserved through
 * retiring or quarantined): the buffer allocator's reservation. */
unsigned modwerk_controller_held(void);
/* A live reader whose key bus cannot come up this boot: dsp.c fails a self-test with it and, when the loader has no
 * refusal of its own, reports RUNTIME_FEATURE. */
int modwerk_controller_keybus_lost(void);
/* ev_tick: 1 while a trusted controller the bank's tracks use still brings its engine up (not yet bound, placed, reset
 * or enabled), so the boot restore's "MODULES LOADED" waits for it (modset.c). 0 once each is running, or can't be this
 * boot: no room for its engine, its engine or a core stuck, the slot quarantined, the board closed. */
int modwerk_controller_settling(void);
#endif
