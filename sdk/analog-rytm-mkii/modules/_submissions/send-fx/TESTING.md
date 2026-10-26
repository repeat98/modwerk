# Send FX testing

Evidence tier: **emulator** for 0.1.0-experimental, build FX20 (LF17 with Loop Sync; LF16 is its source with diagnostic readouts), source sha256 in `modwerk.module.json` (sha256 over `build.json` then each `src/` file in name order, each as its path, a NUL, its bytes and a NUL). The chorus of an earlier build (`stereo-chorus`, same algorithm) was heard by the author on a unit (below); this build awaits that test.

## Build

- Stock: Analog Rytm MKII OS 1.74, the author's own file (sha256 `cb0f99d6…e123`). Not in this repository.
- elekloader at tag `core-ar2-v0.3`, core-ar2 0.3 built from its source, Debian bookworm `m68k-linux-gnu-gcc` 12.2.0 (amd64 container).
- `elekloader.sdk.build`, `lint` and `patch`, build FX20: send-fx 1 site (0x4010ee66, 6 bytes), sections .run 42,182 and .bss 66,708 bytes; lint: links as core 0.3 > send-fx 0.1, RAM 116,116 of 131,072 bytes. Image sha256 `a53e4332…734c`. LF17: core 0.3 + Loop Sync 0.3 + send-fx, the default lockfile, the same storage layout as LF11; lint: links as core 0.3 > loop-sync 0.3 > send-fx 0.1, RAM 124,388 of 131,072 bytes; image sha256 `3a4a5e1f…20a9`.
- `src/fx-tables.h` is generated (LFO rates, one-pole, all-pass and state-variable coefficients, comb periods, note divisions, dial and icon points) by short Python scripts from formulas; no stock data.
- The tempo: the word at 0x40287ffc (1/120 BPM), as Loop Sync reads it, verified in `filter-hz`'s 1.74 include.

## Where the audio is (OS 1.74, read for this mod)

- The FX returns routine takes the output slot as its argument (d2), calls the PRE return mixer (0x4010eb92: delay and reverb, written to `0x80000030 + slot * 2048`, two words a frame on a 64-byte stride, 24-bit values in the low bits) and the POST one, and ends with `movel #32,%macsr` at 0x4010ee66, which the mod detours.
- The codec's receive buffer at 0x80007440 holds MAIN, the eight voices and AUDIO IN, 12 words a frame. Stock's FX sends read each voice's word from the table at 0x401ef480 and the voice's playing track from the bytes at 0x40291138; the mod reads the same tables.
- A probe build drew each word's peak on screen while a WAV played into a voice (`dtboot --ob-in`): the voice words carry it; the ring at 0x42ac6f30, which earlier notes give for the sends, stayed near zero in the emulator.

## Emulator (rytm-emu 3c4c42c, dtboot, 24-25 October 2026)

**A trap of the harness.** dtboot runs in 10M-instruction chunks and drops a press or turn whose time is at or before the clock when a chunk starts. An event at an exact multiple of 10M is lost whenever the CPU is busy at that boundary (in an interrupt, not stopped): with FX05 the four NO presses of the boot plan were lost, the startup notices stayed up and the whole run was silent, which looked like a CPU overrun. Every plan from FX05 on puts its events 3M off the boundaries (`NO@4503M`, ...); the log then shows all 60 key events.

The emulator runs the stock firmware's code; it is not hardware evidence. Its analog voices are a rough model: BD, SD and RS/CP synthesize, the others are silent unless a WAV is played into them, and long sounds are cut.

