# Loop Sync testing

Evidence tier: **author-hardware** for 0.3.0-experimental, build LS24, source sha256 `4234e987c8dd9a3a95c1278b31c5966f30438c3718dbb4c6884cf2489abb4269` (sha256 over `build.json` then each `src/` file in name order, each as its path, a NUL, its bytes and a NUL). The author tested LS16 and LS17 on a unit (below); LS18 (the review fixes) LS19 (lengths, wider correction, settings per sample) was tried by the author (below); LS20 was tried by the author (below); LS21 was heard by the author on a unit (below), LS23 was tried (below), and LS24 was heard and kept (below).

## Build

- Stock: Analog Rytm MKII OS 1.74, the owner's own file (sha256 `cb0f99d6…e123`, as `src/engine/elektron/elemod.ts` expects). Not in this repository.
- elekloader at tag `core-ar2-v0.3`, core-ar2 0.3 built from its source, Debian bookworm `m68k-linux-gnu-gcc` 12.2.0 (amd64 container).
- `python -m elekloader.sdk.build`, `elekloader.lint` and `elekloader.patch`, build LS24: loop-sync `.run` 5,884 bytes, `.bss` 2,384 bytes (8,268 in all), 1 site (0x40121020, 10 bytes), storage: 32 32-bit project fields (`loop_sync_t0`..`loop_sync_t31`); lint: links as core 0.3 > loop-sync 0.3, RAM 15,464 of 131,072 bytes. Image sha256 `9ae76e84…2ac4`.

## Emulator (rytm-emu 3c4c42c, `dtboot`, 22 October 2026)

The emulator runs the stock firmware's code; it is not hardware evidence. Its analog voices are silent.

