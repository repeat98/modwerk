/* SPDX-License-Identifier: GPL-3.0-or-later
 * Host check of the scoped write lease's resolver against the actual loader
 * ledger: a real prepared owner, its geometry-derived canonical extent, a
 * synthetic ACKed association and one trusted policy row. Host addresses have
 * one alias, so the cached/uncached split itself is not exercised here. The
 * loader's private owner ledger is reached through test_controller_write_lease.py's
 * ledger unit, which includes loader.c. */
#define MODWERK_HOST
#include "controller_association.c"
#include "controller_write_lease.c"
#include <assert.h>
#include <string.h>

struct runtime_owner *test_owner_identity(unsigned);
struct runtime_module *test_owned(unsigned);
static int depth;
int modwerk_machine_stopped(void) { return 1; }
void *modwerk_machine_uncached(void *p) { return p; }
void modwerk_machine_invalidate_code(void) {}
int modwerk_machine_patchable(uint32_t a, uint32_t n) { (void)a; (void)n; return 0; }
uint8_t *modwerk_machine_code(uint32_t a) { (void)a; return 0; }
void modwerk_machine_flush_data(uint32_t a, uint32_t n) { (void)a; (void)n; }
uint32_t modwerk_machine_mask(void) { return 0; }
void modwerk_machine_unmask(uint32_t sr) { (void)sr; }
uint32_t modwerk_machine_lock(void) { return (uint32_t)depth++; }
void modwerk_machine_unlock(uint32_t sr) { depth = (int)sr; }
unsigned modwerk_machine_paused(struct runtime_span *s, unsigned max, const struct runtime_context *c) { (void)s; (void)c; return max + 1u; }
int modwerk_machine_dsp_admit(const struct runtime_dsp *from, struct runtime_dsp *to) { (void)from; (void)to; return 0; }
void modwerk_machine_dsp_switch(const struct runtime_dsp *from, const struct runtime_dsp *to) { (void)from; (void)to; }

static uint8_t task_stack[256] __attribute__((aligned(4)));
int modwerk_machine_stack(uintptr_t *lo, uintptr_t *hi)
{ *lo = (uintptr_t)task_stack; *hi = *lo + sizeof task_stack; return 1; }

static int one(void *u, const struct mw_controller_binding *b) { (void)u; (void)b; return 1; }
static int none(void *u) { (void)u; return 0; }
static int submitted(void *u, const struct mw_controller_binding *b, const struct mw_controller_job *j) { (void)u; (void)b; (void)j; return 1; }
static const struct mw_controller_backend backend = {one, one, none, submitted, submitted, one, one};
struct mw_controller_registry modwerk_controller_registry;
/* The controller digest of the encoded package below (loader.h controller_sha256: the 96 bytes have no DSP part, so
 * the digest of its header, then of its image) and a source-policy digest. */
#define CONTROLLER_SHA256 {0xae,0x4f,0xf7,0x13,0xd5,0x5f,0xe6,0x66,0x6c,0x0c,0xb7,0x3a,0x5e,0x0d,0x0b,0x22, \
                           0xcb,0x89,0x2e,0x4c,0xd5,0x4c,0x2c,0x13,0xc7,0x95,0xd1,0xa1,0xb3,0x37,0x8c,0x80}
#define IDENTITY {CONTROLLER_SHA256, {4,5,6}, 0x2a, 1, 1, 1, 2, 1}
const unsigned modwerk_controller_write_policy_count = 1;
const struct mw_controller_write_policy modwerk_controller_write_policies[1] = {{IDENTITY, 1, 64, 8, 16, 24}};

static uint32_t store32(uint8_t *p, uint32_t v) { p[0] = (uint8_t)(v >> 24); p[1] = (uint8_t)(v >> 16); p[2] = (uint8_t)(v >> 8); p[3] = (uint8_t)v; return v; }