| Check | Result |
| --- | --- |
| Stock (core only): FX, DELAY, DELAY, DELAY / AMP, AMP | The stock page each time: a second or third press does nothing |
| FX08: FX, DELAY, DELAY | FX page, 01 CHORUS, its eight controls and SND, LEV |
| FX08: FUNC + 2 to 19 turns of A (6 counts each) | 02 FLANGER to 15 FREQ WARPER, each with its own controls (media/, capture.json) |
| FX08: AMP, AMP, 30 turns of A | SEND page, the send 0 -> 90 |
| FX16: FX, DELAY, DELAY, then FUNC held | The SND box reads CPU 0 (no send). The meter times each block on DMA timer 0's counter (0xFC07000C, which core-ar2 starts free running) against the time since the block before |
| Each effect forced, BD send 127, a long snare WAV into the BD voice | The PRE return words carry the effect |
| Each effect forced, every send at 127 (stress), the pattern playing | Audio runs, the return carries the effect (chorus, flanger, phaser at 8 stages) |
| FX06, each of the eleven effects forced, every send at 127, the long snare pattern playing (test builds ST00-ST10) | All eleven: MAIN RMS 767 from 80 s on, as with no effect; the return words non-zero (L/R RMS 646 to 5940) |
| FX08 (effects 12-15: ST11-ST14), each of CHRONO PITCH, FILTER FOLDER, FILTERBANK and FREQ WARPER forced, every send at 127 | Audio runs: MAIN 767; returns 832, 3255, 1496, 1283 |
| FX08: FX, DELAY, DELAY, then encoder A pressed (PUSH_A) | The FX page stays (FX06: the stock DELAY page came back) |
| FX06, BITCRUSH at its costliest (SRR 0, DROP 127, FREZ 127, DEP 127), same stress | Audio runs; return 867/867 |
| LF03 and LF05 (Loop Sync 0.3 + FX06 / FX08): a loop in AUTO at 127 BPM; the long snare with BD's send at 127 | Beats 0.4718-0.4725 s apart (as LF01); the PRE return carries the chorus |
| Earlier drafts under the same stress | Four Hermite taps a frame (flanger) and 12 phaser stages a side stopped all audio output; one channel of taps ran. The flanger now reads two taps for both sides, the phaser runs at a quarter level with no clamp per stage and at most 8 stages |
| LF01 (Loop Sync 0.3 + FX04): a loop in AUTO at 127 BPM; the long snare with BD's send at 127 | Beats 0.4718-0.4725 s apart; the PRE return carries the chorus |
| Test builds fed by a voice's digital (sample) layer instead of the codec input, the long snare as BD's sample (LN00-LN10) | Renders of the snare dry and with each of the eleven effects (one wet gain for all) given to the author, and each return alone. A first set (FX05, mild defaults, the wet at 0.7 of the dry) the author found too faint, the comb insignificant (its return 0.90 correlated with the dry). FX06 follows the Tonverk manual's descriptions, with stronger defaults, the comb's loop without input attenuation, and a per-effect trim: every return within 1.4 dB of the chorus's; the renders mix the wet at the dry's level |

Host test (the DSP compiled on a Mac with stub addresses): a 1 kHz sine through FREQ WARPER at SHFT +1938 Hz comes out at 2937 Hz, at -500 Hz at 501 Hz (the first build took the other sideband: 937 Hz); CHRONO PITCH at +12 / -12 semitones turns it into 2005 / 497 Hz. white noise in, each effect's left and right returns within a few dB of the input level; a 500 Hz square wave passes the chorus at its level. A decaying noise burst every 0.5 s through all eleven at their defaults: no clipping but in BITCRUSH at 1 bit; BITCRUSH with OVER, BITS and SRR at 0 returns the input level (70.5 dB for 70.6). The first soft clip had a gain of 1.5 near zero, which would have made SAT DELAY's loop run away; it is now u - 4/27 u³, unity near zero.

### CPU (25 October 2026, FX17's source)

The FX page's meter (FUNC held) timed each block on DMA timer 0's counter against the time since the block before and kept the highest of about a second (since FX19 it shows the mean). Test builds force the effect, set track 1's send (one voice: BD) or every send (eight voices) at 127 and open the FX page; the meter's value is read from memory at the end of the run (`DTBOOT_PEEK`). Percent of the block, emulator:

| Effect | One voice, LF10's code | One voice, FX17 | Eight voices, FX17 |
| --- | --- | --- | --- |
| none (the input copied) | 1.8 | 1.1 | 1.3 |
| 01 CHORUS | 6.4 | 3.0 | 3.2 |
| 02 FLANGER | 7.4 | 5.4 | 5.5 |
| 03 PHASER | 5.7 | 3.1 | 3.2 |
| 04 WOW AND FLUTTER | 7.6 | 3.6 | 3.7 |
| 05 COMB FILTER | 4.9 | 2.7 | 2.8 |
| 06 BITCRUSH | 3.0 | 2.1 | 2.2 |
| 07 LOWPASS | 5.2 | 4.5 | 4.6 |
| 08 MULTIFILTER | 3.3 | 2.4 | 2.5 |
| 09 DIRT | 5.0 | 4.0 | 4.1 |
| 10 SAT DELAY | 4.7 | 3.6 | 3.7 |
| 11 STEREO DELAY | 4.0 | 2.7 | 2.9 |
| 12 CHRONO PITCH | 6.5 | 3.4 | 3.5 |
| 13 FILTER FOLDER | 5.5 | 4.7 | 4.8 |
| 14 FILTERBANK | 6.3 | 5.4 | 5.6 |
| 15 FREQ WARPER | 6.0 | 4.7 | 4.8 |

With eight voices, FX13's code read 5 % with no effect and 10 % for CHORUS. Where the time went (rytm-emu's profiler, which skips code outside its code window as published; a local change sampled the mod area too): a Hermite tap through a call, 48 instructions, two a frame; the output loop, about 40 instructions a frame; eight voices summed one at a time. FX17 inlines the taps, sums the voices and adds the return through the EMAC (gate.s), and runs five more effects at 24 kHz.

