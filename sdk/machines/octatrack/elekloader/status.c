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
#ifdef MODWERK_SETTINGS
#include "settings.h"
#endif
#include "selftest.h"
#include "status.h"
#include "fxids.h"
#include "allocator.h" /* dl_catalog: an effect's DSP cycles, for CPU FULL's DSP row */
#include "load_wire.h"
void modwerk_status_close_menu(void); /* below, with the menu rows */
extern const char modwerk_base_version[]; /* build_core.py, from base-version.json: "0.7.1" */
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
uint32_t mw_delay[25]; /* status.s, the delay routine's quiet tracks: its calls, then per track the seam's last call, quiet frames, no read */
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
static uint32_t play_readings; /* readings in a row taken playing */
int modwerk_machine_stopped(void);         /* runtime.c */
static uint32_t recent_mean(void)
{
    uint32_t sum = 0;
    for (unsigned i = 0; i < 8u; ++i) sum += cpu_recent[i];
    return sum / 8u;
}
/* Each reading: what the guard below goes by once the unit is stopped, the longest frame of the last four seconds it
 * played, kept until it plays four seconds again. Eight readings in a row playing, so none of them is a stopped one. */
static uint32_t frame_recent[8], frame_played, frame_newest; /* as cpu_recent; the longest as it last stood playing; the newest */
static uint32_t frame_longest(void);
/* Module picks and removals since the frame readings last held them (machine_registry.c, the effect check below), per
 * mille of a frame: a pick made stopped is judged with every one before it, and a machine swapped out and back stopped
 * by what it adds, once. Eight readings played after the last change, the share holds them all; until then the kept
 * figure stays as it was, so no pick counts twice. */
static int32_t frame_adjust;
static uint32_t adjust_readings;
/* Modules that leave the Part without a pick (a Part reload, a paste, a project load) take what they cost off the kept
 * figure as they go, stopped: what the Part's modules book (the reserve's own sum, below) is noted each reading, and a
 * fall no pick made comes off. Else the figure kept from a play with FM Synth on T8 refused SYNTIZ and then Amiga on
 * the same track after a Part reload, until the unit had played four seconds (owner's MKII, 22 November 2026). A rise
 * no pick made goes back on (another Part chosen and then this one again). After a pick the sum is only noted, once it
 * moved: a reading between the guard's booking and the pick landing would see the fall a second time. */
uint32_t modwerk_machine_frame_booked(unsigned skip, uint32_t net); /* machine_registry.c */
static uint32_t effects_booked(unsigned skip);
static uint32_t booked_seen;
static int booked_moved; /* a pick or an exit since the last reading: the next one only notes the sum */
/* The kept figure is the pattern's it was played on: on another one a pick goes by that pattern's reserve (owner,
 * 22 November 2026: judged against the pattern that plays). Else a stacked pattern's 130 % refused picks made on an
 * empty one after a trial's rollback, in one take of three (twin 25). 0xffff: not known. */
unsigned modwerk_machine_pattern(void); /* machine_registry.c */
static unsigned played_pattern = 0xffffu;
static void note_stock(void);
static unsigned reading_pattern = 0xffffu; /* the pattern the readings in a row were played on */
/* The longest reading played on that pattern since the last pick or exit: the picks so far as they play, before four
 * seconds make them the kept figure (modwerk-bd, twin 30: after Amiga's pick C03 read 104.2 while the kept figure, the
 * reading before it with Amiga's table cost on top, said 102.9). */
static uint32_t played_since;
/* A set installed, removed or undone (the loader's owner epoch) starts the picks' account afresh: what they added is
 * the readings' to show again, and readings from before it are another Part's. Twin 32: after one set's trial rolled
 * back, the next set's first Tape Echo at 77 % was refused as PART IS BUSY against the last set's 110 %. */
static uint32_t admit_epoch;
static void epoch_check(void) /* each reading, and before a pick or an exit counts: one right after an install stays */
{
    uint32_t epoch = modwerk_runtime_owner_epoch();
    if (epoch != admit_epoch) admit_epoch = epoch, frame_adjust = 0, adjust_readings = 0, play_readings = 0, played_since = 0;
}
static void cpu_note_played(void)
{
    epoch_check();
    uint32_t booked = modwerk_machine_frame_booked(8u, 0) + effects_booked(16u);
    if (booked != booked_seen) played_since = 0; /* the modules moved (a pick, a rollback, a Part reload): what plays now */
    if (modwerk_machine_stopped()) {
        play_readings = adjust_readings = 0;
        int32_t played = (int32_t)frame_played + (int32_t)booked - (int32_t)booked_seen;
        if (!booked_moved && booked != booked_seen) frame_played = played > 0 ? (uint32_t)played : 0u;
    } else {
        unsigned now = modwerk_machine_pattern();
        if (now != reading_pattern) play_readings = 0, reading_pattern = now, played_since = 0; /* four seconds of this pattern first */
        if (frame_newest > played_since) played_since = frame_newest;
        if (++adjust_readings >= 8u) frame_adjust = 0;
        if (++play_readings >= 8u && !frame_adjust) frame_played = frame_longest(), played_pattern = now, note_stock();
    }
    if (booked != booked_seen) booked_moved = 0;
    booked_seen = booked;
}
void modwerk_status_cpu_entered(uint32_t mille) { epoch_check(); frame_adjust += (int32_t)mille, adjust_readings = 0, booked_moved = 1, played_since = 0; }
void modwerk_status_cpu_left(uint32_t mille) { epoch_check(); frame_adjust -= (int32_t)mille, adjust_readings = 0, booked_moved = 1, played_since = 0; }
/* The longest frame interrupt of each reading, per mille of a frame (machine_registry.c's mw_frame_window, cleared at
 * each read). The meter above is all of the ColdFire, averaged; the frame guard drops renders frame by frame, once a
 * frame would run past its share and what credit the short frames before it left, so a pick is judged by the frames
 * at the top. On the owner's MKII (base 0.8, 21-22 November 2026, a Part with a trig every four steps on all eight
 * tracks) no render dropped with the longest frame at 88 to 108.7 % (Analog BD at a 61.7 % mean), and renders dropped
 * from 120 % (one in twenty Part switches; 125 %: 33 in 8 s, at a 57.5 % mean), while at a 50.7 % mean with eleven
 * modules installed they dropped too: the mean does not tell them apart, the longest frame does. */
extern volatile uint32_t mw_frame_window; /* machine_registry.c: the longest frame since this last read it, DTCN3 counts */
#ifndef MW_FRAME_LINE
#define MW_FRAME_LINE 1100u
#endif
/* Of 32 readings of 8 to 30 s on the owner's MKII (22 November 2026), none from 95 to 125 % dropped a render,
 * half from 125 to 130 % did and every one past 130 % (owner: "every refused pick is bad UX", "but so is every
 * stall or skipped render or crash"). That held for stock-heavy Parts; module-heavy ones dropped from about 112 %
 * (twin 24, a medium pattern: 1 render at 112.1 %, 5 at 113.2 % in 15 s), so the owner chose 110 %. */
volatile uint32_t mw_frame_line = MW_FRAME_LINE; /* per mille of a frame: no pick past it, and the CPU bars are full at it */
static uint32_t frame_longest(void) /* the longest of the last four seconds */
{
    uint32_t most = 0;
    for (unsigned i = 0; i < 8u; ++i) most = frame_recent[i] > most ? frame_recent[i] : most;
    return most;
}
static void frame_note(unsigned at)
{
    uint32_t longest = mw_frame_window;
    mw_frame_window = 0; /* shortcut: a frame that ends between the read and this write is lost; one in 1,378 a reading */
    if (longest) frame_newest = frame_recent[at] = longest * 1000u / 47891u; /* a frame is 47,891 counts */
}
/* The longest frame a pick is judged by, per mille of a frame. A stopped unit is not busy, but the Part put together on
 * it will play: the larger of the figure it last played at and the newest reading, with the picks since on top. On an MKII
 * (13 November 2026) picks made stopped at 62 to 74 % meter left a Part that played at 87 to 97 %. A stopped reading
 * holds no machine's renders, so a machine that left takes nothing off it: right after STOP the last four seconds still
 * hold the play, and Grain to FLEX and back was refused at once (owner's MKII, 21 November 2026). Playing, the last
 * four seconds hold part of the picks since already: only the kept figure adds them. What stock may add later (a scene
 * that opens quiet delays, more trigs) is the reserve's (below), not this figure's: counted here as well, a medium
 * Part's four quiet delays took 7.2 of the room the reserve promised (owner's MKII, 22 November 2026). The kept figure
 * goes stale when the unit is made lighter while stopped (a stock pick, another project): four seconds of playing
 * replace it. */
static uint32_t measured_load(uint32_t gone) /* `gone`: what a pick's predecessor takes, off both */
{
    unsigned elsewhere = played_pattern != 0xffffu && played_pattern != modwerk_machine_pattern();
    int32_t adjust = frame_adjust - (int32_t)gone, kept = (int32_t)(elsewhere ? 0u : frame_played) + adjust, now;
    if (reading_pattern == modwerk_machine_pattern() && (int32_t)played_since - (int32_t)gone > kept)
        kept = (int32_t)played_since - (int32_t)gone;              /* played with the picks since: higher, so honest */
    if (modwerk_machine_stopped()) now = (int32_t)frame_newest + (adjust > 0 ? adjust : 0);
    else now = (int32_t)frame_longest() - (int32_t)gone; /* playing, the last four seconds hold what leaves */
    int32_t most = kept > now ? kept : now;
    return most > 0 ? (uint32_t)most : 0u;
}
static void missing_check(void);
static void missing_on_tick(void);
static void switches_tick(void);
static void memory_tick(void);
static void status_tick(void);
void modwerk_fxpage_missing(void); /* fxpage.c: once, unlisted module handles show MISSING, not NONE */
void modwerk_status_tick(void)
{
    MW_STAMP(5); status_tick(); MW_STAMP(6);
}
static void transfer_tick(void);
static void status_tick(void)
{
    modwerk_status_close_menu();
#ifdef MODWERK_SETTINGS
    modwerk_settings_tick(); /* settings.c: the kept choices, after the installed modules changed */
#endif
    transfer_tick();
    memory_tick();
    modwerk_fxpage_missing(); /* the first tick builds it; after that it returns at once */
    missing_on_tick();
    if (++ticks % 30u) return; /* twice a second */
    missing_check();
    switches_tick();
    uint32_t count = DTCN3, frames = dl_frames, idle = modwerk_idle_counts;
    uint32_t counts = count - last_count, df = frames - last_frames, di = idle - last_idle;
    last_count = count, last_frames = frames, last_idle = idle;
    if (df) modwerk_status[WRAP] = counts / df, modwerk_idle_gap = counts / df / 362u + 2u; /* about 1 µs */
    uint32_t per = counts / 1000u;
    modwerk_status[CPU] = per && ticks > 30u && di / per < 1000u ? 1000u - di / per : 0;
    if (per && ticks > 30u && df) { load_flags |= 1u; load_at[0] = modwerk_runtime_ticks; }
    cpu_recent[(ticks / 30u) % 8u] = modwerk_status[CPU]; /* the page's CPU peak: the last four seconds */
    frame_note((ticks / 30u) % 8u);
    cpu_note_played();
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
 * fifth root row build_core.py adds, owner 12 October 2026) opens each page: STATUS, MODULE COST, MISSING, SELF TEST, MODULES (renamed from LOAD and MODULE LOAD, owner,
 * 16 November 2026: they read like loading modules). */
enum { CLOSED, SHOWN, TEST, MISSING, MEMORY, MODULE_LOAD, REFUSED, SWITCHES, SETTINGS };
static int open, taken = -1; /* which shows; a key press the handler took, whose release it takes too (-1: none; TRIG 1 is 0) */
/* What a host is doing to the unit, on its own screen (owner, 13 November 2026: a sync shows a dialog with a progress
 * bar, and a base update takes the whole screen and the panel until it is saved). The step is worked out each tick
 * from what the rest of the base reports, so nothing here can outlive what it shows:
 * - a module sync (ep0.c's upload): a box with its bar while the modules arrive and start. It holds no key.
 * - a base update: the whole screen, from the first packet of a base until the write is over. On the base that is
 *   being replaced that is the new base arriving, then the restart. On the new one, started from RAM: WAITING (two
 *   slots only, where flash.c can tell that NOR starts another base), its container arriving, the write (flash.c's
 *   progress), then SAVED or NOT SAVED for three seconds. Until then every key and knob is held back: after its
 *   restart the unit loads the project and looks ready while nothing is saved, and a player who went on working lost
 *   that work to nothing but was one power-off from an undone update. A release goes to stock only if its press did,
 *   so no key is left held there. WAITING gives up 25 s after the start (a development RAM boot is a trial without a
 *   write), and 20 s after the last sign of a base's container otherwise. */
