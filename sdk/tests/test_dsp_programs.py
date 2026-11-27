# SPDX-License-Identifier: GPL-3.0-or-later
"""Program areas, the ColdFire side (dsp_programs.c over resident_engines.c's region), on the host (ASan/UBSan).

Modelled: the manager's region claim (dl_engine_claim: FX code at the arena's bottom, free words only while playing), the
loader's one job a core (WRITE 24 words a frame, op 12 into the slot records), a contributed ot_dsp_effects record whose
code for program p at address a is made up from p and a, and the DSP: every frame, each slot that runs the effect checks
that its record names nothing or an area of its own span holding a whole program written for that address. The WRITE
refuses to touch an area any record names, and a span goes back only once no record names it. No hardware, timing or
audio is claimed; the receiver's op 12 itself is test_resident_engines.py's.
"""
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
ADAPTER = ROOT / 'sdk/machines/octatrack/module-adapters'
RUNTIME = ADAPTER / 'resident-runtime'
sys.path.insert(0, str(ADAPTER))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import resident_driver  # noqa: E402
from host_flags import SANITIZE  # noqa: E402

FIXTURE = r'''
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "resident_engines.h"
#include "transfer.h"
#include "loader.h"
#include "modwerk_events.h"
#include "stream_channel.h"
#define CHECK(c) do { if (!(c)) { fprintf(stderr, "mode %d line %d: %s\n", mode, __LINE__, #c); exit(1); } } while (0)
#define POOL 2000u
#define ARENA (POOL - DL_CODE_START)
#define EFFECT 40u
#define STREAMED 41u  /* the stream's effect: programs and a stream, as the Quadraverb's */
#define SIN 40u
#define SOUT 24u
#define WORDS 64u
static int mode;

/* The loader's state the program areas read. */
volatile uint32_t dl_pool_base[2] = {0x300u, 0x340u}, dl_pool_words[2] = {POOL, POOL};
volatile uint32_t dl_residency_enabled = 1;
volatile uint8_t mw_programs_test_live[16];
static int busy;                                  /* the manager publishes */
int dl_publication_idle(void) { return !busy; }
uint32_t modwerk_machine_lock(void) { return 0; }
void modwerk_machine_unlock(uint32_t x) { (void)x; }
uint32_t modwerk_machine_mask(void) { return 0; }
void modwerk_machine_unmask(uint32_t x) { (void)x; }

/* The engines' own seams, unused here (no engine is placed). */
static int quiet = 1, queued, settled = 1;
int mw_engines_test_quiet(void) { return quiet && !queued; }
int mw_engines_test_queued(void) { return queued; }
int mw_engines_test_settled(void) { return settled; }
const struct mw_engine_unit mw_engine_units[2][MW_ENGINE_FEATURES];
static uint32_t engine_buffer[2][8];
uint32_t *const mw_engine_buffer[2] = {engine_buffer[0], engine_buffer[1]};
int dl_owned_upload_reserve(unsigned c, uint32_t g, const struct dl_upload *u, struct dl_owned_job *j) { (void)c; (void)g; (void)u; (void)j; return 0; }
int dl_owned_command_reserve(unsigned c, uint32_t g, unsigned o, unsigned i, unsigned n, unsigned p, struct dl_owned_job *j)
{ (void)c; (void)g; (void)o; (void)i; (void)n; (void)p; (void)j; return 0; }
int dl_owned_submit(const struct dl_owned_job *j) { (void)j; return 0; }
int dl_owned_cancel(const struct dl_owned_job *j) { (void)j; return 0; }
int dl_owned_job_poll(const struct dl_owned_job *j, struct dl_owned_progress *p) { (void)j; (void)p; return -2; }
int dl_owned_job_release(const struct dl_owned_job *j) { (void)j; return 0; }
void dl_owned_fail_closed(unsigned c) { (void)c; }
int dl_owned_closed(unsigned c) { (void)c; return 0; }

/* The manager's region: FX code fills [0, fx_top) of each arena; a claim reaching it waits while playing (why 7) and is
 * refused when quiet (the model has no evacuation). */
static unsigned reserved[2], fx_top[2];
volatile uint8_t dl_engine_why[2];
static unsigned claims;
int dl_engine_claim(unsigned c, unsigned reserve, int commit)
{
    ++claims;
    CHECK(c < 2u && commit >= 1);
    if (reserve > ARENA) { dl_engine_why[c] = 5; return -1; }
    if (reserve <= reserved[c]) { dl_engine_why[c] = 0; return 1; }
    if (busy) { dl_engine_why[c] = 1; return 0; }
    if (ARENA - reserve < fx_top[c]) { dl_engine_why[c] = quiet ? 3 : 7; return quiet ? -1 : 0; }
    reserved[c] = reserve, dl_engine_why[c] = 0;
    return 1;
}
void dl_engine_release(unsigned c, unsigned reserve) { if (reserve < reserved[c]) reserved[c] = reserve; }
unsigned dl_engine_reserved(unsigned c) { return reserved[c]; }

/* The contributed record and its module. */
static int32_t want[16];
static unsigned code_calls, refuse_code;
static uint32_t length_of(int32_t p) { return 10u + (uint32_t)p * 7u % 54u; }
static uint32_t word_of(int32_t p, uint32_t at, uint32_t i) { return ((uint32_t)p << 13 ^ at * 0x3b ^ i * 0x9e37u) & 0xffffffu; }
static int32_t test_program(unsigned slot) { return want[slot]; }
static uint32_t test_code(unsigned slot, int32_t p, uint32_t at, uint32_t *out)
{
    (void)slot;
    ++code_calls;
    if (refuse_code) return refuse_code == 1 ? 0u : WORDS + 1u;
    uint32_t n = length_of(p);
    for (uint32_t i = 0; i < n; ++i) out[i] = word_of(p, at, i) | (i & 1u ? 0x5a000000u : 0u); /* junk above 24 bits */
    return n;
}
static const struct modwerk_dsp_effect effect = {MODWERK_DSP_EFFECT_ABI, WORDS, test_program, test_code, 0, 0, 0, 0, 0};
/* The stream's effect: fill writes (slot << 12) ^ 7f ^ i, the DSP checks it in frame f and writes (slot << 12) ^ 5f ^ i
 * ^ $8000, which take checks: in order, every frame from the first, nothing torn. */
static uint16_t in_word(unsigned slot, uint32_t f, unsigned i) { return (uint16_t)(slot << 12 ^ f * 7u ^ i); }
static uint16_t out_word(unsigned slot, uint32_t f, unsigned i) { return (uint16_t)(slot << 12 ^ f * 5u ^ i ^ 0x8000u); }
static int32_t last_taken[16];
static unsigned takes[16], fills, outs_checked[16], ins_checked[16];
static void test_fill(unsigned slot, uint32_t f, volatile uint16_t *in) { ++fills; for (unsigned i = 0; i < SIN; ++i) in[i] = in_word(slot, f, i); }
static void test_take(unsigned slot, uint32_t f, const volatile uint16_t *out)
{
    CHECK(last_taken[slot] < 0 || (uint32_t)last_taken[slot] + 1u == f);
    for (unsigned i = 0; i < SOUT; ++i) CHECK(out[i] == out_word(slot, f, i));
    last_taken[slot] = (int32_t)f, ++takes[slot];
}
static const struct modwerk_dsp_effect streamed = {MODWERK_DSP_EFFECT_ABI, WORDS, test_program, test_code, SIN, SOUT, test_fill, test_take, 0};
static int streamed_listed = 1;
int mw_stream_test_contributed(const void *r) { return r == &streamed && streamed_listed; }
uint32_t mw_stream_test_clock(void) { return 0; }
static uintptr_t volatile row[9];
uintptr_t volatile *const modwerk_runtime_event_row[RUNTIME_SITE_EVENTS] = {[MODWERK_OT_DSP_EFFECTS - RUNTIME_EVENTS] = row};
int modwerk_runtime_owner_at(uintptr_t at, struct runtime_owner *o)
{
    if (at != (uintptr_t)&effect && at != (uintptr_t)&streamed) return 0;
    memset(o, 0, sizeof *o), o->module = at == (uintptr_t)&effect ? 0x51564b31u : 0x51564b32u;
    return 1;
}
int modwerk_dsp_catalogue_handle(uint32_t module) { return module == 0x51564b31u ? (int)EFFECT : module == 0x51564b32u ? (int)STREAMED : -1; }

/* The loader's channel: one job a core; a WRITE lands 24 words a frame, op 12 in one. */
static uint32_t P[2][0x2000], X[2][MW_SLOT_RECORD_WORDS];
static struct { int state; unsigned op, id, init, proc, done; struct dl_upload u; } job[2];
static int fail_next, refuse_starts;
static unsigned writes, switches, starts[2];
int dl_upload_start(unsigned c, const struct dl_upload *u)
{
    CHECK(c < 2u && u && !u->relocation_count && u->offset >= DL_CODE_START && u->offset + u->count <= POOL && u->count);
    if (job[c].state || refuse_starts) return 0;
    job[c].state = 1, job[c].op = DL_WRITE, job[c].u = *u, job[c].done = 0, ++starts[c];
    return 1;
}
int dl_command_start(unsigned c, unsigned op, unsigned id, unsigned init, unsigned proc)
{
    CHECK(c < 2u && op == 12u && id < MW_SLOT_RECORD_WORDS && id % 4u < 3u && init <= 0xffffu && proc <= 0xffu);
    if (job[c].state || refuse_starts) return 0;
    job[c].state = 1, job[c].op = op, job[c].id = id, job[c].init = init, job[c].proc = proc, ++starts[c];
    return 1;
}
int dl_job_status(unsigned c) { return job[c].state == 3 ? 1 : job[c].state == 4 ? -1 : job[c].state ? 0 : -2; }
void dl_job_release(unsigned c) { if (job[c].state >= 3) job[c].state = 0; }

static unsigned core_of(unsigned s) { return (s & 7u) < 4u ? 1u : 0u; }
static unsigned record_of(unsigned s) { return 4u * (1u + 3u * (s & 3u) + (s >= 8u)); }
/* Does any record of core c name a P address in [from, to)? */
static int named(unsigned c, uint32_t from, uint32_t to)
{
    for (unsigned w = 0; w < MW_SLOT_RECORD_WORDS; w += 4u) if (X[c][w] >= from && X[c][w] < to) return 1;
    return 0;
}
static int32_t runs[16]; /* the program each slot's DSP runs, -1 none */
static void frame(void)
{
    for (unsigned c = 0; c < 2u; ++c) {
        if (job[c].state != 1) continue;
        if (fail_next) { fail_next = 0, job[c].state = 4; continue; }
        if (job[c].op == DL_WRITE) {
            unsigned n = job[c].u.count - job[c].done;
            if (n > DL_DATA) n = DL_DATA;
            uint32_t at = dl_pool_base[c] + job[c].u.offset + job[c].done;
            CHECK(!named(c, at + 1u - WORDS, at + n)); /* never into an area a slot runs: none starts within WORDS below */
            for (unsigned i = 0; i < n; ++i) {
                CHECK(job[c].u.words[job[c].done + i] <= 0xffffffu);
                P[c][at + i] = job[c].u.words[job[c].done + i];
            }
            if ((job[c].done += n) == job[c].u.count) job[c].state = 3, ++writes;
        } else X[c][job[c].id] = job[c].proc << 16 | job[c].init, job[c].state = 3, switches += job[c].id % 4u == 0;
    }
    /* The DSP: each slot of the effect runs nothing, or a whole program written for the address its record names. */
    for (unsigned s = 0; s < 16u; ++s) {
        unsigned c = core_of(s);
        uint32_t at = X[c][record_of(s)];
        runs[s] = -1;
        if (!at || (mw_programs_test_live[s] != EFFECT && mw_programs_test_live[s] != STREAMED)) continue;
        int32_t found = -1;
        for (int32_t p = 0; p < 64 && found < 0; ++p) {
            int whole = 1;
            for (uint32_t i = 0; i < length_of(p) && whole; ++i) whole = P[c][at + i] == word_of(p, at, i);
            if (whole) found = p;
        }
        CHECK(found >= 0);
        runs[s] = found;
    }
}
/* Each core's host banks (the stream's in- and out-regions), and the chain around a DSP frame k: state 0 reads what
 * core 0 wrote in frame k - 1, state 1 what core 1 did, state 3 sends what core 1 reads in frame k + 1, state 7 what
 * core 0 does, then the check; the DSPs' frame k runs after the receiver. */
static uint16_t bank[2][2][0x2000];
static uint32_t k_now;
static int chain_down; /* dsp.c's recovery gave the chain up */
static void chain(void)
{
    extern volatile uint16_t mw_stream_read_count, mw_stream_read_count1;
    uint32_t k = mw_stream_frame();
    CHECK(k == k_now);
    if (mw_stream_read() == 1u) {
        for (unsigned i = 0; i <= mw_stream_read_count; ++i) mw_stream_rx[i] = bank[0][(k - 1u) & 1u][MW_STREAM_OUT_REGION + i];
        CHECK(mw_stream_read() == 2u);
    }
    if (mw_stream_read1() == 1u) {
        for (unsigned i = 0; i <= mw_stream_read_count1; ++i) mw_stream_rx1[i] = bank[1][(k - 1u) & 1u][MW_STREAM_OUT_REGION + i];
        CHECK(mw_stream_read1() == 2u);
    }
    unsigned loops = mw_stream_block1();
    CHECK(32u * loops <= MW_STREAM_IN1_WORDS);
    for (unsigned i = 0; i < 32u * loops; ++i) bank[1][(k + 1u) & 1u][MW_STREAM_IN_REGION + i] = mw_stream_tx1[i];
    if (loops) mw_stream_complete1();
    loops = mw_stream_block();
    CHECK(32u * loops <= MW_STREAM_IN_WORDS);
    for (unsigned i = 0; i < 32u * loops; ++i) bank[0][(k + 1u) & 1u][MW_STREAM_IN_REGION + i] = mw_stream_tx[i];
    if (loops) mw_stream_complete();
    mw_stream_account();
    mw_stream_check();
}
static void dsp_stream(uint32_t k)
{
    for (unsigned s = 0; s < 16u; ++s) {
        unsigned c = core_of(s);
        uint32_t in = X[c][record_of(s) + 1u], out = X[c][record_of(s) + 2u];
        if (mw_programs_test_live[s] != STREAMED || !(in | out)) continue;
        /* named out first, in last; cleared in first. The out-block is written once it is named: take() runs from then
         * on, before the in-block is named, so a DSP that starts with both named has its first frame taken. */
        if (!out) continue;
        CHECK(out >= MW_STREAM_OUT_REGION);
        if (!chain_down) for (unsigned i = 0; i < SOUT; ++i) bank[c][k & 1u][out + i] = out_word(s, k, i);
        ++outs_checked[s];
        if (!in) continue;
        CHECK(in >= MW_STREAM_IN_REGION && in + SIN <= MW_STREAM_IN_REGION + (c ? MW_STREAM_IN1_WORDS : MW_STREAM_IN_WORDS));
        if (chain_down) continue;
        for (unsigned i = 0; i < SIN; ++i) CHECK(bank[c][k & 1u][in + i] == in_word(s, k, i)); /* named only once filled */
        ++ins_checked[s];
    }
}
static void run_streamed(unsigned ticks, unsigned frames)
{
    for (unsigned t = 0; t < ticks; ++t) {
        mw_programs_tick();
        for (unsigned f = 0; f < frames; ++f) { chain(); frame(); dsp_stream(k_now); ++k_now; }
    }
}
static void run(unsigned ticks, unsigned frames)
{
    for (unsigned t = 0; t < ticks; ++t) {
        mw_programs_tick();
        for (unsigned f = 0; f < frames; ++f) frame();
    }
}
static void pick(unsigned s, unsigned id, int32_t p) { mw_programs_test_live[s] = (uint8_t)id, want[s] = p; }

int main(int argc, char **argv)
{
    mode = argc > 1 ? atoi(argv[1]) : 0;
    row[0] = (uintptr_t)&effect, row[1] = (uintptr_t)&streamed;
    for (unsigned s = 0; s < 16u; ++s) want[s] = -1, last_taken[s] = -1;
    unsigned t5 = 12u, t6 = 13u, t7 = 14u, t1 = 8u, t2 = 9u; /* FX2 of T5, T6, T7 (core 0), T1, T2 (core 1) */
    uint32_t t5_in = 0;
    switch (mode) {
    case 0: /* one instance: its first program, a change, back again with no write; then it leaves */
        pick(t5, EFFECT, 3);
        run(6, 46);
        CHECK(runs[t5] == 3 && reserved[0] == 2u * WORDS && reserved[1] == 0 && writes == 1 && switches == 1);
        CHECK(X[0][record_of(t5)] == dl_pool_base[0] + DL_CODE_START + ARENA - 2u * WORDS);
        want[t5] = 5, run(6, 46);
        CHECK(runs[t5] == 5 && writes == 2 && switches == 2 && X[0][record_of(t5)] == dl_pool_base[0] + DL_CODE_START + ARENA - WORDS);
        unsigned calls = code_calls;
        want[t5] = 3, run(6, 46);
        CHECK(runs[t5] == 3 && writes == 2 && switches == 3 && code_calls == calls); /* area 0 still held program 3 */
        pick(t5, 0, -1), run(6, 46);
        CHECK(X[0][record_of(t5)] == 0 && reserved[0] == 0 && switches == 4 && mw_programs_written == 2 && mw_programs_switched == 3);
        break;
    case 1: /* four instances on both cores at once; one job a core at a time; each runs its own program */
        pick(t5, EFFECT, 1), pick(t6, EFFECT, 2), pick(t1, EFFECT, 3), pick(t2, EFFECT, 4);
        for (unsigned t = 0; t < 20; ++t) { run(1, 3); CHECK(job[0].state <= 1 || job[0].state == 3); }
        CHECK(runs[t5] == 1 && runs[t6] == 2 && runs[t1] == 3 && runs[t2] == 4);
        CHECK(reserved[0] == 4u * WORDS && reserved[1] == 4u * WORDS);
        /* T5 and T1 change together, every tick a new program for 10 ticks: the last one wins, nothing torn */
        for (int32_t p = 10; p < 20; ++p) want[t5] = p, want[t1] = p + 20, run(1, 2);
        run(20, 46);
        CHECK(runs[t5] == 19 && runs[t1] == 39 && runs[t6] == 2 && runs[t2] == 4);
        pick(t6, 0, -1), run(10, 46);
        CHECK(runs[t6] == -1 && X[0][record_of(t6)] == 0 && runs[t5] == 19);
        break;
    case 2: /* no room: refused, the record stays 0, tried again after a wait; then room */
        fx_top[0] = ARENA - WORDS;
        pick(t5, EFFECT, 7), run(5, 46);
        CHECK(X[0][record_of(t5)] == 0 && mw_programs_refused == 1 && claims == 1);
        run(40, 46);
        CHECK(claims == 1); /* waits RETRY ticks */
        fx_top[0] = 0, run(40, 46);
        CHECK(runs[t5] == 7);
        break;
    case 3: /* playing with the region's words taken: waits without planning on every tick, then the stop */
        quiet = 0, fx_top[0] = ARENA - WORDS;
        pick(t5, EFFECT, 7), run(10, 46);
        CHECK(X[0][record_of(t5)] == 0 && claims == 1 && mw_programs_refused == 0);
        quiet = 1, fx_top[0] = 0, run(5, 46);
        CHECK(runs[t5] == 7);
        break;
    case 4: /* a failed write is tried again; a failed switch leaves the span held for good */
        pick(t5, EFFECT, 3), fail_next = 1, run(2, 46);
        CHECK(X[0][record_of(t5)] == 0 && mw_programs_failed == 1);
        run(70, 46);
        CHECK(runs[t5] == 3);
        want[t5] = 4, run(1, 0), run(1, 46), fail_next = 1, run(1, 46), run(1, 0); /* the write lands, the switch fails */
        CHECK(mw_programs_failed == 2);
        unsigned held = reserved[0], n = writes;
        pick(t5, 0, -1), run(20, 46);
        CHECK(reserved[0] == held && writes == n); /* stuck: nothing written or given back */
        break;
    case 5: /* the module goes (its row): the record goes to 0, then the span */
        pick(t5, EFFECT, 3), run(6, 46);
        CHECK(runs[t5] == 3);
        row[0] = 0, run(6, 46);
        CHECK(X[0][record_of(t5)] == 0 && reserved[0] == 0);
        break;
    case 6: /* the manager publishing, or its channel taken, starts nothing; refused code waits */
        busy = 1, pick(t5, EFFECT, 3), run(10, 46);
        CHECK(starts[0] == 0 && X[0][record_of(t5)] == 0);
        busy = 0, refuse_starts = 1, run(10, 46);
        CHECK(X[0][record_of(t5)] == 0);
        refuse_starts = 0, refuse_code = 1, run(3, 46);
        CHECK(mw_programs_refused == 1 && X[0][record_of(t5)] == 0);
        refuse_code = 2, run(70, 46);
        CHECK(mw_programs_refused == 2);
        refuse_code = 0, run(70, 46);
        CHECK(runs[t5] == 3);
        break;
    case 7: /* a slot that leaves before its first switch frees at once; one that comes back gets a new span */
        pick(t5, EFFECT, 3), run(1, 0);
        pick(t5, 0, -1), run(3, 46); /* the write ends, then the span goes: no switch was made */
        CHECK(reserved[0] == 0 && X[0][record_of(t5)] == 0 && switches == 0 && writes == 1);
        pick(t5, EFFECT, 9), run(6, 46);
        CHECK(runs[t5] == 9 && reserved[0] == 2u * WORDS);
        want[t5] = -1, run(6, 46); /* no program asked: it keeps what it runs */
        CHECK(runs[t5] == 9);
        break;
    case 8: /* FX1 records: T2 FX1 and T8 FX1 */
        pick(1u, EFFECT, 11), pick(7u, EFFECT, 12), run(10, 46);
        CHECK(runs[1] == 11 && runs[7] == 12 && X[1][4u * 4u] && X[0][4u * 10u]);
        break;
    case 9: /* the stream: T5 and T6 (core 0) and T1 (core 1) stream and switch programs, each core in its own regions */
        pick(t5, STREAMED, 3), pick(t6, STREAMED, 4), pick(t1, STREAMED, 5);
        run_streamed(10, 46);
        CHECK(runs[t5] == 3 && runs[t6] == 4 && runs[t1] == 5 && mw_programs_streams == 3);
        CHECK(ins_checked[t5] > 200 && takes[t5] > 200 && takes[t6] > 50 && ins_checked[t1] > 50 && takes[t1] > 50);
        CHECK(X[1][record_of(t1) + 1u] == MW_STREAM_IN_REGION && X[1][record_of(t1) + 2u] == MW_STREAM_OUT_REGION);
        CHECK(X[0][record_of(t5) + 1u] != X[0][record_of(t6) + 1u] && X[0][record_of(t5) + 2u] != X[0][record_of(t6) + 2u]);
        want[t5] = 6, run_streamed(6, 46);
        CHECK(runs[t5] == 6 && takes[t5] > 500);
        /* T5 leaves: in, then out, back to 0 before its lane closes; T6 runs on and T5's blocks go back */
        t5_in = X[0][record_of(t5) + 1u];
        pick(t5, 0, -1), run_streamed(6, 46);
        CHECK(X[0][record_of(t5) + 1u] == 0 && X[0][record_of(t5) + 2u] == 0 && takes[t6] > 500);
        pick(t7, STREAMED, 7), run_streamed(10, 46);                         /* T7 takes the room T5 had */
        CHECK(runs[t7] == 7 && takes[t7] > 200 && X[0][record_of(t7) + 1u] == t5_in);
        break;
    case 10: /* the module goes: its fills and takes stop at once (the frame path reads the table), then its records */
        pick(t5, STREAMED, 3), run_streamed(10, 46);
        CHECK(takes[t5] > 200);
        streamed_listed = 0, row[1] = 0, mw_programs_test_live[t5] = 0; /* the loader takes its code and the slot's id together */
        t5_in = takes[t5];
        run_streamed(6, 46);
        CHECK(takes[t5] == t5_in && X[0][record_of(t5) + 1u] == 0 && X[0][record_of(t5) + 2u] == 0);
        break;
    case 11: /* core 1 alone: T1, T2 and T3's FX1 apart in its regions; T1 leaves, T4 takes its room; then the chain
              * is given up (dsp.c's recovery): no fill or take after it */
        pick(t1, STREAMED, 1), pick(t2, STREAMED, 2), pick(2u, STREAMED, 3), run_streamed(20, 46); /* one core's job: one after another */
        CHECK(takes[t1] > 100 && takes[t2] > 100 && takes[2] > 100 && mw_programs_streams == 3);
        CHECK(X[1][record_of(t1) + 1u] != X[1][record_of(t2) + 1u] && X[1][record_of(t2) + 1u] != X[1][record_of(2u) + 1u]);
        t5_in = X[1][record_of(t1) + 1u];
        pick(t1, 0, -1), run_streamed(6, 46);
        CHECK(X[1][record_of(t1) + 1u] == 0 && X[1][record_of(t1) + 2u] == 0);
        pick(11u, STREAMED, 4), run_streamed(10, 46);                       /* T4's FX2 */
        CHECK(takes[11] > 100 && X[1][record_of(11u) + 1u] == t5_in);
        mw_stream_read_failed(), mw_stream_dma_failed(), chain_down = 1;
        t5_in = takes[t2] + takes[11], run_streamed(4, 46);
        CHECK(takes[t2] + takes[11] == t5_in && !mw_stream_read() && !mw_stream_read1() && !mw_stream_block1() && !mw_stream_block());
        break;
    default: return 2;
    }
    return 0;
}
'''

