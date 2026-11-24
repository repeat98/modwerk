/* SMART RELOAD's host test: smart_reload.c (-DSR_HOST) against simulated memory and a stock RELOAD PART that copies the
 * saved Part's scenes back, as 0x4004aab4 does. */
#include <stdint.h>
#include <stdio.h>
#include <string.h>

unsigned sr_reload(unsigned part);
void sr_tick(void *api);
static unsigned diag(void) { struct { volatile uint32_t value; } api = {0}; sr_tick((void *)&api); return api.value; }

#define N 4096
static uint32_t keys[N];
static uint8_t vals[N];
static int used, failures, checks, changed, posted, reloads;
static uint8_t saved_a = 0, saved_b = 7;     /* the Part's saved scenes: 1 and 8 */
static int part_saved = 1;

uint8_t host_rd8(uint32_t a)
{
    for (int i = 0; i < used; ++i) if (keys[i] == a) return vals[i];
    return 0;
}
void host_wr8(uint32_t a, uint8_t v)
{
    for (int i = 0; i < used; ++i) if (keys[i] == a) { vals[i] = v; return; }
    keys[used] = a; vals[used] = v; ++used;
}
static void wr32(uint32_t a, uint32_t v) { for (int i = 0; i < 4; ++i) host_wr8(a + (uint32_t)i, (uint8_t)(v >> (24 - 8 * i))); }
void host_scenes_changed(void) { ++changed; }
static unsigned sound[2][4]; static int sounds;   /* the last call per side: bank, part, scene; and how many */
void host_scene_sound(unsigned bank, unsigned part, unsigned scene, unsigned side)
{
    sound[side & 1][0] = bank; sound[side & 1][1] = part; sound[side & 1][2] = scene; sound[side & 1][3] = 1; ++sounds;
}
void host_post_event(uint32_t q, uint32_t e) { (void)q; (void)e; ++posted; }

#define ARR 0x10000004u
#define BANK(b) (0x400e21e0u + (uint32_t)(b) * 0x9b340u)
#define WORK(p) (0x100a4edeu + (uint32_t)(p) * 0x18b2u)
#define BANKSC(b, p) (BANK(b) + 0x8ed90u + (uint32_t)(p) * 0x18b2u)

/* Stock's reload: the saved Part's scenes back into the working Part and the bank's copy, its edited bit cleared. */
unsigned host_stock_reload(unsigned part)
{
    ++reloads;
    if (!part_saved) return 0;
    unsigned bank = host_rd8(0x80000002u);
    host_wr8(WORK(part), saved_a); host_wr8(WORK(part) + 1, saved_b);
    host_wr8(BANKSC(bank, part), saved_a); host_wr8(BANKSC(bank, part) + 1, saved_b);
    host_wr8(0x100b145eu, (uint8_t)(host_rd8(0x100b145eu) & ~(1u << part)));
    return 1;
}

static void check(const char *what, int ok) { ++checks; if (!ok) ++failures; printf("[%s] %s\n", ok ? "PASS" : "FAIL", what); }

/* A row: pattern (bank, pattern), scenes a and b (0xff: "--"). */
static void row(unsigned r, uint8_t type, unsigned bank, unsigned pattern, uint8_t a, uint8_t b)
{
    uint32_t at = ARR + 0x14u + r * 22u;
    for (unsigned i = 0; i < 22u; ++i) host_wr8(at + i, 0);
    host_wr8(at, type); host_wr8(at + 1, (uint8_t)(bank << 4 | pattern)); host_wr8(at + 8, a); host_wr8(at + 9, b);
}
static void setup(void)
{
    used = 0; changed = posted = reloads = sounds = 0; part_saved = 1; memset(sound, 0, sizeof sound);
    host_wr8(0x100b14ceu, 1);                            /* the bank the scene call is given */
    wr32(0x10000000u, ARR);
    host_wr8(ARR + 0x12, 0); host_wr8(ARR + 0x13, 3);    /* three rows */
    row(0, 0, 1, 2, 1, 2);                               /* B03, scenes 2 and 3 */
    row(1, 0, 1, 4, 3, 0xff);                            /* B05, scene 4 and "--" */
    row(2, 2, 0, 0, 0, 0);                               /* a REM row */
    host_wr8(BANK(1) + 2u * 0x8ed8u + 0x8e57u, 0);       /* B03 plays Part 1 (0) */
    host_wr8(BANK(1) + 4u * 0x8ed8u + 0x8e57u, 0);
    host_wr8(0x80000002u, 1); host_wr8(0x80000003u, 0);  /* bank B, Part 1 */
    wr32(0x460d1aecu, 1);                                /* arranger mode */
    wr32(0x80006698u, 0);                                /* on row 0 */
    host_wr8(WORK(0), 1); host_wr8(WORK(0) + 1, 2);      /* as the row start left them */
}

