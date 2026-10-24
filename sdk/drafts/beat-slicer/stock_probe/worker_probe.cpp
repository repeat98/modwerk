// SPDX-License-Identifier: MIT
// Original synthetic worker-lifetime fixtures. Private stock is loaded at run
// time; no firmware bytes, jump tables or extracted instruction bodies here.
// Only message display is mocked. No scheduler, UI consumer, DSP or device runs.
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
constexpr uint32_t callStack = 0x47100000, taskStack = 0x47110000, stop = 0x47300000;
constexpr uint32_t scratch = 0x47200000, engineQ = 0x460d17ce, uiQ = 0x460d17ae;
constexpr uint32_t post = 0x40000c3c, receive = 0x40000d00, waitEvent = 0x40000818;
constexpr uint32_t task = 0x4008445c, loop = 0x4008484e, completion = 0x40084110;
constexpr uint32_t completionPool = 0x460364e4, uiBusy = 0x460e6bcc;
constexpr uint32_t producer = 0x40074694, producerRecord = 0x460e6bd0;
constexpr uint32_t callback = 0x400752dc, display = 0x4005a2b8;
constexpr uint32_t pool = 0x40a955e0, pageBytes = 6144, controls = 0x46c922c4;
constexpr uint32_t dirty = 0x46c93c28, pageList = 0x46c2e9c0, offsets = 0x46c2e580;
void require(bool ok, const char* msg) { if (!ok) throw std::runtime_error(msg); }
struct Probe {
    ot::Machine m;
    unsigned displayCalls = 0;
    uint32_t loopSp = 0, loopFp = 0;
    explicit Probe(const std::vector<uint8_t>& image) : m(image) {
        queue(engineQ, scratch); queue(uiQ, scratch+0x100);
        for (unsigned i = 0; i < 32; ++i) m.write32(completionPool+26*i+22, 0);
        m.write32(uiBusy, 0);
    }
    uint32_t reg(m68k_register_t r) { return m68k_get_reg(m.getCpuState(), r); }
    void reg(m68k_register_t r, uint32_t v) { m68k_set_reg(m.getCpuState(), r, v); }
    void queue(uint32_t q, uint32_t ring) {
        for (unsigned i = 0; i < 32; i += 4) m.write32(q+i, 0);
        m.write32(q+16, 7); m.write32(q+20, ring);
    }
    void step() {
        require(m.pc() != callback, "UI callback ran inside worker");
        if (m.pc() == display) {
            ++displayCalls;
            auto sp = reg(M68K_REG_SP);
            reg(M68K_REG_PC, m.read32(sp)); reg(M68K_REG_SP, sp+4);
            reg(M68K_REG_D0, 0); // Explicitly omitted message presentation only.
        } else if (!m.step()) throw std::runtime_error("CPU stopped: " + m.why());
    }
    void until(uint32_t end) {
        unsigned steps = 0;
        while (m.pc() != end && ++steps < 2000000) step();
        require(m.pc() == end, "instruction budget exhausted");
    }
    uint32_t run(uint32_t entry, std::initializer_list<uint32_t> args = {}) {
        reg(M68K_REG_SR, 0x2000); reg(M68K_REG_SP, callStack);
        m.write32(callStack, stop);
        unsigned i = 0;
        for (auto a : args) m.write32(callStack+4+4*i++, a);
        constexpr std::array<m68k_register_t, 11> saved{M68K_REG_D2, M68K_REG_D3,
            M68K_REG_D4, M68K_REG_D5, M68K_REG_D6, M68K_REG_D7, M68K_REG_A2,
            M68K_REG_A3, M68K_REG_A4, M68K_REG_A5, M68K_REG_A6};
        for (unsigned n = 0; n < saved.size(); ++n) reg(saved[n], 0x12340000+n);
        reg(M68K_REG_PC, entry); until(stop);
        require(reg(M68K_REG_SP) == callStack+4 && reg(M68K_REG_SR) >> 8 == 0x20,
                "function stack or interrupt mask differs");
        for (unsigned n = 0; n < saved.size(); ++n)
            require(reg(saved[n]) == 0x12340000+n, "callee-saved register differs");
        return reg(M68K_REG_D0);
    }
    void start() {
        reg(M68K_REG_SR, 0x2000); reg(M68K_REG_SP, taskStack);
        m.write32(taskStack, stop); reg(M68K_REG_PC, task); until(loop);
        loopSp = reg(M68K_REG_SP); loopFp = reg(M68K_REG_A6);
    }
    void checkLoop() {
        require(m.pc() == loop && reg(M68K_REG_SP) == loopSp &&
                reg(M68K_REG_A6) == loopFp && reg(M68K_REG_SR) >> 8 == 0x20,
                "worker loop stack/frame/interrupt mask differs");
    }
    unsigned width(unsigned format) { return (format & 2 ? 2 : 3)*(format & 1 ? 2 : 1); }
    uint32_t address(unsigned format, unsigned frame) {
        unsigned edge = pageBytes/width(format);
        return pool+(frame < edge ? 3 : 7)*pageBytes+(frame%edge)*width(format);
    }
    int32_t sample(unsigned format, unsigned frame, unsigned ch) {
        unsigned n = format & 2 ? 2 : 3; uint32_t v = 0;
        for (unsigned b = 0; b < n; ++b) v = (v << 8) | m.read8(address(format, frame)+ch*n+b);
        int32_t signedValue = int32_t(v)-(v & (1u << (8*n-1)) ? int32_t(1u << (8*n)) : 0);
        return n == 2 ? signedValue*256 : signedValue;
    }
    void setup(unsigned format) {
        const unsigned length = pageBytes/width(format)+8;
        m.write32(0x46105408, 1);
        m.write32(controls, format); m.write32(controls+8, 0);
        m.write32(controls+16, length); m.write32(controls+20, 41); m.write8(dirty, 0);
        m.write32(0x80003c20+16*format+4, pageBytes/width(format));
        m.write32(0x80003c20+16*format+8, width(format));
        m.write32(0x80006914, pageList); m.write32(0x80006918, offsets);
        m.write32(offsets, 0); m.write16(0x46c75e88, 2);
        m.write16(pageList, 3); m.write16(pageList+2, 7);
        unsigned n = format & 2 ? 2 : 3;
        for (unsigned f = 0; f < length; ++f)
            for (unsigned ch = 0; ch < (format & 1 ? 2u : 1u); ++ch) {
                uint32_t value = ch ? 2048 : 4096;
                if (n == 2) value >>= 8;
                for (unsigned b = 0; b < n; ++b)
                    m.write8(address(format, f)+ch*n+b, value >> (8*(n-1-b)));
            }
        m.write32(0x46c8d1a0, 1); m.write32(0x46c8d19c, 0);
        m.write32(0x400cef88, scratch+0x200); m.write32(0x400cef96, scratch+0x204);
        selection(pageBytes/width(format)-2, pageBytes/width(format)+2);
    }
    void selection(uint32_t first, uint32_t end) {
        m.write32(scratch+0x200, first); m.write32(scratch+0x204, end);
    }
    void command(uint32_t record, unsigned opcode, unsigned first, unsigned end,
                 unsigned mode = 0, uint32_t cb = callback) {
        for (unsigned i = 0; i < 36; ++i) m.write8(record+i, 0);
        m.write8(record, opcode); m.write32(record+10, first); m.write32(record+14, end);
        m.write32(record+26, mode); m.write32(record+30, cb);
        run(post, {engineQ, record});
    }
    void checkCompletion(unsigned index, uint32_t result, uint32_t cb = callback) {
        auto record = m.read32(scratch+0x100+4*index);
        require(record == completionPool+26*index && m.read8(record) == 43 &&
                m.read32(record+2) == cb && m.read32(record+6) == result &&
                m.read32(record+10) == 0 && m.read32(record+22) == 1,
                "deferred completion record differs");
    }
};
struct Trace {
    Probe& p;
    bs_preview_guard guard{};
    bs_preview_token before{};
    bool active = false, returned = false, emptyDuringPcm = false;
    unsigned entries = 0, pcmStores = 0, notifications = 0;
    uint32_t returnPc = 0, result = 0;
    explicit Trace(Probe& probe) : p(probe) {
        bs_guard_init(&guard);
        require(bs_guard_enable(&guard), "synthetic guard enable failed");
        p.m.addWriteWatch(pool, pool+8*pageBytes-1,
            [this](uint32_t, uint8_t, uint32_t, uint32_t) {
                require(active && !returned && !notifications, "PCM outside writer lifetime");
                bs_preview_token rejected{123, 456};
                require(!bs_guard_revision(&guard) && !bs_guard_valid(&guard, &before) &&
                        !bs_guard_acquire(&guard, &rejected) && rejected.operation == 123,
                        "guard admitted preview during observed PCM write");
                ++pcmStores;
                if (!p.m.read32(engineQ+4)) emptyDuringPcm = true;
            });
    }
    void one(uint32_t edit, unsigned expectedNotifications = 1) {
        active = returned = emptyDuringPcm = false;
        entries = pcmStores = notifications = 0;
        require(bs_guard_acquire(&guard, &before), "pre-edit token refused");
        uint32_t ticket = 0, nestedTicket = 0, nestedReturn = 0;
        p.checkLoop();
        unsigned steps = 0;
        do {
            auto pc = p.m.pc();
            if (pc == edit) {
                require(!active && !returned, "writer reentered");
                active = true; ++entries; returnPc = p.m.read32(p.reg(M68K_REG_SP));
                ticket = bs_guard_writer_begin(&guard);
                require(ticket != 0, "writer bookkeeping refused");
            }
            // Crop calls rotation internally. A shared entry observer would
            // see both; inner completion must not reopen preview admission.
            if (edit == 0x40095cd8 && pc == 0x40094b6c) {
                nestedTicket = bs_guard_writer_begin(&guard);
                nestedReturn = p.m.read32(p.reg(M68K_REG_SP));
                require(nestedTicket && active, "nested crop rotation refused");
            }
            if (nestedTicket && pc == nestedReturn) {
                require(bs_guard_writer_end(&guard, nestedTicket) && !bs_guard_revision(&guard),
                        "nested return reopened admission before crop returned");
                nestedTicket = 0;
            }
            if (active && pc == returnPc) {
                active = false; returned = true; result = p.reg(M68K_REG_D0);
                require(!nestedTicket && bs_guard_writer_end(&guard, ticket) &&
                        !bs_guard_valid(&guard, &before) && bs_guard_revision(&guard),
                        "writer cleanup resurrected old preview or left exclusion stuck");
            }
            if (pc == completion) {
                require(returned && !active, "completion began before writer returned");
                ++notifications;
            }
            p.step();
        } while (p.m.pc() != loop && ++steps < 2000000);
        p.checkLoop();
        require(entries == 1 && returned && !active && notifications == expectedNotifications,
                "writer entry/return or completion-attempt count differs");
        bs_preview_token after{};
        require(bs_guard_acquire(&guard, &after) && after.operation > before.operation &&
                after.revision != before.revision, "post-edit identity was reused");
    }
};
void producerToWorker(const std::vector<uint8_t>& image) {
    for (unsigned format = 0; format < 4; ++format) {
        Probe p(image); p.setup(format); Trace trace(p);
        const unsigned edge = pageBytes/p.width(format), length = edge+8;
        p.run(producer);
        require(p.displayCalls == 1 && p.m.read32(uiBusy) == 1 &&
                p.m.read32(engineQ+4) == 1 && p.m.read32(scratch) == producerRecord &&
                p.m.read32(uiQ+4) == 0 && !trace.pcmStores && p.m.read8(dirty) == 0,
                "producer did not defer editing through the queue");
        require(p.m.read8(producerRecord) == 23 && p.m.read32(producerRecord+2) == 0 &&
                p.m.read32(producerRecord+10) == edge-2 && p.m.read32(producerRecord+14) == edge+2 &&
                p.m.read32(producerRecord+22) == 0 && p.m.read32(producerRecord+30) == callback,
                "producer command fields differ");
        p.start(); trace.one(0x40095560);
        require(trace.result == 1 && trace.pcmStores && trace.emptyDuringPcm &&
                p.m.read32(uiQ+4) == 1 && p.m.read32(uiBusy) == 1,
                "edit did not finish independently of UI consumption");
        p.checkCompletion(0, 1);
        for (unsigned f = 0; f < length; ++f)
            for (unsigned ch = 0; ch < (format & 1 ? 2u : 1u); ++ch)
                require(p.sample(format, f, ch) == (f >= edge-2 && f < edge+2 ? 0 : ch ? 2048 : 4096),
                        "producer/worker gain PCM differs");
    }
}
void dispatch(const std::vector<uint8_t>& image) {
    // Range/edit semantics have broader independent coverage in coherence_probe.
    // Here constant stereo PCM makes each dispatch result independently simple.
    struct Edit { unsigned opcode; uint32_t entry; unsigned mode; int32_t left, right; };
    const Edit edits[] = {{23, 0x40095560, 0, 0, 0}, {24, 0x40095774, 0, 8388352, 4194048},
        {25, 0x40095268, 0, 4096, 2048}, {26, 0x40094b6c, 0, 4096, 2048},
        {30, 0x40094dc8, 3, 2048, 4096}, {31, 0x40094c94, 2, -4096, -2048},
        {32, 0x40095394, 0, 4096, 2048}};
    for (const auto& e : edits) {
        Probe p(image); p.setup(3); Trace trace(p);
        p.command(scratch+0x300, e.opcode, 2, 6, e.mode); p.start(); trace.one(e.entry);
        require(trace.result == 1 && trace.pcmStores && trace.emptyDuringPcm,
                "dispatch writer result/lifetime differs");
        p.checkCompletion(0, 1);
        require(p.sample(3, 2, 0) == e.left && p.sample(3, 2, 1) == e.right,
                "dispatch PCM differs");
    }
}
void failures(const std::vector<uint8_t>& image) {
    for (unsigned scenario = 0; scenario < 2; ++scenario) {
        Probe p(image); p.setup(3); Trace trace(p);
        if (!scenario) p.m.write32(controls+8, 1);
        p.command(scratch+0x300, 23, 2, scenario ? 2 : 6); p.start(); trace.one(0x40095560);
        const uint32_t expected = scenario ? uint32_t(-2) : uint32_t(-3);
        require(trace.result == expected && !trace.pcmStores && p.m.read8(dirty) == 0,
                "refused command mutated PCM/dirty or returned unexpected status");
        p.checkCompletion(0, expected);
    }
}
void absentCompletion(const std::vector<uint8_t>& image) {
    for (unsigned scenario = 0; scenario < 2; ++scenario) {
        Probe p(image); p.setup(3); Trace trace(p);
        if (scenario) for (unsigned i = 0; i < 32; ++i) p.m.write32(completionPool+26*i+22, 1);
        p.command(scratch+0x300, 23, 2, 6, 0, scenario ? callback : 0);
        p.start(); trace.one(0x40095560);
        require(trace.result == 1 && trace.pcmStores && p.m.read32(uiQ+4) == 0 &&
                p.sample(3, 2, 0) == 0, "missing completion prevented mutation or enqueued UI work");
    }
}
void fifo(const std::vector<uint8_t>& image) {
    Probe p(image); p.setup(3); Trace trace(p);
    p.command(scratch+0x300, 23, 2, 4);
    p.command(scratch+0x340, 31, 4, 6, 2);
    p.start(); trace.one(0x40095560);
    require(p.m.read32(engineQ+4) == 1 && !trace.emptyDuringPcm &&
            p.sample(3, 2, 0) == 0 && p.sample(3, 4, 0) == 4096,
            "first queued edit changed second range");
    trace.one(0x40094c94);
    require(p.m.read32(engineQ+4) == 0 && trace.emptyDuringPcm &&
            p.m.read32(uiQ+4) == 2 && p.sample(3, 4, 0) == -4096,
            "second queued edit did not run after first");
    p.checkCompletion(0, 1); p.checkCompletion(1, 1);
}
void reusedMessage(const std::vector<uint8_t>& image) {
    Probe p(image); p.setup(3); Trace trace(p);
    // Deliberately bypass the outer panel preflight twice. This is an ownership
    // counterexample for a proposed integration, NOT a reachable stock UI bug.
    p.selection(2, 4); p.run(producer);
    p.selection(4, 6); p.run(producer);
    require(p.m.read32(engineQ+4) == 2 && p.m.read32(scratch) == producerRecord &&
            p.m.read32(scratch+4) == producerRecord, "queue unexpectedly copied command payload");
    p.start(); trace.one(0x40095560); trace.one(0x40095560);
    require(p.sample(3, 2, 0) == 4096 && p.sample(3, 4, 0) == 0,
            "reused message did not resolve to last written payload");
    p.checkCompletion(0, 1); p.checkCompletion(1, 1);
}
void copyAndCrop(const std::vector<uint8_t>& image) {
    for (unsigned opcode : {27u, 29u}) {
        Probe p(image); p.setup(3);
        const unsigned length = pageBytes/4+8;
        p.command(scratch+0x300, opcode, 2, opcode == 27 ? 66 : 6);
        // Copy uses source and destination slot zero, a disjoint destination.
        if (opcode == 29) {
            p.m.write32(scratch+0x300+18, 10);
            for (unsigned f = 2; f < 6; ++f) {
                p.m.write16(p.address(3, f), 32); // signed 24-bit value 8192
                p.m.write16(p.address(3, f)+2, 4); // signed 24-bit value 1024
            }
        }
        Trace trace(p);
        p.start(); trace.one(opcode == 27 ? 0x40095cd8 : 0x40094fa4);
        require(trace.result == 1 && trace.pcmStores, "copy/crop writer refused");
        p.checkCompletion(0, 1);
        require(p.m.read32(controls+16) == (opcode == 27 ? 64u : length),
                "crop/copy source extent differs");
        require(p.m.read32(controls+20) == (opcode == 27 ? 42u : 41u),
                "crop/copy stock counter differs");
        require(p.sample(3, opcode == 27 ? 0 : 10, 0) == (opcode == 27 ? 4096 : 8192) &&
                p.sample(3, opcode == 27 ? 0 : 10, 1) == (opcode == 27 ? 2048 : 1024),
                "crop/copy PCM differs");
        if (opcode == 29)
            for (unsigned f = 0; f < length; ++f) {
                const bool changed = (f >= 2 && f < 6) || (f >= 10 && f < 14);
                require(p.sample(3, f, 0) == (changed ? 8192 : 4096) &&
                        p.sample(3, f, 1) == (changed ? 1024 : 2048),
                        "copy source preservation or destination extent differs");
            }
    }
    // Crop changes its counter BEFORE rejecting an empty range; failure does
    // not imply metadata was untouched. No PCM write is expected here.
    Probe p(image); p.setup(3); Trace trace(p);
    p.command(scratch+0x300, 27, 2, 2); p.start(); trace.one(0x40095cd8);
    require(trace.result == uint32_t(-2) && !trace.pcmStores &&
            p.m.read32(controls+20) == 42 && p.m.read8(dirty) == 0,
            "crop refusal metadata/PCM differs");
    p.checkCompletion(0, uint32_t(-2));
}
void releaseDispatch(const std::vector<uint8_t>& image) {
    Probe p(image); p.setup(3);
    p.m.write32(0x8000691c, 2); p.m.write32(0x80006920, 14602);
    Trace trace(p);
    p.command(scratch+0x300, 28, 0, 0);
    p.start(); trace.one(0x40096300, 0);
    require(trace.pcmStores && !p.m.read32(uiQ+4) && p.m.read32(controls+8) == 1 &&
            !p.m.read32(controls+16) && !p.m.read16(0x46c75e88) &&
            p.m.read32(controls+20) == 42 && !p.m.read32(0x8000691c),
            "release dispatch extent/map/completion differs");
    for (unsigned page : {3u, 7u}) for (unsigned b = 0; b < pageBytes; ++b)
        require(p.m.read8(pool+page*pageBytes+b) == 0, "release did not clear owned page");
    // Admission is only bookkeeping: the now-empty source must still be
    // rejected by the native provider's separate slot/format/extent validation.
}
void queueBoundaries(const std::vector<uint8_t>& image) {
    Probe p(image);
    for (unsigned round = 0; round < 5; ++round) {
        for (unsigned i = 0; i < 7; ++i) p.run(post, {engineQ, scratch+0x300+4*(7*round+i)});
        require(p.m.read32(engineQ+4) == 7, "queue count differs before drain");
        for (unsigned i = 0; i < 7; ++i)
            require(p.run(receive, {engineQ}) == scratch+0x300+4*(7*round+i), "FIFO/wrap differs");
        require(!p.m.read32(engineQ+4), "queue did not drain");
    }
    p.command(scratch+0x300, 255, 0, 0); p.start();
    p.step(); p.until(loop); p.checkLoop();
    require(!p.m.read32(engineQ+4) && !p.m.read32(uiQ+4), "unknown opcode did not drain without completion");
    p.step(); p.until(waitEvent);
    require(p.m.read32(p.reg(M68K_REG_SP)+4) == engineQ+8,
            "empty queue did not enter event wait");
    // Stop here: the live scheduler/wakeup and cancellation paths are omitted.
}
} // namespace
int main(int argc, char** argv) {
    std::printf("SOURCE_SHA256: %s\n", PROBE_SOURCE_SHA);
    if (argc != 2) return 2;
    std::ifstream in(argv[1], std::ios::binary);
    std::vector<uint8_t> image{std::istreambuf_iterator<char>(in), {}};
    if (image.size() != 1112560) return 2;
    const std::pair<const char*, void (*)(const std::vector<uint8_t>&)> cases[] = {
        {"four producer-to-worker gain paths: deferred PCM, empty queue during edit, deferred UI completion", producerToWorker},
        {"seven stock opcode paths: enter writer, return, attempt completion and restore worker frame", dispatch},
        {"two refused commands: no PCM/dirty mutation and deferred failure result", failures},
        {"null callback and exhausted completion pool: edit finishes without UI notification", absentCompletion},
        {"two queued writers execute FIFO with separate completion records", fifo},
        {"forced producer-record reuse: queued pointers observe overwritten payload; outer UI preflight omitted", reusedMessage},
        {"copy and crop dispatch, nested rotation exclusion and crop refusal metadata", copyAndCrop},
        {"release dispatch retires exclusion without attempting UI completion", releaseDispatch},
        {"35 queue posts/receives wrap FIFO; unknown opcode drains; empty worker stops at event wait", queueBoundaries},
    };
    unsigned failed = 0;
    for (const auto& c : cases) {
        try { c.second(image); std::printf("PASS: %s\n", c.first); }
        catch (const std::exception& e) { ++failed; std::printf("FAIL: %s: %s\n", c.first, e.what()); }
    }
    std::printf("%u passed, %u failed; synthetic worker with host admission guard, display mock, no scheduler/UI consumer/hardware\n",
                unsigned(std::size(cases))-failed, failed);
    return failed ? 1 : 0;
}
