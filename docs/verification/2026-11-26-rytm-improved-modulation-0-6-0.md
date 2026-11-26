# Analog Rytm MKII: Improved Modulation 0.6.0-experimental — 26 November 2026

Nathaniel Pavel's (@npp1993) Improved Modulation (`quick-velocity-aftertouch-assign`) moves its performance gestures from QPER to a PERF hold that works as its SCENE hold does (QPER keeps its one link), moves the aftertouch assign from SAMPLER to CHRO, adds SCENE + YES (write the scene into the kit, with an undo), and keeps scene changes in the take LIVE RECORDING records, written by RECORD + YES as locks. REC, STOP, PLAY and YES act at once with SCENE or PERF held.

- **rytm-emu (2ac0f1f), Q602 to Q610 on the plain base 1c14b6b0, against stock:** every gesture in TESTING.md's 0.6.0 table; scene playback over a pass; a take with two scene changes; the undos, also from a later hold and after a lock made since. Seven screenshots are byte-identical to 0.5.0's under the new plans, two show the new messages, one is new.
- **Rig cases:** 32 of 33 on R608, R609 and R610; the one failure is a private case for the old SAMPLER hold.
- **Unit:** the test rig ran R606, R607, R608 and R610 (the final source, seven cases) on the author's unit, and the author tested R606 by hand (TESTING.md). This package's own image ran in rytm-emu only.
- **Reviews:** six independent code reviews; the first three's findings are fixed in Q608, the fourth's (an empty SCENE + YES left another scene's undo armed) in Q609, the fifth's (a project load kept the undos; a scene undo with the lock table full restored in part) in Q610, and the sixth found nothing in Q610's fixes. Q609's fix ran on the unit (R610); Q610's two are code-reviewed only.
- **Memory:** 31,108 bytes of the shared mod area (base alone 118,836 free, with the module 87,728).
- **Build:** `scripts/build-elemod-isolated.sh` in `modwerk-source-tools` from the committed tree; `package-elemod-recipe.mjs`; `verify-elemod-release-exports.mjs` reproduced all 71 current exports. Package `66f025ae…81b59`, pinned at `9225d778`.
