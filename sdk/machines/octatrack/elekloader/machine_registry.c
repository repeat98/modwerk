/* SPDX-License-Identifier: MIT
 * The base's machine registry: the reader of the ot_machines table (events.json). The
 * machine chooser, SRC SETUP, the page resolver, the Part validator, the UI tick, pool
 * navigation and the FLEX renderer ask the contributed machines (struct modwerk_machine),
 * in row order: chooser rows 5 on (SRC SETUP's own rows for a SETUP_PAGE machine). Adapted from POLY8's shared machine controller
 * (sdk/octabam/modules/poly8/shared-machine.c, MIT, Sam Banks / repeat98), whose fixed
 * POLY/AB/VECTOR/FM participants become contributions; each machine keeps its own signed
 * FLEX state, defaults, pages and engine. Also the reader of ot_sequencer_rows. */
#include <stdint.h>
#include "loader.h"
#include "modwerk_events.h"
#include "status.h" /* MODWERK_MACHINE_MAP and the machine map's calls */
#include "fxids.h"  /* the effect ids a project names (effect modules that rest) */
#ifndef MW_HOST /* test_machine_registry.c maps these onto a model of the unit's memory */
#define U8(a) (*(volatile uint8_t *)(uintptr_t)(a))
#define U32(a) (*(volatile uint32_t *)(uintptr_t)(a))
#define AT(a) ((volatile uint8_t *)(uintptr_t)(a))
#define ADDR(p) ((uint32_t)(uintptr_t)(p))
#define STOCK(type, a) ((type)(uintptr_t)(a))
#endif
#define BANK 0x46c82456u
#define PART_OFF 0x8ed80u
#define PART_STRIDE 6322u
#define SAVED_OFF 0x9504au                  /* the saved Parts, as dsp.c reads them */
#define SRAM_PART 0x100a4eceu
#define SIG 60u
#define FLEX_PAGE 0x400d31aeu
#define STATIC_PAGE 0x400d301cu
#define ROWS 13u                             /* five stock machines and up to eight contributed (ot_machines' room) */
typedef volatile uint8_t Part;
typedef struct modwerk_machine Machine;
#define MACHINES (MODWERK_OT_MACHINES - RUNTIME_EVENTS)
#define SEQUENCER (MODWERK_OT_SEQUENCER_ROWS - RUNTIME_EVENTS)
#define STARTS (MODWERK_OT_MACHINE_STARTS - RUNTIME_EVENTS)
#ifdef MODWERK_DEV
void modwerk_cost_stamp(unsigned k); /* diag.c: the development profile of the base's hooks */
#define MW_STAMP(k) modwerk_cost_stamp(k)
#else
#define MW_STAMP(k) ((void)0)
#endif

/* The rows' machines, read from the table masked so a switch is never seen half-way; the
 * pointers stay on the reader's stack, so the loader keeps their modules until it returns. */
static unsigned machines(const Machine **out)
{
    unsigned n = 0;
    uint32_t mask = modwerk_machine_mask();
    for (uintptr_t volatile *row = modwerk_runtime_event_row[MACHINES]; *row && n < ROWS - 5u; ++row) {
        const Machine *m = (const Machine *)*row;
        if (m->abi == MODWERK_MACHINE_ABI) out[n++] = m; /* another ABI is no machine: its tracks read as stock */
    }
    modwerk_machine_unmask(mask);
    return n;
}
const char *mw_src_names[ROWS];
uint32_t mw_pb_table[ROWS];
extern int mw_stock_validate(uint8_t *);
/* The DSP budget's source stage (dsp.c): a machine whose voice replaces its track's stock source is charged on that
 * track's core, under its descriptor's address (a machine module contributes one). A base without it keeps these
 * defaults: a priced machine is never admitted, nor its voice rendered. */
int modwerk_dsp_source_claim(unsigned track, uint32_t module, uint32_t voice, uint32_t engine, uint8_t kind);
void modwerk_dsp_source_release(unsigned track);
void modwerk_status_machine_refused(unsigned track, const char *label); /* status.c: the DSP FULL box for a machine */
void modwerk_dsp_source_engine_off(uint32_t module);
void modwerk_status_cpu_refused(unsigned track, const char *label, uint32_t booked, uint32_t add, uint32_t allowed); /* status.c: the CPU FULL box, per mille of a frame */
/* status.c: 1, with the CPU FULL box, when the frame share past this pick would reach the line; per mille of a frame */
int modwerk_status_pick_busy(unsigned slot, unsigned machine, const char *label, uint32_t add, uint32_t gone, uint32_t dsp);
int modwerk_status_module_cost(uint32_t module, uint32_t *use, uint32_t *wake); /* status.c: the site's measured costs */
void modwerk_status_cpu_entered(uint32_t mille); /* status.c: a machine took a track; the share shows it after four seconds played */
void modwerk_status_cpu_left(uint32_t mille);    /* status.c: a machine left a track */
#ifndef MW_HOST
__attribute__((weak)) int modwerk_dsp_source_claim(unsigned track, uint32_t module, uint32_t voice, uint32_t engine, uint8_t kind)
{ (void)track; (void)module; (void)voice; (void)engine; (void)kind; return RUNTIME_CYCLES; }
__attribute__((weak)) void modwerk_dsp_source_release(unsigned track) { (void)track; }
__attribute__((weak)) void modwerk_status_machine_refused(unsigned track, const char *label) { (void)track; (void)label; }
__attribute__((weak)) void modwerk_dsp_source_engine_off(uint32_t module) { (void)module; }
__attribute__((weak)) void modwerk_status_cpu_refused(unsigned track, const char *label, uint32_t booked, uint32_t add, uint32_t allowed)
{ (void)track; (void)label; (void)booked; (void)add; (void)allowed; }
__attribute__((weak)) int modwerk_status_pick_busy(unsigned slot, unsigned machine, const char *label, uint32_t add, uint32_t gone, uint32_t dsp)
{ (void)slot; (void)machine; (void)label; (void)add; (void)gone; (void)dsp; return 0; }
__attribute__((weak)) int modwerk_status_module_cost(uint32_t module, uint32_t *use, uint32_t *wake) { (void)module; (void)use; (void)wake; return 0; }
__attribute__((weak)) void modwerk_status_cpu_entered(uint32_t mille) { (void)mille; }
__attribute__((weak)) void modwerk_status_cpu_left(uint32_t mille) { (void)mille; }
#endif
/* Each track of the current Part: the priced machine its voice is charged to, or 0. A word each, so the render
 * reads it whole without a mask. */
static const Machine *volatile charged[8];
/* A refused START must also suppress the previous voice, until this owner's
 * next accepted START. Other owners and the stock fallback remain independent. */
static const Machine *volatile start_refused[8];
/* Tracks whose refusal the DSP FULL box already showed: charge() retries a refused track on every UI tick, and a box
 * that reopened each time it timed out would never go away. Cleared when the claim succeeds or the track stops asking. */
static uint8_t warned;
static uint32_t key(const Machine *m) { return (uint32_t)(uintptr_t)m; } /* dsp.c's module: the descriptor */
static unsigned charges(const Machine *m) { unsigned k = 0; for (unsigned t = 0; t < 8; ++t) k += charged[t] == m; return k; }
/* The track's voice is free; with no other track charged to its machine, so is the machine's engine. */
static void release(unsigned track)
{
    const Machine *old = charged[track];
    if (!old) return;
    charged[track] = 0; modwerk_dsp_source_release(track);
    if (!charges(old)) modwerk_dsp_source_engine_off(key(old));
}
/* dsp.c's make_way: a bank or project load needs the room this track's voice booked (#1542). The track renders the
 * stock silent source until charge() claims it again, with the DSP FULL box while it does not fit. */
void modwerk_machine_voice_shed(unsigned track);
void modwerk_machine_voice_shed(unsigned track) { if (track < 8u) release(track); }
/* Charge `who`'s voice on the track, replacing what was charged there; 0 when its core cannot carry it (nothing
 * changes). The machine the track was charged to keeps its engine only while another track still is. */
/* Its price per voice: its module's engine's when its package carries one (ABI 10: the header's cycles and kind,
 * outside the controller digest, so a new price ships in the package and never changes the base's trust row), else
 * its record's. A record priced in its engine keeps 0 there, and a per-core cost of its own (source_engine) is of the
 * engine's kind. 0 with no per-core cost: unpriced, never admitted. */
static int price(const Machine *who, uint32_t *voice, uint8_t *kind)
{
    struct runtime_owner o;
    *voice = who->source_voice, *kind = who->source_kind;
    if (modwerk_runtime_owner_at((uintptr_t)who, &o) == 1)
        for (unsigned i = 0; i < RUNTIME_MODULES; ++i) {
            const struct runtime_module *m = modwerk_runtime_module(i);
            if (!m || m->dsp.module != o.module || !m->dsp.engine_count) continue;
            if (who->source_voice || (who->source_engine && m->dsp.kind != who->source_kind)) return 0;
            *voice = m->dsp.cycles, *kind = m->dsp.kind;
            break;
        }
    return *voice || who->source_engine;
}
static int claim(unsigned track, const Machine *who)
{
    const Machine *old = charged[track];
    if (old == who) return 1;
    uint32_t voice; uint8_t kind;
    int refused = price(who, &voice, &kind) ? modwerk_dsp_source_claim(track, key(who), voice, who->source_engine, kind)
                                            : RUNTIME_MALFORMED;
    if (refused) {
        if (refused == RUNTIME_CYCLES && !(warned & 1u << track)) warned |= (uint8_t)(1u << track), modwerk_status_machine_refused(track, who->label);
        return 0;
    }
    warned &= (uint8_t)~(1u << track);
    charged[track] = who;
    if (old && !charges(old)) modwerk_dsp_source_engine_off(key(old));
    return 1;
}
extern void mw_stock_pool_open(void), mw_stock_list_draw(void);

static unsigned valid_bank(void) { uint32_t b = U32(BANK); return b >= 0x40000000u && b < 0x47f00000u; }
static Part *current_part(void) { return AT(U32(BANK) + PART_OFF + (U8(0x100b14cfu) & 3u) * PART_STRIDE); }
/* diag.c: each track's machine type byte and machine signature (two bytes), as they stand. Unlocked, as the frame
 * interrupt reads it too: a snapshot. 0xff and 0, 0 without a bank. */
void modwerk_track_machines(volatile uint8_t *out);
void modwerk_track_machines(volatile uint8_t *out)
{
    const Part *part = valid_bank() ? current_part() : 0;
    for (unsigned t = 0; t < 8u; ++t) {
        out[3u * t] = part ? part[0x22 + t] : 0xffu;
        out[3u * t + 1u] = part ? part[SIG + 30u * t] : 0u;
        out[3u * t + 2u] = part ? part[SIG + 30u * t + 1u] : 0u;
    }
}
/* Track t's machine: its row (5 on) and descriptor, or 0 for a stock track or an absent machine's signature. */
static unsigned owner(const Machine *const *m, unsigned n, const Part *part, unsigned t, const Machine **who)
{
    *who = 0;
    if (t >= 8 || part[0x22 + t] > 1) return 0;
    const Part *s = part + SIG + 30 * t;
    for (unsigned k = 0; k < n; ++k)
        if (s[0] == m[k]->sig[0] && s[1] == m[k]->sig[1] && s[2] >= m[k]->sig_lo && s[2] <= m[k]->sig_hi) { *who = m[k]; return 5u + k; }
    return 0;
}
/* The CPU budget. A machine that renders on the ColdFire takes its time from the frame interrupt, which the frame
 * guard below keeps under its share by dropping renders: a dropout nobody was told about. So a Part's machines are
 * admitted before they play, as the DSP budget admits effects: each track of a machine costs its descriptor's price
 * (percent of a frame; CPU_DEFAULT for a machine that names none, nothing for a DSP voice that names none), and a Part
 * carries mw_cpu_allowance of them: the guard's share less the interrupt at rest and a typical load of stock tracks.
 * Nothing is kept: the bill is the Part's tracks in order, added up again at each pick and each UI tick, so a track
 * that left makes room at once. A pick past the allowance is refused with the CPU FULL box; a track past it after a
 * project load, a Part change or a paste renders stock's silent source (cpu_refused) and says so once. The guard
 * stays for what a price cannot know: stock's own peaks and a machine dearer than it declared.
 * shortcut: CPU_DEFAULT and the allowance are estimates from the 24 October 2026 MKII runs (rest 23 %, POLY8 at its
 * cap about 45 %), to be set from `npm run device -- cpu` on a unit before a release. */
#define CPU_DEFAULT 12u
/* The prices bound a Part's renders at their worst. What else an installed set costs the frame interrupt (modules' hooks,
 * effects' ColdFire work, a DSP voice's glue) and what a machine costs in the frames between its worst ones no price
 * knows. So every module pick is also judged by the frame share the unit would play at with it (status.c,
 * modwerk_status_pick_busy, against mw_frame_line, its longest frame): a machine by what one track of it adds there, as the site measured
 * it (frame_cost below), else by its measured meter cost (reserved[1]) or its price, a machine's renders being frame
 * interrupt time either way. Admitted by the meter instead, SYNTIZ took a Part from 50.7 % to 65.2 % of the frame and the
 * guard dropped 24 renders in 8 s, three Analog BDs to 71.4 % and 61 (owner's MKII, base 0.8, 21 November 2026). */
