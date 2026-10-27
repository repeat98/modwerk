// SPDX-License-Identifier: GPL-3.0-or-later
// Site events (sdk/machines/octatrack/hooks.json) executed under the ColdFire
// emulator: the actual loader built with and without the events, the generated
// dispatch, and real encoded packets of the current (raw detour) and migrated
// (subscriber) Repitch, Mute Modes and POLY8 group. Each subscriber must do what
// its module does alone on a base without events, together they must keep the
// reviewed order, and the old raw packets must be refused on an event base.
// Synthetic, never qualification: the register/stack state at a site (as the
// stock routine leaves it there), the mute/solo/mode words, POLY8's renderer
// flags and its Part machine byte, and group admission (no board declaration).
// Local stock MAIN required; nothing here is written back anywhere.
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
static constexpr uint32_t sp0 = 0x46c7f920, packet = 0x47010000, stop = 0x47300000, stub = 0x47300100, base = 0x47400000;
static constexpr uint32_t RATE_SITE = 0x40004100, RATE_CONT = 0x40004108, BIND_SITE = 0x40006820;
static constexpr uint32_t PROJECT_BPM24 = 0x8000181c, GATE = 0x800000dc, MUTE_STATE = 0x80000008, STATE = 0x80004898;
static constexpr uint32_t PART_MACHINES = 0x400e21e0 + 0x8ed80 + 0x22; // bank pointer the fixture sets, Part 0
static std::vector<uint8_t> load(const char *path) { std::ifstream f(path, std::ios::binary); assert(f.good()); return {(std::istreambuf_iterator<char>(f)), {}}; }
static std::map<std::string, uint32_t> names(const char *path) // nm's "address type name" lines; others skipped
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
        if (events) // what the base build writes: jmp to the generated dispatch, nop
            for (auto [site, name] : {std::pair{RATE_SITE, "modwerk_site_40004100"}, std::pair{BIND_SITE, "modwerk_site_40006820"}}) {
                m.write16(site, 0x4ef9); m.write32(site + 2, sym.at(name)); m.write16(site + 6, 0x4e71);
            }
    }
    // Run from `entry` with (sp) = stop and `args` above it, until `until`; regs[r] preset (D0..A6).
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
    // 1 installed; else minus the refusal.
    int install(const std::vector<uint8_t>& b)
    {
        for (unsigned i = 0; i < b.size(); i++) m.write8(packet + i, b[i]);
        if (!call("modwerk_backend_prepare", {0, packet, uint32_t(b.size())})) return -int(call("modwerk_runtime_refusal"));
        assert(call("modwerk_backend_publish", {0}) == 1 && call("modwerk_backend_retire", {0}) == 1);
        return 1;
    }
    // The increment builder at 0x40004100: acc0 holds `acc`, d6 the shift, d3 rate_gate's sample tempo, a3 the
    // track's state, the track at 52(sp). Returns the registers at 0x40004108 and the stored increment.
    std::vector<uint32_t> increment(uint32_t acc, uint32_t shift, uint32_t track, uint32_t d3)
    {
        const uint32_t state = STATE + 40 * track;
        m.write16(stub, 0x203c); m.write32(stub + 2, acc); m.write16(stub + 6, 0xa100); // move.l #acc,d0; move.l d0,acc0
        m.write16(stub + 8, 0x4ef9); m.write32(stub + 10, RATE_SITE); m.write32(state + 36, 0xdeadbeef);
        std::vector<uint32_t> args(13, 0); args[12] = track;
        std::map<int, uint32_t> regs{{1, 0x11111111}, {2, 0x22222222}, {3, d3}, {4, 0x44444444}, {5, 0x55555555}, {6, shift},
                                     {7, 0x77777777}, {8, 0x88888888}, {9, 0x99999999}, {10, 0xaaaaaaaa}, {11, state},
                                     {12, 0xcccccccc}, {13, 0xdddddddd}, {14, 0xeeeeeeee}};
        auto out = run(stub, args, RATE_CONT, regs);
        out.push_back(m.read32(state + 36));
        return out;
    }
    uint32_t reset_count(uint32_t track) { return m.read32(0x80004a68 + 168 * track); } // stock's reset counts here
};

