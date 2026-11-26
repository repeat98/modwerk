# Combo testing

What was run, on which build, and what it showed. "Not tested" means exactly that. Emulator and hardware runs are kept apart, and neither the renders nor the emulator are hardware evidence.

## Build history

- **First commit** (07affc34f): stereo, 381.2 instructions a sample. A guitar DI rendered through it hard-clipped the output (up to 3.6 % of samples) and jumped 22 dB between GAIN 0 and 127.
- **f866bef57:** GAIN's level compensated after the curve, a 10 Hz DC blocker after the cabinet, LEV folded into that gain, parallel moves in the biquads: 394.8. The audit then showed strong aliasing even at the default GAIN with loud input.
- **This build:** one mono amp, (L + R)/2 to both sides, with the curve at 2x through a polyphase half-band (four all-pass coefficients, halfband.py): 331.8 instructions a sample. The developer chose mono over keeping stereo without oversampling.

## Render gate (dsp_host, 25 November 2026, this build)

`python3.12 verify.py` with the vendored dsp56300 tools (`~/.cache/modwerk-upstream/octabam`). No firmware is read: the assembly runs from a synthetic memory image with the table at P:0x3000.

- Every product decodes as the signed `mpy`/`mac x0,y1` form (49 of 49), there is no `rep`, the state and the coefficient copy stay inside X:(r7+$00..$5f), and the assembly carries tables.py's constants, the half-band's included.
- Bit for bit against reference.py's fixed-point model: stereo noise at the defaults; a loud 220 Hz tone at the dearest setting; every CAB; automation over every knob's range; a 5-frame trig split every block; a GAIN word carrying an LFO's fraction bits; garbage state before init; a stored CAB of 9 (plays 4X12); two instances with their own knobs.
- Silence in gives exact silence out at four settings, and a burst at the dearest setting ends in exact silence.
- At CAB OFF, the render matches the float design (reference.float_combo, the same mono 2x chain) at 1 kHz within 0.00 dB.
- 331.8 instructions a sample, the same at every setting.

Traps hit and fixed on the way: `lua (r7+$40)` assembled as `(r7-$40)` (lua offsets reach ±63); the label `cmb_seed` prefixed `cmb_seeded` and sent a branch astray; the cabinet's resonant high-pass froze a truncated offset in its dead band (−35.7 dBFS of DC after the input stopped), which the DC blocker and the tail gate now cover.

## Guitar renders (dsp_host, this build)

The developer's own clean guitar DI, without and with a stereo chorus (13.5 s each, 44.1 kHz, peaks about −12 dBFS, the DI at −24.4 dBFS RMS), rendered with `render.py`. The files stay on the developer's computer. Measured, not listened to:

| Setting | RMS out, DI / chorus (dBFS) | Clipped samples | L = R |
| --- | --- | --- | --- |
| GAIN 0, 2X12 | −27.0 / −28.9 | 0 | yes |
| defaults (GAIN 40, 1X12) | −19.4 / −20.3 | 0 | yes |
| GAIN 90, 4X12, TREB −12 | −22.6 / −22.8 | 0 | yes |
| GAIN 127, MID +20, BASS −8, 2X12 | −24.1 / −24.2 | 0 | yes |
| GAIN 70, 1X10 | −20.7 / −21.0 | 0 | yes |
| GAIN 70, CAB OFF | −21.9 / −22.3 | 0 | yes |

