# POLY8 0.2.6 native compatibility evidence

Native source SHA-256: `97d1bb05eccf20b8577274f5210dfb173fcba83e76b758b8d7a7653f8e5298a4`. Physical hardware, worst-case chip cycles and complete lifetime memory bounds remain unqualified. The 0.2.5 owner exception does not cover this source.

The native static-stock full composition selects POLY8, Repitch, Mute Modes, Scale Quantizer, Analog BD, VECTOR, FM Synth and Sidechain Compressor. MAIN SHA-256: `6891cc62c1697ba063bed7d4fa315a2b435aa9433a60ef2c9c52d83c938b3461`. These private images omit the core logger; final common-builder packaging and release verification are recorded separately.

The shared-machine gate selects all four signed machines through SRC SETUP, reopens FM on its actual chooser row, confirms their saved Part markers and hears each engine. A second POLY8 assignment leaves the complete Part unchanged. NO and the 120-native-tick timeout each close the refusal modal.

| Engine | Captured frames | PCM16 peak |
|---|---:|---:|
| FM Synth | 8820 | 382 |
| VECTOR | 8820 | 3284 |
| POLY8 | 8820 | 728 |
| Analog BD | 8820 | 2523 |

At HOLD/REL MAX, 128 rapid UART panel presses complete 7,073 further DSP-driven frames and admit at most 8 POLY8 heads. A separate battery-RAM warm-start probe also completes 128 rapid presses on the same full image. Native restart is not physical reboot qualification.

The exact preceding full image (`8ceffb8ee1b72cdfa5e6660524f06028e04e79325380b8f5d71e6c89417f4520`) halted at press 17. A write watch traced the corruption to POLY8’s cache update: five local PC-relative accesses had wrapped by 64 KiB into the preceding FM quantizer. Moving both pitch-cache arrays before the large scratch buffers fixes the addresses. The firmware-free addressing gate checks all 121 compiled local targets, rejects the preserved source at the five cache accesses, and passes the corrected source. This does not identify the cause of the earlier T03/T04 hardware symptom.

Source provenance and non-overlapping guards pass. ASan/UBSan allocator tests cover 10,000 cross-track steals, the eight-head/fetch-work caps, independent release and machine cleanup. Recorder tests cover all 232 supported chord shapes, bounds, root isolation, native SAMPLE locks, trigless recording and recording-off behavior.

The native ledger rechecked all 40,559 existing ledger-composed selections successfully; 128 standalone MIDI Scenes records remain outside that flow. All 128 subsets containing POLY8 and the six newly shared companions plus Sidechain Compressor are clean; 126 new records were appended, preserving existing records. Declaration checks do not substitute for executable native/browser parity.

Private evidence fingerprints:

| Report | SHA-256 |
|---|---|
| poly8-026-cache-fixed-shared-panel/report.json | `6e3579497063448010d8d64cc6df244b0cf972a32e735a326eff141b54486a81` |
| poly8-026-cache-fixed-full-stress-report.json | `ded2651b7a48b7d4a489194268686bda3d3aae7c33efda1fa4ca9f3656a3250a` |
| poly8-026-source-host-gates.log | `0274b5031969b46b1487102baafcd3981d0aba07576a20b2c7657bce19af8e82` |
| poly8-addressing-negative.log | `ab09baf525eb8851cdf7511307470fb3995bfe2d32b1148f574b76ba077848a7` |
| poly8-ledger-new.log | `4706981198aea44460654036edcf127630e3d2dd5a8563a0898900453c5ddd00` |


## Current solo UI, recording, gain and load checks

The corrected solo MAIN is `872ef1dacbead0b7f2977fe8945a46fe8d6bcce31787279d33b480f948b373d5`. A new assignment starts at LOOP OFF; AUTO and PIPO reselect preserve the entire Part. LEFT returns to POLY8’s chooser row, RIGHT opens native FLEX slots, sample YES and chooser cancel retain the POLY marker, and replacing with FLEX clears it. The five inspected monochrome gallery captures bind to this image and the exact native UI protocol.

The battery-RAM warm audio check confirms both POLY8 and ordinary FLEX key audio, advancing REC+PLAY transport and three separately recorded steps with roots 72, 76 and 79. This native fixture retains the PL/1 Part marker and LOOP OFF. It does not qualify physical reboot, simultaneous panel chord timing or sample audition. The historical audition probe remains unqualified under stock as well.

