// SPDX-License-Identifier: MIT
// Original synthetic active-recorder fixtures. Private stock runs from its
// complete routine entry, with real callees. No boot, scheduler, ISR or device.
#include <array>
#include <cstdio>
#include <fstream>
#include <iterator>
#include <stdexcept>
#include <vector>
#include "machine.h"
#include "mc68k/Musashi/m68k.h"
#include "mc68k/cpuState.h"
extern "C" {
#include "../preview_guard.h"
}
namespace {
constexpr uint32_t stack = 0x47100000, stop = 0x47300000, scratch = 0x47200000;
constexpr uint32_t pool = 0x40a955e0, pageBytes = 6144, pageList = 0x46c2e9c0;
void require(bool ok, const char* msg) { if (!ok) throw std::runtime_error(msg); }
struct Probe {
    ot::Machine m;
    bs_preview_guard guard{};
    unsigned pcmWrites = 0, mapWrites = 0, bank = 0, width = 6, edge = 1024;
    unsigned stepCount = 0, firstPcm = 0, lastMap = 0, positionStore = 0;
    unsigned pcmMask = 0, mapMask = 0;
    unsigned dirtyStores = 0, counterStores = 0;
    explicit Probe(const std::vector<uint8_t>& image) : m(image) {
        bs_guard_init(&guard); require(bs_guard_enable(&guard), "synthetic enable failed");
        // Authored one-instruction MACSR initialization, as assembled by the
        // upstream EMAC gate (movel d0,macsr); this is not extracted stock code.
        m.write16(scratch, 0xa900); reg(M68K_REG_D0, 0x20);
        reg(M68K_REG_PC, scratch); require(m.step(), "MACSR setup failed");
    }
    uint32_t reg(m68k_register_t r) { return m68k_get_reg(m.getCpuState(), r); }
    void reg(m68k_register_t r, uint32_t v) { m68k_set_reg(m.getCpuState(), r, v); }
    uint32_t state(unsigned track) { return 0x80004f1c + 84*track + 672*bank; }
    uint32_t row(unsigned track, unsigned page) { return pageList + 2*((track+2)*14602+page); }
    void setup(unsigned track, unsigned format, unsigned selectedBank, bool lazy) {
        bank = selectedBank; width = format == 1 ? 6 : 4; edge = pageBytes/width;
        m.write32(0x46c82456, scratch+0x10000); m.write8(0x100b14cf, 0);
        m.write8(scratch+0x10000 + 0x8eda2 + track, 0); // ordinary recorder, not Pickup
        m.write32(0x800000e0, 0); m.write32(0x80004f18, bank << track);
        m.write32(0x8000184c, 0); m.write8(0x80000052, 1); m.write8(0x80000053, format == 1);
        m.write32(0x8000181c, 120); m.write32(0x80001820, 0xff000000);
        m.write32(0x46c922c4 + 44*(128+track), format);
        m.write32(0x46c922c4 + 44*(128+track)+20, 41);
        // Authored stereo layouts and reciprocal, not an extracted table.
        m.write32(0x80003c20 + 16*format, (1u << 31)/edge);
        m.write32(0x80003c24 + 16*format, edge); m.write32(0x80003c28 + 16*format, width);
        m.write8(state(track)+2, 2); m.write32(state(track)+24, edge-4);
        m.write32(state(track)+32, 3*edge);
        for (auto q : {0x460d17aeu, 0x460d17ceu}) {
            m.write32(q+16, 7); m.write32(q+20, scratch+(q == 0x460d17ae ? 0x1000 : 0x2000));
        }
        m.write16(row(track, 0), 3); m.write16(row(track, 1), lazy ? 0 : 7);
        m.write32(0x8000691c, 10); m.write32(0x80006920, 11);
        m.write16(pageList+20, 7); m.write16(pageList+2*(14602+10), 7);
        m.write16(0x46c75e88 + 2*(128+track), lazy ? 1 : 2);
        m.write32(0x461053a8 + 4*track, lazy ? 1 : 2);
        for (unsigned b = 0; b < 8*pageBytes; ++b) m.write8(pool+b, 0x5a);
        // Silence input buffers (the page-pool sentinel is separate).
        for (unsigned b = 0; b < pageBytes; ++b) m.write8(pool+b, 0);
        m.addWriteWatch(pool, pool+8*pageBytes-1, [&](uint32_t, uint8_t, uint32_t, uint32_t) {
            ++pcmWrites; bs_preview_token out{};
            if (!firstPcm) firstPcm = stepCount;
            pcmMask |= 1u << ((reg(M68K_REG_SR) >> 8) & 7);
            require(m.read32(0x460d17ce + 4) == 0, "engine queue unexpectedly occupied");
            require(!bs_guard_acquire(&guard, &out), "PCM write admitted preview");
        });
        m.addWriteWatch(pageList, pageList+2*14602*10-1, [&](uint32_t, uint8_t, uint32_t, uint32_t) {
            ++mapWrites; bs_preview_token out{};
            lastMap = stepCount; mapMask |= 1u << ((reg(M68K_REG_SR) >> 8) & 7);
            require(!bs_guard_acquire(&guard, &out), "map write admitted preview");
        });
        m.addWriteWatch(state(track)+24, state(track)+27, [&](uint32_t, uint8_t, uint32_t, uint32_t) {
            positionStore = stepCount;
            bs_preview_token out{};
            require(!bs_guard_acquire(&guard, &out), "position change admitted preview");
        });
        m.addWriteWatch(0x46c93c28, 0x46c93c28 + 135, [&](uint32_t, uint8_t, uint32_t, uint32_t) {
            ++dirtyStores;
        });
        const auto counter = 0x46c922c4 + 44*(128+track)+20;
        m.addWriteWatch(counter, counter+3, [&](uint32_t, uint8_t, uint32_t, uint32_t) {
            ++counterStores;
        });
    }
    uint32_t run(unsigned track, unsigned first, unsigned end) {
        bs_preview_token old{};
        require(bs_guard_acquire(&guard, &old), "pre-call admission failed");
        const auto ticket = bs_guard_writer_begin(&guard);
        require(ticket && !bs_guard_valid(&guard, &old), "writer did not retire preview");
        reg(M68K_REG_SR, 0x2000); reg(M68K_REG_SP, stack); m.write32(stack, stop);
        m.write32(stack+4, track); m.write32(stack+8, 0);
        m.write32(stack+12, first); m.write32(stack+16, end);
        constexpr std::array<m68k_register_t, 11> saved{M68K_REG_D2, M68K_REG_D3,
            M68K_REG_D4, M68K_REG_D5, M68K_REG_D6, M68K_REG_D7, M68K_REG_A2,
            M68K_REG_A3, M68K_REG_A4, M68K_REG_A5, M68K_REG_A6};
        for (unsigned n = 0; n < saved.size(); ++n) reg(saved[n], 0x12340000 + n);
        reg(M68K_REG_PC, 0x400068e4);
        stepCount = 0;
        while (m.pc() != stop && ++stepCount < 100000) {
            if (!m.step()) throw std::runtime_error("CPU stopped: " + m.why());
        }
        if (m.pc() != stop) std::fprintf(stderr, "budget pc=%08x pos=%u writes=%u\n", m.pc(), m.read32(state(track)+24), pcmWrites);
        require(m.pc() == stop && reg(M68K_REG_SP) == stack+4, "return/budget differs");
        require(reg(M68K_REG_SR) >> 8 == 0x20, "caller interrupt mask changed");
        for (unsigned n = 0; n < saved.size(); ++n)
            require(reg(saved[n]) == 0x12340000 + n, "callee-saved register differs");
        require(bs_guard_writer_end(&guard, ticket), "writer retirement failed");
        require(!bs_guard_valid(&guard, &old), "old token revived");
        bs_preview_token fresh{};
        require(bs_guard_acquire(&guard, &fresh), "post-return admission failed");
        return reg(M68K_REG_D0);
    }
};
void boundary(const std::vector<uint8_t>& image, bool lazy) {
    for (unsigned track : {0u, 7u}) for (unsigned format : {1u, 3u}) for (unsigned bank : {0u, 1u}) {
        Probe p(image); p.setup(track, format, bank, lazy);
        const auto result = p.run(track, 0, 8);
        require(result == p.edge+4 && p.m.read32(p.state(track)+24) == p.edge+4, "position differs");
        require(p.m.read32(0x46c802c8 + 4*track) == p.edge+4, "published position differs");
        require(p.pcmWrites == (format == 1 ? 16u : 8u), "PCM store count differs");
        for (unsigned page = 0; page < 8; ++page) for (unsigned b = 0; b < pageBytes; ++b) {
            const bool written = (page == 3 && b >= pageBytes-4*p.width) || (page == 7 && b < 4*p.width);
            require(p.m.read8(pool+page*pageBytes+b) == (written || page == 0 ? 0 : 0x5a), "PCM or untouched bytes differ");
        }
        require(p.m.read16(p.row(track, 1)) == 7, "recorder map differs");
        require(p.m.read32(0x80006920) == (lazy ? 10u : 11u), "free high cursor differs");
        require(p.m.read16(0x46c75e88 + 2*(128+track)) == 2, "page count differs");
        require(p.mapWrites == (lazy ? 3u : 0u), "map mutation count differs");
        require(p.m.read16(pageList+20) == (lazy ? 0u : 7u) &&
                p.m.read16(pageList+2*(14602+10)) == (lazy ? 0u : 7u), "free-list mirrors differ");
        require(p.m.read32(0x461053a8 + 4*track) == 2, "logical high extent differs");
        require(p.positionStore && p.positionStore < p.firstPcm && p.lastMap < p.firstPcm,
                "position/map preparation no longer precedes PCM");
        require(p.pcmMask == 1 && p.mapMask == (lazy ? 1u : 0u), "synthetic caller store masks differ");
        require(p.m.read8(0x46c93c28 + 128+track) == 0 &&
                p.m.read32(0x46c922c4 + 44*(128+track)+20) == 41 &&
                !p.dirtyStores && !p.counterStores, "dirty/counter changed");
        require(p.m.read32(0x460d17ae + 4) == 0 && p.m.read32(0x460d17ce + 4) == 0, "normal recording queued work");
    }
}
void refusal(const std::vector<uint8_t>& image) {
    for (unsigned mode = 0; mode < 4; ++mode) {
        Probe p(image); p.setup(0, 1, 0, true);
        if (mode == 0) p.m.write8(p.state(0)+2, 0);
        if (mode == 2) p.m.write32(0x80006920, 10);
        if (mode == 3) p.m.write8(0x80000052, 0);
        auto result = p.run(0, 0, mode == 1 ? 0 : 8);
        std::printf("TRACE refusal=%u result=%u position=%u published=%u state=%u ui=%u\n", mode, result,
                    p.m.read32(p.state(0)+24), p.m.read32(0x46c802c8), p.m.read8(p.state(0)+2), p.m.read32(0x460d17ae + 4));
        require(!p.pcmWrites && !p.mapWrites, "refusal changed PCM/map");
        require(!p.dirtyStores && !p.counterStores, "refusal changed dirty/counter");
        require(result == (mode == 0 ? 0xffffffffu : mode == 1 ? 1020u : 0u), "refusal result differs");
        require(p.m.read32(0x460d17ce + 4) == (mode < 2 ? 0u : 1u), "refusal engine post differs");
        require(p.m.read32(0x460d17ae + 4) == (mode < 2 ? 0u : 1u), "refusal UI post differs");
        if (mode >= 2) {
            require(p.m.read32(0x46c802c8) == 1024 && p.m.read32(p.state(0)+24) == 0 &&
                    p.m.read8(p.state(0)+2) == 0, "shortage stop state differs");
            require(p.m.read32(scratch+0x2000) == 0x46104d52 &&
                    p.m.read8(0x46104d52) == 34 && p.m.read32(0x46104d56) == 1,
                    "stop follow-up identity differs");
            require(p.m.read32(scratch+0x1000) == 0x400d64b5, "shortage UI identity differs");
        }
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
        boundary(image, false); std::puts("PASS: eight preallocated stereo boundary fixtures, 16/24-bit, tracks 1/8, both state banks");
        boundary(image, true); std::puts("PASS: eight dynamic stereo allocation fixtures; map/position precede PCM with no queue/dirty/counter signal");
        refusal(image); std::puts("PASS: inactive, empty call, exhausted pool and disabled dynamic allocation; balanced host guard");
    } catch (const std::exception& e) { std::fprintf(stderr, "FAIL: %s\n", e.what()); return 1; }
    return 0;
}
