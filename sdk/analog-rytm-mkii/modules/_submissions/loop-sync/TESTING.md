# Loop Sync testing

Evidence tier: **emulator** for 0.2.0-experimental, build LS18, source sha256 `6df71df64799781b66e0e266297e64a2b6ce18679fd98def305e2536d8d0f0bc` (sha256 over `build.json` then each `src/` file in name order, each as its path, a NUL, its bytes and a NUL). The author tested LS16 and LS17 on a unit (below); LS18, with the review fixes, awaits that test.

## Build

- Stock: Analog Rytm MKII OS 1.74, the owner's own file (sha256 `cb0f99d6…e123`, as `src/engine/elektron/elemod.ts` expects). Not in this repository.
- elekloader at tag `core-ar2-v0.3`, core-ar2 0.3 built from its source, Debian bookworm `m68k-linux-gnu-gcc` 12.2.0 (amd64 container).
- `python -m elekloader.sdk.build`, `elekloader.lint` and `elekloader.patch`, build LS18: loop-sync `.run` 5,224 bytes, `.bss` 2,188 bytes (7,412 in all), 1 site (0x40121020, 10 bytes), storage: one 3-bit sound field (`loop_sync_mode`) and 31 32-bit project fields (`loop_sync_p0`..`loop_sync_p30`); lint: links as core 0.3 > loop-sync 0.2, RAM 14,624 of 131,072 bytes.

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

## Screenshots

`media/sync-auto.png`, `media/sync-percent.png` and `media/sync-mark.png` come from build LS17 in rytm-emu (all on the SAMPLE page, unchanged by LS18); inputs, image and PNG hashes in `media/capture.json`.

## Not tested

- On the unit: persistence of the mode (kit save, reboot) and of the corrections (project save, reboot); scenes that change SMP; timing measured rather than heard.
- Running beside rytm2_mods' lfo-rnd (neighbouring audio-interrupt sites).
- Swing, track speed and pattern changes (the mod does not act on steps; it only follows the tempo word).
- Combination with other Rytm mods.
- Memory and CPU on hardware.
