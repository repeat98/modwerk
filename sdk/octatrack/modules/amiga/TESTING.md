# Amiga testing

Record what you ran, on which build and which unit, and what you saw. "Not tested" is a valid answer; never write a result you did not observe, and keep emulator runs apart from hardware ones.

Version 0.2.0-experimental, package SHA-256 `6bb8e598b76e359bda78fb420abaa96926ff8e8f3265b78932ef4599755c9b67` (`npm run module:dev -- amiga --build-only`). On a unit only briefly so far, and that run ended with the unit off USB (below). Its changes against 0.1.0: every restart of the stretch crossfades out of the sample itself (the 2,048-frame memory per voice is gone), and a sliced note is stretched inside its slice. The unit results further down are 0.1.0's.

## Host

`python3 -B verify.py`: 72 checks pass. They cover the engine only:

- `amiga_crunch`: bypass at SRR 0 / BITS 16 / LED off, the word mask and rounding, full scale, the averaged hold at SRR 16 and 127, the same output when a buffer is split across calls, a garbage state, clamped controls, and the lowpass (flat at 800 Hz, about -3 dB at 3.3 kHz, about -12 dB at 6.6 kHz, stereo, full scale, silence). Unchanged from 0.1.0.
- `amiga_stretch`, `amiga_cross`, `amiga_seek` and `amiga_declick`, against a model reader: no restart and an untouched sample at speed 64 and pitch 0, a restart every cycle an octave up with the note keeping its length, half speed doubling it, speed 0 holding the first grain, looped notes wrapping, stock's own loop left alone, a long cycle two octaves up; no step in the frames handed on where the restarts were, whether the next grain lies behind the reader (slower, pitched up) or ahead of it (faster, a fourth down at its own length); and with a sample it cannot read, the step faded out instead.
- The crossfade itself: its first frame is the last grain's next one, read from the sample; it fades out in a straight line over half the frames the cycle read (at least 16), then the new grain plays untouched; a backward reader's last grain is read downwards; read through pages of 7 frames it is the same as in one run, both ways; past the sample's end the last grain is silence; 16- and 24-bit, mono and stereo big-endian pages read as their top 16 bits; a restart that cuts a crossfade short fades the step out and crosses from the newer grain.
- `amiga_rest` and `amiga_pass`: a note at its own speed and pitch rests through nearly all of it and still ends at its end; it never rests an octave up or at another speed; a note that is not stretched rests whatever its pitch.
- `amiga_stretch_rate` and `amiga_face`: at half RATE the note lasts twice as long, without a restart at its own pitch and with one every cycle an octave up; backwards at half speed it lasts twice as long too; a reader that turns round goes on from where it is, counted from the note's other end.
- `amiga_strt`, `amiga_frame` and `amiga_shift`: the STRT value for a frame and back, and PCH's pitch for a length.
- `amiga_core.s` is what `amiga.c` generates.

The glue is not in the host gate: where stock keeps the sample's pages and the idle state of a recorder buffer (`flex_page`, `flex_sample`), the slice moved for one START, and stock's reader position read as the last grain's next frame. Those need the unit.

### Against Amigo

`python3 -B reference/amigo_check.py <folder>` on the owner's Mac with Amigo 1.0.2 installed (Audio Unit, hosted as a black box), 13 November 2026: a 441 Hz sine stretched to twice its length, Amigo at LEN 200 % with linear interpolation, this engine at SPD 32 and 16 bits.

| Cycle | Fade width, Amigo | Fade width, Amiga | Above 6 kHz, Amigo | Above 6 kHz, Amiga |
| --- | --- | --- | --- | --- |
| CYL 0.2 / GRN 46 (625 samples) | 245 samples | 244 samples | -61.8 dB | -76.6 dB |
| CYL 0.8 / GRN 85 (1,902 samples) | 912 samples | 906 samples | -61.8 dB | -76.5 dB |

Both crossfade linearly over about half the cycle. Amigo's level above 6 kHz is its 8-bit word; Amigo only lengthens (LEN from 100 %), so it never has the next grain ahead of the reader.

