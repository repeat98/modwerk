# Improved AMP: testing

Improved AMP 0.1.0-experimental, Analog Rytm MKII OS 1.74, on the Modwerk base (core-ar2 0.7) with the
amp record hook. The sections from "Unit, ED02" down record the module's builds under its earlier name,
Improved Envelopes (symbols `envelopes_*`, now `improved_amp_*`; HLD then read in ms). "ENV RESET AMP
pre-fade" records the pre-fade's builds from before it moved into this module. The test builds' `.syx`
files stayed on the tester's computer.

## This version on a unit: IL02, 9 and 10 Nov 2026

The author's Analog Rytm MKII, OS 1.74. Image IL02 (sha256 `a569c9f5…284c`): a development build of the
Modwerk base (core-ar2 0.7) that adds a USB test link, and this module alone, built from this folder's
`build.json` and `src/` (0.1.0-experimental; fingerprint, the `sha256` of `sha256sum build.json
src/amp-write.s src/improved-amp.c src/ovr.s src/pre-fade.c src/pre-fade.s`: `54f0d4b9…b4b4`,
`evidence.sourceSha256`). It was loaded to RAM over USB: the unit's flash was not written, and a power
cycle ends it. IS01 (sha256 `c08c226d…ee90`) is the same base and link without the module, for the
columns marked stock.

Run hands off by the author's automated test rig, as reported in the rig's run record; the figures below
are copied from it. The link presses keys, turns knobs and reads the screen; USB MIDI sends CCs and notes
on the auto channel; the BD voice's USB audio channel (OVERBRIDGE mode) is recorded at 48 kHz. Scratch
project, kit 1, pattern A01, 120.0 BPM, the BD track playing a sample at 1043.5 Hz, unless said. 25
cases; each passed in its last run on the unit. Measures, in ms: `len20` is from the first hit's onset
to where it falls 20 dB under the take's peak; a dip is the voice falling 30 dB under the peak for 1 ms
or more inside a hit and coming back, from within 10 dB of the peak and inside 20 ms on each side: a
fade before a trig while the voice still rings.

Screens:

| Read | Shown |
| --- | --- |
| AMP ATK at 0, 1, 25, 45 | 0, 0.2ms, 5.0ms, 15.0ms |
| AMP DEC at 0, 1, 25, 55, 89, 126, 127 | 0, 0.2ms, 5.0ms, 25ms, 300ms, 39.4s, INF |
| AMP OVR at 0, 1, 64, 127 | 0, 1, 64, 127 |
| AMP HLD at 0, 1, 6, 7, 15, 42, 126, 127, 120 BPM | 0, 0.005, 0.032, 0.037, 0.080, 1.00, 124, AUTO |
| The same at 139.0 BPM (9 Nov) | 0, 0.006, 0.037, 0.043, 0.093, 1.16, 144, AUTO |
| HLD 42 at 90 BPM; at track speed 1x, 3/2x, 3/4x, 1x | 0.75; 1.00, 1.50, 0.75, 1.00 |
| FUNC + turn on HLD, from 7 | 1.00 (139 BPM: 1.16), AUTO, back to 1.00, 0 |
| FILTER ATK, DEC, REL at 25; DEC, REL at 127 | 5.0ms; 45.0s |
| SOUND SETTINGS, ENV RESET | OFF, AMP, FILTER, AMP+FILT, stopping at both ends |
| HLD 42 and ENV RESET AMP saved with the kit, changed to 10 and OFF, kit reloaded | 42 and AMP again |

Sound, one MIDI note a take, ATK 0 and DEC 55 unless set (lengths by DEC and HLD: the range over six
runs that day):

| Measure | Read |
| --- | --- |
| `len20` by DEC | 9.5 to 10.0 at 55, 102.5 at 89, 2941.0 to 2942.5 at 127 (INF, a 3 s take; 2858.0 in the run with the late stream, below) |
| ATK 45 | attack 15.5 (1.0 at ATK 0), the peak -12.43 dBFS against -12.48 |
| `len20` by HLD | 10.0 at 0, 20.0 to 20.5 at 15, 61.0 to 61.5 at 31, 134.5 at 42, 307.5 to 308.0 at 57 |
| HLD 42 | 134.5 to 135.0 for a 100 ms and for a 400 ms note and at 90 BPM, 134.5 at track speed 3/2x: a time, not steps or the note |
| HLD AUTO | 108.0 to 109.5 for a 100 ms note, 509.0 to 509.5 for a 500 ms note: the note's length |

OVR, the hit's peak against the same hit at OVR 0, in dB (-12.43 dBFS at 0 and -3.79 at 127 on both
images; on IL02 an earlier run read `len20` 134.5 to 135.0 at eleven values from 0 to 127):

| OVR | 1 | 2 | 8 | 12 | 16 | 32 | 48 | 64 | 96 | 112 | 126 | 127 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| stock (IS01) | +1.29 | +2.50 | +5.86 | +6.47 | +6.84 | | | +8.17 | | | | +8.64 |
| module (IL02) | +0.14 | | +1.25 | | +2.50 | +4.63 | +5.77 | +6.48 | +7.51 | +8.00 | +8.56 | +8.64 |

So the ends are stock's, and the module's 8 gives stock's 1, 16 stock's 2 and 64 stock's 12. Three runs
read OVR 64 as +6.37, +6.48 and +6.51.

FILTER envelope as sound, the lowpass closed and opened fully by the envelope, `len20` (DEC: a held
note, SUS 0; REL: a short note, SUS at the top):