| Check | Result |
| --- | --- |
| Boot to the main screen with core 0.3 + loop-sync | OK (LS07). An earlier build (LS02) crashed at boot: C code expected pointer results in a0 while stock returns them in d0; fixed by declaring firmware routines as returning an integer. |
| Stock TUN turn on the SAMPLE page (no FUNC) | Changes TUN as stock (+2 after four turns of delta 6). |
| Stock FUNC + turn A on the SAMPLE page, without the mod's handler | Nothing changes and `param_set_apply_delta` / `param_set_value` are never reached (breakpoints). |
| FUNC + turn A with the mod | The box shows `SYNC 127.0` (the project tempo) after the first counts, `SYNC 136.0` after more turns up, `SYNC 121.0` after turns down. |
| Tempo follow (LS06, which still split the shift into TUN semitones and FIN steps) | SRC BPM 127.0, tempo changed 127.0 -> 129.0 with the DATA encoder: FIN read +17 and TUN 0, as computed then. |
| ev_enc encoder numbers | 0-7 for A-H on the Rytm (not 1-8 as elekloader's ADAPTING.md lists for the Digitakt). |

The integer `cents` routine was checked on the host against `1200 * log2` for every tempo and SRC BPM pair within the 1/4..4 range (2.2 million cases): worst error 1.1 cents.

## Audio in the emulator (LS09, 23 October 2026)

`dtboot --wav` records the output, sample playback included (the analog voices are silent). A 2.0 s one-bar loop made for the test (beats at 0, 0.5, 1.0, 1.5 s, 120 BPM) was loaded through GLOBAL > SAMPLES on track 1 with a trig on step 1, the project at 127.0 BPM; click onsets were measured on the main output.

| SRC BPM | Target | Measured | Notes |
| --- | --- | --- | --- |
| OFF | 0 cents | beats 0.500 s apart, a 0.389 s gap at each bar | the loop is cut every bar: out of time |
| 120.0 | 98.44 cents (beat 0.47244 s) | 98.47 cents (beat 0.47235 s) | in time |
| 126.5 / 124.0 / 113.5 / 133.0 | 6.8 / 41.4 / 194.8 / -79.9 cents | 7.1 / 42.2 / 195.7 / -80.3 cents | within 1 cent |

Before the correction (LS07/LS08) every shifted case played about 6 cents further from the original pitch than asked, the same each way, with either FIN steps or TUN fractions; LS09 subtracts 6.1 cents.

## Version 0.2 in the emulator (LS11, 23 October 2026)

Three loops made for the test on the card: `loop120` (2.0 s, one bar at 120 BPM), `loopB` (3.0 s), `loopC` (2.4 s, one bar at 100 BPM), loaded as slots 1-3. Track 1 in AUTO, trig on step 1 (slot 1) and step 9, project at 127.0 BPM.

| Check | Result |
| --- | --- |
| Sample slot table | 131 entries of 16 bytes at 0x41329e70 (stock code indexes it with `lsl #4`); +4 rate 48000, +8 frames: 96000, 144000 for the loaded slots |
| Effective array, track 1 | TUN 0x4000, FIN 0x4000, SMP 0x0200 (slot 2), STA 0, END 0x7800, as the page showed |
| Step 9 locked to slot 3 (loopC) | every beat 0.471-0.474 s apart over 20 bars (target 0.4724): both loops in time |
| Step 9 locked to slot 2 (loopB) | loopB's beats 0.628 s apart: AUTO reads 3.0 s as 2 bars at 160 BPM and slows it to 127 (0.5 x 160 / 127 = 0.630), its own shift, not loop120's |
| Mode box (LS11) | `AUTO` / `1BAR 120.0`, `4BAR 480.0`; LS11 still had a BPM/AJUST mode, replaced in LS14 |

The source and AUTO arithmetic was also run on the host: loop120 -> 1 bar 120 BPM, +97.9 cents played (target 98.4); loopC -> 1 bar 100 BPM, +413.5 (target 413.8); loop120 with END 60 -> half a bar.

## Version 0.2, LS14 (23 October 2026)

BPM/AJUST became a percentage correction on top of any mode (FUNC + FIN), mode steps need about 8 encoder counts (on the unit one millimetre of turn stepped through every mode), and the 6.1-cent correction of 0.1 was removed: measured on LS13, a shift added to the effective TUN plays as asked (loop120 in AUTO played 92.0 cents with the correction, for 98.44). Project at 127.0 BPM, beat target 0.4724 s:

| Case | Beat gaps |
| --- | --- |
| loop120, AUTO | 0.4725 (0.4718 at the bar) |
| loop120 with 0.1 s of silence added (2.1 s), AUTO alone | 0.452, 0.535 at the bar: out of time |
| the same, AUTO +5.1 % (box `AUTO +5.1%` over `1BAR 120.1`) | 0.4730 (0.4703 at the bar) |
| loop120 on step 1, step 9 locked to loopC (100 BPM), AUTO | 0.4721-0.4727 |

## Version 0.2, LS15 (23 October 2026)

Per-sample correction (project storage; first 127 fields of 9 bits, then, for Modwerk's 32-field limit, 31 fields of four signed bytes, LS16), the trailing-silence check and the SYNC mark. Four test loops on the card: loop120, loopC (100 BPM), loopP (loop120's beats over a soft bed to the end, then 0.08 s of digital silence: 2.08 s), loopT (loop120 plus 0.1 s of silence: 0.54 s of silence at the end, 26 %).

| Case | Result |
| --- | --- |
| loopP, AUTO, no correction | box `AUTO` / `1BAR 120.0` (115.4 without the check); beats 0.4724-0.4725 s (target 0.4724) |
| loopT +5.1 % on step 1, step 9 locked to loopC (0 %), AUTO | beats 0.4717-0.4730 s; each slot its own correction |
| SYNC mark | drawn at the bottom right on the SAMPLE page, the sample slot list and while playing |

Not checked: the project fields across SAVE PROJECT and a reboot.

## LS17: the glide (24 October 2026)

On the unit, the pitch stepped with each tempo click (author report on LS16). LS17 glides to a new shift on a tempo or correction change. A 440 Hz sine loop (2.0 s) in AUTO, tempo 127 -> 126 with the DATA encoder while playing, pitch tracked every 20 ms from zero crossings: LS16 jumped 13.5 cents within 20 ms; LS17 moved 97.9 -> 84.4 cents over about 140 ms (1.6, 4.6, 2.9, 1.7, 1.2 ... cents a step). Steady pitch identical.

## On a unit (author reports)

**LS17, 24 October 2026**: installed after LS16; the pitch now glides on tempo changes ("ça glisse bien maintenant"), the rest as LS16.

**LS16, 24 October 2026**, Analog Rytm MKII, OS 1.74, flashed with Elektron Transfer over USB, tested by stigmagit: loops follow the tempo in AUTO, with SMP locks, with the per-sample correction and with the trailing-silence check ("tout a l'air de fonctionner"). Listening only; persistence across saves and reboots not reported. Reported issue: the pitch steps with each tempo click instead of moving smoothly (fixed in LS17).

**Earlier builds, 23 October 2026:**

Analog Rytm MKII, OS 1.74 + LS09, tested by stigmagit: the loop follows the tempo ("ça marche"); it did not with a SMP parameter lock or a scene that changes the sample, which 0.1 could not follow. LS12 on the unit: mode steps were hard to land on (fixed in LS14); a loop not cut on the bar did not sit in time in AUTO (LS14 adds the percentage correction). LS14 is not tested on a unit yet.

## LS18: review fixes (24 October 2026)

- **STA/END locks.** The length now comes from the sound's own STA and END (live sound `+0x14`, before locks and the LFO); the effective SMP still picks the sample. loop120 in 1 BAR, step 9 locked to STA 52.50, 127 BPM: LS17 played that slice about 770 cents low (beats 0.735 s apart); LS18 plays it at the loop's speed (0.118 s to beat 3, then 0.4725, as the 0.875 s offset predicts).
- **SYNC mark** only on the SAMPLE page; **box digits** above 999 BPM shown as whole BPM up to 9999.
- **Thumbnail** in the signal-art style; records and control name (ADJUST) updated.

## Library release (24 October 2026)

The owner approved the first library release of 0.2.0-experimental on 24 October 2026, with this source (`6df71df6…f0bc`) tested in the emulator and earlier builds by ear on a unit.

- **Package:** `scripts/package-elemod-recipe.mjs` exports the source-only recipe as `sdk/imports/packages/loop-sync/loop-sync-0.2.0-experimental-os1.74.elemod`, compiled in Modwerk's pinned toolchain image (`m68k-elf` GCC 16.2.0, binutils 2.47, no network or firmware) with the shared SDK's copy of elekloader's `analog-rytm-mk2/store.h`. `.run` 5,868 bytes, `.bss` 2,188, one site and 32 storage fields, as in LS18. CI's `elemod-source` job compiles it again and requires the committed package to reproduce.
- **Not run:** this package is compiled by GCC 16.2, not the GCC 12.2 of LS18, so the released code is not byte-identical to the tested build and has not run in the emulator or on a unit. The browser build from a stock OS file and its storage lockfile round trip did not run here (no stock OS file on this computer). Rytm downloads stay off until the owner turns them on.

## LS19: lengths, correction and settings per sample (24 October 2026)

Reported by the author on LS18: a very fast loop could not be synced (AUTO showed `+12.7%` over `8BAR 162.6`): only 1, 2, 4 and 8 bars, and +-12.7 % does not bridge two of them. LS19 adds 1/4, 1/2, 3/4, 1.5, 3, 6, 12 and 16 bars, widens the correction to +-25 % in 0.2 % steps, and keeps the mode and the correction per sample (51 entries of 20 bits over 32 project fields). A sample without a setting followed the mode of the sound's own sample (LS21: its mode and correction).

rytm-emu, the four-loop card, project 127.0 BPM, onsets on the main output (target 0.4724 s for a 120 BPM beat):

| Check | Result |
| --- | --- |
| loop120 (slot 1) in AUTO | beats 0.4718-0.4725 s apart; box `AUTO` / `1BAR 120.0` |
| loop120 at 1.5 BAR, +1.0 % (48 FUNC + A counts, 10 FUNC + B counts) | 0.7157-0.7158 s apart, target 0.5 * 181.8 / 127 = 0.7157 s; box `+1.0%` / `1.5BAR 181.8` |
| 1/4 BAR (16 counts) | box `1/4BAR 30.0` |
| loopT (slot 4) in AUTO with +5.2 %, step 9 locked to loopC (100 BPM, no setting) | 0.4714-0.4733 s apart: the locked loop follows the sound's AUTO from its own length |
| Same, before the fallback to the sound's mode | the locked loop played unsynced (0.6001 s, its own 100 BPM): every locked loop needed its own setting, so the fallback was added at the author's request |
| AUTO choosing among all twelve lengths (first LS19 draft) | loopC, one bar of 100 BPM, read as 1.5 bars of 150 BPM (0.7089 s = 1.5 x 0.4724): AUTO now picks powers of two only |

Also seen: after choosing a sample in the SMP list and confirming with YES, FUNC + TUN does nothing until SMPL is pressed again (the page flag, as for any menu; documented).

## LS20: settings follow the sound's sample (24 October 2026)

Reported by the author on a unit with LS19: with SMP locks, FUNC + TUN and FIN switched from one loop to the other while the pattern played, and he could never set both. Cause (certain, from the code): LS19 set the sample playing at that moment (the effective SMP). LS20 sets the sample the sound loads; a locked loop follows it or keeps its own setting, given by loading it in the sound for a moment.

| Check (rytm-emu, 127 BPM, tail loop +5.2 % on the sound, step 9 locked to loopC with no setting, FUNC + 8 A counts during playback) | Result |
| --- | --- |
| LS19 | one gap 0.5000 s and one 0.4447-0.4454 s each bar: the turn landed on the locked loop |
| LS20 | 0.4714-0.4733 s: both loops in time |
| LS20, captures and the LS19 audio checks rerun | same PNGs byte for byte; tail + lock 0.4714-0.4733 s |

Before choosing, stock was checked for a third FUNC gesture: FUNC + SMP opens the sample list, FUNC + BR and FUNC + LEV jump the value (BR to 0, LEV to 127). None is free, so the mod takes none.

## LS21: locked loops take the sound's correction too (24 October 2026)

Reported by the author on a unit with LS20: SMP locks to another slot holding the same loop played at another speed than the main loop. Cause (probable, then reproduced): a locked sample with no setting took the sound's mode but kept its own correction, 0 %, while the main loop had one. LS21 gives it the sound's mode and correction; a sample with any setting of its own (a mode, or a correction) keeps it.

| Check (rytm-emu, 127 BPM, loopT on the sound in AUTO +5.2 %, step 9 locked to loopC with no setting) | Result |
| --- | --- |
| LS20 | locked loop 0.473 s apart: AUTO without the +5.2 % |
| LS21 | locked loop 0.4972 s apart = 0.4724 x 1.052: the sound's AUTO and +5.2 % (for a copy of the main loop this is the main loop's speed; loopC, cut on the bar, would want its own AUTO at 0 %) |
| LS21, FUNC + 8 A counts during playback | main loop 0.4714-0.4733 s, locked loop 0.4972 s: the turn set the sound's loop only |
| LS21 captures | same PNGs byte for byte as LS19 |

