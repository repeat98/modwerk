# SPDX-License-Identifier: GPL-3.0-or-later
"""The Octatrack controller board against the actual loader, generated owned
transport, registry and write lease (host, ASan/UBSan).

Synthetic: the packages (CF images without stock sites), their trust rows and
a modelled DSP receiver (ACK/refusal flags, CAS masks, reset readiness). No
board ACK, timing, hardware or real package identity is claimed.
"""
import hashlib
from pathlib import Path
import shutil
import struct
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
ADAPTER = ROOT / 'sdk/machines/octatrack/module-adapters'
POLICY = ADAPTER / 'controller-policy'
RUNTIME = ADAPTER / 'resident-runtime'
ELEK = ROOT / 'sdk/machines/octatrack/elekloader'
sys.path.append(str(ADAPTER))
import resident_boot  # noqa: E402
import resident_driver  # noqa: E402
import resident_placement  # noqa: E402
from host_flags import SANITIZE  # noqa: E402


def package(module, image):
    """ABI 4: header, image, nothing else."""
    return b'MWRM' + struct.pack('>HHIIIIII', 4, 0, len(image), 0, 0, 0, 0, module) + image


DONOR = 0x400d5a82
DONOR_BYTES = bytes((7 * i + 3) & 255 for i in range(0x192))


def page_image(seed):
    """An MWPP record (stock_hook_controllers.page_record's layout) heading a 96-byte image:
    three integers and an inherit (the donor's own bits under 0x0000ff0f back at 398), one text, one
    pointer to image offset 80."""
    record = b'MWPP' + bytes((1, 4, 1, 1)) + struct.pack('>I', DONOR) + hashlib.sha256(DONOR_BYTES).digest()
    record += struct.pack('>HBBI', 5, 1, 0, 0x11) + struct.pack('>HBBI', 100, 4, 0, 0x1234)
    record += struct.pack('>HBBI', 398, 4, 0, 0) + struct.pack('>HBBI', 398, 4, 1, 0x0000ff0f)
    record += struct.pack('>HBB', 70, 6, 3) + b'KEY\0'
    record += struct.pack('>HHI', 234, 0, 80)
    return record + bytes((seed + i) & 255 for i in range(96 - len(record)))


PACKAGES = {  # name: (module id, feature, image)
    'sc': (0x95cff696, 1, page_image(0)),
    'sc2': (0x95cff696, 1, page_image(1)),
    'matrix': (0xcaf158b5, 2, bytes(range(2, 130))),
    'rival': (0x12345678, 1, bytes(range(3, 67))),
    'forged': (0x95cff696, 1, bytes(range(4, 68))),  # same module, untrusted bytes
    'ab': (0xabdb1445, 4, bytes(range(5, 133))),
    'plain': (0x11111100, 0, bytes(range(9, 41))),  # ordinary packages, no trust row
    'plain2': (0x22222200, 0, bytes(range(10, 42))),
    'plain2b': (0x22222200, 0, bytes(range(11, 43))),
}
UNTRUSTED = ('forged', 'plain', 'plain2', 'plain2b')
CORES = {1: 3, 2: 1, 4: 3}
AB_WORDS = 3776


def ab_words(core):
    """Synthetic engine words for one core (tables and a zero stretch), not Analog BD's."""
    return [0 if 1000 <= i < 1600 else (i * 2654435761 >> 7 ^ core * 0x5a5a5a) & 0xffffff for i in range(AB_WORDS)]


def ab_records(core):
    """The x record as resident_boot.py packs it into the base."""
    record = resident_boot.records_bytes([dict(space='x', address=0x2840, words=ab_words(core))], [('x', 0x2840, AB_WORDS)])
    return resident_boot.pack_zeros(record)


def header():
    """Packages as C arrays and their trust rows (entry 8, Begin 16, End 24)."""
    text, rows = '', ''
    for name, (module, feature, image) in PACKAGES.items():
        data = package(module, image)
        text += 'static const uint8_t pkg_%s[%d] = {%s};\n' % (name, len(data), ','.join(map(str, data)))
        if name in UNTRUSTED:
            continue
        digest = ','.join('0x%02x' % b for b in hashlib.sha256(data).digest())
        rows += ('{{{%s}, {%d}, 0x%08xu, 1, 1, 1, %d, %d}, 1, %d, 8, 16, 24}, '
                 % (digest, feature, module, feature, CORES[feature], len(image)))
    text += 'static const uint8_t donor_original[%d] = {%s};\n' % (len(DONOR_BYTES), ','.join(map(str, DONOR_BYTES)))
    for core in (0, 1):
        packed = ab_records(core)
        text += 'static uint8_t ab_x_%d[%d] = {%s};\n' % (core, len(packed), ','.join(map(str, packed)))
        text += 'static const uint32_t ab_expect_%d[%d] = {%s};\n' % (core, AB_WORDS, ','.join(map(str, ab_words(core))))
    return text + '#define ROWS %s\n#define ROW_COUNT %d\n' % (rows, len(PACKAGES) - len(UNTRUSTED))


