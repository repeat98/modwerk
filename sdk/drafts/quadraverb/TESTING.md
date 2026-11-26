# Quadraverb testing

Record what you ran, on which build and which unit, and what you saw; "not tested" is a valid answer, and emulator
runs stay apart from hardware ones.

## 0.1.0-experimental

Built on the developer's computer and held to the models; not run on a unit or in an emulator, not heard
(27 November 2026). How it works: [ENGINE.md, The release package](ENGINE.md#the-release-package-27-november-2026).

Build, from the owner's ROM (everything written goes to `gen/` or `~/.cache`, outside Git). The package needs the
`ot_dsp_effects` table and the `programs` feature of the base side branch `base/octatrack-program-areas`, so its last
two steps run in a checkout of that branch with this folder copied in, untracked:

```sh
E=~/.cache/modwerk-local/quadraverb/engine                    # programs.json and lfo-all/ (FIRMWARE.md, ENGINE.md)
python3 -B engine/qvarea.py areas $E/programs.json $E/lfo-all     # gen/areas.json: the 22 areas
python3 -B engine/qvcf.py gen $E/programs.json $E/lfo-all --areas gen/areas.json   # gen/qv_tables.h
python3 -B engine/qvcf.py asm                                     # gen/qv_runtime.s
npm run module:dev -- quadraverb --build-only --out qv-raw.mwrm --slots fx2 --cycles 330 --cycles-kind modeled \
  --state 132 --buffer 15870
python3 -B sdk/runtime/loader/abi9.py qv-raw.mwrm --requires programs -o quadraverb-0.1.0.mwrm
```

The build of 27 November 2026: `quadraverb-0.1.0.mwrm`, 77,960 bytes (code and data, 139,264 of bss), SHA-256
`35faa1b5d34e958cecf243aff412fb8a3f7cdb9001326de4b48af8b334538943`; 25 DSP words of shell; areas of 849-1,098 words;
declared 330 modeled cycles (the stall model's 207-316 with the stream, plus the area's own work; not traced in the area
form). In `~/.cache/modwerk-local/quadraverb/pkg/`.

Checked on the host: `engine/verify_area.py` (each of the 22 programs, the gates in its docstring) and
`engine/test_qv_runtime.py` (the ColdFire half against qvs.ColdFire, 12 cases). Not checked anywhere: the frame
interrupt's cost of `fill()` and `take()`, the base writing and switching a real area, the arena's room beside a Part's
stock effects, the sound.

## Bit-exact in dsp_host (26 November 2026)

Every program is compiled by the engine's generator and run in `dsp_host` against the integer model
(`engine/verify.py` for the 7 that need no stream, `engine/verify_stream.py` for the rest, with the stream's ColdFire
side modelled): noise and impulses, trig splits at frames 1, 5, 7 and 13, a dirty state, two instances. Branch
`module/quadraverb`; inputs derived from the owner's ROM in `~/.cache/modwerk-local/quadraverb/engine/` (programs.json,
`lfo-all/` from `node engine/extract_lfo.mjs <rom> <dir>`, `lfo-signal/` with `--signal`).

| Programs | How | Result |
| --- | --- | --- |
| 76 programs: every one but those below | the gates above, the firmware's program after each of 16,384 ticks | pass (ENGINE.md) |
| 3, 23-27 (gated reverbs), 28, 29, 86, 87 (gated), 31, 32, 88 (onset restart) | the same, extracted with the detector held at "signal" (`extract_lfo.mjs --signal`, pin P3.2 low): gate open, no onset | pass, in their open form (e45c55983); cycles not traced |
| 73 VERB SHIFTER | | not run: the engine has no tick for its coefficient sweep (two 256-entry curves read from the ROM), and it is gated |

So 89 of 90 run bit-exact, 13 of them in their open form only. Why the 13 are not the original yet: the gate (a window
every 16 ticks, hold and release, FIRMWARE.md "The gate") and the onset restart are not in the engine, and both need a
signal detector the original has in hardware; its threshold and time constant would be assumptions.

## Captures

None. Captures need the package installed in the emulator, and on the base 0.8.3 twins the emulator does not take an
upload.

Last try, 26 November 2026, about 23:45: `npm run device:emulator` (the adapted `ot_emu`, `--dsp`) on twin2 (MAIN
`cc39ed0c…`, the base 0.8.3 draft with program areas and the stream), then `try qv-dev-5.mwrm` (`28817e0e…`). The
twin booted and its DSP ran (`stats`: T5-8 passes 963 of 966), but the upload's acknowledgement never came: "hello
was not confirmed (Upload acknowledgement timed out)", and the inventory stayed empty. It failed the same way on every
0.8.3 twin tried that day. Even with the upload, a pick would be refused: `ot_emu`'s CPU meter reads 1000 per mille
from boot, so the base's busy-unit guard says CPU FULL (agent board, 21 November). Why the acknowledgement does not
come is not known; the emulator is shared tooling, so it was not changed here. The release build's captures wait for
either a fixed emulator or the unit.

