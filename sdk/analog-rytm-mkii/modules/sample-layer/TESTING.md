# Sample Layer testing

Record only what was observed, on a named build.

## Probe SL01 (26 November 2026, Analog Rytm MKII, OS 1.74)

A probe, not a release: core-ar2 0.7 plus a gate over stock's call of the voice mixer (0x4012129a) that cleared the stream at 0x800067f8 for all eight voices. Image `sample-layer-probe-SL01.syx`, sha256 `12c69ead…fcaba1`, flashed over Transfer.

- Reported by @chevyone on their unit: the sample went silent. The stream is the sample.

## Build SL02 (0.1.0-experimental)

Modwerk's plain development base (dev, `6844766f`) plus sample-layer, sha256 `d2429d082d55c8deca4cb9944f313b7f8276b83df7a362ca1befed4e05ef059d`, ramSpare 106,344 B.

Off the unit: the filter's fixed-point maths, modelled in Python from the same integer steps, measured -6 dB at FRQ with RES 0 for FRQ 20 to 127, 12 dB per octave, +12 dB at RES 15, and no runaway with a full-scale input at resonance (it saturates).

On the unit (26 November 2026, Analog Rytm MKII, OS 1.74, flashed over Transfer): reported by @chevyone as "todo funciona" (everything works) after the steps below. The agent did not observe the unit; the per-case results are the tester's single report, not separate measurements.

| Case | Result |
| --- | --- |
| SMPL steps SAMPLE, waveform, SMPL LAYER, and back | reported working |
| TYP OFF, DEC INF: the sample as stock | reported working |
| LP, BP, HP and FRQ, RES heard on the sample alone | reported working |
| DEC restarts at each trig, on BD and on a shared voice (RS/CP) | reported working |
| Settings kept after a kit save and a power cycle | reported working |
| A sound reset sets the defaults | not tested |
| Every voice with TYP and DEC on: no dropouts | not tested |
| Beside other modules (LFO RND, Improved AMP, Improved SMPL) | not tested |
| Audio load measured | not tested |
