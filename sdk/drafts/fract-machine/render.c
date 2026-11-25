/* Registered grain-only render callback. Stock's bounded packet builder
 * supplies headers, repitch and the native source signal;
 * every granular instruction executes inside this callback's frame guard. */
#include "render.h"
#include "base_binding.h"
#include "native_source.h"
#include "cpu_profile.h"
#ifdef OG_MACHINE_SOURCE_TRANSPORT
#ifndef OG_MACHINE_PROTOTYPE
#error "Source capture requires the experimental machine gate"
#endif
#include "source_runtime.h"
/* Supplied by the eventual admitted source lease, never a guessed constant.
 * An absent/disabled lease returns zero and the transport refuses the frame. */
extern uint32_t og_source_generation(unsigned track);
#endif
#ifndef OG_FLEX_RENDER
#define OG_FLEX_RENDER(t,p,s,e) \
    ((int (*)(unsigned,unsigned,unsigned,unsigned))(uintptr_t)0x40004008u)(t,p,s,e)
#endif
#ifndef OG_PACKET_AUDIO
#define OG_PACKET_AUDIO(a) ((int32_t *)(uintptr_t)(a))
#endif

static inline OgMachineControls og_machine_controls(const OgNativeView *view) {
#ifdef OG_MACHINE_GRAIN_ONLY
    /* A restored older Part may render before its first UI tick migrates it.
     * Read its old SHPE/PAN positions until the disabled-slot marker changes. */
    int modern = view->modern;
    const OgMachineControls controls = {
        127, (uint8_t)(og_native_main(view, 1) >> 8), (uint8_t)(og_native_main(view, 0) >> 8), 64,
        (uint8_t)(og_native_main(view, 3) >> 8), og_native_setup(view, 0),
        (uint8_t)(og_native_main(view, modern ? 4 : 5) >> 8), (uint8_t)(og_native_main(view, 2) >> 8), og_native_setup(view, 2)
    };
#else
    const OgMachineControls controls = {
        127, (uint8_t)(og_native_main(view, 1) >> 8), (uint8_t)(og_native_main(view, 0) >> 8), 64,
        (uint8_t)(og_native_main(view, 3) >> 8), og_native_setup(view, 0), (uint8_t)(og_native_main(view, 5) >> 8),
        (uint8_t)(og_native_main(view, 2) >> 8), og_native_setup(view, 2)
    };
#endif
    return controls;
}

/* Stock 1.40C render 0x4000417c..0x40004258: the low header byte is the
 * total SOURCE count; the next three bytes describe OUTPUT subsegments.
 * Additional subsegments have phase words
 * after the contiguous source PCM. Recover each fetch's SOURCE count from
 * its Q26 phase/rate and prior ring index, then verify the complete extent
 * before allowing any granular write. Preserve fetch boundaries: entry ramps,
 * endpoint caching and control latches must see the same chunks as the FX path.
 * The private opt-in probe compares this to executed stock-builder fetches;
 * source fetch and START themselves remain separate lifecycle contracts. */
static unsigned packet_chunks(uintptr_t before, uintptr_t after,
                              unsigned output_frames, unsigned counts[4]) {
    if (after < before + 16u) return 0;
    uint32_t header = U32(before), remaining = header >> 8;
    unsigned segments = 0, outputs = 0;
    while (remaining && segments < 3) {
        unsigned n = remaining & 255u;
        if (!n || n > 16) return 0;
        outputs += n;
        ++segments;
        remaining >>= 8;
    }
    if (!segments || outputs != output_frames) return 0;
    unsigned trailer = 4u * (segments - 1u);
    if (after - before < 16u + trailer) return 0;
    unsigned bytes = (unsigned)(after - before) - 16u - trailer;
    if (bytes & 7u) return 0;
    uint32_t ring = U32(before + 4u), rate = U32(before + 8u);
    if (ring > 63 || !rate || rate >= 0x80000000u) return 0;
    unsigned sources = 0;
    for (unsigned i = 0; i < segments; ++i) {
        unsigned n = (header >> (8u * (i + 1u))) & 255u;
        uint32_t phase = U32(i ? after - trailer + 4u * (i - 1u) : before + 12u);
        /* Match native 32-bit wrap before the logical shift. */
        uint32_t next = (phase + rate * (n - 1u) + 0x07ffffffu) >> 26;
        counts[i] = (next - ring) & 63u;
        sources += counts[i];
        ring = next;
    }
    return sources == (header & 255u) && 8u * sources == bytes ? segments : 0;
}