/* A pick that wakes a resting module (below, "Machines that rest") is judged with its wake on top: what its hooks and
 * detours cost the frame again once awake, which the share cannot show before. The site's table names it for a module
 * it measured; this for the rest, the most of the 24 packages measured at rest on an MKII (20 November 2026, base
 * 0.7.10 twin, playing): POLY8 0.3.3, 2.3 points of the frame interrupt. Per mille of a frame. */
volatile uint32_t mw_wake_mille = 30u;
volatile uint32_t mw_cpu_allowance = 45u, mw_cpu_booked; /* percent of a frame; development bases may change the allowance */
volatile uint8_t mw_cpu_refused;    /* the current Part's tracks past the allowance: the frame interrupt reads it whole */
static uint8_t cpu_warned;          /* ... whose box already showed, as `warned` */
static unsigned cpu_price(const Machine *m) { return m->reserved[0] ? m->reserved[0] : m->source_kind ? 0u : CPU_DEFAULT; }
static unsigned meter_cost(const Machine *m) { return m->reserved[1] ? m->reserved[1] : cpu_price(m); }
/* What one more track of `who` adds to the longest frame, per mille of a frame: the site's measured `each`, and its
 * `first` extra on the Part's first track of it; a machine the table does not list, its measured meter cost or its
 * price, and mw_wake_mille (above) when its module wakes from resting. */
static uint32_t frame_cost(const Machine *who, int first, int waking)
{
    struct runtime_owner o; uint32_t each, extra;
    if (modwerk_runtime_owner_at((uintptr_t)who, &o) == 1 && modwerk_status_module_cost(o.module, &each, &extra))
        return each + (first ? extra : 0u);
    return 10u * meter_cost(who) + (waking ? mw_wake_mille : 0u);
}
/* Whether a track of `part` but `track` is `who`'s: a pick or an exit there is a further one, by its `each`. */
static int elsewhere(const Part *part, unsigned track, const Machine *who)
{
    const Machine *m[ROWS - 5u], *t_who; unsigned n = machines(m);
    for (unsigned t = 0; t < 8u; ++t) if (t != track && owner(m, n, part, t, &t_who) && t_who == who) return 1;
    return 0;
}
/* status.c's stock reserve: for the pattern that plays, and the one queued in the same bank, the most tracks that trig
 * on one step (`most`) and how many trig on any (`tracks`), 0 to 8 (each pattern's track record starts with its 64-step
 * trig mask, the last eight steps first, as Pattern Sample Locks reads it). Steps past a track's length count too: the
 * safe side. Owner, 22 November 2026: a pick is judged against the pattern that plays, not the bank's busiest; a later
 * switch to a busier one is the guard's, the ceiling's and the late-entry wait's. Their count, or 0 without a bank. */
#define PATTERN_STRIDE 0x8ed8u
#define PATTERN_TRACK 0x91au
#define PLAYING 0x800065bdu /* current bank and pattern, then the queued bank and pattern (OCTATRACK_DRIVING.md) */
unsigned modwerk_machine_pattern(void) /* status.c: the pattern that plays, bank × 16 + pattern; 0xffff without a bank */
{
    return valid_bank() ? U8(PLAYING) * 16u + U8(PLAYING + 1u) : 0xffffu;
}
/* status.c: the tracks (bit t) that trig anywhere in the pattern that plays; 0 without a bank. */
unsigned modwerk_machine_trigging(void)
{
    if (!valid_bank() || U8(PLAYING + 1u) > 15u) return 0;
    const volatile uint8_t *pattern = AT(U32(BANK) + PATTERN_STRIDE * U8(PLAYING + 1u));
    unsigned mask = 0;
    for (unsigned t = 0; t < 8u; ++t)
        for (unsigned b = 0; b < 8u; ++b) if (pattern[PATTERN_TRACK * t + b]) { mask |= 1u << t; break; }
    return mask;
}
unsigned modwerk_machine_pattern_trigs(uint8_t most[2], uint8_t tracks[2], uint16_t id[2])
{
    if (!valid_bank()) return 0;
    unsigned at[2] = {U8(PLAYING + 1u), U8(PLAYING + 3u)}, n = U8(PLAYING + 2u) == U8(PLAYING) && at[1] != at[0] ? 2u : 1u;
    id[0] = (uint16_t)(U8(PLAYING) * 16u + at[0]), id[1] = (uint16_t)(U8(PLAYING) * 16u + at[1]);
    for (unsigned i = 0; i < n; ++i) {
        unsigned p = at[i];
        if (p > 15u) { most[i] = tracks[i] = 8u; continue; } /* not a pattern of the bank: the safe side */
        const volatile uint8_t *pattern = AT(U32(BANK) + PATTERN_STRIDE * p);
        unsigned top = 0, any = 0;
        for (unsigned s = 0; s < 64u; ++s) {
            unsigned n = 0;
            for (unsigned t = 0; t < 8u; ++t) {
                unsigned on = pattern[PATTERN_TRACK * t + 7u - s / 8u] >> (s % 8u) & 1u;
                n += on, any |= on << t;
            }
            if (n > top) top = n;
        }
        unsigned count = 0;
        for (; any; any &= any - 1u) ++count;
        most[i] = (uint8_t)top, tracks[i] = (uint8_t)count;
    }
    return n;
}
/* status.c's stock reserve: what the current Part's module machines cost but track `skip` (8: none), each track by its
 * `each` and the first of a machine by its `first` too, the first less `net` (the sample its track would otherwise
 * play), never below 0. A further one is charged whole: on a trigging track its trig starts cost about what the sample's
 * did (modwerk-bd, twins 27 and 29: a second Amiga on C03 added 4.3 and 7.4 against its each of 4). */
uint32_t modwerk_machine_frame_booked(unsigned skip, uint32_t net)
{
    if (!valid_bank()) return 0;
    const Machine *m[ROWS - 5u], *who[8]; unsigned n = machines(m); uint32_t sum = 0;
    const Part *part = current_part();
    for (unsigned t = 0; t < 8u; ++t) {
        who[t] = 0;
        if (t == skip || !owner(m, n, part, t, &who[t])) { who[t] = 0; continue; }
        int first = 1;
        for (unsigned u = 0; u < t; ++u) if (who[u] == who[t]) first = 0;
        uint32_t cost = frame_cost(who[t], first, 0);
        sum += !first ? cost : cost > net ? cost - net : 0u;
    }
    return sum;
}
/* status.c's predicted brake: the current Part's module machines, each once, with the tracks it owns (bit t), what it
 * books there (its first, then each, less `net` a track) and its label; how many. */
unsigned modwerk_machine_part_machines(uint8_t tracks[8], uint32_t cost[8], const char *label[8], uint32_t net)
{
    if (!valid_bank()) return 0;
    const Machine *m[ROWS - 5u], *seen[8], *who = 0; unsigned n = machines(m), k = 0;
    const Part *part = current_part();
    for (unsigned t = 0; t < 8u; ++t) {
        if (!owner(m, n, part, t, &who) || !who) continue;
        unsigned j = 0;
        while (j < k && seen[j] != who) ++j;
        if (j == k) seen[k] = who, tracks[k] = 0, cost[k] = 0, label[k] = who->label, ++k;
        uint32_t c = frame_cost(who, !tracks[j], 0);
        cost[j] += tracks[j] ? c : c > net ? c - net : 0u, tracks[j] = (uint8_t)(tracks[j] | 1u << t);
    }
    return k;
}
/* The Part's bill without track `skip` (8: none), in track order. The tick also uses these owners to charge DSP
 * voices and label refusals. Keep them on its stack for this pass, so a Part or module change is read afresh next tick. */
static unsigned cpu_bill(const Machine *const *m, unsigned n, const Part *part, unsigned skip, uint8_t *over, const Machine **owners)
{
    unsigned sum = 0;
    *over = 0;
    for (unsigned t = 0; t < 8; ++t) {
        const Machine *who = 0;
        if (t != skip) owner(m, n, part, t, &who);
        if (owners) owners[t] = who;
        unsigned p = who ? cpu_price(who) : 0u;
        if (sum + p > mw_cpu_allowance) *over |= (uint8_t)(1u << t); else sum += p;
    }
    return sum;
}
volatile uint32_t mw_cpu_refusals, mw_cpu_refusal_tracks; /* for diagnostics, as the guard's skips */
static void cpu_refuse(unsigned track, const Machine *who, unsigned booked);
static void cpu_refuse(unsigned track, const Machine *who, unsigned booked)
{
    mw_cpu_refusals = mw_cpu_refusals + 1u, mw_cpu_refusal_tracks |= 1u << track;
    modwerk_status_cpu_refused(track, who->label, 10u * booked, 10u * cpu_price(who), 10u * mw_cpu_allowance);
}
/* The PROTECT machines this base knows by signature (module-adapters/machine-ports.json; sdk/tests checks the list).
 * Their tracks keep their 12 bytes from stock's validator while the machine is absent too: the boot's battery
 * restore (0x40025770) validates the battery-backed Part copies seconds before the saved set reinstalls the machines
 * (modset.c), and refuses the whole restore at the first value it has to fix. The bank is then never filled nor
 * applied (0x40009094): every Part reads STATIC with stock defaults, no track is ever bound and the unit is silent
 * (beta finding 24). An absent machine's track renders stock's silent source, never stock FLEX reading its bytes.
 * A native machine module (not a port) is listed by name, never by a pattern: a FLEX track whose NEIGHBOR bytes
 * merely looked like a signature would go silent. WV 1-15: SYNTIZ (sdk/drafts/syntiz), its model in the version
 * byte (six used, the rest kept for more). FR 1: FRACT (sdk/drafts/fract-machine). */
static const struct { uint8_t sig[2], lo, hi; } known[] = {{{'A', 'B'}, 1, 1}, {{'F', 'M'}, 1, 1}, {{'W', 'V'}, 1, 15}, {{'F', 'R'}, 1, 1}};
static unsigned orphan(const Part *part, unsigned t)
{
    if (t >= 8 || part[0x22 + t] > 1) return 0;
    const Part *s = part + SIG + 30 * t;
    for (unsigned k = 0; k < sizeof known / sizeof *known; ++k)
        if (s[0] == known[k].sig[0] && s[1] == known[k].sig[1] && s[2] >= known[k].lo && s[2] <= known[k].hi) return 1;
    return 0;
}
/* controller_board.c: the modules whose machines a track of the current bank's Parts, working or saved, is signed for,
 * up to max. A machine's engine is used from then on, as Sidechain's is once a Part names COMPRESSOR: after a boot its
 * renderer first asks for the write lease at the first trig, too late for it (owner's MKII, 28 October 2026). */
unsigned modwerk_machine_bank_modules(uint32_t *module, unsigned max)
{
    const Machine *m[ROWS - 5u], *who; unsigned n = machines(m), found = 0;
    if (!valid_bank()) return 0;
    for (unsigned k = 0; k < n && found < max; ++k) {
        unsigned hit = 0;
        for (unsigned i = 0; i < 8u * 8u && !hit; ++i) {
            unsigned p = i >> 3; /* Parts 1-4 working, then saved */
            hit = owner(&m[k], 1, AT(U32(BANK) + (p < 4u ? PART_OFF : SAVED_OFF - 4u * PART_STRIDE) + p * PART_STRIDE), i & 7u, &who) != 0;
        }
        struct runtime_owner o;
        if (hit && modwerk_runtime_owner_at((uintptr_t)m[k], &o) == 1) module[found++] = o.module;
    }
    return found;
}
static unsigned current(const Machine *const *m, unsigned n, const Machine **who)
{
    *who = 0;
    return valid_bank() && !U8(0x80000015u) ? owner(m, n, current_part(), U8(0x100b14ccu), who) : 0;
}
static unsigned backing(void)
{
    if (!valid_bank() || U8(0x100b14ccu) >= 8) return 1;
    unsigned pool = current_part()[0x22 + U8(0x100b14ccu)]; return pool < 2 ? pool : 1;
}
/* Names and pages by row: stock's five from its own tables, then each machine's. */
static void tables(const Machine *const *m, unsigned n)
{
    const Machine *who;
    unsigned row = current(m, n, &who);
    const Part *slot = valid_bank() ? current_part() + 0x22 + U8(0x100b14ccu) : 0;
    for (unsigned r = 0; r < 5; ++r) mw_src_names[r] = (const char *)(uintptr_t)U32(0x400a78c8u + 4 * r), mw_pb_table[r] = U32(0x400d5f38u + 4 * r);
    for (unsigned k = 0; k < ROWS - 5u; ++k) {
        const Machine *x = k < n ? m[k] : 0;
        mw_src_names[5 + k] = x ? x->label : mw_src_names[1];
        mw_pb_table[5 + k] = !x ? FLEX_PAGE : x->track_page ? (slot ? x->track_page(slot) : FLEX_PAGE) :
                            x->flags & MODWERK_MACHINE_BACKING ? (row == 5 + k && !backing() ? STATIC_PAGE : FLEX_PAGE) :
                            x->page ? x->page : FLEX_PAGE;
    }
}
/* The chooser's counts are immediates in stock code the table owns: pea 5+n and moveq #4+n (stock: n = 0). Its five
 * UP/DOWN handlers clamp the cursor with moveq #5 twice each (stock: row 5, one past PICKUP): the last row, 4+n, and
 * never below stock's 5, or the cursor stops at row 5 with two or more machines installed. */
