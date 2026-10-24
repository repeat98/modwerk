// SPDX-License-Identifier: MIT
// Original synthetic pool fixtures; private hash-bound stock supplied at runtime.
// No project, filesystem, scheduler, DSP or device runs. No callees are mocked.
// Session callbacks and their lock/identity are synthetic, not native hooks.
#include <algorithm>
#include <array>
#include <cstdio>
#include <fstream>
#include <functional>
#include <iterator>
#include <stdexcept>
#include <vector>
#include "machine.h"
#include "mc68k/Musashi/m68k.h"
#include "mc68k/cpuState.h"
extern "C" {
#include "../preview_session.h"
}
namespace {
constexpr uint32_t stack = 0x47100000, stop = 0x47300000;
constexpr uint32_t pool = 0x40a955e0, pageBytes = 6144;
constexpr uint32_t controls = 0x46c922c4, dirty = 0x46c93c28;
constexpr uint32_t pageList = 0x46c2e9c0, offsets = 0x46c2e580, counts = 0x46c75e88;
constexpr std::array<unsigned, 3> pages{3, 7, 2};
constexpr std::array<m68k_register_t, 11> saved{
    M68K_REG_D2, M68K_REG_D3, M68K_REG_D4, M68K_REG_D5, M68K_REG_D6,
    M68K_REG_D7, M68K_REG_A2, M68K_REG_A3, M68K_REG_A4, M68K_REG_A5, M68K_REG_A6};
void require(bool ok, const char* msg) { if (!ok) throw std::runtime_error(msg); }
struct Probe {
    ot::Machine m;
    explicit Probe(const std::vector<uint8_t>& image) : m(image) {}
    uint32_t reg(m68k_register_t r) { return m68k_get_reg(m.getCpuState(), r); }
    void reg(m68k_register_t r, uint32_t v) { m68k_set_reg(m.getCpuState(), r, v); }
    uint32_t run(uint32_t entry, std::initializer_list<uint32_t> args,
                 uint32_t sr = 0x2700, const std::function<void()>& observe = {}) {
        reg(M68K_REG_SR, sr); reg(M68K_REG_SP, stack); m.write32(stack, stop);
        for (unsigned i = 0; i < saved.size(); ++i) reg(saved[i], 0x12340000+i);
        unsigned i = 0;
        for (auto a : args) m.write32(stack+4+4*i++, a);
        reg(M68K_REG_PC, entry);
        unsigned steps = 0;
        while (m.pc() != stop && ++steps < 2000000) {
            if (!m.step()) throw std::runtime_error("CPU stopped: " + m.why());
            if (observe) observe();
        }
        require(m.pc() == stop && reg(M68K_REG_SP) == stack+4, "return/budget differs");
        require(reg(M68K_REG_SR) >> 8 == sr >> 8, "interrupt mask not restored");
        for (unsigned n = 0; n < saved.size(); ++n)
            require(reg(saved[n]) == 0x12340000+n, "callee-saved register changed");
        return reg(M68K_REG_D0);
    }
    std::vector<uint8_t> bytes(uint32_t at, unsigned size) {
        std::vector<uint8_t> v(size);
        for (unsigned i = 0; i < size; ++i) v[i] = m.read8(at+i);
        return v;
    }
    unsigned width(unsigned format) { return (format & 2 ? 2 : 3) * (format & 1 ? 2 : 1); }
    uint32_t address(unsigned format, unsigned frame) {
        unsigned framesPerPage = pageBytes/width(format);
        return pool + pages[frame/framesPerPage]*pageBytes + frame%framesPerPage*width(format);
    }
    static int32_t value(unsigned frame, unsigned channel) {
        return channel ? (int32_t(frame%17)-8)*512 : (int32_t(frame%31)-15)*256;
    }
    int32_t sample(unsigned format, unsigned frame, unsigned channel) {
        unsigned n = format & 2 ? 2 : 3;
        uint32_t at = address(format, frame)+channel*n, v = 0;
        for (unsigned b = 0; b < n; ++b) v = (v << 8) | m.read8(at+b);
        int32_t signedValue = int32_t(v) - (v & (1u << (8*n-1)) ? int32_t(1u << (8*n)) : 0);
        return n == 2 ? signedValue*256 : signedValue;
    }
    void setup(unsigned format, unsigned length) {
        m.write32(0x46105408, 1);
        m.write32(controls, format); m.write32(controls+8, 0);
        m.write32(controls+16, length); m.write32(controls+20, 41);
        m.write8(dirty, 0);
        // Authored descriptor geometry, never extracted stock table contents.
        m.write32(0x80003c20+16*format+4, pageBytes/width(format));
        m.write32(0x80003c20+16*format+8, width(format));
        m.write32(0x80006914, pageList); m.write32(0x80006918, offsets);
        m.write32(offsets, 0);
        m.write16(counts, uint16_t((length*width(format)+pageBytes-1)/pageBytes));
        for (unsigned i = 0; i < pages.size(); ++i) {
            m.write16(pageList+2*i, pages[i]);
            for (unsigned b = 0; b < pageBytes; ++b) m.write8(pool+pages[i]*pageBytes+b, 0x5a);
        }
        unsigned sampleBytes = format & 2 ? 2 : 3;
        for (unsigned frame = 0; frame < length; ++frame)
            for (unsigned ch = 0; ch < (format & 1 ? 2u : 1u); ++ch) {
                uint32_t v = uint32_t(value(frame, ch));
                if (sampleBytes == 2) v >>= 8;
                for (unsigned b = 0; b < sampleBytes; ++b)
                    m.write8(address(format, frame)+ch*sampleBytes+b, v >> (8*(sampleBytes-1-b)));
            }
    }
};
struct Backend {
    Probe& p;
    bs_preview_guard guard{};
    bs_preview_session session{};
    bool held = false;
    unsigned copies = 0, pending = 0, changeAfterCopy = 0;
    uint32_t sampleGeneration = 1;
    explicit Backend(Probe& probe, unsigned format) : p(probe) {
        const unsigned edge = pageBytes/p.width(format), length = 2*edge+17;
        p.setup(format, length);
        p.m.write32(0x100b14f0 + 300, edge-8); p.m.write32(0x100b14f0 + 304, length);
        p.m.write32(0x100b14f0 + 308, edge-8); p.m.write32(0x100b14f0 + 1092, 1);
        p.m.write32(0x100b14f0 + 312, edge+100); p.m.write32(0x100b14f0 + 316, edge+200);
        p.m.write32(0x100b14f0 + 320, 0xffffffffu);
        bs_guard_init(&guard); require(bs_guard_enable(&guard), "synthetic guard enable failed");
        bs_session_init(&session, &guard, &ops, this);
    }
    static int lock(void* ctx) {
        auto& b = *static_cast<Backend*>(ctx);
        require(!b.held, "reentrant backend lock"); b.held = true; return 1;
    }
    static void unlock(void* ctx) {
        auto& b = *static_cast<Backend*>(ctx);
        require(b.held, "unbalanced backend unlock"); b.held = false;
    }
    static bs_provider_reply capture(void* ctx, bs_source_snapshot* out) {
        auto& b = *static_cast<Backend*>(ctx); auto& m = b.p.m;
        require(b.held, "snapshot outside ownership");
        if (!m.read32(0x46105408) || m.read32(controls+8) != 0) return BS_PROVIDER_UNSUPPORTED;
        const auto format = m.read32(controls);
        if (format > 3) return BS_PROVIDER_UNSUPPORTED;
        // Identity, rate and tempos are authored fixture metadata, not getters
        // established from the native editor/transport. Actual stock control,
        // marker and trim fields are read from synthetic firmware memory.
        out->owner_id = 1; out->owner_generation = 1; out->sample_id = 1;
        out->sample_generation = b.sampleGeneration; out->editor_generation = 1;
        out->kind = BS_SOURCE_FLEX; out->slot = 0; out->frames = m.read32(controls+16);
        out->sample_rate = 8000; out->sample_bpm24 = 2880; out->project_bpm24 = 2160;
        out->playback_generation = 1;
        out->format.bits = format & 2 ? 16 : 24; out->format.channels = format & 1 ? 2 : 1;
        out->format.little_endian = 0;
        out->trim_start = m.read32(0x100b14f0 + 300); out->trim_end = m.read32(0x100b14f0 + 304);
        out->loop = m.read32(0x100b14f0 + 308); out->marker_count = m.read32(0x100b14f0 + 1092);
        if (out->marker_count > 64) return BS_PROVIDER_UNSUPPORTED;
        for (unsigned i = 0; i < out->marker_count; ++i) {
            out->markers[i].start = m.read32(0x100b14f0 + 312+12*i);
            out->markers[i].end = m.read32(0x100b14f0 + 316+12*i);
            out->markers[i].loop = m.read32(0x100b14f0 + 320+12*i);
        }
        return BS_PROVIDER_READY;
    }
    static bs_provider_reply copyReady(void* ctx, const bs_source_snapshot* source,
            const bs_pcm_read* request, uint8_t* out, uint32_t capacity, uint32_t* bytes) {
        auto& b = *static_cast<Backend*>(ctx);
        require(b.held && bs_guard_valid(&b.guard, &b.session.token), "copy outside valid ownership");
        if (b.pending) { --b.pending; return BS_PROVIDER_PENDING; }
        const auto ptr = b.p.run(0x4009499c, {source->slot, request->first, 1});
        const auto count = std::min(request->count, b.p.reg(M68K_REG_D1));
        const auto width = source->format.bits/8*source->format.channels;
        require(count && count <= 32 && count*width <= capacity && ptr >= pool &&
                ptr <= pool+8*pageBytes && count*width <= pool+8*pageBytes-ptr, "stock lookup escaped fixture pages");
        for (unsigned i = 0; i < count*width; ++i) out[i] = b.p.m.read8(ptr+i);
        *bytes = count*width; ++b.copies;
        if (b.changeAfterCopy) b.p.m.write32(0x100b14f0 + 316, b.p.m.read32(0x100b14f0 + 316)+1);
        return BS_PROVIDER_READY;
    }
    static const bs_preview_backend ops;
    void start(unsigned snap) {
        const bs_preview_options options{1, snap, BS_SAMPLE_BPM};
        require(bs_session_begin(&session, &options) == BS_SESSION_RUNNING, "session capture failed");
    }
    bs_session_state complete() {
        bs_session_state state = BS_SESSION_RUNNING;
        unsigned budget = 0;
        while ((state == BS_SESSION_RUNNING || state == BS_SESSION_WAITING) && ++budget < 20000)
            state = bs_session_step(&session);
        require(budget < 20000 && !held, "session budget/lock differs");
        return state;
    }
    void firstCopy() {
        unsigned budget = 0;
        while (!copies && ++budget < 20000) {
            auto state = bs_session_step(&session);
            require(state == BS_SESSION_RUNNING || state == BS_SESSION_WAITING, "early session finish");
        }
        require(copies && !held, "no copied block");
    }
    void writer(uint32_t entry, std::initializer_list<uint32_t> args) {
        lock(this); const auto ticket = bs_guard_writer_begin(&guard);
        require(ticket, "writer ticket refused"); p.run(entry, args);
        require(bs_guard_writer_end(&guard, ticket), "writer return mismatch"); unlock(this);
    }
};
const bs_preview_backend Backend::ops{Backend::lock, Backend::unlock, Backend::capture, Backend::copyReady};
int oracle(void* context, uint32_t frame, int32_t out[2]) {
    const auto format = *static_cast<unsigned*>(context);
    out[0] = Probe::value(frame, 0); out[1] = format & 1 ? Probe::value(frame, 1) : out[0];
    return 0;
}
bool samePlan(const bs_plan& a, const bs_plan& b) {
    if (a.count != b.count || a.bpm24 != b.bpm24 || a.end_needs_fade != b.end_needs_fade) return false;
    for (unsigned i = 0; i < BS_MAX_SLICES; ++i)
        if (a.starts[i] != b.starts[i] || a.needs_fade[i] != b.needs_fade[i]) return false;
    return true;
}
void previews(const std::vector<uint8_t>& image) {
    for (unsigned format = 0; format < 4; ++format) for (unsigned snap = 0; snap < 2; ++snap) {
        Probe p(image); Backend b(p, format);
        const auto audio = p.bytes(pool, 8*pageBytes), controlsBefore = p.bytes(controls, 44);
        const auto metadata = p.bytes(0x100b14f0 + 300, 796);
        const unsigned marker = pageBytes/p.width(format)+100;
        bs_request request{}; request.sample_rate = 8000; request.sample_bpm24 = 2880;
        request.beats = 1; request.snap = snap; request.tempo_source = BS_SAMPLE_BPM;
        request.trim_start = pageBytes/p.width(format)-8; request.trim_end = 2*pageBytes/p.width(format)+17;
        request.existing_count = 1; request.existing = &marker; request.read = oracle; request.context = &format;
        bs_plan expected{}, actual{};
        require(bs_preview(&request, &expected) == BS_OK, "reference plan failed");
        b.start(snap); require(b.complete() == BS_SESSION_READY, "pool session did not finish");
        require(bs_session_result(&b.session, &actual) && samePlan(expected, actual), "pool session plan differs");
        require(b.copies >= 3 && p.bytes(pool, 8*pageBytes) == audio && p.bytes(controls, 44) == controlsBefore &&
                p.bytes(0x100b14f0 + 300, 796) == metadata, "read session changed source or missed page coverage");
    }
}
void edits(const std::vector<uint8_t>& image) {
    for (unsigned format = 0; format < 4; ++format) {
        Probe p(image); Backend b(p, format); b.start(1); b.firstCopy();
        const auto controlBefore = p.bytes(controls, 44), audioBefore = p.bytes(pool, 8*pageBytes);
        const auto copies = b.copies;
        b.writer(0x40095560, {0, b.session.snapshot.trim_start, b.session.snapshot.trim_start+4, 0});
        require(p.bytes(controls, 44) == controlBefore && p.bytes(pool, 8*pageBytes) != audioBefore,
                "stock edit did not change PCM independently of control");
        require(bs_session_step(&b.session) == BS_SESSION_STALE && b.copies == copies,
                "stock PCM edit did not retire session");
        require(!b.held, "edit left backend locked");
    }
}
void metadata(const std::vector<uint8_t>& image) {
    for (unsigned mode = 0; mode < 3; ++mode) {
        Probe p(image); Backend b(p, 3); b.start(0); require(b.complete() == BS_SESSION_READY, "preview failed");
        Backend::lock(&b);
        if (mode == 0) p.m.write32(0x100b14f0 + 316, p.m.read32(0x100b14f0 + 316)+1);
        if (mode == 1) p.m.write32(0x100b14f0 + 308, p.m.read32(0x100b14f0 + 308)+1);
        if (mode == 2) ++b.sampleGeneration;
        Backend::unlock(&b);
        bs_plan out{}; out.count = 123456;
        require(!bs_session_result(&b.session, &out) && out.count == 123456 && b.session.state == BS_SESSION_STALE,
                "metadata change published old result");
    }
}
void released(const std::vector<uint8_t>& image) {
    Probe p(image); Backend b(p, 3);
    p.m.write32(0x8000691c, 3); p.m.write32(0x80006920, 14602);
    b.start(0); b.firstCopy();
    b.writer(0x40096300, {0});
    require(bs_session_step(&b.session) == BS_SESSION_STALE, "released source kept preview");
    const bs_preview_options options{1, 0, BS_SAMPLE_BPM};
    require(bs_session_begin(&b.session, &options) == BS_SESSION_UNSUPPORTED && !b.held,
            "empty released slot admitted a new session");
}
void pendingAndMidcopy(const std::vector<uint8_t>& image) {
    Probe p(image); Backend b(p, 3); b.pending = 1; b.start(1);
    unsigned budget = 0;
    while (b.pending && ++budget < 20000) (void)bs_session_step(&b.session);
    require(!b.pending && !b.copies && b.session.reader.waiting && !b.held, "pending copy consumed data");
    b.changeAfterCopy = 1;
    require(b.complete() == BS_SESSION_STALE && !b.session.reader.cache_count, "mid-copy metadata change accepted PCM");
}
}
int main(int argc, char** argv) {
    std::printf("SOURCE_SHA256: %s\n", PROBE_SOURCE_SHA);
    if (argc != 2) return 2;
    std::ifstream in(argv[1], std::ios::binary);
    std::vector<uint8_t> image{std::istreambuf_iterator<char>(in), {}};
    if (image.size() != 1112560) return 2;
    try {
        previews(image); std::puts("PASS: eight pool-backed sessions match reference plans without source changes");
        edits(image); std::puts("PASS: four actual stock gain edits retire partial sessions despite unchanged controls");
        metadata(image); std::puts("PASS: three completed previews reject changed record/loop/sample identity");
        released(image); std::puts("PASS: actual stock release retires old preview and refuses new empty-slot admission");
        pendingAndMidcopy(image); std::puts("PASS: pending copy yields and copy-time metadata change discards the block");
    } catch (const std::exception& e) { std::fprintf(stderr, "FAIL: %s\n", e.what()); return 1; }
    return 0;
}
