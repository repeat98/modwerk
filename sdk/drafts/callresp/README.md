# CALL & RESPONSE

Version: `0.1.0-experimental` · author: [Semi Erendönmez (@semierendonmez-commits)](https://github.com/semierendonmez-commits)

![CALL & RESPONSE phrase pair](presentation/thumbnail.svg)

## Overview

CALL & RESPONSE is Nordl3's [Call / Response Generator](https://github.com/Nordl3/Call-Response-Generator) as a track
machine for the Octatrack's audio tracks. The generator writes a short call phrase and a response to it for two MIDI
channels; here the two channels are two audio tracks. The call track writes the call; an answer track rebuilds the
same call from the call track's settings and writes its response. Each phrase becomes the track's own sequencer data:

- a trig on each step that sounds, with a **PTCH** lock for its note in the chosen scale;
- a **VOL** lock on accented notes (the Part's AMP VOL + 18).

The stock sequencer plays them at the pattern's tempo, track speed, length and swing; CALL & RESPONSE keeps no clock
and runs nothing while the pattern plays ([sequencing.md](../../../docs/module-guides/sequencing.md)). Every control
change redraws the track from the settings, so a turn back restores the phrase; the trigs and locks are ordinary
sequencer data and stay when CALL & RESPONSE is turned off. Each track plays its own sample through its own AMP, LFO
and FX, so the call can be a bass and the answer a stab.

It contributes to the Modwerk base's `ot_machines` table ([HOOKS.md](../../../machines/octatrack/HOOKS.md)) and
patches no stock site; it needs the base loaded over USB and has no card form (as Beat Slicer).

## Two tracks, one pair

ROLE says what a track is: **CALL**, or **ANS1**–**ANS8**, the answer to the call on that track. The first track made
CALL & RESPONSE in a Part becomes a call; the next one answers the first call that has no answer yet, so T1 then T2
gives a pair without touching ROLE. Several answer tracks may answer one call.

- Turning a call track's control rewrites the call track **and every track answering it**: the answer always follows
  the call it hears.
- Turning an answer track's control rewrites only that track.
- An answer track whose call track is not a CALL & RESPONSE call writes nothing and says `NO CALL ON Tn`.

PHRS, on the call track, lays the pair out over the track length L (both tracks the same length):

| PHRS | Call track | Answer track |
|---|---|---|
| `C|R` | the call in the first half | the response in the second half |
| `CRCR` | the call in the first and third quarters | the response in the second and fourth; the fourth mutated by MUT |
| `LAYR` | the call over the whole length | the response over the whole length, at the same time |

## Controls

SRC SETUP (a double tap on SRC) lists CALLRESP after the stock machines; YES makes the track CALL & RESPONSE, backed by
its Flex or Static pool. The SRC page holds six controls by role; SRC SETUP keeps the sample's own setup; a push on
LEVEL shows stock's sample controls, and holding a trig or a scene shows stock's page.

On a call track:

| Encoder | Control | Default | Behaviour |
|---|---|---|---|
| A | MOTF | ACID | The motif type, its rhythm and contour: ACID, PULS, OFFB, SYNC, SPRS, ROLL, STAB, RPT, RISE, FALL, R>D, D>R, LEAP, PIVT, HOOK, ARP. |
| B | DENS | 66 | 0–127. How many steps of the phrase sound (the generator's Very sparse 0.24 to Very dense 0.92 lie around 25–110). |
| C | REPT | 90 | 0–127. How closely the phrase repeats its motif; from 90 the motif is also cloned along the phrase (Repetitive, Very repetitive). |
| D | SCAL | MINP | Minor and major pentatonic, minor, Dorian, Phrygian, harmonic minor, major, blues. The answer uses the call's scale. |
| E | PHRS | C\|R | `C|R`, `CRCR` or `LAYR`, as above. |
| F | ROLE | CALL | CALL or ANS1–ANS8 (never the track itself). |

On an answer track:

| Encoder | Control | Default | Behaviour |
|---|---|---|---|
| A | ANSW | SR+R | The answer strategy, 31 of the generator's: SR+R same rhythm and resolve, SR+C same rhythm new contour, SIMP, EXTD, TRNC (motif simplified, extended, truncated), ECHO, DLAY (delayed), UP, DOWN, INVR (inverted contour), RHY= (copy the rhythm, change the notes), NOT= (copy the notes, change the rhythm), TRN+, TRN-, >RT, >5TH, >LOW, HARD (resolves to the root, the fifth, lower, harder), RPBR (repeat then break), SPRS, BUSY, ACNT, HALF (half-phrase), FRAG (fragment), TAIL, OPPO (opposite register), DARK, BRIT, Q>C (question then closure), HOOK (hook then fill), V>I (call dominant, response tonic). |
| B | TGHT | 64 | 0–127. How close the response stays to the call: each note may be pulled into the scale's note pool and halfway to the call's note. |
| C | END | MORE | The response's last note: ROOT, 5TH, RISE, FALL, FADE (no accent), STRG (strong cadence), WEAK, AMBG (ambiguous), MORE (more resolved than the call), SAME (as the strategy leaves it), TENS (more tense). |
| D | MUT | 0 | 0–127. Mutation: up to 70% of the response's steps flipped and moved; in CRCR only the second response. |
| E | TRNS | 0 | −12..+12 semitones on the response. |
| F | ROLE | ANSn | As above. |

YES draws a new call on a call track (and rewrites its answers) and a new answer on an answer track; the seed is kept
with the settings and shown in the message, not on a page. The settings live in the Part's spare NEIGHBOR slots of the
track (nine bytes, seven bits each, after the `CR` signature); a track keeps both roles' settings when ROLE changes.

## Usage

Give the call and the answer each a pitched sample (one note, tuned to the scale's root at PTCH 0) on audio tracks of
the same length. Make T1 CALL & RESPONSE, then T2: T1 calls, T2 answers. Shape the call with MOTF, DENS and REPT, then
choose how T2 answers. With a one-bar pattern and PHRS C|R the call takes beats 1–2 and the answer beats 3–4; with a
two-bar pattern each gets a bar. LAYR makes the answer a counter-line under the call.

## Quick tutorial: a bass call and a stab answer

1. Load a bass note on T1 and a stab on T2 (Flex or Static), both 16 steps. Double-tap SRC on T1, scroll to CALLRESP and press YES; do the same on T2. T2's ROLE shows ANS1.
2. Press SRC on T1. Turn MOTF to SYNC and DENS up; T1 and T2 rewrite at once, also while playing.
3. Press SRC on T2. Turn ANSW to UP, END to ROOT and TRNS to +12; only T2 rewrites. Press YES on T2 for another answer to the same call.
4. Press PLAY. Set PHRS on T1 to CRCR and MUT on T2 to 40 for an answer that changes the second time.

## Compatibility and limitations

- Octatrack MKI or MKII, OS 1.40C, the Modwerk base loaded over USB (beta) with the machine table. Card firmware cannot include it.
- A pair takes two tracks of the same Part, at the same length. Lines are written into the current pattern when a
  control is turned or YES pressed; another pattern gets its own pair the first time it is edited.
- Pitch is a PTCH lock, −12..+12 semitones around the sample's own pitch: notes above an octave fold back into it.
- CALL & RESPONSE owns the trigs and the PTCH and VOL locks of the steps inside the track's length; other locks, trig
  conditions, micro-timing, swing and steps past the length stay.
- The generator's styles, gate, tie and slide, its other phrase modes and note-pool modes are not ported: it runs its
  neutral style, "Medium register", "Pool with spice notes", "Motif accents" and the motif's own contour. Strategies
  that only changed articulation (tighter, staccato, legato, slide) are left out; ACNT and HARD keep their accents.
- No conflicts are declared. Not yet run on a unit or in the emulator; nothing below is hardware evidence.

## Implementation

`engine.c` ports the generator's `motifTemplate`, `notePool`, `buildCall`, `buildResponse`, `applyEnding` and
`mutatePhrase` to integers, its chances in thousandths, drawing from two seeded xorshifts (the call's from the call
track's settings, the response's from both) instead of `Math.random()`, so the answer track rebuilds the call bit for
bit. `cr_generate` lays the phrases in the track's slots, `cr_write` puts the line into the record in place.
`machine.c` is the machine glue in the shape of VECTOR's `native.c` over the base: a `struct modwerk_machine`
(`callresp_machine`, signature `CR`, BACKING, order 80), the SRC page built from stock's FLEX or STATIC descriptor with
the role's names, formatters and stock's dial renderer, an input layer for encoders A–F, YES and the LEVEL push, and
generation into the current pattern's record with only this track's bit of stock's lock index set.

The USB package is built by `sdk/runtime/loader/build.py` from the two sources with
`--subscribe ot_machines:callresp_machine:80`; `verify.py` rebuilds it and compares it with the published one.

## Tests and measurements

See [TESTING.md](TESTING.md). `test_engine.py` runs the engine under the sanitizers: 60,000 lines (call and answer
tracks over settings, lengths and modes) are deterministic, inside their slots and scale and close on a sounding
step; the answer's call is the call track's; the 31 strategies are pairwise distinct; ROOT, 5TH and MORE close as the
generator's; TGHT pulls the response toward the call; MUT changes only the mutated response; the writer and packing.
Over 20,000 pairs at the defaults its step densities and mean degrees match the original generator's within a few
hundredths (run in Node from `index.html`, not part of the gate). With `m68k-elf-gcc` it builds the package and checks
the machine record at the registry's index.

## Authorship and licences

The phrase rules follow Nordl3's [Call / Response Generator](https://github.com/Nordl3/Call-Response-Generator)
(MIT, Copyright (c) 2026 Nordl3), `index.html` at `dbd1f0c35ecd37dd4d64747808fff7ea3629c1b6`. The Octatrack glue is
original, in the shape of VECTOR's `native.c` by Jannik Aßfalg (MIT, Modwerk). The module is
[GPL-3.0-or-later](LICENSE); the thumbnail is an original illustration ([presentation/LICENSE](presentation/LICENSE)).
No Elektron firmware, extracted routines, tables, samples or dumps are included; underlying Elektron interface rights
remain reserved.

## Screens and audio

No screenshots yet: SRC SETUP with CALLRESP in the machine list and both SRC pages are captured in the headless
emulator once the module runs there (`scripts/capture-module-ui.py`). No audio preview.