extern volatile uint32_t modwerk_flash_progress; /* flash.c: 1 + per mille of a write while the OS runs on, 0 none */
extern volatile uint32_t modwerk_flash_outcome, modwerk_flash_trial;
unsigned modwerk_upload_view(uint32_t *permille); /* ep0.c */
int modwerk_boot_pending(void);                   /* boot.c */
enum { T_NONE, T_SYNC, T_SYNC_START, T_SAVED, T_FAILED, T_WAIT, T_RECEIVE, T_SAVE, T_RESTART };
#define T_LOCKS(t) ((t) >= T_WAIT) /* the steps of a base update that hold the panel */
#define T_WAIT_TICKS 1500u         /* 25 s after the start */
#define T_QUIET_TICKS 1200u        /* 20 s after a base's container was last seen */
#define T_TOLD_TICKS 180u          /* SAVED and NOT SAVED: three seconds, or a key */
static unsigned transfer, transfer_kind, transfer_told, transfer_seen, transfer_over;
static uint32_t transfer_permille, transfer_wait = T_WAIT_TICKS, transfer_outcome, transfer_ticks;
static uint8_t held_back[8]; /* the keys whose press a base update held back, a bit each: their releases stay here too */
static void transfer_tick(void)
{
    uint32_t permille = 0, outcome = modwerk_flash_outcome;
    unsigned view = modwerk_upload_view(&permille), what = view & 15u, started = view >> 4;
    ++transfer_ticks;
    if (what && !started) transfer_kind = what; /* told while it arrives: flash.c unpacks a container over its own first bytes */
    if (!what) transfer_kind = 0;
    /* A write that ended is over until another base starts to arrive: flash.c takes its progress down a moment after
     * it reports the outcome, from another task, and on the unit that moment put WAITING back for 20 s after BASE
     * SAVED, the panel held (owner's MKII, 13 November 2026). */
    if (what >= 2u && !started) transfer_over = 0;
    if (outcome != transfer_outcome) { /* a write ended: say so, and wait for nothing more */
        transfer_outcome = outcome, transfer = outcome & 1u ? T_SAVED : T_FAILED, transfer_told = T_TOLD_TICKS;
        transfer_over = 1, transfer_wait = 0; /* saved, or the page's to send again: the panel is free meanwhile */
        return;
    }
    if (transfer_over) { /* the notice for its three seconds, then nothing */
        if ((transfer == T_SAVED || transfer == T_FAILED) && transfer_told && --transfer_told) return;
        transfer = T_NONE;
        return;
    }
    if (transfer_kind >= 2u || modwerk_flash_progress) transfer_seen = 1, transfer_wait = transfer_ticks + T_QUIET_TICKS;
    if (modwerk_flash_progress) {
        transfer = T_SAVE, transfer_permille = modwerk_flash_progress > 1000u ? 1000u : modwerk_flash_progress - 1u;
    } else if (modwerk_boot_pending() || (transfer_kind == 3u && started)) transfer = T_RESTART;
    else if (transfer_kind == 2u && started) transfer = T_SAVE, transfer_permille = 0;
    else if (transfer_kind >= 2u) transfer = T_RECEIVE, transfer_permille = permille;
    else if (transfer_kind == 1u) transfer = started ? T_SYNC_START : T_SYNC, transfer_permille = permille;
    else if ((modwerk_flash_trial || transfer_seen) && transfer_ticks < transfer_wait) transfer = T_WAIT;
    else transfer = T_NONE;
}
/* 1 when a base update holds this key back. */
static int transfer_key(int code, int pressed)
{
    if ((unsigned)code > 63u) return 0;
    uint8_t *row = &held_back[code >> 3], bit = (uint8_t)(1u << (code & 7));
    if (!pressed) { int held = *row & bit; *row &= (uint8_t)~bit; return held != 0; }
    if (transfer == T_SAVED || transfer == T_FAILED) transfer = T_NONE; /* read: the key goes on to stock */
    if (!T_LOCKS(transfer)) return 0;
    *row |= bit;
    return 1;
}
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
char modwerk_menu_label[] = "MODWERK", modwerk_load_label[] = "STATUS", modwerk_modules_label[] = "MODULE COST",
     modwerk_missing_label[] = "MISSING", modwerk_test_label[] = "SELF TEST", modwerk_switches_label[] = "MODULES";
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
int modwerk_fxmap_describe(unsigned id, uint32_t *module, uint16_t *layout, char *name); /* fxmap.c */
fx_set modwerk_fxmap_used(void);                                                       /* fxmap.c */
int modwerk_fxmap_loading(void);                                                       /* fxmap.c: a project load runs */
int modwerk_modset_restored(void);
extern volatile uint32_t modwerk_modset_result;
#ifndef MODWERK_HOST
/* machine_registry.c's map of the machines a project uses; a base without the registry has none. */
__attribute__((weak)) void modwerk_machine_map_refresh(void) {}
__attribute__((weak)) int modwerk_machine_where(unsigned k, unsigned *bank, unsigned *part, unsigned *track)
{ (void)k, (void)bank, (void)part, (void)track; return 0; }
__attribute__((weak)) int modwerk_machine_where_module(uint32_t module, unsigned *bank, unsigned *part, unsigned *track)
{ (void)module, (void)bank, (void)part, (void)track; return 0; }
#endif
/* The list: the effects the project names that are not installed, then its absent machines (dsp.c). */
static uint8_t missing[4 + 24 * MODWERK_MISSING_MAX];
/* Where each listed module is named, refreshed with the list while the page shows: a lookup reads every bank's Parts,
 * too slow for each drawing (the open page already costs about 0.8 ms a composition, OCTATRACK_HARDWARE_TRAPS.md). */
static uint8_t missing_at[MODWERK_MISSING_MAX][4];
static fx_set missing_told, missing_last; /* the handles the page told about; the list at the last check */
static uint32_t machines_told, machines_last; /* the same for the machines, by their map entry */
/* Listed modules switched off on MODULES (modset.c's shelf): named by the project, not gone. They never open the page
 * by themselves, and it says OFF beside them (owner, 16 November 2026: switching one off said NOT INSTALLED). */
static uint8_t missing_off[MODWERK_MISSING_MAX];
static unsigned missing_gone, missing_offs, missing_shown; /* listed: not switched off; switched off; not quiet */
/* Modules the player switched off on MODULES, by id, until they are on again or a project loads: MISSING does not open
 * for them by itself, since the player just chose it, but a project that loads with them off opens it, with YES to
 * switch them on (owner, 16 November 2026). */
static uint32_t quiet[RUNTIME_MODULES];
static unsigned quiet_count;
static int is_quiet(uint32_t id)
{
    for (unsigned i = 0; i < quiet_count; ++i) if (quiet[i] == id) return 1;
    return 0;
}
static void quiet_add(uint32_t id) { if (id && !is_quiet(id) && quiet_count < RUNTIME_MODULES) quiet[quiet_count++] = id; }
/* YES on MISSING: every listed module that is off, switched on one after another as MODULES switches one (modset.c),
 * at once; the first refusal ends it and is said in the page's last line. */
static uint32_t on_queue[MODWERK_MISSING_MAX], on_said_until;
static unsigned on_count, on_next;
static uint8_t on_waiting;
static const char *on_said;
static uint32_t listed_module(unsigned i)
{
    const uint8_t *e = missing + 4u + 24u * i;
    return (uint32_t)e[4] << 24 | (uint32_t)e[5] << 16 | (uint32_t)e[6] << 8 | e[7];
}
/* A machine's entry (dsp.c): handle 0xff, then 0x80 and its map entry. */
static int listed_machine(unsigned i, unsigned *k)
{
    const uint8_t *e = missing + 4u + 24u * i;
    *k = e[1] & 0x7fu;
    return e[0] == 0xffu && (e[1] & 0x80u) && *k < MODWERK_MACHINE_MAP;
}
static void missing_locate(void)
{
    for (unsigned i = 0; i < missing[3]; ++i) {
        unsigned bank = 0, part = 0, track = 0, k;
        missing_at[i][0] = (uint8_t)(listed_machine(i, &k) ? modwerk_machine_where(k, &bank, &part, &track)
                                                           : modwerk_fxmap_where(missing[4 + 24 * i], &bank, &part, &track));
        missing_at[i][1] = (uint8_t)bank, missing_at[i][2] = (uint8_t)part, missing_at[i][3] = (uint8_t)track;
    }
}
static void missing_check(void)
{
    modwerk_machine_map_refresh(); /* the absent machines, before the list reads them */
    unsigned n = (modwerk_dsp_missing_list(missing, 0, MODWERK_MISSING_MAX) - 4u) / 24u;
    fx_set handles = {{0}};
    uint32_t machines_now = 0;
    if (modwerk_fxmap_loading()) quiet_count = 0; /* another project: what it names off is said again */
    unsigned kept = 0;
    for (unsigned i = 0; i < quiet_count; ++i) if (modwerk_modset_is_off(quiet[i])) quiet[kept++] = quiet[i];
    quiet_count = kept;
    missing_gone = missing_offs = missing_shown = 0;
    for (unsigned i = 0; i < n; ++i) {
        uint32_t module = listed_module(i);
        missing_off[i] = (uint8_t)modwerk_modset_is_off(module);
        if (missing_off[i]) ++missing_offs;
        else ++missing_gone;
        unsigned k;
        if (missing_off[i] && is_quiet(module)) continue;
        if (listed_machine(i, &k)) machines_now |= 1u << k;
        else handles = fx_with(handles, missing[4 + 24 * i]);
        ++missing_shown;
    }
    if (open == MISSING && !missing_shown && !missing_asked && !on_count) open = CLOSED;
    if (missing_top + MISSING_ROWS > n) missing_top = n > MISSING_ROWS ? n - MISSING_ROWS : 0;
    if ((fx_any(fx_less(handles, missing_told)) || (machines_now & ~machines_told)) && fx_same(handles, missing_last) &&
        machines_now == machines_last && open == CLOSED && transfer == T_NONE && modwerk_modset_restored() && modwerk_modset_result)
        open = MISSING, missing_top = 0, missing_asked = 0, missing_told = handles, machines_told = machines_now;
    /* What the open page shows is told; one that comes back and goes missing again is told again. (Told only at the
     * opening, ones added while it showed reopened it at once after NO, 12 October 2026.) */
    missing_told = open == MISSING ? handles : fx_and(missing_told, handles);
    machines_told = open == MISSING ? machines_now : machines_told & machines_now;
    missing_last = handles, machines_last = machines_now;
    if (open == MISSING) missing_locate();
}
#ifdef MODWERK_HOST
extern uint8_t modwerk_test_live_fx[16];
#define LIVE ((const volatile uint8_t *)modwerk_test_live_fx)
#else
#define LIVE ((const volatile uint8_t *)0x80000ec4u) /* the FX ids each track runs: FX1 T1-T8, then FX2 */
#endif
/* Modules never take the room stock needs: a pick is judged as if the Part already played the stock load the pattern
 * that plays (and one queued) asks for, with what the modules it runs cost on top (their first and each from the site's
 * table), when that is more than the unit measures. Owner, 22 November 2026: most picks must not be refused, so not
 * against the bank's busiest pattern (one stacked eight-track pattern refused every pick in a bank); a later switch to
 * a busier one is the guard's, the ceiling's and the wait's. A pattern's longest frame follows how many tracks trig on
 * one step (samples on all eight, none trigging: 37.1 %, one: 64.2 %, then about 5.4 % a track to 101 % at eight,
 * owner's MKII, base 0.8): the reserve is that figure (reserve_by_step) with a margin for what a pattern cannot show
 * (delays opening added 7 % at eight), never under a floor, so a pick made stopped on an empty pattern keeps room for
 * its first trigs. Installed modules' cost at rest (the table's `rest`) is booked on top. mw_stock_reserve fixes the
 * reserve instead (development bases and tests); ~0 leaves it to the pattern. */
