# Live Looper testing

Version **0.1.0-experimental**, Digitakt I OS 1.54, Core 2.1 and Machine Pages 1.2.

## Source and builds

- Source: branch `module/loop-fade` (PR #1408) on repeat98/modwerk main; source identity in [evidence/source-identity.json](evidence/source-identity.json).
- Compiled in the pinned GCC 16.2 Docker toolchain; the source-only package `sdk/imports/packages/live-looper/live-looper-0.1.0-experimental-os1.54.elemod` links to the same image as the compiled recipe.
- Test image **LL02**: stock OS 1.54 (sha256 `f78ba80f…`) with Core 2.1, Machine Pages 1.2 and Live Looper, linked with `scripts/link-image.mjs`, sha256 `8eb45a154c0e355813e1db5b657700d798e9d6a07b0f7b653a8b043ad5fadc6b`. It is LL01 (`39a045c7…`) with the fixes from draadpiraat's LL01 run (below).
- Shared mod RAM: 15,556 bytes (the set leaves 109,520 of the area free; 125,076 without Live Looper).

## Where the code comes from

- draadpiraat's private live build of RAM Machines 1.3.1 (`ram-live`, last commit `6fb56a34`), reduced to one machine for the release: LOOPER (machine id 122). RAM Machines' record machine and everything only it used are removed (its trigs and REC takes, its knobs, and the take API Sample Tools looks for on machine 121). User-visible "RAM" texts are renamed, and the private coupling to Digi Health's FAST AUDIO is removed (the render calls go to the stock routines; Digi Health is a declared conflict instead). The trim editor stays, on the looper's own SRC page (push D).
- Until 10 November 2026 the looper and the Crossfader were one module, Loop & Fade; at the owner's request they ship as two. The looper code is unchanged by the split apart from the machine's name (LOOPER, was LOOP&FADE).

## Emulator (digiemu `c1b5735`, patched Unicorn 2.1.4, `hle=False`)

Run on LL02, except the rows marked LL01 (before the fixes). Report: [evidence/emulator-testing.json](evidence/emulator-testing.json).

| Check | Result |
| --- | --- |
| LOOPER in FUNC + SRC, after SLICE; YES twice puts machine 122 on track 2 | passed |
| A short SRC press switches page 1 and page 2 through the stock page switch (the SRC view's page kind 4, then 5); holding SRC 0.7 s doesn't switch, and shows every page 2 value in place of the names | passed |
| Turning LEN on page 2: the header shows "Loop Length=32" as the stock pages show theirs, and LEN's name shows 32 for about 4 s | passed |
| LEN set to PT.LEN: the box reads PT.LEN; with the pattern's M.LEN at 16 a loop is 16 steps (117,551 samples at the demo's tempo) | passed |
| ONCE + PICK armed while stopped: STOP pressed while stopped calls it off; armed again, PLAY starts the take at once (stage 2) and it is kept and locked at the end of the first loop | passed |
| GLOB ALL: FREQ set on the LOOPER track in A01 is on the LOOPER track in A02 after the pattern change | passed |
| LL01: ONCE, audio on, demo pattern playing: UP arms, the next loop records, after 64 steps the take is kept and locked (470,208 samples) | passed |
| CAPT with PICK and with WARP set from page 2 and a capture with UP (the load runs, LL02) | ran; state read back, audio content not checked |
| Screenshots (two), [capture record](media/capture.json) | taken from LL02 |

### Audio-block load

3,000 blocks, the MCF5441x instruction-timing model at 250 MHz, zero-wait memory, the demo pattern playing. Modelled cycles, not hardware timing.

| Build | Mean | Worst block |
| --- | --- | --- |
| Core 2.1 + Machine Pages | 60.3% | 62.0% |
| + Live Looper, nothing set | 61.2% | 62.9% |
| + the looper in CAPT playing a captured loop in PICK, GLOB ALL | 64.1% | 65.6% |
| the same in WARP | 65.6% | 67.2% |

LL01 measured 63.7% / 65.3% and 65.3% / 66.8% for the last two; LL02 records sample by sample so a loop ends on its exact length, which costs about 0.3 to 0.4 points.

## Hardware

### LF03, before the split

draadpiraat, Digitakt I, OS 1.54, 10 November 2026: LF03 (this looper and the Crossfader in one module, with Core 2.1 and Machine Pages), two hours or more. Every looper check passed: CAPT and ONCE capture with FILL and UP, the loop playing on through every pattern with the looper on that track, PTCH and WARP following tempo changes, GLOB keeping the sends, the trim editor from push D, page 2's settings after a power cycle, a long session. Known bug: changing PLAY mode while the loop plays restarts the loop mid-way. With an Overbridge instance open the unit lagged; stock 1.54 was not compared. Report: [evidence/lf03-before-split-hardware.json](evidence/lf03-before-split-hardware.json).

### LL01

draadpiraat, Digitakt I, OS 1.54, 12 November 2026: every checklist step passed (capture with PAGE, the loop through pattern changes, ONCE, PTCH and WARP with the tempo, GLOB SND, the trim editor, page 2 after a power cycle). Findings, fixed in LL02 unless marked: GLOB ALL let the filter go back on a pattern change; an arm could only be called off with MODE; an arm made while stopped waited a loop; holding SRC switched pages instead of showing the values; no header message on page 2; MAX renamed LEN with PT.LEN added; TAKEN now RECORDED; the trig key restarts the loop in PICK, PTCH and WARP (open). Report: [evidence/ll01-hardware.json](evidence/ll01-hardware.json).

### LL02

draadpiraat, Digitakt I, OS 1.54, 12 November 2026: “running it right now its perfect”. The trig key reported with LL01 does not restart the loop: it retriggers the amp envelope, so at the default DEC the loop fades down (a known bug). Run time not stated. Report: [evidence/ll02-hardware.json](evidence/ll02-hardware.json).

## Not tested

- Stock 1.54 with an Overbridge instance open, to tell whether the lag is the module's.
- Audio content in the emulator: levels, the seam between loops, noise.
