/* SPDX-License-Identifier: MIT
 * Admission of packages that contribute a machine to the base's ot_machines table (hooks.json): independent
 * modules, no group. Board glue, called from modwerk_machine_metadata_admit with the stable machine lock held.
 *
 * A machine leaves when the outgoing package contributes it and the incoming one contributes no machine with its
 * signature. Before its image can retire: (1) no reviewed stock UI root names its image (machine_ui_lifetime), and
 * (2) no Part copy keeps a track of it, unless the base has a retirement for its signature, which converts those
 * tracks: PREPARE asks its check (CLEAR or PLANNED admits), SWITCH its retire (only CLEAR retires). A machine
 * without one is refused while any Part copy holds its signature. Anything unknown refuses. */
#include "machine_contributors.h"
#include "machine_lifetime.h"
#include "machine_parts.h"
#if RUNTIME_SITE_EVENTS
#include "modwerk_hooks.h"
#endif
#define RECORD 80u
#ifndef MW_IMAGE_ADDRESS /* test_machine_contributors.c maps its host images onto unit addresses */
#define MW_IMAGE_ADDRESS(p) ((uint32_t)(uintptr_t)(p))
#endif

/* Retirements the base carries, by signature. Analog BD's converts its tracks to FLEX in every known Part copy
 * (analog-bd-parts/analog_bd_part_board.c); a base without it keeps these defaults (-1: no retirement), so a leaving
 * Analog BD is refused while a Part holds it, as any machine. */
int mw_ab_board_check(void), mw_ab_board_retire(void);
#ifndef MW_NO_DEFAULTS
__attribute__((weak)) int mw_ab_board_check(void) { return -1; }
__attribute__((weak)) int mw_ab_board_retire(void) { return -1; }
#endif
static const struct machine_retirement retirements[] = {
    {{'A', 'B'}, 1, 1, mw_ab_board_check, mw_ab_board_retire},
};

const uint8_t *machine_contribution(const struct runtime_dsp *d)
{
#if RUNTIME_SITE_EVENTS
    if (!d || !d->present || !d->image) return 0;
    uint32_t at = d->hook_offset[MODWERK_OT_MACHINES];
    if (at == RUNTIME_NONE || at > d->image_bytes || d->image_bytes - at < RECORD) return 0;
    return d->image + at;
#else
    (void)d; return 0;
#endif
}
static int same_machine(const uint8_t *a, const uint8_t *b) { return a && b && a[4] == b[4] && a[5] == b[5]; }
const struct machine_retirement *machine_retirement(const uint8_t *record)
{
    for (unsigned i = 0; record && i < sizeof retirements / sizeof *retirements; ++i)
        if (record[4] == retirements[i].sig[0] && record[5] == retirements[i].sig[1] && record[6] >= retirements[i].lo &&
            record[7] <= retirements[i].hi && retirements[i].check() >= 0) return &retirements[i];
    return 0;
}
struct reader { machine_memory_read read; void *context; };
static int part_read(void *opaque, uint32_t at, uint8_t *out, unsigned n)
{ struct reader *r = opaque; return r->read(r->context, at, out, n); }
int machine_contributor_admission(const struct runtime_dsp *from, struct runtime_dsp *to, machine_memory_read read, void *context,
                                  uint32_t bank, unsigned operation)
{
    const uint8_t *old = machine_contribution(from), *next = machine_contribution(to);
    if (old && !same_machine(old, next)) {
        if (from->image_bytes && machine_ui_lifetime(read, context, MW_IMAGE_ADDRESS(from->image),
                                                     MW_IMAGE_ADDRESS(from->image) + from->image_bytes) != MACHINE_CLEAR)
            return RUNTIME_IN_USE;
        const struct machine_retirement *r = machine_retirement(old);
        if (r) {
            int result = operation == RUNTIME_METADATA_SWITCH ? r->retire() : r->check();
            if (result != MACHINE_RETIRE_CLEAR && !(operation != RUNTIME_METADATA_SWITCH && result == MACHINE_RETIRE_PLANNED))
                return RUNTIME_IN_USE;
        } else {
            struct reader reader = {read, context};
            if (machine_part_signature(part_read, &reader, bank, old + 4, old[6], old[7]) != MACHINE_PART_CLEAR) return RUNTIME_IN_USE;
        }
    }
    /* Stock UI roots may name a contributed machine's code or data (its pages, drawers, browser handlers). */
    if (to && to->present && next) to->foreign_roots = 1;
    return RUNTIME_OK;
}
