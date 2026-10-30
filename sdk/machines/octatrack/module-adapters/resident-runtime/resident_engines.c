/* SPDX-License-Identifier: GPL-3.0-or-later
 * Resident controller engines on demand, the ColdFire side (resident_engines.h). UI task only, under the stable
 * lock: relocation, region bookkeeping and owned jobs. The frame interrupt sees only ordinary owned packets with
 * no relocation list (each word is final before the WRITE is reserved). */
#include "resident_engines.h"
#include "transfer.h"
#include "dsp_ledger.h"

#ifdef MW_ENGINES_TEST
int mw_engines_test_quiet(void);
int mw_engines_test_queued(void);
int mw_engines_test_settled(void);
#define QUIET() mw_engines_test_quiet()
#define QUEUED() mw_engines_test_queued()
#define SETTLED() mw_engines_test_settled()
#else
int modwerk_machine_stopped(void);
/* A pattern change is queued (dsp.c's compaction reads the same bytes). */
#define QUEUED() (*(volatile uint8_t *)0x800065bfu != *(volatile uint8_t *)0x800065bdu || \
                  *(volatile uint8_t *)0x800065c0u != *(volatile uint8_t *)0x800065beu)
/* Stopped (no track or recorder running), and no pattern change queued. */
#define QUIET() (modwerk_machine_stopped() && !QUEUED())
extern volatile uint32_t modwerk_runtime_ticks, modwerk_status_key_at; /* runtime.c, status.c: UI ticks (60 Hz), the last key */
int modwerk_dsp_moves_idle(void);                                       /* dsp.c: no self-test, rebind or waiting pick */
/* Live FX code may move for an engine (an evacuation, beside QUIET): two seconds after the last key or knob and no pick
 * waiting, as dsp.c's compaction waits. */
#define SETTLED() (modwerk_runtime_ticks - modwerk_status_key_at >= 120u && modwerk_dsp_moves_idle())
#endif

struct mw_engine mw_engines[2][MW_ENGINE_FEATURES];
volatile uint32_t mw_engines_jobs, mw_engines_placed_count, mw_engines_unplaced_count, mw_engines_refused;
volatile uint8_t mw_engines_wait[2][MW_ENGINE_FEATURES], mw_engines_admitted[MW_ENGINE_FEATURES];
/* ABI 9 (loader.h): a package may require the key bus; the board holds it for them (controller_board.c). */
unsigned modwerk_machine_dsp_features(void) { return MW_DSP_KEYBUS; }
#ifdef MODWERK_DEV
struct mw_engines_view mw_engines_view = {.magic = {'M', 'W', 'E', 'V'}}; /* initialized: in .data, inside the dev MEM window */
#endif
enum { LANE_IDLE, LANE_WRITE, LANE_PLACE, LANE_UNPLACE };
static struct { struct dl_owned_job job; uint8_t op, k; } lane[2];
/* What each core's buffer holds: engine k + 1 of `generation` relocated for table offset `offset` (0: nothing yet). A
 * WRITE that has to wait for the transport does not relocate again on every tick. */
static struct { uint16_t offset; uint8_t k; uint32_t generation; } buffered[2];
/* A packaged feature's engine per core, for `generation`: its package's unit (mw_engines_package). */
static struct mw_engine_unit packaged[2][MW_ENGINE_FEATURES];
static uint32_t packaged_generation[MW_ENGINE_FEATURES];
/* A job of ours failed or is uncertain on this core: the owned transport closed it for the boot (its fail-closed
 * rule), so nothing more is placed or unplaced there. Placed engines stay placed, free spans stay free. */
static uint8_t closed[2];
/* Ours, or closed from outside the engines (a legacy packet aged out, the stall watchdog's abort, a failed key-bus
 * job, a sequence wrap): either way no owned job reaches this core again this boot, so its engines read STUCK and a
 * new reader is refused at admission rather than waiting on the transport for good. */
static int shut(unsigned c) { return closed[c] || dl_owned_closed(c); }
static unsigned wanted_now; /* mw_engines_want */
static unsigned deferred[2] = {~0u, ~0u}; /* a play-time claim had to move or retire code: what it needed, until quiet */
void mw_engines_want(unsigned features) { wanted_now = features; }
int mw_engines_settled(void) { return QUIET() && SETTLED(); }

