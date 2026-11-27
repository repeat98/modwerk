/* SPDX-License-Identifier: GPL-2.0-or-later */
/* MUTINY's UI tick: gather one observation per track, reuse it for change detection, evolution,
 * render and the redraw signature, and flush the record once when it differs. A failed observation
 * keeps the last generation and retries next tick. */
#include "tick.h"

/* The sound's own cutoff and level, read every tick so turning either moves the accent. */
static void read_bases(struct mu_tick *tick) {
    uint32_t t;
    if (mu_dev_sound_base(tick->base) != 0)
        return; /* no kit: keep the last values rather than invent a base */
    for (t = 0; t < MU_TICK_TRACKS; t++) {
        uint8_t m = tick->rt->t[t].recipe.model;
        uint32_t acnt = m ? tick->rt->t[t].recipe.p[m][m == MU_TURI ? 3 : 4] : 0;
        if (tick->base[t].freq != tick->last_base[t].freq ||
            tick->base[t].vol != tick->last_base[t].vol) {
            tick->last_base[t] = tick->base[t];
            /* an accent lock is relative to the sound: a stock FREQ/VOL edit republishes it, but
             * only for a track that is generating and uses accents */
            if (m && acnt && tick->rt->t[t].play == MU_PLAY_GENERATED)
                tick->dirty[t] = 1;
        }
    }
}

/* A track is relevant with a model or as the page's own track (the ruler shows its length even with
 * MODEL OFF). A failed read writes nothing; `ok` is cleared by the caller each tick. */
static int observe(struct mu_tick *tick, uint32_t t) {
    struct mu_track_info *info = &tick->info[t];
    struct mu_key *key = &tick->key[t];
    if (mu_dev_track_info((int32_t)t, info) != 0)
        return 0;
    key->note = info->note;
    key->root = info->root;
    key->scale = info->scale;
    key->len = (uint8_t)(info->len > 64 ? 64 : info->len);
    tick->ok[t] = 1;
    return 1;
}

/* The pattern's own NOTE/ROOT/SCALE changed, or its length where the model follows it. */
static int key_changed(const struct mu_tick *tick, uint32_t t) {
    uint8_t m = tick->rt->t[t].recipe.model;
    const struct mu_key *key = &tick->key[t];
    int follows;
    if (!m || !tick->seen_ok[t])
        return 0;
    follows = tick->rt->t[t].recipe.p[m][0] == mu_knob_max(m, 1);
    return key->note != tick->seen[t].note || key->root != tick->seen[t].root ||
           key->scale != tick->seen[t].scale || (follows && key->len != tick->seen[t].len);
}

/* At most one TURI pass; a failed observation freezes evolution instead of guessing progress. */
static void evolve(struct mu_tick *tick, uint32_t t, const struct mu_tick_clock *clock) {
    uint8_t m = tick->rt->t[t].recipe.model;
    int observed = m ? (tick->ok[t] ? 1 : -1) : 0;
    uint32_t loop_len =
        observed > 0 ? mu_loop_len(m, tick->rt->t[t].recipe.p[m][0], &tick->key[t]) : 0;
    if (!mu_evo_schedule(&tick->cyc[t], &tick->evo[t], observed, clock->last[t], clock->parity[t],
                         observed > 0 ? (uint32_t)tick->info[t].len : 0, loop_len, clock->playing,
                         mu_rt_can_evolve(&tick->rt->t[t]), clock->hold_track == t,
                         &tick->coalesced[t]))
        return;
    tick->passes[t]++;
    mu_rt_evolve(&tick->rt->t[t], tick->passes[t]);
    tick->dirty[t] = 1;
}

/* Render this tick's observation; a failure keeps the last generation and retries next tick. */
static int render(struct mu_tick *tick, uint32_t t) {
    struct mu_rt_track *s = &tick->rt->t[t];
    if (s->recipe.model && s->play == MU_PLAY_GENERATED) {
        if (!tick->ok[t]) {
            tick->dirty[t] = 1;
            return 0;
        }
        tick->seen[t] = tick->key[t];
        tick->seen_ok[t] = 1;
        if (mu_pb_publish(tick->pb, (uint8_t)t, &s->recipe, &tick->key[t], &tick->base[t],
                          &tick->acid[t]) < 0) {
            tick->dirty[t] = 1;
            return 0;
        }
    } else {
        mu_pb_off(tick->pb, (uint8_t)t);
    }
    tick->dirty[t] = 0;
    tick->rendered = 1;
    return 1;
}

static int record_stored(const struct mu_tick *tick) {
    return mu_store_matches(tick->save, tick->rt);
}

static int any_dirty(const struct mu_tick *tick) {
    uint32_t t;
    for (t = 0; t < MU_TICK_TRACKS; t++) {
        if (tick->dirty[t])
            return 1;
    }
    return 0;
}

