# Quadraverb testing

Record what you ran, on which build and which unit, and what you saw; "not tested" is a valid answer, and emulator
runs stay apart from hardware ones.

## 0.1.0-experimental

Built on the developer's computer and held to the models; not run on a unit or in an emulator, not heard
(27 November 2026). How it works: [ENGINE.md, The release package](ENGINE.md#the-release-package-27-november-2026).

Build. `gen/` is committed (the owner's waiver of 27 November 2026), so the last two steps alone rebuild the package;
the first three regenerate `gen/` from the owner's ROM, which stays on his computer. The package needs the
`ot_dsp_effects` table and the `programs` feature of the base side branch `base/octatrack-program-areas`, so its last
two steps run in a checkout of that branch with this folder copied in, untracked:

```sh
E=~/.cache/modwerk-local/quadraverb/engine                    # programs.json and lfo-all/ (FIRMWARE.md, ENGINE.md)
python3 -B engine/qvarea.py areas $E/programs.json $E/lfo-all     # gen/areas.json: the release's areas
python3 -B engine/qvcf.py gen $E/programs.json $E/lfo-all --areas gen/areas.json   # gen/qv_tables.h
python3 -B engine/qvcf.py asm                                     # gen/qv_runtime.s
npm run module:dev -- quadraverb --build-only --out qv-raw.mwrm --slots fx2 --cycles 355 --cycles-kind modeled \
  --state 132 --buffer 15870
python3 -B sdk/runtime/loader/abi9.py qv-raw.mwrm --requires programs -o quadraverb-0.1.0.mwrm
```

The build of 27 November 2026, 48 programs: `quadraverb-0.1.0-48.mwrm`, 172,020 bytes (171,432 of code and data, 147,456
of bss: about 312 KiB of the 768 KiB module pool), SHA-256 `b1956a732f87644b8b58d9d207983112f7d98add6f963e8603bd48e8283d3d33`;
25 DSP words of shell; areas of 919-1,168 words; declared 355 modeled cycles, from the traces below (the base charges
7/4 of it, 621 of the 726 one instance may take). In `~/.cache/modwerk-local/quadraverb/pkg/`, beside the earlier builds:
the 22 reverbs (`quadraverb-0.1.0.mwrm`, `110a31f8…`, 82,668 bytes, 139,264 of bss) and the build before the fade
(`35faa1b5…`, `quadraverb-0.1.0-before-fade.mwrm`).

**Cycles, traced** (`engine/verify_area.py --cycles <dsp_host with -steptrace>`; all 48 in evidence/performance.json,
`programs`): chip cycles a sample by interlock_scan's model, the shell and the area, one instance, every place a tick can
fall in a block. The dearest: 53 BALLAD SNARE 2, 332.9 on average and 341.6 in the dearest block, 353.1 while it fades;
the cheapest, 04 STEREO CHORUS, 246.1. Executed instructions a sample at most: 317.4 (53, fading). All under what the
base admits for one instance.

Checked on the host: `engine/verify_area.py` (each of the 48 programs, the gates in its docstring) and
`engine/test_qv_runtime.py` (the ColdFire half against qvs.ColdFire, 12 cases). Not checked anywhere: the frame
interrupt's cost of `fill()` and `take()`, the base writing and switching a real area, the arena's room beside a Part's
stock effects, the sound.

### The bank fix (27 November 2026)

The 22-reverb package `110a31f8` rang on the owner's MKII (twin5, T1 and T5). Its areas took the frame's host bank
from r6 & $ffe000, but stock's dispatcher points r6 at its parameter copies (X:$25d-$3dc, read from the dispatcher in
twin5's image), so they read their in-blocks from X:$1be0 and wrote their out-blocks to X:$1840, inside stock's X
tables (a power cycle restores those). The areas now take the bank from X:$207 (ENGINE.md). Rebuilt from that
package's commit (`b34305473`, which rebuilds `110a31f8` byte for byte) with only this change:
`quadraverb-0.1.0-bankfix.mwrm`, 82,468 bytes, SHA-256 `5588e8e11884846e0eef40046736bdb0bea85df727c6bae1e240b8abceaf80c9`.
`verify_area.py`'s stand-in now keeps the page outside the bank and the bank at X:$207: the old area fails it (program
10 from frame 2106), the new one passes on all 22 (32 gates each); `test_qv_runtime.py` passes (12). The 48-program
`gen/` is regenerated the same way but not yet run through `verify_area.py`. Not run on a unit, not heard.

### The program's name when PROG turns (27 November 2026)

Turning PROG on Quadraverb's FX2 page shows the program in stock's message box for 1.2 s: its number on the original
as the dial shows it, then its ROM name upper-cased (`gen/qv_names.h`, for example "15 CONCERT HALL 1"). The base's
`ev_knob_store` take (`runtime.json`, order 68, before Midiverb's 69) is claimed only for slot A of the page the base
installed for this module (`qv_page`: the descriptor itself, not its slot name), so another module's PROG never shows
these names. The entry (`runtime/qv_entry.s`) replays the site's three instructions; their bytes hash to the site's
stock guard. Locks, LFOs and scenes do not store there.

Checked on the developer's computer only: `test_qv_runtime.py` (15 tests: every PROG value 0-255 names the program
`qv_program` picks, by the dial's label and the ROM name; `gen/qv_names.h` is current; the page finder; the unit
assembled as the builder does), in this branch and in the 22-reverb staging copy; `verify_area.py` on the 22
(all 22 pass every gate). `qv_tables.h` regenerates byte for byte in both, so the areas are unchanged. Packages in
`~/.cache/modwerk-local/quadraverb/pkg/`:

| Package | Programs | Bytes | SHA-256 |
| --- | --- | --- | --- |
| `quadraverb-0.1.0-bankfix-names.mwrm` | the 22 reverbs: the bank-fix staging copy (which rebuilds `5588e8e1` byte for byte, `--cycles 355`) with only this change | 83,276 | `0b2535f00c01a71f06bdb5d20eeac432a0277190ec35dda9adc5eeca17fc91cb` |
| `quadraverb-0.1.0-48-names.mwrm` | this branch's 48 | 172,912 (172,296 of code and data: past the 128 KiB a module may take today) | `af7c6a529c32213677138ce5d0f14a1ad91f94f578588c3b9fd4e0f67aef6862` |

Not done: a unit run, and an emulator capture of the box (docs/MODULE_UI_CAPTURES.md: an `encoder` step on A, then
`capture` within the 1.2 s, on a twin that takes the package). Not known: whether a MIDI CC to PROG stores through the
knob handler. With Scale Quantizer or FM Synth installed the names do not show (they take the knob store first, as
Midiverb's TESTING.md says).

### 73 programs (27 November 2026)

The owner asked for as many programs as possible. On the developer's computer, from the owner's ROM, with the stand-in
that keeps the page outside the bank (`engine/verify_area.py`, 32 gates a program):

| Set | What happened |
| --- | --- |
| the ten NOT_EXACT (06, 09, 42, 43, 45, 55, 57, 68, 69, 72) | failed as before with the corrected stand-in (06: audio from frame 50, its out-block in the program's frame 2). The cause: until the program has sent 3 frames the area skipped its copy in, while the model's windows get zeros, and in a small ring (06, 111 words) or a window beside its line's head (55) the ring pointer walks line words into the windows within those frames. The copy now runs with y1 = 0 until then (`engine/qvs.py`); all ten pass every gate |
| the seven with nothing to stream (05, 30, 40, 41, 56, 76, 77) | an area now gets its stream code without a line: the fade words, the tag and K. All seven pass every gate |
| the pitch shifts (07, 37, 51, 59, 60, 70) and Leslies (08, 38, 39, 67, 82) | all pass every gate; areas of 1,295-1,874 words, under the base's 2,048 a record (`dsp_programs.c` MOST) |
| all 76 | image 274,972 bytes, 12,828 past the 262,144 a module may take (`base/octatrack-pool-raise`); the three longest areas are left out: 60 CONCERT GUITAR (1,874 words), 51 AMAZING BASS (1,862), 59 GREASE GUITAR (1,825) |
| 73 | every gate passes on all 73 at their final indices; the package below |

`quadraverb-0.1.0-max-names.mwrm` in `~/.cache/modwerk-local/quadraverb/pkg/`, 258,292 bytes, SHA-256
`4e8ff37dfc4dddb926b05eeb05ec43f78e50f86dac0908572583a65703a3a601`: ABI 9, requires `programs`, image 257,676 of
262,144, bss 163,840 (the ring pool, 70 DELAYED REVERB's 160 KiB), both 421,516 of 524,288; 25 DSP words of shell; areas
of 808-1,801 words; `--cycles 355` modeled. Built as above, but in a checkout of `base/octatrack-pool-raise`
(`f35ec5c41`, twin7's branch) with this folder copied in.

- **Module pool**, by the site's own accounting (`poolExtent`, `src/engine/elekloader/module-set.ts` on
  `base/octatrack-pool-raise`): 422,368 bytes. With every published Octatrack module on main (48 packages, 931,600)
  and USB Audio 0.4.2 (131,776), 1,485,744: 87,120 under 1.5 MiB, so 611,408 of the 2 MiB pool stay free.
- **DSP code:** the record's `program_words` is the longest area, 1,801 (70), and the base claims two areas of it at
  every pick: 3,602 words (2,336 with the 48) of a core's arena of about 4,741 / 4,867 with nothing placed
  (docs/OCTATRACK_DSP_WINDOW.md). A Part with more than about two stock effects on that core can leave the slot dry.
  Without 07, 37 and 70 (70 programs) the claim would be 2,736.
- **Cycles** (`--cycles`, on the 25 new programs and 53): the dearest new one, 67 SUSPEDAL LEZLY, 307.4 in its
  dearest block and 319.0 while it fades; 53 stays the dearest, 341.8 and 353.4 (the zero copy adds 0.2 to its dearest
  block). The other 47 were traced before the zero copy.
- **Host:** `engine/test_qv_runtime.py`, 15 tests pass on the 73 (the C runtime against qvs.ColdFire, 92,440 frames
  bit-exact; every PROG value's name; `code()` on the real areas).

Not done: `stress_area.py`, `evidence/performance.json` (still the 48-program build's), a unit run, listening.

### The 48 programs (27 November 2026)

The owner allowed every program that plays bit for bit in the open form, 76, then chose 58 of them once the 76 did not
fit; ten of the 58 failed as areas, so 0.1.0 has 48 (`manifest.py`). On the developer's computer, from the owner's ROM:

| Set | What happened |
| --- | --- |
| 76 | 7 do not build as areas (05, 30, 40, 41, 56, 76, 77: nothing to stream, and an area's fade words come from its stream; `KeyError: 'PV'` in `qvc.assemble_text`) |
| the other 69 | ColdFire side 418,522 bytes (`m68k-elf-size` of `gen/qv_runtime.s`: 251,880 of tables and area words, 163,840 of bss), about 409 KiB of the 768 KiB pool; the pitch shifts' areas 1,732-1,875 words and the Leslies' 1,296-1,369, two a slot |
| 58: no pitch shifts, Leslies or the 7 | 347,896 bytes by the same measure; areas up to 1,168 words, as the reverbs' |
| 58 in `verify_area.py` | 48 pass every gate; 10 fail and are left out (`NOT_EXACT`), first difference against the model: 06, 42, 43 and 45 at frame 50, 55 at 290, 57 at 258, 69 at 274 and 72 at 242 (audio, noise at MIX 127); 09 and 68 in their out-blocks (frames 789 and 187) |
| 48 | every gate passes on all 48 at their final indices (`verify_area.py`, then `--cycles`); the package above |

The ten failures are not understood yet. They play bit-exact in the open form (one program at a time, without the
release's areas), so the difference is in the release form.

### The fade at a pick (27 November 2026)

**What the original does** (QV 1.07 in the emulator, recalling 15 Concert Hall 1 over 10 SMALL ROOM; not checked on a
real unit): the firmware rewrites the DSP program over about 65 ms. About 10 ms in, 84 of the 96 coefficients are 0, so
the old program's output stops at once, a cut and not a fade. It never clears the delay memory, so the new program then
starts on what the old one left there.

**What this does:** when PROG leaves the value it had when the program started, the wet ramps down to 0 over 256 samples
(16 calls, Midiverb's length), by 1/256 of full a sample. If PROG comes back before the base switches, the wet ramps
back up. The base then writes the new program into the slot's other area and switches to it; the new program clears its
ring (the dry at its MIX meanwhile) and starts from silence. So the old tail fades out instead of being cut, and it does
not run on into the new program. The original's carry-over cannot be reproduced here: two programs' memories are laid
out differently (each program's lines are relocated, some streamed).

**Checked:** `engine/verify_area.py` on each of the 48 programs. PROG leaves 40 frames after the start, comes back 10
frames later and leaves again; the output is bit-exact against the model of the ramp, and the wet is 0 once the ramp
ends. Traced (evidence/performance.json): the test of PROG adds about 2 cycles a sample to every call; a call that
fades costs about 11.5 more (the dearest program, 53, 341.6 while it plays, 353.1 while it fades).

### Stress (27 November 2026)

`python3 -B engine/stress_area.py <programs.json> <lfo_dir>`: eight tracks, four a core, 2.0 s in dsp_host with the guard
and a dirty memory. T1 and T5 run programs, walking through the programs (the two dearest first, 16 in the two seconds) one every sixteenth at 120
BPM with a fade and a switch each time; the other six have the effect with no area. Three LFOs a track, all twelve slots
moving, trig splits on six tracks (the docstring has the rest). The record, `npm run perf:audit -- check
evidence/performance.json --stamp`:

| Check | Result |
| --- | --- |
| cycles | 1 x 317.4 = 317.4 of 3120 per sample per core (10 %), measured 317.4 per instance |
| stock benchmark | 317.4 vs DARK REV 242.38 (1.31x); the dearest stock effect is 330.94 |
| stress | 1 per core, eight tracks, 3 LFOs and 12 locked slots, 2 s, no clobber, no hang |

The stream's own counts on the ColdFire side (lost, refused) are not in this run: dsp_host has no channel. Read them on
the unit.

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

Four, from the emulator (27 November 2026; media/capture.json has the hashes and the steps): the fresh `ot_emu` on
twin5 (`7520dee5…`) with `quadraverb-0.1.0.mwrm` (`35faa1b5…`) installed by the session's `try`, then T5, FUNC+FX2, LEVEL
to QUADRAVERB, YES, FX2, A and F turned; each the emulated LCD read by the session's `png` step. That emulator runs no
DSP, so its CPU meter reads full: `guard:1000 cpu:100` came first, and nothing was heard. They show the chooser entry,
the page and the knob values, nothing of the programs. Earlier tries, for the record:

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
