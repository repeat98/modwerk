#include <stdio.h>
#include <stdint.h>
#include <string.h>
/* Host doubles for the frame timer, stock RAM and stock's silent source. */
static uint32_t timer, bank_word = 0x40000000u;
static uint8_t part_index, bank[0x8ed80 + 4 * 6322];
static unsigned silent_calls;
static const volatile uint8_t *host_ram(uint32_t a)
{
    if (a == 0x46c82456u) return (const volatile uint8_t *)&bank_word;
    if (a == 0x100b14cfu) return &part_index;
    return bank + (a - bank_word);
}
static int silent(unsigned t, unsigned p, unsigned s, unsigned e) { (void)t, (void)p, (void)s, (void)e; ++silent_calls; timer += 100; return 0; }
#define OLOG_DTCN3 timer
#define OLOG_RAM(a) host_ram((uint32_t)(a))
#define OLOG_SILENT silent
#include "../frame_guard.c"
static uint32_t ticks, events, event_a, event_b;
uint32_t octamod_log_ticks(void) { return ticks; }
void octamod_log_event(enum octamod_log_level level, uint32_t tag, uint16_t code, uint32_t a, uint32_t b)
{
    if (level == OLOG_W && tag == OLOG_TAG('G', 'R', 'D', 0) && code == 1) ++events, event_a = a, event_b = b;
}
static int failures;
#define CHECK(x) do { if (!(x)) { fprintf(stderr, "FAIL %d: %s\n", __LINE__, #x); ++failures; } } while (0)
static uint32_t machine_cost, stock_cost = FRAME / 4u;
static unsigned machine_calls, stock_calls;
static int machine_render(unsigned t, unsigned p, unsigned s, unsigned e) { (void)t, (void)p, (void)s, (void)e; ++machine_calls; timer += machine_cost; return 0; }
static int stock_render(unsigned t, unsigned p, unsigned s, unsigned e) { (void)t, (void)p, (void)s, (void)e; ++stock_calls; timer += stock_cost; return 0; }
static void sign(unsigned track, const char *sig)
{
    uint8_t *part = bank + 0x8ed80;
    part[0x22 + track] = 1; /* FLEX */
    memcpy(part + 60 + 30 * track, sig, 3);
}
/* As the hooks do: a track in the mask goes through the guard, any other straight to its renderer. */
static void render(unsigned call, unsigned track, Render *f)
{
    if (!(olog_machine_mask >> track & 1u)) f(track, 0, call ? 4 : 0, call ? 16 : 4);
    else olog_render_fn = f, call ? olog_render_second(track, 0, 4, 16) : olog_render_first(track, 0, 0, 4);
}
/* T1 the machine's track, T2 a stock track; each renders twice a frame, as stock's packer calls them. */
static void frames(unsigned n)
{
    for (unsigned i = 0; i < n; ++i) {
        olog_frame_t0 = timer;
        for (unsigned call = 0; call < 2u; ++call) render(call, 0, machine_render), render(call, 1, stock_render);
        olog_frame_exit();
        timer += 2000; /* the rest of the interrupt and the time between frames */
    }
}
static void reset(const char *sig, uint32_t render_cost)
{
    memset(bank, 0, sizeof bank);
    credit = 0, timed = 0, olog_frame_sheds = olog_frame_shed_tracks = olog_machine_mask = 0;
    memset(cost, 0, sizeof cost), memset(after, 0, sizeof after), memset(skipped, 0, sizeof skipped);
    machine_calls = stock_calls = silent_calls = 0, machine_cost = render_cost;
    sign(0, sig);
}
int main(void)
{
    /* A heavy POLY8 track is skipped; the stock track beside it always renders. */
    reset("PL\1", FRAME / 2u);
    frames(400);
    CHECK(stock_calls == 800u);
    CHECK(olog_frame_sheds > 0u && olog_frame_shed_tracks == 1u);
    CHECK(machine_calls > 0u && machine_calls + silent_calls == 800u);
    /* One GRD record with the count and the track, then none for 10 s however many more. */
    ticks = 600; olog_frame_report();
    CHECK(events == 1u && event_a == olog_frame_sheds && event_b == 1u && olog_frame_shed_tracks == 0u);
    frames(400); ticks = 1199; olog_frame_report(); CHECK(events == 1u);
    ticks = 1200; olog_frame_report(); CHECK(events == 2u && event_a > 0u);
    /* A light one never is. */
    reset("PL\1", FRAME / 20u);
    frames(400);
    CHECK(machine_calls == 800u && olog_frame_sheds == 0u);
    /* FM Synth and VECTOR are guarded too; Analog BD's voice is the DSP's, and a STATIC/FLEX track without a
     * signature, or a THRU track carrying stale bytes, is stock's. */
    reset("FM\1", FRAME / 2u); frames(400); CHECK(olog_frame_sheds > 0u);
    reset("S2\2", FRAME / 2u); frames(400); CHECK(olog_frame_sheds > 0u);
    reset("AB\1", FRAME / 2u); frames(400); CHECK(machine_calls == 800u && olog_frame_sheds == 0u);
    reset("PL\2", FRAME / 2u); frames(400); CHECK(olog_frame_sheds == 0u);
    reset("PL\1", FRAME / 2u); bank[0x8ed80 + 0x22] = 2; frames(400); CHECK(olog_frame_sheds == 0u);
    /* An unloaded bank pointer guards nothing. */
    reset("PL\1", FRAME / 2u); bank_word = 0; frames(4); bank_word = 0x40000000u; CHECK(olog_frame_sheds == 0u);
    if (failures) return 1;
    puts("frame guard: ok");
    return 0;
}
