# Analog BD machine-switch persistence fix

Private candidate **0.1.5-experimental**, based on approved **0.1.4-experimental**, for [issue #363](https://github.com/repeat98/modwerk/issues/363). The public manifest, catalogue pin, qualification and packages remain at 0.1.4 while physical verification is pending.

`machine.s` changes only the machine-switch cleanup. For an exact AB/1 signature it reads the same twelve stock FLEX defaults as `ab_validate_part`, writes them into the playback and SETUP slots, then clears the marker. The existing per-copy call handles the volatile and battery-backed Parts. All three chooser hooks use it. Reselecting Analog BD keeps its patch; unsigned tracks, unrelated bytes and other Parts are preserved. Defaults are read from the user's stock image at runtime; no stock table is copied into this draft.

The DSP engines and upload images are byte-identical to the approved 0.1.4 build. This change does not add audio-processing work. Native instruction counts are not hardware timing. The signature writer retains its registers and stack; the shared copy loop also restores both halves of the parameter page when entering Analog BD.

[evidence/chooser.json](evidence/chooser.json) records 512 assembled-hook cases over all eight tracks and four Parts, both copies, three commit hooks and the signature writer, plus 32 reselections and all five destination machines. [evidence/reboot.json](evidence/reboot.json) confirms the full emulator regression with actual panel events and a new process loaded only from the prior CS1 copy: 0.1.4 switching to FLEX rejects the bank, 0.1.5 switching to FLEX restores it, and 0.1.4 retaining Analog BD restores it. No LOAD PROJECT is posted on these boots.

[evidence/packages.json](evidence/packages.json) records private stock-free development packages at 0.1.5; clean release compilation and browser/native composition remain pending promotion. [evidence/emulator.json](evidence/emulator.json) pins the current emulator source/executable and its passing CPU/peripheral gates.

[evidence/private-build.json](evidence/private-build.json) pins **AB015FIX01**, its source, MAIN OS, saved upgrade and unchanged DSP hashes. Firmware, stock recovery, projects, CS1 and raw memory/logs stay private. [TESTING.md](TESTING.md) gives exact-image hardware steps and reproduction. [release-notes.json](release-notes.json) is the prepared version-matched note; copy it into `src/community/module-changelogs/analog-bassdrum.json` at promotion, preserving previous entries.

Promotion requires actual version-matched physical results or a new explicit owner exception for named missing qualification. Keep issue #363 open until publication, saved live-download verification and report/notification completion. The Output Matrix halt is a separate unverified symptom; this candidate addresses the confirmed invalid-bank cause, and does not establish a fix for that halt.

After that gate, apply this source to the public module, update the version and catalogue pin, imported fingerprint, qualification, documentation/captures, release notes and generated metadata, rebuild packages from the clean commit and repeat native/browser composition checks under [ADD_A_MODULE.md](../../../docs/ADD_A_MODULE.md). Continue on this PR; do not extend the 0.1.4 waiver or use automatic issue-closing keywords.

## Promoted 9 October 2026

The owner reports FLEX persists on AB015FIX01 and directs merge/publication. The exact machine.s is promoted to public 0.1.5-experimental. This folder preserves the private staging regression and original evidence; apply.py remains pinned to the historical 0.1.4 base. Publication is verified separately.
