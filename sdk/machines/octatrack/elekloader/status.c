/* SPDX-License-Identifier: GPL-3.0-or-later
 * The unit's load and memory, live (build_core.py --dsp-loader; owner, 11 October 2026): the ColdFire's load,
 * each DSP core's load (mean and peak), each core's code arena, the delay-buffer blocks in use and the module
 * pool. Measured all the time, cheaply, into modwerk_status[] (the loader report carries it over USB:
 * `npm run device -- stats`); CUE + PROJ shows it as a dialog, NO or CUE + PROJ closes it.
 *
 * ColdFire: main's idle spin (status.s) adds up, in counts of the free-running frame timer DTIM3, each pass
 * nothing broke: load = 1 - idle counts / the counts that went by. DSP: each core's receiver publishes a window
 * of 1,024 frames' idle passes (dsp_receiver.asm), read back by PEEK 24 bits a tick, the cores in turn; a
 * frame is 72,520 cycles. */
#include <stdint.h>
#include "loader.h"
#include "selftest.h"
#include "status.h"
#include "fxids.h"
#include "load_wire.h"
void modwerk_status_close_menu(void); /* below, with the menu rows */
#ifdef MODWERK_DEV
void modwerk_cost_stamp(unsigned k); /* diag.c: the development profile of the base's hooks */
#define MW_STAMP(k) modwerk_cost_stamp(k)
#else
#define MW_STAMP(k) ((void)0)
#endif

#define CUE 0x2a
#define PROJ 0x1c
#define NO 0x32
#define FRAME_CYCLES 72520u /* 4,532 a sample (the board's clock), 16 samples */
/* Cycles a hundred idle passes take: core 0's main loop and core 1's counted wait (c1wait), each calibrated on the
 * unit with 1,000 more cycles a frame (`--dsp-burn`): 50.0 and 69.1 fewer passes (11 October 2026). */
static const uint32_t idle_cycles[2] = {2000u, 1448u};
enum { CPU, DSP0_MEAN, DSP0_PEAK, DSP1_MEAN, DSP1_PEAK, BUFFERS, POOL_USED, MODULES, WRAP, ARENA, SUM0, SUM1, STATUS_WORDS };
/* WRAP: timer counts a frame; SUM0/1: each core's last window, idle passes summed over 1,024 frames */

extern volatile uint32_t dl_frames, dl_residency_words[2];
extern volatile uint32_t modwerk_dsp_meter_bits, modwerk_dsp_meter[5];
extern volatile int32_t modwerk_dsp_meter_core;
extern const uint16_t modwerk_dsp_arena[2];
int modwerk_dsp_meter_read(unsigned core, unsigned first, unsigned words);
uint32_t dl_buffers_in_use(void); /* manager.c (build_core.py's edit): FX1 and FX2 block masks, core 0 then 1 */
#define DTCN3 (*(volatile uint32_t *)0xfc07c00cu) /* the frame timer's count: free-running, all 32 bits */

/* status.s's: the idle counts so far, and the longest pass that still counts as idle (0 until the first
 * window has measured the timer's rate: nothing counts). */
volatile uint32_t modwerk_idle_counts, modwerk_idle_gap;
volatile uint32_t modwerk_status[STATUS_WORDS]; /* per mille, masks, bytes, counts: the report's tail */
/* The USB IRQ can preempt this task. Publish one complete bank with a single
 * aligned store; the IRQ only reads the other bank and never waits for us. */
static volatile struct modwerk_load_cache load_cache[2];
static volatile uint32_t load_bank;
static uint32_t load_at[3], load_flags;
static void publish_load(void)
{
    unsigned next = load_bank ^ 1u;
    volatile struct modwerk_load_cache *cache = &load_cache[next];
    cache->flags = load_flags; cache->frames = dl_frames;
    for (unsigned i = 0; i < 3u; ++i) cache->at[i] = load_at[i];
    for (unsigned i = 0; i < 5u; ++i) cache->values[i] = modwerk_status[i];
    __asm__ __volatile__("" ::: "memory");
    load_bank = next;
}
unsigned modwerk_status_load(uint8_t *out)
{
    modwerk_load_encode(out, modwerk_runtime_ticks, &load_cache[load_bank]);
    return MODWERK_LOAD_BYTES;
}
uint32_t modwerk_status_report(uint32_t *out)
{
    for (unsigned i = 0; i < STATUS_WORDS; ++i) out[i] = modwerk_status[i];
    return STATUS_WORDS;
}

/* Busy, per mille, from a core's idle passes a frame. */
static uint32_t busy(unsigned core, uint32_t idle)
{
    uint32_t c = idle * idle_cycles[core] / 100u;
    return c >= FRAME_CYCLES ? 0 : 1000u - c * 1000u / FRAME_CYCLES;
}

