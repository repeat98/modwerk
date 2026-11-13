/* SPDX-License-Identifier: GPL-3.0-or-later
 * Host check of status.c's keys: with the dialog closed every key reaches stock, TRIG 1 (code 0) included
 * (a release swallowed there left bank changes to pattern 1 undone on the unit, 11 October 2026); CUE +
 * PROJ opens it and takes PROJ's release; NO closes it and takes its own. */
#include "status.c"
#include <stdio.h>
#include <string.h>

static unsigned failures;
#define CHECK(x) do { if (!(x)) { failures++; fprintf(stderr, "%s:%d: %s\n", __FILE__, __LINE__, #x); } } while (0)
/* What status.c reads from the rest of the base; the keys never touch it. */
volatile uint32_t dl_frames, dl_residency_words[2], modwerk_dsp_meter_bits, modwerk_dsp_meter[5], dl_refusal[8];
volatile int32_t modwerk_dsp_meter_core;
static unsigned machine_core = 1; static uint32_t machine_add = 726;
void modwerk_dsp_source_refusal(unsigned *core, uint32_t *add) { *core = machine_core, *add = machine_add; }
const uint16_t modwerk_dsp_arena[2];
int modwerk_dsp_meter_read(unsigned core, unsigned first, unsigned words) { (void)core, (void)first, (void)words; return 0; }
uint32_t dl_buffers_in_use(void) { return 0; }
unsigned modwerk_runtime_active(void) { return 0; }
volatile struct selftest modwerk_selftest;
volatile uint32_t modwerk_selftest_key;
volatile uint32_t modwerk_flash_progress, modwerk_flash_outcome, modwerk_flash_trial; /* flash.c */
/* ep0.c's upload and boot.c's armed RAM boot, as the transfer screens read them. */
static unsigned upload_view; static uint32_t upload_permille; static int boot_pending;
unsigned modwerk_upload_view(uint32_t *permille) { *permille = upload_permille; return upload_view; }
int modwerk_boot_pending(void) { return boot_pending; }
/* The host's text: each call is kept, so a test can ask what a screen says. */
static char said[512];
static struct { int x, top; char text[32]; } drawn[16]; /* and where, for whoever renders the frame with a font of its own */
static unsigned drawn_count;
void host_draw_text(unsigned char *frame, int x, int top, const char *t)
{
    (void)frame;
    strcat(strcat(said, t), "|");
    if (drawn_count < 16u) drawn[drawn_count].x = x, drawn[drawn_count].top = top, strncpy(drawn[drawn_count++].text, t, 31);
}
int host_text_width(const char *t) { return 5 * (int)strlen(t); }
static unsigned char lcd[128 * 8];
static const char *shows(void) { said[0] = 0; drawn_count = 0; memset(drawn, 0, sizeof drawn); memset(lcd, 0, sizeof lcd); modwerk_status_draw(lcd); return said; }
static int lit(unsigned x, unsigned y) { unsigned bit = 63u - y; return lcd[x * 8u + (bit >> 3)] >> (7u - (bit & 7u)) & 1; }
static int selftest_starts, selftest_aborts, menu_closes;
void modwerk_test_close_menu(void) { ++menu_closes; }
int modwerk_selftest_start(void) { ++selftest_starts; return 1; }
void modwerk_selftest_abort(void) { ++selftest_aborts; }
void modwerk_selftest_refresh(void) {}
uint32_t modwerk_runtime_free(uint32_t *largest) { if (largest) *largest = 0; return 0; }
/* dsp.c's MISSING list: `listed` modules at handles 20 and up; modset.c's restore. */
static unsigned listed;
volatile uint32_t modwerk_runtime_ticks;
unsigned modwerk_dsp_missing_list(uint8_t *out, unsigned first, unsigned most)
{
    (void)first, (void)most;
    for (unsigned i = 0; i < listed; ++i) {
        uint8_t *e = out + 4u + 24u * i;
        for (unsigned c = 0; c < 24u; ++c) e[c] = 0;
        e[0] = (uint8_t)(20u + i), e[8] = 'm', e[9] = 'o', e[10] = 'd', e[11] = (uint8_t)('a' + i);
    }
    out[0] = 'M', out[1] = 'W', out[2] = 'M', out[3] = (uint8_t)listed;
    return 4u + 24u * listed;
}
/* fxmap.c's lookup: handle 20 in bank C's saved Part 2 on T5, the others in bank A's working Part 1 on T2. */
int modwerk_fxmap_where(unsigned id, unsigned *bank, unsigned *part, unsigned *track)
{
    if (id == 20u) { *bank = 2, *part = 1, *track = 4; return 2; }
    *bank = 0, *part = 0, *track = 1;
    return id < 20u + listed ? 1 : 0;
}
void modwerk_fxpage_missing(void) {}
static int restored;
int modwerk_modset_restored(void) { return restored; }
volatile uint32_t modwerk_modset_result;
/* The memory box: picks (the guard's completed count) and USB accepts. */
uint8_t modwerk_test_live_fx[16];
volatile uint32_t dl_selection_completed, modwerk_boot_accepted;
const fx_set modwerk_fx_modules = {{1u << 27 | 1u << 29}};
volatile uint32_t mw_cpu_hot = 850u, mw_cpu_refusals, mw_cpu_refusal_tracks; /* machine_registry.c's */
void modwerk_fxmap_name(unsigned id, char *out) { for (unsigned i = 0; i < 16u; ++i) out[i] = 0; out[0] = 'F', out[1] = 'X', out[2] = (char)('0' + id % 10u); }
int modwerk_dsp_budget(unsigned slot, struct modwerk_dsp_budget *out) { (void)slot, (void)out; return 0; } /* draws only */
uint32_t modwerk_dsp_booked(unsigned core) { return core; } /* draws only */
unsigned modwerk_dsp_reads_buffer(unsigned id) { return id == 27u; } /* E-Verb reads one; Tape Echo (15) none */
/* dsp.c's MODULE LOAD list: `installed` modules. */
static unsigned installed;
unsigned modwerk_dsp_module_loads(struct modwerk_module_load *out)
{
    for (unsigned i = 0; i < installed; ++i) out[i] = (struct modwerk_module_load){{'m', (char)('a' + i)}, 400u, (uint8_t)(20u + i), 0, {0, 1}};
    return installed;
}
int main(void)
{
    uint8_t load_out[MODWERK_LOAD_BYTES];
    CHECK(modwerk_status_load(load_out) == 48u && load_out[5] == 0u);
    modwerk_status[0] = 123u; modwerk_status[1] = 456u; modwerk_status[2] = 789u;
    modwerk_status[3] = 234u; modwerk_status[4] = 567u;
    modwerk_runtime_ticks = 120u; dl_frames = 1000u;
    load_flags = 7u; load_at[0] = 118u; load_at[1] = 115u; load_at[2] = 119u;
    publish_load();
    CHECK(modwerk_status_load(load_out) == 48u && load_out[0] == 'M' && load_out[3] == 'D' && load_out[5] == 7u);
    CHECK(load_out[11] == 120u && load_out[14] == 3u && load_out[15] == 232u && load_out[19] == 118u);
    CHECK(load_out[31] == 123u && load_out[34] == 1u && load_out[35] == 200u && load_out[47] == 55u);
    /* Writes to unpublished state do not leak through a concurrent IRQ read. */
    modwerk_status[0] = 1000u; load_at[0] = 120u;
    modwerk_status_load(load_out); CHECK(load_out[31] == 123u && load_out[19] == 118u);
    publish_load(); modwerk_status_load(load_out); CHECK(load_out[30] == 3u && load_out[31] == 232u && load_out[19] == 120u);
    CHECK(!modwerk_status_key(0, 1) && !modwerk_status_key(0, 0)); /* TRIG 1, dialog closed */
    CHECK(!modwerk_status_key(CUE, 1));
    CHECK(modwerk_status_key(PROJ, 1) && modwerk_status_key(PROJ, 0)); /* CUE + PROJ: open, its release taken */
    CHECK(!modwerk_status_key(CUE, 0));
    CHECK(!modwerk_status_key(PLAY, 1) && !modwerk_status_key(PLAY, 0) && open == SHOWN); /* PLAY reaches stock, it stays */
    CHECK(!modwerk_status_key(STOP, 1) && !modwerk_status_key(STOP, 0) && open == SHOWN);
    CHECK(!modwerk_status_key(0, 1) && open == CLOSED && !modwerk_status_key(0, 0)); /* TRIG 1 closes it and reaches stock */
    modwerk_status_key(CUE, 1); modwerk_status_key(PROJ, 1); modwerk_status_key(PROJ, 0); modwerk_status_key(CUE, 0);
    CHECK(open == SHOWN && !modwerk_status_enc(0, 1) && open == CLOSED); /* a knob closes it and reaches stock */
    modwerk_status_key(CUE, 1); modwerk_status_key(PROJ, 1); modwerk_status_key(PROJ, 0); modwerk_status_key(CUE, 0);
    CHECK(modwerk_status_key(NO, 1) && modwerk_status_key(NO, 0));     /* NO closes, its release taken */
    CHECK(!modwerk_status_key(0, 1) && !modwerk_status_key(0, 0));     /* closed again: TRIG 1 reaches stock */
    extern int modwerk_test_menu_open;
    modwerk_test_menu(0);                                              /* reached with PROJ's menu closed (a chooser's YES) */
    CHECK(!selftest_starts && !modwerk_status_key(0, 1) && !modwerk_status_key(0, 0)); /* nothing happens */
    modwerk_test_menu_open = 1;
    modwerk_test_menu(0);                                              /* PROJ > MODWERK > SELF TEST */
    CHECK(!menu_closes); modwerk_status_close_menu(); modwerk_status_close_menu();
    CHECK(menu_closes == 1);                                           /* PROJ's menu closed once, after the row's dispatch */
    CHECK(selftest_starts == 1 && modwerk_status_key(YES, 1) && modwerk_status_key(YES, 0)); /* started; keys stay with the page */
    CHECK(modwerk_status_enc(0, 1) && open == TEST);                   /* and knobs */
    CHECK(!modwerk_status_key(PLAY, 1) && !modwerk_status_key(PLAY, 0) && open == TEST); /* but PLAY reaches stock */
    CHECK(modwerk_status_key(NO, 1) && selftest_aborts == 1 && modwerk_status_key(NO, 0));  /* NO aborts and closes */
    CHECK(!modwerk_status_key(0, 1) && !modwerk_status_key(0, 0));     /* closed: TRIG 1 reaches stock */
    /* The missing modules' page: not before the boot's restore is over, then once the list holds still. */
    listed = 5; missing_check(); missing_check();
    CHECK(open == CLOSED);                                             /* the restore is not over: all still missing */
    restored = 1, modwerk_modset_result = 1; missing_check();
    CHECK(open == MISSING && missing_top == 0);
    CHECK(modwerk_status_key(DOWN, 1) && modwerk_status_key(DOWN, 0) && missing_top == 1);
    for (unsigned k = 0; k < 4u; ++k) modwerk_status_key(DOWN, 1), modwerk_status_key(DOWN, 0);
    CHECK(missing_top == 3);                                           /* five modules, two at a time: no further */
    for (unsigned k = 0; k < 2u; ++k) modwerk_status_key(UP, 1), modwerk_status_key(UP, 0);
    CHECK(modwerk_status_key(UP, 1) && modwerk_status_key(UP, 0) && missing_top == 0);
    /* Each module's second line: where the project names it. */
    char where[32];
    CHECK(missing_at[0][0] == 2 && missing_at[1][0] == 1 && missing_at[4][0] == 1); /* looked up while it shows */
    missing_where(where, missing_at[0], 0); CHECK(!strcmp(where, "BANK C SAVED PART 2 T5"));
    missing_where(where, missing_at[0], 1); CHECK(!strcmp(where, "C SAVED PART 2 T5"));
    missing_where(where, missing_at[1], 0); CHECK(!strcmp(where, "BANK A PART 1 T2"));
    static const uint8_t nowhere[4];
    missing_where(where, nowhere, 0); CHECK(!where[0]);                /* named nowhere any more: an empty line */
    CHECK(!modwerk_status_key(STOP, 1) && !modwerk_status_key(STOP, 0) && open == MISSING); /* STOP reaches stock, it stays */
    CHECK(modwerk_status_key(YES, 1) && open == CLOSED && modwerk_status_key(YES, 0));
    missing_check(); CHECK(open == CLOSED);                            /* told already: it stays closed */
    listed = 6; missing_check(); CHECK(open == CLOSED);                /* a new one: not until it holds still */
    missing_check(); CHECK(open == MISSING);
    listed = 7; missing_check(); missing_check();                      /* one more while it shows: it is on the page */
    CHECK(modwerk_status_key(NO, 1) && open == CLOSED && modwerk_status_key(NO, 0));
    missing_check(); missing_check(); CHECK(open == CLOSED);           /* so NO closes it for good (12 October 2026) */
    listed = 0; missing_check(); CHECK(open == CLOSED);                /* all installed: it closes */
    /* A module sync shows its box and bar while the modules arrive and start, and holds no key. */
    upload_view = 1, upload_permille = 500; transfer_tick();
    CHECK(transfer == T_SYNC && strstr(shows(), "MODWERK SYNC|RECEIVING MODULES|50%"));
    CHECK(lit(22, 40) && lit(50, 40) && !lit(56, 40));                 /* the bar: half of it filled */
    CHECK(modwerk_status_dialog() && !modwerk_status_key(0, 1) && !modwerk_status_key(0, 0));
    upload_view = 1 | 1 << 4; transfer_tick();
    CHECK(transfer == T_SYNC_START && strstr(shows(), "STARTING MODULES") && !strstr(said, "%"));
    upload_view = 0; transfer_tick();
    CHECK(transfer == T_NONE && !modwerk_status_dialog() && !shows()[0]);
    /* A base update takes the screen and the panel from the first packet of a base. On the base being replaced:
     * the new base arrives (a whole image, for the RAM boot), then the restart. */
    upload_view = 3, upload_permille = 250; transfer_tick();
    CHECK(transfer == T_RECEIVE && strstr(shows(), "BASE UPDATE|RECEIVING NEW BASE|25%|DO NOT TOUCH|KEEP THE POWER ON"));
    CHECK(lit(0, 0) && lit(127, 8) && !lit(0, 9));                     /* the title's band, over the whole width */
    CHECK(modwerk_status_key(PLAY, 1) && modwerk_status_key(PLAY, 0)); /* every key held back, PLAY too */
    CHECK(modwerk_status_key(0, 1) && modwerk_status_enc(0, 1));
    upload_view = 3 | 1 << 4; transfer_tick();
    CHECK(transfer == T_RESTART && strstr(shows(), "RESTARTING") && !strstr(said, "%"));
    upload_view = 0; boot_pending = 1; transfer_tick(); CHECK(transfer == T_RESTART);
    boot_pending = 0;
    /* The host gave up: the screen stays for the page's next try, then frees the panel by itself. A key pressed
     * under the lock stays held back until it is let go, so stock never sees a release without its press. */
    transfer_tick(); CHECK(transfer == T_WAIT && strstr(shows(), "WAITING FOR MODWERK"));
    for (unsigned k = 0; k < T_QUIET_TICKS; ++k) transfer_tick();
    CHECK(transfer == T_NONE && !modwerk_status_key(PLAY, 1) && !modwerk_status_key(PLAY, 0));
    CHECK(modwerk_status_key(0, 0) && !modwerk_status_key(0, 0));       /* TRIG 1's release: its press was held back */
    /* On the new base: its container arrives, flash.c unpacks it over its own first bytes and writes it. */
    upload_view = 2, upload_permille = 900; transfer_tick(); CHECK(transfer == T_RECEIVE);
    upload_view = 3 | 1 << 4; transfer_tick();                         /* unpacked: still the container that arrived */
    CHECK(transfer == T_SAVE && strstr(shows(), "SAVING NEW BASE") && !strstr(said, "%"));
    modwerk_flash_progress = 1u + 640u; transfer_tick();
    CHECK(transfer == T_SAVE && strstr(shows(), "SAVING NEW BASE|64%") && modwerk_status_key(YES, 1) && modwerk_status_key(YES, 0));
    /* Saved: said for three seconds or until a key, which goes on to stock; then nothing is waited for. */
    modwerk_flash_progress = 0, modwerk_flash_outcome = 3, upload_view = 0; transfer_tick();
    CHECK(transfer == T_SAVED && strstr(shows(), "BASE SAVED|YOU CAN PLAY AGAIN") && !modwerk_status_enc(0, 1));
    /* The progress still up for a moment after the outcome (another task takes it down): it stays SAVED, three
     * seconds, and never goes back to waiting with the panel held. */
    modwerk_flash_progress = 1001u; transfer_tick(); transfer_tick();
    CHECK(transfer == T_SAVED && !modwerk_status_key(PLAY, 1) && !modwerk_status_key(PLAY, 0));
    transfer = T_SAVED; modwerk_flash_progress = 0;
    for (unsigned k = 0; k < T_TOLD_TICKS + T_QUIET_TICKS; ++k) { transfer_tick(); if (T_LOCKS(transfer)) break; }
    CHECK(transfer == T_NONE && !modwerk_status_key(0, 1) && !modwerk_status_key(0, 0));
    /* A write that failed says so and frees the panel: the page sends it again. */
    modwerk_flash_outcome = 4; transfer_tick();
    CHECK(transfer == T_FAILED && strstr(shows(), "NOT SAVED|KEEP THE POWER ON|TRY AGAIN IN MODWERK"));
    for (unsigned k = 0; k < T_TOLD_TICKS; ++k) transfer_tick();
    CHECK(transfer == T_NONE);
    /* Started from RAM while NOR starts another base (two slots): the screen is there before any host is, and gives
     * up 25 s after the start, as a development RAM boot has no write to wait for. */
    transfer_seen = transfer_over = 0, transfer_ticks = 60, transfer_wait = T_WAIT_TICKS, modwerk_flash_trial = 1; transfer_tick(); /* as after a start */
    CHECK(transfer == T_WAIT && modwerk_status_key(0, 1) && modwerk_status_key(0, 0));
    listed = 3; missing_check(); missing_check(); CHECK(open == CLOSED); /* the missing page waits for it */
    listed = 0; missing_check();
    transfer_ticks = T_WAIT_TICKS; transfer_tick(); CHECK(transfer == T_NONE);
    modwerk_flash_trial = 0;
    /* The memory box: after a pick that puts a module on one slot, or an accept; not after a Part change. */
    dl_residency_words[1] = 441; memory_tick();
    CHECK(words_before[1] == 441);                                     /* closed: it follows the core */
    dl_residency_words[1] = 2029; modwerk_test_live_fx[8] = 27; ++dl_selection_completed; memory_tick();
    CHECK(open == MEMORY);                                             /* E-Verb picked on T1 FX2 */
    CHECK(words_before[1] == 441);                                     /* open: what it took is 2029 - 441 */
    CHECK(!modwerk_status_key(YES, 0) && open == MEMORY);              /* the pick's YES release: it stays */
    CHECK(budget_slot == 8);                                           /* the box shows that slot's core */
    CHECK(!modwerk_status_key(0, 1) && open == CLOSED);                /* a press closes it and goes on to stock */
    modwerk_test_live_fx[12] = 29; ++dl_selection_completed; memory_tick();
    CHECK(open == MEMORY && budget_slot == 12);                        /* Euclid picked on T5 FX2 */
    CHECK(modwerk_status_key(YES, 1) && open == CLOSED);               /* YES only closes it (owner, 14 October 2026) */
    CHECK(modwerk_status_key(YES, 0));                                 /* and takes its release */
    modwerk_test_live_fx[9] = 27, modwerk_test_live_fx[10] = 29; ++dl_selection_completed; memory_tick();
    CHECK(open == CLOSED);                                             /* two slots changed: a Part change */
    ++modwerk_boot_accepted; memory_tick();
    CHECK(open == MEMORY && budget_slot == -1);                        /* over USB: memory only, no slot */
    for (unsigned i = 0; i < 90u; ++i) memory_tick();
    CHECK(open == CLOSED);                                             /* gone after a second and a half */
    /* DSP FULL with numbers (owner, 20 October 2026): the refused effect's slot and need, instead of the bare popup. */
    dl_refusal[0] = 1, dl_refusal[1] = 9, dl_refusal[2] = 27, dl_refusal[3] = 22, dl_refusal[4] = 327, dl_refusal[5] = 1602;
    dl_residency_words[1] = 1508;
    CHECK(!modwerk_status_refused(2) && open == CLOSED);                /* a DSP time refusal is not DSP MEMORY FULL */
    CHECK(modwerk_status_refused(3) && open == REFUSED);                /* DSP FULL on T2 FX2: the box */
    CHECK(refused_core == 1 && refused[4] == 327 && refused_words == 1508 && refused_reason == 3);
    dl_refusal[4] = 0; CHECK(refused[4] == 327);                        /* a snapshot: later refusals change nothing shown */
    CHECK(!modwerk_status_key(0, 1) && open == CLOSED);                 /* a press closes it and goes on to stock */
    dl_refusal[0] = 3, dl_refusal[6] = 3, dl_refusal[7] = 3;
    CHECK(modwerk_status_refused(2) && open == REFUSED && refused[0] == 3); /* a buffer: DSP MEMORY FULL */
    CHECK(!refused_elsewhere);                                          /* E-Verb reads a buffer: its tracks are full */
    modwerk_status_key(0, 1); dl_refusal[2] = 15;
    CHECK(modwerk_status_refused(2) && refused_elsewhere);              /* Tape Echo reads none: another slot's is in the way */
    dl_refusal[2] = 27;
    for (unsigned i = 0; i < 180u; ++i) memory_tick();
    CHECK(open == CLOSED);                                             /* gone after three seconds */
    dl_refusal[1] = 16; CHECK(!modwerk_status_refused(2));             /* no slot known: the bare popup */
    modwerk_load_menu(0); dl_refusal[1] = 9;
    CHECK(!modwerk_status_refused(2) && open == SHOWN);                 /* a page is open: not covered */
    modwerk_status_key(NO, 1); modwerk_status_key(NO, 0);
    /* PROJ > MODWERK's other rows: each opens its page; NO closes it. */
    modwerk_load_menu(0);
    CHECK(open == SHOWN && tip_until == ticks + 120u);                 /* from the menu: the CUE + PROJ tip for 2 s */
    CHECK(modwerk_status_key(NO, 1) && open == CLOSED && modwerk_status_key(NO, 0));
    /* A machine voice refused for cycles shows the same DSP FULL box, on "Tn SRC" (a track's source, no effect slot). */
    modwerk_status_machine_refused(0, "Analog BD");
    CHECK(open == REFUSED && refused_machine && refused_reason == 3 && refused[0] == 1 && refused[1] == 0 && refused[4] == 726);
    CHECK(refused_core == 1 && !strcmp(refused_name, "ANALOG BD"));
    machine_add = 5; modwerk_status_machine_refused(4, "Other");        /* the box already shows: not replaced */
    CHECK(refused[1] == 0 && refused[4] == 726);
    for (unsigned i = 0; i < 180u; ++i) memory_tick();
    CHECK(open == CLOSED);
    modwerk_status_machine_refused(8, "Analog BD"); CHECK(open == CLOSED); /* no such track */
    modwerk_load_menu(0); modwerk_status_machine_refused(0, "Analog BD");
    CHECK(open == SHOWN);                                              /* a page is open: not covered */
    modwerk_status_key(NO, 1); modwerk_status_key(NO, 0);
    dl_refusal[0] = 1, dl_refusal[1] = 9; CHECK(modwerk_status_refused(3) && !refused_machine); /* an effect's box clears the machine mark */
    for (unsigned i = 0; i < 180u; ++i) memory_tick();
    /* The CPU budget's refusal: the same box as CPU FULL on "Tn SRC", for three seconds, never over a page. */
    void modwerk_status_cpu_refused(unsigned track, const char *label, uint32_t booked, uint32_t add);
    modwerk_status_cpu_refused(2, "Poly8", 800, 266);
    CHECK(open == REFUSED && refused_machine && refused[0] == 4 && refused[1] == 2 && refused_booked == 800 && refused[4] == 266);
    CHECK(!strcmp(refused_name, "POLY8"));
    for (unsigned i = 0; i < 180u; ++i) memory_tick();
    CHECK(open == CLOSED);
    /* A busy unit's refusal: the meter's mean over its last eight readings, the same box with the measured CPU. */
    uint32_t modwerk_status_cpu_recent(void); void modwerk_status_cpu_hot(unsigned track, const char *label, uint32_t cpu);
    for (unsigned i = 0; i < 8u; ++i) cpu_recent[i] = 800u + 20u * i;
    CHECK(modwerk_status_cpu_recent() == 870u);
    modwerk_status_cpu_hot(5, "Amiga", 870);
    CHECK(open == REFUSED && refused_machine && refused_reason == 4 && refused[0] == 5 && refused[1] == 5 && refused_booked == 870 && refused[4] == 0);
    CHECK(!strcmp(refused_name, "AMIGA"));
    for (unsigned i = 0; i < 180u; ++i) memory_tick();
    CHECK(open == CLOSED);
    /* An effect pick on a busy unit: a module's effect is refused with the box on its slot ("T4 FX2"), counted; a
     * stock effect and NONE pass, and so does everything under the line. */
    int modwerk_status_effect_busy(unsigned slot, unsigned id);
    { uint32_t before = mw_cpu_refusals;
      CHECK(modwerk_status_effect_busy(11, 27) == 1 && open == REFUSED && refused[0] == 5 && refused[1] == 11 && !refused_machine && refused_booked == 870);
      CHECK(mw_cpu_refusals == before + 1 && mw_cpu_refusal_tracks & 1u << 3);
      for (unsigned i = 0; i < 180u; ++i) memory_tick();
      CHECK(open == CLOSED);
      CHECK(!modwerk_status_effect_busy(11, 8) && !modwerk_status_effect_busy(11, 0) && !modwerk_status_effect_busy(16, 27) && open == CLOSED && mw_cpu_refusals == before + 1);
      cpu_recent[0] = 0;                                                 /* mean 770: under the line */
      CHECK(modwerk_status_cpu_recent() < mw_cpu_hot && !modwerk_status_effect_busy(11, 27) && open == CLOSED); }
    for (unsigned i = 0; i < 8u; ++i) cpu_recent[i] = 0;
    modwerk_load_menu(0); modwerk_status_cpu_refused(2, "Poly8", 800, 266);
    CHECK(open == SHOWN);
    modwerk_status_key(NO, 1); modwerk_status_key(NO, 0);
    modwerk_missing_menu(0);
    missing_check();
    CHECK(open == MISSING);                                            /* asked for: it stays with nothing missing */
    CHECK(modwerk_status_key(YES, 1) && open == CLOSED && modwerk_status_key(YES, 0));
    installed = 6; modwerk_modules_menu(0);
    CHECK(open == MODULE_LOAD && modules_top == 0);
    for (unsigned i = 0; i < 4u; ++i) modwerk_status_key(DOWN, 1), modwerk_status_key(DOWN, 0);
    CHECK(modules_top == 2);                                           /* six modules, four rows: no further */
    CHECK(modwerk_status_key(UP, 1) && modwerk_status_key(UP, 0) && modules_top == 1);
    CHECK(!modwerk_status_key(REC, 1) && !modwerk_status_key(REC, 0) && open == MODULE_LOAD); /* REC reaches stock, it stays */
    CHECK(!modwerk_status_key(0, 1) && open == CLOSED && !modwerk_status_key(0, 0)); /* TRIG 1 closes it and reaches stock */
    modwerk_test_menu_open = 0; modwerk_modules_menu(0);
    CHECK(open == CLOSED);                                             /* only from the open menu */
    if (failures) return 1;
    puts("status keys: ok");
    return 0;
}