void mu_tick_reset(struct mu_tick *tick) {
    uint32_t t;
    for (t = 0; t < MU_TICK_TRACKS; t++) {
        tick->ok[t] = 0;
        tick->last_base[t].freq = 0;
        tick->last_base[t].vol = 0;
    }
    tick->rendered = 0;
    tick->preview_check = 0;
    for (t = 0; t < MU_TICK_TRACKS; t++)
        mu_acid_cache_reset(&tick->acid[t]); /* a session boundary deliberately invalidates bases */
    mu_preview_cache_reset(&tick->preview);  /* a lifecycle reset invalidates the page picture */
}

uint32_t mu_tick_run(struct mu_tick *tick, const struct mu_tick_clock *clock, uint8_t page_track) {
    uint32_t t, rearm = 0;
    tick->rendered = 0;
    read_bases(tick);
    for (t = 0; t < MU_TICK_TRACKS; t++) {
        uint8_t m = tick->rt->t[t].recipe.model;
        int relevant = m != MU_OFF || t == page_track;
        tick->ok[t] = 0; /* an observation is valid only for the tick that made it */
        if (relevant)
            observe(tick, t);
        if (m && tick->rt->t[t].play == MU_PLAY_GENERATED && !tick->ok[t]) {
            tick->dirty[t] = 1; /* keep the last generation and retry on the next tick */
        }
        if (tick->ok[t] && key_changed(tick, t))
            tick->dirty[t] = 1;
        evolve(tick, t, clock);
        if (t == page_track && tick->dirty[t])
            tick->preview_check = 1; /* a recipe/key/evolution change may need the picture */
        if (tick->dirty[t] && render(tick, t))
            rearm |= 1u << t;
    }
    return rearm;
}

static int same_key(const struct mu_key *a, const struct mu_key *b) {
    return a->note == b->note && a->root == b->root && a->scale == b->scale && a->len == b->len;
}

int mu_tick_prepare(struct mu_tick *tick, uint8_t page_track, uint8_t visible) {
    if (!visible || page_track >= MU_TICK_TRACKS || !tick->ok[page_track])
        return 0; /* hidden playback carries no page picture */
    /* Compare the observed key every visible tick, independently of dirty: a native track's key can
     * return to seen[] (A->B->A) and never set preview_check. */
    if (tick->preview.valid && tick->preview.track == page_track &&
        same_key(&tick->preview.key, &tick->key[page_track]) && !tick->preview_check &&
        !tick->dirty[page_track])
        return 0;
    tick->preview_check = 0;
    return mu_preview_cache_prepare(&tick->preview, page_track, &tick->rt->t[page_track].recipe,
                                    &tick->key[page_track], &tick->acid[page_track]);
}

/* After the commands: write the record once when the batch left it stale, and only when the stored
 * bytes differ. A base-only FREQ/VOL refresh, a failed observation and TURI evolution write
 * nothing; an edit, model/source change, cancel or undo writes once; an idle tick skips the
 * comparison. */
int mu_tick_flush(struct mu_tick *tick) {
    if (!tick->rendered && !any_dirty(tick))
        return 0;
    if (record_stored(tick))
        return 0;
    mu_store_save(tick->save, tick->rt);
    return 1;
}

int mu_tick_dirty(const struct mu_tick *tick, uint8_t track) {
    return track >= MU_TICK_TRACKS || tick->dirty[track];
}

int mu_tick_observed(const struct mu_tick *tick, uint8_t track) {
    return track < MU_TICK_TRACKS && tick->ok[track];
}

int32_t mu_tick_track_len(const struct mu_tick *tick, uint8_t track) {
    if (track >= MU_TICK_TRACKS || !tick->ok[track])
        return -1;
    return tick->info[track].len;
}

const struct mu_key *mu_tick_key(const struct mu_tick *tick, uint8_t track) {
    if (track >= MU_TICK_TRACKS || !tick->ok[track])
        return 0;
    return &tick->key[track];
}

const struct mu_preview *mu_tick_preview(const struct mu_tick *tick, uint8_t track,
                                         const struct mu_track *recipe, const struct mu_key *key) {
    if (track >= MU_TICK_TRACKS)
        return 0;
    return mu_preview_cache_ready(&tick->preview, track, recipe, key);
}

const struct mu_preview *mu_tick_current_preview(const struct mu_tick *tick, uint8_t track,
                                                 const struct mu_track *recipe) {
    const struct mu_key *key = mu_tick_key(tick, track);
    if (!key)
        return 0; /* no observation: labels may fall back, the picture may not */
    return mu_tick_preview(tick, track, recipe, key);
}
