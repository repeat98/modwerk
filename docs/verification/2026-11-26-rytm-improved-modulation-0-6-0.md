# Analog Rytm MKII: Improved Modulation 0.6.0-experimental — 26 November 2026

Nathaniel Pavel's (@npp1993) Improved Modulation (`quick-velocity-aftertouch-assign`) moves its performance gestures from QPER to a PERF hold that works as its SCENE hold does (QPER keeps its one link), moves the aftertouch assign from SAMPLER to CHRO, adds SCENE + YES (write the scene into the kit, with an undo), and keeps scene changes in the take LIVE RECORDING records, written by RECORD + YES as locks. REC, STOP, PLAY and YES act at once with SCENE or PERF held.

- **rytm-emu (2ac0f1f), Q602 to Q609 on the plain base 1c14b6b0, against stock:** every gesture in TESTING.md's 0.6.0 table; scene playback over a pass; a take with two scene changes; the undos, also from a later hold and after a lock made since. Seven screenshots are byte-identical to 0.5.0's under the new plans, two show the new messages, one is new.
- **Rig cases:** 32 of 33 on R608 and on R609; the one failure is a private case for the old SAMPLER hold.
- **Unit:** the test rig ran R606, R607 and R608 (the source before the last one-line fix) on the author's unit, and the author tested R606 by hand (TESTING.md). This package's own image ran in rytm-emu only.
- **Reviews:** four independent code reviews; the first three's findings are fixed in Q608, and the fourth's one (an empty SCENE + YES left another scene's undo armed) in Q609 with one line, checked in rytm-emu only. Q609 has had no further review.
- **Memory:** 31,012 bytes of the shared mod area (base alone 118,836 free, with the module 87,824).
- **Build:** `scripts/build-elemod-isolated.sh` in `modwerk-source-tools` from the committed tree; `package-elemod-recipe.mjs`; `verify-elemod-release-exports.mjs` reproduced all 71 current exports. Package `66f025ae…81b59`, pinned at `9225d778`.