MODES = 12


def build(work):
    transfer = (ROOT / 'sdk/octabam/platform/dsp-dynload-transport/transfer.h').read_text()
    (work / 'transfer.h').write_text(resident_driver.transport_header(transfer))
    (work / 'fixture.c').write_text(FIXTURE)
    out = work / 'programs'
    flags = ['-std=c11', '-Wall', '-Wextra', '-Werror', *SANITIZE, '-DMW_ENGINES_TEST', '-DMW_PROGRAMS_TEST',
             '-DMODWERK_RUNTIME_EVENTS', '-DMODWERK_FX_IDS=64', '-DMW_STREAM_TEST', '-I' + str(work), '-I' + str(RUNTIME),
             '-I' + str(ADAPTER),
             '-I' + str(ROOT / 'sdk/machines/octatrack/elekloader'), '-I' + str(ROOT / 'sdk/machines/octatrack/include'),
             '-I' + str(ROOT / 'sdk/runtime/loader'), '-I' + str(ROOT / 'sdk/runtime/upload')]
    sources = [work / 'fixture.c', RUNTIME / 'dsp_programs.c', RUNTIME / 'resident_engines.c', ADAPTER / 'stream_channel.c']
    return out, subprocess.run(['cc', *flags, *map(str, sources), '-o', str(out)], capture_output=True, text=True)