typedef char mw_engine_features_are_the_ledgers[MW_ENGINE_FEATURES == MW_DSP_COUNT ? 1 : -1]; /* dsp_ledger.h */
static unsigned index_of(unsigned feature) { return MW_DSP_INDEX(feature); }
static int is_packaged(unsigned k) { return (MW_DSP_PACKAGED >> k & 1u) != 0; }
static const struct mw_engine_unit *unit_of(unsigned c, unsigned k) { return is_packaged(k) ? &packaged[c][k] : &mw_engine_units[c][k]; }
/* Core c carries engine k: the base's unit there, or a packaged feature's core. */
static int runs(unsigned c, unsigned k) { return is_packaged(k) ? (int)(MW_DSP_CORES(1u << k) >> c & 1u) : mw_engine_units[c][k].count != 0; }
static unsigned arena(unsigned c) { return dl_pool_words[c] > DL_CODE_START ? dl_pool_words[c] - DL_CODE_START : 0u; }

void mw_engine_relocate(const struct mw_engine_unit *u, uint32_t base, uint32_t *out)
{
    for (unsigned i = 0; i < u->count; ++i) out[i] = u->words[i] & 0xffffffu;
    for (unsigned r = 0; r < u->relocation_count; ++r) {
        unsigned i = u->relocations[r] & 0x7fffu;
        out[i] = (u->relocations[r] & 0x8000u ? out[i] - base : out[i] + base) & 0xffffffu;
    }
    /* The long branch's own address is the word before its displacement. */
    if (u->exit) out[u->exit] = ((uint32_t)u->exit_target - (base + u->exit - 1u)) & 0xffffffu;
}

void mw_engines_package(unsigned feature, uint32_t generation, const struct mw_engine_unit units[2])
{
    unsigned k = index_of(feature);
    if (k >= MW_ENGINE_FEATURES || !is_packaged(k) || !generation) return;
    packaged[0][k] = units[0], packaged[1][k] = units[1], packaged_generation[k] = generation;
}

/* Each engine's span on a core: its offset (-1: none) and words. */
struct spans { int at[MW_ENGINE_FEATURES]; unsigned words[MW_ENGINE_FEATURES]; };
static void spans_of(unsigned c, struct spans *s)
{
    for (unsigned k = 0; k < MW_ENGINE_FEATURES; ++k)
        s->at[k] = mw_engines[c][k].state == MW_ENGINE_FREE ? -1 : (int)mw_engines[c][k].offset, s->words[k] = mw_engines[c][k].count;
}
/* The highest offset in core c's arena where n words meet no span but `skip`'s (top-down first fit, holes reused).
 * -1: no room. */
static int spot(unsigned c, unsigned n, const struct spans *s, unsigned skip)
{
    unsigned top = arena(c);
    if (!n || n > top) return -1;
    int at = (int)(top - n);
    for (unsigned moved = 1; moved;) {
        moved = 0;
        for (unsigned k = 0; k < MW_ENGINE_FEATURES; ++k) {
            if (k == skip || s->at[k] < 0) continue;
            int end = s->at[k] + (int)s->words[k];
            if (at < end && at + (int)n > s->at[k]) {
                at = s->at[k] - (int)n;
                if (at < 0) return -1;
                moved = 1;
            }
        }
    }
    return at;
}
/* Engine k's n words where they would go now; 0 when they do not fit. */
static int add_span(unsigned c, struct spans *s, unsigned k, unsigned n)
{
    int at = spot(c, n, s, k);
    if (at < 0) return 0;
    s->at[k] = at, s->words[k] = n;
    return 1;
}
/* What the region must reserve for these spans: from the lowest up to the arena's top. */
static unsigned reserve_of(unsigned c, const struct spans *s)
{
    unsigned low = arena(c);
    for (unsigned k = 0; k < MW_ENGINE_FEATURES; ++k) if (s->at[k] >= 0 && (unsigned)s->at[k] < low) low = (unsigned)s->at[k];
    return arena(c) - low;
}
/* A span left the region: give the FX allocator back everything below the lowest engine still there. */
static void shrink(unsigned c)
{
    struct spans s;
    spans_of(c, &s);
    unsigned reserve = reserve_of(c, &s);
    if (reserve < dl_engine_reserved(c)) dl_engine_release(c, reserve);
}
static void free_span(unsigned c, unsigned k)
{
    mw_engines[c][k].state = MW_ENGINE_FREE, mw_engines[c][k].generation = 0, mw_engines[c][k].count = 0;
    shrink(c);
}

