/* Compile the actual UI and S1 handlers with synthetic OS reads. */
#include <assert.h>
#include <stdio.h>
#include <string.h>
#define CLYPS_HOST_TEST
#include "../live_module.c"
static unsigned selected, run, popup, pool, page, midi, scene, record, message, setup, dialog;
/* A bank image may replace the grid of the saved source at slot A07. */
static unsigned incompatible_a07;
static uint32_t host_long(uintptr_t a)
{
    switch (a) {
    case 0x800065b8: return run;
    case 0x460e5e30: return popup;
    case 0x460d1e70: return message;
    case 0x460d175c: return setup;
    case 0x460e5cd0: return dialog;
    case 0x460e70e0: return pool;
    case 0x460d1736: return record;
    default: return 0;
    }
}
static uint8_t host_byte(uintptr_t a)
{
    if (a == 0x100b14cc) return selected;
    if (a == 0x46c7d8d8) return page;
    if (a == 0x80000015) return midi;
    if (a == 0x46100b1b) return scene;
    if (a >= BANK_BASE && a < BANK_BASE + 16*PATTERN_BYTES) {
        if (incompatible_a07 && a == BANK_BASE + 6*PATTERN_BYTES + 0x8e51) return 32;
        unsigned offset = (a-BANK_BASE) % PATTERN_BYTES;
        if (offset==0x8e51 || offset==0x8e53) return 16;
        if (offset==0x8e52 || offset==0x8e54) return 2;
    }
    return 0;
}
static void tap(int code)
{
    assert(module_key(code,1));
    assert(module_key(0x100 | code,0));
}
/* Requests on either side of a native wrap callback, using real SRC/ARR handlers. */
static void row_boundary(void)
{
    clyps_project_init();
    run=0;
    tap(ARR);
    for (unsigned t=0;t<8;++t) {
        if (t) assert(module_enc(6,1));
        tap((int)t+1);
    }
    const uint32_t all = 0x87654321u;
    assert(playing==all && requested==all);
    tap(ARR); tap(YES); tap(15);  /* save row 16 */
    assert(defined==(1u<<15) && rows[15]==all);
    tap(ARR); tap(0);             /* restore T8 at stop */
    assert(playing==0x07654321u);
    run=1;
    clyps_wrap();
    tap(ARR); tap(15);            /* just after wrap: still queued */
    assert(playing==0x07654321u && requested==all && pending_row==16);
    clyps_wrap();
    assert(playing==all && !pending_row && last_row==16);
    tap(ARR); tap(1); tap(2);     /* latest request wins */
    assert(requested==0x27654321u && playing==all);
    assert(!module_key(STOP,1) && !module_key(STOP,0));
    assert(requested==all);
    clyps_wrap();
    assert(playing==all);
    int home=0, foreign=4;
    clyps_audio_source(&home,8,0);
    clyps_audio_source(&home,7,1);
    clyps_audio_source(&foreign,7,0);
    assert(home==0 && foreign==4);
    tap(NO);
    assert(locked);
    tap(YES);
    assert(locked && playing==all);
    run=0; tap(YES);
    assert(!locked && !requested && !playing);
    clyps_project_init();
    assert(!defined);
}
static void interrupted_editor(void)
{
    tap(ARR); tap(ARR); tap(YES); tap(3);
    tap(0x1b); tap(YES); tap(1);
    assert(editing && draft == 1 && rows[3] == 0);
    struct modwerk_runtime_api api = {0};
    popup = 1;
    module_tick(&api);
    assert(!visible);
    popup = 0;
    tap(ARR);
    assert(visible && !editing && !locked && rows[3] == 0 && defined == 8);
    clyps_project_init();

    tap(ARR); tap(2); tap(ARR); tap(YES); tap(3); /* R04 = A03 */
    tap(0x1b); tap(YES); tap(4); tap(YES);       /* confirmed A05 */
    assert(rows[3] == 4 && !editing);
    popup = 1;
    module_tick(&api);
    assert(!visible && !module_key(NO, 1) && !module_key(NO, 0));
    popup = 0;
    tap(ARR); tap(ARR); /* Reopen, then focus row navigation. */
    assert(visible && row_view && !editing && (defined & 8) && rows[3] == 4);
    run = 1;
    tap(3); /* R04 queued while A03 plays */
    for (unsigned repeat = 0; repeat < 3; ++repeat) {
        tap(YES);
        assert(editing);
        assert(module_key(6, 1)); /* unconfirmed A07, held through popup */
        unsigned *window = repeat == 1 ? &dialog : &popup;
        *window = 1;
        assert(!module_enc(6, 1));
        assert(!module_key(0x140, 0)); /* base modal-ownership query */
        assert(!module_key(YES, 1) && !module_key(YES, 0));
        assert(!visible && !editing && !armed && !src_list);
        assert(module_key(0x106, 0));
        assert(!module_key(ARR, 1));
        *window = 0;
        assert(!module_key(ARR, 1)); /* stock-owned repeat after close */
        assert(!module_key(ARR, 0));
        tap(ARR);
        assert(visible && !editing && rows[3] == 4 && (defined & 8));
        assert(playing == 2 && requested == 4 && pending_row == 4);
        tap(ARR);
        if (!zoom) tap(0x1b);
    }
    clyps_wrap();
    assert(playing == 4 && !pending_row && last_row == 4);
}

