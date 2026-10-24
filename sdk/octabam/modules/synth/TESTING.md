# FM Synth 0.1.3 testing

Experimental 0.1.3 changes how FM Synth takes the OT's modulation: LFOs and scenes on AMP ATK/HOLD/REL, the depth of an LFO on PTCH, and scenes on VOIC, CHRD and RATO. Everything else is 0.1.2, and its report is kept in [evidence/release-0.1.2/TESTING.md](evidence/release-0.1.2/TESTING.md). Chip worst-case timing and complete stack and memory bounds remain unmeasured. The hardware results below are reported by the tester, not verified by a reviewer.

## What changed and why

All changes are in `upstream/synth/poly.s`. They add no new hook sites, pokes or tables. A per-track snapshot (`po_amp`, 64 bytes) is added.

1. **Envelope.** Since plan B the engine runs the AMP envelope itself. `sy_ison` writes ATK 0 / HOLD INF / REL INF into the DSP voice record every frame. The engine read ATK/HOLD/REL from the live lane (`CURVALS + 72 t + 12..14`), which holds the Part's bytes with the trig's locks but no scene morph and no LFO. Those write the voice record's halfwords 0–2 (octabam `docs/firmware/LFO.md` §5, `MIDI.md` App. C), and the override erased them. Now `po_amp_snap` keeps the record's high bytes in `sy_cold` and in `sy_ison` before the override, and `po_amp_at` serves the five readers. Until a track has a snapshot it falls back to the lane.
2. **Pitch.** On a synth track one PTCH unit is a semitone, and `sy_word` stretches the record's PTCH word ×5. An LFO adds to that word in the stock unit (1/5 semitone), so its swing was stretched too. `po_lfo3_depth`, the existing detour at the LFO engine's depth read (both copies), now divides the depth by 5 on a synth track when the LFO's PMTR is PTCH. Full DEP counts as 0x8000, as stock's +256 makes it. The PTCH knob, locks and scenes keep their semitone units.
3. **VOIC and CHRD.** Their readers (`sy_warm`, `po_st_note`, the held-chord path) used the lane, so scene locks never arrived.
4. **Scenes as counts.** VOIC (voices), CHRD (chord shape) and RATO (ratio table position) are discrete. The morph interpolates every scene byte, so a crossfade would sweep through the voice counts, shapes and ratios in between. They now jump:
   - **Which value:** the nearer scene's value, scene A at fader ≥ 64. A scene that doesn't lock the slot, or is switched off (`0x80000006` A, `0x80000007` B, read from the morph at `0x4000cc6c`), gives the knob's value, as the morph treats it at its end.
   - **Where it is read:** `po_scene_jump` reads the morph's working copy (`0x80000ed4 + 64 t`, [A, B] per slot) and the fader (`0x460d16c8`).
   - **RATO:** read every frame, so it switches on a sounding note. `po_ratio_word` takes the morph's part out of the record, `(eA·xf + eB·(127 − xf)) << 8 / 127`, and puts the nearer scene's value in. What LFOs added stays.
   - **VOIC and CHRD:** take effect at the next note start, as before.

## Package

Built with `sdk/runtime/loader/build.py --octabam-machine synth --stock <OS 1.40C>`: 26,660 bytes, module `e8c3e4fa`, package SHA-256 in `evidence/lfo-regressions.json`. The strict stock-free scan passes. The machine recipe was recaptured for the new image (`--capture-stock-recipe`; 38 copies, addresses, lengths and hashes only), and the `poly.s` hash in `machine-ports.json` is updated. Before the change, the published 0.1.2 package rebuilt byte for byte from main.

## Emulator measurements

Setup:
- **Emulator:** the adapted `ot_emu` from `scripts/octatrack-emulator/build.py`, because the upstream emulator refuses USB installs as BUSY. It runs the flashed beta base `cd39c494`, and each package is installed over emulated USB.
- **Project:** a template project with T1 set to FM SYNTH by panel input (INDX 0, a sine), trigs on 1/5/9/13 at 120 BPM, and LFO1 set in the project file.
- **Interactive play:** needs `--mount`, CLOCK RECEIVE cleared (`0x80000028` bit 0) and `frame on`.
- **Measurement:** T1's stem (`audio start tracks`).

Sanitized results are in `evidence/lfo-regressions.json`.

| Case | 0.1.2 | 0.1.3 |
| --- | --- | --- |
| Square → PTCH, DEP 10, constant +1 | +10.0 semitones | +2.0 semitones (as FLEX) |
| Square → PTCH, DEP 10, moving | n/a | ±2.0 semitones |
| Square → REL 30, DEP 60, HOLD 8, constant +1 | every note 25 ms: the LFO is ignored | τ ≈ 0.45 s, the engine's REL 90 law |
| Square → REL 30, DEP 60, moving | n/a | alternates REL 90 / REL 0 |
| Part VOIC 3 + CHRD, no scenes | chord | bit-identical to 0.1.2 |
| Mono with a PTCH LFO, no scenes | n/a | bit-identical to the first fixed build |

The sample jumps at each trig on held notes are the same in both versions: the existing retrigger dip.

## Hardware (reported, not verified)

Tested by Jan Kolkmeier (@jankolkmeier) on 24 October 2026:
- **Unit:** Octatrack MKII, OS 1.40C, flashed beta base `cd39c494`, packages over USB.
- **Module set:** Sidechain Compressor 0.1.2 and Preview Vol 0.1.2, the draft Deja Vu, and earlier also Mute Modes 0.2.1.

Results come from four builds of this series; the build each result comes from is in `evidence/lfo-regressions.json`.

**Envelope and pitch:**
- LFOs on ATK, HOLD, REL and PTCH behave as on a FLEX track. On 0.1.2 they had no effect, and pitch swung far too wide.
- Scenes on ATK/HOLD/REL work.

**VOIC, CHRD and RATO:**
- Scene locks and p-locks on VOIC and CHRD work.
- VOIC, CHRD and RATO switch once at the crossfader's midpoint, and a scene without the lock plays the knob value.
- An LFO on RATO still steps around a scene-locked RATO.

**Stability:**
- No clicks, stuck notes or hangs.
- A power-cycle restore of a set with the envelope/pitch build and an FM track plays.

**Compared with FLEX:** an A/B against a FLEX track on the same unit matches stock in three cases:
- CHROMATIC keys under a PTCH scene lock;
- CHROMATIC keys while stopped with an LFO on PTCH;
- the PTCH knob bending a sounding p-locked note.

## Not tested

- Chip worst-case cycles and complete stack and memory bounds; the cost is a few dozen instructions per synth track and frame, not measured.
- MKI, maximum simultaneous FM tracks and MIDI note input with these changes.
- The scene-off flags on hardware, read from the code only.
- Saved-project reload across versions with an LFO on an FM track's PTCH. It still loads, but swings one fifth as far.

## Repository validation

`python3 -B -m unittest sdk/tests/test_synth_release.py`, `npm run module:doctor -- synth` and `npm run pr:ready`: results are in the pull request.
