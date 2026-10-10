# Air Chorus

Air Chorus is an Octatrack FX2 port of **Chris Johnson's Airwindows Chorus**,
licensed under MIT. Chris wrote the original algorithm; Jannik Assfalg
(`repeat98`) maintains this DSP56300 port. The original source and licence are
retained under `upstream/`, pinned to Airwindows commit
`e718c9bcfcdd736deeddb08bffe6bce2aa8e0eea`.

Version: **0.1.0-experimental**. The owner reports a successful 50-minute MKII test with several instances and full knob sweeps on the first image, and explicitly waived fresh hardware testing of the initialization update. Unreported persistence, modulation and eight-track hardware checks remain open. See [TESTING.md](TESTING.md) and [the hardware report](evidence/hardware-report.md).

## Overview

Stereo sine-modulated delay with Airwindows' alternating even/odd high-frequency
“air” compensation and three-point interpolated read. Both channels share the
original LFO phase but keep independent delay and filter states. A mono input
therefore remains mono; this is not a stereo-width generator. MIX also changes
modulation depth and air compensation, as in the source.

The chorus LFO advances from the instrument's 44.1 kHz audio samples. It is
free-running, matching the original effect; it is not a sequencer clock or
musical subdivision. Step locks, scenes and the Octatrack's own LFOs provide
control targets through the existing dispatcher. The port creates no rhythm
scheduler and does not override the instrument's tempo, track speed or swing.

## Controls

| Encoder | Control | Range / default | Behavior |
| --- | --- | --- | --- |
| A | SPD (Speed) | 0–127 / 64 | Fourth-power speed curve, 0–7.019 Hz; 64 ≈ 0.439 Hz. Zero freezes the internal phase. |
| B | RNG (Range) | 0–127 / 64 | Fourth-power centre-delay curve, 0–92.513 ms; 64 ≈ 5.782 ms. At fully wet, the sweep spans zero to twice this delay. |
| F | MIX | 0–127 / 0 | Dry/wet balance plus original depth/air interaction. Zero settles to bit-exact dry; 127 is wet only. Try 64 for the original plugin's mix default. |

Other encoders and the second effect page are unused. Endpoint 127 maps to
1.0; other bytes map to value/128, so 64 is exactly the original 0.5.

All three controls slew **per sample in 48-bit state**. SPEED uses one
23.2 ms pole. RANGE and MIX use two cascaded 23.2 ms poles, reaching about
95% of a step in 110 ms. A large change starts with almost zero velocity,
avoiding a first-sample jump across several delay taps. There is no block-end
snap, including trig-split calls. Audible pitch movement while the delay
changes remains part of the effect. Extreme pitch modulation can alias.

## Usage

Air Chorus appears in the audio-track FX2 chooser. Its dry default is safe;
raise MIX to hear the effect.

## Tutorial: a slow chorus

1. Select an audio track playing a sustained sound. Hold FUNC and press FX2, highlight Air Chorus with UP/DOWN, then press YES to assign it.
2. Press FX2. Set SPD 64 and RNG 64 with A/B, then raise MIX to 64 with F. Expect a slow chorus; sweep the controls to check for crackle.
3. Return MIX to 0 for dry after its smoothing tail, or select NONE in FX2 SETUP to remove the effect. Stop transport before saving your test configuration.

## Screens and audio

![Air Chorus highlighted in FX2 SETUP](media/ot-location.png)

Confirm with YES, then press FX2. SPD is encoder A, RNG is B, MIX is F.

![Air Chorus at SPD 64, RNG 64, MIX 64](media/ot-example.png)

Set MIX 0 for dry after its smoothing tail, or select NONE to remove the effect.
These stopped emulator screenshots document the controls. The user reports
a successful 50-minute test with several distinct instances and full knob
sweeps on the earlier image. The initialization update has a current-image
hardware waiver; its software renders match the tested version.

## Compatibility and limitations

- Target: original Octatrack OS 1.40C, MKI/MKII architecture;
  a 50-minute MKII functional test was reported for the earlier image.
  Fresh hardware testing of the initialization update is explicitly owner-waived. Use only the exact private image
  identified in the test report for qualification.
- Each FX2 instance owns its stock 16,384-word Y buffer: two 8,192-word
  rings. Unwritten history returns zero without a synchronous buffer clear;
  after 8,192 samples each ring is fully valid. The greatest read age stays within the ring. Four instances per
  DSP core / eight audio tracks fit the allocator layout; maximum-load
  hardware deadlines have not been established.