| Value | 23 | 65 | 75 | 85 | 89 |
| --- | --- | --- | --- | --- | --- |
| stock DEC | 37.0 | 336.0 | 528.5 | 826.5 | 985.5 |
| module DEC | | 7.0 | 13.5 | 25.0 | 36.5 |
| stock REL | 85.5 | 385.0 | 580.0 | 882.5 | 1045.5 |
| module REL | | 56.0 | 61.5 | 73.5 | 85.5 |

The module's 89 is stock's 23, as the tables are built.

ENV RESET's fade. HLD 57 holds each hit into the next, so a fade shows as a dip:

| Pattern on the BD track | ENV RESET AMP | OFF |
| --- | --- | --- |
| A trig on every second step, 19 trigs | 18 dips (AMP+FILT: 18; FILTER: 0) | 0 |
| Eight MIDI notes 250 ms apart, no pattern | 0 | 0 |
| A note rings, PLAY, the trig on step 1 strikes it; stopped before step 3, and after it | 0 dips, the note longer (493.5 against 307.5); 1 dip | |
| Two trigs with a retrig lock (RATE 1/16, LEN 1/4), 5 trigs played | 15 dips | 0 |
| A retrig lock on step 1 and a note trig on step 3, which ends the series; three times round | 6 dips; first hit 557.5 | 0; 557.5 |
| The same retrig lock at 200 BPM, three times round | 9 dips, the shortest 74.5 apart | 0 |
| Note trigs on 1 and 3, a lock trig without a note on 2; three times round | 3 dips (none for the lock trig) | |
| A retrig lock on 1, a lock trig on 3 with RTRG at 1/32; three times round | 15 dips, the shortest 61.0 apart; first hit 745.0 | 0; 745.0 |
| Trigs on 1, 2, 3; then step 2 on FILL (FILL mode off); then on 2:2; three times round each | 6, 3 and 4 dips, 3 hits each | |
| Trigs on 1, 3, 5, 7, step 3 late and step 5 early by 5/384 | 3 dips a time round, 197.5 and 276.5 apart | |
| A trig on each of steps 1 to 15, swing 50 %, then 66 % | 14 dips: 124.5 to 125.5 apart, then 85.5 and 164.5 in turn | |
| A trig on every second step; five play, the track is muted by CC 94 for 1.5 s, five more play | 8 dips, 2 hits; the hit before the mute 1307.5 long, as in a take stopped there instead | 0 dips, 2 hits; 1307.5 |
| ENV RESET edited in SOUND SETTINGS while the pattern plays: OFF, AMP, OFF | 0 dips, 8 in 2 s from 0.5 s after the edit, 0 | |

Sound locks, trigs on steps 1, 3 and 5 (the first after PLAY is never faded for): the kit's sound at AMP
2 dips; step 3 locked to a pool sound at OFF 1; the kit's sound at OFF 0; step 3 locked to a pool sound
at AMP 1. In each take's first 520 ms, which end between steps 3 and 5: 1, 0, 0, 1. So a sound-locked
trig is judged by its own sound, and the kit's sound's trig after it by the kit's.

The first eleven cases, run again against their kept references: every hit's length within 1 ms and
its peak within 0.03 dB of the first run's, the dips equal.

Seen on the way, as the rig's record has it (the five takes' reading and the kit's BD lengths are
from the kept takes themselves, not from the record):

- The first note after loading an image to RAM came out near silent in some boots (about -62 dBFS
  against -12.4, no 1 kHz tone on the BD voice or on MAIN); the second and third notes were at full level
  in all of them. One case, the note about a second after the unit answered again: IL02 7 of 12
  boots, IS01 (without the module) 3 of 11. With 3 s before the first note: 0 of 7 (IL02 4, IS01 3). So
  it happens without the module, and the wait avoided it each time; its cause and a boot from flash are
  not decided. In five kept takes the quiet note's level moves at the trig and again 126 ms later, where
  HLD 42 ends: the amp envelope ran on time and the sample did not sound.
- Not every run passed. Runs failed on screen references kept at another tempo (139.0 against 135.7
  BPM), on a case's own fault (the SOUND SETTINGS row it started from), on a late audio stream (next
  line) and once on a screen read that got no reply; one was stopped by a touch of the panel, as the
  rig is meant to. Each case's last run passed.
- In two whole runs the rig's audio stream began one 85.3 ms block late: onsets read about 142 ms
  instead of 58 ms, with lengths, peaks and dips unchanged. The recorder was corrected for it.
- Kit values meet the new curves at once: the kit's BD, untouched, read `len20` 642.5 on IS01 and 9.5 to
  10 on IL02 (one boot each), as "Changes to stock flows" in the README says.

Not run on a unit in this version:

- This package's own image, IA08 (this module on the plain base, no link), and a boot from flash.
- A power cycle, a project save and load, a sound stored to the +Drive and loaded again (a kit save and
  reload was run, and pool sounds stored by hand played through sound locks, above).
- Pads: a pad hit, and a pad roll let go just before its next hit (the tail is expected to be cut: README).
- An external MIDI clock: a late tick, and a retrig series' end there. Read in the code only.
- A pattern change inside a fade (read in the code in part), and probability conditions.
- A lock trig without a note shortly before a trig of the same kit, when the kit's sound and the track's
  sound differ in ENV RESET: stock loads the kit's sound again after a trig with parameter locks, and a
  lock trig still queued is not counted (`src/pre-fade.c`), so the fade can come late or not at all there.
- A mute during a running retrig roll; two events of one track due in the same block; a retrig hit
  shortly before the track's next trig; an RTRG rate outside the knob's range in a pattern's data. Read
  in the code and run as a host test of the scan's model.