void mw_engines_poll(void)
{
    for (unsigned c = 0; c < 2u; ++c) {
        if (lane[c].op == LANE_IDLE) continue;
        struct dl_owned_progress p;
        int s = dl_owned_job_poll(&lane[c].job, &p);
        if (!s) continue;
        int ok = s == 1 && p.sent_sequence == lane[c].job.last_sequence && p.acknowledged_sequence == lane[c].job.last_sequence;
        struct mw_engine *e = &mw_engines[c][lane[c].k];
        if (s == -2 || dl_owned_job_release(&lane[c].job) != 1) {
            /* Not this job's terminal state: nothing about the DSP is known, and the lane stays held for good. */
            dl_owned_fail_closed(c);
            e->state = MW_ENGINE_STUCK, closed[c] = 1;
            continue;
        }
        if (!ok) closed[c] = 1;
        unsigned op = lane[c].op;
        lane[c].op = LANE_IDLE;
        if (op == LANE_WRITE) {
            /* A failed WRITE sent no PLACE: the base word is still 0 and nothing reaches these words. */
            if (ok) e->state = MW_ENGINE_WRITTEN;
            else free_span(c, lane[c].k);
        } else if (op == LANE_PLACE) {
            if (ok) e->state = MW_ENGINE_PLACED, mw_engines_placed_count = mw_engines_placed_count + 1;
            else e->state = MW_ENGINE_STUCK; /* the base word may or may not name it: the span stays for this boot */
        } else if (ok) {
            free_span(c, lane[c].k);
            mw_engines_unplaced_count = mw_engines_unplaced_count + 1;
        } else e->state = MW_ENGINE_STUCK;
    }
}

int mw_engines_ready(unsigned feature, unsigned cores)
{
    unsigned k = index_of(feature);
    if (k >= MW_ENGINE_FEATURES || !cores || cores > 3u) return 0;
    for (unsigned c = 0; c < 2u; ++c)
        if ((cores >> c & 1u) && (!unit_of(c, k)->count || mw_engines[c][k].state != MW_ENGINE_PLACED ||
                                  (is_packaged(k) && mw_engines[c][k].generation != packaged_generation[k]))) return 0;
    return 1;
}

static int reserve(unsigned c, unsigned op, unsigned k, uint32_t generation)
{
    const struct mw_engine *e = &mw_engines[c][k];
    unsigned offset = DL_CODE_START + e->offset;
    int ok;
    if (op == LANE_WRITE) {
        /* The buffer is free: one job per core, and the previous WRITE was released before this one. */
        if (buffered[c].k != k + 1u || buffered[c].offset != offset || buffered[c].generation != e->generation) {
            mw_engine_relocate(unit_of(c, k), dl_pool_base[c] + offset, mw_engine_buffer[c]);
            buffered[c].k = (uint8_t)(k + 1u), buffered[c].offset = (uint16_t)offset, buffered[c].generation = e->generation;
        }
        struct dl_upload upload = {mw_engine_buffer[c], 0, e->count, 0, (uint16_t)offset};
        ok = dl_owned_upload_reserve(c, generation, &upload, &lane[c].job);
    } else ok = dl_owned_command_reserve(c, generation, 10u, 1u << k, op == LANE_PLACE ? offset : 0u, e->count, &lane[c].job);
    if (!ok) return 0;
    if (dl_owned_submit(&lane[c].job) != 1) {
        /* Reserved, not sent: give it back; if even that fails the core's owned channel is in doubt. */
        if (dl_owned_cancel(&lane[c].job) == 1) return 0;
        dl_owned_fail_closed(c);
        closed[c] = 1;
        return -1;
    }
    lane[c].op = (uint8_t)op, lane[c].k = (uint8_t)k;
    mw_engines_jobs = mw_engines_jobs + 1;
    return 1;
}