A host model on the same day (the scratch scripts of this session, not committed): a 220 and 330 Hz tone pair through the engine with a linear repitch, 1.5 s, the energy above 6 kHz in the 2 ms around each restart. 0.1.0 left a median of -53 to -64 dB there and more than -60 dB at up to 46 of 48 restarts, worst when the next grain lay ahead (a fourth down at the same length, SPD 100); this version leaves a median of -82 to -90 dB and none above -60 dB, in every case tried. Without a readable sample (the fallback) it equals 0.1.0 ahead of the reader and is 9 to 15 dB worse behind it, where 0.1.0 faded from its memory.

## Emulator (not hardware)

`python3 -B bench.py --emulator <ot_emu> --main <a MAIN image the emulator boots> --output <folder>` counts the instructions the engine's own functions execute per audio frame of a note of stereo noise, in ot_emu (the macOS build of 14 October 2026 and the static-render twin's MAIN, 13 November 2026). It does not count stock's reader and START, nor the glue's page lookup. On the unit the time did not follow such counts in 0.1.0: a division and a multiply-accumulate cost far more than a move there. Read them for which path is dearer, not for time.

| One track | 0.2.0 mean | 0.2.0 worst | 0.1.0 mean | 0.1.0 worst |
| --- | --- | --- | --- | --- |
| Plain: SPD 64, SRR 0, BITS 16 | 124 | 200 | 300 | 381 |
| The defaults: 8 bits | 400 | 476 | 576 | 658 |
| SPD 32, 8 bits | 810 | 2,160 | 1,025 | 1,502 |
| An octave up at its own length, 8 bits | 1,327 | 2,456 | 1,531 | 2,563 |
| SRR 16 alone | 805 | 889 | 981 | 1,071 |
| LED alone | 1,995 | 2,982 | 2,165 | 2,258 |
| An octave up with SRR 16 and LED | 4,399 | 5,528 | 4,603 | 5,646 |
| An octave up, SPD 32, GRN 0, SRR 6, LED | 4,762 | 6,488 | 5,355 | 6,501 |

The last row is from a run of that case alone. In the run of all eight, one `amiga_crunch` call of 18 frames in that case counted 313,232 instructions (mean 6,695, worst 316,767); `amiga_crunch` is unchanged from 0.1.0 and the case alone never came near it, so it is read as something else the emulator ran inside the call, not the engine. The bench's first call of each function runs it twice to find its return, which is why SPD 32's worst frame holds a crossfade counted twice.

## On the unit (0.2.0-experimental)

The owner's MKII, 13 November 2026, a RAM-booted development twin `2d97f42d…` of the release base `4e9a87ea…` (the twin also carries the remote-key fix of #1110), driven over USB by the session; package `6bb8e598…` as a timed trial with no Keep; project LIVE/Dev17, bank B, pattern B01, Part 1 (its working copy equal to its saved one before the run); no other module installed in the trial.

