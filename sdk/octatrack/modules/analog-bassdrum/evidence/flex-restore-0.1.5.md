# Analog BD 0.1.5 — FLEX restore regression

Date: 9 October 2026. Tester and approving owner: repeat98 (Jannik Aßfalg).

The exact private candidate offered for the hardware check was **AB015FIX01**, module 0.1.5-experimental. After the request to switch Analog BD to FLEX without SRC + PLAY and power-cycle, the owner replied:

> flex persists. merge and update

This is a reported physical FLEX reboot-persistence result, limited to that statement. Model, duration, audio/transport behavior, number of instances, Part/project save/reload results and maximum load were not supplied. It does not establish the Output Matrix sequencer-halt fix. The owner directed this exact release after being informed that 0.1.4 approval did not cover it and broader checks remained missing. The separate sdk/analog-bassdrum-build-approval.json records the new version/source approval and its remaining qualification limits.

The candidate machine source was copied byte-for-byte into the public module. Native source SHA-256: `e741e4876ea3ae44eb54ddc93ff3b5bf5f65ebb3e9320cc5fd1f602f7925966d`. Private MAIN OS SHA-256: `137580f326b6adc3b0d58f2183d530507f1b370c48911b38d5d0cf94d9e96898`. Saved private upgrade SHA-256: `5737e32c4823fffa3236469e82425b3eb53ba75da1d8d0a690b824eaefeb63e2` (568,928 bytes); its decoded MAIN OS equals the native image.

## Software regression

The compiled ColdFire hook restores six playback and six SETUP bytes from the owned stock defaults at runtime before clearing a valid AB/1 marker. All four callers, eight tracks and four Parts pass 512 marked/unsigned/malformed cases; 32 Analog BD reselection cases and all five other machine destination rows pass. Both volatile and battery-backed Part copies are checked, along with unchanged unrelated bytes and register/stack behavior. The 0.1.4 writer fails the restore assertion.

Current-source DSP-enabled ot_emu receives actual panel assignment and switching. A separate process then restarts with only the captured battery RAM and saved card, `--cs1-in --no-post`; no LOAD PROJECT is posted. 0.1.4 switch rejects the bank and restores all eight STATIC machines. The candidate switch restores all eight FLEX machines. Leaving 0.1.4 assigned Analog BD restores its marked track as a control. Sanitized records and reproducible gates are in sdk/drafts/analog-bassdrum-flex-restore/evidence/chooser.json and evidence/reboot.json, verify.py and reboot.py. These are emulator results, distinct from the owner report.

Both cores' DSP code and complete DSP uploads are byte-identical to 0.1.4. The ColdFire runtime grows from 14,016 to 14,052 bytes (36 bytes). No new DSP state allocation is introduced; the copy occurs during machine assignment, not in the audio loop. Historical DSP instruction measurements below remain historical, not new chip-cycle measurements. Complete memory/stack lifetime bounds, maximum FX load and broader current-build hardware checks remain unverified under the exact owner-approved experimental release.

