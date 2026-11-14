/* SPDX-License-Identifier: GPL-3.0-or-later
 * RAM boot (boot.s): the controller's backend for whole OS images, around
 * the runtime loader's for module packages. An image arrives where the
 * controller stages every package and is accepted only as an OS entry of
 * bounded length carrying NOR's own bootstrap version, so its entry never
 * reflashes the bootstrap. Publish arms the mailbox, MAGIC last. Half a
 * second later, once the host has read the acknowledgement, the engine
 * quiesces as OS UPGRADE does and boot.s parks the DSPs and soft-resets;
 * the gate then hands over to the image. Nothing here writes the flash; a
 * power cycle boots the flashed base. Development only. */
#include "boot.h"
#include "runtime.h"

#define OS_FIRST 0x4fefffe4u   /* the entry's `lea (-28,%sp),%sp` */
#define OS_VEROFF 0x000de648u  /* the bootstrap version word the image carries */
#define BOOT_MAGIC 0x4d574254u /* "MWBT", boot.s */
#define BOOT_DELAY_TICKS 30u   /* 0.5 s of core-ot's tick */

struct modwerk_boot_stage modwerk_boot_stage __attribute__((aligned(16)));
static uint32_t length;
static int candidate, armed;
#ifdef MODWERK_RUNTIME_SETS
#include "set_package.h"
extern const uint8_t modwerk_base_digest[32];
int modwerk_modset_check_set(const uint8_t *,uint32_t);
static int set_candidate;
static const struct mu_backend *module_backend(void)
{ return set_candidate ? &modwerk_runtime_set_backend : &modwerk_runtime_backend; }
#else
static const struct mu_backend *module_backend(void) { return &modwerk_runtime_backend; }
#endif
static volatile uint32_t countdown;
static volatile int due;

#ifdef MODWERK_HOST
uint32_t modwerk_test_nor_version = 0x0408u;
int modwerk_test_resets, modwerk_test_recording, modwerk_test_stops;
int mu_disconnecting; /* upload.c's, which this host test does not link */
static void *uncached(void *p) { return p; }
static uint32_t nor_version(void) { return modwerk_test_nor_version; }
int modwerk_boot_recording(void) { return modwerk_test_recording; }
void modwerk_post_key(unsigned code, int pressed) { if (code == 0x27u && pressed) ++modwerk_test_stops; }
void modwerk_panel_bytes(uint8_t first, uint8_t second) { (void)first; (void)second; }
void modwerk_boot_quiesce(void) {}
void modwerk_boot_reset(void) { ++modwerk_test_resets; }
#else
static void *uncached(void *p) { return (void *)((uintptr_t)p + 0x08000000u); }
static uint32_t nor_version(void) { return *(volatile uint16_t *)0x3ffcu; }
/* runtime.c's stopped check, recorder half: two 84-byte state rows per track. */
int modwerk_boot_recording(void)
{
    for (unsigned i = 0; i < 16; ++i) if (*(volatile uint8_t *)(0x80004f1eu + i * 84u)) return 1;
    return 0;
}
/* A key as the panel sends it: a row report {0x20 | row, the row's keys
 * held} through the panel's own byte ringer (0x40092254, UART1's receive
 * callback), which forces the parser's interrupt (INTC0 source 37). The
 * parser then updates the held-key rows stock's handlers read (0x4009220c)
 * and posts the event from its interrupt, as for a physical press. Masked
 * like the UART interrupt that calls the ringer. (Posting event records
 * directly, without the held rows, made STOP misbehave on the unit.) */
void modwerk_panel_bytes(uint8_t first, uint8_t second)
{
    void (*ring)(uint32_t) = (void (*)(uint32_t))0x40092254u;
    uint32_t sr = modwerk_machine_mask();
    ring(first);
    ring(second);
    modwerk_machine_unmask(sr);
}
void modwerk_post_key(unsigned code, int pressed)
{
    if (code >= 64u) return;
    unsigned row = code >> 3;
    uint8_t bit = (uint8_t)(1u << (code & 7u)), held = *(volatile uint8_t *)(0x46100b18u + row);
    modwerk_panel_bytes((uint8_t)(0x20u | row), pressed ? (uint8_t)(held | bit) : (uint8_t)(held & ~bit));
}
void modwerk_boot_quiesce(void);
void modwerk_boot_reset(void);
#endif

static struct modwerk_boot_stage *stage(void) { return uncached(&modwerk_boot_stage); }
uint8_t *modwerk_boot_staging(void) { return stage()->image; }
static uint32_t be32(const uint8_t *p) { return (uint32_t)p[0] << 24 | (uint32_t)p[1] << 16 | (uint32_t)p[2] << 8 | p[3]; }