int mw_engines_place(unsigned feature, unsigned cores, uint32_t generation, const uint8_t busy[2],
                     const uint8_t mask[2], unsigned known)
{
    unsigned k = index_of(feature), placed = 1, stuck = 0;
    if (k >= MW_ENGINE_FEATURES || !cores || cores > 3u || !generation) return -1;
    /* A packaged feature's words are one generation's package's: another generation's are never adopted. */
    int own = !is_packaged(k) || packaged_generation[k] == generation;
    for (unsigned c = 0; c < 2u; ++c) {
        if (!(cores >> c & 1u)) continue;
        struct mw_engine *e = &mw_engines[c][k];
        const struct mw_engine_unit *u = unit_of(c, k);
        volatile uint8_t *why = &mw_engines_wait[c][k];
        int other = is_packaged(k) && e->state != MW_ENGINE_FREE && e->generation != generation;
        if (e->state == MW_ENGINE_PLACED && !other) { *why = MW_WAIT_NONE; continue; }
        if (!own || !u->count || e->state == MW_ENGINE_STUCK || shut(c)) { stuck = 1, *why = MW_WAIT_STUCK; continue; }
        placed = 0;
        /* One job per core; the board's own job, a playing sequencer or a queued pattern change defer the rest. */
        if (lane[c].op != LANE_IDLE) { *why = MW_WAIT_LANE; continue; }
        if (busy[c]) { *why = MW_WAIT_BOARD; continue; }
        if (other) {
            /* The predecessor's engine: never PLACEd, its span is free at once; placed, it is unplaced first, only
             * while the feature is known off on this core (the receiver refuses a PLACE over an enabled one) and
             * the sequencer is quiet. */
            if (e->state == MW_ENGINE_CLAIMED || e->state == MW_ENGINE_WRITTEN) free_span(c, k);
            else if (e->state != MW_ENGINE_PLACED || !(known >> c & 1u) || (mask[c] >> k & 1u)) { *why = MW_WAIT_LANE; continue; }
            else if (!QUIET()) { *why = MW_WAIT_PLAYING; continue; }
            else {
                int r = reserve(c, LANE_UNPLACE, k, e->generation);
                if (r) e->state = r > 0 ? MW_ENGINE_UNPLACING : MW_ENGINE_STUCK;
                *why = r < 0 ? MW_WAIT_STUCK : r ? MW_WAIT_LANE : MW_WAIT_TRANSPORT;
                continue;
            }
        }
        if (e->state == MW_ENGINE_FREE) {
            struct spans s;
            spans_of(c, &s);
            if (!add_span(c, &s, k, u->count)) { mw_engines_refused = mw_engines_refused + 1, *why = MW_WAIT_ROOM; continue; }
            /* Room for the other wanted engines not yet here too, where they will go: one region, one claim. */
            for (unsigned j = 0; j < MW_ENGINE_FEATURES; ++j)
                if (j != k && (wanted_now >> j & 1u) && s.at[j] < 0 && unit_of(c, j)->count) (void)add_span(c, &s, j, unit_of(c, j)->count);
            unsigned need = reserve_of(c, &s);
            /* A claim the reserve already covers (an evacuation lowered the capacity for it) is bookkeeping only, taken
             * at once so the reserve never waits unowned. A new claim waits while a pattern change is queued (the next
             * pattern's Parts are not the ones it checks). While playing it takes free words only (commit 1): live FX
             * code is retired (a trim) or moved (an evacuation) only while quiet and settled. */
            if (need > dl_engine_reserved(c) && QUEUED()) { *why = MW_WAIT_PLAYING; continue; }
            /* Free words only fall while playing (code goes only when quiet), so a claim that had to move or retire
             * code waits for the stop instead of planning again on every tick. */
            if (!QUIET() && need >= deferred[c]) { *why = MW_WAIT_EVACUATION; continue; }
            int claim = dl_engine_claim(c, need, QUIET() && SETTLED() ? 2 : 1);
            deferred[c] = claim == 0 && dl_engine_why[c] == 7u && !QUIET() ? need : ~0u;
            if (claim <= 0) {
                if (claim < 0) mw_engines_refused = mw_engines_refused + 1;
                *why = claim < 0 ? MW_WAIT_CLAIM_REFUSED : dl_engine_why[c] >= 6u ? MW_WAIT_EVACUATION : MW_WAIT_CLAIM_BUSY;
                continue;
            }
            e->offset = (uint16_t)s.at[k], e->count = (uint16_t)u->count, e->generation = generation, e->state = MW_ENGINE_CLAIMED;
        }
        /* Written and placed while playing too (owner's MKII, 27 October 2026: PLAY right after a boot left Analog BD
         * silent until the next stop). The words go to free arena no slot runs, as a pick's upload does while playing,
         * and PLACE only sets the dormant feature's base word: no track sounds different until its ENABLE. */
        if (QUEUED()) { *why = MW_WAIT_PLAYING; continue; }
        int r = e->state == MW_ENGINE_CLAIMED ? reserve(c, LANE_WRITE, k, generation) :
                e->state == MW_ENGINE_WRITTEN ? reserve(c, LANE_PLACE, k, generation) : 0;
        if (r > 0) e->state = e->state == MW_ENGINE_CLAIMED ? MW_ENGINE_WRITING : MW_ENGINE_PLACING, *why = MW_WAIT_NONE;
        else if (r < 0) e->state = MW_ENGINE_STUCK, stuck = 1, *why = MW_WAIT_STUCK;
        else *why = MW_WAIT_TRANSPORT;
    }
    return stuck ? -1 : (int)placed;
}