struct Pkt { std::vector<uint8_t> b; std::map<std::string, uint32_t> sym; uint32_t id() const { return be(b, 28); } };

int main(int argc, char **argv)
{
    // stock, events image + symbols, legacy image + symbols, then old/new packets: repitch, mute-modes, group, group symbols
    assert(argc == 14);
    auto stock = load(argv[1]);
    auto ev_code = load(argv[2]); auto ev_sym = names(argv[3]); auto old_code = load(argv[4]); auto old_sym = names(argv[5]);
    Pkt oldR{load(argv[6])}, oldM{load(argv[7])}, oldP{load(argv[8]), names(argv[9])};
    Pkt newR{load(argv[10])}, newM{load(argv[11])}, newP{load(argv[12]), names(argv[13])};
    unsigned scenarios = 0;

    // ---- ev_play_increment ---------------------------------------------------------------------------------------
    const uint32_t acc = 0x12345678, shift = 2, unity = 0x04000000, sample = 2400, project = 2880; // 100 / 120 BPM x24
    auto expect_repitch = [&](uint32_t inc) {
        uint32_t q = inc / sample, r = inc - q * sample, out = q * project + (r * project) / sample;
        return out > 0x08000000 ? 0x08000000u : out;
    };
    auto setup = [&](Probe& p) { p.m.write32(PROJECT_BPM24, project); p.m.write8(PART_MACHINES + 2, 5); }; // track 2 POLY
    std::map<std::string, std::vector<uint32_t>> rate; // config -> d0 at the continuation per (track 1 Repitch, track 2 POLY, track 3 plain)
    auto rates = [&](Probe& p, const char *config, uint32_t group) {
        std::vector<uint32_t> r;
        for (auto [track, d3] : {std::pair{1u, sample}, std::pair{2u, sample}, std::pair{3u, 0u}}) {
            auto out = p.increment(acc, shift, track, d3);
            CHECK(out[16] == out[0] && out[15] == sp0); // stored what it continues with; stack balanced
            const uint32_t kept[] = {0, 0x11111111, 0x22222222, d3, 0x44444444, 0x55555555, shift, 0x77777777, 0x88888888, 0x99999999,
                                     0xaaaaaaaa, STATE + 40 * track, 0xcccccccc, 0xdddddddd, 0xeeeeeeee};
            for (unsigned k = 1; k < 15; k++) CHECK(out[k] == kept[k]);            // d1-d7/a0-a6 as the builder had them
            r.push_back(out[0]);
            if (group) r.push_back(p.m.read32(group + 4 * track)); // poly_track_inc[track]
        }
        rate[config] = r; ++scenarios;
    };
    { Probe p(stock, ev_code, ev_sym, true); setup(p); rates(p, "events/none", 0); }
    { Probe p(stock, old_code, old_sym, false); setup(p); CHECK(p.install(oldR.b) == 1); rates(p, "legacy/repitch-raw", 0); }
    { Probe p(stock, ev_code, ev_sym, true); setup(p); CHECK(p.install(newR.b) == 1); rates(p, "events/repitch", 0); }
    { Probe p(stock, old_code, old_sym, false); setup(p); CHECK(p.install(oldP.b) == 1);
      rates(p, "legacy/poly8-raw", p.call("fixture_image", {oldP.id()}) + oldP.sym.at("poly_track_inc")); }
    { Probe p(stock, ev_code, ev_sym, true); setup(p); CHECK(p.install(newP.b) == 1);
      rates(p, "events/poly8", p.call("fixture_image", {newP.id()}) + newP.sym.at("poly_track_inc")); }
    for (unsigned order = 0; order < 2; ++order) {
        Probe p(stock, ev_code, ev_sym, true); setup(p);
        CHECK(p.install(order ? newR.b : newP.b) == 1 && p.install(order ? newP.b : newR.b) == 1);
        rates(p, order ? "events/repitch+poly8" : "events/poly8+repitch", p.call("fixture_image", {newP.id()}) + newP.sym.at("poly_track_inc"));
    }
    { Probe p(stock, old_code, old_sym, false); setup(p); CHECK(p.install(oldP.b) == 1 && p.install(oldR.b) == -3); } // RUNTIME_CONFLICT
    { Probe p(stock, ev_code, ev_sym, true); CHECK(p.install(oldR.b) == -9 && p.call("modwerk_runtime_refused_event") == 4);
      CHECK(p.install(oldP.b) == -9 && p.install(oldM.b) == -9 && p.call("modwerk_runtime_active") == 0); } // RUNTIME_EVENT
    const uint32_t plain = acc >> shift, scaled = expect_repitch(plain);
    CHECK((rate["events/none"] == std::vector<uint32_t>{plain, plain, plain}));
    CHECK((rate["legacy/repitch-raw"] == std::vector<uint32_t>{scaled, scaled, plain}));
    CHECK(rate["events/repitch"] == rate["legacy/repitch-raw"]);
    CHECK((rate["legacy/poly8-raw"] == std::vector<uint32_t>{plain, unity, unity, plain, plain, unity}));
    CHECK(rate["events/poly8"] == rate["legacy/poly8-raw"]);
    // Together: POLY8 takes its track (Repitch never sees it, even with a sample tempo in d3), Repitch the others.
    CHECK((rate["events/poly8+repitch"] == std::vector<uint32_t>{scaled, unity, unity, plain, plain, unity}));
    CHECK(rate["events/repitch+poly8"] == rate["events/poly8+repitch"]);

    // ---- ev_voice_bind / ev_voice_bind_run ------------------------------------------------------------------------
    // Per scenario, for tracks 0..7 and the all-tracks call 8: did stock's reset run (its counter), and were the
    // track's POLY extension voices discarded (dirty cleared) / the selected extension stopped.
    struct Bind { uint32_t gate, muted, selector, rendering; };
    auto binds = [&](Probe& p, const Pkt *group, const Bind& b) {
        std::vector<uint32_t> out;
        p.m.write32(GATE, b.gate); p.m.write32(MUTE_STATE, b.muted << 8);
        uint32_t image = group ? p.call("fixture_image", {group->id()}) : 0;
        for (uint32_t track = 0; track <= 8; ++track) {
            if (image) {
                p.m.write32(image + group->sym.at("poly_voice_selector"), b.selector);
                p.m.write32(image + group->sym.at("poly_rendering"), b.rendering);
                for (unsigned t = 0; t < 8; t++) p.m.write8(image + group->sym.at("dirty") + t, 1);
                p.m.write8(image + group->sym.at("poly_extra_voices") + 168 * 4, 0x5a); // extension voice 5's active byte
            }
            uint32_t before[8]; for (unsigned t = 0; t < 8; t++) before[t] = p.reset_count(t);
            auto r = p.run(BIND_SITE, {track}, stop, {{2, 0x22222222}, {3, 0x33333333}, {10, 0xaaaaaaaa}});
            CHECK(r[2] == 0x22222222 && r[3] == 0x33333333 && r[10] == 0xaaaaaaaa && r[15] == sp0 + 4); // rts popped its return
            uint32_t ran = 0, cleared = 0;
            for (unsigned t = 0; t < 8; t++) {
                ran |= (p.reset_count(t) - before[t]) << t;
                if (image) cleared |= (p.m.read8(image + group->sym.at("dirty") + t) == 0) << t;
            }
            out.push_back(ran); out.push_back(cleared);
            out.push_back(image ? p.m.read8(image + group->sym.at("poly_extra_voices") + 168 * 4) : 0);
        }
        ++scenarios; return out;
    };
    const Bind cases[] = {{0, 0, 0, 0}, {2, 0x28, 0, 0}, {1, 0x28, 0, 0}, {2, 0x28, 5, 0}, {2, 0x28, 0, 1}, {3, 0x28, 0, 0}};
    for (const Bind& c : cases) {
        std::vector<uint32_t> mmOld, mmNew, pOld, pNew, both[2], none;
        { Probe p(stock, ev_code, ev_sym, true); none = binds(p, nullptr, c); }
        { Probe p(stock, old_code, old_sym, false); CHECK(p.install(oldM.b) == 1); mmOld = binds(p, nullptr, c); }
        { Probe p(stock, ev_code, ev_sym, true); CHECK(p.install(newM.b) == 1); mmNew = binds(p, nullptr, c); }
        { Probe p(stock, old_code, old_sym, false); CHECK(p.install(oldP.b) == 1); pOld = binds(p, &oldP, c); }
        { Probe p(stock, ev_code, ev_sym, true); CHECK(p.install(newP.b) == 1); pNew = binds(p, &newP, c); }
        for (unsigned order = 0; order < 2; ++order) {
            Probe p(stock, ev_code, ev_sym, true);
            CHECK(p.install(order ? newM.b : newP.b) == 1 && p.install(order ? newP.b : newM.b) == 1);
            both[order] = binds(p, &newP, c);
        }
        { Probe p(stock, old_code, old_sym, false); CHECK(p.install(oldP.b) == 1 && p.install(oldM.b) == -3); }
        CHECK(mmNew == mmOld && pNew == pOld && both[0] == both[1]);
        const bool gated = c.gate == 1 || c.gate == 2;
        for (uint32_t track = 0; track <= 8; ++track) {
            const uint32_t self = track < 8 ? 1u << track : 0xffu, silenced = gated ? c.muted : 0;
            CHECK(none[3 * track] == self);
            CHECK(mmNew[3 * track] == (self & ~silenced));                                 // Mute Modes alone
            // POLY8 alone: a selected extension voice stops instead of the reset; while it renders, stock's reset.
            CHECK(pNew[3 * track] == (c.selector ? 0 : self));
            CHECK(pNew[3 * track + 1] == (c.selector || c.rendering ? 0 : self));
            CHECK(pNew[3 * track + 2] == (c.selector == 5 ? 0 : 0x5a));
            // Together: POLY8's renderer first (its stop, or stock at once, where Mute Modes' own raw mt_trig at
            // 0x40006844 still drops a silenced track), then the mute gate, and only a reset that runs discards
            // the extension voices, as the native POLY8 + Mute Modes composition does.
            CHECK(both[0][3 * track] == (c.selector ? 0 : self & ~silenced));
            CHECK(both[0][3 * track + 1] == (c.selector || c.rendering ? 0 : self & ~silenced));
            CHECK(both[0][3 * track + 2] == pNew[3 * track + 2]);
        }
    }
    std::printf("{\"scenarios\":%u,\"checks\":%u,\"failures\":%u,\"rates\":{", scenarios, checks, failures);
    bool first = true;
    for (auto& [k, v] : rate) { std::printf("%s\"%s\":[", first ? "" : ",", k.c_str()); for (unsigned i = 0; i < v.size(); i++) std::printf("%s%u", i ? "," : "", v[i]); std::printf("]"); first = false; }
    std::printf("},\"oldBothRefused\":\"RUNTIME_CONFLICT\",\"oldOnEventBase\":\"RUNTIME_EVENT\",\"synthetic\":[\"site registers and stack\",\"mute/mode words\",\"POLY8 renderer flags and Part machine byte\",\"group admission\"],\"emulator\":true,\"hardware\":false}\n");
    return failures ? 1 : 0;
}