| Check | Result |
| --- | --- |
| Listen builds (the voices' sample layer as input, the long snare plan) of d736cdd3 and of FX17's source, each effect forced | FLANGER, FILTERBANK, SAT DELAY, STEREO DELAY and FREQ WARPER: the same return (correlation 1.000, the same level). The five moved to 24 kHz, against 48 kHz: CHORUS -1.1 dB, PHASER -1.4, WOW AND FLUTTER -0.1, COMB FILTER -1.2, CHRONO PITCH -0.3; their share above 6 kHz 0.5 to 2 dB lower (without the lift of the top: -0.5 to -2.6 dB). Renders before and after given to the author |
| LF11: a loop in AUTO at 127 BPM | Beats 0.4718-0.4725 s apart (as LF01), all 62 key events, no fault |

### Cache refills and the light blocks (26 October 2026, FX19's source)

On the author's unit the block took about twice what the emulator counts (LF11, busy project: FILTERBANK 8 % with one track sending, emulator 5.4). The caches are 8 KB of instructions and 8 KB of data, and stock's work between two blocks evicts the mod's code and data. A diagnostic build, LF13 (with FUNC held: the block's mean and peak, the whole audio interrupt from its first to its last instruction, test modes that skip parts of the block, small timing loops), on the author's busy project, CHRONO PITCH with one track sending, as the author photographed it:

| LF13 mode | Block, mean (%) | Whole interrupt (%) | Interface |
| --- | --- | --- | --- |
| the hook and the voice loop only (T4) | 0.8 | 77.4 | keeps up |
| the input only (T2) | 1.8 | 78.6 | keeps up |
| the input copied, no effect (T1) | 2.9 | 80.2 | keeps up |
| input and effect, no output (T5) | 5.9 | 83.8 | lags |
| no input (T3) | 6.4 | not read | lags |
| normal (T8) | 6.7 (peak 8.1) | 84.8 | lags |
| the effect twice, no output, each pass timed (T7) | first pass 5.9, second 3.2 | 87.5 | lags |
| the effect twice (T6) | 9.1 | about 87 | lags |

