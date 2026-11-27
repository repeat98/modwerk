/* SPDX-License-Identifier: GPL-2.0-or-later */
#include "playback.h"

/* Measured on OS 1.44: slot 55 is FLTR FREQ, 72 is AMP VOL, both 0-127 in 8.8. */
#define SLOT_PTIM 77
#define SLOT_PORT 78
#define SLOT_FREQ 55
#define SLOT_VOL 72
#define PORT_ON 0x4000
#define PORT_OFF 0x3f00
#define ACC_MAX 0x7f00
#define ACC_FREQ_SPAN 0x1800 /* ACNT 100: 24.0 on the cutoff (tuned by ear) */
#define ACC_VOL_SPAN 0x1000  /* ... and 16.0 on the level */

static int32_t acc_lock(int32_t base, uint32_t acnt, uint32_t span) {
    int32_t v = base + (int32_t)(acnt * span / 100u);
    return v > ACC_MAX ? ACC_MAX : v;
}

void mu_pb_init(struct mu_playback *pb) {
    uint32_t t, b, i;
    for (t = 0; t < MU_PB_TRACKS; t++) {
        pb->gen[t] = 0;
        pb->cur[t] = 0;
        pb->on[t] = 0;
        pb->latch[t] = 0;
        for (b = 0; b < MU_PB_BUFFERS; b++) {
            pb->buf[t][b].gen = 0;
            pb->buf[t][b].len = 0;
            pb->buf[t][b].steps = 0;
            pb->buf[t][b].valid = 0;
            pb->buf[t][b].play = pb->buf[t][b].accent = pb->buf[t][b].slide = 0;
            for (i = 0; i < MU_STEPS; i++) {
                struct mu_voice *v = &pb->buf[t][b].step[i];
                v->trig = v->note = v->vel = v->slide = v->hold = 0;
                v->nlock = 0;
            }
        }
    }
}

int mu_pb_publish(struct mu_playback *pb, uint8_t track, const struct mu_track *recipe,
                  const struct mu_key *key, const struct mu_base *base,
                  struct mu_acid_cache *acid) {
    struct mu_step table[MU_STEPS];
    struct mu_snapshot *s;
    uint8_t next;
    uint32_t i, acnt, ptim, model = recipe->model;
    if (track >= MU_PB_TRACKS)
        return -1;
    if (!model) {
        mu_pb_off(pb, track);
        return -1;
    }
    mu_render_cached(recipe, key, track, acid, table);
    next = (uint8_t)(pb->cur[track] ^ 1u);
    s = &pb->buf[track][next];
    s->gen = pb->gen[track] + 1u; /* odd: a reader that looks now sees a generation in flux */
    acnt = recipe->p[model][model == MU_TURI ? 3 : 4];
    ptim = model == MU_TB3P ? mu_acid_ptim(recipe->p[MU_TB3P][3]) : 0;
    s->len = (uint16_t)mu_loop_len((uint8_t)model, recipe->p[model][0], key);
    s->steps = MU_STEPS;
    s->valid = 1;
    s->play = s->accent = s->slide = 0;
    for (i = 0; i < MU_STEPS; i++) {
        struct mu_voice *v = &s->step[i];
        const struct mu_step *m = &table[i];
        if (m->trig) {
            s->play |= (uint64_t)1 << i;
            if (mu_step_accent(m))
                s->accent |= (uint64_t)1 << i;
            if (m->slide == MU_GLIDE_ON)
                s->slide |= (uint64_t)1 << i;
        }
        v->trig = m->trig;
        v->note = m->note;
        v->vel = m->vel;
        v->slide = m->slide;
        v->hold = m->hold;
        v->nlock = 0;
        if (m->trig) {
            if (m->slide == MU_GLIDE_ON) {
                v->slot[v->nlock] = SLOT_PTIM;
                v->value[v->nlock++] = (int16_t)(ptim << 8);
                v->slot[v->nlock] = SLOT_PORT;
                v->value[v->nlock++] = (int16_t)PORT_ON;
            } else if (m->slide == MU_GLIDE_OFF) {
                v->slot[v->nlock] = SLOT_PORT;
                v->value[v->nlock++] = (int16_t)PORT_OFF;
            }
            if (acnt && mu_step_accent(m)) {
                v->slot[v->nlock] = SLOT_FREQ;
                v->value[v->nlock++] = (int16_t)acc_lock(base->freq, acnt, ACC_FREQ_SPAN);
                v->slot[v->nlock] = SLOT_VOL;
                v->value[v->nlock++] = (int16_t)acc_lock(base->vol, acnt, ACC_VOL_SPAN);
            }
        }
    }
    s->gen = pb->gen[track] + 2u; /* even: complete */
    pb->gen[track] = s->gen;
    __asm__ volatile("" ::: "memory"); /* the buffer is complete before it is published */
    pb->cur[track] = next;
    pb->on[track] = 1;
    return (int)next;
}

