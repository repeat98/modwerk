# Tiempos testing

## Commands and exact revision

Source: `sdk/drafts/tiempos/` on branch `tiempos`, draft of 26 October 2026, on Modwerk `main` at `d2d517a8` (with #949's ColdFire checks for C runtime modules). Built in `modwerk-source-tools` image `sha256:aa3916ed6ae4…`.

```sh
# ColdFire package, in the pinned toolchain image (m68k-elf-gcc 16.2.0), with #949's late-combine and MCF54455 index checks
docker run --rm --network none -v "$PWD":/src:ro -v ~/.cache/tiempos-build:/out modwerk-source-tools \
  sh -c 'cd /src && python3 -B sdk/runtime/loader/build.py sdk/drafts/tiempos/tiempos.c -o /out/tiempos.mwrm --cross m68k-elf-'
#  -> module 31282ae5, 2156 bytes of code and data, 268 of bss, 33 relocations, 4 hooks, 0 stock-code sites
#     SHA-256 225a0170382915f749315e26f4dbf97d4e0c4a047bf85bd347fb0e1bbe35d53e

# Host tests (simulated OS memory, simulated 132 MHz timer, 60 ticks a second)
cc -Wall -Wextra -DDECK_HOST -I sdk/drafts/tiempos -I sdk/runtime/loader -o tiempos_host \
  sdk/drafts/tiempos/tiempos_host.c sdk/drafts/tiempos/tiempos.c -lm && ./tiempos_host OUT_DIR
```

## Host results

13 of 13 pass, no compiler warnings:

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

## Hardware and audio quality

Not tested. Tiempos makes no sound. To run on a unit, in this order:

1. Confirm the key codes: with Tiempos installed, CUE + MIDI opens it, LEFT and RIGHT switch the column, NO closes it, and SRC, AMP, LFO, FX1, FX2, BANK and PATTERN close it.
2. Read voice record + 0x44 twice, one second apart, while track 1 plays at its original tempo: it must grow by about 44,100.
3. Compare voice record + 0x28 and + 0x2c with the sample's trim start and end (frames), with and without a trim in the audio editor.
4. Play three long Static tracks at different tempos and compare each time left with a stopwatch over five minutes.
5. Change tempo, switch timestretch modes, retrigger a Flex loop, change Part and reload the project with the screen open and closed.

## Stock flows

Compared in the emulator with and without Tiempos (above): CUE + MIDI switches to MIDI tracks on stock and opens Tiempos with it installed. With the screen open, LEFT, RIGHT and NO act on the screen. Not compared: every other key while the screen is open, on a unit.

## Performance

Not measured. Closed, each tick reads three words and a byte per track; open, each composition clears and redraws the 1 KB frame pixel by pixel. To measure with the development base's profile (`modwerk_cost`), stopped and playing, open and closed.

## Resources

Unmeasured. Package: 2,156 bytes of code and data and 268 bytes of BSS (pinned toolchain build above). No DSP code, no effect slot, no DSP memory.

## Hardware

Not tested.

## OT UI capture evidence

Development captures from the emulator's display read over USB are kept outside Git. Captures for the module page still have to be made with `scripts/capture-module-ui.py` or from the unit's LCD (docs/MODULE_UI_CAPTURES.md).