#define RESERVE_ADAPTIVE 0xffffffffu
#ifndef MW_STOCK_RESERVE
#define MW_STOCK_RESERVE RESERVE_ADAPTIVE
#endif
/* Per mille of a frame, each count measured; the set's `stock` carries newer ones. A track that trigs but not on the
 * busiest step adds about 2.6 % more (one trig on every step of eight tracks: 82.3 %, against 64.2 % for one on one
 * step; modwerk-bd, twin 7a5b0949), so a pattern is judged by both. */
#define TRACK_PLAY 26u
static const uint16_t reserve_by_step[9] = {371u, 642u, 700u, 753u, 798u, 846u, 905u, 958u, 1010u};
#define RESERVE_MARGIN 80u
/* A pattern that has played four seconds has shown most of what the ladder's margin is for: its 15 s longest frame read
 * 1 to 4 % over its 4 s one (modwerk-bd, twins 28 to 31), and with 8 % every first heavy machine on C03 was refused
 * though Amiga, SYNTIZ and FM Synth played there at 95 to 106 % with nothing dropped. */
#define MEASURED_MARGIN 40u
#define RESERVE_FLOOR 600u
/* A machine takes a track that would otherwise play a sample, so it is booked net of that track's share. */
#ifndef MW_TRACK_STOCK
#define MW_TRACK_STOCK 70u
#endif
volatile uint32_t mw_stock_reserve = MW_STOCK_RESERVE, /* per mille of a frame, or RESERVE_ADAPTIVE */
                  mw_track_stock = MW_TRACK_STOCK;     /* one sample track's share: (98.7 - 40.8 %) / 8 */
/* machine_registry.c: for the pattern that plays and the queued one, the most tracks that trig on one step and how
 * many trig at all */
unsigned modwerk_machine_pattern_trigs(uint8_t most[2], uint8_t tracks[2], uint16_t id[2]);
/* machine_registry.c: the current Part's module machines but track `skip`, each less `net`, never below 0 */
uint32_t modwerk_machine_frame_booked(unsigned skip, uint32_t net);
int modwerk_status_module_cost(uint32_t module, uint32_t *use, uint32_t *wake);
uint32_t modwerk_machine_rest_booked(void); /* machine_registry.c: the installed modules' cost at rest */
/* The set's measured stock figures take the compiled ones' place (frame-costs.json's `stock`, as pseudo module ids), so
 * a base whose stock gets cheaper gives modules more room with a new measurement and no new base. */
#define TRACK_STOCK_ID 0xfffffff1u
#define FRAME_LINE_ID 0xfffffff2u
#define RESERVE_STEP_ID 0xfffffff3u   /* + N, N = 0 to 8: the reserve for a bank whose busiest step trigs N tracks */
#define RESERVE_MARGIN_ID 0xfffffffcu
#define RESERVE_FLOOR_ID 0xfffffffdu
#define TRACK_PLAY_ID 0xfffffffeu
#define MEASURED_MARGIN_ID 0xffffffffu /* the margin on a pattern's own measured stock */
static uint32_t tuned(uint32_t id, uint32_t compiled)
{
    uint32_t value, unused;
    return modwerk_status_module_cost(id, &value, &unused) ? value : compiled;
}
static uint32_t frame_line(void)
{
    uint32_t line = tuned(FRAME_LINE_ID, 0u); /* a line of 0 would refuse every pick */
    return line ? line : mw_frame_line ? mw_frame_line : 1u;
}
static uint32_t pattern_reserve(unsigned most, unsigned tracks) /* a pattern's, by its busiest step and tracks that trig */
{
    if (mw_stock_reserve != RESERVE_ADAPTIVE) return mw_stock_reserve;
    unsigned n = most > 8u ? 8u : most, t = tracks > 8u ? 8u : tracks < n ? n : tracks;
    uint32_t r = tuned(RESERVE_STEP_ID + n, reserve_by_step[n]) + tuned(TRACK_PLAY_ID, TRACK_PLAY) * (t - n) +
        tuned(RESERVE_MARGIN_ID, RESERVE_MARGIN), floor = tuned(RESERVE_FLOOR_ID, RESERVE_FLOOR);
    return r > floor ? r : floor;
}
/* A pattern the unit has played four seconds on, with the trigs it has now, is judged by its own stock as measured
 * (the longest frame less what the Part's modules book) with the margin, when that is less than the ladder's, never under
 * the floor (modwerk-bd, twin 28: C03 with three Tape Echos played at 95.9 to 97.3 % while the ladder judged 108 and
 * refused a fourth). The ladder is samples on all eight tracks; a Part with empty slots plays lighter. Another pattern,
 * or the same one with other trigs, goes by the ladder until it has played. */
#define MEASURED_SAMPLE 25u /* what a sample track's render was worth to a machine's first instance there, per mille */
static uint32_t played_stock, played_shape = 0xffffffffu; /* that stock, and its pattern's busiest step << 4 | tracks */
static void note_stock(void)
{
    uint8_t most[2] = {0, 0}, tracks[2] = {0, 0}; uint16_t id[2];
    unsigned n = modwerk_machine_pattern_trigs(most, tracks, id);
    uint32_t modules = modwerk_machine_frame_booked(8u, MEASURED_SAMPLE) + effects_booked(16u) + modwerk_machine_rest_booked();
    played_stock = frame_played > modules ? frame_played - modules : 0u;
    played_shape = n && id[0] == played_pattern ? (uint32_t)most[0] << 4 | tracks[0] : 0xffffffffu;
}
/* `*measured` 1 when the figure is the pattern's own measured stock: a machine's first instance then nets what a sample
 * track's render was worth in it (MEASURED_SAMPLE), as on the measured figure, since that stock already holds the sample
 * its track played; the ladder's is a sample track's share (mw_track_stock). Twin 30: netting 7 off a measured stock
 * admitted a second Amiga that took C03 to 115.7 %. */
static uint32_t pattern_stock(unsigned p, unsigned most, unsigned tracks, unsigned id, int *measured) /* p 0: the pattern that plays */
{
    uint32_t v = pattern_reserve(most, tracks);
    *measured = 0;
    if (p || mw_stock_reserve != RESERVE_ADAPTIVE || id != played_pattern || played_shape != (most << 4 | tracks)) return v;
    uint32_t m = played_stock + tuned(MEASURED_MARGIN_ID, MEASURED_MARGIN), floor = tuned(RESERVE_FLOOR_ID, RESERVE_FLOOR);
    if (m < floor) m = floor;
    if (m >= v) return v;
    *measured = 1;
    return m;
}
/* The stock reserve; in *net (when given) what a machine's first instance nets against it. */
static uint32_t stock_reserve(uint32_t *net)
{
    uint8_t most[2] = {0, 0}, tracks[2] = {0, 0}; uint16_t id[2];
    unsigned patterns = modwerk_machine_pattern_trigs(most, tracks, id);
    uint32_t r = pattern_reserve(0, 0); int from_measured = 0;
    for (unsigned p = 0; p < patterns && p < 2u; ++p) {
        int m; uint32_t v = pattern_stock(p, most[p], tracks[p], id[p], &m);
        if (v > r || (!p && v == r)) r = v, from_measured = m;
    }
    if (net) *net = from_measured ? MEASURED_SAMPLE : tuned(TRACK_STOCK_ID, mw_track_stock);
    return r;
}
static uint32_t effect_cost(unsigned id, int first, int waking);
static int runs_elsewhere(unsigned slot, unsigned id);
/* The module effects the live slots run but slot `skip` (16: none), each by its `each` and the first of a module by its
 * `first` too. */
static uint32_t effects_booked(unsigned skip)
{
    uint32_t sum = 0;
    for (unsigned k = 0; k < 16u; ++k) {
        unsigned id = LIVE[k], first = 1;
        if (k == skip) continue;
        for (unsigned j = 0; j < k; ++j) if (j != skip && LIVE[j] == id) first = 0;
        sum += effect_cost(id, (int)first, 0);
    }
    return sum;
}
static uint32_t reserved(unsigned machine_skip, unsigned effect_skip, uint32_t *net_out)
{
    uint32_t net, r = stock_reserve(&net);
    if (net_out) *net_out = net;
    return r + modwerk_machine_rest_booked() + modwerk_machine_frame_booked(machine_skip, net) + effects_booked(effect_skip);
}
/* The predicted brake (owner, 22 November 2026): a pattern whose stock load, with the Part's modules and those at rest on
 * top (the reserve's own figure), passes the frame ceiling goes without only what it must: the Part's module machines,
 * dearest first (their tracks silent from the pattern's first frame, machine_registry.c's mw_hush), then its effects
 * that can bypass dry (an ev_frame_deadline subscriber, told `rest` from the same frame), dearest first, until it is
 * under the ceiling; no other effect is touched. The screen names what went. Each UI tick judges the pattern that plays and one queued in the bank, so it lifts
 * with the next pattern or Part, or a module gone. Else such a pattern ran at 130 % with about 4,400 renders dropped and
 * a click every two or three seconds (twin 25), and once stalled (twin 24); with its machines silent, its effects still
 * held it at 127 % (twin 27). */
#define HUSH_CEILING 1220u /* machine_registry.c's FRAME_CEILING, per mille */
/* machine_registry.c: the current Part's module machines, their tracks, what they book and their labels */
unsigned modwerk_machine_part_machines(uint8_t tracks[8], uint32_t cost[8], const char *label[8], uint32_t net);
volatile uint32_t mw_frame_hushes; /* for diagnostics: each pattern that began with modules gone (diag.c's `brake`, flagged) */
fx_set modwerk_machine_deadline_effects(void); /* machine_registry.c: effects that can bypass dry (ev_frame_deadline's rest) */
void modwerk_fxmap_name(unsigned id, char *out); /* fxmap.c: 16 bytes */
static unsigned hush_notice_left, hush_playing, hush_count;
static char hush_names[2][17];
static void hush_name(unsigned n, const char *name)
{
    if (n >= 2u) return;
    for (unsigned i = 0; i < 16u; ++i) {
        char c = name ? name[i] : 0;
        hush_names[n][i] = c >= 'a' && c <= 'z' ? (char)(c - 32) : c;
        if (!c) break;
    }
    hush_names[n][16] = 0;
}
/* What pattern `p` (its busiest step `most`, tracks that trig `tracks`) must go without: the machine tracks (bit t),
 * and in *fx the effects; `named` 1 writes the notice's names and count. */
static unsigned hush_pick(unsigned p, unsigned most, unsigned tracks, unsigned id, fx_set *fx, int named)
{
    uint8_t mt[8]; uint32_t mc[8]; const char *ml[8]; int measured;
    uint32_t fc[16], load = pattern_stock(p, most, tracks, id, &measured) + modwerk_machine_rest_booked();
    unsigned nm = modwerk_machine_part_machines(mt, mc, ml, measured ? MEASURED_SAMPLE : tuned(TRACK_STOCK_ID, mw_track_stock)), fid[16], nf = 0;
    for (unsigned k = 0; k < nm; ++k) load += mc[k];
    fx_set dry = modwerk_machine_deadline_effects();
    for (unsigned k = 0; k < 16u; ++k) { /* the live effects by module, each with its first and each */
        unsigned id = LIVE[k], j = 0;
        while (j < nf && fid[j] != id) ++j;
        uint32_t c = effect_cost(id, j == nf, 0);
        if (!c) continue;
        load += c;
        if (!fx_in(dry, id)) continue; /* runs whatever comes: it cannot bypass */
        if (j == nf) fid[nf] = id, fc[nf] = 0, ++nf;
        fc[j] += c;
    }
    unsigned hushed = 0, count = 0;
    for (unsigned i = 0; i < 8u; ++i) fx->w[i % MODWERK_FX_WORDS] = 0;
    while (load > HUSH_CEILING) {
        unsigned best = 16u, machine = 0; uint32_t most_cost = 0;
        for (unsigned k = 0; k < nm; ++k) if (mc[k] > most_cost) most_cost = mc[k], best = k, machine = 1;
        if (!machine) for (unsigned k = 0; k < nf; ++k) if (fc[k] > most_cost) most_cost = fc[k], best = k;
        if (best == 16u) break; /* nothing left that could go */
        load -= most_cost;
        if (machine) hushed |= mt[best], mc[best] = 0;
        else *fx = fx_with(*fx, fid[best]), fc[best] = 0;
        if (named) {
            char name[16];
            if (!machine) modwerk_fxmap_name(fid[best], name);
            hush_name(count, machine ? ml[best] : name);
        }
        ++count;
    }
    if (named) hush_count = count;
    return hushed;
}
int modwerk_machine_stopped(void);
/* machine_registry.c's brake_tick, each UI tick: mw_hush, and for the pattern that plays and one queued (`id`, 0xffff
 * none) the effects that bypass dry there. */
