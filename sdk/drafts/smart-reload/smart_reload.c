/* SMART RELOAD -- in arranger mode, RELOAD PART (FUNC + CUE) brings back the current arranger row's scenes A and B
 * instead of the ones saved with the Part. Octatrack OS 1.40C; addresses in RESEARCH.md.
 *
 * Stock's RELOAD PART (0x4004aab4, called with the Part's number from the main screen's FUNC + CUE, 0x4005e05a, and from
 * 0x4002dd56) copies the saved Part over the working one, its active scenes A and B with it. In arranger mode the row
 * playing set those scenes when it started (0x4004a100, the arranger's row start); after the reload they are the
 * Part's saved ones until the next row. The module steps into the reload at its entry, lets stock reload, then writes
 * the row's scenes as the row start does; a side set to "--" ("no change") takes the scene the rows above left, as
 * the row plays without a reload, or the Part's when none above sets it.
 *
 * The row is the arranger's current one (0x80006698), the row playing or, stopped, the one PLAY continues from. Only a
 * pattern row of the bank in use whose pattern plays the Part reloaded counts: anything else is stock's reload.
 */
#include <stdint.h>

#define ARR_PTR    0x10000000u   /* the working arrangement: +0x12 the row count, rows of 22 bytes from +0x14 */
#define ROW_BYTES  22u
#define ARR_MODE   0x460d1aecu   /* arranger mode on (FUNC + PATTERN) */
#define ARR_ROW    0x80006698u   /* the arranger's current row, -1 none */
#define CUR_BANK   0x80000002u
#define CUR_PART   0x80000003u
#define BANK_BASE  0x400e21e0u   /* bank b's data at BANK_BASE + b * BANK_STRIDE (as the row start addresses it) */
#define BANK_STRIDE 0x9b340u
#define PAT_STRIDE 0x8ed8u
#define PAT_PART   0x8e57u       /* a pattern's Part, in its bank's data (0x400eb036 + 1 in the row start) */
#define PART_STRIDE 0x18b2u
#define BANK_PART_SCENES 0x8ed90u   /* a Part's scenes A and B in its bank's copy (0x40170f70 in the row start) */
#define BANK_EDITED 0x95048u     /* the bank's edited-Part bits (0x40177228) */
#define BANK_DIRTY 0x9b332u      /* the bank's changed word (0x4017d512) */
#define WORK_SCENES 0x100a4edeu  /* the working Part's scenes A and B (Part p at + p * PART_STRIDE) */
#define WORK_EDITED 0x100b145eu  /* the working Parts' edited bits */
#define WORK_DIRTY 0x100f8598u
#define SCENES_CHANGED 0x40027e00u   /* what the row start calls after it set a scene */
#define SCENE_SOUND 0x40002df4u  /* (bank, part, scene, side): a scene's locks into the sound, as SCENE A/B + TRIG
                                  * does after it chose one (0x40052a9a); the row start leaves it to the pattern start */
#define UI_BANK    0x100b14ceu   /* the bank that call is given (0x40052a92) */
#define POST_EVENT 0x40000c3cu
#define UI_QUEUE   0x460d17aeu
#define EV_SCENE_A 0x400c0c43u
#define EV_SCENE_B 0x400c0c42u

#define MESSAGE    0x4005a2b8u   /* (text, 0x30): stock's message box */
#ifdef SR_HOST
uint8_t host_rd8(uint32_t a);
void host_wr8(uint32_t a, uint8_t v);
void host_scenes_changed(void);
void host_scene_sound(unsigned bank, unsigned part, unsigned scene, unsigned side);
void host_post_event(uint32_t q, uint32_t e);
unsigned host_stock_reload(unsigned part);
#define rd8(a) host_rd8(a)
#define wr8(a, v) host_wr8((a), (v))
static void scenes_changed(void) { host_scenes_changed(); }
static void scene_sound(unsigned bank, unsigned part, unsigned scene, unsigned side) { host_scene_sound(bank, part, scene, side); }
static void post_event(uint32_t q, uint32_t e) { host_post_event(q, e); }
static unsigned stock_reload(unsigned part) { return host_stock_reload(part); }
#ifdef SR_DEBUG
static void message(const char *t) { (void)t; }
#endif
#else
static uint8_t rd8(uint32_t a) { return *(volatile uint8_t *)a; }
static void wr8(uint32_t a, uint8_t v) { *(volatile uint8_t *)a = v; }
static void scenes_changed(void) { ((void (*)(void))SCENES_CHANGED)(); }
static void scene_sound(unsigned bank, unsigned part, unsigned scene, unsigned side)
{
    ((void (*)(unsigned, unsigned, unsigned, unsigned))SCENE_SOUND)(bank, part, scene, side);
}
static void post_event(uint32_t q, uint32_t e) { ((void (*)(uint32_t, uint32_t))POST_EVENT)(q, e); }
unsigned sr_stock_reload(unsigned part);     /* below: stock's reload, entered past the site */
static unsigned stock_reload(unsigned part) { return sr_stock_reload(part); }
#ifdef SR_DEBUG
static void message(const char *t) { ((void (*)(const char *, int))MESSAGE)(t, 0x30); }
#endif
#endif

