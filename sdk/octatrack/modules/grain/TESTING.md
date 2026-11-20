# GRAIN testing

Grain 0.1.0-experimental · by A Force Truly Evil.

## Corrected POS and SPRY build, 20 November 2026

The USB package SHA-256 is `51f3abe9d750f53b372c953d44279e3b4f150807ddedba151f99f259a64ada68`. The historical MKI and emulator observations below predate this correction.

| Case | Method | Result |
| --- | --- | --- |
| Move POS from 101 to 102 on a four-minute, 44.1 kHz sample | Trigger one grain with SCAN and SPRY off and observe its first sample read. | Pass. The read advances from 189.375 s to 191.250 s. Before the fix it jumped to 1.032 s. POS 127 now reads 238.125 s. |
| Sweep position and scatter on long samples | `python3 -B test_grain.py` compares the position, scatter width and actual first read with 64-bit reference arithmetic. Seven lengths span one frame to 44,860,416 frames. | Pass. All 1,792 cases matched. The same test fails on the submitted engine. |
| Preserve the existing sound on short samples | The same command runs `verify.py`. | Pass. All 25 stereo and 3 mono comparisons and 3 reference renders matched, with zero skips. |
| Rebuild the native code and package | Regenerate with `generate.py` and run `generate.py --check` in the source-tools image (GCC 16.2). Build the Grain row with `octatrack-module-packages.py`, repeat with `--check --stock`, and compare with `module-dev-package.py`. | Pass. The two package builders produced identical files. The full catalogue USB rebuild stops separately on Tape Echo's standalone recipe. |

The package is 23,948 bytes on disk. The builder reports 22,692 bytes of loaded code and data plus 2,124 bytes of BSS (24,816 bytes combined). The engine uses existing Flex sample storage. GCC 16.2 with the flags from `generate.py`, `-fstack-usage` and `-fcallgraph-info=su` gives the following bounds for a single call into Grain. Each includes four extra bytes per function for the return address.

| Entry | Deepest chain inside Grain | Stack bound |
| --- | --- | --- |
| Audio render | `grain_render` (168), `gran_render` (420), `flex_page` (8). The sample reader installed by `flex_sample` is always `flex_page`. | 608 bytes |
| Waveform draw | `grain_draw` (208), `wave_area` (148), `vfill.part.0` (24). The page reader uses less stack. | 392 bytes |

These bounds cover Grain's own frames on those paths. Peak memory across overlapping callbacks, loader overhead and worst-case chip cycles remain unmeasured.

On clean commit `c4e9e72ab936`, `npm run test:procedure -- grain --package public/octatrack-modules/grain/0.1.0-experimental.mwrm` stopped at step 1 (`module:doctor`). Its host tests, package and compatibility checks passed. Steps 2 through 12 did not run. The release performance and qualification records and the author's board claim are outstanding. Library generation waits on qualification. No hardware result for this package is recorded here.

## What was tested on a unit (Octatrack MKI, OS 1.40C)
I installed Grain as a card set (`MODWERK0.SET`) on a Modwerk base built locally from the repository's sources
(USB Audio off variant), and played it:

- GRAIN appears in the machine list and plays a Flex sample; the sound was compared by ear with the engine it grew from.
- SRC page (waveform, POS line, live grains), SRC SETUP page (SHAP, DIR, PAN, MODE with the stock dials) and the third,
  full-screen page.
- POS in fine steps, speeding up with the turn; a pressed knob jumps by seven.
- Parameter changes with scenes and the crossfader, LFOs on the SRC knobs and parameter locks on trigs.
- Two Grain tracks at once (mono, and stereo with PAN) and three at once; a fourth and more were not tried. CPU read on the base's status screen: 44 % with no GRAIN;
  63–64 % with two tracks at DENS 64; 64–65 % with two stereo tracks at DENS 64; 67–68 % with two tracks at high
  density and PAN; 73–74 % with both tracks at the maximum of DENS and PAN. DSP and memory readings did not change.
- The base's frame guard (mw_frame_sheds) was read on the unit with a debug build of an earlier version: it stayed at 0 while two Grain tracks played, so no render was swapped for silence.
- Project and Part saves keep everything: the track is still GRAIN and every knob is as set after a power cycle (confirmed by the author on 0.4.x).
- Loading a sample from another folder through the sample pool keeps the track as Grain.

## What was tested only in an emulator (ot_emu, MKII mode; not hardware)
- A power cycle with the stock-faithful Part check, on a base **without** any knowledge of GRAIN: the track comes back
  as GRAIN with DIR and PAN unchanged. This is the check behind the "every Part byte must pass stock's own check" rule.