static int admit(unsigned feature, unsigned wanted, unsigned words);
int mw_engines_admit(unsigned feature, unsigned wanted, unsigned words)
{
    int verdict = admit(feature, wanted, words);
    unsigned k = index_of(feature);
    if (k < MW_ENGINE_FEATURES) mw_engines_admitted[k] = (uint8_t)(verdict + 1);
    return verdict;
}
static int admit(unsigned feature, unsigned wanted, unsigned words)
{
    unsigned k = index_of(feature);
    if (k >= MW_ENGINE_FEATURES) return MW_ENGINE_STUCK_BOOT;
    for (unsigned c = 0; c < 2u; ++c)
        if (runs(c, k) && (mw_engines[c][k].state == MW_ENGINE_STUCK ||
                           (shut(c) && mw_engines[c][k].state != MW_ENGINE_PLACED))) return MW_ENGINE_STUCK_BOOT;
    wanted = MW_DSP_IMPLIED(wanted | feature); /* a Sidechain's engine comes with the key bus's */
    for (unsigned c = 0; c < 2u; ++c) {
        struct spans s;
        unsigned add = 0;
        spans_of(c, &s);
        /* An incoming package's engine replaces whatever another generation of its feature placed here. */
        if (is_packaged(k)) s.at[k] = -1;
        for (unsigned j = 0; j < MW_ENGINE_FEATURES; ++j) {
            unsigned n = j == k && is_packaged(k) ? (runs(c, k) ? words : 0u) : unit_of(c, j)->count;
            if (!(wanted >> j & 1u) || !n || s.at[j] >= 0) continue;
            if (!add_span(c, &s, j, n)) return MW_ENGINE_MEMORY;
            add = 1;
        }
        if (add && dl_engine_claim(c, reserve_of(c, &s), 0) < 0) return MW_ENGINE_MEMORY;
    }
    return MW_ENGINE_FITS;
}

void mw_engines_collect(unsigned held, const uint8_t mask[2], unsigned known, const uint8_t busy[2])
{
    /* A packaged feature nobody holds names no package any more: its words may be reclaimed. */
    for (unsigned k = 0; k < MW_ENGINE_FEATURES; ++k)
        if (is_packaged(k) && !(held >> k & 1u)) packaged[0][k].count = packaged[1][k].count = 0, packaged_generation[k] = 0;
    for (unsigned c = 0; c < 2u; ++c) {
        /* An evacuation lowers the capacity for the engine that asked; if that engine's feature is let go before it
         * claims, nothing frees its span: give the words back once no held feature's engine still waits here. */
        unsigned owed = 0;
        for (unsigned k = 0; k < MW_ENGINE_FEATURES; ++k)
            owed |= (held >> k & 1u) && runs(c, k) && mw_engines[c][k].state == MW_ENGINE_FREE;
        if (!owed) shrink(c);
        for (unsigned k = 0; k < MW_ENGINE_FEATURES; ++k) {
            struct mw_engine *e = &mw_engines[c][k];
            if ((held >> k & 1u) || lane[c].op != LANE_IDLE || busy[c] || closed[c] || !QUIET()) continue;
            if (e->state == MW_ENGINE_CLAIMED || e->state == MW_ENGINE_WRITTEN) free_span(c, k); /* never PLACEd */
            else if (e->state == MW_ENGINE_PLACED && (known >> c & 1u) && !(mask[c] >> k & 1u)) {
                int r = reserve(c, LANE_UNPLACE, k, e->generation);
                if (r) e->state = r > 0 ? MW_ENGINE_UNPLACING : MW_ENGINE_STUCK;
            }
        }
    }
}
