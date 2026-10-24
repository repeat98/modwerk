// SPDX-License-Identifier: MIT
// Original isolated stock-contract probes. No device IO or firmware bytes.
// Run with stock_probe.py, which binds the private MAIN input to its SHA-256.
// Addresses below were traced in that input; none is an approved patch site.
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
constexpr uint32_t stack = 0x47100000, sentinel = 0x47300000;
constexpr uint32_t scratch = 0x47200000; // Synthetic fixture memory, not an ABI.
constexpr uint32_t currentKind = 0x46c8d1a0, currentSlot = 0x46c8d19c;
constexpr uint32_t settingsLookup = 0x4006da78, sortRecords = 0x40070c28;
constexpr uint32_t pointerRefresh = 0x40070cbc, manualAdd = 0x400730f0;
constexpr uint32_t editorMenu = 0x40072c10, menuOpen = 0x4006d94c;
constexpr uint32_t menuDraw = 0x4006d784, menuSelect = 0x4006d8f4;
using Record = std::array<uint32_t, 3>;

struct Probe {
    ot::Machine machine;
    std::map<uint32_t, std::function<uint32_t()>> mocks;
    explicit Probe(const std::vector<uint8_t>& image) : machine(image) {}
    uint32_t reg(m68k_register_t r) { return m68k_get_reg(machine.getCpuState(), r); }
    void reg(m68k_register_t r, uint32_t value) { m68k_set_reg(machine.getCpuState(), r, value); }
    uint32_t arg(unsigned i) { return machine.read32(reg(M68K_REG_SP) + 4 + 4 * i); }
    void ret(uint32_t value) {
        const auto sp = reg(M68K_REG_SP);
        reg(M68K_REG_D0, value);
        reg(M68K_REG_PC, machine.read32(sp));
        reg(M68K_REG_SP, sp + 4);
    }
    void run(uint32_t entry, std::initializer_list<uint32_t> args = {}, uint32_t stop = sentinel) {
        // Preserve the caller's SR in real code; use supervisor mode only in this fixture.
        reg(M68K_REG_SR, 0x2700);
        reg(M68K_REG_SP, stack);
        machine.write32(stack, sentinel);
        unsigned i = 0;
        for (const auto a : args) machine.write32(stack + 4 + 4 * i++, a);
        reg(M68K_REG_PC, entry);
        unsigned steps = 0;
        while (machine.pc() != stop && steps++ < 20000) {
            const auto mock = mocks.find(machine.pc());
            if (mock != mocks.end()) { ret(mock->second()); continue; }
            if (!machine.step()) throw std::runtime_error("CPU stopped: " + machine.why());
        }
        if (machine.pc() != stop) throw std::runtime_error("Instruction budget exhausted");
        if (stop == sentinel && reg(M68K_REG_SP) != stack + 4)
            throw std::runtime_error("Unbalanced return stack");
    }
    std::string stringAt(uint32_t address) {
        std::string value;
        for (unsigned i = 0; i < 100; ++i) {
            auto c = machine.read8(address + i);
            if (!c) return value;
            value.push_back(char(c));
        }
        throw std::runtime_error("Unterminated fixture label");
    }
    void record(uint32_t address, const Record& r) {
        for (unsigned i = 0; i < 3; ++i) machine.write32(address + 4 * i, r[i]);
    }
    Record record(uint32_t address) {
        return {machine.read32(address), machine.read32(address + 4), machine.read32(address + 8)};
    }
    void mockUI() {
        // Explicit omissions: formatting, message display, editor refresh, dirty/undo
        // follow-up and task dispatch. No claim is made about these callees.
        for (auto address : {0x40013a08u, 0x4005a2b8u, 0x400718f8u,
                             0x4006dbdcu, 0x40044920u})
            mocks[address] = [] { return 0; };
    }
};

void require(bool condition, const char* message) {
    if (!condition) throw std::runtime_error(message);
}

