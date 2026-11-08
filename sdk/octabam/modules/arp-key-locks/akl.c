/* SPDX-License-Identifier: MIT
 * ARP KEY LOCKS: a KEY (root and mode) locked on a MIDI track's step, kept in that step's spare lock byte 30, which
 * stock neither edits, applies nor validates. A lock holds until the next locked step and wraps at the track's
 * length; a track with no lock in its pattern plays stock's KEY. Compiled to akl.s with the reviewed GCC
 * (README, "Tests and measurements"); unit.s connects it to the two stock sites. Stock addresses: OS 1.40C. */
#include <stdint.h>
#ifndef AKL_HOST /* test_akl.c maps these onto a model of the unit's memory */
#define U8(a) (*(volatile uint8_t *)(uintptr_t)(a))
#define U32(a) (*(volatile uint32_t *)(uintptr_t)(a))
#define AKL_CALL(type, a) ((type)(uintptr_t)(a))
#define AKL_EDITED(bank) (U32((bank) + 0x9b332u) = 1, U32(0x100f8598u) = 1)
#define AKL_DIRTY() (U32(0x46c7c72cu) = 1) /* the screen to flush */
#endif

#define BANK(b) (0x400e21e0u + (uint32_t)(b) * 0x9b340u) /* a bank's RAM */
#define PATTERN 0x8ed8u
#define MIDI_TRACK(t) (0x48d0u + (uint32_t)(t) * 0x8b0u) /* a MIDI track's record in its pattern */
#define LOCK30(s) (0x30u + (uint32_t)(s) * 32u + 30u)     /* step s's spare lock byte: its key */
#define LOCK31(s) (0x30u + (uint32_t)(s) * 32u + 31u)     /* the other: arp note (high nibble), shift + 7 (low; 0 ends one) */
#define ARP_POS(t) (0x46c77b17u + 10u * (t))            /* MIDI track t's arpeggiator: its place in the note sequence (0..LEN) */
#define ARP_MODE(t) (0x46c76fe0u + 32u * (t) + 14u)     /* its MODE as it plays (locks applied), 0 OFF */
#define LIVE_KEY(t) (0x46c76df1u + 0x44u * (t))         /* the track's KEY as it plays */
#define FIRED(t) (0x46c7a000u + 32u * (t))              /* the lock bytes of track t's trig stock fires next or now: only
                                                           when its condition passes; 0xff without a trig */
#define CS1_PATTERNS 0x1001614eu                        /* the current bank's patterns, battery-backed */
#define PLAY_BANK 0x800065bdu                           /* the bank and pattern the sequencer plays */
#define PLAY_PATTERN 0x800065beu
#define STEP(t) (0x800064e0u + 8u + (t))                /* MIDI track t's step as it plays (0x800064d0 is the next one, prepared ahead) */
#define UI_BANK 0x46c82456u                             /* the bank RAM the UI edits */
#define UI_TRACK 0x100b14ccu
#define UI_PATTERN 0x100b14d0u
#define UI_PART 0x100b14cfu
#define KEY_ROWS 0x46100b18u   /* the panel's key rows as last read: row 0 trig keys 1-8, row 1 keys 9-16 */
#define STEP_PAGE 0x460d1e04u  /* the step page shown, 0-3: trig key k is step 16 * page + k */
#define MIDI_MODE 0x80000012u
#define PART_KEY(t) (0x8f273u + (uint32_t)(t) * 0x24u)  /* in the UI's bank + Part * 0x18b2: setup +0x11 */

#define NONE 0xffu
#define SHIFT(r) ((int)((r) & 15u) - 7) /* lock 31's shift, -7 to +7: stored + 7, so N16 -1 never reads as NONE */
#define LAST 84u /* 0 OFF, then 1 + 7 * root + mode */

/* The seven modes, bit k for k semitones above the root. */
static const uint16_t modes[7] = {
    0x0ab5, /* MAJOR:      0 2 4 5 7 9 11 */
    0x06ad, /* DORIAN:     0 2 3 5 7 9 10 */
    0x05ab, /* PHRYGIAN:   0 1 3 5 7 8 10 */
    0x0ad5, /* LYDIAN:     0 2 4 6 7 9 11 */
    0x06b5, /* MIXOLYDIAN: 0 2 4 5 7 9 10 */
    0x05ad, /* MINOR:      0 2 3 5 7 8 10 */
    0x056b, /* LOCRIAN:    0 1 3 5 6 8 10 */
};

