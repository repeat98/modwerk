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
static volatile uint32_t countdown;
static volatile int due;

#ifdef MODWERK_HOST
uint32_t modwerk_test_nor_version = 0x0408u;
int modwerk_test_resets, modwerk_test_recording, modwerk_test_stops;
int mu_disconnecting; /* upload.c's, which this host test does not link */
static void *uncached(void *p) { return p; }
static uint32_t nor_version(void) { return modwerk_test_nor_version; }
static int recording(void) { return modwerk_test_recording; }
static void press_stop(void) { ++modwerk_test_stops; }
void modwerk_boot_quiesce(void) {}
void modwerk_boot_reset(void) { ++modwerk_test_resets; }
#else
static void *uncached(void *p) { return (void *)((uintptr_t)p + 0x08000000u); }
static uint32_t nor_version(void) { return *(volatile uint16_t *)0x3ffcu; }
/* runtime.c's stopped check, recorder half: two 84-byte state rows per track. */
static int recording(void)
{
    for (unsigned i = 0; i < 16; ++i) if (*(volatile uint8_t *)(0x80004f1eu + i * 84u)) return 1;
    return 0;
}
/* STOP as the panel presses it (parser 0x4009228c): a press and a release
 * record {01, code, press/release byte, 0, panel time} from the key's keymap
 * entry, posted by pointer to the queue(s) the entry names. The records stay
 * put until the UI task reads them; one press a second at most. */
static uint8_t stop_events[2][8] __attribute__((aligned(4)));
static void press_stop(void)
{
    const uint8_t *key = *(const uint8_t *const volatile *)0x46c901dcu + 12u * 0x27u;
    for (unsigned i = 0; i < 2; ++i) {
        uint8_t *e = stop_events[i];
        e[0] = key[0]; e[1] = key[1]; e[2] = key[2 + i]; e[3] = 0;
        *(uint32_t *)(void *)(e + 4) = *(volatile uint32_t *)0x46104cf4u;
        for (unsigned q = 4; q <= 8; q += 4) {
            void *queue = *(void *const *)(const void *)(key + q);
            if (queue) ((void (*)(void *, const void *))0x40000c3cu)(queue, e);
        }
    }
}
void modwerk_boot_quiesce(void);
void modwerk_boot_reset(void);
#endif

static struct modwerk_boot_stage *stage(void) { return uncached(&modwerk_boot_stage); }
uint8_t *modwerk_boot_staging(void) { return stage()->image; }
static uint32_t be32(const uint8_t *p) { return (uint32_t)p[0] << 24 | (uint32_t)p[1] << 16 | (uint32_t)p[2] << 8 | p[3]; }

static int prepare(void *u, const uint8_t *d, uint32_t n)
{
    candidate = 0;
    if (n < 4u || be32(d) != OS_FIRST) return modwerk_runtime_backend.prepare(u, d, n);
    if (d != stage()->image || n < OS_VEROFF + 2u || n > BOOT_IMAGE_BYTES ||
        ((uint32_t)d[OS_VEROFF] << 8 | d[OS_VEROFF + 1u]) != nor_version()) return 0;
    length = n; candidate = 1;
    return 1;
}
static int discard(void *u) { candidate = 0; return modwerk_runtime_backend.discard(u); }
static enum mu_publication publish(void *u)
{
    if (!candidate) return modwerk_runtime_backend.publish(u);
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
    if (!armed) return modwerk_runtime_backend.restore(u);
    stage()->mailbox[0] = 0;
    armed = 0; countdown = 0; due = 0;
    return 1;
}
static int retire(void *u) { return armed ? 1 : modwerk_runtime_backend.retire(u); }
/* Updates stop playback themselves (owner, 10 October 2026; the site asks
 * first): STOP as if pressed, then the runtime's own check, which still
 * refuses until the unit has stopped; the host retries. Never a recording,
 * and never for a disconnect's rollback (no one asked). */
static int enter(void *u)
{
    static uint32_t pressed_at;
    static int pressed;
    if (!mu_disconnecting && !modwerk_machine_stopped() && !recording() && (!pressed || modwerk_runtime_ticks - pressed_at >= 60u)) {
        press_stop();
        pressed = 1; pressed_at = modwerk_runtime_ticks;
    }
    return modwerk_runtime_backend.enter(u);
}
static int safe(void *u) { return modwerk_runtime_backend.safe(u); }
static int leave(void *u) { return modwerk_runtime_backend.leave(u); }
const struct mu_backend modwerk_boot_backend = {0, enter, safe, leave, prepare, discard, publish, restore, retire};

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
    if (!armed || stage()->mailbox[0] != BOOT_MAGIC) return;
    modwerk_boot_quiesce();
    modwerk_boot_reset();
}