A fresh emulator built from the pinned upstream source (`~/.cache/modwerk-local/emu-fresh/adapted/ot_emu`, 26 November
2026) takes the upload on twin2: `qv-dev-5.mwrm` was accepted and listed as handle 10, "Quadraverb DEV". But it shows
no DSP passes on any twin, with the same flags (`--dsp`, no package): the main 0.8.2 twin (base 46c30886), twin4
(base fecd8a64) and twin2 (base 906c5b59) all read `T1-4 0/0 T5-8 0/0`, CPU 1000. So the zero is the fresh emulator's,
not twin2's. The older adapted emulator runs core 0 on twin2 (`T5-8 963/966`) and never core 1 (`T1-4 0/0`).

## Development builds

One factory program compiled into the engine, MIX on knob F, nothing else (PROG is on the page but does nothing).
They exist to measure the compiled engine's DSP cost on a unit and to listen to it, before the base's program areas
and stream ([ENGINE.md](ENGINE.md)). Never published.

## On another computer, from scratch

The packages are not in the repository (they carry the Alesis program), so a session on another computer rebuilds
them from the owner's own ROM, then runs [On the unit](#on-the-unit) and records it as [Record](#record) says.

1. **Checkout and tools:** this branch (`module/quadraverb`, PR #2203), Node 24, `npm ci`, `npm run upstream:tools`
   (the DSP assembler and `dsp_host` in octabam's vendor tree; `make setup` there if they are missing). Python 3.
   `export ELEKLOADER_DSP_ASM=<octabam>/vendor/dsp56300/build/source/dsp_host/dsp_asm` (`dsp_host` beside it).
2. **The ROM:** the Quadraverb 1.07 image, address-unscrambled ("usemapped"), md5 `2066a1148efef82e1045d5928315f004`
   (`tools/machine.mjs` checks it). Keep it outside the repository.
3. **The engine's inputs**, derived from the ROM, outside the repository:

   ```sh
   R=<path to the ROM>; C=~/.cache/modwerk-local/quadraverb/engine; mkdir -p $C
   cd sdk/drafts/quadraverb/engine
   node extract.mjs $R $C/programs.json          # the 90 programs, integer coefficients, static or moving
   node extract_lfo.mjs $R $C/lfo 5              # the stereo flange's sweep (only the moving program 5 needs it)
   ```

4. **Each package**, one program at a time (`build` packages what `gen` wrote last):

   ```sh
   for p in 5 40 56; do
     python3 -B qvunit.py gen $C/programs.json $p && python3 -B verify_unit.py $C/programs.json $p \
       && python3 -B qvunit.py build $p --cycles 260
   done
   ```

   `verify_unit.py` must end in PASS for each; its engine.asm SHA-256 must match the table below (same ROM, same
   generator). The packages land in `~/.cache/modwerk-local/quadraverb/pkg/qv-dev-<p>.mwrm`.
5. **The 0.8.3 development twin** for `device:price` (and the listening, if the flashed base is older than 0.8.2):
   from a checkout of `base/octatrack-next` (PR #2246), with the owner's stock OS 1.40C and the pinned m68k
   toolchain on PATH. In that shell too, `ELEKLOADER_DSP_ASM` as in step 1 (the build disassembles with
   `dsp56kDisassemble` beside it), and a fresh worktree without `npm ci` needs `node scripts/mirror-octatrack-modules.mjs`
   first (else `FileNotFoundError: 'modules'`). With the `serve` loop running, boot through it:
   `scripts/device-send.py "boot <twin dir>"`.

   ```sh
   python3 -B sdk/machines/octatrack/elekloader/build_core.py --stock <OS1.40C.bin> \
     --upstream ~/.cache/modwerk-upstream/elekloader --output <twin dir> --dsp-loader --usb-input --usb-midi \
     --packaged-usb-audio --site-events --cached-modules \
     --table-owners sdk/machines/octatrack/module-adapters/table-owners.json --resident-stock-hooks \
     --resident-on-demand --module-sets --sample-editor --part-menu --module-ui-roots --dev
   npm run device -- boot <twin dir>                # RAM boot; a power cycle returns to the flashed base
   ```

## The builds

Each package is built on the developer's computer from the owner's own ROM image; neither the generated engine nor
the package enters the repository. `engine/qvunit.py gen` writes the program's `engine.asm` to
`~/.cache/modwerk-local/quadraverb/engine/pkg/<program>/` and copies it into `gen/`, which `.gitignore` ignores (and
so does every staged copy of the draft, which carries that file). `qvunit.py build` runs
`npm run module:dev -- quadraverb --build-only --slots fx2 --cycles 260 --cycles-kind modeled --state 132 --buffer 15870`
into `~/.cache/modwerk-local/quadraverb/pkg/`.

```sh
export PATH=~/.cache/modwerk-local/node/bin:$PATH
P=~/.cache/modwerk-local/quadraverb/engine/programs.json
cd sdk/drafts/quadraverb/engine
python3 -B qvunit.py gen $P 40 && python3 -B verify_unit.py $P 40 && python3 -B qvunit.py build 40 --cycles 260
```

`build` packages whatever `gen` wrote last, so run the two for one program before the next. The three builds share one
module identity (quadraverb): try one at a time.

| Package | Program | Chooser name | Ring (words) | DSP words | engine.asm SHA-256 | Package SHA-256 (26 Nov 2026) |
| --- | --- | --- | --- | --- | --- | --- |
| `qv-dev-5.mwrm` | 5 STEREO FLANGE (moving: a stereo sweep) | QV DEV 5 | 13,066 | 856 | `80df4a44…` | `28817e0e…` |
| `qv-dev-40.mwrm` | 40 167 ms DELAY (static) | QV DEV 40 | 7,062 | 874 | `719ec947…` | `63b4b667…` |
| `qv-dev-56.mwrm` | 56 SKANK GUITAR (static) | QV DEV 56 | 8,031 | 884 | `d399e8d2…` | `3561a4bd…` |

What a unit build adds to the prototype's code (`qvc.generate(unit=True)`, `qvc.USTATE`):

- **The ring cleared over calls**, 1,024 words a call, not in init. Until it is clear the engine does not run and the
  wet is silent: 7, 8 and 13 calls (under 5 ms). A clearing call costs about 1,280 cycles, a third of a playing one.
- **init and a stale state through one subroutine.** init reads the slot's buffer base (X:$213), then sets up the
  tables, the state and the clear. A proc that meets another build's state (the signature at r7+$0c differs; stock
  runs init only when a slot's effect id changes) sets up afresh from the kept base, as Midiverb does.
- **MIX** (knob F): out = floor((wet m + dry (128 − m)) / 128), m = MIX + (MIX ≥ 64), so 0 is the dry alone and 127
  the wet alone, exactly. The knob word is masked (`and #>$7f0000`) for an LFO's low bits. The dry L and R go to 32 Y
  words after the tables while the input pass averages them.
- **The dispatcher's registers given back:** r6 (the parameter page) and n7 (the count) are restored at the end of
  every call (the body uses n7 for the input word, r6 as a chain); m4-m6 back to linear.
- **Inside the buffer:** the ring, its distance table and the dry scratch end within the first 15,870 words (block 3's
  rule and Sidechain's key window); the r7 block stays within $00-$83 (the highest used is $80).

## Emulator (dsp_host)

`engine/verify_unit.py` on the generated file (26 Nov 2026), each program: the file is what the generator makes now;
labels, assembler traps and every operand as written; then bit-exact against the integer model at MIX 127 (noise,
two impulses), MIX 0, MIX 64, MIX 100 with an LFO's low byte in the knob word, trig splits at frames 1, 5, 7 and 13
(MIX 90), a Y full of garbage before init (the spread clear), two instances (the second split at 7, MIX 64), a state
another build left at the first call, and dsp_host's guard over the instance's 15,870 words (no stray write, no
clobber). All pass for 5, 40 and 56.

Cycles a sample, interlock_scan's stall model on the traced proc (`--cycles` with the `-steptrace` dsp_host), one
instance, 16-frame blocks, MIX 127. A model calibrated idle on an MKII, not a measurement:

| Program | Proc, average | Dearest block | The body | Executed a sample (dearest) | Before (the prototype, no MIX) |
| --- | --- | --- | --- | --- | --- |
| 5 STEREO FLANGE (32 blocks, 48 ticks of 151-155 cycles) | 214.7 | 221.6 | 165.0 | 194.4 | 199.5 / 206.4 |
| 40 167 ms DELAY | 240.6 | 240.6 | 213.0 | 228.6 | 225.4 |
| 56 SKANK GUITAR | 240.6 | 240.6 | 212.9 | 226.6 | 225.4 |

The unit build costs about 15 more than the prototype: the mix pass (8 instructions a sample) and the knob and state
work of each call. dsp_host's meter, the worst block of 16,000 samples including init's table writes: 228.7 (5),
274.9 (40), 231.2 (56) executed instructions a sample; init runs once, about 700 instructions. Declared to the base:
260 modeled cycles, charged at 7/4 (455) until a hardware figure replaces it; one instance must fit 726.

Not seen in dsp_host: that the real dispatcher accepts what proc gives back (by inspection), the unit's Y wait states,
the frame interrupt's share, and the sound on a unit.

## On the unit

### 26 November 2026, the owner's MKII: price measured, sound not yet heard

Development twin `289c66b9124d9121…` of base 0.8.3 (`base/octatrack-next` `ae45a9724`), RAM-booted; flashed base
`24e480c4…` with Tape Echo, Euclid and Air Chorus kept (untouched: no Keep, inventory empty after). The three
packages rebuilt on the owner's computer from the 1.07 ROM: every engine.asm and package SHA-256 equals the table above
(`28817e0e…`, `63b4b667…`, `3561a4bd…`), all three `verify_unit.py` PASS.

`device:price --memory --readings 2 --seconds 6`. Scene: bank B pattern 1, Part 1 at the stock defaults (FILTER on
FX1, DELAY on FX2 of every track), no trigs and no samples, transport playing during each reading. The project's own
pattern had unsaved Part edits, so the run stayed off it; the engine's cost does not depend on its input (straight-line
code), but the frame and CPU readings are of a pattern that plays nothing. Points are of the DSP meter (45.32 cycles a
sample each), means of two readings, before vs in use:

| Build | Slot | DSP mean, before → in use (core of the slot) | Peak | Added: points (cycles a sample) | Model (cycles) | DSP words added | Frame, CPU, skipped |
| --- | --- | --- | --- | --- | --- | --- | --- |
| QV DEV 40 | T1 FX2 | 32.8 → 38.1 | 33.8 → 39.2 | +5.3 (240), peak +5.4 (245) | 240.6 | 874 | 22.6 → 22.6 %, 34.5 → 34.6 %, 0 |
| QV DEV 5 | T1 FX2 | 32.8 → 37.6 | 33.8 → 38.8 | +4.8 (218), peak +5.0 (227) | 214.7, dearest block 221.6 | 856 | 22.6 → 22.6 %, 34.5 → 34.6 %, 0 |
| QV DEV 56 | T1 FX2 | 32.8 → 38.1 | 33.9 → 39.3 | +5.3 (240), peak +5.4 (245) | 240.6 | 884 | 22.6 → 22.6 %, 34.4 → 34.4 %, 0 |
| QV DEV 5 | T5 FX2 (core 1) | 41.9 → 46.5 | 42.0 → 46.8 | +4.6 (208), peak +4.8 (218) | 214.7 | 856 | 22.6 → 22.6 %, 34.6 → 34.5 %, 0 |

- **The model holds on the unit:** every build within 0.1 point (one step of the meter, about 4.5 cycles) of the
  stall model's figure. Midiverb's ratio (about 10 points) does not apply to this straight-line code, and the 7/4
  charge (455 cycles) is 1.9 to 2.1 times what one instance costs.
- **At rest** (installed, used nowhere) each build added nothing: frame, CPU and both DSPs +0.
- **Clean:** the trials were each rolled back; no loader stall or error, no new crash or stall record (13 and 56
  before and after, both older), 0 renders skipped, 0 late frame entries during the runs (`late`: the 160 waits the
  first read showed were logged at the twin's start, before any build was installed).
- **Not done:** listening (step 1, the owner's), a second instance at once (the T5 row is one instance on the other
  core), `--curve`, an audio recording, any `fx:audit`. Nothing here says how it sounds.

The procedure for the owner and the developer:

**Base.** Any base with the USB loader from 0.8.1 takes the package (no ColdFire code, no hook, no base-bound part:
a DSP effect of 856-884 words, 132 state words, a 15,870-word FX2 buffer). Use 0.8.2 or later: on 0.8.1 the first NO
after a pick on FX2 SETUP closes only the memory box. `try` works on the flashed 0.8.2 or the 0.8.3 development twin.
`device:price` needs a development twin (its guard request): run it on the 0.8.3 twin.

**Link.** `while [ -f scripts/device.mjs ]; do npm run device -- serve --share /tmp/modwerk-share.sock; sleep 1; done`
from a checkout that stays ([driving the Octatrack](../../../docs/OCTATRACK_DRIVING.md)). Device commands take their
turn on the unit by themselves (`npm run unit -- status`).

**1. Listen (about 5 minutes a build).** Leave the CF card in. A drum loop or a short melodic part on T1, transport
stopped, then:

```sh
npm run device -- try ~/.cache/modwerk-local/quadraverb/pkg/qv-dev-40.mwrm --seconds 300 --socket /tmp/modwerk-share.sock
```

T1, FUNC+FX2, turn LEVEL to QV DEV 40, YES, then FX2 for its page (one knob, MIX on F, default 64). Play. Listen for:

- 40 167 ms DELAY: the input itself, then repeats 7,015 samples apart (159 ms here, 167 ms at the original's 42 kHz),
  each about 13 dB quieter than the last (the model's impulse response); MIX 0 exactly dry, 127 the program alone.
- 5 STEREO FLANGE: a slow stereo flange sweep, the two sides moving apart; 5 % faster than the original.
- 56 SKANK GUITAR: a resonant, filtered ring that lasts about a second after a hit (the model's impulse response).
- On every build: no click when it is picked (the dry stays at its mix for the first few ms while the ring clears), no
  crackle, no DC thump, no noise when the input stops; other tracks unchanged; the CPU meter steady. A second
  instance on T5 FX2 (the other core) sounds the same.

The trial rolls back by itself after 300 s or on Ctrl-C. Do not Keep a development build.

**2. Price (about 10 minutes a build, on the 0.8.3 twin).** Select a busy pattern (trigs on several tracks), leave the
transport stopped, T1 FX2 on a stock effect, then:

```sh
npm run device:price -- --slot T1 --fx-name 'qv-dev-40=QV DEV 40' --memory \
  --out ~/.cache/modwerk-local/quadraverb/price-40.json ~/.cache/modwerk-local/quadraverb/pkg/qv-dev-40.mwrm
```

(`--socket` and `--share` default to the session's sockets of a `serve --share /tmp/modwerk-share.sock`; the same for `qv-dev-5` with `QV DEV 5`, and `qv-dev-56` with `QV DEV 56`). It presses PLAY and STOP itself, reads
the frame interrupt, the CPU meter and both DSPs before the build, installed and used nowhere, and in use on T1 FX2,
then picks T1's effect back and rolls the trial back. No `--write`: these figures are for the engine, not a release.
What to read: the in-use DSP T1-4 mean and peak against the reading before. By Midiverb's ratio (397 executed
instructions a sample took about 17.8 points of core 1) the model predicts about 10 points; the 7/4 charge assumes up
to 1.74 times the model. Add `--curve T1,T2` to read a second instance on the same core if the first is clean.

**Abort at once, and tell the owner, on any of:** a frozen screen or keys, audio stopping or stuck on one sample, the
DSP stall or skipped-track lines in the trial's verdict (`npm run device -- do diaglog`), a refusal other than
cycles or memory, or the trial neither starting nor being refused. A freeze needs the owner's power cycle: never
try the next build on a unit that froze until it has had one. A refusal for cycles (loader refusal 6) or memory is
not a freeze: note it and stop.

## Record

After the session, write what was observed, and only that, into [On the unit](#on-the-unit) as a dated table
(unit MKI or MKII, base and its hash from `npm run device -- status`, package SHA-256 from `sha256sum`), and post the
same as a comment on PR #2203. Per build:

| Build | Picked and heard? | What it sounded like (against the list above) | Clicks, noise, DC | `device:price`: DSP T1-4 mean / peak, in use vs before (points) | Second instance (T5) | Verdict / diaglog |
| --- | --- | --- | --- | --- | --- | --- |
| quadraverb-0.1.0 (`35faa1b5…`) on twin5 (`7520dee5…`): PROG 20, 10, 15, 19 or 66; T5, then T1 | | | | | | |
| QV DEV 40 | | | | | | |
| QV DEV 5 | | | | | | |
| QV DEV 56 | | | | | | |

Attach the `device:price` JSON files (`price-<p>.json`) to the comment. The figure to compare: the model's
215-241 cycles a sample (Emulator, above); a point of the DSP meter is 45.32 cycles a sample, so the model predicts
about 5 points of a core per instance (Midiverb's measured ratio suggests up to about 10).

## Stock flows

Not tested.

## Sound quality

Not tested: `npm run fx:audit` (aliasing, DC, clipping, idle) was not run. The wet path is the original program's,
at 44.1 kHz with 24-bit words; the mix of two words cannot clip.

## Performance

No `evidence/performance.json`: a development build. The model's figures are above, and the unit's (26 November 2026, [On the unit](#on-the-unit)) match them within a step of the meter.
