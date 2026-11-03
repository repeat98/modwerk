// SPDX-License-Identifier: MIT
// Execute original planner code in synthetic CPU memory. No stock OS is used.
#include <algorithm>
#include <array>
#include <cstdio>
#include <fstream>
#include <iterator>
#include <set>
#include <stdexcept>
#include <string>
#include <vector>
#include "machine.h"
#include "mc68k/Musashi/m68k.h"
#include "mc68k/cpuState.h"

namespace {
// These are synthetic test locations, not placement for a device module.
constexpr uint32_t codeBase = 0x47040000, stack = 0x47100000;
constexpr uint32_t request = 0x47200000, output = request + 0x100;
constexpr uint32_t existing = request + 0x400, callback = request + 0x800;
constexpr uint32_t sentinel = request + 0x1000, planBytes = 524;
void require(bool c, const char* message) { if (!c) throw std::runtime_error(message); }
struct Runner {
    ot::Machine m{std::vector<uint8_t>(4)};
    uint32_t entry;
    unsigned calls = 0, cases = 0;
    explicit Runner(const std::vector<uint8_t>& binary, uint32_t start) : entry(start) {
        require(binary.size() < 0x10000 && entry >= codeBase && entry < codeBase + binary.size(), "invalid synthetic code range");
        for (size_t i = 0; i < binary.size(); ++i) m.write8(codeBase + uint32_t(i), binary[i]);
    }
    uint32_t reg(m68k_register_t r) { return m68k_get_reg(m.getCpuState(), r); }
    void reg(m68k_register_t r, uint32_t v) { m68k_set_reg(m.getCpuState(), r, v); }
    void one(uint32_t rate, uint32_t bpm, uint32_t source, uint32_t beats, uint32_t snap,
             uint32_t expectedStatus = 0, int32_t amplitude = 0, bool readFailure = false,
             uint32_t seconds = 4) {
        constexpr uint32_t begin = 37;
        const uint32_t end = begin + rate * seconds;
        const std::array<uint32_t, 12> req = {rate, begin, end,
            source ? 7200u : bpm, source ? bpm : 7200u, beats, source,
            2, existing, snap, callback, 0x13579bdf};
        for (unsigned i = 0; i < req.size(); ++i) m.write32(request + 4 * i, req[i]);
        m.write32(existing, begin); m.write32(existing + 4, begin + 1000);
        for (unsigned i = 0; i < planBytes + 8; ++i) m.write8(output - 4 + i, 0xa5);
        reg(M68K_REG_SR, 0x2700); reg(M68K_REG_SP, stack);
        m.write32(stack, sentinel); m.write32(stack + 4, request); m.write32(stack + 8, output);
        std::vector<std::pair<m68k_register_t, uint32_t>> saved;
        for (unsigned i = M68K_REG_D2; i <= M68K_REG_A6; ++i) {
            if (i == M68K_REG_A0 || i == M68K_REG_A1) continue;
            const auto r = m68k_register_t(i); const uint32_t value = 0x12340000 + i;
            reg(r, value); saved.emplace_back(r, value);
        }
        reg(M68K_REG_PC, entry);
        unsigned steps = 0; calls = 0;
        while (m.pc() != sentinel && steps++ < 5000000) {
            if (m.pc() == callback) {
                const auto sp = reg(M68K_REG_SP), frame = m.read32(sp + 8), dst = m.read32(sp + 12);
                require(m.read32(sp + 4) == 0x13579bdf, "native callback context mismatch");
                require(frame >= begin && frame < end, "native PCM read outside trim");
                ++calls;
                m.write32(dst, uint32_t(amplitude)); m.write32(dst + 4, uint32_t(-amplitude));
                // A conforming external reader may overwrite every caller-saved
                // register. Do not let a polite mock hide an ABI violation.
                reg(M68K_REG_D1, 0x76543210);
                reg(M68K_REG_A0, 0x11223344); reg(M68K_REG_A1, 0x55667788);
                reg(M68K_REG_D0, readFailure ? 1 : 0);
                reg(M68K_REG_PC, m.read32(sp)); reg(M68K_REG_SP, sp + 4);
            } else if (!m.step()) throw std::runtime_error("native planner CPU stop: " + m.why());
        }
        require(m.pc() == sentinel, "native planner instruction budget exhausted");
        require(reg(M68K_REG_SP) == stack + 4, "native planner stack mismatch");
        for (auto [r, value] : saved) require(reg(r) == value, "native planner clobbered a preserved register");
        require(reg(M68K_REG_D0) == expectedStatus, "native status mismatch");
        for (unsigned i = 0; i < req.size(); ++i)
            require(m.read32(request + 4 * i) == req[i], "native request was modified");
        require(m.read32(existing) == begin && m.read32(existing + 4) == begin + 1000,
                "native existing starts were modified");
        require(m.read32(output - 4) == 0xa5a5a5a5 && m.read32(output + planBytes) == 0xa5a5a5a5,
                "native output overrun");
        if (expectedStatus) {
            for (unsigned i = 0; i < planBytes; ++i)
                require(m.read8(output + i) == 0xa5, "native error partially published a plan");
        } else {
            // Independent rational oracle: host uint64 arithmetic, not the
            // target's quotient/remainder implementation. Silence ties stay exact.
            std::set<uint32_t> want{begin, begin + 1000};
            for (uint64_t n = 0;; ++n) {
                const auto f = begin + (n * rate * 1440 * beats + bpm / 2) / bpm;
                if (f >= end) break;
                want.insert(uint32_t(f));
            }
            require(m.read32(output) == want.size() && m.read32(output + 4) == bpm, "native grid count/tempo mismatch");
            unsigned i = 0;
            for (auto f : want) {
                require(m.read32(output + 8 + 4 * i) == f, "native grid start mismatch");
                require(m.read32(output + 264 + 4 * i++) == uint32_t(amplitude > 8388), "native boundary flag mismatch");
            }
            for (; i < 64; ++i)
                require(m.read32(output + 8 + 4 * i) == 0 && m.read32(output + 264 + 4 * i) == 0,
                        "native unused fields not cleared");
            require(m.read32(output + 520) == uint32_t(amplitude > 8388), "native final boundary flag mismatch");
        }
        ++cases;
    }
};
} // namespace

