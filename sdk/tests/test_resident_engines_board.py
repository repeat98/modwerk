# SPDX-License-Identifier: GPL-3.0-or-later
"""Resident controller engines on demand, the ColdFire side, on the actual board, loader, generated manager and
generated owned transport (host, ASan/UBSan).

Synthetic: the engine units (words and relocations made up here, relocated by resident_dsp.relocate for the
expected words), the controller packages and trust rows (test_controller_board's), the FX catalogue and the
bank's Parts, and a modelled DSP receiver (WRITE into a P array, PLACE and CAS as resident_dsp.receiver_place
and receiver_control state them, RESET word counts, BIND/UNBIND/BYPASS into a dispatch table that every frame
checks: each running slot's code whole and where the manager holds it). Modes 12-21 are the evacuation of live FX
code from the engines' region, 22-25 dl_move's rollback (back to the old copy, or the stub when that copy is not provably
intact), 26-28 a Part switch while an owned job holds a core (it waits, at most 600 refused starts per owned job). No
hardware ACK, timing or audio is claimed; the DSP side's own execution is test_resident_engines.py's.
"""
import importlib.util
import hashlib
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
ADAPTER = ROOT / 'sdk/machines/octatrack/module-adapters'
POLICY = ADAPTER / 'controller-policy'
RUNTIME = ADAPTER / 'resident-runtime'
ELEK = ROOT / 'sdk/machines/octatrack/elekloader'
sys.path.insert(0, str(ADAPTER))
sys.path.insert(0, str(ELEK))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import resident_driver  # noqa: E402
import resident_dsp  # noqa: E402
import resident_engines  # noqa: E402
import resident_journal  # noqa: E402
import resident_placement  # noqa: E402
import zero_state  # noqa: E402
import test_controller_board as board  # noqa: E402
from host_flags import SANITIZE  # noqa: E402

TABLE, WORDS = 4096, 2000          # each core's pool in this fixture: arena 1936 words
ARENA = WORDS - 64
SIZES = {('A', 1): 388, ('A', 2): 773, ('A', 4): 998, ('B', 1): 388, ('B', 4): 998}


def unit(tag, feature, n):
    """A made-up engine: words at base 0 with address and displacement relocations, as engine_unit shapes them."""
    seed = (feature * 0x9e3779b1 + (tag == 'B') * 0x7f4a7c15) & 0xffffffff
    words, relocations = [], []
    for i in range(n):
        seed = (seed * 1103515245 + 12345) & 0xffffffff
        kind = seed >> 29
        if kind == 0 and i:
            relocations.append(i)
            words.append(seed % n)                       # an address inside the unit
        elif kind == 1 and i:
            relocations.append(i | 0x8000)
            words.append((0x300 + seed % 0x200) & 0xffffff)  # a displacement to a fixed stock address
        else:
            words.append(seed >> 8 & 0xffffff)
    result = dict(tag=tag, feature=feature, words=words, relocations=relocations, entries={},
                  sha256=hashlib.sha256(b''.join(w.to_bytes(3, 'big') for w in words)).hexdigest())
    result['proofs'] = [dict(base=b, sha256=hashlib.sha256(b''.join(w.to_bytes(3, 'big') for w in resident_dsp.relocate(result, b))).hexdigest())
                        for b in resident_dsp.ENGINE_PROOFS]
    return result


def bundles():
    out = {}
    for tag in 'AB':
        engines = {f: unit(tag, f, n) for (t, f), n in SIZES.items() if t == tag}
        out[tag] = dict(onDemand=sum(engines), engines=engines)
    return out


def expected(units):
    """Python-relocated words at the top of the arena (each engine alone there), for the fixture to compare."""
    text = ''
    for core, tag in enumerate('AB'):
        for feature, u in units[tag]['engines'].items():
            offset = ARENA - len(u['words'])
            words = resident_dsp.relocate(u, TABLE + 64 + offset)
            text += 'static const uint32_t top_%d_%d[%d] = {%s};\n' % (core, feature, len(words), ','.join(map(str, words)))
        text += ''.join('#define TOP_%d_%d %s\n' % (core, f, 'top_%d_%d' % (core, f) if f in units[tag]['engines'] else '0')
                        for f in (1, 2, 4))
    return text


MANAGER_UNIT = r'''
#include <stdint.h>
static uint32_t auto_serial = 0x80000000u;
static unsigned observed_valid;
static uint8_t last[16];
uint32_t test_bank = 0x400e21e0u;
uint8_t dl_journal_test_live[16];
uint8_t test_qb, test_qp, test_parts[4][16];
unsigned test_parts_used = 0xfu; /* the Parts the bank's patterns play (part_mask): all four unless a mode says */
#include "manager.c"
struct dl_package dl_catalog[MODWERK_FX_IDS];
struct code dl_codes[2][MODWERK_FX_IDS];
const uint32_t dl_pmap16 = 0;
const fx_set dl_stub_at_boot = {{0}}, modwerk_fx_modules = {{0, 0xffffffffu}};
int modwerk_stock_hook_export_idle(void) { return 1; }
uint32_t modwerk_dsp_source_charge(unsigned c) { (void)c; return 0; }
int modwerk_dsp_buffer_permitted(unsigned c, unsigned k, unsigned b, unsigned id) { (void)c; (void)k; (void)b; (void)id; return 1; }
int modwerk_stock_hook_buffer_policy(unsigned c, unsigned id, struct mw_hook_buffer_claim *out) { (void)c; (void)id; (void)out; return 0; }
int modwerk_dsp_catalogue_handle(uint32_t module) { (void)module; return -1; }
void board_manager_running(unsigned slot, unsigned id) { allocator.active[slot] = (uint8_t)id; }
void board_manager_init(void) { initialized = 1; dl_buffers_init(&buffers, dl_pmap16); }
unsigned test_capacity(unsigned c) { return allocator.capacity[c]; }
unsigned test_initialized(void) { return initialized; }
unsigned test_idle(void) { return !phase && !waiting && !queued_token && !allocator.phase; }
int test_live(unsigned c, unsigned p) { return allocator.live[c][p].present ? (int)allocator.live[c][p].offset : -1; }
/* An open transaction's new place for p on core c (an evacuation's or a selection's), -1 none. */
int test_target(unsigned c, unsigned p) { return allocator.phase && allocator.target[c][p].present ? (int)allocator.target[c][p].offset : -1; }
unsigned test_active(unsigned i) { return allocator.active[i]; }
unsigned test_words(unsigned p) { return dl_catalog[p].resident ? 0u : dl_catalog[p].words; }
unsigned test_phase(void) { return phase; }
uint32_t test_trims(void) { return dl_trims; }
uint32_t test_unloads(void) { return dl_unloads; }
unsigned test_observed_valid(void) { return observed_valid; }
void test_set_observed_valid(unsigned v) { observed_valid = v; }
/* dl_move (dsp.c's compaction), whether a core's dispatch of p is the stub, and the owned job the manager last waited for. */
int test_move(unsigned c, unsigned p, unsigned offset) { return dl_move(c, p, offset); }
int test_stubbed(unsigned c, unsigned p) { return fx_in(stubbed[c], p); }
uint32_t test_owned_seen(void) { return owned_seen; }
/* Made up: an open transaction also plans p on core c at `offset` (no planner does that over live code). */
void test_inject_target(unsigned c, unsigned p, unsigned offset, unsigned n) { allocator.target[c][p] = (struct dl_placement){(uint16_t)offset, (uint16_t)n, 1}; }
/* Made up: core c's Y buffer table entry e differs from the plan, so the table step (phase 8) sends one DL_BASE. */
void test_force_table(unsigned c, unsigned e) { buffers.want[c][e] = buffers.table[c][e] ^ 1u; }
int test_table_matches(unsigned c, unsigned e) { return buffers.table[c][e] == buffers.want[c][e]; }
void test_advance(void) { dl_residency_tick(); } /* the manager's UI tick (the native build has no observer) */
/* Id 0 (NONE) is resident, as stock's is. */
void test_none(void) { dl_catalog[0] = (struct dl_package){0, 0, 0, 3, 1, 1, 0}; }
/* A stock-free FX: id p, n words, on both cores' codes (a WRITE then a BIND each). */
static uint32_t fx_words[MODWERK_FX_IDS][1024];
void test_fx(unsigned p, unsigned n)
{
    for (unsigned i = 0; i < n; ++i) fx_words[p][i] = (p << 12) + i;
    dl_catalog[p] = (struct dl_package){(uint16_t)n, 1, 100, 3, 0, 1, 0};
    dl_codes[0][p] = dl_codes[1][p] = (struct code){fx_words[p], 0, (uint16_t)n, 0, 1, 0};
}
/* One Part switch through the actual selection route: prepare, poll to READY, commit, retire. */
static uint32_t select_token = 1;
int test_select(const uint8_t ids[16], void (*pump)(void))
{
    struct dl_selection s;
    for (unsigned i = 0; i < sizeof s; ++i) ((uint8_t *)&s)[i] = 0;
    for (unsigned i = 0; i < 16; ++i) s.target[i] = ids[i];
    uint32_t token = ++select_token;
    int r = dl_selection_prepare(&s, token);
    for (unsigned n = 0; n < 4000 && r == DL_SELECT_WAIT; ++n) { pump(); r = dl_selection_poll(token); }
    if (r != DL_SELECT_READY) return r;
    dl_selection_commit(token);
    for (unsigned n = 0; n < 4000 && phase; ++n) { pump(); dl_residency_tick(); }
    return phase ? 0 : 1;
}
'''

