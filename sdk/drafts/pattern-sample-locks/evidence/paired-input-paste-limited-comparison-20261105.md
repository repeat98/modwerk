# Paired STOP and split-input comparison — limited (5 November 2026)

This stock-free note summarizes only the private run report and its three completed receipts. It records an incomplete software-only emulator comparison; no emulator or hardware was run for this documentation update, and no firmware, memory dump, card image or LCD buffer is included here.

## Completed arms and observations

Scheduled job `fd80b742519845529581aeb408b873fa` produced receipts for `control-no-module`, `control-candidate` and `race-no-module`. **Each named arm ran both** an ordinary STOP control and the same split-input sequence; `control` and `race` are repetition labels, not distinct sequences. The fourth planned candidate repeat, `race-candidate`, timed out at the 840-second bound while booting (exit 124) and has no receipt. This is not a completed four-arm suite.

In each of the three receipts, the ordinary STOP control stopped transport and reported `patternChangedBytes: 0`. After the subsequent split sequence, the acknowledged remote FUNC release did not clear emulated FUNC state (`funcState: 1`); the later physical STOP down/release left transport playing. The final A02 comparison showed the same 64 changed SAMPLE bytes/fields in all three arms, zero changed non-SAMPLE bytes, and A02 SHA-256 changing from `a8cd36492baa5f26013b4ba848ad13e6a04d14c64a0949d7284e52c34f721582` to `a0e5aac3ceb98c0c9f40c06a726f4704050d1d4353bed1cba2f6eec0d28c7553`. Canonical A02 mirrors matched the corresponding before/after A02 hashes; working, canonical-mirror and saved Part blocks each had zero changed bytes and retained SHA-256 `66b31cec3813860cbda99ca783bd9cdd99367ba534d79bc8350f21b296192f67`.

The candidate arm had the exact Sample Locks package loaded and ended at module phase 5 with that package active. Both no-module arms began and ended with the same empty-inventory hash. All three receipts say `hardware: false`; all report the copied card unchanged at fixture SHA-256 `49db2167e5d8d7f6e7f0011721caf2834919825cd7c9e5ad01f10a08139a33aa`. Thus this constructed emulator sequence produced the same 64-field result with and without the candidate. It does not show that the module caused the change, does not reproduce the historical six-field incident or the reported STOP-as-paste display, and does not determine that incident's cause.

The receipt property `events.afterStart` is mislabeled for chronology: despite its nested label `before-controls`, the run report says this snapshot was captured after the event sequence. Do not use it as an initial state; rely on the explicitly labelled `ordinaryControl` and `race` event snapshots.

## Identity and cleanup

- Candidate package SHA-256: `3e13c46fb0054d05f228b045746453e0c50dbbe52fb53b3c229d598ddd7fed79`; source fingerprint: `7ea0fbdf317bfdab6a82b22869c7029ba23901cd27a3337a4bdaf8f8beeb7e69`.
- Frozen imported-source checkpoint: `c88ce52f75523c7adecc9e5ee7fba1602f409609`; frozen helper SHA-256: `842ec3e923e0e3bd35543fe2ccf2da9511ad1b3096a1350132c753c87a33603c`.
- Base configuration SHA-256: `20ed79108facb38d72b1e21105a3fd598bc45b76da39e667d6ad1c9b9a67410e`; recorded MAIN image SHA-256: `8ede9cf9d702f93acbbfede4ade157c11abf7a18d6ddab0000ab68b48a84fb3f`.
- Fixture SHA-256: `49db2167e5d8d7f6e7f0011721caf2834919825cd7c9e5ad01f10a08139a33aa`; emulator SHA-256: `b087c97f3031f075551b3336afcd75a407ca4d3476e04a9d5cfaa059b1d40363`; recorded Linux/arm64 run image: `sha256:2e8c7b43218642053df0e282bfa3d5cf7f8538aa73abbc4aec7ee3e9f979728b`.
- The private run report records seed SHA-256 `b2ff46a32404855fae8c56c7070c6863ec81ff0d2f4af409cf7c80ac84b3f0c7` and four copied run cards at the fixture hash above. Cleanup receipt `cleanup-fd80b742519845529581aeb408b873fa.private.json` records scheduler state `recovered`; the named container and exact container ID `c1f1e7d00f985ea0d74634b695d8498c7a29e0c5314717074fcb897e562bbad5` were absent, child 99125 was absent, and the process group was cleared directly. Private report, receipts, logs, cards and LCD buffers remain outside Git.

Source records: `~/.cache/modwerk-pattern-sample-locks/task_2ed6ee9036ed-paired-input-paste/report-task_3ac182d4ad84.private.md` and its `task_3ac182d4ad84-output/{control-no-module,control-candidate,race-no-module}/receipt.private.json` files. The fourth arm has no receipt. This evidence is emulator-only, partial, and does not upgrade or replace the older-base physical reports or close hardware, high-load, resource, timing or owner-review gates.