uint32_t modwerk_status_hush(fx_set fx[2], uint16_t id[2])
{
    uint8_t most[2] = {0, 0}, tracks[2] = {0, 0};
    id[0] = id[1] = 0xffffu, fx[0] = fx[1] = (fx_set){{0}};
    unsigned patterns = modwerk_machine_pattern_trigs(most, tracks, id);
    uint32_t hush = 0;
    for (unsigned p = 0; p < 2u; ++p) {
        if (p >= patterns || id[p] > 255u) { id[p] = 0xffffu; continue; }
        unsigned t = hush_pick(p, most[p], tracks[p], id[p], &fx[p], !p);
        if (t) hush |= ((uint32_t)id[p] << 8 | t) << (p ? 0u : 16u);
    }
    unsigned now = id[0] <= 255u && (hush >> 16 & 0xffu || fx_any(fx[0])) && !modwerk_machine_stopped();
    if (now && !hush_playing) hush_notice_left = 180u, mw_frame_hushes = mw_frame_hushes + 1u;
    hush_playing = now;
    return hush;
}
uint32_t modwerk_status_frame_load(void)
{
    uint32_t measured = measured_load(0), stock = reserved(8u, 16u, 0);
    return measured > stock ? measured : stock;
}
/* The memory after a module loads (owner, 11 October 2026): picked onto a track, or accepted over USB. A box with
 * each core's code memory and the module pool, used, for a second and a half; it takes no key, and a key closes it. */
extern volatile uint32_t dl_selection_completed, modwerk_boot_accepted;
static unsigned memory_left; /* ticks the box still shows */
/* DSP FULL and DSP MEMORY FULL, said with numbers (owner, 20 October 2026: testers took the bare popup for a bug): the
 * refused effect's core, its DSP time and code memory as admission counts them with what the effect would add, or its
 * buffer blocks. A snapshot at the refusal (manager.c's dl_refusal, build_core.py), for three seconds; a key closes it. */
extern volatile uint32_t dl_refusal[8];
static unsigned refused_left, refused_reason, refused_core, refused_machine, refused_elsewhere;
void modwerk_dsp_source_refusal(unsigned *core, uint32_t *add); /* dsp.c: the last machine voice refused for cycles */
static uint32_t refused[8], refused_booked, refused_words, refused_arena;
static uint32_t refused_allowed, refused_busy, refused_dsp, refused_dsp_add; /* CPU FULL: what fits, the Part's own load the cause, the pick's DSP core as booked and what it adds (per mille) */
static char refused_name[17];
static int budget_slot = -1; /* the slot the pick put a module on; -1: an accept over USB (memory only) */
/* Each core's code words before the pick: what it took is the change, so a second instance on the core or a module
 * another Part already holds takes +0% (one copy of the code per core), and a swap for a smaller one shows minus.
 * shortcut: a second pick within the box's 1.5 s counts from before the first, until the box closes. */
static uint32_t words_before[2];
/* The pick's CPU (owner, 17 November 2026: the box showed the DSP an effect took, not the CPU): the figure picks are judged
 * by, as it stood after the pick. */
static uint32_t pick_load;
#ifdef MODWERK_RESIDENT_ON_DEMAND
int mw_project_sidechain_notice(void);
static unsigned sidechain_notice_left;
#endif
static void memory_tick(void)
{
    if (hush_notice_left && open == CLOSED) --hush_notice_left;
#ifdef MODWERK_RESIDENT_ON_DEMAND
    if (open == CLOSED && transfer == T_NONE) {
        if (sidechain_notice_left) --sidechain_notice_left;
        else if (mw_project_sidechain_notice()) sidechain_notice_left = 180u;
    } else sidechain_notice_left = 0;
#endif
    static uint32_t completed, accepted;
    static uint8_t before[16];
    int over_usb = modwerk_boot_accepted != accepted, picked = 0;
    if (dl_selection_completed != completed) { /* a pick changes one slot; a Part change, usually many: no box then */
        unsigned changed = 0, module = 0, at = 0;
        for (unsigned i = 0; i < 16u; ++i) if (LIVE[i] != before[i]) ++changed, at = i, module |= (unsigned)fx_in(modwerk_fx_modules, LIVE[i]);
        if (changed == 1u && module) picked = 1, budget_slot = (int)at, pick_load = modwerk_status_frame_load();
    }
    if (over_usb && !picked) budget_slot = -1;
    if (dl_selection_completed != completed || over_usb) for (unsigned i = 0; i < 16u; ++i) before[i] = LIVE[i];
    completed = dl_selection_completed, accepted = modwerk_boot_accepted;
    if ((picked || over_usb) && (open == CLOSED || open == MEMORY)) open = MEMORY, memory_left = 90u;
    if (open == MEMORY && memory_left && !--memory_left) open = CLOSED;
    if (open == REFUSED && refused_left && !--refused_left) open = CLOSED;
    if (open != MEMORY) words_before[0] = dl_residency_words[0], words_before[1] = dl_residency_words[1];
}
/* MODULE COST (owner, 12 October 2026: "load per module"): each installed module effect, with what its instances
 * cost on each core as a share of that core's DSP budget, as the box and the STATUS page's DSP rows count (owner,
 * 14 October 2026: one denominator). The cores' meters see only their sum, so this is each module's figure times the
 * slots running it: a hardware figure, or 7/4 of an emulator claim (~). */
static struct modwerk_module_load modules[MODWERK_FX_IDS];
static unsigned modules_count(void) { return modwerk_dsp_module_loads(modules); }
/* MODULES (owner, 16 November 2026: modules switched on and off on the unit, at once): every installed module in
 * name order, ON or OFF at the right. UP and DOWN move, YES switches the module under the cursor (modset.c: unloaded
 * or loaded at once, and saved), NO closes. A module a track runs, or a unit that plays, is refused, and the page says
 * why in its last line; nothing changes then. The rows are read when the page opens, after each answer and once a
 * second, so a host's change shows too. */
#define SWITCH_ROWS 5u
struct switch_row { uint32_t id; char name[16]; uint8_t on; };
static struct switch_row switches[2u * RUNTIME_MODULES];
static unsigned switch_count, switch_cursor, switch_top;
static uint32_t switch_asked, switch_read_at, switch_said_until;
static uint8_t switch_waiting, switch_stale, switch_asked_on;
static const char *switch_said;
static int switch_before(const struct switch_row *a, const struct switch_row *b)
{
    for (unsigned i = 0; i < 16u; ++i) if (a->name[i] != b->name[i]) return (unsigned char)a->name[i] < (unsigned char)b->name[i];
    return a->id < b->id;
}
static void switches_read(void)
{
    static uint8_t page[4u + 24u * 13u];
    static struct switch_row row;
    uint32_t keep = switch_cursor < switch_count ? switches[switch_cursor].id : 0, lock;
    unsigned n = 0, got;
    switch_read_at = ticks;
    /* The shelf first, in one hold of the machine: it either stands still for all of it or is asked again. */
    lock = modwerk_machine_lock();
    for (unsigned first = 0; ; first += got) {
        unsigned bytes = modwerk_modset_off_list(page, first, MODSET_OFF_PAGE);
        if (!bytes) { modwerk_machine_unlock(lock); switch_stale = 1; return; }
        got = page[3];
        for (unsigned i = 0; i < got && n < RUNTIME_MODULES; ++i, ++n) {
            const uint8_t *e = page + 8u + MODSET_OFF_ENTRY * i;
            switches[n].id = (uint32_t)e[4] << 24 | (uint32_t)e[5] << 16 | (uint32_t)e[6] << 8 | e[7], switches[n].on = 0;
            for (unsigned c = 0; c < 16u; ++c) switches[n].name[c] = (char)e[8 + c];
        }
        if (got < MODSET_OFF_PAGE) break;
    }
    modwerk_machine_unlock(lock);
    for (unsigned first = 0; ; first += got) {
        lock = modwerk_machine_lock();
        got = (modwerk_runtime_list(page, first, 13u) - 4u) / 24u;
        modwerk_machine_unlock(lock);
        for (unsigned i = 0; i < got && n < 2u * RUNTIME_MODULES; ++i, ++n) {
            const uint8_t *e = page + 4u + 24u * i;
            switches[n].id = (uint32_t)e[4] << 24 | (uint32_t)e[5] << 16 | (uint32_t)e[6] << 8 | e[7], switches[n].on = 1;
            for (unsigned c = 0; c < 16u; ++c) switches[n].name[c] = (char)e[8 + c];
        }
        if (got < 13u) break;
    }
    for (unsigned i = 0; i < n; ++i) { /* capitals, as the font has no others, and a name for one without */
        char *t = switches[i].name;
        t[15] = 0;
        if (!t[0]) for (unsigned c = 0; c < 8u; ++c) t[c] = "UNNAMED"[c];
        for (unsigned c = 0; t[c]; ++c) if (t[c] >= 'a' && t[c] <= 'z') t[c] = (char)(t[c] - 32);
    }
    for (unsigned i = 1; i < n; ++i) { /* by name, so a row stays where it is when it is switched */
        row = switches[i];
        unsigned k = i;
        for (; k && switch_before(&row, &switches[k - 1u]); --k) switches[k] = switches[k - 1u];
        switches[k] = row;
    }
    switch_count = n, switch_stale = 0;
    for (unsigned i = 0; keep && i < n; ++i) if (switches[i].id == keep) switch_cursor = i;
    if (switch_cursor >= n) switch_cursor = n ? n - 1u : 0;
    if (switch_top > switch_cursor) switch_top = switch_cursor;
    if (switch_cursor >= switch_top + SWITCH_ROWS) switch_top = switch_cursor + 1u - SWITCH_ROWS;
}
/* What a refused switch says, in the page's last line for three seconds. */
static const char *switch_why(uint32_t result)
{
    if (result == MODSET_SWITCH_PLAYING) return "STOP PLAYBACK FIRST";
    if (result == MODSET_SWITCH_PARTIAL) return "RESTART FIRST";
    if (result == MODSET_SWITCH_SYNC) return "SYNC ON THE SITE FIRST";
    if (result == MODSET_SWITCH_FULL || result == MODSET_SWITCH_REFUSED + RUNTIME_FULL) return "NO ROOM FOR IT";
    if (result == MODSET_SWITCH_REFUSED + RUNTIME_IN_USE) return "IN USE ON A TRACK";
    if (result == MODSET_SWITCH_REFUSED + RUNTIME_MEMORY) return "NO MEMORY FOR IT";
    if (result == MODSET_SWITCH_REFUSED + RUNTIME_CYCLES) return "DSP FULL";
    if (result == MODSET_SWITCH_REFUSED + RUNTIME_CONFLICT) return "CLASHES WITH ANOTHER";
    if (result == MODSET_SWITCH_REFUSED + RUNTIME_FEATURE) return "RESTART, THEN RETRY";
    if (result == MODSET_SWITCH_REFUSED + RUNTIME_BUFFER) return "MOVE AN FX2 EFFECT";
    if (result == MODSET_SWITCH_BUSY || result == MODSET_SWITCH_REFUSED + RUNTIME_BUSY) return "BUSY: TRY AGAIN";
    return result >= MODSET_SWITCH_REFUSED ? "REFUSED" : 0; /* GONE: a host changed it, and the rows show how */
}
/* A module switched off that the project still names in another Part or bank (a track running it refuses the
 * switch): where, "USED IN C SAVED PART 2 T5", so a track that goes quiet later is no surprise (owner, 16 November
 * 2026). 0 when the project names it nowhere. Once a switch: it reads every bank's Parts. */
