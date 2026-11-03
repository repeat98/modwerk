/* SPDX-License-Identifier: GPL-3.0-or-later */
#ifndef MODWERK_RESIDENT_ENGINES_H
#define MODWERK_RESIDENT_ENGINES_H
#include <stdint.h>

/* Resident controller engines on demand (docs/OCTATRACK_RESIDENT_ENGINES_ON_DEMAND.md). Only a base built with
 * --resident-on-demand compiles this unit (MODWERK_RESIDENT_ON_DEMAND). Each on-demand engine (Sidechain 1, Output
 * Matrix 2, Analog BD 4, the key bus 8: a base feature, docs/OCTATRACK_PACKAGE_DSP_HOOKS.md) is a relocatable unit (resident_dsp.engine_unit) the build stores per core. While a
 * controller generation holds its feature, the unit is relocated on the UI task into a per-core buffer, uploaded
 * at the top of that core's arena with an owned WRITE (every chunk read back on the DSP), then PLACEd (op 10,
 * word 7 = 1) so the receiver's base word names it. Only then may the board RESET and ENABLE the feature. When no
 * slot of the feature is held, it is unplaced (PLACE offset 0) and its span goes back to the FX allocator.
 *
 * Nothing here runs on the frame path, at a Part switch, pattern or bank change, Part reload or project load:
 * the board calls it from its own tick, and a placement or unplacement starts only while the sequencer is
 * stopped with no pattern change queued (modwerk_machine_stopped and the queued bank/pattern bytes).
 *
 * Live FX code where an engine goes (the FX allocator puts code of a quarter of the arena or more at its top) is first
 * moved below the region by the manager's evacuation, a transaction of its own as dl_move's: new copies uploaded while
 * the old ones run, each dispatch entry rebound at a frame, then the old copies freed and the capacity lowered together.
 * It starts only from that claim, while stopped, two seconds after the last key, with no pattern queued, no pick
 * waiting and the manager idle; a failed step puts every entry back on its old copy and closes that core to it. */

/* One engine: its words at base 0; each relocation an index, | 0x8000 for a displacement to a fixed address (value -
 * base), else an address (value + base). Indices strictly increase. count 0: this core does not carry the feature.
 * `exit`, 0 or the word holding a long branch's displacement that relocation points at the stock P address
 * `exit_target` (its site's exit on this core, dsp_ledger.h). The base's engines are build data
 * (resident-engines-data.c); a packaged feature's (MW_DSP_PACKAGED) are its bound controller's package's (ABI 10),
 * given per generation by the board (mw_engines_package). */
struct mw_engine_unit {
    const uint32_t *words;
    const uint16_t *relocations;
    uint16_t count, relocation_count, exit, exit_target;
};
#define MW_ENGINE_FEATURES 4u                                /* feature indices: 1, 2, 4, 8 */
#define MW_ENGINE_PACKAGED_WORDS 2048u                       /* the largest engine a package may bring */
extern const struct mw_engine_unit mw_engine_units[2][MW_ENGINE_FEATURES];  /* [core][feature index]; packaged: none */
extern uint32_t *const mw_engine_buffer[2];                /* per core, sized to its largest unit (packaged ones too) */

enum mw_engine_state { MW_ENGINE_FREE, MW_ENGINE_CLAIMED, MW_ENGINE_WRITING, MW_ENGINE_WRITTEN, MW_ENGINE_PLACING,
                       MW_ENGINE_PLACED, MW_ENGINE_UNPLACING, MW_ENGINE_STUCK };
/* offset: from DL_CODE_START; count: the words of its span (the unit it holds); generation: the controller generation
 * that claimed it (a packaged feature's engine is that generation's package's). */
struct mw_engine { uint16_t offset, count; uint8_t state, pad[3]; uint32_t generation; };
extern struct mw_engine mw_engines[2][MW_ENGINE_FEATURES];
/* Diagnostics, never an ABI: owned jobs started, placements and unplacements acknowledged, claims refused. */
extern volatile uint32_t mw_engines_jobs, mw_engines_placed_count, mw_engines_unplaced_count, mw_engines_refused;

/* Why a placement waits (diagnostics, never an ABI): per core and feature index, as mw_engines_place last left it. */
enum { MW_WAIT_NONE, MW_WAIT_LANE, MW_WAIT_BOARD, MW_WAIT_PLAYING, MW_WAIT_ROOM, MW_WAIT_CLAIM_BUSY, MW_WAIT_CLAIM_REFUSED,
       MW_WAIT_TRANSPORT, MW_WAIT_STUCK, MW_WAIT_EVACUATION };
extern volatile uint8_t mw_engines_wait[2][MW_ENGINE_FEATURES];
/* The last admission verdict per feature index: 0 none yet, else 1 + MW_ENGINE_FITS/MEMORY/STUCK_BOOT. */
extern volatile uint8_t mw_engines_admitted[MW_ENGINE_FEATURES];

/* Relocate a unit for absolute P address `base` into out[0..count). Linear in words plus relocations. */
void mw_engine_relocate(const struct mw_engine_unit *, uint32_t base, uint32_t *out);

/* The board's seams (controller_board.c), all under the stable lock on the board's tick. */
/* Drain this module's owned jobs: call once per board tick before anything else starts a job. */
void mw_engines_poll(void);
/* Every core in `cores` has `feature`'s engine placed and its PLACE acknowledged. */
int mw_engines_ready(unsigned feature, unsigned cores);
/* A packaged feature's engine for controller `generation`: per core, its unit (count 0 on a core it does not run on).
 * The words stay the package's (its pool extent) while the generation is held; a placed engine of another generation
 * is unplaced first, while that core is known dormant, then this one is written and placed. */