/* One byte models the stored grid at slot 7. An empty file fails the read.
 * Stock's API gives the result to its caller only; the post hook has no args. */
static int read_test_bank(unsigned mask, FILE *file)
{
    BANK_PRE(mask, 0);
    assert(defined == 8 && rows[3] == 6);
    int pattern = 0;
    clyps_audio_source(&pattern, 0, 0);
    assert(pattern == ((mask & 1) ? 0 : 6));
    if (mask & 1) {
        struct modwerk_runtime_api api = {0};
        module_tick(&api);
        clyps_wrap();
    }
    unsigned char grid_length;
    int complete = fread(&grid_length, 1, 1, file) == 1;
    if (complete && (mask & 1)) incompatible_a07 = grid_length != 16;
    BANK_POST();
    return complete;
}

static void bank_events(int fail_first)
{
    tap(ARR); tap(6); tap(ARR); tap(YES); tap(3);
    assert(defined == 8 && rows[3] == 6);
    FILE *file = tmpfile();
    assert(file);
    if (fail_first) {
        assert(!read_test_bank(1, file) && feof(file));
        assert(defined == 8 && rows[3] == 6 && playing == 6);
    }
    assert(fputc(32, file) != EOF);
    rewind(file);
    assert(read_test_bank(2, file)); /* The incompatible grid belongs to B. */
    assert(!incompatible_a07 && defined == 8 && rows[3] == 6 && playing == 6);

    RELOAD_PRE();
    BANKS_PRE();
    assert(!read_test_bank(1, file)); /* EOF, with R04 already defined. */
    assert(feof(file) && !incompatible_a07);
    BANKS_POST();
    RELOAD_POST();
    int during = 0;
    clyps_audio_source(&during, 0, 0);
    assert(during == 6 && defined == 8 && rows[3] == 6 && requested == playing);

    rewind(file);
    assert(read_test_bank(1, file)); /* Same slot in A now has an unsupported grid. */
    assert(incompatible_a07 && fclose(file) == 0);
    tap(3);
    assert(refused && defined == 8 && rows[3] == 6);
    int pat = 0;
    clyps_audio_source(&pat, 0, 0);
    assert(pat == 0); /* Never redirect into the newly unsupported grid. */
    incompatible_a07 = 0;
    tap(3);
    assert(!refused && playing == 6 && last_row == 4);
    PROJECT_INIT();
    assert(!defined && !requested && !playing && !visible);
    tap(ARR); tap(ARR); tap(3);
    assert(missing && playing == 0);
}

/* Inject a destination read failure after stock has delivered project init.
 * This characterizes the current failure. No abort result reaches CLYPS. */
