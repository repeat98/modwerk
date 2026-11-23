/* SPDX-License-Identifier: GPL-3.0-or-later
 * Host check of status.c's keys: with the dialog closed every key reaches stock, TRIG 1 (code 0) included
 * (a release swallowed there left bank changes to pattern 1 undone on the unit, 11 October 2026); CUE +
 * PROJ opens it and takes PROJ's release; NO closes it and takes its own. */
#define MODWERK_SETTINGS
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
const char modwerk_base_version[] = "0.7"; /* build_core.py's, from base-version.json */
volatile uint32_t modwerk_selftest_key;
volatile uint32_t modwerk_flash_progress, modwerk_flash_outcome, modwerk_flash_trial; /* flash.c */
/* ep0.c's upload and boot.c's armed RAM boot, as the transfer screens read them. */
static unsigned upload_view; static uint32_t upload_permille; static int boot_pending;
unsigned modwerk_upload_view(uint32_t *permille) { *permille = upload_permille; return upload_view; }
int modwerk_boot_pending(void) { return boot_pending; }
static int transport_stopped = 1;
int modwerk_machine_stopped(void) { return transport_stopped; }
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
static unsigned listed, listed_machines;
volatile uint32_t modwerk_runtime_ticks;
/* machine_registry.c: the map's refresh, counted; map entry 3 is named in bank B's working Part 3 on T8. */
static unsigned machine_refreshes;
void modwerk_machine_map_refresh(void) { ++machine_refreshes; }
int modwerk_machine_where(unsigned k, unsigned *bank, unsigned *part, unsigned *track)
{
    if (k != 3u) return 0;
    *bank = 1, *part = 2, *track = 7;
    return 1;
}
/* ... and module 0x10 (Euclid in the MODULES rows below) is a machine the map names there too. */
int modwerk_machine_where_module(uint32_t module, unsigned *bank, unsigned *part, unsigned *track)
{ return module == 0x10u ? modwerk_machine_where(3, bank, part, track) : 0; }
unsigned modwerk_dsp_missing_list(uint8_t *out, unsigned first, unsigned most)
{
    (void)first, (void)most;
    for (unsigned i = 0; i < listed; ++i) {
        uint8_t *e = out + 4u + 24u * i;
        for (unsigned c = 0; c < 24u; ++c) e[c] = 0;
        e[0] = (uint8_t)(20u + i), e[6] = 1, e[7] = (uint8_t)i; /* module 0x100 + i */
        e[8] = 'm', e[9] = 'o', e[10] = 'd', e[11] = (uint8_t)('a' + i);
    }
    for (unsigned i = 0; i < listed_machines; ++i) { /* then the absent machines: map entry 3 on, module 0x200 on */
        uint8_t *e = out + 4u + 24u * (listed + i);
        for (unsigned c = 0; c < 24u; ++c) e[c] = 0;
        e[0] = 0xffu, e[1] = (uint8_t)(0x80u | (3u + i)), e[6] = 2, e[7] = (uint8_t)i;
        e[8] = 'P', e[9] = 'O', e[10] = 'L', e[11] = 'Y', e[12] = (uint8_t)('8' + i);
    }
    out[0] = 'M', out[1] = 'W', out[2] = 'M', out[3] = (uint8_t)(listed + listed_machines);
    return 4u + 24u * (listed + listed_machines);
}
/* fxmap.c's lookup: handle 20 in bank C's saved Part 2 on T5, the others in bank A's working Part 1 on T2. */
int modwerk_fxmap_where(unsigned id, unsigned *bank, unsigned *part, unsigned *track)
{
    if (id == 20u) { *bank = 2, *part = 1, *track = 4; return 2; }
    *bank = 0, *part = 0, *track = 1;
    return id < 20u + listed ? 1 : 0;
}
void modwerk_fxpage_missing(void) {}
/* modset.c's shelf: `off_module` is switched off. fxmap.c's map: handle 20 + i names the listed module 0x100 + i, and
 * `map_module` names more; the project uses each. */
static uint32_t off_module, off_module2, map_module[MODWERK_FX_IDS];
int modwerk_modset_is_off(uint32_t module) { return module && (module == off_module || module == off_module2); }
static int fx_loading; /* fxmap.c: a project load runs */
int modwerk_fxmap_loading(void) { return fx_loading; }
int modwerk_fxmap_describe(unsigned id, uint32_t *module, uint16_t *layout, char *name)
{
    if (id >= MODWERK_FX_IDS || (!map_module[id] && (id < 20u || id >= 20u + listed))) return 0;
    *module = map_module[id] ? map_module[id] : 0x100u + (id - 20u), *layout = 0;
    for (unsigned i = 0; i < 16u; ++i) name[i] = 0;
    return 1;
}
fx_set modwerk_fxmap_used(void)
{
    fx_set used = {{0}};
    for (unsigned k = 0; k < MODWERK_FX_IDS; ++k) if (map_module[k] || (k >= 20u && k < 20u + listed)) used = fx_with(used, k);
    return used;
}
static int restored;
int modwerk_modset_restored(void) { return restored; }
volatile uint32_t modwerk_modset_result;
/* The memory box: picks (the guard's completed count) and USB accepts. */
uint8_t modwerk_test_live_fx[16];
volatile uint32_t dl_selection_completed, modwerk_boot_accepted;
const fx_set modwerk_fx_modules = {{1u << 27 | 1u << 29}};
volatile uint32_t mw_cpu_refusals, mw_cpu_refusal_tracks, mw_wake_mille = 30u; /* machine_registry.c's */
/* machine_registry.c's effect modules that rest: effect 27's module rests while effect_rests; a wake records its id. */
static int effect_rests; static unsigned effect_wakes, effect_woken;
int modwerk_machine_effect_resting(unsigned id) { return effect_rests && id == 27u; }
void modwerk_machine_effect_wake(unsigned id) { ++effect_wakes, effect_woken = id, effect_rests = 0; }
void modwerk_fxmap_name(unsigned id, char *out) { for (unsigned i = 0; i < 16u; ++i) out[i] = 0; out[0] = 'F', out[1] = 'X', out[2] = (char)('0' + id % 10u); }
static int budget_on; /* the pick box's DSP rows, so its CPU row draws */
int modwerk_dsp_budget(unsigned slot, struct modwerk_dsp_budget *out)
{
    (void)slot;
    if (!budget_on) return 0;
    memset(out, 0, sizeof *out), out->allowance = out->arena = 1000u, strcpy(out->name, "Euclid");
    return 1;
}
volatile uint32_t mw_frame_window; /* machine_registry.c's: the longest frame since the last reading */
static uint32_t test_machines_booked; /* machine_registry.c's booking of the Part's module machines */
static uint32_t test_epoch; /* the loader's owner epoch: a set installed, removed or undone */
uint32_t modwerk_runtime_owner_epoch(void) { return test_epoch; }
static unsigned test_pattern; /* machine_registry.c: the pattern that plays */
unsigned modwerk_machine_pattern(void) { return test_pattern; }
static unsigned test_busiest, test_tracks, test_trigging; /* machine_registry.c: the playing pattern's busiest step, tracks that trig */
unsigned modwerk_machine_pattern_trigs(uint8_t most[2], uint8_t tracks[2], uint16_t id[2])
{
    most[0] = (uint8_t)test_busiest, tracks[0] = (uint8_t)(test_tracks > test_busiest ? test_tracks : test_busiest);
    id[0] = id[1] = (uint16_t)(test_pattern ? test_pattern : 32u);
    return 1u;
}
unsigned modwerk_machine_trigging(void) { return test_trigging; }
static uint32_t test_rest; /* machine_registry.c's installed modules at rest */