#ifdef OG_MACHINE_CPU_PROFILE
static int og_machine_render_body(unsigned track, unsigned ping, unsigned start, unsigned end) {
#else
int og_machine_render(unsigned track, unsigned ping, unsigned start, unsigned end) {
#endif
    if (!og_machine_base_ready()) return 0;
    if (track >= 8 || ping > 1 || start > end || end > 16) return 0;
    if (!OG_MACHINE_OWNS(track)) return OG_FLEX_RENDER(track, ping, start, end);

    unsigned owner = og_owner;
    /* This track's signature was just checked; Part/owner cannot change
     * from the UI task inside this frame interrupt. */
    if (owner < 8 && ((owner != track && !OG_MACHINE_OWNS(owner)) || !U8(0x800049d8u + owner * 168u)))
        og_machine_leave(owner);

    /* The first call passes the previous ping (0x800000e4), but fp, packet
     * destination and DSP record already use the current frame's ping
     * (0x800000e0). Never select those records from the callback's ping. */
    uintptr_t state = 0x80004898u + track * 40u;
    if (U32(0x800062a4u) != state) return 0;
#if defined(OG_MACHINE_GRAIN_ONLY) && !defined(OG_MACHINE_CPU_PROFILE)
    /* Executed-stock proof: with cached RTRG/TSTR off, zero spans below16
     * neither read SRC controls nor call fetch/START/the increment hook.
     * Keep the native call and source retirement, without translating SRC.
     * end==16 still takes the full path: it refreshes native pitch. */
    if (start == end && end < 16u) {
        uintptr_t lane=0x80000510u+track*48u,fp=U32(0x800062a8u);
        if (fp!=lane && fp!=lane+384u) return 0;
        uintptr_t voice=0x800049d8u+track*168u;
        OG_PUT32(state+4u,0);
        OG_PUT8(voice+24u,0);
        int result=OG_FLEX_RENDER(track,ping,start,end);
        OG_PUT8(voice+24u,0);
        OgSource source={0};
        if (!U8(voice) || U8(voice+20u)!=1 || !og_describe(U8(voice+21u),&source))
            og_machine_leave(track);
        return result;
    }
#endif
    OgNativeView view;
    if (!og_native_open(track, &view)) return 0;
    unsigned frame_ping = view.ping;
#ifdef OG_MACHINE_SOURCE_TRANSPORT
    uint16_t space = og_native_main(&view, 4);
#endif
#ifdef OG_MACHINE_CPU_PROFILE
    const OgMachineControls controls = og_machine_controls(&view);
#endif
    /* Between callbacks, the frame builder seeds native retrig from SRC+8
     * (custom SHPE bytes). Disable that cached counter for this machine only. */
    OG_PUT32(state + 4u, 0);
    uintptr_t voice = 0x800049d8u + track * 168u;
    uintptr_t before = U32(0x80001c80u);
#ifdef OG_MACHINE_CPU_PROFILE
    og_cpu_context(track,og_native_main(&view,5)>>8,controls.size,controls.shape,0);
    uint32_t flex_at=og_cpu_clock();
#endif
    int result = OG_FLEX_RENDER(track, ping, start, end);
#ifdef OG_MACHINE_CPU_PROFILE
    og_cpu_flex_end(flex_at);
#endif
    og_native_close(track, &view);

    OgSource source = {0};
    if (!U8(voice) || U8(voice + 20) != 1 || !og_describe(U8(voice + 21), &source)) {
        og_machine_leave(track);
        return result;
    }
#ifdef OG_MACHINE_CPU_PROFILE
    og_cpu_context(track,og_native_main(&view,5)>>8,controls.size,controls.shape,
                   (source.bytes==2?2u:0u)+(source.channels==2));
#endif
    /* Never infer a payload outside this track's 336-byte frame record. */
    uintptr_t base = 0x80001c90u + frame_ping * 0xa80u + track * 336u;
    uintptr_t after = U32(0x80001c80u);
    if (before < base || before - base > 320u || after < before + 16u ||
        after > base + 336u) return result;
    unsigned counts[4], segments = packet_chunks(before, after, end - start, counts);
    if (!segments) return result;
#ifndef OG_MACHINE_CPU_PROFILE
    /* Zero-length/empty native packets still run FLEX and source retirement,
     * but need no granular control materialization. */
    const OgMachineControls controls = og_machine_controls(&view);
#endif
    uintptr_t audio = before + 16u;
    int rendered = 0;
#ifdef OG_MACHINE_SOURCE_TRANSPORT
    int complete = segments != 0;
#endif
    for (unsigned i = 0; i < segments; ++i) {
        if (counts[i]) {
            int accepted = og_machine_chunk(track, &source, &controls,
                OG_PACKET_AUDIO(audio), counts[i]) == OG_MACHINE_RENDERED;
            if (accepted) rendered = 1;
#ifdef OG_MACHINE_SOURCE_TRANSPORT
            else complete = 0;
#endif
        }
        audio += 8u * counts[i];
    }
    if (rendered) {
        uintptr_t rec = 0x80000110u + (frame_ping * 8u + track) * 64u;
        OG_PUT16(rec + 60u, U16(rec + 60u) & ~0x100u);
    }
#ifdef OG_MACHINE_SOURCE_TRANSPORT
    /* A valid packet may reuse the native interpolator's already granular
     * source cache without fetching any new PCM. It still has output needing
     * SPACE, but may not acquire ownership or reuse a different source. */
    if (complete && og_owner == track &&
        og_state.identity == (source.identity ^ (source.slot << 24)))
        mw_source_capture(og_source_generation(track), track, frame_ping,
                          start, end, space);
#endif
    return result;
}
#ifdef OG_MACHINE_CPU_PROFILE
int og_machine_render(unsigned track,unsigned ping,unsigned start,unsigned end) {
    uint32_t at=og_cpu_render_begin(start<=end && end<=16u?end-start:0);
    int result=og_machine_render_body(track,ping,start,end);
    og_cpu_render_end(at);
    return result;
}
#endif
