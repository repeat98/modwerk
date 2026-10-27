/* SPDX-License-Identifier: MIT
 * Host test of akl.c against a model of the unit's memory (no firmware). cc -std=c99 -Wall -Wextra -fsanitize=address,undefined
 * -o /tmp/test_akl test_akl.c && /tmp/test_akl */
#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>

static uint8_t bank0[0x9b340], cs1[0x8ed80], misc[0x10000], sink[8];
static int edited;
static uint8_t *mem(uintptr_t a)
{
    if (a >= 0x400e21e0u && a < 0x400e21e0u + sizeof bank0) return bank0 + (a - 0x400e21e0u);
    if (a >= 0x1001614eu && a < 0x1001614eu + sizeof cs1) return cs1 + (a - 0x1001614eu);
    if (a >= 0x80006400u && a < 0x80006700u) return misc + (a - 0x80006400u);
    if (a >= 0x80000000u && a < 0x80000100u) return misc + 0x1000 + (a - 0x80000000u);
    if (a >= 0x100b1400u && a < 0x100b1500u) return misc + 0x2000 + (a - 0x100b1400u);
    if (a >= 0x460d1e00u && a < 0x460d1e10u) return misc + 0x3000 + (a - 0x460d1e00u);
    if (a >= 0x46100b10u && a < 0x46100b20u) return misc + 0x3100 + (a - 0x46100b10u);
    if (a >= 0x46c82450u && a < 0x46c82460u) return misc + 0x4000 + (a - 0x46c82450u);
    if (a >= 0x46c76d00u && a < 0x46c77c00u) return misc + 0x6000 + (a - 0x46c76d00u);
    if (a >= 0x46c7a000u && a < 0x46c7a100u) return misc + 0x7000 + (a - 0x46c7a000u);
    if (a >= 0x400cfeb0u && a < 0x400cfed0u) return misc + 0x7100 + (a - 0x400cfeb0u);
    if (a >= 0x46c7c720u && a < 0x46c7c730u) return misc + 0x7200 + (a - 0x46c7c720u);
    if (a >= 0x100f8590u && a < 0x100f85a0u) return misc + 0x5000 + (a - 0x100f8590u);
    return sink;
}
static uint32_t be32(uintptr_t a) { uint8_t *p = mem(a); return (uint32_t)p[0] << 24 | p[1] << 16 | p[2] << 8 | p[3]; }
static void set32(uintptr_t a, uint32_t v) { uint8_t *p = mem(a); p[0] = v >> 24; p[1] = v >> 16; p[2] = v >> 8; p[3] = v; }
static void stamp(void) { edited++; }
static int redraws;
static void redraw(void) { redraws++; }
static void tail(int a, int b) { (void)a; (void)b; }
static int closes;
static void close_setup(void) { closes++; }
static void (*akl_stub(uintptr_t a))(void)
{
    return a == 0x40027e00u ? stamp : a == 0x40079d48u ? redraw : a == 0x40079abcu ? close_setup : (void (*)(void))tail;
}
#define AKL_HOST
#define U8(a) (*mem((uintptr_t)(a)))
#define U32(a) be32((uintptr_t)(a))
#define AKL_CALL(type, a) ((type)akl_stub(a))
#define AKL_EDITED(bank) (set32((bank) + 0x9b332u, 1), set32(0x100f8598u, 1))
#define AKL_DIRTY() set32(0x46c7c72cu, 1)
#include "akl.c"

#define TRACK(t) (MIDI_TRACK(t))
static void lock(unsigned t, unsigned s, unsigned v) { bank0[TRACK(t) + LOCK30(s)] = (uint8_t)v; }
static void at_step(unsigned t, unsigned s) { *mem(STEP(t)) = (uint8_t)s; }

