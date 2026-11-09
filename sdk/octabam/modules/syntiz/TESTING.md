# SYNTIZ testing

SYNTIZ was called WAVE until 29 October 2026, renamed so as not to be confused with Octabam's WAVE.
The dated records below keep the names the screens and files had then (WAVE, `wave.mwrm`); the Part
signature `WV` and the sound are unchanged, so they still apply.

The first sections are the engine on the host and under qemu; the emulator and the author's units follow, each
dated with its package.

## Host checks

```sh
cc -std=c11 -O1 -g -fsanitize=undefined,address -fno-sanitize-recover=all -o /tmp/syntiz engine.c test_engine.c -lm
/tmp/syntiz check
```

27 October 2026, macOS (Apple clang), this source:

- 2,688 renders, every note 0-127 for each model with every control at 0, 1, 63, 64, 65, 126 and 127: no
  undefined-behaviour or address report (signed overflow included).
- A note above Nyquist is silent. SUB and SUB2 at 127 below 25 Hz change nothing, bit for bit.
- Levels at C4, defaults: SAW -7.8 dBFS RMS, PULSE -8.8, ENS -9.7; DC under 0.1 %.
- A saw at A7 (3.52 kHz): energy below 3 kHz 51 dB under the total.

## DRIVE's output stage

A stacked SAW (DET 40, UNI 127, WIDE 90, SUB 90) at DRIVE 110 sat on the clip's flat 28-36 % of the time,
and the energy between harmonics of the in-tune stack rose from -41 dB (DRIVE 32) to -34 dB. The
anti-aliased stage keeps the same clipping and brings that to -40 dB at DRIVE 110; a lone saw at
DRIVE 110 goes from -32 to -41 dB. The measurement's own floor (an additive saw through the same
analysis) is -47 to -49 dB. The author compared renders by ear and chose this stage (27 October 2026).

## Cost on a ColdFire

`tools/count_cf.sh <dir>`: gcc 12 for MCF54455, qemu-m68k `-cpu cfv4e`, instructions executed inside
`wave_render` per 16-sample frame, 64 frames at about 172 Hz:

| Model | Defaults | Heavy (all oscillators, chord, chorus) |
| --- | --- | --- |
| SAW | 1,938 | 3,995 |
| PULSE | 2,364 | 4,196 |
| ENS | 3,250 | 6,346 |

These are instruction counts, not cycles or time on the unit: divides take several cycles, and module
code that runs uncached costs several times more (POLY8's measurements). The base's frame guard
(`npm run device -- guard`) is the measure that will qualify SYNTIZ.

## In the emulator (28 October 2026)

ot_emu built from octabam `1972a53` (`make emu-cf`) and adapted by `scripts/octatrack-emulator/build.py`;
a private beta base built from `main` plus #943 with WAVE among the known PROTECT machines (local branch
`test/ot-wave-base`, never pushed); the package of this source (`build.py`, module `4b125ec9`); a copy of
the author's own generated project on the card; `--mkii --frame --dsp --interactive`. Emulator results,
not hardware evidence.

- Install: `npm run device -- try wave.mwrm --accept --emulator`: trial running five seconds with no
  refusal, accepted, generation 1.
- The chooser (FUNC + SRC) lists WAVE after PICKUP; choosing it shows WAVE's SRC page (PTCH DET UNI /
  WIDE SUB SUB2, "WAVE SAW" in the footer) and SRC SETUP's FINE OCT DRIV RTRG; UNI reads 100 after +100.
- Track 1's stem: silent without a trig; four sequenced trigs at 125 BPM sound every 0.475 s, each opened
  and closed by the track's AMP (HOLD 0 and REL 30 give short notes); AMP VOL lowers it.