### On the unit (author, 24 October 2026)

Analog Rytm MKII, OS 1.74 + LS21, by ear: a pattern with SMP locks to other loops in other slots. At first a locked loop of another length did not sit in time (it took the main loop's mode and correction); once each such loop was given its own setting (loaded in the sound for a moment, FUNC + TUN/FIN), every loop played in time ("ça fonctionne"). A build that put such loops in AUTO by themselves (LS22) was made and checked in the emulator, and first set aside for the build he heard; LS24 brings it back (below). Persistence across SAVE PROJECT and a reboot, external MIDI clock and CPU with STA LFOs were not reported.

## LS23: no snap back past TUN's range (24 October 2026)

Reported by the author on a unit with LS21: lowering the tempo, the fast loop followed, then below about 128 BPM it went back to full speed. Cause (probable, then reproduced): `shift_for` returned no shift beyond a factor of 8 between tempo and source, so a loop read far too fast (a length too long for it) snapped back to its own speed; up to that point TUN's +-24 semitones had already held it at a factor of 4, out of time. LS23 caps the shift at 48 semitones and lets the TUN clamp hold the loop as slow (or as fast) as TUN goes.

| Check (rytm-emu, 127 BPM, loop120 set to 16 BAR: source 1920 BPM, a factor of 15) | Result |
| --- | --- |
| LS21 | beats 0.5000 s apart: the loop at its own speed |
| LS23 | one beat per bar, 1.89 s apart: held at -24 semitones (beat 2 would come at 2.0 s, after the pattern retriggers) |
| LS23, the LS21 checks (AUTO, 1.5 BAR +1.0 %, locked loop, FUNC + TUN during playback) | same gaps as LS21; captures the same byte for byte |

## LS24: other locked loops in AUTO, on top of LS23 (24 October 2026)

Reported by the author on a unit with LS23: the SMP-locked loop was far too fast and could not be set there. Cause (probable): flashing reboots the unit, which reloads the project as last saved, so the locked loops' settings made under LS21 were gone; without a setting, a locked loop of another length took the main loop's mode and correction, which asked for a shift beyond TUN's range, and LS23 now holds such a loop at TUN's limit (+24 semitones) where LS21 let it play at its own speed. FUNC + TUN sets the sound's loop only (LS20), so the locked loop could not be reached while it played. LS24 puts LS22's rule back on LS23: a locked sample without a setting takes the main loop's mode and correction only when it is a copy (as many frames), and AUTO at 0 % from its own length otherwise.

| Check (rytm-emu, LS24) | Result |
| --- | --- |
| loopT in AUTO +5.2 %, step 9 locked to loopC (another length, no setting) | 0.4714-0.4733 s: both in time |
| Same, FUNC + 8 A counts during playback | 0.4714-0.4733 s |
| loop120 in AUTO; at 1.5 BAR +1.0 % | 0.4724-0.4725 s; 0.7157-0.7158 s |
| loop120 at 16 BAR (a factor of 15) | held at -24 semitones, one beat per bar (1.89 s) |
| Captures | same PNGs byte for byte as LS19 |

On the unit, LS24, by ear (author, 24 October 2026): "c'est bon" for his pattern with SMP locks to loops in other slots and his fast loop with the tempo lowered below 128 BPM. Persistence across SAVE PROJECT and a reboot, external MIDI clock and CPU with STA LFOs were not reported separately.

## Screenshots

`media/sync-auto.png`, `media/sync-percent.png` and `media/sync-mark.png` come from build LS19 in rytm-emu (identical with LS20 to LS24) (all on the SAMPLE page); inputs, image and PNG hashes in `media/capture.json`.

## Not tested

- On the unit: persistence of the settings (SAVE PROJECT, reboot); the `FULL` box past 51 samples (not reached in the emulator either); external MIDI clock; CPU with LFOs on STA; scenes that change SMP; timing measured rather than heard.
- Running beside rytm2_mods' lfo-rnd (neighbouring audio-interrupt sites).
- Swing, track speed and pattern changes (the mod does not act on steps; it only follows the tempo word).
- Combination with other Rytm mods.
- Memory and CPU on hardware.