static uint32_t rd32(uint32_t a)
{
    return (uint32_t)rd8(a) << 24 | (uint32_t)rd8(a + 1) << 16 | (uint32_t)rd8(a + 2) << 8 | rd8(a + 3);
}
static void wr32(uint32_t a, uint32_t v)
{
    wr8(a, (uint8_t)(v >> 24)); wr8(a + 1, (uint8_t)(v >> 16)); wr8(a + 2, (uint8_t)(v >> 8)); wr8(a + 3, (uint8_t)v);
}

/* One side's scene (0 A, 1 B) into the reloaded Part, as the arranger's row start writes it. */
static void put_scene(unsigned bank, unsigned part, unsigned side, uint8_t scene)
{
    uint32_t b = BANK_BASE + bank * BANK_STRIDE;
    wr8(b + BANK_PART_SCENES + part * PART_STRIDE + side, scene);
    wr8(b + BANK_EDITED, (uint8_t)(rd8(b + BANK_EDITED) | 1u << part));
    wr32(b + BANK_DIRTY, 1);
    wr8(WORK_SCENES + part * PART_STRIDE + side, scene);
    wr8(WORK_EDITED, (uint8_t)(rd8(WORK_EDITED) | 1u << part));
    wr32(WORK_DIRTY, 1);
    scenes_changed();
    /* The sound too, at once: written only, the scene showed while the Part's saved one played until the row came
     * round again (the developer's MKI, 24 November 2026). */
    scene_sound(rd8(UI_BANK), part, scene, side);
    post_event(UI_QUEUE, side ? EV_SCENE_B : EV_SCENE_A);
}

/* The last reload, for the diagnostic word (module_tick): bits 0-7 the row, 8-11 why (below), 12-15 the row's bank,
 * 16-19 its pattern, 20-23 the Part its pattern plays, 24-27 the Part reloaded, 28-31 the bank in use. */
enum { WHY_PATTERN_MODE = 1, WHY_NO_ROW, WHY_NOT_PATTERN_ROW, WHY_OTHER_BANK, WHY_OTHER_PART, WHY_PATTERN_PART, WHY_DONE,
       WHY_NOTHING_SAVED };
static uint32_t last = 0;
static void note(unsigned why, uint32_t row, unsigned bank, unsigned pattern, unsigned ppart, unsigned part)
{
    last = (row & 0xffu) | (uint32_t)(why & 15u) << 8 | (uint32_t)(bank & 15u) << 12 | (uint32_t)(pattern & 15u) << 16
        | (uint32_t)(ppart & 15u) << 20 | (uint32_t)(part & 15u) << 24 | (uint32_t)(rd8(CUR_BANK) & 15u) << 28;
}
struct sr_api { volatile uint32_t value; };
#ifdef SR_DEBUG
static char dbg_text[24];
static uint8_t dbg_pending;
static void message(const char *t);
#endif
void sr_tick(void *api)
{
    if (api) ((struct sr_api *)api)->value = last;
#ifdef SR_DEBUG
    if (dbg_pending && ++dbg_pending > 30) { dbg_pending = 0; message(dbg_text); }   /* half a second after */
#endif
}

/* A side's scene as the row plays it: the row's own, or, for "--" ("no change"), the nearest one set on that side in
 * the rows above that play this bank's Part (a row of another Part sets that Part's scenes, not this one's): what the
 * arranger leaves selected when it reaches the row in order, and what the main screen shows for the row. -1 when none
 * is set up to here (the Part's own scene). A JUMP or LOOP into the row may have come from elsewhere: the rows above
 * are taken in order (the developer's choice, 24 November 2026). */
static int side_scene(uint32_t arr, uint32_t row, unsigned bank, unsigned part, unsigned side)
{
    for (uint32_t k = row + 1u; k-- > 0;) {
        uint32_t r = arr + 0x14u + k * ROW_BYTES;
        if (rd8(r) != 0) continue;                       /* LOOP/JUMP/HALT, REM: no scenes */
        unsigned b = rd8(r + 1) >> 4, p = rd8(r + 1) & 15u;
        if (b != bank || rd8(BANK_BASE + b * BANK_STRIDE + p * PAT_STRIDE + PAT_PART) != part) continue;
        int8_t scene = (int8_t)rd8(r + 8 + side);
        if (scene >= 0) return scene;
    }
    return -1;
}