static unsigned counted;
static void put8(uint32_t at, uint8_t v) { modwerk_machine_flush_data(at, 1); *modwerk_machine_code(at) = v; }
static void counts(unsigned n, unsigned rows)
{
    static const uint32_t pea[] = {0x4007924bu, 0x400585fdu}, moveq[] = {0x4003c951u, 0x40078679u, 0x400786cfu, 0x40079905u},
                          clamp[] = {0x40078c23u, 0x40078cb1u, 0x40078d2fu, 0x40078defu, 0x40078e7du};
    if (counted == (n | rows << 8 | 1u << 16)) return;
    for (unsigned i = 0; i < 2; ++i) put8(pea[i], (uint8_t)(5u + n));
    for (unsigned i = 0; i < 4; ++i) put8(moveq[i], (uint8_t)(4u + n));
    for (unsigned i = 0; i < 5; ++i) put8(clamp[i], (uint8_t)(n > 1 ? 4u + n : 5u)), put8(clamp[i] + 6u, (uint8_t)(n > 1 ? 4u + n : 5u));
    put8(0x40065c7fu, (uint8_t)(3u + rows));
    modwerk_machine_invalidate_code();
    counted = n | rows << 8 | 1u << 16;
}

/* SEQUENCER: stock's three rows, then each contributed label once (the first contribution's). */
#define SEQ_ROWS 11u
const void *mw_seq_labels[SEQ_ROWS], *mw_seq_getters[SEQ_ROWS], *mw_seq_setters[SEQ_ROWS];
extern const char mw_seq_none[];
extern void mw_seq_get_none(void), mw_seq_set_none(void);
static int same(const char *a, const char *b) { while (*a && *a == *b) ++a, ++b; return *a == *b; }
static unsigned sequencer(void)
{
    unsigned n = 3;
    for (unsigned r = 0; r < 3; ++r)
        mw_seq_labels[r] = (const void *)(uintptr_t)U32(0x400b27d0u + 4 * r), mw_seq_getters[r] = (const void *)(uintptr_t)U32(0x400b27dcu + 4 * r),
        mw_seq_setters[r] = (const void *)(uintptr_t)U32(0x400b282cu + 4 * r);
    for (uintptr_t volatile *row = modwerk_runtime_event_row[SEQUENCER]; *row; ++row) {
        const struct modwerk_sequencer_rows *c = (const struct modwerk_sequencer_rows *)*row;
        for (uint32_t i = 0; i < c->count && n < SEQ_ROWS; ++i) {
            unsigned k = 3;
            while (k < n && !same(mw_seq_labels[k], c->row[i].label)) ++k;
            if (k < n) continue;
            mw_seq_labels[n] = c->row[i].label, mw_seq_getters[n] = c->row[i].get, mw_seq_setters[n] = c->row[i].set; ++n;
        }
    }
    for (unsigned k = n; k < SEQ_ROWS; ++k) mw_seq_labels[k] = mw_seq_none, mw_seq_getters[k] = (const void *)mw_seq_get_none,
                                         mw_seq_setters[k] = (const void *)mw_seq_set_none;
    return n - 3u;
}

/* What the FLEX render (mw_source_render_impl) last worked out for each track, kept while the bytes it came from
 * stand: the current Part, and the track's type byte and signature. The render runs about twice a frame for every
 * FLEX track; walking the machine table and comparing every machine's signature each time was most of its own cost.
 * Written in the frame interrupt only. The descriptors it names are the rows': looked_up is cleared masked when the
 * rows change (modwerk_machine_tables_changed), before a machine that left loses its memory. */
enum { NOBODY, OWNED, ORPHAN, ASLEEP };
static struct { const Part *part; uint32_t bytes; const Machine *who; unsigned kind; } looked[8];
/* ---- Machines that rest (owner, 20 November 2026: an installed module no track uses costs nothing) -----------------
 * A machine's module that does not answer ev_in_use itself is answered for here (events.json's judged ot_machines,
 * loader.h modwerk_machine_in_use): it is in use while a track of any Part of the project, working or saved, is the
 * machine, so a pattern, Part or bank change never needs it woken; the scan is the machine map's (mc_scan), every two
 * seconds or at once after a change. It rests after REST_AFTER scans in a row find no such track: its handlers leave
 * the hooks that rest (the frame interrupt's ev_play_increment, ev_voice_bind and ev_tail_kill) and its detours marked
 * rests hold stock's bytes. A track that names a resting machine all the same (a paste, a project just loaded) renders
 * stock's silent source and asks for it (wake_who) until the next UI tick wakes it; a pick wakes it before it commits.
 * A RENDER_FLEX machine is offered FLEX tracks nobody owns, so it never rests. */
#define REST_AFTER 2u
int modwerk_fxmap_loading(void); /* fxmap.c: a project load runs */
static const Machine *use_who[ROWS - 5u]; /* the rows' machines at the last scan, and how many scans in a row found */
static uint8_t use_idle[ROWS - 5u];       /* no track of the project on each (UI task) */
static unsigned use_n;
static uint32_t use_epoch;                /* the loader's owner epoch at the last scan: a set installed, removed or undone
                                           * since keeps every machine awake until REST_AFTER scans of the new set */
static const Machine *volatile wake_who[8]; /* the frame interrupt: track t names this resting machine */
static const Machine *volatile pick_who;    /* mw_assign: this resting machine is being picked */
static const Machine *asleep_who[ROWS - 5u]; /* the rows' machines whose module rests: written masked (tables changed) */
static unsigned asleep_n;
static int asleep(const Machine *who)
{
    for (unsigned k = 0; k < asleep_n; ++k) if (asleep_who[k] == who) return 1;
    return 0;
}
static void asleep_refresh(void) /* masked: the loader just changed the rows or the resting set */
{
    asleep_n = 0;
    for (uintptr_t volatile *row = modwerk_runtime_event_row[MACHINES]; *row && asleep_n < ROWS - 5u; ++row)
        if (modwerk_runtime_resting_at(*row)) asleep_who[asleep_n++] = (const Machine *)*row;
}
/* Effect modules rest the same way (owner, 20 November 2026): a module with a DSP effect and no ev_in_use of its own is
 * in use while a slot of the project names its effect id (fxmap.c's modwerk_fxmap_used: every bank's Parts, working
 * and saved, and what runs) or a live slot runs it (checked at every ask, so a paste or a load wakes it within a tick).
 * Its ColdFire detours marked rests (Euclid's frame hook, Tape Echo's delay seam) hold stock's bytes meanwhile; its DSP
 * code is the DSP's, resident on demand as before. A pick of it wakes it before stock writes the pick (status.c's
 * modwerk_status_effect_busy). */
#define LIVE_FX 0x80000ec4u /* what each slot runs: FX1 T1-T8, then FX2 */
fx_set modwerk_fxmap_used(void);       /* fxmap.c */
int modwerk_fxmap_handle(uint32_t module);
static uint8_t fx_idle[MODWERK_FX_IDS]; /* idle scans in a row for each effect id (UI task) */
static uint32_t fx_epoch;
static volatile int fx_wanted = -1;    /* an effect id being picked while its module rests */
static int effect_id(const struct runtime_module *module)
{
    int id = modwerk_fxmap_handle(module->id);
    return id >= 0 ? id : (int)module->dsp.id;
}
static int effect_in_use(const struct runtime_module *module)
{
    int id = effect_id(module);
    if (id < 0 || (unsigned)id >= MODWERK_FX_IDS || id == fx_wanted || modwerk_runtime_owner_epoch() != fx_epoch) return 1;
    for (unsigned k = 0; k < 16u; ++k) if (U8(LIVE_FX + k) == (unsigned)id) return 1;
    return fx_idle[id] < REST_AFTER;
}
static void fx_scanned(void) /* the machine map's refresh, with its whole scan */
{
    fx_set used = modwerk_fxmap_used();
    uint32_t epoch = modwerk_runtime_owner_epoch();
    int loading = modwerk_fxmap_loading(), same_set = epoch == fx_epoch;
    fx_epoch = epoch;
    for (unsigned id = 0; id < MODWERK_FX_IDS; ++id) {
        unsigned was = same_set ? fx_idle[id] : 0u;
        fx_idle[id] = (uint8_t)(fx_in(used, id) ? 0u : loading || was == 255u ? was : was + 1u);
    }
    if (fx_wanted >= 0 && (fx_in(used, (unsigned)fx_wanted) || fx_idle[fx_wanted] >= REST_AFTER)) fx_wanted = -1;
}
uint32_t modwerk_status_module_rest(uint32_t module);
/* status.c's reserve: what every installed module adds on no track or slot (the table's `rest`), per mille. */
uint32_t modwerk_machine_rest_booked(void)
{
    uint32_t sum = 0;
    for (unsigned p = 0; p < RUNTIME_MODULES; ++p) {
        const struct runtime_module *m = modwerk_runtime_module(p);
        if (m) sum += modwerk_status_module_rest(m->id);
    }
    return sum;
}
/* status.c, before stock writes an effect pick: whether the module behind `id` rests, and its wake. */
int modwerk_machine_effect_resting(unsigned id)
{
    for (unsigned p = 0; p < RUNTIME_MODULES; ++p) {
        const struct runtime_module *m = modwerk_runtime_module(p);
        if (m && m->dsp.count && !m->hook[MODWERK_OT_MACHINES] && effect_id(m) == (int)id)
            return modwerk_runtime_resting_at((uintptr_t)m);
    }
    return 0;
}
void modwerk_machine_effect_wake(unsigned id)
{
    if (id >= MODWERK_FX_IDS) return;
    fx_wanted = (int)id, fx_idle[id] = 0;
    modwerk_runtime_rest_poll();
}
int modwerk_machine_in_use(const struct runtime_module *module)
{
    const Machine *who = (const Machine *)module->hook[MODWERK_OT_MACHINES];
    if (!who && module->dsp.count) return effect_in_use(module);
    if (!who || who->abi != MODWERK_MACHINE_ABI || who->flags & MODWERK_MACHINE_RENDER_FLEX || pick_who == who ||
        modwerk_runtime_owner_epoch() != use_epoch) return 1;
    for (unsigned t = 0; t < 8u; ++t) if (wake_who[t] == who) return 1;
    for (unsigned k = 0; k < use_n; ++k) if (use_who[k] == who) return use_idle[k] < REST_AFTER;
    return 1; /* not scanned since it came: awake until a scan says otherwise */
}
/* The machine map's scan found `mine` (bit k: a track of the project is m[k]): the count of idle scans for each. */
static void use_scanned(const Machine *const *m, unsigned n, uint32_t mine)
{
    uint8_t idle[ROWS - 5u];
    uint32_t epoch = modwerk_runtime_owner_epoch();
    int same_set = epoch == use_epoch, loading = modwerk_fxmap_loading();
    use_epoch = epoch;
    for (unsigned k = 0; k < n; ++k) {
        unsigned was = 0;
        for (unsigned j = 0; same_set && j < use_n; ++j) if (use_who[j] == m[k]) was = use_idle[j];
        /* While a project loads, stock rewrites the banks a Part at a time (fxmap.c): a scan then counts what it sees
         * used, never an idle scan, so nothing rests on a half-loaded project. */
        idle[k] = mine >> k & 1u ? 0u : loading ? (uint8_t)was : (uint8_t)(was < 255u ? was + 1u : 255u);
        if (!(mine >> k & 1u) && idle[k] < REST_AFTER) continue;
        /* used, or idle long enough: a wake asked for it is answered either way */
        if (pick_who == m[k]) pick_who = 0;
        for (unsigned t = 0; t < 8u; ++t) if (wake_who[t] == m[k]) wake_who[t] = 0;
    }
    for (unsigned k = 0; k < n; ++k) use_who[k] = m[k], use_idle[k] = idle[k];
    use_n = n;
}
static const Machine *flex_machine; /* the first RENDER_FLEX machine with a render: it takes unowned FLEX tracks */
static uint32_t looked_up;          /* bit t: looked[t] stands; bit 8: flex_machine does */
/* Those bytes are slow to read: the Part index is in battery RAM, about half a microsecond a read, and the bank's
 * are uncached (an MKII, 10 November 2026: with every answer kept, checking them on each render still took 4 points of
 * a frame on eight FLEX tracks). Nothing below the frame interrupt runs inside it, so within one frame they cannot
 * change: the Part is read once a frame and each track is checked once a frame. mw_frame_exit ends the frame. */
static const Part *frame_part;      /* the current Part this frame, 0 without a bank */
static uint32_t frame_seen;         /* bit t: looked[t] was checked this frame; bit 8: frame_part was read */

/* Masked, right after the loader rewrote the rows (loader.h): nothing stock reads may still name a module that left. */
void modwerk_machine_tables_changed(void)
{
#ifdef MODWERK_USB_FUNCTIONS
    void modwerk_usb_functions_changed(void); /* usb_function.c: a function that left is off its endpoint at once */
    modwerk_usb_functions_changed();
#endif
    unsigned n = 0;
    looked_up = 0, frame_seen = 0;
    for (uintptr_t volatile *row = modwerk_runtime_event_row[MACHINES]; *row && n < ROWS - 5u; ++row)
        n += ((const Machine *)*row)->abi == MODWERK_MACHINE_ABI;
    for (unsigned t = 0; t < 8; ++t) { /* a machine that left frees its voices and engine before its memory goes */
        int kept = 0, start_kept = 0;
        for (uintptr_t volatile *row = modwerk_runtime_event_row[MACHINES]; (charged[t] || start_refused[t]) && *row; ++row) {
            kept |= *row == (uintptr_t)charged[t];
            start_kept |= *row == (uintptr_t)start_refused[t];
        }
        if (charged[t] && !kept) release(t);
        /* An unrelated table change keeps a live owner's refusal; a departing owner must not leave it at an
         * address the allocator may reuse for a new machine before that machine's first accepted START. */
        if (start_refused[t] && !start_kept) start_refused[t] = 0;
    }
    for (unsigned k = 5; k < ROWS; ++k) mw_src_names[k] = (const char *)(uintptr_t)U32(0x400a78c8u + 4), mw_pb_table[k] = FLEX_PAGE;
    counts(n, sequencer());
    asleep_refresh();
}

