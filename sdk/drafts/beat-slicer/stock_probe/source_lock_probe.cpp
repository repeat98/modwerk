// SPDX-License-Identifier: MIT
// Count the composed Flex backend critical sections with real stock lookup.
// Synthetic ownership/regions; instruction counts are not physical timing.
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
        constexpr uint32_t base=0x47040000, stack=0x47100000, stop=0x47200000;
        if (bytes.empty() || bytes.size()>0x10000) throw std::runtime_error("invalid code extent");
        std::ifstream stock(argv[3], std::ios::binary);
        std::vector<uint8_t> image{std::istreambuf_iterator<char>(stock), {}};
        if (image.size()!=1112560) throw std::runtime_error("invalid private MAIN extent");
        ot::Machine m(image);
        for (unsigned i=0; i<bytes.size(); ++i) m.write8(base+i, bytes[i]);
        auto get = [&](m68k_register_t r) { return m68k_get_reg(m.getCpuState(), r); };
        auto set = [&](m68k_register_t r, uint32_t v) { m68k_set_reg(m.getCpuState(), r, v); };
        set(M68K_REG_SR, 0x2700); set(M68K_REG_SP, stack); m.write32(stack, stop);
        for (unsigned r=M68K_REG_D2; r<=M68K_REG_A6; ++r)
            if (r!=M68K_REG_A0 && r!=M68K_REG_A1) set(m68k_register_t(r),0x12340000+r);
        set(M68K_REG_PC, symbols.at("bs_source_selftest"));
        bool held=false;
        uint32_t lockReturn=0;
        uint64_t steps=0, longest=0, current=0, sections=0, plannerLocked=0, plannerUnlocked=0;
        uint64_t captures=0, copies=0, queries=0, decoded=0;
        while (m.pc()!=stop && ++steps<2000000000ull) {
            const auto pc=m.pc();
            if (pc==symbols.at("source_lock")) {
                if (held || lockReturn) throw std::runtime_error("recursive lock");
                lockReturn=m.read32(get(M68K_REG_SP));
            } else if (lockReturn && pc==lockReturn) {
                held=get(M68K_REG_D0)==1; lockReturn=0; current=0;
                if (held) ++sections;
            }
            if (pc==symbols.at("source_unlock")) {
                if (!held) throw std::runtime_error("unlock without lock");
                longest=std::max(longest,current); held=false;
            }
            if (pc==symbols.at("bs_reader_begin") || pc==symbols.at("bs_reader_step") || pc==symbols.at("bs_reader_supply")) {
                if (held) ++plannerLocked; else ++plannerUnlocked;
            }
            if (pc==symbols.at("bs_flex_snapshot_locked") || pc==symbols.at("bs_flex_copy_locked") || pc==symbols.at("bs_flex_stock_query")) {
                if (!held) throw std::runtime_error("source access outside ownership");
                if (pc==symbols.at("bs_flex_snapshot_locked")) ++captures;
                if (pc==symbols.at("bs_flex_copy_locked")) ++copies;
                if (pc==symbols.at("bs_flex_stock_query")) ++queries;
            }
            if (pc==symbols.at("bs_pcm_decode")) {
                if (held) throw std::runtime_error("PCM decode inside source ownership");
                ++decoded;
            }
            if (held) ++current;
            if (!m.step()) throw std::runtime_error("CPU stop: "+m.why());
        }
        if (m.pc()!=stop || get(M68K_REG_SP)!=stack+4 || held || lockReturn)
            throw std::runtime_error("CPU budget/stack/lock balance differs");
        for (unsigned r=M68K_REG_D2; r<=M68K_REG_A6; ++r)
            if (r!=M68K_REG_A0 && r!=M68K_REG_A1 && get(m68k_register_t(r))!=0x12340000+r)
                throw std::runtime_error("preserved register differs");
        if (get(M68K_REG_D0)) throw std::runtime_error("selftest source line "+std::to_string(get(M68K_REG_D0)));
        if (!sections || plannerLocked || !plannerUnlocked || !captures || !copies || !queries || !decoded)
            throw std::runtime_error("planner lock ownership differs from expectation");
        std::printf("PASS: %llu sections; longest %llu executed instructions; planner calls locked %llu, unlocked %llu; not cycles or hardware time\n",
                    (unsigned long long)sections,(unsigned long long)longest,
                    (unsigned long long)plannerLocked,(unsigned long long)plannerUnlocked);
        std::printf("PASS: %llu metadata captures, %llu copies and %llu real stock page queries all locked; %llu PCM decodes all unlocked\n",
                    (unsigned long long)captures, (unsigned long long)copies,
                    (unsigned long long)queries, (unsigned long long)decoded);
        return 0;
    } catch (const std::exception& e) { std::printf("FAIL: %s\n",e.what()); return 1; }
}
