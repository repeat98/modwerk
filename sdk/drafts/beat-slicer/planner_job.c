/* SPDX-License-Identifier: MIT
 * Resumable counterpart to the independent synchronous planner oracle.
 */
#include "planner_job.h"
#define QUIET24 8388u
enum { GRID, SEARCH_RESULT, FLAGS, FLAG_RESULT, END_RESULT };

static enum bs_job_state fail(struct bs_job *j, enum bs_status error) {
    j->error = error;
    j->state = BS_JOB_FAILED;
    return BS_JOB_FAILED;
}
static void request_frame(struct bs_job *j, uint32_t frame) {
    j->frame = frame;
    ++j->serial; /* bounded by 65 grids * 769 candidates * 2 reads + 129 */
    j->state = BS_JOB_NEED_FRAME;
}
static void boundary(struct bs_job *j, uint32_t frame, uint32_t next) {
    j->boundary = frame;
    j->peak = 0;
    j->phase = next;
    request_frame(j, frame == j->trim_start ? frame : frame - 1);
}
static void insert(struct bs_job *j, uint32_t frame) {
    uint32_t at = 0;
    while (at < j->plan.count && j->plan.starts[at] < frame) ++at;
    if (at < j->plan.count && j->plan.starts[at] == frame) return;
    if (j->plan.count == BS_MAX_SLICES) { fail(j, BS_TOO_MANY); return; }
    for (uint32_t i = j->plan.count; i > at; --i)
        j->plan.starts[i] = j->plan.starts[i - 1];
    j->plan.starts[at] = frame;
    ++j->plan.count;
}
enum bs_job_state bs_job_begin(struct bs_job *j, const struct bs_request *r) {
    if (!j) return BS_JOB_FAILED;
    j->state = BS_JOB_RUNNING;
    j->error = BS_OK;
    j->serial = j->frame = 0;
    j->phase = GRID;
    j->n = j->index = 0;
    j->plan.count = j->plan.bpm24 = j->plan.end_needs_fade = 0;
    for (uint32_t i = 0; i < BS_MAX_SLICES; ++i) {
        j->plan.starts[i] = j->plan.needs_fade[i] = 0;
    }
    if (!r || r->sample_rate < 8000 || r->sample_rate > 192000 ||
        r->trim_start >= r->trim_end || r->tempo_source > BS_PROJECT_BPM || r->snap > 1 ||
        (r->beats != 1 && r->beats != 4 && r->beats != 16 && r->beats != 32 && r->beats != 64) ||
        r->existing_count > BS_MAX_SLICES || (r->existing_count && !r->existing))
        return fail(j, BS_INVALID);
    uint32_t bpm = r->tempo_source == BS_SAMPLE_BPM ? r->sample_bpm24 : r->project_bpm24;
    if (bpm < 720 || bpm > 7200) return fail(j, BS_INVALID);
    j->plan.bpm24 = bpm;
    j->trim_start = r->trim_start;
    j->trim_end = r->trim_end;
    j->snap = r->snap;
    j->radius = r->sample_rate / 500u;
    for (uint32_t i = 0; i < r->existing_count; ++i) {
        uint32_t f = r->existing[i];
        if (f < r->trim_start || f >= r->trim_end || (i && f <= r->existing[i-1]))
            return fail(j, BS_INVALID);
        j->plan.starts[j->plan.count++] = f;
    }
    /* Same proven 32-bit bounds as planner.c; no 64-bit runtime helpers. */
    uint32_t numerator = r->sample_rate * 1440u;
    uint32_t rem = (numerator % bpm) * r->beats;
    j->whole = (numerator / bpm) * r->beats + rem / bpm;
    j->remainder = rem % bpm;
    return BS_JOB_RUNNING;
}
enum bs_job_state bs_job_step(struct bs_job *j) {
    if (!j) return BS_JOB_FAILED;
    if (j->state != BS_JOB_RUNNING) return (enum bs_job_state)j->state;
    switch (j->phase) {
    case GRID: {
        uint32_t offset = j->n * j->whole +
            (j->n * j->remainder + j->plan.bpm24 / 2u) / j->plan.bpm24;
        if (j->n > BS_MAX_SLICES || offset >= j->trim_end - j->trim_start) {
            j->phase = FLAGS;
            break;
        }
        uint32_t frame = j->trim_start + offset;
        for (uint32_t i = 0; i < j->plan.count; ++i) {
            uint32_t old = j->plan.starts[i];
            uint32_t distance = old > frame ? old - frame : frame - old;
            if (!distance || (j->snap && j->n && distance <= j->radius)) {
                ++j->n;
                return BS_JOB_RUNNING;
            }
        }
        if (!j->snap || !j->n) {
            insert(j, frame);
            ++j->n;
            break;
        }
        uint32_t lo = frame > j->radius ? frame - j->radius : 0;
        if (lo <= j->trim_start) lo = j->trim_start + 1;
        j->hi = j->trim_end - 1 - frame >= j->radius ? frame + j->radius : j->trim_end - 1;
        for (uint32_t i = 0; i < j->plan.count; ++i) {
            uint32_t old = j->plan.starts[i];
            if (old < frame && old >= lo) lo = old + 1;
            if (old > frame && old <= j->hi) j->hi = old - 1;
        }
        j->center = j->best = frame;
        j->best_peak = j->best_distance = UINT32_MAX;
        j->candidate = lo;
        boundary(j, lo, SEARCH_RESULT);
        break;
    }
    case SEARCH_RESULT: {
        uint32_t distance = j->candidate > j->center ? j->candidate - j->center : j->center - j->candidate;
        if (j->peak <= QUIET24 && (j->peak < j->best_peak ||
            (j->peak == j->best_peak && distance < j->best_distance))) {
            j->best = j->candidate;
            j->best_peak = j->peak;
            j->best_distance = distance;
        }
        if (j->candidate < j->hi) boundary(j, ++j->candidate, SEARCH_RESULT);
        else {
            insert(j, j->best);
            ++j->n;
            j->phase = GRID;
        }
        break;
    }
    case FLAGS:
        if (j->index < j->plan.count) boundary(j, j->plan.starts[j->index], FLAG_RESULT);
        else {
            j->boundary = j->trim_end - 1;
            j->peak = 0;
            j->phase = END_RESULT;
            request_frame(j, j->boundary); /* final frame, not a two-frame boundary */
        }
        break;
    case FLAG_RESULT:
        j->plan.needs_fade[j->index++] = j->peak > QUIET24;
        j->phase = FLAGS;
        break;
    case END_RESULT:
        j->plan.end_needs_fade = j->peak > QUIET24;
        j->state = BS_JOB_DONE;
        break;
    default: return fail(j, BS_INVALID);
    }
    return (enum bs_job_state)j->state;
}
int bs_job_supply(struct bs_job *j, uint32_t serial, uint32_t frame,
                  const int32_t pcm[2], int failed) {
    if (!j || j->state != BS_JOB_NEED_FRAME || serial != j->serial || frame != j->frame) return 0;
    if (failed || !pcm) { fail(j, BS_READ_ERROR); return 1; }
    for (uint32_t ch = 0; ch < 2; ++ch) {
        int32_t v = pcm[ch];
        if (v < -8388608 || v > 8388607) { fail(j, BS_READ_ERROR); return 1; }
        uint32_t a = v < 0 ? 0u - (uint32_t)v : (uint32_t)v;
        if (a > j->peak) j->peak = a;
    }
    if (frame < j->boundary) request_frame(j, j->boundary);
    else j->state = BS_JOB_RUNNING;
    return 1;
}
void bs_job_cancel(struct bs_job *j) {
    if (j) j->state = BS_JOB_CANCELLED;
}
int bs_job_result(const struct bs_job *j, struct bs_plan *out) {
    if (!j || !out || j->state != BS_JOB_DONE) return 0;
    out->count = j->plan.count;
    out->bpm24 = j->plan.bpm24;
    out->end_needs_fade = j->plan.end_needs_fade;
    for (uint32_t i = 0; i < BS_MAX_SLICES; ++i) {
        out->starts[i] = j->plan.starts[i];
        out->needs_fade[i] = j->plan.needs_fade[i];
    }
    return 1;
}