static void late_project_failure(void)
{
    tap(ARR); tap(6); tap(ARR); tap(YES); tap(3);
    assert(defined == 8 && rows[3] == 6 && playing == 6);
    FILE *destination = tmpfile();
    assert(destination);
    PROJECT_INIT();
    BANK_PRE(1, 0);
    assert(fgetc(destination) == EOF && feof(destination));
    BANK_POST();
    assert(fclose(destination) == 0);
    int source = 0;
    clyps_audio_source(&source, 0, 0);
    assert(source == 0 && !defined && !playing && !requested);
}

/* A Bank H notification may coincide with a popup in a stopped row edit. */
static void interrupted_bank_edit(void)
{
    tap(ARR); tap(6); tap(ARR); tap(YES); tap(3);
    tap(0x1b); tap(YES); tap(2);
    assert(editing && draft == 2 && rows[3] == 6);
    BANK_PRE(1u << 7, 0);
    popup = 1;
    assert(!module_key(NO, 1));
    BANK_POST();
    popup = 0;
    assert(!module_key(NO, 0));
    tap(ARR);
    assert(visible && !editing && !armed);
    assert(defined == 8 && rows[3] == 6 && requested == 6 && playing == 6);
}

int main(int argc, char **argv)
{
    if (argc == 2) {
        if (strcmp(argv[1], "popup") == 0) interrupted_editor();
        else if (strcmp(argv[1], "popup-bank") == 0) interrupted_bank_edit();
        else if (strcmp(argv[1], "late-failure") == 0) late_project_failure();
        else bank_events(strcmp(argv[1], "failed-bank") == 0);
        return 0;
    }
    row_boundary();
    unsigned char frame[1024];
    tap(ARR);
    for (int t=0; t<8; ++t) {
        assert(!module_key(0x110+t,1) && !module_key(0x10+t,1));
        assert(!module_key(0x110+t,0) && !module_key(0x10+t,0));
        assert(!requested && !playing && track==0);
    }
    assert(module_enc(6,7) && track==7);
    tap(ARR);
    assert(module_enc(6,15) && slot==15 && track==7);
    tap(NO);

    for (unsigned lane=0; lane<8; ++lane) {
        selected=lane;
        clyps_project_init();
        run=1;
        assert(!module_key(SRC,1) && !module_key(SRC,0));
        tap(ARR); tap(SRC);
        assert(src_list && track==lane);
        for (unsigned ref=0; ref<16; ++ref) {
            if (ref) assert(module_enc(6,1));
            assert(src_cursor==ref && requested==playing);
            uint32_t before=playing;
            tap(YES);
            assert(playing==before && requested==(ref<<(4*lane)));
            memset(frame,0xa5,sizeof frame);
            module_draw(frame);
            for (unsigned x=0;x<128;++x)
                assert(frame[x*8]==0xa5 && frame[x*8+7]==0xa5);
            clyps_wrap();
            for (unsigned t=0;t<8;++t) {
                int pattern=0;
                clyps_audio_source(&pattern,t,0);
                assert(pattern==(int)(t==lane ? ref : 0));
            }
        }
        tap(ARR);
        assert(visible && !src_list);
        tap(NO);
        assert(locked && !visible);
        run=0; tap(YES);
        assert(!locked && !playing && !requested && !visible);
    }
    for (unsigned i=0;i<8;++i) {
        clyps_project_init(); selected=1;
        tap(ARR); tap(SRC);
        assert(src_list);
        unsigned *condition[]={&popup,&pool,&page,&midi,&scene,&record,&message,&setup};
        *condition[i]=(i==4 ? 2 : 1);
        memset(frame,0x69,sizeof frame);
        module_draw(frame);
        assert(!src_list && !visible);
        for (unsigned j=0;j<sizeof frame;++j) assert(frame[j]==0x69);
        assert(!module_key(YES,1) && !module_key(YES,0));
        *condition[i]=0;
    }
    return 0;
}
