# Send FX testing

Evidence tier: **emulator** for 0.1.0-experimental, build FX04, source sha256 in `modwerk.module.json` (sha256 over `build.json` then each `src/` file in name order, each as its path, a NUL, its bytes and a NUL). The chorus of an earlier build (`stereo-chorus`, same algorithm) was heard by the author on a unit (below); this build awaits that test.

## Build

- Stock: Analog Rytm MKII OS 1.74, the author's own file (sha256 `cb0f99d6…e123`). Not in this repository.
- elekloader at tag `core-ar2-v0.3`, core-ar2 0.3 built from its source, Debian bookworm `m68k-linux-gnu-gcc` 12.2.0 (amd64 container).
- `elekloader.sdk.build`, `lint` and `patch`, build FX04: send-fx 1 site (0x4010ee66, 6 bytes); lint: links as core 0.3 > send-fx 0.1. Image sha256 `b312cabf…dc0f`.
- `src/fx-tables.h` is generated (LFO rates, one-pole and all-pass coefficients, dial and icon points) by a short Python script from formulas; no stock data.

## Where the audio is (OS 1.74, read for this mod)

- The FX returns routine takes the output slot as its argument (d2), calls the PRE return mixer (0x4010eb92: delay and reverb, written to `0x80000030 + slot * 2048`, two words a frame on a 64-byte stride, 24-bit values in the low bits) and the POST one, and ends with `movel #32,%macsr` at 0x4010ee66, which the mod detours.
- The codec's receive buffer at 0x80007440 holds MAIN, the eight voices and AUDIO IN, 12 words a frame. Stock's FX sends read each voice's word from the table at 0x401ef480 and the voice's playing track from the bytes at 0x40291138; the mod reads the same tables.
- A probe build drew each word's peak on screen while a WAV played into a voice (`dtboot --ob-in`): the voice words carry it; the ring at 0x42ac6f30, which earlier notes give for the sends, stayed near zero in the emulator.

## Emulator (rytm-emu 3c4c42c, dtboot, 24-25 October 2026)

The emulator runs the stock firmware's code; it is not hardware evidence. Its analog voices are a rough model: BD, SD and RS/CP synthesize, the others are silent unless a WAV is played into them, and long sounds are cut.

| Check | Result |
| --- | --- |
| Stock (core only): FX, DELAY, DELAY, DELAY / AMP, AMP | The stock page each time: a second or third press does nothing |
| FX04: FX, DELAY, DELAY | FX page, 01 CHORUS, its eight controls and SND, LEV |
| FX04: FUNC + 2 / 3 turns of A | 02 FLANGER / 03 PHASER, each with its own controls |
| FX04: AMP, AMP, 30 turns of A | SEND page, the send 0 -> 90 |
| Each effect forced, BD send 127, a long snare WAV into the BD voice | The PRE return words carry the effect |
| Each effect forced, every send at 127 (stress), the pattern playing | Audio runs, the return carries the effect (chorus, flanger, phaser at 8 stages) |
| Earlier drafts under the same stress | Four Hermite taps a frame (flanger) and 12 phaser stages a side stopped all audio output; one channel of taps ran. The flanger now reads two taps for both sides, the phaser runs at a quarter level with no clamp per stage and at most 8 stages |
| LF01 (Loop Sync 0.3 + FX04): a loop in AUTO at 127 BPM; the long snare with BD's send at 127 | Beats 0.4718-0.4725 s apart; the PRE return carries the chorus |
| Test builds fed by a voice's digital (sample) layer instead of the codec input, the long snare as BD's sample | Renders of the snare dry and with each effect (one wet gain for all) given to the author |

Host test (the DSP compiled on a Mac with stub addresses): white noise in, each effect's left and right returns within a few dB of the input level; a 500 Hz square wave passes the chorus at its level.

## On the unit (author, 24 October 2026)

- Earlier build LC01 (Loop Sync + `stereo-chorus` SC02): the chorus page opened and its values moved (photo). No chorus was heard until a track's send was raised; then the author reported it "sounds really good", with nothing to compare it to.
- The author asked for pages that look like Elektron's newer effect pages, approved mockups of eleven effects in that layout, and chose to begin with CHORUS, FLANGER and PHASER in one slot.

## Not tested

- On a unit: the flanger, the phaser, this build's pages, levels against the delay and reverb returns, clicks while turning knobs, persistence across kit save, project save and reboot.
- CPU margin on a unit; rytm-emu's profiler does not sample code in the mod area.
- `fx:audit` (aliasing, clipping, DC, idle): the audit's harness is the Octatrack's, not the Rytm's.
- Running beside other Rytm mods (Loop Sync was built beside it, above).
