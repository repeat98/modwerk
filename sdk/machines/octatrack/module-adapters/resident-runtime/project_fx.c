/* SPDX-License-Identifier: GPL-3.0-or-later
 * Give the incoming Part its code space before starting the optional Sidechain engine.
 * All calls run on the UI task. Only the completed-load serial is published by the project reader. */
#include "allocator.h"
#include "resident_engines.h"

extern volatile uint32_t modwerk_project_loaded;
extern const uint16_t modwerk_dsp_arena[2];
extern struct dl_package dl_catalog[DL_PACKAGES];
extern uint8_t modwerk_keybus_readers;
int modwerk_fxmap_loading(void);
int modwerk_upload_settled(void);
int modwerk_machine_stopped(void);
int modwerk_dsp_bank_names(unsigned id);
unsigned modwerk_controller_held(void);
unsigned modwerk_dsp_arena_now(unsigned core);

static uint32_t project;
static unsigned waiting, hold, notice;
static int checked;
enum { SIDECHAIN = MW_DSP_INDEX(MW_DSP_SIDECHAIN), KEYBUS = MW_DSP_INDEX(MW_DSP_KEYBUS) };

int mw_project_sidechain_used(unsigned compressor)
{
    return !hold && modwerk_dsp_bank_names(compressor);
}

/* The FX code lives below the lowest engine on a core. Keep the key bus if another reader needs it. */
static unsigned available_without_sidechain(unsigned core)
{
    unsigned low = modwerk_dsp_arena[core];
    for (unsigned k = 0; k < MW_ENGINE_FEATURES; ++k) {
        const struct mw_engine *engine = &mw_engines[core][k];
        if (k == SIDECHAIN || (k == KEYBUS && !modwerk_keybus_readers)) continue;
        if (engine->state != MW_ENGINE_FREE && engine->offset < low) low = engine->offset;
    }
    return low;
}

int mw_project_fx_wait(const uint8_t ids[16])
{
    uint32_t loaded = modwerk_project_loaded;
    if (checked && project == loaded && !waiting) {
        hold = 0; /* first idle observer tick after the stock transaction */
        return 0;
    }
    if (!checked || project != loaded) {
        project = loaded;
        checked = 1;
        waiting = hold = notice = 0;
    }
    if (!modwerk_machine_stopped()) {
        waiting = hold = notice = 0;
        return 0;
    }
    unsigned words[2] = {0, 0};
    fx_set seen[2] = {{{0}}, {{0}}};
    for (unsigned i = 0; i < 16u; ++i) {
        unsigned id = ids[i], core = (i & 7u) < 4u ? 1u : 0u;
        if (id >= DL_PACKAGES || dl_catalog[id].resident || fx_in(seen[core], id)) continue;
        seen[core] = fx_with(seen[core], id);
        words[core] += dl_catalog[id].words;
    }
    unsigned needs_room = 0, optional_wont_fit = 0;
    for (unsigned c = 0; c < 2u; ++c) {
        unsigned room = available_without_sidechain(c);
        if (words[c] > room) { /* even after parking: the ordinary allocator reports the limit */
            waiting = hold = notice = 0;
            return 0;
        }
        unsigned extra = mw_engine_units[c][SIDECHAIN].count;
        if (!modwerk_keybus_readers) extra += mw_engine_units[c][KEYBUS].count;
        if (words[c] + extra > room) optional_wont_fit = 1;
        if (dl_engine_reserved(c) && words[c] > modwerk_dsp_arena_now(c)) needs_room = 1;
    }
    if (optional_wont_fit && modwerk_dsp_bank_names(24u)) notice = 1;
    if (needs_room && (modwerk_controller_held() & MW_DSP_SIDECHAIN)) {
        /* A busy page or an uncertain disable may keep a reservation. Give the usual
         * allocation a turn in that case, or immediately if transport starts. */
        if (++waiting <= 600u) { hold = 1; return -1; }
        waiting = hold = notice = 0;
        return 0;
    }
    if (waiting) { waiting = 0; return 1; } /* keep hold until the transaction ends */
    return 0;
}

/* The board found no room for Sidechain's engines when a track of the bank took COMPRESSOR (controller_board.c): the
 * same notice, else COMPRESSOR shows its stock page with no word why (#2189). Kept until it shows or Sidechain starts. */
static unsigned refused;
void mw_project_sidechain_refused(void) { refused = 1; }

int mw_project_sidechain_notice(void)
{
    if (refused) {
        if (mw_engines_admitted[SIDECHAIN] != 1u + MW_ENGINE_MEMORY) refused = 0; /* room after all */
        else if (!hold && !modwerk_fxmap_loading() && (modwerk_controller_held() & MW_DSP_SIDECHAIN) &&
                 modwerk_dsp_bank_names(24u)) {
            refused = notice = 0;
            return 1;
        }
    }
    if (!notice || hold || modwerk_fxmap_loading() || project != modwerk_project_loaded) return 0;
    if (!(modwerk_controller_held() & MW_DSP_SIDECHAIN) || !modwerk_dsp_bank_names(24u) ||
        mw_engines_admitted[SIDECHAIN] != 1u + MW_ENGINE_MEMORY) return 0;
    notice = 0;
    return 1;
}

/* A stopped project can fit but have one retained stock effect splitting its last free span.
 * Try both arena ends on a private copy of the ledger. The live ledger changes only when
 * the complete target fits and its ordinary move transaction accepts a disjoint new copy. */
int mw_project_fx_move(struct dl_allocator *allocator, const uint8_t ids[16], uint32_t token)
{
    if (!hold || project != modwerk_project_loaded || modwerk_fxmap_loading() ||
        !mw_engines_settled() || !modwerk_upload_settled()) return 0;

    static struct dl_allocator preview; /* UI task only, outside the ColdFire task stack */
    fx_set seen[2] = {{{0}}, {{0}}};
    for (unsigned i = 0; i < 16u; ++i) {
        unsigned id = ids[i], core = (i & 7u) < 4u ? 1u : 0u;
        if (id >= 32u || fx_in(modwerk_fx_modules, id) || fx_in(seen[core], id)) continue;
        seen[core] = fx_with(seen[core], id);
        const struct dl_placement *live = &allocator->live[core][id];
        unsigned cap = allocator->capacity[core], align = dl_catalog[id].alignment;
        if (!live->present || !align || live->words > cap) continue;
        unsigned ends[2] = {0, (cap - live->words) & ~(align - 1u)};
        for (unsigned end = 0; end < 2u; ++end) {
            unsigned to = ends[end];
            if (to < (unsigned)live->offset + live->words && to + live->words > live->offset) continue;
            preview = *allocator;
            preview.live[core][id].offset = (uint16_t)to;
            if (dl_allocator_prepare(&preview, ids, token) == DL_ALLOC_OK &&
                dl_allocator_move(allocator, core, id, to, token) == DL_ALLOC_OK) return 1;
        }
    }
    return 0;
}
