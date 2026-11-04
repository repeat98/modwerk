# Tiempos testing

## Commands and exact revision

Source: `sdk/octabam/modules/tiempos/` on branch `tiempos`, on Modwerk `main` at `886098f5` (merged 30 October 2026). Packages built with m68k-elf-gcc 16.2.0 (Homebrew), the same compiler as the pinned `modwerk-source-tools` image, which rebuilt the 26 October package byte for byte.

```sh
# ColdFire package (ABI 4: the four core hooks, no site events, no stock-code sites)
python3 -B sdk/runtime/loader/build.py sdk/octabam/modules/tiempos/tiempos.c -o tiempos.mwrm
# Host tests and the package check (simulated OS memory, simulated 132 MHz timer, 60 ticks a second)
python3 -B sdk/octabam/modules/tiempos/verify.py
```

| Package | Source | Bytes | SHA-256 | Where it ran |
| --- | --- | --- | --- | --- |
| `225a0170…` | before the double press | 2,336 (2,156 code and data, 268 BSS, 33 relocations) | `225a0170382915f749315e26f4dbf97d4e0c4a047bf85bd347fb0e1bbe35d53e` | emulator 26 October; MKI 28 and 30 October |
| `0506a245…` | with the double press on a track key (current) | 2,444 (2,240 code and data, 272 BSS, 39 relocations) | `0506a24500c2aa175aede07bcf1cc1a4c5f215b23852b26518acad6ac9444aa7` | MKI 30 October (fourth trial, USB lifecycle, load trial) |

Hook words of `0506a245…`: `module_tick` 0x1ca, `module_draw` 0x2d0, `module_key` 0x6e6, `module_enc` 0x81e; none after the core four.

## Host results

16 of 16 pass on `0506a245…`, no compiler warnings (`-Werror`):

| Check | Result |
| --- | --- |
| Closed: the stock frame is left untouched | pass |
| CUE + MIDI opens and takes the MIDI press | pass |
| Measured speed of a 126 BPM sample in a 128 BPM project: 44100 × 128/126 frames a second, error under 0.2 % | pass |
| Playing track: filled number | pass |
| Active-track mark | pass |
| Loaded, stopped track whose trim starts at 10 s: outline | pass |
| Empty track: dotted number | pass |
| Empty track: `--:--` | pass |
| Last 30 seconds (trim from 30 s): the time flashes | pass |
| Tempo change to 132 BPM: new speed within 2 s | pass |
| Flex loop retriggered five times: times still shown | pass |
| PLAY reaches the unit | pass |
| SRC closes the screen and the unit redraws its page | pass |
| Track key T3 twice, 500 ms apart: both reach the unit, the screen stays | pass |
| T4, then T3 200 ms later: both reach the unit, the screen stays | pass |
| T3 twice within 250 ms: both reach the unit, the screen closes and the unit redraws | pass |

## Emulator results

Emulator evidence only: executed code paths, not timing, audio or hardware behaviour.

Setup, 26 October 2026: `ot_emu` from octabam `dcf93d3`, adapted by `scripts/octatrack-emulator/build.py`; MKI panel (the default); a development base built from the developer's own OS 1.40C file (`build_core.py --dsp-loader --site-events --cached-modules --dev`, base `6a44c813…`); a scratch card with one set and a 120 s, 44.1 kHz stereo test tone (5,292,000 frames) on track 1's Static slot 1, one trig on step 1; the package above installed over the emulated USB link with `npm run device -- serve --emulator` and `scripts/device-send.py`.