/* A pitch moved into the key: an out-of-key note goes one semitone down, as stock's KEY does; in every mode here
 * the note below an out-of-key note is in the key. */
int akl_snap(int note, unsigned key)
{
    if (!key || key > LAST || note < 0) return note;
    unsigned root = (key - 1u) / 7u, mode = (key - 1u) % 7u;
    unsigned degree = ((unsigned)note + 12u - root) % 12u;
    return modes[mode] >> degree & 1u ? note : note - 1;
}

/* The track's length in steps: its own in per-track mode (+0x8e55 set), else the pattern's (+0x8e53; the emulator's
 * 16-step loop follows it, not +0x8e51). */
static unsigned length(uint32_t pattern, uint32_t track)
{
    unsigned n = U8(pattern + 0x8e55u) ? U8(track + 0x28u) : U8(pattern + 0x8e53u);
    return n < 1u ? 1u : n > 64u ? 64u : n;
}

/* The key that holds on step s (lock byte 30): the nearest lock at or before it, wrapping at the length; NONE
 * without any. */
static unsigned held_from(uint32_t track, unsigned s, unsigned n, unsigned b)
{
    uint32_t at = track + 0x30u + 32u * s + b, first = track + 0x30u + b, last = track + 0x30u + 32u * (n - 1u) + b;
    for (unsigned k = n; k; --k) { /* backwards from s, wrapping at the length: no division in the interrupt */
        unsigned v = U8(at);
        if (b == 30u ? v <= LAST : v != NONE) return v;
        at = at == first ? last : at - 32u;
    }
    return NONE;
}

/* Per MIDI track, the last answer and what it was for: one scan per step, not per note. A lock edit bumps gen. */
static uint32_t cache_for[8];
static uint8_t cache_key[8];
/* Per MIDI track, the arp note shift in force and the step it was last brought up to date on: a note trig sets it
 * to its own setting (or none), a fired trig or trigless trig carrying one sets it (as stock applies a lock), and it
 * holds until the next note trig. */
static uint8_t shift_now_r[8] = {0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff};
static uint8_t shift_step[8] = {0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff};
static uint32_t shift_track[8];
static uint8_t gen = 1;

unsigned akl_key(unsigned t)
{
    if (t > 7u) return NONE;
    unsigned b = U8(PLAY_BANK), p = U8(PLAY_PATTERN), s = U8(STEP(t));
    if (b > 15u || p > 15u) return NONE;
    uint32_t want = (uint32_t)gen << 24 | b << 16 | p << 8 | s;
    if (cache_for[t] != want) {
        uint32_t pattern = BANK(b) + p * PATTERN, track = pattern + MIDI_TRACK(t);
        unsigned n = length(pattern, track);
        cache_key[t] = (uint8_t)held_from(track, s % n, n, 30u);
        cache_for[t] = want;
        shift_track[t] = track;
    }
    /* The shift: a new step with a note trig (the track's first mask, 64 bits, high byte first) starts from that
     * trig's own setting; a fired record carrying one switches it on. Stock fills that record a little ahead of its
     * step, so it counts only while the next step has no note trig: it is then a trigless trig's (or this step's). */
    uint32_t tr = shift_track[t];
    unsigned n = length(BANK(b) + p * PATTERN, tr), next;
    s %= n; next = (s + 1u) % n;
    if (s != shift_step[t]) {
        shift_step[t] = (uint8_t)s;
        if (U8(tr + 7u - s / 8u) >> (s % 8u) & 1u) shift_now_r[t] = U8(tr + LOCK31(s));
    }
    if (!(U8(tr + 7u - next / 8u) >> (next % 8u) & 1u)) {
        unsigned r = U8(FIRED(t) + 31u);
        if (r != NONE) shift_now_r[t] = (uint8_t)r;
    }
    return cache_key[t];
}