const char *mw_name(unsigned row)
{
    const Machine *m[ROWS - 5u]; unsigned n = machines(m);
    tables(m, n);
    return row < ROWS && (row < 5 || row < 5 + n) ? mw_src_names[row] : mw_src_names[1];
}
unsigned mw_type(unsigned type, const Part *ptr)
{
    const Machine *m[ROWS - 5u], *who; unsigned n = machines(m);
    tables(m, n);
    if (!valid_bank()) return type;
    Part *part = current_part(); uintptr_t t = (uintptr_t)ptr - (uintptr_t)(part + 0x22);
    unsigned row = t < 8 ? owner(m, n, part, (unsigned)t, &who) : 0;
    return row && type < 2 ? row : type;
}
unsigned mw_chooser_type(unsigned type, const Part *ptr)
{
    const Machine *m[ROWS - 5u], *who; unsigned n = machines(m);
    if (valid_bank()) owner(m, n, current_part(), U8(0x100b14ccu), &who); else who = 0;
    if (who && who->chooser_type && who->chooser_type(type, ptr) != 5) return type;
    return mw_type(type, ptr);
}
/* Stock's per-track voice records (0x800049d8 + 168 * track): byte 0 is "playing", which the trig start (0x4000f450)
 * sets and the sample fetch (0x40007960) reads silence while it is 0. A module machine is FLEX underneath, so each of
 * its trigs also starts stock's FLEX voice from the machine's bytes read as FLEX settings, and its own render never
 * advances that voice. Stock doesn't stop it when the track changes machine (machines with a render of their own are
 * stopped at every render, mw_source_render_impl): stock's parameter load (0x40001f18) never
 * touches the record, and voice bind (0x40006820) runs only where a commit changes the type. A switch that keeps the
 * stored type (FLEX <-> machine, of the playing Part) stops it here, before the track's parameters change: the track
 * is silent until its next trig, never a short burst of the old voice that the first trig cuts or plays over.
 * It runs from the UI task with interrupts on: a trig the frame interrupt starts in the same moment could be cleared
 * with it. That is one byte, one trig, at the moment the player changes the machine, and acceptable (owner, 29 Oct 2026). */
#define VOICE 0x800049d8u
#define VOICE_STRIDE 168u
static void hush(const Part *part, unsigned track, unsigned type)
{
    if (part == current_part() && part[0x22 + track] == type) U8(VOICE + VOICE_STRIDE * track) = 0;
}
/* A track leaves `old`: its own leave, stock's FLEX defaults back in both Part copies for a PROTECT machine that
 * signs its tracks through the registry (the 12 bytes held its parameters), and its DSP charge released. */
static void flex_defaults(Part *part, Part *mirror, unsigned track)
{
    for (unsigned k = 0; k < 12; ++k) {
        unsigned at = (k < 6 ? 0x2a : 0x1da) + 30 * track + 6 + k % 6;
        part[at] = mirror[at] = U8(0x400d320cu + k);
    }
}
static void leave(Part *part, Part *mirror, unsigned track, const Machine *old)
{
    if (old->leave) old->leave(track);
    modwerk_status_cpu_left(frame_cost(old, !elsewhere(part, track, old), 0));
    if (!old->assign && old->flags & MODWERK_MACHINE_PROTECT) flex_defaults(part, mirror, track);
    if (charged[track] == old) release(track); /* a priced machine that took the track was charged in its place */
}
/* Tracks that became a priced machine without an assignment (a project load, a Part change, a paste) are charged
 * here, and tracks charged to another machine than their own move to it; tracks no longer one are released. A track
 * its core cannot carry stays uncharged and renders silence. */
static void charge(const Machine *const *m, unsigned n)
{
    if (!valid_bank()) return;
    const Machine *owners[8];
    uint8_t over;
    unsigned booked = cpu_bill(m, n, current_part(), 8, &over, owners);
    for (unsigned t = 0; t < 8; ++t) {
        const Machine *who = owners[t];
        if (who && !who->source_kind) who = 0;
        if (!who) warned &= (uint8_t)~(1u << t);
        if (who ? charged[t] != who && !claim(t, who) : charged[t] != 0) release(t);
    }
    for (unsigned t = 0; t < 8; ++t)
        if (over & ~cpu_warned & 1u << t && owners[t]) { /* the first new one: the box shows one at a time */
            cpu_refuse(t, owners[t], booked);
            break;
        }
    mw_cpu_refused = cpu_warned = over, mw_cpu_booked = booked;
}
/* Stock loads a track's live parameters from its Part (0x40001f18: bank, Part, track) where a commit changes the
 * stored type. A module machine is FLEX underneath, so FLEX <-> machine keeps the type and the live copy would stay on
 * the old machine's values (the machine silent, FLEX playing its bytes) until SOURCE CLEAR: load it here instead. */
static unsigned relive(const Part *part, uint32_t offset, unsigned track, unsigned type)
{
    if (part[0x22 + track] == type) STOCK(void (*)(unsigned, unsigned, unsigned), 0x40001f18u)(U8(0x100b14ceu), offset / PART_STRIDE, track);
    return type;
}
static void mc_assigned(const Machine *who); /* the machine map, below: a track takes an installed machine */
static void guard_forget(unsigned track);    /* the frame guard, below: a track's figures are another machine's */
/* A machine's admission precedes every mutation; -1 refuses. */
#ifdef MODWERK_RESIDENT_ON_DEMAND
extern volatile uint32_t modwerk_machine_assigned; /* controller_board.c: it reads the bank's machines again after an assignment */
#else
volatile uint32_t modwerk_machine_assigned; /* no controller_board.c in this base (it comes with --resident-stock-hooks) */
#endif
unsigned mw_assign(Part *part, unsigned track, unsigned row)
{
    modwerk_machine_assigned = modwerk_machine_assigned + 1u;
    if (!valid_bank() || track >= 8) return row < 5 ? row : 1;
    uint32_t offset = ADDR(part) - U32(BANK) - PART_OFF;
    if (offset % PART_STRIDE || offset / PART_STRIDE >= 4) return (unsigned)-1;
    const Machine *m[ROWS - 5u], *old, *next = 0; unsigned n = machines(m);
    if (row >= 5 && row < 5 + n) next = m[row - 5];
    owner(m, n, part, track, &old);
    Part *mirror = AT(SRAM_PART + offset);
    /* A track of a known PROTECT machine that is absent leaves it as it would leave it present: stock's FLEX
     * defaults back in both copies before another machine or signature takes the track. */
    unsigned absent = !old && orphan(part, track);
    if (next) {
        if (next->admit_track && !next->admit_track(part, track)) return (unsigned)-1;
        warned &= (uint8_t)~(1u << track); /* a pick is a new ask: say so again if it is refused again */
        int waking = old != next && asleep(next);
        uint32_t add = old != next ? frame_cost(next, !elsewhere(part, track, next), waking) : 0u;
        /* a unit whose frame this machine would fill does not take it; the one it replaces is judged gone */
        uint32_t voice = 0; uint8_t voice_kind = 0; /* a DSP voice: the box shows its core too */
        if (old != next && next->source_kind && !price(next, &voice, &voice_kind)) voice = 0;
        if (old != next && modwerk_status_pick_busy(track, elsewhere(part, track, next) ? 2u : 1u, next->label, add, old ? frame_cost(old, !elsewhere(part, track, old), 0) : 0u, voice))
            return (unsigned)-1;
        if (old != next && cpu_price(next)) { /* before the DSP claim: nothing to give back */
            uint8_t over; unsigned booked = cpu_bill(m, n, part, track, &over, 0);
            if (booked + cpu_price(next) > mw_cpu_allowance) {
                cpu_refuse(track, next, booked);
                return (unsigned)-1;
            }
        }
        if (next->source_kind && old != next && !claim(track, next)) return (unsigned)-1;
        if (waking) { /* awake before the track becomes it: its hooks see the commit; else silent until the next tick */
            pick_who = next;
            modwerk_runtime_rest_poll();
        }
        if (old != next) mc_assigned(next), modwerk_status_cpu_entered(add), guard_forget(track);
        if (old && old != next) leave(part, mirror, track, old);
        if (absent) flex_defaults(part, mirror, track);
        if (next->assign) return next->assign(part, track, 1);
        if (old != next) hush(part, track, 1);
        if (old != next && next->defaults)
            for (unsigned k = 0; k < 12; ++k) {
                unsigned at = (k < 6 ? 0x2a : 0x1da) + 30 * track + 6 + k % 6;
                part[at] = mirror[at] = next->defaults[k];
            }
        unsigned sig = SIG + 30 * track;
        part[sig] = mirror[sig] = next->sig[0]; part[sig + 1] = mirror[sig + 1] = next->sig[1]; part[sig + 2] = mirror[sig + 2] = next->sig_lo;
        return old != next ? relive(part, offset, track, 1) : 1;
    }
    /* Browser YES keeps the signed owner; ordinary machine selection clears it. */
    if (old && old->assign) {
        unsigned pool = old->assign(part, track, 0);
        const Machine *still; owner(m, n, part, track, &still);
        if (still == old) return pool;
        hush(part, track, row < 5 ? row : 1);
        leave(part, mirror, track, old);
        return relive(part, offset, track, row < 5 ? row : 1);
    } else if (old || absent) {
        hush(part, track, row < 5 ? row : 1);
        if (old) leave(part, mirror, track, old);
        else flex_defaults(part, mirror, track);
        unsigned sig = SIG + 30 * track; for (unsigned k = 0; k < 3; ++k) part[sig + k] = mirror[sig + k] = 0;
        return relive(part, offset, track, row < 5 ? row : 1);
    }
    return row < 5 ? row : 1;
}
static void ui_tick(void);
void mg_tick(void); /* midi_generators.c: the MIDI tracks' generators */
/* The UI tick, a task: also where a module that no track uses rests (loader.h modwerk_runtime_rest_poll; HOOKS.md). */
void mw_ui_tick(void)
{
    MW_STAMP(14); ui_tick(); MW_STAMP(24); mg_tick(); MW_STAMP(25); modwerk_runtime_rest_poll(); MW_STAMP(15);
}
int modwerk_machine_stopped(void); /* runtime.c */
extern volatile uint8_t mw_frame_brake; /* the frame guard's brake (below) */
static const Part *brake_part;     /* the Part that played when the brake caught */
static void ceiling_tick(void);     /* the frame guard's ceiling (below) */
uint32_t modwerk_status_hush(fx_set fx[2], uint16_t id[2]); /* status.c: the predicted brake (mw_hush, below) */
extern volatile uint32_t mw_hush, mw_hush_fx[2];
static int effect_id(const struct runtime_module *module);
/* The effect handle of an ev_frame_deadline handler's module, or -1. */
static int deadline_effect(uintptr_t fn)
{
    struct runtime_owner o;
    if (modwerk_runtime_owner_at(fn, &o) != 1) return -1;
    for (unsigned p = 0; p < RUNTIME_MODULES; ++p) {
        const struct runtime_module *m = modwerk_runtime_module(p);
        if (m && m->id == o.module) return effect_id(m);
    }
    return -1;
}
/* The ev_frame_deadline rows (bit i) whose module's effect is in `fx`. */
static uint32_t deadline_rows(fx_set fx)
{
    uint32_t rows = 0;
    uintptr_t volatile *row = modwerk_runtime_event_row[MODWERK_EV_FRAME_DEADLINE - RUNTIME_EVENTS];
    for (unsigned i = 0; row && *row && i < 24u; ++row, ++i) { int e = deadline_effect(*row); if (e >= 0 && fx_in(fx, (unsigned)e)) rows |= 1u << i; }
    return rows;
}
/* status.c: the effects whose module subscribes ev_frame_deadline, so can bypass dry on a hushed pattern. */
fx_set modwerk_machine_deadline_effects(void)
{
    fx_set fx = {{0}};
    uintptr_t volatile *row = modwerk_runtime_event_row[MODWERK_EV_FRAME_DEADLINE - RUNTIME_EVENTS];
    for (unsigned i = 0; row && *row && i < 24u; ++row, ++i) { int e = deadline_effect(*row); if (e >= 0) fx = fx_with(fx, (unsigned)e); }
    return fx;
}
static void brake_tick(void)       /* released at STOP or a Part change */
{
    ceiling_tick();
    fx_set fx[2]; uint16_t id[2];
    mw_hush = modwerk_status_hush(fx, id);
    for (unsigned p = 0; p < 2u; ++p) { uint32_t rows = id[p] <= 255u ? deadline_rows(fx[p]) : 0u; mw_hush_fx[p] = rows ? (uint32_t)id[p] << 24 | rows : 0u; }
    if (!mw_frame_brake) { brake_part = 0; return; }
    const Part *part = valid_bank() ? current_part() : 0;
    if (!brake_part) brake_part = part;
    else if (modwerk_machine_stopped() || part != brake_part) mw_frame_brake = 0, brake_part = 0;
}
static void ui_tick(void)
{
    brake_tick();
    const Machine *m[ROWS - 5u]; unsigned n = machines(m);
    for (unsigned k = 0; k < n; ++k) if (m[k]->ui_tick) m[k]->ui_tick();
    charge(m, n);
    tables(m, n);
    uint32_t mask = modwerk_machine_mask();
    counts(n, sequencer());
    modwerk_machine_unmask(mask);
}
uint32_t mw_page(const Part *ptr)
{
    const Machine *m[ROWS - 5u], *who; unsigned n = machines(m);
    tables(m, n);
    if (!valid_bank()) return 0;
    uintptr_t t = (uintptr_t)ptr - (uintptr_t)(current_part() + 0x22);
    if (t < 8) owner(m, n, current_part(), (unsigned)t, &who); else who = 0;
    return who && who->track_page ? who->track_page(ptr) : 0;
}
/* Sidechain Compressor keeps MON, KEY, KGN, KBAS and KWID in stock COMPRESSOR's page-2 slots 7-11 (Part 0x2fe + 30 t
 * + 6 fx + 1..5). Stock's descriptor declares slot 7 with 2 values (default 1) and slots 8-11 with 128, 2, 128 and 128
 * (defaults 0x7f/0/0/0). Before the saved set is back, the boot's battery restore judged a set-up side-chain by those
 * ranges, refused KGN (slot 9) above 1 and with it the whole bank (beta finding 47, as finding 24 above; #712). Stock
 * judges its own defaults in slots 7-11 instead, and the side-chain's bytes come back. A side-chain is: MON 0..3
 * (0.2.0 stores 2 = OFF, 3 = ON, its page declares 4 values; 0 and 1 are a set saved before, which the module turns
 * OFF; stock's count of 2 would refuse 2 and 3, so slot 7 is shown stock's default 1 too), KEY OFF..T8, KGN, KBAS and
 * KWID 0..127. Since 0.2.0 slot 11 is KWID (127 = OFF), where 0.1.x kept MON (0/1); a set saved with 0.1.x (slot 7
 * still stock's 1) matches too. A KEY above T8 is stock's own value and goes to stock as it is. */