| What | Result |
| --- | --- |
| Install, trial and Keep of the package | accepted |
| Voice record of track 1 while playing (`mem:0x800049d8:168`) | +0x00 = 0xff (active); +0x28 = 0 and +0x2c = 5,292,000 (the trim region STORAGE.md §4 describes); +0x34 and +0x3c also 5,292,000; **+0x30 = 0**; +0x44 grows while it plays (0xb9af → 0xcdb9 over one read) |
| CUE + MIDI | opens the screen; the unit does not switch to MIDI tracks (the only declared UI claim, `key:CUE+MIDI`) |
| Screen, stopped and playing | track 1 outlined (stopped) or filled (playing), bar, time left and total; tracks 2-8 dotted with `--:--` |
| RIGHT, LEFT | the ELAPSED and TOTAL notices; the right column switches |
| SRC | closes; the PLAYBACK page is redrawn |
| CUE + MIDI again | closes |
| Removal | accepted; afterwards CUE + MIDI switches to MIDI tracks as on stock |
| Measured speed in the emulator | about 41,400 frames a second (module test value 0xa1a6), so a total of 2:07 for the 2:00 tone. The emulator's audio clock and its 132 MHz timer are not in the hardware's ratio, so this says nothing about a unit; the stopwatch check below decides it. |

### Three tracks at different original tempos

Same setup, a card with three mono 44.1 kHz test tones, each 64 bars of 4/4 (256 beats): `T100.WAV` 6,773,760 frames (153.6 s at 100 BPM) on track 1, `T120.WAV` 5,644,800 frames (128 s) on track 2, `T140.WAV` 4,838,400 frames (109.7 s) on track 3, each loaded through the stock browser (no `.ot` file: the firmware gives a tempo from the length, and TIMESTRETCH NORMAL), one trig on step 1 of each. Package `225a0170…` above.

Each original tempo was checked from the voices themselves: between two reads of `mem:0x800049d8:504` in one pattern cycle, the play positions (+0x44) advanced in the ratio 1.2000 : 1.0000 : 0.8572 at 120 BPM and again at 140 BPM, which is 100, 120 and 140 BPM against the project tempo. 64 bars last 128 s at 120 BPM and 109.7 s at 140 BPM, whatever the sample's own tempo, so all three tracks should show the same times; the sample lengths alone would say 2:33, 2:08 and 1:49.

| Project tempo | Expected total | Shown total (T1, T2, T3) | Expected time left at the read | Shown time left |
| --- | --- | --- | --- | --- |
| 120 BPM | 2:08 (128.0 s) | 2:07, 2:07, 2:07 | 2:07 | 2:07, 2:07, 2:07 |
| 140 BPM (raised with TEMPO and LEVEL while playing) | 1:49 (109.7 s) | 1:49, 1:49, 1:49 | 1:48 (T1: (6,773,760 − 99,393) / (44,100 × 140/100) = 108.1 s) | 1:47, 1:47, 1:48 |

Every figure is within one second of the expected value (the display truncates to whole seconds, and the emulator's clock is not the unit's). Reopened right after the tempo change, the totals already read 1:49, because Tiempos keeps measuring while closed. The one trig per pattern retriggers each track every 16 steps, so these runs show a few seconds of each sample, never a track running out; the last-30-seconds flash, a track reaching its end and minutes-long accuracy are not tested here. Captures, kept outside Git: the 120 BPM screen, the TEMPO popup, the 140 BPM screen right after reopening and later, and the ELAPSED column.

The draft first read the sample end at voice +0x30, which the emulator shows is 0 on a playing Static voice; it now reads the trim start (+0x28) and end (+0x2c) and measures time played and total from the trim start.

## Base on the unit

Hardware results below come from the developer's Octatrack MKI, OS 1.40C, running a Modwerk base built and installed from a local `npm run dev` checkout of this branch (owner, #953).