static uint32_t last_frames, last_idle, last_count, ticks;
volatile uint32_t modwerk_status_reads; /* each core's window read back, counted (dsp.c's self-test waits for fresh ones) */
volatile uint32_t modwerk_status_fast;  /* set by the self-test: the least idle count alone (the peak), 24 bits a window */
static int reading = -1, read_last = 1; /* the core whose window (least, most, sum) is being read back */
static unsigned read_words = 3u;        /* how many of them */
static unsigned waited;
static uint32_t cpu_recent[8];
static void missing_check(void);
static void memory_tick(void);
static void status_tick(void);
void modwerk_fxpage_missing(void); /* fxpage.c: once, unlisted module handles show MISSING, not NONE */
void modwerk_status_tick(void)
{
    MW_STAMP(5); status_tick(); MW_STAMP(6);
}
static void status_tick(void)
{
    modwerk_status_close_menu();
    memory_tick();
    modwerk_fxpage_missing(); /* the first tick builds it; after that it returns at once */
    if (++ticks % 30u) return; /* twice a second */
    missing_check();
    uint32_t count = DTCN3, frames = dl_frames, idle = modwerk_idle_counts;
    uint32_t counts = count - last_count, df = frames - last_frames, di = idle - last_idle;
    last_count = count, last_frames = frames, last_idle = idle;
    if (df) modwerk_status[WRAP] = counts / df, modwerk_idle_gap = counts / df / 362u + 2u; /* about 1 µs */
    uint32_t per = counts / 1000u;
    modwerk_status[CPU] = per && ticks > 30u && di / per < 1000u ? 1000u - di / per : 0;
    if (per && ticks > 30u && df) { load_flags |= 1u; load_at[0] = modwerk_runtime_ticks; }
    cpu_recent[(ticks / 30u) % 8u] = modwerk_status[CPU]; /* the page's CPU peak: the last four seconds */
    if (reading >= 0) { /* least, most and sum of 1,024 frames, read 24 bits a tick */
        if (modwerk_dsp_meter_core == reading && modwerk_dsp_meter_bits >= (read_words == 1u ? 24u : 72u)) {
            if (read_words == 3u) {
                modwerk_status[reading ? DSP1_MEAN : DSP0_MEAN] = busy((unsigned)reading, modwerk_dsp_meter[3] >> 10);
                modwerk_status[reading ? SUM1 : SUM0] = modwerk_dsp_meter[3];
                load_flags |= 2u << (unsigned)reading; load_at[1u + (unsigned)reading] = modwerk_runtime_ticks;
            }
            modwerk_status[reading ? DSP1_PEAK : DSP0_PEAK] = busy((unsigned)reading, modwerk_dsp_meter[1]);
            modwerk_status_reads = modwerk_status_reads + 1;
            reading = -1;
        } else if (++waited > 6u) reading = -1; /* the manager took the core: start again */
    }
    if (reading < 0 && modwerk_dsp_meter_read((unsigned)(read_last ^ 1), 1, read_words = modwerk_status_fast ? 1u : 3u))
        reading = read_last ^= 1, waited = 0;
    uint32_t largest;
    modwerk_status[BUFFERS] = dl_buffers_in_use();
    modwerk_status[POOL_USED] = RUNTIME_POOL_BYTES - modwerk_runtime_free(&largest);
    modwerk_status[MODULES] = modwerk_runtime_active();
    modwerk_status[ARENA] = modwerk_dsp_arena[0] | (uint32_t)modwerk_dsp_arena[1] << 16;
    publish_load();
}

/* The dialogs: while one shows it takes every key and encoder, so nothing changes under it; NO closes it and the
 * screen it covered is back as it was. CUE + PROJ toggles the status from anywhere; PROJ's MODWERK category (the
 * fifth root row build_core.py adds, owner 12 October 2026) opens each page: LOAD, MODULE LOAD, MISSING, SELF TEST. */
enum { CLOSED, SHOWN, TEST, MISSING, MEMORY, MODULE_LOAD, REFUSED };
static int open, taken = -1; /* which shows; a key press the handler took, whose release it takes too (-1: none; TRIG 1 is 0) */
#define YES 0x31
/* Our rows close PROJ's menu on the next tick, as its NO does (stock's FUN_40064bc0, Octabam's MAINMENU.md; not from
 * the row's own dispatch): a menu left open under the dialog kept its input layer, and YES in an FX chooser then
 * reached our row again (owner, 11 October 2026). */
#ifdef MODWERK_HOST
void modwerk_test_close_menu(void);
#define CLOSE_MENU modwerk_test_close_menu
#else
#define CLOSE_MENU ((void (*)(void))0x40064bc0u)
#endif
static int close_menu;
/* PROJ's menu is open: its input layer 0x400cbf2c is in stock's list at 0x460d165c (Octabam's MAINMENU.md 6c). A YES
 * in an FX chooser reached our rows' actions with the menu closed (11 October 2026): they act only when it is open. */
#ifdef MODWERK_HOST
int modwerk_test_menu_open;
static int menu_open(void) { return modwerk_test_menu_open; }
#else
static int menu_open(void)
{
    uint32_t at = *(volatile uint32_t *)0x460d165cu;
    for (unsigned n = 0; at && n < 16u; ++n, at = *(volatile uint32_t *)(uintptr_t)at) if (at == 0x400cbf2cu) return 1;
    return 0;
}
#endif
void modwerk_status_close_menu(void) { if (close_menu) close_menu = 0, CLOSE_MENU(); }
/* PROJ > MODWERK's rows (build_core.py): the category's label, then each row's label and action. */
char modwerk_menu_label[] = "MODWERK", modwerk_load_label[] = "LOAD", modwerk_modules_label[] = "MODULE LOAD",
     modwerk_missing_label[] = "MISSING", modwerk_test_label[] = "SELF TEST";
static unsigned missing_top, modules_top;
static int missing_asked; /* MISSING opened from the menu: it stays open with nothing missing */
/* Opened from the menu, the page says for two seconds how to open it in one gesture (owner, 15 October 2026). */
static uint32_t tip_until;
void modwerk_load_menu(int unused) { (void)unused; if (menu_open()) open = SHOWN, close_menu = 1, tip_until = ticks + 120u; }
void modwerk_modules_menu(int unused) { (void)unused; if (menu_open()) open = MODULE_LOAD, modules_top = 0, close_menu = 1; }
static void missing_locate(void);
void modwerk_missing_menu(int unused) { (void)unused; if (menu_open()) open = MISSING, missing_top = 0, missing_asked = 1, close_menu = 1, missing_locate(); }
/* SELF TEST (dsp.c's self-test): its page shows at once, the test starting if it can. */
static int test_started;
void modwerk_test_menu(int unused)
{
    (void)unused;
    if (!menu_open()) return;
    open = TEST, close_menu = 1, test_started = modwerk_selftest_start();
}
/* Missing modules (owner, 11 October 2026: a list to close, not a popup): every module the project names, in any
 * bank or Part, that is not installed (dsp.c's MISSING list). It opens when the list gains one and has held still
 * for half a second (a project load's rebind passes through), once the boot's restore is over (until then every
 * module is missing). UP and DOWN scroll, YES or NO closes it; it closes itself once nothing is missing. */