int main(int argc, char** argv) {
    std::printf("SOURCE_SHA256: %s\n", PROBE_SOURCE_SHA);
    if (argc != 3) { std::fprintf(stderr, "usage: planner_probe synthetic-code.bin entry\n"); return 2; }
    try {
        std::ifstream in(argv[1], std::ios::binary);
        std::vector<uint8_t> binary{std::istreambuf_iterator<char>(in), {}};
        Runner r(binary, uint32_t(std::stoul(argv[2], nullptr, 0)));
        for (auto rate : {44100u, 192000u}) for (auto bpm : {720u, 2880u, 3033u, 7200u})
            for (auto source : {0u, 1u}) for (auto beats : {1u, 4u, 16u, 32u, 64u})
                for (auto snap : {0u, 1u}) r.one(rate, bpm, source, beats, snap);
        r.one(44100, 2880, 0, 1, 0, 0, 10000); // Stereo signs, unsafe boundaries.
        r.one(44100, 2880, 0, 1, 1, 3, 0, true); // PCM failure is atomic.
        r.one(44100, 0, 0, 1, 0, 1); // Invalid selected BPM cannot fall back.
        r.one(44100, 7200, 0, 1, 0, 2, 0, false, 20); // Capacity refusal is atomic.
        std::printf("PASS: %u native planner vectors, callback ABI, preserved registers and atomic errors\n", r.cases);
        return 0;
    } catch (const std::exception& e) { std::printf("FAIL: %s\n", e.what()); return 1; }
}
