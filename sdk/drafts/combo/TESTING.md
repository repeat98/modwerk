# Combo testing

What was run, on which build, and what it showed. "Not tested" means exactly that. Emulator and hardware runs are kept apart, and neither the renders nor the emulator are hardware evidence.

## Build history

- **First commit** (07affc34f): 381.2 instructions a sample. Rendering a guitar DI through it showed the output hard-clipping (up to 3.6 % of samples at GAIN 127 with a cabinet) and 22 dB between GAIN 0 and GAIN 127.
- **This build:** GAIN's level is compensated after the curve (1/√G, a 128-word table), a 10 Hz DC blocker follows the cabinet, LEV folded into that gain, and the biquads use parallel moves. 394.8 instructions a sample.

## Render gate (dsp_host, 25 November 2026, this build)

`python3.12 verify.py` with the vendored dsp56300 tools (`~/.cache/modwerk-upstream/octabam`). No firmware is read: the assembly runs from a synthetic memory image with the table at P:0x3000.

- Every product decodes as the signed `mpy`/`mac x0,y1` form (36 of 36), there is no `rep`, the state and the coefficient copy stay inside X:(r7+$00..$5f), and the assembly carries tables.py's constants.
- Bit for bit against reference.py's fixed-point model: stereo noise at the defaults; a loud 220 Hz tone at the dearest setting; every CAB; automation over every knob's range; a 5-frame trig split every block; a GAIN word carrying an LFO's fraction bits; garbage state before init; a stored CAB of 9 (plays 4X12); two instances with their own knobs.
- Silence in gives exact silence out at four settings, and a burst at the dearest setting ends in exact silence.
- At CAB OFF, the render matches the float design (reference.float_combo) at 1 kHz within 0.01 dB.
- 394.8 instructions a sample, the same at every setting.

Traps hit and fixed on the way: `lua (r7+$40)` assembled as `(r7-$40)` (lua offsets reach ±63); the label `cmb_seed` prefixed `cmb_seeded` and sent a branch astray; and the cabinet's resonant high-pass froze a truncated offset in its dead band (up to −35.7 dBFS of DC after the input stopped), which the DC blocker and the new tail gate now cover.

## Guitar renders (dsp_host, this build)

The developer's own clean guitar DI, without and with a stereo chorus (13.5 s each, 44.1 kHz, peaks about −12 dBFS), rendered with `render.py` at six settings. The files stay on the developer's computer. Measured, not listened to:

| Setting | RMS out, DI / chorus (dBFS) | Clipped samples |
| --- | --- | --- |
| GAIN 0, 2X12 | −27.0 / −28.1 | 0 |
| defaults (GAIN 40, 1X12) | −19.4 / −19.9 | 0 |
| GAIN 90, 4X12, TREB −12 | −22.6 / −22.7 | 0 |
| GAIN 127, MID +20, BASS −8, 2X12 | −24.1 / −24.2 | 0 |
| GAIN 70, 1X10 | −20.7 / −20.9 | 0 |
| GAIN 70, CAB OFF | −21.8 / −22.1 | 0 |

The DI itself is −24.4 dBFS RMS. How they sound: not judged yet (the developer's to say).

## Sound quality (npm run fx:audit, dsp_host renders, this build)

DC is below −126 dBFS on every tone, nothing reaches the rails, and after the input stops the output is digital silence. **Aliasing fails the audit's −60 dBc at every drive above the gentlest:**

| Setting | 1.1 kHz −12 dBFS | 1.1 kHz −1 dBFS | 2.7 kHz −1 dBFS | 5.3 kHz −1 dBFS | 9.1 kHz −1 dBFS |
| --- | --- | --- | --- | --- | --- |
| defaults (GAIN 40) | −62.6 | −40.0 | −23.1 | −12.9 | +9.6 |
| GAIN 70 | −47.2 | −26.9 | −20.9 | −11.5 | +10.8 |
| every knob at its top | −29.3 | −24.9 | −21.9 | −5.6 | +20.3 |

dBc is against the output's fundamental, which the cabinet cuts hard above 4 kHz, so the top two tones read worse than they sound. The curve runs at 44.1 kHz with no oversampling: a hard-driven tone becomes nearly square, and its harmonics past 22 kHz fold back. Open: what to do about it (TESTING is updated when decided). Not run yet: sums to mono, knob compare, clicks.

## In the emulator (ot_emu, 25 November 2026, this build)

Adapted `ot_emu` (scripts/octatrack-emulator/build.py) on a development twin of base 0.3.1-modwerk-dev.1 built from the developer's own OS 1.40C (`build_core.py --dev` with the beta flags). Emulator results, not hardware evidence.

- **Trial:** the package (declared 382, then 395 executed cycles, 96 state words) installed and ran for 60 s with the DSP slot running, no refusals and no crash, stall, freeze or skipped track. The trial's rollback ended `needs-recovery`; the released Mackity package does the same on this emulator and twin, so it is the emulator's, not COMBO's.
- **Admission:** a 425-cycle build was refused at verify (loader refusal 6, `RUNTIME_CYCLES`): the base charges an emulator figure at 7/4 against 726 chip cycles (3,120 less seven stock slots at 342), so an executed figure above about 414 does not install. This build's 395 installs.
- **Screens** (`tools/emu_session.py`, empty scratch card, MKII panel): COMBO is the last row of track 1's FX1 list, after LO-FI; YES picks it; FX1 draws GAIN, BASS, MID, TREB, CAB and LEV, BASS and MID centred; turning A moves GAIN from 40 to 90 and prints it; FUNC + FX1 shows an empty SETUP page. FX2, other tracks, locks, LFOs and scenes: not run.
- **The test procedure** (`npm run test:procedure`): stops at step 1 because module:doctor refuses the FX2 id (no card id is free), so steps 2 to 11 have not run.

## On the unit

Not tested.

## Stock flows

Not tested.

## Performance

394.8 instructions a sample in dsp_host. Stock SPRING REV is about 314 (docs/OCTATRACK_ELEKLOADER_MIGRATION.md), so COMBO is about 1.26 times its cost; the base charges it 691 of an effect's 726 chip cycles until a hardware figure replaces the 7/4. Not yet measured: the static floor (cycle_count.py), evidence/performance.json, the stress run and the CPU price on a unit.
