// SPDX-License-Identifier: MIT
// Count instructions under the synthetic session backend lock. No stock image,
// real cache, scheduler or hardware timing is modeled by these counts.
#include <cstdio>
#include <fstream>
#include <iterator>
#include <map>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>
#include "machine.h"
#include "mc68k/Musashi/m68k.h"
#include "mc68k/cpuState.h"
int main(int argc, char **argv) {
    std::printf("SOURCE_SHA256: %s\n", PROBE_SOURCE_SHA);
    if (argc != 4) return 2;
    try {
        std::ifstream in(argv[1], std::ios::binary), names(argv[2]);
        std::vector<uint8_t> bytes{std::istreambuf_iterator<char>(in), {}};
        std::map<std::string, uint32_t> symbols;
        std::string line, address, kind, name;
        while (std::getline(names, line)) {
            std::istringstream row(line);
            if (row >> address >> kind >> name) symbols[name] = uint32_t(std::stoul(address, nullptr, 16));
        }
        const bool split = std::string(argv[3]) == "split";
        if (!split && std::string(argv[3]) != "baseline") throw std::runtime_error("invalid expectation");
        constexpr uint32_t base=0x47040000, stack=0x47100000, stop=0x47200000;
        if (bytes.empty() || bytes.size()>0x10000) throw std::runtime_error("invalid code extent");
        ot::Machine m(std::vector<uint8_t>(0x1000));
        for (unsigned i=0; i<bytes.size(); ++i) m.write8(base+i, bytes[i]);
        auto get = [&](m68k_register_t r) { return m68k_get_reg(m.getCpuState(), r); };
        auto set = [&](m68k_register_t r, uint32_t v) { m68k_set_reg(m.getCpuState(), r, v); };
        set(M68K_REG_SR, 0x2700); set(M68K_REG_SP, stack); m.write32(stack, stop);
        set(M68K_REG_PC, symbols.at("bs_session_selftest"));
        bool held=false;
        uint32_t lockReturn=0;
        uint64_t steps=0, longest=0, current=0, sections=0, plannerLocked=0, plannerUnlocked=0;
        while (m.pc()!=stop && ++steps<2000000000ull) {
            const auto pc=m.pc();
            if (pc==symbols.at("lock")) {
                if (held || lockReturn) throw std::runtime_error("recursive lock");
                lockReturn=m.read32(get(M68K_REG_SP));
            } else if (lockReturn && pc==lockReturn) {
                held=get(M68K_REG_D0)==1; lockReturn=0; current=0;
                if (held) ++sections;
            }
            if (pc==symbols.at("unlock")) {
                if (!held) throw std::runtime_error("unlock without lock");
                longest=std::max(longest,current); held=false;
            }
            if (pc==symbols.at("bs_reader_begin") || pc==symbols.at("bs_reader_step") || pc==symbols.at("bs_reader_supply")) {
                if (held) ++plannerLocked; else ++plannerUnlocked;
            }
            if (held) ++current;
            if (!m.step()) throw std::runtime_error("CPU stop: "+m.why());
        }
        if (m.pc()!=stop || get(M68K_REG_SP)!=stack+4 || held || lockReturn)
            throw std::runtime_error("CPU budget/stack/lock balance differs");
        if (get(M68K_REG_D0)) throw std::runtime_error("selftest source line "+std::to_string(get(M68K_REG_D0)));
        if (!sections || (split ? plannerLocked || !plannerUnlocked : !plannerLocked))
            throw std::runtime_error("planner lock ownership differs from expectation");
        std::printf("PASS: %llu sections; longest %llu executed instructions; planner calls locked %llu, unlocked %llu; not cycles or hardware time\n",
                    (unsigned long long)sections,(unsigned long long)longest,
                    (unsigned long long)plannerLocked,(unsigned long long)plannerUnlocked);
        return 0;
    } catch (const std::exception& e) { std::printf("FAIL: %s\n",e.what()); return 1; }
}
