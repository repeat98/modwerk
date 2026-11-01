/* SPDX-License-Identifier: GPL-3.0-or-later */
/* OS 1.74 adapter. Pointer results from stock use d0, not GCC's a0.
 * Emulator output checked; hardware and lifecycle qualification pending.
 */
#include <stdint.h>
#include "analog-rytm-mk2/store.h"
#include "feedback.h"
STORE_FIELD(midi_feedback_enabled);
extern void core_additem(void *, const void *);
extern void mf_toggle_label(void), mf_refresh_label(void);
#define APP ((unsigned (*)(void))APP_AT)
#define CONFIG ((unsigned (*)(unsigned))CONFIG_AT)
#define PARAM_ON ((int (*)(unsigned))PARAM_ON_AT)
#define PARAM_KIND ((int (*)(unsigned))PARAM_KIND_AT)
#define OUTPUT_PORT ((int (*)(unsigned))OUTPUT_PORT_AT)
#define TRACK_CHANNEL ((int (*)(unsigned, int))TRACK_CHANNEL_AT)
#define TRACK_SOUND ((unsigned (*)(void *, int))TRACK_SOUND_AT)
#define DIN_ENQUEUE ((void (*)(int, const uint8_t *))DIN_ENQUEUE_AT)
#define U32(a) (*(volatile uint32_t *)(a))
#define U16(a) (*(volatile uint16_t *)(a))
#define DIN_BUFFER_AT (DIN_STATE_AT + 8u)
#define DIN_PENDING_AT (DIN_STATE_AT + 28u)
static struct mf_state state;
static int was_enabled, was_allowed;
static unsigned last_kit = ~0u;
#define REFRESH_TICKS 40u /* about 2 seconds on the stock 20 Hz UI task */
static unsigned refresh_ticks;
/* Original diagnostic counters/values for local emulator probes. */
volatile struct {
    unsigned ticks, app, kit, sound, accessor_vtable, parameter_vtable;
    unsigned parameter_get, configuration, enabled, allowed, sent;
    int channel;
    int values[7];
} mf_probe;

static int enabled(void) { return core_store_get(STORE(midi_feedback_enabled), 0, 0) != 0; }
const char *mf_label_text(void)
{
    return enabled() ? "MIDI FEEDBACK: ON" : "MIDI FEEDBACK: OFF";
}
static void toggle(void)
{
    core_store_set(STORE(midi_feedback_enabled), 0, 0, !enabled());
    mf_reset(&state);
    refresh_ticks = 0;
}
static void refresh(void) { mf_request_refresh(&state); refresh_ticks = 0; }
static int nothing(void) { return 0; }
static const void *const toggle_row[] = {mf_toggle_label, toggle, nothing, nothing};
static const void *const refresh_row[] = {mf_refresh_label, refresh, nothing, nothing};
void mf_settings(void *menu)
{
    core_additem(menu, toggle_row);
    core_additem(menu, refresh_row);
}

/* Stock DIN enqueue can wait for space. Check its own ring occupancy while
 * interrupts are masked, keeping 64 bytes free for existing stock traffic.
 * Reserve the WHOLE active DMA block, not its decreasing remaining count:
 * the hardware can finish/reload CITER before its completion ISR runs, even
 * while CPU interrupts are masked. Stock's capacity check must still pass
 * in that state, so a progress-dependent preflight is insufficient.
 * Ordinary enqueue was exercised in the emulator; full-queue stress and
 * hardware IRQ timing remain qualification checks.
 */
