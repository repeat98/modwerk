# Filters testing

Version **0.1.0-experimental**, Digitakt I OS 1.54, Core 2.1.

## Source and builds

- Source: branch `module/filters` on repeat98/modwerk main, from draadpiraat's private build (`filters-private`, last commit `e41bc04b`, the DJ and BP gig build) with one change for the release: the private link to Digi Health's FAST AUDIO (`r_on`) is removed, so the stock types call the stock filter directly, and Digi Health is a declared conflict. Source identity: [evidence/source-identity.json](evidence/source-identity.json).
- Compiled in the pinned GCC 16.2 Docker toolchain; the source-only package `sdk/imports/packages/filters/filters-0.1.0-experimental-os1.54.elemod` (sha256 `83dcb40b…`) links to the same image as the compiled recipe.
- Test image **FL01**: stock OS 1.54 (sha256 `f78ba80f…`) with Core 2.1 and Filters, linked with `scripts/link-image.mjs`, sha256 `473bb8b34781795e34e54b27cd66124ef4b2f936115b405cb02952ee67a67116`.
- Shared mod RAM: 5,668 bytes (core alone leaves 129,696 bytes of the area; with Filters 124,028).

## Emulator (digiemu `c1b5735`, patched Unicorn 2.1.4, `hle=False`)

| Check | Result |
| --- | --- |
| FLTR, TYPE (G) past EQ:5 reaches DJ, then BP, and stops there; the title and the TYPE knob name each | passed |
| On DJ, a tick over the FREQ box marks the middle | seen |
| Screenshots (two), [capture record](media/capture.json) | taken from FL01 |

### Audio-block load

3,000 audio blocks with the MCF5441x instruction-timing model at 250 MHz, zero-wait memory, the demo pattern playing. TYPE was set through the FLTR page on each track; the emulator's knob turns are not exact, so some tracks may have landed on a neighbouring type. Calls into the new filter were counted to confirm it ran (DJ run 91,935, BP run 245,614, setup included). Modelled cycles, not hardware timing.

| Build | Mean | Worst block |
| --- | --- | --- |
| Core 2.1 alone | 60.3% | 62.0% |
| + Filters, stock types | 60.3% | 62.1% |
| + Filters, DJ on the tracks | 59.9% | 61.5% |
| + Filters, BP on the tracks | 59.1% | 60.7% |

The new types replace the stock filter's work for their voices rather than adding to it, so they cost no more than the stock filter.

## Earlier private builds on hardware

DJ (and later BP) ran on draadpiraat's Digitakt I in the private live builds (live38fa to live51), with Digi Health's FAST AUDIO linked in privately. Those are earlier, differently linked builds, so they are not counted as evidence for FL01.

## Not tested

- FL01 on hardware: the checklist covers both types' sound, the catch in the middle, p-locks and LFOs, save and reload after a power cycle, the stock types unchanged, and DJ on all eight tracks while playing.
- Filter responses measured in the emulator for this build.
