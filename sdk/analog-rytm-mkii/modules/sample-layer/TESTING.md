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

## Build SL24 (0.1.0-experimental, commit 230c1b92f): the list on SMPL's ENGINE page

The review on #2253 asked to leave FUNC + SMPL to stock. SL22 to SL24 move the list to a third SAMPLE page (ENGINE, through `core_view_pages`). SL24: Modwerk's plain development base (dev, `6844766f`) plus sample-layer, sha256 `99cf7c7fccdddeb64597dd7e71c3880f0d7c7c01448e86b8296af9243a27a756`, ramSpare 48,136 B. RAM-booted over the USB link on 28 November 2026 (Analog Rytm MKII, OS 1.74); the flash kept an earlier test build.

Observed by the agent over the link (screen captures, SL22 to SL24):

- On SAMPLER, SMPL steps through stock's knobs, stock's waveform, then ENGINE (SL22, SL24).
- ENGINE shows the centred SAMPLE ENGINE window with the cursor on the track's engine; DOWN moves it to TRANSIENT (SL24).
- YES on TRANSIENT returns to SMPL's first page, which is TRANSIENT's page with the BAS/WID band (SL24).
- SMPL on TRANSIENT's page goes straight to ENGINE, over the waveform page (SL24).
- UP and YES on ENGINE set SAMPLER again and return to stock's first page (SL24).

