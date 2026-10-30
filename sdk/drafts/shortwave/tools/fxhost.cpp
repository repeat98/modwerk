// SPDX-License-Identifier: GPL-3.0-or-later
// fxhost: one Octatrack DSP insert, alone, on the vendored dsp56kEmu, with no firmware image.
//
// It loads the module's own assembled words (dsp_asm -out) and its P table, calls init once and proc for every
// block through the effect ABI octabam's dsp_host recovered (docs/remixer/HARNESS.md):
//   r0 = the audio block, interleaved stereo, processed in place (X:0, as the dispatcher passes it)
//   n7 = frames, r6 = the parameter record, r7 = the instance's state block
//   x:(r6+0..5) page 1 as value << 16; r6+$c/$d/$e page 2, even slots in bits 16-23, odd in 8-15;
//   tempo24 << 8 at r6+$13; X:$213 points at the word holding the allocator's Y buffer base.
// A trig split (-split K) makes two calls of a block, K frames at r0 = 0 then the rest at r0 = 2K.
// Every word outside the audio block, the state block ($84 words), the parameter record and the declared Y buffer
// is filled with a marker and checked after every call (-guard); -dirty fills the state block and the buffer with
// garbage first, as the hardware never zeroes them. It reports the most instructions and cycles one call took.
//
//   fxhost -code m.bin -org 2000 -init 2000 -proc 2008 [-ptable t.bin -ptbase 3000] -in in.raw -out out.raw
//          [-p 0,64,...] [-events ev.txt] [-tempo 120] [-ybase 4000 -ywords 3dfe] [-dirty 1] [-split 5] [-guard]
// in.raw / out.raw: interleaved stereo int32 holding 24-bit samples. ev.txt: "block slot value" per line.
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <iostream>
#include <memory>
#include <string>
#include <vector>

#include "dsp56kEmu/dsp.h"
#include "dsp56kEmu/memory.h"
#include "dsp56kEmu/peripherals.h"

using namespace dsp56k;

namespace {
class AllowAll : public IMemoryValidator {
public:
    bool memValidateAccess(EMemArea, TWord, bool) const override { return true; }
};

const TWord SENTINEL = 0x03f000, PARAMS = 0x1000, STATE = 0x6200, STATE_WORDS = 0x84, ALLOC = 0x7000;
const TWord MARK = 0x5a5a5a;

std::vector<TWord> words(const std::string& path) {
    std::ifstream f(path, std::ios::binary);
    std::vector<unsigned char> b((std::istreambuf_iterator<char>(f)), std::istreambuf_iterator<char>());
    std::vector<TWord> w;
    for (size_t i = 0; i + 2 < b.size(); i += 3) w.push_back(b[i] | (b[i + 1] << 8) | (b[i + 2] << 16));
    return w;
}

struct Event { int block, slot, value; };

uint64_t g_maxInstr = 0, g_maxCycles = 0;
int g_trace = 0;

bool call(DSP& dsp, TWord pc, const char* what) {
    dsp.setPC(SENTINEL);
    dsp.jsr(pc);
    const uint64_t i0 = dsp.getInstructionCounter(), c0 = dsp.getCycles();
    for (uint32_t i = 0; i < 2000000; ++i) {
        if (dsp.getPC().toWord() == SENTINEL) {
            g_maxInstr = std::max<uint64_t>(g_maxInstr, dsp.getInstructionCounter() - i0);
            g_maxCycles = std::max<uint64_t>(g_maxCycles, dsp.getCycles() - c0);
            return true;
        }
        if (g_trace > 0) {
            --g_trace;
            std::fprintf(stderr, "pc=%06x r0=%06x r4=%06x lc=%06x a=%014llx b=%014llx x0=%06x\n", dsp.getPC().toWord(),
                         dsp.regs().r[0].var & 0xffffff, dsp.regs().r[4].var & 0xffffff, dsp.regs().lc.var & 0xffffff,
                         static_cast<unsigned long long>(dsp.regs().a.var & 0xffffffffffffffull),
                         static_cast<unsigned long long>(dsp.regs().b.var & 0xffffffffffffffull),
                         static_cast<unsigned>(dsp.regs().x.var & 0xffffff));
        }
        dsp.execInterpreter();
    }
    std::fprintf(stderr, "%s: no rts (pc=%06x)\n", what, dsp.getPC().toWord());
    return false;
}

uint32_t rng = 0x12345678;
TWord garbage() { rng = rng * 1664525u + 1013904223u; return (rng >> 8) & 0xffffff; }
}  // namespace

