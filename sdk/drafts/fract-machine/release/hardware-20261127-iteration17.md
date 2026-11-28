# FRACT0.1.6 two-reader hardware record —27 November2026

Development package `9b86e74087dc4a7495a86850b0dcc3f45881335285d8519e1b4e3f03366e0a60`, base `46c30886a7e8f3f6091622b6c09acd20edad8ec91cc60d1daee60852123f3e4f`, author's Octatrack MKII1.40C. This package is byte-identical to the earlier two-reader prototype. Separately linked released-base package8c9603a4 on base24e480c4 is not physically tested. No Keep or NOR write is part of this run.

Current full stage1 remains incomplete. The fixed procedure's software/cost-model/preflight and restoration passed; its unit pass failed because FRACT deliberately refuses T5 and one of12Part switches timed out. It recorded11successful switches, T1render peak29.0%, and quiet/triggered means28.9/50.5 (+21.6points, charge40). Standard Undo returned the original empty inventory; whole-trial verdict logged no crash/stall/freeze/skipped track. These facts do not turn the failed procedure into a pass.

A separate12transition run, using NO and500ms settle between Parts, passed with guarded-render counter0→0. The cause of the original missed Part4 transition is not established. T5 refusal follows the unchanged documented one-ownerT1–T4 policy; the generic tester requires both T1 andT5. No gate was weakened.

## Matched formats

A private authored fixture FR27TW2 fixes the same events and settings in banksA–D. Part1 is native FLEX with LOOP2 and TSTRoff; Part3 is FRACTdefault, Part4 has extreme MAIN controls. All working/saved Parts started equal. Four files have88200frames at44.1kHz:16-bit mono/stereo and24-bit mono/stereo. Each window independently verified the source mode, voice, slot and controls.64T1trigs,120BPM;3swarm then6smeasured;4chUSB AUDIO companion installed with CoreAudio recorder idle.

| Format | FLEX active mean | FRACT quiet | FRACT default added | FRACT extreme added |
| --- | ---: | ---: | ---: | ---: |
|16-bit mono|31.6%|31.0%|28.3points|32.1points|
|16-bit stereo|31.8%|31.0%|29.0points|32.9points|
|24-bit mono|31.7%|31.0%|28.7points|32.2points|
|24-bit stereo|31.7%|31.0%|29.1points|33.5points|

All20windows completed with counter0→0 and no new crash/error/stall. The largest observed FRACT active-minus-quiet mean33.5points is below unchangedprice40. This is an observed mean charge, not a static worst-case, peak headroom, exclusive own cycle count or listening result. See matched-price-20261127-two-reader.json.

Earlier slot-picker preparation attempts did not consistently establish native LOOP2; they are not used for this complete matrix. Their assertions stopped the runs. The final fixed-bank fixture's settings were read back on hardware.

## Active USB, placement and restoration

The current MAIN+CUE4chUSB run completed122.232827s and22control windows, guard0→0 including finalSTOP. CoreAudio confirmed4inputchannels active at bothends; the124.656s recording closed with exit0. All4channels have nonzero signal. The trimmed capture has no all-channel exact-zero frames. Repeated16sample blocks were mostly constant plateaux;60varying repeats remain unqualified without a synchronized oracle or listening. No dropout/listening clearance follows. The largest observed frame interrupt maximum was103.6% of a nominal frame; this is measured interrupt duration, not a static bound or headroom promise.

T2,T3,T4 each rendered alone and returned to FLEX. A second owner was refused without changing any Part byte. T1 was covered by the full matrix and stress. The whole retained set returned by standard Undo to normalgen4, emptyinventory; it logged twoCPU>=90%/1s notes and nofault. These notes are retained, not treated as available headroom.

Original PROJECT261111/A01/Part1 was restored by CHANGE. All8working/savedPart copies matched their fresh start snapshots; the existing workingPart1/savedPart1difference was preserved. All28originalCF hashes matched. The agent incorrectly exited USB DISK MODE after macOS refused an initial eject; it reentered, verified all28hashes, ran read-only fsck_msdos -n through diskutilverifyVolume(exit0), rechecked hashes after its unmount/remount, then successfully ejected before exiting. Only the two agent-created40file testprojects were archived and removed. Final release-base independent readback is recorded below.

MIDIsoak did not run: fixedprocedurestopped atstep7; the accepted audio-stress alternative above was run. Full fixed procedure, exact released-base audio, complete companion matrix, listening and exact-version Keep/reboot remain open. The cause of the isolated Part4timeout remains unestablished. No waiver or first-release approval is claimed.

Final independent USB readback confirmed released base0.8.2 `24e480c435a41324872a259d4ed335c972ba868a917ad3499de359acdc849ac5`, normalgen0, inventory[], missing[], set`87f28e38d5fe18c3f6133158ddb0369f9b62f2a46b0ada8c8fc19de1ca9885e8`. NORrunningconfirmedslot1gen10, oldslot0gen8retained, nofallback. Ownlinks/recorder/MIDIbridge closed, queuefree, Colimastopped. Released-baseMEMis unavailable; exact8Partcomparison was before finalRAMboot. No postbootPartdump is claimed.