Without Loop Sync (LF13b, T4) the interrupt read 70.0 %: Loop Sync takes about 7 points of it (probable). The interface lags once the whole interrupt passes about 83 % (between 82.9 and 83.8), and stays behind a while after. The effect's second pass costs about half its first: half the block's time on the unit goes to cache refills. The timing loops put a cold 16-byte line at about 14 timer ticks. A model fitted on the seven timed modes: the unit's block, in tenths of a percent, ≈ 1.01 × the emulator's + 0.132 × the 16-byte lines the block touches (counted by a local rytm-emu change, `DTBOOT_LINES`); the whole interrupt grows by about 0.21 per line (stock's own lines refilled after ours).

FX19 makes every other block light: it keeps its input and gives back the return the block before worked out for it; the block after runs the effect on both inputs, the second time with the caches warm. Lines touched per block, the mean of the two (emulator): CHORUS 244 → 185, CHRONO PITCH 235 → 182, FILTERBANK 182 → 148. Renders of five effects through the listen builds, FX19's source against LF11's: the same return, 32 samples later (correlation 1.0000, no difference).

FX20 keeps that arithmetic and touches fewer lines: gate.s works the light blocks out (their input, the lift, the return) and times every block; what they touch sits in one line-aligned structure; a full block reuses its buffers instead of the return and input arrays on the stack, its voice loop only looks for a moving send, and its rare paths are out of the way. Lines touched per block, the mean of full and light (emulator, one voice):

| Effect | FX19 | FX20 |
| --- | --- | --- |
| none (the input copied) | 119.5 | 82.5 |
| 01 CHORUS | 185.2 | 146.1 |
| 12 CHRONO PITCH | 181.5 | 144.6 |
| 14 FILTERBANK | 148.0 | 113.0 |

The meter reads 0.1-0.2 % less. Renders through the listen builds against FX19's: the same return (lag 0, no difference) for five effects with one track sending (CHORUS, FLANGER, SAT DELAY, CHRONO PITCH, FILTERBANK), and for CHORUS and FILTERBANK with all eight sending (the EMAC input and the clamp).

## On the unit (author)

- 26 October 2026, LF16 (FX20's source with LF14's readouts), reported by the author: on the busy project, CHRONO PITCH with one track sending, no lag and the same sound. The readings are not reported. RELOAD KIT brings back the newer effects as saved. The levels work (the track's send, and LEV with FUNC + E); the author had not found LEV at first. In the emulator, LEV turned down while a snare rang took CHORUS's, CHRONO PITCH's and FILTERBANK's return to silence, the same to the sample with FX19 and FX20.
- 26 October 2026, LF14 (FX19's source with LF13's readouts of the block's mean, the whole interrupt and the tick, FUNC + H), reported by the author: on the busy project, CHRONO PITCH with one track sending, the block 5.7 % (LF13: 6.7) and the whole interrupt 82.9 % (LF13: 84.8), no lag; CHORUS on another pattern and kit, 5.7 % and 73.4 %. No difference heard from LF11.
- 26 October 2026, LF13 and LF13b (diagnostic builds, above), photographed by the author on the busy project.
- 25 October 2026 evening, LF11 on the busy project, reported by the author: the lag came back (FILTERBANK 8 % with one track sending, FREQ WARPER 8-9 %, the others about 8 %).
- 25 October 2026, LF11, the checks the reviewer asked for, reported by the author ("tout est ok"): with eight tracks sending, the CPU meter read 7 % (its busiest block); an effect other than the default and its settings, and the tracks' sends, kept through a kit save, power off and power on.
- 25 October 2026, LF11 (FX17's source): reported by the author: no more interface lag on his busy project ("plus de latence apparemment"), and the effects sound right ("les effets sont bien"). The meter's figure on the unit is not reported. Before, with LF10 (the meter, FX14's code: the delays, FILTERBANK's bands and FREQ WARPER at 24 kHz, the rest at 48 kHz), CHRONO PITCH read 12-13 % and BANK, PATTERN and the encoders lagged 2-5 s as soon as one track sent; with every send at 0, or with a test build whose effect only copied its input (LFBY), they did not.
- 25 October 2026, LF09 (build FX12): the effect and its controls are kept per kit: the author set kits 3 and 4 (bank B patterns 1-8 and 9-15) to different effects, saved, and they follow the pattern changes. Before (LF07, LF08) the effect was lost or shared by every kit: the kit fields were first kept in the project's +352 object, which is not a kit (they read back but were never saved, and landed in memory stock owns), then in a fixed working-kit address that does not follow a kit change. The kit is now found from the active kit's first sound (stock's accessor), 42 bytes in. Emulator, FX12: DIRT on kit 1 and saved, LOAD KIT 2 shows CHORUS, FLANGER on kit 2 and saved, LOAD KIT 1 shows DIRT; DIRT saved, power off, cold boot: DIRT; BD's send at 90, kit saved, power off, cold boot: 90.
- LF07 (build FX10): the page's points are written straight into the bitmap (stock's fillrect read for its layout: column-major 32-bit words), not through fillrect: 150 knob turns took 7,500 drawing calls in place of 79,000 (LF06); all sixteen pages captured pixel-identical to FX08's.
- 25 October 2026, LF06 (build FX09): the author had seen the screen lag behind the knobs with LF05; with LF06 it follows ("c'est mieux, plus de latence"). The FX page had been redrawn whole at every tick, some 500 drawing calls a frame; it is now redrawn only when what it shows changes, and at once when a knob turns (emulator, 150 knob turns: 86,000 drawing calls in place of 365,000; in the emulator the screen updated within 25-37 ms both before and after, as stock's page does).
- 25 October 2026, LF05 (Loop Sync + Send FX 01-15, build FX08): reported by the author: no latency, "the effects sound very good". A draft build before it (LF04) had seemed to lag on every effect; after reinstalling, LF05 did not. Not reported: the 8-voice CPU check and a kit save across a reboot.
- 25 October 2026, LF03 (Loop Sync + Send FX 01-11): the FX page and its values work; the author tried the effects and approved them, keeping WOW AND FLUTTER. Pressing an encoder's knob left the FX page: an encoder press is a key (0x70-0x77) and the mod took any other key as leaving; fixed in FX07 (checked in the emulator). Not reported: the 8-voice CPU check and a kit save across a reboot.

### 24 October 2026

- Earlier build LC01 (Loop Sync + `stereo-chorus` SC02): the chorus page opened and its values moved (photo). No chorus was heard until a track's send was raised; then the author reported it "sounds really good", with nothing to compare it to.
- The author asked for pages that look like Elektron's newer effect pages, approved mockups of eleven effects in that layout, and chose to begin with CHORUS, FLANGER and PHASER in one slot.

## Not tested

- On a unit: every effect but the chorus, this build's pages, levels against the delay and reverb returns, clicks while turning knobs, persistence across kit save, project save and reboot.
- The stock delay and reverb checked on their own while the mod's block runs (both use the EMAC; the block keeps stock's accumulators and mode).
- `fx:audit` (aliasing, clipping, DC, idle): the audit's harness is the Octatrack's, not the Rytm's.
- Running beside other Rytm mods (Loop Sync was built beside it, above).
- The delays against a tempo change while playing, and at tempos where a division is halved: not run (the tempo word is read each block).
- The block's share on a unit for each effect with the light blocks: only CHRONO PITCH and CHORUS were read (LF14), with one track sending; LF16's readings are not reported.