- Pitch at PTCH neutral: 130.86 Hz (C3, 130.81). FINE +32: 133.23 Hz (expected 133.25).
- OCT did not move on one encoder detent (count 7): not yet checked with more.
- Level: the stem peaks about -26 dBFS at the project's levels; not yet compared with a FLEX sample.
- OCT moves one step every three or four encoder detents (3 -> 4 at +4, 5 at +8, 6 at +12; 6 is the top);
  at OCT 6 the note measured 1,050 Hz (C6 1,046.5; the measurement's resolution there is about 25 Hz).
- Level against FLEX: not established in the emulator. A FLEX track playing a 0 dBFS C3 saw from the
  card (GAIN 48, octatrack-manager's default) did not hold a steady level through its notes (10 ms peaks
  from 130 to 770, decaying), unlike WAVE's flat notes, which fits the emulator's open defect with card
  samples (octabam's EMU.md). Compare on a unit.
- Model list: a double tap of the track key opens "MACHINE:WAVE" (001 SAW, 002 PULSE, 003 ENS); YES writes
  the signature WV 1/2/3 and the model's defaults, and SRC shows that model's page. RIGHT in SRC SETUP opens
  nothing (the base's RIGHT serves the double-tap window only).
- A model change first left the render on the old model's SRC values (PULSE played SAW's DET 24 as its
  PW): the DSP halfwords (0x80000a50 + 64 t) are written now, as a lock is. After it, track 1's stem:
  SAW harmonics 2-6 at -6.4 -10.0 -12.5 -14.4 -16.0 dB (1/n); PULSE (PW 64) even harmonics at -47 dB, H3
  -9.5, H5 -14.0; ENS with NOT2 at +6 sounds the second note within a few dB of the first.
- Controls with fewer than 128 values (OCT, NOT2-4, RTRG) take about three detents a step; 128-value
  controls one a detent (UNI read 100 after 100 detents).

## On the author's Octatrack MKII (28 October 2026)

- Flashed by the author through the local development site's base guide: the beta base of `main`
  (identity `903f8ed6…`; the downloaded `.bin` is byte-identical to `npm run octatrack:base -- --beta`'s,
  SHA-256 `f92b0c66…1e1411`).
- Over USB (`npm run device`): RAM boot of the private test base `0b7d312c…` (main plus #943 plus WAVE among
  the known PROTECT machines; refused once with `unsafe` while the unit played, then booted), FM Synth
  0.1.2 (`e8c3e4fa`) and this source's package (`4b125ec9`, SHA-256 `13a95e4f…`) each tried five seconds with
  no refusal and accepted; the inventory lists both.
- Reported by the author: WAVE chosen in SRC SETUP, its model picked with a double tap of the track key,
  and played: "ça marche magnifiquement bien" (it works beautifully). No measurement of CPU (the test base
  is not a development base), level or reboot persistence yet.

## TABLE (28 October 2026)

- `tools/make_tables.py` regenerates `tables.h` byte for byte.
- Host: 3,584 extreme renders over four models under UBSan/ASan, no report; TABLE at C4, defaults (SINE):
  -6.1 dBFS RMS, DC 0.06 %. SAW, PULSE and ENS renders are byte-identical to before TABLE.
- ColdFire instruction counts (`tools/count_cf.sh`): TABLE 2,025 a frame at the defaults, 3,143 with a swept
  crossfade and SYNC; SAW 1,930 / 4,043, PULSE 2,450 / 4,063, ENS 3,285 / 6,383.
- Package: 47,904 bytes of code and data (the tables 32 KB), 18,808 of bss.
- Emulator (the private test base `0b7d312c`, ot_emu with DSP): the model list shows 004 TABLE; its page reads
  PTCH TABL MORF / MSWP SYNC SUB with the table's name under TABL (H1N at 40); sequenced notes at C3 for the
  defaults, TABL 40 and SYNC 70. Not yet on a unit.

## MORPH and CHOIR (28 October 2026)

- Host: 5,376 extreme renders over six models under UBSan/ASan, no report; the 14 SAW, PULSE, ENS and TABLE
  renders byte-identical to before. MORPH at MIX 0 equals TABLE playing WAV1 sample for sample, and at MIX 127
  TABLE playing WAV2. TIME 64: after a change of WAV1 the output differs from TIME 0's by up to 42,446 in the
  first 23 ms and by 0 after 0.4 s. At C4, defaults: MORPH -8.6 dBFS RMS, CHOIR (one VOWA voice) -14.8 dBFS;
  DC within 0.02 %.
- ColdFire instruction counts: MORPH 2,005 a frame at the defaults, 3,032 with WID, both crushes and a
  crossfade always running; CHOIR 3,082, and 4,810 with a four-note chord and both subs. The others:
  SAW 1,931 / 4,044, PULSE 2,453 / 4,074, ENS 3,274 / 6,372, TABLE 2,027 / 3,155.
- Package `7517cd6b`: 53,280 bytes of code and data, 19,804 of bss.
- Emulator (ot_emu with DSP), on the private test bases `0b7d312c` and `b30d9b09` (the latter knows WV 1-15):
  install accepted; the model list shows 001 to 006; MORPH's page reads PTCH WAV1 MIX / WAV2 WID TIME with the
  table's name (VOWA after 100 detents of WAV1); CHOIR's reads PTCH NOT2 NOT3 / NOT4 TABL CHOR (NOT2 +6 after
  18 detents). Sequenced notes at C3 (130.86 Hz) for both models' defaults; with NOT2 +6, the stem's period
  lengthens to 65.5 Hz (a second note). Not yet on a unit.
- On the author's Octatrack MKII over USB, 28 October 2026: the private test base `b30d9b09` (WV 1-15 known)
  flashed by the author and booted (`npm run device -- status`: OCTATRACK 1.40C, base `b30d9b09…`); this
  package (`7517cd6b`) and FM Synth 0.1.2 (`e8c3e4fa`) each tried five seconds with no refusal and accepted
  (generation 2). Reported by the author: TABLE, MORPH and CHOIR work, and he likes the sound.
- Power cycle, same evening: the project saved with TABLE, MORPH and CHOIR tracks, the unit switched off and on.
  Reported by the author: it came back playing them at once, with no reinstall (the base reloads its kept set
  from the card, docs/OCTATRACK_DRIVING.md); `npm run device -- status` and `missing` afterwards: base
  `b30d9b09…`, nothing missing. No CPU reading (not a development base) or level against FLEX yet.
- LEFT in the model list (emulator, test base `b30d9b09`, package `896d7f8d`): the list closes onto SELECT MACHINE
  TYPE with WAVE's row selected; RIGHT opens the list again; a model picked afterwards plays at C3. Not yet on a unit.

## The rename to SYNTIZ (29 October 2026)

- Host checks (`check`, the knob map) pass again; the engine and the map changed only in comments.
- Emulator, tools/emu_session.py: test base `f49116e4…` (`main` + `WV` 1-15), this package (`syntiz.mwrm`,
  `da5f1e78`) installed over emulated USB with no refusal. The chooser lists SYNTIZ after PICKUP; the model list is
  titled "MACHINE:SYNTIZ"; the SRC page's footer reads "SRC SAW", "SRC PULSE" and "SRC ENS", then the label
  SYNTIZ, whole. ("SYNTIZ PULSE" before the label filled the footer's 18 characters and cut it to SYNTI.) Track 1
  at C3 130.86 Hz for SAW and PULSE, ENS with a fifth at 61.68 Hz, as before the rename. Not yet on a unit.

## Beside the four other machines (29 October 2026)

- Emulator: the beta base of this branch (`96fa9aa5`: `WV` 1-15 known, room for eight machines), then over
  emulated USB POLY8 0.3.1, Analog BD 0.1.6, VECTOR 0.2.5, FM Synth 0.1.2 and this package (`da5f1e78`), each
  tried and accepted with no refusal. SRC SETUP's machine list scrolls to POLY8, ANALOG BD, VECTOR, FM SYNTH and
  SYNTIZ, the last row; eight DOWN presses reach it and YES makes track 1 SYNTIZ, its SRC page "SRC SAW > SYNTIZ".
  Not yet on a unit.

## On the author's second MKII (29 October 2026)

- A second MKII of the author's, on Elektron's OS 1.40C until then: the private test base `b30d9b09` (`main` + #943
  + `WV` 1-15) flashed by the author from the card; the link then read OCTATRACK 1.40C, base `b30d9b09…`. Over USB,
  this package (`syntiz.mwrm`, `da5f1e78`) and FM Synth 0.1.2 (`6e571654`) each tried and kept (generations 1
  and 2); `npm run device -- missing`: nothing.
- Reported by the author, playing it with a friend: the six models work "very well".
- Power cycle: a project saved with SYNTIZ tracks, the unit switched off and on; reported by the author: everything
  came back. Over USB afterwards: base `b30d9b09…`, nothing missing.

## Load on the author's MKII, and the three-track limit (29-30 October 2026)

- Package `d0af8336` kept on `b30d9b09` (the author's release branch: this draft plus the `ev_trig_muted` question,
  which needs `build.py --raise`). Reported by the author: a seven-track test project crackles "like an old record"
  while SYNTIZ plays; with long notes three SYNTIZ tracks play clean and a fourth crackles.
- The base's frame guard on the RAM-booted development twin `04e94075`, the same project playing for 120 s: without
  SYNTIZ 35.2 % of each frame in the frame interrupt; with its seven SYNTIZ tracks 79.6 %, 6.35 renders dropped a
  frame on average, the longest frame 146.5 % (the guard's share is 80 %).
- Three lighter builds were tried on the unit and set aside: shortcuts that keep every sample, a rest between notes,
  and a plain output stage without the antiderivative. With long notes none let a fourth track play clean (the
  author's listening). Rendering at half rate was rejected by the author on listening examples.
- The limit: `wave_admit_track` admits at most three SYNTIZ tracks in a Part. Package `f501a6a4`, the release branch
  with this function, tried and kept on `b30d9b09` over USB; reported by the author: choosing SYNTIZ for a fourth
  track is refused. The function, copied from `machine.c`, passed a host check (an empty Part, three tracks, a model
  change, another machine's leftover signature, a Part saved with seven). `f501a6a4` is this source's package, rebuilt
  byte for byte by `verify.py` and `npm run octatrack:module-packages -- --check`.

## Load on the author's MKII, 3 to 6 November 2026

All on package `f501a6a4` (this source), the base's frame guard with its 80 % share, 120 s a run, one run per case
unless said. The twins are RAM-booted development builds of the author's private base, not Modwerk's beta base.
Figures are the share of each frame spent in the frame interrupt; "without SYNTIZ" is the same project before the
package loads.

- 3 November, test Part MESURE3 (three SYNTIZ tracks at maximum settings), twin `8af4f9a3`: 28.4 % without, about
  82 % with, longest frame 113.7 %, 45,323 renders dropped. The machine's fixed cost is about 5 points for three
  tracks, the engine about 16 points a heavy track. On the older twin `04e94075` the same project gave about 76 %
  and 2 dropped: the current base costs about 6 points more for the same three tracks (one run each).
- 3 November, the author's Part MESURE7 (three heavy tracks, T2 SAW, T3 ENS with four notes, T4 SAW, and four long
  samples): 67-69 % while SYNTIZ plays, on three twins, longest 108-112 %, 24 to 75 renders dropped a run on T2-T4,
  and a crackle reported by the author. Two SYNTIZ tracks with the four samples: 0 dropped.
- Where the cuts come from (diag twins `acaaf5c0`, `81fc8424`, which time stock's work and each render): stock's
  work in a trig frame rises to 50-60 % before the renders; a render that follows it in the same frame costs up to
  2.25 times a first render (33.6 % against 14.9 % of a frame); the guard's credit empties over a few such frames,
  then it cuts a render that was 3-4 % over. The cause of the dearer second render was not found: a build with half
  the code (helpers turned into calls) cost more, not less (486 dropped); stock's START is never called on a SYNTIZ
  track (counter 0).
- Lighter builds, none shipped (the source is unchanged): helpers forced inline (same golden fingerprint on the
  host) took 5.6 points off MESURE3 and nothing off MESURE7; the half-size code was worse; on 30 October a lighter
  output stage and shortcuts that keep every sample gained nothing on the unit. A guard reserve of two frames
  instead of half a frame (4 November, a private base) did not help: the load stays above 80 % for long stretches,
  not in short bursts.
- 4 to 6 November: builds that play SAW, PULSE and ENS on the DSP were tried on the author's private base, outside
  Modwerk. They are not this module and are not published.

## The author's live set, 7 November 2026

Twin `7bce173d` (diag v3) of the author's flashed base `86388105`, package `f501a6a4`, guard share 80 %, 120 s a run.
A frame is 362.8 us, 47,891 counts of the 132 MHz timer. A RAM boot or a trial is refused with `unsafe` while the
sequencer plays. After the runs, two power cycles were needed before the flashed base listed its kept set again
(`do inventory`: `syntiz` alone, nothing missing).

| Run | Set | Without SYNTIZ | With SYNTIZ | Longest frame | Dropped | First / second render, max |
| --- | --- | --- | --- | --- | --- | --- |
| 1, pattern started over USB | reference set: T1 THRU, T2-T3 samples, T4 THRU, T5 SAW with both pairs, both subs, filter and chorus, T6 TABLE with filter and chorus, T7 NEIGHBOR with flanger, T8 master compressor | 34.1 % | 60.3 % | 94.5 % | 0 | 15.2 % / 27.7 % |
| 2, the author's PLAY | the same | 33.9 % | 60.3 % | 93.4 % | 0 | 15.0 % / 34.2 % |
| 3, the author playing live (STOP/PLAY, scenes, encoders) | the same | 33.9 % | 69.3 % | 111.2 % | 0 | 15.5 % / 36.9 % |
| 4, the author playing live, long notes | complete set: a third sample on T4 | 36.3 % (longest 103.7 %) | 73.8 % | 114.1 % | 259 on T5 and T6 | 16.2 % / 37.1 % |

Reported by the author: runs 2 and 3 clean, and run 4 clean too: the 259 drops (about two a second, 16 samples each,
on held notes) were not heard. In runs 3 and 4 stock's own work before the first render reached 84 % of a frame at
transitions: frames over 100 % come from stock's peaks with SYNTIZ on top, and the guard's credit (up to 50 %) lets
them through. In run 4 the credit ran out at moments (minimum -2.6 %); the last cut was a T5 second render forecast
at 88.4 % against 86.8 % allowed. The third sample costs about 4.5 points while playing; a fourth sample or an ENS
does not fit this set.

Earlier that day, on the flashed base with FM Synth 0.1.2 installed beside SYNTIZ and never played, the author heard
a very light crackle on T5 and T6, and the third sample did not fit. The same set on the twin with SYNTIZ alone was
clean; back on the flashed base the crackle returned; with FM Synth removed for a 180 s trial it was gone; removed
for good, the complete set holds. One A/B, mechanism unknown: an installed module that never runs may still cost a
frame share, or its placement may slow SYNTIZ. Worth knowing before judging SYNTIZ's margin on a unit with other
modules kept.

## Qualification record

`evidence/performance.json` carries the 7 November figures as the audit asks (`npm run perf:audit -- check`): the
dearest render, 35,536 cycles of a 95,782-cycle frame, with no static bound; the longest-frame rise (37.8 us, 10.4 %
of a frame) and the idle fall (37.5 points) against the same set without SYNTIZ; no MIDI flood. The audit's limits
were not changed: the record fails its static-bound, 10 % and stress rules. The owner (repeat98) decided on the
release pull request on 8 November 2026: the rows `chip-worst-case-cycles` and `current-build-hardware` are waived for
0.1.0-experimental and this exact source, as for POLY8, and he adds `sdk/syntiz-build-approval.json` last, once the
pull request is in order. The waiver covers rows with no numbers, so the load and stress fields are `null` and the
measurements stay in their `method` text and here. The manifest's
`tests.qualification` records one render as the event (at most three a frame; their worst sum exceeds the frame and
is left to the base's guard), the exact package memory, and the functional hardware report.