int main(void)
{
    setup();
    unsigned rc = sr_reload(0);
    check("arranger mode, row 0: stock reloads the Part", reloads == 1 && rc == 1);
    check("then the row's scenes A and B are back in the working Part", host_rd8(WORK(0)) == 1 && host_rd8(WORK(0) + 1) == 2);
    check("and in the bank's copy of the Part, as the row start writes them", host_rd8(BANKSC(1, 0)) == 1 && host_rd8(BANKSC(1, 0) + 1) == 2);
    check("the Part marked edited again, as the row start marks it", (host_rd8(0x100b145eu) & 1) && (host_rd8(BANK(1) + 0x95048u) & 1));
    check("stock's scene update and two redraws, one per side", changed == 2 && posted == 2);
    check("the diagnostic word: row 0, done, bank 1, pattern 2, its Part 0, Part 0, bank in use 1", diag() == 0x10021700u);
    check("and each scene into the sound at once, as SCENE A/B + TRIG does: bank, Part, scene, side", sounds == 2
          && sound[0][0] == 1 && sound[0][1] == 0 && sound[0][2] == 1 && sound[1][2] == 2 && sound[1][3] == 1);

    setup(); wr32(0x80006698u, 1);
    sr_reload(0);
    check("row 1, scene B \"--\": scene A from the row, B as row 0 above left it", host_rd8(WORK(0)) == 3 && host_rd8(WORK(0) + 1) == 2 && changed == 2);
    check("both sent to the sound", sounds == 2 && sound[0][2] == 3 && sound[1][2] == 2);

    setup(); row(0, 0, 1, 2, 0xff, 0xff); wr32(0x80006698u, 1);   /* nothing set above row 1's B */
    sr_reload(0);
    check("\"--\" with nothing set above: the Part's scene", host_rd8(WORK(0)) == 3 && host_rd8(WORK(0) + 1) == saved_b && changed == 1 && sounds == 1);

    setup(); host_wr8(0x10000004u + 0x13, 4); row(3, 0, 1, 2, 0xff, 0xff); wr32(0x80006698u, 3);   /* rows 0-2 above, row 2 REM */
    sr_reload(0);
    check("a \"-----\" row after 2/3 and 4/--: 4 and 3, as it plays", host_rd8(WORK(0)) == 3 && host_rd8(WORK(0) + 1) == 2);

    setup(); host_wr8(0x10000004u + 0x13, 4); row(1, 0, 1, 6, 5, 6); host_wr8(BANK(1) + 6u * 0x8ed8u + 0x8e57u, 2);
    row(3, 0, 1, 2, 0xff, 0xff); wr32(0x80006698u, 3);    /* row 1 plays Part 3: its scenes are not Part 1's */
    sr_reload(0);
    check("a row above of another Part is passed over", host_rd8(WORK(0)) == 1 && host_rd8(WORK(0) + 1) == 2);

    setup(); wr32(0x460d1aecu, 0);
    sr_reload(0);
    check("pattern mode: stock's reload only", host_rd8(WORK(0)) == saved_a && host_rd8(WORK(0) + 1) == saved_b && changed == 0 && sounds == 0);

    setup(); wr32(0x80006698u, 0xffffffffu);
    sr_reload(0);
    check("no current row: stock's reload only", host_rd8(WORK(0)) == saved_a && changed == 0);

    setup(); wr32(0x80006698u, 3);
    sr_reload(0);
    check("a row past the last: stock's reload only", host_rd8(WORK(0)) == saved_a && changed == 0);

    setup(); wr32(0x80006698u, 2);
    sr_reload(0);
    check("a REM row: stock's reload only", host_rd8(WORK(0)) == saved_a && changed == 0);

    setup(); host_wr8(0x80000002u, 2);
    sr_reload(0);
    check("the row's pattern in another bank: stock's reload only", host_rd8(WORK(0)) == saved_a && changed == 0);
    check("and the diagnostic word says why: another bank", ((diag() >> 8) & 15u) == 4u);

    setup(); host_wr8(BANK(1) + 2u * 0x8ed8u + 0x8e57u, 2);
    sr_reload(0);
    check("the row's pattern plays another Part: stock's reload only", host_rd8(WORK(0)) == saved_a && changed == 0);

    setup(); host_wr8(0x80000003u, 1);
    sr_reload(0);
    check("another Part reloaded (Part menu) than the one in use: stock's reload only", changed == 0);

    setup(); part_saved = 0;
    rc = sr_reload(0);
    check("nothing to reload: stock's answer (0) back to its caller, nothing written", rc == 0 && changed == 0 && host_rd8(WORK(0)) == 1);

    printf("%d checks, %d failed\n", checks, failures);
    return failures != 0;
}