MODEL = r'''
#include "resident_engines.h"
#include "expected.h"
static unsigned quiet = 1;
int mw_engines_test_quiet(void) { return (int)quiet; }
/* UI ticks, the last key, a pick waiting: the evacuation's own wait (two seconds after the last key, no pick waiting). */
static unsigned ticks = 1000, key_at, pick_waiting;
int mw_engines_test_settled(void) { return ticks - key_at >= 120u && !pick_waiting; }
unsigned test_capacity(unsigned c);
unsigned test_initialized(void);
unsigned test_idle(void);
int test_live(unsigned c, unsigned p);
int test_target(unsigned c, unsigned p);
unsigned test_active(unsigned i);
unsigned test_words(unsigned p);
unsigned test_phase(void);
uint32_t test_trims(void);
uint32_t test_unloads(void);
unsigned test_observed_valid(void);
void test_set_observed_valid(unsigned v);
extern unsigned test_parts_used;
int test_move(unsigned c, unsigned p, unsigned offset);
int test_stubbed(unsigned c, unsigned p);
uint32_t test_owned_seen(void);
extern volatile uint32_t dl_residency_rollbacks, dl_residency_failures;
void test_inject_target(unsigned c, unsigned p, unsigned offset, unsigned n);
void test_force_table(unsigned c, unsigned e);
int test_table_matches(unsigned c, unsigned e);
void test_advance(void);
void test_fx(unsigned p, unsigned n);
void test_none(void);
int test_select(const uint8_t ids[16], void (*pump)(void));
extern uint8_t test_parts[4][16];
/* Modelled receiver: WRITE into P (each chunk read back, as the receiver does), PLACE (word 7 = 1: dormant only, the
 * engine whole inside the arena, a prior unplace), CAS (word 7 = 0: never enabling an unplaced engine or one whose
 * reset is incomplete; a disable invalidates the reset), RESET counted per feature, BIND/UNBIND/BYPASS into a dispatch
 * table: the FX code each id runs from the next frame on. */
static uint32_t P[2][8192];
static unsigned dsp_mask[2], words[2][3], base_word[2][3], answered[2], cas_count;
static unsigned refuse_write[2], refuse_place[2]; /* table offsets at which a WRITE chunk, a PLACE is refused */
static unsigned refuse_bind[2], drop_bind[2], refuse_once[2]; /* a BIND to this table offset refused; applied but never
                                                                 * answered (once); refused once */
static unsigned dispatch[2][64]; /* 1 + the table offset an id's BIND named (its init), 0 the stub or unbound */
/* Every frame: each slot runs its id's whole, correct code from where the manager holds it (live, or an open
 * transaction's new copy), never a stub, freed or half-written words. The test FX code is (id << 12) + word. */
static unsigned frames_checked, stub_ok; /* stub_ok: an id expected on the dry stub (a rollback that fails closed) */
static void running_whole(void)
{
    for (unsigned i = 0; i < 16; ++i) {
        unsigned p = test_active(i), c = (i & 7) < 4 ? 1u : 0u;
        if (p >= 64 || !test_words(p) || (p == stub_ok && !dispatch[c][p])) continue;
        assert(dispatch[c][p]);
        unsigned at = dispatch[c][p] - 1u;
        int live = test_live(c, p), target = test_target(c, p);
        assert((live >= 0 && at == 64u + (unsigned)live) || (target >= 0 && at == 64u + (unsigned)target));
        for (unsigned w = 0; w < test_words(p); ++w) assert(P[c][MODWERK_DSP_TABLE0 + at + w] == (p << 12) + w);
        ++frames_checked;
    }
}
static const unsigned totals[3] = {1042, 193, 3776};
struct entry { unsigned op, w4, w5, w7; };
static struct entry trail[2][8192];
static unsigned trails[2];
static void dsp(void)
{
    dl_frame();
    for (unsigned c = 0; c < 2; ++c) {
        if (dl_tx[c][0] != DL_MAGIC || dl_tx[c][1] == answered[c]) continue;
        answered[c] = dl_tx[c][1];
        unsigned reject = 0, op = dl_tx[c][2], w4 = dl_tx[c][4], w5 = dl_tx[c][5], w7 = dl_tx[c][7];
        assert(trails[c] < 8192);
        trail[c][trails[c]++] = (struct entry){op, w4, w5, w7};
        if (op == 3u) {
            reject = refuse_write[c] && w5 == refuse_write[c];
            for (unsigned i = 0; !reject && i < w4; ++i)
                P[c][MODWERK_DSP_TABLE0 + w5 + i] = (unsigned)dl_tx[c][8 + 2 * i] << 8 | dl_tx[c][9 + 2 * i];
        } else if (op == 11u) {
            unsigned f = w7, k = f == 1u ? 0 : f == 2u ? 1 : f == 4u ? 2 : 3;
            reject = k > 2 || w5 != words[c][k] || (dsp_mask[c] & f);
            if (!reject) words[c][k] += w4;
        } else if (op == 10u && w7 == 1u) {
            unsigned f = w4, k = f == 1u ? 0 : f == 2u ? 1 : f == 4u ? 2 : 3;
            reject = k > 2 || (dsp_mask[c] & f) || !mw_engine_units[c][k].count || (refuse_place[c] && w5 == refuse_place[c]);
            if (!reject && base_word[c][k]) { reject = w5 != 0; if (!reject) base_word[c][k] = 0; }
            else if (!reject && w5) {
                reject = w5 < 64u || w5 + mw_engine_units[c][k].count > MODWERK_DSP_WORDS0;
                if (!reject) base_word[c][k] = MODWERK_DSP_TABLE0 + w5;
            }
        } else if (op == 10u && w7 == 0u) {
            unsigned expected = w4, desired = w5, on = desired & ~expected;
            ++cas_count;
            reject = expected != dsp_mask[c];
            for (unsigned k = 0; k < 3; ++k)
                if (on >> k & 1u) reject |= words[c][k] != totals[k] || !base_word[c][k];
            if (!reject) {
                for (unsigned f = 1; f <= 4; f <<= 1) if ((expected & f) && !(desired & f)) words[c][f >> 1] = 0;
                dsp_mask[c] = desired;
            }
        } else if (op == 10u) reject = 1;
        else if (op == 4u) {
            reject = w4 >= 64 || w7 != w5 + 1u || (refuse_bind[c] && w5 == refuse_bind[c]);
            if (refuse_once[c] && w5 == refuse_once[c]) reject = 1, refuse_once[c] = 0;
            if (!reject) dispatch[c][w4] = w5 + 1u;
            if (!reject && drop_bind[c] && w5 == drop_bind[c]) { drop_bind[c] = 0; continue; } /* applied, unanswered */
        } else if (op == 5u || op == 6u) { if (w4 < 64) dispatch[c][w4] = 0; }
        flags[c] = ((flags[c] ^ 1u) & 1u) | (reject ? 2u : 0u);
        dl_frame();
    }
    running_whole();
}
static void run(unsigned n) { while (n--) { ++ticks; modwerk_controller_tick(); test_advance(); dsp(); dsp(); } }
static void pump(void) { dsp(); }
/* A UI tick of the board alone (the manager advances from the selection's own poll). */
static void board_pump(void) { ++ticks; modwerk_controller_tick(); dsp(); dsp(); }
/* Mode 28's frames: once the transaction runs, core B's table entry 0 is made to differ; an owned reservation held on
 * core B is let go 50 frames after the table step (phase 8) first meets it. */
/* Mode 27's frames: two owned reservations on core A, one after the other, 400 frames each, the second taken in the
 * frame the first is let go (two jobs of the same sequence, as the board's RESET chunks). */
static struct dl_owned_job relay;
static unsigned relay_n;
static void relay_pump(void)
{
    dsp();
    if (++relay_n % 400u || relay_n > 800u) return;
    assert(dl_owned_cancel(&relay) == 1);
    if (relay_n < 800u) assert(dl_owned_command_reserve(0, 78u, DL_PROBE, 0, 0, 0, &relay));
}
static struct dl_owned_job held_b;
static unsigned forced, in_tables;
static void table_pump(void)
{
    dsp();
    if (!forced && test_phase() >= 2) { test_force_table(1, 0); forced = 1; }
    if (test_phase() == 8 && dl_owned_holder(1) && ++in_tables == 50) assert(dl_owned_cancel(&held_b) == 1);
}
static const struct mu_backend *loader = &modwerk_runtime_backend;
static enum mu_publication install(const uint8_t *data, unsigned length)
{
    assert(loader->enter(0) && loader->prepare(0, data, length));
    enum mu_publication p = loader->publish(0);
    if (p == MU_APPLIED) assert(loader->retire(0)); else assert(loader->discard(0));
    assert(loader->leave(0));
    return p;
}
static enum runtime_refusal refused(const uint8_t *data, unsigned length)
{
    assert(loader->enter(0));
    int ok = loader->prepare(0, data, length);
    enum runtime_refusal why = RUNTIME_OK;
    if (!ok) why = modwerk_runtime_refusal();
    else { enum mu_publication p = loader->publish(0); assert(p == MU_UNCHANGED); why = modwerk_runtime_refusal(); assert(loader->discard(0)); }
    assert(loader->leave(0));
    return why;
}
static uint8_t empty[32];
static const uint8_t *removal(uint32_t module)
{
    memset(empty, 0, sizeof empty); memcpy(empty, "MWRM", 4); empty[5] = 4;
    for (unsigned k = 0; k < 4; ++k) empty[28 + k] = (uint8_t)(module >> (24 - 8 * k));
    return empty;
}
static const struct mw_controller_slot *slot_for(uint32_t module, unsigned state)
{
    for (unsigned i = 0; i < MW_CONTROLLER_SLOTS; ++i)
        if (modwerk_controller_registry.slots[i].binding.identity.module == module && modwerk_controller_registry.slots[i].state == state)
            return &modwerk_controller_registry.slots[i];
    return 0;
}
static void remove_module(uint32_t module)
{
    assert(refused(removal(module), 32) == RUNTIME_BUSY);
    run(20);
    assert(install(removal(module), 32) == MU_APPLIED);
    run(20);
}
#define SC 0x95cff696u
#define MATRIX 0xcaf158b5u
#define AB 0xabdb1445u
#define K(f) ((f) == 1u ? 0u : (f) == 2u ? 1u : 2u)
/* Placed exactly: the base word the receiver keeps names the engine's table offset, P holds every relocated word,
 * and the words a placement at the arena's top must have, made by resident_dsp.relocate, where it sits there. */
static void placed_at(unsigned c, unsigned f, unsigned offset)
{
    const struct mw_engine *e = &mw_engines[c][K(f)];
    const struct mw_engine_unit *u = &mw_engine_units[c][K(f)];
    assert(e->state == MW_ENGINE_PLACED && e->offset == offset);
    unsigned base = MODWERK_DSP_TABLE0 + 64u + offset;
    assert(base_word[c][K(f)] == base);
    static uint32_t want[8192];
    mw_engine_relocate(u, base, want);
    for (unsigned i = 0; i < u->count; ++i) assert(P[c][base + i] == want[i]);
    const uint32_t *top = c == 0 ? (f == 1 ? TOP_0_1 : f == 2 ? TOP_0_2 : TOP_0_4) : (f == 1 ? TOP_1_1 : f == 2 ? TOP_1_2 : TOP_1_4);
    if (offset + u->count == MODWERK_DSP_WORDS0 - 64u) for (unsigned i = 0; i < u->count; ++i) assert(P[c][base + i] == top[i]);
}
static void unplaced(unsigned c, unsigned f)
{
    assert(mw_engines[c][K(f)].state == MW_ENGINE_FREE && !base_word[c][K(f)]);
}
/* Per core, from trail entry `from`: every op of the engine's feature in order. WRITEs into its span, one PLACE,
 * then the RESETs and the enabling CAS. */
static void ordered(unsigned c, unsigned f, unsigned offset, unsigned from)
{
    unsigned stage = 0, written = 0, n = mw_engine_units[c][K(f)].count, at = 64u + offset;
    for (unsigned i = from; i < trails[c]; ++i) {
        const struct entry *t = &trail[c][i];
        if (t->op == 3u && t->w5 >= at && t->w5 < at + n) { assert(stage == 0); written += t->w4; }
        else if (t->op == 10u && t->w7 == 1u && t->w4 == f) { assert(stage == 0 && written == n && t->w5 == at); stage = 1; }
        else if (t->op == 11u && t->w7 == f) { assert(stage == 1 || stage == 2); stage = 2; }
        else if (t->op == 10u && t->w7 == 0u && (t->w5 & ~t->w4 & f)) { assert(stage == 2); stage = 3; }
    }
    assert(stage == 3);
}
/* Trail index of the first op on core c from `from` matching op (and id w4, table offset w5 when nonzero), or trails[c]. */
static unsigned first_op(unsigned c, unsigned from, unsigned op, unsigned w4, unsigned w5)
{
    for (unsigned i = from; i < trails[c]; ++i)
        if (trail[c][i].op == op && (op == 3u || !w4 || trail[c][i].w4 == w4) && (!w5 || trail[c][i].w5 == w5)) return i;
    return trails[c];
}
static unsigned count_ops(unsigned c, unsigned from, unsigned op) /* ops of this kind on core c since `from` */
{
    unsigned n = 0;
    for (unsigned i = from; i < trails[c]; ++i) n += trail[c][i].op == op;
    return n;
}
/* The bank of the evacuation modes: id 3 (900 words, a quarter of the arena or more) runs on T5 FX1 (core A), so the
 * allocator puts it at the top of the arena, where Sidechain's engine goes; Part 1 names it. On core B too with `both`. */
static void big_at_top(unsigned both)
{
    uint8_t ids[16]; memset(ids, 0, sizeof ids);
    ids[4] = 3;
    if (both) ids[0] = 3;
    memset(test_parts, 0, sizeof test_parts); memcpy(test_parts[0], ids, 16);
    assert(test_select(ids, pump) == 1);
    assert(test_live(0, 3) == (int)(MODWERK_DSP_WORDS0 - 64u - 900u) && (!both || test_live(1, 3) == test_live(0, 3)));
    assert(dispatch[0][3] == 64u + (unsigned)test_live(0, 3) + 1u);
}
/* Several on core A: 5..8 (400 words) on T5-T8 FX1 and 9 (300) on T5 FX2, then 6 and 7 let go: 8 (1200-1600) and 9
 * (1600-1900) sit in Sidechain's region, a hole below them. */
static void several_in_region(uint8_t ids[16])
{
    memset(ids, 0, 16); memset(test_parts, 0, sizeof test_parts);
    ids[4] = 5; ids[5] = 6; ids[6] = 7; ids[7] = 8; ids[12] = 9;
    assert(test_select(ids, pump) == 1);
    ids[5] = ids[6] = 0;
    assert(test_select(ids, pump) == 1);
    assert(test_live(0, 5) == 0 && test_live(0, 6) < 0 && test_live(0, 7) < 0 && test_live(0, 8) == 1200 && test_live(0, 9) == 1600);
}
static void run_until(unsigned (*done)(void), unsigned most)
{
    for (unsigned n = 0; n < most && !done(); ++n) run(1);
    assert(done());
}
static unsigned evacuating(void) { return test_phase() == 10u; }
static unsigned engine_ops(unsigned c, unsigned from) /* PLACE/RESET/CAS and engine-span WRITEs since `from` */
{
    unsigned n = 0;
    for (unsigned i = from; i < trails[c]; ++i)
        if (trail[c][i].op == 10u || trail[c][i].op == 11u || (trail[c][i].op == 3u && trail[c][i].w5 >= 64u + test_capacity(c))) ++n;
    return n;
}
int main(int argc, char **argv)
{
    assert(argc == 2);
    unsigned mode = (unsigned)strtoul(argv[1], 0, 10);
    memcpy(donor, donor_original, sizeof donor);
    (void)buffers_idle; (void)refuse_cas; (void)test_initialized;
    const unsigned top = MODWERK_DSP_WORDS0 - 64u, sc = top - 388u, ab = sc - 998u, mx = top - 773u, moved = top - 1800u;
    test_none(); test_fx(3, 900); test_fx(5, 400); test_fx(6, 400); test_fx(7, 400); test_fx(8, 400); test_fx(9, 300);
    run(2);
    if (mode == 0) {
        /* Place, switch on, run, switch off, unplace, free. */
        assert(install(pkg_sc, sizeof pkg_sc) == MU_APPLIED);
        run(200);
        assert(slot_for(SC, MW_CTL_ACTIVE) && dsp_mask[0] == 1 && dsp_mask[1] == 1);
        for (unsigned c = 0; c < 2; ++c) {
            placed_at(c, 1, sc); ordered(c, 1, sc, 0);
            assert(dl_engine_reserved(c) == 388 && test_capacity(c) == sc && modwerk_dsp_arena_now(c) == sc);
        }
        assert(mw_engines_jobs == 4 && mw_engines_placed_count == 2);
        unsigned from[2] = {trails[0], trails[1]};
        remove_module(SC);
        assert(slot_for(SC, MW_CTL_RELEASED) && !modwerk_controller_held() && !dsp_mask[0] && !dsp_mask[1]);
        for (unsigned c = 0; c < 2; ++c) {
            unplaced(c, 1);
            assert(!dl_engine_reserved(c) && test_capacity(c) == top && modwerk_dsp_arena_now(c) == top);
            /* The disable is ACKed before the unplace. */
            unsigned disabled = 0, gone = 0;
            for (unsigned i = from[c]; i < trails[c]; ++i) {
                if (trail[c][i].op == 10u && !trail[c][i].w7 && (trail[c][i].w4 & 1u) && !(trail[c][i].w5 & 1u)) disabled = i + 1;
                if (trail[c][i].op == 10u && trail[c][i].w7 == 1u && !trail[c][i].w5) gone = i + 1;
            }
            assert(disabled && gone > disabled);
        }
        assert(mw_engines_unplaced_count == 2);
        /* In again: placed afresh at the same spot, activated. */
        assert(install(pkg_sc, sizeof pkg_sc) == MU_APPLIED);
        run(200);
        assert(slot_for(SC, MW_CTL_ACTIVE) && dsp_mask[0] == 1);
        placed_at(0, 1, sc); placed_at(1, 1, sc);
    } else if (mode == 1) {
        /* The guard: nothing is placed or unplaced while the sequencer plays or a pattern change waits. */
        quiet = 0;
        assert(install(pkg_sc, sizeof pkg_sc) == MU_APPLIED);
        run(300);
        assert(slot_for(SC, MW_CTL_BOUND) && !mw_engines_jobs && !trails[0] && !trails[1] && !dl_engine_reserved(0));
        assert(!words[0][0] && !dsp_mask[0]);
        quiet = 1;
        run(200);
        assert(slot_for(SC, MW_CTL_ACTIVE)); placed_at(0, 1, sc); placed_at(1, 1, sc);
        assert(refused(removal(SC), 32) == RUNTIME_BUSY);
        run(20);
        quiet = 0; /* the removal's switch, then play */
        assert(install(removal(SC), 32) == MU_APPLIED);
        unsigned jobs = mw_engines_jobs;
        run(300);
        assert(slot_for(SC, MW_CTL_RELEASED) && mw_engines_jobs == jobs && base_word[0][0] && base_word[1][0]);
        assert(mw_engines[0][0].state == MW_ENGINE_PLACED && dl_engine_reserved(0) == 388);
        quiet = 1;
        run(20);
        unplaced(0, 1); unplaced(1, 1);
        assert(!dl_engine_reserved(0) && !dl_engine_reserved(1));
    } else if (mode == 2) {
        /* Full: Sidechain and Analog BD fit on core A; Output Matrix does not, and is refused at admission. */
        assert(install(pkg_sc, sizeof pkg_sc) == MU_APPLIED && install(pkg_ab, sizeof pkg_ab) == MU_APPLIED);
        run(1000);
        assert(slot_for(SC, MW_CTL_ACTIVE) && slot_for(AB, MW_CTL_ACTIVE) && dsp_mask[0] == 5 && dsp_mask[1] == 5);
        for (unsigned c = 0; c < 2; ++c) { placed_at(c, 1, sc); placed_at(c, 4, ab); assert(dl_engine_reserved(c) == 1386 && test_capacity(c) == ab); }
        unsigned jobs = mw_engines_jobs;
        assert(refused(pkg_matrix, sizeof pkg_matrix) == RUNTIME_MEMORY);
        run(50);
        assert(mw_engines_jobs == jobs && !modwerk_controller_held_matrix());
        /* Analog BD out: Output Matrix fits where it was. */
        remove_module(AB);
        run(20);
        unplaced(0, 4); unplaced(1, 4);
        assert(dl_engine_reserved(0) == 388 && dl_engine_reserved(1) == 388);
        assert(install(pkg_matrix, sizeof pkg_matrix) == MU_APPLIED);
        run(300);
        assert(slot_for(MATRIX, MW_CTL_ACTIVE) && dsp_mask[0] == 3 && dsp_mask[1] == 1);
        placed_at(0, 2, sc - 773u);
        assert(mw_engines[1][1].state == MW_ENGINE_FREE && dl_engine_reserved(0) == 388 + 773 && dl_engine_reserved(1) == 388);
    } else if (mode == 3) {
        /* Live FX code where the engine goes that cannot move below it (1,000 words at the top, 400 at the bottom of the
         * 1,548 words left; mode 12 moves what can): refused until it is gone. */
        test_fx(4, 1000);
        uint8_t ids[16]; memset(ids, 0, sizeof ids);
        ids[4] = 4; ids[5] = 5; /* core A (T5, T6 FX1): 1,000 words, a quarter of the arena or more, so from the top */
        memcpy(test_parts[0], ids, 16);
        assert(test_select(ids, pump) == 1);
        assert(test_live(0, 4) == (int)(top - 1000u));
        assert(refused(pkg_sc, sizeof pkg_sc) == RUNTIME_MEMORY);
        run(50);
        assert(!mw_engines_jobs && !dl_engine_reserved(0) && !dl_engine_evacuations);
        memset(ids, 0, 16); memset(test_parts[0], 0, 16);
        assert(test_select(ids, pump) == 1 && test_live(0, 4) < 0);
        assert(install(pkg_sc, sizeof pkg_sc) == MU_APPLIED);
        run(200);
        assert(slot_for(SC, MW_CTL_ACTIVE)); placed_at(0, 1, sc);
        /* Once placed, a pick of that effect loads below the engines. */
        ids[4] = 3; memcpy(test_parts[0], ids, 16);
        assert(test_select(ids, pump) == 1 && test_live(0, 3) == (int)(sc - 900u));
    } else if (mode == 4) {
        /* The bank's Part union: four stock effects of 400 words fit the whole arena (1,600 of 1,936 words) but not
         * under Sidechain's engine (1,548): refused, so that no Part switch has to load code because of it. */
        memset(test_parts, 0, sizeof test_parts);
        test_parts[0][4] = 5; test_parts[1][5] = 6; test_parts[2][6] = 7; test_parts[3][7] = 8;
        assert(refused(pkg_sc, sizeof pkg_sc) == RUNTIME_MEMORY);
        assert(!dl_engine_reserved(0) && !mw_engines_jobs);
        test_parts[3][7] = 0; /* three of them: 1,200 words */
        assert(install(pkg_sc, sizeof pkg_sc) == MU_APPLIED);
        run(200);
        assert(slot_for(SC, MW_CTL_ACTIVE)); placed_at(0, 1, sc);
    } else if (mode == 5) {
        /* Rollback part way: core B's engine WRITE is refused. Its span goes back, core A stays placed; nothing is
         * reset or enabled anywhere; the removal unplaces core A and frees it. */
        refuse_write[1] = 64u + sc + 24u; /* its second chunk */
        assert(install(pkg_sc, sizeof pkg_sc) == MU_APPLIED);
        run(300);
        placed_at(0, 1, sc);
        assert(mw_engines[1][0].state == MW_ENGINE_FREE && !base_word[1][0] && !dl_engine_reserved(1) && dl_engine_reserved(0) == 388);
        assert(slot_for(SC, MW_CTL_BOUND) && !words[0][0] && !words[1][0] && !cas_count && !dsp_mask[0]);
        assert(install(removal(SC), 32) == MU_APPLIED); /* never touched: no disable needed */
        run(20);
        assert(slot_for(SC, MW_CTL_RELEASED));
        unplaced(0, 1);
        assert(!dl_engine_reserved(0) && test_capacity(0) == top);
    } else if (mode == 6) {
        /* An uncertain PLACE (refused on core A): the span stays for this boot, the feature is never enabled, and a
         * later controller of the feature is refused at admission. */
        refuse_place[0] = 64u + sc;
        assert(install(pkg_sc, sizeof pkg_sc) == MU_APPLIED);
        run(300);
        assert(mw_engines[0][0].state == MW_ENGINE_STUCK && dl_engine_reserved(0) == 388 && test_capacity(0) == sc);
        placed_at(1, 1, sc);
        assert(slot_for(SC, MW_CTL_BOUND) && !cas_count && !words[0][0] && !words[1][0]);
        assert(install(removal(SC), 32) == MU_APPLIED);
        run(20);
        assert(mw_engines[0][0].state == MW_ENGINE_STUCK && dl_engine_reserved(0) == 388);
        unplaced(1, 1);
        assert(!dl_engine_reserved(1));
        assert(refused(pkg_sc, sizeof pkg_sc) == RUNTIME_CONFLICT);
    } else if (mode == 7) {
        /* Part switches: the bank's union loads once; switching among its Parts afterwards starts no engine job,
         * changes no reserve or capacity, sends no PLACE, RESET or CAS and writes nothing at all. */
        memset(test_parts, 0, sizeof test_parts);
        test_parts[0][4] = 5; test_parts[1][4] = 6; test_parts[2][12] = 9; test_parts[3][1] = 7;
        assert(install(pkg_sc, sizeof pkg_sc) == MU_APPLIED);
        run(200);
        assert(slot_for(SC, MW_CTL_ACTIVE));
        uint8_t part[4][16];
        memcpy(part, test_parts, sizeof part);
        assert(test_select(part[0], pump) == 1); /* the first transaction loads the whole union */
        assert(test_live(0, 5) >= 0 && test_live(0, 6) >= 0 && test_live(0, 9) >= 0 && test_live(1, 7) >= 0);
        unsigned jobs = mw_engines_jobs, from[2] = {trails[0], trails[1]}, reserved[2] = {dl_engine_reserved(0), dl_engine_reserved(1)};
        static uint32_t region[2][2048];
        for (unsigned c = 0; c < 2; ++c) memcpy(region[c], &P[c][MODWERK_DSP_TABLE0 + 64u + sc], 388 * 4);
        for (unsigned n = 0; n < 12; ++n) {
            assert(test_select(part[n % 4], pump) == 1);
            run(5);
        }
        for (unsigned c = 0; c < 2; ++c) {
            assert(dl_engine_reserved(c) == reserved[c] && test_capacity(c) == sc && !engine_ops(c, from[c]));
            for (unsigned i = from[c]; i < trails[c]; ++i) assert(trail[c][i].op != 3u); /* no code load at all */
            assert(!memcmp(region[c], &P[c][MODWERK_DSP_TABLE0 + 64u + sc], 388 * 4));
        }
        assert(mw_engines_jobs == jobs && slot_for(SC, MW_CTL_ACTIVE) && dsp_mask[0] == 1 && dsp_mask[1] == 1);
    } else if (mode == 8) {
        /* A successor of the same feature adopts the placed engine: no new job, the same words. */
        assert(install(pkg_sc, sizeof pkg_sc) == MU_APPLIED);
        run(200);
        unsigned jobs = mw_engines_jobs;
        assert(refused(pkg_sc2, sizeof pkg_sc2) == RUNTIME_BUSY);
        run(20);
        assert(install(pkg_sc2, sizeof pkg_sc2) == MU_APPLIED);
        run(300);
        const struct mw_controller_slot *next = slot_for(SC, MW_CTL_ACTIVE);
        assert(next && next->binding.image_bytes == 96 && slot_for(SC, MW_CTL_RELEASED));
        assert(mw_engines_jobs == jobs && dsp_mask[0] == 1 && dsp_mask[1] == 1);
        placed_at(0, 1, sc); placed_at(1, 1, sc);
    } else if (mode == 9) {
        /* A hole: Sidechain (top) out while Analog BD (below it) stays: the reserve stays at Analog BD; Sidechain
         * back in reuses the hole without a claim. */
        assert(install(pkg_sc, sizeof pkg_sc) == MU_APPLIED && install(pkg_ab, sizeof pkg_ab) == MU_APPLIED);
        run(1000);
        remove_module(SC);
        run(20);
        unplaced(0, 1); unplaced(1, 1);
        placed_at(0, 4, ab); placed_at(1, 4, ab);
        assert(dl_engine_reserved(0) == 1386 && test_capacity(0) == ab);
        assert(install(pkg_sc, sizeof pkg_sc) == MU_APPLIED);
        run(300);
        placed_at(0, 1, sc); placed_at(1, 1, sc);
        assert(slot_for(SC, MW_CTL_ACTIVE) && dsp_mask[0] == 5 && dl_engine_reserved(0) == 1386);
        remove_module(AB);
        run(20);
        unplaced(0, 4);
        assert(dl_engine_reserved(0) == 388 && test_capacity(0) == sc);
    } else if (mode == 10) {
        /* Output Matrix alone: core A only, at the top. */
        assert(install(pkg_matrix, sizeof pkg_matrix) == MU_APPLIED);
        run(300);
        assert(slot_for(MATRIX, MW_CTL_ACTIVE) && dsp_mask[0] == 2 && !dsp_mask[1]);
        placed_at(0, 2, mx); ordered(0, 2, mx, 0);
        assert(dl_engine_reserved(0) == 773 && !dl_engine_reserved(1) && !trails[1]);
    } else if (mode == 11) {
        /* Analog BD from a package no trust row names (same module id, other bytes) is an ordinary package: accepted,
         * never bound, nothing placed or reserved. The rows' own package then places on both cores, below Sidechain.
         * The development view shows both. */
        assert(install(pkg_sc, sizeof pkg_sc) == MU_APPLIED);
        run(200);
        assert(install(pkg_ab_other, sizeof pkg_ab_other) == MU_APPLIED);
        unsigned jobs = mw_engines_jobs;
        run(300);
        assert(!(modwerk_controller_held() & 4u) && mw_engines_jobs == jobs && !mw_engines_admitted[2]);
        assert(mw_engines[0][2].state == MW_ENGINE_FREE && dl_engine_reserved(0) == 388 && dl_engine_reserved(1) == 388);
        const struct mw_engines_view *v = &mw_engines_view;
        assert(!memcmp(v->magic, "MWEV", 4) && v->held == 1 && v->state[0][0] == MW_ENGINE_PLACED && v->state[0][2] == MW_ENGINE_FREE);
        assert(v->arena[0] == sc && v->reserved[1] == 388 && v->jobs == jobs && v->offset[1][0] == sc);
        unsigned sc_slot = 6;
        for (unsigned i = 0; i < 6; ++i) if (v->slots[i].module == SC && v->slots[i].state == MW_CTL_ACTIVE) sc_slot = i;
        assert(sc_slot < 6 && v->slots[sc_slot].feature == 1 && v->slots[sc_slot].enable_acks == 3 &&
               v->slots[sc_slot].acknowledged[0] == 1042 && v->slots[sc_slot].reset[1] == 1042);
        assert(install(removal(AB), 32) == MU_APPLIED);
        assert(install(pkg_ab, sizeof pkg_ab) == MU_APPLIED);
        assert(mw_engines_admitted[2] == 1 + MW_ENGINE_FITS);
        run(800);
        assert(slot_for(AB, MW_CTL_ACTIVE) && dsp_mask[0] == 5 && dsp_mask[1] == 5);
        placed_at(0, 4, ab); placed_at(1, 4, ab);
        assert(v->state[0][2] == MW_ENGINE_PLACED && v->arena[0] == ab && v->held == 5 && v->claim_why[0] == 0 && !v->wait[1][2]);
    } else if (mode == 12) {
        /* Evacuation: the big effect sits where Sidechain's engine goes. Admission takes it (the effect can move below);
         * the tick moves it in one transaction (upload while it runs, one BIND, then the old copy freed and the capacity
         * lowered), and only then is the engine written over the old copy's words, placed and switched on. Every frame of
         * it the slot runs whole code (running_whole). */
        big_at_top(0);
        unsigned checked = frames_checked;
        /* The new copy goes top-down below the region and clear of the old copy, which runs until its BIND: 136. */
        assert(install(pkg_sc, sizeof pkg_sc) == MU_APPLIED && mw_engines_admitted[0] == 1 + MW_ENGINE_FITS);
        run(400);
        assert(slot_for(SC, MW_CTL_ACTIVE) && dsp_mask[0] == 1 && dsp_mask[1] == 1);
        placed_at(0, 1, sc); placed_at(1, 1, sc); ordered(1, 1, sc, 0);
        assert(test_live(0, 3) == (int)(moved) && dispatch[0][3] == 64u + moved + 1u);
        assert(dl_engine_evacuations == 1 && dl_engine_moves == 1 && !dl_engine_evac_failures && !dl_engine_evacuation());
        assert(dl_engine_reserved(0) == 388 && test_capacity(0) == sc && modwerk_dsp_arena_now(0) == sc);
        /* Order on core A: the new copy whole, then its one BIND, then the engine's first word; core B moved nothing. */
        unsigned bind = first_op(0, 0, 4, 3, 64u + moved), engine = first_op(0, 0, 3, 0, 64u + sc);
        assert(bind < engine && engine < trails[0] && count_ops(0, 0, 4) == 2 && !count_ops(1, 0, 4));
        ordered(0, 1, sc, bind + 1u);
        unsigned copied = 0;
        for (unsigned i = 0; i < bind; ++i) if (trail[0][i].op == 3u && trail[0][i].w5 >= 64u + moved && trail[0][i].w5 < 64u + moved + 900u) copied += trail[0][i].w4;
        assert(copied == 900 && moved == 136);
        assert(frames_checked > checked + 300);
        /* The old copy's words below the engine reused for anything: the slot never notices. */
        for (unsigned w = 64u + top - 900u; w < 64u + sc; ++w) P[0][MODWERK_DSP_TABLE0 + w] = 0xdead00u;
        run(50);
        /* Removal: the engine goes, the capacity comes back, the effect stays where it moved. */
        remove_module(SC);
        unplaced(0, 1); unplaced(1, 1);
        assert(!dl_engine_reserved(0) && test_capacity(0) == top && test_live(0, 3) == (int)(moved));
    } else if (mode == 13) {
        /* Nothing moves while playing, within two seconds of a key, or while a pick waits; then it does. */
        big_at_top(0);
        unsigned from = trails[0], from1 = trails[1];
        quiet = 0;
        assert(install(pkg_sc, sizeof pkg_sc) == MU_APPLIED);
        run(300);
        assert(trails[0] == from && trails[1] == from1 && !mw_engines_jobs && !dl_engine_evacuations && test_live(0, 3) == (int)(top - 900u));
        assert(mw_engines_wait[0][0] == MW_WAIT_PLAYING && slot_for(SC, MW_CTL_BOUND));
        quiet = 1; key_at = ticks; /* stopped by a key: core B places at once, core A waits for the two seconds */
        run(100);
        assert(!count_ops(0, from, 3) && !count_ops(0, from, 4) && test_live(0, 3) == (int)(top - 900u) && !dl_engine_evacuations);
        assert(mw_engines_wait[0][0] == MW_WAIT_EVACUATION && dl_engine_why[0] == 7 && mw_engines[1][0].state == MW_ENGINE_PLACED);
        pick_waiting = 1;
        run(200);
        assert(!count_ops(0, from, 3) && !dl_engine_evacuations && dl_engine_why[0] == 7);
        quiet = 0; pick_waiting = 0; /* playing again: still nothing */
        run(200);
        assert(!count_ops(0, from, 3) && !dl_engine_evacuations);
        quiet = 1;
        run(400);
        assert(slot_for(SC, MW_CTL_ACTIVE) && dl_engine_evacuations == 1 && test_live(0, 3) == (int)(moved));
        placed_at(0, 1, sc); placed_at(1, 1, sc);
    } else if (mode == 14) {
        /* The bank's Part union no longer fits under the engine even with the effect moved: refused at admission and on
         * the tick, nothing moved. A Part names module 40 (700 words) beside the running 900-word effect: 1,600 > 1,548. */
        big_at_top(0);
        test_fx(40, 700);
        test_parts[1][4] = 40;
        unsigned from = trails[0], from1 = trails[1];
        assert(refused(pkg_sc, sizeof pkg_sc) == RUNTIME_MEMORY && dl_engine_why[0] == 3);
        run(100);
        assert(trails[0] == from && trails[1] == from1 && !mw_engines_jobs && !dl_engine_evacuations && test_live(0, 3) == (int)(top - 900u));
        assert(!dl_engine_reserved(0) && test_capacity(0) == top);
        /* A smaller module (600) fits under the engine from scratch, but not beside the effect where it would move to
         * (136-1,036, clear of its old copy): still refused, so no Part switch to it would have to move code. */
        test_fx(40, 600);
        assert(refused(pkg_sc, sizeof pkg_sc) == RUNTIME_MEMORY && dl_engine_why[0] == 3);
        run(50);
        assert(trails[0] == from && !dl_engine_evacuations);
        /* Without that Part's module it fits: moved, placed. */
        test_parts[1][4] = 0;
        assert(install(pkg_sc, sizeof pkg_sc) == MU_APPLIED);
        run(400);
        assert(slot_for(SC, MW_CTL_ACTIVE) && dl_engine_evacuations == 1 && test_live(0, 3) == (int)(moved));
    } else if (mode == 15) {
        /* The new copy's upload is refused part way: no BIND was sent, the effect runs its old copy, the new span is
         * free again, the claim is refused and that core evacuates nothing more this boot. */
        big_at_top(0);
        refuse_write[0] = 64u + moved + 24u; /* the new copy's second chunk */
        assert(install(pkg_sc, sizeof pkg_sc) == MU_APPLIED);
        run(400);
        assert(test_live(0, 3) == (int)(top - 900u) && dispatch[0][3] == 64u + top - 900u + 1u && count_ops(0, 0, 4) == 1);
        assert(dl_engine_evac_failures == 1 && !dl_engine_evacuations && dl_engine_why[0] == 8 && (dl_engine_evacuation() >> 4) == 1);
        assert(mw_engines[0][0].state == MW_ENGINE_FREE && !dl_engine_reserved(0) && test_capacity(0) == top && test_idle());
        assert(mw_engines_wait[0][0] == MW_WAIT_CLAIM_REFUSED && slot_for(SC, MW_CTL_BOUND) && !cas_count);
        placed_at(1, 1, sc);
        assert(refused(pkg_matrix, sizeof pkg_matrix) == RUNTIME_MEMORY); /* its region holds the effect too */
        /* Once the effect is gone, the claim goes ahead without moving anything. */
        uint8_t none[16]; memset(none, 0, sizeof none); memset(test_parts, 0, sizeof test_parts);
        assert(test_select(none, pump) == 1);
        run(300);
        assert(slot_for(SC, MW_CTL_ACTIVE) && dl_engine_evac_failures == 1 && !dl_engine_evacuations);
        placed_at(0, 1, sc);
    } else if (mode == 16) {
        /* Several packages in the region move in one transaction, both uploads before either BIND; a Part switch during
         * it waits for it and loads nothing; Part switches after start no move and no engine job. */
        uint8_t ids[16];
        several_in_region(ids);
        assert(install(pkg_sc, sizeof pkg_sc) == MU_APPLIED);
        unsigned from = trails[0];
        run_until(evacuating, 20);
        assert(test_select(ids, pump) == 1); /* queued behind the evacuation, then nothing to load */
        run(400);
        assert(slot_for(SC, MW_CTL_ACTIVE) && dl_engine_evacuations == 1 && dl_engine_moves == 2);
        assert(test_live(0, 8) == 800 && test_live(0, 9) == 400 && test_live(0, 5) == 0);
        placed_at(0, 1, sc);
        unsigned b8 = first_op(0, from, 4, 8, 64u + 800u), b9 = first_op(0, from, 4, 9, 64u + 400u);
        assert(b8 < b9 && b9 < trails[0] && count_ops(0, from, 4) == 2);
        unsigned written = 0;
        for (unsigned i = from; i < b8; ++i) assert(trail[0][i].op == 3u); /* both copies uploaded first */
        for (unsigned i = from; i < trails[0]; ++i) if (trail[0][i].op == 3u && trail[0][i].w5 < 64u + sc) written += trail[0][i].w4;
        assert(written == 700); /* the two new copies and nothing else: the Part switch loaded nothing */
        unsigned jobs = mw_engines_jobs, after = trails[0];
        for (unsigned n = 0; n < 12; ++n) { assert(test_select(ids, pump) == 1); run(5); }
        assert(mw_engines_jobs == jobs && trails[0] == after && dl_engine_evacuations == 1 && dl_engine_moves == 2);
    } else if (mode == 17 || mode == 18) {
        /* A BIND fails part way (17: refused; 18: applied but never answered, so the transport times out): every entry
         * the evacuation touched goes back to its old copy, acknowledged, before the new copies are freed; the claim is
         * refused, nothing of the engine reaches core A. */
        uint8_t ids[16];
        several_in_region(ids);
        if (mode == 17) refuse_bind[0] = 64u + 400u; /* id 9's new copy: its BIND comes second */
        else drop_bind[0] = 64u + 400u;
        refuse_once[0] = 64u + 1200u; /* and id 8's way back is refused once: sent again until it lands */
        unsigned from = trails[0];
        assert(install(pkg_sc, sizeof pkg_sc) == MU_APPLIED);
        run(500);
        assert(test_live(0, 8) == 1200 && test_live(0, 9) == 1600 && test_idle());
        assert(dispatch[0][8] == 64u + 1200u + 1u && dispatch[0][9] == 64u + 1600u + 1u);
        unsigned n8 = first_op(0, from, 4, 8, 64u + 800u), n9 = first_op(0, from, 4, 9, 64u + 400u);
        unsigned o8 = first_op(0, n9, 4, 8, 64u + 1200u), o9 = first_op(0, n9, 4, 9, 64u + 1600u);
        assert(n8 < n9 && n9 < o8 && o8 < trails[0] && o9 < trails[0] && first_op(0, o8 + 1u, 4, 8, 64u + 1200u) < trails[0]);
        assert(dl_engine_evac_failures == 1 && !dl_engine_evacuations && dl_engine_moves == 1 && dl_engine_why[0] == 8);
        assert(mw_engines[0][0].state == MW_ENGINE_FREE && !dl_engine_reserved(0) && test_capacity(0) == top);
        assert(first_op(0, from, 3, 0, 64u + sc) == trails[0] && !base_word[0][0] && slot_for(SC, MW_CTL_BOUND) && !cas_count);
        if (mode == 18) assert(dl_errors);
    } else if (mode == 19) {
        /* Both cores: the effect at the top of each; one evacuation per core, one after the other; then placed. */
        big_at_top(1);
        assert(install(pkg_sc, sizeof pkg_sc) == MU_APPLIED);
        run(600);
        assert(slot_for(SC, MW_CTL_ACTIVE) && dl_engine_evacuations == 2 && dl_engine_moves == 2);
        assert(test_live(0, 3) == (int)(moved) && test_live(1, 3) == (int)(moved));
        placed_at(0, 1, sc); placed_at(1, 1, sc);
        assert(count_ops(0, 0, 4) == 2 && count_ops(1, 0, 4) == 2); /* each: the first load's BIND, the move's */
    } else if (mode == 20) {
        /* Sidechain let go while its evacuation runs: the evacuation finishes (moving back would be another move), and the
         * words it reserved go back to the FX code once no held engine waits for them. */
        big_at_top(0);
        assert(install(pkg_sc, sizeof pkg_sc) == MU_APPLIED);
        run_until(evacuating, 20);
        assert(install(removal(SC), 32) == MU_APPLIED); /* bound, never touched: no disable needed */
        run(200);
        assert(dl_engine_evacuations == 1 && test_live(0, 3) == (int)(moved) && !mw_engines_jobs);
        assert(!dl_engine_reserved(0) && !dl_engine_reserved(1) && test_capacity(0) == top && !modwerk_controller_held());
    } else if (mode == 21) {
        /* Code that cannot move below the region (no place for it: 1,000 words at the top, 400 at the bottom of a
         * 1,548-word arena): refused at admission, nothing moved. */
        test_fx(4, 1000);
        uint8_t ids[16]; memset(ids, 0, sizeof ids); memset(test_parts, 0, sizeof test_parts);
        ids[4] = 4; ids[5] = 5;
        assert(test_select(ids, pump) == 1 && test_live(0, 4) == (int)(top - 1000u) && test_live(0, 5) == 0);
        unsigned from = trails[0];
        assert(refused(pkg_sc, sizeof pkg_sc) == RUNTIME_MEMORY && dl_engine_why[0] == 2);
        run(100);
        assert(trails[0] == from && !dl_engine_evacuations && test_live(0, 4) == (int)(top - 1000u));
    } else if (mode == 22 || mode == 23 || mode == 24) {
        /* dl_move's rollback (compaction moves code while it plays): the moved effect keeps running its old copy, which
         * stays held until the cancel; it is never sent to the dry stub. 22: the new copy's upload refused part way (no
         * BIND sent); 23: its BIND refused, and the way back refused once (sent again until it lands); 24: its BIND
         * applied but never answered (the transport times out). Every frame the slot runs whole code from its old copy or,
         * between an applied BIND and the way back, its new one (running_whole). */
        uint8_t ids[16]; memset(ids, 0, sizeof ids); memset(test_parts, 0, sizeof test_parts);
        ids[4] = 5;
        assert(test_select(ids, pump) == 1 && test_live(0, 5) == 0 && dispatch[0][5] == 65u);
        unsigned from = trails[0], rollbacks = dl_residency_rollbacks;
        if (mode == 22) refuse_write[0] = 64u + 800u + 24u; /* the new copy's second chunk */
        else if (mode == 23) refuse_bind[0] = 64u + 800u, refuse_once[0] = 64u;
        else drop_bind[0] = 64u + 800u;
        assert(test_move(0, 5, 800));
        run(300);
        assert(test_idle() && test_live(0, 5) == 0 && dispatch[0][5] == 65u && !test_stubbed(0, 5));
        assert(dl_residency_rollbacks == rollbacks + 1 && !count_ops(0, from, 5) && !count_ops(0, from, 6));
        unsigned back = first_op(0, from, 4, 5, 64u);
        assert(back < trails[0]); /* one BIND back to the old copy */
        if (mode == 22) assert(count_ops(0, from, 4) == 1 && first_op(0, from, 4, 5, 64u + 800u) == trails[0]);
        if (mode == 23) assert(first_op(0, back + 1u, 4, 5, 64u) < trails[0]);
        if (mode == 24) assert(dl_errors && first_op(0, from, 4, 5, 64u + 800u) < back);
        /* The new copy's words are free again: whatever goes there, the slot never notices. */
        for (unsigned w = 64u + 800u; w < 64u + 1200u; ++w) P[0][MODWERK_DSP_TABLE0 + w] = 0xdead00u;
        run(20);
        /* A later move lands. */
        refuse_write[0] = refuse_bind[0] = 0;
        assert(test_move(0, 5, 800));
        run(300);
        assert(test_idle() && test_live(0, 5) == 800 && dispatch[0][5] == 64u + 800u + 1u && !test_stubbed(0, 5));
    } else if (mode == 25) {
        /* Fail closed: an old copy that a new copy of the same transaction may have overwritten is not rebound; the id
         * goes to the dry stub, as before. Made up (dl_allocator_move keeps a new copy clear of all live code): id 6 planned
         * over id 5's old copy, its first chunk refused, so the move rolls back. */
        uint8_t ids[16]; memset(ids, 0, sizeof ids); memset(test_parts, 0, sizeof test_parts);
        ids[4] = 5;
        assert(test_select(ids, pump) == 1 && test_live(0, 5) == 0);
        unsigned from = trails[0];
        assert(test_move(0, 5, 800));
        test_inject_target(0, 6, 0, 400);
        refuse_write[0] = 64u; /* id 6's first chunk; id 5's new copy (800) went first */
        stub_ok = 5;
        run(300);
        assert(test_idle() && test_live(0, 5) == 0 && !dispatch[0][5] && test_stubbed(0, 5));
        assert(first_op(0, from, 6, 5, 0) < trails[0] && first_op(0, from, 4, 5, 64u) == trails[0]);
    } else if (mode == 26) {
        /* A Part switch that needs an upload while an owned job holds the core: Sidechain's engine WRITE on core A, then
         * the board's RESET there. dl_job_status answers -2 for that core; the manager waits and the switch completes
         * after the job, with no rollback or failure. */
        uint8_t ids[16]; memset(ids, 0, sizeof ids); memset(test_parts, 0, sizeof test_parts);
        ids[0] = 7; /* core B: probes both cores and starts the manager */
        assert(test_select(ids, pump) == 1);
        unsigned rollbacks = dl_residency_rollbacks, failures = dl_residency_failures;
        assert(install(pkg_sc, sizeof pkg_sc) == MU_APPLIED);
        for (unsigned n = 0; n < 400 && !(mw_engines[0][0].state == MW_ENGINE_WRITING && dl_owned_holder(0)); ++n) board_pump();
        assert(mw_engines[0][0].state == MW_ENGINE_WRITING && dl_owned_holder(0));
        uint32_t held = dl_owned_holder(0);
        unsigned from = trails[0];
        ids[4] = 5;
        assert(test_select(ids, board_pump) == 1 && test_owned_seen() >= held);
        unsigned fx = first_op(0, from, 3, 0, 64u + (unsigned)test_live(0, 5));
        assert(fx < trails[0]);
        unsigned engine = trails[0];
        for (unsigned i = from; i < trails[0]; ++i) if (trail[0][i].op == 3u && trail[0][i].w5 >= 64u + sc) { engine = i; break; }
        assert(engine < fx); /* the engine's own chunk first */
        /* The board's RESET on core A. */
        for (unsigned n = 0; n < 2000 && !(words[0][0] && words[0][0] < totals[0] && dl_owned_holder(0)); ++n) board_pump();
        assert(words[0][0] && words[0][0] < totals[0] && dl_owned_holder(0));
        held = dl_owned_holder(0);
        unsigned reset = words[0][0];
        from = trails[0];
        ids[5] = 6;
        assert(test_select(ids, board_pump) == 1 && test_owned_seen() >= held);
        assert(first_op(0, from, 3, 0, 64u + (unsigned)test_live(0, 6)) < trails[0] && words[0][0] >= reset);
        run(400); /* the RESET goes on after the switch */
        assert(slot_for(SC, MW_CTL_ACTIVE) && dsp_mask[0] == 1 && dsp_mask[1] == 1 && words[0][0] == totals[0]);
        placed_at(0, 1, sc); placed_at(1, 1, sc);
        assert(dl_residency_rollbacks == rollbacks && dl_residency_failures == failures);
        assert(dispatch[0][5] == 64u + (unsigned)test_live(0, 5) + 1u && dispatch[0][6] == 64u + (unsigned)test_live(0, 6) + 1u);
    } else if (mode == 29) {
        /* Cached code never blocks a pick (beta finding 54): Part 1's four effects (1,600 words) stay loaded for the
         * bank's union while Part 2 runs none of them; a pick there of a 900-word effect fits the arena but not beside
         * them, so the manager retires them first, in a transaction of its own that writes nothing, then loads it. */
        memset(test_parts, 0, sizeof test_parts);
        test_parts[0][4] = 5; test_parts[0][5] = 6; test_parts[0][6] = 7; test_parts[0][7] = 8;
        uint8_t ids[16];
        memcpy(ids, test_parts[0], 16);
        assert(test_select(ids, pump) == 1);
        memset(ids, 0, 16);
        assert(test_select(ids, pump) == 1); /* Part 2: nothing runs, the union stays loaded */
        assert(test_live(0, 5) >= 0 && test_live(0, 6) >= 0 && test_live(0, 7) >= 0 && test_live(0, 8) >= 0);
        unsigned from = trails[0], trims = test_trims();
        ids[4] = 3;
        assert(test_select(ids, pump) == 1);
        assert(test_trims() == trims + 1 && test_idle() && test_live(0, 3) >= 0);
        assert(test_live(0, 5) < 0 && test_live(0, 6) < 0 && test_live(0, 7) < 0 && test_live(0, 8) < 0);
        assert(trail[0][from].op == 5u || trail[0][from].op == 6u);             /* the retirement first, no WRITE in it */
        assert(count_ops(0, from, 5) + count_ops(0, from, 6) >= 4 && first_op(0, from, 3, 0, 0) > from + 3);
        /* The same pick again changes nothing and trims nothing. */
        trims = test_trims();
        assert(test_select(ids, pump) == 1 && test_trims() == trims);
    } else if (mode == 30) {
        /* Nothing cached, the running code itself blocks: a 700-word effect on T8 FX1 fits from scratch (1,900) but not
         * beside the running four (2,300). The slot's old effect is unloaded first (the slot runs the stub meanwhile), and
         * the hole it leaves joins the free top of the arena, so the pick loads; the other three stay where they are. */
        test_fx(11, 700);
        memset(test_parts, 0, sizeof test_parts);
        test_parts[0][4] = 5; test_parts[0][5] = 6; test_parts[0][6] = 7; test_parts[0][7] = 8;
        uint8_t ids[16];
        memcpy(ids, test_parts[0], 16);
        assert(test_select(ids, pump) == 1);
        unsigned from = trails[0], trims = test_trims(), unloads = test_unloads();
        ids[7] = 11;
        assert(test_select(ids, pump) == 1);
        assert(test_trims() == trims && test_unloads() == unloads + 1 && test_idle());
        assert(test_live(0, 11) >= 0 && test_live(0, 8) < 0 && test_live(0, 5) == 0 && test_live(0, 6) == 400 && test_live(0, 7) == 800);
        assert(trail[0][from].op == 6u && trail[0][from].w4 == 8u && count_ops(0, from, 6) == 1); /* 8's unload alone, first */
        assert(first_op(0, from, 3, 0, 0) > from);
    } else if (mode == 31) {
        /* Every selected effect stays loaded while the bank fits (1,600 of 1,936), whatever the patterns play. Short of
         * room (900 + 3 x 400), the Parts the patterns play (and the current one) are held, then modules only. */
        memset(test_parts, 0, sizeof test_parts);
        test_parts[0][4] = 5; test_parts[1][5] = 6; test_parts[2][6] = 7; test_parts[3][7] = 8;
        test_parts_used = 0x1u;
        uint8_t ids[16];
        memcpy(ids, test_parts[0], 16);
        assert(test_select(ids, pump) == 1);
        assert(test_live(0, 5) >= 0 && test_live(0, 6) >= 0 && test_live(0, 7) >= 0 && test_live(0, 8) >= 0);
        test_parts[0][4] = 3; memcpy(ids, test_parts[0], 16);
        assert(test_select(ids, pump) == 1);                                        /* Part 1 played: its 900 only */
        assert(test_live(0, 3) >= 0 && test_live(0, 6) < 0 && test_live(0, 7) < 0 && test_live(0, 8) < 0);
        test_parts_used = 0x3u;
        assert(test_select(ids, pump) == 1);                                        /* Part 2 played too */
        assert(test_live(0, 3) >= 0 && test_live(0, 6) >= 0 && test_live(0, 7) < 0 && test_live(0, 8) < 0);
        test_parts_used = 0xfu;
        assert(test_select(ids, pump) == 1);                                        /* all played, none fit: the target */
        assert(test_live(0, 3) >= 0 && test_live(0, 6) < 0 && test_live(0, 7) < 0 && test_live(0, 8) < 0);
    } else if (mode == 32) {
        /* Past the arena from scratch (2,100 of 1,936): refused as before, nothing retired, nothing sent, idle after. */
        memset(test_parts, 0, sizeof test_parts);
        test_parts[0][4] = 5; test_parts[0][5] = 6; test_parts[0][6] = 7; test_parts[0][7] = 8;
        uint8_t ids[16];
        memcpy(ids, test_parts[0], 16);
        assert(test_select(ids, pump) == 1);
        unsigned from = trails[0], trims = test_trims(), unloads = test_unloads();
        ids[4] = 3;
        assert(test_select(ids, pump) == DL_SELECT_MEMORY);
        assert(test_trims() == trims && test_unloads() == unloads && test_idle() && trails[0] == from && test_live(0, 5) >= 0);
    } else if (mode == 33) {
        /* Both in turn: Part 2's 400-word effect (loaded for the bank, no slot runs it) is retired first; the 600-word
         * pick still does not fit beside the slot's own 600 words at the arena's top, so that is unloaded too, then the
         * pick loads into its place. */
        test_fx(11, 600); test_fx(12, 600);
        memset(test_parts, 0, sizeof test_parts);
        test_parts[0][4] = 12; test_parts[0][5] = 3; test_parts[1][6] = 5;
        uint8_t ids[16];
        memcpy(ids, test_parts[0], 16);
        assert(test_select(ids, pump) == 1);
        assert(test_live(0, 5) == 0 && test_live(0, 3) == 436 && test_live(0, 12) == 1336); /* 1,900 of 1,936 */
        unsigned from = trails[0], trims = test_trims(), unloads = test_unloads();
        ids[4] = 11;
        assert(test_select(ids, pump) == 1);
        assert(test_trims() == trims + 1 && test_unloads() == unloads + 1 && test_idle());
        assert(test_live(0, 11) == 1336 && test_live(0, 3) == 436 && test_live(0, 5) < 0 && test_live(0, 12) < 0);
        unsigned gone5 = first_op(0, from, 6, 5, 0), gone12 = first_op(0, from, 6, 12, 0), load = first_op(0, from, 3, 0, 0);
        assert(gone5 < gone12 && gone12 < load && load < trails[0]);
    } else if (mode == 34) {
        /* A request unloaded for, then dropped (another pick replaced it): its slot runs the stub on its old id, so the
         * observer is nudged to load that back; the manager ends idle with the request's code never loaded. */
        test_fx(10, 500);
        memset(test_parts, 0, sizeof test_parts);
        test_parts[0][4] = 5; test_parts[0][5] = 6; test_parts[0][6] = 7; test_parts[0][7] = 8;
        uint8_t ids[16];
        memcpy(ids, test_parts[0], 16);
        assert(test_select(ids, pump) == 1);
        test_set_observed_valid(1);
        struct dl_selection s;
        memset(&s, 0, sizeof s); memcpy(s.target, ids, 16); s.target[4] = 10;
        assert(dl_selection_prepare(&s, 99) == DL_SELECT_WAIT && test_unloads() == 1 && test_phase());
        dl_selection_cancel(99);
        for (unsigned n = 0; n < 4000 && test_phase(); ++n) { pump(); test_advance(); }
        assert(test_idle() && !test_observed_valid() && test_live(0, 5) < 0 && test_live(0, 10) < 0 && test_live(0, 6) >= 0);
    } else if (mode == 27) {
        /* The wait is bounded per owned job: two jobs in a row hold core A for 800 frames, and the switch completes after
         * them; one reservation that never ends refuses the switch after 600 refused starts, as before the wait; once it
         * is gone, the switch goes through. */
        uint8_t ids[16]; memset(ids, 0, sizeof ids); memset(test_parts, 0, sizeof test_parts);
        ids[0] = 7;
        assert(test_select(ids, pump) == 1);
        assert(dl_owned_command_reserve(0, 78u, DL_PROBE, 0, 0, 0, &relay));
        ids[4] = 6;
        assert(test_select(ids, relay_pump) == 1 && relay_n > 800u && test_live(0, 6) >= 0);
        ids[4] = 0;
        assert(test_select(ids, pump) == 1);
        struct dl_owned_job stuck;
        assert(dl_owned_command_reserve(0, 77u, DL_PROBE, 0, 0, 0, &stuck));
        unsigned failures = dl_residency_failures;
        ids[4] = 5;
        assert(test_select(ids, pump) == DL_SELECT_UNAVAILABLE && dl_residency_failures > failures && test_live(0, 5) < 0);
        assert(dl_owned_cancel(&stuck) == 1);
        run(50);
        assert(test_idle() && test_select(ids, pump) == 1 && test_live(0, 5) >= 0);
    } else if (mode == 28) {
        /* The same wait in the table step (phase 8): its DL_BASE start meets an owned job holding core B, while the
         * switch itself loads on core A. It waits, and the switch completes once that job is gone. */
        uint8_t ids[16]; memset(ids, 0, sizeof ids); memset(test_parts, 0, sizeof test_parts);
        ids[0] = 7;
        assert(test_select(ids, pump) == 1);
        unsigned rollbacks = dl_residency_rollbacks, failures = dl_residency_failures, from = trails[1];
        assert(dl_owned_command_reserve(1, 77u, DL_PROBE, 0, 0, 0, &held_b));
        uint32_t held = dl_owned_holder(1);
        ids[4] = 5;
        assert(test_select(ids, table_pump) == 1 && in_tables >= 50 && !dl_owned_holder(1) && test_owned_seen() == held);
        assert(test_table_matches(1, 0) && first_op(1, from, 7, 0, 0) < trails[1] && test_live(0, 5) >= 0);
        assert(dl_residency_rollbacks == rollbacks && dl_residency_failures == failures);
    } else assert(0);
    return 0;
}
'''