Reported by @chevyone after playing SL23 and SL24: "Funciona bien" (the ENGINE page, YES returning to the engine's page, NO and FUNC + SMPL). This is the tester's single report.

## Build SL20 (0.1.0-experimental, commit 108b8e4a8)

Modwerk's plain development base (dev, `6844766f`) plus sample-layer, sha256 `3aa46eb277a64ad0196576ad041a11b9e41b6598e14dd3d19bfb7c7e539dceb8`, ramSpare 48,360 B. RAM-booted over the USB link on 28 November 2026 (Analog Rytm MKII, OS 1.74); the flash kept an earlier test build.

Observed by the agent over the link (screen captures): FUNC + SMPL opens the engine list as a panel like SRC's machine list, with SAMPLER and TRANSIENT only, the cursor's engine in the title bar; NO closes it onto TRANSIENT's page (PCH DEC BR SMP / BAS WID SHF LEV), with the BAS/WID band in rows 34 to 45 like the SHF dial, and the band stays under the open list (SC09, the same drawing code).

Reported by @chevyone after playing SL20: "all working on the transient". This is the tester's single report, not separate measurements. The cases they were asked to check:

| Case | Result |
| --- | --- |
| PCH right (snap) and left (soft attack) | reported working |
| DEC, and INF | reported working |
| BAS and WID | reported working |
| SHF | reported working |
| Back to SAMPLER: the sample as stock | reported working |
| Kit save and power cycle keep the engine and its settings | reported working |
| Every screen goes dark with the screen saver | @chevyone saw the list stay lit on SG03 (27 November 2026); fixed since, not rechecked on SL20 |
| A sound saved with a prototype engine (GRANULAR, SLICER) plays as SAMPLER | not tested |
| Beside other modules (LFO RND, Improved AMP, Improved SMPL) | not tested |
| Audio load | measured on SL21 (below) |

## Load, test build SL21 (28 November 2026)

SL20 with `-DSL_LOAD_READOUT`, which draws the peak of `core_audio_load` over each second in TRANSIENT's title bar (sha256 `666d96bbe6cddc146a419c5ab297664325e723e904968048f8854cd7d92ff698`, ramSpare 47,880 B). RAM-booted on @chevyone's MKII, OS 1.74; the agent read the screen over the link while the author played.

| Condition | Peak load |
| --- | --- |
| Stopped | 78 % |
| One pattern, 6 tracks on SAMPLER, one on TRANSIENT with every control neutral | 81 to 82 % |
| The same pattern, 7 tracks on TRANSIENT, every control away from neutral | 93 % |

About 11 points for 7 voices, 1.6 % of the block a voice. At 93 % the author found the screen and keys slow, as with stock's own load near the top.

## Test procedure: sample-layer 0.1.0-experimental, 2026-11-28

Build: revision `55b327d1380d`, package `sample-layer-SL20.syx` SHA-256 `3aa46eb277a64ad0196576ad041a11b9e41b6598e14dd3d19bfb7c7e539dceb8`. `npm run test:procedure -- analog-rytm-mkii:sample-layer --package /Users/chevyone/.modwerk/builds/sample-layer-SL20.syx`, 5 s. Emulator results are not hardware evidence; only what ran on the unit is.

| # | Step | Layer | Result | Command | Evidence |
|---|---|---|---|---|---|
| 1 | Software checks | host | passed | `npm run module:doctor -- sample-layer` | logs/01-software.log |
| 2 | Beside every other module | contract | not run: modules:compat compares the Octatrack's modules only; Analog Rytm MKII has no gate beside every other module yet: its link refuses two modules on one site, so link the image beside the modules it must work with |  |  |
| 3 | Name the build | host | passed |  | logs/03-build.log |
| 4 | DSP cost model | contract | not run: the DSP cycle scan models the Octatrack's DSP only |  |  |
| 5 | Emulator rehearsal | emulator | not run: no cases: write them in sdk/machines/analog-rytm-mkii/tools/cases/sample-layer/ (TEST_RUNNER.md) or pass --cases DIR |  |  |
| 6 | Read the unit | unit | not run: no --link: pass it to drive the unit over its development link (a RAM boot restarts it: with its owner's OK) | `python3 -B sdk/machines/analog-rytm-mkii/tools/rytm_link.py ident` |  |
| 7 | Scripted unit pass | unit | not run: no cases: write them in sdk/machines/analog-rytm-mkii/tools/cases/sample-layer/ (TEST_RUNNER.md) or pass --cases DIR |  |  |
| 8 | Soak | unit | not run: no soak for Analog Rytm MKII yet (scripts/octatrack-soak.mjs drives the Octatrack) |  |  |
| 9 | Cost on the unit | unit | read by hand on SL21 (SL20 with a load readout): 81-82 % without, 93 % with 7 voices on TRANSIENT (Load, above) |  |  |
| 10 | Put back | unit | not run: no --link: pass it to drive the unit over its development link (a RAM boot restarts it: with its owner's OK) | `python3 -B sdk/machines/analog-rytm-mkii/tools/rytm_link.py ident` |  |
| 11 | Agent by hand | unit | the list and TRANSIENT's page captured over the link on SL20 and compared with the README (media/) |  |  |
| 12 | Submitter's own stage | unit | @chevyone on SL20: "all working on the transient", kit save and power cycle included (Build SL20, above) |  |  |

#### Edge cases for this change

| Case | Why this change makes it a risk | How run | Result |
|---|---|---|---|
| SAMPLER plays bit for bit as stock | the voice mixer's call is patched for every voice | host test of the render on neutral settings; played on the unit | pass |
| SMPL through stock's pages to ENGINE and back | a page added to stock's SAMPLE view | on the unit, SL22 and SL24, captured | pass |
| YES on ENGINE, then SMPL on TRANSIENT's page | the module moves the view's page | on the unit, SL24, captured | pass |
| NO on ENGINE, and FUNC + SMPL | the list must leave stock's keys alone | on the unit, SL23 and SL24 | pass (reported) |
| A stock window (µTIME, RETRIG) over TRANSIENT's page | the band is drawn over stock's page | on the unit, SL14 | pass (reported) |
| Kit save and power cycle | the engine lives in mod storage | on the unit, SL20 | pass (reported) |
| Audio load with TRANSIENT on many voices | per-voice DSP in the audio interrupt | SL21's readout | pass: 93 % with 7 voices, the UI slow there |
| A sound saved with a prototype engine | GRANULAR and SLICER are hidden | reasoned: no released sound can hold one | not run: only the author's test kits hold one |
| Beside other modules (LFO RND, Improved AMP, Improved SMPL) | shared SMPL pages and audio time | not run yet | not run: no set with them built yet |

#### Left for the submitter at their unit

- how it sounds and plays, and timing by ear
- MIDI, scenes and recording with it
- it beside the other modules installed on their unit
- two instances with different settings, on both FX slots and both DSP cores where it can (docs/MODULE_QUALIFICATION.md)
- Part reload, project save and reload, and a power cycle with it saved: what survives (the Keep and the power cycle are theirs)
