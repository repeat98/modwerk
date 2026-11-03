// SPDX-License-Identifier: MIT
// Execute original compiled menu composition against private stock menu dispatch.
#include <cstdio>
#include <set>
#include <fstream>
#include <iterator>
#include <stdexcept>
#include <string>
#include <vector>
#include "machine.h"
#include "mc68k/Musashi/m68k.h"
#include "mc68k/cpuState.h"
int main(int argc, char** argv) {
    std::printf("SOURCE_SHA256: %s\n", PROBE_SOURCE_SHA);
    if (argc != 4) return 2;
    try {
        std::ifstream in(argv[2], std::ios::binary);
        std::vector<uint8_t> bytes{std::istreambuf_iterator<char>(in), {}};
        constexpr uint32_t base = 0x47040000, stack = 0x47100000, stop = 0x47200000;
        uint32_t entry = uint32_t(std::stoul(argv[3], nullptr, 0));
        if (bytes.empty() || bytes.size() > 0x10000 || entry < base || entry >= base + bytes.size())
            throw std::runtime_error("invalid synthetic code range");
        std::ifstream stock(argv[1], std::ios::binary);
        std::vector<uint8_t> image{std::istreambuf_iterator<char>(stock), {}};
        if (image.size() != 1112560) throw std::runtime_error("invalid private MAIN size");
        ot::Machine m(image);
        for (size_t i = 0; i < bytes.size(); ++i) m.write8(base + uint32_t(i), bytes[i]);
        auto set = [&](m68k_register_t r, uint32_t v) { m68k_set_reg(m.getCpuState(), r, v); };
        auto get = [&](m68k_register_t r) { return m68k_get_reg(m.getCpuState(), r); };
        set(M68K_REG_SR, 0x2700); set(M68K_REG_SP, stack); m.write32(stack, stop);
        for (unsigned r = M68K_REG_D2; r <= M68K_REG_A6; ++r)
            if (r != M68K_REG_A0 && r != M68K_REG_A1) set(m68k_register_t(r), 0x12340000 + r);
        set(M68K_REG_PC, entry);
        auto ret = [&](uint32_t value) {
            auto sp = get(M68K_REG_SP);
            set(M68K_REG_D0, value); set(M68K_REG_PC, m.read32(sp)); set(M68K_REG_SP, sp + 4);
        };
        auto arg = [&](unsigned n) { return m.read32(get(M68K_REG_SP) + 4 + n * 4); };
        std::set<uint32_t> stockCallbacks;
        const std::set<uint32_t> uiMocks = {0x4006dbc0, 0x4006e2cc, 0x4006dbdc,
            0x40012f30, 0x4007ec60, 0x4007edb0, 0x40056f4c, 0x40031494, 0x40055db4,
            0x4003146c, 0x4006d784};
        uint64_t steps = 0;
        unsigned captures = 0, opens = 0, selections = 0;
        struct Frame { uint32_t pc, sp, ret; std::vector<uint32_t> regs; };
        std::vector<Frame> frames;
        while (m.pc() != stop && ++steps < 2000000000ull) {
            auto pc = m.pc();
            if (!frames.empty() && pc == frames.back().ret && get(M68K_REG_SP) == frames.back().sp + 4) {
                const auto f = frames.back(); frames.pop_back();
                for (unsigned r = M68K_REG_D2; r <= M68K_REG_A6; ++r)
                    if (r != M68K_REG_A0 && r != M68K_REG_A1 && get(m68k_register_t(r)) != f.regs[r - M68K_REG_D2])
                        throw std::runtime_error("stock menu callee-saved register changed at " + std::to_string(f.pc));
            }
            if (pc == 0x40072c10 || pc == 0x4006d94c || pc == 0x4006d8f4) {
                Frame f{pc, get(M68K_REG_SP), m.read32(get(M68K_REG_SP)), {}};
                for (unsigned r = M68K_REG_D2; r <= M68K_REG_A6; ++r) f.regs.push_back(get(m68k_register_t(r)));
                frames.push_back(f);
            }
            if (pc == 0x4006d94c) {
                if (m.read32(0x47210000) == 0) {
                    ++captures;
                    for (unsigned i = 0; i < 5; ++i) m.write32(0x47210004 + 4 * i, arg(i));
                    stockCallbacks.clear();
                    for (unsigned i = 0; i < arg(0); ++i) stockCallbacks.insert(m.read32(arg(4) + i * 4));
                    ret(0); continue;
                }
                ++opens;
            }
            if (pc == 0x4006d8f4) ++selections;
            if (stockCallbacks.count(pc)) {
                m.write32(0x47210018, m.read32(0x47210018) + 1); ret(0); continue;
            }
            if (uiMocks.count(pc)) { ret(0); continue; }
            if (pc == 0x4006dae4) { ret(1); continue; }
            if (pc == 0x4005829c) { ret(0x47220000); continue; }
            if (!m.step()) throw std::runtime_error("CPU stop: " + m.why());
        }
        if (captures != 8 || opens != 8 || selections != 8)
            throw std::runtime_error("stock menu path count mismatch");
        if (m.pc() != stop) throw std::runtime_error("instruction budget exhausted");
        if (get(M68K_REG_SP) != stack + 4) throw std::runtime_error("stack mismatch");
        for (unsigned r = M68K_REG_D2; r <= M68K_REG_A6; ++r)
            if (r != M68K_REG_A0 && r != M68K_REG_A1 && get(m68k_register_t(r)) != 0x12340000 + r)
                throw std::runtime_error("preserved register mismatch " + std::to_string(r) + " result " + std::to_string(get(M68K_REG_D0)));
        if (get(M68K_REG_D0)) throw std::runtime_error("selftest source line " + std::to_string(get(M68K_REG_D0)));
        std::puts("PASS: eight compiled menu/stock dispatch cases, stable pointers, stale owner retirement and preserved registers");
        return 0;
    } catch (const std::exception& e) { std::printf("FAIL: %s\n", e.what()); return 1; }
}