def generated(work, units):
    spec = importlib.util.spec_from_file_location('resident_engines_board_core', ELEK / 'build_core.py')
    core = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(core)
    for name in core.DYNLOAD_SOURCES:
        text = reference = (core.DYNLOAD / name).read_text()
        for old, new in core.DSP_EDITS.get(name, ()) + core.WIDTH_EDITS.get(name, ()):
            assert text.count(old) == 1, name
            text = text.replace(old, new)
        if name == 'buffers.c':
            text = resident_placement.buffers(text)
        elif name == 'manager.c':
            text = resident_engines.manager(resident_journal.manager(resident_placement.manager(text)))
        elif name == 'transfer.c':
            text = resident_engines.transport(resident_driver.transport(text))
        elif name == 'transfer.h':
            text = resident_driver.transport_header(text)
        if name in zero_state.UNITS:
            text = zero_state.unit(name, text, reference)
        if name == 'transfer.c':
            text = text.replace('*(volatile uint32_t *)0xfc07c00cu', 'test_clock')
        if name == 'manager.c':  # the bank's Parts and the queued bank and pattern are the fixture's
            for old, new in (('uint32_t bank=*(volatile uint32_t *)0x46c82456u;\n    for(unsigned c=0;c<2;++c) keep[c]',
                              'extern uint32_t test_bank;uint32_t bank=test_bank;\n    for(unsigned c=0;c<2;++c) keep[c]'),
                             ('unsigned qb=*(volatile uint8_t *)0x800065bfu,qp=*(volatile uint8_t *)0x800065c0u,qpart=4u;',
                              'extern uint8_t test_qb,test_qp,test_parts[4][16];unsigned qb=test_qb,qp=test_qp,qpart=4u;'),
                             (': bank ? *(volatile uint8_t *)(uintptr_t)(bank+0x8ed80u+n*6322u+i) : 255u;',
                              ': bank ? test_parts[n][i] : 255u;'),
                             ('    unsigned part=*(volatile uint8_t *)0x80000003u,m=part<4u ? 1u<<part : 0u;\n'
                              '    for(unsigned p=0;bank && p<16u;++p) { unsigned q=*(volatile uint8_t *)(uintptr_t)(bank+p*0x8ed8u+0x8e57u); if(q<4u) m|=1u<<q; }\n'
                              '    return m;',
                              '    extern unsigned test_parts_used;(void)bank;return test_parts_used;')):
                assert text.count(old) == 1, old
                text = text.replace(old, new)
        (work / name).write_text(text)
    (work / 'manager_unit.c').write_text(MANAGER_UNIT)
    (work / 'resident-engines-data.c').write_text(resident_engines.data_c(units))
    (work / 'expected.h').write_text(expected(units))
    shutil.copyfile(ELEK / 'fxids.h', work / 'fxids.h')
    # Analog BD built another way (on the unit: the recipe-capture run's output, not the rows' package): the same
    # module id, other bytes, so no trust row names it.
    other = board.package(0xabdb1445, bytes((7 * i + 1) & 255 for i in range(128)))
    (work / 'packages.h').write_text(board.header() + 'static const uint8_t pkg_ab_other[%d] = {%s};\n' % (
        len(other), ','.join(map(str, other))))
    preamble = board.FIXTURE.split('/* Modelled receiver')[0]
    (work / 'fixture.c').write_text(preamble + 'unsigned modwerk_dsp_arena_now(unsigned);\n'
                                    'static int modwerk_controller_held_matrix(void) { return (modwerk_controller_held() & 2u) != 0; }\n'
                                    + MODEL)


