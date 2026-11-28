/* SPDX-License-Identifier: GPL-2.0-or-later */
#include "runtime.h"

static void copy_recipe(struct mu_track *dst, const struct mu_track *src) {
    uint8_t *d = (uint8_t *)dst;
    const uint8_t *s = (const uint8_t *)src;
    uint32_t n = (uint32_t)sizeof *dst;
    while (n--)
        *d++ = *s++;
}

void mu_rt_track_init(struct mu_rt_track *t) {
    mu_defaults(&t->recipe);
    copy_recipe(&t->before, &t->recipe);
    copy_recipe(&t->committed, &t->recipe);
    t->play = MU_PLAY_NATIVE;
    t->preview = 0;
    t->undo = 0;
    t->reserved = 0;
}

void mu_rt_init(struct mu_rt *rt) {
    uint32_t i;
    for (i = 0; i < MU_RT_TRACKS; i++)
        mu_rt_track_init(&rt->t[i]);
}

void mu_rt_select_model(struct mu_rt_track *t, uint8_t model) {
    if (model >= MU_MODELS)
        model = MU_OFF;
    if (model == t->recipe.model)
        return;
    if (model == MU_OFF) {
        /* OFF: the native trigs play, the recipe and every control stay */
        t->recipe.model = MU_OFF;
        t->play = MU_PLAY_NATIVE;
        t->preview = 0;
        return;
    }
    if (t->play == MU_PLAY_NATIVE) {
        /* the first generated output after native playback is a preview over untouched trigs */
        copy_recipe(&t->before, &t->recipe);
        t->before.model = t->recipe.model; /* the recipe as it stood, OFF included */
        t->undo = 0;                       /* a new preview retires a stale commit record */
    }
    t->recipe.model = model;
    t->play = MU_PLAY_GENERATED;
    t->preview = 1;
}

void mu_rt_edit(struct mu_rt_track *t, const struct mu_track *after) {
    if (after->model == MU_OFF) {
        /* turning a model's value down to OFF is selecting OFF */
        copy_recipe(&t->recipe, after);
        t->play = MU_PLAY_NATIVE;
        t->preview = 0;
        return;
    }
    if (t->play == MU_PLAY_NATIVE) {
        copy_recipe(&t->before, &t->recipe); /* the recipe before this edit */
        t->undo = 0;
    }
    copy_recipe(&t->recipe, after);
    t->play = MU_PLAY_GENERATED;
    t->preview = 1;
}

void mu_rt_committed(struct mu_rt_track *t) {
    copy_recipe(&t->committed, &t->recipe);
    t->play = MU_PLAY_NATIVE;
    t->preview = 0;
    t->undo = 1;
}

void mu_rt_commit_failed(struct mu_rt_track *t) { (void)t; }

int mu_rt_cancel(struct mu_rt_track *t) {
    if (!t->preview)
        return 0;
    copy_recipe(&t->recipe, &t->before);
    t->play = MU_PLAY_NATIVE;
    t->preview = 0;
    return 1;
}

int mu_rt_uncommit(struct mu_rt_track *t) {
    if (!t->undo)
        return 0;
    copy_recipe(&t->recipe, &t->committed);
    copy_recipe(&t->before, &t->committed); /* a later cancel keeps the retained recipe */
    t->play = MU_PLAY_GENERATED;
    t->preview = 1;
    t->undo = 0;
    return 1;
}

void mu_rt_invalidate_undo(struct mu_rt_track *t) { t->undo = 0; }

int mu_rt_can_evolve(const struct mu_rt_track *t) {
    return t->play == MU_PLAY_GENERATED && t->preview && t->recipe.model == MU_TURI &&
           MU_LOCK(&t->recipe) < 100;
}

void mu_rt_evolve(struct mu_rt_track *t, uint32_t pass) {
    if (mu_rt_can_evolve(t))
        mu_evolve(&t->recipe, pass);
}

void mu_rt_load(struct mu_rt_track *t, const struct mu_track *recipe, uint8_t play) {
    copy_recipe(&t->recipe, recipe);
    mu_clamp(&t->recipe);
    t->play = play == MU_PLAY_GENERATED && t->recipe.model ? MU_PLAY_GENERATED : MU_PLAY_NATIVE;
    t->preview = t->play == MU_PLAY_GENERATED;
    copy_recipe(&t->before, &t->recipe);
    copy_recipe(&t->committed, &t->recipe);
    t->undo = 0;
}
