# Tape Echo

Version: 0.1.1-experimental · author: [Jannik Aßfalg](https://github.com/repeat98)

`TAPE ECHO` is on its own id `0x0f` beside FX2 **SPRING REV** (it replaced
SPRING REV on `0x15` until 30 Sep 2026; it keeps SPRING REV's controls). It is a mono single-head tape echo
with stereo dry output, now running on the **ColdFire CPU**, in the stock
delay's four-second per-track ring. The DSP side is an empty passthrough
(one NOP per sample for the generic insert cycle gate) and allocates no tape buffer.

The economy model keeps one record head and one playback head. DRIVE is
fixed at 0, the owner's preferred setting. The CPU voice keeps the
FX-pedal's Galaxy-measured feedback law, record saturation, time-dependent
bandwidth and tape-age loss/noise. Two biquads and a `[1,6,1]/8` record FIR
replace the former four biquads: playback low cut plus a combined TIME/AGE
low-pass, fitted offline to the previous response. The opposed emphasis
EQs, low-mid lift and steep record top are omitted; the extreme top-end
slope is less steep. Two inexpensive oscillators supply wow and randomized flutter;
there is no transport-history integration, capstan harmonic or drift model.

FREE uses one bounded slew calculation per 16-sample block and linearly
interpolates the read position. BEAT snaps to a note target and crossfades reads for 512 samples
(11.6 ms), without clearing feedback history or resetting gain/oscillators.
Rapid changes are coalesced: the latest target settles within 1024 samples
(23.2 ms) after the last edit. Two reads exist only during a transition,
not as multiple audible echo heads. Wow-offset acceleration is limited
after a snapped delay change to avoid briefly sweeping the old offset in
a single 16-sample block.

DJ-Mixer's `fx-dsp/core/src/blocks/TapeEchoBlock.cpp` is the behavioural
reference for voicing. Its multi-head geometry and physical-cell
variable-speed write model are not copied. This CPU version still uses
a fractional moving read head.

## Controls

The first page follows the stock Delay pattern: performance controls stay on
the normal FX page, with MIX in the final bottom-right position. Character
controls, including AGE, are on that same page; the detail page is disabled.

| Page | Control | Meaning |
| --- | --- | --- |
| 1 | TIME | 46-231 ms in FREE; musical divisions in BEAT |
| 1 | FDBK | Regeneration; the upper range safely grows tape noise into self-oscillation. |
| 1 | WOW | 0.8 Hz wow plus randomized flutter; 0 is static. 44/127 gives about 7.7 cents RMS. |
| 1 | AGE | Repeat bandwidth, flutter and hiss; fresh at 0, worn at 127. Former HEADS slot. |
| 1 | SYNC | `FREE` continuous time, or `BEAT` tempo-quantised time. |
| 1 | MIX | 0 is exact dry. Up to 64 the echo rises to full level on top of the whole dry signal; from 64 to 127 the dry fades out, leaving the echo alone at 127. Smoothed per sample; where dry and echo together pass full scale, the sum saturates. Default 40. |
| Detail | — | Former DRIVE slot: disabled; the engine always uses DRIVE=0, including on saved parts. |
| Detail | — | Former AGE slot: disabled; AGE now lives on page 1. |

In `BEAT`, TIME selects twelve divisions from `1/64` through dotted `1/4`
and displays their names (T = triplet, dot = dotted). In FREE it displays
milliseconds. The 128-value automation lane is retained: each BEAT band
maps to one exact target, not an interpolated value between notes.
The stock frame builder already publishes
tempo to `0x8000181c` as BPM x 24, so no tempo cave is required. Tape Echo
retains the last valid tempo if that word is briefly absent. All twelve
divisions fit at 30–300 BPM; the longest is three seconds at 30 BPM, leaving
room for wow and interpolation. The previous DSP version's 249 ms cap is gone.

| TIME values in BEAT | Division |
| --- | --- |
| 0–10 | 1/64 |
| 11–21 | 1/32 triplet |
| 22–31 | 1/32 |
| 32–42 | 1/16 triplet |
| 43–53 | 1/16 |
| 54–63 | 1/8 triplet |
| 64–74 | dotted 1/16 |
| 75–85 | 1/8 |
| 86–95 | 1/4 triplet |
| 96–106 | dotted 1/8 |
| 107–117 | 1/4 |
| 118–127 | dotted 1/4 |

FDBK/WOW/SYNC/MIX retain their existing slots. AGE moves from detail slot 7
to page-1 slot 3. Existing HEADS values/locks in that slot now mean AGE:
they must be reset/remapped when migrating a project. Old detail-page AGE
and DRIVE bytes are ignored. BEAT keeps OCTACLID3's twelve-band mapping.
Use a fresh test project, or back up and stamp/reset old effect defaults
before playback; default stamping does not remove obsolete parameter locks.
No automatic project migration is performed.

## Deliberate constraints

This is not a line-by-line desktop port. TIME uses a Q24.8 position and a
block-rate slew bounded to two samples per block (1/8 sample per sample).
There is no velocity/acceleration motor state. Large FREE time changes
take time to settle; position cannot overshoot the target. Linear
interpolation includes both TIME and WOW movement, using the same fast
reader during knob edits as at rest. Both sides of BEAT transitions use
that reader, too. Two oscillators are evaluated once per 16-sample block
and their offsets interpolated at audio rate. Tone coefficients update
when the delay crosses a 32-sample bin; timing itself is not quantized in
FREE. The pedal's scrape
flutter, physical-cell write/interpolation, spring reverb, stereo Dual mode
and separate bass/treble controls are omitted.

The audio arithmetic is written for the ColdFire EMAC the way stock's own
delay loops are: multiply-with-load, accumulator loads, several
accumulators, and the saturating MOVCLR read-out (MACSR OMC) in place of
explicit clamps. Playback, both filter sections and the record sum run in
Q3.29 (+/-4 FS, the old clamp points); the record FIR and curve index stay
Q6.26. The two biquad sections share one pass and carry their eight low
accumulator bits to the next sample to suppress fixed-point limit cycles.
Both are stored as g*(x +/- 2*x1 + x2) + a1*y1 + a2*y2 with the unit part
of a1 as an exact accumulator load; the wet makeup gain lives in the tone
section's numerator and feedback is divided by it. The tape curve (a
signed table of finished ring words) and control laws are offline-generated
lookup tables; there is no per-sample floating point, trigonometry,
division, allocation or variable-speed cell-writing loop. Full-period LCG
hiss grows with AGE; flutter still uses xorshift. Tone updates/ramping run
once per 64 samples (~1.45 ms), staggered by track so only two of eight
active instances do that slow control work per block. TIME/WOW geometry and
gain smoothing are not decimated. The head reader steps a DDA and reuses
the overlapping sample from the preceding read: 17 instead of 32 uncached
word loads for a normal contiguous block. No persistent ring cache or
cache-coherency assumption is introduced. A BEAT crossfade's outgoing head
is blended into the incoming one as it is read. See [VOICING.md](VOICING.md)
for measured results, deviations from Galaxy and the stock-delay CPU
benchmark.

## CPU integration

`cpu.c` is freestanding fixed-point C with signed fractional EMAC multiplies,
and its native build is the bit-exact arithmetic oracle for three
assembly kernels in `cpu_kernels.s`: the head reader (with crossfade), both
playback filter sections, and the record sum / FIR / curve / output mix.
Every EMAC form they use has sites in stock 1.40C.
`generate_cpu.py` produces the checked-in `cpu.s`, following Euclid's build
pattern. No float, heap allocation, runtime library or firmware bytes are
vendored. The platform loader owns the code/tables and 1600 bytes of instance
state (200 bytes per track). `generate_tables.py` designs the fixed-point
tables; `generate_cpu.py` checks them before compiling the ColdFire unit.
Its existing 10 MiB arena reservation is required (shared with other DRAM
modules), reducing the available sample/recorder pool in a formerly ROM-only
remix. The rings themselves are already reserved by the stock OS.

* `0x40002f44`: reset our state with the stock delay's ring reset.
* `0x4000361a`: after stock DMA read completion / next-track prefetch,
  run Tape Echo only for its id (`TE_ID` in `cpu.h`, `0x0f`); replay the original path for every other id.
* Preserve the stock ping-pong scratch-buffer toggle and 68-byte state stride,
  then rejoin `0x4000377a` for the existing ring DMA writes.
* Ring base is `0x4f502c10 + track * 1411328`, through the **uncached** alias.
  Each ring contains 176400 stereo frames; Tape Echo writes mono to both sides.
* On effect entry, a valid-history counter excludes the previous effect's
  samples. There is no large buffer clear inside the audio callback.

Stock DELAY remains id `0x08` and is not replaced. CPU Tape Echo no longer
claims any DSP delay memory.

CPU cost is not yet hardware-qualified. Eight instances are verified for
correctness, **not** certified to meet deadlines alongside timestretch,
recording and streaming. Emulator instruction counts are not hardware cycles.

## Local gates and audition

`.venv/bin/python3 tools/verify/verify_tapeecho_cpu.py tapeecho` runs the CPU
gate with the same native architecture used by `make check`.
It also measures parameter-edit spikes with full synthetic tape history and
all eight tracks active. Endpoint reversals run every 1, 16 and 64 blocks for
TIME, FDBK, WOW, AGE, SYNC and MIX, plus all six controls together in FREE
and BEAT. The gate records mean, p95, p99, the maximum, and the actual worst
block's function profile, with a separate peak ceiling for every case.

After the EMAC rewrite (23 Sep 2026), eight settled full-wet instances
cost 14,245 instructions per frame with WOW=0 and 15,283 with WOW=44
(1.87x and 2.00x stock DELAY, from 2.64x and 2.88x); the MIX=90 default
with moving TIME costs 16,459 (2.16x, from 3.31x). All controls reversing
peak at 18,063 in FREE and 21,547 in BEAT (from 26,563 and 31,454).
Settled MIX=90 with full history peaks at 16,248. These are
executed-instruction counts, not hardware cycles, and hardware UI
responsiveness remains unverified.

It consumes the remix image built by `make check`, checks generated-source
drift, incrementally rebuilds its ColdFire probe, and runs:

* every TIME value at six tempos, plus actual long-delay impulses, bounded BEAT settling and monotonic FREE slew;
* shipped TIME formatter across all values, tracks, Parts and both modes;
* repeated FREE/BEAT toggles with and without WOW, dirty-memory entry, exact stereo dry and bounded feedback;
* measured bandwidth, WOW depth, frequency-dependent repeat decay, noise
  buildup, age-dependent noise and fixed DRIVE=0 compression;
* eight compiled ColdFire instances sweeping every control, tempo and mode,
  including synthetic full history and an active-history wrap, bit-identical to native arithmetic;
* direct assembly-kernel tests against the native oracle's own kernels:
  1024 filter blocks driving both read-outs into saturation with random
  carries, 1024 record/output blocks across full wet, MIX, MIX=0 and knob
  ramps, 2048 plain and crossfading reader blocks with uncached-load counts,
  callee-saved registers, buffer guards and per-kernel instruction ceilings;
* the complete stock delay routine with modelled DMA transfers, mixed Tape
  Echo / stock DELAY tracks, and stock audio/ring identity against 1.40C.
* stock-versus-Tape instruction benchmarks through that complete routine,
  including original/patched stock baselines, two/three-instance automation,
  eight-instance default MIX, all-control edits and full-history stress.

## Status

**Hardware freeze remains open:** OCTACLID4 reached six instances before
freezing during edits; OCTACLID3 froze on TIME with three. Earlier images
also froze on second-instance TIME changes and loading three instances.
No exception screen was shown. OCTACLID5 targets eight instances with
editing headroom and reduces measured work again; it is not yet a physical
fix confirmation. Local instruction counts
do not establish CPU deadline headroom. Do not treat this candidate as a
hardware-confirmed fix or as safe for a live set.

`make check REMIX=tapeecho` includes this gate and the loader boot.
The native audition is `out/tapeecho-cpu/audition.wav`. Its arithmetic is
cross-checked against actual ColdFire execution, but it is not a hardware
capture. Hardware listening, cache/bus timing and worst-case CPU load remain open.
The remixer's DSP-only audition refuses Tape Echo explicitly instead of
silently playing its dry stub. Use the CPU verifier's audition for now.

## Access on the OT and actual UI captures

Audio track FX2 SETUP: Tape Echo in the effect chooser.

1. Select an audio track with its TRACK key.
2. Hold FUNC and press FX2 to open FX2 SETUP.
3. Turn LEVEL to Tape Echo and press YES to assign it.
4. Press FX2 to close SETUP, then adjust TIME, FDBK, WOW, AGE, SYNC and MIX. All six active controls are on this main page.

![Tape Echo main controls on FX2: TIME, FDBK, WOW, AGE, SYNC and MIX.](media/ot-controls.png)

![Tape Echo selected in the FX2 SETUP chooser. Its six active controls are on the main FX2 page.](media/ot-setup.png)

These are actual headless-emulator LCD captures. See [TESTING.md](TESTING.md),
[capture provenance](media/capture.json) and [media rights](media/LICENSE.md).

## Overview

Published version: **0.1.6-experimental**. The original record above, including its older version label and all measured resource figures, is preserved verbatim. 0.1.6 changes how MIX sets the dry and echo levels (below); the echo path, feedback law and tone are the 0.1.2 engine's. The hardware status stays unmeasured.

### MIX and track level (0.1.6)

Issue [#969](https://github.com/repeat98/modwerk/issues/969), like [#607](https://github.com/repeat98/modwerk/issues/607) before it, reported that Tape Echo turns the track down. Up to 0.1.5 MIX was a straight crossfade: at MIX m the dry signal played at (127 − m)/127 of its level, so the default MIX 90 left it at 29 % (−10.7 dB), and the echo only arrived one TIME later. BBD and the stock DELAY keep the whole dry signal and add the echo on top.

From 0.1.6 MIX follows BBD's law. MIX 0 is the exact dry signal. Up to MIX 64 the echo rises to its full level (the level MIX 127 gave before) on top of the whole dry signal; from 64 to 127 the dry fades out, leaving the echo alone at 127. Where dry and echo together pass full scale, the sum saturates at full scale. MIX is still smoothed per sample. The default is now 40, as BBD's.

| MIX | Dry | Echo |
| ---: | ---: | ---: |
| 0 | 1 (exact) | 0 |
| 40 (default) | 1 | 40/64 (−4.1 dB) |
| 64 | 1 | 1 |
| 96 | 31/63 (−6.2 dB) | 1 |
| 127 | 0 | 1 |

**Saved projects sound different.** Projects store MIX as a byte, so the same MIX now plays louder: from MIX 1 to 64 the dry signal keeps its full level (it was up to 6.1 dB quieter) and the echo is 6 dB louder; from 65 to 126 the dry is 6.1 dB louder and the echo up to 6 dB louder. MIX 0 and MIX 127 sound as before. Projects that relied on the old balance need MIX or the track level set again; the balance of dry and echo that the old default MIX 90 gave is now at about MIX 101, with both about 3 dB louder, and MIX 109 gives the old dry level under a 3 dB louder echo. A new Tape Echo now starts at MIX 40.

The echo level itself, the feedback law and the tone are unchanged: 0.1.4 (14 October 2026) found that raising the echo level above its full-wet level clips the self-oscillation region. 0.1.4 kept the dry signal at full level through MIX 95 and was rolled back in 0.1.5; 0.1.6 replaces both with BBD's law.

Tape Echo is a mono single-head echo in Octatrack 1.40C FX2, with stereo dry output, tempo-synced or free timing, pitch movement and tape-age texture. The Controls section above describes every active control and the disabled detail page.

## Usage

Use a backed-up test project and a short transient to hear the repeats clearly. Assign Tape Echo in FX2, choose BEAT timing for musical divisions, and begin with moderate feedback. Increasing WOW moves repeat pitch; increasing AGE darkens the repeats and adds flutter and hiss. MIX 0 gives exact dry audio, and up to MIX 64 the dry signal stays at full level while the echo comes up, so turning Tape Echo on no longer turns the track down. Review old HEADS locks when migrating projects, as described above.

### Quick tutorial

1. In a backed-up test project, select an audio track, hold FUNC and press FX2, then choose Tape Echo with LEVEL and YES.
2. Press FX2 to leave SETUP. Set SYNC to BEAT, TIME to 80 (1/8), FDBK to 64, WOW and AGE to 0, and MIX to 64; play a short sound at 120 BPM.
3. Listen for clean eighth-note repeats, then raise WOW to 72 and AGE to 100 for drifting, darker repeats. Set MIX to 0 to compare dry audio and stop transport when finished.

## Compatibility and limitations

Tape Echo targets Octatrack OS 1.40C FX2 and keeps stock DELAY and SPRING REV available. It uses the shared 10 MiB DRAM arena and existing stock delay rings; the original CPU integration and resource figures above remain the evidence for these costs. The pinned historical record reports six instances running and a seventh freezing the unit; other historical builds froze during edits. The current candidate is not a hardware-confirmed fix. Timing headroom, cache/bus behavior and live-set reliability remain unqualified. 0.1.6 does not address those limits. It adds work only while MIX, FDBK or AGE is moving (see Tests and measurements).

## Tests and measurements

See [TESTING.md](TESTING.md), Local gates and audition, and Status sections above for the original revision, executed-instruction figures and hardware limitations. Executed instructions are distinct from hardware cycles. 0.1.6 changes the output mix kernel, so the original evidence is history, not proof for this version; [TESTING.md](TESTING.md) lists what was re-run on the emulator for 0.1.6, including the new instruction figures. No physical-hardware result exists for it. The audio render verifies nonzero output, exact MIX 0, pass timing and decoded MP3 peaks below −1 dBFS without clipped samples. Its settings, source hashes and method are in [audio preview provenance](docs/audio-preview.md).

## Authorship and licences

Module author: [Jannik Aßfalg](https://github.com/repeat98). Octabam attribution includes Sam Banks; component-specific credits and terms remain in [SDK THIRD_PARTY.md](../../THIRD_PARTY.md) and the original [LICENSE](LICENSE). Existing LCD capture rights remain in [media/LICENSE.md](media/LICENSE.md). The synth-pluck input is from Legowelt’s Juno 106 kit and uses the pack’s unrestricted free-use permission; source audio remains under those terms. Credits, permission and source identity are in [audio preview provenance](docs/audio-preview.md).

## Screens and audio

The original real emulator captures above show the FX2 chooser and the six active controls. Their monochrome exports below preserve every captured pixel, with only a two-color palette change. Their version/build identity remains 0.1.2-experimental; the panel, labels and controls they show are unchanged in 0.1.6, but the MIX knob stands at the old default 90 (now 40); see [capture provenance](media/capture.json) and [pixel-mask comparison](docs/monochrome-captures.md).

![Tape Echo selected in FX2 SETUP.](media/ot-setup-mono.png)

![Tape Echo main controls: TIME, FDBK, WOW, AGE, SYNC and MIX.](media/ot-controls-mono.png)

**Audio preview.** [Listen](media/audio-preview.mp3). Legowelt Juno 106 chord pluck: dry (0 s), clean 1/8 repeats (0.85 s; FDBK 78, WOW 10, AGE 20), worn dotted-1/8 repeats (3.85 s; FDBK 94, WOW 80, AGE 70). BEAT, 128 BPM, MIX 75. 7.85 s, no added gaps; tails edited short. First-hit RMS matched (20 ms). Offline computer render through Tape Echo 0.1.2's CPU engine, made before 0.1.6's MIX law: at MIX 75 the dry notes and the repeats both sound louder now. Not recorded on an Octatrack. Source credits, permission, excerpt preparation, settings, hashes and render details are in [audio preview provenance](docs/audio-preview.md).
