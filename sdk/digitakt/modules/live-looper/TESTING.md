# Live Looper testing

Version **0.1.0-experimental**, Digitakt I OS 1.54, Core 2.1 and Machine Pages 1.2.

## Source and builds

- Source: branch `module/loop-fade` (PR #1408) on repeat98/modwerk main; source identity in [evidence/source-identity.json](evidence/source-identity.json).
- Compiled in the pinned GCC 16.2 Docker toolchain; the source-only package `sdk/imports/packages/live-looper/live-looper-0.1.0-experimental-os1.54.elemod` links to the same image as the compiled recipe.
- Test image **LL01**: stock OS 1.54 (sha256 `f78ba80f…`) with Core 2.1, Machine Pages 1.2 and Live Looper, linked with `scripts/link-image.mjs`, sha256 `39a045c7ffa10671223cb46b909a7d4a9db546e9fa57044949119f0cb5813fcb`.
- Shared mod RAM: 14,632 bytes (the set leaves 110,444 of the area free; 125,076 without Live Looper).

## Where the code comes from

- draadpiraat's private live build of RAM Machines 1.3.1 (`ram-live`, last commit `6fb56a34`), reduced to one machine for the release: LOOPER (machine id 122). RAM Machines' record machine and everything only it used are removed (its trigs and REC takes, its knobs, and the take API Sample Tools looks for on machine 121). User-visible "RAM" texts are renamed, and the private coupling to Digi Health's FAST AUDIO is removed (the render calls go to the stock routines; Digi Health is a declared conflict instead). The trim editor stays, on the looper's own SRC page (push D).
- Until 10 November 2026 the looper and the Crossfader were one module, Loop & Fade; at the owner's request they ship as two. The looper code is unchanged by the split apart from the machine's name (LOOPER, was LOOP&FADE).

## Emulator (digiemu `c1b5735`, patched Unicorn 2.1.4, `hle=False`)

Run on LL01. Report: [evidence/emulator-testing.json](evidence/emulator-testing.json).

| Check | Result |
| --- | --- |
| LOOPER in FUNC + SRC, after SLICE; YES twice puts machine 122 on track 2 | passed |
| SRC on the looper's SRC page opens page 2; MODE, MAX and PLAY turn through the stock knob routines | passed |
| ONCE, audio on, demo pattern playing: UP arms, the next loop records, after 64 steps the take is kept and locked (470,208 samples) | passed |
| CAPT with PICK and with WARP set from page 2 and a capture with UP (the load runs) | ran; state read back, audio content not checked |
| Screenshots (two), [capture record](media/capture.json) | taken from LL01 |

### Audio-block load

3,000 blocks, the MCF5441x instruction-timing model at 250 MHz, zero-wait memory, the demo pattern playing. Modelled cycles, not hardware timing.

| Build | Mean | Worst block |
| --- | --- | --- |
| Core 2.1 + Machine Pages | 60.3% | 62.0% |
| + Live Looper, nothing set | 61.2% | 62.9% |
| + the looper in CAPT playing a captured loop in PICK, GLOB ALL | 63.7% | 65.3% |
| the same in WARP | 65.3% | 66.8% |

## Hardware

### LF03, before the split

draadpiraat, Digitakt I, OS 1.54, 10 November 2026: LF03 (this looper and the Crossfader in one module, with Core 2.1 and Machine Pages), two hours or more. Every looper check passed: CAPT and ONCE capture with FILL and UP, the loop playing on through every pattern with the looper on that track, PTCH and WARP following tempo changes, GLOB keeping the sends, the trim editor from push D, page 2's settings after a power cycle, a long session. Known bug: changing PLAY mode while the loop plays restarts the loop mid-way. With an Overbridge instance open the unit lagged; stock 1.54 was not compared. Report: [evidence/lf03-before-split-hardware.json](evidence/lf03-before-split-hardware.json).

### LL01

Not run yet: this exact build, the looper alone, needs its own hardware run.

## Not tested

- LL01 on hardware.
- Stock 1.54 with an Overbridge instance open, to tell whether the lag is the module's.
- Audio content in the emulator: levels, the end-of-take click, noise.