#define COMPRESSOR 24u
#define FX_SETUP 0x2feu
static const uint8_t compressor_slots[5] = {1, 0x7f, 0, 0, 0};  /* slots 7-11 */
static unsigned sidechain(const Part *part, unsigned t, unsigned fx)
{
    unsigned at = FX_SETUP + 30 * t + 6 * fx + 1;  /* slot 7, MON */
    return part[8 * fx + t] == COMPRESSOR && part[at] <= 3 && part[at + 1] <= 8 && part[at + 2] < 0x80 && part[at + 3] < 0x80
        && part[at + 4] < 0x80 ? at : 0;
}
/* The stock validator never sees a PROTECT machine's 12 FLEX bytes, nor a known absent one's (the boot's battery
 * restore, above), nor a side-chain's four; machines' validate wrap it in row order. */
static const Machine *wrapping[ROWS - 5u];
static unsigned wraps, depth;
static int next_validator(uint8_t *part)
{
    while (depth < wraps) { const Machine *x = wrapping[depth++]; if (x->validate) return x->validate(part, next_validator); }
    return mw_stock_validate(part);
}
int mw_validate(Part *part)
{
    const Machine *m[ROWS - 5u], *who; unsigned n = machines(m), mask = 0;
    uint8_t saved[8][12], keys[8][2][5];
    unsigned key_at[8][2];
    const Part *stock = AT(0x400d320cu);
    for (unsigned t = 0; t < 8; ++t) {
        owner(m, n, part, t, &who);
        if (who ? who->flags & MODWERK_MACHINE_PROTECT : orphan(part, t)) {
            mask |= 1u << t;
            for (unsigned k = 0; k < 12; ++k) { unsigned at = (k < 6 ? 0x2a : 0x1da) + 30 * t + 6 + k % 6; saved[t][k] = part[at]; part[at] = stock[k]; }
        }
        for (unsigned fx = 0; fx < 2; ++fx)
            if ((key_at[t][fx] = sidechain(part, t, fx)))
                for (unsigned k = 0; k < 5; ++k) keys[t][fx][k] = part[key_at[t][fx] + k], part[key_at[t][fx] + k] = compressor_slots[k];
    }
    for (unsigned k = 0; k < n; ++k) wrapping[k] = m[k];
    wraps = n; depth = 0;
    int result = next_validator((uint8_t *)part);
    wraps = depth = 0;
    for (unsigned t = 0; t < 8; ++t) {
        if (mask & 1u << t)
            for (unsigned k = 0; k < 12; ++k) { unsigned at = (k < 6 ? 0x2a : 0x1da) + 30 * t + 6 + k % 6; part[at] = saved[t][k]; }
        for (unsigned fx = 0; fx < 2; ++fx)
            if (key_at[t][fx]) for (unsigned k = 0; k < 5; ++k) part[key_at[t][fx] + k] = keys[t][fx][k];
    }
    return result;
}
static unsigned open_pool(const Machine *const *m, unsigned n)
{
    const Machine *who; unsigned row = current(m, n, &who);
    if (!who) return 0;
    if (who->pool_open) who->pool_open();
    else {
        mw_stock_pool_open();
        if (U32(0x460e70e0u) && U32(0x460e739au)) STOCK(void (*)(void), 0x4007893cu)();
        if (U32(0x460e70e0u)) STOCK(void (*)(unsigned, unsigned), 0x4007edb0u)(0x460e7386u, row);
    }
    return 1;
}
unsigned mw_open_pool(void) { const Machine *m[ROWS - 5u]; unsigned n = machines(m); return open_pool(m, n); }
/* Callbacks that return to row five restore the machine's own row. */
static void back_to_row(unsigned row) { if (row && U32(0x460e70e0u) && !U32(0x460e739au)) STOCK(void (*)(unsigned, unsigned), 0x4007edb0u)(0x460e7386u, row); }
void mw_pool_left(unsigned key, unsigned edge)
{
    unsigned returning = U32(0x460e739au);
    const Machine *m[ROWS - 5u], *who; unsigned n = machines(m), row = current(m, n, &who);
    if (who && who->pool_left) who->pool_left(key, edge);
    else STOCK(void (*)(unsigned, unsigned), 0x4007893cu)(key, edge);
    if (returning) back_to_row(row);
}
void mw_pool_right(unsigned key, unsigned edge)
{
    const Machine *m[ROWS - 5u], *who; unsigned n = machines(m), at = U32(0x460e738eu), row = current(m, n, &who);
    if (row && at == row && !U32(0x460e739au)) { STOCK(void (*)(void), 0x400789e4u)(); (void)open_pool(m, n); }
    else STOCK(void (*)(unsigned, unsigned), 0x4007909cu)(key, edge);
}
void mw_choice_left(unsigned key, unsigned edge)
{
    const Machine *m[ROWS - 5u], *who; unsigned n = machines(m), row = current(m, n, &who);
    if (who && who->choice_left) who->choice_left(key, edge);
    back_to_row(row);
}
uintptr_t mw_list_target(void)
{
    const Machine *m[ROWS - 5u], *who; unsigned n = machines(m);
    current(m, n, &who);
    return who && who->list_draw ? (uintptr_t)who->list_draw : (uintptr_t)mw_stock_list_draw;
}
/* The track window's column (0 the machine list, 1 the pool), from the selected track's type byte: stock's rule (STATIC
 * and FLEX open on their pool), except that a LIST machine (one without a pool) opens on the list, as PICKUP does. */
unsigned mw_window_column(const Part *type)
{
    const Machine *m[ROWS - 5u], *who = 0; unsigned n = machines(m);
    if (valid_bank()) owner(m, n, current_part(), U8(0x100b14ccu) & 7u, &who);
    if (who && who->flags & MODWERK_MACHINE_LIST) return 0;
    return *type <= 1u;
}
/* SRC SETUP's editor skips encoder E (slot 10) for module machines, POLY8's hidden slot; a SETUP_ALL machine edits it. */
unsigned mw_row_setup_all(unsigned row)
{
    const Machine *m[ROWS - 5u]; unsigned n = machines(m);
    return row >= 5 && row < 5 + n && m[row - 5]->flags & MODWERK_MACHINE_SETUP_ALL;
}
unsigned mw_row_has_pool(unsigned row)
{
    const Machine *m[ROWS - 5u]; unsigned n = machines(m);
    return row >= 5 && row < 5 + n && m[row - 5]->flags & MODWERK_MACHINE_POOL;
}
/* SRC SETUP on a module machine's row (stock's cursor, 0x460d5c30, the row its drawer and editor were given) shows and
 * edits the track's backing pool's setup (mw_pool_kind). A SETUP_PAGE machine owns its rows there while the current
 * track is its own: its page gives the page the drawer shows instead of the row's stock one, and its knob
 * takes encoders A-F (0-5) before stock edits the pool's byte. Only a SETUP_PAGE machine's record is a struct
 * modwerk_machine_setup (88 bytes; every other ABI 1 record ends at 80), so nothing past the machine is read without it. */
static const Machine *setup_owner(const Machine *const *m, unsigned n, unsigned row)
{
    const Machine *who;
    return row >= 5 && current(m, n, &who) == row && who->flags & MODWERK_MACHINE_SETUP_PAGE ? who : 0;
}
uint32_t mw_setup_page(unsigned row, uint32_t stock)
{
    const Machine *m[ROWS - 5u]; unsigned n = machines(m);
    const Machine *who = setup_owner(m, n, row);
    const struct modwerk_machine_setup *own = (const struct modwerk_machine_setup *)who;
    return own && own->page ? own->page(stock) : stock;
}
unsigned mw_setup_knob(unsigned row, unsigned index, int delta)
{
    const Machine *m[ROWS - 5u]; unsigned n = machines(m);
    const Machine *who = index < 6 ? setup_owner(m, n, row) : 0;
    const struct modwerk_machine_setup *own = (const struct modwerk_machine_setup *)who;
    return own && own->knob && own->knob(index, delta) ? 1u : 0u;
}
/* The frame guard. The frame interrupt (0x4000aad0, level 5) takes the DSP's frame word at its entry, renders each
 * track's source (each track about twice a frame), then builds the DSP's frame. While it runs, USB (level 4), the UI and
 * every task wait: kept near a whole frame it froze the panel and dropped USB with POLY8, FM Synth and seven busy stock
 * tracks while USB recorded (owner's MKII, 24 October 2026), and kept past a frame the DSP's audio stops for good
 * (OCTATRACK_HARDWARE_TRAPS.md, work inside the frame interrupt). So it has a budget: each frame earns mw_frame_share,
 * short frames save up to BURST of it, long ones spend it. Its entry calls mw_frame_enter, which stamps mw_frame_t0,
 * and its exit calls mw_frame_exit (machine_registry.s). Each render of a machine's track is timed, and so is the work after it up to the
 * exit; before the next frame's same render the guard predicts the frame's length from those. When it would overdraw,
 * the track renders stock's silent source this time instead: a dropout on that track, never a frozen unit. Tracks only
 * stock renders, and priced machines' (their voice is the DSP's), always render. A FLEX track no machine owns that
 * goes to a RENDER_FLEX machine's render is guarded too, with stock's FLEX render in its place: an ordinary sample
 * track keeps playing (#999: with the silent source the guard dropped such tracks), and the machine's share of it
 * cannot stop the DSP (an MKII, 10 November 2026: FM Synth installed on no track, eight FLEX tracks, PLAY: a frame of
 * 141 % within 0.2 s and no frames after it).
 * Where a dearer render is still to come in the frame (by the last frame's order) and skipping that one alone would
 * make the room, this one runs and the dearer one is skipped when it comes: one track drops out, not the first in
 * track order whatever it costs. A skipped render comes back when the budget has room for its last cost, or as a
 * probe after PROBE skips, however far over it stands: the probe's time is its new cost, so one slow render (a pattern
 * change) costs a track at most PROBE frames, where an estimate that only fell by an eighth a render kept it nearly
 * silent for seconds, and one too far over to be probed for good. A probe that is still too dear makes one long frame
 * in PROBE, which the DSP takes (OCTATRACK_HARDWARE_TRAPS.md: one long frame does not stop the DSP). */
#ifndef DTCN3
#define DTCN3 (*(volatile uint32_t *)0xfc07c00cu) /* the frame timer: 132 MHz, free-running */
#endif
#define FRAME 47891u /* 16 samples at 44.1 kHz, in DTCN3 counts */
#define BURST (FRAME / 2u)
#define PROBE 1024u  /* frames, about 0.37 s */
typedef int Render(unsigned track, unsigned ping, unsigned start, unsigned end);
typedef int SourceStart(unsigned track, unsigned sample, unsigned flags);
/* Frame interrupt only, like mw_source_render_impl. The loader publishes rows
 * masked; no loader task can switch them during this interrupt. Callback,
 * descriptor and selected fallback stay live in this call's registers/stack,
 * which the existing paused-context scan retains if the context is paused.
 * This is not a snapshot lease for a UI/task caller. */