/* Stock's KEY (OFF, then 1 + 2 * root + minor) as a lock value, the start of a new lock. */
static unsigned from_stock(unsigned k)
{
    if (!k || k > 24u) return 0;
    return 1u + 7u * ((k - 1u) >> 1) + ((k - 1u) & 1u ? 5u : 0u);
}

/* The trig keys held now, bit k for key k. Stock's held-trig word stays 0 while a SETUP window is open, so the
 * panel's own rows are read. */
static unsigned held_trigs(void) { return U8(KEY_ROWS) | (unsigned)U8(KEY_ROWS + 1u) << 8; }

/* The step being edited in ARP SETUP: the first trig held. Tapping another trig there switches that arp step on or
 * off (stock), so the arp note is picked with D instead. Seen on every redraw (stock redraws on each trig) and turn. */
static int order_step = -1, order_note = -1, show_shift; /* show_shift: the KEY box shows the shift, not the key */
static unsigned order_prev;
static int lowest(unsigned m) { int k = 0; while (!(m >> k & 1u)) ++k; return k; }
static void track_trigs(void)
{
    unsigned h = held_trigs(), fresh = h & ~order_prev;
    if (!h) order_step = order_note = -1, show_shift = 0;
    else if (order_step < 0 || !(h >> order_step & 1u)) { order_step = lowest(fresh ? fresh : h); order_note = -1; show_shift = 0; }
    order_prev = h;
}

/* The step's arp note shift, when the arp on track t is about to send the note it names; NONE otherwise. While the
 * note is sent the arp's place is that note's own (emulator, calibrated against stock's arp). */
static unsigned shift_now(unsigned t)
{
    unsigned r = shift_now_r[t];
    if (r == NONE || !SHIFT(r) || !U8(ARP_MODE(t))) return NONE; /* 0: back to the arp's own note */
    unsigned pos = U8(ARP_POS(t)), n = U8(LIVE_KEY(t) - 0x11u + 0x0eu) + 1u; /* the arp's LEN, setup +0x0e, 0-15 */
    return n && pos % n == (r >> 4) ? r : NONE;
}

/* A note moved k steps through the key, or k semitones with no key (OFF). */
int akl_move(int note, unsigned key, int k)
{
    if (key && key <= LAST) note = akl_snap(note, key);
    for (; k > 0 && note < 127; --k) do ++note; while (key && key <= LAST && akl_snap(note, key) != note && note < 127);
    for (; k < 0 && note > 0; ++k) do --note; while (key && key <= LAST && akl_snap(note, key) != note && note > 0);
    return note;
}

/* The note of track t, a2's byte at the site: moved into the step's key, and by the step's shift when the arp sends
 * the note it names. 1 when the note is ours to send as it is now, 0 for stock's own KEY correction. */
int akl_note(unsigned t, volatile int8_t *note)
{
    unsigned key = akl_key(t), r = shift_now(t);
    if (key == NONE && r == NONE) return 0;
    if (key == NONE) key = from_stock(U8(LIVE_KEY(t)));
    if (*note >= 0) *note = (int8_t)(r == NONE ? akl_snap(*note, key) : akl_move(*note, key, SHIFT(r)));
    return 1;
}

/* ev_midi_note_key's claim: the tracks a lock holds on, or whose arp note the step shifts now. */
int akl_claims(unsigned t) { return akl_key(t) != NONE || shift_now(t) != NONE; }


/* ev_arp_setup_knob, encoder F (KEY) with trigs held: each held trig's step gets a lock, delta values on from its
 * own (from the track's KEY when it has none). Below OFF is no lock. Written as stock's lock editor writes: the
 * pattern, its battery-backed copy, the edited flags. */
