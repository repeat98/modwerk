# ARP KEY LOCKS on a unit

**Octatrack MKII, OS 1.40C, 24 October 2026.** Tester: @jopolokk1 (the author), driven over USB by Claude Code.

## What ran

- Flashed: Modwerk's beta base `52b22249…`, built from the tester's own OS 1.40C with the repository's toolchain (byte-identical to the committed base, `.bin` SHA-256 `195203f6…`), installed with PROJECT > SYSTEM > OS UPGRADE.
- RAM-booted over USB (`npm run device -- boot`): the base with `ev_midi_note_key`, `ev_arp_setup_knob` and `ev_arp_setup_text` (pull request #857), `2b032fd9…`.
- The package, as a trial (`npm run device -- try … --seconds 1200`, then `--seconds 1800`), never accepted or kept: ARP KEY LOCKS `0.1.0-experimental`, `c654f64e…` (1,896 bytes of code and data, 3 hooks, no stock-code site), built from this folder's `akl.s` and `unit.s`. Each trial rolled back by itself.
- A scratch project (NORD3), MIDI track 1 on channel 1 to an external synth, a trig on step 1 with a chord (NOT2, NOT3) and the arpeggiator on (MODE UP).

## Reported by the tester

- Holding a trig in MIDI ARP SETUP, the KEY box showed `--` on a step without a lock; turning KEY stepped through the keys one name per detent ("a bit sensitive", acceptable); turning past OFF showed `--` again.
- With locks set, the arpeggio kept running smoothly while the key changed on the locked steps.
- With no trig held, KEY changed the track's own KEY, as on stock.
- No freeze or error on screen.

## Measured over USB MIDI

The base's USB MIDI port recorded with `aseqdump`, MIDI clock and transport sent (24 clocks a quarter note, so a step is 6 clocks):

- Locks C MAJ on step 1, C MIN on 5, C MAJ on 9, C MIN on 13, chord C-E-B (NOT2 +4, NOT3 +11), one run of 477 notes from START to STOP: steps 1-4 sent only C, E and B; steps 5-8 only C, E♭ and B♭; steps 9-12 C, E, B; steps 13-16 C, E♭, B♭. Every note was in the key that holds on its step.
- Every run that ended with STOP had every note-on matched by its note-off.
- The base's heartbeat (diagnostic ticks) advanced at 60 a second throughout both trials; the transport-refusal counter stayed at the 9 it read after the RAM boot.

## Second session, the same day: arp note shifts

The same unit and base, ARP KEY LOCKS with arp note shifts (D picks the arp note, E shifts it), package `03915850…`, as a trial, never kept. The project: MIDI track 1 with trigs on steps 1 and 9, the arpeggiator on, LEN 4.

- Reported: holding trig 9, D showed N1 to N4 and E +1 in the KEY box; the shift played on trig 9's arpeggio and not on trig 1's ("now seems correct").
- Measured over USB MIDI with clock, three loops: trig 1's arpeggio played C D F G and C D F G (steps 1-8); trig 9's played C D F A and C D F A (steps 9-16): its 4th note one step of the key higher, every loop the same.
- An earlier package of this session read the step the sequencer prepares next (`0x800064d0`), so a key or shift changed one step early; the first session's progression did not show it, because its notes at the boundaries were in both keys. The package above reads the playing step (`0x800064e0`).
- Also found here: tapping a trig in ARP SETUP switches that arp step on or off (stock), so the arp note is picked with D, not with a second trig.

## Third session, the same day: trig conditions and closing ARP SETUP

The same unit and base, packages `871cfc87…` and `1d086d7b…`, as trials, never kept.

- An arp note shift on a trigless trig with a trig condition: measured over USB MIDI, the arpeggio differed in two notes in every other 96-clock window and was identical in the windows between, the same notes each time (the recording began mid-pattern, without START, so the steps are not numbered; whether the condition was 1:2 or the pattern 32 steps was not established).
- Reported: holding a trig, opening ARP SETUP, turning a knob and letting go of the trig closed ARP SETUP and showed the page with the pattern's trigs ("now it closes").

## Fourth session, 26 October 2026: the published package, kept

Flashed base `92a13ff0…` (main through #925 with the KEY events of #857), nine other modules kept (E-Verb, TapeHead, Repitch, Play Modes, Sidechain, Euclid, Mute Modes, Output Matrix, Deja Vu). The published package `7962c35a…` (Arp Key Locks), over USB with `npm run device -- try`.

- A 20 s trial without Keep, project EMPTY: ran, then rolled back by itself.
- Kept (`--accept`): the inventory named Arp Key Locks in place of the earlier `1d086d7b…` (ARP KEY LOCKS), the nine others unchanged. After a power cycle the flashed base listed the same ten modules, Arp Key Locks among them.
- The base's self-test (PROJ > MODWERK > SELF TEST over USB), project EMPTY, three runs: one **failed**, "a core over 90 % (E-Verb)", the T5-8 DSP core at 98.5 %; two passed, T5-8 at 69.4 %. In all three, 10/10 modules intact, the three DSP effects ran, CPU 45.7-45.9 %, longest frame 414-420 µs; the DSPs did not stop. Arp Key Locks has no DSP code; the cause of the one spike is not established from three runs.
- Project GAMUT, pattern 1, MIDI track 1 (the tester's own locks), played about 7 bars, recorded on the base's USB MIDI port with `aseqdump` (no clock sent, so the steps are not numbered): 16 notes a bar; notes 1-7 and 9-15 the same in every bar, notes 8 and 16 changing in a four-bar cycle (F♯4/A5, A4/C6, E4/G5, D4/F♯5) that repeated identically; 115 note-ons, each with its note-off. Reported: "I think I saw the arp changes in all bars", "seems to work". The notes were not compared with the locks the project holds.

## Fifth session, 27 October 2026: the reviewed fixes, package `907a03cf…`

Flashed base `c1ae2ee9…` (main through #912), nine other modules kept (E-Verb, TapeHead, Repitch, Play Modes, Sidechain, Euclid, Mute Modes, Output Matrix, Deja Vu). Package `907a03cf…` (4,400 bytes of code and data, 84 of bss, 68 relocations, 4 hooks, no stock-code site), built from source `53b2b444` (the arp note shift stored + 7), over USB with `npm run device -- try`. Notes recorded on the base's USB MIDI port with `aseqdump`, timestamped on the computer (no clock sent).

- A 20 s trial without Keep: ran, no refusals, rolled back by itself. Then kept (`--accept`): active `907a03cf…`, ten modules listed.
- Reported: holding a trig, [FUNC] + [AMP], turning KEY and letting go closed ARP SETUP and showed the pattern's trigs.
- Reported, after the power cycle: holding a trig and pressing [AMP] twice also opened ARP SETUP; turning KEY and letting go closed it the same way.
- Reported: on a held trig, D at N16 and E turned down showed -1 and further, down to -7 (in `1d086d7b…`/`7962c35a…` N16 -1 read as no setting).
- Project GAMUT, MIDI track 1, 64 steps at about 112 BPM (134 ms a step), trigs on steps 1 and 17 with the same chord (A C E F, arp up and down over three octaves). Step 1 locked A MIN, step 17 locked G♯ MIN with micro-timing -1/64. Three loops, each the same: step 1 played A C E F; step 17's first note came 33-34 ms before its step and was A (45), in the previous step's key; every later note of its arpeggio was in G♯ minor (C to B, F to E, A to G♯). With step 17 at A DOR, F played as E; with G♯ MAJ, E played as D♯ and F as F.
- The project saved and reloaded: three loops note for note the same as before.
- Module removed over USB (`remove --accept`; the run's counter showed 2 refusals, no detail on this release base): three loops with both trigs playing the chord as written (A C E F), the G♯ MIN lock ignored, step 17 still 33 ms early. Then installed and kept again: active `907a03cf…`, ten modules.
- 989 note-ons over the session, each with its note-off. No freeze or error.
- **After a power cycle:** the flashed base listed the same ten modules, Arp Key Locks among them; GAMUT loaded and three loops played note for note as before (step 17's early first note still A, the rest in G♯ minor). 194 note-ons, each with its note-off.

## Not covered

Card builds on a unit; the MKI; PER TRACK lengths, Part changes and copying trigs on a unit; TRAN other than 0; load and timing on the unit (the performance record is emulator figures).