| What | Value |
| --- | --- |
| Unit | Octatrack MKI |
| OS the base was built from | 1.40C (developer's own `OCTATRACK_OS1.40C.bin`, SHA-256 `34695b60…99e1ad`, the file the site requires) |
| Checkout | branch `tiempos`, commit `976c6caf` (`npm run dev`, Vite 8.3.1, Node 24.22.1) |
| Base file | `Modwerk-octatrack-base-739c9d.bin`, 766,404 bytes, SHA-256 `739c9d4f…42259c89`, built in Chrome from the site's Setup page, 28 October 2026 |
| Base identity (as the unit reports it) | `24a0ed5729add7c3…` over USB (`npm run device -- status`), equal to `sdk/machines/octatrack/base-binding.json`; state normal, generation 0, no modules, no trial. A released base: it does not answer development requests (`mem`, `ui`, keys) |
| Installed | 28 October 2026, from the card (PROJECT → SYSTEM → OS UPGRADE). Reported by the developer: it starts, PROJECT shows MODWERK, the project loads and plays normally |

## First session on the MKI (28 October 2026, base `24a0ed57…`, reported by the developer unless marked read)

| What | Result |
| --- | --- |
| Base over USB | read: `OCTATRACK 1.40C`, base `24a0ed5729add7c3…`, normal, no modules |
| Trial of package `225a0170…` (`npm run device -- try … --seconds 1200`, not accepted) | read: running, UI ticks about 60 a second; ended after about 7.5 minutes with SIGINT, rolled back (generation 2, bare base) |
| CUE + MIDI, transport stopped | Tiempos opens; the unit does not switch to MIDI tracks (photo) |
| Rows with tracks 1-3 loaded (Static `T120.WAV`, Static `T120.WAV` trimmed 720,000-4,004,800, Flex `T100.WAV`), never played | all eight rows dotted with `--:--`; the active-track mark beside 2. Expected from the code: the voice's trim fields are filled only when a voice starts |
| PLAY | the sequencer stays on step 1, nothing sounds, with Tiempos open, closed, and after its rollback; with the USB session closed too. Not a Tiempos fault, cause not found; no project has played on this base on this unit |

Not tested: playback, the voice fields, LEFT/RIGHT, NO, timing, Flex.

The unit's own log (`npm run device -- do diaglog`, read after the trial), all in boot 1, so no power cycle since the install: at +431 s a `hot` incident, CPU 100 % with the transport stopped, tempo 120; then **stall record 1, reason 1 (DSP frames stopped) at UI tick 33,032**, about 550 s after the start. From the tick count at the first USB read, that is about 20:49, when the developer was in USB DISK MODE copying the test samples, before the Tiempos trial (about 20:57). The later five-minute records show 0-18 of 600 frames playing. The stall, not Tiempos, is the likely reason PLAY stays on step 1; whether USB DISK MODE caused it is not shown. After a power cycle (no USB DISK MODE since), PLAY runs the sequencer again (reported). The developer reports that this unit hangs after leaving USB DISK MODE; the developer reports it did so on the stock OS too, before the base. Also run by mistake that evening: `npm run device -- lifecycle`, which keeps and removes the base's test modules; the unit was left with no module (active identity `1030e7c9…`, the empty set).

## Second trial on the MKI (28 October 2026, 22:01, base `24a0ed57…`, package `225a0170…`, not accepted; reported by the developer)

After the power cycle, project `tiempos` at 120 BPM, trigs with condition 1ST on step 1 of tracks 1-3, a phone stopwatch started with PLAY.

| What | Expected | Reported |
| --- | --- | --- |
| Track 1, Static `T120.WAV`, whole | total 2:08 | matches ("cuadra"), plays and sounds |
| Track 2, Static `T120.WAV` trimmed 720,000-4,004,800 (74.5 s) | total 1:14 | matches |
| Track 3, Flex `T100.WAV`, timestretch | total 2:08 (2:33 without) | matches |
| Last 30 seconds | time left flashes inverted | flashes |
| RIGHT, LEFT | ELAPSED and TOTAL notices, right column switches | works |
| NO | closes; the page underneath comes back | closes, the normal page comes back |
| T1, T3 with the screen open | the active-track mark moves to that row | moves |
| Tempo raised to 140 BPM while playing | totals 1:49, 1:03, 1:49 within about 2 s | changes correctly |

Exact stopwatch figures at each track's end were not written down; "matches" is the developer's word. Not tested: minutes-long accuracy beyond one play of each sample, timestretch modes, Part changes and project reloads, a Keep and persistence across a power cycle, performance. The voice fields (+0x28, +0x2c, +0x44) were not read directly (released base, no `mem`): the totals of the whole, trimmed and Flex tracks are the indirect check.

## Third trial on the MKI (30 October 2026, 19:29-19:59, base `24a0ed57…`, package `225a0170…`, not accepted; reported by the developer, photos checked)

Project `tiempos`, samples as the developer later confirmed them: track 1 `T100.WAV`, track 2 `T120.WAV` **without** the trim this time (the trim was checked on 28 October), track 3 `T140.WAV`. Tiempos' own reading of track 1's speed agrees: 61,742 frames a second at 140 BPM (read over USB as the module's test value, 0xf12e), which is 44,100 × 140/100. The earlier sessions' notes named the samples differently (track 1 `T120.WAV`, track 3 Flex `T100.WAV`); the 28 October reading of 52,922 frames a second at 120 BPM (0xceba) is also 44,100 × 120/100, so track 1 most likely held `T100.WAV` then too. All three tones are 64 bars, so the expected totals are the same either way. The trial ended by its own timer and rolled back (read: generation 2, bare base). Photos are kept outside Git.

| What | Expected | Reported |
| --- | --- | --- |
| 120 BPM, all three tracks | total 2:08, all three end together | the three lasted the same and matched 2:08; stopwatch time not written down |
| 140 BPM, tempo set while stopped, then PLAY | totals 1:49 | 1:49 on all three (photo) |
| 140 BPM, stopwatch 0:24.28 (lap 0:24.25) | time left about 1:24-1:25, elapsed about 0:24-0:25 | 1:25 left and 0:24 ELAPSED on all three (photo). The stopwatch started 1-2 s after PLAY: at 0:00 the screen already showed 1:48 left (photo) |
| Last 30 seconds | flashes | tracks 2 and 3 inverted at stopwatch 1:22 (photo) |
| Track 1 retriggered by hand with a trig at about 0:48 | counts again from the start | 1:15 left at stopwatch 1:22 (photo), as expected from a restart about 34 s earlier |
| Track 3 (Flex, LOOP on) reaching its end | starts again | restarted by itself; what Tiempos showed at that moment was not noted |

At 0:24 the screen's elapsed time (0:24, left 1:25 of 1:49) trails the stopwatch-based estimate (0:25-0:26) by up to about a second; the start of the stopwatch is only known to 1-2 s, and the display truncates to whole seconds.

## Fourth trial on the MKI (30 October 2026, from 20:07, base `24a0ed57…`, package `0506a245…`, not accepted; reported by the developer, one photo)

| What | Expected | Reported |
| --- | --- | --- |
| STOP, tempo 140, PLAY | stock: playback resumes where it stopped until a trig restarts the track | as stock |
| T2 once, screen open | the track is selected, the screen stays | selected, the screen stays |
| T3 twice quickly | the screen closes; both presses reach the unit | Tiempos closes and stock's QUICK ASSIGN opens on track 3's Flex slot list (photo): the stock double press, which both presses reach. Kept on purpose (the developer's choice): no stock gesture changes |
| T1, about a second, T1 | the screen stays | stays |

Not reported in this trial: the totals at 140 BPM after PLAY.

## USB lifecycle on the MKI (30 October 2026, base `24a0ed57…`, package `0506a245…`)

| Step | Result |
| --- | --- |
| Install with Keep (`npm run device -- try … --seconds 10 --accept`) | read: 10 s trial, accepted; generation 5, active `0506a24500c2aa17…` |
| Power cycle (the developer) | read: the boot's log records the saved set restored with one module, `31282ae5` (Tiempos), 5 s after the start (`set a=1 [31282ae5]`); `status` then reports the bare base identity, as the base does after a restore until the next sync. Reported: the project plays and CUE + MIDI opens Tiempos |
| Undo (`npm run device -- remove … --accept`) | read: accepted, slot empty; generation 1, active `75b95b9e…` (the empty set) |

Not tested: a power cycle after the Undo, the site's guided sync, a set with other modules beside Tiempos.

## Load on the MKI (30 October 2026, the base's MODWERK > LOAD page, reported by the developer, one photo)

| Condition | Working now: CPU | Working now: tracks 1-4 | Working now: tracks 5-8 | DSP space used: tracks 1-4 / 5-8 |
| --- | --- | --- | --- | --- |
| Tiempos installed, closed, stopped | 45 % | 33 % | 42 % | 32 % / 37 % |
| Tiempos installed, just closed after being open, playing (photo) | 52 % | 33 % | 42 % | 32 % / 37 % |
| Tiempos removed, stopped | 45 % | 33 % | 42 % | 32 % / 37 % |
| Tiempos removed, playing | 53 % | 33 % | 42 % | 32 % / 37 % |
| No Tiempos, three tracks playing (peak) | 64 % | 33 % | 42 % | 32 % / 37 % |
| Tiempos in trial (`0506a245…`), three tracks playing, open for about a minute, read on LOAD just after closing | 62 % | 33 % | 42 % | 32 % / 37 % |

Closed, Tiempos adds no load the page shows. The base's five-minute record for the first minutes after the power cycle (Tiempos installed, including the boot and the set's restore) reads CPU 45.5 % mean, 94.9 % peak and a UI tick gap of 1,901 frames; the boot is the likely cause, not separated here. Open, it stays within the stock range: 62 % read just after closing against a 64 % peak without Tiempos, with three tracks playing (LOAD cannot be shown while Tiempos holds the screen). During that trial the base's tick count grew 60 per second without gaps and Tiempos measured T1 at 0xf12c–0xf136 frames per second, as on 30 October. The base's five-minute records agree: minutes 15–20 (no Tiempos, three tracks) CPU 51.3 % mean / 64.7 % peak, tick gap 69 frames, playing 261/600; minutes 20–25 (mostly the trial, Tiempos opened and closed) 51.1 % / 62.7 %, tick gap 63 frames, playing 228/600; tracks 1-4 and 5-8 unchanged at 32.7–32.8 % and 41.9 %. The trial rolled back by itself after 420 s (generation 3, active `75b95b9e…`); no new stall record. The 28 October records near 1.5 % CPU were taken while the DSPs were stalled and are no baseline.

## Hardware and audio quality

Tiempos makes no sound. On the MKI with the released base `24a0ed57…` (above): CUE + MIDI, LEFT, RIGHT, NO, track keys and the double press as described; totals, time left, the last-30-seconds flash, a hand retrigger, trimmed and Flex tracks and tempo changes against the stopwatch and the expected 64-bar times. The voice fields were not read directly (a released base answers no `mem` request): the totals are the indirect check.

Not tested: an MKII; timestretch modes other than NORMAL; Part changes and project reloads with the screen open; minutes-long accuracy beyond one play of each 64-bar sample; SRC, AMP, LFO, FX1, FX2, BANK and PATTERN closing the screen on a unit (emulator only); a set with other modules beside Tiempos.

## Stock flows

On the unit, with Tiempos installed: PLAY, STOP, TEMPO and track keys behave as stock with the screen open; a double press of a track key closes Tiempos and the unit opens its own QUICK ASSIGN, as on stock. In the emulator: CUE + MIDI switches to MIDI tracks on stock and opens Tiempos with it installed, and again after removal. Not compared on a unit: every other key while the screen is open.

## Performance and resources

Package `0506a245…`: 2,240 bytes of code and data, 272 bytes of BSS. No DSP code, no effect slot, no DSP memory; the DSP load and space on LOAD are the same with and without it (above). ColdFire load: no change the LOAD page or the base's five-minute records show, closed or open (above). Cycles per tick not measured: the released base has no `modwerk_cost` profile.

## OT UI capture evidence

Development captures from the emulator's display read over USB are kept outside Git. Captures for the module page still have to be made with `scripts/capture-module-ui.py` or from the unit's LCD (docs/MODULE_UI_CAPTURES.md).
