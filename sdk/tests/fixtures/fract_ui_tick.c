/* Authored UI scheduler fixture; native memory and source metadata are modeled. */
#include <assert.h>
#include <stdint.h>
#include "source.h"
static unsigned page, track, owned = 1, layer_kind, modal_a, modal_b, message;
static uint32_t layer_pointer = 0x41000000u;
static unsigned redraws;
static uint32_t get32(uintptr_t at) {
    if (at == 0x460d173au) return modal_a;
    if (at == 0x460d1694u) return modal_b;
    if (at == 0x460d1e70u) return message;
    if (at == 0x460d165cu) return layer_pointer;
    if (at == 0x41000000u) return layer_kind;
    if (at == 0x46c82456u) return 0; /* No loaded source. */
    assert(!"unexpected UI word read"); return 0;
}
static unsigned get8(uintptr_t at) {
    if (at == 0x46c7d8d8u) return page;
    if (at == 0x80000015u) return page;
    if (at == 0x100b14ccu) return track;
    assert(!"unexpected UI byte read"); return 0;
}
static void put32(uintptr_t at, uint32_t value) {
    assert(at == 0x46c7c72cu && value == 1); ++redraws;
}
#define U8(a) get8(a)
#define U16(a) ((uint16_t)get32(a))
#define U32(a) get32(a)
#define OG_PUT32(a,v) put32(a,v)
#define OG_MACHINE_OWNS(t) ((t) == 0 && owned)
#include "fract_ui.c"
int og_describe(unsigned slot, OgSource *s) { (void)slot; (void)s; return 0; }
uintptr_t og_locate(const OgSource *s, uint32_t f, uint32_t *n) {
    (void)s; (void)f; (void)n; assert(!"unexpected sample read"); return 0;
}
int main(void) {
    fract_ui_tick(); assert(redraws == 1);
    for (unsigned i = 0; i < 7; ++i) fract_ui_tick();
    assert(redraws == 1);
    fract_ui_tick(); assert(redraws == 2);
    /* Each hidden state suppresses redraw and resets the visible cadence. */
    for (unsigned hidden = 0; hidden < 9; ++hidden) {
        page = hidden == 0; modal_a = hidden == 1; modal_b = hidden == 2;
        layer_pointer = hidden == 3 ? 0 : 0x41000000u;
        layer_kind = hidden == 4; track = hidden == 5 ? 8 : hidden == 6 ? 1 : 0;
        owned = hidden != 7;
        message = hidden == 8;
        unsigned before = redraws;
        for (unsigned i = 0; i < 10; ++i) fract_ui_tick();
        assert(redraws == before);
        page = modal_a = modal_b = layer_kind = track = message = 0;
        layer_pointer = 0x41000000u; owned = 1;
        fract_ui_tick(); assert(redraws == before + 1);
    }
    return 0;
}
