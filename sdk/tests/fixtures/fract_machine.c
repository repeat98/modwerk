/* Authored host fixtures, no firmware. The FX adapter is the differential
 * reference; both paths execute the same native grain core's C kernel twin. */
#include <assert.h>
#include <stdio.h>
#include <string.h>
#include "source.h"
#ifdef OG_MACHINE_SOURCE_TRANSPORT
#include "source_runtime.h"
/* Modeled admission only: no fixture constant is a production source lease. */
volatile uint32_t mw_frame_t0, mw_frame_count;
volatile uint16_t dl_tx[2][64] __attribute__((aligned(16)));
static uint32_t source_generation[8];
#ifndef OG_MACHINE_SOURCE_STAGE
uint32_t og_source_generation(unsigned track) {
    assert(track < 8);
    return source_generation[track];
}
#endif
#endif

static uint8_t metadata[128 * 44], handles[128 * 4], records[16 * 64];
static uint8_t voices[8 * 168], bases[128 * 4], pages[14603 * 2];
static uint8_t pcm[3 * 6144], lanes[16 * 48], source_states[8 * 40];
static uint8_t stock_page[0x1ca];
static uint8_t live_controls[8 * 72];
static uint32_t packet_words[2 * 8 * 84], packet_cursor, source_record;
static uint32_t source_state_override, current_ping;
static uint8_t machine_tracks;
static unsigned control_accesses;
#ifdef OG_FIXTURE_REGISTRY
static uint8_t *registry_memory(uintptr_t at, unsigned count);
static uint32_t registry_word(uintptr_t at);
#endif
static uint8_t *memory(uintptr_t at, unsigned count) {
#ifdef OG_FIXTURE_REGISTRY
    /* The real registry and renderer see the same native voice records. */
    if (at >= 0x800049d8u && at - 0x800049d8u < sizeof voices)
        return registry_memory(at, count);
#endif
    if (at >= 0x80000810u && at - 0x80000810u < sizeof live_controls) {
        assert(count <= sizeof live_controls - (at - 0x80000810u));
        return live_controls + (at - 0x80000810u);
    }
    static const uintptr_t addresses[] = {0x46c922c4, 0x46c920a4,
        0x80000110, 0x800049d8, 0x46c2e580, 0x46c2e9c0,
        0x40a955e0 + 6144, 0x80000510, 0x400d3176, 0x80004898};
    uint8_t *buffers[] = {metadata, handles, records, voices, bases, pages, pcm, lanes, stock_page, source_states};
    const unsigned sizes[] = {sizeof metadata, sizeof handles, sizeof records,
        sizeof voices, sizeof bases, sizeof pages, sizeof pcm, sizeof lanes, sizeof stock_page, sizeof source_states};
    for (unsigned i = 0; i < sizeof sizes / sizeof sizes[0]; ++i) {
        if (at >= addresses[i] && at - addresses[i] < sizes[i]) {
            assert(count <= sizes[i] - (at - addresses[i]));
            if (i == 2 || i == 3 || i == 7) ++control_accesses;
            return buffers[i] + at - addresses[i];
        }
    }
#ifdef OG_FIXTURE_REGISTRY
    return registry_memory(at, count);
#else
    assert(!"Unexpected device-memory access");
    return NULL;
#endif
}
static uint32_t get(uintptr_t at, unsigned count) {
#ifdef OG_FIXTURE_REGISTRY
    if (at == 0x46c82456u || at == 0x460e70e0u || at == 0x460e5e30u) {
        assert(count == 4); return registry_word(at);
    }
    if (at >= 0x400d320cu && at < 0x400d3218u) {
        assert(count == 1); return *registry_memory(at, 1);
    }
#endif
    if (at == 0x4000045e) {assert(count == 4); return 0x40a955e0;}
    if (at == 0x40096f82) {assert(count == 4); return 14602;}
    if (at == 0x80006918) {assert(count == 4); return 0x46c2e580;}
    if (at == 0x80006914) {assert(count == 4); return 0x46c2e9c0;}
    if (at == 0x80001c80) {assert(count == 4); return packet_cursor;}
    if (at == 0x800062a8) {assert(count == 4); return source_record;}
    if (at == 0x800062a4) {
        assert(count == 4);
        return source_state_override ? source_state_override :
            0x80004898 + 40 * (((source_record - 0x80000510) % 384) / 48);
    }
    if (at == 0x800000e0) {assert(count == 4); return current_ping;}
    if (at >= 0x80001c90 && at - 0x80001c90 < sizeof packet_words) {
        assert(count == 4 && !(at & 3));
        return packet_words[(at - 0x80001c90) / 4];
    }
    uint8_t *p = memory(at, count);
    uint32_t result = 0;
    for (unsigned i = 0; i < count; ++i) result = (result << 8) | p[i];
    return result;
}
static void put(uintptr_t at, unsigned count, uint32_t value) {
    uint8_t *p = memory(at, count);
    while (count) {p[--count] = (uint8_t)value; value >>= 8;}
}
#define U8(a) get((uintptr_t)(a), 1)
#define U16(a) get((uintptr_t)(a), 2)
#define U32(a) get((uintptr_t)(a), 4)
#define OG_PUT16(a, v) put((uintptr_t)(a), 2, (uint16_t)(v))
#ifdef OG_FRACT_CURRENT_ENGINE
#include "source.c"
/* The historical FX adapter is only a host differential oracle. */
#include "fract_reference/fx_adapter.c"
#else
#include "fract_reference/source.c"
#endif
#ifdef OG_FRACT_CURRENT_ENGINE
#include "pitch.c"
#else
#include "fract_reference/pitch.c"
#endif
#include "control.c"
#ifdef OG_FRACT_CURRENT_ENGINE
#include "grain.c"
#else
#include "fract_reference/grain.c"
#endif
#include "machine.c"