void akl_knob(int delta)
{
    unsigned held = held_trigs(), t = U8(UI_TRACK), p = U8(UI_PATTERN);
    uint32_t bank = U32(UI_BANK);
    if (!held || t > 7u || p > 15u || bank < 0x400e21e0u || bank > BANK(15)) return;
    uint32_t track = bank + p * PATTERN + MIDI_TRACK(t);
    uint32_t mirror = CS1_PATTERNS + p * PATTERN + MIDI_TRACK(t);
    unsigned stock = U8(bank + U8(UI_PART) % 4u * 0x18b2u + PART_KEY(t));
    for (unsigned k = 0; k < 16u; ++k) {
        if (!(held >> k & 1u)) continue;
        unsigned s = (k + 16u * U32(STEP_PAGE)) & 63u;
        unsigned v = U8(track + LOCK30(s));
        int now = v <= LAST ? (int)v : (int)from_stock(stock);
        now += delta;
        unsigned out = now < 0 ? NONE : now > (int)LAST ? LAST : (unsigned)now;
        U8(track + LOCK30(s)) = (uint8_t)out;
        U8(mirror + LOCK30(s)) = (uint8_t)out;
    }
    gen = (uint8_t)(gen == 255u ? 1u : gen + 1u);
    AKL_EDITED(bank);
    AKL_CALL(void (*)(void), 0x40027e00u)();
    /* As stock's KEY edit ends: ARP SETUP redrawn (its KEY now the lock's, akl_key_text), then its tail. */
    AKL_CALL(void (*)(void), 0x40079d48u)();
    AKL_CALL(void (*)(int, int), 0x4007e998u)(0, delta);
}

/* The edited step's shift record, and its address in the pattern (0 without a step). */
static uint32_t shift_at(void)
{
    unsigned t = U8(UI_TRACK), p = U8(UI_PATTERN);
    uint32_t bank = U32(UI_BANK);
    if (order_step < 0 || t > 7u || p > 15u || bank < 0x400e21e0u || bank > BANK(15)) return 0;
    return bank + p * PATTERN + MIDI_TRACK(t) + LOCK31(((unsigned)order_step + 16u * U32(STEP_PAGE)) & 63u);
}

/* The note D picks starts at the one the step's own setting names, else at the first. -2: D turned below N1, the
 * step's setting removed. */
static void pick_note(void)
{
    uint32_t at = shift_at();
    if (order_note == -1) order_note = at && U8(at) != NONE ? (int)(U8(at) >> 4) : 0;
}

/* After an edit, as stock's KEY edit ends: ARP SETUP redrawn (its KEY box, akl_key_text), then its tail. */
static void after_edit(int delta, int changed)
{
    if (changed) {
        gen = (uint8_t)(gen == 255u ? 1u : gen + 1u);
        AKL_EDITED(U32(UI_BANK));
        AKL_CALL(void (*)(void), 0x40027e00u)();
    }
    AKL_CALL(void (*)(void), 0x40079d48u)();
    AKL_CALL(void (*)(int, int), 0x4007e998u)(0, delta);
}

static void store_shift(uint32_t at, unsigned r)
{
    U8(at) = (uint8_t)r;
    U8(at - U32(UI_BANK) + CS1_PATTERNS) = (uint8_t)r;
}

/* Encoder E with a step held: the step's shift of the note D picked, -7 to +7 steps of the key, held until the next
 * trig or step with one; 0 ends a shift there. Written as the KEY locks are. */
static void akl_shift(int delta)
{
    uint32_t at = shift_at();
    if (!at) return;
    if (order_note < 0) order_note = -1, pick_note();
    unsigned r = U8(at);
    int k = r != NONE && (int)(r >> 4) == order_note ? SHIFT(r) : 0;
    if (r != NONE && (int)(r >> 4) == order_note) k += delta;
    else k = delta;
    k = k < -7 ? -7 : k > 7 ? 7 : k;
    store_shift(at, (unsigned)order_note << 4 | (unsigned)(k + 7));
    after_edit(delta, 1);
}

/* Encoder D with a step held: picks the arp note, N1 to N16; below N1 removes the step's setting. */
static void akl_pick(int delta)
{
    if (order_note == -1) { pick_note(); after_edit(delta, 0); return; }
    int was = order_note;
    order_note = order_note == -2 ? (delta > 0 ? 0 : -2) : order_note + delta;
    order_note = order_note > 15 ? 15 : order_note < 0 ? -2 : order_note;
    uint32_t at = shift_at();
    if (order_note == -2 && was != -2 && at && U8(at) != NONE) { store_shift(at, NONE); after_edit(delta, 1); return; }
    after_edit(delta, 0);
}

/* ev_arp_setup_knob: an encoder turned while a trig is held in MIDI mode. F (5) locks the key, D (3) picks the arp
 * note, E (4) shifts it. 1 when the module took the turn. An edit marks ARP SETUP to close when the trigs are let go
 * (akl_tick), back to the page that shows the pattern's trigs. */