int main(int argc, char** argv) {
    std::string code, ptable, in, out, events;
    TWord org = 0x2000, init = 0x2000, proc = 0x2000, ptbase = 0x3000, ybase = 0x4000, ywords = 0;
    int frames = 16, split = 0, dirty = 0;
    bool guard = false, mono = false;
    int dump = 0;
    double tempo = 120.0;
    std::vector<int> p(12, 0);
    for (int i = 1; i < argc; ++i) {
        std::string k = argv[i];
        auto v = [&]() { return std::string(argv[++i]); };
        auto hex = [&]() { return static_cast<TWord>(strtoul(argv[++i], nullptr, 16)); };
        if (k == "-code") code = v();
        else if (k == "-org") org = hex();
        else if (k == "-init") init = hex();
        else if (k == "-proc") proc = hex();
        else if (k == "-ptable") ptable = v();
        else if (k == "-ptbase") ptbase = hex();
        else if (k == "-in") in = v();
        else if (k == "-out") out = v();
        else if (k == "-events") events = v();
        else if (k == "-tempo") tempo = atof(argv[++i]);
        else if (k == "-ybase") ybase = hex();
        else if (k == "-ywords") ywords = hex();
        else if (k == "-frames") frames = atoi(argv[++i]);
        else if (k == "-split") split = atoi(argv[++i]);
        else if (k == "-dirty") dirty = atoi(argv[++i]);
        else if (k == "-guard") guard = true;
        else if (k == "-mono") mono = true;
        else if (k == "-dump") dump = atoi(argv[++i]);
        else if (k == "-trace") g_trace = atoi(argv[++i]);
        else if (k == "-p") {
            std::string s = v(); size_t at = 0;
            for (int j = 0; j < 12 && at <= s.size(); ++j) {
                const size_t c = s.find(',', at);
                p[j] = atoi(s.substr(at, c == std::string::npos ? std::string::npos : c - at).c_str());
                if (c == std::string::npos) break;
                at = c + 1;
            }
        } else { std::fprintf(stderr, "unknown option %s\n", k.c_str()); return 2; }
    }
    if (code.empty() || in.empty() || out.empty()) { std::fprintf(stderr, "usage: see the header\n"); return 2; }

    AllowAll validator;
    Memory mem(validator, 0x080000, 0x800000, 0x200000);
    Peripherals56362 px;
    Peripherals56367 py;
    DSP dsp(mem, &px, &py);

    // every word we watch starts as the marker
    for (TWord a = 0; a < 0xc000; ++a) mem.set(MemArea_X, a, MARK);
    for (TWord a = 0; a < 0x10000; ++a) mem.set(MemArea_Y, a, MARK);
    auto cw = words(code);
    for (size_t i = 0; i < cw.size(); ++i) mem.set(MemArea_P, org + static_cast<TWord>(i), cw[i]);
    if (!ptable.empty()) {
        auto tw = words(ptable);
        for (size_t i = 0; i < tw.size(); ++i) mem.set(MemArea_P, ptbase + static_cast<TWord>(i), tw[i]);
    }
    mem.set(MemArea_X, 0x213, ALLOC);
    mem.set(MemArea_X, ALLOC, ybase);
    for (TWord a = 0; a < STATE_WORDS; ++a) mem.set(MemArea_X, STATE + a, dirty ? garbage() : 0);
    for (TWord a = 0; a < ywords; ++a) mem.set(MemArea_Y, ybase + a, dirty ? garbage() : 0);

    auto setParams = [&]() {
        for (int j = 0; j < 6; ++j) mem.set(MemArea_X, PARAMS + j, (p[j] & 0x7f) << 16);
        for (int j = 0; j < 3; ++j)
            mem.set(MemArea_X, PARAMS + 0xc + j, ((p[6 + 2 * j] & 0xff) << 16) | ((p[7 + 2 * j] & 0xff) << 8));
        mem.set(MemArea_X, PARAMS + 0x13, (static_cast<TWord>(tempo * 24 + 0.5) & 0xffff) << 8);
    };
    auto watched = [&](EMemArea area, TWord a) {
        if (area == MemArea_X) {
            if (a < 2 * static_cast<TWord>(frames)) return false;
            if (a >= STATE && a < STATE + STATE_WORDS) return false;
            if (a >= PARAMS && a < PARAMS + 0x20) return false;
            if (a == 0x213 || a == ALLOC) return false;
            return true;
        }
        return !(a >= ybase && a < ybase + ywords);
    };
    int violations = 0;
    auto check = [&](const char* when, long block) {
        if (!guard) return;
        for (TWord a = 0; a < 0xc000; ++a)
            if (watched(MemArea_X, a) && mem.get(MemArea_X, a) != MARK) {
                if (violations++ < 8) std::fprintf(stderr, "guard: X:%04x written (%s, block %ld)\n", a, when, block);
                mem.set(MemArea_X, a, MARK);
            }
        for (TWord a = 0; a < 0x10000; ++a)
            if (watched(MemArea_Y, a) && mem.get(MemArea_Y, a) != MARK) {
                if (violations++ < 8) std::fprintf(stderr, "guard: Y:%04x written (%s, block %ld)\n", a, when, block);
                mem.set(MemArea_Y, a, MARK);
            }
    };

    std::vector<Event> ev;
    if (!events.empty()) {
        std::ifstream f(events);
        Event e;
        while (f >> e.block >> e.slot >> e.value) ev.push_back(e);
    }

    std::ifstream fi(in, std::ios::binary);
    std::vector<char> audio((std::istreambuf_iterator<char>(fi)), std::istreambuf_iterator<char>());
    std::vector<int32_t> samples(audio.size() / 4);
    std::memcpy(samples.data(), audio.data(), samples.size() * 4);
    if (mono) {
        std::vector<int32_t> st(samples.size() * 2);
        for (size_t i = 0; i < samples.size(); ++i) st[2 * i] = st[2 * i + 1] = samples[i];
        samples.swap(st);
    }
    const long nframes = static_cast<long>(samples.size() / 2), blocks = nframes / frames;
    std::vector<int32_t> result(static_cast<size_t>(blocks * frames * 2));

    setParams();
    auto regs = [&]() {
        for (int r = 0; r < 8; ++r) { dsp.regs().m[r].var = 0xffffff; }
        dsp.regs().r[6].var = PARAMS;
        dsp.regs().r[7].var = STATE;
    };
    regs();
    dsp.regs().r[1].var = 0x0a;   // the dispatcher's effect id: init must keep r1
    if (!call(dsp, init, "init")) return 1;
    if ((dsp.regs().r[1].var & 0xffffff) != 0x0a) { std::fprintf(stderr, "init moved r1\n"); return 1; }
    const uint64_t initInstr = g_maxInstr; g_maxInstr = 0; g_maxCycles = 0;
    check("init", -1);

    size_t e = 0;
    for (long b = 0; b < blocks; ++b) {
        bool changed = false;
        while (e < ev.size() && ev[e].block <= b) { p[ev[e].slot] = ev[e].value; ++e; changed = true; }
        if (changed) setParams();
        for (int f = 0; f < frames; ++f)
            for (int c = 0; c < 2; ++c)
                mem.set(MemArea_X, static_cast<TWord>(2 * f + c), static_cast<TWord>(samples[(b * frames + f) * 2 + c]) & 0xffffff);
        const int k = (split > 0 && split < frames) ? split : 0;
        for (int part = 0; part < (k ? 2 : 1); ++part) {
            regs();
            dsp.regs().r[0].var = part ? 2 * k : 0;
            dsp.regs().n[7].var = k ? (part ? frames - k : k) : frames;
            dsp.regs().a.var = part ? 0x010000000000ULL : 0;
            if (!call(dsp, proc, "proc")) return 1;
            check("proc", b);
        }
        if (b < dump) {
            std::fprintf(stderr, "block %ld state:", b);
            for (TWord a = 0; a < 0x28; ++a) std::fprintf(stderr, "%s%06x", a % 8 ? " " : "\n  ", mem.get(MemArea_X, STATE + a));
            std::fprintf(stderr, "\n  audio:");
            for (int f = 0; f < 2 * frames; ++f) std::fprintf(stderr, " %06x", mem.get(MemArea_X, static_cast<TWord>(f)));
            std::fprintf(stderr, "\n");
        }
        for (int f = 0; f < frames; ++f)
            for (int c = 0; c < 2; ++c) {
                int32_t s = static_cast<int32_t>(mem.get(MemArea_X, static_cast<TWord>(2 * f + c)) << 8) >> 8;
                result[(b * frames + f) * 2 + c] = s;
            }
    }
    std::ofstream fo(out, std::ios::binary);
    fo.write(reinterpret_cast<const char*>(result.data()), static_cast<std::streamsize>(result.size() * 4));
    std::printf("{\"blocks\": %ld, \"initInstructions\": %llu, \"maxInstructionsPerCall\": %llu, \"maxCyclesPerCall\": %llu, "
                "\"violations\": %d}\n", blocks, static_cast<unsigned long long>(initInstr),
                static_cast<unsigned long long>(g_maxInstr), static_cast<unsigned long long>(g_maxCycles), violations);
    return violations ? 3 : 0;
}