FIXTURE = r'''
#include <assert.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include "controller_board.h"
#include "packages.h"
volatile uint32_t test_clock;
static unsigned sr, flags[2], saved_busy, buffers_idle = 1, ui_clear = 1, refuse_cas;
static uint8_t mode_live, mode_cs1;
unsigned modwerk_dsp_flags(unsigned c) { return flags[c]; }
unsigned mw_controller_transport_test_sr(void) { return sr; }
uint32_t modwerk_machine_lock(void) { unsigned old = sr; if (sr < 0x400u) sr = 0x400u; return old; }
void modwerk_machine_unlock(uint32_t old) { sr = old; }
uint32_t modwerk_machine_mask(void) { return sr; }
void modwerk_machine_unmask(uint32_t old) { sr = old; }
void dl_selection_tick(void) {}
void dl_show_message(const char *s, unsigned n) { (void)s; (void)n; }
int modwerk_machine_stopped(void) { return 1; }
static unsigned long uncached_calls; /* each owner header check, canonical extent and owns_image takes one */
void *modwerk_machine_uncached(void *p) { ++uncached_calls; return p; }
void modwerk_machine_invalidate_code(void) {}
int modwerk_machine_patchable(uint32_t a, uint32_t n) { (void)a; (void)n; return 0; }
uint8_t *modwerk_machine_code(uint32_t a) { (void)a; return 0; }
void modwerk_machine_flush_data(uint32_t a, uint32_t n) { (void)a; (void)n; }
static unsigned paused_none; /* no task paused anywhere: reclaim frees what nothing reaches (else unknown, nothing) */
unsigned modwerk_machine_paused(struct runtime_span *s, unsigned max, const struct runtime_context *c) { (void)s; (void)c; return paused_none ? 0u : max + 1u; }
int modwerk_machine_dsp_admit(const struct runtime_dsp *from, struct runtime_dsp *to) { (void)from; (void)to; return 0; }
void modwerk_machine_dsp_switch(const struct runtime_dsp *from, const struct runtime_dsp *to) { (void)from; (void)to; }
int modwerk_saved_set_busy(void) { return (int)saved_busy; }
#ifdef BOARD_MANAGER
void board_manager_running(unsigned slot, unsigned id);
void board_manager_init(void);
#else
void dl_residency_tick(void) {}
int dl_hook_buffer_ranges_idle(unsigned feature) { (void)feature; return (int)buffers_idle; }
#endif
unsigned modwerk_controller_policy_entries(void) { return 0; }
uint8_t mw_controller_board_test_read8(uint32_t a) { return a == 0x80000037u ? mode_live : a == 0x100b1497u ? mode_cs1 : 0xff; }
int mw_controller_board_test_ui(uintptr_t lo, uintptr_t hi) { (void)lo; (void)hi; return (int)ui_clear; }
static uint8_t donor[sizeof donor_original];
uint8_t *mw_controller_board_test_donor(uint32_t a) { assert(a == 0x400d5a82u); return donor; }
const uint8_t *mw_controller_board_test_ab(unsigned c, const uint8_t **end)
{ *end = c ? ab_x_1 + sizeof ab_x_1 : ab_x_0 + sizeof ab_x_0; return c ? ab_x_1 : ab_x_0; }
int modwerk_machine_metadata_admit(const struct runtime_dsp *from, struct runtime_dsp *to,
    const struct runtime_context *c, enum runtime_metadata_operation op)
{ (void)c; assert(sr >= 0x400u); to->foreign_roots = 0; return modwerk_controller_admit(from, to, op); }
static uint8_t task_stack[512] __attribute__((aligned(4)));
int modwerk_machine_stack(uintptr_t *lo, uintptr_t *hi) { *lo = (uintptr_t)task_stack; *hi = *lo + sizeof task_stack; return 1; }
#ifdef BOARD_ROWS
const struct mw_controller_write_policy modwerk_controller_write_policies[MW_CONTROLLER_WRITE_POLICY_CAPACITY + 1u] = { ROWS };
const unsigned modwerk_controller_write_policy_count = ROW_COUNT;
#else
const struct mw_controller_write_policy modwerk_controller_write_policies[MW_CONTROLLER_WRITE_POLICY_CAPACITY + 1u] = {{.version = 0}};
const unsigned modwerk_controller_write_policy_count = 0;
#endif
struct mw_controller_registry modwerk_controller_registry;
#include "transfer.c"
#define MODWERK_HOST
#include "controller_write_lease.c"

/* Modelled receiver: a reset ACKs and counts words per feature; a CAS ACKs only
 * with the expected mask and only enabling features whose reset completed;
 * disabling invalidates readiness (resident_dsp.receiver_control). */
static unsigned dsp_mask[2], words[2][3], answered[2], cas_count, ab_wrong;
static const unsigned totals[3] = {1042, 193, 3776};
static void dsp(void)
{
    dl_frame();
    for (unsigned c = 0; c < 2; ++c) {
        if (dl_tx[c][0] != DL_MAGIC || dl_tx[c][1] == answered[c]) continue;
        answered[c] = dl_tx[c][1];
        unsigned reject = 0, op = dl_tx[c][2];
        if (op == 11u) {
            unsigned f = dl_tx[c][7], k = f == 1u ? 0 : f == 2u ? 1 : f == 4u ? 2 : 3;
            reject = k > 2 || dl_tx[c][5] != words[c][k] || (dsp_mask[c] & f);
            /* Analog BD's engine is reset to its boot record, word for word (24-bit: high 16, low 8). */
            for (unsigned i = 0; !reject && k == 2 && i < dl_tx[c][4]; ++i)
                if (((unsigned)dl_tx[c][8 + 2 * i] << 8 | dl_tx[c][9 + 2 * i]) != (c ? ab_expect_1 : ab_expect_0)[dl_tx[c][5] + i]) ++ab_wrong;
            if (!reject) words[c][k] += dl_tx[c][4];
        } else if (op == 10u) {
            unsigned expected = dl_tx[c][4], desired = dl_tx[c][5], on = desired & ~expected;
            ++cas_count;
            reject = refuse_cas || expected != dsp_mask[c] || ((on & 1u) && words[c][0] != totals[0]) ||
                ((on & 2u) && words[c][1] != totals[1]) || ((on & 4u) && words[c][2] != totals[2]);
            if (!reject) {
                for (unsigned f = 1; f <= 4; f <<= 1) if ((expected & f) && !(desired & f)) words[c][f >> 1] = 0;
                dsp_mask[c] = desired;
            }
        } else continue;
        flags[c] = ((flags[c] ^ 1u) & 1u) | (reject ? 2u : 0u);
        dl_frame();
    }
}
static void run(unsigned n) { while (n--) { modwerk_controller_tick(); dsp(); dsp(); } }
static const struct mu_backend *loader = &modwerk_runtime_backend;
/* The legacy install path (modset restore, the vendor controller). */
static enum mu_publication install(const uint8_t *data, unsigned length)
{
    assert(loader->enter(0) && loader->prepare(0, data, length));
    enum mu_publication p = loader->publish(0);
    if (p == MU_APPLIED) assert(loader->retire(0)); else assert(loader->discard(0));
    assert(loader->leave(0));
    return p;
}
static int install_refused(const uint8_t *data, unsigned length, enum runtime_refusal *why)
{
    assert(loader->enter(0));
    int ok = loader->prepare(0, data, length);
    if (!ok) *why = modwerk_runtime_refusal();
    else { enum mu_publication p = loader->publish(0); assert(p == MU_UNCHANGED); *why = modwerk_runtime_refusal(); assert(loader->discard(0)); }
    assert(loader->leave(0));
    return 1;
}
static uint8_t empty[32];
static const uint8_t *removal(uint32_t module)
{
    memset(empty, 0, sizeof empty); memcpy(empty, "MWRM", 4); empty[5] = 4;
    for (unsigned k = 0; k < 4; ++k) empty[28 + k] = (uint8_t)(module >> (24 - 8 * k));
    return empty;
}
static __attribute__((unused)) const struct mw_controller_slot *slot_for(uint32_t module, unsigned state)
{
    for (unsigned i = 0; i < MW_CONTROLLER_SLOTS; ++i)
        if (modwerk_controller_registry.slots[i].binding.identity.module == module && modwerk_controller_registry.slots[i].state == state)
            return &modwerk_controller_registry.slots[i];
    return 0;
}
static __attribute__((unused)) uintptr_t exec_of(uint32_t module)
{
    for (unsigned i = 0; i < RUNTIME_MODULES; ++i) if (modwerk_runtime_module(i) && modwerk_runtime_module(i)->id == module)
        return (uintptr_t)modwerk_runtime_module(i)->dsp.image;
    return 0;
}
static int lease_at(uintptr_t exec, unsigned feature)
{
    uintptr_t sp = (uintptr_t)task_stack + 64;
    struct mw_controller_write_lease *l = (void *)(task_stack + 256);
    if (!exec) return 0;
    int ok = begin_impl(exec + 8, feature, l, exec + 16, sp);
    if (ok) assert(end_impl(l, exec + 24, sp) == 1);
    assert(sr == 0 && !writing.active);
    return ok;
}
static int lease(uint32_t module, unsigned feature) { return lease_at(exec_of(module), feature); }
static __attribute__((unused)) struct runtime_module *header_of(uint32_t module)
{
    for (unsigned i = 0; i < RUNTIME_MODULES; ++i) if (modwerk_runtime_module(i) && modwerk_runtime_module(i)->id == module)
        return (struct runtime_module *)(uintptr_t)modwerk_runtime_module(i);
    return 0;
}
/* A ledger or position change: the epoch moved on and is even again; the next pair decides anew, the one after
 * checks only the owner's header in Begin and in End. */
static __attribute__((unused)) void decided_anew(uint32_t *epoch)
{
    uint32_t now = modwerk_runtime_owner_epoch();
    assert(now != *epoch && !(now & 1u));
    *epoch = now;
    unsigned long before = uncached_calls;
    assert(lease(0x95cff696u, 1) && uncached_calls - before > 2u);
    before = uncached_calls;
    assert(lease(0x95cff696u, 1) && uncached_calls - before == 2u);
}
#define SC 0x95cff696u
#define MATRIX 0xcaf158b5u
#define AB 0xabdb1445u
static __attribute__((unused)) int page_is(int applied, uint32_t module)
{
    if (!applied) return !memcmp(donor, donor_original, sizeof donor);
    uint32_t v = (uint32_t)(exec_of(module) + 80u), p = (uint32_t)donor[234] << 24 | (uint32_t)donor[235] << 16 | (uint32_t)donor[236] << 8 | donor[237];
    for (unsigned i = 0; i < sizeof donor; ++i)
        if (i != 5 && !(i >= 100 && i < 104) && !(i >= 70 && i < 76) && !(i >= 234 && i < 238) && !(i >= 398 && i < 402) &&
            donor[i] != donor_original[i]) return 0;
    return donor[5] == 0x11 && !donor[100] && !donor[101] && donor[102] == 0x12 && donor[103] == 0x34 &&
        !donor[398] && !donor[399] && donor[400] == donor_original[400] && donor[401] == (donor_original[401] & 0x0f) &&
        !memcmp(donor + 70, "KEY\0\0\0", 6) && p == v;
}
int main(int argc, char **argv)
{
    assert(argc == 2);
    unsigned mode = (unsigned)strtoul(argv[1], 0, 10); /* two digits from mode 10 */
    enum runtime_refusal why;
#ifndef BOARD_ROWS
    /* Default base: no rows, nothing activates, every package is ordinary. */
    run(4);
    assert(install(pkg_sc, sizeof pkg_sc) == MU_APPLIED);
    run(50);
    assert(!modwerk_controller_held() && !cas_count && !dsp_mask[0] && !lease(SC, 1));
    assert(install(removal(SC), 32) == MU_APPLIED);
    (void)mode; (void)why; (void)install_refused;
    return 0;
#else
    memcpy(donor, donor_original, sizeof donor);
#ifdef BOARD_MANAGER
    /* The actual manager's buffer plan and idle check, no stub: a stock DELAY (id 13) on T3 and T7 FX2 holds each
     * core's FX2 block 2, whose tail is Sidechain's key window. 0: before the manager's first transaction (the boot
     * plan); 1: the plan dl_buffers_init starts from; 2: a module (id 40, whole ring) on T7 FX2 instead. */
    board_manager_running(10, 13); board_manager_running(14, 13);
    if (mode >= 1) board_manager_init();
    if (mode == 2) board_manager_running(14, 40);
    run(2);
    assert(install(pkg_sc, sizeof pkg_sc) == MU_APPLIED);
    run(120);
    if (mode == 2) {
        /* A genuine overlap: Sidechain waits, untouched; Output Matrix (Y $c00) is not held up by it. */
        assert(slot_for(SC, MW_CTL_BOUND) && !words[0][0] && !words[1][0] && !dsp_mask[0] && !dsp_mask[1]);
        assert(install(pkg_matrix, sizeof pkg_matrix) == MU_APPLIED);
        run(60);
        assert(slot_for(MATRIX, MW_CTL_ACTIVE) && slot_for(SC, MW_CTL_BOUND) && dsp_mask[0] == 2);
        board_manager_running(14, 13); /* the module gives way to stock's delay */
        run(120);
    }
    assert(slot_for(SC, MW_CTL_ACTIVE) && (dsp_mask[0] & 1u) && dsp_mask[1] == 1);
    assert(words[0][0] == 1042 && words[1][0] == 1042 && lease(SC, 1));
    (void)why; (void)install_refused;
    return 0;
#endif
    if (mode == 10) ab_x_1[4] ^= 1; /* core B's engine record names another address: Analog BD never resets */
    if (mode == 7) donor[300] ^= 1; /* not the stock descriptor the record names: no page, still a working controller */
    run(2);
    if (mode == 11) { paused_none = 1; assert(install(pkg_plain, sizeof pkg_plain) == MU_APPLIED); } /* an owner entry before Sidechain's */
    assert(install(pkg_sc, sizeof pkg_sc) == MU_APPLIED);
    assert(!lease(SC, 1) && (mode == 7 || page_is(0, SC))); /* published, not yet reset and enabled */
    run(120);
    assert(slot_for(SC, MW_CTL_ACTIVE) && dsp_mask[0] == 1 && dsp_mask[1] == 1);
    if (mode == 7) {
        donor[300] ^= 1; assert(page_is(0, SC)); donor[300] ^= 1;
        assert(lease(SC, 1));
        return 0;
    }
    assert(page_is(1, SC));
    if (mode == 8) {
        /* Someone changed the extended page: unknown, the removal quarantines and holds it. */
        donor[200] ^= 1;
        assert(install_refused(removal(SC), 32, &why) && why == RUNTIME_BUSY);
        run(5);
        assert(slot_for(SC, MW_CTL_QUARANTINED) && dsp_mask[0] == 1);
        assert(install_refused(removal(SC), 32, &why) && why == RUNTIME_CONFLICT);
        return 0;
    }
    assert(words[0][0] == 1042 && words[1][0] == 1042 && modwerk_controller_held() == 1);
    assert(lease(SC, 1) && !lease(SC, 2));
    if (mode == 0) {
        /* Removal: refused until both cores ACKed the disable, then released. */
        assert(install_refused(removal(SC), 32, &why) && why == RUNTIME_BUSY);
        assert(lease(SC, 1)); /* only a request until the tick starts the disable */
        run(1);
        assert(!lease(SC, 1) && page_is(0, SC)); /* page gone before the hooks; disabling: no writes */
        run(10);
        assert(slot_for(SC, MW_CTL_RETIRING) && !dsp_mask[0] && !dsp_mask[1]);
        ui_clear = 0;
        assert(install_refused(removal(SC), 32, &why) && why == RUNTIME_IN_USE);
        ui_clear = 1;
        assert(install(removal(SC), 32) == MU_APPLIED);
        run(2);
        assert(slot_for(SC, MW_CTL_RELEASED) && !modwerk_controller_held() && page_is(0, SC));
        /* Installing it again binds a new owner generation from scratch; no earlier decision carries over. */
        assert(install(pkg_sc, sizeof pkg_sc) == MU_APPLIED);
        assert(!lease(SC, 1));
        run(120);
        assert(slot_for(SC, MW_CTL_ACTIVE) && dsp_mask[0] == 1 && lease(SC, 1) && page_is(1, SC));
    } else if (mode == 1) {
        /* An abandoned removal: disabled, then restored through a full reset. */
        assert(install_refused(removal(SC), 32, &why) && why == RUNTIME_BUSY);
        run(10);
        assert(slot_for(SC, MW_CTL_RETIRING) && !dsp_mask[0] && page_is(0, SC));
        run(700);
        assert(slot_for(SC, MW_CTL_ACTIVE) && dsp_mask[0] == 1 && dsp_mask[1] == 1 && lease(SC, 1) && page_is(1, SC));
    } else if (mode == 2) {
        /* Same-feature replacement: predecessor disabled, successor bound with it
         * as previous, reset and enabled, then the predecessor retires. */
        assert(install_refused(pkg_sc2, sizeof pkg_sc2, &why) && why == RUNTIME_BUSY);
        run(10);
        assert(install(pkg_sc2, sizeof pkg_sc2) == MU_APPLIED);
        run(120);
        const struct mw_controller_slot *next = slot_for(SC, MW_CTL_ACTIVE);
        assert(next && next->binding.image_bytes == 96 && next->previous < MW_CONTROLLER_SLOTS && slot_for(SC, MW_CTL_RELEASED));
        assert(dsp_mask[0] == 1 && dsp_mask[1] == 1 && lease(SC, 1) && page_is(1, SC)); /* the successor's formatter */
    } else if (mode == 3) {
        /* Matrix beside it: core A only; removal refuses in MATRIX mode. */
        assert(install(pkg_matrix, sizeof pkg_matrix) == MU_APPLIED);
        run(40);
        assert(slot_for(MATRIX, MW_CTL_ACTIVE) && dsp_mask[0] == 3 && dsp_mask[1] == 1 && words[1][1] == 0);
        assert(lease(MATRIX, 2) && lease(SC, 1) && modwerk_controller_held() == 3);
        mode_live = 2;
        assert(install_refused(removal(MATRIX), 32, &why) && why == RUNTIME_IN_USE);
        run(5);
        assert(slot_for(MATRIX, MW_CTL_ACTIVE)); /* nothing started */
        mode_live = 0; mode_cs1 = 2;
        assert(install_refused(removal(MATRIX), 32, &why) && why == RUNTIME_IN_USE);
        mode_cs1 = 1;
        assert(install_refused(removal(MATRIX), 32, &why) && why == RUNTIME_BUSY);
        run(10);
        assert(install(removal(MATRIX), 32) == MU_APPLIED);
        run(2);
        assert(slot_for(MATRIX, MW_CTL_RELEASED) && dsp_mask[0] == 1 && lease(SC, 1));
    } else if (mode == 4) {
        /* A refused CAS is unknown DSP state: quarantined, held, never retried. */
        assert(install(pkg_matrix, sizeof pkg_matrix) == MU_APPLIED);
        refuse_cas = 1;
        unsigned before = cas_count;
        run(60);
        assert(slot_for(MATRIX, MW_CTL_QUARANTINED) && cas_count == before + 1);
        assert(!lease(MATRIX, 2) && lease(SC, 1));
        assert(install_refused(removal(MATRIX), 32, &why) && why == RUNTIME_CONFLICT);
        run(40);
        assert(cas_count == before + 1 && modwerk_controller_held() == 3);
    } else if (mode == 5) {
        /* Another module cannot take a held resident engine; an untrusted
         * build of the module is an ordinary, inert package. */
        assert(install_refused(pkg_rival, sizeof pkg_rival, &why) && why == RUNTIME_CONFLICT);
        assert(install_refused(pkg_forged, sizeof pkg_forged, &why) && why == RUNTIME_BUSY);
        run(10);
        assert(install(pkg_forged, sizeof pkg_forged) == MU_APPLIED);
        run(80);
        assert(!lease(SC, 1) && !dsp_mask[0] && !dsp_mask[1] && slot_for(SC, MW_CTL_RETIRING) == 0);
        assert(install(removal(SC), 32) == MU_APPLIED && install(pkg_rival, sizeof pkg_rival) == MU_APPLIED);
        run(120);
        assert(slot_for(0x12345678u, MW_CTL_ACTIVE) && dsp_mask[0] == 1);
    } else if (mode == 9) {
        /* Analog BD beside it, on both cores: its engine reset to its boot record word for word, then enabled. */
        assert(install(pkg_ab, sizeof pkg_ab) == MU_APPLIED);
        assert(!lease(AB, 4));
        run(500);
        assert(slot_for(AB, MW_CTL_ACTIVE) && dsp_mask[0] == 5 && dsp_mask[1] == 5 && !ab_wrong);
        assert(words[0][2] == 3776 && words[1][2] == 3776 && modwerk_controller_held() == 5);
        assert(lease(AB, 4) && !lease(AB, 1) && lease(SC, 1));
        assert(install_refused(removal(AB), 32, &why) && why == RUNTIME_BUSY);
        run(1);
        assert(!lease(AB, 4));
        run(10);
        assert(slot_for(AB, MW_CTL_RETIRING) && dsp_mask[0] == 1 && dsp_mask[1] == 1);
        assert(install(removal(AB), 32) == MU_APPLIED);
        run(2);
        assert(slot_for(AB, MW_CTL_RELEASED) && modwerk_controller_held() == 1 && lease(SC, 1));
    } else if (mode == 10) {
        /* A record that is not its engine's: never reset or enabled, so never a lease; Sidechain unaffected. */
        assert(install(pkg_ab, sizeof pkg_ab) == MU_APPLIED);
        run(500);
        assert(!slot_for(AB, MW_CTL_ACTIVE) && !(dsp_mask[0] & 4u) && !(dsp_mask[1] & 4u) && !lease(AB, 4));
        assert(lease(SC, 1) && dsp_mask[0] == 1 && dsp_mask[1] == 1);
    } else if (mode == 6) {
        /* Saved-set export blocks control writes and new jobs, not progress after. */
        saved_busy = 1;
        assert(!lease(SC, 1));
        saved_busy = 0;
        buffers_idle = 0; /* manager busy: the ACTIVE generation's check stands */
        assert(lease(SC, 1));
    } else if (mode == 11) {
        /* The lease keeps Begin's decision while nothing it read changed (controller_write_lease.c): a repeated
         * pair checks only the owner's own header, once in Begin and once in End, and walks no owner list. */
        unsigned long before = uncached_calls;
        for (unsigned k = 0; k < 16; ++k) assert(lease(SC, 1));
        assert(uncached_calls - before == 32u);
        /* Refused by the slot or the backend's per-call facts: no owner check at all, and nothing changes. */
        static struct mw_controller_registry snapshot;
        memcpy(&snapshot, &modwerk_controller_registry, sizeof snapshot);
        saved_busy = 1; before = uncached_calls;
        for (unsigned k = 0; k < 16; ++k) assert(!lease(SC, 1));
        assert(uncached_calls == before && !memcmp(&snapshot, &modwerk_controller_registry, sizeof snapshot));
        saved_busy = 0;
        /* The owner's header is checked on every call: a changed digest, size or id refuses at once, the ledger unchanged. */
        struct runtime_module *m = header_of(SC);
        uintptr_t exec = exec_of(SC);
        uint32_t epoch = modwerk_runtime_owner_epoch();
        m->dsp.package_sha256[31] ^= 1u; assert(!lease_at(exec, 1)); m->dsp.package_sha256[31] ^= 1u;
        m->dsp.package_sha256[0] ^= 0x80u; assert(!lease_at(exec, 1)); m->dsp.package_sha256[0] ^= 0x80u;
        m->size += 16u; assert(!lease_at(exec, 1)); m->size -= 16u;
        m->id ^= 1u; assert(!lease_at(exec, 1)); m->id ^= 1u;
        assert(modwerk_runtime_owner_epoch() == epoch && lease(SC, 1) && writing.hint == 1u);
        /* Removing another module: reclaim moves Sidechain's owner entry into the freed one. */
        assert(install(removal(0x11111100u), 32) == MU_APPLIED);
        decided_anew(&epoch);
        assert(writing.hint == 0u);
        /* Installing another module. */
        assert(install(pkg_plain2, sizeof pkg_plain2) == MU_APPLIED);
        decided_anew(&epoch);
        /* A prepared candidate that is discarded. */
        assert(loader->enter(0) && loader->prepare(0, pkg_plain2b, sizeof pkg_plain2b));
        decided_anew(&epoch);
        assert(loader->discard(0) && loader->leave(0));
        decided_anew(&epoch);
        /* Publishing another module, rolling it back, and reclaiming the rolled-back candidate. */
        assert(loader->enter(0) && loader->prepare(0, pkg_plain2b, sizeof pkg_plain2b));
        decided_anew(&epoch);
        assert(loader->publish(0) == MU_APPLIED);
        decided_anew(&epoch);
        assert(loader->restore(0));
        decided_anew(&epoch);
        assert(loader->retire(0) && loader->leave(0));
        decided_anew(&epoch);
        assert(exec_of(0x22222200u) && !memcmp((const void *)exec_of(0x22222200u), pkg_plain2 + 32, 32));
        /* A decision never outlives its slot: a bind of anything moves the registry on. */
        uint32_t bound = modwerk_controller_registry.last_generation;
        assert(install(pkg_matrix, sizeof pkg_matrix) == MU_APPLIED);
        decided_anew(&epoch);
        run(40);
        assert(modwerk_controller_registry.last_generation != bound && slot_for(MATRIX, MW_CTL_ACTIVE));
        before = uncached_calls;
        assert(lease(SC, 1) && uncached_calls - before > 2u); /* decided anew */
        assert(lease(MATRIX, 2) && lease(SC, 1) && lease(MATRIX, 2)); /* two call sites, one line each */
        before = uncached_calls;
        assert(lease(SC, 1) && lease(MATRIX, 2) && uncached_calls - before == 4u);
        /* A pair the frame interrupt runs inside a task's Begin decides on its own and leaves the lines alone. */
        static struct decided lines[DECIDED];
        memcpy(lines, decided, sizeof lines);
        deciding = 1; before = uncached_calls;
        assert(lease(SC, 1) && lease(MATRIX, 2) && uncached_calls - before > 4u && deciding == 1);
        assert(!memcmp(lines, decided, sizeof lines));
        deciding = 0;
        /* A header changed while the lease is held: End refuses, quarantines, and the wrapper falls back to stock. */
        uintptr_t sp = (uintptr_t)task_stack + 64;
        struct mw_controller_write_lease *l = (void *)(task_stack + 256);
        assert(begin_impl(exec + 8, 1, l, exec + 16, sp) == 1 && sr == 0x400u);
        m->dsp.package_sha256[7] ^= 1u;
        assert(!end_impl(l, exec + 24, sp) && sr == 0 && !writing.active && slot_for(SC, MW_CTL_QUARANTINED));
        m->dsp.package_sha256[7] ^= 1u;
        assert(!lease(SC, 1) && lease(MATRIX, 2));
    } else if (mode == 12) {
        /* Beta run 2 on the unit (finding 30): all three in; a removal of each refused busy and then abandoned (they
         * restore); then each removed for good, Sidechain in and out once more, and Output Matrix installed beside a
         * running Sidechain. The unit crashed at that last install's verify; this model does not, so the cause lies
         * outside the board (the crash record names it). */
        assert(install(pkg_matrix, sizeof pkg_matrix) == MU_APPLIED && install(pkg_ab, sizeof pkg_ab) == MU_APPLIED);
        run(500);
        assert(slot_for(SC, MW_CTL_ACTIVE) && slot_for(MATRIX, MW_CTL_ACTIVE) && slot_for(AB, MW_CTL_ACTIVE));
        static const uint32_t order[3] = {AB, MATRIX, SC};
        for (unsigned k = 0; k < 3; ++k) assert(install_refused(removal(order[k]), 32, &why) && why == RUNTIME_BUSY);
        run(1500);
        assert(slot_for(SC, MW_CTL_ACTIVE) && slot_for(MATRIX, MW_CTL_ACTIVE) && slot_for(AB, MW_CTL_ACTIVE));
        for (unsigned k = 0; k < 4; ++k) {
            uint32_t module = k == 0 ? MATRIX : k == 3 ? AB : SC;
            if (k == 2) { assert(install(pkg_sc, sizeof pkg_sc) == MU_APPLIED); run(120); assert(slot_for(SC, MW_CTL_ACTIVE)); }
            assert(install_refused(removal(module), 32, &why) && why == RUNTIME_BUSY);
            run(10);
            assert(install(removal(module), 32) == MU_APPLIED);
            run(2);
        }
        assert(!modwerk_controller_held());
        assert(install(pkg_sc, sizeof pkg_sc) == MU_APPLIED);
        run(120);
        assert(install(pkg_matrix, sizeof pkg_matrix) == MU_APPLIED);
        run(60);
        assert(slot_for(SC, MW_CTL_ACTIVE) && slot_for(MATRIX, MW_CTL_ACTIVE) && lease(SC, 1) && lease(MATRIX, 2));
    } else assert(0);
    return 0;
#endif
}
'''


