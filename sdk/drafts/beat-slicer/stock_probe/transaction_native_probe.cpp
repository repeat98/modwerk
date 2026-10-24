// SPDX-License-Identifier: MIT
// Execute original compiled Flex transaction tests against private stock page lookup.
#include <cstdio>
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
        uint64_t steps = 0;
        unsigned nullReads=0, pointers=0, selections=0, redraws=0;
        m.addReadWatch(0,3,[&](uint32_t,uint8_t,uint32_t,uint32_t){++nullReads;});
        while (m.pc() != stop && ++steps < 2000000000ull) {
            if(m.pc()==0x40070cbc)++pointers;
            if(m.pc()==0x400718f8)++selections;
            if(m.pc()==0x4006dbdc)++redraws;
            if (!m.step()) throw std::runtime_error("CPU stop: " + m.why());
        }
        if(nullReads || pointers!=300 || selections!=300 || redraws!=300)
            throw std::runtime_error("refresh/null-read count differs: "+std::to_string(pointers)+","+
                                     std::to_string(selections)+","+std::to_string(redraws)+","+std::to_string(nullReads));
        if (m.pc() != stop) throw std::runtime_error("instruction budget exhausted");
        if (get(M68K_REG_SP) != stack + 4) throw std::runtime_error("stack mismatch");
        for (unsigned r = M68K_REG_D2; r <= M68K_REG_A6; ++r)
            if (r != M68K_REG_A0 && r != M68K_REG_A1 && get(m68k_register_t(r)) != 0x12340000 + r)
                throw std::runtime_error("preserved register mismatch");
        if (get(M68K_REG_D0)) throw std::runtime_error("selftest source line " + std::to_string(get(M68K_REG_D0)));
        std::puts("PASS: 32 historical Apply/Undo chains, 64 commit/clear cycles, 12 rollback cases, 300 stock refresh sequences and no null reads");
        return 0;
    } catch (const std::exception& e) { std::printf("FAIL: %s\n", e.what()); return 1; }
}
