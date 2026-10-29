# Pipo Loop — test report

Everything below was observed in rytm-emu on the named build, except the Hardware section, which records what npp1993 reported from a unit.

- Source (0.1.0-experimental, on main 7ad765b0): `build.json` `1c7f575a…09d8`, `src/audio.s` `4cc9d5e4…78d6`,
  `src/pipo.c` `bd1e8dc2…a9d8`, `src/snap.c` `af812459…7bfb`, `src/marks.c` `d2994d5d…79a9`. Fingerprint (`sha256`
  of `sha256sum build.json src/audio.s src/pipo.c src/snap.c src/marks.c`): `1a344049…96b7` (`evidence.sourceSha256`).
- Stock OS 1.74: `.syx` `cb0f99d6…e123`, the owner's file.
- Core: elekloader core-ar2 0.3 (`core-ar2-0.3.elemod` `6b97dfb3…3e58`, as vendored) for every build below except PP14;
  PP14 takes core-ar2 0.7 (`core-ar2-0.7.elemod` `f1e9cb2c…d9c1`, as vendored), the core Modwerk's Rytm builds use since #987.
- Build PP13 (core-ar2 0.3 + Pipo Loop 0.1.0-experimental, `--version PP13`), from that source: `.syx`
  `ae15d8b52b4485e0216a4416dd809334b07cdfde0529ca69e8fcd9b59ca58147`.
- Build PP14 (core-ar2 0.7 + Pipo Loop 0.1.0-experimental, `--version PP14`), from the same source: `.syx`
  `94bb114986d71e23760cdfec3d0de1f055637c5417bd9b40a29febcbc474e2ac`. Linked by Modwerk's linker on the owner's stock 1.74;
  the same route with core 0.3 reproduces PP13 byte for byte. It boots to the main screen in rytm-emu `c5732f0`.
- Build PC11 (core-ar2 0.3 + Silent Pad+Trig 0.5.1 as on main + Pipo Loop 0.1.0, `--version PC11`): `.syx`
  `f6e59b8fca126ec3bbc173e5617e30ade67dfe430693bc936a2d2d0495adb5c5`.