#define UP 0x33
#define DOWN 0x20
#define ROWS 4u
#define MISSING_ROWS 2u /* the missing page: two lines a module, its name and where the project names it */
int modwerk_fxmap_where(unsigned id, unsigned *bank, unsigned *part, unsigned *track); /* fxmap.c */
/* Where the project names a missing module, as `at` holds it (fxmap.c's first find: kind, bank, Part, track):
 * "BANK A PART 1 T2", with SAVED before PART when only a Part's saved copy names it (a RELOAD brings it back).
 * `brief` leaves out "BANK " for a line that would not fit. */
static void missing_where(char *out, const uint8_t *at, int brief)
{
    char *s = out;
    if (at[0]) {
        if (!brief) for (const char *t = "BANK "; *t; ) *s++ = *t++;
        *s++ = (char)('A' + at[1]);
        for (const char *t = at[0] == 2 ? " SAVED PART " : " PART "; *t; ) *s++ = *t++;
        *s++ = (char)('1' + at[2]), *s++ = ' ', *s++ = 'T', *s++ = (char)('1' + at[3]);
    }
    *s = 0;
}
unsigned modwerk_dsp_missing_list(uint8_t *out, unsigned first, unsigned most);
int modwerk_modset_restored(void);
extern volatile uint32_t modwerk_modset_result;
static uint8_t missing[4 + 24 * MODWERK_FX_IDS];
/* Where each listed module is named, refreshed with the list while the page shows: a lookup reads every bank's Parts,
 * too slow for each drawing (the open page already costs about 0.8 ms a composition, OCTATRACK_HARDWARE_TRAPS.md). */
static uint8_t missing_at[MODWERK_FX_IDS][4];
static fx_set missing_told, missing_last; /* the handles the page told about; the list at the last check */
static void missing_locate(void)
{
    for (unsigned i = 0; i < missing[3]; ++i) {
        unsigned bank = 0, part = 0, track = 0;
        missing_at[i][0] = (uint8_t)modwerk_fxmap_where(missing[4 + 24 * i], &bank, &part, &track);
        missing_at[i][1] = (uint8_t)bank, missing_at[i][2] = (uint8_t)part, missing_at[i][3] = (uint8_t)track;
    }
}
static void missing_check(void)
{
    unsigned n = (modwerk_dsp_missing_list(missing, 0, MODWERK_FX_IDS) - 4u) / 24u;
    fx_set handles = {{0}};
    for (unsigned i = 0; i < n; ++i) handles = fx_with(handles, missing[4 + 24 * i]);
    if (open == MISSING && !n && !missing_asked) open = CLOSED;
    if (missing_top + MISSING_ROWS > n) missing_top = n > MISSING_ROWS ? n - MISSING_ROWS : 0;
    if (fx_any(fx_less(handles, missing_told)) && fx_same(handles, missing_last) && open == CLOSED && modwerk_modset_restored() &&
        modwerk_modset_result)
        open = MISSING, missing_top = 0, missing_asked = 0, missing_told = handles;
    /* What the open page shows is told; one that comes back and goes missing again is told again. (Told only at the
     * opening, ones added while it showed reopened it at once after NO, 12 October 2026.) */
    missing_told = open == MISSING ? handles : fx_and(missing_told, handles);
    missing_last = handles;
    if (open == MISSING) missing_locate();
}
/* The memory after a module loads (owner, 11 October 2026): picked onto a track, or accepted over USB. A box with
 * each core's code memory and the module pool, used, for a second and a half; it takes no key, and a key closes it. */
#ifdef MODWERK_HOST
extern uint8_t modwerk_test_live_fx[16];
#define LIVE ((const volatile uint8_t *)modwerk_test_live_fx)
#else
#define LIVE ((const volatile uint8_t *)0x80000ec4u) /* the FX ids each track runs: FX1 T1-T8, then FX2 */
#endif
extern volatile uint32_t dl_selection_completed, modwerk_boot_accepted;
static unsigned memory_left; /* ticks the box still shows */
/* DSP FULL and DSP MEMORY FULL, said with numbers (owner, 20 October 2026: testers took the bare popup for a bug): the
 * refused effect's core, its DSP time and code memory as admission counts them with what the effect would add, or its
 * buffer blocks. A snapshot at the refusal (manager.c's dl_refusal, build_core.py), for three seconds; a key closes it. */
extern volatile uint32_t dl_refusal[8];
static unsigned refused_left, refused_reason, refused_core;
static uint32_t refused[8], refused_booked, refused_words, refused_arena;
static char refused_name[17];
static int budget_slot = -1; /* the slot the pick put a module on; -1: an accept over USB (memory only) */
/* Each core's code words before the pick: what it took is the change, so a second instance on the core or a module
 * another Part already holds takes +0% (one copy of the code per core), and a swap for a smaller one shows minus.
 * shortcut: a second pick within the box's 1.5 s counts from before the first, until the box closes. */
static uint32_t words_before[2];
static void memory_tick(void)
{
    static uint32_t completed, accepted;
    static uint8_t before[16];
    int over_usb = modwerk_boot_accepted != accepted, picked = 0;
    if (dl_selection_completed != completed) { /* a pick changes one slot; a Part change, usually many: no box then */
        unsigned changed = 0, module = 0, at = 0;
        for (unsigned i = 0; i < 16u; ++i) if (LIVE[i] != before[i]) ++changed, at = i, module |= (unsigned)fx_in(modwerk_fx_modules, LIVE[i]);
        if (changed == 1u && module) picked = 1, budget_slot = (int)at;
    }
    if (over_usb && !picked) budget_slot = -1;
    if (dl_selection_completed != completed || over_usb) for (unsigned i = 0; i < 16u; ++i) before[i] = LIVE[i];
    completed = dl_selection_completed, accepted = modwerk_boot_accepted;
    if ((picked || over_usb) && (open == CLOSED || open == MEMORY)) open = MEMORY, memory_left = 90u;
    if (open == MEMORY && memory_left && !--memory_left) open = CLOSED;
    if (open == REFUSED && refused_left && !--refused_left) open = CLOSED;
    if (open != MEMORY) words_before[0] = dl_residency_words[0], words_before[1] = dl_residency_words[1];
}
/* MODULE LOAD (owner, 12 October 2026: "load per module"): each installed module effect, with what its instances
 * cost on each core as a share of that core's DSP budget, as the box and the STATUS page's DSP rows count (owner,
 * 14 October 2026: one denominator). The cores' meters see only their sum, so this is each module's figure times the
 * slots running it: a hardware figure, or 7/4 of an emulator claim (~). */