int main(void)
{
    /* ABI 4: header 32 bytes, a 64-byte image, nothing else. */
    static uint8_t package[96];
    memcpy(package, "MWRM", 4); package[5] = 4; store32(package + 8, 64); store32(package + 28, 0x2a);
    const struct mu_backend *loader = &modwerk_runtime_backend;
    assert(loader->enter(0) && loader->prepare(0, package, sizeof package) && loader->publish(0) == MU_APPLIED && loader->leave(0));
    /* A different encoded package for the same module and policy row never binds. */
    struct mw_controller_identity forged = IDENTITY; forged.package_sha256[0] ^= 1u;
    struct runtime_owner owner; uintptr_t cached = 0, canonical = 0, exec = 0;
    for (unsigned i = 0; i < RUNTIME_MODULES; ++i) if (modwerk_runtime_module(i)) exec = (uintptr_t)modwerk_runtime_module(i)->dsp.image;
    assert(modwerk_controller_write_resolve(exec + 8, &owner, &cached) == 1 && owner.module == 0x2a);
    assert(modwerk_runtime_owner_canonical(&owner, &canonical) == 1 && cached == canonical + owner.image_offset);
    assert(!modwerk_controller_write_resolve(exec + 64, &owner, &cached)); /* past the image */
    assert(!modwerk_controller_write_resolve(exec - 1, &owner, &cached));  /* the header, not code */

    struct mw_controller_declaration d = {IDENTITY, {1, 0}};
    struct mw_controller_binding b = {d.identity, owner.generation, canonical, owner.extent_bytes, owner.image_offset, owner.image_bytes};
    unsigned slot;
    mw_controller_registry_init(&modwerk_controller_registry, &backend, 0);
    assert(mw_controller_reserve(&modwerk_controller_registry, &d, &forged, 0, &slot) == MW_CTL_CLOSED);
    assert(mw_controller_reserve(&modwerk_controller_registry, &d, &d.identity, 0, &slot) == MW_CTL_OK);
    struct mw_controller_binding wrong = b; wrong.identity = forged;
    assert(mw_controller_bind(&modwerk_controller_registry, slot, &wrong) == MW_CTL_CLOSED);
    assert(mw_controller_bind(&modwerk_controller_registry, slot, &b) == MW_CTL_OK);
    struct mw_controller_job reset = {owner.generation, 1, 0, 1, 0, 0, 1, 0, MW_CTL_RESET}, enable = {owner.generation, 2, 0, 0, 0, 2, 2, 0, MW_CTL_ENABLE};
    assert(mw_controller_start(&modwerk_controller_registry, &b, &reset) == MW_CTL_PENDING);
    assert(mw_controller_ack(&modwerk_controller_registry, &b, &reset, 1) == MW_CTL_OK);
    assert(mw_controller_release_job(&modwerk_controller_registry, &b, &reset) == MW_CTL_OK);
    assert(mw_controller_start(&modwerk_controller_registry, &b, &enable) == MW_CTL_PENDING);
    assert(mw_controller_ack(&modwerk_controller_registry, &b, &enable, 1) == MW_CTL_OK);
    assert(!mw_controller_control_write_allowed(&modwerk_controller_registry, &b)); /* job storage still held */
    assert(mw_controller_release_job(&modwerk_controller_registry, &b, &enable) == MW_CTL_OK);
    assert(mw_controller_control_write_allowed(&modwerk_controller_registry, &b) == 1);

    uintptr_t sp = (uintptr_t)task_stack + 64;
    struct mw_controller_write_lease *lease = (void *)(task_stack + 128), *below = (void *)(task_stack + 32);
    static struct mw_controller_write_lease outside;
    /* Refusals leave no lock held and no record. */
    assert(!begin_impl(exec + 8, 2, lease, exec + 18, sp) && !depth);        /* not the reviewed continuation */
    assert(!begin_impl(exec + 10, 2, lease, exec + 16, sp) && !depth);       /* not the reviewed entry */
    assert(!begin_impl(exec + 8, 1, lease, exec + 16, sp) && !depth);        /* another feature */
    assert(!begin_impl(exec + 8, 2, below, exec + 16, sp) && !depth);        /* below the caller's arguments */
    assert(!begin_impl(exec + 8, 2, &outside, exec + 16, sp) && !depth);     /* not the task's stack */
    assert(!begin_impl(cached + 8 + 0x1000u, 2, lease, cached + 16 + 0x1000u, sp) && !depth); /* no owned image */
    /* The reviewed call: the lock stays held across the authored writes. */
    assert(begin_impl(exec + 8, 2, lease, exec + 16, sp) == 1 && depth == 1 && writing.active);
    assert(!begin_impl(exec + 8, 2, lease, exec + 16, sp) && depth == 1);    /* nested */
    assert(end_impl(lease, exec + 24, sp) == 1 && !depth && !writing.active);
    /* Begin's decision is kept, but every call still checks the owner ledger entry and the owner's header:
     * a changed identity or digest refuses at once, without any ledger change. */
    uint32_t epoch = modwerk_runtime_owner_epoch();
    struct runtime_owner *identity = test_owner_identity(0);
    struct runtime_module *header = test_owned(0);
    identity->package_sha256[9] ^= 1u;
    assert(!begin_impl(exec + 8, 2, lease, exec + 16, sp) && !depth);
    identity->package_sha256[9] ^= 1u;
    identity->extent_bytes += 16u;
    assert(!begin_impl(exec + 8, 2, lease, exec + 16, sp) && !depth);
    identity->extent_bytes -= 16u;
    identity->generation += 1u;
    assert(!begin_impl(exec + 8, 2, lease, exec + 16, sp) && !depth);
    identity->generation -= 1u;
    header->dsp.package_sha256[30] ^= 1u;
    assert(!begin_impl(exec + 8, 2, lease, exec + 16, sp) && !depth);
    header->dsp.package_sha256[30] ^= 1u;
    header->dsp.image_bytes += 2u;
    assert(!begin_impl(exec + 8, 2, lease, exec + 16, sp) && !depth);
    header->dsp.image_bytes -= 2u;
    assert(modwerk_runtime_owner_epoch() == epoch && !(epoch & 1u));
    /* ... and the same in End, while the lease is held: refused, the lock restored. Restored, the next pair holds. */
    assert(begin_impl(exec + 8, 2, lease, exec + 16, sp) == 1 && depth == 1);
    identity->package_sha256[17] ^= 1u;
    struct mw_controller_slot kept = modwerk_controller_registry.slots[slot];
    assert(!end_impl(lease, exec + 24, sp) && !depth && !writing.active);
    identity->package_sha256[17] ^= 1u;
    modwerk_controller_registry.slots[slot] = kept; /* undo the quarantine for the rest of this test */
    assert(begin_impl(exec + 8, 2, lease, exec + 16, sp) == 1 && end_impl(lease, exec + 24, sp) == 1 && !depth);
    /* A corrupt End still restores the original lock state and quarantines. */
    assert(begin_impl(exec + 8, 2, lease, exec + 16, sp) == 1 && depth == 1);
    lease->opaque[1] ^= 1u;
    assert(!end_impl(lease, exec + 24, sp) && !depth && !writing.active);
    assert(modwerk_controller_registry.slots[slot].state == MW_CTL_QUARANTINED);
    assert(!begin_impl(exec + 8, 2, lease, exec + 16, sp) && !depth);        /* quarantined: no lease */
    return 0;
}