void lookup(const std::vector<uint8_t>& image) {
    Probe p(image);
    for (auto kind : {0u, 1u, 4u, 2u}) {
        for (auto slot : {0u, 127u, 128u, 135u, 136u, 0xffffffffu}) {
            p.machine.write32(currentKind, kind);
            p.machine.write32(currentSlot, slot);
            p.run(settingsLookup);
            const auto expected = kind == 0 && slot <= 128 ? 0x100d5b30 + 0x448 * slot :
                (kind == 1 || kind == 4) && slot <= 135 ? 0x100b14f0 + 0x448 * slot : 0;
            require(p.reg(M68K_REG_D0) == expected, "settings lookup boundary differs");
        }
    }
}

void menuVariants(const std::vector<uint8_t>& image) {
    for (const auto selected : {0xffffffffu, 0u}) {
        Probe p(image);
        p.machine.write32(0x400ceb3c, selected);
        p.mocks[0x4006dbc0] = [] { return 0; };
        p.mocks[0x4006e2cc] = [] { return 0; };
        p.mocks[0x4006dae4] = [] { return 1; };
        p.mocks[0x4006dbdc] = [] { return 0; };
        unsigned opened = 0;
        p.mocks[menuOpen] = [&] {
            ++opened;
            require(p.arg(0) == (selected == 0xffffffffu ? 6u : 9u), "menu row count differs");
            bool found = false;
            for (unsigned i = 0; i < p.arg(0); ++i) {
                if (p.stringAt(p.machine.read32(p.arg(3) + 4 * i)) == "CREATE SLICE GRID") {
                    require(p.machine.read32(p.arg(4) + 4 * i) == 0x40072cb8, "grid dispatch differs");
                    found = true;
                }
            }
            require(found, "grid row absent");
            return 0;
        };
        p.run(editorMenu);
        require(opened == 1, "menu not opened once");
    }
}

void menuLifetime(const std::vector<uint8_t>& image) {
    Probe p(image);
    // Reuse labels/callbacks privately from the actual six-row stock menu.
    const uint32_t labels = 0x400ceb8c, callbacks = 0x400ceb74, selection = scratch;
    for (auto address : {0x40012f30u, 0x4007ec60u, 0x4007edb0u, 0x40056f4cu,
                         0x40031494u, 0x40055db4u, 0x4003146cu})
        p.mocks[address] = [] { return 0; };
    p.mocks[0x4005829c] = [] { return scratch + 0x100; };
    p.run(menuOpen, {6, 2, selection, labels, callbacks}, menuDraw);
    require(p.reg(M68K_REG_SP) == stack, "menu tail call stack differs");
    require(p.machine.read32(0x460e5e28) == callbacks &&
            p.machine.read32(0x460e5e2c) == labels &&
            p.machine.read32(0x460e5e34) == selection, "menu did not retain pointer arguments");
    p.machine.write32(0x460e5e40, 2);
    unsigned called = 0;
    // Execute the stock null-safe indirect-call wrapper too. It invokes the
    // selected callback synchronously, rather than queuing it for later.
    p.mocks[p.machine.read32(callbacks + 8)] = [&] {
        ++called;
        require(p.machine.read32(selection) == 2, "selection not stored before callback");
        return 0;
    };
    p.run(menuSelect);
    require(called == 1 && p.reg(M68K_REG_D0) == 1,
            "selection did not synchronously invoke callback");
}

void wholeRecordSort(const std::vector<uint8_t>& image) {
    Probe p(image);
    std::vector<Record> records = {{300, 380, 305}, {100, 180, 110},
                                   {200, 280, 210}, {100, 170, 115}};
    p.machine.write32(scratch - 4, 0x12345678);
    p.machine.write32(scratch + 48, 0x87654321);
    for (unsigned i = 0; i < records.size(); ++i) p.record(scratch + 12 * i, records[i]);
    p.run(sortRecords, {scratch, uint32_t(records.size())}); // Stock copy helper executes too.
    std::stable_sort(records.begin(), records.end(), [](auto a, auto b) { return a[0] < b[0]; });
    for (unsigned i = 0; i < records.size(); ++i)
        require(p.record(scratch + 12 * i) == records[i], "sort lost end/loop or equal-start order");
    require(p.machine.read32(scratch - 4) == 0x12345678 &&
            p.machine.read32(scratch + 48) == 0x87654321, "sort wrote past records");
}