int mw_source_start_impl(unsigned track, unsigned sample, unsigned flags, SourceStart *fallback)
{
    if (track >= 8u) return 0;
    const Machine *m[ROWS - 5u], *who = 0;
    unsigned n = machines(m);
    if (!valid_bank()) return fallback ? fallback(track, sample, flags) : 0;
    if (!owner(m, n, current_part(), track, &who)) {
        start_refused[track] = 0;
        return orphan(current_part(), track) ? 0 : fallback ? fallback(track, sample, flags) : 0;
    }
    if (asleep(who)) { /* as an absent machine's track, until it wakes */
        start_refused[track] = 0, wake_who[track] = who;
        return 0;
    }
    if (!(who->flags & MODWERK_MACHINE_START)) {
        start_refused[track] = 0;
        return fallback ? fallback(track, sample, flags) : 0;
    }
    start_refused[track] = who;
    if (who->source_kind && charged[track] != who) return 0;
    SourceStart *call = 0;
    uintptr_t volatile *row = modwerk_runtime_event_row[STARTS];
    unsigned k;
    for (k = 0; k < ROWS - 5u && row[k]; ++k) {
        const struct modwerk_machine_start *r = (const struct modwerk_machine_start *)row[k];
        /* Octatrack contributor admission checks this record's complete extent
         * and same-package pointers. Read no extension beyond these 16 bytes. */
        if (r->abi != MODWERK_MACHINE_START_ABI || r->bytes != sizeof *r || !r->machine || !r->start) return 0;
        if (r->machine == who) {
            if (call) return 0;
            call = r->start;
        }
    }
    if (row[k] || !call) return 0;
    int result = call(track, sample, flags);
    start_refused[track] = 0;
    return result;
}
/* Stock (or Mute Modes) calls this only if the trig is dispatched. Keep no
 * selected fallback in global state: a suppressed call has nothing to retire.
 * The frame interrupt cannot be interrupted by a loader task between selection
 * and this call; paused-context scans retain its selected callback/descriptor. */
static int source_start_dispatch(unsigned track, unsigned sample, unsigned flags)
{
    return mw_source_start_impl(track, sample, flags, 0);
}
static uint8_t starting, start_prev; /* the frame guard's: tracks that started a note this frame, and the last */
SourceStart *mw_source_start_select(unsigned track, SourceStart *fallback)
{
    if (track >= 8u) return 0;
    starting |= (uint8_t)(1u << track); /* every START, a module's or stock's: its render is the dear one */
    if (!valid_bank()) return fallback;
    const Machine *m[ROWS - 5u], *who = 0;
    unsigned n = machines(m);
    if (owner(m, n, current_part(), track, &who)) {
        if (who->flags & MODWERK_MACHINE_START || asleep(who)) return source_start_dispatch;
    } else if (orphan(current_part(), track)) {
        return source_start_dispatch;
    }
    start_refused[track] = 0;
    return fallback;
}
volatile uint32_t mw_frame_t0, mw_frame_share = FRAME / 5u * 4u; /* development bases may change the share */
/* For diagnostics: the longest frame interrupt, the latest start past the frame's time, the time spent in it (/256)
 * over its frames, the skips and their tracks. */
volatile uint32_t mw_frame_max, mw_frame_late_max, mw_frame_busy, mw_frame_count, mw_frame_sheds, mw_frame_shed_tracks;
volatile uint32_t mw_frame_last; /* how long the frame interrupt last ran: diag.c's trace of the frames before a stall */
volatile uint32_t mw_frame_window; /* the longest frame interrupt since status.c last read it (the CPU guard) */
/* The brake (owner, 22 November 2026: past a longest frame of about 135 % the unit hung, within seconds or minutes and
 * with no record, twice; dropped renders on a heavy project are fine, a hang never is). When the frame interrupt has
 * fallen BRAKE_LATE behind, more than the guard's own credit ever lets it, every module machine track renders stock's
 * silent source, as one past the CPU budget does, until STOP or a Part change; stock keeps playing and diag.c logs it.
 * An effect's ColdFire work it cannot stop. shortcut: two frames, above the one the guard's debt may reach; set it from
 * mw_frame_late_max on heavy runs that held. */
#define BRAKE_LATE (2u * FRAME)
volatile uint8_t mw_frame_brake;   /* nonzero while braked */
volatile uint32_t mw_frame_brakes; /* for diagnostics: how often */
/* status.c's predicted brake (owner, 22 November 2026): for the pattern that plays and one queued, in the high half and
 * the low, the pattern (bank × 16 + pattern) above the module machine tracks (bit t) that play silent there from its
 * first frame, its stock load with the Part's modules passing the frame ceiling; no tracks, none. The frame interrupt
 * reads the pattern that plays at each render. */
volatile uint32_t mw_hush;
/* ... and for the same two patterns, the pattern above the ev_frame_deadline rows (bit i) whose effect bypasses dry
 * there (`rest`): only a module that subscribes it can, so no other effect is touched (owner, 22 November 2026). */
volatile uint32_t mw_hush_fx[2];
static int braked(unsigned track)
{
    uint32_t h = mw_hush, id = (uint32_t)U8(PLAYING) * 16u + U8(PLAYING + 1u);
    return mw_frame_brake || (h >> 24 == id && h >> 16 >> track & 1u) || ((h >> 8 & 0xffu) == id && h >> track & 1u);
}
volatile uint32_t mw_frame_cost_max[16]; /* each guarded render's longest time since the last read: what a machine's `cpu` is set from */
static int32_t credit;
static uint32_t late, cost[16], after[16], end_at[16], timed; /* [track], then a track's second render [8 + track] */
static uint32_t start_cost[16], start_after[16]; /* each render's cost, and the work after it, in the last frame a note started (the ceiling) */
static uint16_t skipped[16];
static uint32_t before;            /* the renders the last frame made (bit k), skipped or not */
static uint8_t place[16], next[16], made; /* a render's place in the last frame's order, and in this frame's so far */
/* The late-entry wait. The budget bounds how long a frame interrupt runs; this is about when the next one enters. A
 * long frame interrupt makes the next enter late against the DSP's frame grid. An entry about 150 µs late can be
 * followed by a frame exchange that stops for good, while entries less late run on and later ones make the DSP skip
 * one frame and run on (docs/MODULE_PERFORMANCE.md has the measurements). So an entry more than LATE_LO and less than LATE_HI late waits here until it is
 * LATE_HI late: at most 110 µs, with the interrupt held, before mw_frame_t0 is stamped, so the budget does not charge
 * the wait to the frame. An entry's lateness is the last entry's plus the time between the two less GRID (a frame and
 * 0.5 µs, so that an error decays), never below 0; within NEAR of a whole frame or past it, it is less that frame
 * (the DSP skipped one: left at a frame less 0.5 µs it would decay into the window 0.1 s later and every entry
 * would wait); IDLE or more after the last entry it is 0. The timer wraps every 32.5 s: only differences are used.
 * On a unit (owner's MKII, 22 November 2026, base 0.8 twins) the stall came at a pattern change from an empty pattern to
 * a busy one with modules placed, the entry 131 to 162 µs late after a 465 to 530 µs frame. With the frame ceiling
 * (FRAME_CEILING) alone the first such switch still stalled (twin 18672928, stall 55); with the ceiling and this wait,
 * twenty in a row ran on, each with one to eight entries held (the wait alone held eight and stalled on the ninth). So
 * every base waits; a development base can switch it off for a comparison (dev.c LATE). A held entry puts up to 553 µs between
 * two frames: the self-test allows that much (selftest.h's SELFTEST_FRAME_LIMIT). */
#define GRID (FRAME + 66u)
#define NEAR 2640u     /* 20 µs */
#define LATE_LO 10560u /* 80 µs: stall 56 (twin 24) came from an entry the trace put 138 µs late and this clock under 110 */
#define LATE_HI 25080u /* 190 µs */
#define IDLE (4u * GRID)
#define DEADLINE_LATE (10560u - 2640u) /* 80 µs late, less a 20 µs margin */
volatile uint32_t mw_late_wait_on = 1;
/* For diagnostics, since the last read: the latest entry, the entries in the window, the waits and the longest. */
volatile uint32_t mw_late_max, mw_late_hits, mw_late_waits, mw_late_wait_max;
volatile uint32_t mw_frame_skips; /* every wait since boot, each a DSP frame skipped (diag.c's `late` incident) */
/* Since boot, the entries LATE_HI late or more (short of IDLE, so after a frame), which the wait cannot hold. octabam's
 * frame log (FAILURE_MODES.md at 42856db2, Sam Banks) had two such entries, 205 and 209 µs late, and both stalled the
 * DSP for good, while 23 from 155 to 223 µs skipped a frame and ran on. Counted, not braked: diag.c logs it with the
 * `late` incident and pages it beside the guard's skips (MWSK), and a trial fails when it rises. */
volatile uint32_t mw_late_over;
/* A held entry stamps its lateness before the wait, so after one held to LATE_HI a body of 283 to 363 µs puts the next
 * entry in the window again, and so on: the frame interrupt would never leave level 5. Between a pattern's steps the
 * frames are light and break such a chain (on the unit no more than eight entries in a row were held, at a pattern
 * switch), but a module-heavy Part could keep one going; past WAIT_RUN in a row the brake silences the module machines,
 * which ends it. The wait itself never stops: an entry let through in the window is what stalls the DSP for good. */
#define WAIT_RUN 16u
static uint32_t entry_at, entry_late, wait_run;
/* The last eight entries' lateness, DTCN3 counts, as this clock saw it: diag.c keeps them with a stall ("MWLR"). The
 * stall trace is stamped later in the frame (dl_frame), so the two can differ by tens of µs. */
volatile uint16_t mw_late_ring[8];
volatile uint32_t mw_late_count;
/* From the frame interrupt's entry, after stock's register save (machine_registry.s): level 5, stock's stack. */
void mw_frame_enter(void)
{
    uint32_t now = DTCN3, gap = now - entry_at, l = 0;
    entry_at = now;
    if (gap < IDLE) {
        l = entry_late + gap;
        do l = l > GRID ? l - GRID : 0; while (l >= GRID - NEAR);
    }
    entry_late = l;
    mw_late_ring[mw_late_count & 7u] = (uint16_t)l, mw_late_count = mw_late_count + 1u; /* l < GRID */
    if (l > mw_late_max) mw_late_max = l;
    if (l > LATE_LO && l < LATE_HI) {
        mw_late_hits = mw_late_hits + 1u;
        if (mw_late_wait_on) {
            uint32_t need = LATE_HI - l, waited;
            do waited = DTCN3 - now; while (waited < need);
            mw_late_waits = mw_late_waits + 1u, mw_frame_skips = mw_frame_skips + 1u;
            if (waited > mw_late_wait_max) mw_late_wait_max = waited;
            now += waited;
            if (++wait_run >= WAIT_RUN && !mw_frame_brake) mw_frame_brake = 1, mw_frame_brakes = mw_frame_brakes + 1u;
        }
    } else {
        wait_run = 0;
        if (l >= LATE_HI) mw_late_over = mw_late_over + 1u; /* l < GRID - NEAR, and 0 after IDLE */
    }
    mw_frame_t0 = now;
    /* ev_frame_deadline (owner, 22 November 2026): by when work at IPL 5 (stock's delay routine, a ColdFire effect's
     * detours in it) must end for the next entry to be no more than 60 µs late: this frame's grid time (its entry less
     * its lateness), a frame on, 80 µs late, less a 20 µs margin. Tape Echo's work there is no render the guard can
     * drop, and took a busy Part past the frame ceiling and its entries into the late window. */
    uint32_t deadline = entry_at - l + GRID + DEADLINE_LATE;
    uintptr_t volatile *row = modwerk_runtime_event_row[MODWERK_EV_FRAME_DEADLINE - RUNTIME_EVENTS];
    uint32_t id = (uint32_t)U8(PLAYING) * 16u + U8(PLAYING + 1u), rest = 0; /* the predicted brake's dry effects, latched */
    for (unsigned p = 0; p < 2u; ++p) if (mw_hush_fx[p] >> 24 == id) rest |= mw_hush_fx[p] & 0xffffffu;
    if (row) for (unsigned i = 0; *row; ++row, ++i) ((unsigned (*)(uint32_t, unsigned))*row)(deadline, i < 24u ? rest >> i & 1u : 0u);
}
void mw_frame_exit(void)
{
    uint32_t now = DTCN3, d = now - mw_frame_t0, due = d + late;
    if (d > mw_frame_max) mw_frame_max = d;
    if (d > mw_frame_window) mw_frame_window = d;
    mw_frame_last = d;
    late = due > FRAME ? due - FRAME : 0;
    if (late > BRAKE_LATE && !mw_frame_brake) mw_frame_brake = 1, mw_frame_brakes = mw_frame_brakes + 1u;
    if (late > mw_frame_late_max) mw_frame_late_max = late;
    int32_t c = credit + (int32_t)mw_frame_share - (int32_t)d;
    credit = c > (int32_t)BURST ? (int32_t)BURST : c < -(int32_t)FRAME ? -(int32_t)FRAME : c;
    mw_frame_busy += d >> 8, mw_frame_count = mw_frame_count + 1u;
    if (timed) for (unsigned k = 0; k < 16u; ++k) if (timed >> k & 1u) {
        after[k] = now - end_at[k], place[k] = next[k];
        if (starting) { uint32_t a = after[k], fall = start_after[k] - (start_after[k] >> 3); start_after[k] = a > fall ? a : fall; }
    }
    before = timed, timed = 0, made = 0;
    start_prev = starting, starting = 0;
    frame_seen = 0;
}
/* Whether a render dearer than k, and dear enough to make up `over` alone, is still to come in this frame. */
static unsigned dearer_later(unsigned k, uint32_t over)
{
    if (!(before >> k & 1u)) return 0;
    for (unsigned j = 0; j < 16u; ++j)
        if (before >> j & 1u && !(timed >> j & 1u) && place[j] > place[k] && cost[j] > cost[k] && cost[j] >= over) return 1;
    return 0;
}
/* The ceiling (owner's MKII, 22 November 2026): a single frame interrupt of about 465 µs, 128 % of a frame, stopped the
 * DSP's frame exchange for good, whether a pattern change or an overload made it, before the brake's backlog could
 * build (stalls 49 to 52). So no module render that would end the frame past FRAME_CEILING runs, whatever the credit;
 * a DSP voice's ColdFire side, which the share never drops, is timed and held to it too (`share` 0). */
