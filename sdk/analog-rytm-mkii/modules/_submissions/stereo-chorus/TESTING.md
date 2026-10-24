# Stereo Chorus testing

Evidence tier: **emulator** for 0.1.0-experimental, build SC04, source sha256 in `modwerk.module.json` (sha256 over `build.json` then each `src/` file in name order, each as its path, a NUL, its bytes and a NUL). An earlier build (SC02, inside LC01) was heard by the author on a unit (below); SC04 awaits that test.

## Build

- Stock: Analog Rytm MKII OS 1.74, the author's own file (sha256 `cb0f99d6…e123`). Not in this repository.
- elekloader at tag `core-ar2-v0.3`, core-ar2 0.3 built from its source, Debian bookworm `m68k-linux-gnu-gcc` 12.2.0 (amd64 container).
- `elekloader.sdk.build`, `lint` and `patch`, build SC04: stereo-chorus 1 site (0x4010ee66, 6 bytes); lint: links as core 0.3 > stereo-chorus 0.1. Image sha256 `e5ae75ae…2fbd`.

## Where the audio is (OS 1.74, read for this mod)

- The FX returns routine takes the output slot as its argument (d2), calls the PRE return mixer (0x4010eb92: delay and reverb, written to `0x80000030 + slot * 2048`, two words a frame on a 64-byte stride, 24-bit values in the low bits) and the POST one, and ends with `movel #32,%macsr` at 0x4010ee66, which the mod detours.
- The codec's receive buffer at 0x80007440 holds MAIN, the eight voices and AUDIO IN, 12 words a frame. Stock's FX sends read each voice's word from the table at 0x401ef480 and the voice's playing track from the bytes at 0x40291138; the mod reads the same tables.
- A probe build drew each word's peak on screen while a WAV played into a voice (`dtboot --ob-in`): the voice words carry it; the ring at 0x42ac6f30, which earlier notes give for the sends, stayed near zero in the emulator.

## Emulator (rytm-emu 3c4c42c, dtboot, 24 October 2026)

The emulator runs the stock firmware's code; it is not hardware evidence. Its analog voices are a rough model: BD, SD and RS/CP synthesize, the others are silent unless a WAV is played into them.

| Check | Result |
| --- | --- |
| Stock (core only): FX, DELAY, DELAY, DELAY | The DELAY page each time: a second or third press does nothing |
| Stock: AMP, AMP | The AMP page: a second press does nothing |
| Mod: FX, DELAY, DELAY, then 10 turns of encoder B | CHORUS page; SPD 40 -> 70 |
| Mod: DELAY a third time / REVERB key instead | Stock DELAY page / stock REVERB page |
| Mod: AMP, AMP, then 30 turns of encoder A | CHORUS SEND BD; CHO 0 -> 90 |
| Mod: AMP a third time / a pad (SD) while CHORUS SEND is up | Stock AMP page / CHORUS SEND SD, its own send (0) |
| Mod, BD send 127, a long snare WAV played into the BD voice, pattern playing | PRE return words carry the chorus (RMS 183 in the 16-bit capture); 0 with the probe build (no chorus) |
| Same with the WAV into BT and a long AMP decay | The emulator's voice model cut the snare within 100 ms, so its chorus could not be judged there |
| Test build reading a voice's digital (sample) layer instead of the codec input, the long snare as BD's sample, send 127 | Wet envelope follows the dry one over 1.6 s, best match 576 samples (12 ms = TIM 48) later; left and right differ (correlation 0.36); no clipped sample |

That test build is not this module: it only feeds the same DSP a signal the emulator renders faithfully. Its renders, dry and dry plus chorus at the same gain, were given to the author to listen to.

## On the unit (author, 24 October 2026, build LC01 = Loop Sync + this module's SC02 code)

- The CHORUS page opened and its values moved (photo). No chorus was heard at first: no track's CHO send had been raised (AMP, AMP). With a send raised, the author reports the chorus "sounds really good", with nothing to compare it to yet.
- The author found the first pages too far from stock's look: SC03 and SC04 draw them in stock's style (above).
- The author approved SC04's pages from the emulator captures ("c'est parfait"). SC04's audio code is SC02's: only the pages changed.

## Pages in stock's style (SC03, SC04)

| Check | Result |
| --- | --- |
| SC03: FX, DELAY, DELAY | The UI task hung on the first frame of the page: the dial's line loop never ended (its error term was updated before the second test). Keys stopped reaching the mods, which first looked like a lost key press. SC04 fixes the loop and bounds it at 16 steps |
| SC04: FX, DELAY, DELAY | CHORUS over the top bar, six dials with stock's labels, stock's top and bottom bars kept |
| SC04: then 10 turns of encoder B | SPD's label shows 70 while it turns, then SPD again |
| SC04: AMP, AMP, 30 turns of encoder A | One dial at A reading 90 |
| LC03 (Loop Sync + SC04): a loop in AUTO at 127 BPM; the long snare with BD's send at 127 | Beats 0.4718-0.4725 s apart; the PRE return carries the chorus |

## Not tested

- On a unit: sound, levels against the delay and reverb returns, clicks while turning knobs, the pages and their persistence across a kit save and reboot.
- CPU load on a unit; the figure in the README is a static count of the compiled loop. rytm-emu's profiler does not sample code in the mod area.
- `fx:audit` (aliasing, clipping, DC, idle): the audit's harness is the Octatrack's, not the Rytm's.
- Running beside other Rytm mods.
