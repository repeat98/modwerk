# Digitakt II OS 1.17 guarded render probe

## Reported hardware result

On 15 November 2026, Claptom-music tested the combined base and effect image on Digitakt II OS 1.17. The base package SHA-256 was `b6ee556855a209907a27d917f51b8324fd3158e2ade304fc4b2c6aa25104ef54` and the sealed image SHA-256 was `9d3eea5ddf1e6bd0d93629c1f6bfa5221165977114119e3ae403fe5c4f88c435`. The tester reported that COMP → SC → ENV navigation, selected-track AUDIO ducking, GRID with no source, and stock COMP dry/wet with SIDECHAIN off all passed. This report covers the combined image. The return-only diagnostic below was exercised in Digikit.

This local probe composes the catalogue Core 1.0 with a pre-send dispatcher and one return-only callback per phase. The public builder still produces a stock DSP section. The probe exercises the build and dispatcher before adding the sidechain or a shared module ABI.

From the repository root with Node 24 and the installed catalogue, run:

```sh
node scripts/dt2-render-probe.ts /private/Digitakt_II_OS1.17.syx /private/render-probe.syx
```

The script checks the kit build, adds the guarded SHARC section, then checks the final section, seal, flash limit and stock writes. The probe's SHA-256 is `04da4cf7ff4ca4c0a5f046e5acca766ae4bd97c74bc88f33262aebde69c8d23d`. Sections 2, 4, 5 and 8 match stock. Main OS matches the kit's Core 1.0 build. Flash headroom is 1,403,872 bytes.

Digikit stepped through 61 instructions from the actual probe's section 7 at `0x1c18a6`. The input callback ran before the output callback, and the dispatcher replayed the displaced stock instruction before resuming at `0x1c18a9`. Both stock and probe reached the continuation with matching R0–R15, I7, ASTATX and STKYX. The probe adds 364 bytes of SHARC code and 108 bytes of register storage. It adds zero shared DDR or fast ColdFire SRAM. The return-only probe was emulator-tested.

An instruction-level fixture replaced the return-only callbacks with routines that passed a value through L2 and clobbered R0, R1 and M5. The output routine observed the input routine's value and the stock path resumed with all three registers restored.

The current dispatcher passes no arguments. Its linked routines return to the dispatcher, preserve registers outside the saved set and can share their own state between phases. The track views, native transport record and registration through the base's module linker are still open.

The coupled emulator cold-booted the exact probe and played the generated 220 Hz T1 sample. The run produced 6,651 DSP blocks with zero missing blocks or halts. All 425,664 PCM words matched the preceding return-only probe without register saves (SHA-256 `ca794125a15f49dee06e19b6175a702560b6815e8c516100607edf3dfe2fe243`). The 28,864-word non-silent segment also matched stock and the Core 1.0 control when aligned to the first nonzero word. The controls used ready snapshots. Boot and trigger latency were not compared.
