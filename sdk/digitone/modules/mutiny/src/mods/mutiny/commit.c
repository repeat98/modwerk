/* SPDX-License-Identifier: GPL-2.0-or-later */
#include "commit.h"

/* OS 1.44 track offsets are in port144.h, as measured on the stock OS. */
#define LEN_2STEPS 30

static int lk_set(const uint8_t *b, uint32_t slot) {
    return b[2 * slot] != 0xff || b[2 * slot + 1] != 0xff;
}

static void lk_put(uint8_t *locks, uint32_t step, uint32_t slot, int16_t value) {
    uint8_t *b = locks + MU_PORT_LK_STEP * step, *v = b + 2 * slot;
    if (!lk_set(b, slot))
        b[MU_PORT_LK_COUNT]++;
    v[0] = (uint8_t)((uint16_t)value >> 8);
    v[1] = (uint8_t)value;
    locks[MU_PORT_LK_USED + slot] = 1;
}

#ifdef MU_LEN_MEMO_PROBE
/* Host test only (never defined by the build): observes the publication boundaries. */
extern void mu_len_memo_probe(const struct mu_len_memo *m);
#define MEMO_PROBE(m) mu_len_memo_probe(m)
#else
#define MEMO_PROBE(m) ((void)0)
#endif
/* Keeps the compiler from moving the identity publish relative to the clears. The target's store
 * buffer is in order and exception entry serialises, so store order is kept. */
#define MEMO_BARRIER() __asm__ volatile("" ::: "memory")

void mu_len_memo_init(struct mu_len_memo *m) {
    uint32_t i;
    m->identity = 0;
    for (i = 0; i < MU_STEPS; i++)
        m->base[i] = 0xff;
}

void mu_len_memo_bind(struct mu_len_memo *m, uint32_t identity) {
    uint32_t i;
    if (!m || (identity && m->identity == identity))
        return;
    m->identity = 0; /* 1: retire, so a reader refuses every entry from here on */
    MEMO_BARRIER();
    MEMO_PROBE(m);
    for (i = 0; i < MU_STEPS; i++)
        m->base[i] = 0xff;
    MEMO_BARRIER();
    MEMO_PROBE(m);
    m->identity = identity; /* 3: publish last, after the last entry is gone */
    MEMO_PROBE(m);
}

void mu_held_record(struct mu_len_memo *m, uint32_t step, int32_t base) {
    if (!m || step >= MU_STEPS)
        return;
    /* one byte: a reader either sees the old base or the new one, never a half-written entry */
    m->base[step] = (uint8_t)(base < 0 || base > 254 ? 0xff : base);
}

const struct mu_len_memo *mu_len_memo_for(const struct mu_len_memo *m, uint32_t identity) {
    if (!m || !identity || m->identity != identity)
        return 0; /* another pattern, or a memo that was never bound: no provenance */
    return m;
}

int32_t mu_held_base(int32_t stored, int32_t track_default, uint32_t step,
                     const struct mu_len_memo *m) {
    if (m && step < MU_STEPS && stored >= 0 && m->base[step] != 0xff &&
        mu_held_len((int32_t)m->base[step]) == stored)
        return m->base[step]; /* our own earlier extension: start where it began */
    return stored >= 0 ? stored : track_default;
}

uint32_t mu_commit_extent(int32_t track_len) {
    if (track_len < 1)
        return 0;
    return (uint32_t)track_len > MU_STEPS ? MU_STEPS : (uint32_t)track_len;
}

int mu_commit_page(uint32_t page, int32_t track_len, uint32_t *first, uint32_t *end) {
    uint32_t f = page * 16u, e;
    if (page > 3u || track_len < 1 || f >= (uint32_t)track_len || f >= MU_STEPS)
        return 0;
    e = f + 16u;
    if (e > (uint32_t)track_len)
        e = (uint32_t)track_len;
    if (e > MU_STEPS)
        e = MU_STEPS;
    *first = f;
    *end = e;
    return e > f;
}

int32_t mu_held_len(int32_t len) {
    int32_t u = len + 2; /* sixteenths of a step */
    if (len < 0 || len > LEN_2STEPS)
        return len;
    u = 16 + (u / 2 > 1 ? u / 2 : 1);
    return u - 2 > len ? u - 2 : len;
}