static struct modwerk_module_load modules[MODWERK_FX_IDS];
static unsigned modules_count(void) { return modwerk_dsp_module_loads(modules); }
volatile uint32_t modwerk_status_key_at; /* modwerk_runtime_ticks at the last key or knob: dsp.c's compaction waits for quiet */
/* The pages never hold the Octatrack's controls (owner, 15 October 2026: the page ate PLAY and STOP): PLAY, STOP and
 * REC always reach stock and the page stays, so the load can be watched while playing. NO (and YES on the read-only
 * pages) closes a page, CUE + PROJ toggles the status page, UP and DOWN scroll the lists; any other key or knob closes
 * the page and goes on to stock, so nothing changes unseen behind it. Only a running self-test keeps the panel. */
#define STOP 0x27
#define PLAY 0x28
#define REC 0x29
int modwerk_status_key(int code, int pressed)
{
    static int cue;
    if (pressed) modwerk_status_key_at = modwerk_runtime_ticks;
    if (modwerk_selftest_key && (unsigned)code + 1u == modwerk_selftest_key) { /* the test's own PLAY or STOP */
        if (!pressed) modwerk_selftest_key = 0;
        return 0;
    }
    if (code == CUE) cue = pressed;
    if (!pressed) { /* a release goes where its press went */
        if (code != taken) return 0;
        taken = -1;
        return 1;
    }
    if (code == PROJ && cue) { open = open == SHOWN ? CLOSED : SHOWN; taken = code; return 1; }
    if (open == CLOSED || code == CUE || code == PLAY || code == STOP || code == REC) return 0;
    if (open == TEST) {
        if (code == NO) modwerk_selftest_abort(), open = CLOSED;
        taken = code;
        return 1;
    }
    int list = open == MISSING || open == MODULE_LOAD;
    if (list && (code == UP || code == DOWN)) {
        unsigned *top = open == MISSING ? &missing_top : &modules_top, n = open == MISSING ? missing[3] : modules_count();
        if (code == UP && *top) --*top;
        if (code == DOWN && *top + (open == MISSING ? MISSING_ROWS : ROWS) < n) ++*top;
        taken = code;
        return 1;
    }
    int closes = code == NO || code == YES; /* the popup after a pick: YES only closes it (owner, 14 October 2026) */
    open = CLOSED;
    if (!closes) return 0; /* any other key closes the page and goes on to stock */
    taken = code;
    return 1;
}
int modwerk_status_enc(int encoder, int delta)
{
    (void)encoder, (void)delta;
    modwerk_status_key_at = modwerk_runtime_ticks; /* turning a knob counts as activity too (dsp.c's compaction) */
    if (open == TEST) return 1;
    open = CLOSED; /* a knob closes the page and goes on to stock */
    return 0;
}

/* Drawing: the frame is a quarter turn round, a row of 8 bytes per x, MSB first, pixel (x, y) at bit 63 - y. */
static void fill(unsigned char *frame, unsigned x0, unsigned y0, unsigned x1, unsigned y1, int on) /* inclusive */
{
    for (unsigned x = x0; x <= x1 && x < 128u; ++x)
        for (unsigned y = y0; y <= y1 && y < 64u; ++y) {
            unsigned bit = 63u - y, at = x * 8u + (bit >> 3);
            unsigned char mask = (unsigned char)(0x80u >> (bit & 7u));
            frame[at] = on ? frame[at] | mask : frame[at] & (unsigned char)~mask;
        }
}
static void outline(unsigned char *frame, unsigned x0, unsigned y0, unsigned x1, unsigned y1)
{
    fill(frame, x0, y0, x1, y0, 1), fill(frame, x0, y1, x1, y1, 1), fill(frame, x0, y0, x0, y1, 1), fill(frame, x1, y0, x1, y1, 1);
}
/* A bar w x h at (x, y): its outline, filled to `permille`, a tick through it at `peak` (0 none). */
static void bar(unsigned char *frame, unsigned x, unsigned y, unsigned w, unsigned h, uint32_t permille, uint32_t peak)
{
    outline(frame, x, y, x + w - 1u, y + h - 1u);
    uint32_t n = (w - 2u) * (permille < 1000u ? permille : 1000u) / 1000u;
    if (n) fill(frame, x + 1u, y + 1u, x + n, y + h - 2u, 1);
    if (peak) {
        unsigned at = x + 1u + (unsigned)((w - 3u) * (peak < 1000u ? peak : 1000u) / 1000u);
        fill(frame, at, y - 1u, at, y + h, 1);
    }
}
static char *number(char *s, uint32_t v)
{
    char d[10];
    unsigned n = 0;
    do d[n++] = (char)('0' + v % 10u), v /= 10u; while (v);
    while (n) *s++ = d[--n];
    return s;
}
#define FONT 0x400ba876u     /* the small UI font, 5 px capitals (Octabam's PANEL.md) */
#define SURFACE 0x400bf10au  /* the UI's surface descriptor: copied, with the frame as its picture */
#define DRAW_TEXT ((void (*)(uint32_t, void *, int, int, int, const char *))0x40012bd8u)
static uint32_t surface[7];
/* Text whose capitals' top row is `top` (the text call counts y up from the bottom). */
static void label(unsigned x, unsigned top, const char *t) { DRAW_TEXT(FONT, surface, (int)x, 59 - (int)top, -1, t); }
static void percent(unsigned x, unsigned top, uint32_t permille)
{
    char t[8], *s = number(t, (permille + 5u) / 10u);
    *s++ = '%', *s = 0;
    label(x, top, t);
}
static uint32_t share(uint32_t part, uint32_t whole) { return whole ? (part > whole ? 1000u : part * 1000u / whole) : 0; }
#define TEXT_WIDTH ((int (*)(uint32_t, int, const char *))0x40012f30u) /* (font, limit, str): its width in px */
/* The page, a dialog as stock draws them (a frame over the screen, its title and a rule): three load bars
 * (the ColdFire, then each DSP core by its tracks) with their peaks, then the memory: each core's code arena
 * and the module pool. Bars to read from a distance, numbers to check. */