static unsigned stock_packet_frames, stock_render_calls, malformed_packet, stock_cached_packet;
static uint32_t stock_rate = 0x04000000u, stock_ring, stock_fraction;
static unsigned stock_splits = 1, stock_counts[4], stock_sources;
/* Independent synthetic packet producer: walk output positions with 64-bit
 * arithmetic, then supply through the interpolator's lookahead ring index.
 * The low header byte counts source frames; the next three count outputs. */
static unsigned synthetic_packet(unsigned at) {
    if (stock_cached_packet) {
        packet_words[at] = stock_packet_frames << 8;
        packet_words[at + 1] = 2;
        packet_words[at + 2] = 1;
        packet_words[at + 3] = 0;
        return 16;
    }
    unsigned segments = stock_packet_frames ? stock_splits : 0;
    uint32_t header = 0, ring = stock_ring, phases[4] = {0};
    stock_sources = 0;
    for (unsigned s = 0; s < segments; ++s) {
        unsigned outputs = segments == 1 ? stock_packet_frames : stock_counts[s];
        assert(outputs && outputs <= 16);
        header |= outputs << (8 * (s + 1));
        phases[s] = (ring << 26) + stock_fraction;
        uint64_t p = phases[s];
        for (unsigned i = 1; i < outputs; ++i) p += stock_rate;
        unsigned next = (unsigned)((p >> 26) + !!(p & 0x03ffffffu) + 1u) & 63u;
        while (ring != next) {
            unsigned i = stock_sources++;
            assert(stock_sources <= 38);
            packet_words[at + 4 + 2 * i] = (uint32_t)(((int)(2 * i) - 12) * 65536);
            packet_words[at + 5 + 2 * i] = (uint32_t)(((int)(2 * i + 1) - 12) * 65536);
            ring = (ring + 1u) & 63u;
        }
    }
    packet_words[at] = header | stock_sources;
    packet_words[at + 1] = segments ? stock_ring : 0;
    packet_words[at + 2] = segments ? stock_rate : 0x04000000u;
    packet_words[at + 3] = phases[0];
    unsigned words = 4 + 2 * stock_sources;
    for (unsigned s = 1; s < segments; ++s) packet_words[at + words++] = phases[s];
    assert(words <= 84);
    return 4 * words;
}
static int native_stock(unsigned track, unsigned ping, unsigned start, unsigned end) {
    ++stock_render_calls;
    assert(track < 8 && ping < 2 && start <= end && end <= 16);
    if (!(machine_tracks & (1u << track))) return -7;
    if (!U8(0x800049d8u + 168u * track)) return 37; /* sentinel return, but no source PCM packet */
    uintptr_t fp = source_record;
#if defined(OG_MACHINE_GRAIN_ONLY) && !defined(OG_MACHINE_CPU_PROFILE)
    /* The executed original packet-builder probe establishes that these
     * controls are not read on zero spans below16. end16 refreshes pitch. */
    if (start!=end || end==16u) {
#endif
    assert(U16(fp + 2) == 0 && U16(fp + 4) == 0x7f00);
    assert(U16(fp + 6) == 0x7f00 && U16(fp + 8) == 0);
    assert(U8(fp + 28) == 0); /* no player TSTR requirement */
#if defined(OG_MACHINE_GRAIN_ONLY) && !defined(OG_MACHINE_CPU_PROFILE)
    }
#endif
    assert(U8(0x800049d8 + 168 * track + 24) == 0);
    assert(U32(0x80004898 + 40 * track + 4) == 0); /* SPCE is not RTRG */
    unsigned at = (packet_cursor - 0x80001c90) / 4;
    unsigned bytes = synthetic_packet(at);
    if (malformed_packet == 2) packet_words[at] |= 255u;
    packet_cursor += bytes + (malformed_packet == 1 ? 4 : 0);
    return 37;
}
#define OG_PUT8(a, v) put((uintptr_t)(a), 1, (uint8_t)(v))
#define OG_PUT32(a, v) put((uintptr_t)(a), 4, (uint32_t)(v))
#define OG_FLEX_RENDER(t,p,s,e) native_stock(t,p,s,e)
#define OG_PACKET_AUDIO(a) ((int32_t *)(packet_words + ((a) - 0x80001c90) / 4))
#ifndef OG_FIXTURE_REGISTRY
#define OG_MACHINE_OWNS(t) ((machine_tracks >> (t)) & 1u)
#endif
#if defined(OG_MACHINE_GRAIN_ONLY) && !defined(OG_FIXTURE_REGISTRY)
#define OG_MACHINE_LAYOUT_CURRENT(t) 1
#endif
#include "render.c"
static unsigned stock_start_calls, expected_sample, expected_flags, expected_pitch;
static int native_start(unsigned track, unsigned sample, unsigned flags) {
    ++stock_start_calls;
    assert(sample == expected_sample && flags == expected_flags);
    if (!(machine_tracks & (1u << track))) return -8;
    put(0x800049d8u + 168u * track, 1, 255); /* native START activates this voice */
    const uint16_t native[6] = {(uint16_t)(expected_pitch << 8), 0, 0x7f00, 0x7f00, 0, 0x4000};
    for (unsigned i = 0; i < 6; ++i) {
        assert(U16(source_record + 2 * i) == native[i]);
        assert(U8(source_record + 24 + i) == (i == 0));
    }
    /* The real START invalidates this byte at 0x4000f5c6. */
    put(0x800049d8 + 168 * track + 24, 1, 255);
    return 0x100;
}
#define OG_FLEX_START(t,s,f) native_start(t,s,f)
#include "start.c"
#define OG_MACHINE_PROTOTYPE 1
#ifdef OG_FIXTURE_REGISTRY
static void fixture_pool_open(void);
static void fixture_pool_left(unsigned key, unsigned edge);
#define OG_POOL_LEFT(k,e) fixture_pool_left(k,e)
#define OG_POOL_REDRAW() ((void)0)
#else
static void fixture_pool_open(void) {}
#endif
#define OG_POOL_AT(a) memory((uintptr_t)(a), 1)
#define OG_POOL_OPEN() fixture_pool_open()
static unsigned fixture_control_writes;
static unsigned fixture_main_writes;
static unsigned fixture_control_track, fixture_control_index, fixture_control_value;
static int fixture_control(unsigned track, unsigned index, unsigned value) {
    ++fixture_control_writes;
    fixture_control_track = track; fixture_control_index = index;
    fixture_control_value = value;
    return (int)value;
}
static int fixture_main_control(unsigned track, unsigned index, unsigned value) {
    assert(index < 6); ++fixture_main_writes;
    return fixture_control(track, index, value);
}
#define OG_POOL_MAIN_CONTROL(t,k,v) fixture_main_control(t,k,v)
#include "registration.c"