- The machine list showed AMIGA below PICKUP; with the cursor on it, the SETUP knobs read LOOP, SLIC, LED, SRR, STR and BITS; YES assigned it to T1 (a STATIC track before).
- A double tap on T1 opened the Flex list (one with 60 ms between the taps did not); YES on the empty slot 1 opened the card browser, a bass loop (16-bit stereo, 367,649 frames) loaded into slot 1, and YES assigned it. The list stayed open until a second NO.
- SRC read PTCH, STRT, LEN, RATE, SPD, GRN, and the status line `8 BIT▸AMIGA`.
- One trig on T1 step 1, playing at the defaults: stock's voice record read sounding, slot 1's state and settings records at +4 and +8, the note from frame 0 to 367,649 at +40 and +44, the reader at +68. The frame guard read a longest frame of 73.8 % and 23.7 % of the CPU in the frame interrupt, none skipped (one reading).
- Four seconds of the main out recorded over USB Audio at the defaults: level steady throughout, no run of zeros, no repeated block.
- **At the end of that recording the unit left USB** (the trial's connection: "the unit is away", 231 s into the trial) and did not come back within 30 s and more. Not yet power-cycled; crash and stall records not yet read. 0.1.0 once did the same with a USB recording running (below). Whether the module, the recording or the twin causes it is not known.

Not yet tried with 0.2.0: the stretch with restarts (PTCH -5, SPD 100, PTCH +12), slices, a recorder buffer, RATE below 0, the load with eight tracks.

## On the unit (0.1.0-experimental)

What follows was seen with 0.1.0.


Seen on trials of package `e9730e24…`. The published package is `18cef8b2…`: the same source except that the page's controls are now filled by `modwerk_page_control()` (`modwerk_page.h`) instead of by hand, with the same values. The engine is identical, sample for sample (`reference/compare_engine.py`, 400 notes, 5,234,566 frames). The published package ran on the unit once, on 12 November 2026 (below).

- The machine list shows AMIGA; YES assigns it; SRC reads PTCH, STRT, LEN, RATE, SPD, GRN and SRC SETUP reads LOOP, SLIC, LED (a switch), SRR, STR (a three-position switch reading OFF, ON, PCH) and BITS. RATE reads -64 to +63 with stock's own words. The page's status line reads `8 BIT▸AMIGA`.
- Backwards with the stretch (RATE -64, PTCH +12, SPD 64, read from stock's voice record five times a second): the reader restarts every cycle at the frame asked for and runs down from it; the place moves through the sample at 43,000 to 47,000 frames a second, where an unstretched reader at that pitch runs at 88,000. So the note keeps its length backwards an octave up.
- The owner played it by ear over USB audio for about four minutes (one track, a drum loop; RATE both ways with the stretch on) and called it "great". No list of what was tried.
- Ending a trial with every Amiga track back on FLEX rolls back cleanly, every time. Ending one while a track still named the machine was refused as needs-recovery (once on this day, once on 10 November); putting the track on FLEX and running the session's `recover` restored the unit without a power cycle.
- A track left on Amiga across a power cycle came back as Amiga, with its knob settings, at the next install.

Seen on earlier builds of the day whose page and sample-pool code is this build's (the controls then read differently):

- A double tap on the track key opens the Flex list on an Amiga track; YES assigns the sample; the list stays open until NO. Whether a FLEX track's list closes on YES was not compared.
- PCH at half the note's speed: -12.0 semitones at 1.02 times the length (measured from a recording).
- A stretch to twice the length measured 2.00 times, to half 0.50 times, with the pitch unchanged.

Not tested on the unit:

- RATE crossing 0 while a note sounds; looped notes backwards; a note trigged with RATE below 0 at other speeds.
- RATE between 1 and 62 with the stretch (heard by the owner, not measured), and whether stock's RATE scale is the straight line the module assumes.
- Locks, LFOs and scenes on RATE, SPD and GRN.
- Whether LED, which sits in the byte stock uses for SETUP's LEN switch, changes how long notes last.
- A sliced track; LOOP's settings; STRT and LEN locks on an Amiga track.
- SRR, LED and BITS by ear on this build (their code is the first build's, sample for sample).
- Saving and reloading a project; the project opened without the module.
- A sequencer trig against a hand-played one: the owner heard a difference on an earlier build of the day; it was not looked into.

## Stock flows

Not tested beyond the above: with the module installed and no track on Amiga, eight FLEX tracks read the same frame-interrupt share and CPU as without it (65.1 % and about 81 % both ways, an earlier build of the day).

## Screens

The pages did not change in 0.2.0; the pictures are 0.1.0's.


`media/amiga-machine-list.png`, `media/amiga-src.png` and `media/amiga-src-setup.png` are the unit's own LCD, read over USB with the development session's `png` step on 11 November 2026 during a trial of package `e9730e24…` on twin `d8fae687` (MAIN image SHA-256 `2d628536…`): 128×64 at scale 2, not edited. The keys that led to each screen were not recorded as a plan. Hashes are in `media/capture.json`.

## Performance (0.1.0-experimental)

`evidence/performance.json` holds no number: `npm run perf:audit -- check` fails its three rows (no static bound and no event timed in cycles; no `cfmeter.py` capture under a MIDI flood; no flood). The record says what was measured in their place, which is what follows.


### On the unit

`guard` and `stats` over USB, five seconds of a pattern at 131 BPM with eight tracks playing loops on four trigs each, no USB recording, this build. The base's frame guard gives the frame interrupt 80 % and skips a machine track's render where it would overdraw (a dropout on that track).

| T1 beside seven FLEX tracks | Frame interrupt | Longest frame | CPU | T1's renders skipped |
| --- | --- | --- | --- | --- |
| FLEX (no Amiga track) | 63.7 % | 106.7 % | 76.1 % | none |
| Amiga at the defaults | 69.2 % | 110.8 % | 81.8 % | none |
| and PTCH +12 | 72.8 % | 118.5 % | 85.6 % | none |
| and SRR raised | 74.8 % | 115.6 % | 87.6 % | 6 of 233,632 |
| and LED on | 77.5 % | 127.6 % | 90.3 % | 0.3 % |
| Amiga on all eight tracks at the defaults | 79.2 % | 135.3 % | 86.0 % | 16.9 % of all eight |

One reading each; readings of the same state on the day differed by about half a point. The first Amiga track costs more than each further one (earlier builds of the day: about 4 points, then about 1 to 2 a track).

With a USB recording running as well, one Amiga track at PTCH +12 with SRR and LED on beside seven FLEX tracks froze the unit (it left USB until a power cycle; no crash or stall record). The same setting without the recording read 94 % CPU and played. The recording costs CPU on the unit itself, and the base's guard holds the frame interrupt, not the whole CPU.

Memory: 10,652 bytes of code and data and 67,308 of bss in the package, most of it the eight voices' frame memories (8 KB each). The loader allows a module 128 KiB.

### The published package on the unit

On the owner's MKII, 12 November 2026, a development twin (`513be133`, RAM-booted, with the 20-channel USB Audio) of the current base `4854b76c`, package SHA-256 `18cef8b2d5d9152fd12d85d8ca607821776587b6f5b87868f7984eec02373ff3` as published, in a trial that was not kept:

- T1 on Amiga, T2 to T8 muted. SRC read PTCH, STRT, LEN, RATE, SPD, GRN; SRC SETUP read LOOP, SLIC and LED as switches, SRR as a knob, STR as a switch and BITS as a knob, as on the earlier package (the unit's LCD, read over USB).
- The owner played it by hand for about four minutes, listening to the main out over USB Audio, and reported that it works.
- All eight tracks went back to FLEX, the trial rolled back, the inventory was empty and the unit's state normal.

Not measured in this run: frame interrupt and CPU. Not tried: Keep, removal and the items listed as not tested below.

### Keep, Undo, removal, reload

On the owner's MKII, development twin `d8fae687` (RAM-booted), 11 November 2026, package SHA-256 `e9730e24b83cf6f8865d30c8917b7a541e7f3c5155dbe6011e53757607cc5294` (`npm run module:dev -- amiga --build-only`), over the USB session:

- **Install and Keep** (`try`, accepted): the inventory lists Amiga; the loader reports 20 of 20 packets accepted, none rejected, no errors, no rollback.
- **Self-test** with it kept, transport stopped: passed, 1 of 1 modules intact, card set written (1 of 1).
- **Playing kept**, T1 on Amiga at the defaults beside seven FLEX tracks: frame interrupt 69.2 %, longest frame 112.1 %, no render skipped, CPU 81.9 %.
- **Removal while a track uses it**: refused (loader refusal 7, a track plays it); the unit stayed normal with the module in place.
- **Removal** with the track back on FLEX: accepted; the inventory is empty; the same pattern on FLEX then read 63.8 % and 75.8 % CPU, as before the install.
- **Undo**: every RAM trial of the day ended in a rollback (`try` without accept), clean whenever no track named the machine.
- **Without the module**: after a power cycle onto the flashed base, which does not have it, a track still marked as Amiga showed and played as a FLEX track; at the next install on the twin it was an Amiga track again with its settings.
- No crash or stall record was written during the run.

`npm run device:qualify` was not run: it needs a Part whose working copy equals its saved one, and this project's bank had none; it also exercises DSP effects, which this module has none of. Not tested: a kept Amiga through a power cycle (a set kept on a RAM-booted twin is not loaded by the flashed base, and nothing was flashed), a project saved with Amiga tracks and reloaded, Part and bank switches with Amiga tracks, and the module beside other installed modules.

