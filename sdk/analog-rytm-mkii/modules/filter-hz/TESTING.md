# Filter Hz — test report

## 1.3.0 (the FX track's DELAY and REVERB frequencies)

Read in stock OS 1.74's delay (`0x4010da24`) and reverb (`0x4010d434`), which run at 48 kHz in
32-frame blocks: HPF and LPF are one-pole filters with coefficients from one Q31 table
(`0x4028ab18`), the high-pass's at HPF >> 6 and the low-pass's at (HPF + LPF) >> 6; REVERB FRQ
picks a first-order high shelf's coefficient (`0x4028a318`, whole values) and GAI its treble
level. `src/fx-hz.c` reads the coefficient the DSP uses and works out the −3 dB frequency (HPF,
LPF) or the shelf's corner (FRQ) with a 32-bit CORDIC; no table is copied. The 48 kHz rate is
the audio interrupt's 1,500 blocks a second of 32 frames (rytm-emu) and the Overbridge clock
measured on hardware, 48000.4 Hz (rytm-emu's OVERBRIDGE.md).

- Independent code review (asm gate, fixed-point bounds, table indexes, view walk, no libgcc
  calls): no defects; one comment corrected.
- Host check: `fx-hz.c` compiled on the host against the two tables gives the same text as a
  floating-point reference of the same equations at every index 0..1016 (HPF, LPF) and every FRQ
  value 0..127.
- Emulator, rytm-emu 2ac0f1f, FH04 (Modwerk base 1c14b6b0 + 1.2.1, `5b5fd85c…1146`) against FX02
  (the same with 1.3.0, `a755575b…c8d7`): DELAY HPF and LPF and REVERB FRQ, HPF and LPF set by CC on
  channel 13 (LPF with its HPF at 0), each value 0 to 127, turned (one nudge) and locked (GRID
  RECORDING, trig 1 held, one nudge): 2,560 frames. The text read back from every 1.3.0 frame is
  the expected one (HPF 5.00Hz..12.0kHz, LPF 5.00Hz..OPEN from 113, FRQ 974Hz..14.0kHz); every
  locked value is in a 33-pixel box (x−16..x+16) with at least a pixel of box either side and
  nothing outside it. 1.2.1's frames show stock's numbers in stock's 27-pixel boxes. Locked HPF
  and LPF boxes meet at one column, which shows as a one-pixel divider ([report](evidence/emulator-1.3.0.json)).
- LPF follows a lock: track HPF 0, trig 1 held, HPF locked at 39 (79.0Hz) and LPF at 40: LPF reads
  1.34kHz, the corner for 39 + 40, not 84.8Hz (`media/delay-locked.png`). Locked the other way round
  (LPF first, then HPF moved), LPF's box follows HPF on the next frame.
- FILTER page: 1.2.1's four capture plans on FZ79 (core-ar2 0.3 + 1.3.0, `96cec08b…21bf`) give
  `filter-page.png`, `frq-440hz.png`, `frq-open.png` and `frq-locked.png` byte for byte.
- Memory: 1,673 bytes (`.run`; 302 in 1.2.1).
- SCENE and PERFORMANCE edit (FZ79 against FH04): stock keeps a held trig's, a scene's and a
  performance macro's locks behind one lock interface, which the knob text and LPF's HPF read the
  same way. Scene 1 in edit, its pad held, DELAY HPF (38) and LPF (40) turned one step: 79.0Hz and
  1.44kHz in 33-pixel boxes, LPF from the scene's HPF lock (39 + 41); 1.2.1 shows 39 and 41. On
  REVERB, FRQ (63), HPF (38) and LPF (40) the same way: 5.85kHz, 79.0Hz and 1.44kHz; 1.2.1 shows 64,
  39 and 41. Performance macro 1 in edit, DELAY and REVERB: both builds show stock's signed depth
  (DELAY +5, −2; REVERB FRQ +1, HPF +2, LPF −1), which is not a frequency and stays a number.
- Hardware, 2026-11-15, run by an automated test link on npp1993's Analog Rytm MKII (OS 1.74),
  screens read back from the unit, not judged by a person: FL01 (a Modwerk base development build
  + 1.3.0, `beb2a227…3b6e`, image CRC `38c7eea1`) booted from RAM in a scratch project. Six cases,
  each run twice, 6 of 6 passing both times ([hardware report](evidence/hardware-testing-1.3.0.json)):
  - DELAY turned: HPF 64 463Hz, HPF 127 12.0kHz, LPF 80 (HPF 0) 1.44kHz, LPF 96 (HPF 32) OPEN.
  - REVERB turned: FRQ 64 5.85kHz, FRQ 0 974Hz, HPF 64 463Hz, LPF 80 (HPF 0) 1.44kHz.
  - Trig lock: HPF 39 and LPF 41 on trig 1, 79.0Hz and 1.44kHz in wide boxes; track HPF then 0 and
    LPF moved to 42 on the held trig: 1.55kHz, from the trig's HPF, not 97.7Hz.
  - SCENE edit, scene 1: DELAY 84.8Hz and 1.66kHz; REVERB FRQ 5.96kHz, HPF 84.8Hz, LPF 1.66kHz.
  - PERF edit, macro 1: stock's signed depth, +8 and −5.
  - Reported by npp1993 while watching: two locked kHz values on HPF and LPF make their boxes touch
    (the one-pixel divider above); kept as it is, the same format as FILTER FRQ.
- Not tested: playback while turning, other modules beside it, saving and reloading a project, a
  power cycle, audio (the frequencies are from the equations, not measured).

## 1.2.1 (a wider lock box for FRQ)

Stock OS 1.74 draws the inverted box behind a locked value itself: its knob value routine
(`0x40037a56`) centres the text on the knob and, for a value in the label row, inverts
x−13..x+13, 27 pixels, whatever the text. Every 1.2.0 `kHz` value is 28 to 31 pixels wide and
stuck out of it. 1.2.1 adds `filter_hz_box` at the routine's five pushes of that rectangle
(`0x40037bea`, 20 bytes): for FRQ the box is x−16..x+16, 33 pixels, for every value (one pixel
past the widest text, 31 pixels, on each side); for every other parameter it is stock's ([emulator report](evidence/emulator-1.2.1.json)).

- Emulator, rytm-emu 2ac0f1f, FH00 (Modwerk base + 1.2.0, `1cae85e2…2184`) against FH04 (the same
  with 1.2.1, `5b5fd85c…1146`). FRQ locked on a trig (GRID RECORDING, trig held, knob E) at every
  value 0 to 127: the box is x 0..32 every time, the text has at least one pixel of box on each
  side and nothing outside it. In 1.2.0 every kHz value stuck out of stock's box. Unlocked FRQ (0, 60, 75, 127) and locked RES (0, 64, 127), TYP (3), ENV (0, 64, 127),
  ATK and DEC (64): identical to 1.2.0's.
- Screens: the capture plan in [media/capture.json](media/capture.json), rytm-emu c5732f0, gives
  1.2.0's three frames byte for byte on FZ78 (1.2.1, `3554efa8…a93f`) and on FZ74 rebuilt from
  main. The new `frq-locked.png` is FZ78 in rytm-emu 2ac0f1f.
- Memory: 302 bytes (`.text`; 256 in 1.2.0). The gate code is upstream's, unchanged.
- `evidence/source-parity.json` is 1.2.0's byte-parity record against rytm2_mods v1.2; 1.2.1 adds
  code upstream does not have.
- Hardware, as reported by npp1993 (a maintainer, not the author), 2026-11-14: FZ78 (core-ar2 0.3 + Filter Hz 1.2.1,
  `3554efa8…a93f`) booted from RAM over USB on an Analog Rytm MKII, OS 1.74, in a scratch project. With FRQ locked on a
  held trig at 440Hz, 1.11kHz, 2.22kHz and 21.1kHz the white box stayed the same width and covered the whole value; a
  locked RES looked as before; unlocked FRQ read 13.8Hz and 21.1kHz at the ends; about a minute of playback while
  turning FRQ had no freezes or dropouts ([hardware report](evidence/hardware-testing-1.2.1.json)).

## 1.2.0

- Module: `filter-hz` 1.2.0, for Analog Rytm MKII OS 1.74 on core-ar2 0.3. 1.2.0 drops the OS 1.73
  release (core-ar2 0.1) that 1.1.0 had; the 1.74 code is unchanged.
- Source: https://github.com/Iced-Cream/rytm2_mods at `afd461d4a8ef4306bb2a57d4c61ad35c362b3940` (tag `v1.2`).
  `src/filter-hz.s` (`9d248844…d5bb`) is its `filter-hz/os1.74/filter-hz.s` and `include/ar2-1.74.inc`
  (`c57431f7…874b`) its `include/ar2-1.74.inc`, byte for byte.
- Original: MrScruff's rytm-mods `0008-filter-hz`, in rytm-mods-src at `cf5ac006`, marked hardware-verified there.
- Stock OS 1.74: `.syx` `cb0f99d6…e123`, main OS `34cd0c4d…1f3b`.
- Build FZ74 (OS 1.74, released core-ar2 0.3 + this module): `.syx` `62c256261d643752c9e8ffb357aada048af75a9b03c1f1aae649287e4bae7745`,
  main OS `2d8aead1932dd07003c75b233c4c93291d144c4eb5d6a8a11f1fecece1ea948d`. Tested on the unit 2026-10-22.
- Tested build C3A4 (OS 1.74, core-ar2 0.3 before #153 + all eleven rytm2_mods v1.2 ports): `.syx`
  `04d987ced36850eef5eb5cd1215d411edf621a5af94f980525ab561c9108f951`, main OS `fc871476…d529`.

### Hardware

On 2026-10-22 Iced-Cream flashed FZ74 (the released core-ar2 0.3 and Filter Hz alone) with
Transfer. It booted and played as stock. FRQ fully left read 13.8Hz, fully right 21.1kHz, one
step back 19.9kHz, and RES still showed a plain number. A minute of playback while turning FRQ,
with samples and delay and reverb sends on all tracks and heard over Overbridge, had no freezes
or dropouts. Stock 1.74 was restored afterwards.

Earlier, on the same unit, 2026-10-18, in R8T2 (core-ar2 0.1 ported to 1.74 and eight
ports, with rytm2_mods v1.1's Filter Hz): FRQ fully left read 13.8Hz, fully right 21.1kHz,
one step back 19.9kHz, and RES still showed a plain number. On 2026-10-20, in C3A4
(core-ar2 0.3 and all eleven v1.2 ports, including this module's v1.2 release object
`25055fc7…512a`), each mod's own test passed. Relinking C3A4's core and v1.2's eleven
release objects on stock 1.74 gives C3A4's main OS byte for byte. See
[the hardware report](evidence/hardware-testing.json).

The OS 1.73 release that 1.0.0 and 1.1.0 carried was tested on a unit as FZ01 (2026-10-13);
that report left with the release.

Duration and readings beyond those were not recorded.

### Source build comparison

Modwerk's own validation and compiler path, run on this folder:

```sh
node scripts/machine-modules.mjs --base origin/main
MODWERK_CROSS=m68k-linux-gnu- node scripts/build-elemod-packages.mjs --output OUT --source-commit <commit> --module analog-rytm-mkii:filter-hz
node scripts/verify-elemod-source-parity.mjs --packages OUT --oracle ORACLE --out RESULT \
  --firmware analog-rytm-mkii:Analog-Rytm_MKII_OS1.74.syx
```

`ORACLE` held elekloader's `core-ar2-0.3.elemod` release (`core-ar2-v0.3`, 769d9aa, `6b97dfb3…3e58`)
and rytm2_mods v1.2's release `filter-hz-1.0-os1.74.elemod` (`25055fc7…512a`). The materialised
Modwerk package, linked with that core, gives the same main OS as the core linked with the
release object, `2d8aead1…948d`, which is FZ74, the build tested on the unit
([source-parity.json](evidence/source-parity.json)). `.run` is 256 bytes, one site, no relocations.

Compiler: Ubuntu 24.04 `m68k-linux-gnu` GCC 13.3.0 and binutils 2.42. Modwerk's pinned Docker
toolchain (`m68k-elf` binutils 2.47) was not run here; CI's `elemod-source` job compiles this
folder with it and checks the committed export against that build. The firmware and the linked
builds stayed on the owner's computer.

The source-only export, `sdk/imports/packages/filter-hz/filter-hz-1.2.0-os1.74.elemod`
(`95e455cb…0446`), comes from that compiled recipe with `scripts/package-elemod-recipe.mjs`.
Elekloader kit 0.7.0, as vendored in Modwerk, builds it with the released core-ar2 0.3 on stock
1.74, with display version FZ74, into FZ74's .syx byte for byte (`62c25626…7745`), so the browser's build is the tested build.

### Emulator

[rytm-emu](https://github.com/trigcondition/rytm-emu), headless `dtboot`, the same input on the
module's build and on stock ([capture plan](media/capture.json)): `c5732f0` on FZ74 and stock 1.74.
The PNG files were first captured with `3c4c42c` on the OS 1.73 build FZ01; FZ74 gives them byte for byte.

| Screen | Stock | With Filter Hz |
| --- | --- | --- |
| FILTER page | FRQ label | identical |
| FRQ at 60 | `60` | `440Hz` |
| FRQ at 127 | `127` | `21.1kHz` |

Of the 104 screens of the run, 94 differ from stock 1.74 only in the FRQ label. Turns 60, 70
and 80 also differ in the filter curve, because the two runs had reached different FRQ values
mid-turn (622Hz against 68 at turn 60). The analog voices are stubbed in the emulator, so this
says nothing about sound, which the module does not touch.

## Load and memory

302 bytes in the shared DDR area (256 before 1.2.1), no `.bss`, no fast SRAM. One site is in
`param_value_text`, which formats a parameter's value for the screen; for any parameter but
FRQ the stub re-runs the two displaced instructions and returns. The other (1.2.1) is in
stock's knob value drawing, where a locked value's box is pushed: a few instructions each time
a lock box is drawn, stock's rectangle for any parameter but FRQ. Nothing runs in the audio,
sequencer or tick paths. Static reading, not a measurement.

## Not tested

- Filter types other than LP2 against a measured cutoff (the scale is assumed to hold).
- Other modules beside it, except rytm2_mods' own ports.
- Long sessions, project save and reload, and a power cycle with this build were not recorded.