- Above 187.5 BPM, a retrig tick moved a block by a queued event that fires inside the series (the
  200 BPM take has no such event).
- OVR's curve by ear, and with another sound or unit; the FILTER times against their texts (the takes
  above compare them with stock's).
- The screen lag once reported on trig + RTRG (ER05), with and without the module.
- Memory and audio load on the unit: `resources` are read from the link and the code.

## This version in rytm-emu: IA08, 9 Nov 2026

Build IA08: the plain Modwerk base and this module alone, linked on stock OS 1.74 by
`scripts/link-image.mjs`; sha256 0c5420f573e80245192fe9414f678e8d993033efbd9e636ef0edf2ee1d3625c1, ramSpare 111,136 (the base alone: 119,004). rytm-emu
2ac0f1f, headless `dtboot`:

- Boots to the main screen; CPU exceptions only TRAP #0 (vector 32), as the plain base.
- AMP page: DEC turned down reads "2.2ms" under DECAY TIME; HLD 6 reads "0.034" and HLD 42 "1.06" under HOLD TIME
  (steps at the emulator's 127.0 BPM, track speed 1x, a step 118.1 ms: 6 is 4.0 ms, 42 is 124.7 ms).
- SOUND SETTINGS, ENV RESET: LEFT and RIGHT step FILTER, AMP, OFF, AMP, FILTER, AMP+FILT, one value a press.
- OVR (CC 81 on track 1, a break after the reader at 0x40109b1e): the CV word in d0 is 0x0000, 0x003e, 0x01ef,
  0x182f and 0xfe00 for 0, 1, 8, 64 and 127 (stock: 0x0000, 0x0200, 0x1000, 0x8000, 0xfe00); d1 to d7 and a0 to a7
  are the same in all five runs.
- Pre-fade, BD on ENV RESET AMP with trigs on steps 1, 5, 9 and 13 (the scan's mask and the entry's started bit read
  every 250k instructions): both are set for voice 0 for 5 or 6 readings (6.3 to 7.5 ms) before each trig, four
  steps apart, and clear between. None before the first trig after PLAY (queued less than a fade ahead).
- Pre-fade, RTRG held with the BD pad over the same pattern: the mask is set for 5 or 6 readings before each
  retrig, one step apart, without a gap inside a fade. (An earlier build of this version gated the retrig scan on
  stock's byte at 0x8000fc13 + track; the mask then flickered within each fade. That byte only says a tick is due
  this block and the gate is gone.)
- Pre-fade, the end of a retrig series (the same pad roll from a snapshot, the series' length word at 0x42ade0e4
  set by hand to run out around one hit: 13 lengths, 338 to 352 blocks, read every 60k instructions): up to 343
  blocks the series ended before the hit's tick, the hit did not play and the mask stayed clear; from 344 the hit
  played and the fade came before it, as in the run without a length. (An earlier build of this version faded
  for the hit that never plays: the mask was set for 3 readings up to the series' end.)
- Pre-fade, BD trigs on steps 1 to 4 in the emulator's default pattern, which has swing (another track's event
  times alternate 4,644,000 and 6,156,000 clock units), read every 250k instructions with the track's slot
  states: the trig after a swung one is queued while that one still waits and sits in the track's second event
  slot, as does the first trig queued after PLAY. The mask is set for 5 readings before each of the four trigs
  of every loop. (An earlier build of this version, IA05, read the first slot only, as EN05 and ER04 did: the
  second-slot trigs fired with the mask clear, so they played as stock.)
- The AMP page run's 89 frames and the ENV RESET run's 23 are the same, byte for byte, as IA05's and IA07's,
  and the OVR words and every reading of the trig, roll, swing and series-end runs are the same as IA07's, the
  build before.
- Independent code reviews of the pre-fade and text changes, each finding confirmed in the OS 1.74 code and
  fixed in this build. First: a hit after a retrig series' length ran out was faded for, which cut the last
  hit's tail; a trig that plays a note ends the track's series, and the retrigs after it were still predicted;
  HLD's number in steps was rounded twice. Second: only the first of a track's three event slots was read
  (above); a queued event takes its track's turn in the block it fires in, so a retrig tick due then is stepped
  a block later, which the series' end now allows for; on external MIDI clock a series' last hit within a block
  of its end can be judged wrong (README). Third: stock
  fires one queued event a track a block, the lowest due slot first, and the scan now counts blocks the same
  way instead of clock time; a lock trig without a note whose RTRG is on rewrites a running series' rate,
  now followed; a pattern change clears queued trigs (README). Fourth: a trig of the kit the track's sound
  came from loads no sound in stock, so it is judged by the track's sound as it stands; the RTRG rate is a
  signed byte shifted by its low six bits, counted the same way; a retrig hit shortly before a trig is cut
  short (README); a series further behind than its slots can hold it up plays as stock. Fifth, of the
  fourth's fixes: they match the OS code and no defect was found; a trig with parameter locks makes stock
  load the kit's sound again on the next trig, which a lock trig still queued does not yet tell the scan
  (above, not tested; `src/pre-fade.c`); comments corrected, the image unchanged.
- A host build of `src/pre-fade.c` with the OS's memory as an array: 54 cases of the scan's model pass (slots,
  two events in one block, lock trigs and rates, the series' end, sound locks, the kit's sound, held and muted
  tracks).

IA08 itself has not run on a unit; the unit runs of this source are above.

## Unit, EN05 (envelopes on the amp record hook), 9 Nov 2026

EN05 `.syx` `d02af414…a2d8`: the Modwerk base b02d611f with the envelope rewriter (3b68c7a80, order 50)
and the pre-fade (74f91057, order 20) as two modules on `ev_amp_record`, the pairing this module now
carries in one. Rig over USB MIDI, Overbridge channels recorded at 48 kHz.

| AMP DEC (looped sine at ~1042 Hz) | design t60 | measured |
|---|---|---|
| 3 / 5 / 8 | 0.6 / 1.0 / 1.6 ms | 1.25 / 1.25 / 2.25 ms (the VCA's slew floors the shortest) |
| 12 / 15 / 20 / 25 | 2.4 / 3.0 / 4.0 / 5.0 ms | 2.75 / 3.0 / 4.0 / 5.25 ms |
| 35 / 45 / 65 | 10 / 15 / 50 ms | 10.5 / 15.0 / 50.25 ms |

With the tone at 264 Hz the short decays read four to seven times long: the method needs a tone near
1 kHz or higher below DEC 45.

| AMP HLD (an analog BD sound, DEC 25) | design | measured decay start, minus HLD 0 |
|---|---|---|
| 5 / 10 / 15 / 21 / 31 / 42 | 3.33 / 6.67 / 10.0 / 18.0 / 51.3 / 124.7 ms | 2.29 / 6.08 / 9.46 / 17.5 / 50.54 / 124.04 ms |
| 57 / 70 / 85 | 298 / 627 / 1481 ms | 297.4 / 626.8 / 1480.5 ms |

First takes of the HLD sweep hit USB capture gaps (runs of digital silence) and were repeated. The
pre-fade's EN05 results are under [EN05](#en05-on-the-bases-amp-record-hook-2026-11-09).

## Unit, EV15 / ED02 (DEC, REL and HLD curves), 6 Nov 2026

Build ED02 (unit pass): RC31's set and no-send base b530a147 with Improved Envelopes (head de6be7d02:
idle skip fcdf99a0, the tables from `tools/dec_table.py`, HLD texts in whole ms below 2 s). sha256 6060d48f640ae90ed2306a0cbbfff7dca8b9a275e6636e3fa70fb830fba55f81,
lock RC31's NS01 (unchanged), ramSpare 15,708. Independent review of ED01: no bugs; its HLD text finding
(79/80 and 81/82 read alike) is fixed in ED02. rytm-emu 2ac0f1f boots it ("cpu exceptions: 32:..."
only) and the five `ptr` sites hold the tables' addresses.

On the unit (track 1 as it is, the looped sine; MIDI CC 78-80 from the rig, takes recorded from MAIN OUT
over USB; envelope read at 0.083 ms steps, -3 dB to -23 dB slope, t60 = 60 dB x ms per dB):

| AMP DEC | design t60 | measured |
|---|---|---|
| 1 / 2 / 3 / 5 / 8 | 0.2 / 0.4 / 0.6 / 1.0 / 1.6 ms | 1.0 / 1.0 / 1.25 / 1.5 / 1.75 ms (the VCA's slew floors the shortest) |
| 12 / 15 / 20 | 2.4 / 3.0 / 4.0 ms | 2.5 / 3.25 / 4.25 ms |
| 25 / 30 / 35 / 45 / 55 | 5 / 7.5 / 10 / 15 / 25 ms | 5.0 / 7.5 / 10.0 / 15.0 / 25.0 ms |
| 65 / 75 / 85 / 89 | 50 / 100 / 200 / 300 ms | 50.3 / 100.8 / 201.3 / 301.5 ms |
| 95 / 100 / 105 / 110 | 0.66 / 1.28 / 2.47 / 4.78 s | 0.665 / 1.284 / 2.476 / 4.763 s |
| 113 / 115 / 117 / 120 | 7.10 / 9.25 / 12.04 / 17.88 s | 7.04 / 9.19 / 12.00 / 17.69 s |

From 5 ms up the AMP decay is within 0.7 % of the text; below 5 ms the VCA slew (~0.8 ms) sets the floor,
so DEC 1..8 differ by less than a millisecond.

| AMP HLD (ATK 0, DEC 25) | design | measured decay start, minus HLD 0 (3.3 ms) |
|---|---|---|
| 1 / 2 / 3 / 5 / 8 / 10 / 15 | 0.67 / 1.33 / 2.0 / 3.33 / 5.33 / 6.67 / 10.0 ms | 0.58 / 1.33 / 1.92 / 3.25 / 5.25 / 6.58 / 9.92 ms |
| 21 / 31 / 42 / 46 / 57 | 18.0 / 51.3 / 124.7 / 151.3 / 298 ms | 17.9 / 51.25 / 124.6 / 151.2 / 297.9 ms |
| 70 / 85 / 90 / 100 | 627 / 1481 / 1972 / 3497 ms | 627.3 / 1481.2 / 1972.0 / 3496.7 ms |
| 110 / 126 | 6.20 / 15.5 s | 6.20 / 15.50 s |

FILTER DEC and REL (self-oscillating tone, FRQ 86, ENV +6, level through the map of a linear ATK 64,
log-linear fit from 80 % to 10 %, two takes each): time constant against the text's t60 / ln 1000.

| k | DEC | REL |
|---|---|---|
| 45 / 55 / 65 (15 / 25 / 50 ms) | 1.017 / 1.016 / 1.015 | not measurable (too short to track) |
| 75 / 89 / 100 (100 ms / 300 ms / 1.28 s) | 1.014 / 1.015 / 1.012 | 1.015 / 1.015 / 1.015 |

DEC 30 (7.5 ms) was too short to track. The 1.5 % is the method's, as on EV14.

Some takes of the HLD sweep came back with a one-off USB capture gap (a stretch of digital silence);
those were repeated and the clean take is the one above.

On the unit's screen (ED02, the author): AMP HLD 90 reads 1972ms and fits the field.

Not tested: FILTER DEC/REL below 15 ms and AMP DEC below 5 ms to better than the VCA's slew, the other knob texts on the unit's screen (host-checked: all 128 values of each knob distinct, at most 6 characters), FUNC jump to HLD 42, saving and reloading.

## Idle CPU, LR03 / LP01 (6 November 2026)

The amp writer called `envelopes_voice` for every voice every block. Now (8028baf2) a voice skips the C call when its rate and level words equal the last
ones it took and that call left the level follower as it was. The follower is a pure function of its
state and the record outside the attack words, so the skipped call would have changed nothing. Stock
(read in amp_env_commands) sends rate 0 / level 0 to an idle voice every block, and the same one-pole
record in the decay state, which a voice stays in until its next trig.

- Measured on the author's MKII with the private lag-telemetry base, RC31's set, scratch project,
  sequencer stopped, no USB audio, 50 one-second readings: LR01 (RC31) 70.84 % of the audio block,
  LR03 (RC31 with this source) 70.37 %. Pad mash (LR02, with two other idle changes): 81.7 % against
  82.7 %, ~10 % fewer presses.
- Independent code review: no findings (registers, ColdFire encodings, skip equivalence).
- rytm-emu: LP01 boots, TRAP #0 only. Rig re-run on the unit: pending.

## Unit, EV14, 6 Nov 2026

Build EV14: EV13's set with Improved Envelopes at 4efb6fbe (FILTER ATK table for the filter's 1.00x
speed, FILTER text unscaled; 18a15a2e adds only docs); sha256
61163e6089ca427505e2c25fcd3401e13dd828a23094cd3d5be856bf5d83cc9f, lock NS01, ramSpare 17,788.
Flashed by the author. FILTER ATK by the ~1.3 kHz method of the EV13 section (FRQ 86, ENV +6, ends
extrapolated, four takes each; mean / spread):

| FILTER ATK | Target | Measured | Ratio |
|---|---|---|---|
| 10 / 15 / 20 / 25 | 2 / 3 / 4 / 5 ms | 1.88 / 3.01 / 3.83 / 4.87 ms (spread 0.04-0.21) | 0.94 / 1.00 / 0.96 / 0.97 |
| 30 / 35 / 40 / 45 | 7.5 / 10 / 12.5 / 15 ms | 7.50 / 9.99 / 12.50 / 15.01 ms (spread <= 0.008) | 1.000 |
| 50 / 55 / 64 / 72 / 80 | 23.8 / 37.9 / 87.2 / 183 / 384 ms | 23.86 / 37.96 / 87.40 / 183.46 / 385.03 ms | 1.001-1.003 |

Below 3 ms one tone cycle (~0.5 ms) is a large part of the ramp, so 2 ms and shorter are within the
method's error. Everything else of EV13 carries over (AMP code unchanged).

## Unit, EV13, 6 Nov 2026

Build EV13: EV09's set and base (no-send b530a147, lock NS01) with Improved Envelopes at a6df46ff
(FILTER ATK table, rounded knob times); sha256
6c7598110742557956310a49906aa44d20978273f31d66a394eb8fa4de9c3cbb, ramSpare 17,708. Flashed by the
author; scratch project, track 1 a looped sine. MAIN OUT over USB audio, settings by USB MIDI CC.

EV13 and EV14 also carried an earlier ENV RESET AMP pre-fade; the pre-fade's own runs are under
[ENV RESET AMP pre-fade](#env-reset-amp-pre-fade).

**FILTER ATK on the new table** (method as EV09 below: LP2, RES 127, FRQ 40, LEV 0, ENV +24, AMP ATK 0
/ HLD AUTO / DEC INF, FILTER SUS 127 / DEC 0, single MIDI notes; rise start to top, by zero crossings).
Target = the curve; this build's table carried the 0.984 speed (superseded below).

| ATK | Target | Measured | Resolution (two periods) |
|---|---|---|---|
| 64 / 72 / 80 / 96 | 87.2 / 183 / 384 / 1691 ms | 88.7 / 183.7 / 381.9 / 1710 ms | 4-7 ms |
| 45 / 55 | 15 / 37.9 ms | 16.1 / 42.3 ms | 4-5 ms |
| 1 / 5 / 10 / 25 / 35 | 0.2 / 1 / 2 / 5 / 10 ms | 1.6 / 1.9 / 1.5 / 11.3 / 11.5 ms | 1.5-5 ms |

The long end matches within 2 %. Below 15 ms the filter tone is too low for this method to time the
ramp (a few cycles across it), so short FILTER ATK times were not measured this way (see the ~1.3 kHz runs below). A run at FRQ 70 put the top
of the sweep past the tracker's 12 kHz range and was discarded.

**Filter envelope re-measured at ~1.3 kHz** (same EV13 unit, same day). The low tone above (139 Hz,
7 ms a cycle) blurs short segments, and timing the rise between thresholds cut its ends off. Here:
FRQ 86, ENV +6 (a 12-semitone sweep from ~1.3 kHz), each segment's ends extrapolated from line fits
over 10-30 % and 70-90 % of the sweep, four takes per attack value, two per decay/release value
(medians; three single takes where a fit failed are left out).

| FILTER ATK | Target (curve) | Median measured | Ratio |
|---|---|---|---|
| 15 / 20 / 25 | 3 / 4 / 5 ms | 2.96 / 3.90 / 4.94 ms | 0.99 / 0.97 / 0.99 |
| 30 / 35 / 40 / 45 | 7.5 / 10 / 12.5 / 15 ms | 7.61 / 10.15 / 12.71 / 15.25 ms | 1.015-1.017 |
| 50 / 55 / 64 / 72 / 80 | 23.8 / 37.9 / 87.2 / 183 / 384 ms | 24.26 / 38.57 / 88.82 / 186.42 / 391.19 ms | 1.017-1.019 (spread <= 0.06 ms) |
| 5 / 10 | 1 / 2 ms | 0.82 / 1.66 ms | below the method's ~0.5 ms cycle |

The table then carried 0.984, so the filter ran at 0.984 x 1.018 = 1.00x the OS model.

| FILTER (time constant) | 24 | 40 | 56 | 72 | 88 |
|---|---|---|---|---|---|
| DEC, model ms | 47.2 | 120.7 | 268.5 | 566.0 | 1164.4 |
| DEC, measured / model | 1.013 | 1.011 | 1.008* | 1.002 | 0.987 |
| REL, measured / model | 1.014 | 1.016* | 1.015* | 1.013 | 1.014 |

(* one of two takes; the other's fit failed.) Level read back through a linear attack's pitch map,
log-linear fit between 80 % and 10 %. So the filter envelope runs at the model's speed: 4efb6fbe
builds the FILTER ATK table for 1.0 and shows FILTER times unscaled (EV14). EV14's table is not yet
played on the unit.

Not tested on the unit in EV13: knob texts (rytm-emu: FILTER ATK reads 1.0ms, 4.2ms, 11.0ms, 16.5ms,
2.2s on the curve), FUNC jumps, choke, saving and reloading, CPU cost.

## Unit, EV09, 6 Nov 2026

Build EV09: RC30's set with envelopes in place of env-reset-amp, on the private no-send base b530a147,
lock NS01; sha256 6cccc5e5c91bd24e89c1220ecddef3c569386aed9b44e9f3d79c590999c3f908 (source b6727c48;
the display-name commit 0764febb is in it). Flashed by the author; track 1 as the author set it (a
looped ~1 kHz sine), only AMP ATK/HLD/DEC sent over USB MIDI (CC 78/79/80), MAIN OUT over USB audio.

| Check | Target | Measured |
|---|---|---|
| ATK peak 10 / 25 / 35 / 45 / 55 / 64 / 72 / 80 | 2 / 5 / 10 / 15 / 37.9 / 87.2 / 183 / 384 ms | 2.5 / 5.0 / 10.25 / 15.5 / 38.25 / 87.5 / 183.5 / 383.75 ms |
| ATK 0 / 1 / 5 (0 / 0.2 / 1 ms) | | 0.75 / 1.5 / 1.25 ms (the VCA's own slew) |
| Decay start HLD 0 / 1 / 7 / 15 / 31 / 47 | 0 / 15.6 / 62.5 / 125 / 250 / 500 ms | 2.5 / 17.5 / 64.2 / 126.8 / 251.5 / 501.5 ms |
| AUTO, note 100 / 300 ms | 100 / 300 ms | 102.5 / 301.5 ms |
| Never cut, ATK 87 ms: HLD 0 / 2 / 7 (62.5 ms) | peak at 87 ms | 87.5 / 87.5 / 87.5-87.8 ms (HLD 7 re-run 3x: one sweep take had a late USB note) |
| Second MIDI note on a decaying voice (ATK 64/72, DEC 100/110) | attack continues from the current level to the first peak | -14.27 vs -14.28 dB, all three; the second peak came 23 / 24.5 / 52 ms after the note, from 0.9 / 1.2 / 2.0 dB below the peak |
| AMP DEC slope, DEC 6..126 | 0.918 x model (text) | 0.90-0.925 x model (DEC 108/114 captures failed) |

Decay start = the 3 dB point minus 3 x the measured dB slope. The VCA ran attacks at 0.957x and decays
at 0.918x the OS timing model on EV06; EV07 on builds the ATK table and the AMP ATK/DEC text for it.

### Filter envelope timing (EV09, same day)

Track 1's filter self-oscillating (LP2, RES 127, FRQ 40, sample LEV 0, ENV depth +24, AMP ATK 0 / HLD
AUTO / DEC INF), its pitch tracked by zero crossings: the envelope's level was read back through the
pitch-to-level map of a linear attack (FILTER ATK 48), so the cutoff curve does not bias the fit.

| Segment | Values | Measured / model |
|---|---|---|
| Attack (rise start to top) | ATK 16 / 32 / 48 / 56 / 64 / 72 / 80 | 0.956 / 0.979 / 0.983 / 0.984 / 0.984 / 0.985 / 0.986 |
| Decay (time constant, SUS 0) | DEC 24 / 40 / 56 / 72 / 88 | 0.905 / 0.902 / 0.895 / 0.887 / 0.873 |
| Release (time constant, SUS 127) | REL 24 / 40 / 56 / 72 / 88 | 0.906 / 0.904 / 0.902 / 0.902 / 0.901 |

FILTER ATK text scaled by 0.984, DEC and REL by 0.90 (EV10..EV13). Superseded: the ~1.3 kHz runs in
the EV13 section show both were this method's bias; from 4efb6fbe the filter has no factor.

These runs used stock's FILTER ATK table (118 ms..3.7 s attacks). The new FILTER ATK table
(`envelopes_flt_atk`, site 0x4010d2aa, EV11 on) is checked in rytm-emu only (knob text); its times on
the unit, and the filter's speed below 118 ms, were not tested then (now measured: EV13 section).

## Unit (Analog Rytm MKII, OS 1.74), 6 Nov 2026

Build EV04: RC30's set with Envelopes in place of Env Reset Amp, base 8b0cafbc, sha256
374157b56041b15bff1d9795371cc60c6a7f0388c7075378e1365287a549d393 (source 818f7b08). Flashed by the
author; scratch project.

Automated: track 1 (BD) on an analog BD sound with its DEC 127, filter open, no FX, AMP DEC 40, played over
USB MIDI (channel 1, note 0, velocity 100), MAIN OUT recorded over USB audio; script envtest.py (private
rig, not in the repo). The sound's own body falls about 3 dB over the first 150 ms and it has an onset
click, so hold and AUTO are judged against the HLD 47 take (held to 500 ms), not by an absolute peak.

| Check | Result |
|---|---|
| HLD 0, ATK 0 | falls from the hit (below the held take by 20 ms) |
| HLD 1 / 7 / 15 / 31 (15.6 / 62.5 / 125 / 250 ms) | leaves the held take after about 20 / 80 / 150 / 300 ms (sample points 10-50 ms apart) |
| AUTO, note 100 ms / 300 ms | leaves the held take right after note-off (125 / 400 ms points) |
| AUTO, ATK 64, note 50 ms | decays from the note-off, mid-attack (AUTO is outside the never-cut rule) |
| Never cut: ATK 64 (87 ms) with HLD 0, 2 (24 ms), 7 (62.5 ms) | identical takes; peak 87 ms, decay from 85 ms |
| ATK peak: 55 / 64 / 72 / 80 (37.9 / 87.2 / 183 / 384 ms) | 36.8 / 87.3 / 171.5 / 348 ms (long ones peak early on the sound's falling body) |
| ATK rise 10-90 %: 0 / 1 / 5 / 10 / 25 (0 / 0.2 / 1 / 2 / 5 ms) | 1.0 / 1.0 / 1.25 / 1.75 / 3.75 ms (hardware slew ~0.8 ms floors the shortest) |
| ATK 64 rise 10-90 % | 64.8 ms = 0.74 of the 87.2 ms ramp, as earlier probe measurements |

Not tested on the unit: knob texts and the AMP picture (rytm-emu only), FUNC jumps, filter
DEC/REL times, retrigs, choke, saving and reloading, CPU cost.

## ENV RESET AMP pre-fade

The pre-fade was built and tested as version 1.1.0 of a private copy of Env Reset Amp before it moved
here; `src/pre-fade.s` and `src/pre-fade.c` are that code, with the sound-lock lookup added after EN05.
ER02 to ER05 are private test builds in a 14-module set with the Modwerk base, OS 1.74, module at -O2.

### Before the build: how the Rytm schedules a trig (rytm-emu `2ac0f1f`)

- The sequencer queues each trig in the track's first event slot (`0x42ac5fb0` + 224 x track, 1) about 60 ticks
  ahead and clears it when it fires. With every trig at 50 %, exactly the queued trigs fired (5 of 9); without a
  condition all 9 were queued and fired. A muted track's trig stays queued and does not fire, so the module reads
  the mute masks itself.
- Retrigs run on a per-track counter stock steps once a tick (`0x4012089a`): RT_COUNT `0x42adf5d0`, the firing
  table `0x402909b8` and the deadline `0x8000fdec`; the scan counts the same way.

### ER02: fade, then the drop at the trig (2026-11-05)

ER02 combined `.syx` `eb51f80c3ebdd0ba5aae74b3ac852da6601c9f0f99b02cd8a70dac65b2b355b5`. In rytm-emu (BD at ATK 16,
ENV RESET AMP, trigs on 1, 5, 9, 13) each sequenced trig was preceded by five blocks of the fade record, then
Env Reset Amp 1.0's drop to silence and the attack; with BD muted, no fade and no drop.

On the unit, outputs recorded in Ableton Live (48 kHz, 24-bit):
- A sustained synth sound retrigged every ~0.5 s: with ENV RESET FILTER the waveform steps from +0.017 to -0.025
  in one sample at each trig (the oscillator's phase reset), peak above 3 kHz 0.011; with AMP+FILT it falls over
  ~4 ms before the trig and the new hit rises from there, peak above 3 kHz 0.0018.
- RS and CP sharing voice 7, alternated every 0.5 s, peak above 3 kHz at each transition:

  | ENV RESET | CP over CP | RS cuts CP | CP cuts RS |
  | --- | --- | --- | --- |
  | both FILTER | 0.0061 | 0.0064 | 0.0020 |
  | RS AMP+FILT, CP FILTER | 0.0060 | 0.0013 | 0.0022 |
  | RS FILTER, CP AMP+FILT | 0.0010 | 0.0063 | below 0.0008 |
  | both AMP+FILT | about 0.001 at every transition | | |

  The incoming trig's setting decides. The fade (mode B resent every block) was only about -8 dB down when the trig
  fired; ER02's drop did the rest.
- Pad hits tapped by hand: 0.0027 to 0.0128 above 3 kHz, the largest clicks in any take (the drop).

### ER03: the drop removed (2026-11-05)

ER03 combined `.syx` `1d2cb24d6bdcc2e667a7dac92135949d6382ed5e6c7caa934530cc3052892162`: no drop at the trig, retrig
series predicted. On the unit (AMP+FILT, sequenced, RTRG pad roll, sequenced retrig, pad taps) no trig restarted
from silence: the shallow fade alone was left. Not a pass.

### ER04: the fade sent as stock sends its attack (2026-11-05)

ER04 combined `.syx` `132bc5dc90e5285feb2f447e88401f4a08602f178fee7562d8dae87c1acc2ede`: the ramp (mode B) once, then
mode 3 with the same target and rate every block until the trig; window 10 blocks (6.7 ms). On the unit, an analog
BD sound sustained at about 30 Hz, AMP+FILT:
- Sequenced trigs: the level falls to the voice's floor (about 0.018) over ~3 ms and stays there 1 to 3 ms before
  the hit; peak above 3 kHz 0.0003, below the recording's click threshold. Patterns of 8 and 16 steps, trigs on
  several steps: every trig faded.
- One unexplained miss: on one older 8-step pattern the loop's first step did not fade (stock phase-reset step,
  0.0085 above 3 kHz). A freshly made pattern faded on every step, step 1 included, and the miss did not come back.
  Not reproduced on EN05: micro timing (step 1 half a step early, 161 of 161 hits faded), an 8-step loop (140 of
  140 and 141 of 141), 2 min on the internal clock.
- RTRG on the same sound (12 s) and a sequenced trig with RTRG (3.7 s): no event above 0.0008 above 3 kHz (stock
  restarts measure 0.006 to 0.013); each hit down to silence before the next.
- Hand-played hits over a sequenced retrig: they break into the roll as stock does; largest content above 3 kHz
  0.0002.

### ER05: retrig prediction bounded (2026-11-05)

ER05 combined `.syx` `433d576306ee9b20d02993a4d2d0903f9ca63ff1906cbe50fedea3ecdcc4f1ec`. From a code review of ER04:
the prediction gives up on a deadline already past, so it walks at most about twice the fade in ticks, and a series
whose next hit follows sooner than twice the fade gets half its spacing to fade in.

On the unit (Nathaniel Pavel, recordings 0040, 0041, 0043, the analog BD sound on AMP+FILT):
- A fast RTRG roll (17 s, hits every ~10 ms): every hit sounds (about 7 ms of each), falls to the floor for 2 to
  3 ms and restarts; no step at the restarts. Content above 3 kHz up to 0.0035 is each hit's own onset, the same on
  every hit.
- An RTRG roll at 1/16 and sequenced trigs: each hit dips to the floor first; largest content above 3 kHz 0.0004
  and 0.0005.
- Reported by the tester: the screen felt a little laggy while holding a trig and pressing RTRG. Not yet compared
  with the same gesture without the module.

### EN05: on the base's amp record hook (2026-11-09)

EN05 `.syx` `d02af414…a2d8` (see the EN05 section above). On the unit (Nathaniel Pavel's setup, test run driven
over USB MIDI by the developer's rig, all 12 Overbridge channels recorded at 48 kHz). BD (an analog BD, about
261 Hz at -35 dBFS, AMP DEC 100, HLD 0) on AMP+FILT and SD on FILTER, trigs on steps 1, 5, 9 and 13, step 13 with
a 1/16 RTRG:
- Internal clock, 2 min at about 141 BPM: every one of the 493 BD hits, sequenced steps and retrigs, fell to digital
  silence before its trig. The voice goes to zero within about 0.5 ms, about 7 ms before the trig (the ramp has a
  fixed rate, so a quiet voice gets there sooner than ER04's ~3 ms), and the trig starts from silence on time.
- External MIDI clock at 120 BPM, 20 s each: AMP+FILT 67 of 68 hits faded (32 to 67 dB down); BD set to OFF, none of
  71 (about 4 dB, as stock); SD on FILTER about 4 dB throughout.
- External clock with one tick held back on purpose: when the tick before a trig's own tick arrives d ms late, that
  trig fires d ms early against the clock's estimate and its fade is d ms shorter: 2 ms late left about 4 ms of
  silence, 4 ms a partial fade, 6, 8 and 10 ms none. A late tick on the trig's own step only lengthens the silence.
  The one miss above was a 12 ms stall of the rig's own clock.
- MIDI notes on BD (the pad path): as stock, about 4 dB dip.
- 3 min of sequencer with 1,888 BD MIDI notes and AMP HLD/DEC sweeps over 2 min of it: no dropout, SD steady at 12
  hits per 8 s, the unit answered notes afterwards and the fade still held (109 hits, median 41 dB down).

## rytm-emu (2ac0f1f), EV02-EV04

- Boots to the main screen; CPU exceptions only TRAP #0, as RC30.
- HLD text: 24ms (2), 31ms (3), 125ms (15), 500ms (47), 10.5s (116), 13s (120), AUTO (127).
- AMP DEC text: 63ms (7), 3.3s (68), 39.5s (124). (EV02 showed 0 / 1667s: fixed in EV03.)
- ATK text: 6.5ms (28), 38ms (55).
- FUNC + turn on HLD: 0 -> 15 -> 127 and back (stock's debounce paces it).
- AMP picture: HLD 0 attack straight into decay, AUTO with the note at 127.
- State traces (voice 0): HLD 0 + ATK 0 -> decay one block after the trig; HLD 0/2 + ATK 38 ms ->
  decay at 57 blocks (38 ms); HLD 15 -> 3024 ticks (125 ms); AUTO -> state 1 (gate); HLD turned to
  AUTO during a timed hold -> state 1.

## Review

Independent code review (two rounds): findings fixed in 5437e197 (MAC-mode -60 dB times, follower
start at silence, AUTO turned mid-hold, slow-rate floor); second round found no new bugs.