uint32_t modwerk_machine_rest_booked(void) { return test_rest; }
uint32_t modwerk_machine_frame_booked(unsigned skip, uint32_t net) { (void)skip; (void)net; return test_machines_booked; }
/* ... and as the predicted brake lists them: one machine on T2 that books all of it */
unsigned modwerk_machine_part_machines(uint8_t tracks[8], uint32_t cost[8], const char *label[8], uint32_t net)
{ (void)net; if (!test_machines_booked) return 0; tracks[0] = 1u << 1, cost[0] = test_machines_booked, label[0] = "Fm Synth"; return 1; }
static fx_set test_dry; /* machine_registry.c: the effects that can bypass dry */
fx_set modwerk_machine_deadline_effects(void) { return test_dry; }
uint32_t modwerk_dsp_booked(unsigned core) { return core; } /* draws only */
unsigned modwerk_dsp_reads_buffer(unsigned id) { return id == 27u; } /* E-Verb reads one; Tape Echo (15) none */
struct dl_package dl_catalog[MODWERK_FX_IDS]; /* the transport's effect catalog: each effect's DSP cycles */
/* dsp.c's MODULE COST list: `installed` modules. */
static unsigned installed;
unsigned modwerk_dsp_module_loads(struct modwerk_module_load *out)
{
    for (unsigned i = 0; i < installed; ++i) out[i] = (struct modwerk_module_load){{'m', (char)('a' + i)}, 400u, (uint8_t)(20u + i), 0, {0, 1}};
    return installed;
}
/* MODULES: the loader's live modules and modset.c's shelf, and what the page asks of modset.c. */
static struct { uint32_t id; const char *name; int on; } unit[8];
static unsigned unit_count, shelf_moving, asked_on, locks;
static uint32_t asked_id;
uint32_t modwerk_machine_lock(void) { ++locks; return 0; }
void modwerk_machine_unlock(uint32_t was) { (void)was; --locks; }
static unsigned unit_entry(uint8_t *e, unsigned i, unsigned name_at)
{
    e[name_at - 4] = (uint8_t)(unit[i].id >> 24), e[name_at - 3] = (uint8_t)(unit[i].id >> 16), e[name_at - 2] = (uint8_t)(unit[i].id >> 8), e[name_at - 1] = (uint8_t)unit[i].id;
    for (unsigned c = 0; c < 16u; ++c) e[name_at + c] = c < strlen(unit[i].name) ? (uint8_t)unit[i].name[c] : 0;
    return 1;
}
unsigned modwerk_runtime_list(uint8_t *out, unsigned first, unsigned most)
{
    unsigned n = 0, seen = 0;
    for (unsigned i = 0; i < unit_count && n < most; ++i) if (unit[i].on && seen++ >= first) n += unit_entry(out + 4 + 24 * n, i, 8);
    out[3] = (uint8_t)n;
    return 4 + 24 * n;
}
unsigned modwerk_modset_off_list(uint8_t *out, unsigned first, unsigned most)
{
    unsigned n = 0, seen = 0;
    if (shelf_moving || !locks) return 0; /* the page reads it with the machine held */
    for (unsigned i = 0; i < unit_count && n < most; ++i) if (!unit[i].on && seen++ >= first) {
        uint8_t *e = out + 8 + MODSET_OFF_ENTRY * n++;
        memset(e, 0, MODSET_OFF_ENTRY); e[0] = 0xff; unit_entry(e, i, 8);
    }
    out[3] = (uint8_t)n;
    return 8 + MODSET_OFF_ENTRY * n;
}
volatile uint32_t modwerk_modset_switch_result;
int modwerk_modset_switch(uint32_t id, int on) { asked_id = id, asked_on = (unsigned)on, modwerk_modset_switch_result = MODSET_SWITCH_PENDING; return 1; }
/* Fixture for the panel tests. test_settings.c exercises the real table and battery store. */
static struct modwerk_setting_view settings_fixture[] = {
    { 2, 3, 0, "USB AUDIO", {"ALL CHANNELS", "OFF", "MAIN + CUE ONLY"}, 0, {{0}} },
    { 2, 6, 5, "OTHER MOD", {"ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX"}, 0, {{0}} }
};
static unsigned fixture_rows, selections, grouped_fixture;
void modwerk_settings_tick(void) {}
unsigned modwerk_settings_count(void) { return fixture_rows; }
unsigned modwerk_settings_read(unsigned i, struct modwerk_setting_view *v)
{
    if (i >= fixture_rows) return 0;
    *v = settings_fixture[i];
    if (grouped_fixture && !i) {
        v->fields = 1; v->count = 2; v->active = 0;
        strcpy(v->choices[0], "LAYOUT"); strcpy(v->choices[1], "TRACK TAP"); strcpy(v->values[1], "POST LEVEL");
    }
    return 1;
}
unsigned modwerk_settings_field(unsigned i, unsigned field, struct modwerk_setting_view *v)
{
    if (field == MODWERK_SETTING_FIELDS) return modwerk_settings_read(i,v);
    if (!grouped_fixture || i || field != 1) return 0;
    *v = settings_fixture[0];
    strcpy(v->label,"TRACK TAP");
    strcpy(v->choices[0],"PRE LEVEL"); strcpy(v->choices[1],"POST LEVEL");
    v->count=2; return 1;
}
void modwerk_settings_choose(unsigned i, uint32_t epoch, unsigned field, unsigned choice)
{
    CHECK((field == MODWERK_SETTING_FIELDS || (grouped_fixture && field == 1)) && i < fixture_rows && epoch == settings_fixture[i].epoch && choice < settings_fixture[i].count);
    settings_fixture[i].active = choice;
    ++selections;
}
static void settings_press(int key)
{
    CHECK(modwerk_status_key(key, 1));
    CHECK(modwerk_status_key(key, 0));
}
static void check_settings_panel(void)
{
    modwerk_test_menu_open = 1;
    modwerk_settings_menu(0);
    CHECK(strstr(shows(), "NO MODULE HAS A SETTING."));
    fixture_rows = 1u;
    CHECK(strstr(shows(), "SETTINGS|USB AUDIO|") && !strstr(said, "ALL CHANNELS"));
    settings_press(YES);
    CHECK(strstr(shows(), "USB AUDIO|ALL CHANNELS|OFF|MAIN + CUE ONLY|"));
    settings_press(DOWN);
    (void)shows();
    CHECK(!selections && lit(X0 + 11u, Y0 + 15u) && !lit(X0 + 11u, Y0 + 23u)); /* active remains on ALL */
    settings_press(NO);
    CHECK(strstr(shows(), "SETTINGS|USB AUDIO|") && !selections);
    settings_press(YES);
    CHECK(setting_option.row == 0u);
    settings_press(DOWN);
    settings_press(YES);
    (void)shows();
    CHECK(selections == 1u && !lit(X0 + 11u, Y0 + 15u) && lit(X0 + 11u, Y0 + 23u));
    settings_press(NO);
    fixture_rows = 2u;
    CHECK(strstr(shows(), "SETTINGS|USB AUDIO|OTHER MOD|"));
    settings_press(DOWN);
    settings_press(YES);
    CHECK(strstr(shows(), "OTHER MOD|TWO|THREE|FOUR|FIVE|SIX|") && setting_option.row == 5u);
    settings_press(UP);
    ++settings_fixture[1].epoch;
    settings_press(YES);
    CHECK(selections == 1u && strstr(shows(), "SETTINGS|USB AUDIO|OTHER MOD|"));
    settings_press(NO);
    CHECK(open == CLOSED);
    grouped_fixture = 1;
    modwerk_settings_menu(0);
    settings_press(YES);
    CHECK(strstr(shows(),"USB AUDIO|LAYOUT|TRACK TAP|POST LEVEL|"));
    settings_press(DOWN); settings_press(YES);
    CHECK(strstr(shows(),"TRACK TAP|PRE LEVEL|POST LEVEL|"));
    settings_press(UP); settings_press(YES);
    CHECK(selections == 2 && !settings_fixture[0].active);
    settings_press(NO);
    CHECK(strstr(shows(),"USB AUDIO|LAYOUT|TRACK TAP|POST LEVEL|"));
    settings_press(NO);
    CHECK(strstr(shows(),"SETTINGS|USB AUDIO|OTHER MOD|"));
    settings_press(NO);
    grouped_fixture = 0;
    fixture_rows = 0;
    modwerk_test_menu_open = close_menu = 0;
}
int main(void)
{
    check_settings_panel();
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
    /* A module switched off on MODULES is named by the project, not gone (owner, 16 November 2026). One the player just
     * switched off there opens nothing by itself; once a project loads, the page opens for it, says OFF beside it and
     * YES switches it on. */
    off_module = 0x100u, listed = 1; quiet_add(0x100u); missing_check(); missing_check(); CHECK(open == CLOSED && quiet_count == 1);
    fx_loading = 1; missing_check(); fx_loading = 0; missing_check(); CHECK(open == MISSING && !quiet_count);
    CHECK(strstr(shows(), "MODA (OFF)|") && strstr(said, "SWITCH ON|") && strstr(said, "NO|") && !strstr(said, "NOT INSTALLED"));
    asked_id = 0; CHECK(modwerk_status_key(YES, 1) && modwerk_status_key(YES, 0) && open == MISSING && on_count == 1);
    missing_on_tick(); CHECK(asked_id == 0x100u && asked_on == 1 && on_waiting);
    CHECK(strstr(shows(), "SWITCHING ON...|"));
    asked_id = 0; CHECK(modwerk_status_key(YES, 1) && modwerk_status_key(YES, 0) && !asked_id); /* one run at a time */
    modwerk_modset_switch_result = MODSET_SWITCHED, off_module = 0; missing_on_tick(); CHECK(!on_count);
    listed = 0; missing_check(); CHECK(open == CLOSED);                /* it runs: nothing is missing, the page closes */
    /* A refusal ends the run and is said; NO closes the page. */
    off_module = 0x100u, listed = 1; missing_check(); missing_check(); CHECK(open == MISSING);
    modwerk_status_key(YES, 1); modwerk_status_key(YES, 0); missing_on_tick();
    modwerk_modset_switch_result = MODSET_SWITCH_PLAYING; missing_on_tick();
    CHECK(!on_count && strstr(shows(), "STOP PLAYBACK FIRST|") && strstr(said, "NO|"));
    CHECK(modwerk_status_key(NO, 1) && modwerk_status_key(NO, 0) && open == CLOSED);
    /* One off, one not installed: both listed, YES switches on only the one that is off. */
    open = MISSING, missing_top = 0, missing_asked = 1, listed = 2; missing_check();
    CHECK(strstr(shows(), "MODA (OFF)|") && strstr(said, "MODB|") && strstr(said, "SWITCH ON|"));
    asked_id = 0; modwerk_status_key(YES, 1); modwerk_status_key(YES, 0); CHECK(on_count == 1); missing_on_tick(); CHECK(asked_id == 0x100u);
    modwerk_modset_switch_result = MODSET_SWITCHED, off_module = 0; missing_on_tick(); CHECK(!on_count);
    missing_check(); CHECK(open == MISSING && strstr(shows(), "2 NOT INSTALLED|")); /* the stub still lists both */
    /* Nothing off: YES only closes, as before. */
    CHECK(modwerk_status_key(YES, 1) && modwerk_status_key(YES, 0) && open == CLOSED);
    off_module = off_module2 = 0, listed = 0, missing_asked = 0; missing_check(); CHECK(open == CLOSED);
    /* A machine the project uses that is absent (machine_registry.c's map; owner, 16 November 2026): it opens the page
     * as an effect does, with where the project uses it; switched off, it says OFF and YES switches it on, by module. */
    unsigned refreshed = machine_refreshes;
    listed_machines = 1; missing_check(); missing_check();
    CHECK(machine_refreshes == refreshed + 2 && open == MISSING);
    CHECK(strstr(shows(), "POLY8|") && strstr(said, "BANK B PART 3 T8|") && strstr(said, "1 NOT INSTALLED|"));
    CHECK(modwerk_status_key(NO, 1) && modwerk_status_key(NO, 0) && open == CLOSED);
    missing_check(); missing_check(); CHECK(open == CLOSED);          /* told: it stays closed */
    off_module = 0x200u; missing_check(); CHECK(open == CLOSED);      /* switched off now: still told */
    open = MISSING, missing_top = 0, missing_asked = 1; missing_check();
    CHECK(strstr(shows(), "POLY8 (OFF)|") && strstr(said, "SWITCH ON|"));
    asked_id = 0; modwerk_status_key(YES, 1); modwerk_status_key(YES, 0); missing_on_tick(); CHECK(asked_id == 0x200u && asked_on == 1);
    modwerk_modset_switch_result = MODSET_SWITCHED, off_module = 0, listed_machines = 0; missing_on_tick(); CHECK(!on_count);
    open = CLOSED, missing_asked = 0; missing_check(); CHECK(open == CLOSED);
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
    /* The pick's CPU (owner, 17 November 2026: the box showed the DSP Tape Echo took, not the CPU): the frame share as
     * it stood, against the line where the guard starts dropping renders, in place of POOL. */
    { budget_on = 1, mw_stock_reserve = 0; /* the measured figure alone (the reserve: below) */
      frame_newest = 600u;                                             /* stopped, past half the line (1100) */
      modwerk_test_live_fx[13] = 29; ++dl_selection_completed; memory_tick();
      CHECK(open == MEMORY && budget_slot == 13 && pick_load == 600u);
      CHECK(strstr(shows(), "|MODS|110%|") && !strstr(said, "POOL"));          /* the modules' allowance: line less reserve */
      modwerk_status_key(0, 1), modwerk_status_key(0, 0);
      frame_newest = 1300u;                                            /* past the line: a full bar, no more */
      modwerk_test_live_fx[13] = 27; ++dl_selection_completed; memory_tick();
      CHECK(open == MEMORY && pick_load == 1300u && strstr(shows(), "|MODS|110%|"));
      modwerk_status_key(0, 1), modwerk_status_key(0, 0);
      modwerk_test_live_fx[13] = 0; ++dl_selection_completed; memory_tick();
      budget_on = 0, frame_newest = 0, mw_stock_reserve = RESERVE_ADAPTIVE; }
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
    CHECK(!strcmp(modwerk_load_label, "STATUS") && !strcmp(modwerk_modules_label, "MODULE COST")); /* not read as loading modules */
    modwerk_load_menu(0);
    CHECK(open == SHOWN && tip_until == ticks + 120u);                 /* from the menu: the CUE + PROJ tip for 2 s */
    CHECK(strstr(shows(), "CPU|") && strstr(said, "|DSP T1-4|") && strstr(said, "|DSP T5-8|") && strstr(said, "|MEM T1-4|") &&
          strstr(said, "|MEM T5-8|") && !strstr(said, "WORKING NOW") && !strstr(said, "DSP SPACE USED")); /* five rows, no headings */
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
    void modwerk_status_cpu_refused(unsigned track, const char *label, uint32_t booked, uint32_t add, uint32_t allowed);
    modwerk_status[CPU] = 640u;
    modwerk_status_cpu_refused(2, "Poly8", 360, 120, 450);                /* 36 % of 45 booked, POLY8's 12 % more */
    CHECK(open == REFUSED && refused_machine && refused[0] == 4 && refused[1] == 2 && refused_booked == 360 && refused[4] == 120);
    CHECK(!strcmp(refused_name, "POLY8") && strstr(shows(), "POLY8 NEEDS +27%|CPU|80%|CHANGE ONE FIRST|")); /* of the 45 % allowance */
    for (unsigned i = 0; i < 180u; ++i) memory_tick();
    CHECK(open == CLOSED);
    /* Every module pick is judged by the frame share the unit would play at (mw_frame_line): a machine's
     * (machine_registry.c) and an effect's, with the CPU FULL box in percent of the line. */
    int modwerk_status_pick_busy(unsigned slot, unsigned machine, const char *label, uint32_t add, uint32_t gone, uint32_t dsp);
    int modwerk_status_effect_busy(unsigned slot, unsigned id, unsigned old);
    void modwerk_status_cpu_entered(uint32_t mille), modwerk_status_cpu_left(uint32_t mille);
    void modwerk_machine_frame_costs(const uint8_t *table, unsigned n);
    CHECK(mw_frame_line == 1100u && mw_stock_reserve == RESERVE_ADAPTIVE && mw_track_stock == 70u);
    mw_frame_line = 500u, mw_stock_reserve = 0; /* the figures below in round numbers, the reserve tried on its own */
    { uint32_t before = mw_cpu_refusals;
      transport_stopped = 1, frame_newest = 400u;
      CHECK(modwerk_status_frame_load() == 400u);
      CHECK(!modwerk_status_pick_busy(5, 1, "Amiga", 99u, 0, 0) && open == CLOSED);   /* 49.9 %: passes */
      CHECK(modwerk_status_pick_busy(5, 1, "Amiga", 120u, 0, 0) && open == REFUSED && refused_machine && refused[0] == 4 && refused[1] == 5);
      CHECK(refused_booked == 400u && refused[4] == 120u && refused_allowed == 500u && refused_busy && mw_cpu_refusals == before + 1 && mw_cpu_refusal_tracks & 1u << 5);
      CHECK(!strcmp(refused_name, "AMIGA") && strstr(shows(), "AMIGA NEEDS +24%|CPU|80%|PART IS BUSY|")); /* no module: the Part's own load */
      for (unsigned i = 0; i < 180u; ++i) memory_tick();
      CHECK(open == CLOSED);
      /* A swap: what leaves comes off the kept figure, never off a stopped reading (which holds no renders). */
      frame_played = 450u;
      CHECK(!modwerk_status_pick_busy(5, 1, "Amiga", 70u, 30u, 0) && modwerk_status_pick_busy(5, 1, "Amiga", 70u, 0, 0));
      for (unsigned i = 0; i < 180u; ++i) memory_tick();
      frame_played = 0, frame_newest = 600u;
      CHECK(!modwerk_status_pick_busy(5, 1, "Amiga", 0, 300u, 0));      /* past the line already: a free pick is made */
      CHECK(modwerk_status_pick_busy(5, 1, "Amiga", 30u, 300u, 0) && refused_booked == 600u && refused_busy && strstr(shows(), "|CPU|100%|")); /* a dearer one: never past 100 % */
      for (unsigned i = 0; i < 180u; ++i) memory_tick();
      frame_newest = 0; }
    /* The kept figure: after STOP, the share of the last four seconds played, until four more replace it. */
    { transport_stopped = 0;
      for (unsigned i = 0; i < 8u; ++i) frame_recent[i] = 450u;
      for (unsigned r = 0; r < 7u; ++r) cpu_note_played();
      CHECK(!frame_played);                                              /* seven readings: not yet a whole window */
      cpu_note_played();
      CHECK(frame_played == 450u && modwerk_status_frame_load() == 450u);
      transport_stopped = 1, frame_newest = 300u;
      for (unsigned i = 0; i < 8u; ++i) frame_recent[i] = 300u;
      CHECK(modwerk_status_frame_load() == 450u);
      /* Quiet delays are what stock may add later: the reserve's, not the measured figure's (MKII, 22 November 2026: a
       * medium Part's four quiet delays took 7.2 of the room the reserve promised). */
      for (unsigned t = 0; t < 8u; ++t) mw_delay[17u + t] = 1;
      CHECK(modwerk_status_frame_load() == 450u);                        /* the kept figure as it played */
      frame_newest = 440u;
      CHECK(modwerk_status_frame_load() == 450u);
      for (unsigned t = 0; t < 8u; ++t) mw_delay[17u + t] = 0;
      transport_stopped = 0;
      for (unsigned i = 0; i < 8u; ++i) frame_recent[i] = 430u;
      frame_newest = 430u;                                               /* each reading is the newest too */
      for (unsigned r = 0; r < 8u; ++r) cpu_note_played();
      transport_stopped = 1, frame_newest = 300u;
      CHECK(frame_played == 430u && modwerk_status_frame_load() == 430u);
      /* Picks since count once: playing, the kept figure stays put while the mean takes the pick in. */
      transport_stopped = 0;
      modwerk_status_cpu_entered(100u);
      CHECK(modwerk_status_frame_load() == 530u);
      for (unsigned i = 0; i < 8u; ++i) frame_recent[i] = 530u;
      for (unsigned r = 0; r < 7u; ++r) cpu_note_played();
      CHECK(frame_played == 430u && frame_adjust == 100 && modwerk_status_frame_load() == 530u);
      cpu_note_played();
      CHECK(!frame_adjust && frame_played == 530u && modwerk_status_frame_load() == 530u);
      /* A module that leaves without a pick (a Part reload) takes its cost off the kept figure; a pick's own change of
       * the sum is its adjust's, not counted twice. */
      { uint32_t kept = frame_played;
        transport_stopped = 1, test_machines_booked = 313u; cpu_note_played();            /* FM Synth booked */
        test_machines_booked = 0; cpu_note_played();                                       /* the reload took it off */
        CHECK(frame_played == (kept > 313u ? kept - 313u : 0u));
        frame_played = kept, test_machines_booked = 200u, modwerk_status_cpu_entered(0); cpu_note_played();
        test_machines_booked = 0, modwerk_status_cpu_left(0); cpu_note_played();          /* a pick's exit */
        CHECK(frame_played == kept);
        test_machines_booked = 313u, modwerk_status_cpu_entered(0); cpu_note_played();    /* FM Synth picked */
        test_machines_booked = 0; cpu_note_played();                                       /* another Part ... */
        CHECK(frame_played == kept - 313u);
        test_machines_booked = 313u; cpu_note_played();                                    /* ... and this one again */
        CHECK(frame_played == kept);
        modwerk_status_cpu_left(0); cpu_note_played();                    /* a reading before the exit lands ... */
        test_machines_booked = 0; cpu_note_played();                      /* ... and after: the adjust's, once */
        CHECK(frame_played == kept);
        transport_stopped = 0, test_machines_booked = 0; }
      /* Stopped, a machine swapped out and back is judged by what it adds, once, never below the newest reading
       * (owner's MKII, 21 November 2026: Grain to FLEX and back right after STOP, refused at once). */
      transport_stopped = 1, frame_newest = 350u;
      for (unsigned i = 0; i < 8u; ++i) frame_recent[i] = 530u;         /* the readings still hold the play */
      modwerk_status_cpu_left(170u);
      CHECK(modwerk_status_frame_load() == 360u);                        /* 530 kept, less what left */
      modwerk_status_cpu_entered(170u);
      CHECK(modwerk_status_frame_load() == 530u);                        /* back: what it adds, once */
      modwerk_status_cpu_entered(120u);
      CHECK(modwerk_status_frame_load() == 650u);                        /* a second pick counts the first */
      transport_stopped = 0;
      for (unsigned r = 0; r < 7u; ++r) cpu_note_played();
      transport_stopped = 1; cpu_note_played(); transport_stopped = 0;    /* a stop between: the count starts again */
      for (unsigned r = 0; r < 7u; ++r) cpu_note_played();
      CHECK(frame_adjust == 120);
      cpu_note_played();
      CHECK(!frame_adjust);
      transport_stopped = 1, frame_played = frame_newest = 0, play_readings = adjust_readings = 0;
      for (unsigned i = 0; i < 8u; ++i) frame_recent[i] = 0; }
    /* An effect pick: by its measured cost from the site's table (MWMS v2), the Part's first slot of a module by its
     * first, a further one by its each, with the box on its slot ("T5 FX2"); stock effects and NONE pass and take their
     * old effect's cost off. A torn or unlisted table charges nothing but the wake from rest. */
    { uint32_t module = 0; uint16_t layout; char name[16]; uint8_t live[16];
      memcpy(live, modwerk_test_live_fx, sizeof live), memset(modwerk_test_live_fx, 0, sizeof live);
      map_module[27] = 0x9f482bb9u;                                     /* Tape Echo's package id */
      CHECK(modwerk_fxmap_describe(27, &module, &layout, name) && module == 0x9f482bb9u);
      uint8_t table[16] = {0};
      table[0] = (uint8_t)(module >> 24), table[1] = (uint8_t)(module >> 16), table[2] = (uint8_t)(module >> 8), table[3] = (uint8_t)module;
      table[5] = 80u, table[7] = 40u;                                     /* each 8 %, first 12 % */
      frame_newest = 280u;
      CHECK(!modwerk_status_effect_busy(11, 27, 0) && !frame_adjust);   /* no table yet: nothing charged */
      CHECK(!modwerk_status_module_rest(module));
      table[9] = 25u;                                                     /* 2.5 % installed on no slot */
      modwerk_machine_frame_costs(table, 1);
      CHECK(modwerk_status_module_rest(module) == 25u && !modwerk_status_module_rest(module + 1u));
      table[9] = 0;
      modwerk_machine_frame_costs(table, 1);
      CHECK(!modwerk_status_effect_busy(11, 27, 0) && frame_adjust == 120 && open == CLOSED); /* the Part's first */
      modwerk_test_live_fx[11] = 27;                                     /* stock wrote the pick */
      CHECK(!modwerk_status_effect_busy(11, 27, 27) && frame_adjust == 120); /* the same effect again: nothing more */
      CHECK(!modwerk_status_effect_busy(12, 27, 0) && frame_adjust == 200);  /* a further one: its each */
      modwerk_test_live_fx[12] = 27;
      CHECK(modwerk_status_effect_busy(13, 27, 0) == 1 && open == REFUSED && refused[0] == 4 && refused[1] == 13 && !refused_machine);
      CHECK(refused_booked == 480u && refused[4] == 80u && mw_cpu_refusal_tracks & 1u << 5 && frame_adjust == 200);
      CHECK(strstr(shows(), "FX7 NEEDS +16%|CPU|96%|PART IS BUSY|"));
      for (unsigned i = 0; i < 180u; ++i) memory_tick();
      CHECK(!modwerk_status_effect_busy(12, 8, 27) && frame_adjust == 120 && open == CLOSED); /* one of two leaves: each */
      modwerk_test_live_fx[12] = 8;
      CHECK(!modwerk_status_effect_busy(11, 8, 27) && !frame_adjust);   /* the last: its first */
      modwerk_test_live_fx[11] = 8;
      CHECK(!modwerk_status_effect_busy(11, 0, 8) && !modwerk_status_effect_busy(16, 27, 0) && !frame_adjust);
      effect_rests = 1, effect_wakes = 0, frame_newest = 381u;
      CHECK(modwerk_status_effect_busy(11, 27, 0) == 1 && !effect_wakes && effect_rests); /* 38.1 + 12: refused */
      for (unsigned i = 0; i < 180u; ++i) memory_tick();
      frame_newest = 379u;
      CHECK(!modwerk_status_effect_busy(11, 27, 0) && effect_wakes == 1 && effect_woken == 27u && frame_adjust == 120);
      frame_adjust = 0;
      modwerk_test_costs.sum ^= 1u;                                      /* torn: nothing listed */
      CHECK(!modwerk_status_effect_busy(11, 27, 0) && !frame_adjust);
      effect_rests = 1;                                                  /* unlisted, from rest: the default wake */
      CHECK(!modwerk_status_effect_busy(11, 27, 0) && frame_adjust == (int32_t)mw_wake_mille);
      modwerk_test_costs.sum ^= 1u, frame_adjust = 0;
      /* The stock reserve: judged as if the Part played a full stock load, with what its modules cost on top. */
      mw_stock_reserve = 300u, frame_newest = 100u;
      CHECK(modwerk_status_frame_load() == 300u);                         /* 10 % measured, 30 % reserved */
      CHECK(!modwerk_status_effect_busy(11, 27, 0) && frame_adjust == 120); /* 30 % + its first */
      modwerk_test_live_fx[11] = 27;
      CHECK(modwerk_status_frame_load() == 420u);                         /* the reserve with Tape Echo booked */
      CHECK(modwerk_status_effect_busy(12, 27, 0) == 1 && refused_booked == 420u && refused[4] == 80u && !refused_busy); /* 42 + 8 */
      CHECK(strstr(shows(), "FX7 NEEDS +16%|CPU|84%|CHANGE ONE FIRST|"));
      for (unsigned i = 0; i < 180u; ++i) memory_tick();
      dl_catalog[27].cycles = 312u;                                       /* an effect on the DSP too: its row, as DSP FULL's */
      CHECK(modwerk_status_effect_busy(12, 27, 0) == 1 && refused_dsp_add == 100u && strstr(shows(), "FX7 NEEDS +16%|DSP|10%|CPU|84%|"));
      CHECK(!strstr(said, "CHANGE ONE FIRST"));
      dl_catalog[27].cycles = 0;
      for (unsigned i = 0; i < 180u; ++i) memory_tick();
      test_machines_booked = 50u;
      CHECK(modwerk_status_frame_load() == 470u);                         /* the Part's machines too */
      frame_newest = 600u;
      CHECK(modwerk_status_frame_load() == 720u);                         /* measured past it: the unit's own figure */
      /* A machine takes a track that would play a sample: against the reserve it adds what it costs less that share. */
      test_machines_booked = 0, frame_newest = 100u, frame_adjust = 0, memset(modwerk_test_live_fx, 0, 16);
      CHECK(!modwerk_status_pick_busy(5, 1, "Amiga", 260u, 0, 0) && open == CLOSED);  /* 30 + 26 - 7 = 49 % */
      { uint32_t x = mw_frame_line - 300u + 10u;                          /* the line and 1 % past it, whole */
        CHECK(!modwerk_status_pick_busy(5, 1, "Amiga", x, 0, 0));         /* a machine's first: less the sample's share */
        CHECK(modwerk_status_pick_busy(5, 2, "Amiga", x, 0, 0));          /* a further one: whole */
        for (unsigned i = 0; i < 180u; ++i) memory_tick(); }
      CHECK(modwerk_status_pick_busy(5, 0, "Echo", 200u, 0, 0) && refused_booked == 300u && refused[4] == 200u); /* an effect: 30 + 20 % */
      for (unsigned i = 0; i < 180u; ++i) memory_tick();
      /* The set's measured stock figures take the compiled ones' place: a base whose stock got cheaper gives modules
       * more room with a new measurement and no new base. */
      { uint8_t t[24] = {0};
        memcpy(t, table, 12);
        t[12] = t[13] = t[14] = 0xff, t[15] = 0xf2, t[16] = 0x02, t[17] = 0x58;  /* line 60 % */
        modwerk_machine_frame_costs(t, 2);
        frame_newest = 100u, frame_adjust = 0, test_machines_booked = 50u, modwerk_test_live_fx[11] = 27;
        CHECK(modwerk_status_frame_load() == 470u);                       /* 30 % + machines 5 % + Tape Echo's first */
        CHECK(!modwerk_status_pick_busy(5, 0, "Echo", 120u, 0, 0) && open == CLOSED); /* 59 % under the set's 60 % line */
        modwerk_machine_frame_costs(table, 1);
        CHECK(modwerk_status_pick_busy(5, 0, "Echo", 120u, 0, 0));         /* the compiled 50 % line again: 59 % */
        for (unsigned i = 0; i < 180u; ++i) memory_tick(); }
      test_machines_booked = 0, mw_stock_reserve = 0, frame_adjust = 0;
      memset(&modwerk_test_costs, 0, sizeof modwerk_test_costs), memcpy(modwerk_test_live_fx, live, sizeof live);
      frame_newest = 0, effect_rests = 0, map_module[27] = 0; }
    mw_frame_line = 1100u, mw_stock_reserve = RESERVE_ADAPTIVE;
    /* A reading: the longest frame since the last, per mille of a frame, and the guard's record cleared; a reading with
     * no frame keeps what it had. */
    { mw_frame_window = 28735u; frame_note(0);                          /* 60 % of 47,891 counts */
      CHECK(frame_recent[0] == 600u && !mw_frame_window && frame_newest == 600u);
      mw_frame_window = 62259u; frame_note(1);                          /* 130 %: past the frame */
      CHECK(frame_recent[1] == 1300u);
      frame_recent[2] = 77u; frame_note(2);
      CHECK(frame_recent[2] == 77u && frame_newest == 1300u);
      for (unsigned i = 0; i < 8u; ++i) frame_recent[i] = 0;
      frame_newest = 0; }
    /* The frame display uses the same playback window across a restart. */
    { transport_stopped = 1, frame_played = 540u, mw_stock_reserve = 0;
      for (unsigned i = 0; i < 8u; ++i) frame_recent[i] = 200u;
      CHECK(modwerk_status_frame_load() == 540u);
      transport_stopped = 0;
      CHECK(modwerk_status_frame_load() == 540u);
      play_readings = 0;
      for (unsigned r = 0; r < 8u; ++r) cpu_note_played();
      CHECK(modwerk_status_frame_load() == 200u);
      /* The adaptive reserve: the bank's busiest step's figure and a margin, never under the floor; the set's figures
       * take the compiled ones' place. */
      mw_stock_reserve = RESERVE_ADAPTIVE, test_busiest = 0;
      CHECK(modwerk_status_frame_load() == 600u);                        /* an empty bank: the floor */
      test_busiest = 8;
      CHECK(modwerk_status_frame_load() == 1090u);                       /* eight tracks on a step: 101 % and 8 % */
      test_rest = 25u;
      CHECK(modwerk_status_frame_load() == 1115u);                       /* installed modules at rest on top */
      test_rest = 0, test_busiest = 1, test_tracks = 8;
      CHECK(modwerk_status_frame_load() == 904u);                        /* spread: 64.2 %, 2.6 % for seven more, 8 % */
      test_busiest = 8, test_tracks = 0;
      { uint8_t t[24] = {0xff, 0xff, 0xff, 0xfb, 0x03, 0x84, 0, 0, 0, 0, 0, 0, 0xff, 0xff, 0xff, 0xfc, 0, 20, 0, 0, 0, 0, 0, 0}; /* 90 % at eight, margin 2 % */
        modwerk_machine_frame_costs(t, 2);
        CHECK(modwerk_status_frame_load() == 920u);
        memset(&modwerk_test_costs, 0, sizeof modwerk_test_costs); }
      test_busiest = 0;
      transport_stopped = 1, frame_played = 0;
      for (unsigned i = 0; i < 8u; ++i) frame_recent[i] = 0; }
    /* A pick is not refused for load it does not add (owner): over the line already, a near-free one is made; a dearer
     * one is refused, and when the installed modules' cost at rest is what leaves no room, the box says so. */
    { transport_stopped = 1, frame_adjust = 0, frame_played = 0, frame_newest = 0, mw_stock_reserve = 1000u, test_rest = 300u;
      CHECK(!modwerk_status_pick_busy(12, 0, "Verb", 15u, 0, 0) && open == CLOSED);        /* 130 % before, +1.5 */
      CHECK(modwerk_status_pick_busy(12, 0, "Echo", 99u, 0, 0) && refused_busy == WHY_UNUSED);
      CHECK(strstr(shows(), "UNUSED MODULES"));
      for (unsigned i = 0; i < 180u; ++i) memory_tick();
      test_rest = 0;
      CHECK(modwerk_status_pick_busy(12, 0, "Echo", 250u, 0, 0) && refused_busy != WHY_UNUSED); /* 125 %: the pick's own */
      for (unsigned i = 0; i < 180u; ++i) memory_tick();
      mw_stock_reserve = RESERVE_ADAPTIVE; }
    /* The kept figure is the pattern's it was played on: on another one only that pattern's reserve and the newest
     * reading judge a pick. */
    { transport_stopped = 0, mw_stock_reserve = 0, frame_adjust = 0, test_pattern = 32u;  /* C01 */
      for (unsigned i = 0; i < 8u; ++i) frame_recent[i] = 1300u;
      play_readings = 0; for (unsigned r = 0; r < 8u; ++r) cpu_note_played();
      transport_stopped = 1, frame_newest = 300u;
      CHECK(frame_played == 1300u && modwerk_status_frame_load() == 1300u);
      test_pattern = 33u;                                                /* C02, stopped */
      CHECK(modwerk_status_frame_load() == 300u && !modwerk_status_pick_busy(12, 0, "Echo", 99u, 0, 0));
      test_pattern = 32u;
      CHECK(modwerk_status_frame_load() == 1300u);
      for (unsigned i = 0; i < 180u; ++i) memory_tick();
      frame_played = 0, frame_newest = 0, played_pattern = 0xffffu, test_pattern = 0, mw_stock_reserve = RESERVE_ADAPTIVE;
      for (unsigned i = 0; i < 8u; ++i) frame_recent[i] = 0; }
    /* The predicted brake: a pattern whose stock load with the Part's modules passes the ceiling goes without only what
     * it must, machines first, then effects that can bypass dry, and the screen names them once it plays. */
    { fx_set f[2]; uint16_t ids[2]; unsigned hushes = mw_frame_hushes;
      mw_stock_reserve = 1000u, test_machines_booked = 0, transport_stopped = 1;
      CHECK(!modwerk_status_hush(f, ids) && ids[0] == 32u && ids[1] == 0xffffu);
      test_machines_booked = 230u;                                       /* 100 + 23: past 122 % */
      CHECK(modwerk_status_hush(f, ids) == (32u << 24 | 2u << 16) && !hush_notice_left);   /* stopped: armed, no notice */
      transport_stopped = 0;
      CHECK(modwerk_status_hush(f, ids) == (32u << 24 | 2u << 16) && hush_notice_left == 180u && mw_frame_hushes == hushes + 1u);
      CHECK(strstr(shows(), "PATTERN IS BUSY|FM SYNTH|"));
      for (unsigned i = 0; i < 180u; ++i) memory_tick(), modwerk_status_hush(f, ids);
      CHECK(!hush_notice_left && mw_frame_hushes == hushes + 1u);       /* once a pattern */
      test_machines_booked = 210u;                                       /* 121 %: under it */
      CHECK(!modwerk_status_hush(f, ids));
      { uint8_t t[12] = {0x9f, 0x48, 0x2b, 0xb9, 0, 80u, 0, 40u, 0, 0, 0, 0}, live[16]; /* Tape Echo: first 12 % */
        memcpy(live, modwerk_test_live_fx, 16), memset(modwerk_test_live_fx, 0, 16);
        map_module[27] = 0x9f482bb9u, modwerk_machine_frame_costs(t, 1), modwerk_test_live_fx[11] = 27;
        mw_stock_reserve = 1110u, test_machines_booked = 50u;            /* 111 + 5 + 12: past it without the machine too */
        CHECK(modwerk_status_hush(f, ids) == (32u << 24 | 2u << 16) && !fx_any(f[0])); /* it cannot bypass: left as it is */
        test_dry = fx_with(test_dry, 27);
        CHECK(modwerk_status_hush(f, ids) == (32u << 24 | 2u << 16) && fx_in(f[0], 27) && hush_count == 2u);
        mw_stock_reserve = 1080u;                                        /* 108 + 12 once the machine is silent */
        CHECK(modwerk_status_hush(f, ids) == (32u << 24 | 2u << 16) && !fx_any(f[0]) && hush_count == 1u);
        memset(&modwerk_test_costs, 0, sizeof modwerk_test_costs), memcpy(modwerk_test_live_fx, live, 16), map_module[27] = 0;
        test_dry = (fx_set){{0}}; }
      test_machines_booked = 0, transport_stopped = 1, mw_stock_reserve = RESERVE_ADAPTIVE; hush_playing = 0; }
    /* A pick adding 2 % or less is always made; a machine on a track that plays a sample takes its share off the
     * measured figure too. */
    { transport_stopped = 1, mw_stock_reserve = 0, frame_adjust = 0, frame_played = 0, frame_newest = 1095u;
      CHECK(!modwerk_status_pick_busy(12, 0, "Chorus", 13u, 0, 0));       /* 109.5 + 1.3: crosses, near-free */
      frame_newest = 840u;
      CHECK(modwerk_status_pick_busy(1, 1, "Amiga", 266u, 0, 0));        /* 84 + 26.6: an empty track */
      for (unsigned i = 0; i < 180u; ++i) memory_tick();
      test_trigging = 1u << 1;
      CHECK(!modwerk_status_pick_busy(1, 1, "Amiga", 266u, 0, 0));       /* a sample track: 84 + 26.6 - 7 */
      CHECK(modwerk_status_pick_busy(1, 1, "Amiga", 266u, 100u, 0));    /* a swap: the track played a machine, no share off */
      for (unsigned i = 0; i < 180u; ++i) memory_tick();
      test_trigging = 0, frame_newest = 0, mw_stock_reserve = RESERVE_ADAPTIVE; }
    /* A pattern played four seconds is judged by its own stock as measured, with the margin, when that is under the
     * ladder's; other trigs, or another pattern, go by the ladder; a pattern change restarts the four seconds. */
    { mw_stock_reserve = RESERVE_ADAPTIVE, test_busiest = 4, test_tracks = 4, test_rest = 25u, test_pattern = 34u;
      transport_stopped = 0, frame_adjust = 0, frame_newest = 0;
      for (unsigned i = 0; i < 8u; ++i) frame_recent[i] = 788u;
      for (unsigned r = 0; r < 8u; ++r) cpu_note_played();
      CHECK(frame_played == 788u && played_stock == 763u && played_shape == (4u << 4 | 4u));
      transport_stopped = 1, frame_played = 0;
      CHECK(modwerk_status_frame_load() == 828u);                        /* 76.3 + 4 + 2.5, not 79.8 + 8 + 2.5 */
      test_tracks = 5;
      CHECK(modwerk_status_frame_load() == 929u);                        /* other trigs: the ladder, 79.8 + 2.6 + 8 + 2.5 */
      test_tracks = 4, test_pattern = 35u;
      CHECK(modwerk_status_frame_load() == 903u);                        /* another pattern: the ladder */
      transport_stopped = 0, play_readings = 0;
      for (unsigned r = 0; r < 7u; ++r) cpu_note_played();
      test_pattern = 34u, cpu_note_played();                             /* back before four seconds: none kept */
      CHECK(play_readings == 1u && played_pattern == 34u && played_stock == 763u);
      /* Against a measured stock, a machine's first instance nets what the sample was worth there (2.5 %), not a
       * sample track's share of the ladder (7 %); a further one, nothing, but its trig starts on a trigging track (twin 30,
       * C03: Amiga on 73.8 + 4 + 2.5, then a second one). */
      played_stock = 738u, transport_stopped = 1, frame_played = 0, frame_newest = 0;
      CHECK(!modwerk_status_pick_busy(0, 1, "Amiga", 266u, 0, 0));        /* 77.8 + 2.5 + 24.1 = 104.4 */
      test_machines_booked = 241u, test_trigging = 1u << 2;
      CHECK(modwerk_status_pick_busy(2, 2, "Amiga", 40u, 0, 0));          /* and 4 with its starts' 2.5: 110.9 */
      for (unsigned i = 0; i < 180u; ++i) memory_tick();
      test_trigging = 0;
      CHECK(!modwerk_status_pick_busy(2, 2, "Amiga", 40u, 0, 0));         /* on a track with no trigs: 108.4 */
      for (unsigned i = 0; i < 180u; ++i) memory_tick();
      test_machines_booked = 0;
      /* What played since the last pick counts when it is more than the kept figure with the picks on top. */
      mw_stock_reserve = 0, transport_stopped = 0, play_readings = 0, frame_played = 763u, frame_adjust = 0;
      modwerk_status_cpu_entered(266u);
      frame_newest = 1042u, cpu_note_played(), frame_newest = 1020u, cpu_note_played();
      transport_stopped = 1, frame_newest = 380u;
      CHECK(played_since == 1042u && modwerk_status_frame_load() == 1042u); /* not 76.3 + 26.6 */
      modwerk_status_cpu_entered(40u);
      CHECK(!played_since && modwerk_status_frame_load() == 1069u);      /* a pick since: the kept figure and both */
      /* A rollback or a reload takes modules off without a pick: what played before with them no longer counts; a
       * set installed, removed or undone starts the picks' account afresh (twin 32: a first Tape Echo at 77 % refused as
       * PART IS BUSY against the last set's 110 %). */
      transport_stopped = 0, frame_newest = 1100u, cpu_note_played();
      CHECK(played_since == 1100u);
      test_machines_booked = 300u, frame_newest = 780u, cpu_note_played(); /* the modules moved: what plays now */
      CHECK(played_since == 780u);
      test_machines_booked = 0, test_epoch = test_epoch + 1u, cpu_note_played();
      CHECK(!frame_adjust && played_since == 780u && play_readings == 1u);
      test_epoch = test_epoch + 1u, modwerk_status_cpu_entered(99u), cpu_note_played();
      CHECK(frame_adjust == 99);                                         /* a pick right after an install stays */
      frame_adjust = 0, transport_stopped = 1;
      frame_adjust = 0, mw_stock_reserve = RESERVE_ADAPTIVE, test_pattern = 34u;
      test_rest = 0, test_busiest = 0, test_tracks = 0, test_pattern = 0, played_shape = 0xffffffffu, played_pattern = 0xffffu;
      transport_stopped = 1, frame_played = 0;
      for (unsigned i = 0; i < 8u; ++i) frame_recent[i] = 0; }
    /* Playing, what a pick replaces leaves the last four seconds too: a swap for a lighter module is never refused. */
    { transport_stopped = 0, mw_stock_reserve = 0, frame_adjust = 0, frame_played = 0;
      for (unsigned i = 0; i < 8u; ++i) frame_recent[i] = 1150u;
      CHECK(!modwerk_status_pick_busy(2, 1, "Lite", 100u, 200u, 0) && open == CLOSED);   /* 115 - 20 + 10 = 105 % */
      CHECK(modwerk_status_pick_busy(2, 1, "Heavy", 300u, 200u, 0));                     /* 125 % */
      for (unsigned i = 0; i < 180u; ++i) memory_tick();
      for (unsigned i = 0; i < 8u; ++i) frame_recent[i] = 0;
      mw_stock_reserve = RESERVE_ADAPTIVE, transport_stopped = 1; }
    modwerk_load_menu(0); modwerk_status_cpu_refused(2, "Poly8", 800, 266, 450);
    CHECK(open == SHOWN);
    CHECK(strstr(shows(), "MODWERK BASE 0.7|"));                       /* the status page names the base by its version */
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
    /* MODULES: every installed module by name, on or off; YES asks modset.c to switch the one under the cursor. */
    modwerk_switches_menu(0); CHECK(open == CLOSED);
    unit[0].id = 0x30u, unit[0].name = "Tape Echo", unit[0].on = 1; unit[1].id = 0x10u, unit[1].name = "Euclid", unit[1].on = 0;
    unit[2].id = 0x20u, unit[2].name = "", unit[2].on = 1; unit_count = 3;
    for (unsigned i = 3; i < 7u; ++i) unit[i].id = 0x40u + i, unit[i].name = "Zz", unit[i].on = 1;
    modwerk_test_menu_open = 1; modwerk_switches_menu(0);
    CHECK(open == SWITCHES && switch_count == 3 && !switch_cursor && !locks);
    CHECK(switches[0].id == 0x10u && !switches[0].on && !strcmp(switches[0].name, "EUCLID"));
    CHECK(switches[1].id == 0x30u && switches[1].on && !strcmp(switches[1].name, "TAPE ECHO") && !strcmp(switches[2].name, "UNNAMED"));
    (void)shows();
    CHECK(strstr(said, "MODULES") && strstr(said, "EUCLID") && strstr(said, "OFF") && strstr(said, "TAPE ECHO") && strstr(said, "ON/OFF"));
    CHECK(modwerk_status_key(YES, 1) && modwerk_status_key(YES, 0) && open == SWITCHES && asked_id == 0x10u && asked_on == 1);
    (void)shows(); CHECK(strstr(said, "...") && !strstr(said, "OFF "));
    asked_id = 0; CHECK(modwerk_status_key(YES, 1) && modwerk_status_key(YES, 0) && !asked_id); /* one answer at a time */
    unit[1].on = 1, modwerk_modset_switch_result = MODSET_SWITCHED; switches_tick();
    CHECK(switches[0].on && !switch_waiting && !switch_said && !switch_cursor);
    /* A refusal is said in the last line, and the row stays as it was. */
    CHECK(modwerk_status_key(DOWN, 1) && modwerk_status_key(DOWN, 0) && switch_cursor == 1);
    CHECK(modwerk_status_key(YES, 1) && modwerk_status_key(YES, 0) && asked_id == 0x30u && asked_on == 0);
    modwerk_modset_switch_result = MODSET_SWITCH_REFUSED + RUNTIME_IN_USE; switches_tick();
    (void)shows(); CHECK(strstr(said, "IN USE ON A TRACK") && switches[1].on);
    modwerk_status_key(YES, 1); modwerk_status_key(YES, 0); modwerk_modset_switch_result = MODSET_SWITCH_PLAYING; switches_tick();
    (void)shows(); CHECK(strstr(said, "STOP PLAYBACK FIRST"));
    /* A start that did not load the card's whole set: a restart when that brings it back, else a sync (owner, 16
     * November 2026: after a base update RESTART FIRST came back the same). */
    modwerk_status_key(YES, 1); modwerk_status_key(YES, 0); modwerk_modset_switch_result = MODSET_SWITCH_PARTIAL; switches_tick();
    (void)shows(); CHECK(strstr(said, "RESTART FIRST"));
    modwerk_status_key(YES, 1); modwerk_status_key(YES, 0); modwerk_modset_switch_result = MODSET_SWITCH_SYNC; switches_tick();
    (void)shows(); CHECK(strstr(said, "SYNC ON THE SITE FIRST"));
    /* Switched off while another Part of the project names it: where, and nothing when it is named nowhere. */
    map_module[20] = 0x30u;
    modwerk_status_key(YES, 1); modwerk_status_key(YES, 0); CHECK(asked_id == 0x30u && asked_on == 0);
    modwerk_modset_switch_result = MODSET_SWITCHED; switches_tick();
    CHECK(switch_said == used_text && !strcmp(used_text, "USED IN C SAVED PART 2 T5"));
    CHECK(is_quiet(0x30u));                                             /* MISSING will not open for it by itself */
    (void)shows(); CHECK(strstr(said, "USED IN ANOTHER PART|"));         /* the host's letters are wider than the unit's */
    map_module[20] = 0;
    modwerk_status_key(YES, 1); modwerk_status_key(YES, 0); modwerk_modset_switch_result = MODSET_SWITCHED; switches_tick();
    CHECK(!switch_said);
    /* A machine another bank's Part uses, by the project's machine map: where too. */
    switch_waiting = 0, switch_asked = 0x10u, switch_asked_on = 0, switch_waiting = 1, modwerk_modset_switch_result = MODSET_SWITCHED;
    switches_tick(); CHECK(switch_said == used_text && !strcmp(used_text, "USED IN B PART 3 T8"));
    asked_on = 1; unit[0].on = 0; switches_read(); /* switched on: nothing said either */
    modwerk_status_key(YES, 1); modwerk_status_key(YES, 0); CHECK(asked_on == 1);
    map_module[20] = 0x30u; modwerk_modset_switch_result = MODSET_SWITCHED; switches_tick(); CHECK(!switch_said);
    map_module[20] = 0; unit[0].on = 1; switches_read();
    /* A shelf that moves is read at the next tick; the cursor follows its module when a host changes the set. */
    unit_count = 7; shelf_moving = 1; ticks += 60u; switches_tick(); CHECK(switch_count == 3 && switch_stale); /* the second's reading */
    shelf_moving = 0; switches_tick(); CHECK(switch_count == 7 && switches[switch_cursor].id == 0x30u && !switch_stale);
    for (unsigned i = 0; i < 9u; ++i) modwerk_status_key(DOWN, 1), modwerk_status_key(DOWN, 0);
    CHECK(switch_cursor == 6 && switch_top == 2);                       /* seven modules, five rows */
    CHECK(!modwerk_status_key(PLAY, 1) && !modwerk_status_key(PLAY, 0) && open == SWITCHES); /* PLAY reaches stock, it stays */
    CHECK(modwerk_status_key(NO, 1) && modwerk_status_key(NO, 0) && open == CLOSED);
    if (failures) return 1;
    puts("status keys: ok");
    return 0;
}