#define X0 8u
#define X1 119u
#define Y0 1u
#define Y1 62u
/* A frame and its title over the screen, stock's dialog style. */
static void dialog(unsigned char *frame, const char *title)
{
    for (unsigned i = 0; i < 7u; ++i) surface[i] = ((const volatile uint32_t *)SURFACE)[i];
    surface[3] = (uint32_t)(uintptr_t)frame;
    fill(frame, X0, Y0, X1, Y1, 0);
    outline(frame, X0, Y0, X1, Y1);
    label((unsigned)(64 - TEXT_WIDTH(FONT, -1, title) / 2), Y0 + 3u, title);
    fill(frame, X0, Y0 + 10u, X1, Y0 + 10u, 1);
}
/* A button as stock's dialogs draw them: its key's name in a frame. */
static void button(unsigned char *frame, unsigned x, unsigned y, const char *name)
{
    unsigned w = (unsigned)TEXT_WIDTH(FONT, -1, name) + 8u;
    outline(frame, x, y, x + w, y + 8u);
    label(x + 5u, y + 2u, name);
}
/* The self-test's page: a row per check (what it found, and OK, FAIL or ... at the right), the load bars of the
 * together check under it, then the verdict and NO. */
static char *fraction(char *s, uint32_t a, uint32_t b) { s = number(s, a); *s++ = '/'; s = number(s, b); *s = 0; return s; }
/* One check in a two-column grid: its name at the left of the column, OK, FAIL or ... at its right. */
static void cell(unsigned column, unsigned top, const char *name, const char *mark)
{
    unsigned x = column ? X0 + 60u : X0 + 4u, edge = column ? X1 - 4u : X0 + 54u;
    label(x, top, name);
    label((unsigned)(edge - (unsigned)TEXT_WIDTH(FONT, -1, mark)), top, mark);
}
static void test_page(unsigned char *frame)
{
    volatile struct selftest *t = &modwerk_selftest;
    modwerk_selftest_refresh();
    dialog(frame, "SELF TEST");
    if (!test_started && t->state != SELFTEST_RUNNING) {
        label(X0 + 6u, Y0 + 17u, "STOP PLAYBACK FIRST,");
        label(X0 + 6u, Y0 + 25u, "THEN OPEN IT AGAIN.");
        button(frame, X1 - 30u, Y1 - 12u, "NO");
        return;
    }
    int running = t->state == SELFTEST_RUNNING, none = !t->dsp, playing = running && t->phase >= SELFTEST_TOGETHER;
    /* the card holds the set that runs: saved (7) or restored (1) with every live module, or nothing at all */
    int saved = ((t->saved == 7u || t->saved == 1u) && t->saved_count == t->live) || (!t->live && t->saved == 2u);
    cell(0, Y0 + 13u, "MODULES", t->failed & (SELFTEST_BROKEN | SELFTEST_CORRUPT) ? "FAIL" : "OK");
    cell(1, Y0 + 13u, "SAVED", saved ? "OK" : "-");
    cell(0, Y0 + 20u, "LOAD", none ? "-" : running && t->phase == SELFTEST_TOGETHER ? "..." :
         t->failed & (SELFTEST_PEAK | SELFTEST_CPU | SELFTEST_STOPPED | SELFTEST_NOT_LOADED) ? "FAIL" : running ? "" : "OK");
    cell(1, Y0 + 20u, "STRESS", none ? "-" : running && t->phase <= SELFTEST_TOGETHER ? "" : running && t->phase == SELFTEST_STRESS ? "..." :
         t->failed & (SELFTEST_REFUSED | SELFTEST_STOPPED) ? "FAIL" : "OK");
    cell(0, Y0 + 27u, "TIMING", t->failed & SELFTEST_LATE ? "FAIL" : playing ? "..." : running ? "" : "OK");
    char ran[16], *s = fraction(ran, t->ran, t->dsp);
    for (const char *w = " RAN"; *w; ) *s++ = *w++;
    *s = 0;
    cell(1, Y0 + 27u, none ? "NO DSP" : ran, "");
    static const char *const names[3] = {"CPU", "T1-4", "T5-8"};
    const uint32_t load[3] = {t->cpu, t->peak[0], t->peak[1]};
    for (unsigned i = 0; i < 3u; ++i) {
        unsigned y = Y0 + 34u + 6u * i;
        label(X0 + 4u, y - 1u, names[i]);
        bar(frame, X0 + 30u, y, 52, 4, load[i], 900u); /* the tick: the 90 % limit */
        percent(X0 + 86u, y - 1u, load[i]);
    }
    if (running) { /* progress, and how to stop it */
        bar(frame, X0 + 4u, Y1 - 8u, 64, 5, share(t->done, t->total), 0);
        button(frame, X1 - 39u, Y1 - 10u, "NO STOPS");
        return;
    }
    const char *verdict = t->state == SELFTEST_PASSED ? "ALL PASSED" :
                          t->failed & SELFTEST_ABORTED ? "STOPPED" : t->failed & SELFTEST_BROKEN ? "MODULE BROKEN" :
                          t->failed & SELFTEST_CORRUPT ? "CODE DAMAGED" : t->failed & SELFTEST_NOT_LOADED ? "NOT ALL LOADED" :
                          t->failed & SELFTEST_STOPPED ? "DSP STOPPED" : t->failed & SELFTEST_LATE ? "FRAMES LATE" :
                          t->failed & SELFTEST_PEAK ? "DSP OVER 90%" : t->failed & SELFTEST_CPU ? "CPU OVER 90%" :
                          t->failed & SELFTEST_REFUSED ? "REFUSED" : t->failed & SELFTEST_COUNTED ? "LOADER ERRORS" : "FAILED";
    if (t->culprit_name[0] && t->state == SELFTEST_FAILED && !(t->failed & SELFTEST_ABORTED)) {
        /* which module, and what: the name in capitals (the font has no others), then a short reason */
        const char *why = t->failed & SELFTEST_BROKEN ? " BROKEN" : t->failed & SELFTEST_CORRUPT ? " DAMAGED" :
                          t->failed & SELFTEST_NOT_LOADED ? " TOO BIG" : t->failed & SELFTEST_STOPPED ? " STOPS DSP" :
                          t->failed & SELFTEST_LATE ? " LATE" : t->failed & SELFTEST_PEAK ? " DSP 90%+" :
                          t->failed & SELFTEST_CPU ? " CPU 90%+" : " FAILED";
        static char named[32];
        unsigned n = 0;
        for (unsigned i = 0; i < 12u && t->culprit_name[i]; ++i) {
            char ch = t->culprit_name[i];
            named[n++] = ch >= 'a' && ch <= 'z' ? (char)(ch - 32) : ch;
        }
        for (const char *w = why; *w; ) named[n++] = *w++;
        named[n] = 0;
        verdict = named;
    }
    label(X0 + 4u, Y1 - 8u, verdict);
    button(frame, X1 - 24u, Y1 - 10u, "NO");
}
/* The missing modules: two at a time, each its name and where it is named, arrows when there are more, the count
 * and YES. */
