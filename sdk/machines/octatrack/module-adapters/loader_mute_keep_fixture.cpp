// SPDX-License-Identifier: GPL-3.0-or-later
// ev_mute_keep and Mute Modes' install-time GATE restore, executed under the ColdFire emulator
// (sdk/tests/test_mute_modes_runtime.py). The actual loader is built with and without the site
// events; the packets are Mute Modes' native raw forms (plain and SC_KEY, on the base without
// events) and its subscriber form (on the events base), beside an ev_mute_keep provider that runs
// Sidechain's KEY scan (mute_keep_provider_fixture.s). Hook 1 (0x40004dc6 -> pre -> 0x40004dcc)
// and the fresh-voice bind run for every MUTE MODE, mute/solo state and KEY layout: the subscriber
// form must do what the plain build does with no provider, and what the SC_KEY build does with one,
// in either install order. Synthetic, never qualification: the register/stack state at the sites,
// the mute/solo/mode words, the per-track DSP records, the battery shadow and a stub that records
// note-offs in place of stock's 0x40008f84. Local stock MAIN required; nothing is written back.
#include <cassert>
#include <cstdio>
#include <fstream>
#include <iterator>
#include <map>
#include <sstream>
#include <string>
#include <vector>
#include "machine.h"
#include "mc68k/Musashi/m68k.h"
#include "mc68k/cpuState.h"
static constexpr uint32_t sp0 = 0x46c7f920, packet = 0x47010000, stop = 0x47300000, base = 0x47400000;
static constexpr uint32_t PRE_SITE = 0x40004dc6, PRE_BACK = 0x40004dcc, BIND_SITE = 0x40006820, NOTEOFF = 0x40008f84;
static constexpr uint32_t GATE = 0x800000dc, SH_GATE = 0x100fff6c, MUTE_STATE = 0x80000008, SOLO_FLAG = 0x80000037;
static constexpr uint32_t REL_STATE = 0x8000184a, RECORDS = 0x80000110, NOTE_STUB = 0x47300200, NOTED = 0x47300300;
static std::vector<uint8_t> load(const char *path) { std::ifstream f(path, std::ios::binary); assert(f.good()); return {(std::istreambuf_iterator<char>(f)), {}}; }
static std::map<std::string, uint32_t> names(const char *path) // nm's "address type name" lines
{
    std::map<std::string, uint32_t> out; std::ifstream f(path); std::string line;
    while (std::getline(f, line)) {
        std::istringstream words(line); std::string a, b, c;
        if (words >> a >> b >> c) out[c] = std::stoul(a, nullptr, 16);
    }
    return out;
}
static uint32_t be(const std::vector<uint8_t>& b, unsigned at) { return uint32_t(b[at]) << 24 | uint32_t(b[at + 1]) << 16 | uint32_t(b[at + 2]) << 8 | b[at + 3]; }
static unsigned checks, failures;
#define CHECK(x) do { ++checks; if (!(x)) { ++failures; std::fprintf(stderr, "%s:%d: %s\n", __FILE__, __LINE__, #x); } } while (0)