static int close_on_release;
int akl_turn(unsigned encoder, int delta)
{
    track_trigs();
    if (!U32(MIDI_MODE) || !held_trigs()) return 0;
    if (encoder == 5u) { show_shift = 0; close_on_release = 1; akl_knob(delta); return 1; }
    if (encoder == 3u) { show_shift = 1; close_on_release = 1; akl_pick(delta); return 1; }
    if (encoder == 4u) { show_shift = 1; close_on_release = 1; akl_shift(delta); return 1; }
    return 0;
}

#define ARP_SETUP_OPEN 0x400cfebeu /* MIDI ARP SETUP's window, 0 while closed */
/* module_tick (the base's UI tick, over USB; card builds have none and leave ARP SETUP open, as stock): after an
 * edit with a trig held, letting go of every trig closes ARP SETUP with stock's own close (0x40079abc, the UI task's,
 * as its window table calls it) and redraws the page, as stock's FUNC + AMP does. Tapping trigs alone, stock's arp
 * step switches, never closes it. */
void akl_tick(void *api)
{
    (void)api;
    if (!close_on_release || held_trigs()) return;
    close_on_release = 0;
    if (!U32(ARP_SETUP_OPEN) || !U32(MIDI_MODE)) return;
    AKL_CALL(void (*)(void), 0x40079abcu)();
    AKL_CALL(void (*)(int), 0x4004d948u)(-1);
    AKL_DIRTY();
}

/* The scale names in stock's three letters, and the roots. */
static const char names[7][4] = {"MAJ", "DOR", "PHR", "LYD", "MIX", "MIN", "LOC"};
static const char roots[12][3] = {"C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"};
static void put(volatile char *to, const char *from) { do *to++ = *from; while (*from++); }

/* ev_arp_setup_text's claim: KEY (slot 5) in MIDI mode while a trig is held. */
int akl_text_claims(unsigned slot) { track_trigs(); return slot == 5u && U32(MIDI_MODE) && held_trigs(); }

/* KEY's text while a trig is held, in stock's layout (the bottom line at buffer, the top at buffer + 5): with an arp
 * note picked with D or shifted with E last, its shift on the step (N4 over +1, or -- for none); else the step's own
 * lock, OFF, or -- for none. */
void akl_key_text(volatile char *buffer, unsigned value)
{
    unsigned t = U8(UI_TRACK), p = U8(UI_PATTERN);
    uint32_t bank = U32(UI_BANK);
    (void)value;
    put(buffer, "");
    if (order_step < 0 || t > 7u || p > 15u || bank < 0x400e21e0u || bank > BANK(15)) { put(buffer + 5, "--"); return; }
    uint32_t step = bank + p * PATTERN + MIDI_TRACK(t), s = ((unsigned)order_step + 16u * U32(STEP_PAGE)) & 63u;
    if (show_shift && order_note == -2) { put(buffer + 5, "--"); return; }   /* the step's setting removed */
    if (show_shift && order_note >= 0) {
        unsigned r = U8(step + LOCK31(s));
        char top[4] = {'N', (char)('1' + order_note % 9), 0, 0}, low[3] = {'-', '-', 0};
        if (order_note >= 9) { top[1] = '1'; top[2] = (char)('0' + order_note - 9); }
        if (r != NONE && (int)(r >> 4) == order_note) {
            int k = SHIFT(r);
            if (!k) { low[0] = '0'; low[1] = 0; }
            else { low[0] = k < 0 ? '-' : '+'; low[1] = (char)('0' + (k < 0 ? -k : k)); }
        }
        put(buffer + 5, top); put(buffer, low);
        return;
    }
    unsigned v = U8(step + LOCK30(s));
    if (v > LAST) put(buffer + 5, "--");
    else if (!v) put(buffer + 5, "OFF");
    else { put(buffer, names[(v - 1u) % 7u]); put(buffer + 5, roots[(v - 1u) / 7u]); }
}

/* ev_arp_setup_knob's claim: MIDI mode and a held trig. Encoder F is checked by the entry, which sees it. */
int akl_knob_claims(void) { return U32(MIDI_MODE) && held_trigs(); }
