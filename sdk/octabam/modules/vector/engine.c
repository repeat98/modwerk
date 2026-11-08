/* Copyright (c) 2026 Octamod contributors. MIT. Original implementation.
 * Musical inspiration: Iftah's Sting 2. No Sting source/assets are used. */
#include "engine.h"
const VectorParams vector_defaults = {11, 11, 0, 1, 32, 48, 12, 12, 0, 0, 0};
const char *const vector_control_names[12] = {"TYPE", "DENS", "ROOT", "SCAL", "GATE", "ACNT", "SEED", "SPAN", "OFST", "ROT", "RPT", "DIR"};
const uint8_t vector_control_max[12] = {15, 16, 11, 4, 126, 127, 127, 12, 24, 63, 64, 1};
const char *const vector_scale_names[5] = {"CHR", "MIN", "MAJ", "DOR", "PENT"};
static const uint16_t scales[5] = {0x0fff, 0x05ad, 0x0ab5, 0x06ad, 0x04a9};
static unsigned limit(unsigned value, unsigned max) { return value > max ? max : value; }
static uint32_t mix(uint32_t x) {
    x ^= x >> 16; x *= 0x7feb352du; x ^= x >> 15;
    x *= 0x846ca68bu; return x ^ (x >> 16);
}
uint32_t vector_next_seed(uint32_t seed) { return (seed + 1u) & 127u; }
void vector_pack(uint8_t out[9], const VectorParams *p, uint32_t seed) {
    out[0]=(uint8_t)(limit(p->type,15) | limit(p->scale,4)<<4);
    out[1]=(uint8_t)(limit(p->density,16) | limit(p->direction,1)<<5);
    out[2]=(uint8_t)(limit(p->root,11) | limit(p->span,12)<<4);
    out[3]=(uint8_t)limit(p->gate,126); out[4]=(uint8_t)limit(p->accent,127);
    out[5]=(uint8_t)limit(p->offset,24); out[6]=(uint8_t)limit(p->rotation,63);
    out[7]=(uint8_t)limit(p->repeat,64); out[8]=(uint8_t)(seed&127u);
}
void vector_unpack(VectorParams *p, uint32_t *seed, const uint8_t in[9]) {
    p->type=(uint8_t)(in[0]&15u); p->scale=(uint8_t)limit(in[0]>>4,4);
    p->density=(uint8_t)limit(in[1]&31u,16); p->direction=(uint8_t)((in[1]>>5)&1u);
    p->root=(uint8_t)limit(in[2]&15u,11); p->span=(uint8_t)limit(in[2]>>4,12);
    p->gate=(uint8_t)limit(in[3],126); p->accent=(uint8_t)limit(in[4],127);
    p->offset=(uint8_t)limit(in[5],24); p->rotation=(uint8_t)limit(in[6],63);
    p->repeat=(uint8_t)limit(in[7],64); *seed=in[8]&127u;
}
static int in_window(int pitch, unsigned span, int center) {
    return pitch>=center-(int)span && pitch<=center+(int)span;
}
static int semitone(unsigned degree, unsigned root, unsigned scale, unsigned span, int center) {
    unsigned allowed[25], n = 0;
    int closest=0, distance=100;
    for (int pitch = -12; pitch <= 12; ++pitch) {
        unsigned pc = (unsigned)(pitch + 24 - (int)root) % 12;
        if ((scales[scale] >> pc) & 1u) {
            if(in_window(pitch,span,center)) allowed[n++] = (unsigned)(pitch + 12);
            int d=pitch-center; if(d<0) d=-d;
            if(d<distance) { closest=pitch; distance=d; }
        }
    }
    return n ? (int)allowed[degree % n] - 12 : closest;
}
int vector_generate(VectorPhrase *out, const VectorParams *params,
                   unsigned length, unsigned base_volume, uint32_t seed) {
    if (!out || !params || !length || length > VECTOR_STEPS || base_volume > 127) return 0;
    const unsigned type = limit(params->type, 15), density = limit(params->density, 16);
    const unsigned root = limit(params->root, 11), scale = limit(params->scale, 4);
    const unsigned gate = limit(params->gate, 126), accent = limit(params->accent, 127);
    const unsigned span=limit(params->span,12), rotation=limit(params->rotation,63)%length;
    const int center=(int)limit(params->offset,24)-12;
    unsigned period=limit(params->repeat,64);
    if(!period || period>length) period=length;
    VectorStep motif[VECTOR_STEPS];
    unsigned order[VECTOR_STEPS]; uint32_t ranks[VECTOR_STEPS];
    out->length = (uint8_t)length;
    for (unsigned i = 0; i < VECTOR_STEPS; ++i) {
        out->steps[i].active = 0;
        out->steps[i].pitch = out->steps[i].hold = out->steps[i].volume = VECTOR_NO_LOCK;
        motif[i]=out->steps[i];
    }
    /* Rank once per request. Keeping the random rank independent of density
     * means increasing DENS adds notes without moving the ones already there.
     * Insertion sort has a hard upper bound of 2016 comparisons at length 64. */
    for (unsigned i = 0; i < period; ++i) {
        uint32_t r = mix(seed ^ (0x9e3779b9u * (i + 1u)));
        ranks[i] = (r & 0xffffu) + ((i % 4u) ? type * 2048u : 0u);
        unsigned j = i;
        while (j && ranks[order[j - 1]] > ranks[i]) { order[j] = order[j - 1]; --j; }
        order[j] = i;
    }
    unsigned count = (period * density + 8u) / 16u;
    for (unsigned i = 0; i < count; ++i) motif[order[i]].active = 1;
    for (unsigned i = 0; i < period; ++i) {
        VectorStep *s = &motif[i];
        if (!s->active) continue;
        uint32_t r = mix(seed ^ (0x85ebca6bu * (i + 1u)) ^ 0xb5297a4du);
        int pitch = semitone(r >> 8, root, scale, span, center);
        /* High TYPE prefers tonic and fifth; constrain the fifth to the scale
         * too (chromatic/root transposition must never break scale membership). */
        if ((r & 15u) < type) {
            unsigned pc = ((r >> 4) & 3u) ? root : (root + 7u) % 12u;
            if (!((scales[scale] >> ((pc + 12u - root) % 12u)) & 1u)) pc = root;
            int preferred=(int)pc;
            if ((r >> 6) & 1u) preferred -= 12;
            if(in_window(preferred,span,center)) pitch=preferred;
        }
        s->pitch = (uint8_t)(64 + 5 * pitch);
        s->hold = (uint8_t)(gate * (2u + ((r >> 24) % 3u)) / 4u);
        unsigned strong = i % 4u == 0u || ((r >> 20) & 3u) == 0u;
        s->volume = (uint8_t)(strong ? base_volume : base_volume * (254u - accent) / 254u);
    }
    for(unsigned i=0;i<length;++i) {
        unsigned source=(i+length-rotation)%length;
        if(params->direction) source=length-1u-source;
        out->steps[i]=motif[source%period];
    }
    return 1;
}
static unsigned bit(const uint8_t *r, unsigned mask, unsigned step) {
    return (r[mask * 8u + 7u - step / 8u] >> (step % 8u)) & 1u;
}
static void setbit(uint8_t *r, unsigned mask, unsigned step, unsigned value) {
    uint8_t *byte = r + mask * 8u + 7u - step / 8u;
    uint8_t b = (uint8_t)(1u << (step % 8u));
    *byte = value ? (uint8_t)(*byte | b) : (uint8_t)(*byte & (uint8_t)~b);
}
int vector_track_empty(const uint8_t *r, size_t size) {
    if (!r || size < VECTOR_TRACK_BYTES) return 0;
    /* Recorder trigs, trigless edits and slide marks also prevent auto-fill.
     * Swing is a stock default, so mask 8 is deliberately excluded. */
    for (unsigned i = 0; i < 64; ++i) if (r[i]) return 0;
    for (unsigned i = 72; i < 80; ++i) if (r[i]) return 0;
    for (unsigned i = 0; i < VECTOR_STEPS * 32u; ++i)
        if (r[VECTOR_LOCKS + i] != VECTOR_NO_LOCK) return 0;
    return 1;
}
int vector_write_phrase(uint8_t *r, size_t size, const VectorPhrase *phrase, int replace) {
    if (!r || size < VECTOR_TRACK_BYTES || !phrase || !phrase->length || phrase->length > 64) return 0;
    if (!replace && !vector_track_empty(r, size)) return 0;
    /* Validate the entire input before the first store. */
    for (unsigned i = 0; i < VECTOR_STEPS; ++i) {
        const VectorStep *s = &phrase->steps[i];
        if (s->active > 1 || (i >= phrase->length && s->active)) return 0;
        if (s->active && (s->pitch < 4 || s->pitch > 124 || (s->pitch - 4) % 5 || s->hold > 126 || s->volume > 127)) return 0;
    }
    for (unsigned i = 0; i < VECTOR_STEPS; ++i) {
        uint8_t *locks = r + VECTOR_LOCKS + 32u * i;
        const VectorStep *s = &phrase->steps[i];
        unsigned old = bit(r, 0, i);
        locks[0] = s->active ? s->pitch : VECTOR_NO_LOCK;
        locks[13] = s->active ? s->hold : VECTOR_NO_LOCK;
        locks[15] = s->active ? s->volume : VECTOR_NO_LOCK;
        setbit(r, 0, i, s->active);
        /* Old/new note timing and conditions should not silently suppress the
         * new phrase. Preserve recorder masks, swing, and unrelated locks. */
        if (old || s->active) {
            r[0x89au + 2u * i] = r[0x89bu + 2u * i] = 0;
            setbit(r, 1, i, 0); setbit(r, 3, i, 0); setbit(r, 9, i, 0);
        }
        unsigned has_lock = 0;
        for (unsigned k = 0; k < 32; ++k) has_lock |= locks[k] != VECTOR_NO_LOCK;
        setbit(r, 2, i, !s->active && has_lock);
    }
    return 1;
}
