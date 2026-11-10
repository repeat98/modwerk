# Loop & Fade testing

Version **0.1.0-experimental**, Digitakt I OS 1.54, Core 2.1 and Machine Pages 1.2.

## Source and builds

- Source: branch `loop-fade` on `a7183fa8` (repeat98/modwerk main), uncommitted working tree; source identity in [evidence/source-identity.json](evidence/source-identity.json).
- Compiled in the pinned GCC 16.2 Docker toolchain (`scripts/build-elemod-packages.mjs --module digitakt:loop-fade`); the source-only package `sdk/imports/packages/loop-fade/loop-fade-0.1.0-experimental-os1.54.elemod` (sha256 `b309cc10…`) links to the same image as the compiled recipe.
- Test image **LF03**: stock OS 1.54 (sha256 `f78ba80f…`) with Core 2.1, Machine Pages 1.2 and Loop & Fade, linked with `scripts/link-image.mjs`, sha256 `fb56201eb76f68493e3a0e8ee836966bec0182084cf5d7418c3040907d6ff46c`.
- Shared mod RAM: 19,492 bytes (the set leaves 105,584 of the area free; 125,076 without Loop & Fade).

## Where the code comes from

- The looper is draadpiraat's private live build of RAM Machines 1.3.1 (`ram-live`, last commit `6fb56a34`), reduced to one machine for the release: LOOP&FADE (machine id 122). RAM Machines' record machine and everything only it used are removed (its trigs and REC takes, its knobs, and the take API Sample Tools looks for on machine 121). User-visible "RAM" texts are renamed, and the private coupling to Digi Health's FAST AUDIO is removed (the render calls go to the stock routines; Digi Health is a declared conflict instead). The trim editor stays, on the looper's own SRC page (push D).
- The crossfader is draadpiraat's private gig build (`crossfader-live`, last commit `7d89291f`). One change for the release: pushing LEVEL does nothing only where LEVEL is the fader (the Internal Mixer and FADER ON track pages); the gig build swallowed it on every page.
- Both ran on draadpiraat's Digitakt I in private builds, the live set included (gig candidate live45fa; PTCH following the tempo seen on live46fa). Those were earlier versions of this code, linked with other modules, so they do not count as hardware evidence for this build.

## Emulator (digiemu `c1b5735`, patched Unicorn 2.1.4, `hle=False`)

Run on LF03. Report: [evidence/emulator-testing.json](evidence/emulator-testing.json).

| Check | Result |
| --- | --- |
| LOOP&FADE in FUNC + SRC, after SLICE; YES twice puts machine 122 on track 2 | passed |
| SRC on the looper's SRC page opens page 2; MODE, MAX and PLAY turn through the stock knob routines | passed |
| ONCE, audio on, demo pattern playing: UP arms, the next loop records, after 64 steps the take is kept and locked (470,144 samples) | passed |
| CAPT with PICK and with WARP set from page 2 and a capture with UP (the load runs) | ran; state read back, audio content not checked |
| SETTINGS > CROSSFADER: groups with LEFT/RIGHT, FADER ON toggled with trig key 2 | passed |
| LEVEL on the Internal Mixer and on track 2's AMP page (FADER ON) moves the fader and shows its position | passed |
| Screenshots (six), [capture record](media/capture.json) | taken from LF03 |

### Audio-block load

3,000 blocks, the MCF5441x instruction-timing model at 250 MHz, zero-wait memory, the demo pattern playing. Modelled cycles, not hardware timing.

| Build | Mean | Worst block |
| --- | --- | --- |
| Core 2.1 + Machine Pages | 60.3% | 62.0% |
| + Loop & Fade, nothing set | 61.8% | 63.5% |
| + the looper in CAPT playing a captured loop in PICK, GLOB ALL, ten channels on the crossfader at 64 | 64.5% | 66.2% |
| the same in WARP | 66.0% | 67.7% |

## Hardware (LF03)

draadpiraat, Digitakt I, OS 1.54, 10 November 2026, LF03 (Core 2.1, Machine Pages and Loop & Fade alone), two hours or more. Report: [evidence/hardware-testing.json](evidence/hardware-testing.json).

| Check | Result |
| --- | --- |
| 1 CAPT + PICK: FILL captures, the loop plays | passed |
| 2 the loop plays on through pattern changes | passed, through every pattern with the looper on that track |
| 3 ONCE: UP arms, records, locks, plays | passed |
| 4 PTCH and WARP follow tempo changes | passed; known bug: changing the mode while it plays restarts the loop mid-way |
| 5 GLOB SND keeps DEL/REV across patterns | passed |
| 6 push D opens the trim editor with the loop | passed |
| 7 crossfader groups, LEVEL on the Internal Mixer, FUNC + LEVEL, sends follow | passed |
| 8 FADER ON; LEVEL push does nothing on fader pages, stock elsewhere | passed |
| 9 the fader CC on FX CONTROL CH | passed |
| 10 settings back after a power cycle | passed |
| 11 a long session | passed, no problems |
| 12 an Overbridge instance open | the unit lags (knobs, filter, UI); stock 1.54 not compared |

## Not tested

- Stock 1.54 with an Overbridge instance open, to tell whether the lag is the module's.
- Audio content in the emulator: levels, the end-of-take click, noise.
- The trim editor, GLOB across pattern changes, the fader CC, settings persistence, beside other modules.
- Pushing LEVEL: digiemu has no LEVEL push key, so the change is checked by reading the code only.