#define FRAME_CEILING (FRAME + 10560u) /* + 80 µs: 443 µs, 122 % */
/* f, or `instead` when f would overdraw the frame (`share`) or end it past the ceiling. */
static int guarded_as(Render *f, Render *instead, unsigned track, unsigned ping, unsigned start, unsigned end, int share)
{
    if (track >= 8u) return f(track, ping, start, end);
    unsigned k = track + 8u * (timed >> track & 1u);
    uint32_t at = DTCN3, ends = at - mw_frame_t0 + cost[k] + after[k]; int r;
    int32_t over = (int32_t)ends - credit - (int32_t)mw_frame_share;
    /* A note start costs a render far more than its steady frames (FM Synth on T8: 90 and 80 µs at C01's step 1, a few
     * µs between, owner's MKII, 22 November 2026), and the stock starts after it in the frame cost more too. A step's
     * frame is one where any track started a note (FM Synth starts its own, past the base, so a track cannot tell): in it
     * each render is judged at the ceiling by what it, and the work after it, cost in the last step's frame. Past the
     * ceiling no probe runs it: a render the guard knows would end the frame there is what stalls the DSP; it comes back
     * when the rest of the frame leaves room, or afresh after STOP, a Part change (ceiling_tick) or another machine on
     * its track (guard_forget). shortcut: the first step since boot, and since then, has no figure yet and runs on the
     * steady costs. */
    unsigned starts = (starting | start_prev) != 0;
    uint32_t peak = starts ? at - mw_frame_t0 + (start_cost[k] > cost[k] ? start_cost[k] : cost[k]) + (start_after[k] > after[k] ? start_after[k] : after[k]) : ends;
    int ceiling = peak > FRAME_CEILING && !dearer_later(k, peak - FRAME_CEILING);
    if (ceiling || (share && over > 0 && !dearer_later(k, (uint32_t)over) && skipped[k] < PROBE && ++skipped[k] < PROBE)) {
        if (ceiling && skipped[k] < 0xffffu) ++skipped[k]; /* timed afresh when it runs again */
        mw_frame_sheds = mw_frame_sheds + 1u, mw_frame_shed_tracks |= 1u << track;
        r = instead(track, ping, start, end);
    } else {
        unsigned back = skipped[k] != 0;
        skipped[k] = 0;
        r = f(track, ping, start, end);
        uint32_t c = DTCN3 - at, fall = cost[k] - (cost[k] >> 3);
        cost[k] = back || c > fall ? c : fall; /* a rise at once, a fall by an eighth a frame; after skips, as measured */
        if (starting) start_cost[k] = c > start_cost[k] - (start_cost[k] >> 3) ? c : start_cost[k] - (start_cost[k] >> 3);
        else if (starts && c > start_cost[k]) start_cost[k] = c; /* the frame after a step's: only a dearer one counts */
        if (c > mw_frame_cost_max[k]) mw_frame_cost_max[k] = c;
    }
    end_at[k] = DTCN3, timed |= 1u << k, next[k] = made++;
    return r;
}
static int guarded(Render *f, Render *instead, unsigned track, unsigned ping, unsigned start, unsigned end)
{
    return guarded_as(f, instead, track, ping, start, end, 1);
}
static const Part *ceiling_part;
/* At STOP or a Part change, renders the ceiling holds are timed afresh. */
static void ceiling_tick(void)
{
    const Part *part = valid_bank() ? current_part() : 0;
    if (!modwerk_machine_stopped() && part == ceiling_part) return;
    ceiling_part = modwerk_machine_stopped() ? 0 : part;
    uint32_t mask = modwerk_machine_mask();
    for (unsigned k = 0; k < 16u; ++k) /* a held render: measured again when it next runs, its step figures too */
        if (skipped[k]) cost[k] = start_cost[k] = start_after[k] = 0;
    modwerk_machine_unmask(mask);
}
static void guard_forget(unsigned track)
{
    if (track >= 8u) return;
    uint32_t mask = modwerk_machine_mask();
    for (unsigned k = track; k < 16u; k += 8u) cost[k] = after[k] = start_cost[k] = start_after[k] = 0, skipped[k] = 0;
    modwerk_machine_unmask(mask);
}
/* The FLEX renderer, in the audio render: no mask. The row is read once, a word at a time; a module that left
 * stays in memory while the render holds it (the paused-task scan).
 * By default a track a machine renders itself keeps stock's FLEX retrig and voice stopped every render. A module
 * machine is FLEX underneath: on each of its trigs the frame builder starts
 * stock's FLEX voice (byte 0 of 0x800049d8 + 168 * track, see hush()) and latches the track's RTRG into its render
 * state (0x80004898 + 40 * track, +4), both from the machine's bytes read as FLEX settings, and nothing advances them.
 * When the track renders as FLEX again without passing mw_assign (a bank, pattern or Part change, a project load),
 * stock rendered them. On a track that was the machine since power-on the retrig interval was never computed (0), so
 * the first FLEX segment restarted the voice on every sample: more sections than the record's header can name, which
 * stock's DSP source misread and overran X memory with, and DSP core 1 jumped to P:0 for good (an MKII and
 * ot_emu, 29 October 2026: Analog BD on T1 in bank B, FLEX in bank C, cold boot, PLAY, B -> C; #1051). FM Synth's own
 * render already clears the RTRG count; this does it for every machine with a render of its own. Stopped, nothing
 * overruns: stock's render restarts the voice at most once, and the next trig as FLEX starts both from FLEX's own
 * settings. A NATIVE_FLEX machine explicitly consumes that native voice with translating START/render callbacks:
 * keep the voice, still clear retrigs, and stop both if START or DSP admission refuses it. */
#define RENDER_STATE 0x80004898u
#define RENDER_STATE_STRIDE 40u
static void stop_stock(unsigned track)
{
    U8(VOICE + VOICE_STRIDE * track) = 0;
    *(volatile uint32_t *)AT(RENDER_STATE + RENDER_STATE_STRIDE * track + 4u) = 0; /* the RTRG count: no run of retrigs */
}
static unsigned render_rows(const Machine **m)
{
    unsigned n = 0;
    for (uintptr_t volatile *row = modwerk_runtime_event_row[MACHINES]; n < ROWS - 5u; ++row) {
        uintptr_t v = *row; if (!v) break;
        if (((const Machine *)v)->abi == MODWERK_MACHINE_ABI) m[n++] = (const Machine *)v;
    }
    return n;
}
/* Track t's machine in the current Part (OWNED), an absent known machine's signature (ORPHAN) or neither, from
 * looked[] while the Part, the type byte and the signature are the ones it was worked out from. */
static unsigned look(unsigned t, const Machine **who)
{
    if (!(frame_seen >> t & 1u) || !(looked_up >> t & 1u)) {
        if (!(frame_seen >> 8 & 1u)) frame_part = valid_bank() ? current_part() : 0, frame_seen |= 1u << 8;
        const Part *part = frame_part, *s = part ? part + SIG + 30 * t : 0; /* no offset from a null Part */
        if (!part) return NOBODY;
        uint32_t bytes = (uint32_t)part[0x22 + t] << 24 | (uint32_t)s[0] << 16 | (uint32_t)s[1] << 8 | s[2];
        if (!(looked_up >> t & 1u) || looked[t].part != part || looked[t].bytes != bytes) {
            const Machine *m[ROWS - 5u]; unsigned n = render_rows(m);
            looked[t].kind = owner(m, n, part, t, &looked[t].who) ? asleep(looked[t].who) ? ASLEEP : OWNED : orphan(part, t) ? ORPHAN : NOBODY;
            looked[t].part = part, looked[t].bytes = bytes, looked_up |= 1u << t;
        }
        frame_seen |= 1u << t;
    }
    *who = looked[t].who;
    return looked[t].kind;
}
int mw_source_render_impl(unsigned track, unsigned ping, unsigned start, unsigned end)
{
    const Machine *who = 0;
    unsigned kind = track < 8u ? look(track, &who) : NOBODY;
    if (kind == OWNED) {
        int native_flex = who->render &&
            (who->flags & (MODWERK_MACHINE_NATIVE_FLEX | MODWERK_MACHINE_START)) ==
            (MODWERK_MACHINE_NATIVE_FLEX | MODWERK_MACHINE_START);
        if (who->render) {
            if (native_flex) /* translated native reader: keep its voice, never stale RTRG */
                *(volatile uint32_t *)AT(RENDER_STATE + RENDER_STATE_STRIDE * track + 4u) = 0;
            else stop_stock(track); /* independent voices keep the existing stale-voice protection */
        }
        if (start_refused[track] == who) {
            if (native_flex) stop_stock(track);
            return STOCK(Render *, 0x400047f0u)(track, ping, start, end);
        }
        if (who->source_kind && charged[track] != who) { /* never an unpaid voice */
            if (native_flex) stop_stock(track);
            return STOCK(Render *, 0x400047f0u)(track, ping, start, end);
        }
        if (mw_cpu_refused >> track & 1u || braked(track)) { /* past the CPU budget (charge()), or braked */
            if (native_flex) stop_stock(track);
            return STOCK(Render *, 0x400047f0u)(track, ping, start, end);
        }
        Render *f = who->render ? who->render : STOCK(Render *, 0x40004008u); /* POLY8's voices render inside stock's */
        return who->source_kind ? guarded_as(f, STOCK(Render *, 0x400047f0u), track, ping, start, end, 0) : guarded(f, STOCK(Render *, 0x400047f0u), track, ping, start, end);
    } else if (kind == ORPHAN || kind == ASLEEP) { /* its bytes are the absent machine's, not FLEX's */
        if (kind == ASLEEP) wake_who[track] = who; /* resting: its detours hold stock's bytes until it wakes */
        stop_stock(track);
        return STOCK(Render *, 0x400047f0u)(track, ping, start, end);
    }
    /* Mostly stock's own FLEX render; FM Synth also plays a legacy FMSYNTH-named sample as FM here (#999). */
    if (!(looked_up >> 8 & 1u)) {
        const Machine *m[ROWS - 5u]; unsigned n = render_rows(m);
        flex_machine = 0;
        for (unsigned k = 0; k < n && !flex_machine; ++k)
            if (m[k]->flags & MODWERK_MACHINE_RENDER_FLEX && m[k]->render) flex_machine = m[k];
        looked_up |= 1u << 8;
    }
    if (flex_machine && !braked(track)) return guarded(flex_machine->render, STOCK(Render *, 0x40004008u), track, ping, start, end);
    return STOCK(Render *, 0x40004008u)(track, ping, start, end);
}
/* A renderer a module put into a track's slots itself, from the frame builder's two calls (machine_registry.s).
 * FM Synth 0.1.2 writes its own over the STATIC entry and at the slot copy (0x4000d514), so its tracks never came
 * through mw_source_render and neither the frame guard nor the CPU budget saw them (an MKII, 12 November 2026: three
 * FM Synth tracks beside a busy stock pattern, PLAY, the unit froze). Its machine's track is refused or guarded here
 * like any other machine's; a STATIC or FLEX track nobody owns keeps stock's sample render when the module's would
 * overdraw the frame. */
Render *volatile mw_foreign_fn; /* the renderer of this call, set by mw_render_call */
int mw_foreign_render(unsigned track, unsigned ping, unsigned start, unsigned end)
{
    Render *f = mw_foreign_fn; const Machine *who = 0;
    if (track >= 8u) return f(track, ping, start, end);
    unsigned kind = look(track, &who);
    if (kind == NOBODY) /* THRU, NEIGHBOR and PICKUP have no stand-in here */
        return frame_part && frame_part[0x22 + track] <= 1u
            ? braked(track) ? STOCK(Render *, 0x40004008u)(track, ping, start, end) : guarded(f, STOCK(Render *, 0x40004008u), track, ping, start, end)
            : f(track, ping, start, end);
    if (kind == ASLEEP) wake_who[track] = who;
    if (kind == ORPHAN || kind == ASLEEP || start_refused[track] == who || mw_cpu_refused >> track & 1u || braked(track) ||
        (who->source_kind && charged[track] != who))
        return STOCK(Render *, 0x400047f0u)(track, ping, start, end);
    return who->source_kind ? guarded_as(f, STOCK(Render *, 0x400047f0u), track, ping, start, end, 0) : guarded(f, STOCK(Render *, 0x400047f0u), track, ping, start, end);
}

/* ---- The machines a project uses (owner, 16 November 2026: machines in the project map) ------------------------------
 * A Part names a machine only by its signature: two letters and a version at 60 + 30 * track. That names no module, so
 * with the machine absent (switched off on MODULES, removed, or never installed on this unit) nothing could say which
 * one the track wants: POLY8's tracks just read as FLEX. This map remembers, for each machine the project uses, its
 * signature and version range, its module and its name: in battery RAM, so a power cycle keeps it, and in project.work
 * as '#MODWERK_MC=' lines (fxmap.c writes and reads them), so the project carries it to another unit. An installed
 * machine is noted when a track takes it, when a project loads or saves and when the installed set changes. MISSING
 * lists the entries the project names that no installed machine serves (dsp.c), and a track of one says so when it is
 * selected. The UI task works that out twice a second (modwerk_machine_map_refresh); the USB request and the page only
 * read the result, so neither scans a bank nor holds the machine table. */
