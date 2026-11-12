# POLY8 0.2.5-experimental release evidence — 8 October 2026

The owner requested publication, answered “Approve this scoped experimental release” for current-build physical hardware, chip worst-case timing and complete memory-bound qualification, then requested the POLY8 name and an Octemu launch from Modwerk's builder. After that launch the owner stated “it worked, let's release”. This last observation is recorded as an Octemu check; no physical device result is inferred.

## Actual standard-builder image

`composeSelection(original, ['poly8'], true)` from `src/engine/compose-os.ts` generated the loader-free MAIN image with the standard core logger and all stock FX2 choices. MAIN SHA-256: `59ddb7c0a5f61ff21d1fb72cdc8ed1c16f5044ce43b455c927f63a5dce42c305`, 1,126,621 bytes. The two original DSP upload spans remain byte-identical, at 0x400e2324 (79,563 bytes) and 0x400f59ef (77,061 bytes). Runtime reservation is 10,586,112 bytes; initialized runtime is 121,500 bytes. Firmware and test-card/battery copies remain private.

The visible Octemu/QEMU launch restored a disposable battery/card fixture. The real LCD shows SRC+POLY8, its sample, the POLY8 row in SRC SETUP, CHROMATIC mode and transport playback. Both DSP cores booted; audio was nonzero. The owner reported that it worked and requested release. The automated walkthrough reached recording/playback screenshots but exited at its wall-time deadline before its final STOP marker, so it is not claimed as a completed automated recording gate. Octemu's monitor reported starvation and playback-ratio drift; this is not physical worst-case timing evidence. Historical T06 native chord-record and stress gates remain separately identified.

## Native integration

`npm run module:verify -- poly8 --os <private 1.40C> --image modwerk-source-tools:poly8-release --jobs 2` compares 114 selections: 30 module-owned images match outside platform/logger writes, 84 refusals match, zero mismatches. A guarded write overlap is classified as the same declaration collision that native octabam refuses; it is never accepted. The declaration ledger also records 8,192 supported combinations with zero collisions. POLY8 cannot share its hooks with VECTOR, Analog BD, FM Synth, Quantizer, Repitch or Mute Modes.

The renamed native UI gate is bound to MAIN `e0920b6d9f74822d000c335218bdf74d96a36984459c710553fe676293845546`. It verifies fresh LOOP OFF, re-selection preserving the whole Part and AUTO/PIPO, the POLY8 machine cursor and native FLEX slots, ordinary FLEX clearing the marker and cancelled selection preserving it. New gallery captures show POLY8; retained T06 captures show the historical POLY name.

## Qualification limits

Hardware remains untested for the current source. Worst-case chip cycles, stock-comparison interrupt/idle load and complete memory/stack lifetime bounds remain unmeasured. The source-bound owner exception grants publication only for POLY8 0.2.5-experimental; it does not turn these gaps into passed measurements or extend to future source changes. Existing T03/T04 hardware failures remain historical failures.

## Exact standard-builder native regression

The native UI gate also passed on MAIN `59ddb7c0a5f61ff21d1fb72cdc8ed1c16f5044ce43b455c927f63a5dce42c305`: LOOP OFF on assignment, whole-Part preservation on reselection, AUTO/PIPO persistence and both chooser/sample paths. The battery-RAM-only audio gate on that same image passed POLY8 and ordinary FLEX key audio and chromatic REC+PLAY on advancing steps. This is an emulator restart, not a physical reboot. Sample audition remains unqualified.

Native warm result: {"image_sha256":"59ddb7c0a5f61ff21d1fb72cdc8ed1c16f5044ce43b455c927f63a5dce42c305","marker":"504c01","mirror":"504c01","machine":"01","loop":"00","chromatic_mode":1,"poly_sound":{"frames":8820,"channel_peaks":[361,361]},"flex_sound":{"frames":8820,"channel_peaks":[3042,3042]},"sample_preview":"not tested; use --preview for the unqualified probe","transport":"00000001","live_record":"00000001","play_start":"status sample=471453.419 ms=10690.554 frames=28945 frame=on idle=57238 wall=294.835","play_end":"status sample=507187.990 ms=11500.861 frames=31179 frame=on idle=61602 wall=309.071","records":[{"step":2,"root":72,"shape":0},{"step":4,"root":76,"shape":0},{"step":6,"root":79,"shape":0}],"result":"POLY/FLEX key audio and advancing-step recording pass; sample preview not qualified"}

## Existing-record preservation audit

The browser-only `module:verify -- --all --check` audit of historical records returns 111 mismatches outside POLY8. Running the same audit from a disposable copy of approved main aa464d18353e08bda803de0b75e9de642627ea51 reproduces every old result and refusal exactly; no new mismatch is introduced. These older records predate other module updates and are not relabelled as current passes. POLY8 has its own fresh 114-selection record with zero mismatches. All 136 existing Analog BD suite profiles were independently rebuilt on the rebased SDK/toolchain and reproduced their previous identities. The generated proof carries the final module source tree fingerprint.

## Final rebased release image

The final standard-builder MAIN is `7a7d56a62bf93107b327f762c2ee87d7fb8fc9a82011021146a35d4c1ca23c3d`, 1,126,625 bytes, built with the SDK safeguards merged in main f870052b5ab2eabe7e83221f0ae376238f09069a. The 121,500-byte decompressed runtime differs from the visible Octemu image only in the logger configuration/build/source strings; executable bytes are identical. Both stock DSP uploads remain unchanged. Fresh native UI and battery-RAM-only audio/recording gates pass on this exact final image. These emulator checks do not replace the owner-waived physical qualifications.

Final warm result: {"image_sha256":"7a7d56a62bf93107b327f762c2ee87d7fb8fc9a82011021146a35d4c1ca23c3d","marker":"504c01","mirror":"504c01","machine":"01","loop":"00","chromatic_mode":1,"poly_sound":{"frames":8820,"channel_peaks":[361,361]},"flex_sound":{"frames":8820,"channel_peaks":[3042,3042]},"sample_preview":"not tested; use --preview for the unqualified probe","transport":"00000001","live_record":"00000001","play_start":"status sample=471437.890 ms=10690.202 frames=28944 frame=on idle=57258 wall=193.645","play_end":"status sample=507171.990 ms=11500.499 frames=31178 frame=on idle=61625 wall=206.393","records":[{"step":2,"root":72,"shape":0},{"step":4,"root":76,"shape":0},{"step":6,"root":79,"shape":0}],"result":"POLY/FLEX key audio and advancing-step recording pass; sample preview not qualified"}

The stock-free import rejection gate refuses all four mutated packages: missing replay, extra replay, a forged guard and a nonzero inherited placeholder. No rejected package is imported.
