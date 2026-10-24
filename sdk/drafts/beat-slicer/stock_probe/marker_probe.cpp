// SPDX-License-Identifier: MIT
// Original candidate-preservation fixtures. Private stock runs only in synthetic
// memory; tempo/name/track-update callees are explicitly mocked. No real settings
// are written, no native Apply/Undo exists and no playback runs.
#include <array>
#include <cstdio>
#include <fstream>
#include <functional>
#include <iterator>
#include <map>
#include <stdexcept>
#include <vector>
#include "machine.h"
#include "mc68k/Musashi/m68k.h"
#include "mc68k/cpuState.h"
extern "C" {
#include "../marker_edit.h"
}
namespace {
constexpr uint32_t stack = 0x47100000, stop = 0x47300000, scratch = 0x47200000;
void require(bool ok, const char* msg) { if (!ok) throw std::runtime_error(msg); }
struct Probe {
    ot::Machine m;
    std::map<uint32_t, std::function<uint32_t()>> mocks;
    explicit Probe(const std::vector<uint8_t>& image) : m(image) {
        for (auto address : {0x40099090u, 0x40098fa8u, 0x40098ec0u, 0x40004f9cu,
                             0x40020554u, 0x40013f40u, 0x400204a8u, 0x400204ccu})
            mocks[address] = [] { return 0u; };
    }
    uint32_t reg(m68k_register_t r) { return m68k_get_reg(m.getCpuState(), r); }
    void reg(m68k_register_t r, uint32_t v) { m68k_set_reg(m.getCpuState(), r, v); }
    void run(uint32_t entry, std::initializer_list<uint32_t> args) {
        reg(M68K_REG_SR, 0x2000); reg(M68K_REG_SP, stack); m.write32(stack, stop);
        constexpr std::array<m68k_register_t, 11> saved{M68K_REG_D2, M68K_REG_D3, M68K_REG_D4,
            M68K_REG_D5, M68K_REG_D6, M68K_REG_D7, M68K_REG_A2, M68K_REG_A3,
            M68K_REG_A4, M68K_REG_A5, M68K_REG_A6};
        for (unsigned n = 0; n < saved.size(); ++n) reg(saved[n], 0x12340000+n);
        unsigned i = 0;
        for (auto a : args) m.write32(stack+4+4*i++, a);
        reg(M68K_REG_PC, entry); unsigned steps = 0;
        while (m.pc() != stop && ++steps < 200000) {
            auto found = mocks.find(m.pc());
            if (found == mocks.end()) {
                if (!m.step()) throw std::runtime_error("CPU stopped: " + m.why());
            } else {
                auto result = found->second(), sp = reg(M68K_REG_SP);
                reg(M68K_REG_D0, result); reg(M68K_REG_D1, 0x13579bdf);
                reg(M68K_REG_A0, 0x13579bdf); reg(M68K_REG_A1, 0x13579bdf);
                reg(M68K_REG_PC, m.read32(sp)); reg(M68K_REG_SP, sp+4);
            }
        }
        require(m.pc() == stop && reg(M68K_REG_SP) == stack+4, "return/budget differs");
        require(reg(M68K_REG_SR) >> 8 == 0x20, "caller mask changed");
        for (unsigned n = 0; n < saved.size(); ++n)
            require(reg(saved[n]) == 0x12340000+n, "callee-saved register changed");
    }
    void table(uint32_t base, const bs_marker_table& t) {
        m.write32(base+1092, t.count);
        for (unsigned i = 0; i < BS_MAX_SLICES; ++i) {
            m.write32(base+312+12*i, t.records[i].start);
            m.write32(base+316+12*i, t.records[i].end);
            m.write32(base+320+12*i, t.records[i].loop);
        }
    }
    void matches(uint32_t base, const bs_marker_table& t) {
        require(m.read32(base+1092) == t.count, "marker count changed");
        for (unsigned i = 0; i < BS_MAX_SLICES; ++i)
            require(m.read32(base+312+12*i) == t.records[i].start &&
                    m.read32(base+316+12*i) == t.records[i].end &&
                    m.read32(base+320+12*i) == t.records[i].loop, "complete active/inactive marker changed");
    }
};
void candidates(const std::vector<uint8_t>& image) {
    for (unsigned kind : {0u, 1u}) for (unsigned slot : {0u, 127u})
    for (unsigned n : {4u, 64u}) for (unsigned keep : {0u, n/2, n}) {
        Probe p(image); bs_marker_table before{}; bs_plan plan{}; bs_marker_edit edit{};
        before.count = keep; plan.count = n;
        for (unsigned i = 0; i < BS_MAX_SLICES; ++i) {
            plan.starts[i] = 128*i;
            before.records[i].start = i < keep ? 128*i : 0xf0000000u+i;
            before.records[i].end = i < keep ? 128*i+64 : 0xe0000000u+i;
            before.records[i].loop = i < keep ? 128*i : 0xd0000000u+i;
        }
        require(bs_marker_prepare(&before, &plan, n*128, 0, n*128, &edit) == BS_MARKERS_OK,
                "authored candidate refused");
        const uint32_t settings = kind ? 0x100b14f0 : 0x100d5b30;
        const uint32_t base = settings+1096*slot, other = settings+1096*(slot ? 0 : 127);
        const uint32_t control = (kind ? 0x46c922c4 : 0x46c90a78)+44*slot;
        p.m.write32(0x46105408, 1); p.m.write32(control+8, 0);
        p.m.write32(control+16, n*128); p.m.write32(control+20, scratch);
        p.m.write32(base+300, 0); p.m.write32(base+304, n*128); p.m.write32(base+308, 0);
        p.table(base, edit.after); p.table(other, before);
        p.run(0x40070c28, {base+312, n});
        p.matches(base, edit.after);
        p.run(0x40099374, {kind, slot, 0});
        p.matches(base, edit.after); p.matches(other, before);
        require(p.m.read32(base+300) == 0 && p.m.read32(base+304) == n*128 && p.m.read32(base+308) == 0,
                "trim/loop changed");
        // Model restoration into synthetic memory only. This is not stock Undo.
        p.table(base, edit.before); p.matches(base, before);
    }
}
}
int main(int argc, char** argv) {
    std::printf("SOURCE_SHA256: %s\n", PROBE_SOURCE_SHA);
    if (argc != 2) return 2;
    std::ifstream in(argv[1], std::ios::binary);
    std::vector<uint8_t> image{std::istreambuf_iterator<char>(in), {}};
    if (image.size() != 1112560) return 2;
    try {
        candidates(image);
        std::puts("PASS: 24 complete candidates preserve active/inactive records through stock sort and sanitation, Flex/Static slots 0/127");
    } catch (const std::exception& e) { std::fprintf(stderr, "FAIL: %s\n", e.what()); return 1; }
    return 0;
}
