// SPDX-License-Identifier: MIT
// Original synthetic fixtures. Private stock code is supplied at runtime only.
// These probes do not boot the OS, mount a card or access a device.
#include <algorithm>
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
namespace {
constexpr uint32_t stack = 0x47100000, stop = 0x47300000, scratch = 0x47200000;
constexpr uint32_t pool = 0x40a955e0, pageBytes = 6144;
constexpr uint32_t pageList = scratch + 0x10000, slotOffsets = scratch + 0x20000;
constexpr std::array<unsigned, 3> physicalPages{3, 7, 2};
constexpr std::array<m68k_register_t, 11> saved{
    M68K_REG_D2, M68K_REG_D3, M68K_REG_D4, M68K_REG_D5, M68K_REG_D6,
    M68K_REG_D7, M68K_REG_A2, M68K_REG_A3, M68K_REG_A4, M68K_REG_A5, M68K_REG_A6};
void require(bool ok, const char* message) { if (!ok) throw std::runtime_error(message); }
struct Probe {
    ot::Machine m;
    std::map<uint32_t, std::function<uint32_t()>> mocks;
    explicit Probe(const std::vector<uint8_t>& image) : m(image) {}
    uint32_t reg(m68k_register_t r) { return m68k_get_reg(m.getCpuState(), r); }
    void reg(m68k_register_t r, uint32_t v) { m68k_set_reg(m.getCpuState(), r, v); }
    uint32_t arg(unsigned i) { return m.read32(reg(M68K_REG_SP) + 4 + 4*i); }
    std::array<uint32_t, 2> run(uint32_t entry, std::initializer_list<uint32_t> args) {
        reg(M68K_REG_SR, 0x2700); reg(M68K_REG_SP, stack); m.write32(stack, stop);
        for (unsigned i = 0; i < saved.size(); ++i) reg(saved[i], 0x12340000 + i);
        unsigned i = 0;
        for (auto a : args) m.write32(stack + 4 + 4*i++, a);
        reg(M68K_REG_PC, entry);
        unsigned steps = 0;
        while (m.pc() != stop && ++steps < 100000) {
            auto found = mocks.find(m.pc());
            if (found == mocks.end()) {
                if (!m.step()) throw std::runtime_error("CPU stopped: " + m.why());
            } else {
                const auto value = found->second(), sp = reg(M68K_REG_SP);
                reg(M68K_REG_D0, value); reg(M68K_REG_D1, 0x13579bdf);
                reg(M68K_REG_A0, 0x13579bdf); reg(M68K_REG_A1, 0x13579bdf);
                reg(M68K_REG_PC, m.read32(sp)); reg(M68K_REG_SP, sp + 4);
            }
        }
        require(m.pc() == stop && reg(M68K_REG_SP) == stack + 4, "return/budget differs");
        for (unsigned n = 0; n < saved.size(); ++n)
            require(reg(saved[n]) == 0x12340000 + n, "callee-saved register changed");
        return {reg(M68K_REG_D0), reg(M68K_REG_D1)};
    }
    std::vector<uint8_t> bytes(uint32_t at, unsigned size) {
        std::vector<uint8_t> result(size);
        for (unsigned i = 0; i < size; ++i) result[i] = m.read8(at+i);
        return result;
    }
    void setup(unsigned slot, unsigned format, unsigned length) {
        const unsigned frameBytes = (format & 2 ? 2 : 3) * (format & 1 ? 2 : 1);
        m.write32(0x46105408, 1);
        m.write32(0x46c922c4 + 44*slot, format);
        m.write32(0x46c922c4 + 44*slot + 16, length);
        // Authored descriptors, not extracted stock table contents. The test
        // exercises the lookup's arithmetic with an explicitly supplied layout.
        m.write32(0x80003c20 + 16*format + 4, pageBytes/frameBytes);
        m.write32(0x80003c20 + 16*format + 8, frameBytes);
        m.write32(0x80006914, pageList); m.write32(0x80006918, slotOffsets);
        m.write32(slotOffsets + 4*slot, 11);
        for (unsigned i = 0; i < physicalPages.size(); ++i) {
            m.write16(pageList + 2*(11+i), physicalPages[i]);
            for (unsigned b = 0; b < pageBytes; ++b)
                m.write8(pool + physicalPages[i]*pageBytes + b, (b*17 + i*29) & 255);
        }
    }
};
void lookup(const std::vector<uint8_t>& image) {
    Probe p(image); p.m.write32(0x46105408, 1);
    require(p.run(0x400946d8, {1, 127})[0] == 0x46c922c4 + 44*127, "Flex lookup differs");
    require(p.run(0x400946d8, {1, 135})[0] == 0x46c922c4 + 44*135, "recorder lookup differs");
    require(p.run(0x400946d8, {0, 127})[0] == 0x46c90a78 + 44*127, "Static lookup differs");
    require(p.run(0x400946d8, {1, 136})[0] == 0, "out-of-range Flex lookup accepted");
    p.m.write32(0x46105408, 0);
    require(p.run(0x400946d8, {1, 0})[0] == 0, "unavailable pool lookup accepted");
    // Do not call the page walker with these invalid preconditions: it does
    // not null-check this helper's result. No adapter may forward them.
}
void forward(const std::vector<uint8_t>& image) {
    Probe p(image);
    for (unsigned format = 0; format < 4; ++format) for (auto slot : {0u, 127u}) {
        const unsigned width = (format & 2 ? 2 : 3) * (format & 1 ? 2 : 1);
        const unsigned pageFrames = pageBytes/width, length = pageFrames*2 + 17;
        p.setup(slot, format, length);
        auto before = p.bytes(pool, 8*pageBytes);
        for (auto position : {0u, 1u, pageFrames-1, pageFrames, pageFrames+1,
                              pageFrames*2-1, pageFrames*2, length-1, length, length+1, 0xffffffffu}) {
            auto result = p.run(0x4009499c, {slot, position, 1});
            if (position >= length) require(result == std::array<uint32_t, 2>{pool, 0}, "invalid forward extent differs");
            else {
                const auto expected = pool + physicalPages[position/pageFrames]*pageBytes + position%pageFrames*width;
                require(result[0] == expected, "forward pointer differs");
                require(result[1] == std::min(length-position, pageFrames-position%pageFrames), "forward extent differs");
            }
        }
        require(p.bytes(pool, 8*pageBytes) == before, "page lookup changed source audio");
    }
}
void reverse(const std::vector<uint8_t>& image) {
    Probe p(image);
    for (unsigned format = 0; format < 4; ++format) {
        const unsigned width = (format & 2 ? 2 : 3) * (format & 1 ? 2 : 1);
        const unsigned pageFrames = pageBytes/width, length = pageFrames*2 + 17;
        p.setup(0, format, length);
        for (auto position : {0u, 1u, 2u, pageFrames, pageFrames+1, pageFrames+2,
                              length, length+1, 0xffffffffu}) {
            auto result = p.run(0x4009499c, {0, position, 0xffffffffu});
            if (position == 0 || position > length)
                require(result == std::array<uint32_t, 2>{pool+pageBytes, 0}, "invalid reverse extent differs");
            else {
                auto offset = (position-1)%pageFrames;
                require(result[0] == pool + physicalPages[(position-1)/pageFrames]*pageBytes + (offset+1)*width,
                        "reverse pointer differs");
                // This is the observed raw d1 convention, NOT an approved
                // backwards block-reader API: it is zero at a page's first frame.
                require(result[1] == offset, "reverse d1 convention differs");
            }
        }
    }
}
void recorders(const std::vector<uint8_t>& image) {
    Probe p(image);
    for (auto slot : {128u, 135u}) for (auto active : {0u, 1u}) {
        p.setup(slot, 3, 90);
        unsigned activeCalls = 0, lengthCalls = 0;
        p.mocks[0x40004268] = [&] { require(p.arg(0) == slot-128, "recorder index differs"); ++activeCalls; return active; };
        p.mocks[0x40005f54] = [&] { require(p.arg(0) == slot-128, "length index differs"); ++lengthCalls; return 27u; };
        const auto before = p.bytes(0x46c922c4 + 44*slot, 44);
        auto result = p.run(0x4009499c, {slot, 26, 1});
        require(result[1] == (active ? 1u : 64u), "recorder length selection differs");
        require(activeCalls == 1 && lengthCalls == active, "recorder helpers differ");
        require(p.bytes(0x46c922c4 + 44*slot, 44) == before, "recorder metadata changed");
    }
}
void conversion(const std::vector<uint8_t>& image) {
    Probe p(image);
    bool recording = false;
    unsigned readEnd = 0;
    const unsigned src = scratch+0x100, dst = scratch+0x200;
    p.m.addReadWatch(src, src+63, [&](uint32_t address, uint8_t size, uint32_t, uint32_t) {
        if (recording) readEnd = std::max(readEnd, address+size-src);
    });
    const std::array<int32_t, 9> values{0, 1, -1, 0x7fffff, -0x800000, 0x123456, -0x123456, 0x100, -0x100};
    for (auto bits : {16u, 24u}) for (auto little : {0u, 1u}) for (unsigned count = 0; count <= 9; ++count) {
        const unsigned width = bits/8;
        for (unsigned i = 0; i < 64; ++i) { p.m.write8(src+i, 0x5a); p.m.write8(dst+i, 0xa5); }
        for (unsigned i = 0; i < count; ++i) {
            const uint32_t value = bits == 16 ? uint32_t(values[i]) >> 8 : uint32_t(values[i]);
            for (unsigned b = 0; b < width; ++b)
                p.m.write8(src+i*width+b, value >> (8*(little ? b : width-1-b)));
        }
        const auto before = p.bytes(src, 64);
        readEnd = 0; recording = true;
        auto result = p.run(bits == 16 ? 0x4009825c : 0x400982e4, {dst, src, count, little});
        recording = false;
        // The 24-bit scalar tail uses a four-byte read for a three-byte
        // value. An adapter must stage padding or use a bounded decoder.
        require(readEnd == count*width + (bits == 24 && count%4 ? 1u : 0u),
                "converter source read extent differs");
        require(result[0] == dst+count*4, "converter return differs");
        for (unsigned i = 0; i < count; ++i) {
            const uint32_t expected = (uint32_t(values[i]) << 8) & (bits == 16 ? 0xffff0000u : 0xffffff00u);
            require(p.m.read32(dst+4*i) == expected, "converted signed amplitude differs");
        }
        for (unsigned i = count*4; i < 64; ++i) require(p.m.read8(dst+i) == 0xa5, "converter wrote beyond output");
        require(p.bytes(src, 64) == before, "converter changed source");
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
        {"Flex/Static control lookup and invalid Flex preconditions", lookup},
        {"88 forward page lookups across four authored layouts and two Flex slots", forward},
        {"36 reverse page lookups including zero d1 at first frame", reverse},
        {"four recorder dynamic-length fixtures with mocked state helpers", recorders},
        {"40 signed PCM conversion fixtures, byte orders, vector/tail paths and read extents", conversion},
    };
    unsigned failed = 0;
    for (const auto& c : cases) {
        try { c.second(image); std::printf("PASS: %s\n", c.first); }
        catch (const std::exception& e) { ++failed; std::printf("FAIL: %s: %s\n", c.first, e.what()); }
    }
    std::printf("%u passed, %u failed; synthetic pool only, no Static streaming, concurrency or audio\n", 5-failed, failed);
    return failed ? 1 : 0;
}
