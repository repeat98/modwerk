/* Temporary stock SRC view, shared by render and the START callback.
 * Never leave custom controls exposed to a stock source routine. This is not
 * a registration seam: START uses the supported shared base dispatcher. */
#ifndef FRACT_NATIVE_SOURCE_H
#define FRACT_NATIVE_SOURCE_H
#include "machine.h"
#include "selection.h"
#ifndef OG_PUT8
#define OG_PUT8(a, v) (U8(a) = (uint8_t)(v))
#endif
#ifndef OG_PUT16
#define OG_PUT16(a, v) (U16(a) = (uint16_t)(v))
#endif
#ifndef OG_PUT32
#define OG_PUT32(a, v) (U32(a) = (uint32_t)(v))
#endif
typedef struct {
    uintptr_t fp;
    unsigned ping;
#ifdef OG_MACHINE_GRAIN_ONLY
    uint32_t main_words[3], setup_word;
    uint16_t setup_tail;
    unsigned modern;
#else
    uint16_t main[6];
    uint8_t setup[6];
#endif
} OgNativeView;

static inline uint16_t og_native_main(const OgNativeView *view, unsigned i) {
#ifdef OG_MACHINE_GRAIN_ONLY
    return (uint16_t)(view->main_words[i / 2u] >> (i & 1u ? 0 : 16));
#else
    return view->main[i];
#endif
}
static inline uint8_t og_native_setup(const OgNativeView *view, unsigned i) {
#ifdef OG_MACHINE_GRAIN_ONLY
    return i < 4u ? (uint8_t)(view->setup_word >> (24u - 8u * i)) :
                   (uint8_t)(view->setup_tail >> (i == 4u ? 8 : 0));
#else
    return view->setup[i];
#endif
}

static int og_native_open(unsigned track, OgNativeView *view) {
    uintptr_t lane = 0x80000510u + track * 48u;
    uintptr_t fp = U32(0x800062a8u);
    if (track >= 8 || (fp != lane && fp != lane + 384u)) return 0;
    view->fp = fp;
    view->ping = (unsigned)(fp - lane) / 384u;
#ifdef OG_MACHINE_GRAIN_ONLY
    /* Keep the exact bus words for restoration. Extract only controls that
     * a caller actually needs, without unpacking and repacking the snapshot. */
    for (unsigned i=0;i<3;++i) view->main_words[i]=U32(fp+4u*i);
    view->setup_word=U32(fp+24u);view->setup_tail=U16(fp+28u);
#else
    for (unsigned i = 0; i < 6; ++i) {
        view->main[i] = U16(fp + 2u * i);
        view->setup[i] = U8(fp + 24u + i);
    }
#endif
    /* MAIN F supplies native pitch in the current grain-only layout. Older
     * Parts retain neutral pitch until their controls are upgraded. */
    uint16_t pitch = 0x4000;
#ifdef OG_MACHINE_GRAIN_ONLY
    view->modern=OG_MACHINE_LAYOUT_CURRENT(track);
    if (view->modern) {
        pitch = og_native_main(view, 5);
        if (pitch < 0x0400) pitch = 0x0400;
        if (pitch > 0x7c00) pitch = 0x7c00;
    }
#endif
#ifdef OG_MACHINE_GRAIN_ONLY
    OG_PUT32(fp,(uint32_t)pitch<<16);
    OG_PUT32(fp+4u,0x7f007f00u);OG_PUT32(fp+8u,0x00004000u);
    OG_PUT32(fp+24u,0x01000000u);OG_PUT16(fp+28u,0);
#else
    const uint16_t main[6] = {pitch, 0, 0x7f00, 0x7f00, 0, 0x4000};
    for (unsigned i = 0; i < 6; ++i) {
        OG_PUT16(fp + 2u * i, main[i]);
        OG_PUT8(fp + 24u + i, i == 0 ? 1 : 0);
    }
#endif
    OG_PUT8(0x800049d8u + track * 168u + 24u, 0);
    return 1;
}

static void og_native_close(unsigned track, const OgNativeView *view) {
#ifdef OG_MACHINE_GRAIN_ONLY
    for (unsigned i=0;i<3;++i) OG_PUT32(view->fp+4u*i,view->main_words[i]);
    OG_PUT32(view->fp+24u,view->setup_word);
    OG_PUT16(view->fp+28u,view->setup_tail);
#else
    for (unsigned i = 0; i < 6; ++i) {
        OG_PUT16(view->fp + 2u * i, view->main[i]);
        OG_PUT8(view->fp + 24u + i, view->setup[i]);
    }
#endif
    /* START invalidates this cache. Keep our source at OFF after it, too. */
    OG_PUT8(0x800049d8u + track * 168u + 24u, 0);
}
#endif