struct Probe {
    ot::Machine m; std::map<std::string, uint32_t> sym;
    Probe(const std::vector<uint8_t>& stock, const std::vector<uint8_t>& code, const std::map<std::string, uint32_t>& symbols, bool events)
        : m(stock), sym(symbols)
    {
        for (unsigned i = 0; i < code.size(); i++) m.write8(base + i, code[i]);
        constexpr struct { uint32_t tcb, stack; } tasks[] = {
            {0x46c7fb0c,0x46c7ea20},{0x460bcc2c,0x460bc42c},{0x460d4f80,0x460d4780},
            {0x460d59d4,0x460d51d4},{0x460fab80,0x460fabd4},{0x460ffd44,0x460fdd44},
            {0x460e0e38,0x460dee38},{0x460ddde4,0x460d9de4},{0x46105508,0x4610555c},
            {0x46c7bed8,0x460d6de4},{0x46c7ae84,0x46c7aed8}};
        for (auto t : tasks) { m.write32(t.tcb, 0); m.write32(t.tcb + 0x48, t.stack + 8); }
        m.write32(0x800068fc, tasks[0].tcb); for (unsigned i = 0; i < 8; i++) m.write32(0x800068dc + 4 * i, 0);
        m.write32(0x800068dc, tasks[0].tcb); m.write32(tasks[0].tcb, tasks[0].tcb);
        m.mapRegion(0x10000000, 0x000b0000); m.mapRegion(0x100c0000, 0x00040000);
        m.write32(0x46c82456, 0x400e21e0);
        if (events) { // what the base build writes at its ev_voice_bind site: jmp to the generated dispatch, nop
            m.write16(BIND_SITE, 0x4ef9); m.write32(BIND_SITE + 2, sym.at("modwerk_site_40006820")); m.write16(BIND_SITE + 6, 0x4e71);
        }
        // Synthetic: stock's per-track note-off 0x40008f84(track) only sets bit `track` of NOTED here.
        m.write16(NOTE_STUB, 0x202f); m.write16(NOTE_STUB + 2, 4);              // move.l 4(%sp),%d0
        m.write16(NOTE_STUB + 4, 0x01f9); m.write32(NOTE_STUB + 6, NOTED);       // bset %d0,NOTED
        m.write16(NOTE_STUB + 10, 0x4e75);                                       // rts
        m.write16(NOTEOFF, 0x4ef9); m.write32(NOTEOFF + 2, NOTE_STUB);
    }
    std::vector<uint32_t> run(uint32_t entry, std::vector<uint32_t> args, uint32_t until, std::map<int, uint32_t> regs = {})
    {
        auto *cpu = m.getCpuState();
        for (unsigned r = 0; r < 15; r++) m68k_set_reg(cpu, m68k_register_t(M68K_REG_D0 + r), regs.count(r) ? regs[r] : 0);
        m68k_set_reg(cpu, M68K_REG_SP, sp0); m.write32(sp0, stop);
        for (unsigned i = 0; i < args.size(); i++) m.write32(sp0 + 4 + 4 * i, args[i]);
        auto unmapped = m.unmappedCount(); m68k_set_reg(cpu, M68K_REG_PC, entry); unsigned budget = 100000000;
        while (m.pc() != until && budget--) assert(m.step());
        assert(m.pc() == until && m.unmappedCount() == unmapped);
        std::vector<uint32_t> out(16);
        for (unsigned r = 0; r < 16; r++) out[r] = m68k_get_reg(cpu, m68k_register_t(M68K_REG_D0 + r));
        return out;
    }
    uint32_t call(const char *name, std::vector<uint32_t> args = {}) { return run(sym.at(name), args, stop)[0]; }
    int install(const std::vector<uint8_t>& b) // 1 installed; else minus the refusal
    {
        for (unsigned i = 0; i < b.size(); i++) m.write8(packet + i, b[i]);
        if (!call("modwerk_backend_prepare", {0, packet, uint32_t(b.size())})) return -int(call("modwerk_runtime_refusal"));
        assert(call("modwerk_backend_publish", {0}) == 1 && call("modwerk_backend_retire", {0}) == 1);
        return 1;
    }
    uint32_t reset_count(uint32_t track) { return m.read32(0x80004a68 + 168 * track); } // stock's reset counts here
};

struct Pkt { std::vector<uint8_t> b; std::map<std::string, uint32_t> sym; uint32_t id() const { return be(b, 28); } };
// One frame state: MUTE MODE word, mute and solo bytes, SOLO_FLAG, and per track (FX1 id, FX1 KEY, FX2 id, FX2 KEY).
struct Frame { uint32_t gate, muted, soloed, flag; uint8_t fx[8][4]; };