static void fixture(unsigned format, unsigned frames) {
    memset(metadata, 0, sizeof metadata);
    memset(handles, 0, sizeof handles);
    memset(records, 0, sizeof records);
    memset(voices, 0, sizeof voices);
    memset(bases, 0, sizeof bases);
    memset(pages, 0, sizeof pages);
    memset(lanes, 0, sizeof lanes);
    memset(source_states, 0, sizeof source_states);
    source_state_override = current_ping = 0;
    memset(&og_state, 0, sizeof og_state);
    og_owner = 8;
    stock_rate = 0x04000000u; stock_ring = stock_fraction = 0;
    stock_splits = 1; malformed_packet = stock_cached_packet = 0;
    put(0x46c922c4, 4, format);
    put(0x46c922c4 + 16, 4, frames);
    put(0x46c922c4 + 20, 4, 5);
    put(0x46c920a4, 4, 5);
    for (unsigned i = 0; i < 3; ++i) put(0x46c2e9c0 + 2 * i, 2, i + 1);
    /* Deterministic PCM exercises positive and negative sample words. */
    for (unsigned i = 0; i < sizeof pcm; ++i) pcm[i] = (uint8_t)(i * 73u + 19u);
    for (unsigned track = 0; track < 8; ++track) {
        put(0x800049d8 + track * 168, 1, 255);
        put(0x800049d8 + track * 168 + 20, 1, 1);
        for (unsigned ping = 0; ping < 2; ++ping)
            put(0x80000110 + (ping * 8 + track) * 64 + 56, 2, OG_FX_ID);
    }
}
static void publish(uintptr_t rec, const OgMachineControls *p) {
    put(rec + 24, 1, p->position); put(rec + 26, 1, p->size);
    put(rec + 28, 1, p->forwards); put(rec + 30, 1, p->spread);
    put(rec + 34, 1, p->shape); put(rec + 48, 1, p->pan);
    put(rec + 49, 1, p->scan); put(rec + 50, 1, p->local_spread);
    put(rec + 51, 1, p->density);
}
static void differential(void) {
    unsigned cases = 0;
    const unsigned lengths[] = {2047, 2048, 2049, 3069};
    for (unsigned format = 0; format < 4; ++format)
        for (unsigned length = 0; length < 4; ++length)
            for (unsigned variant = 0; variant < 8; ++variant) {
        fixture(format, lengths[length]);
        OgSource src = {0}; assert(og_describe(0, &src));
        OgGrain fx = {0}, machine = {0};
        unsigned fx_owner = 8, machine_owner = 8;
        /* Exercise entry ramps, multiple births/retirements, controls at
         * birth boundaries, both pings, and every legal chunk length. */
        for (unsigned block = 0; block < 256; ++block) {
            unsigned n = block % 64 + 1, ping = block & 1, track = variant;
            OgMachineControls controls = {
                .density = (uint8_t)(block * 17u + variant),
                .size = (uint8_t)(block < 160 ? variant * 2u : block * 11u),
                .position = (uint8_t)(block * 13u),
                .scan = (uint8_t)(block * 31u), .spread = (uint8_t)(block * 7u),
                .pan = (uint8_t)(block * 19u), .shape = (uint8_t)(block * 23u),
                .forwards = (uint8_t)(block * 29u),
                .local_spread = (uint8_t)(block % 3)
            };
            uintptr_t rec = 0x80000110 + (ping * 8 + track) * 64;
            publish(rec, &controls);
            int32_t expected[128], actual[128];
            for (unsigned i = 0; i < 128; ++i)
                expected[i] = actual[i] = ((int32_t)(i * 173u % 12001) - 6000) * 65536;
            og_state = fx; og_owner = fx_owner;
            og_render(expected, ping, track, n, n, 255);
            fx = og_state; fx_owner = og_owner;
            og_state = machine; og_owner = machine_owner;
            control_accesses = 0;
            assert(og_machine_chunk(track, &src, &controls, actual, n) == OG_MACHINE_RENDERED);
            assert(!control_accesses); /* no FX IDs, voice flags or TSTR reads */
            machine = og_state; machine_owner = og_owner;
            assert(!memcmp(expected, actual, sizeof actual));
            assert(!memcmp(&fx, &machine, sizeof fx));
            assert(fx_owner == machine_owner);
            ++cases;
        }
    }
    printf("%u chunks: bit-identical PCM, state and owner\n", cases);
}
static void lifecycle(void) {
    fixture(3, 2049);
    OgSource src = {0}; assert(og_describe(0, &src));
    const OgMachineControls controls = {127, 86, 18, 64, 0, 0, 64, 127, 0};
    int32_t audio[128] = {0}, saved[128];
    assert(og_machine_chunk(2, &src, &controls, audio, 64) == OG_MACHINE_RENDERED);
    assert(og_owner == 2 && og_state.mix == 256);
    memcpy(saved, audio, sizeof audio);
    OgGrain before = og_state;
    assert(og_machine_chunk(3, &src, &controls, audio, 64) == OG_MACHINE_BUSY);
    assert(!memcmp(&before, &og_state, sizeof before) && og_owner == 2);
    assert(!memcmp(saved, audio, sizeof audio));
    og_machine_leave(3); og_machine_leave(8);
    assert(!memcmp(&before, &og_state, sizeof before) && og_owner == 2);
    assert(og_machine_chunk(2, &src, &controls, NULL, 64) == OG_MACHINE_IGNORED);
    assert(og_machine_chunk(2, &src, NULL, audio, 64) == OG_MACHINE_IGNORED);
    assert(og_machine_chunk(2, NULL, NULL, NULL, 0) == OG_MACHINE_IGNORED);
    assert(og_machine_chunk(2, &src, &controls, audio, 65) == OG_MACHINE_IGNORED);
    assert(og_machine_chunk(8, &src, &controls, audio, 64) == OG_MACHINE_IGNORED);
    assert(!memcmp(&before, &og_state, sizeof before) && og_owner == 2);
    assert(og_machine_chunk(2, NULL, NULL, NULL, 16) == OG_MACHINE_IGNORED);
    assert(og_owner == 8 && !og_state.mix && !og_state.countdown);
    for (unsigned g = 0; g < OG_MAX_GRAINS; ++g) assert(!og_state.head[g].length);
    assert(og_machine_chunk(3, &src, &controls, audio, 1) == OG_MACHINE_RENDERED);
    assert(og_owner == 3 && og_state.mix == 4 && og_state.scan == 0);
    /* Source replacement and owner transfer reproduce a fresh reset. */
    src.identity = 6;
    assert(og_machine_chunk(3, &src, &controls, audio, 1) == OG_MACHINE_RENDERED);
    assert(og_state.identity == 6 && og_state.mix == 4);
    const OgSource valid = src;
    for (unsigned bad = 0; bad < 8; ++bad) {
        src = valid;
        assert(og_machine_chunk(3, &src, &controls, audio, 16) == OG_MACHINE_RENDERED);
        if (bad == 0) src.frames = 0;
        if (bad == 1) src.frames = 44860417;
        if (bad == 2) src.slot = 128;
        if (bad == 3) src.identity = 0;
        if (bad == 4) src.bytes = 4;
        if (bad == 5) src.channels = 0;
        if (bad == 6) src.channels = 3;
        if (bad == 7) src.little = 1;
        memcpy(saved, audio, sizeof audio);
        assert(og_machine_chunk(3, &src, &controls, audio, 16) == OG_MACHINE_IGNORED);
        assert(og_owner == 8 && !og_state.mix);
        assert(!memcmp(saved, audio, sizeof audio));
    }
    puts("owner isolation, release, invalid calls, source replacement: OK");
}
static void native_render_checks(void) {
    unsigned cases = 0;
    for (unsigned format = 0; format < 4; ++format)
        for (unsigned track = 0; track < 8; ++track)
            for (unsigned ping = 0; ping < 2; ++ping)
              for (unsigned previous_ping = 0; previous_ping < 2; ++previous_ping)
                for (unsigned cut = 0; cut <= 16; ++cut) {
        fixture(format, 2049);
        put(0x800049d8 + 168 * track + 24, 1, cut % 4);
        machine_tracks = (uint8_t)(1u << track);
        source_record = 0x80000510 + ping * 384 + track * 48;
        const uint16_t main[6] = {0x1203, 0x5679, 0x7f23, 0x4678, 0x6012, 0x4000};
        const uint8_t setup[6] = {55, (uint8_t)(track * 37 + cut), 1, (uint8_t)(255 - cut * 13), 64, 99};
        for (unsigned i = 0; i < 6; ++i) {
            put(source_record + 2 * i, 2, main[i]);
            put(source_record + 24 + i, 1, setup[i]);
        }
        uintptr_t rec = 0x80000110 + (ping * 8 + track) * 64;
        put(rec + 60, 2, 0xa5ff);
        uint8_t original_lanes[sizeof lanes]; memcpy(original_lanes, lanes, sizeof lanes);
        memset(packet_words, 0x5a, sizeof packet_words);
        packet_cursor = 0x80001c90 + ping * 0xa80 + track * 336;
        put(0x80004898 + 40 * track + 4, 4, main[4]); /* frame builder's SRC+8 read */
        put(0x80004898 + 40 * track + 8, 4, 0x12345678);
        unsigned offset = (packet_cursor - 0x80001c90) / 4;
        stock_packet_frames = 16 - cut; malformed_packet = 0; stock_render_calls = 0;
        OgSource src = {0}; assert(og_describe(0, &src));
        #ifdef OG_MACHINE_GRAIN_ONLY
        OgMachineControls controls = {127, 86, 18, 64, 70, 55, 96, 127, 1};
#else
        OgMachineControls controls = {127, 86, 18, 64, 70, 55, 64, 127, 1};
#endif
        int32_t expected[32];
        for (unsigned i = 0; i < 32; ++i) expected[i] = ((int)i - 12) * 65536;
        OgGrain initial = og_state;
        if (stock_packet_frames)
            assert(og_machine_chunk(track, &src, &controls, expected, stock_packet_frames) == OG_MACHINE_RENDERED);
        OgGrain after = og_state; unsigned owner_after = og_owner;
        og_state = initial; og_owner = 8;
        assert(og_machine_render(track, ping ^ previous_ping, cut, 16) == 37 && stock_render_calls == 1);
        assert(!memcmp(original_lanes, lanes, sizeof lanes));
        assert(U32(0x80004898 + 40 * track + 4) == 0);
        assert(U32(0x80004898 + 40 * track + 8) == 0x12345678);
        assert(!memcmp(&after, &og_state, sizeof after) && og_owner == owner_after);
        assert(packet_words[offset] == (stock_packet_frames | (stock_packet_frames << 8)));
        assert(!packet_words[offset + 1] && packet_words[offset + 2] == 0x04000000);
        assert(!packet_words[offset + 3]);
        assert(!memcmp(expected, packet_words + offset + 4, stock_packet_frames * 8));
        assert(U16(rec + 60) == (stock_packet_frames ? 0xa4ff : 0xa5ff));
        for (unsigned i = 0; i < offset; ++i) assert(packet_words[i] == 0x5a5a5a5a);
        for (unsigned i = offset + 4 + 2 * stock_packet_frames;
             i < sizeof packet_words / sizeof packet_words[0]; ++i)
            assert(packet_words[i] == 0x5a5a5a5a);
        ++cases;
    }
    /* A malformed record or unknown packet format never granulates. */
    for (unsigned bad = 1; bad <= 2; ++bad) {
        fixture(3, 2049); machine_tracks = 1; source_record = 0x80000510;
        put(source_record + 28, 1, 127);
        packet_cursor = 0x80001c90; stock_packet_frames = 16; malformed_packet = bad;
        assert(og_machine_render(0, 0, 0, 16) == 37 && og_owner == 8);
        assert(U8(source_record + 28) == 127);
    }
    /* A second registered track stays dry. A stopped or unsigned old owner
     * releases inside the render, without a UI-tick or FX-ID dependency. */
    fixture(3, 2049); machine_tracks = 3; stock_packet_frames = 16; malformed_packet = 0;
    source_record = 0x80000510; packet_cursor = 0x80001c90;
    put(source_record + 28, 1, 64);
    assert(og_machine_render(0, 0, 0, 16) == 37 && og_owner == 0);
    OgGrain owner_state = og_state;
    source_record = 0x80000510 + 48; packet_cursor = 0x80001c90 + 336;
    put(source_record + 28, 1, 64); put(0x80000110 + 64 + 60, 2, 0xafff);
    assert(og_machine_render(1, 0, 0, 16) == 37 && og_owner == 0);
    assert(!memcmp(&owner_state, &og_state, sizeof owner_state));
    assert(U16(0x80000110 + 64 + 60) == 0xafff);
    put(0x800049d8, 1, 0); packet_cursor = 0x80001c90 + 336;
    assert(og_machine_render(1, 0, 0, 16) == 37 && og_owner == 1);
    assert(og_state.mix == 64 && U16(0x80000110 + 64 + 60) == 0xaeff);
    put(0x800049d8 + 168, 1, 0); packet_cursor = 0x80001c90 + 336;
    assert(og_machine_render(1, 0, 0, 16) == 37 && og_owner == 8);
    put(0x800049d8, 1, 255); put(0x800049d8 + 168, 1, 255);
    source_record = 0x80000510; packet_cursor = 0x80001c90;
    assert(og_machine_render(0, 0, 0, 16) == 37 && og_owner == 0);
    machine_tracks = 2; source_record += 48; packet_cursor = 0x80001c90 + 336;
    assert(og_machine_render(1, 0, 0, 16) == 37 && og_owner == 1);
    unsigned calls = stock_render_calls;
    assert(!og_machine_render(8, 0, 0, 16));
    assert(!og_machine_render(0, 2, 0, 16));
    assert(!og_machine_render(0, 0, 17, 16));
    assert(!og_machine_render(0, 0, 0, 17));
    assert(stock_render_calls == calls);
    source_record = 0;
    assert(!og_machine_render(1, 0, 0, 16) && stock_render_calls == calls);
    source_record = 0x80000510 + 48; source_state_override = 0x80004898;
    assert(!og_machine_render(1, 0, 0, 16) && stock_render_calls == calls);
    machine_tracks = 0;
    assert(og_machine_render(0, 0, 0, 16) == -7 && stock_render_calls == calls + 1);
    printf("%u native-render fixtures: packet/header bounds, controls, TSTR and declick OK\n", cases);
}
#ifdef OG_MACHINE_SOURCE_TRANSPORT
/* Production sends a captured block after the following frame entry. */
static int source_send(unsigned core) {
    ++mw_frame_count;
    int sent = mw_source_before_send(core);
    --mw_frame_count;
    return sent;
}
static void source_next_frame(void) {
    ++mw_frame_count;
    source_send(0);
    source_send(1);
    memset((void *)dl_tx, 0, sizeof dl_tx);
}
static void source_fixture(unsigned track, unsigned ping) {
    fixture(3, 2049);
    source_next_frame();
    for (unsigned i = 0; i < 8; ++i) source_generation[i] = 0xffffff;
    machine_tracks = (uint8_t)(1u << track);
    source_record = 0x80000510 + ping * 384 + track * 48;
    packet_cursor = 0x80001c90 + ping * 0xa80 + track * 336;
}
static void source_half(unsigned track, unsigned callback_ping,
                        unsigned start, unsigned end, uint16_t space) {
    put(source_record + 8, 2, space);
    stock_packet_frames = end - start;
    assert(og_machine_render(track, callback_ping, start, end) == 37);
    assert(U16(source_record + 8) == space);
}
static void source_capture_checks(void) {
    unsigned cases = 0;
    for (unsigned track = 0; track < 8; ++track)
      for (unsigned ping = 0; ping < 2; ++ping)
       for (unsigned space = 0; space < 128; ++space)
        for (unsigned cut = 0; cut <= 16; ++cut) {
        source_fixture(track, ping);
        uint16_t first = (uint16_t)((space << 8) | ((space * 31 + cut) & 255));
        uint16_t second = (uint16_t)(((127 - space) << 8) | ((space * 13 + cut) & 255));
        source_half(track, ping ^ 1, 0, cut, first);
        source_half(track, ping, cut, 16, second);
        unsigned core = track < 4 ? 1 : 0;
        assert(source_send(core ^ 1) == 0);
        assert(source_send(core) == 1);
        volatile uint16_t *tx = dl_tx[core];
        assert(tx[57] == 0x5350 && tx[58] == (track | (ping << 3) | ((cut % 16) << 4)));
        assert(tx[59] == 255 && tx[60] == 65535);
        assert(tx[61] == (cut ? first : second));
        assert(tx[62] == (cut == 16 ? first : second));
        unsigned sum = 0;
        for (unsigned i = 0; i < 64; ++i) sum += tx[i];
        assert(!(sum & 65535));
        assert(source_send(core) == 0 && !tx[57]);
        ++cases;
    }
    for (unsigned bad = 0; bad < 9; ++bad) {
        source_fixture(0, 1);
        if (bad == 0) source_generation[0] = 0;
        if (bad == 1) source_generation[0] = 0x1000000;
        if (bad == 2) malformed_packet = 2;
        if (bad == 3) og_owner = 1, machine_tracks |= 2;
        if (bad == 4) put(0x800049d8, 1, 0);
        if (bad == 5) stock_cached_packet = 1; /* cannot acquire from cached PCM */
        source_half(0, 0, bad == 6 ? 7 : 0, bad >= 7 ? 7 : 16, 0x6012);
        if (bad == 7) { /* No end-of-frame capture after a refused second half. */
            malformed_packet = 2;
            source_half(0, 1, 7, 16, 0x7f34);
        }
        if (bad == 8) {
            source_generation[0] = 2;
            source_half(0, 1, 7, 16, 0x7f34);
        }
        assert(source_send(1) == 0 && !dl_tx[1][57]);
    }
    /* Already granular interpolator cache may have no new fetch. Its owner
     * and source identity must still match before publishing SPACE. */
    source_fixture(4, 0);
    source_half(4, 1, 0, 16, 0x6001);
    assert(source_send(0) == 1);
    source_next_frame();
    packet_cursor = 0x80001c90 + 4 * 336;
    stock_cached_packet = 1;
    source_half(4, 1, 0, 16, 0x7ffe);
    assert(source_send(0) == 1 && dl_tx[0][61] == 0x7ffe);
    source_next_frame();
    packet_cursor = 0x80001c90 + 4 * 336;
    ++og_state.identity;
    source_half(4, 1, 0, 16, 0x7fff);
    assert(source_send(0) == 0);
    source_fixture(0, 0);
    source_half(0, 1, 0, 16, 0x6023);
    ++mw_frame_count;
    assert(source_send(1) == 0); /* stale actual frame timestamp */
    printf("%u render-to-source frames: full/split fractions, current ping, refusals and cache OK\n", cases);
}
#endif
static void start_checks(void) {
    const unsigned pitches[] = {0, 64, 127, 255};
    unsigned cases = 0;
    for (unsigned track = 0; track < 8; ++track)
      for (unsigned ping = 0; ping < 2; ++ping)
       for (unsigned variant = 0; variant < 4; ++variant) {
        fixture(3, 2049);
        machine_tracks = (uint8_t)(1u << track); current_ping = ping;
        source_record = 0x80000510 + ping * 384 + track * 48;
        for (unsigned i = 0; i < sizeof lanes; ++i) lanes[i] = (uint8_t)(i * 73 + 19);
        put(source_record + 28, 1, pitches[variant]);
#ifdef OG_MACHINE_GRAIN_ONLY
        put(source_record + 10, 2, pitches[variant] << 8);
#endif
        uint8_t original[sizeof lanes]; memcpy(original, lanes, sizeof lanes);
        expected_sample = variant & 1 ? 127 : 0;
        expected_flags = variant & 1 ? 0xe0 : 0xc0;
#ifdef OG_MACHINE_GRAIN_ONLY
        expected_pitch = pitches[variant] < 4 ? 4 : pitches[variant] > 124 ? 124 : pitches[variant];
#else
        expected_pitch = 64; /* unused/legacy SETUP E never transposes */
#endif
        stock_start_calls = 0;
        assert(og_machine_start(track, expected_sample, expected_flags) == 0x100);
        assert(stock_start_calls == 1 && !memcmp(original, lanes, sizeof lanes));
        for (unsigned t = 0; t < 8; ++t)
            assert(U8(0x800049d8 + t * 168 + 24) == 0);
        ++cases;
    }
    fixture(3, 2049); machine_tracks = 1; source_record = 0x80000510;
    expected_sample = expected_flags = 0; stock_start_calls = 0;
    assert(!og_machine_start(8, 0, 0) && !stock_start_calls);
    current_ping = 2;
    assert(!og_machine_start(0, 0, 0) && !stock_start_calls);
    current_ping = 1;
    assert(!og_machine_start(0, 0, 0) && !stock_start_calls);
    current_ping = 0; source_record += 48;
    assert(!og_machine_start(0, 0, 0) && !stock_start_calls);
    /* An ordinary FLEX track is forwarded without any control/cache mutation. */
    machine_tracks = 0;
    put(0x800049d8 + 24, 1, 99);
    assert(og_machine_start(0, 0, 0) == -8 && stock_start_calls == 1);
    assert(U8(0x800049d8 + 24) == 99);
    printf("%u proposed START fixtures: native control view, restore and refusal OK\n", cases);
}
static void packet_checks(void) {
    const uint32_t rates[] = {0x02000000, 0x03000001, 0x04000000, 0x06000000, 0x08000000};
    const uint32_t fractions[] = {0, 0x02000000, 0x03ffffff};
    unsigned cases = 0;
    for (unsigned r = 0; r < sizeof rates / sizeof rates[0]; ++r)
      for (unsigned ring = 0; ring < 64; ++ring)
       for (unsigned fraction = 0; fraction < 3; ++fraction)
        for (unsigned splits = 1; splits <= 3; ++splits) {
        fixture(3, 2049);
        stock_rate = rates[r]; stock_ring = ring; stock_fraction = fractions[fraction];
        stock_packet_frames = 16; stock_splits = splits;
        unsigned outputs = 16;
        for (unsigned i = 0; i < splits; ++i) {
            stock_counts[i] = i + 1 < splits ? i + 1 : outputs;
            outputs -= stock_counts[i];
        }
        machine_tracks = 1; source_record = 0x80000510;
        const uint16_t main[6] = {0x1203, 0x5679, 0x7f23, 0x4678, 0x6012, 0x4000};
        const uint8_t setup[6] = {55, 72, 1, 113, 64, 99};
        for (unsigned i = 0; i < 6; ++i) {
            put(source_record + 2 * i, 2, main[i]); put(source_record + 24 + i, 1, setup[i]);
        }
        memset(packet_words, 0x5a, sizeof packet_words);
        unsigned bytes = synthetic_packet(0);
        uint32_t original[84]; memcpy(original, packet_words, sizeof original);
        int32_t expected[76]; memcpy(expected, packet_words + 4, 8 * stock_sources);
        OgSource source = {0}; assert(og_describe(0, &source));
        #ifdef OG_MACHINE_GRAIN_ONLY
        OgMachineControls controls = {127, 86, 18, 64, 70, 55, 96, 127, 1};
#else
        OgMachineControls controls = {127, 86, 18, 64, 70, 55, 64, 127, 1};
#endif
        /* Preserve native per-fetch boundaries in the reference. */
        unsigned done = 0, write = ring;
        for (unsigned s = 0; s < splits; ++s) {
            uint64_t position = ((uint64_t)write << 26) + stock_fraction;
            for (unsigned i = 1; i < stock_counts[s]; ++i) position += stock_rate;
            unsigned next = (unsigned)((position >> 26) + !!(position & 0x03ffffffu) + 1u) & 63u;
            unsigned count = (next - write) & 63u;
            if (count) assert(og_machine_chunk(0, &source, &controls, expected + 2 * done, count) == OG_MACHINE_RENDERED);
            done += count; write = next;
        }
        assert(done == stock_sources);
        OgGrain expected_state = og_state; unsigned expected_owner = og_owner;
        memset(&og_state, 0, sizeof og_state); og_owner = 8;
        packet_cursor = 0x80001c90;
        /* First-call ping can differ from the actual frame/published ping. */
        assert(og_machine_render(0, 1, 0, 16) == 37);
        assert(packet_cursor == 0x80001c90 + bytes);
        assert(!memcmp(&expected_state, &og_state, sizeof og_state) && og_owner == expected_owner);
        assert(!memcmp(expected, packet_words + 4, 8 * stock_sources));
        assert(!memcmp(original, packet_words, 16));
        assert(!memcmp(original + 4 + 2 * stock_sources, packet_words + 4 + 2 * stock_sources,
                       sizeof original - 16 - 8 * stock_sources));
        /* Reject inconsistent phase/count extents before any state/audio write. */
        uintptr_t after = 0x80001c90 + bytes;
        unsigned counts[4];
        assert(packet_chunks(0x80001c90, after, 16, counts) == splits);
        assert(!packet_chunks(0x80001c90, after, 15, counts));
        assert(!packet_chunks(0x80001c90, after - 4, 16, counts));
        packet_words[0] ^= 1u; /* Source total must match phase reconstruction. */
        assert(!packet_chunks(0x80001c90, after, 16, counts));
        packet_words[0] ^= 1u;
        packet_words[1] = 64;
        assert(!packet_chunks(0x80001c90, after, 16, counts));
        ++cases;
    }
    puts("pitched and split packet fixtures: headers/trailers and per-fetch PCM/state identical");
    printf("%u synthetic packets; private stock-builder probe is opt-in\n", cases);
}
static uint32_t page_value(unsigned offset) {
    uint32_t value = 0;
    for (unsigned i = 0; i < 4; ++i) value = (value << 8) | og_machine_page_data[offset + i];
    return value;
}
static void registration_checks(void) {
    for (unsigned i = 0; i < sizeof stock_page; ++i) stock_page[i] = (uint8_t)(i * 17u + 11u);
    put(0x400d3176 + 0x102, 4, 0x4003b3d0);
    put(0x400d3176 + 0xa2, 4, 4); put(0x400d3176 + 0xd2, 4, 121);
    uint8_t original[sizeof stock_page]; memcpy(original, stock_page, sizeof original);
    const struct modwerk_machine *m = &og_machine_descriptor;
    assert(m->abi == MODWERK_MACHINE_ABI && m->sig[0] == 'F' && m->sig[1] == 'R');
    assert(m->sig_lo == 1 && m->sig_hi == 1 && !strcmp(m->label, "FRACT"));
    assert(!m->source_kind);
#ifdef OG_MACHINE_START_EXTENSION
    assert(m->flags == (MODWERK_MACHINE_PROTECT | MODWERK_MACHINE_POOL | MODWERK_MACHINE_START));
    assert(og_machine_start_descriptor.abi == MODWERK_MACHINE_START_ABI);
    assert(og_machine_start_descriptor.bytes == sizeof(struct modwerk_machine_start));
    assert(og_machine_start_descriptor.machine == m && og_machine_start_descriptor.start == og_machine_start);
#else
    assert(m->flags == (MODWERK_MACHINE_PROTECT | MODWERK_MACHINE_POOL));
#endif
    assert(m->render == og_machine_render && m->leave == og_machine_leave);
#ifdef OG_MACHINE_GRAIN_ONLY
    uint8_t empty_part[6322] = {0};
    for (unsigned t = 0; t < 8; ++t) assert(m->admit_track(empty_part, t) == (t < 4));
#else
    for (unsigned t = 0; t < 8; ++t) assert(m->admit_track(NULL, t));
#endif
    assert(!m->admit_track(NULL, 8));
    assert(m->track_page(NULL) == (uint32_t)(uintptr_t)(og_machine_page_data + 0x38));
    assert(!memcmp(original, stock_page, sizeof original));
    assert(!memcmp(m->defaults, og_machine_page_data + 0x96, 12));
    assert(!strcmp((char *)og_machine_page_data + 0x4e, "POS"));
#ifdef OG_MACHINE_GRAIN_ONLY
    const unsigned unused[] = {7, 9, 10, 11};
    assert(!strcmp((char *)og_machine_page_data + 0x4e + 6*4, "SHPE"));
    assert(!strcmp((char *)og_machine_page_data + 0x4e + 6*5, "PTCH"));
    assert(m->defaults[11] == OG_GRAIN_LAYOUT_MARKER);
    assert(page_value(0x1c6) == 0x01111111);
    assert(page_value(0xa2 + 20) == 4 && page_value(0xd2 + 20) == 121);
    assert(page_value(0x102 + 20) == 0x4003b3d0);
#else
    const unsigned unused[] = {7, 9, 10, 11};
    assert(!m->defaults[11]);
    assert(page_value(0x1c6) == 0x01111111);
#endif
    for (unsigned n = 0; n < sizeof unused / sizeof *unused; ++n) {
        unsigned i = unused[n];
        assert(!og_machine_page_data[0x4e + 6 * i]);
        assert(!page_value(0x102 + 4 * i) && !page_value(0xd2 + 4 * i));
    }
    assert(!m->defaults[10]);
    assert(page_value(0xd2 + 32) == 2 && !page_value(0xd2 + 40) && !page_value(0xd2 + 44));
    assert(page_value(0x1c2) == 0x1);
    char range[6]; range_text(range, 1); assert(!strcmp(range, "LOCAL"));
    range_text(range, 0); assert(!strcmp(range, "FULL"));
    range_text(range, 255); assert(!strcmp(range, "FULL"));
    puts("prototype registry descriptor and native SRC page clone: OK");
}
/* Optional private firmware probe streams only packet words and observed
 * fetch lengths here. No firmware/sample bytes are compiled into this test. */