static void missing_on_start(void)
{
    on_count = on_next = 0, on_waiting = 0, on_said = 0;
    for (unsigned i = 0; i < missing[3] && i < MODWERK_MISSING_MAX; ++i) {
        uint32_t id = listed_module(i);
        unsigned k = 0;
        if (!missing_off[i]) continue;
        while (k < on_count && on_queue[k] != id) ++k; /* a module the project names under two handles: once */
        if (k == on_count) on_queue[on_count++] = id;
    }
}
static void missing_on_tick(void)
{
    if (!on_count) return;
    if (on_waiting) {
        uint32_t result = modwerk_modset_switch_result;
        if (result == MODSET_SWITCH_PENDING) return;
        on_waiting = 0;
        if (result != MODSET_SWITCHED && result != MODSET_SWITCH_GONE) { /* GONE: a host changed it meanwhile */
            on_said = switch_why(result), on_said_until = ticks + 180u, on_count = 0;
            return;
        }
    }
    if (on_next < on_count) { if (modwerk_modset_switch(on_queue[on_next], 1)) on_waiting = 1, ++on_next; return; }
    on_count = 0; /* all on: the list loses them at its next check */
}
static char used_text[32]; /* switches_page shortens it when the line is too narrow */
static const char *still_used(uint32_t id)
{
    char *text = used_text;
    fx_set used = modwerk_fxmap_used();
    for (unsigned k = 0; k < MODWERK_FX_IDS; ++k) {
        uint32_t module = 0;
        uint16_t layout;
        char name[16];
        unsigned bank = 0, part = 0, track = 0;
        if (!fx_in(used, k) || !modwerk_fxmap_describe(k, &module, &layout, name) || module != id) continue;
        uint8_t at[4] = {(uint8_t)modwerk_fxmap_where(k, &bank, &part, &track), 0, 0, 0};
        if (!at[0]) continue;
        at[1] = (uint8_t)bank, at[2] = (uint8_t)part, at[3] = (uint8_t)track;
        char *s = text;
        for (const char *t = "USED IN "; *t; ) *s++ = *t++;
        missing_where(s, at, 1);
        return text;
    }
    /* A machine: the project's machine map knows where (machine_registry.c); a Part of this bank naming it refuses the
     * switch, so this is another bank's. */
    unsigned bank = 0, part = 0, track = 0;
    uint8_t at[4] = {(uint8_t)modwerk_machine_where_module(id, &bank, &part, &track), 0, 0, 0};
    if (!at[0]) return 0;
    at[1] = (uint8_t)bank, at[2] = (uint8_t)part, at[3] = (uint8_t)track;
    char *s = used_text;
    for (const char *t = "USED IN "; *t; ) *s++ = *t++;
    missing_where(s, at, 1);
    return used_text;
}
static void switches_tick(void)
{
    if (open != SWITCHES) return;
    if (switch_waiting && modwerk_modset_switch_result != MODSET_SWITCH_PENDING) {
        switch_waiting = 0, switch_stale = 1;
        if (modwerk_modset_switch_result == MODSET_SWITCHED && !switch_asked_on) quiet_add(switch_asked);
        switch_said = modwerk_modset_switch_result == MODSET_SWITCHED && !switch_asked_on ? still_used(switch_asked)
                                                                                          : switch_why(modwerk_modset_switch_result);
        if (switch_said) switch_said_until = ticks + 180u;
    }
    if (switch_stale || ticks - switch_read_at >= 60u) switches_read();
}
#ifdef MODWERK_SETTINGS
/* SETTINGS lists modules. Open a row to browse its choices without changing the sound. */
#define SETTING_ROWS 5u
char modwerk_settings_label[] = "SETTINGS";
struct settings_cursor { unsigned row, top; };
static struct settings_cursor setting_module, setting_option, setting_field;
enum { SETTING_ROOT, SETTING_MODULE, SETTING_FIELD };
static int choosing_setting;
static unsigned settings_field_index(void)
{
    return choosing_setting == SETTING_FIELD ? setting_field.row : MODWERK_SETTING_FIELDS;
}
static uint32_t setting_epoch;
static void settings_move(struct settings_cursor *c, unsigned count, int code)
{
    if (c->row >= count) c->row = count ? count - 1u : 0;
    if (code == UP && c->row) --c->row;
    if (code == DOWN && c->row + 1u < count) ++c->row;
    if (c->top > c->row) c->top = c->row;
    if (c->row >= c->top + SETTING_ROWS) c->top = c->row + 1u - SETTING_ROWS;
}
void modwerk_settings_menu(int unused)
{
    (void)unused;
    if (!menu_open()) return;
    open = SETTINGS;
    setting_module = (struct settings_cursor){0, 0};
    choosing_setting = 0;
    close_menu = 1;
}
static void settings_key(int code)
{
    struct modwerk_setting_view view;
    if (choosing_setting) {
        if (!modwerk_settings_field(setting_module.row, settings_field_index(), &view) || view.epoch != setting_epoch) {
            choosing_setting = SETTING_ROOT;
            return;
        }
        if (code == NO) {
            choosing_setting = choosing_setting == SETTING_FIELD ? SETTING_MODULE : SETTING_ROOT;
            return;
        }
        struct settings_cursor *cursor = view.fields ? &setting_field : &setting_option;
        settings_move(cursor, view.count, code);
        if (code == YES && view.fields) {
            if (modwerk_settings_field(setting_module.row, setting_field.row, &view) && view.epoch == setting_epoch) {
                choosing_setting = SETTING_FIELD;
                setting_option = (struct settings_cursor){view.active, 0};
            }
        } else if (code == YES) {
            modwerk_settings_choose(setting_module.row, setting_epoch, settings_field_index(), setting_option.row);
        }
        return;
    }
    settings_move(&setting_module, modwerk_settings_count(), code);
    if (code == YES && modwerk_settings_read(setting_module.row, &view)) {
        choosing_setting = SETTING_MODULE;
        setting_field = (struct settings_cursor){0, 0};
        setting_epoch = view.epoch;
        setting_option = (struct settings_cursor){view.active, 0};
        settings_move(&setting_option, view.count, 0);
    }
}
#endif
void modwerk_switches_menu(int unused)
{
    (void)unused;
    if (!menu_open()) return;
    open = SWITCHES, switch_cursor = switch_top = 0, switch_said = 0, close_menu = 1;
    switches_read();
}
volatile uint32_t modwerk_status_key_at; /* modwerk_runtime_ticks at the last key or knob: dsp.c's compaction waits for quiet */
/* The pages never hold the Octatrack's controls (owner, 15 October 2026: the page ate PLAY and STOP): PLAY, STOP and
 * REC always reach stock and the page stays, so the load can be watched while playing. NO (and YES on the read-only
 * pages) closes a page, CUE + PROJ toggles the status page, UP and DOWN scroll the lists; any other key or knob closes
 * the page and goes on to stock, so nothing changes unseen behind it. Only a running self-test keeps the panel. */
#define STOP 0x27
#define PLAY 0x28
#define REC 0x29
/* modset.c: the restore's notice waits while one of these shows, since it would show beneath it (owner's MKII, 30 October
 * 2026: MISSING hid MINI VERB LEFT OUT until it timed out). */