void mu_commit_plan(struct mu_native *plan, const struct mu_native *prior,
                    const struct mu_voice voice[MU_STEPS], uint32_t first, uint32_t len,
                    struct mu_len_memo *memo) {
    uint32_t i, k;
    uint8_t *data = plan->b, *locks = plan->b + MU_TRACK_BYTES;
    const uint8_t *before = prior->b;
    for (i = 0; i < MU_NATIVE_BYTES; i++)
        plan->b[i] = before[i]; /* everything not written below stays byte for byte */
    if (first > MU_STEPS)
        first = MU_STEPS;
    if (len > MU_STEPS)
        len = MU_STEPS;
    for (i = first; i < len; i++) {
        const struct mu_voice *v = &voice[i];
        uint8_t *word = &data[2 * i + 1], *note = &data[MU_PORT_TR_NOTES + 8 * i];
        if (v->trig) {
            *note = v->note;
            for (k = 1; k < 8; k++)
                note[k] = 0;
            data[MU_PORT_TR_VEL + i] = v->vel;
            data[MU_PORT_TR_COND + i] = 0xff;
            *word |= MU_PORT_WORD_TRIG;
            for (k = 0; k < v->nlock; k++)
                lk_put(locks, i, v->slot[k], v->value[k]);
            if (v->hold) {
                int32_t stored =
                    data[MU_PORT_TR_LEN + i] != 0xff ? (int8_t)data[MU_PORT_TR_LEN + i] : -1;
                int32_t base = mu_held_base(stored, (int8_t)data[MU_PORT_TR_LEN_OFFSET], i, memo);
                int32_t written = mu_held_len(base);
                data[MU_PORT_TR_LEN + i] = (uint8_t)(written < 0 ? 0xff : written);
                mu_held_record(memo, i, base);
            }
        } else if (*word & MU_PORT_WORD_TRIG) {
            *word &= (uint8_t)~MU_PORT_WORD_TRIG;
            *note = 0xff;
            data[MU_PORT_TR_VEL + i] = 0xff;
            data[MU_PORT_TR_COND + i] = 0xff;
            data[MU_PORT_TR_LEN + i] = 0xff;
            /* the locks stay: a stored lock trig and its locks sound in live playback too */
        }
    }
}

static void read_native(const struct mu_device *dev, struct mu_native *out) {
    uint32_t i;
    for (i = 0; i < MU_NATIVE_BYTES; i++)
        out->b[i] = dev->get(dev->ctx, i);
}

/* The readback is streamed: no 11 KB buffer on the UI task's stack. */
static uint32_t digest_device(const struct mu_device *dev) {
    uint32_t h = 2166136261u, i;
    for (i = 0; i < MU_NATIVE_BYTES; i++)
        h = (h ^ dev->get(dev->ctx, i)) * 16777619u;
    return h;
}

static int same_device(const struct mu_device *dev, const struct mu_native *want) {
    uint32_t i;
    for (i = 0; i < MU_NATIVE_BYTES; i++)
        if (dev->get(dev->ctx, i) != want->b[i])
            return 0;
    return 1;
}

static void write_native(const struct mu_device *dev, const struct mu_native *in) {
    uint32_t i;
    for (i = 0; i < MU_NATIVE_BYTES; i++)
        dev->put(dev->ctx, i, in->b[i]);
}

/* FNV-1a over the image: cheap, deterministic, and enough to notice a native edit. */
static uint32_t digest(const struct mu_native *n) {
    uint32_t h = 2166136261u, i;
    for (i = 0; i < MU_NATIVE_BYTES; i++)
        h = (h ^ n->b[i]) * 16777619u;
    return h;
}

int mu_commit_prepare(const struct mu_device *dev, struct mu_commit *c,
                      const struct mu_voice voice[MU_STEPS], uint32_t first, uint32_t len,
                      struct mu_native *plan, struct mu_len_memo *memo) {
    c->valid = 0;
    read_native(dev, &c->prior); /* the complete prior image, before any write */
    c->identity = dev->identity(dev->ctx);
    c->len = (uint16_t)len;
    mu_len_memo_bind(memo, c->identity); /* a memo from another pattern is not evidence */
    mu_commit_plan(plan, &c->prior, voice, first, len, memo);
    c->digest = digest(plan);
    return 1;
}

int mu_commit_apply(const struct mu_device *dev, struct mu_commit *c,
                    const struct mu_native *plan) {
    uint32_t id = c->identity;
    c->valid = 0;
    if (dev->identity(dev->ctx) != id)
        return 0; /* another pattern's buffer since the plan was made: do not write */
    write_native(dev, plan);
    if (dev->identity(dev->ctx) != id || !same_device(dev, plan)) {
        /* the pattern moved under the write, or the bytes did not land: restore only our own */
        if (dev->identity(dev->ctx) == id) {
            write_native(dev, &c->prior);
            if (!same_device(dev, &c->prior))
                return 0;
        }
        return 0;
    }
    c->valid = 1;
    return 1;
}

int mu_commit_undo(const struct mu_device *dev, struct mu_commit *c) {
    if (!c->valid)
        return 0;
    if (dev->identity(dev->ctx) != c->identity)
        return 0; /* another pattern's buffer: restoring would overwrite new music */
    if (digest_device(dev) != c->digest) {
        c->valid = 0; /* a native edit since the commit: the record is stale */
        return 0;
    }
    write_native(dev, &c->prior);
    if (!same_device(dev, &c->prior))
        return 0;
    c->valid = 0;
    return 1;
}