How they sound: not judged yet (the developer's to say).

## Sound quality (npm run fx:audit, dsp_host renders, this build)

DC is below −132 dBFS on every tone, nothing reaches the rails, and after the input stops the output is digital silence. Sums to mono: the two sides are identical. Every knob's two ends, and every pair of cabinets, differ on noise (`compare`: no pair "same").

Aliasing in dBc (the audit's limit is −60). A track's audio usually reaches its FX near −12 dBFS (AMP VOL); the −1 dBFS rows are a hot input:

| Setting | 1.1 kHz −12 | 1.1 kHz −1 | 2.7 kHz −12 | 2.7 kHz −1 | 5.3 kHz −12 | 9.1 kHz −12 |
| --- | --- | --- | --- | --- | --- | --- |
| defaults (GAIN 40), 2x | −79.9 | −63.5 | −67.3 | −37.6 | −42.4 | −33.8 |
| defaults, before 2x | −62.6 | −40.0 | −45.1 | −23.1 | −24.3 | −4.6 |
| GAIN 70, 2x | −69.6 | −41.2 | −57.0 | −29.7 | −26.0 | −11.9 |
| every knob at its top, 2x | −52.8 | −32.8 | −33.7 | −30.1 | −11.9 | +4.5 |

2x takes 15 to 30 dB off; what remains is harmonics past 66 kHz, which a 2x filter cannot stop (a float prototype with six coefficients, −85 dB, measured the same as four). Loud, bright tones at high drive still fail, and the dBc of the top tones reads worse than it sounds because the cabinet cuts their fundamental. A fifth-order curve was measured too and gained little at high drive, so the curve stays.

## In the emulator (ot_emu, 25 November 2026, this build)

Adapted `ot_emu` (scripts/octatrack-emulator/build.py) on a development twin of base 0.3.1-modwerk-dev.1 built from the developer's own OS 1.40C (`build_core.py --dev` with the beta flags). Emulator results, not hardware evidence.

- **Install:** the package (332 executed cycles declared, 96 state words, 668 DSP words) was accepted on the emulator's scratch card with no crash, stall, freeze or skipped track.
- **Admission:** a 425-cycle build was refused at verify (loader refusal 6, `RUNTIME_CYCLES`): the base charges an emulator figure at 7/4 against 726 chip cycles (3,120 less seven stock slots at 342), so an executed figure above about 414 does not install. This build is charged 581.
- **Trial rollback:** a 60 s trial of an earlier build ran without fault, but its rollback ended `needs-recovery`; the released Mackity package does the same on this emulator and twin, so it is the emulator's, not COMBO's.
- **Screens** (`tools/emu_session.py`, empty scratch card, MKII panel): COMBO is the last row of track 1's FX1 list, after LO-FI; YES picks it; FX1 draws GAIN, BASS, MID, TREB, CAB and LEV, BASS and MID centred; turning A moves GAIN from 40 to 90 and prints it; FUNC + FX1 shows an empty SETUP page. FX2, other tracks, locks, LFOs and scenes: not run.
- **The test procedure** (`npm run test:procedure`): stops at step 1 because module:doctor refuses the FX2 id (no card id is free), so steps 2 to 11 have not run.

## On the unit (25 November 2026)

The developer's Octatrack over USB, its flashed base `eb667962` with 12 modules kept; the development twin `5d2fe44d` (base 0.3.1-modwerk-dev.1, built from main at the draft's commit) RAM-booted for the run, nothing written to the flash or the card. Package `combo.mwrm`, source 4ae76341a, SHA-256 `2c0e88f0ba9d21ec89141b1c72e139b171928c1f33d1e3b6eb48a543cf13b39b`, declared 332 executed cycles and 96 state words.

**Stage 1, the agent (hardware evidence for what it measured, not for the sound or a power cycle):**
- Preflight: transport stopped, bank A pattern 01 Part 1, working copy equal to its saved one; twin inventory empty.
- `npm run device:test`: passed. Self-test passed (longest frame 430 us); COMBO on FX2 of T1 admitted in 114 ms, peak 453 per mille of a frame, and of T5 in 115 ms, peak 531; seven COMBOs at once ran while playing (CPU 370, core peaks 801 and 764 per mille) and the eighth was refused for CPU, as the base should; 12 of 12 Part switches ran their effects; the inventory ended as it began. The scene was a fresh project with no trigs, so these frame figures are for an empty pattern.
- `npm run device:price -- --write` (same scene): at rest frame +0, CPU +0; in use frame +0, CPU +0.6, DSP +11.6 % on its core (resources.cpuPrice, evidence/cpu-price.json).
- By hand, the panel over USB: COMBO is the last row of track 1's FX1 list after LO-FI; YES picks it; FX1 draws GAIN, BASS, MID, TREB, CAB and LEV; A turned GAIN to 90 and printed it; FUNC + FX1 shows an empty SETUP page; T1's FX1 was put back to FILTER before the trial ended, and the trial rolled back with no crash, stall, freeze or skipped track.
- Not run on the unit: the soak, MAIN and CUE recorded over USB, parameter locks, LFOs, scenes, FX2 by hand, a stereo sample, the frame-cost curve, and the release run (`device:qualify`, which Keeps).

**Stage 2, the developer (as reported):** listened for about 15 minutes in a 30-minute trial with their guitar sample on T1: "suena bien para un primer intento". No dropouts were reported. The trial was then ended at the developer's request and rolled back cleanly; nothing was kept. Not reported on: each knob, clicks, the cabinets one by one, locks, LFOs, scenes, a power cycle.

**A missing module (as reported):** the trial ended while bank A track 1's FX1 still named COMBO. After the developer's power cycle back to the flashed base `eb667962`, the unit reported missing modules for that project; nothing failed, and picking FILTER on T1's FX1 clears it. What the track played meanwhile (SEND or NONE) was not checked.

## Stock flows

Not tested.

## Performance

331.8 instructions a sample in dsp_host, about 1.06 times stock SPRING REV's 314 (docs/OCTATRACK_ELEKLOADER_MIGRATION.md). The base charges it 581 of an effect's 726 chip cycles until a hardware figure replaces the 7/4. Not yet measured: the static floor (cycle_count.py), evidence/performance.json, the stress run and the CPU price on a unit.