# The generated manager in its own unit (its statics stay its own), on the fixture's actual transfer.c. Its
# observer storage, catalogue and packages are empty; the running FX array is the native allocator.active.
MANAGER_UNIT = r'''
#include <stdint.h>
static uint32_t auto_serial = 0x80000000u;
static unsigned observed_valid;
static uint8_t last[16];
#include "manager.c"
struct dl_package dl_catalog[MODWERK_FX_IDS];
struct code dl_codes[2][MODWERK_FX_IDS];
const uint32_t dl_pmap16 = 0;
const fx_set dl_stub_at_boot = {{0}}, modwerk_fx_modules = {{0, 0xffffffffu}};
int modwerk_stock_hook_export_idle(void) { return 1; }
uint32_t modwerk_dsp_source_charge(unsigned c) { (void)c; return 0; }
int modwerk_dsp_buffer_permitted(unsigned c, unsigned k, unsigned b, unsigned id) { (void)c; (void)k; (void)b; (void)id; return 0; }
/* The strong bridge's answer (controller_policy.c): no reviewed exact entry. */
int modwerk_stock_hook_buffer_policy(unsigned c, unsigned id, struct mw_hook_buffer_claim *out) { (void)c; (void)id; (void)out; return 0; }
void board_manager_running(unsigned slot, unsigned id) { allocator.active[slot] = (uint8_t)id; }
void board_manager_init(void) { initialized = 1; dl_buffers_init(&buffers, dl_pmap16); }
'''


