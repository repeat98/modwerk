// SPDX-License-Identifier: MIT
// Original synthetic-memory probes of a private, hash-bound stock OS.
// No real file IO, project, card or device is passed to a stock routine.
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
namespace {
constexpr uint32_t stack = 0x47100000, stop = 0x47300000, scratch = 0x47200000;
constexpr uint32_t flex = 0x100b14f0, stride = 0x448, slots = 264;
constexpr uint32_t writer = 0x40089d84, parser = 0x40085ca4, sanitizer = 0x40099374;
using Record = std::array<uint32_t, 3>;
void require(bool c, const char* message) { if (!c) throw std::runtime_error(message); }
struct Probe {
    ot::Machine m;
    std::map<uint32_t, std::function<uint32_t()>> mocks;
    explicit Probe(const std::vector<uint8_t>& image) : m(image) {}
    uint32_t reg(m68k_register_t r) { return m68k_get_reg(m.getCpuState(), r); }
    void reg(m68k_register_t r, uint32_t v) { m68k_set_reg(m.getCpuState(), r, v); }
    uint32_t arg(unsigned i) { return m.read32(reg(M68K_REG_SP) + 4 + 4 * i); }
    uint32_t run(uint32_t entry, std::initializer_list<uint32_t> args) {
        reg(M68K_REG_SR, 0x2700); reg(M68K_REG_SP, stack); m.write32(stack, stop);
        unsigned i = 0;
        for (auto a : args) m.write32(stack + 4 + 4 * i++, a);
        reg(M68K_REG_PC, entry);
        unsigned steps = 0;
        while (m.pc() != stop && ++steps < 20000000) {
            auto found = mocks.find(m.pc());
            if (found == mocks.end()) {
                if (!m.step()) throw std::runtime_error("CPU stop: " + m.why());
            } else {
                auto value = found->second(), sp = reg(M68K_REG_SP);
                reg(M68K_REG_D0, value); reg(M68K_REG_D1, 0x13579bdf);
                reg(M68K_REG_A0, 0x13579bdf); reg(M68K_REG_A1, 0x13579bdf);
                reg(M68K_REG_PC, m.read32(sp)); reg(M68K_REG_SP, sp + 4);
            }
        }
        require(m.pc() == stop && reg(M68K_REG_SP) == stack + 4, "return/budget mismatch");
        return reg(M68K_REG_D0);
    }
    void record(uint32_t at, Record value) {
        for (unsigned i = 0; i < 3; ++i) m.write32(at + i * 4, value[i]);
    }
    Record record(uint32_t at) { return {m.read32(at), m.read32(at+4), m.read32(at+8)}; }
    void seedSlots() {
        for (unsigned s = 0; s < slots; ++s) {
            uint32_t base = flex + stride * s;
            for (unsigned b = 0; b < stride; ++b) m.write8(base + b, 0xa5);
            record(base + 300, {0, 100000, 0});
            for (unsigned i = 0; i < 64; ++i)
                record(base + 312 + 12 * i, {100 + 1000 * i + s, 900 + 1000 * i + s,
                                                   i % 2 ? 0xffffffffu : 200 + 1000 * i + s});
            m.write32(base + 1092, 2);
        }
    }
    std::vector<uint8_t> snapshot() {
        std::vector<uint8_t> bytes(stride * slots);
        for (unsigned i = 0; i < bytes.size(); ++i) bytes[i] = m.read8(flex + i);
        return bytes;
    }
    std::vector<uint8_t> write(bool single = false, uint32_t kind = 1) {
        std::vector<uint8_t> bytes;
        mocks[0x400166b8] = [&] {
            require(arg(0) == scratch, "writer handle differs");
            auto src = arg(1), n = arg(2);
            require(n == 1 || n == 2 || n == 4 || n == 12, "unexpected writer chunk");
            for (unsigned i = 0; i < n; ++i) bytes.push_back(m.read8(src + i));
            return n;
        };
        require((single ? run(0x40089940, {scratch, kind, 0}) : run(writer, {scratch})) == 1, "writer failed");
        mocks.erase(0x400166b8);
        return bytes; // only synthetic slot bytes and a private stock header; never saved
    }
    uint32_t read(const std::vector<uint8_t>& bytes, bool single = false, uint32_t kind = 1) {
        size_t cursor = 0;
        m.write32(0x46c8241e, scratch + 0x100);
        mocks[scratch + 0x100] = [&] { return uint32_t(bytes.size()); };
        mocks[0x40016564] = [&] {
            require(arg(0) == scratch, "reader handle differs");
            auto dst = arg(1), n = arg(2);
            if (cursor + n > bytes.size()) return 0u;
            for (unsigned i = 0; i < n; ++i) m.write8(dst + i, bytes[cursor++]);
            return n;
        };
        auto result = single ? run(0x4008b8d0, {scratch, kind, 0}) : run(parser, {scratch, 0, 0});
        mocks.erase(scratch + 0x100); mocks.erase(0x40016564);
        return result;
    }
};

void roundTrip(const std::vector<uint8_t>& image) {
    Probe p(image); p.seedSlots();
    const auto before = p.snapshot(), bytes = p.write();
    require(p.snapshot() == before, "writer mutated settings");
    require(bytes.size() == 22 + slots * 784 + 2, "serialized extent differs");
    uint32_t sum = 0;
    for (unsigned i = 20; i < bytes.size() - 2; ++i) sum += bytes[i];
    require((sum & 65535) == uint32_t(bytes[bytes.size()-2] * 256 + bytes.back()), "checksum coverage differs");
    for (unsigned s = 0; s < slots; ++s) {
        auto at = 22 + s * 784;
        for (unsigned b = 0; b < 784; ++b) {
            const auto offset = b < 780 ? 300 + b : 1092 + b - 780;
            require(bytes[at+b] == before[s*stride+offset], "serialized record mapping differs");
            p.m.write8(flex+s*stride+offset, 0x5a);
        }
    }
    require(p.read(bytes) == 1, "parser rejected stock-writer output");
    require(p.snapshot() == before, "valid complete records did not round-trip");
}
void parserFailures(const std::vector<uint8_t>& image) {
    Probe p(image); p.seedSlots(); const auto bytes = p.write();
    for (unsigned kind = 0; kind < 3; ++kind) {
        auto broken = bytes;
        p.record(flex + 312, {777, 888, 0xffffffff});
        auto before = p.snapshot();
        if (kind == 0) broken[0] ^= 1; // Header rejection precedes slot writes.
        if (kind == 1) broken.back() ^= 1; // Checksum is checked after slot writes.
        if (kind == 2) broken.resize(22 + 784); // Truncated after first slot.
        auto result = p.read(broken);
        require(result == uint32_t(kind == 0 ? -51 : kind == 1 ? -54 : -29), "parser failure code differs");
        if (kind == 0) require(p.snapshot() == before, "bad header mutated settings");
        else require(p.record(flex + 312) == Record{100, 900, 200},
                     "expected pre-error in-memory publication was not observed");
    }
}
void protection(const std::vector<uint8_t>& image) {
    Probe p(image); p.seedSlots(); auto before = p.snapshot();
    unsigned writes = 0;
    p.mocks[0x400166b8] = [&] { ++writes; return 0u; };
    p.m.write32(0x100f847c, 1);
    require(p.run(writer, {scratch}) == uint32_t(-53) && writes == 0, "write protection ignored");
    require(p.snapshot() == before, "protected write mutated settings");
}
void sampleSettings(const std::vector<uint8_t>& image) {
    for (auto kind : {0u, 1u}) {
        Probe p(image); p.seedSlots();
        const uint32_t base = kind ? flex : flex + 136 * stride;
        const auto before = p.snapshot(), bytes = p.write(true, kind);
        require(p.snapshot() == before, "sample settings writer changed its input");
        require(bytes.size() == 832, "sample settings serialized extent differs");
        for (unsigned i = 300; i < 1080; ++i) p.m.write8(base+i, 0x5a);
        p.m.write32(base+1092, 0x5a5a5a5a);
        p.mocks[0x40004f9c] = [] { return 0u; }; // Track refresh, no audio or active voice.
        require(p.read(bytes, true, kind) == 1, "sample settings parser failed");
        auto after = p.snapshot();
        for (unsigned i = 300; i < stride; ++i)
            require(after[base-flex+i] == before[base-flex+i], "sample settings marker record changed");
        for (unsigned s = 0; s < slots; ++s) if (flex+s*stride != base)
            for (unsigned i = 0; i < stride; ++i)
                require(before[s*stride+i] == after[s*stride+i], "sample settings touched another slot");
        auto broken = bytes; broken.back() ^= 1;
        p.record(base+312, {777, 888, 0xffffffff});
        require(p.read(broken, true, kind) == uint32_t(-54), "sample checksum error differs");
        require(p.record(base+312) == Record{100 + (kind ? 0u : 136u), 900 + (kind ? 0u : 136u),
                                            200 + (kind ? 0u : 136u)},
                "sample parser pre-checksum publication differs");
    }
}
void sanitize(const std::vector<uint8_t>& image) {
    for (auto kind : {0u, 1u}) for (auto length : {32u, 64u, 1000u}) {
        Probe p(image); p.seedSlots();
        const uint32_t base = kind ? flex : flex + 136 * stride;
        const uint32_t status = kind ? 0x46c922c4 : 0x46c90a78;
        p.m.write32(0x46105408, 1);
        p.m.write32(status + 8, 0); p.m.write32(status + 16, length);
        p.m.write32(status + 20, scratch);
        p.record(base + 300, {0, length, 0});
        p.record(base + 312, {100, 110, 109});
        p.record(base + 324, {950, 990, 0xffffffff});
        p.m.write32(base + 1092, 2);
        auto before = p.snapshot();
        // Mock tempo/bar calculation, name/string handling and track update;
        // the actual stock trim/slice clamp loop executes. No audio runs.
        for (auto a : {0x40099090u, 0x40098fa8u, 0x40098ec0u, 0x40004f9cu,
                       0x40020554u, 0x40013f40u, 0x400204a8u, 0x400204ccu})
            p.mocks[a] = [] { return 0u; };
        p.run(sanitizer, {kind, 0, 0});
        const uint32_t minimum = std::min(length, 64u);
        const uint32_t a = std::min(100u, length - minimum);
        const uint32_t b = std::min(950u, length - minimum);
        require(p.record(base+312) == Record{a, std::min(length, std::max(110u, a+minimum)), a},
                "first sanitized record differs");
        require(p.record(base+324) == Record{b, std::min(length, std::max(990u, b+minimum)), 0xffffffff},
                "second sanitized record differs");
        auto after = p.snapshot();
        for (unsigned s = 0; s < slots; ++s)
            if (flex + s * stride != base)
                for (unsigned i = 0; i < stride; ++i)
                    require(before[s*stride+i] == after[s*stride+i], "another slot changed");
        for (unsigned i = 336; i < 1092; ++i)
            require(before[base-flex+i] == after[base-flex+i], "inactive slice changed");
        p.run(sanitizer, {kind, 0, 0});
        require(p.snapshot() == after, "sanitizer not idempotent for fixture");
    }
}
} // namespace
int main(int argc, char** argv) {
    std::printf("SOURCE_SHA256: %s\n", PROBE_SOURCE_SHA);
    if (argc != 2) return 2;
    std::ifstream in(argv[1], std::ios::binary);
    std::vector<uint8_t> image{std::istreambuf_iterator<char>(in), {}};
    if (image.size() != 1112560) return 2;
    const std::pair<const char*, void (*)(const std::vector<uint8_t>&)> cases[] = {
        {"264-slot marker writer/parser round-trip and checksum extent", roundTrip},
        {"header, checksum and truncated-input publication behavior", parserFailures},
        {"stock marker writer protection", protection},
        {"Flex/Static sample-settings marker round-trip and late checksum failure", sampleSettings},
        {"six Flex/Static sanitizer fixtures and inactive-slot isolation", sanitize},
    };
    unsigned failed = 0;
    for (const auto& c : cases) {
        try { c.second(image); std::printf("PASS: %s\n", c.first); }
        catch (const std::exception& e) { ++failed; std::printf("FAIL: %s: %s\n", c.first, e.what()); }
    }
    std::printf("%u passed, %u failed; synthetic IO only, no physical persistence or audio\n", 5-failed, failed);
    return failed ? 1 : 0;
}