void mu_pb_keys(struct mu_playback *pb, uint8_t track, uint8_t page, uint32_t track_len,
                uint8_t playing, uint8_t step, uint8_t out[16]) {
    uint32_t i, base = (uint32_t)page * 16u;
    const struct mu_snapshot *s;
    if (track >= MU_PB_TRACKS || !pb->on[track])
        return;
    s = &pb->buf[track][pb->cur[track]];
    for (i = 0; i < 16; i++) {
        uint32_t at = base + i;
        if (at >= track_len || at >= MU_STEPS)
            out[i] = 0;
        else if (playing && i == step)
            out[i] = 4;
        else if (!(s->play >> at & 1u))
            out[i] = 0;
        else if (s->slide >> at & 1u)
            out[i] = 5;
        else if (s->accent >> at & 1u)
            out[i] = 3;
        else
            out[i] = 2;
    }
}

void mu_pb_off(struct mu_playback *pb, uint8_t track) {
    if (track < MU_PB_TRACKS)
        pb->on[track] = 0;
}

void mu_pb_latch(struct mu_playback *pb, uint8_t track, int32_t first) {
    if (track < MU_PB_TRACKS && first)
        pb->latch[track] = pb->cur[track];
}

const struct mu_voice *mu_pb_step(struct mu_playback *pb, uint8_t track, uint32_t step) {
    if (track >= MU_PB_TRACKS || !pb->on[track] || step >= MU_STEPS)
        return 0;
    return &pb->buf[track][pb->latch[track]].step[step];
}

/* The step clock */
void mu_cycle_reset(struct mu_cycle *c) {
    c->track_len = 0;
    c->loop_len = 0;
    c->last = MU_CLOCK_NONE;
    c->parity = 0;
    c->phase = 0;
    c->have = 0;
    c->fresh = 1;
}

uint32_t mu_cycle_advance(struct mu_cycle *c, uint32_t last, uint32_t parity, uint32_t track_len,
                          uint32_t loop_len, uint32_t playing, int *coalesced) {
    uint32_t delta, cycles, advanced;
    if (coalesced)
        *coalesced = 0;
    c->fresh = 0;
    if (!playing || !track_len || !loop_len || track_len > MU_CLOCK_LIMIT ||
        loop_len > MU_CLOCK_LIMIT || last == MU_CLOCK_NONE || last >= track_len) {
        mu_cycle_reset(c);
        return 0;
    }
    /* A different track or loop length is a different clock: never carry a phase across it. */
    if (!c->have || c->track_len != track_len || c->loop_len != loop_len) {
        c->track_len = track_len;
        c->loop_len = loop_len;
        c->last = last;
        c->parity = parity;
        c->phase = last % loop_len; /* the loop position this observation plays */
        c->have = 1;
        c->fresh = 1;
        return 0;
    }
    if (last == c->last && parity == c->parity)
        return 0;
    if (parity == c->parity) {
        if (last < c->last) { /* the sequencer was stopped and re-armed: not a cycle */
            mu_cycle_reset(c);
            return 0;
        }
        delta = last - c->last;
    } else {
        delta = (track_len - c->last) + last; /* it wrapped */
    }
    c->last = last;
    c->parity = parity;
    /* Bounded terms cannot wrap; 32-bit on purpose: a 64-bit divide would import core helpers. */
    advanced = c->phase + delta;
    cycles = advanced / loop_len;
    c->phase = advanced - cycles * loop_len;
    if (cycles > 1 && coalesced)
        *coalesced = 1;
    return cycles;
}

void mu_evo_reset(struct mu_evo *e) {
    e->pending = 0;
    e->desync = 0;
}

int mu_evo_step(struct mu_evo *e, uint32_t cycles, int can_evolve, int hold) {
    if (e->desync)
        return 0; /* frozen until a verified clock baseline resets the tracker */
    if (!can_evolve || hold) {
        e->pending = 0; /* the opportunity is gone; release must not replay a burst */
        return 0;
    }
    if (cycles) {
        if (cycles > (uint32_t)(MU_EVO_PENDING_MAX - e->pending)) {
            e->desync = 1;
            e->pending = 0;
            return 0;
        }
        e->pending = (uint16_t)(e->pending + cycles);
    }
    if (!e->pending)
        return 0;
    e->pending--;
    return 1;
}

int mu_evo_schedule(struct mu_cycle *c, struct mu_evo *e, int observed, uint32_t last,
                    uint32_t parity, uint32_t track_len, uint32_t loop_len, int playing,
                    int can_evolve, int hold, uint8_t *coalesced) {
    uint32_t cycles;
    int coal = 0;
    if (observed <= 0) {
        if (observed < 0 && c->have && playing && can_evolve)
            e->desync = 1;
        mu_cycle_reset(c);
        e->pending = 0;
        *coalesced = 0;
        return 0;
    }
    cycles = mu_cycle_advance(c, last, parity, track_len, loop_len, (uint32_t)playing, &coal);
    *coalesced = coal ? 1 : 0;
    if (c->fresh)
        e->pending = 0;
    return mu_evo_step(e, cycles, can_evolve, hold);
}
