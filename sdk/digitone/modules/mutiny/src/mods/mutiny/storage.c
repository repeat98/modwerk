/* SPDX-License-Identifier: GPL-2.0-or-later */
#include "storage.h"

#define HEADER_BYTES 4u
#define TRACK_BYTES 26u
#define CRC_OFFSET 108u
#define FOOTER_OFFSET 112u

/* The record layout must add up: header, four tracks, then the CRC. */
typedef char mu_store_layout_check[(HEADER_BYTES + MU_STORE_TRACKS * TRACK_BYTES == CRC_OFFSET &&
                                    TRACK_BYTES == 1u + 3u * MU_PARAMS + 4u &&
                                    CRC_OFFSET + 4u == FOOTER_OFFSET)
                                       ? 1
                                       : -1];

#ifdef MU_STORE_PROBE
uint32_t mu_store_probe_saves;
#endif

/* CRC-32/ISO-HDLC, over the fixed header and track bytes. */
static uint32_t checksum(const uint8_t *bytes) {
    uint32_t crc = 0xffffffffu, i, bit;
    for (i = 0; i < CRC_OFFSET; i++) {
        crc ^= bytes[i];
        for (bit = 0; bit < 8; bit++)
            crc = (crc >> 1) ^ ((crc & 1u) ? 0xedb88320u : 0u);
    }
    return crc ^ 0xffffffffu;
}

static void put_track(uint8_t *out, const struct mu_track *recipe, uint8_t play) {
    uint32_t m, i, pos = 0;
    out[pos++] = recipe->model;
    for (m = MU_EUCL; m < MU_MODELS; m++)
        for (i = 0; i < MU_PARAMS; i++)
            out[pos++] = recipe->p[m][i];
    out[pos++] = recipe->seed;
    out[pos++] = recipe->acid[0];
    out[pos++] = recipe->acid[1];
    out[pos] = play;
}

static void finish(uint8_t *out) {
    uint32_t crc = checksum(out);
    out[CRC_OFFSET] = (uint8_t)(crc >> 24);
    out[CRC_OFFSET + 1] = (uint8_t)(crc >> 16);
    out[CRC_OFFSET + 2] = (uint8_t)(crc >> 8);
    out[CRC_OFFSET + 3] = (uint8_t)crc;
    out[FOOTER_OFFSET] = 'M';
    out[FOOTER_OFFSET + 1] = 'U';
    out[FOOTER_OFFSET + 2] = 'T';
    out[FOOTER_OFFSET + 3] = '2';
}

void mu_store_defaults(struct mu_store *s) {
    struct mu_track recipe;
    uint32_t i;
    s->bytes[0] = MU_STORE_VER;
    s->bytes[1] = s->bytes[2] = s->bytes[3] = 0;
    mu_defaults(&recipe);
    for (i = 0; i < MU_STORE_TRACKS; i++)
        put_track(s->bytes + HEADER_BYTES + i * TRACK_BYTES, &recipe, MU_PLAY_NATIVE);
    finish(s->bytes);
}

static int valid(const uint8_t *bytes, uint32_t len) {
    uint32_t i, crc;
    if (!bytes || len != MU_STORE_BYTES || bytes[0] != MU_STORE_VER || bytes[1] || bytes[2] ||
        bytes[3] || bytes[FOOTER_OFFSET] != 'M' || bytes[FOOTER_OFFSET + 1] != 'U' ||
        bytes[FOOTER_OFFSET + 2] != 'T' || bytes[FOOTER_OFFSET + 3] != '2')
        return 0;
    crc = (uint32_t)bytes[CRC_OFFSET] << 24 | (uint32_t)bytes[CRC_OFFSET + 1] << 16 |
          (uint32_t)bytes[CRC_OFFSET + 2] << 8 | bytes[CRC_OFFSET + 3];
    if (checksum(bytes) != crc)
        return 0;
    for (i = 0; i < MU_STORE_TRACKS; i++) {
        const uint8_t *track = bytes + HEADER_BYTES + i * TRACK_BYTES;
        if (track[0] >= MU_MODELS || track[25] > MU_PLAY_GENERATED)
            return 0;
    }
    return 1;
}

int mu_store_valid(const struct mu_store *s) { return s && valid(s->bytes, MU_STORE_BYTES); }

int mu_store_decode(struct mu_rt *rt, const uint8_t *bytes, uint32_t len) {
    uint32_t t, m, i;
    if (!valid(bytes, len)) {
        mu_rt_init(rt);
        return 0;
    }
    mu_rt_init(rt);
    for (t = 0; t < MU_STORE_TRACKS; t++) {
        const uint8_t *wire = bytes + HEADER_BYTES + t * TRACK_BYTES;
        struct mu_track recipe;
        uint32_t pos = 0;
        mu_defaults(&recipe);
        recipe.model = wire[pos++];
        for (m = MU_EUCL; m < MU_MODELS; m++)
            for (i = 0; i < MU_PARAMS; i++)
                recipe.p[m][i] = wire[pos++];
        recipe.seed = wire[pos++];
        recipe.acid[0] = wire[pos++];
        recipe.acid[1] = wire[pos++];
        mu_fill(&recipe);
        mu_rt_load(&rt->t[t], &recipe, wire[pos]);
    }
    return 1;
}

void mu_store_load(const struct mu_store *s, struct mu_rt *rt) {
    (void)mu_store_decode(rt, s ? s->bytes : 0, s ? MU_STORE_BYTES : 0);
}

void mu_store_save(struct mu_store *s, const struct mu_rt *rt) {
    uint32_t i;
#ifdef MU_STORE_PROBE
    mu_store_probe_saves++;
#endif
    s->bytes[0] = MU_STORE_VER;
    s->bytes[1] = s->bytes[2] = s->bytes[3] = 0;
    for (i = 0; i < MU_STORE_TRACKS; i++)
        put_track(s->bytes + HEADER_BYTES + i * TRACK_BYTES, &rt->t[i].recipe, rt->t[i].play);
    finish(s->bytes);
}

int mu_store_matches(const struct mu_store *s, const struct mu_rt *rt) {
    uint32_t t, m, i;
    if (s->bytes[0] != MU_STORE_VER || s->bytes[1] || s->bytes[2] || s->bytes[3] ||
        s->bytes[FOOTER_OFFSET] != 'M' || s->bytes[FOOTER_OFFSET + 1] != 'U' ||
        s->bytes[FOOTER_OFFSET + 2] != 'T' || s->bytes[FOOTER_OFFSET + 3] != '2')
        return 0;
    for (t = 0; t < MU_STORE_TRACKS; t++) {
        const uint8_t *wire = s->bytes + HEADER_BYTES + t * TRACK_BYTES;
        const struct mu_track *recipe = &rt->t[t].recipe;
        uint32_t pos = 0;
        if (wire[pos++] != recipe->model)
            return 0;
        for (m = MU_EUCL; m < MU_MODELS; m++)
            for (i = 0; i < MU_PARAMS; i++)
                if (wire[pos++] != recipe->p[m][i])
                    return 0;
        if (wire[pos++] != recipe->seed || wire[pos++] != recipe->acid[0] ||
            wire[pos++] != recipe->acid[1] || wire[pos] != rt->t[t].play)
            return 0;
    }
    return 1;
}
