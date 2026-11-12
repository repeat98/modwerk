# APPLY SCENE hardware report

## 0.2.0: TRIG + SCENE (23 October 2026)

- **Tester:** npp1993 (the contributor) and the coding agent driving the unit over USB.
- **Unit:** Octatrack MKII, OS 1.40C, flashed main base `a408c505…`.
- **Source and package:** commit 2ebc3f72; USB package SHA-256 `5b1db5c76dabfd3023c0d2a81d53fac43610fa579142870190f7ca41c89c2ed1`, 2,282 bytes, installed with the device tool's `try` (accepted at once).

| Check | Result |
| --- | --- |
| Agent, on a RAM-booted development twin of main's base (`8dc7692c…`), bank P pattern 16, T3 AMP page, values read back over USB | |
| TRIG + SCENE A | step 1 got exactly scene A's two locks, the trigs stayed, SCENE A TO TRIGS: pass |
| TRIG + SCENE A + B, crossfader 76 | the morph model's values; XVOL (no p-lock exists) skipped: pass |
| The same press again | NOTHING TO LOCK, nothing changed: pass |
| A trig, or a knob, inside the gesture | scene selected, or scene lock written; no p-lock, no toast: pass |
| Three trigs + SCENE B; trig released first; scene A muted | all written as expected: pass |
| TRIG + PLAY (stock) | the step's p-locks cleared: pass |
| Playback | T3's live AMP lane took each step's p-locks in turn: pass (not listened to) |
| Removal | the three sites read stock's bytes again: pass |
| User, by hand, on the flashed base beside seven other modules | |
| One scene and the blend onto trigs | pass |
| Playback, listened to | pass |
| Project save, then a power cycle | the p-locks kept: pass |
| A trig or knob inside the gesture | stock's meaning, no p-lock: pass |
| TRIG + PLAY | cleared: pass |

Limits: one unit; MKI not tested; nothing timed; the card build not flashed; the site's review/Keep/Undo flow not used; MIDI mode, trig pages past the first and pattern or Part changes inside the gesture not tested. SCENE + YES did not change in 0.2.0 and was tested on hardware with 0.1.0's package (below).

## 0.1.0 (15 October 2026)

- **Tester:** npp1993 (the contributor), 15 October 2026.
- **Unit:** Octatrack MKII, OS 1.40C, Modwerk beta base (flashed base acf91e0a…; the first install went to a RAM-booted base e8601162…).
- **Source and package:** commit ae2a6eed; USB package `apply-scene-ae2a6eed.mwrm`, 758 bytes, SHA-256 `c63e2868e39669a3b22f0077923f9d542a521f73a75f5844fe62646d1382d163`, loaded with `npm run device -- try … [--accept]` and removed with `remove … --accept`.

## Results

| Check | Result |
| --- | --- |
| Trial without Keep (`try --seconds 15`) | rolled back to the base (an earlier run of da2d18e4's package, the same loader path) |
| Keep (`try --accept`) | installed; the unit lists APPLY SCENE |
| SCENE A + YES, SCENE B + YES | the locked values written into the Part: pass |
| Both scene keys + YES, crossfader in the middle | the blended values written: pass |
| Editing from the applied values | pass |
| XVOL and XLV | stay scene locks: pass |
| NOTHING TO APPLY | a repeat apply, a scene with no locks, the blend with both scenes muted: pass |
| Removal (`remove --accept`) | SCENE + YES arms tracks again, nothing applied: pass (da2d18e4's package) |
| Power cycle on the flashed base | after an apply, Part SAVE and PROJECT SAVE: APPLY SCENE still installed, the applied values in the Part, the scenes as before: pass |

## Limits

- The current source (a90849c9) changes only manifest.py after ae2a6eed: the card build links the unit in the DRAM reserve. Its USB package carries the same code; the published package `0.1.0-experimental.mwrm` (SHA-256 `bd90b397d9dffa8d0159355baf4363e73da7bf18fd6a30624eb9fbdd2d76fb73`) differs from the tested one only in its 16-byte display name (Apply Scene, not APPLY SCENE). It has not been functionally tested on the unit.
- Install only, not a functional test: the published package bd90b397… was installed and kept on the user's MKII (flashed base 38a0bde1, generation 7) beside LOFI2, Quantize Live Rec and one private module, and the unit listed it as Apply Scene (module 103be957). On 20 October 2026 it was installed and kept again on the same MKII on a private test base (2f575d3e); again an install only, no functional run.

- Values watched on the screen; audio not checked, nothing recorded or timed. No click or freeze was noticed.
- One unit, one short session, by the contributor.
- USB only for this source; the card build was not flashed.
- APPLY SCENE alone on the base; pattern and Part changes, the arranger and sequencer ACT commit around an apply were not tested.
- The trial-rollback and removal rows ran on the da2d18e4 package, which differs only in the NOTHING TO APPLY toast; the other rows on ae2a6eed's.