def build(work):
    flags = ['-std=c11', '-Wall', '-Wextra', '-Werror', *SANITIZE, '-fno-omit-frame-pointer',
             '-DDL_NATIVE_TEST', '-DMW_CONTROLLER_TRANSPORT_TEST', '-DMW_CONTROLLER_BOARD_TEST', '-DMW_ENGINES_TEST',
             '-DMODWERK_RESIDENT_STOCK_HOOKS', '-DMODWERK_RESIDENT_ON_DEMAND', '-DMODWERK_DEV',
             '-DMODWERK_RUNTIME_METADATA_EXTERNAL', '-DMODWERK_FX_IDS=64', '-DMODWERK_DSP_TABLE0=%d' % TABLE,
             '-DMODWERK_DSP_TABLE1=%d' % TABLE, '-DMODWERK_DSP_WORDS0=%d' % WORDS, '-DMODWERK_DSP_WORDS1=%d' % WORDS,
             '-DMODWERK_DSP_ALLOWANCE0=3120', '-DMODWERK_DSP_ALLOWANCE1=3565', '-DBOARD_ROWS', '-DBOARD_MANAGER',
             '-I' + str(work), '-I' + str(POLICY), '-I' + str(ADAPTER), '-I' + str(RUNTIME), '-I' + str(ELEK),
             '-I' + str(ROOT / 'sdk/runtime/loader'), '-I' + str(ROOT / 'sdk/runtime/upload')]
    out = work / 'engines-board'
    sources = [work / 'fixture.c', POLICY / 'controller_board.c', POLICY / 'controller_transport.c',
               POLICY / 'controller_association.c', ROOT / 'sdk/runtime/loader/loader.c', ROOT / 'sdk/runtime/upload/sha256.c',
               ADAPTER / 'machine_lifetime.c', work / 'manager_unit.c', work / 'allocator.c', work / 'buffers.c',
               RUNTIME / 'stock_hooks.c', RUNTIME / 'stock_hook_resources.c', RUNTIME / 'resident_engines.c',
               work / 'resident-engines-data.c']
    return out, subprocess.run(['cc', *flags, *map(str, sources), '-o', str(out)], capture_output=True, text=True)