static void captured_packet_checks(void) {
    unsigned output, words, segments, cases = 0;
    while (scanf("%u %u %u", &output, &words, &segments) == 3) {
        unsigned expected[4] = {0}, actual[4] = {0};
        assert(words >= 4 && words <= 84 && segments <= 3);
        for (unsigned i = 0; i < segments; ++i) assert(scanf("%u", expected + i) == 1);
        for (unsigned i = 0; i < words; ++i) assert(scanf("%x", packet_words + i) == 1);
        unsigned n = packet_chunks(0x80001c90, 0x80001c90 + 4 * words, output, actual);
        if (n != (output ? segments : 0) || memcmp(expected, actual, sizeof expected)) {
            fprintf(stderr, "packet %u: outputs=%u words=%u expected-segments=%u parsed=%u\n",
                    cases, output, words, segments, n);
            for (unsigned i = 0; i < segments; ++i)
                fprintf(stderr, "fetch %u: observed=%u parsed=%u\n", i, expected[i], actual[i]);
        }
        assert(n == (output ? segments : 0));
        assert(!memcmp(expected, actual, sizeof expected));
        ++cases;
    }
    assert(feof(stdin) && cases);
    printf("%u executed stock-builder packets match C parser source boundaries\n", cases);
}
int main(int argc, char **argv) {
    assert(argc == 2);
    if (!strcmp(argv[1], "differential")) differential();
    else if (!strcmp(argv[1], "lifecycle")) lifecycle();
    else if (!strcmp(argv[1], "native")) native_render_checks();
    else if (!strcmp(argv[1], "packets")) packet_checks();
    else if (!strcmp(argv[1], "start")) start_checks();
    else if (!strcmp(argv[1], "captured-packets")) captured_packet_checks();
#ifdef OG_MACHINE_SOURCE_TRANSPORT
    else if (!strcmp(argv[1], "source-capture")) source_capture_checks();
#endif
    else {assert(!strcmp(argv[1], "registration")); registration_checks();}
    return 0;
}
