// SPDX-License-Identifier: MIT
// Original sample-replacement refusal fixtures. Private stock is loaded only
// at runtime. Filesystem directory/open/close and header decoding are explicit
// synthetic mocks; release, string handling and allocation run as stock code.
#include <algorithm>
#include <array>
#include <cstdio>
#include <fstream>
#include <functional>
#include <iterator>
#include <map>
#include <stdexcept>
#include <string>
#include <vector>
#include "machine.h"
#include "mc68k/Musashi/m68k.h"
#include "mc68k/cpuState.h"
extern "C" {
#include "../preview_guard.h"
}
namespace {
constexpr uint32_t stack = 0x47100000, stop = 0x47300000, scratch = 0x47200000;
constexpr uint32_t pool = 0x40a955e0, pageBytes = 6144, controls = 0x46c922c4;
constexpr uint32_t pageList = 0x46c2e9c0, offsets = 0x46c2e580, counts = 0x46c75e88;
constexpr uint32_t loader = 0x40096548, release = 0x40096300;
void require(bool ok, const char* msg) { if (!ok) throw std::runtime_error(msg); }
struct Probe {
    ot::Machine m;
    std::map<uint32_t, std::function<uint32_t()>> mocks;
    bs_preview_guard guard{};
    unsigned pcmStores = 0, controlStores = 0, releases = 0;
    unsigned directoryCalls = 0, openCalls = 0, closeCalls = 0, headerCalls = 0;
    explicit Probe(const std::vector<uint8_t>& image) : m(image) {
        bs_guard_init(&guard); require(bs_guard_enable(&guard), "synthetic enable failed");
    }
    uint32_t reg(m68k_register_t r) { return m68k_get_reg(m.getCpuState(), r); }
    void reg(m68k_register_t r, uint32_t v) { m68k_set_reg(m.getCpuState(), r, v); }
    uint32_t arg(unsigned i) { return m.read32(reg(M68K_REG_SP)+4+4*i); }
    void closed() {
        bs_preview_token token{};
        require(!bs_guard_acquire(&guard, &token), "active replacement admitted preview");
    }
    std::vector<uint8_t> bytes(uint32_t at, unsigned n) {
        std::vector<uint8_t> result(n);
        for (unsigned i = 0; i < n; ++i) result[i] = m.read8(at+i);
        return result;
    }
    void string(uint32_t at, const std::string& text) {
        for (unsigned i = 0; i <= text.size(); ++i) m.write8(at+i, i == text.size() ? 0 : text[i]);
    }
    std::string string(uint32_t at) {
        std::string result;
        for (unsigned i = 0; i < 260 && m.read8(at+i); ++i) result += char(m.read8(at+i));
        return result;
    }
    void setup(unsigned slot, unsigned mode, uint32_t generation) {
        const auto control = controls+44*slot, other = slot == 0 ? 127u : 0u;
        const auto otherControl = controls+44*other;
        m.write32(0x46105408, 1);
        m.write32(control, 3); m.write32(control+16, 1540); m.write32(control+20, generation);
        m.write32(otherControl, 3); m.write32(otherControl+16, 10); m.write32(otherControl+20, 99);
        m.write32(0x80006914, pageList); m.write32(0x80006918, offsets);
        m.write32(0x8000691c, 3); m.write32(0x80006920, 3);
        m.write32(offsets+4*slot, 0); m.write16(counts+2*slot, 2);
        m.write32(offsets+4*other, 2); m.write16(counts+2*other, 1);
        m.write16(pageList, 3); m.write16(pageList+2, 7); m.write16(pageList+4, 2);
        for (unsigned page : {2u, 3u, 7u}) for (unsigned b = 0; b < pageBytes; ++b)
            m.write8(pool+page*pageBytes+b, page == 2 ? 0xa5 : 0x5a);
        string(0x100b14f0 + 1096*slot, mode == 1 ? "/AUDIO/original.txt" : "/AUDIO/original.wav");
        m.write32(0x46c8242e, scratch); m.write32(0x46c8242a, scratch+4);
        m.write32(0x46c82422, scratch+8);
        mocks[scratch] = [&, mode] {
            ++directoryCalls; closed(); require(string(arg(0)) == "/AUDIO", "directory path differs");
            return mode == 0 ? uint32_t(-9) : 0u;
        };
        mocks[scratch+4] = [&, mode] {
            ++openCalls; closed(); require(string(arg(0)) == "original.WAV", "file path differs");
            return mode == 2 ? uint32_t(-7) : 11u;
        };
        mocks[scratch+8] = [&] {
            ++closeCalls; closed(); require(arg(0) == 11, "closed wrong handle"); return 0u;
        };
        mocks[0x400210fc] = [&, mode] {
            ++headerCalls; closed(); require(arg(0) == 11, "header handle differs");
            if (mode == 3) return uint32_t(-29);
            const auto out = arg(1);
            // Authored decoded-header fields. This does NOT qualify WAV parsing.
            m.write8(out+4, 1); m.write8(out+5, 2); m.write8(out+6, mode == 4 ? 15 : 16);
            m.write32(out+10, 10000); m.write32(out+14, 44);
            return 1u;
        };
        m.addWriteWatch(pool, pool+8*pageBytes-1, [&](uint32_t, uint8_t, uint32_t, uint32_t) {
            ++pcmStores; closed();
        });
        m.addWriteWatch(controls, controls+136*44-1, [&](uint32_t, uint8_t, uint32_t, uint32_t) {
            ++controlStores; closed();
        });
        m.addWriteWatch(0x80006914, 0x80006923, [&](uint32_t, uint8_t, uint32_t, uint32_t) { closed(); });
    }
    uint32_t run(unsigned slot) {
        bs_preview_token old{}; require(bs_guard_acquire(&guard, &old), "capture failed");
        const auto outer = bs_guard_writer_begin(&guard);
        require(outer && !bs_guard_valid(&guard, &old), "replacement failed to retire preview");
        reg(M68K_REG_SR, 0x2000); reg(M68K_REG_SP, stack); m.write32(stack, stop);
        m.write32(stack+4, slot); m.write32(stack+8, 1);
        constexpr std::array<m68k_register_t, 11> saved{M68K_REG_D2, M68K_REG_D3, M68K_REG_D4,
            M68K_REG_D5, M68K_REG_D6, M68K_REG_D7, M68K_REG_A2, M68K_REG_A3,
            M68K_REG_A4, M68K_REG_A5, M68K_REG_A6};
        for (unsigned n = 0; n < saved.size(); ++n) reg(saved[n], 0x12340000+n);
        reg(M68K_REG_PC, loader);
        uint32_t inner = 0, afterRelease = 0;
        unsigned steps = 0;
        while (m.pc() != stop && ++steps < 2000000) {
            if (inner && m.pc() == afterRelease) {
                require(bs_guard_writer_end(&guard, inner), "nested release retirement failed");
                inner = 0; closed();
            }
            if (m.pc() == release) {
                require(!inner, "unexpected nested release"); ++releases;
                inner = bs_guard_writer_begin(&guard); afterRelease = m.read32(reg(M68K_REG_SP));
                require(inner != 0, "nested release begin failed");
            }
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
        if (m.pc() != stop) std::fprintf(stderr, "budget pc=%08x low=%u high=%u\n", m.pc(), m.read32(0x8000691c), m.read32(0x80006920));
        require(m.pc() == stop && reg(M68K_REG_SP) == stack+4 && !inner, "return/budget differs");
        require(reg(M68K_REG_SR) >> 8 == 0x20, "caller mask changed");
        for (unsigned n = 0; n < saved.size(); ++n)
            require(reg(saved[n]) == 0x12340000+n, "callee-saved register changed");
        require(bs_guard_writer_end(&guard, outer) && !bs_guard_valid(&guard, &old), "old token revived");
        bs_preview_token fresh{}; require(bs_guard_acquire(&guard, &fresh), "failure leaked writer ticket");
        return reg(M68K_REG_D0);
    }
};
void failedReplacement(const std::vector<uint8_t>& image) {
    const std::array<int, 6> errors{-9, -30, -7, -29, -43, -5};
    for (unsigned slot : {0u, 127u}) for (unsigned mode = 0; mode < errors.size(); ++mode) {
        Probe p(image); p.setup(slot, mode, 41);
        const auto other = slot == 0 ? 127u : 0u, control = controls+44*slot;
        const auto otherBefore = p.bytes(controls+44*other, 44), audioBefore = p.bytes(pool+2*pageBytes, pageBytes);
        const auto result = p.run(slot);
        std::printf("TRACE slot=%u failure=%u result=%d state=%u length=%u counter=%u closes=%u\n",
            slot, mode, int32_t(result), p.m.read32(control+8), p.m.read32(control+16), p.m.read32(control+20), p.closeCalls);
        require(result == uint32_t(errors[mode]), "replacement failure differs");
        require(p.releases == 1 && p.pcmStores > 0 && p.controlStores > 0, "old sample was not retired");
        require(p.m.read32(control+8) == 3 && p.m.read32(control+12) == result &&
                p.m.read32(control+20) == 43 && p.m.read16(counts+2*slot) == 0, "failed slot state differs");
        for (unsigned page : {3u, 7u}) {
            auto cleared = p.bytes(pool+page*pageBytes, pageBytes);
            require(std::all_of(cleared.begin(), cleared.end(), [](uint8_t b) { return b == 0; }), "old PCM survived refusal");
        }
        require(p.bytes(controls+44*other, 44) == otherBefore && p.bytes(pool+2*pageBytes, pageBytes) == audioBefore,
                "unrelated source changed");
        require(p.m.read32(offsets+4*other) == 0 && p.m.read16(pageList) == 2 && p.m.read32(0x8000691c) == 1,
                "surviving sample map differs");
        require(p.directoryCalls == 1 && p.openCalls == (mode < 2 ? 0u : 1u) &&
                p.headerCalls == (mode < 3 ? 0u : 1u) && p.closeCalls == (mode < 3 ? 0u : 1u), "IO cleanup differs");
    }
}
void invalidSource(const std::vector<uint8_t>& image) {
    for (unsigned mode = 0; mode < 2; ++mode) {
        Probe p(image); p.setup(0, 0, 41);
        if (!mode) p.m.write32(0x46105408, 0);
        const auto before = p.bytes(controls, 136*44);
        require(p.run(mode ? 136 : 0) == 0 && !p.releases && !p.pcmStores && !p.controlStores &&
                !p.directoryCalls && p.bytes(controls, 136*44) == before, "invalid source mutated state");
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
        failedReplacement(image); std::puts("PASS: twelve failed replacements retire old audio, preserve survivor PCM and balance nested guards");
        invalidSource(image); std::puts("PASS: unavailable pool and invalid slot refuse without mutation");
    } catch (const std::exception& e) { std::fprintf(stderr, "FAIL: %s\n", e.what()); return 1; }
    return 0;
}
