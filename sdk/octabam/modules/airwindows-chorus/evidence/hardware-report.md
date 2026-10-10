# Air Chorus — MKII hardware report and current-image approval

On 8 October 2026, Jannik Assfalg (`repeat98`) reported:

> works very well in my hardware test

Asked about the supplied `AIR_CHORUS_0.1.0_MKII_TEST.bin`, duration and coverage,
he confirmed the file and reported:

> yes, 50 minutes, different instances, not all eight tracks, but a few, full knob sweeps, that fine for now. let's release

The prior conversation identifies the instrument as an Octatrack MKII.
This is an attributed functional listening report, not measured chip timing.
Several distinct instances and full knob sweeps worked well. The exact tracks,
settings and instance count were not given. Eight-track load was not tested;
locks/scenes/LFOs, Part/project persistence and physical reboot were not reported.
The owner accepted those coverage limits when requesting release.

## Hardware-tested candidate

Version `0.1.0-experimental`, development source commit
`f79e1098ca771ecff45796dc201f492398619e0f`, header `AIRC0.1`:

- Saved update SHA-256: `74854a87299c44f31592257ca1472248448fb27d5dd327c799c99cdc404dc794`.
- MAIN OS SHA-256: `4b7da0962c061b8be7cca57a68513fef493f2718a70a1cfe1b49c53ff88a6d04`.
- Stock FX1 retained; FX2 offers NONE and Air Chorus.

## Current-image hardware waiver

Software release checks then found the 16,384-word synchronous ring clear
in initialization. The current candidate tracks valid history instead, reads
unwritten history as zero and uses the original tap path once history is full.
All ten retained parity fixtures are byte-identical to the hardware-tested DSP.
This is software evidence; the initialization change is not a physical pass.

The owner was given `AIR_CHORUS_0.1.0_RELEASE_TEST.bin` (header `AIRC0R1`) and
asked specifically to test boot, assigning/reassigning several differently
controlled instances and knob sweeps, because the image had changed. He replied:

> no, it's ok, let's release

This is approval to release that changed candidate without fresh physical
hardware testing. It is not a claim that omitted checks passed. The approval
binds to this version/current native-source inventory and these image identities:

- MAIN OS SHA-256: `8ecec31ef7511756e17aaba2cd569a32e4471bcebe0dd0738615327fb850a6df`.
- Saved update SHA-256: `7985646631d8eece5b421246b50b62f33d00818d77cba5a9dd240b766ed4017c`.
- Current chip wall-clock timing and hardware canaries remain unmeasured.

Software cycle/memory, composition, reproducible package, licence and real LCD
checks remain required. No baseline or another module's exception is extended.

### Owner follow-up on 0.1.1 — 9 October 2026

The tester reports the clicking persists with the new beta, with T3 the only
known problematic track so far. T1/T2 together, T6 and T8 also worked; at least
four instances were running in an existing project. Whether T3 fails alone is
unknown. No model, fresh-project or persistence result was supplied. The owner
does not want to ask for further hardware tests now. The attached log files are
the earlier checkpoints and do not substantiate a new passing hardware test.
The follow-up 0.1.2 shared-word protection/Analog BD update is untested on
hardware under the owner's continued beta release authorization and waiver.
