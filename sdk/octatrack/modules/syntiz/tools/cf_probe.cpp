// SPDX-License-Identifier: MIT
// SYNTIZ's render on an emulated ColdFire (upstream ot_emu's V4e core): runs a linked image's
// wave_render_track against a synthetic stock environment, read from stdin as commands, and prints what it
// wrote at the packer's cursor and how many instructions each call took. Counts, not cycles.
//   cf_probe IMAGE ORIGIN RENDER PROFILE_OUT < script
// script: "w8|w16|w32 ADDR VALUE" pokes; "call TRACK PING START END" renders and prints
//   "out N COUNT s0 s1 ...": COUNT instructions, the samples (high halves of the L longs).
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <iterator>
#include <map>
#include <string>
#include <vector>
#include "machine.h"
#include "mc68k/Musashi/m68k.h"
#include "mc68k/cpuState.h"

int main(int argc, char **argv)
{
    if (argc != 5) return 64;
    std::ifstream f(argv[1], std::ios::binary);
    std::vector<uint8_t> image{std::istreambuf_iterator<char>(f), {}};
    const uint32_t origin = std::strtoul(argv[2], 0, 0), render = std::strtoul(argv[3], 0, 0);
    ot::Machine m(std::vector<uint8_t>{});
    for (size_t i = 0; i < image.size(); ++i) m.write8(origin + uint32_t(i), image[i]);
    const uint32_t stack = 0x47f00000, stop = 0x47f80000, buffer = 0x80200000;
    std::map<uint32_t, uint64_t> profile;
    char cmd[16];
    unsigned a, b, c, d;
    while (std::scanf("%15s", cmd) == 1) {
        if (!std::strcmp(cmd, "w8") && std::scanf("%x %x", &a, &b) == 2) m.write8(a, uint8_t(b));
        else if (!std::strcmp(cmd, "w16") && std::scanf("%x %x", &a, &b) == 2) m.write16(a, uint16_t(b));
        else if (!std::strcmp(cmd, "w32") && std::scanf("%x %x", &a, &b) == 2) m.write32(a, b);
        else if (!std::strcmp(cmd, "reset")) profile.clear();
        else if (!std::strcmp(cmd, "call") && std::scanf("%u %u %u %u", &a, &b, &c, &d) == 4) {
            m.write32(0x80001c80, buffer);
            m68k_set_reg(m.getCpuState(), M68K_REG_SR, 0x2700);
            m68k_set_reg(m.getCpuState(), M68K_REG_SP, stack);
            m.write32(stack, stop), m.write32(stack + 4, a), m.write32(stack + 8, b), m.write32(stack + 12, c),
                m.write32(stack + 16, d);
            for (unsigned r = 2; r < 15; ++r)
                if (r != 8 && r != 9) m68k_set_reg(m.getCpuState(), m68k_register_t(M68K_REG_D0 + r), 0x5a5a0000 + r);
            m68k_set_reg(m.getCpuState(), M68K_REG_PC, render);
            unsigned n = 0;
            while (m.pc() != stop && n < 2000000) {
                ++profile[m.pc()], ++n;
                if (!m.step()) { std::fprintf(stderr, "stopped at %08x: %s\n", m.pc(), m.why().c_str()); return 1; }
            }
            if (m.pc() != stop || m68k_get_reg(m.getCpuState(), M68K_REG_SP) != stack + 4) return 2;
            for (unsigned r = 2; r < 15; ++r)
                if (r != 8 && r != 9 && m68k_get_reg(m.getCpuState(), m68k_register_t(M68K_REG_D0 + r)) != 0x5a5a0000 + r) {
                    std::fprintf(stderr, "register %u not saved\n", r);
                    return 3;
                }
            const uint32_t count = m.read32(buffer), end = m.read32(0x80001c80);
            if (end != buffer + 16 + 8 * count) return 4;
            std::printf("out %u %u", count, n);
            for (unsigned k = 0; k < count; ++k) {
                uint32_t l = m.read32(buffer + 16 + 8 * k), r = m.read32(buffer + 20 + 8 * k);
                if (l != r || (l & 0xffff)) return 5;
                std::printf(" %d", int16_t(l >> 16));
            }
            std::printf("\n");
        } else return 65;
    }
    FILE *p = std::fopen(argv[4], "w");
    for (auto &[pc, k] : profile) std::fprintf(p, "%x %llu\n", pc, (unsigned long long)k);
    std::fclose(p);
    return 0;
}