int main(void)
{
    memset(bank0 + MIDI_TRACK(0), 0xff, 8 * 0x8b0u);
    for (unsigned t = 0; t < 8; ++t) bank0[TRACK(t) + 0x28] = 16;
    bank0[0x8e53] = 16;                                     /* the pattern length (normal mode) */
    set32(UI_BANK, 0x400e21e0u);

    /* snap: C MAJOR (1) lowers C# to C and keeps D; F DORIAN (1 + 7*5 + 1 = 37): F G Ab Bb C D Eb. */
    assert(akl_snap(61, 1) == 60 && akl_snap(62, 1) == 62);
    assert(akl_snap(65, 37) == 65 && akl_snap(69, 37) == 68 && akl_snap(64, 37) == 63 && akl_snap(62, 37) == 62);
    /* G PHRYGIAN (1 + 7*7 + 2 = 52): G Ab Bb C D Eb F; OFF (0) leaves every note. */
    assert(akl_snap(69, 52) == 68 && akl_snap(67, 52) == 67 && akl_snap(66, 52) == 65 && akl_snap(61, 0) == 61);
    for (unsigned key = 1; key <= LAST; ++key)
        for (int n = 1; n < 128; ++n) {
            int m = akl_snap(n, key);
            unsigned root = (key - 1) / 7, mode = (key - 1) % 7;
            assert(m == n || m == n - 1);
            assert(modes[mode] >> ((unsigned)(m + 12 - (int)root) % 12) & 1);
        }

    /* No lock: stock's KEY. */
    int8_t note = 61;
    at_step(0, 3);
    assert(!akl_claims(0) && !akl_note(0, &note) && note == 61);

    /* The example: 1 C MINOR, 5 F DORIAN, 9 G PHRYGIAN, 13 C MINOR (steps 0, 4, 8, 12). */
    lock(0, 0, 6); lock(0, 4, 37); lock(0, 8, 52); lock(0, 12, 6);
    gen++;
    unsigned want[16] = {6, 6, 6, 6, 37, 37, 37, 37, 52, 52, 52, 52, 6, 6, 6, 6};
    for (unsigned s = 0; s < 16; ++s) { at_step(0, s); assert(akl_key(0) == want[s]); }
    at_step(0, 5); note = 69;
    assert(akl_claims(0) && akl_note(0, &note) && note == 68);
    note = -1; assert(akl_note(0, &note) && note == -1); /* a dropped note stays dropped */

    /* Wrap: one lock on step 9 holds from step 9 round to step 8. */
    memset(bank0 + MIDI_TRACK(1), 0xff, 0x8b0u); bank0[TRACK(1) + 0x28] = 16;
    lock(1, 8, 52); gen++;
    at_step(1, 2); assert(akl_key(1) == 52);
    at_step(1, 8); assert(akl_key(1) == 52);

    /* Length: in per-track mode a lock past the track's length does not count. */
    memset(bank0 + MIDI_TRACK(2), 0xff, 0x8b0u); bank0[TRACK(2) + 0x28] = 8;
    lock(2, 10, 52); gen++;
    at_step(2, 3); assert(akl_key(2) == 52); /* pattern length 16 */
    bank0[0x8e55] = 1; gen++;
    assert(akl_key(2) == NONE);             /* track length 8 */
    bank0[0x8e55] = 0;

    /* The knob: track 4 at C MINOR (stock 2), trig 5 held on page 1: +3 from C MINOR (6) is 9 (C# DORIAN). */
    unsigned t = 4;
    memset(bank0 + MIDI_TRACK(t), 0xff, 0x8b0u); memset(cs1 + MIDI_TRACK(t), 0xff, 0x8b0u);
    *mem(UI_TRACK) = (uint8_t)t; *mem(UI_PATTERN) = 0; *mem(UI_PART) = 0;
    bank0[PART_KEY(t)] = 2;
    *mem(KEY_ROWS) = 1 << 4; *mem(KEY_ROWS + 1) = 0; /* trig key 5 */
    set32(STEP_PAGE, 0);
    set32(MIDI_MODE, 1);
    assert(akl_knob_claims());
    akl_knob(3);
    assert(bank0[TRACK(t) + LOCK30(4)] == 9 && cs1[TRACK(t) + LOCK30(4)] == 9 && edited == 1 && redraws == 1);
    char text[16];
    assert(!akl_text_claims(2));
    assert(akl_text_claims(5)); akl_key_text(text, 0); assert(!strcmp(text, "DOR") && !strcmp(text + 5, "C#"));
    at_step(t, 7); assert(akl_key(t) == 9); /* the edit reaches the cache */
    akl_knob(-9);  /* 9 - 9 = 0: OFF, still a lock */
    assert(bank0[TRACK(t) + LOCK30(4)] == 0);
    akl_key_text(text, 0); assert(!strcmp(text, "") && !strcmp(text + 5, "OFF"));
    akl_knob(-1);  /* below OFF: no lock */
    assert(bank0[TRACK(t) + LOCK30(4)] == NONE && cs1[TRACK(t) + LOCK30(4)] == NONE);
    akl_key_text(text, 0); assert(!strcmp(text, "") && !strcmp(text + 5, "--"));
    akl_knob(200); /* from the track's KEY, clamped to the last */
    assert(bank0[TRACK(t) + LOCK30(4)] == LAST);
    akl_key_text(text, 0); assert(!strcmp(text, "LOC") && !strcmp(text + 5, "B"));
    /* Page 2 (steps 17-32): trig 1 is step 17; trig 16 (row 1, bit 7) is step 32. */
    set32(STEP_PAGE, 1); *mem(KEY_ROWS) = 1; *mem(KEY_ROWS + 1) = 0x80;
    akl_knob(1);
    assert(bank0[TRACK(t) + LOCK30(16)] == 7 && bank0[TRACK(t) + LOCK30(31)] == 7);
    *mem(KEY_ROWS) = 0; *mem(KEY_ROWS + 1) = 0;
    assert(!akl_knob_claims());

    /* Moving through a key: C MIN (6) G +1 is G#, +2 A#, -1 F; OFF moves by semitones; the edges hold. */
    assert(akl_move(67, 6, 1) == 68 && akl_move(67, 6, 2) == 70 && akl_move(67, 6, -1) == 65 && akl_move(67, 0, 1) == 68);
    assert(akl_move(127, 1, 3) == 127 && akl_move(0, 1, -3) == 0 && akl_move(66, 6, 0) == 65);

    /* The gesture on track 6: hold trig 9 (the step), D picks the arp note, E shifts it. */
    t = 5;
    memset(bank0 + MIDI_TRACK(t), 0xff, 0x8b0u); memset(cs1 + MIDI_TRACK(t), 0xff, 0x8b0u);
    memset(bank0 + MIDI_TRACK(t), 0, 24);                   /* no trigs yet (the masks) */
    bank0[TRACK(t) + 0x28] = 16;
    *mem(UI_TRACK) = (uint8_t)t; set32(STEP_PAGE, 0); bank0[PART_KEY(t)] = 2;
    *mem(KEY_ROWS) = 0; *mem(KEY_ROWS + 1) = 1;            /* trig 9 */
    assert(akl_text_claims(5));
    assert(akl_turn(3, 1)); akl_key_text(text, 0); assert(!strcmp(text + 5, "N1") && !strcmp(text, "--")); /* first turn: N1 */
    assert(akl_turn(3, 3)); akl_key_text(text, 0); assert(!strcmp(text + 5, "N4"));
    assert(bank0[TRACK(t) + LOCK31(8)] == NONE);           /* picking stores nothing */
    assert(akl_turn(4, 1) && bank0[TRACK(t) + LOCK31(8)] == 0x38 && cs1[TRACK(t) + LOCK31(8)] == 0x38);
    akl_key_text(text, 0); assert(!strcmp(text + 5, "N4") && !strcmp(text, "+1"));
    assert(akl_turn(4, -3) && bank0[TRACK(t) + LOCK31(8)] == 0x35);   /* -2 */
    akl_key_text(text, 0); assert(!strcmp(text, "-2"));
    assert(akl_turn(3, 20)); akl_key_text(text, 0); assert(!strcmp(text + 5, "N16") && !strcmp(text, "--")); /* clamped */
    assert(akl_turn(3, -12)); akl_key_text(text, 0); assert(!strcmp(text + 5, "N4") && !strcmp(text, "-2"));
    assert(akl_turn(5, 1) && bank0[TRACK(t) + LOCK30(8)] == 7);       /* KEY: the held step */
    akl_key_text(text, 0); assert(!strcmp(text, "LOC") && !strcmp(text + 5, "C")); /* KEY shown: C LOC (7) */
    assert(!akl_turn(2, 1) && !akl_turn(6, 1) && !akl_turn(0, 1));    /* LEN, the note editor, A: stock's */
    assert(akl_turn(4, 2) && bank0[TRACK(t) + LOCK31(8)] == 0x37);    /* 0: back to normal from here, kept */
    akl_key_text(text, 0); assert(!strcmp(text, "0"));
    assert(akl_turn(3, -4)); assert(bank0[TRACK(t) + LOCK31(8)] == NONE); /* D below N1: removed */
    akl_key_text(text, 0); assert(!strcmp(text + 5, "--"));
    assert(akl_turn(3, 4)); akl_key_text(text, 0); assert(!strcmp(text + 5, "N1")); /* back up: N1 */
    assert(akl_turn(3, 3) && akl_turn(4, 1) && bank0[TRACK(t) + LOCK31(8)] == 0x38);
    *mem(KEY_ROWS + 1) = 0; assert(akl_text_claims(5) == 0 && !akl_turn(4, 1)); /* nothing held: stock's */
    *mem(KEY_ROWS + 1) = 1; assert(akl_text_claims(5)); assert(akl_turn(3, 0)); /* held again: D starts at the shifted note */
    akl_key_text(text, 0); assert(!strcmp(text + 5, "N4") && !strcmp(text, "+1"));
    /* N16 shifted down by one is a setting, not NONE (0xff), and keeps going down. */
    assert(akl_turn(3, 20) && akl_turn(4, -1) && bank0[TRACK(t) + LOCK31(8)] == 0xf6);
    akl_key_text(text, 0); assert(!strcmp(text + 5, "N16") && !strcmp(text, "-1"));
    assert(akl_turn(4, -1) && bank0[TRACK(t) + LOCK31(8)] == 0xf5);
    bank0[TRACK(t) + LOCK31(8)] = 0x38;                    /* back to N4 +1 for the playing below */
    *mem(KEY_ROWS + 1) = 0; akl_text_claims(5);

    /* Playing, track 6: trigs on steps 1 and 9, the arp on (MODE), LEN 4 (setup +0x0e is 3), track KEY C MIN. */
    memset(mem(FIRED(t)), 0xff, 32);
    bank0[0x8e53] = 16;
    *mem(ARP_MODE(t)) = 1; *mem(LIVE_KEY(t) - 0x11 + 0x0e) = 3; *mem(LIVE_KEY(t)) = 2;
    bank0[TRACK(t) + LOCK30(8)] = NONE; gen++;
    bank0[TRACK(t) + 7] = 1; bank0[TRACK(t) + 6] = 1;      /* note trigs on steps 1 and 9 */
    /* Step 9's own setting (note 4 +1, stored above): its 4th note moves, the 1st does not, and it holds after. */
    at_step(t, 8); *mem(ARP_POS(t)) = 3;
    note = 67; assert(akl_claims(t) && akl_note(t, &note) && note == 68);   /* G +1 in C MIN: G# */
    *mem(ARP_POS(t)) = 0; note = 67; assert(!akl_claims(t) && !akl_note(t, &note) && note == 67);
    *mem(ARP_MODE(t)) = 0; *mem(ARP_POS(t)) = 3; assert(!akl_claims(t));   /* arp off: no shift */
    *mem(ARP_MODE(t)) = 1; at_step(t, 13); assert(akl_claims(t));          /* held on later steps */
    at_step(t, 0); assert(!akl_claims(t));                                  /* trig 1, no setting: normal */
    at_step(t, 5); assert(!akl_claims(t));
    /* A trigless trig on step 10 with a condition: only when stock fires it (its record carries the setting). */
    bank0[TRACK(t) + LOCK31(8)] = NONE; bank0[TRACK(t) + LOCK31(9)] = 0x38; gen++;
    at_step(t, 8); assert(!akl_claims(t));                                  /* trig 9 itself: normal */
    mem(FIRED(t))[31] = 0x38;                                               /* the trigless one is coming and fires */
    assert(akl_claims(t)); note = 67; assert(akl_note(t, &note) && note == 68);
    at_step(t, 9); mem(FIRED(t))[31] = NONE; assert(akl_claims(t));         /* holds after it */
    at_step(t, 0); assert(!akl_claims(t));                                  /* the next note trig: normal */
    at_step(t, 8); assert(!akl_claims(t));                                  /* a loop where it does not fire */
    at_step(t, 9); assert(!akl_claims(t));
    /* A record ahead of a note trig does not count early: step 9 coming, step 8 playing. */
    at_step(t, 7); mem(FIRED(t))[31] = 0x38; assert(!akl_claims(t));
    mem(FIRED(t))[31] = NONE;

    /* Close on release: after an edit with a trig held, letting go closes ARP SETUP (stock's close, then a redraw). */
    set32(0x400cfebeu, 0x46c7d34cu); set32(MIDI_MODE, 1); redraws = 0;
    *mem(KEY_ROWS + 1) = 1; akl_text_claims(5); assert(akl_turn(4, 1));
    int before = redraws; akl_tick(0); assert(redraws == before);           /* still held: nothing */
    *mem(KEY_ROWS + 1) = 0; akl_tick(0); assert(closes == 1);               /* let go: closed */
    akl_tick(0); assert(closes == 1);                                       /* once */
    *mem(KEY_ROWS + 1) = 1; akl_text_claims(5); *mem(KEY_ROWS + 1) = 0; akl_text_claims(5);
    akl_tick(0); assert(closes == 1);                                       /* a tap alone: stays open */

    puts("test_akl: ok");
    return 0;
}