static void arrow(unsigned char *frame, unsigned x, unsigned y, int up)
{
    for (unsigned r = 0; r < 3u; ++r) fill(frame, x + 2u - r, up ? y + r : y + 2u - r, x + 2u + r, up ? y + r : y + 2u - r, 1);
}
static void missing_page(unsigned char *frame)
{
    unsigned n = missing[3];
    dialog(frame, "MISSING MODULES");
    if (!n) label(X0 + 6u, Y0 + 17u, "NOTHING MISSING.");
    for (unsigned i = 0; i < MISSING_ROWS && missing_top + i < n; ++i) {
        const uint8_t *e = missing + 4u + 24u * (missing_top + i);
        char name[17], where[32];
        for (unsigned c = 0; c < 16u; ++c) name[c] = e[8 + c] >= 'a' && e[8 + c] <= 'z' ? (char)(e[8 + c] - 32) : (char)e[8 + c];
        name[16] = 0;
        label(X0 + 6u, Y0 + 14u + 18u * i, name[0] ? name : "UNNAMED MODULE");
        missing_where(where, missing_at[missing_top + i], 0);
        if (TEXT_WIDTH(FONT, -1, where) > (int)(X1 - 14u - (X0 + 10u))) missing_where(where, missing_at[missing_top + i], 1);
        label(X0 + 10u, Y0 + 22u + 18u * i, where);
    }
    if (missing_top) arrow(frame, X1 - 10u, Y0 + 14u, 1);
    if (missing_top + MISSING_ROWS < n) arrow(frame, X1 - 10u, Y0 + 14u + 9u * (ROWS - 1u) + 3u, 0);
    char text[24], *s = number(text, n);
    for (const char *t = " NOT INSTALLED"; *t; ) *s++ = *t++;
    *s = 0;
    if (n) label(X0 + 4u, Y1 - 8u, text);
    button(frame, X1 - 26u, Y1 - 10u, "YES");
}
static void modules_page(unsigned char *frame)
{
    unsigned n = modules_count(), estimate = 0;
    if (modules_top + ROWS > n) modules_top = n > ROWS ? n - ROWS : 0;
    dialog(frame, "MODULE LOAD");
    if (!n) label(X0 + 6u, Y0 + 17u, "NO MODULES INSTALLED.");
    else {
        label(X1 - 4u - (unsigned)TEXT_WIDTH(FONT, -1, "T5-8"), Y0 + 13u, "T5-8");
        label(X1 - 24u - (unsigned)TEXT_WIDTH(FONT, -1, "T1-4"), Y0 + 13u, "T1-4");
    }
    for (unsigned i = 0; i < n; ++i) estimate |= !modules[i].measured && (modules[i].slots[0] || modules[i].slots[1]); /* shown */
    for (unsigned i = 0; i < ROWS && modules_top + i < n; ++i) {
        const struct modwerk_module_load *m = &modules[modules_top + i];
        unsigned top = Y0 + 21u + 8u * i;
        char name[17];
        unsigned c = 0;
        for (; c < 16u && m->name[c]; ++c) name[c] = m->name[c] >= 'a' && m->name[c] <= 'z' ? (char)(m->name[c] - 32) : m->name[c];
        name[c] = 0;
        while (c && TEXT_WIDTH(FONT, -1, name) > 52) name[--c] = 0; /* clear of the numbers */
        label(X0 + 4u, top, name[0] ? name : "UNNAMED");
        for (unsigned core = 0; core < 2u; ++core) { /* T1-4 (core 1), then T5-8 (core 0) */
            unsigned slots = m->slots[core ? 0 : 1], right = core ? X1 - 4u : X1 - 24u;
            char t[8], *e = t;
            if (!slots) *e++ = '-';
            else {
                if (!m->measured) *e++ = '~';
                e = number(e, (share(m->cycles * slots, core ? MODWERK_DSP_ALLOWANCE0 : MODWERK_DSP_ALLOWANCE1) + 5u) / 10u);
                *e++ = '%';
            }
            *e = 0;
            label(right - (unsigned)TEXT_WIDTH(FONT, -1, t), top, t);
        }
    }
    if (modules_top) arrow(frame, X0 + 62u, Y0 + 21u, 1);
    if (modules_top + ROWS < n) arrow(frame, X0 + 62u, Y0 + 21u + 8u * (ROWS - 1u) + 3u, 0);
    if (estimate) label(X0 + 4u, Y1 - 8u, "~ ESTIMATE");
    button(frame, X1 - 26u, Y1 - 10u, "YES");
}
/* A bar whose last `part` of `permille` is dotted: what one effect adds to what its core already holds. */
static void share_bar(unsigned char *frame, unsigned x, unsigned y, unsigned w, unsigned h, uint32_t permille, uint32_t part)
{
    bar(frame, x, y, w, h, permille, 0);
    uint32_t n = (w - 2u) * (permille < 1000u ? permille : 1000u) / 1000u, k = (w - 2u) * (part < permille ? part : permille) / 1000u;
    for (unsigned px = x + 1u + n - k; px < x + 1u + n; ++px)
        for (unsigned py = y + 1u; py + 2u <= y + h; ++py) if ((px + py) & 1u) fill(frame, px, py, px, py, 0);
}
static void plus(unsigned x, unsigned top, uint32_t permille, int minus)
{
    char t[8], *s = t;
    *s++ = minus ? '-' : '+', s = number(s, (permille + 5u) / 10u), *s++ = '%', *s = 0;
    label(x, top, t);
}
static void memory_box(unsigned char *frame)
{
    static const char *const names[3] = {"T1-4", "T5-8", "POOL"};
    uint32_t largest, pool = RUNTIME_POOL_BYTES - modwerk_runtime_free(&largest);
    const uint32_t used[3] = {share(dl_residency_words[1], modwerk_dsp_arena[1]), share(dl_residency_words[0], modwerk_dsp_arena[0]),
                              share(pool, RUNTIME_POOL_BYTES)};
    for (unsigned i = 0; i < 7u; ++i) surface[i] = ((const volatile uint32_t *)SURFACE)[i];
    surface[3] = (uint32_t)(uintptr_t)frame;
    fill(frame, 18u, 12u, 109u, 50u, 0);
    outline(frame, 18u, 12u, 109u, 50u);
    struct modwerk_dsp_budget b;
    if (budget_slot >= 0 && modwerk_dsp_budget((unsigned)budget_slot, &b)) { /* its core's DSP time and code memory */
        char where[8] = {'T', (char)('1' + (budget_slot & 7)), ' ', 'F', 'X', (char)(budget_slot < 8 ? '1' : '2'), 0};
        b.name[15] = 0;
        for (char *c = b.name; *c; ++c) if (*c >= 'a' && *c <= 'z') *c = (char)(*c - 32); /* as MISSING names them */
        label(23u, 15u, b.name), label((unsigned)(105 - TEXT_WIDTH(FONT, -1, where)), 15u, where);
        fill(frame, 18u, 22u, 109u, 22u, 1);
        const uint32_t dsp = share(b.charge, b.allowance), dsp_part = share(b.effect_cycles, b.allowance),
                       mem = share(b.words, b.arena), before = share(words_before[b.core], b.arena);
        label(23u, 26u, "DSP"), share_bar(frame, 45u, 26u, 40, 6, dsp, dsp_part), plus(89u, 26u, dsp_part, 0);
        label(23u, 34u, "MEM"), share_bar(frame, 45u, 34u, 40, 6, mem, mem > before ? mem - before : 0);
        plus(89u, 34u, mem > before ? mem - before : before - mem, mem < before);
        label(23u, 42u, "POOL"), bar(frame, 45u, 42u, 40, 6, used[2], 0), percent(89u, 42u, used[2]);
        return;
    }
    label((unsigned)(64 - TEXT_WIDTH(FONT, -1, "MEMORY USED") / 2), 15u, "MEMORY USED");
    fill(frame, 18u, 22u, 109u, 22u, 1);
    for (unsigned i = 0; i < 3u; ++i) {
        unsigned y = 26u + 8u * i;
        label(23u, y, names[i]);
        bar(frame, 45u, y, 40, 6, used[i], 0);
        percent(89u, y, used[i]);
    }
}
/* transfer.c's dl_ui, reason 2 (DSP MEMORY FULL) or 3 (DSP FULL): 1 when the box shows instead of the bare popup. */
int modwerk_status_refused(unsigned reason)
{
    if ((open != CLOSED && open != MEMORY) || dl_refusal[1] > 15u || (reason == 3u) != (dl_refusal[0] == 1u)) return 0;
    for (unsigned i = 0; i < 8u; ++i) refused[i] = dl_refusal[i];
    unsigned slot = refused[1], id = refused[2], c = (slot & 7u) < 4u ? 1u : 0u;
    refused_reason = reason, refused_core = c, refused_booked = modwerk_dsp_booked(c), refused_words = dl_residency_words[c];
    refused_arena = c ? modwerk_status[ARENA] >> 16 : modwerk_status[ARENA] & 0xffffu; /* the arena as the page reads it */
    for (unsigned i = 0; i < sizeof refused_name; ++i) refused_name[i] = 0; /* a shorter name after a longer one */
    for (unsigned k = 0, n = modules_count(); k < n; ++k)
        if (modules[k].id == id) for (unsigned i = 0; i < 16u; ++i) refused_name[i] = modules[k].name[i];
#ifndef MODWERK_HOST
    if (!refused_name[0] && id < 32u) { /* a stock effect: its descriptor's name, as the chooser lists it */
        const char *d = *(const char *const *)(uintptr_t)((slot < 8u ? 0x400d5f58u : 0x400d5fdcu) + 4u * id);
        for (unsigned i = 0; d && i < 16u && d[9 + i] >= ' '; ++i) refused_name[i] = d[9 + i];
    }
#endif
    refused_name[16] = 0;
    for (char *t = refused_name; *t; ++t) if (*t >= 'a' && *t <= 'z') *t = (char)(*t - 32);
    open = REFUSED, refused_left = 180u;
    return 1;
}
static void refused_box(unsigned char *frame)
{
    for (unsigned i = 0; i < 7u; ++i) surface[i] = ((const volatile uint32_t *)SURFACE)[i];
    surface[3] = (uint32_t)(uintptr_t)frame;
    fill(frame, 18u, 12u, 109u, 50u, 0);
    outline(frame, 18u, 12u, 109u, 50u);
    unsigned slot = refused[1], c = refused_core;
    char where[8] = {'T', (char)('1' + (slot & 7u)), ' ', 'F', 'X', (char)(slot < 8u ? '1' : '2'), 0};
    const char *title = refused_reason == 3u ? "DSP FULL" : "DSP MEMORY FULL";
    if (TEXT_WIDTH(FONT, -1, title) + TEXT_WIDTH(FONT, -1, where) + 6 > 82) title += 4; /* "MEMORY FULL": clear of the slot */
    label(23u, 15u, title), label((unsigned)(105 - TEXT_WIDTH(FONT, -1, where)), 15u, where);
    fill(frame, 18u, 22u, 109u, 22u, 1);
    char need[32], *e = need;
    for (const char *t = refused_name[0] ? refused_name : "THIS EFFECT"; *t && e < need + 16; ) *e++ = *t++;
    const uint32_t allowance = c ? MODWERK_DSP_ALLOWANCE1 : MODWERK_DSP_ALLOWANCE0;
    if (refused[0] == 3u) { /* a Y buffer: the blocks this slot kind has on the core, all taken */
        const char *t = " NEEDS A BUFFER";
        while (*t) *e++ = *t++;
        *e = 0, label(23u, 26u, need);
        char line[24] = "FX1 BUFFERS T1-4", count[8], *n = count;
        line[2] = slot < 8u ? '1' : '2';
        if (!c) line[13] = '5', line[15] = '8';
        label(23u, 36u, line);
        n = number(n, refused[6]), *n++ = '/', n = number(n, refused[7]), *n = 0;
        label((unsigned)(105 - TEXT_WIDTH(FONT, -1, count)), 36u, count);
        return;
    }
    /* DSP: what admission books on the core now, and what the effect adds (its cycles less the slot's old effect's);
     * MEM: the core's code words, and the effect's when its code is not on the core yet. Past 100 % is why. Only the
     * bar that refused it carries the effect: the core keeps other Parts' code loaded until it needs the room, so its
     * words plus the effect's can pass 100 % on a DSP FULL that memory never refused (owner's MKII, 20 October 2026). */
    const int32_t add = (int32_t)refused[4];
    const uint32_t dsp_add = add > 0 && refused[0] == 1u ? (uint32_t)add * 1000u / allowance : 0u,
                   mem_add = refused_arena && refused[0] == 2u ? refused[5] * 1000u / refused_arena : 0u;
    const uint32_t dsp = refused_booked + dsp_add, mem = (refused_arena ? refused_words * 1000u / refused_arena : 0u) + mem_add;
    const char *t = " NEEDS ";
    while (*t) *e++ = *t++;
    *e++ = '+', e = number(e, ((refused[0] == 1u ? dsp_add : mem_add) + 5u) / 10u), *e++ = '%', *e = 0;
    label(23u, 26u, need);
    label(23u, 34u, "DSP"), share_bar(frame, 45u, 34u, 40, 6, dsp, dsp_add), percent(89u, 34u, dsp);
    label(23u, 42u, "MEM"), share_bar(frame, 45u, 42u, 40, 6, mem, mem_add), percent(89u, 42u, mem);
}
static void status_draw(unsigned char *frame);
void modwerk_status_draw(unsigned char *frame)
{
    MW_STAMP(22); status_draw(frame); MW_STAMP(13);
}
static void status_draw(unsigned char *frame)
{
    if (open == REFUSED) { refused_box(frame); return; }
    if (open == MEMORY) { memory_box(frame); return; }
    if (open == MISSING) { missing_page(frame); return; }
    if (open == TEST) { test_page(frame); return; }
    if (open == MODULE_LOAD) { modules_page(frame); return; }
    if (open != SHOWN) return;
    dialog(frame, "MODWERK STATUS");
    uint32_t cpu_peak = 0;
    for (unsigned i = 0; i < 8u; ++i) cpu_peak = cpu_recent[i] > cpu_peak ? cpu_recent[i] : cpu_peak;
    /* Two questions a player asks (owner, 15 October 2026): how hard it works now, and how much DSP space is left.
     * Now: the main CPU and each DSP chip by its tracks (measured, with the recent peak's tick). DSP space used: the
     * fuller of what admission books and the chip's code memory, whichever says DSP MEMORY FULL first (effects and
     * machines both take it). Tracks 1-4 run on core 1, tracks 5-8 on core 0. */
    /* each core's arena spelled out: the on-demand build rewrites these reads (resident_engines.py status()) */
    const uint32_t code[2] = {share(dl_residency_words[0], modwerk_dsp_arena[0]), share(dl_residency_words[1], modwerk_dsp_arena[1])};
    uint32_t used[2];
    for (unsigned core = 0; core < 2u; ++core) used[core] = modwerk_dsp_booked(core) > code[core] ? modwerk_dsp_booked(core) : code[core];
    static const char *const names[7] = {"WORKING NOW", "CPU", "TRACKS 1-4", "TRACKS 5-8", "DSP SPACE USED", "TRACKS 1-4", "TRACKS 5-8"};
    const uint32_t value[7] = {0, modwerk_status[CPU], modwerk_status[DSP1_MEAN], modwerk_status[DSP0_MEAN], 0, used[1], used[0]},
                   peak[7] = {0, cpu_peak, modwerk_status[DSP1_PEAK], modwerk_status[DSP0_PEAK], 0, 0, 0};
    for (unsigned i = 0; i < 7u; ++i) {
        unsigned y = Y0 + 14u + 7u * i;
        label(X0 + 4u, y - 1u, names[i]);
        if (i == 0 || i == 4) continue; /* a heading */
        bar(frame, X0 + 48u, y, 40, 4, value[i], peak[i]);
        percent(X0 + 92u, y - 1u, value[i]);
    }
    if ((int32_t)(tip_until - ticks) > 0) { /* over the last rows, a box as stock draws them */
        fill(frame, X0 + 6u, Y1 - 15u, X1 - 6u, Y1 - 3u, 0);
        outline(frame, X0 + 6u, Y1 - 15u, X1 - 6u, Y1 - 3u);
        label((unsigned)(64 - TEXT_WIDTH(FONT, -1, "CUE + PROJ OPENS THIS") / 2), Y1 - 11u, "CUE + PROJ OPENS THIS");
    }
}