void pointerLayout(const std::vector<uint8_t>& image) {
    Probe p(image);
    p.machine.write32(currentKind, 1);
    p.machine.write32(currentSlot, 0);
    const uint32_t slot = 0x100b14f0;
    p.machine.write32(slot + 0x444, 3);
    for (unsigned i = 0; i < 3; ++i) p.record(slot + 312 + 12 * i, {100 * i, 100 * i + 99, 0xffffffff});
    p.run(pointerRefresh);
    for (unsigned i = 0; i < 64; ++i) {
        const auto start = i < 3 ? slot + 312 + 12 * i : 0;
        require(p.machine.read32(0x460e5fe4 + 14 * i) == start, "start pointer stride differs");
        require(p.machine.read32(0x460e6372 + 14 * i) == (start ? start + 4 : 0), "end pointer differs");
        require(p.machine.read32(0x460e6700 + 14 * i) == (start ? start + 8 : 0), "loop pointer differs");
    }
}

void addRenumbers(const std::vector<uint8_t>& image) {
    Probe p(image);
    p.mockUI();
    p.mocks[0x4006e2cc] = [] { return 0; };
    p.mocks[0x4006dae4] = [] { return 1; };
    p.mocks[0x4006e424] = [] { return 64; };
    p.machine.write32(currentKind, 1);
    p.machine.write32(currentSlot, 0);
    const uint32_t slot = 0x100b14f0;
    p.machine.write32(slot + 0x444, 2);
    const Record first{100, 180, 110}, second{300, 380, 310};
    p.record(slot + 312, first);
    p.record(slot + 324, second);
    p.machine.write32(0x400ceb40, scratch);
    p.machine.write32(scratch, 200);
    p.machine.write32(0x400ceb24, 1);
    p.run(manualAdd);
    require(p.machine.read32(slot + 0x444) == 3, "manual add count differs");
    require(p.record(slot + 312) == first && p.record(slot + 336) == second,
            "manual add did not move old complete record from index 1 to 2");
    require(p.record(slot + 324) == Record{200, 264, 0xffffffff}, "new record differs");
}
} // namespace

int main(int argc, char** argv) {
    std::printf("SOURCE_SHA256: %s\n", PROBE_SOURCE_SHA);
    if (argc != 2) { std::fprintf(stderr, "Run through stock_probe.py with private MAIN.\n"); return 2; }
    std::ifstream input(argv[1], std::ios::binary);
    std::vector<uint8_t> image{std::istreambuf_iterator<char>(input), {}};
    if (image.size() != 1112560) { std::fprintf(stderr, "Unexpected MAIN length\n"); return 2; }
    unsigned passed = 0, failed = 0;
    const std::pair<const char*, void (*)(const std::vector<uint8_t>&)> cases[] = {
        {"settings lookup boundaries", lookup}, {"slice menu variants", menuVariants},
        {"retained menu pointers and synchronous callback", menuLifetime},
        {"stable complete-record sort", wholeRecordSort}, {"12-byte slice record pointers", pointerLayout},
        {"manual insertion renumbers an existing record", addRenumbers},
    };
    for (const auto& test : cases) {
        try { test.second(image); ++passed; std::printf("PASS: %s\n", test.first); }
        catch (const std::exception& e) { ++failed; std::printf("FAIL: %s: %s\n", test.first, e.what()); }
    }
    std::printf("%u passed, %u failed; isolated emulator probes, no hardware/audio/persistence evidence\n", passed, failed);
    return failed ? 1 : 0;
}