- The three pages, the SETUP dials (drawn by stock's own dial routine with the real value, checked at several values), scenes
  and the crossfader, track switching in full screen.
- The sound of the engine is checked on a computer: reference WAVs and stereo cases are byte-identical after every
  optimization.

## Not tested
- **An MKII unit.** Everything above on hardware is an MKI.
- The published Modwerk base (the unit ran a local build of the same sources).
- Install over USB (only the card set was used).
- Worst-case cycle counts: only the base's CPU meter was read, as above.
- Sample slices, reverse playback, recorder buffers as the source, and a sample replaced while the note plays (a normal
  Flex track also stops when its sample is replaced during play).
- A project used with the module removed (the Part check is designed to pass; not tried on a unit).

## Stock flows
GRAIN changes one stock flow: PLAYBACK pressed a third time (from SRC SETUP) opens the full-screen page instead of going
back to SRC. Pressing PLAYBACK again closes it. FUNC + PLAYBACK still opens SRC SETUP. Everything else is as stock.

## Edge cases

| Case | Why this change makes it a risk | How run | Result |
| --- | --- | --- | --- |
| Two or more Grain tracks at once, mono and stereo, with PAN | every track keeps its own grains, read position and page cache in one shared render | Two tracks on the author's MKI with the pattern running; CPU read on the base's status screen | pass (MKI, an earlier build of this source) |
| Three Grain tracks at once; a fourth, or eight | one track costs 10 to 15 points of the CPU meter and the base reserves 15 for it | Three Grain tracks playing at once on the MKI (the author, 0.4.x builds); a fourth and eight were not tried | pass for three (MKI); not run for a fourth and eight: the base refuses the next with CPU FULL, not tried on the unit |
| A Part and a project saved, then a power cycle | every value Grain stores in a Part must pass stock's own power-on check, with or without the module | Saved the project and the Parts on the MKI, switched off and on; in `ot_emu` a power cycle with the stock-faithful check on a base that knows nothing of Grain | pass (MKI by the author on 0.4.x; emulator on the GCC 13 build of the same source) |
| A project opened without the module, or on a unit without it | the track must read as Flex and no bank may be refused | Not run on a unit; the stored bytes were chosen to pass stock's check | not run: no unit run without the module |
| A sample picked from another folder through the sample pool | the pool opens from a Grain track and its file browser can hide the track from the machine | Picked samples from other folders on the MKI (the author, 0.4.x builds) and in `ot_emu`; the track stays Grain | pass (MKI, emulator) |
| Moving between Grain tracks and other pages while the full-screen page is open | the third press of PLAYBACK and the draw hook act on stock pages | On the MKI (the author, 0.4.x builds) and in `ot_emu`: other Grain tracks keep it open; AMP, LFO, FX pages and a non-Grain track leave it | pass (MKI, emulator) |
| Scenes, the crossfader and LFOs on the SRC knobs | POS and the other knobs are read from the track's live lane, where scenes and LFOs are applied | Moved the crossfader between scenes holding POS and others; LFOs on the SRC knobs, on the MKI | pass (MKI by the author) |
| Parameter locks on a trig | a locked POS takes a whole number; the fine eighths are for the knob | Locked knobs on trigs on the MKI (the author, 0.4.x builds) | pass (MKI) |
| A sample replaced while a note plays | the grains read the sample's own pages | The same on a Flex track: it stops until the next trig | pass: behaves as a Flex track does (MKI) |
| Pitch, pan and direction extremes, mono and stereo samples | the read paths are optimized for pitch 0 and for no pan | `verify.py` renders them with the optimized and the plain paths and compares the samples byte for byte: mono and stereo 16-bit, five read steps (pitch 0 and fractional steps, forwards and backwards), five settings with PAN 0 and 127, forwards, backwards and SYNC | pass (host) |
| 24-bit samples, slices, reverse playback and a recorder buffer as the source | the engine reads the top 16 bits of the sample pages; a recorder buffer's pages change while it records | Not run: the host gate uses 16-bit samples; the module reads the pages stock keeps, as AMIGA does | not run: the bit depth of the samples played on the MKI was not recorded |
| Installing over USB, replacing the module, removing it, Undo, a trial that expires | the loader and the machine list | Not run: the module was loaded as a card set only | not run: no USB session |
| An MKII unit | the keymap and the panel differ between the models | Not run | not run: no MKII at hand; the emulator was used in MKII mode, which is not hardware evidence |

An emulator result never counts as hardware evidence; every row says which it is.
