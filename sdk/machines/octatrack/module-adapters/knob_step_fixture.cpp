// SPDX-License-Identifier: GPL-3.0-or-later
// fxpage.s's mw_knob_step under the native ColdFire emulator, beside stock's own default stepper (0x4003240c), on the
// user's own MAIN image (never firmware in CI): test_knob_step.py builds and runs it.
//   knob_step_fixture MAIN ROUTINE.bin
// A module descriptor (outside the OS image) whose staging is stale is restaged before the stepper, the turn's remainder
// cleared only with a new step; the result equals stock's stepper on freshly staged records. A stock descriptor goes
// straight on, its records untouched.
#include <cassert>
#include <cstdio>
#include <fstream>
#include <iterator>
#include <vector>
#include "machine.h"
#include "mc68k/Musashi/m68k.h"
#include "mc68k/cpuState.h"

static constexpr uint32_t SP = 0x46c7f920, STOP = 0x47300000, ROUTINE = 0x47400000, MODULE = 0x47500000, STOCKDESC = 0x40010000;
static constexpr uint32_t STEPPER = 0x4003240c, REC = 0x46c7dede, RUN = 0x46c7d244, P_COUNT = 0x9a;
static std::vector<uint8_t> load(const char *p) {
    std::ifstream f(p, std::ios::binary); assert(f.good()); return {(std::istreambuf_iterator<char>(f)), {}};
}
struct Fixture {
    ot::Machine m;
    explicit Fixture(const std::vector<uint8_t>& stock) : m(stock) {}
    uint32_t call(uint32_t entry, uint32_t a3, uint32_t slot, uint32_t detents, uint32_t value) {
        auto *cpu = m.getCpuState();
        for (unsigned r = 0; r < 15; r++) m68k_set_reg(cpu, m68k_register_t(M68K_REG_D0 + r), 0);
        m68k_set_reg(cpu, M68K_REG_A3, a3);
        m68k_set_reg(cpu, M68K_REG_SP, SP); m.write32(SP, STOP);
        m.write32(SP + 4, slot); m.write32(SP + 8, detents); m.write32(SP + 12, value);
        m68k_set_reg(cpu, M68K_REG_PC, entry);
        unsigned budget = 100000;
        while (m.pc() != STOP && budget--) if (!m.step()) break;
        assert(m.pc() == STOP);
        return m68k_get_reg(cpu, M68K_REG_D0);
    }
    void stage(uint32_t slot, uint32_t threshold, uint32_t count, uint32_t remainder) {
        m.write32(REC + 20 * slot + 8, threshold); m.write32(REC + 20 * slot + 16, count);
        for (unsigned i = 0; i < 4; i++) m.write32(RUN + 20 * slot + 4 * i, i ? 0 : remainder);
        m.write32(0x46c7d8ee + (slot + 56) * 24, 0); /* no acceleration */
    }
    struct State { uint32_t value, threshold, count, run[4]; };
    State state(uint32_t slot, uint32_t value) {
        State s{value, m.read32(REC + 20 * slot + 8), m.read32(REC + 20 * slot + 16), {}};
        for (unsigned i = 0; i < 4; i++) s.run[i] = m.read32(RUN + 20 * slot + 4 * i);
        return s;
    }
};
static bool same(const Fixture::State& a, const Fixture::State& b) {
    return a.value == b.value && a.threshold == b.threshold && a.count == b.count &&
           a.run[0] == b.run[0] && a.run[1] == b.run[1] && a.run[2] == b.run[2] && a.run[3] == b.run[3];
}
int main(int argc, char **argv) {
    assert(argc == 3);
    auto stock = load(argv[1]); auto code = load(argv[2]);
    Fixture f(stock);
    for (unsigned i = 0; i < code.size(); i++) f.m.write8(ROUTINE + i, code[i]);
    /* A module page: slot 0 a select of 9 values (KEY), slot 1 a 0..127 knob. */
    for (unsigned s = 0; s < 12; s++) f.m.write32(MODULE + P_COUNT + 4 * s, s == 0 ? 9 : 128);
    unsigned checks = 0;
    auto reference = [&](uint32_t slot, uint32_t count, uint32_t remainder, uint32_t value) {
        f.stage(slot, 32768 / (count > 40 ? count : 40), count, remainder);
        uint32_t v = f.call(STEPPER, 0, slot, 1, value);
        return f.state(slot, v);
    };
    /* A: the select's first detents after a 0..127 page's staging: as stock staged it, about 3.2 detents a value. */
    {
        auto want = reference(0, 9, 0, 0);
        f.stage(0, 256, 128, 200); /* stale: the previous page's step and its remainder */
        auto got = f.state(0, f.call(ROUTINE, MODULE, 0, 1, 0));
        assert(same(got, want)); ++checks;
        unsigned value = got.value, detents = 1;
        while (value == got.value && detents < 10) value = f.call(ROUTINE, MODULE, 0, 1, value), ++detents;
        assert(detents >= 3 && detents <= 4); ++checks;
    }
    /* B: a 0..127 knob after a select's step: one detent moves it one value (the remainder cleared with the new step),
     * not several or backwards. */
    {
        auto want = reference(1, 128, 0, 64);
        f.stage(1, 819, 9, 700);
        auto got = f.state(1, f.call(ROUTINE, MODULE, 1, 1, 64));
        assert(same(got, want)); ++checks;
    }
    /* C: staging already right: the turn's remainder is the stepper's own, kept. */
    {
        f.stage(0, 819, 9, 500);
        auto got = f.state(0, f.call(ROUTINE, MODULE, 0, 1, 3));
        f.stage(0, 819, 9, 500);
        auto want = f.state(0, f.call(STEPPER, 0, 0, 1, 3));
        assert(same(got, want)); ++checks;
    }
    /* D: a stock descriptor: straight on, its stale staging untouched (stock behaviour, whatever it is). */
    {
        f.stage(0, 256, 128, 200);
        auto got = f.state(0, f.call(ROUTINE, STOCKDESC, 0, 1, 0));
        f.stage(0, 256, 128, 200);
        auto want = f.state(0, f.call(STEPPER, 0, 0, 1, 0));
        assert(same(got, want)); ++checks;
    }
    std::printf("knob step: %u checks passed\n", checks);
    return 0;
}
