/* SPDX-License-Identifier: MIT */
#ifndef BEAT_SLICER_PLANNER_JOB_H
#define BEAT_SLICER_PLANNER_JOB_H
#include "planner.h"

enum bs_job_state { BS_JOB_RUNNING, BS_JOB_NEED_FRAME, BS_JOB_DONE,
                    BS_JOB_CANCELLED, BS_JOB_FAILED };
/* Caller-owned state; fields other than state/error/frame/serial are private.
 * Initialize before use. Single UI/background owner, never an audio ISR.
 * No retained input pointers, callback, allocation, IO or device access.
 */
struct bs_job {
    struct bs_plan plan;
    uint32_t state, error, frame, serial;
    uint32_t trim_start, trim_end, snap, radius, whole, remainder;
    uint32_t phase, n, index, center, candidate, hi, best, best_peak, best_distance;
    uint32_t boundary, peak;
};
/* Copies request metadata and marker starts. read/context are unused: the
 * caller services NEED_FRAME using its own cancellable nonblocking reader.
 * Sample identity/content/tempo generations belong to the future adapter.
 * Retire outstanding reads before reinitializing this object; serial numbers
 * distinguish reads within one job, not different lifetimes of this storage.
 */
enum bs_job_state bs_job_begin(struct bs_job *, const struct bs_request *);
/* One bounded state transition; each marker loop has at most 64 iterations.
 * NEED_FRAME is stable until supply/cancel; repeated steps never perform IO.
 * This is a work bound, not a measured hardware time budget.
 */
enum bs_job_state bs_job_step(struct bs_job *);
/* Accept only the current serial AND frame. Return 0 for stale/out-of-order
 * replies without changing the job. failed or invalid PCM terminates it.
 * PCM is signed right-aligned 24-bit, mono duplicated by the caller.
 */
int bs_job_supply(struct bs_job *, uint32_t serial, uint32_t frame,
                  const int32_t pcm[2], int failed);
void bs_job_cancel(struct bs_job *);
/* Publish only a completed preview. Otherwise return 0, leaving out intact.
 * out must not alias job storage. This never applies markers to a sample.
 */
int bs_job_result(const struct bs_job *, struct bs_plan *out);
#endif