@unittest.skipUnless(shutil.which('cc'), 'host C compiler unavailable')
class DspPrograms(unittest.TestCase):
    def test_modes(self):
        with tempfile.TemporaryDirectory() as temp:
            binary, result = build(Path(temp))
            self.assertEqual(result.returncode, 0, result.stderr)
            for mode in range(MODES):
                with self.subTest(mode=mode):
                    result = subprocess.run([str(binary), str(mode)], capture_output=True, text=True)
                    self.assertEqual(result.returncode, 0, result.stderr)


# The DSP side: a module's proc as the contract has it (events.json ot_dsp_effects): its record from r7, nothing when 0,
# else a jsr to the area it names. Two areas that leave a mark each; the dry path leaves none.
CONTRACT = """proc:
        move    r7,a
        lsr     #6,a
        and     #>$3c,a
        add     #>$%x,a
        move    a1,r1
        nop
        move    x:(r1),a
        tst     a
        beq     pcdry
        move    a1,r1
        nop
        jsr     (r1)
pcdry:
        rts
""" % 0x7fb0
# A proc that runs its record's area and echoes its in-block's two halfwords into its out-block, both at the frame's host
# bank (X:$207, as stock's bank take keeps it; never r6, which stock's dispatcher points at its parameter copies) + the
# record's offsets (words 1 and 2), and touches neither while a word is 0.
ECHO = """init:
        rts
proc:
        move    r7,a
        lsr     #6,a
        and     #>$3c,a
        add     #>$7fb0,a
        move    a1,r1
        nop
        move    x:(r1),a
        tst     a
        beq     ppdry
        move    a1,r2
        nop
        jsr     (r2)
ppdry:
        move    x:(r1+1),a
        tst     a
        beq     ppdone
        move    x:(r1+2),b
        tst     b
        beq     ppdone
        move    x:>$000207,x0
        move    x:(r1+1),a
        add     x0,a
        move    a1,r2
        move    x:(r1+2),b
        add     x0,b
        move    b1,r3
        nop
        move    x:(r2)+,x1
        move    x1,x:(r3)+
        move    x:(r2),x1
        move    x1,x:(r3)
ppdone:
        rts
"""
AREA = """        move    #>$%x,x0
        move    x0,x:>$7000
        rts
"""


