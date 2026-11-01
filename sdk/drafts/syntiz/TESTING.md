# SYNTIZ testing

SYNTIZ was called WAVE until 29 October 2026, renamed so as not to be confused with Octabam's WAVE.
The dated records below keep the names the screens and files had then (WAVE, `wave.mwrm`); the Part
signature `WV` and the sound are unchanged, so they still apply.

Engine only, on the host and under qemu. No Octatrack, emulator, panel, Part or USB result exists yet.

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
  change, another machine's leftover signature, a Part saved with seven). The draft's own package is not built here.