- FX1 has only 3,072 buffer words. It is excluded from the chooser. A stale
  project that nevertheless dispatches this ID in FX1 passes dry and does
  not clear or write an FX2-sized buffer.
- Bus engines claiming fixed/shared FX2 memory are refused by the common composer. The module is FX2 only; the configurator determines available companions and stock effects. The compact hardware-test image retained stock FX1 and offered NONE/Air Chorus in FX2. Public configurations can have different menus. Use a disposable project for first installation.
- This is a fixed-point adaptation, not a bit-identical floating-point copy.
  It uses a 1,025-point interpolated quarter-sine table, 48-bit air/filter
  state and a 48-bit phase. Delay samples use eight guard bits (approximately
  16-bit buffer precision) to contain high-frequency air peaks. Dry bypass
  retains all 24 input bits. Float denormal noise and dither are omitted.
- The original 8,176-sample double-write buffer is replaced by a wrapped
  8,192-sample ring, retaining all three-point reads and the complete delay
  range. Initial phase is π/2. Removing/reassigning the effect resets its
  private buffer and LFO; tail/phase persistence is not promised.

## Authorship and licences

Original: [Chris Johnson / Airwindows](https://www.airwindows.com/),
[Chorus source](https://github.com/airwindows/airwindows/tree/e718c9bcfcdd736deeddb08bffe6bce2aa8e0eea/plugins/WinVST/Chorus).
The MIT licence permits adapting and distributing the source with its notice;
full text is in [LICENSE](LICENSE). The user's desktop DLL/AU/VST files are
not redistributed. This port uses published source and original assembly.

## Tests and measurements

`verify.py` assembles the actual DSP and compares synthetic-memory renders
with `reference.py`, a transcription of the pinned source. `verify_controls.py`
uses the repository's unmodified click metric and its known-bad/known-good
self-test, without importing its firmware-dependent published rig driver.
Both need the locally built DSP toolchain (`DSP_TOOLS` overrides its path).
Keep every firmware image, extracted stock byte, raw memory dump and audio
fixture private. Only sanitized text evidence and actual UI exports belong here.

See [TESTING.md](TESTING.md) for full cycle, memory, stock-comparison and sound-quality results. No shareable hardware audio recording was supplied.

[Initial dry controls](media/ot-controls.png) · [Return to dry](media/ot-dry.png)

## Beta 0.1.1 — 9 October 2026

The owner requested publication of the staged full-range optimization for beta testers and explicitly waived current hardware evidence: “also bring the air chorus fix live with it. no hardware evidence is fine, that's exactly what the beta tester tier is for”. This exception is bound to 0.1.1 and its exact source in `sdk/airwindows-chorus-build-approval.json`. The earlier 0.1.0 measurements and hardware report above remain historical.

The optimization retains the original arithmetic, delay range, smoothing and parameter layout. Recorded actual-DSP parity covers 30 fixtures and 983,040 stereo frames. The matched observed maximum is 336.75 net executed instructions/sample, down from 524.5 (35.80%); matched Spring is 314 and stock Chorus is 292.875. Both cores, fixed/moving settings and all trigger splits are covered. The conservative source-word/call model is 495 units/sample and 32,044 units for four instances plus initialization per core/block; these are not chip cycles or a deadline guarantee. Shared code/table is 1,425 P words per core; per-instance state and stereo ring are unchanged.

The real ColdFire/DSP playback fixture exercised T3/T4 MIX delivery over 8,192 blocks; published and optimized per-track output was bit-identical, without output rails. It did not reproduce the reported hardware clicking. This release reduces load as a mitigation; it does not establish a confirmed fix. Current physical timing, multi-instance audio, Part/project reload and reboot are **not tested**. Keep the clicking report open pending actual beta results. Begin with a disposable project and low monitoring volume.

## Beta 0.1.2 — 9 October 2026

Protects stock shared data in the T3/T7 FX2 buffers by keeping the first 72
virtual delay words in safe per-instance X offsets 60..131. Stock track state
at offset 132 and above remains untouched. The old collision is reproduced
and the regression passes; the audible hardware symptom still needs
confirmation. Physical tests remain owner-waived for this beta.

All 1,026 original sine values are reconstructed exactly from 256 packed
second-difference words. The full delay range, sound, controls and saved
parameter layout stay the same. The code/table total drops from 1,425 to 795
words per core, enabling E-Verb and more Analog BD companion combinations.
The builder can place table and code separately, removes stock reverb donors
as needed and still refuses combinations that exceed available memory.
See [the current test record](TESTING.md#beta-012--shared-word-protection-and-wider-compatibility)
for matched DSP cost, native composition evidence and remaining limits.
