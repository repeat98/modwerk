# Analog BD reference release notes

## 0.1.4-experimental — 9 October 2026

- Match the 909 body waveform's harmonic phase/asymmetry and complete-hit envelope/DC response more closely to the reference recordings.
- Refit minimum and maximum Attack together, with both fast onset and resonant discharge following the control. Correct both Tune endpoints, including the small settled-pitch shift; intermediate knob positions remain a design interpolation.
- Compare the pulse against the owner-confirmed direct-out recordings with LPF bypass; preserve the body/Tune fit while correcting the attack filters. Reduce excessive pulse-strength variation to a 0.92–1.0 range. Strength variation is an approximation, and transient-shape variation remains smaller than in the recordings. Preserve sequencer timing and pitch.
- Many thanks to **Skee Mask**, who kindly recorded his TR-909 so we could match Analog BD more closely. The recorded instrument has a decay modification; the full modified-decay range is not reproduced.
- Preserve the 808 engine, saved controls and existing TDEP/SAT smoothing. Matched native 909 instruction counts grow by about 6.2%; 808 cost and memory allocations are unchanged. High ACCNT/LOW can still reach the existing output limiter.
- The owner accepted actual AB014REF05 emulator audio and approved this exact release with fresh physical hardware/persistence testing, worst-case chip timing and complete memory bounds waived. Physical audio, persistence and demanding FX loads remain untested; no hardware result is inferred.

These notes are reflected in the public `src/community/module-changelogs/analog-bassdrum.json`. Earlier 0.1.3 history is retained.
