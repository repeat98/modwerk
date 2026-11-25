# Crossfader testing

Version **0.1.0-experimental**, Digitakt I OS 1.54, Core 2.1.

## Source and builds

- Source: branch `module/crossfader` on repeat98/modwerk main; source identity in [evidence/source-identity.json](evidence/source-identity.json).
- Compiled in the pinned GCC 16.2 Docker toolchain; the source-only package `sdk/imports/packages/crossfader/crossfader-0.1.0-experimental-os1.54.elemod` links to the same image as the compiled recipe.
- Test image **CF01**: stock OS 1.54 (sha256 `f78ba80f…`) with Core 2.1 and Crossfader, linked with `scripts/link-image.mjs`, sha256 `3419f57266d48b8d28416a99dd766654b31b9cd9a1f7673ba488f3d899076c1c`.
- Shared mod RAM: 4,844 bytes (core alone leaves 129,696 bytes of the area; with Crossfader 124,852).

## Where the code comes from

- draadpiraat's private gig build (`crossfader-live`, last commit `7d89291f`). One change for the release: pushing LEVEL does nothing only where LEVEL is the fader (the Internal Mixer and FADER ON track pages); the gig build swallowed it on every page.
- Until 10 November 2026 the Crossfader and the Live Looper were one module, Loop & Fade; at the owner's request they ship as two. The crossfader code is unchanged by the split.

## Emulator (digiemu `c1b5735`, patched Unicorn 2.1.4, `hle=False`)

Run on CF01. Report: [evidence/emulator-testing.json](evidence/emulator-testing.json).

| Check | Result |
| --- | --- |
| SETTINGS > CROSSFADER is the last row; groups set with LEFT/RIGHT (TRACK 1 A, TRACK 2 B) | passed |
| FADER ON: trig key 2 ticks track 2 | passed |
| LEVEL on the Internal Mixer (2/3) moves the fader, shown at the lower left | passed |
| LEVEL on track 2's AMP page (FADER ON) moves the fader; the box replaces the level bar | passed |
| Screenshots (four), [capture record](media/capture.json) | taken from CF01 |

### Audio-block load

3,000 blocks, the MCF5441x instruction-timing model at 250 MHz, zero-wait memory, the demo pattern playing. Modelled cycles, not hardware timing.

| Build | Mean | Worst block |
| --- | --- | --- |
| Core 2.1 alone | 60.3% | 62.0% |
| + Crossfader, no groups | 60.8% | 62.5% |
| + Crossfader, all ten channels in groups, fader at 64 | 61.0% | 62.8% |

## Hardware

### LF03, before the split

draadpiraat, Digitakt I, OS 1.54, 10 November 2026: LF03 (the Crossfader and the looper in one module), two hours or more. Every crossfader check passed: groups, LEVEL on the Internal Mixer and FUNC + LEVEL, the sends following the fade, FADER ON with LEVEL push doing nothing on fader pages and stock elsewhere, the fader CC on FX CONTROL CH, settings after a power cycle.

### CF01

draadpiraat, Digitakt I, OS 1.54, 12 November 2026: “everything checked out”: the groups, LEVEL on the Internal Mixer and FUNC + LEVEL, the sends following the fade, FADER ON, the fader CC and the settings after a power cycle. Run time not stated. Report: [evidence/hardware-testing.json](evidence/hardware-testing.json).

Noticed on the unit, for the next version:

- After power-on the fader is at A; the author would rather it start in the middle.
- An optional snap at the middle of the fader was asked for.
- The position line in the box is a pixel off centre: at A it runs past the edge line, at B it stops short of it.

## Not tested

- The fader beside other modules that change the mixer.