void mw_engines_package(unsigned feature, uint32_t generation, const struct mw_engine_unit units[2]);
/* Every feature the board wants placed now (held controllers, what they imply, the key bus for its readers). A claim
 * reserves room for each wanted engine not yet placed on that core as well, so engines wanted together (Sidechain and
 * the key bus) take their region in one claim and live FX code there moves once, in one evacuation. */
void mw_engines_want(unsigned features);
/* Drive placement of `feature` on `cores` for a controller generation: 1 placed everywhere, 0 not yet (a job in
 * flight, a pattern change queued, the manager busy, an evacuation or trim running or waiting, no room), -1 never this
 * boot (an uncertain PLACE). A core whose `busy` entry is set (the board's own job holds it) is left alone. It places
 * while the sequencer plays when the engine fits in free words. Live FX code in the region is moved below it first
 * (the manager's evacuation), and cached code retired (a trim), only while QUIET, two seconds after the last key and
 * with no pick waiting. */
int mw_engines_place(unsigned feature, unsigned cores, uint32_t generation, const uint8_t busy[2],
                     const uint8_t mask[2], unsigned known);
/* Admission's dry run for an incoming controller of `feature`; `wanted`: every feature held, live or incoming.
 * MW_ENGINE_FITS: placed, fits (live FX code in the region included, when it can move below it), or the manager is
 * busy (the claim then waits on the tick); MW_ENGINE_MEMORY: live FX code where the engines go cannot move below them
 * (no place, or an evacuation failed on that core this boot), or the bank's Part union would no longer fit under them
 * (the board answers RUNTIME_MEMORY); MW_ENGINE_STUCK_BOOT: the engine is stuck for this boot (RUNTIME_CONFLICT). */
enum { MW_ENGINE_FITS, MW_ENGINE_MEMORY, MW_ENGINE_STUCK_BOOT };
/* `wanted` with what it implies (Sidechain: the key bus); `words`, a packaged feature's incoming engine's size (its
 * package's), else 0. */
int mw_engines_admit(unsigned feature, unsigned wanted, unsigned words);
/* ABI 9: the base features this base provides to packages (loader.h): the key bus. */
unsigned modwerk_machine_dsp_features(void);
/* The unit may give an unused engine back (the board parks its controller): stopped, no pattern change queued, two
 * seconds after the last key or knob and no pick waiting, as an evacuation waits. */
int mw_engines_settled(void);
/* Unplace and free every engine no held slot names: only when its feature is known dormant on that core (`mask`,
 * bit c of `known`), the core is free (`busy`) and the sequencer is quiet. */
void mw_engines_collect(unsigned held, const uint8_t mask[2], unsigned known, const uint8_t busy[2]);

#ifdef MODWERK_DEV
/* Development bases only: one fixed block in initialized data (inside the dev MEM window), refreshed on every board
 * tick. Big-endian, as the ColdFire stores it; byte offsets in comments. */
struct mw_engines_view {
    uint8_t magic[4];                 /* 0: "MWEV" */
    uint8_t state[2][4], wait[2][4];  /* 4, 12: per core, feature index (Sidechain, Output Matrix, Analog BD, key bus) */
    uint16_t offset[2][4];            /* 20: arena offset of the engine (from DL_CODE_START) */
    uint16_t arena[2], reserved[2];   /* 36, 40: the FX arena now and the words reserved for engines, per core */
    uint8_t admitted[4], claim_why[2], held;   /* 44, 48, 50: verdicts, dl_engine_why, held features (8: the key bus) */
    uint8_t evacuation, evacuations;           /* 51: dl_engine_evacuation(); 52: done (low nibble) | failed << 4, mod 16 */
    uint8_t keybus, keybus_reset[2];           /* 53: key bus wanted | lane op core 0 << 1 | core 1 << 4 (1 reset, 2 enable,
                                                * 3 disable, 4 stuck, 5 scrub) | 128 cannot come up this boot; 54: reset words / 8 */
    uint32_t jobs, placed, unplaced, refused; /* 56 */
    struct { uint32_t module, generation; uint8_t state, feature, enable_acks, disable_acks;
             uint16_t acknowledged[2], reset[2]; } slots[6]; /* 72, 20 bytes each: the controller registry */
};
typedef char mw_engines_view_is_192_bytes[(sizeof(struct mw_engines_view) == 192) ? 1 : -1];
extern struct mw_engines_view mw_engines_view;
#endif

/* The manager's seams (resident_engines.py's manager transform). Reserve: words taken from the top of the arena.
 * commit 0: a dry run (admission); 1: take it, but any live FX code in the region waits; 2: take it, moving that code
 * below it first (an evacuation: the claim answers 0 until it is done). */
int dl_engine_claim(unsigned core, unsigned reserve, int commit); /* 1 fits (and taken when commit), 0 not now, -1 no */
void dl_engine_release(unsigned core, unsigned reserve);           /* only ever lowers the reserve */
unsigned dl_engine_reserved(unsigned core);
/* Why the last claim on each core answered as it did: 0 fits, 1 manager busy, 2 live FX code in the region with no place
 * below it, 3 the bank's Part union would not fit, 4 the dry run was inconclusive, 5 more than the arena, 6 an evacuation
 * started or runs, 7 an evacuation waits (a key in the last two seconds, a pick waiting), 8 an evacuation failed on this
 * core this boot (live code in the region stays). */
extern volatile uint8_t dl_engine_why[2];
/* The evacuation (diagnostics, never an ABI): step (1 upload, 2 bind, 3 rebinding the old copies) | core << 2 | the cores
 * closed to it << 4; evacuations done, packages moved, evacuations failed. */
unsigned dl_engine_evacuation(void);
extern volatile uint32_t dl_engine_evacuations, dl_engine_moves, dl_engine_evac_failures;
#endif