@unittest.skipUnless(shutil.which('cc'), 'host C compiler unavailable')
class ResidentEnginesBoard(unittest.TestCase):
    MODES = 35

    def test_place_switch_run_disable_unswitch_free_and_their_refusals(self):
        with tempfile.TemporaryDirectory() as temp:
            work = Path(temp)
            generated(work, bundles())
            binary, result = build(work)
            self.assertEqual(result.returncode, 0, result.stderr)
            for mode in range(self.MODES):
                with self.subTest(mode=mode):
                    result = subprocess.run([str(binary), str(mode)], capture_output=True, text=True)
                    self.assertEqual(result.returncode, 0, result.stderr)

    def test_relocation_in_c_matches_resident_dsp_relocate(self):
        """The base's relocator (mw_engine_relocate) against resident_dsp.relocate, at several bases, on made-up
        units and on the edge words (0, 0xffffff, wrap both ways)."""
        units = [unit('A', 1, 388), unit('A', 2, 773), unit('B', 4, 998)]
        edge = dict(tag='A', feature=1, words=[0, 0xffffff, 5, 0x800000, 0x7fffff, 1],
                    relocations=[0, 1, 2 | 0x8000, 3 | 0x8000, 4, 5 | 0x8000])
        units.append(edge)
        bases = (0, 1, 0x1000, 0x1333, 0x17ff, 0x1c01, 0x1fff, 0xffffff)
        lines = ['#include <stdio.h>', '#include "resident_engines.h"']
        for n, u in enumerate(units):
            data = b''.join(w.to_bytes(3, 'big') for w in u['words'])
            lines += ['static const uint8_t w%d[] = {%s};' % (n, ','.join(map(str, data))),
                      'static const uint16_t r%d[] = {%s};' % (n, ','.join(map(str, u['relocations'])))]
        lines += ['const struct mw_engine_unit mw_engine_units[2][3];', 'uint32_t *const mw_engine_buffer[2];',
                  'static const struct mw_engine_unit units[] = {%s};' % ','.join(
                      '{w%d, r%d, %d, %d}' % (n, n, len(u['words']), len(u['relocations'])) for n, u in enumerate(units)),
                  'static uint32_t out[2048];',
                  'int main(void) {',
                  '    static const uint32_t bases[] = {%s};' % ','.join('%du' % b for b in bases),
                  '    for (unsigned n = 0; n < %d; ++n) for (unsigned b = 0; b < %d; ++b) {' % (len(units), len(bases)),
                  '        mw_engine_relocate(&units[n], bases[b], out);',
                  '        for (unsigned i = 0; i < units[n].count; ++i) printf("%u ", (unsigned)out[i]);',
                  '        printf("\\n");', '    }', '    return 0;', '}']
        stubs = r'''
#include <stdint.h>
#include "transfer.h"
volatile uint32_t dl_pool_base[2], dl_pool_words[2];
int dl_owned_command_reserve(unsigned a,uint32_t b,unsigned c,unsigned d,unsigned e,unsigned f,struct dl_owned_job *g) { (void)a;(void)b;(void)c;(void)d;(void)e;(void)f;(void)g;return 0; }
int dl_owned_upload_reserve(unsigned a,uint32_t b,const struct dl_upload *c,struct dl_owned_job *d) { (void)a;(void)b;(void)c;(void)d;return 0; }
int dl_owned_submit(const struct dl_owned_job *v) { (void)v;return 0; }
int dl_owned_cancel(const struct dl_owned_job *v) { (void)v;return 0; }
int dl_owned_job_poll(const struct dl_owned_job *v,struct dl_owned_progress *p) { (void)v;(void)p;return 0; }
int dl_owned_job_release(const struct dl_owned_job *v) { (void)v;return 0; }
void dl_owned_fail_closed(unsigned c) { (void)c; }
int dl_engine_claim(unsigned c,unsigned r,int k) { (void)c;(void)r;(void)k;return 0; }
void dl_engine_release(unsigned c,unsigned r) { (void)c;(void)r; }
unsigned dl_engine_reserved(unsigned c) { (void)c;return 0; }
int mw_engines_test_quiet(void) { return 1; }
int mw_engines_test_settled(void) { return 1; }
volatile uint8_t dl_engine_why[2];
'''
        with tempfile.TemporaryDirectory() as temp:
            work = Path(temp)
            spec = importlib.util.spec_from_file_location('resident_engines_reloc_core', ELEK / 'build_core.py')
            core = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(core)
            for name in ('transfer.h',):
                (work / name).write_text(resident_driver.transport_header((core.DYNLOAD / name).read_text()))
            shutil.copyfile(ELEK / 'fxids.h', work / 'fxids.h')
            (work / 'main.c').write_text('\n'.join(lines) + '\n')
            (work / 'stubs.c').write_text(stubs)
            out = work / 'reloc'
            result = subprocess.run(['cc', '-std=c11', '-Wall', '-Wextra', '-Werror', *SANITIZE, '-DMW_ENGINES_TEST',
                                     '-DMODWERK_FX_IDS=64', '-I' + str(work), '-I' + str(RUNTIME), str(work / 'main.c'),
                                     str(work / 'stubs.c'), str(RUNTIME / 'resident_engines.c'), '-o', str(out)],
                                    capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            rows = subprocess.run([str(out)], capture_output=True, text=True, check=True).stdout.splitlines()
        k = 0
        for u in units:
            for base in bases:
                self.assertEqual(list(map(int, rows[k].split())), resident_dsp.relocate(u, base), (u['feature'], base))
                k += 1
        # And the made-up units' proofs (resident_dsp's own words at the four proof bases) are what data_c accepts.
        text = resident_engines.data_c(bundles())
        self.assertIn('mw_engine_units[2][3]', text)
        broken = bundles()
        broken['A']['engines'][1]['words'][0] ^= 1
        with self.assertRaisesRegex(ValueError, 'not the unit its proofs name'):
            resident_engines.data_c(broken)
        broken = bundles()
        broken['B']['engines'][4]['relocations'].reverse()
        with self.assertRaisesRegex(ValueError, 'unordered relocations'):
            resident_engines.data_c(broken)

    def test_seams_apply_once_and_only_to_their_sources(self):
        spec = importlib.util.spec_from_file_location('resident_engines_seam_core', ELEK / 'build_core.py')
        core = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(core)
        texts = {}
        for name in ('manager.c', 'transfer.c'):
            text = (core.DYNLOAD / name).read_text()
            for old, new in core.DSP_EDITS.get(name, ()) + core.WIDTH_EDITS.get(name, ()):
                text = text.replace(old, new)
            texts[name] = text
        manager = resident_journal.manager(resident_placement.manager(texts['manager.c']))
        once = resident_engines.manager(manager)
        self.assertIn('int dl_engine_claim(unsigned c,unsigned reserve,int commit)', once)
        self.assertIn('dl_pool_words[c]-DL_CODE_START-engine_reserved[c]', once)
        with self.assertRaisesRegex(ValueError, 'seam changed'):
            resident_engines.manager(once)
        transfer = resident_driver.transport(texts['transfer.c'])
        placed = resident_engines.transport(transfer)
        self.assertIn('proc==1u && ((id!=1u && id!=2u && id!=4u)', placed)
        with self.assertRaisesRegex(ValueError, 'seam changed'):
            resident_engines.transport(placed)
        # The default resident transport keeps refusing every op-10 packet with a nonzero word 7.
        self.assertIn('init&~(c ? 5u:7u) || proc)) return 0;', transfer)
        status = resident_engines.status((ELEK / 'status.c').read_text())
        self.assertNotIn('modwerk_dsp_arena[0]', status.split('unsigned modwerk_dsp_arena_now(unsigned);')[1])
        import resident_source
        dsp = resident_engines.dsp(resident_source.sources()['dsp.c'])
        self.assertIn('out->arena = modwerk_dsp_arena_now(c);', dsp)
        dev = resident_engines.dev((ELEK / 'dev.c').read_text())  # a development base's MEM reaches the engines' statics
        self.assertIn('{{0x40000400u, 0x46000000u}', dev)
        with self.assertRaisesRegex(ValueError, 'seam changed'):
            resident_engines.dev(dev)


if __name__ == '__main__':
    unittest.main()