int modwerk_status_dialog(void);
int modwerk_status_dialog(void) { return open != CLOSED || transfer != T_NONE; }
int modwerk_status_key(int code, int pressed)
{
    static int cue;
    if (pressed) modwerk_status_key_at = modwerk_runtime_ticks;
    if (transfer_key(code, pressed)) return 1; /* a base update holds the panel */
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
#ifdef MODWERK_SETTINGS
    if (open == SETTINGS && (code == UP || code == DOWN || code == YES || (code == NO && choosing_setting))) {
        settings_key(code);
        taken = code;
        return 1;
    }
#endif
    if (open == SWITCHES && (code == UP || code == DOWN || code == YES)) {
        if (code == UP && switch_cursor) --switch_cursor;
        if (code == DOWN && switch_cursor + 1u < switch_count) ++switch_cursor;
        if (switch_top > switch_cursor) switch_top = switch_cursor;
        if (switch_cursor >= switch_top + SWITCH_ROWS) switch_top = switch_cursor + 1u - SWITCH_ROWS;
        if (code == YES && switch_cursor < switch_count && !switch_waiting &&
            modwerk_modset_switch(switches[switch_cursor].id, !switches[switch_cursor].on))
            switch_waiting = 1, switch_asked = switches[switch_cursor].id, switch_asked_on = (uint8_t)!switches[switch_cursor].on, switch_said = 0;
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
    if (open == MISSING && code == YES && (on_count || missing_offs)) { /* switch on what is off; NO closes */
        if (!on_count) missing_on_start();
        taken = code;
        return 1;
    }
    int closes = code == NO || code == YES; /* the popup after a pick: YES only closes it (owner, 14 October 2026) */
    open = CLOSED, on_said = 0; /* a refusal MISSING said is not said again when it next opens */
    if (!closes) return 0; /* any other key closes the page and goes on to stock */
    taken = code;
    return 1;
}
int modwerk_status_enc(int encoder, int delta)
{
    (void)encoder, (void)delta;
    modwerk_status_key_at = modwerk_runtime_ticks; /* turning a knob counts as activity too (dsp.c's compaction) */
    if (T_LOCKS(transfer)) return 1; /* a base update holds the panel */
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
#ifndef MODWERK_HOST
static uint32_t surface[7];          /* only the device build draws through stock's text call */
#endif
#ifdef MODWERK_HOST
/* The host has no stock font: its own text calls, so the transfer screens can be drawn and checked there. */
void host_draw_text(unsigned char *frame, int x, int top, const char *t);
int host_text_width(const char *t);
static unsigned char *host_frame;
static void label(unsigned x, unsigned top, const char *t) { host_draw_text(host_frame, (int)x, (int)top, t); }
#else
/* Text whose capitals' top row is `top` (the text call counts y up from the bottom). */
static void label(unsigned x, unsigned top, const char *t) { DRAW_TEXT(FONT, surface, (int)x, 59 - (int)top, -1, t); }
#endif
static void percent(unsigned x, unsigned top, uint32_t permille)
{
    char t[8], *s = number(t, (permille + 5u) / 10u);
    *s++ = '%', *s = 0;
    label(x, top, t);
}
static uint32_t share(uint32_t part, uint32_t whole) { return whole ? (part > whole ? 1000u : part * 1000u / whole) : 0; }
#ifdef MODWERK_HOST
#define TEXT_WIDTH(font, limit, t) host_text_width(t)
#else
#define TEXT_WIDTH ((int (*)(uint32_t, int, const char *))0x40012f30u) /* (font, limit, str): its width in px */
#endif
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
#ifdef MODWERK_HOST
    host_frame = frame;
#else
    for (unsigned i = 0; i < 7u; ++i) surface[i] = ((const volatile uint32_t *)SURFACE)[i];
    surface[3] = (uint32_t)(uintptr_t)frame;
#endif
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
        if (missing_off[missing_top + i]) { /* "E-VERB (OFF)": switched off on MODULES */
            unsigned c = 0;
            if (!name[0]) for (const char *t = "MODULE"; *t; ) name[c++] = *t++;
            else while (c < 16u && name[c]) ++c;
            while (c > 10u) name[--c] = 0; /* room for the mark */
            name[c] = 0;
            char marked[24], *s = marked;
            for (const char *t = name; *t; ) *s++ = *t++;
            for (const char *t = " (OFF)"; *t; ) *s++ = *t++;
            *s = 0;
            label(X0 + 6u, Y0 + 14u + 18u * i, marked);
        } else label(X0 + 6u, Y0 + 14u + 18u * i, name[0] ? name : "UNNAMED MODULE");
        missing_where(where, missing_at[missing_top + i], 0);
        if (TEXT_WIDTH(FONT, -1, where) > (int)(X1 - 14u - (X0 + 10u))) missing_where(where, missing_at[missing_top + i], 1);
        label(X0 + 10u, Y0 + 22u + 18u * i, where);
    }
    if (missing_top) arrow(frame, X1 - 10u, Y0 + 14u, 1);
    if (missing_top + MISSING_ROWS < n) arrow(frame, X1 - 10u, Y0 + 14u + 9u * (ROWS - 1u) + 3u, 0);
    if (on_count || (on_said && (int32_t)(on_said_until - ticks) > 0)) { /* switching on, or why it stopped */
        label(X0 + 4u, Y1 - 8u, on_count ? "SWITCHING ON..." : on_said);
        button(frame, X1 - 24u, Y1 - 10u, "NO");
        return;
    }
    if (missing_offs) { /* YES switches on what is off */
        button(frame, X0 + 4u, Y1 - 10u, "YES"), label(X0 + 34u, Y1 - 8u, "SWITCH ON");
        button(frame, X1 - 24u, Y1 - 10u, "NO");
        return;
    }
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
    dialog(frame, "MODULE COST");
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
/* MODULES: five rows, the cursor's with a pointer; the last line is why a switch was refused, else the keys. */
static void switches_page(unsigned char *frame)
{
    dialog(frame, "MODULES");
    if (!switch_count) label(X0 + 6u, Y0 + 17u, "NO MODULES INSTALLED.");
    for (unsigned i = 0; i < SWITCH_ROWS && switch_top + i < switch_count; ++i) {
        const struct switch_row *m = &switches[switch_top + i];
        unsigned top = Y0 + 13u + 8u * i, c = 0;
        char name[16];
        for (; c < 15u && m->name[c]; ++c) name[c] = m->name[c];
        name[c] = 0;
        while (c && TEXT_WIDTH(FONT, -1, name) > 70) name[--c] = 0; /* clear of the state */
        if (switch_top + i == switch_cursor) for (unsigned k = 0; k < 3u; ++k) fill(frame, X0 + 3u + k, top + k, X0 + 3u + k, top + 4u - k, 1);
        label(X0 + 9u, top, name);
        const char *state = switch_waiting && m->id == switch_asked ? "..." : m->on ? "ON" : "OFF";
        label(X1 - 14u - (unsigned)TEXT_WIDTH(FONT, -1, state), top, state);
    }
    if (switch_top) arrow(frame, X1 - 10u, Y0 + 14u, 1);
    if (switch_top + SWITCH_ROWS < switch_count) arrow(frame, X1 - 10u, Y0 + 14u + 8u * (SWITCH_ROWS - 1u), 0);
    if (switch_said == used_text && TEXT_WIDTH(FONT, -1, used_text) > (int)(X1 - X0 - 8u)) switch_said = "USED IN ANOTHER PART";
    if (switch_said && (int32_t)(switch_said_until - ticks) > 0) { label(X0 + 4u, Y1 - 8u, switch_said); return; }
    if (switch_count) button(frame, X0 + 4u, Y1 - 10u, "YES"), label(X0 + 34u, Y1 - 8u, "ON/OFF");
    button(frame, X1 - 24u, Y1 - 10u, "NO");
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
static void canvas(unsigned char *frame);
static void memory_box(unsigned char *frame)
{
    static const char *const names[3] = {"T1-4", "T5-8", "POOL"};
    uint32_t largest, pool = RUNTIME_POOL_BYTES - modwerk_runtime_free(&largest);
    const uint32_t used[3] = {share(dl_residency_words[1], modwerk_dsp_arena[1]), share(dl_residency_words[0], modwerk_dsp_arena[0]),
                              share(pool, RUNTIME_POOL_BYTES)};
    canvas(frame);
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
        /* MODS: what modules use of their allowance (the line less the stock reserve), as CPU FULL gives it */
        const uint32_t line = frame_line(), reserve = stock_reserve(0), allowed = line > reserve ? line - reserve : 1u;
        label(23u, 42u, "MODS"), bar(frame, 45u, 42u, 40, 6, share(pick_load > reserve ? pick_load - reserve : 0u, allowed), 0), percent(89u, 42u, allowed);
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
    refused_machine = 0;
    /* No delay memory for an effect that reads none: the plan stopped at another slot (every pick plans all sixteen). */
    refused_elsewhere = refused[0] == 3u && !modwerk_dsp_reads_buffer(id);
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
/* machine_registry.c's claim(): the track's machine voice did not fit its core. The box as an effect's DSP FULL has it,
 * on "Tn SRC", with what the voice asks for; the track renders stock's silent source until room is made. Not over a
 * page, and not twice for the same track while it shows (a Part change claims many tracks). */
void modwerk_status_machine_refused(unsigned track, const char *label)
{
    if ((open != CLOSED && open != MEMORY) || track > 7u) return; /* a page or a box already shows: not over it */
    unsigned c; uint32_t add;
    modwerk_dsp_source_refusal(&c, &add);
    for (unsigned i = 0; i < 8u; ++i) refused[i] = 0;
    refused[0] = 1u, refused[1] = track, refused[4] = add;
    refused_machine = 1u, refused_reason = 3u, refused_core = c, refused_booked = modwerk_dsp_booked(c);
    refused_words = dl_residency_words[c];
    refused_arena = c ? modwerk_status[ARENA] >> 16 : modwerk_status[ARENA] & 0xffffu;
    for (unsigned i = 0; i < sizeof refused_name; ++i) refused_name[i] = 0;
    for (unsigned i = 0; label && i < 16u && label[i]; ++i) refused_name[i] = label[i] >= 'a' && label[i] <= 'z' ? (char)(label[i] - 32) : label[i];
    refused_name[16] = 0;
    open = REFUSED, refused_left = 180u;
}
/* machine_registry.c's CPU budget: the track's machine would take the Part past what the frame interrupt carries. The
 * same box, as CPU FULL: what the Part's machines book and what this one adds, per mille of the allowance. */
/* CPU FULL, as the DSP FULL box (owner, 22 November 2026): what the pick needs; a DSP row for a module that also runs on
 * the DSP; a CPU row, solid what the unit takes now and shaded what the pick adds, both of what fits (`whole`), its
 * figure the now, never past 100 %; for a module only on the ColdFire, what makes room, or PART IS BUSY (`busy`) when
 * the Part's own sound is why. `used`, `add`, `whole` in the same unit; `dsp` the pick's DSP cycles, 0 none. */
enum { WHY_CHANGE, WHY_PART, WHY_UNUSED }; /* CPU FULL's last line (`busy`) */
static void cpu_refusal_box(unsigned slot, unsigned machine, const char *label, uint32_t used, uint32_t add, uint32_t whole, unsigned busy, uint32_t dsp)
{
    if ((open != CLOSED && open != MEMORY) || slot >= (machine ? 8u : 16u)) return;
    for (unsigned i = 0; i < 8u; ++i) refused[i] = 0;
    refused[0] = 4u, refused[1] = slot, refused[4] = add, refused_booked = used;
    refused_allowed = whole ? whole : 1u, refused_busy = busy;
    unsigned c = (slot & 7u) < 4u ? 1u : 0u; /* the core tracks 1-4 run on */
    const uint32_t dsp_allowance = c ? MODWERK_DSP_ALLOWANCE1 : MODWERK_DSP_ALLOWANCE0;
    refused_dsp = dsp ? modwerk_dsp_booked(c) : 0u, refused_dsp_add = dsp ? dsp * 1000u / dsp_allowance : 0u;
    refused_machine = machine, refused_reason = 4u;
    for (unsigned i = 0; i < sizeof refused_name; ++i) refused_name[i] = 0;
    for (unsigned i = 0; label && i < 16u && label[i]; ++i) refused_name[i] = label[i] >= 'a' && label[i] <= 'z' ? (char)(label[i] - 32) : label[i];
    open = REFUSED, refused_left = 180u;
}
/* machine_registry.c's per-Part price allowance, per mille of a frame. */
void modwerk_status_cpu_refused(unsigned track, const char *label, uint32_t booked, uint32_t add, uint32_t allowed)
{
    cpu_refusal_box(track, 1u, label, booked, add, allowed, 0, 0);
}
uint32_t modwerk_status_cpu_recent(void) { return recent_mean(); }
extern volatile uint32_t mw_cpu_refusals, mw_cpu_refusal_tracks, mw_wake_mille; /* machine_registry.c */
/* MWMS v2's frame cost table (loader.c, set_package.h): what each measured module adds to the frame interrupt, per mille
 * of a frame, on each further track or slot it takes (its `each`) and on top for the first of the Part (its `first`
 * less `each`, in the wake field), as the site measured it
 * on a unit (sdk/machines/octatrack/frame-costs.json), and installed on no track or slot (its `rest`, which a module that
 * rests keeps near 0): what each added to the longest frame, which is more than it adds
 * to the mean (Amiga on an empty track, 22 November 2026: +26.7 against +20). Each is judged on top of the kept figure
 * as if it fell on the longest frame, which over-counts a little with several: the safe side. Kept in battery RAM through a power cycle; each v2 set replaces it.
 * A module it does not list: a machine is charged by its descriptor (machine_registry.c), an effect nothing, and either
 * mw_wake_mille when it wakes from resting. */
#define EC_MAGIC 0x4d574552u /* "MWER": MWEC had no rest */
#define EC_ROOM 128u         /* set_package.h's RUNTIME_SET_COSTS */
struct frame_costs { uint32_t magic, count, entry[EC_ROOM][2]; uint16_t rest[EC_ROOM]; uint32_t sum; };
#ifdef MODWERK_HOST
struct frame_costs modwerk_test_costs;
#define COSTS (&modwerk_test_costs)
#else
#define COSTS ((volatile struct frame_costs *)0x100f9200u) /* battery-ram.json */
typedef char frame_costs_fit[sizeof(struct frame_costs) <= 0x50cu ? 1 : -1]; /* the range battery-ram.json gives it */
#endif
static uint32_t sum_of(const volatile uint32_t *entry, const volatile uint16_t *rest, unsigned n) /* entry: n pairs */
{
    uint32_t sum = 0x5a17u + n;
    for (unsigned i = 0; i < n; ++i) sum = sum * 31u + entry[2u * i] * 7u + entry[2u * i + 1u] + rest[i] * 3u;
    return sum;
}
static uint32_t costs_sum(unsigned n) { return sum_of(&COSTS->entry[0][0], COSTS->rest, n); }
static uint32_t costs_be32(const uint8_t *p) { return (uint32_t)p[0] << 24 | (uint32_t)p[1] << 16 | (uint32_t)p[2] << 8 | p[3]; }
/* loader.c, engine task, after set_package.h checked every entry: torn while it writes, so a read meanwhile finds none. */
void modwerk_machine_frame_costs(const uint8_t *table, unsigned n)
{
    if (n > EC_ROOM) return;
    COSTS->magic = 0;
    for (unsigned i = 0; i < n; ++i, table += 12u) /* set_package.h RUNTIME_SET_COST_BYTES */
        COSTS->entry[i][0] = costs_be32(table), COSTS->entry[i][1] = costs_be32(table + 4u), COSTS->rest[i] = (uint16_t)(table[8] << 8 | table[9]);
    COSTS->count = n, COSTS->sum = costs_sum(n), COSTS->magic = EC_MAGIC;
}
/* The table checked and copied into RAM. Every UI tick looks up each installed module (hush_pick), and checking the
 * whole table in battery RAM on each lookup cost about 60 µs a tick per installed module (owner's MKII, 0.8.1 twin,
 * 23 November 2026: 16 unused modules, 462 to 1,412 µs a tick). Only the header is read on each lookup: a write (magic
 * 0, then a new sum) or a torn table changes it, and the copy is then checked again. */
static struct { uint32_t magic, count, sum; int ok; uint32_t entry[EC_ROOM][2]; uint16_t rest[EC_ROOM]; } costs_copy;
static int costs_valid(void)
{
    uint32_t magic = COSTS->magic, n = COSTS->count, sum = COSTS->sum;
    if (magic == costs_copy.magic && n == costs_copy.count && sum == costs_copy.sum) return costs_copy.ok;
    int ok = magic == EC_MAGIC && n <= EC_ROOM;
    if (ok) {
        for (unsigned i = 0; i < n; ++i)
            costs_copy.entry[i][0] = COSTS->entry[i][0], costs_copy.entry[i][1] = COSTS->entry[i][1], costs_copy.rest[i] = COSTS->rest[i];
        /* a write that began or ended during the copy changes the header: not this copy, and the next lookup copies again */
        ok = sum_of(&costs_copy.entry[0][0], costs_copy.rest, n) == sum && COSTS->magic == magic && COSTS->sum == sum;
    }
    costs_copy.magic = magic, costs_copy.count = n, costs_copy.sum = sum, costs_copy.ok = ok;
    return ok;
}
/* 1 with the module's costs when the table lists it (`module`: its package id). */
static int cost_row(uint32_t module)
{
    if (!costs_valid()) return -1;
    for (unsigned i = 0; i < costs_copy.count; ++i) if (costs_copy.entry[i][0] == module) return (int)i;
    return -1;
}
int modwerk_status_module_cost(uint32_t module, uint32_t *use, uint32_t *wake)
{
    int i = cost_row(module);
    if (i < 0) return 0;
    *use = costs_copy.entry[i][1] >> 16, *wake = costs_copy.entry[i][1] & 0xffffu;
    return 1;
}
/* What the module adds installed on no track or slot, per mille; 0 when the table does not list it. */
uint32_t modwerk_status_module_rest(uint32_t module)
{
    int i = cost_row(module);
    return i < 0 ? 0u : costs_copy.rest[i];
}
/* Every module pick, a machine's (machine_registry.c) or an effect's (below): 1 when the longest frame the unit would
 * play, with the pick's `add` on top and what the one it replaces took (`gone`) off, reaches mw_frame_line; the pick is
 * then not made and the box says so. Per mille of a frame. Stock's machines and effects and NONE are never judged, so a
 * busy unit can always be made lighter. The box gives both in percent of the line, as the pick box's CPU bar does. */
#define NEAR_FREE 20u /* 2 %: Mini Verb's first 1.5, E-Verb's 0.7, Vibrato's 0 */
unsigned modwerk_machine_trigging(void); /* machine_registry.c: the tracks that trig in the pattern that plays */
int modwerk_status_pick_busy(unsigned slot, unsigned machine, const char *label, uint32_t add, uint32_t gone, uint32_t dsp)
{
    /* A pick is not refused for load it does not add (owner, 22 November 2026): one adding at most NEAR_FREE is always
     * made. shortcut: one threshold for every pick; per module from the table if one ever reads wrong. */
    if (add <= NEAR_FREE) return 0;
    unsigned further = machine == 2u; /* machine_registry.c: a further instance of a machine the Part runs */
    machine = machine != 0u;
    /* A further instance on a track that trigs brings its own trig starts: about 2.5 % over its each (a second Amiga on
     * C03 added 4.3, 5.7 and 7.4 against its each of 4, twins 27, 30 and 29). */
    if (machine && further && slot < 8u && modwerk_machine_trigging() >> slot & 1u) add += MEASURED_SAMPLE;
    uint32_t measured = measured_load(gone) + add, line = frame_line();
    /* A machine's first instance on a track that plays a sample takes that render's place in the measured frame too:
     * 2.5 %, measured (twin 27, C03's T1: Amiga added 24.1 against its curve's 26.6 on an empty track), a further one
     * nothing (the second added 4.3 against its each of 4; a machine's own trig starts cost about the sample's). The
     * reserve's 7 % is the stacked ladder's, measured there. shortcut: one figure for every machine. */
    if (machine && !further && !gone && slot < 8u && modwerk_machine_trigging() >> slot & 1u) measured = measured > MEASURED_SAMPLE ? measured - MEASURED_SAMPLE : 0u;
    uint32_t sample, base = reserved(machine ? slot : 8u, machine ? 16u : slot, &sample);
    uint32_t net = !machine || further ? add : add > sample ? add - sample : 0u; /* a first machine in a sample's place */
    uint32_t stock = base + net, load = measured > stock ? measured : stock;
    if (load < line) return 0;
    uint32_t before = load > add ? load - add : 0u, rest = modwerk_machine_rest_booked();
    mw_cpu_refusals = mw_cpu_refusals + 1u, mw_cpu_refusal_tracks |= 1u << (slot & 7u);
    uint32_t reserve = stock_reserve(0), modules = stock - net - reserve; /* the Part's modules but this pick, and at rest */
    /* Why, in the box: modules installed and used nowhere, when their cost at rest is more than the pick's and what
     * leaves no room; the Part's own sound; else the Part's modules, one of which to change. */
    unsigned why = rest > add && load - rest < line ? WHY_UNUSED : before > reserve + modules ? WHY_PART : WHY_CHANGE;
    cpu_refusal_box(slot, machine, label, before, add, line, why, dsp);
    return 1;
}
/* selection.c's guard (build_core.py's edit), before stock writes an FX pick: 1 when the pick asks for a module's
 * effect (`id`, on slot 0-15: FX1 T1-T8, then FX2; `old`: the slot's effect before) the unit has no room for, and the
 * pick is then not made. A module effect's control code, hooks and ColdFire work run in the frame interrupt where the
 * frame guard cannot drop them, so they push it onto the renders (owner's MKII, 22 November 2026: one Tape Echo on a
 * Part at 50.7 % took it to 62.1 % and 165 renders dropped in 11 s). The box names the slot as an effect's ("Tn FXn"). */
void modwerk_fxmap_name(unsigned id, char *out); /* fxmap.c: 16 bytes */
int modwerk_machine_effect_resting(unsigned id);  /* machine_registry.c: effect modules that rest */
void modwerk_machine_effect_wake(unsigned id);
/* What one more slot of the module effect at handle `id` adds, per mille: the table's `each`, and its `first` extra when
 * no other slot runs it; a module the table does not list, nothing, but mw_wake_mille when it wakes from resting. */
static uint32_t effect_cost(unsigned id, int first, int waking)
{
    uint32_t module, each, extra; uint16_t layout; char name[16];
    if (id >= MODWERK_FX_IDS || !fx_in(modwerk_fx_modules, id) || !modwerk_fxmap_describe(id, &module, &layout, name)) return 0;
    if (modwerk_status_module_cost(module, &each, &extra)) return each + (first ? extra : 0u);
    return waking ? mw_wake_mille : 0u;
}
static int runs_elsewhere(unsigned slot, unsigned id)
{
    for (unsigned k = 0; k < 16u; ++k) if (k != slot && LIVE[k] == id) return 1;
    return 0;
}
int modwerk_status_effect_busy(unsigned slot, unsigned id, unsigned old)
{
    uint32_t gone = slot < 16u && old != id ? effect_cost(old, !runs_elsewhere(slot, old), 0) : 0u;
    if (slot > 15u || !fx_in(modwerk_fx_modules, id)) { if (gone) modwerk_status_cpu_left(gone); return 0; }
    /* A resting effect module brings its ColdFire hooks back into the frame: judged with them on top, then woken
     * before stock writes the pick, so its first frame on the slot has its detours. */
    int waking = modwerk_machine_effect_resting(id);
    uint32_t add = old != id ? effect_cost(id, !runs_elsewhere(slot, id), waking) : 0u;
    char name[16];
    modwerk_fxmap_name(id, name);
    extern struct dl_package dl_catalog[MODWERK_FX_IDS];
    if (modwerk_status_pick_busy(slot, 0u, name, add, gone, id < MODWERK_FX_IDS ? dl_catalog[id].cycles : 0u)) return 1;
    if (waking) modwerk_machine_effect_wake(id);
    /* shortcut: counted when the guard passes the pick, before the DSP places it; a pick the DSP then refuses stays
     * counted until the unit has played four seconds. Count at the DSP's commit if that ever misleads a pick. */
    if (add) modwerk_status_cpu_entered(add);
    if (gone) modwerk_status_cpu_left(gone);
    return 0;
}
static void refused_box(unsigned char *frame)
{
    canvas(frame);
    fill(frame, 18u, 12u, 109u, 50u, 0);
    outline(frame, 18u, 12u, 109u, 50u);
    unsigned slot = refused[1], c = refused_core;
    char where[8] = {'T', (char)('1' + (slot & 7u)), ' ', 'F', 'X', (char)(slot < 8u ? '1' : '2'), 0};
    if (refused_machine) where[3] = 'S', where[4] = 'R', where[5] = 'C'; /* a machine's voice, not an effect slot */
    const char *title = refused[0] == 3u ? "NO ROOM" : refused_reason == 4u ? "CPU FULL" : refused_reason == 3u ? "DSP FULL" : "DSP MEMORY FULL";
    if (TEXT_WIDTH(FONT, -1, title) + TEXT_WIDTH(FONT, -1, where) + 6 > 82) title += 4; /* "MEMORY FULL": clear of the slot */
    label(23u, 15u, title), label((unsigned)(105 - TEXT_WIDTH(FONT, -1, where)), 15u, where);
    fill(frame, 18u, 22u, 109u, 22u, 1);
    char need[32], *e = need;
    for (const char *t = refused_name[0] ? refused_name : "THIS EFFECT"; *t && e < need + 16; ) *e++ = *t++;
    const uint32_t allowance = c ? MODWERK_DSP_ALLOWANCE1 : MODWERK_DSP_ALLOWANCE0;
    if (refused[0] == 3u && refused_elsewhere) { /* not this effect's doing, and no track of these four need be at fault */
        label(23u, 26u, "A MODULE EFFECT");
        label(23u, 34u, "IS IN THE WAY:");
        label(23u, 42u, "REMOVE + RE-ADD");
        return;
    }
    if (refused[0] == 3u) { /* a Y buffer: the slot kind's blocks on the core that this effect may take, all taken */
        /* In the player's words: the other FX on these four tracks hold the delay memory (refused[6] of refused[7]
         * blocks; fewer than all when this effect may not take the free one: Air Chorus and BBD stay off block 3). */
        *e = 0, label(23u, 26u, need);
        char line[24] = "FX2 ON T1-4 FULL";
        line[2] = slot < 8u ? '1' : '2';
        if (!c) line[8] = '5', line[10] = '8';
        label(23u, 34u, line);
        label(23u, 42u, "CHANGE ONE FIRST");
        return;
    }
    /* DSP: what admission books on the core now, and what the effect adds (its cycles less the slot's old effect's);
     * MEM: the core's code words, and the effect's when its code is not on the core yet. Past 100 % is why. Only the
     * bar that refused it carries the effect: the core keeps other Parts' code loaded until it needs the room, so its
     * words plus the effect's can pass 100 % on a DSP FULL that memory never refused (owner's MKII, 20 October 2026). */
    if (refused_reason == 4u) { /* the CPU budget: one bar, and what makes room */
        const char *t = " NEEDS ";
        while (*t) *e++ = *t++;
        *e++ = '+', e = number(e, (refused[4] * 1000u / refused_allowed + 5u) / 10u), *e++ = '%', *e = 0;
        label(23u, 26u, need);
        const uint32_t now = refused_booked * 1000u / refused_allowed, cpu = now < 1000u ? now : 1000u;
        const uint32_t part = refused[4] * 1000u / refused_allowed, y = refused_dsp_add ? 42u : 34u;
        if (refused_dsp_add) /* as DSP FULL draws its DSP row */
            label(23u, 34u, "DSP"), share_bar(frame, 45u, 34u, 40, 6, refused_dsp + refused_dsp_add, refused_dsp_add), percent(89u, 34u, refused_dsp + refused_dsp_add);
        label(23u, y, "CPU"), share_bar(frame, 45u, y, 40, 6, cpu + part, part), percent(89u, y, cpu);
        if (!refused_dsp_add) label(23u, 42u, refused_busy == WHY_UNUSED ? "UNUSED MODULES" : refused_busy == WHY_PART ? "PART IS BUSY" : "CHANGE ONE FIRST");
        return;
    }
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
static void canvas(unsigned char *frame)
{
#ifdef MODWERK_HOST
    host_frame = frame;
#else
    for (unsigned i = 0; i < 7u; ++i) surface[i] = ((const volatile uint32_t *)SURFACE)[i];
    surface[3] = (uint32_t)(uintptr_t)frame;
#endif
}
static void centred(unsigned top, const char *t) { label((unsigned)(64 - TEXT_WIDTH(FONT, -1, t) / 2), top, t); }
static void invert(unsigned char *frame, unsigned x0, unsigned y0, unsigned x1, unsigned y1)
{
    for (unsigned x = x0; x <= x1 && x < 128u; ++x)
        for (unsigned y = y0; y <= y1 && y < 64u; ++y) {
            unsigned bit = 63u - y;
            frame[x * 8u + (bit >> 3)] ^= (unsigned char)(0x80u >> (bit & 7u));
        }
}
/* A bar to read from across the room: a frame, a pixel of air, then the fill. `running`: no figure to show yet, so
 * stripes that move, and the bar never looks hung. */
static void wide_bar(unsigned char *frame, unsigned x, unsigned y, unsigned w, unsigned h, uint32_t permille, int running)
{
    outline(frame, x, y, x + w - 1u, y + h - 1u);
    unsigned x0 = x + 2u, x1 = x + w - 3u, y0 = y + 2u, y1 = y + h - 3u;
    if (running) {
        for (unsigned px = x0; px <= x1; ++px)
            for (unsigned py = y0; py <= y1; ++py) if (((px + py - (transfer_ticks >> 2)) & 7u) < 4u) fill(frame, px, py, px, py, 1);
        return;
    }
    uint32_t n = (x1 - x0 + 1u) * (permille < 1000u ? permille : 1000u) / 1000u;
    if (n) fill(frame, x0, y0, x0 + n - 1u, y1, 1);
}
/* A warning sign, 13 x 11 at (x, y). */
static void warning(unsigned char *frame, unsigned x, unsigned y)
{
    for (unsigned r = 0; r < 11u; ++r) {
        unsigned half = (r + 1u) / 2u + (r == 10u);
        fill(frame, x + 6u - half, y + r, x + 6u + half, y + r, 1);
    }
    fill(frame, x + 6u, y + 3u, x + 6u, y + 6u, 0), fill(frame, x + 6u, y + 8u, x + 6u, y + 8u, 0);
}
/* A tick, 11 x 8 at (x, y), two pixels thick. */
static void tick_mark(unsigned char *frame, unsigned x, unsigned y)
{
    for (unsigned i = 0; i < 4u; ++i) fill(frame, x + i, y + 4u + i, x + i, y + 5u + i > y + 8u ? y + 8u : y + 5u + i, 1);
    for (unsigned i = 0; i < 8u; ++i) fill(frame, x + 3u + i, y + 7u - i, x + 3u + i, y + 8u - i, 1);
}
/* The base update: the whole screen, its title in a black band, the step and its bar, and what to leave alone. */
static void update_screen(unsigned char *frame)
{
    static const char *const step[] = {"WAITING FOR MODWERK", "RECEIVING NEW BASE", "SAVING NEW BASE", "RESTARTING"};
    canvas(frame);
    fill(frame, 0, 0, 127u, 63u, 0);
    centred(2u, "BASE UPDATE");
    invert(frame, 0, 0, 127u, 8u);
    if (transfer == T_SAVED || transfer == T_FAILED) {
        int saved = transfer == T_SAVED;
        if (saved) tick_mark(frame, 58u, 15u); else warning(frame, 57u, 13u);
        centred(29u, saved ? "BASE SAVED" : "NOT SAVED");
        fill(frame, 10u, 39u, 117u, 39u, 1);
        centred(45u, saved ? "YOU CAN PLAY AGAIN" : "KEEP THE POWER ON");
        if (!saved) centred(53u, "TRY AGAIN IN MODWERK");
        return;
    }
    int running = transfer == T_WAIT || transfer == T_RESTART || (transfer == T_SAVE && !transfer_permille);
    centred(13u, step[transfer - T_WAIT]);
    wide_bar(frame, 10u, 21u, 108u, 11u, transfer_permille, running);
    if (!running) {
        char t[8], *e = number(t, (transfer_permille + 5u) / 10u);
        *e++ = '%', *e = 0;
        centred(35u, t);
    }
    fill(frame, 0, 43u, 127u, 43u, 1);
    warning(frame, 12u, 48u);
    label(34u, 47u, "DO NOT TOUCH");
    label(34u, 55u, "KEEP THE POWER ON");
}
/* A module sync: a box as stock's dialogs, over the page, with what arrives and how far. */
static void sync_box(unsigned char *frame)
{
    canvas(frame);
    fill(frame, 14u, 12u, 113u, 51u, 0);
    outline(frame, 14u, 12u, 113u, 51u);
    centred(15u, "MODWERK SYNC");
    fill(frame, 14u, 22u, 113u, 22u, 1);
    centred(27u, transfer == T_SYNC ? "RECEIVING MODULES" : "STARTING MODULES");
    wide_bar(frame, 20u, 36u, transfer == T_SYNC ? 66u : 88u, 9u, transfer_permille, transfer != T_SYNC);
    if (transfer == T_SYNC) percent(91u, 38u, transfer_permille);
}
static void status_draw(unsigned char *frame);
/* No jump table: it is data in .text, and the build's MCF54455 check reads its bytes as instructions. */
#ifndef MODWERK_HOST
__attribute__((optimize("no-jump-tables")))
#endif
void modwerk_status_draw(unsigned char *frame)
{
    MW_STAMP(22); status_draw(frame); MW_STAMP(13);
}
#ifdef MODWERK_SETTINGS
static void settings_page(unsigned char *frame)
{
    struct modwerk_setting_view view;
    if (choosing_setting && (!modwerk_settings_field(setting_module.row, settings_field_index(), &view) || view.epoch != setting_epoch))
        choosing_setting = 0;
    struct settings_cursor *cursor = choosing_setting ? (view.fields ? &setting_field : &setting_option) : &setting_module;
    unsigned count = choosing_setting ? view.count : modwerk_settings_count();
    settings_move(cursor, count, 0);
    dialog(frame, choosing_setting ? view.label : "SETTINGS");
    if (!count) label(X0 + 6u, Y0 + 17u, "NO MODULE HAS A SETTING.");
    for (unsigned i = 0; i < SETTING_ROWS && cursor->top + i < count; ++i) {
        unsigned row = cursor->top + i, top = Y0 + 13u + 8u * i;
        if (row == cursor->row) for (unsigned k = 0; k < 3u; ++k)
            fill(frame, X0 + 3u + k, top + k, X0 + 3u + k, top + 4u - k, 1);
        if (choosing_setting && view.fields) {
            label(X0 + 9u, top, view.choices[row]);
            const char *value = view.values[row];
            int width = TEXT_WIDTH(FONT, -1, value);
            int edge = count > SETTING_ROWS ? X1 - 12 : X1 - 4;
            if (*value && edge - width >= (int)(X0 + 12u) + TEXT_WIDTH(FONT, -1, view.choices[row]))
                label((unsigned)(edge - width), top, value);
        } else if (choosing_setting) {
            outline(frame, X0 + 9u, top, X0 + 13u, top + 4u);
            if (row == view.active) fill(frame, X0 + 10u, top + 1u, X0 + 12u, top + 3u, 1);
            label(X0 + 17u, top, view.choices[row]);
        } else if (modwerk_settings_read(row, &view)) label(X0 + 9u, top, view.label);
    }
    if (cursor->top) arrow(frame, X1 - 9u, Y0 + 13u, 1);
    if (cursor->top + SETTING_ROWS < count) arrow(frame, X1 - 9u, Y0 + 45u, 0);
    if (count) {
        button(frame, X0 + 4u, Y1 - 10u, "YES");
        label(X0 + 30u, Y1 - 8u, choosing_setting && !view.fields ? "SELECT" : "OPEN");
    }
    button(frame, X1 - 24u, Y1 - 10u, "NO");
}
#endif
static void status_draw(unsigned char *frame)
{
    if (transfer == T_SYNC || transfer == T_SYNC_START) { sync_box(frame); return; }
    if (transfer != T_NONE) { update_screen(frame); return; }
    if (open == REFUSED) { refused_box(frame); return; }
    if (open == MEMORY) { memory_box(frame); return; }
    if (open == MISSING) { missing_page(frame); return; }
    if (open == TEST) { test_page(frame); return; }
    if (open == MODULE_LOAD) { modules_page(frame); return; }
    if (open == SWITCHES) { switches_page(frame); return; }
#ifdef MODWERK_RESIDENT_ON_DEMAND
    if (open == CLOSED && sidechain_notice_left) {
        canvas(frame);
        fill(frame, 13u, 18u, 114u, 45u, 0);
        outline(frame, 13u, 18u, 114u, 45u);
        centred(23u, "SIDECHAIN PAUSED");
        centred(34u, "DSP MEMORY");
        return;
    }
#endif
    if (open == CLOSED && hush_notice_left) { /* the predicted brake's three seconds */
        canvas(frame);
        fill(frame, 13u, 18u, 114u, 45u, 0);
        outline(frame, 13u, 18u, 114u, 45u);
        static char more[17];
        centred(23u, "PATTERN IS BUSY");
        centred(34u, hush_names[0]);
        if (hush_count > 2u) {
            unsigned n = hush_count - 1u, i = 0;
            more[i++] = '+'; if (n >= 10u) more[i++] = (char)('0' + n / 10u % 10u); more[i++] = (char)('0' + n % 10u);
            const char *tail = " MORE OFF"; for (unsigned k = 0; tail[k]; ++k) more[i++] = tail[k];
            more[i] = 0;
            centred(45u, more);
        } else if (hush_count == 2u) centred(45u, hush_names[1]);
        return;
    }
#ifdef MODWERK_SETTINGS
    if (open == SETTINGS) { settings_page(frame); return; }
#endif
    if (open != SHOWN) return;
    /* The title names the base by its version (owner, 16 November 2026: a number a player can read and say). */
    static char title[24] = "MODWERK BASE ";
    for (unsigned i = 0; i < 9u && (title[13u + i] = modwerk_base_version[i]) != 0; ++i) title[14u + i] = 0;
    dialog(frame, title);
    uint32_t cpu_peak = 0;
    for (unsigned i = 0; i < 8u; ++i) cpu_peak = cpu_recent[i] > cpu_peak ? cpu_recent[i] : cpu_peak;
    /* Two questions a player asks (owner, 15 October 2026): how hard it works now, and how much DSP space is left.
     * Five rows, each with its bar, no headings (owner, 16 November 2026): CPU, then DSP T1-4 and T5-8, each chip's
     * time by its tracks (measured, with the recent peak's tick), then MEM T1-4 and T5-8, each chip's DSP memory used: the
     * fuller of what admission books and the chip's code memory, whichever says DSP MEMORY FULL first (effects and
     * machines both take it). Tracks 1-4 run on core 1, tracks 5-8 on core 0. */
    /* each core's arena spelled out: the on-demand build rewrites these reads (resident_engines.py status()) */
    const uint32_t code[2] = {share(dl_residency_words[0], modwerk_dsp_arena[0]), share(dl_residency_words[1], modwerk_dsp_arena[1])};
    uint32_t used[2];
    for (unsigned core = 0; core < 2u; ++core) { uint32_t booked = modwerk_dsp_booked(core); used[core] = booked > code[core] ? booked : code[core]; }
    static const char *const names[5] = {"CPU", "DSP T1-4", "DSP T5-8", "MEM T1-4", "MEM T5-8"};
    const uint32_t value[5] = {modwerk_status[CPU], modwerk_status[DSP1_MEAN], modwerk_status[DSP0_MEAN], used[1], used[0]},
                   peak[5] = {cpu_peak, modwerk_status[DSP1_PEAK], modwerk_status[DSP0_PEAK], 0, 0};
    for (unsigned i = 0; i < 5u; ++i) {
        unsigned y = Y0 + 16u + 9u * i;
        label(X0 + 4u, y - 1u, names[i]);
        bar(frame, X0 + 48u, y, 40, 4, value[i], peak[i]);
        percent(X0 + 92u, y - 1u, value[i]);
    }
    if ((int32_t)(tip_until - ticks) > 0) { /* over the last rows, a box as stock draws them */
        fill(frame, X0 + 6u, Y1 - 15u, X1 - 6u, Y1 - 3u, 0);
        outline(frame, X0 + 6u, Y1 - 15u, X1 - 6u, Y1 - 3u);
        label((unsigned)(64 - TEXT_WIDTH(FONT, -1, "CUE + PROJ OPENS THIS") / 2), Y1 - 11u, "CUE + PROJ OPENS THIS");
    }
}
