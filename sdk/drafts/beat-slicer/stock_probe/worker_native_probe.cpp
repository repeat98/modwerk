// SPDX-License-Identifier: MIT
// Reuse original synthetic stock queue/PCM fixtures; execute the NEW observer
// on ColdFire, rather than replacing its guard with host calls. The only stock
// call changed in this private emulator is the engine's queue receive call.
#define main bs_historical_worker_main
#include "worker_probe.cpp"
#undef main
#include <sstream>
#include <map>
namespace {
struct Native : Probe {
    std::map<std::string, uint32_t> symbols;
    unsigned stores = 0, completions = 0, maxMasked = 0, masked = 0;
    Native(const std::vector<uint8_t>& image, const std::vector<uint8_t>& binary,
           const std::map<std::string, uint32_t>& names) : Probe(image), symbols(names) {
        require(!binary.empty() && binary.size() < 0x10000, "native binary extent differs");
        for (unsigned i = 0; i < binary.size(); ++i) m.write8(sym("bs_guard_init")+i, binary[i]);
        require(run(sym("bs_worker_test_init")) == 0, "native fixture init failed");
        require(m.read16(0x40084854) == 0x4eb9 && m.read32(0x40084856) == receive,
                "private stock receive call differs");
        m.write32(0x40084856, sym("bs_worker_test_entry"));
    }
    uint32_t sym(const char *name) { return symbols.at(name); }
    uint32_t guard(unsigned word) { return m.read32(sym("bs_worker_test_guard")+4*word); }
    uint32_t ticket() { return m.read32(sym("bs_worker_test_boundary")+20); }
    void watches() {
        m.addWriteWatch(pool, pool+8*pageBytes-1,
            [this](uint32_t, uint8_t, uint32_t, uint32_t) {
                require(ticket() && guard(4) == ticket() && guard(0) != 1 &&
                        guard(2) && !guard(3), "native command did not exclude PCM writes");
                ++stores;
            });
    }
    void tick() {
        if ((reg(M68K_REG_SR)&0x700) == 0x700 && m.pc() >= sym("bs_guard_init") && m.pc() < sym("bs_guard_init")+0x10000)
            maxMasked = std::max(maxMasked, ++masked);
        else masked = 0;
        if (m.pc() == completion) {
            require(ticket() && guard(4) == ticket(), "optional completion escaped whole-command exclusion");
            ++completions;
        }
        step();
    }
    void commandEnd() {
        unsigned n = 0;
        do { tick(); } while (m.pc() != loop && ++n < 3000000);
        checkLoop();
        require(ticket() && guard(4) == ticket(), "command retired before its next receive boundary");
        require(!m.read32(sym("bs_worker_test_boundary")+28), "native observer faulted");
    }
    void wait() {
        unsigned n = 0;
        do { tick(); } while (m.pc() != waitEvent && ++n < 10000);
        require(m.pc() == waitEvent && !ticket() && !guard(4) && guard(2) && !guard(3),
                "empty receive did not retire prior command before waiting");
        require((reg(M68K_REG_SR)&0x700) != 0x700, "receive waited under observer mask");
        require(m.read32(reg(M68K_REG_SP)+4) == engineQ+8, "wrong wait event");
    }
};
}
int main(int argc, char **argv) {
    std::printf("SOURCE_SHA256: %s\n", PROBE_SOURCE_SHA);
    if (argc != 4) return 2;
    try {
        std::ifstream stock(argv[1], std::ios::binary), code(argv[2], std::ios::binary), names(argv[3]);
        std::vector<uint8_t> image{std::istreambuf_iterator<char>(stock), {}}, binary{std::istreambuf_iterator<char>(code), {}};
        require(image.size() == 1112560, "private MAIN extent differs");
        std::map<std::string, uint32_t> symbols;
        std::string line, address, type, name;
        while (std::getline(names, line)) {
            std::istringstream row(line);
            if (row >> address >> type >> name) symbols[name] = uint32_t(std::stoul(address, nullptr, 16));
        }
        unsigned cases = 0, maxMasked = 0;
        // Each command runs its real stock implementation and actual queue and
        // completion paths. The base display mock is unchanged and explicit.
        for (unsigned format = 0; format < 4; ++format) {
            Native p(image, binary, symbols); p.setup(format); p.watches();
            const unsigned edge = pageBytes/p.width(format);
            p.run(producer); p.start(); p.commandEnd();
            require(p.stores && p.completions == 1 && !p.m.read32(engineQ+4), "gain lifetime differs");
            for (unsigned frame = 0; frame < edge+8; ++frame)
                for (unsigned ch = 0; ch < (format&1 ? 2u : 1u); ++ch)
                    require(p.sample(format, frame, ch) == (frame >= edge-2 && frame < edge+2 ? 0 : ch ? 2048 : 4096),
                            "gain changed unexpected PCM");
            p.checkCompletion(0, 1); p.wait();
            maxMasked = std::max(maxMasked, p.maxMasked); ++cases;
        }
        for (unsigned scenario = 0; scenario < 7; ++scenario) {
            Native p(image, binary, symbols); p.setup(3); p.watches();
            if (scenario == 0) p.m.write32(controls+8, 1);
            if (scenario == 3) for (unsigned i=0; i<32; ++i) p.m.write32(completionPool+26*i+22, 1);
            if (scenario == 4) { p.m.write32(0x8000691c, 2); p.m.write32(0x80006920, 14602); }
            const unsigned opcode = scenario == 4 ? 28 : scenario == 5 ? 255 : scenario == 6 ? 27 : 23;
            p.command(scratch+0x300, opcode, 2, scenario == 1 || scenario == 6 ? 2 : 6, 0,
                      scenario == 2 ? 0 : callback);
            p.start(); p.commandEnd();
            if (scenario == 0 || scenario == 1 || scenario == 5 || scenario == 6)
                require(!p.stores, "refused/unknown command changed PCM");
            else require(p.stores, "successful command did not change PCM");
            if (scenario == 2 || scenario == 3 || scenario == 4 || scenario == 5)
                require(!p.m.read32(uiQ+4), "unexpected completion queued");
            if (scenario == 0 || scenario == 1 || scenario == 6)
                p.checkCompletion(0, uint32_t(scenario ? -2 : -3));
            if (scenario == 4) require(!p.m.read32(controls+16) && !p.m.read16(0x46c75e88), "release failed");
            p.wait(); maxMasked = std::max(maxMasked, p.maxMasked); ++cases;
        }
        {
            Native p(image, binary, symbols); p.setup(3); p.watches();
            p.command(scratch+0x300, 23, 2, 4);
            p.command(scratch+0x340, 31, 4, 6, 2);
            p.start(); p.commandEnd(); const auto first = p.ticket(), rev = p.guard(0);
            require(p.m.read32(engineQ+4) == 1 && p.sample(3, 4, 0) == 4096, "first FIFO command differs");
            p.commandEnd();
            require(p.ticket() > first && p.guard(0) > rev && p.sample(3, 2, 0) == 0 &&
                    p.sample(3, 4, 0) == -4096, "FIFO operation identity/PCM differs");
            p.checkCompletion(0, 1); p.checkCompletion(1, 1); p.wait();
            maxMasked = std::max(maxMasked, p.maxMasked); ++cases;
        }
        std::printf("PASS: %u native whole-command cases; maximum observed observer masked run %u executed instructions (not cycles/time)\n", cases, maxMasked);
        return 0;
    } catch (const std::exception& e) { std::printf("FAIL: %s\n", e.what()); return 1; }
}