struct mc_entry { uint32_t module; uint8_t sig[2], lo, hi; char name[16]; };
struct mc_map { uint32_t magic, generation; struct mc_entry e[MODWERK_MACHINE_MAP]; uint32_t sum; };
#define MC_MAGIC 0x4d574d43u /* 'MWMC' */
#ifdef MW_HOST
static struct mc_map host_mc_map;
#define MCMAP (&host_mc_map)
#ifndef MW_BANKS
#define MW_BANKS 1u
#define MW_BANK_AT(b) (0x46000000u + 0u * (b)) /* the model holds one bank */
#endif
#else
/* Battery RAM after diag.c's trace of the frames before a stall (sdk/machines/octatrack/battery-ram.json). */
#define MCMAP ((volatile struct mc_map *)0x100ffd40u)
typedef char mc_map_fits[0x100ffd40u + sizeof(struct mc_map) <= 0x100fff00u ? 1 : -1];
#define MW_BANKS 16u
#define MW_BANK_AT(b) (0x400e21e0u + (b) * 0x9b340u) /* all 16 banks stay in RAM (fxmap.c's PART_FX) */
#endif
static uint32_t mc_checksum(void)
{
    const volatile uint8_t *p = (const volatile uint8_t *)MCMAP;
    uint32_t sum = 0x6d63u;
    for (unsigned i = 0; i < sizeof(struct mc_map) - 4u; ++i) sum = sum * 31u + p[i];
    return sum;
}
static void mc_seal(void) { MCMAP->magic = MC_MAGIC, MCMAP->generation = MCMAP->generation + 1u, MCMAP->sum = mc_checksum(); }
/* A map this base can read, or an empty one: a fresh battery, or damage. */
static void mc_valid(void)
{
    if (MCMAP->magic == MC_MAGIC && MCMAP->sum == mc_checksum()) return;
    volatile uint8_t *p = (volatile uint8_t *)MCMAP;
    for (unsigned i = 0; i < sizeof(struct mc_map); ++i) p[i] = 0;
    mc_seal();
}
static void mc_put(volatile struct mc_entry *e, uint32_t module, const uint8_t *sig, unsigned lo, unsigned hi, const char *name)
{
    e->module = module, e->sig[0] = sig[0], e->sig[1] = sig[1], e->lo = (uint8_t)lo, e->hi = (uint8_t)hi;
    unsigned i = 0;
    for (; name && i < 15u && name[i]; ++i) e->name[i] = name[i];
    for (; i < 16u; ++i) e->name[i] = 0;
}
/* Each machine-signed track of every bank's Parts, working and saved: `found` gets, per entry, whether one names it,
 * and `mine` (installed machines m[0..n), may be 0) whether one of them owns it. */
static uint32_t mc_scan(const Machine *const *m, unsigned n, uint32_t *mine)
{
    uint32_t found = 0, owned = 0;
    if (!valid_bank()) { if (mine) *mine = 0; return 0; }
    for (unsigned b = 0; b < MW_BANKS; ++b)
        for (unsigned p = 0; p < 8u; ++p) {
            const Part *part = AT(MW_BANK_AT(b) + (p < 4u ? PART_OFF : SAVED_OFF - 4u * PART_STRIDE) + p * PART_STRIDE);
            for (unsigned t = 0; t < 8u; ++t) {
                if (part[0x22 + t] > 1u) continue;
                const Part *s = part + SIG + 30u * t;
                if (!s[0]) continue;
                for (unsigned k = 0; k < MODWERK_MACHINE_MAP; ++k) {
                    const volatile struct mc_entry *e = &MCMAP->e[k];
                    if (e->module && s[0] == e->sig[0] && s[1] == e->sig[1] && s[2] >= e->lo && s[2] <= e->hi) found |= 1u << k;
                }
                for (unsigned k = 0; mine && k < n; ++k)
                    if (s[0] == m[k]->sig[0] && s[1] == m[k]->sig[1] && s[2] >= m[k]->sig_lo && s[2] <= m[k]->sig_hi) owned |= 1u << k;
            }
        }
    if (mine) *mine = owned;
    return found;
}
/* An installed machine into the map, by its module: its entry kept up to date, or a free one, or one the project does
 * not name. 1 when the map changed. */
static int mc_note(const Machine *who)
{
    struct runtime_owner o;
    if (!who || modwerk_runtime_owner_at((uintptr_t)who, &o) != 1 || !o.module) return 0;
    volatile struct mc_entry *free_one = 0;
    for (unsigned k = 0; k < MODWERK_MACHINE_MAP; ++k) {
        volatile struct mc_entry *e = &MCMAP->e[k];
        if (e->module == o.module) {
            int same = e->sig[0] == who->sig[0] && e->sig[1] == who->sig[1] && e->lo == who->sig_lo && e->hi == who->sig_hi;
            for (unsigned i = 0; same && i < 15u; ++i) {
                char c = who->label ? who->label[i] : 0;
                same = e->name[i] == c;
                if (!c) break;
            }
            if (same) return 0;
            mc_put(e, o.module, who->sig, who->sig_lo, who->sig_hi, who->label);
            return 1;
        }
        if (!e->module && !free_one) free_one = e;
    }
    if (!free_one) {
        uint32_t named = mc_scan(0, 0, 0);
        for (unsigned k = 0; k < MODWERK_MACHINE_MAP && !free_one; ++k) if (!(named >> k & 1u)) free_one = &MCMAP->e[k];
    }
    if (!free_one) return 0; /* sixteen machines the project uses: the rest go unnamed */
    mc_put(free_one, o.module, who->sig, who->sig_lo, who->sig_hi, who->label);
    return 1;
}
/* Every installed machine the project names into the map. */
static void mc_note_named(void)
{
    const Machine *m[ROWS - 5u]; unsigned n = machines(m), changed = 0;
    uint32_t mine;
    (void)mc_scan(m, n, &mine);
    for (unsigned k = 0; k < n; ++k) if (mine >> k & 1u) changed |= (unsigned)mc_note(m[k]);
    if (changed) mc_seal();
}
static volatile uint32_t mc_absent; /* the entries the project names that no installed machine serves: the UI task's */
static uint32_t mc_epoch, mc_refreshes;
static uint8_t mc_epoch_seen, mc_stale = 1;
/* status.c's tick, twice a second (the UI task): the map's check, a newly installed set's machines, and the absent
 * entries, worked out again every two seconds or at once after a change. */
void modwerk_machine_map_refresh(void)
{
    if (!(++mc_refreshes & 7u) || MCMAP->magic != MC_MAGIC) mc_valid(); /* the whole check every four seconds */
    uint32_t epoch = modwerk_runtime_owner_epoch();
    if (!mc_epoch_seen || epoch != mc_epoch) mc_epoch = epoch, mc_epoch_seen = 1, mc_note_named(), mc_stale = 1;
    static uint32_t generation;
    if (MCMAP->generation != generation) generation = MCMAP->generation, mc_stale = 1;
    if (!mc_stale && (mc_refreshes & 3u)) return;
    mc_stale = 0;
    const Machine *m[ROWS - 5u]; unsigned n = machines(m);
    uint32_t mine, named = mc_scan(m, n, &mine), absent = 0;
    use_scanned(m, n, mine); /* which machines' modules may rest (modwerk_machine_in_use) */
    fx_scanned();            /* and which effect modules */
    for (unsigned k = 0; k < MODWERK_MACHINE_MAP; ++k) {
        const volatile struct mc_entry *e = &MCMAP->e[k];
        if (!(named >> k & 1u)) continue;
        unsigned served = 0;
        for (unsigned i = 0; i < n && !served; ++i)
            served = m[i]->sig[0] == e->sig[0] && m[i]->sig[1] == e->sig[1] && m[i]->sig_lo <= e->hi && m[i]->sig_hi >= e->lo;
        if (!served) absent |= 1u << k;
    }
    mc_absent = absent;
}
/* dsp.c's MISSING list: entry k when the project names it and no installed machine serves it. Reads the refresh's
 * result only, so the USB request may ask. */
int modwerk_machine_absent(unsigned k, uint32_t *module, char *name)
{
    if (k >= MODWERK_MACHINE_MAP || !(mc_absent >> k & 1u) || MCMAP->magic != MC_MAGIC) return 0;
    const volatile struct mc_entry *e = &MCMAP->e[k];
    if (!e->module) return 0;
    *module = e->module;
    for (unsigned i = 0; i < 16u; ++i) name[i] = i < 15u ? e->name[i] : 0;
    return 1;
}
/* dsp.c's notice when a track is selected: the absent machine the current Part's track t is signed for. */
int modwerk_machine_track_absent(unsigned t, uint32_t *module, char *name)
{
    if (t >= 8u || !valid_bank() || MCMAP->magic != MC_MAGIC) return 0;
    const Part *part = current_part(), *s = part + SIG + 30u * t;
    if (part[0x22 + t] > 1u || !s[0]) return 0;
    for (unsigned k = 0; k < MODWERK_MACHINE_MAP; ++k) {
        const volatile struct mc_entry *e = &MCMAP->e[k];
        if (e->module && s[0] == e->sig[0] && s[1] == e->sig[1] && s[2] >= e->lo && s[2] <= e->hi)
            return modwerk_machine_absent(k, module, name);
    }
    return 0;
}
/* status.c's MISSING page: where the project names entry k first, as fxmap.c's modwerk_fxmap_where says it for an
 * effect: the current bank first, its working Parts before the saved copies, then the other banks in order. */
int modwerk_machine_where(unsigned k, unsigned *bank, unsigned *part_index, unsigned *track)
{
    if (k >= MODWERK_MACHINE_MAP || !valid_bank() || MCMAP->magic != MC_MAGIC || !MCMAP->e[k].module) return 0;
    const volatile struct mc_entry *e = &MCMAP->e[k];
    unsigned now = MW_BANKS > 1u ? (U32(BANK) - MW_BANK_AT(0)) / (MW_BANKS > 1u ? MW_BANK_AT(1) - MW_BANK_AT(0) : 1u) : 0u;
    if (now >= MW_BANKS) now = 0;
    for (unsigned b = 0; b < MW_BANKS; ++b) {
        unsigned at = !b ? now : b - 1u < now ? b - 1u : b;
        for (unsigned p = 0; p < 8u; ++p) {
            const Part *part = AT(MW_BANK_AT(at) + (p < 4u ? PART_OFF : SAVED_OFF - 4u * PART_STRIDE) + p * PART_STRIDE);
            for (unsigned t = 0; t < 8u; ++t) {
                const Part *s = part + SIG + 30u * t;
                if (part[0x22 + t] <= 1u && s[0] == e->sig[0] && s[1] == e->sig[1] && s[2] >= e->lo && s[2] <= e->hi) {
                    *bank = at, *part_index = p & 3u, *track = t;
                    return p < 4u ? 1 : 2;
                }
            }
        }
    }
    return 0;
}
/* status.c's MODULES page, a machine just switched off: where the project still names it, by its module. */
int modwerk_machine_where_module(uint32_t module, unsigned *bank, unsigned *part_index, unsigned *track)
{
    for (unsigned k = 0; module && k < MODWERK_MACHINE_MAP && MCMAP->magic == MC_MAGIC; ++k)
        if (MCMAP->e[k].module == module) return modwerk_machine_where(k, bank, part_index, track);
    return 0;
}
/* fxmap.c, a project load: its '#MODWERK_MC=' lines, then the end. A project with lines names its machines; one
 * without (saved before them) keeps the map there is. Either way the installed machines it names are noted. */
static struct mc_entry mc_staged[MODWERK_MACHINE_MAP];
static unsigned mc_staged_count;
void modwerk_machine_map_begin(void) { mc_staged_count = 0; }
void modwerk_machine_map_stage(const uint8_t *sig, unsigned lo, unsigned hi, uint32_t module, const char *name)
{
    if (!module || !sig[0] || lo > hi || hi > 255u || mc_staged_count >= MODWERK_MACHINE_MAP) return;
    for (unsigned k = 0; k < mc_staged_count; ++k) if (mc_staged[k].module == module) return;
    mc_put(&mc_staged[mc_staged_count++], module, sig, lo, hi, name);
}
void modwerk_machine_map_loaded(int ok)
{
    mc_valid();
    if (ok && mc_staged_count) {
        for (unsigned k = 0; k < MODWERK_MACHINE_MAP; ++k) {
            const struct mc_entry *s = &mc_staged[k];
            if (k < mc_staged_count) mc_put(&MCMAP->e[k], s->module, s->sig, s->lo, s->hi, s->name);
            else { static const uint8_t none[2]; mc_put(&MCMAP->e[k], 0, none, 0, 0, 0); }
        }
        mc_seal();
    }
    mc_staged_count = 0;
    mc_note_named();
    mc_stale = 1;
}
/* fxmap.c, a project save: entry k's line when the project names it, after the installed machines it names are noted. */
static uint32_t mc_written_named;
int modwerk_machine_map_line(unsigned k, uint8_t *sig, unsigned *lo, unsigned *hi, uint32_t *module, char *name)
{
    if (!k) mc_valid(), mc_note_named(), mc_written_named = mc_scan(0, 0, 0);
    if (k >= MODWERK_MACHINE_MAP || !(mc_written_named >> k & 1u)) return 0;
    const volatile struct mc_entry *e = &MCMAP->e[k];
    if (!e->module) return 0;
    sig[0] = e->sig[0], sig[1] = e->sig[1], *lo = e->lo, *hi = e->hi, *module = e->module;
    for (unsigned i = 0; i < 16u; ++i) name[i] = i < 15u ? e->name[i] : 0;
    return 1;
}
static void mc_assigned(const Machine *who)
{
    mc_valid();
    if (mc_note(who)) mc_seal();
    mc_stale = 1;
}