static int send_cc(unsigned channel, unsigned cc, unsigned value)
{
    uint16_t sr;
    uint32_t dma, pending;
    uint8_t message[3] = {(uint8_t)(0xb0 | channel), (uint8_t)cc, (uint8_t)value};
    int sent = 0;
    __asm__ volatile ("move.w %%sr,%0\n\tmove.w #0x2700,%%sr" : "=d"(sr) : : "memory", "cc");
    if (U32(MIDI_READY_AT) && U32(DIN_BUFFER_AT)) {
        dma = U32(DIN_STATE_AT) ? U16(DMA_BLOCK_AT) : 0;
        if (U32(DIN_STATE_AT) && !dma) dma = 4096u; /* inconsistent active state: defer */
        pending = U32(DIN_PENDING_AT);
        if (pending <= 4096u && dma + pending <= 4096u - 64u - 3u) {
            DIN_ENQUEUE(3, message);
            sent = 1;
        }
    }
    __asm__ volatile ("move.w %0,%%sr" : : "d"(sr) : "memory", "cc");
    return sent;
}

static int sample_track(unsigned app, unsigned config, int track)
{
    static const uint8_t slots[6] = {30, 31, 33, 35, 40, 41};
    unsigned kit = app + 352, accessor = TRACK_SOUND((void *)kit, track);
    unsigned sound, vtable, p;
    int channel = TRACK_CHANNEL(config, track);
    if (!accessor) return 0;
    vtable = *(unsigned *)accessor;
    sound = ((unsigned (*)(unsigned))(*(unsigned *)(vtable + 0x28)))(accessor);
    if (!sound) return 0;
    /* Internal live kit: 16-byte name, thirteen 8.8 LEVEL words, then
     * twelve 152-byte sound records. Verified against the private snapshot:
     * CC95=37 produced LEVEL=37*256 while AMP Volume remained separate.
     * Read bytes because these internal records can be unaligned.
     */
    {
        const volatile uint8_t *level = (const volatile uint8_t *)(sound - 26u - 150u * track);
        if (track == 0) mf_probe.values[0] = *level;
        mf_offer(&state, track, 0, channel, *level);
    }
    if (track == 0) {
        mf_probe.sound = sound;
        mf_probe.accessor_vtable = vtable;
        mf_probe.parameter_vtable = 0;
        mf_probe.parameter_get = 0;
        mf_probe.channel = channel;
    }
    for (p = 0; p < 6; ++p) {
        int value = *(volatile int16_t *)(sound + 0x14 + 2u * slots[p]);
        if (track == 0) mf_probe.values[p + 1] = value >> 8;
        mf_offer(&state, track, p + 1, channel, value >> 8);
    }
    return 1;
}

void mf_tick(void *ctrl)
{
    unsigned app, config, kit, track;
    int on, allowed, port;
    (void)ctrl;
    ++mf_probe.ticks;
    on = enabled();
    mf_probe.enabled = on;
    app = APP();
    mf_probe.app = app;
    if (!app) return;
    config = CONFIG(app);
    mf_probe.configuration = config;
    mf_probe.kit = app + 352;
    if (!on) { if (was_enabled) mf_reset(&state); was_enabled = was_allowed = 0; refresh_ticks = 0; return; }
    port = OUTPUT_PORT(config);
    allowed = PARAM_ON(config) && PARAM_KIND(config) == 1 && (port == 1 || port == 3);
    mf_probe.allowed = allowed;
    if (!was_enabled || !was_allowed) { mf_reset(&state); refresh_ticks = 0; }
    was_enabled = 1;
    was_allowed = allowed;
    if (!allowed) return;
    {
        const volatile uint8_t *k = (const volatile uint8_t *)WORKING_KIT_AT;
        kit = (unsigned)k[0] << 24 | (unsigned)k[1] << 16 | (unsigned)k[2] << 8 | k[3];
    }
    if (kit >= 128) return;
    if (kit != last_kit) { mf_reset(&state); last_kit = kit; }
    for (track = 0; track < MF_TRACKS; ++track) {
        if (!sample_track(app, config, track)) { mf_reset(&state); return; }
    }
    if (++refresh_ticks >= REFRESH_TICKS) {
        mf_request_refresh(&state);
        refresh_ticks = 0;
    }
    mf_probe.sent += mf_flush(&state, send_cc);
}
void mf_project(int how, unsigned dropped)
{
    (void)how; (void)dropped;
    mf_reset(&state);
    was_enabled = was_allowed = 0;
    last_kit = ~0u;
    refresh_ticks = 0;
}
