# Combo testing

What was run, on which build, and what it showed. "Not tested" means exactly that. Emulator and hardware runs are kept apart, and neither the renders nor the emulator are hardware evidence.

## Build history

- **First commit** (07affc34f): stereo, 381.2 instructions a sample. A guitar DI rendered through it hard-clipped the output (up to 3.6 % of samples) and jumped 22 dB between GAIN 0 and 127.
- **f866bef57:** GAIN's level compensated after the curve, a 10 Hz DC blocker after the cabinet, LEV folded into that gain, parallel moves in the biquads: 394.8. The audit then showed strong aliasing even at the default GAIN with loud input.
- **4ae76341a:** one mono amp, (L + R)/2 to both sides, with the curve at 2x through a polyphase half-band (four all-pass coefficients, halfband.py): 331.8 instructions a sample. The developer chose mono over keeping stereo without oversampling. This is the build that ran on the unit (below).
- **This build:** VOIC on the SETUP page (slot 6), four amp voices the developer asked for (CLEAN, BRIT, HGAIN, SOLID), each a 16-word table row: the pre high-pass, the pre low-pass carrying the voice's drive, the curve and its bias, the tone stack's splits and weights, the level. 342.4 instructions a sample. A first version put the voice's drive after the 2x stage, where an extreme input could have overflowed the accumulator (worst case 291 of 256 in HGAIN); the drive now sits in the pre low-pass, whose store limits it, and the product stays under 160. Commit a2fbb215e.
- **This build:** the rest of page 2 the developer asked for: TGHT (slot 7, the voice's pre high-pass times (t+16)/80), PRES (slot 8) and MIC (slot 9), which move each cabinet's second and third biquads toward a presence and an off-axis version (the coefficients interpolated once a call; the stable region is convex, so every step between two stable filters is stable, checked on every cabinet), and MIX (slot 10, dry to wet, gliding). 369.1 instructions a sample, about 1.18 times SPRING REV; MIX takes 21 of the 27 added, the rest run once a call. The cabinet row grew to 25 words; the first build still stepped CAB rows by 15, which the bit-exact gate caught. Commit 8a97a9c58.
- **This build:** the developer asked for the voices named in Ableton's generic style and for the mic split in two, as Ableton's Cabinet does (near on axis, near off axis, far). BRIT is now BOOST and HGAIN ROCK (the same sound), and a fifth voice, BASS, is new; MIC is now AXIS (slot 9), DIST (slot 10) is new and MIX moves to slot 11. DIST reads four early reflections (6 to 18 ms, two a side, opposite signs) from a 1,024-word modulo ring at the slot's allocator base + $400, so COMBO now reads the allocator (`Claims(stock_instance_buffer=True, buffer_words=2048)`); the reflections stay silent until the ring has been written once. 392.6 instructions a sample, about 1.25 times SPRING REV. Two bugs the gates caught on the way: the table offsets of CAB and COMP were not moved for the fifth voice (a new gate checks them against tables.py), and verify.py's allocator table sat one word off (X:$256 instead of dsp_host's X:$255), so every instance read the next one's base until it was fixed. Commit cdb8e1cbf.
- **This build (optimised):** the same arithmetic in fewer instructions, so reference.py did not change and every render is the same bit for bit. The 40 constants the sample loop reads (the pre filters', the half-band's, the curves', the tone splits', the cabinet's, KDC) now sit in a Y block at the slot's base + $100, in the order they are read, so each product reads its state from X and its coefficient from Y in one instruction; the state is walked with r3, the glides are pipelined two at a time. 392.6 to 309.7 instructions a sample, counted per section: the eight all-passes with their scratch moves 88 to 65, the four biquads 80 to 52, the glides 38 to 28, the two curves 48 to 40, the tone stack 36 to 29, the high-pass 19 to 14, the DC blocker 13 to 8.
- **This build (coefficients in private memory):** on the unit the optimised build failed device:test: with seven COMBOs at once core 0 (T5-T8) peaked at 995 per mille, over the 900 limit, while the build before page 2 peaked at 764 on the same Part. One FX2 instance on core 0 gets its buffer in the shared window, where the 40 coefficient reads a sample cost about twice as much. The block moved into the instance's own X state ($4e..$75, 118 state words of the base's 132); each coefficient is now read by its own X move, 28 of them one instruction more. 309.7 to 337.7 instructions a sample, the same sound bit for bit; only DIST's ring stays in the buffer (five accesses a sample). On the unit it passed (below).

## Render gate (dsp_host, 26 November 2026, this build)

`python3.12 verify.py` with the vendored dsp56300 tools (`~/.cache/modwerk-upstream/octabam`). No firmware is read: the assembly runs from a synthetic memory image with the table at P:0x3000.

- Every product decodes as the signed `mpy`/`mac x0,y1` form (53 of 53), there is no `rep`, the state and the coefficient copies stay inside X:(r7+$00..$5f) (they end at $5a), the GAIN product before the limit cannot pass 160 of the accumulator's 256, and the assembly carries tables.py's constants, the half-band's included.
- Bit for bit against reference.py's fixed-point model: stereo noise at the defaults; a loud 220 Hz tone at the dearest setting; every CAB; automation over every knob's range; a 5-frame trig split every block; a GAIN word carrying an LFO's fraction bits; garbage state before init; a stored CAB of 9 (plays 4X12); two instances with their own knobs; each VOIC with a loud tone, the tone knobs off centre and DIST at 90; VOIC automation, including a stored VOIC of 9 (plays BASS); TGHT, PRES, MIC and MIX at their ends and between, alone and together; page 2 automation with a trig split every block, DIST included. MIX 0 gives the dry input back bit for bit.
- DIST's ring: an FX1 instance (allocator entry 0, Y:$1000) and two FX2 instances (Y:$4000, Y:$8000) render bit for bit, and dsp_host's guard sees every write inside the slot's own buffer, inside its first 2,048 words (a 1,024-word window, tried by hand, flags the ring, so the guard does look).
- Silence in gives exact silence out at nine settings (each voice at GAIN 127 among them, and page 2 turned up), and a burst at the dearest setting, PRES 127, AXIS 64, DIST 127, MIX 90, ends in exact silence in every voice.
- The render matches the float design (reference.float_combo, the same mono 2x chain) at 1 kHz within 0.00 dB in every voice at CAB OFF, and with PRES, AXIS, TGHT, MIX and DIST turned.
- 337.7 instructions a sample, the same at every setting and voice. The sample loop reads the coefficient block in X exactly once through (40 reads, a gate) and reads nothing from the buffer but DIST's ring.

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

The four voices (this build), the DI, output RMS in dBFS at four GAIN settings, CAB 1X12, the tone knobs centred; no clipped samples in any:

| VOIC | GAIN 0 | GAIN 40 | GAIN 90 | GAIN 127 |
| --- | --- | --- | --- | --- |
| CLEAN | −30.7 | −20.9 | −21.5 | −23.3 |
| BRIT | −27.7 | −20.2 | −23.2 | −25.4 |
| HGAIN | −24.8 | −19.9 | −23.9 | −26.3 |
| SOLID | −31.0 | −20.8 | −21.1 | −22.9 |

Ten renders for listening, both files in each voice (CLEAN GAIN 20 1X12, BRIT GAIN 40 and 85 2X12, HGAIN GAIN 100 4X12, SOLID GAIN 30 2X12), stay on the developer's computer.

The developer listened to the ten renders (26 November 2026, as reported, on build a2fbb215e): "They sound good." No voice to adjust. Not reported on: each knob in each voice, clicks when VOIC switches.

Page 2 (build 8a97a9c58): five renders of the DI (BRIT PRES 100; HGAIN TGHT 110 MIC 80; HGAIN TGHT 20; HGAIN GAIN 127 MIX 60; CLEAN PRES 80 MIC 40), on the developer's computer. The developer, as reported: "me gusta", and asked for the mic split into axis and distance.

This build: six renders of the DI (BOOST GAIN 60 2X12 at DIST 0, 64 and 127; CLEAN AXIS 100 DIST 100; ROCK DIST 90; BASS GAIN 50 4X12), on the developer's computer. Not listened to yet. BASS on the DI at four GAIN settings: −27.4, −19.1, −21.9, −24.1 dBFS, with the other voices.

## Sound quality (npm run fx:audit, dsp_host renders, this build)

DC is below −132 dBFS on every tone, nothing reaches the rails, and after the input stops the output is digital silence. Sums to mono: the two sides are identical. Every knob's two ends, and every pair of cabinets, differ on noise (`compare`: no pair "same").

Aliasing in dBc (the audit's limit is −60). A track's audio usually reaches its FX near −12 dBFS (AMP VOL); the −1 dBFS rows are a hot input:

| Setting | 1.1 kHz −12 | 1.1 kHz −1 | 2.7 kHz −12 | 2.7 kHz −1 | 5.3 kHz −12 | 9.1 kHz −12 |
| --- | --- | --- | --- | --- | --- | --- |
| defaults (GAIN 40), 2x | −79.9 | −63.5 | −67.3 | −37.6 | −42.4 | −33.8 |
| defaults, before 2x | −62.6 | −40.0 | −45.1 | −23.1 | −24.3 | −4.6 |
| GAIN 70, 2x | −69.6 | −41.2 | −57.0 | −29.7 | −26.0 | −11.9 |
| every knob at its top, 2x | −52.8 | −32.8 | −33.7 | −30.1 | −11.9 | +4.5 |

Per voice (this build), each at the GAIN it is rendered at for listening, CAB 1X12:

| Setting | 1.1 kHz −12 | 1.1 kHz −1 | 2.7 kHz −12 | 2.7 kHz −1 | 5.3 kHz −12 | 9.1 kHz −12 |
| --- | --- | --- | --- | --- | --- | --- |
| CLEAN, GAIN 20 | −81.3 | −81.9 | −81.0 | −71.7 | −90.0 | −52.1 |
| BRIT, GAIN 40 | −74.6 | −59.7 | −57.8 | −34.3 | −45.1 | −56.0 |
| HGAIN, GAIN 100 | −44.2 | −32.1 | −29.5 | −27.4 | −21.5 | −26.8 |
| SOLID, GAIN 30 | −75.2 | −61.8 | −65.4 | −49.9 | −55.9 | −55.4 |

| BRIT, GAIN 40, TGHT 100, PRES 127, MIC 64 (build 8a97a9c58) | −73.9 | −58.5 | −56.8 | −32.0 | −50.6 | −56.3 |

DC stays below −130 dBFS and the output is digital silence after the input stops in every voice; page 2 turned up changes the aliasing by a few dB at most.

This build, CAB 1X12:

| Setting | 1.1 kHz −12 | 1.1 kHz −1 | 2.7 kHz −12 | 2.7 kHz −1 | 5.3 kHz −12 | 9.1 kHz −12 |
| --- | --- | --- | --- | --- | --- | --- |
| BOOST, GAIN 40, DIST 127 | −64.5 | −55.6 | −57.1 | −35.3 | −42.0 | −48.2 |
| BASS, GAIN 50, CAB 4X12 | −70.1 | −55.1 | −61.0 | −38.5 | −52.5 | −47.1 |

DC stays below −125 dBFS and the output is digital silence after the input stops. At DIST 127 the 1.1 kHz tone comes out 7 dB lower than at DIST 0: a steady tone in a notch of the reflections, as a far mic hears it. HGAIN at high GAIN aliases the most, as high drive at 2x does; BRIT's bias and resonant band-limit cost a few dB at 2.7 kHz against the old defaults. `render.py --raw` read fx:audit's .raw files as full 32-bit samples (48 dB too quiet); this build fixes it, and these rows come from the fixed path.

2x takes 15 to 30 dB off; what remains is harmonics past 66 kHz, which a 2x filter cannot stop (a float prototype with six coefficients, −85 dB, measured the same as four). Loud, bright tones at high drive still fail, and the dBc of the top tones reads worse than it sounds because the cabinet cuts their fundamental. A fifth-order curve was measured too and gained little at high drive, so the curve stays.

## In the emulator (ot_emu, 25 November 2026, build 4ae76341a)

Adapted `ot_emu` (scripts/octatrack-emulator/build.py) on a development twin of base 0.3.1-modwerk-dev.1 built from the developer's own OS 1.40C (`build_core.py --dev` with the beta flags). Emulator results, not hardware evidence.

- **Install:** the package (332 executed cycles declared, 96 state words, 668 DSP words) was accepted on the emulator's scratch card with no crash, stall, freeze or skipped track.
- **Admission:** a 425-cycle build was refused at verify (loader refusal 6, `RUNTIME_CYCLES`): the base charges an emulator figure at 7/4 against 726 chip cycles (3,120 less seven stock slots at 342), so an executed figure above about 414 does not install. That build was charged 581.
- **Trial rollback:** a 60 s trial of an earlier build ran without fault, but its rollback ended `needs-recovery`; the released Mackity package does the same on this emulator and twin, so it is the emulator's, not COMBO's.
- **Screens** (`tools/emu_session.py`, empty scratch card, MKII panel): COMBO is the last row of track 1's FX1 list, after LO-FI; YES picks it; FX1 draws GAIN, BASS, MID, TREB, CAB and LEV, BASS and MID centred; turning A moves GAIN from 40 to 90 and prints it; FUNC + FX1 shows an empty SETUP page. FX2, other tracks, locks, LFOs and scenes: not run.
- **The test procedure** (`npm run test:procedure`): stops at step 1 because module:doctor refuses the FX2 id (no card id is free), so steps 2 to 11 have not run.

## In the emulator (ot_emu, 26 November 2026, build a2fbb215e)

Same emulator and twin as below. The package (343 executed cycles declared, 96 state words, 774 DSP words) was accepted, with no crash, stall, freeze or skipped track. COMBO's FX1 page draws GAIN, BASS, MID, TREB, CAB and LEV as before; FUNC + FX1 shows FX1 SETUP with VOIC on knob A as a four-position switch (captures in ~/.cache/modwerk-emu/ui-7). Turning VOIC in the emulator: not run.

## In the emulator (ot_emu, 26 November 2026, build 8a97a9c58)

The package (370 executed cycles declared, 96 state words, 901 DSP words) was accepted, with no crash, stall, freeze or skipped track. FX1 SETUP draws VOIC, TGHT (centred), PRES, MIC and MIX (at its top) on knobs A to E (~/.cache/modwerk-emu/ui-8). Turning them in the emulator: not run. At 370 executed cycles the base charges about 648 of 726 chip cycles.

## In the emulator (ot_emu, 26 November 2026, the DIST build)

The package (393 executed cycles declared, 100 state words, 1,018 DSP words, reading the allocator) was accepted, with no crash, stall, freeze or skipped track. FX1 SETUP draws VOIC, TGHT, PRES, AXIS, DIST and MIX on knobs A to F, AXIS and DIST at 0 and MIX at its top (~/.cache/modwerk-emu/ui-9). Turning them in the emulator: not run. At 393 executed cycles the base charges about 688 of 726 chip cycles.

## In the emulator (ot_emu, 26 November 2026, the optimised build)

The package (310 executed cycles declared, 100 state words) was accepted, with no crash, stall, freeze or skipped track (~/.cache/modwerk-emu/ui-10). Not known until a unit runs it: the instruction count is a floor on the chip's cycles, and an FX2 slot in the shared window (Y:$30000 up) may cost more per Y access than core-private memory; the CPU price on a unit will say.

## On the unit (26 November 2026, page 2)

The developer's Octatrack over USB, its flashed base `eb667962`; the development twin `5d2fe44d` RAM-booted, nothing written to the flash or the card. The developer's own saved Part (Part 3), transport stopped at the start. Three packages from the same twin, in this order:

| Package | Source | SHA-256 | device:test, seven COMBOs at once (T1-4 / T5-8 peak, per mille) |
| --- | --- | --- | --- |
| 310 cycles, coefficients in the buffer | 28859f5ce | `4e386e50…` | 742 / **995**: failed, over the 900 limit |
| 332 cycles, page 1 only (comparison) | 4ae76341a | `2c0e88f0…` | 801 / 764: passed |
| 393 cycles, before the first optimisation (comparison; five admitted) | cdb8e1cbf | — | 763 / 702: passed |
| **338 cycles, coefficients in X (this build)** | this commit | `72afc4e5bd8a7f92459b9f524fffdfebbe4e6281d618df7f9c60581650a2b207` | **767 / 740: passed** |

**Stage 1, the agent, this build (hardware evidence for what it measured, not for the sound or a power cycle):**
- `npm run device:test`: passed. Self-test passed (longest frame 423 us); COMBO alone on FX2 of T1 peaked at 443 per mille, of T5 at 523, each admitted in 114 ms; seven at once while the pattern played, the eighth refused for CPU; 12 of 12 Part switches; the inventory ended as it began.
- `npm run device:price -- --write`: in use DSP +10.7 % on its core (peak +10.8), CPU +0.2, frame +0; at rest +0 (evidence/cpu-price.json).
- By hand, in a 10-minute trial over USB: COMBO is the last row of T1's FX1 list; FUNC + FX1 shows the SETUP page with VOIC, TGHT, PRES, AXIS, DIST and MIX; VOIC steps through CLEAN to BASS (several encoder steps a voice, like a stock switch), TGHT showed +20, DIST 60, MIX 64. T1's FX1 was put back to FILTER, and the trial rolled back with no crash, stall, freeze or skipped track. Screens in ~/.cache/modwerk-emu/unit/shots2 (not committed).
- Not run on the unit: the soak, MAIN and CUE recorded over USB, parameter locks, LFOs, scenes, PRES and AXIS turned, the frame-cost curve, and the release run (`device:qualify`, which Keeps).

**Stage 2, the developer:** not yet.

## On the unit (25 November 2026, build 4ae76341a, before VOIC)

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

337.7 instructions a sample in dsp_host, about 1.08 times stock SPRING REV's 314 (docs/OCTATRACK_ELEKLOADER_MIGRATION.md); 392.6 before the first optimisation, 309.7 with the coefficients in the buffer (refused on the unit, above). The base charges 338 executed cycles about 592 of an effect's 726 chip cycles until a hardware figure replaces the 7/4. The unit's CPU price (resources.cpuPrice) is measured on this build: DSP +10.7 % in use (evidence/cpu-price.json). Not yet measured: the static floor (cycle_count.py), evidence/performance.json, the stress run.
