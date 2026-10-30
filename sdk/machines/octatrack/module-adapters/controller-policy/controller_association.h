/* SPDX-License-Identifier: GPL-3.0-or-later */
#ifndef MODWERK_CONTROLLER_ASSOCIATION_H
#define MODWERK_CONTROLLER_ASSOCIATION_H
#include <stdint.h>
#include <stddef.h>

#define MW_CONTROLLER_SLOTS 6u
/* The most words one RESET job writes: the owned transport's DL_RESET_DATA, eight packets. */
#define MW_CONTROLLER_RESET_CHUNK 192u
enum mw_controller_state { MW_CTL_EMPTY, MW_CTL_RESERVED, MW_CTL_BOUND, MW_CTL_INITIALIZING,
    MW_CTL_READY, MW_CTL_PUBLISHING, MW_CTL_ACTIVE, MW_CTL_DISABLING, MW_CTL_RETIRING,
    MW_CTL_QUARANTINED, MW_CTL_RELEASED };
enum mw_controller_result { MW_CTL_OK, MW_CTL_CLOSED, MW_CTL_STALE, MW_CTL_CONFLICT, MW_CTL_PENDING };
enum mw_controller_operation { MW_CTL_RESET=1, MW_CTL_ENABLE, MW_CTL_DISABLE, MW_CTL_RESTORE };
enum mw_controller_observation { MW_CTL_ACK=1, MW_CTL_REJECT, MW_CTL_TIMEOUT, MW_CTL_UNKNOWN };
struct mw_controller_identity {
    /* package_sha256: the row's controller digest (loader.h runtime_dsp.controller_sha256: the package without its DSP
     * part), so an engine change keeps the row; the name is the rows' original one. */
    uint8_t package_sha256[32], source_policy_sha256[32];
    uint32_t module;
    uint16_t policy_revision, state_revision, parameter_revision;
    uint8_t feature, required_cores;
};
/* Trusted compiled declaration, never an uploaded source policy. */
struct mw_controller_declaration {
    struct mw_controller_identity identity;
    uint32_t reset_words[2];
};
struct mw_controller_binding {
    struct mw_controller_identity identity;
    uint32_t generation;
    uintptr_t canonical_extent;
    uint32_t extent_bytes, image_offset, image_bytes;
};
struct mw_controller_job {
    uint32_t generation, ticket, offset, count, expected, desired;
    uint16_t wire_sequence;
    uint8_t core, operation;
};
/* Preparation only. These callbacks require an actual board-owned pool,
 * source/resource registry and operation lifetime under the stable lock.
 * Native fixture events prove the helper contract, never production ACKs.
 * Missing callbacks refuse. The empty strong policy bridge does not call
 * this helper and no loader or public admission is wired by these files. */
struct mw_controller_backend {
    /* Positive facts require exactly 1; missing/unknown proof refuses. */
    int (*owns_image)(void *,const struct mw_controller_binding *);
    int (*resources_idle)(void *,const struct mw_controller_binding *);
    int (*writes_blocked)(void *); /* includes saved-export latch */
    /* 1: owned submission; 0: definitely not submitted; -1: unknown/touched.
     * The adapter binds actual packet sequence + lifetime to ticket, and
     * must refuse global transport sequence wrap (including other jobs).
     * Helper monotonic checks alone cannot observe unreported wire wraps. */
    int (*start)(void *,const struct mw_controller_binding *,const struct mw_controller_job *);
    int (*job_closed)(void *,const struct mw_controller_binding *,const struct mw_controller_job *);
    /* 1 actual commit;0 definitely not committed/unchanged;other unknown,
     * which quarantines both incoming and predecessor allocations. */
    int (*publication_confirmed)(void *,const struct mw_controller_binding *);
    int (*roots_clear)(void *,const struct mw_controller_binding *);
};
struct mw_controller_slot {
    struct mw_controller_binding binding;
    uint32_t reset_words[2], acknowledged_words[2];
    struct mw_controller_job jobs[2];
    uint32_t previous_generation;
    uint8_t state, touched, enable_acks, disable_acks, job_state[2], previous;
};
struct mw_controller_registry {
    struct mw_controller_slot slots[MW_CONTROLLER_SLOTS];
    uint32_t last_generation, last_ticket;
    uint16_t last_wire_sequence[2];
    const struct mw_controller_backend *backend;
    void *context;
};
void mw_controller_registry_init(struct mw_controller_registry *,const struct mw_controller_backend *,void *);
int mw_controller_reserve(struct mw_controller_registry *,const struct mw_controller_declaration *,
    const struct mw_controller_identity *,const struct mw_controller_binding *previous,unsigned *slot);
/* Board issues generation only after owned reconstruction; zero/reuse/wrap
 * or staging/cached-alias extents never bind. No generation allocator here. */
int mw_controller_bind(struct mw_controller_registry *,unsigned,const struct mw_controller_binding *);
int mw_controller_start(struct mw_controller_registry *,const struct mw_controller_binding *,const struct mw_controller_job *);
int mw_controller_ack(struct mw_controller_registry *,const struct mw_controller_binding *,const struct mw_controller_job *,int observation);
int mw_controller_release_job(struct mw_controller_registry *,const struct mw_controller_binding *,const struct mw_controller_job *);
int mw_controller_publish(struct mw_controller_registry *,const struct mw_controller_binding *);
/* Pure pending-journal query; production resolves the reviewed entry to this
 * exact board binding. This is not a public/host readiness interface. */
int mw_controller_control_write_allowed(struct mw_controller_registry *,const struct mw_controller_binding *);
/* The same query for slot `at` (in that slot's own binding), less the owner check (the backend's owns_image):
 * its state, completed jobs and the backend's per-call facts. Only for a caller that has already proved
 * owns_image for this exact binding and owner ledger (the write lease's cached decision). */
int mw_controller_slot_write_allowed(struct mw_controller_registry *,unsigned at);
int mw_controller_cancel(struct mw_controller_registry *,const struct mw_controller_binding *);
/* A disabled (RETIRING) generation whose image is published again (an
 * abandoned removal, a rolled-back replacement) re-arms its complete reset:
 * BOUND, nothing acknowledged. Every other held slot of the feature must be
 * disabled (RETIRING) or untouched. The DSP side re-initializes from zero
 * through the ordinary RESET/ENABLE jobs; no state is carried across. */
int mw_controller_restore(struct mw_controller_registry *,const struct mw_controller_binding *);
int mw_controller_retire(struct mw_controller_registry *,const struct mw_controller_binding *);
/* Unknown/corrupted states retain extents. RELEASED is the only bound state
 * a production pool adapter may reclaim, after its own remaining fences. */
int mw_controller_holds(const struct mw_controller_registry *,const struct mw_controller_binding *);
#endif