void modwerk_modset_candidate(const uint8_t *package, uint32_t bytes); /* modset.c: kept across power cycles */
void modwerk_modset_accepted(void);
volatile uint32_t modwerk_boot_accepted; /* modules accepted over USB: status.c shows the memory then */
static int prepare(void *u, const uint8_t *d, uint32_t n)
{
    candidate = 0;
#ifdef MODWERK_RUNTIME_SETS
    set_candidate = 0;
#endif
    modwerk_modset_candidate(0, 0);
    if (n < 4u || be32(d) != OS_FIRST) {
#ifdef MODWERK_RUNTIME_SETS
        set_candidate = n >= RUNTIME_SET_HEADER && be32(d) == RUNTIME_SET_MAGIC;
        if(set_candidate) {
            for(unsigned i=0;i<32u;++i) if(d[16+i]!=modwerk_base_digest[i]) return 0;
            if(!modwerk_modset_check_set(d,n)) return 0;
        }
#endif
        const struct mu_backend *b=module_backend();
        int ok = b->prepare(u, d, n);
        if (ok) modwerk_modset_candidate(d, n);
        return ok;
    }
    if (d != stage()->image || n < OS_VEROFF + 2u || n > BOOT_IMAGE_BYTES ||
        ((uint32_t)d[OS_VEROFF] << 8 | d[OS_VEROFF + 1u]) != nor_version()) return 0;
    length = n; candidate = 1;
    return 1;
}
static int discard(void *u) { candidate = 0; modwerk_modset_candidate(0, 0); const struct mu_backend *b=module_backend();return b->discard(u); }
static enum mu_publication publish(void *u)
{
    if (!candidate) { const struct mu_backend *b=module_backend();return b->publish(u); }
    volatile uint32_t *mb = stage()->mailbox;
    const uint8_t *p = stage()->image;
    uint32_t hash = 0;
    for (uint32_t i = 0; i < length; ++i) hash = hash * 33u + p[i];
    mb[0] = 0; mb[1] = length; mb[2] = hash; mb[3] = BOOT_MAGIC ^ length ^ hash;
    mb[4] = 0; mb[5] = 0; mb[6] = 0;
    mb[0] = BOOT_MAGIC; /* last: a half-written mailbox is never armed */
    candidate = 0; armed = 1; countdown = BOOT_DELAY_TICKS;
    return MU_APPLIED;
}
/* Rollback before the reset fires (the host or a disconnect): disarm. */
static int restore(void *u)
{
    modwerk_modset_candidate(0, 0); /* rolled back: the set stays as it was */
    if (!armed) { const struct mu_backend *b=module_backend();return b->restore(u); }
    stage()->mailbox[0] = 0;
    armed = 0; countdown = 0; due = 0;
    return 1;
}
static int retire(void *u)
{
    if (armed) return 1;
    const struct mu_backend *b=module_backend();
#ifdef MODWERK_RUNTIME_SETS
    /* The complete saved candidate must still fit before the loader releases
     * any predecessor. Its only mutation follows a successful retirement. */
    if(set_candidate && !modwerk_modset_check_set(0,0)) return 0;
#endif
    int ok = b->retire(u);
    if (ok == 1) modwerk_modset_accepted(), modwerk_boot_accepted = modwerk_boot_accepted + 1; /* it stays after a power cycle */
    return ok;
}
/* Updates stop playback themselves (owner, 10 October 2026; the site asks
 * first): STOP as if pressed, then the runtime's own check, which still
 * refuses until the unit has stopped; the host retries. Never a recording,
 * and never for a disconnect's rollback (no one asked). */
static int enter(void *u)
{
    static uint32_t pressed_at;
    static int pressed;
    if (!mu_disconnecting && !modwerk_machine_stopped() && !modwerk_boot_recording() && (!pressed || modwerk_runtime_ticks - pressed_at >= 60u)) {
        modwerk_post_key(0x27u, 1); modwerk_post_key(0x27u, 0); /* STOP */
        pressed = 1; pressed_at = modwerk_runtime_ticks;
    }
    return modwerk_runtime_backend.enter(u);
}
static int safe(void *u) { return modwerk_runtime_backend.safe(u); }
static int leave(void *u) { return modwerk_runtime_backend.leave(u); }
const struct mu_backend modwerk_boot_backend = {0, enter, safe, leave, prepare, discard, publish, restore, retire};

/* flash.c: restart on NOR half a second on, with no mailbox armed (the gate boots the flashed image). */
void modwerk_boot_restart(void) { armed = 2; countdown = BOOT_DELAY_TICKS; due = 0; }
/* status.c's update screen: a RAM boot is armed, half a second before the unit restarts into it. */
int modwerk_boot_pending(void) { return armed == 1; }
int modwerk_boot_tick(void)
{
    if (!countdown || --countdown) return 0;
    due = 1;
    return 1;
}
void modwerk_boot_service(void)
{
    if (!due) return;
    due = 0;
    if (!armed || (armed == 1 && stage()->mailbox[0] != BOOT_MAGIC)) return;
    modwerk_boot_quiesce();
    modwerk_boot_reset();
}
