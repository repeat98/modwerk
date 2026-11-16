# TapeHead author-reported hardware operation

## 0.1.2-experimental: the input level

Tester: **devilfish707**, 2 October 2026. Image: `tapehead-spring`, BUILD=6
(OCTABAM6), MAIN OS SHA-256
`2f1f98015e7e8c61f01bbe8cf9b3038e6ef1b44aa2c6b5c205ca0c4f2d37e3b9`, built from
the level fix before its cycle payback (`tapehead.asm` `c6896b3e…`).

Having heard 0.1.1 saturate less than the JSFX at the same settings, the author
flashed OCTABAM6, compared it with the JSFX again and reported: "yes this
works". That is a listening comparison of the saturation amount. Model,
project, duration, track and instance counts were not recorded; no stress,
maximum-load, recording or recovery test was made.

0.1.2's source differs from OCTABAM6's only by the cycle payback (`mac` for
mpy + add, register moves for reloads). It renders bit-identically in 684 mono
renders and a stereo render (TESTING.md).

Then, the same day, on an **Octatrack MKII**: OCTABAM7, the image this source
builds (`tapehead-spring`, BUILD=7, MAIN OS SHA-256
`774aa99723625fb698e5f0bb6fc32ea3196996931f55beb10ce1ec53eccc328b`). The
author played about three minutes with TapeHead on seven tracks, driven by
parameter-lock automation and scene changes, and reported: "yes it sounds the
same" (as OCTABAM6). No overload or fault was reported.

Limits: a listening report of about three minutes. Seven instances, not the
sixteen-insert maximum the cycle model prices. No measured hardware timing,
memory canary, recording, recovery or power-cycle test.

## 0.1.1-experimental

Tester: **devilfish707**, 2 October 2026. Source: PR #42 commit
`c53daa9c5855b8bd0bd113bf7fbce3d2a394e89c`, including the corrected DSP port.
The submitted 0.1.1-experimental version changes documentation/integration;
its assembled audio code is unchanged. The owner supplied the following
contributor conversation and explicitly accepted this evidence for publication.

> tested taphead on the hardware, cpu is +- same as spring reverb, did PR and benchmark is included
> i plocked a bunch of stuff and didn't got overloads on the hardware OT, seems stable to me

The PR's TESTING.md records local MAIN OS hash
`bb700652540fc42068d1f92791960fb3c86b672932d113f538776c2b1441a0f7` for the
`tapehead-spring`, BUILD=2, static-stock test image. The reviewer rebuilt it
in the isolated container and reproduced that exact hash on 2 October 2026.
The corrected DSP bytes therefore match the reported hardware image.
Only this fingerprint is retained; firmware remains local and temporary.

The report covers working audio, listening, parameter locks and no observed
overloads. Perceived CPU equivalence is subjective, not a measurement. Model
(MKI/MKII), duration, track/instance counts and exact settings were not supplied.
No maximum-load stress-project, simultaneous CC/LFO/scene sweep, recording,
recovery, power-cycle or hardware memory-canary report was supplied. Do not
infer coverage of these cases or call this a measured stress pass.

On 2 October 2026 the owner removed the mandatory 60-minute hardware stress
requirement and authorized making TapeHead available on the site. The public
record uses hardwareStatus=reported, not verified. Source, licences, measured
reference renders/benchmarks, exact memory, actual UI and native/browser
composition/rejection checks remain separate publication evidence.