/* The current row's scenes for the Part just reloaded; 0 when the row does not apply. */
static unsigned row_scenes(unsigned part)
{
    uint32_t row = rd32(ARR_ROW), arr = rd32(ARR_PTR);
    if (!rd32(ARR_MODE)) { note(WHY_PATTERN_MODE, row, 0, 0, 0, part); return 0; }   /* pattern mode: stock's */
    unsigned count = (unsigned)rd8(arr + 0x12) << 8 | rd8(arr + 0x13);
    if (row >= count) { note(WHY_NO_ROW, row, 0, 0, 0, part); return 0; }   /* none (-1), or past the last row */
    uint32_t r = arr + 0x14u + row * ROW_BYTES;
    unsigned bank = rd8(r + 1) >> 4, pattern = rd8(r + 1) & 15u;
    unsigned ppart = rd8(BANK_BASE + bank * BANK_STRIDE + pattern * PAT_STRIDE + PAT_PART);
    if (rd8(r) != 0) { note(WHY_NOT_PATTERN_ROW, row, bank, pattern, ppart, part); return 0; }   /* LOOP/JUMP/HALT, REM */
    if (bank != rd8(CUR_BANK)) { note(WHY_OTHER_BANK, row, bank, pattern, ppart, part); return 0; }
    if (part != rd8(CUR_PART)) { note(WHY_OTHER_PART, row, bank, pattern, ppart, part); return 0; }
    if (ppart != part) { note(WHY_PATTERN_PART, row, bank, pattern, ppart, part); return 0; }
    note(WHY_DONE, row, bank, pattern, ppart, part);
#ifdef SR_DEBUG
    {   /* debug build only: the row taken and the scenes chosen, on screen */
        char *t = dbg_text;
        int a = side_scene(arr, row, bank, part, 0), b = side_scene(arr, row, bank, part, 1);
        const char *h = "SR ROW ";
        while (*h) *t++ = *h++;
        if (row >= 100u) *t++ = (char)('0' + row / 100u);
        if (row >= 10u) *t++ = (char)('0' + row / 10u % 10u);
        *t++ = (char)('0' + row % 10u);
        *t++ = ' '; *t++ = 'A';
        if (a < 0) { *t++ = '-'; *t++ = '-'; } else { if (a + 1 >= 10) *t++ = (char)('0' + (a + 1) / 10); *t++ = (char)('0' + (a + 1) % 10); }
        *t++ = ' '; *t++ = 'B';
        if (b < 0) { *t++ = '-'; *t++ = '-'; } else { if (b + 1 >= 10) *t++ = (char)('0' + (b + 1) / 10); *t++ = (char)('0' + (b + 1) % 10); }
        *t = 0;
        dbg_pending = 1;                                 /* shown by the next tick, after stock's PART n RELOADED */
    }
#endif
    unsigned done = 0;
    for (unsigned side = 0; side < 2; ++side) {
        int scene = side_scene(arr, row, bank, part, side);
        if (scene < 0) continue;                         /* none set up to here: the Part's own scene stays */
        put_scene(bank, part, side, (uint8_t)scene);
        ++done;
    }
    return done;
}

/* Stock's RELOAD PART, stepped into at its entry: the reload first, then the row's scenes. Stock's result goes back
 * to its caller unchanged (0: the Part had nothing saved to reload). */
unsigned sr_reload(unsigned part)
{
    unsigned rc = stock_reload(part);
    if (rc) row_scenes(part & 3u);
    else note(WHY_NOTHING_SAVED, rd32(ARR_ROW), 0, 0, 0, part);
    return rc;
}

#ifndef SR_HOST
/* The site's jmp lands here with the caller's frame as at stock's entry: the Part's number at 4(sp). sr_stock_reload
 * replays the two instructions the site displaced and runs the rest of stock's reload. */
__asm__(
    "\t.text\n"
    "\t.globl sr_reload_entry\n"
    "sr_reload_entry:\n"
    "\tmove.l 4(%sp),-(%sp)\n"
    "\tjsr sr_reload\n"
    "\taddq.l #4,%sp\n"
    "\trts\n"
    "\t.globl sr_stock_reload\n"
    "sr_stock_reload:\n"
    "\tlea -32(%sp),%sp\n"
    "\tmovem.l %d2-%d5/%a2-%a3,(%sp)\n"
    "\tjmp 0x4004aabc\n");
#endif
