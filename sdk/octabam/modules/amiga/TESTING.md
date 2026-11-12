# Amiga testing

Record what you ran, on which build and which unit, and what you saw. "Not tested" is a valid answer; never write a result you did not observe, and keep emulator runs apart from hardware ones.

Version 0.1.0-experimental. The unit is the owner's MKII on development twin `d8fae687` of the base (RAM-booted), 11 November 2026, driven over USB; every load was a RAM trial that was rolled back.

## Host

`python3 -B verify.py`: 56 checks pass. They cover the engine only:

- `amiga_crunch`: bypass at SRR 0 / BITS 16 / LED off, the word mask and rounding, full scale, the averaged hold at SRR 16 and 127, the same output when a buffer is split across calls, a garbage state, clamped controls, and the lowpass (flat at 800 Hz, about -3 dB at 3.3 kHz, about -12 dB at 6.6 kHz, stereo, full scale, silence).
- `amiga_stretch`, `amiga_blend` and `amiga_declick`, against a model reader: no restart and an untouched sample at speed 64 and pitch 0, a restart every cycle an octave up with the note keeping its length, half speed doubling it, speed 0 holding the first grain, looped notes wrapping, stock's own loop left alone, a cycle longer than the memory, and no step in the frames handed on where the restarts were.
- `amiga_rest` and `amiga_pass`: a note at its own speed and pitch rests through nearly all of it and still ends at its end; it never rests an octave up or at another speed; a note that is not stretched rests whatever its pitch.
- `amiga_stretch_rate` and `amiga_face`: at half RATE the note lasts twice as long, without a restart at its own pitch and with one every cycle an octave up; backwards at half speed it lasts twice as long too; a reader that turns round goes on from where it is, counted from the note's other end.
- `amiga_strt`, `amiga_frame` and `amiga_shift`: the STRT value for a frame and back, and PCH's pitch for a length.
- `amiga_core.s` is what `amiga.c` generates.

`python3 -B reference/compare_engine.py <amiga.c of commit c5543f12>`: 400 notes of random length, loop, pitch and controls that change while the note sounds, 5,234,566 frames, through the engine of commit c5543f12 (the first build played on a unit, which runs every step on every call) and through this one as `amiga_render` drives it. Every frame handed on and every restart is the same. It runs at full forward RATE; the RATE paths are newer than that build and have only the checks above.

## Emulator (not hardware)

`python3 -B bench.py --emulator <ot_emu> --main <the twin's MAIN image> --output <folder>` counts the instructions the engine's own functions execute per audio frame of a note of stereo noise, in ot_emu. It does not count stock's reader and START. On the unit the time did not follow these counts: a division and a multiply-accumulate cost far more than a move there. Read them for which path is dearer, not for time.

| One track | Mean instructions a frame | Worst |
| --- | --- | --- |
| Plain: SPD 64, SRR 0, BITS 16 | 300 | 381 |
| The defaults: 8 bits | 576 | 658 |
| SPD 32, 8 bits | 1,025 | 1,502 |
| An octave up at its own length, 8 bits | 1,531 | 2,563 |
| SRR 16 alone | 981 | 1,071 |
| LED alone | 2,165 | 2,258 |
| An octave up with SRR 16 and LED | 4,603 | 5,646 |
| An octave up, SPD 32, GRN 0, SRR 6, LED | 5,355 | 6,501 |

The machine was not run in the emulator: the virtual panel started this base without sound (both DSP modes failed to boot it) and the base refused the module's install there.

## On the unit

Seen on trials of package `e9730e24…`. The published package is `18cef8b2…`: the same source except that the page's controls are now filled by `modwerk_page_control()` (`modwerk_page.h`) instead of by hand, with the same values. The engine is identical, sample for sample (`reference/compare_engine.py`, 400 notes, 5,234,566 frames). The published package itself has not run on a unit.

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

`media/amiga-machine-list.png`, `media/amiga-src.png` and `media/amiga-src-setup.png` are the unit's own LCD, read over USB with the development session's `png` step on 11 November 2026 during a trial of package `e9730e24…` on twin `d8fae687` (MAIN image SHA-256 `2d628536…`): 128×64 at scale 2, not edited. The keys that led to each screen were not recorded as a plan. Hashes are in `media/capture.json`.

## Performance

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