@unittest.skipUnless(shutil.which('cc'), 'host C compiler unavailable')
class ControllerBoard(unittest.TestCase):
    def generated(self, work):
        import importlib.util
        spec = importlib.util.spec_from_file_location('controller_board_core', ELEK / 'build_core.py')
        core = importlib.util.module_from_spec(spec); spec.loader.exec_module(core)
        for name in core.DYNLOAD_SOURCES:
            text = (core.DYNLOAD / name).read_text()
            for old, new in core.DSP_EDITS.get(name, ()) + core.WIDTH_EDITS.get(name, ()):
                self.assertEqual(text.count(old), 1)
                text = text.replace(old, new)
            if name == 'transfer.c':
                text = resident_driver.transport(text).replace('*(volatile uint32_t *)0xfc07c00cu', 'test_clock')
            elif name == 'transfer.h':
                text = resident_driver.transport_header(text)
            elif name == 'buffers.c':
                text = resident_placement.buffers(text)
            elif name == 'manager.c':
                text = resident_placement.manager(text)
            (work / name).write_text(text)
        (work / 'manager_unit.c').write_text(MANAGER_UNIT)
        shutil.copyfile(ELEK / 'fxids.h', work / 'fxids.h')
        (work / 'packages.h').write_text(header())
        (work / 'fixture.c').write_text(FIXTURE)

    def build(self, work, rows, manager=False):
        flags = ['-std=c11', '-Wall', '-Wextra', '-Werror', *SANITIZE, '-fno-omit-frame-pointer',
                 '-DDL_NATIVE_TEST', '-DMW_CONTROLLER_TRANSPORT_TEST', '-DMW_CONTROLLER_BOARD_TEST',
                 '-DMODWERK_RUNTIME_METADATA_EXTERNAL', '-DMODWERK_FX_IDS=64', '-DMODWERK_DSP_TABLE0=4096',
                 '-DMODWERK_DSP_TABLE1=4096', '-DMODWERK_DSP_WORDS0=2000', '-DMODWERK_DSP_WORDS1=2000',
                 '-DMODWERK_DSP_ALLOWANCE0=3120', '-DMODWERK_DSP_ALLOWANCE1=3565',
                 *(['-DBOARD_ROWS'] if rows else []), *(['-DBOARD_MANAGER'] if manager else []),
                 '-I' + str(work), '-I' + str(POLICY), '-I' + str(ADAPTER), '-I' + str(RUNTIME),
                 '-I' + str(ROOT / 'sdk/runtime/loader'), '-I' + str(ROOT / 'sdk/runtime/upload')]
        out = work / ('board-manager' if manager else 'board-rows' if rows else 'board-empty')
        extra = [work / 'manager_unit.c', work / 'allocator.c', work / 'buffers.c', RUNTIME / 'stock_hooks.c',
                 RUNTIME / 'stock_hook_resources.c'] if manager else []
        result = subprocess.run(['cc', *flags, str(work / 'fixture.c'), str(POLICY / 'controller_board.c'),
                                 str(POLICY / 'controller_transport.c'), str(POLICY / 'controller_association.c'),
                                 str(ROOT / 'sdk/runtime/loader/loader.c'), str(ROOT / 'sdk/runtime/upload/sha256.c'),
                                 str(ADAPTER / 'machine_lifetime.c'), *map(str, extra), '-o', str(out)],
                                capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        return out

    def test_default_rows_activate_nothing(self):
        with tempfile.TemporaryDirectory() as temp:
            work = Path(temp); self.generated(work)
            result = subprocess.run([str(self.build(work, False)), '0'], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)

    def test_install_activation_removal_restore_replacement_matrix_and_quarantine(self):
        with tempfile.TemporaryDirectory() as temp:
            work = Path(temp); self.generated(work)
            binary = self.build(work, True)
            for mode in range(13):
                with self.subTest(mode=mode):
                    result = subprocess.run([str(binary), str(mode)], capture_output=True, text=True)
                    self.assertEqual(result.returncode, 0, result.stderr)

    def test_actual_manager_buffer_plan_lets_sidechain_past_stock_delays(self):
        with tempfile.TemporaryDirectory() as temp:
            work = Path(temp); self.generated(work)
            binary = self.build(work, True, manager=True)
            for mode in range(3):
                with self.subTest(mode=mode):
                    result = subprocess.run([str(binary), str(mode)], capture_output=True, text=True)
                    self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == '__main__':
    unittest.main()