- Diagnostic PD05 (PC11's code plus an on-screen readout, branch `diag/pipo-loop`; not for release): `.syx`
  `c0ea404ef4aac79334f1513a4a81953997a405f7811f45426bd6d484efc3ccb4`.
- Earlier builds: PP03 and PC01 (before the code review), PP05 and PC03 (after it), PP06 and PC04 (the
  three-position switch), PP07 and PC05 (zero snap on the sound), PP08 and PC06 (locks), PP09 and PC07 (exact turns), PP10, PC08 and PD02 (snap holds), PP11, PC09 and PD03 (code review), PP12, PC10 and PD04 (LOP's feel);
  each passed the battery below. PP10 to PP13 gave the same results as PP09 on every row of it.
- Emulator: rytm-emu `c5732f0`, headless `dtboot`, JIT on. A card image holds one generated sample,
  RAMP (24,000 frames, a straight rise from -26,000 to +26,000), loaded to the project and set on
  BD with LOP ON on the SAMPLE page (the setup in [media/capture.json](media/capture.json)). Audio is
  dtboot's `--wav` with `--every 20M` (longer report intervals keep only about a second of audio).
  Effective LOP is read from the track's effective parameter word (`DTBOOT_PEEK`).

## Emulator, 0.1.0 (2026-10-27)

Every row was run on PP09, except the MIDI row (PP03) and the switch rows (PP06, the same drawing code);
PP03, PP05, PP06 and PP07 gave the same results.

| Check | Stock 1.74 | PP09 |
| --- | --- | --- |
| LOP turned clockwise from ON | stays ON | reaches PIPO; the value text reads PIPO |
| LOP turned +4, -6, +4 detents from ON | — | ON, PIPO, ON, OFF, ON, PIPO |
| LOP's switch at OFF / ON / PIPO | two-way: knob left / right | three-way: knob left / middle / right, the same pictures as BD CLASSIC's WAV at 0 / 1 / 2 on stock |
| BD PLASTIC's TYP (another OFF/ON switch) | two-way | two-way, as stock |
| Ramp, LOP ON, one BD hit | sawtooth, period 24,000 frames, a 12,044 step at each wrap | identical |
| Ramp, LOP PIPO, one BD hit | (no PIPO) | triangle; turns every 23,935-23,937 frames; largest sample-to-sample step 5 (of 32,767) |
| PIPO at TUN +24 / about -24 | — | triangle, segments 5,952 frames (6,000 ideal) / 95,872 (96,000), largest step 5 |
| LOP turned ON to PIPO while BD sounds | — | saw until the knob reaches PIPO, then it plays on forward and turns at END; no early turn |
| P-lock: GRID RECORDING, trigs on steps 1 and 9, LOP locked to PIPO on step 1, PLAY | — | lock shows PIPO; effective LOP alternates PIPO (step 1) and ON (step 9); triangle from step 1, saw from step 9 |
| Retrig while playing backward (step 9 above) | — | restarts forward from STA |
| Scene: SCENE held, BD pad held, LOP turned | — | footer SCENE: 1, LOP locked to PIPO; toggling scene 1 in SCENE mode switches effective LOP between ON and PIPO |
| Two voices: BD and SD both RAMP, LOP PIPO, hit together | — | both channels ping-pong (BD clean; SD's channel also carries its analog snare) |
| MIDI CC 30 on channel 1: 0, 32, 63, 64, 85, 86, 127, 0, 1, 2 (PP03) | LOP = the CC value, unclamped | identical (so CC 2 gives PIPO) |
| PC07: ramp with LOP ON / PIPO | — | saw / triangle, as PP09 |

The turn needs one block of lookahead: with none (tested by setting it to 0), stock wraps the voice
to STA first and the saw comes back. The prototype looked two blocks ahead (turns 23,872 frames
apart); one block halves the early turn and stays click-free at every pitch above.

### Saving and stock compatibility

- PP09 with BD on LOP PIPO, power-off (`--power-off`; the firmware's handler saved the working state):
  the card then cold-booted on **stock 1.74** with effective LOP 2 (no clamp) and a BD hit played a
  **normal forward loop** (sawtooth, period 24,000, as ON).
- The same card cold-booted on PP09: LOP PIPO came back and BD ping-ponged.

### Captures

`media/lop-off.png`, `media/lop-on.png`, `media/lop-pipo.png`, `media/plock-pipo.png` and
`media/scene-pipo.png`: PP06 frames, plans in [media/capture.json](media/capture.json).

## Playhead on the SMPL WAVEFORM view (2026-10-27)

Pressing SMPL on the SAMPLE page opens SMPL WAVEFORM, which draws a playhead line. Stock 1.74's rules,
from its code: the page's tick takes the selected track's voice (track-to-voice table) and shows the line
only while that voice still belongs to the track and the voice's active flag (record + 40) is set; the
line's x is the voice's play position over the sample's length, across the whole sample (not STA to END),
refreshed on the page's tick. The active flag stays set while a looping voice runs, after the AMP envelope
has ended too, and clears when a one-shot voice (LOP OFF) reaches its end.

rytm-emu, stock 1.74 against PP06, ramp on BD with AMP DEC 3, frames 0.1 to 4 s after one hit: stock LOP ON
and PP06 LOP ON move the line identically (the same positions) and keep it moving after the envelope; LOP
OFF hides it at the sample's end; PP06 PIPO moves it forward to END, then back to STA, and so on (the
voice's direction byte, + 42, is 1 on the way back, as for stock's reverse play). Pipo Loop changes
nothing here: the line follows the voice's real position, so PIPO reads as expected.

## Zero snap: FUNC + STA / END (2026-10-27)

Test sample ZSIN (24,000 frames): a 141.7-frame sine of amplitude 20,000 with a phase offset (no crossing
at frame 0), silent from 9,000 to 11,000 and at a DC of 3 from 15,000 to 16,000; 296 crossings, computed
offline with the module's rule. ZS01 (the same main OS as PP07), SAMPLE page, SMP 2:

| Check | Result |
| --- | --- |
| FUNC + STA, 16 detents forward from 0 | STA stepped 54, 124, 195, 266, 337, 408, 479, 550 (frames): the first eight crossings, in order (the other detents fell to stock's encoder hysteresis) |
| then 8 detents back | 479, 408, 337 |
| FUNC + END back from the end | 23,930, 23,859, 23,788, 23,717: consecutive crossings |
| one detent at a time, settled for 1 s | the stored value's frame is the crossing exactly (16,278; 16,207) |
| FUNC + STA back from 16,335 across the DC run | 16,278, 16,207, 16,137 (glide values 16,138 and 16,136 seen), 16,066, then 15,000 (the edge of the DC run, next to -3,441), then 14,932, 14,861, ...: the near-zero DC is passed over |
| plain turn on STA | fine steps, as stock |
| FUNC + turn on STA with a trig held in GRID RECORDING | the lock moves in stock's fine steps (0, 0.12): lock editing takes stock's other branch, which the site does not touch |

Every value in between is stock's parameter glide on the effective value; the stored values sit on the
crossings. STA and END are 1/30,720 of the sample, so for samples up to 30,720 frames each crossing has an
exact value; past that the nearest value is taken, at most frames / 61,440 frames off: 0.8 frame at 1 s,
3.9 at 5 s, 7.8 at 10 s, 23 at 30 s, 47 at 60 s (48 kHz). Not tested: a sample over 30,720 frames, a
sample with no crossing at all (the code leaves the turn to stock), STA and END meeting.

### Next crossing, not the other half of the same one; locks (2026-10-27)

PP07 had a flaw: a point on a crossing sits on the sample of the pair nearer zero, and when that was the
pair's first sample the way the turn went, the next detent moved it one frame to the pair's other sample
(seen on ZSIN: 124 then 125, 195 then 196, 266 then 267). PP08 skips the pair under the point. The same
run, one detent at a time and settled: PP07 54, 124, 124, 125, 195, 196, 196, 266, 267; PP08 54, 124,
124, 195, 266, 337, 337, 408, 479 (a repeat is a detent stock's encoder hysteresis swallowed).

Locks (LK03, the same main OS as PP08), ZSIN on BD:

| Check | Result |
| --- | --- |
| GRID RECORDING, trig on step 1, held with FUNC, STA turned 4 to 14 detents, then played | the first detents make the lock at the sound's value, as stock; then the lock steps 54, 195, 266, 408, 479 (frames), each a crossing, in order (detents between fell to hysteresis) |
| LIVE RECORDING, FUNC + STA turned while it records | the sound's STA steps 54, 124, 195, 266 and the locks recorded on the steps play those frames, all crossings |
| plain turn with a trig held | stock's fine steps |

Stock edits a held trig's lock in one of two ways: through the view's lock editor when there is one
(0x4003a19c's call; not reached in these runs), or, without one, trig by trig through a callback that
reads each trig's lock (view vt + 112) and adds the turn (view vt + 120). Pipo Loop steps each trig's
lock from its own value at that callback (0x40037f6c), so several held trigs each go to their own next
crossing. The editor path is hooked the same way but was not exercised. LIVE RECORDING records the
sound edit, which the 0x4003a240 site already snaps.

## Sample-exact turns and fine offsets: findings (2026-10-27)

- **Sample-exact PIPO turns.** Stock's prefetch builds each block's loop wrap a block ahead: two
  8-frame-aligned eDMA segments (the loop's tail, then its start) into a 140-frame SRAM window that the
  resampler reads straight through. A turn exactly at END would need the second segment replaced by a
  reversed copy of the tail after the DMA lands and before the render reads it, in both of stock's
  prefetch routines (voice 0 inline, voices 1-7 in a loop), and the position, phase and direction put
  right the next block. That is several new sites inside the audio interrupt and DMA timing the emulator
  may not show as the unit does. Not built.
- **Exact zero snap past 30,720 frames.** Prototyped (FO01-FO03) and dropped at npp1993's choice (his
  precise loops are short); the 0.64 s limit stays. Found on the way: reading the kit's sounds from an
  `ev_project` handler broke the project load at boot in rytm-emu; reading them from `ev_tick` did not.
  The design: a per-sound fine offset: 16 bits a sound of
  core-ar2's sound storage (an 8-bit offset and an 8-bit tag of the STA or END value it belongs to, for
  each), saved with the sound and kit; added to the start and end frames where stock computes them (the
  returns of 0x4011bf44 at 0x4011c2a8 and 0x4011c850, both free), and only while the effective value
  still equals the tagged one, so locks, scenes and the LFO play stock's grid. Stock OS ignores the
  storage and plays the 1/30,720 grid. Not built.

## Exact turns and exact snap (2026-10-28)

**Exact turns (PP09).** Stock's prefetch copies each block's 140-frame window by DMA, a block ahead;
near the loop's end it copies the frames up to the end, then the loop's start, so the voice wraps at
the exact frame. For a voice in PIPO the module points that DMA's source at a buffer of the loop's
frames in reverse order (at the top: the segment after END; at the bottom, read backward: the main
segment), so the voice plays straight on into the way back; the block after, it moves the position
stock wrapped to the mirrored frame, 8 frames on (the play position runs 8 frames ahead of the frames
heard, at every pitch tried), and turns the voice round. rytm-emu, ramp on BD: period 48,000 frames
for a 24,000-frame loop, turns symmetric to within a few units; TUN +24 period 6,000, about -24
95,965 (96,000 ideal); with END inside the sample every turn's largest step is 1; with END on the
sample's last frame the first turn after a hit can be up to 7 frames off (no room past the end).
SD (voices 1-7 routine) ping-pongs too. Not provable in the emulator: the data cache (the module
pushes its buffer's lines; rytm-emu models no cache) and the unit's DMA timing.

**Snap on stock's own frame.** Stock maps STA and END to frames with an EMAC multiply by 8/15 that
works out to ceil(frames * value / 30720) for every value up to 30,720 frames (checked by working the
instructions through for 400,000 cases); the module had assumed the floor, so snapped points played
one frame after the crossing. PP09 uses stock's mapping and lands on the first sample of the new sign:
on ZSIN, sound and locks alike play from crossings exactly (sound: #3-#6; locks: #1, #4, #5). One
crossing a detent: core-ar2's ev_enc counts the encoder (8 counts a detent); four 2-count events step
one crossing, as one 8-count event does. With LOP ON, END stepped from 23,647 down by whole periods
(rising crossings only), matching STA's rising crossing.

## Zero snap holds; shared crossings and edges (2026-10-28)

With FUNC held a turn on STA or END only ever lands on a crossing: where none is left the way it
goes, the point holds (PD01 had passed such a turn to stock, which stepped off the crossings). STA
and END may pass each other and may share a crossing (npp1993's rule). rytm-emu, PP10, ZSIN on BD
(24,000 frames, not at zero at its first or last frame), settled values as frames, `d`/`u` the
crossing's direction:

- STA, LOP ON, END at 120: right 54d 125u 196d 267u 337d, left back to 54d, then held at 54 for the
  remaining detents (frame 0 is not at zero, so it is no crossing).
- END: left 23931u 23860d 23789u 23718d 23647u, right back to 23931u, then held (the sample's end is
  not at zero).
- END at 0, STA on 196d, LOP ON: END right 54d 196d 337d 479d …: only falling crossings (STA's
  direction), onto STA's own crossing, then past it.
- A trig's lock (GRID RECORDING, sound STA = END = 196d, LOP ON): the lock's STA left to 54d and held
  there; right from 54d to 196d (END's crossing), 337d, 479d, 621d.
- A loop of no length (STA = END = 196) with LOP ON and with PIPO, BD hit twice: plays without a fault
  for the whole run; the voice stays parked around frame 196, LOP ON and PIPO alike (PIPO leaves
  loops under 160 frames to stock).

Stock glides STA and END to a new value rather than jumping: PP10, effective STA read every 1M
instructions during a FUNC turn from 0 to ZSIN's first crossing went 0x00, 0x02, 0x0f, 0x1a, 0x22, …
0x41, 0x42, 0x43 and settled on 0x44 about 30M instructions later (the same on the next step, 0x47
… 0x9f). A wrap or PIPO turn inside that glide plays from a point between crossings, which matches
npp1993's report of clicks only while turning (PD01/PD02 era, PIPO_110). Nathaniel chose to keep
stock's glide (2026-10-28).

The emulator drops the first two to four encoder events after FUNC goes down or the turn changes
direction (stock's encoder smoothing in rytm-emu), so the step counts above are not one a turn.

PD02's counters (rytm-emu, ZSIN on BD in PIPO, STA 0 and END 120, after one hit): PIPO turns 4,
mirrored segments 16, unmirrored turns 0 500M instructions after the hit; 17, 68 and 0 after 1,800M.
Counting idle voices too had shown thousands of unmirrored "turns": before its first trig a voice
reads stock's silence buffer and its position wanders, so PD02 counts playing voices only.

## Hardware

### PC03 on an Analog Rytm MKII (2026-10-27), as reported

npp1993 flashed PC03 (`f128beb4…1e2a`; core-ar2 0.3, Silent Pad+Trig 0.5.1, Pipo Loop 0.1.0) and reported:

- LOP displays the three values OFF, ON and PIPO, but the switch graphic is only two-way: PIPO draws like ON.
- Zero crossing does not work. (Not part of this module: stock never snaps STA, END or the loop to a zero
  crossing, and Zero Snap is planned as a separate module.)
- The playhead in the sample player keeps moving after the envelope finishes.

Not yet reported: clicks at the turns, several voices, p-locks, scenes, kit save and reload, power cycle.

Follow-up in rytm-emu (PP05 against stock 1.74, BD with AMP DEC 3, LOP ON, one hit): the sample voice's
play position (voice 0, sampled every 23M instructions) runs through the same values on both, looping
on long after the amp envelope has ended. With LOP OFF it stops at the sample's end. With PIPO it keeps
bouncing for as long as stock keeps an ON loop running. The voice keeps playing silently behind the amp
envelope on stock too, so this is stock behaviour, not something the module adds. (rytm-emu's mixed
output does not apply the AMP envelope to the sample layer, so audio could not show the silence.)
Which screen shows the playhead was not identified.

The switch icon is drawn from a two-frame sprite (17 x 9 pixels; OFF, ON) shared by twelve OFF/ON
parameters; stock clamps any value above 1 to the last frame, so PIPO drew as ON. npp1993 chose LOP to
look like BD CLASSIC's WAV switch: PP06 draws LOP, and only LOP, through the routine and frames stock
uses for that WAV (three positions), so the module carries no picture of its own.

### PD01 on an Analog Rytm MKII (2026-10-28), as reported

npp1993 flashed PD01 (`6ba6b5cc…9134`; PC07's code with one crossing an encoder event, plus a readout
of encoder counts, events, crossings moved and the last snapped frame while FUNC is held), loaded the
test samples PIPO_SLOW, PIPO_110 and PIPO_SQR and reported:

- A, detents: a slow detent gave one tick. FUNC + STA snapped onto PIPO_SLOW's zero crossings well.
  FUNC + END near the sample's end sat near two crossings but not exactly on them. Readouts (counts,
  events, crossings, frame), END turned left one slow detent at a time: -104 711 1 22340; -107 714 1
  22340; -108 715 1 22340; -110 717 1 22340; one fast flick: -170 721 1 22340; another: -303 731 -4
  10820. Frame 22340 is one before PIPO_SLOW's crossing at 22341: a backward snap took the last
  quiet sample, not the first signed one, and the next left turn found the same crossing again.
  Fixed after PD01 (the backward snap lands on the first signed sample, as the forward one does).
- B, line against frame: the STA and END lines on SMPL WAVEFORM sat about one column off at times.
  At the left edge, FUNC + turn left moved STA off the crossing; STA and END moved toward each other
  on neighbouring crossings went off the crossings. Both were the module passing a turn with no
  crossing to stock's whole-number step; fixed (see above). The line is stock's drawing: the module
  never draws it, and one column covers about 225 frames of a 0.6 s sample, so a line on a crossing
  can sit a column off; the frame readout is what plays.
- Later on PD01 (PIPO_110): plain points with LOP ON click; FUNC-snapped points with LOP ON are clean;
  holding FUNC and turning STA while the loop plays gives occasional clicks, clean once it lands;
  PIPO, once settled, gives a muffled knock at the turns, not a discontinuity.
- C, clicks (PIPO_110): LOP ON with STA and END not snapped clicked on every pass; snapped, LOP ON
  was clean; PIPO gave a soft knock at the turns. At a turn the waveform's slope reverses, which no
  choice of frame avoids on a pure tone, so this is expected (README).

## PD05 on an Analog Rytm MKII (2026-10-28), as reported

npp1993 flashed the build with the S and E labels (PD05/PC11 code) and reported: the labels look
great; STA and END can sit on top of each other and change places (END before STA), with both labels
showing; the loop plays; a lock set with FUNC + turn while a trig is held lands on a crossing and shows
its position when that trig is held again; "I think that's everything good". PD05 is PC11's code plus
the readout; PC11 and PP13 themselves were not flashed.

## PP14 on an Analog Rytm MKII (2026-10-29), as reported

npp1993 flashed PP14 (Pipo Loop 0.1.0 alone on core-ar2 0.7, `94bb1149…e2ac`) on an Analog Rytm MKII with stock OS 1.74
and reported, in order:

- PIPO turns on a looping sample: "fine"; the LOP switch works; moving the sample markers, zero crossing
  works fine.
- A kit saved with PIPO on and reloaded: seemed to work fine.
- A power cycle: the OS came up and booted fine. "I think we're all good."
- Stock 1.74 restored over USB (`cb0f99d6…e123`) and the PIPO kit loaded: LOP reads ERROR on the SAMPLE page,
  also after the kit reloaded; turning the knob steps between OFF and ON; no crash. The sound still loops
  ("it seems to treat the error value as loop. So it still functions").

Not itemized: no listening notes beyond "fine" for the PIPO turns, no duration, no sample length, no
firmware read-back. Several voices, LOP locks and scenes and MIDI CC 30 were not run.

## PD04 report; S and E labels (2026-10-28)

**PD04 on an Analog Rytm MKII, as reported by npp1993.** FUNC + STA/END feels better. A very slow
turn registers no change, the same as LOP with or without FUNC (stock). Once the marker skipped
between two non-adjacent crossings and would not land on the one between; not reproduced. With LOP
ON every other crossing is skipped by design (same direction as the other point); otherwise a
moderately quick turn, for which LOP's profile gives two values, stepped two crossings. Fixed after
PD04: up to two values step one crossing, past that one fewer than the values.

**Labels (PM01 test build, then PP13, PC11 and PD05).** npp1993 approved the look from the emulator screenshots ("looking great"). Stock's waveform widget (draw routine 0x4006cb16, only
caller 0x400d211c) keeps the lines' columns at +4 and +8 (value x 123 / 30720, from x0 = 2), draws
them dotted from y0 + 1 to y0 + height - 2 (y0 16, height 32) and draws the waveform over 124
columns, which is why a line can sit a column left of its crossing. As the routine ends (site
0x4006ce72) the module draws a boxed S at the bottom of STA's line and a boxed E at the top of
END's: a 3 x 5 letter, a black pixel round it, a white box round that (7 x 9), kept on screen at the
edges. rytm-emu, PIPO_SLOW: points at the sample's ends, mid-sample, sharing a column (stock draws
one line; both labels show), END before STA, and playing (the playhead runs under the labels). PP13:
the full battery as PP12, the labels and snap as PM01; PC11's quick check as PC10.

## FUNC turns step like LOP (2026-10-28)

**PD03 on an Analog Rytm MKII, as reported by npp1993.** Test E passed: STA held at PIPO_SLOW's first
crossing and END at its last; they passed each other and landed on the same crossing. With LOP ON,
plain points clicked and snapped points were clean. Test F: during untouched PIPO playback the
unmirrored counter stayed at 1 (it had reached 1 earlier, while points were being moved). A very
slow FUNC + STA turn did not step: readout -337 1077 -67 22341 / 260 931 1 before, -335 1079 -67
22341 / 260 931 1 after, so two 1-count encoder events arrived and no crossing went by.

**Cause.** Stock's encoder handler turns an event's counts into a value delta with its encoder
engine (0x4006efca, 0x4006f1fa), using the parameter's encoder profile (a pointer at its record +
16, records at 0x419a4888 + 84 x id) and two count factors (record + 4, + 8), and returns before the
edit when the delta is 0. STA and END use a fine profile (factors 1 and 64) whose delta stays 0 for
slow single counts, so the snap never ran; PD01 and PD02 behaved the same. Stock has four profiles:
the default (381 parameters), SMP's list profile (SMP and one other), STA and END's, and a stepped
profile shared by 32 parameters, among them LOP, BD CLASSIC's WAV, the OFF/ON switches and
parameter 33 (0-64).

**Change (PP12, PC10, PD04).** With FUNC held, a turn on STA or END is read through LOP's profile and
count factors (site 0x4003a0de, where the handler's two paths meet before the engine), and the snap
steps one crossing for each whole value in the delta (at most 16): a crossing goes by when LOP would
step a value, several on a fast turn through stock's acceleration. The encoder-count hook is gone.
rytm-emu, ZSIN on BD: FUNC + STA's first step came on the same event as FUNC + LOP's (8-count events
120M apart, 16-count 120M apart, 8-count 40M apart; LOP's range of two steps shows no more);
stock drops the first FUNC-held event or two after FUNC goes down, for any FUNC turn; edges held,
STA and END passed and shared crossings, grid locks and live recording landed on crossings; the full
battery as PP11. rytm-emu's encoder counts do not match a unit's (single counts never move stock's
own stepped or list controls there), so how it feels is for the unit to show.

## Code review (2026-10-28)

A second `/code-review` (high), of everything since the first, raised ten points. Each was checked
against the code and, where it could be, in rytm-emu; PP11, PC09 and PD03 carry the fixes:

- **Fixed:** the cache push before the mirrored DMA pushed only way 0 of each line's set. It now
  pushes ways 0-3 and ends with a `nop`, as poly8 does. rytm-emu models no cache, so only the unit
  can show the difference; nothing changed in the emulator.
- **Fixed:** the block after a turn, the voice's new position was worked out from STA and END as
  they are now, not as they were when the DMA was mirrored. It now uses the loop as armed.
  PIPO with END turned through the note gave the same output on PP10 and PP11 (stock's own glide
  dominates there); the battery is unchanged.
- **Fixed:** the encoder, lock and per-trig gates now hand stock back d0, d1 and a1 (the per-trig
  gate the delta exactly as it came), and the main-segment DMA gates keep d1. No symptom was seen
  in the emulator; this removes the dependence on stock not reading them.
- **Fixed:** LOP set above 2 over MIDI CC 30 plays and reads as ON but drew on the three-position
  switch. It now draws stock's ON switch (CC 1 middle, CC 2 right, CC 64 stock ON; rytm-emu).
- **Fixed:** the snap's direction came from the encoder count; it now comes from stock's delta, so a
  stale count cannot step the wrong way. A trig lock's "none" is tested as an int and as 8.8,
  `frame_of` clamps negatives in snap.c too, and LOP ON's direction filter runs before the value
  search.
- **Not a bug:** TURN_LAG with one sign at both ends. With END inside the sample every turn's largest
  step on the ramp is 1, at both ends, so neither end repeats or skips frames.
- **Kept:** a turn is still taken when the DMA was not mirrored (the window was not the one the
  module expects); not taking it would play stock's forward wrap instead, a click either way.
  PD02/PD03's third counter shows when it happens; it stayed 0 in rytm-emu, also while STA was
  snapped during PIPO.

After the fixes, on PP11: the full battery as PP10; the snap edge, shared-crossing, pass and p-lock
runs as PP10 (sound, lock editor and per-trig paths); live recording records the snapped crossings;
PC09's quick check as PC08.

## Code review (2026-10-27)

A `/code-review` of the branch raised ten points. What was done with each:

- **Fixed:** the PIPO text printed for value 2 on all eight parameters sharing the OFF/ON routine,
  and MIDI CC can put 2 in any of them. The gate now also checks that the call is for LOP's record
  (ctx 0x419a5760; a breakpoint on stock showed LOP's text called with exactly that).
- **Fixed:** the swap relied on stock rebuilding the effective STA and END every block. The handler
  now puts the values back itself when they still read as it wrote them a block ago.
- **Fixed:** the travel estimate took any move up to 512 frames, so a wrap could pass for travel.
  It now counts only moves in the direction the voice was going, keeps the last good value, and
  follows voices with LOP ON too, so a switch to PIPO mid-note starts with a known step.
- **Fixed:** a voice with no track kept its direction state; it is now cleared there too.
- **Fixed:** STA and END were converted to frames (four divisions) every block; the result is now
  cached per voice and recomputed only when STA, END or the sample change. Voices with LOP OFF
  return after one test.
- **Not a bug:** the trig mask is per voice. Stock's prefetch for voices 1-7 tests it with the
  voice index (`btst` with the loop counter) and looks the track up separately in the owner table.
- **Kept, documented:** turns land on block boundaries. A sample-exact turn would need the engine's
  own wrap, which the prefetch does a block ahead with a forward DMA; not cheap.
- **Kept out of the branch:** the release-notes file. `npm run check` rejects notes for a module the
  library does not list yet (Silent Pad+Trig has none either); it goes in with the library entry.
- **Done another way:** `module:doctor` does not reach `_submissions/`. Run on a temporary,
  uncommitted copy in `sdk/analog-rytm-mkii/modules/`, it passed manifest, category guide and
  module rules; its one red line, no pinned browser package, applies only to library modules.
  `node scripts/machine-modules.mjs --drafts` validates this folder.
- **Fixed:** the evidence hash now fingerprints exactly the source PP05 was built from.

## Sites

| Site | Length | What | Stock guard |
| --- | --- | --- | --- |
| 0x40121134 | 6 | `jsr` to voice 0's sample prefetch in the audio interrupt, after locks, scenes and LFOs are in the effective parameters; the gate runs the handler, then tail-jumps to stock | `2e4c18b1…7c8` |
| 0x400fb56c | 6 | the first two instructions of stock's shared OFF/ON value text; prints PIPO for 2 on LOP's record, else stock | `26c0ee91…7581` |
| 0x401c04f8 | 4 | data: LOP's maximum in stock's parameter table, 1.0 to 2.0 (8.8) | `6b1e73a0…0f93` |
| 0x4011c58a / 0x4011c5e6 | 6 / 8 | voice 0's prefetch: where the DMA sources of the segment after the loop's end and of the main segment are written; exact turns swap in the mirrored frames | stock guards in build.json |
| 0x4011cb2e / 0x4011cb98 | 10 / 8 | the same in the voices 1-7 prefetch | stock guards in build.json |
| 0x4003a19c | 6 | the setup of the edit handler's lock call (a held trig, with a lock editor): for STA and END with FUNC held, the step from the lock to the next crossing | `8b2ff131…1acf` |
| 0x40037f6c | 6 | in stock's per-trig lock edit, the setup of the call that adds the turn to a trig's lock: for STA and END with FUNC held, the step from that trig's lock to its next crossing | `6bec112e…370e` |
| 0x4006ce72 | 6 | the end of stock's waveform widget draw routine (only caller: SMPL WAVEFORM), after the lines and playheads: the S and E labels | `fd3a7a09…b4f0` |
| 0x4003a0de | 6 | in stock's encoder handler, the three pushes before its encoder engine, where both paths meet: for STA and END with FUNC held, LOP's encoder profile and count factors instead of theirs | `e88c5d87…48e0` |
| 0x4003a240 | 6 | in stock's encoder handler, the setup of the view's apply-delta call; for STA and END with FUNC held it replaces the whole-number step by the step to the next zero crossing, sent as a fine turn | `87377367…3e20` |
| 0x400fedf4 | 6 | the first instruction of stock's shared OFF/ON switch icon; for LOP's record (ctx 0x419a5770, seen on a breakpoint on stock) it tail-calls BD CLASSIC WAV's three-position icon routine 0x400fef4a with the same arguments, else stock | `0528305f…fac3` |

Modwerk's linker links Pipo Loop beside Filter Hz, Loop Sync and Silent Pad+Trig together (PX07).
None of the thirteen sites is patched by Silent Pad+Trig (0x400c772e, 0x400c7a3e, 0x400c7e90,
0x400c7950, 0x400ec184), Loop Sync (0x40121020) or Filter Hz. The OFF/ON text routine is shared by
parameter ids 34-37, 45 (LOP), 224, 248 and 463; the switch icon by twelve parameters (those and 73, 414, 415, 434).

## Load and memory

- Memory: 7,221 bytes in the shared mod area (4,393 of code and text, 2,828 of state, 2,560 of it the mirror buffers), from PP09's package. The icon and zero-snap gates run in the UI task only, not in the audio path.
- Load: static estimate from the compiled handler: about 15 instructions a block for a voice with LOP
  OFF or no track, about 70 for one looping with ON, about 105 for one in PIPO, plus four 32-bit
  divisions when a voice's STA, END or sample change. With the Rytm guide's emulator figure (0.023 %
  of a block per instruction a frame), about 0.1 % with nothing looping and about 0.6 % with all eight
  voices in PIPO. rytm-emu's breakpoints and profiler do not reach the audio interrupt's mod code, so
  it was not measured. Not measured on a unit.

## The STA and END lines on SMPL WAVEFORM (2026-10-28)

npp1993 sent a photo (PIPO_SLOW, both points snapped): the END line sat about a column left of where
the waveform crosses zero. rytm-emu, PP10, PIPO_SLOW on BD, STA snapped to 5061 (rising) and END to
16581 (rising), SMPL WAVEFORM read pixel by pixel (128 columns, 225 frames a column): the STA line is
in column 23, the column where the drawn waveform changes sign; the END line is in column 72, and the
waveform changes sign in column 73. The same as the photo. The module draws nothing on this view;
the lines are stock's rendering of the STA and END values, and the frames played are the crossings
(checked earlier from the voice position and the audio).
Stock-only control (stock 1.74, no module, PIPO_SLOW, END by plain and FUNC turns, settled screens):
END 17680 and 17688 (stock can't reach our 17686) both draw in column 72, as PP10 does. Fitted from
stock's own screens and checked on new values: a line sits at column 2 + floor(value x 123 / 30720),
STA and END alike, while the waveform's columns are 2 + floor(frame x 124 / frames). The lines are
spaced over 123 columns and the wave over 124, so a line drifts up to one column left of its frame
across the screen: of PIPO_SLOW's ten crossings, 7941, 16581, 22341 and 25221 draw a column left
(STA on 7941 seen in column 35, its crossing drawn in 36), the other six on the crossing's column.
Screens taken during fast turning can show a line from mid-glide; the settled screen is the one
above.

## Open items

- Possible later improvement (npp1993, 2026-10-28): FUNC snaps could skip stock's STA/END glide and
  jump straight to the crossing, so no wrap or PIPO turn plays from between crossings while a turn
  settles. Not built: STA and END as played are stock's smoothing plus LFO and velocity modulation,
  so the module would have to work out the target itself every audio block, only after a FUNC snap,
  without breaking plain-turn smoothing or modulation: more code in the audio path and another
  round of emulator and unit tests.

## Not tested

On a unit (everything below was run in rytm-emu only, or not at all):

- PC11 and PP13 themselves (PD05, the same code plus the readout, was flashed). PP14, the same code on core-ar2 0.7, was.
- Moderate-speed FUNC turns after the skip fix (one crossing for up to two values); the unmirrored
  counter staying 0 over a long PIPO note. (PIPO turns after the four-way cache push were reported fine on PP14, not itemized.)
- Several voices in PIPO at once (eight), retrig, and LFO or velocity modulation of STA and END
  while in PIPO.
- LOP's PIPO as a p-lock and in scenes, LOP set over MIDI CC 30 (including values above 2).
- The sound browser, sound SysEx dumps and Overbridge. (Kit save and reload, a power cycle and a PIPO kit on
  stock 1.74 were run on PP14; see above.)
- Silent Pad+Trig's rows and pads used together with Pipo Loop in one session (PC11 builds both;
  PD05 carried both but only Pipo Loop was exercised); Loop Sync and Pipo Loop on the same track.
- Several trigs held at once while snapping locks.
- Samples longer than 0.64 s (zero snap lands on the nearest step there).