@unittest.skipUnless(os.environ.get('ELEKLOADER_DSP_ASM') or shutil.which('dsp_asm'), 'dsp_asm (ELEKLOADER_DSP_ASM) unavailable')
class DspProgramsReceiver(unittest.TestCase):
    """The receiver's op 12 and its first frame's zeroing (resident_base.patch), and the contract's proc, under the
    vendored interpreter (test_resident_engines.py's harness): the interpreter is not the chip."""

    def test_op12_zeroing_and_the_contract(self):
        import test_resident_engines as engines
        if not (all(p.is_file() for p in engines.LIBS) and shutil.which('c++')):
            self.skipTest('vendored dsp56300 build unavailable')
        engines.ResidentEngines.setUpClass()
        try:
            self.check(engines)
        finally:
            engines.ResidentEngines.tearDownClass()

    def check(self, engines):
        cls = engines.ResidentEngines
        loader = engines.resident_source.load_loader()
        work = Path(cls.work.name)
        harness = cls.harness()
        resident_dsp = engines.resident_dsp
        origin = engines.RECEIVER_ORIGIN

        def run(steps):
            path = work / 'programs-script.txt'
            path.write_text('\n'.join(steps) + '\n')
            result = subprocess.run([str(harness), str(path)], capture_output=True, text=True, timeout=600)
            self.assertEqual(result.returncode, 0, result.stderr)
            return [line for line in result.stdout.split('\n') if line.split(' ')[0] in ('A', 'D', 'S')]

        for tag in 'AB':
            with self.subTest(tag=tag):
                bundle = resident_dsp.place_resident(cls.ob, tag, 0x2000, str(work), cls.packages.assemble, resident_dsp.ALLOWED[tag])

                def text(table):
                    return loader.receiver_source(loader.RECEIVER.read_text(), (0x7c8, 0x7c9), table, tag=tag, ids=128,
                                                  hook_control=resident_dsp.receiver_control(bundle),
                                                  hook_reset=resident_dsp.receiver_reset(bundle))
                _, labels = cls.packages.assemble(text(1200), origin, str(work))
                words, labels = cls.packages.assemble(text(bundle['origin'] - labels['dltable']), origin, str(work))
                proc, plabels = cls.packages.assemble(CONTRACT, 0x1700, str(work))
                areas = [cls.packages.assemble(AREA % mark, at, str(work))[0] for mark, at in ((0xabcdef, 0x1800), (0x123456, 0x1840))]
                image = ['P %d %d' % (origin + i, w) for i, w in enumerate(words)]
                image += ['P %d %d' % (bundle['origin'] + i, w) for i, w in enumerate(bundle['words'])]
                image += ['P %d %d' % (0x1700 + i, w) for i, w in enumerate(proc)]
                image += ['P %d %d' % (at + i, w) for area, at in zip(areas, (0x1800, 0x1840)) for i, w in enumerate(area)]
                image += ['P %d 0' % labels['tblready'], 'FILL x 0 32768 11', 'R r 6 %d' % 0x4000]
                op12 = labels['mwslotop']
                steps = image + ['GO %d 400000 %d' % (labels['frame'], origin), 'DUMP x %d %d' % (0x7fb0, 0x7ff0),
                                 'PKT %d 20 %d 0' % (op12, 0x1800),        # FX2 of position 1: (r7 >> 8) & 15 = 5
                                 'PKT %d 64 1 0' % op12,                   # past the 64 words: refused
                                 'PKT %d 60 %d %d' % (op12, 0x5678, 0x9a),  # the last word, all 24 bits
                                 'DUMP x %d %d' % (0x7fb0, 0x7ff0),
                                 'X %d 0' % 0x7000, 'R r 7 %d' % 0x6500, 'GO %d 1000 %d' % (0x1700, 0x1700), 'DUMP x %d %d' % (0x7000, 0x7001),
                                 'X %d 0' % 0x7000, 'R r 7 %d' % 0x6800, 'GO %d 1000 %d' % (0x1700, 0x1700), 'DUMP x %d %d' % (0x7000, 0x7001),
                                 'PKT %d 32 %d 0' % (op12, 0x1840),        # FX2 of position 2: 8
                                 'X %d 0' % 0x7000, 'R r 7 %d' % 0x6800, 'GO %d 1000 %d' % (0x1700, 0x1700), 'DUMP x %d %d' % (0x7000, 0x7001)]
                out = run(steps)
                self.assertEqual(out[0].split()[2], '1', out[0])           # the frame returned
                self.assertEqual(out[1], 'D x %d %s' % (0x7fb0, ' '.join(['0'] * 64)))
                self.assertEqual(out[2:5], ['A 1', 'A 0', 'A 1'])
                record = [0] * 64
                record[20], record[60] = 0x1800, 0x9a5678
                self.assertEqual(out[5], 'D x %d %s' % (0x7fb0, ' '.join(map(str, record))))
                self.assertEqual(out[7], 'D x %d %d' % (0x7000, 0xabcdef))   # position 1 ran its area
                self.assertEqual(out[9], 'D x %d 0' % 0x7000)                # position 2 had none: dry
                self.assertEqual(out[10], 'A 1')
                self.assertEqual(out[12], 'D x %d %d' % (0x7000, 0x123456))  # ... until its record named one
                # The stream's words: ECHO's proc echoes its in-block into its out-block at the bank X:$207 names
                # + each offset, in either bank, with r6 on stock's parameter copies, and touches neither with a word unset.
                probe, plabels2 = cls.packages.assemble(ECHO, 0x1780, str(work))
                entry = plabels2['proc']
                rec = 0x7fb0 + 4 * 5
                steps = ['P %d %d' % (0x1780 + i, w) for i, w in enumerate(probe)] + ['FILL x 0 32768 5']
                for bank in (0x2000, 0x4000):
                    steps += ['X %d 0' % rec, 'X %d %d' % (rec + 1, 0x1be0), 'X %d %d' % (rec + 2, 0x1840), 'X %d %d' % (0x207, bank),
                              'X %d %d' % (bank + 0x1be0, 0xab1234), 'X %d %d' % (bank + 0x1be1, 0xcd5678),
                              'R r 7 %d' % 0x6500, 'R r 6 %d' % 0x25d, 'GO %d 1000 %d' % (entry, 0x1780),
                              'DUMP x %d %d' % (bank + 0x1840, bank + 0x1842)]
                steps += ['X %d 0' % (rec + 1), 'X %d 7' % (0x4000 + 0x1840), 'R r 7 %d' % 0x6500, 'R r 6 %d' % 0x25d,
                          'GO %d 1000 %d' % (entry, 0x1780), 'DUMP x %d %d' % (0x4000 + 0x1840, 0x4000 + 0x1841)]
                echo = run(steps)
                self.assertEqual(echo[1], 'D x %d %d %d' % (0x2000 + 0x1840, 0xab1234, 0xcd5678))
                self.assertEqual(echo[3], 'D x %d %d %d' % (0x4000 + 0x1840, 0xab1234, 0xcd5678))
                self.assertEqual(echo[5], 'D x %d 7' % (0x4000 + 0x1840))  # in-block unnamed: no echo


if __name__ == '__main__':
    unittest.main()
