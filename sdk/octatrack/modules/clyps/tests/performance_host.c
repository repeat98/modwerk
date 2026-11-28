/* SPDX-License-Identifier: GPL-3.0-or-later */
#include <assert.h>
#include <stdio.h>
#include <string.h>
#define CLYPS_HOST_TEST
#define CLYPS_PERFORMANCE
#include "../live_module.c"
static unsigned char content[16][8];   /* nonzero: that track of that pattern has a trig */
static unsigned running, popup, midi, record, live_record, bank, pattern_chain, bad_grid, held_key = 64, held_key2 = 64, stock_track;

static uint32_t host_long(uintptr_t addr)
{
    if (addr == 0x800065b8u) return running;
    if (addr == 0x460d1e70u) return popup;
    if (addr == 0x460d172au) return live_record;
    if (addr == 0x80006546u) return pattern_chain;
    if (addr == 0x460d1736u) return record;
    return 0;
}
static unsigned grid_reads;
static uint8_t host_byte(uintptr_t addr)
{
    if (addr == 0x80000034u) return bank;
    if (addr == 0x80000015u) return midi;
    if (addr == 0x100b14ccu) return (uint8_t)stock_track;
    if (addr >= 0x46100b18u && addr < 0x46100b20u) {
        unsigned row = addr - 0x46100b18u, bits = 0;
        if (held_key < 64 && row == held_key/8) bits |= 1u << (held_key%8);
        if (held_key2 < 64 && row == held_key2/8) bits |= 1u << (held_key2%8);
        return (uint8_t)bits;
    }
    if (addr >= BANK_BASE && addr < BANK_BASE+16*PATTERN_BYTES) {
        ++grid_reads;
        unsigned offset = (addr-BANK_BASE)%PATTERN_BYTES;
        if (offset == 0x8e51 || offset == 0x8e53)
            return bad_grid && addr >= BANK_BASE+PATTERN_BYTES ? 32 : 16;
        if (offset == 0x8e52 || offset == 0x8e54) return 2;
        if (offset < 8 * TRACK_BYTES && offset % TRACK_BYTES == 0x07)   /* steps 1-8 of the trig mask */
            return content[(addr-BANK_BASE)/PATTERN_BYTES][offset / TRACK_BYTES];
    }
    return 0;
}
static void tap(unsigned key)
{
    assert(module_key(key,1));
    assert(module_key(key,0));
}
/* TRACK keys belong to the stock: it selects, CLYPS follows (D33). */
static void select_track(unsigned t)
{
    assert(!module_key(0x10 + t,1));
    stock_track = t;
    assert(!module_key(0x10 + t,0));
}
static unsigned org(const volatile uint32_t *o, unsigned lane) { return origin(o, lane); }
/* A fresh install: since the bank guard (Codex 06-B), project_init with rows defined suspends
 * CLYPS for the instance, so a new scenario starts from cleared module memory. */
static void host_fresh(void)
{
    bank_uncertain = 0; defined = 0; playing = requested = 0; pending_row = last_row = 0;
    for (unsigned i = 0; i < 16; ++i) rows[i] = 0;
    clyps_project_init();
    assert(!bank_uncertain);
}
/* Codex 06-B: stock returns the same callback after EOF and after a completed read. Rows,
 * values and mask survive; the sources go back to the stock and CLYPS stays suspended. */