Two constant full-scale inputs, PCM16 +32767 and -32768, each run eight active heads for sixteen frames. The native pre-stock-DSP mix stays within signed full scale and differs from the ideal fixed 1/8 sum by less than one PCM16 LSB. This is a mix-bound test, not a physical output clipping result.

Each load case measures 1,000 DSP-driven sixteen-sample blocks after 500 warm-up blocks. Mixed and budget-edge cases have eight POLY8 plus seven FLEX voice records; the modulated case also runs 24 LFOs and live PTCH changes.

| Case | ColdFire instructions per 16 samples | Active records |
|---|---:|---:|
| idle | 23601.684 | 0 |
| mixed | 51661.789 | 15 |
| budget-edge | 60294.288 | 15 |
| modulated | 53626.807 | 15 |

These are emulator instruction counts, not real-chip cycles or a measured hardware deadline. DSP loop summaries include startup and warm-up; both original stock DSP uploads are preserved.

| Current report | SHA-256 |
|---|---|
| poly8-026-cache-fixed-solo-ui/report.json | `634795615ecc049e7d8338858d1cc31c2b1732b0b5a38c209f6e3ec3a7ae6e8c` |
| poly8-026-cache-fixed-warm-audio-report.json | `8cfea5b7165bb72b1c7b34fbc40e6af51766bb4d49df5fcd2a28fce5b70a7e01` |
| poly8-026-cache-fixed-gain/report.json | `e2eea4204f3246d4737d1109b182d1e56cf9fccdb93e6252e06d08f73aa997b4` |
| load/poly8-026-cache-fixed-load-report.json | `a107e7951bd9b773ea658dd0d533f75685b9bd70c43069a09dfd5882454eba59` |


## Held-chord recording and isolated sequencer audio

A private derivative of `native-warm-audio-gate.py` presses three held panel keys, 20 ms apart, at offsets 0/4/7 and then repeats with roots shifted by one and two semitones. REC+PLAY writes shape 41 (major chord offsets 0, 4 and 7) at native steps 2, 6 and 9 with roots 72, 73 and 74. A partial single note is also captured at step 5 as the native recording grid advances during the presses; this is not an assertion of simultaneous key timing on hardware.

Before checking sequencer audio, double STOP leaves only the +/-1 idle residue for 8,820 frames. PLAY then produces 8,820 frames with a PCM16 peak of 2,243, so lingering live voices do not account for the measured playback. The report retains the exact solo image identity above. Physical panel recording remains unqualified.

Private probe SHA-256: `248e515163a06048e7175bda271a50b10ab6bdd385f130b5d17b210cf229f646`. Private report `poly8-026-cache-fixed-native-chords-silence-report.json` SHA-256: `af55d9e865e9be7756962d4150668a5fa5241952cb25bc1400a3f65a754ee77a`.

## Source-package and native build preparation

All 32 pre-existing requested objects retain their default object bytes and hashes from `origin/main`; non-POLY DSP packages also remain identical after removing provenance labels. Four current-package corruption probes correctly refuse missing replay spans, extra replay spans, forged replay guards and nonzero inherited placeholders. The shared link’s full eight-pointer FM prefix and reviewed seam guards pass 28 focused source/build tests.

The current native comparison collects all 240 selections: 186 build, 54 refuse. On the original 114-case coverage set, that is 60 native builds and 54 native refusals; the expanded companion subset adds 126 native builds. This is a native-only count while qualification approval and catalog regeneration are pending, not a successful current-version browser parity claim. The old generated catalog pins 0.2.5 and correctly refuses the 0.2.6 packages. Final native/browser parity, common-builder packaging, full repository checks and a saved live download remain mandatory before publication.

Parallel Analog BD builds initially shared one SDK output path and failed a disassembly check. The native proof exporter now places those assembler files inside each selection's disposable workspace. Both concurrent POLY8 shards complete all 240 native selections with that isolation. Their private proof SHA-256 values are `faa85f16ff8af91f93da125beecb8e44f9b460388a8c490485c0ec842c216dc4` and `ce3d7ba440cc2ebd99e36c1bc79beabfdbcb07e613fbabba55c4fb3b08b52c09`.


The generated Analog BD regression matrix also completes: all 136 native selections, 130 builds and 6 refusals, preserving the reviewed baseline coverage. It uses the current shared builder and source-package fingerprint; the generated proof SHA-256 is `e36b806686dd8dc03fe007a7aaf6fa3174c62f85da356bff5a30970ad8ff4630`. Its browser regression is checked separately. No hardware/render claim follows from this composition-only matrix.
