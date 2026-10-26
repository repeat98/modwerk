/* SPDX-License-Identifier: GPL-3.0-or-later
 * Private engine-only volatile publication journal. No host-supplied image,
 * generation, readiness, extent or ACK authority. Feature64 remains closed. */
#ifndef MODWERK_RUNTIME_JOURNAL_H
#define MODWERK_RUNTIME_JOURNAL_H
#include "loader.h"
/* One row per installed module, as many as the loader holds (RUNTIME_MODULES: 128 on the Octatrack). MWS1 and MWMS
 * count them in one byte. */
#define RUNTIME_JOURNAL_ROWS RUNTIME_MODULES
typedef char runtime_journal_rows_fit_a_byte[RUNTIME_JOURNAL_ROWS <= 255u ? 1 : -1];
/* Separate from mu_publication: pending must never mean MU_UNCHANGED. */
enum runtime_journal_result { RJ_OK, RJ_PENDING, RJ_REFUSED, RJ_UNCERTAIN, RJ_STALE };
enum runtime_journal_phase { RJ_IDLE, RJ_RECEIVING, RJ_VERIFIED, RJ_PUBLISHING, RJ_TRIAL, RJ_ROLLBACK, RJ_QUARANTINE };
enum runtime_journal_observation { RJ_WAIT, RJ_READY, RJ_REJECTED, RJ_UNKNOWN };
struct runtime_journal_view {
    struct runtime_owner before, after; /* zero generation denotes an empty side */
    const struct runtime_dsp *from, *to; /* borrowed under the actual stable lock only */
    uint32_t module;
    uint16_t position;
    /* Exact encoded offer, including an empty removal with no target owner.
     * Retained by the board journal, never copied from an uploaded claim. */
    uint8_t package_sha256[MU_DIGEST_BYTES];
};
struct runtime_journal_progress {
    uint32_t generation;
    uint16_t records, published;
    uint8_t phase, required, touched, confirmed;
};
/* Real production adapter must provide exact source/resource/ACK/root facts.
 * Weak absent implementation refuses every operation and confers no feature.
 * transition binds immutable tuples to actual owned jobs; READY additionally
 * means all exact operation ACKs and backend job-storage releases completed.
 * Unknown/partial work retains both images. Reads never renew a transaction. */
int modwerk_machine_journal_enabled(void);
/* Evaluated under the retained board stable lock before creating the latch.
 * Includes actual upload, modset, export and DSP/controller work. */
int modwerk_machine_journal_begin_safe(void);
int modwerk_machine_journal_admit(const struct runtime_journal_view *,unsigned);
enum runtime_journal_observation modwerk_machine_journal_transition(
    const struct runtime_journal_view *,int reverse,uint8_t masks[3]);
/* Nonmutating preflight of the exact completed transition immediately before
 * CF publication, under the same retained stable lock. Legacy admission is
 * not authority for an owned DSP transaction. Missing proof refuses. */
int modwerk_machine_journal_switch_safe(const struct runtime_journal_view *,int reverse);
int modwerk_machine_journal_committed(const struct runtime_journal_view *,int reverse);
int modwerk_machine_journal_roots_clear(const struct runtime_journal_view *);
/* Keep, from the trial with every row published: answered from the board's
 * own ledger, consumed once. 1: finalized, the journal may go idle; 0: refused,
 * nothing changed; else unknown. A row retiring a predecessor has no roots
 * proof yet and must refuse. Persistence is the caller's: the Octatrack
 * service asks only once its saved set can take the kept set (modset.c). */
int modwerk_machine_journal_accept(const struct runtime_journal_view *,unsigned);
/* After exact reverse completion or an accepted Keep, under the same lock,
 * once the journal is idle again: the board drops its own holds. It cannot
 * reopen the journal. */
void modwerk_machine_journal_idle(uint32_t generation);
int modwerk_runtime_volatile_busy(void);
/* Trusted engine calls only, with captured caller context. Each function
 * acquires the real stable lock at its use boundary. The journal owns its
 * generation, candidates and baseline until exact rollback or Keep. */
enum runtime_journal_result modwerk_runtime_journal_begin(void);
enum runtime_journal_result modwerk_runtime_journal_prepare(const uint8_t *,uint32_t,const struct runtime_context *);
enum runtime_journal_result modwerk_runtime_journal_verify(void);
enum runtime_journal_result modwerk_runtime_journal_activate(void);
enum runtime_journal_result modwerk_runtime_journal_abort(void);
enum runtime_journal_result modwerk_runtime_journal_step(const struct runtime_context *);
/* Trial only: a set of fresh installs (no predecessor generation) becomes the
 * idle baseline. Any replace/removal row refuses with nothing changed. */
enum runtime_journal_result modwerk_runtime_journal_accept(void);
void modwerk_runtime_journal_snapshot(struct runtime_journal_progress *);
/* Exact current whole-set identity, sorted by module id and encoded package
 * digest. Unknown ownership/site state returns 0, never an empty-set hash.
 * Caller retains the stable board lock across comparison and Begin. */
int modwerk_runtime_journal_digest(uint8_t[MU_DIGEST_BYTES]);
/* That identity over n rows of (module id, its package's SHA-256 at sha+32*i),
 * shared with the board's saved set: "MWS1", the count, then each id
 * (big-endian) and digest in rising id order. A zero or repeated id, or more
 * than RUNTIME_JOURNAL_ROWS rows, has no identity (0). */
static inline int runtime_journal_set_digest(const uint32_t *ids,const uint8_t *sha,unsigned n,uint8_t out[MU_DIGEST_BYTES])
{
    /* Static: 36 bytes a row outgrow a stock task's stack. Engine task only, so never entered twice at once. */
    static uint8_t bytes[8u+36u*RUNTIME_JOURNAL_ROWS];
    if(n>RUNTIME_JOURNAL_ROWS) return 0;
    bytes[0]='M',bytes[1]='W',bytes[2]='S',bytes[3]='1',bytes[4]=bytes[5]=bytes[6]=0;
    for(unsigned i=0;i<n;++i) {
        unsigned below=0;
        for(unsigned k=0;k<n;++k) { if(k!=i && ids[k]==ids[i]) return 0;below+=ids[k]<ids[i]; }
        if(!ids[i]) return 0;
        uint8_t *e=bytes+8u+36u*below;
        for(unsigned k=0;k<4u;++k) e[k]=(uint8_t)(ids[i]>>(24u-8u*k));
        for(unsigned k=0;k<MU_DIGEST_BYTES;++k) e[4u+k]=sha[MU_DIGEST_BYTES*i+k];
    }
    bytes[7]=(uint8_t)n;mu_sha256(bytes,8u+36u*n,out);return 1;
}
/* Independent board declarations establish the participants of each encoded
 * record. Host bundle masks are claims only. Missing adapter is closed. */
int modwerk_machine_journal_association(uint32_t,const uint8_t[MU_DIGEST_BYTES],const uint32_t *,unsigned);
/* Board-owned transport/lifetime latch: release for a bounded trial and
 * re-acquire before rollback. Neither operation may start/stop a recorder. */
int modwerk_machine_journal_trial(int running);
#endif