static void bank_case(int active, int success, int init_first)
{
    tap(ARR); assert(view == CLIP); tap(6); tap(ARR); assert(view == ROW);
    for (unsigned i = 0; i < 3; ++i) tap(DOWN);
    tap(PAGE_KEY); tap(YES); tap(3);
    assert(defined == 8 && rows[3] == 6 && playing == 6);
    uint32_t snapshot[16];
    memcpy(snapshot, rows, sizeof rows);
    running = active;
    if (active) { tap(3); assert(pending_row == 4); }
    clyps_bank_load(2, 0);                                /* an unrelated bank changes nothing */
    clyps_bank_loaded();
    assert(defined == 8 && playing == 6 && pending_row == (active ? 4u : 0u));
    if (init_first) clyps_project_init();
    clyps_bank_load(1, 0);
    unsigned before = grid_reads;
    int source = 0;
    clyps_audio_source(&source, 0, 0);
    clyps_wrap();
    (void)success;                                        /* the module cannot tell EOF from success */
    clyps_bank_loaded();
    bank = 1; clyps_project_init(); bank = 0;
    clyps_bank_loaded();                                  /* an extra notification cannot certify A */
    clyps_audio_source(&source, 0, 0);
    clyps_wrap();
    for (unsigned n = 0; n < 20; ++n) module_tick(&(struct modwerk_runtime_api){0});
    assert(!supported() && !module_key(ARR, 1));
    assert(grid_reads == before && source == 0);           /* occupancy never reads a suspended bank */
    assert(!playing && !requested && !pending_row && !last_row);
    assert(!org_play[0] && !org_play[1] && !org_req[0] && !org_req[1]);
    assert(defined == 8 && !memcmp(snapshot, rows, sizeof rows));
}
static void alpha2_session(void)
{
    midi=1;
    assert(!module_key(ARR,1));
    midi=0; record=1;
    assert(!module_key(ARR,1));
    record=0; live_record=1;
    assert(!module_key(ARR,1)); live_record=0;
    pattern_chain=1;
    assert(!module_key(ARR,1)); pattern_chain=0;
    bank=1;
    assert(!module_key(ARR,1)); bank=0;
    held_key=0x2d;
    assert(!module_key(ARR,1));
    held_key=64;
    tap(ARR); assert(view == CLIP);                      /* Clip View first (D39.02) */
    tap(ARR); assert(view == ROW); tap(YES);
    assert(end_of_path && !pending_row && !last_row);
    tap(DOWN); tap(PAGE_KEY); tap(YES);
    tap(ARR); select_track(1); tap(2);
    tap(ARR); tap(DOWN); tap(DOWN); tap(DOWN); tap(PAGE_KEY); tap(YES);
    assert(defined==18 && slot==4 && playing==0x20);
    running=1;
    assert(module_key(YES,1) && module_key(YES,1));
    assert(pending_row==2 && last_row==0 && slot==4);
    assert(module_key(YES,0));
    tap(YES);
    assert(pending_row==2 && playing==0x20);
    clyps_wrap();
    assert(last_row==2 && !pending_row && !playing);
    tap(YES);
    assert(pending_row==5 && !module_key(STOP,1));
    clyps_wrap();
    assert(last_row==2 && !playing && !pending_row);
    tap(4); tap(0);  /* Undefined row cannot erase the confirmed pending launch. */
    assert(pending_row==5 && last_row==2);
    clyps_wrap();
    tap(ARR); select_track(1); tap(3); clyps_wrap();
    assert(playing==0x30 && last_row==5);
    tap(ARR); tap(YES); assert(end_of_path && !pending_row);
    tap(PAGE_KEY); tap(DOWN); tap(9); tap(YES);
    assert(rows[4]==0x90 && playing==0x30);
    bad_grid=1; tap(4); assert(refused && !pending_row); bad_grid=0;
    popup=1;                                              /* a stock popup suspends, never closes, CLYPS */
    assert(!module_key(YES,1)); assert(!module_enc(LEVEL_KNOB,1)); popup=0; assert(!module_key(YES,1)); assert(!module_key(YES,0));
    assert(mode && view == ROW && visible && playing == 0x30 && last_row == 5);
    tap(NO); assert(view == NATIVE && locked);
    running=0; tap(YES);
    assert(!locked && !playing && !last_row);
    tap(ARR); tap(YES);
    assert(last_row==2);
    assert(module_key(DOWN,1)); popup=1;
    assert(module_key(DOWN,0));  /* Release stays with the initial owner. */
    popup=0;
    tap(ARR);
    clyps_bank_load(1,0);
    assert(!module_key(ARR,1) && !mode);
    clyps_bank_loaded();
    clyps_project_init();                                /* Codex 06-B: rows kept, CLYPS suspended */
    assert(!mode && defined == 18 && !last_row && !playing && !supported());
    host_fresh();

    /* D33 · A1: the stock tab and CLYPS name the same track in every view. */
    stock_track = 2;
    tap(ARR); assert(view == CLIP && track == 2);
    tap(ARR); assert(view == ROW && track == 2);
    tap(RIGHT); tap(LEFT); assert(track == 2);          /* no silent split from the stock tab */
    select_track(5); assert(module_key(DOWN,1) && module_key(DOWN,0)); assert(track == 5);
    tap(ARR); assert(view == CLIP && track == 5);
    select_track(0); tap(UP); assert(track == 0);

    /* A2: the crossfader and Scene gestures reach the stock while CLYPS is on screen. */
    assert(!module_key(64,1) && !module_key(64,0));
    assert(!module_key(SCENE_A,1));
    held_key = SCENE_A; assert(!module_key(3,1)); assert(!module_key(3,0)); held_key = 64;
    assert(!module_key(SCENE_A,0));
    assert(view == CLIP && !playing && !requested);

    /* C1/C2: Panorama TRACK + TRIG launches one cell; the path and the other lanes stay. */
    host_fresh(); stock_track = 0;
    tap(ARR); tap(ARR); tap(PAGE_KEY); tap(YES);         /* R01 = home */
    tap(DOWN); tap(DOWN); tap(PAGE_KEY); tap(YES);
    tap(PAGE_KEY); tap(DOWN); tap(7); tap(YES);          /* R03: T1 = A08 */
    select_track(2); tap(DOWN); tap(PAGE_KEY); tap(YES);
    tap(PAGE_KEY); tap(DOWN); tap(5); tap(YES);          /* R04: T3 = A06 */
    assert(defined == 0xd && rows[2] == 0x7 && rows[3] == 0x500);
    tap(0);                                              /* stopped Row launch R01 */
    assert(last_row == 1 && org(org_play,0) == 1 && org(org_play,7) == 1);
    running = 1;
    held_key = 0x12; assert(!module_key(0x12,1));         /* hold T3 (stock selects it) */
    stock_track = 2;
    held_key2 = 3; assert(module_key(3,1)); assert(module_key(3,0)); held_key2 = 64;
    assert(!module_key(0x12,0)); held_key = 64;
    assert(requested == 0x500 && playing == 0 && !pending_row && last_row == 1);
    assert(org(org_req,2) == 4 && org(org_play,2) == 1 && org(org_req,0) == 1);
    assert(rows[3] == 0x500 && rows[0] == 0);           /* stored Rows unchanged */
    assert(!module_key(STOP,1) && !module_key(STOP,0));    /* STOP cancels source and origin */
    assert(requested == 0 && org(org_req,2) == 1);
    held_key = 0x12; held_key2 = 3; assert(module_key(3,1)); assert(module_key(3,0)); held_key = held_key2 = 64;
    clyps_wrap();
    assert(playing == 0x500 && org(org_play,2) == 4 && org(org_play,0) == 1 && last_row == 1);
    held_key = 0x10; held_key2 = 2; assert(module_key(2,1)); assert(module_key(2,0)); held_key = held_key2 = 64;
    clyps_wrap();                                        /* T1 from R03: A08 */
    assert(playing == 0x507 && org(org_play,0) == 3 && last_row == 1);
    tap(YES); assert(pending_row == 3); clyps_wrap();    /* Row Advance stays independent */
    assert(last_row == 3 && playing == 0x7 && org(org_play,2) == 3);
    held_key = 0x11; held_key2 = 9; assert(module_key(9,1)); held_key = held_key2 = 64;
    assert(missing && requested == 0x7);                 /* undefined Row: nothing launches */
    assert(module_key(9,0));
    tap(2); clyps_wrap();                                /* duplicate: R03 again keeps R03 origin */
    assert(org(org_play,0) == 3);

    /* B1: Selective Edit Lock. Sound is free, sequence edits are held. */
    tap(NO); assert(view == NATIVE && locked);
    assert(!module_key(0x23,1) && !module_key(0x23,0));  /* AMP page */
    assert(!module_key(0x14,1)); stock_track = 4; assert(!module_key(0x14,0));
    assert(!module_enc(0, 3) && !module_enc(LEVEL_KNOB, -2));   /* plain turns edit the Part */
    held_key = SCENE_B; assert(!module_enc(1, 1)); assert(!module_key(4,1)); assert(!module_key(4,0)); held_key = 64;
    assert(module_key(5,1) && lock_note); assert(module_key(5,0));       /* trig edit held */
    held_key = 6; assert(module_enc(0, 1)); held_key = 64;               /* p-lock held */
    assert(!module_key(0x2d,1));                                         /* FUNC is a modifier (D43.03) */
    held_key = 0x2d; assert(!module_enc(0, 1));                          /* FUNC + knob: a fine Part edit */
    assert(!module_key(0x13,1) && !module_key(0x13,0));                  /* FUNC + TRACK: stock mute */
    assert(module_key(5,1) && module_key(5,0)); held_key = 64;            /* FUNC + TRIG stays held */
    assert(!module_key(0x2d,0));
    assert(module_key(0x2e,1) && module_key(0x2e,0));                    /* PATTERN */
    assert(!module_key(0x24,1) && !lock_note); assert(!module_key(0x24,0));
    assert(!module_key(64,1));
    assert(playing == 0x7 && last_row == 3);

    /* B2: ARR returns to the remembered view; the Clip focus survives on the same track. */
    tap(ARR); assert(view == ROW && track == 4);
    tap(ARR); assert(view == CLIP);
    tap(DOWN); unsigned kept = src_cursor;
    assert(!module_key(0x25,1) && !module_key(0x25,0) && view == NATIVE);
    tap(ARR); assert(view == CLIP && src_cursor == kept);
    tap(NO); select_track(0); tap(ARR); assert(view == CLIP && track == 0 && src_cursor == 7);

    /* C3: LEVEL navigates and never launches. */
    tap(ARR); assert(view == ROW);
    unsigned before = requested;
    assert(module_enc(LEVEL_KNOB, 3)); assert(slot == 6 && requested == before);
    tap(PAGE_KEY); assert(module_enc(LEVEL_KNOB, 2) && operation == RESTORE_HOME);
    tap(YES); assert(refused && playing == 0x7);         /* Restore All refuses during play */
    running = 0; tap(YES); assert(!playing && !last_row && !org(org_play,0));

    /* Sprint 06-A · WP-A1: FUNC, TEMPO and mutes never leave CLYPS. */
    host_fresh(); stock_track = 0;
    tap(ARR); assert(view == CLIP);
    assert(!module_key(0x2d,1) && !module_key(0x2d,0) && view == CLIP && mode);
    held_key = 0x2d; assert(!module_key(0x11,1)); assert(!module_key(0x11,0)); held_key = 64;
    assert(view == CLIP && mode && track == 0);
    assert(!module_key(0x18,1));                         /* TEMPO reaches the stock */
    popup = 1; assert(!module_key(0x18,0)); assert(!module_enc(LEVEL_KNOB, 4)); assert(!module_key(NO,1));
    assert(mode && view == CLIP && src_cursor == 0);     /* suspended, not closed */
    assert(!module_key(NO,0)); popup = 0;
    assert(module_enc(LEVEL_KNOB, 1) && src_cursor == 1);

    /* WP-A1 sidebar: a TRIG launch moves the focus with it, so plate, grid and bar agree. */
    running = 1; tap(2); assert(requested == 2 && src_cursor == 2 && !playing);
    clyps_wrap(); assert(playing == 2);
    assert(!module_key(STOP,1) && !module_key(STOP,0)); running = 0;

    /* WP-A3: FUNC + LEVEL moves the Panorama column only; the next stock track takes it back. */
    tap(ARR); assert(view == ROW && track == 0);
    unsigned req = requested, s0 = slot;
    held_key = 0x2d; assert(module_enc(LEVEL_KNOB, 3)); held_key = 64;
    assert(track == 3 && stock_track == 0 && requested == req && slot == s0);
    assert(module_enc(LEVEL_KNOB, 2) && slot == s0 + 2 && track == 3);
    select_track(6); assert(track == 6);
    tap(ARR); assert(view == CLIP && track == 6);         /* Clip View always shows the stock track */
    select_track(0); tap(ARR);

    /* The TRACK key of the unchanged stock track also takes the column back (emulator, 27/11). */
    held_key = 0x2d; assert(module_enc(LEVEL_KNOB, 2)); held_key = 64;
    assert(track == 2 && stock_track == 0);
    select_track(0); assert(track == 0);

    /* SETUP survives a stock popup (Jannik 22/11): the draft and the view come back. */
    tap(PAGE_KEY); assert(view == SETUP); tap(DOWN); assert(operation == CELL);
    popup = 1; assert(!module_key(YES,1)); assert(!module_key(YES,0)); popup = 0;
    assert(view == SETUP && operation == CELL && visible);
    tap(NO); assert(view == ROW);

    /* WP-A2: one occupancy model. Unscanned counts as available; then trigs decide. */
    host_fresh();
    assert(slot_state(0, 5) == SLOT_AVAILABLE);
    content[0][0] = 1; content[1][2] = 0x80; content[4][7] = 4;
    tap(ARR);                                           /* entry scans every pattern */
    assert(slot_state(0, 0) == SLOT_AVAILABLE && slot_state(1, 0) == SLOT_EMPTY);
    assert(slot_state(2, 1) == SLOT_AVAILABLE && slot_state(7, 4) == SLOT_AVAILABLE && slot_state(7, 3) == SLOT_EMPTY);
    bad_grid = 1; occupancy_all(); assert(slot_state(2, 1) == SLOT_FOREIGN && slot_state(0, 0) == SLOT_AVAILABLE); bad_grid = 0;
    content[1][2] = 0; for (unsigned n = 0; n < 16; ++n) module_tick(&(struct modwerk_runtime_api){0});
    assert(slot_state(2, 1) == SLOT_EMPTY);             /* an edit shows within one rolling pass */
    tap(5); assert(requested == 5 || playing == 5);     /* an empty slot is still launchable as before */

    /* Sprint 06-C: Capture stores the real reference of every lane, empty ones included, and a
     * Row launch plays exactly those references. A dot is drawing only: no STOP, HOLD or skip. */
    host_fresh();
    for (unsigned p = 0; p < 16; ++p) for (unsigned t = 0; t < 8; ++t) content[p][t] = 0;
    content[0][0] = content[2][0] = content[2][1] = 1;   /* A01 T1, A03 T1-T2 hold trigs */
    tap(ARR); tap(2); select_track(1); tap(2); select_track(4); tap(2); select_track(0);
    assert(playing == 0x20022);                         /* T1, T2, T5 on A03; T5 has no sequence */
    assert(slot_state(4, 2) == SLOT_EMPTY && slot_state(1, 2) == SLOT_AVAILABLE);
    tap(ARR); tap(PAGE_KEY); tap(YES);                  /* Capture R01 */
    assert(defined == 1 && rows[0] == 0x20022);         /* the empty lane keeps its index, A03 */
    tap(YES); assert(playing == 0x20022);               /* stopped YES path relaunches R01 */
    tap(DOWN); tap(PAGE_KEY); tap(YES);
    tap(0);                                             /* direct Row launch, stopped */
    assert(playing == 0x20022 && last_row == 1);        /* T5 plays A03 (silent), never held or stopped */
    running = 1; tap(1); clyps_wrap();
    assert(playing == 0x20022 && last_row == 2);        /* running: the wrap commits every lane alike */
    running = 0;
}

int main(int argc, char **argv)
{
    if (argc == 1 || !strcmp(argv[1], "fresh-session")) alpha2_session();
    else {
        assert(argc == 4);
        bank_case(!strcmp(argv[1], "play"), !strcmp(argv[2], "complete"), !strcmp(argv[3], "init-first"));
    }
    return 0;
}