int main(int argc, char **argv)
{
    // stock, events image + symbols, legacy image + symbols, new package + symbols, raw plain + symbols, raw SC_KEY + symbols, provider
    assert(argc == 13);
    auto stock = load(argv[1]);
    auto ev_code = load(argv[2]); auto ev_sym = names(argv[3]); auto old_code = load(argv[4]); auto old_sym = names(argv[5]);
    Pkt mmNew{load(argv[6]), names(argv[7])}, mmPlain{load(argv[8]), names(argv[9])}, mmKey{load(argv[10]), names(argv[11])}, keep{load(argv[12])};
    unsigned scenarios = 0;

    // The frame: hook 1 from its site to its return, then every track's fresh-voice bind (and the all-tracks call).
    auto frame = [&](Probe& p, const Pkt *mm, const Frame& f) {
        std::vector<uint32_t> out;
        // SHADOW (hook 1's last silenced set) is a byte inside the installed unit since 0.2.2, not SRAM.
        const uint32_t shadow = p.call("fixture_image", {mm->id()}) + mm->sym.at("SHADOW");
        p.m.write32(GATE, f.gate); p.m.write32(MUTE_STATE, f.muted << 8 | f.soloed); p.m.write8(SOLO_FLAG, f.flag);
        p.m.write8(shadow, 0x0f); p.m.write8(REL_STATE, 0x40); p.m.write8(NOTED, 0);
        for (unsigned half = 0; half < 2; half++)
            for (unsigned t = 0; t < 8; t++) {
                const uint32_t r = RECORDS + 0x200 * half + 64 * t;
                p.m.write8(r + 55, f.fx[t][0]); p.m.write8(r + 38, f.fx[t][1]); p.m.write8(r + 57, f.fx[t][2]); p.m.write8(r + 50, f.fx[t][3]);
                p.m.write16(r + 6, 0x1000 + t); p.m.write16(r + 10, 0x2000 + t);
            }
        auto r = p.run(PRE_SITE, {}, PRE_BACK, {{0, 0xd0d0d0d0}, {1, 0xd1d1d1d1}, {2, 0xd2d2d2d2}, {3, 0xd3d3d3d3}, {8, 0xa0a0a0a0}, {9, 0xa1a1a1a1}});
        CHECK(r[0] == 0xd0d0d0d0 && r[1] == 0xd1d1d1d1 && r[2] == 0xd2d2d2d2 && r[3] == 0xd3d3d3d3); // hook 1 keeps them
        CHECK(r[8] == 0xa0a0a0a0 && r[9] == 0xa1a1a1a1 && r[15] == sp0);                          // and a0/a1, the stack
        out.push_back(r[5]);                                                // the frame word stock builds the levels from
        out.push_back(p.m.read8(shadow)); out.push_back(p.m.read8(REL_STATE)); out.push_back(p.m.read8(NOTED));
        for (unsigned half = 0; half < 2; half++)
            for (unsigned t = 0; t < 8; t++) out.push_back(p.m.read16(RECORDS + 0x200 * half + 64 * t + 6) << 16 | p.m.read16(RECORDS + 0x200 * half + 64 * t + 10));
        out.push_back(mm && mm->sym.count("KEYMASK") ? p.m.read8(p.call("fixture_image", {mm->id()}) + mm->sym.at("KEYMASK")) : 0);
        uint32_t ran = 0;
        for (uint32_t track = 0; track <= 8; ++track) {
            uint32_t before[8]; for (unsigned t = 0; t < 8; t++) before[t] = p.reset_count(t);
            auto b = p.run(BIND_SITE, {track}, stop, {{2, 0x22222222}, {3, 0x33333333}, {10, 0xaaaaaaaa}});
            CHECK(b[2] == 0x22222222 && b[3] == 0x33333333 && b[10] == 0xaaaaaaaa && b[15] == sp0 + 4);
            for (unsigned t = 0; t < 8; t++) ran |= (p.reset_count(t) - before[t]) << (t + 8 * (track == 8));
        }
        out.push_back(ran);
        ++scenarios; return out;
    };
    // KEY layouts: none; T1's FX1 and T5's FX2 COMPRESSORs keyed by T4 and T6; stock COMPRESSORs (KEY 127 and OFF);
    // T6's FX1 COMPRESSOR keyed by T1 beside an unrelated FX2 whose page-2 slot holds 2.
    Frame layouts[4] = {};
    layouts[1].fx[0][0] = 0x18; layouts[1].fx[0][1] = 4; layouts[1].fx[4][2] = 0x18; layouts[1].fx[4][3] = 6;
    layouts[2].fx[2][0] = 0x18; layouts[2].fx[2][1] = 127; layouts[2].fx[6][2] = 0x18; layouts[2].fx[6][3] = 0;
    layouts[3].fx[5][0] = 0x18; layouts[3].fx[5][1] = 1; layouts[3].fx[5][2] = 0x0c; layouts[3].fx[5][3] = 2;
    const uint32_t expected_keys[4] = {0, 0x28, 0, 0x01};
    const uint32_t states[][4] = {{0x28, 0, 0, 0}, {0x29, 0, 0, 0}, {0x00, 0x01, 0, 0}, {0x08, 0x01, 1, 1}, {0x00, 0, 0, 0}};
    for (uint32_t gate = 0; gate <= 3; ++gate)
        for (auto& s : states)
            for (unsigned k = 0; k < 4; ++k) {
                Frame f = layouts[k]; f.gate = gate; f.muted = s[0]; f.soloed = s[1]; f.flag = s[2];
                std::vector<uint32_t> plain, key, none, with[2];
                { Probe p(stock, old_code, old_sym, false); CHECK(p.install(mmPlain.b) == 1); plain = frame(p, &mmPlain, f); }
                { Probe p(stock, old_code, old_sym, false); CHECK(p.install(mmKey.b) == 1); key = frame(p, &mmKey, f); }
                { Probe p(stock, ev_code, ev_sym, true); CHECK(p.install(mmNew.b) == 1); none = frame(p, &mmNew, f); }
                for (unsigned order = 0; order < 2; ++order) {
                    Probe p(stock, ev_code, ev_sym, true);
                    CHECK(p.install(order ? keep.b : mmNew.b) == 1 && p.install(order ? mmNew.b : keep.b) == 1);
                    with[order] = frame(p, &mmNew, f);
                    CHECK(p.call("modwerk_raise_ev_mute_keep") == expected_keys[k]);   // the provider's own answer
                }
                // No provider: what the plain build does, whatever the KEY slots hold; its KEYMASK stays 0.
                CHECK(std::vector<uint32_t>(none.begin(), none.end() - 2) == std::vector<uint32_t>(plain.begin(), plain.end() - 2));
                CHECK(none.end()[-1] == plain.end()[-1] && none.end()[-2] == 0);
                // With Sidechain's answer: what the SC_KEY build does, in either install order, KEYMASK included.
                CHECK(with[0] == key && with[1] == key);
                CHECK(key.end()[-2] == (gate ? expected_keys[k] : 0)); // p1_key runs in the three silencing modes only
            }
    // A muted KEY track keeps its voice in DT-T: the SC_KEY build lets T4 bind, the plain one drops it.
    {
        Frame f = layouts[1]; f.gate = 2; f.muted = 0x28;
        Probe p(stock, ev_code, ev_sym, true); CHECK(p.install(keep.b) == 1 && p.install(mmNew.b) == 1);
        auto with = frame(p, &mmNew, f); Probe q(stock, ev_code, ev_sym, true); CHECK(q.install(mmNew.b) == 1);
        auto none = frame(q, &mmNew, f);
        CHECK((with.back() & 0x28) == 0x28 && (none.back() & 0x28) == 0);
        CHECK((with[0] >> 8 & 0x28) == 0x28 && (none[0] >> 8 & 0x28) == 0); // stock's own mute bit back for the keys
    }
    // The raise with nothing subscribed answers 0.
    { Probe p(stock, ev_code, ev_sym, true); CHECK(p.call("modwerk_raise_ev_mute_keep") == 0); ++scenarios; }
    // GATE after an install: boot's restore ran before the module came (stock length), so the first UI tick takes
    // GATE from its battery shadow once; set_mutemode's own writes are never undone by a later tick.
    uint32_t restored[3] = {};
    {
        Probe p(stock, ev_code, ev_sym, true); p.m.write32(GATE, 0); p.m.write32(SH_GATE, 3);
        CHECK(p.install(mmNew.b) == 1); CHECK(p.m.read32(GATE) == 0); // the install itself writes nothing there
        p.call("modwerk_runtime_tick"); restored[0] = p.m.read32(GATE);
        p.m.write32(SH_GATE, 1); p.call("modwerk_runtime_tick"); restored[1] = p.m.read32(GATE);
        p.m.write32(GATE, 2); p.m.write32(SH_GATE, 2); p.call("modwerk_runtime_tick"); restored[2] = p.m.read32(GATE);
        CHECK(restored[0] == 3 && restored[1] == 3 && restored[2] == 2);
        ++scenarios;
    }
    { // a fresh install restores again (each image starts unrestored)
        Probe p(stock, ev_code, ev_sym, true); p.m.write32(GATE, 3); p.m.write32(SH_GATE, 0);
        CHECK(p.install(mmNew.b) == 1); p.call("modwerk_runtime_tick"); CHECK(p.m.read32(GATE) == 0); ++scenarios;
    }
    // The raw forms are refused on the events base; the subscriber form and the provider on the base without events.
    { Probe p(stock, ev_code, ev_sym, true); CHECK(p.install(mmPlain.b) == -9 && p.install(mmKey.b) == -9); }
    { Probe p(stock, old_code, old_sym, false); CHECK(p.install(mmNew.b) < 0 && p.install(keep.b) < 0); }
    std::printf("{\"scenarios\":%u,\"checks\":%u,\"failures\":%u,\"gateRestore\":[%u,%u,%u],\"rawOnEventBase\":\"RUNTIME_EVENT\","
                "\"synthetic\":[\"site registers and stack\",\"mute/solo/mode words\",\"per-track DSP records\",\"battery shadow\","
                "\"note-off stub at 0x40008f84\",\"provider is the proposed Sidechain handler, not a Sidechain package\"],"
                "\"emulator\":true,\"hardware\":false}\n", scenarios, checks, failures, restored[0], restored[1], restored[2]);
    return failures ? 1 : 0;
}
