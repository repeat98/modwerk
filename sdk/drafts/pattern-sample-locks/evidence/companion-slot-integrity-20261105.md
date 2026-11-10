# Companion-slot Clear integrity fixture — 5 November 2026

This is a deterministic host regression over the production native commit body. It is not an emulator or hardware run and does not reproduce the high-load input failure.

## Bound inputs and method

- Candidate USB package SHA-256: `3e13c46fb0054d05f228b045746453e0c50dbbe52fb53b3c229d598ddd7fed79` (rechecked from the existing private package fixture).
- Candidate native-source inventory fingerprint: `7ea0fbdf317bfdab6a82b22869c7029ba23901cd27a3337a4bdaf8f8beeb7e69` (Node 24 repository helper).
- `native.c` SHA-256: `a5d11e7320a91b00457fbe1f89453e8a432e65877e92af0aa64705f6b2a6050e`; `engine.c`: `a41ace651c2ff9f72d43e783d6121c64f51fe6d21e49bc60cf3b26a97ebdaa38`; `engine.h`: `d1c067250f8bc555944303fb526cd9ec22c281c0f4773c95ed6fbdd332925ca1`.
- Existing address-mapped commit test template SHA-256: `ce5518562a966e72f054562f2325e107dfd68da4215b6d438e8401e039a39d04`.
- Private fixture helper: `~/.cache/psl-source-bound-profile-20261103/companion-integrity-20261105/all31_dense_clear.py`, SHA-256 `1b5a19803a5e2718798cc250200212a495652d19eec1fbf77d760e7bb6f2d1f7`.
- Host compiler: Apple clang 17.0.0. The existing test template extracted the production `psl_write_step` and `psl_commit_locked` bodies, translated only target addresses to isolated arrays, and compiled them with `engine.c`, `-Wall -Wextra -Werror`, AddressSanitizer and UndefinedBehaviorSanitizer. The helper substituted a fixture-only C `main`; module source and tests were not edited.

Reproduction command:

```sh
python3 -B "$HOME/.cache/psl-source-bound-profile-20261103/companion-integrity-20261105/all31_dense_clear.py"
```

The helper verifies the bound package, native files and test-template hashes before each run; its compiled executable and arrays live only in a temporary directory.

## Fixture and result

The helper ran 32 fresh-fixture maximum Clears. In 31 cases, all eight tracks and 64 SAMPLE fields per track were selected while exactly one non-SAMPLE lock value occupied a chosen companion slot; the chosen position swept each slot from 0 through 30. The final case filled all 31 companion slots for every SAMPLE record. Each case passed `psl_prepare` with 512 changed fields and `psl_commit_locked` with all eight tracks published.

For every case, checks confirmed all 512 selected SAMPLE bytes became the no-lock value; every other byte in all eight working tracks stayed equal to the fixture snapshot; all mirrors matched working data; all 64 index bytes retained the expected eight-track mask because each record still had a companion lock; transport remained playing; and publication used 64 per-step batches of at most eight tracks. The host helper printed `PASS private companion integrity`.

## Scope

This closes a narrow host-side regression gap: the checked-in native test used a first-position companion lock, while prior timing fixtures included only first/last placements rather than a sweep across all 31 positions. It shows that the tested Clear path preserves companion data and index membership for all 31 companion positions under a 512-field plan. It does not establish high-load chip behavior, concurrent input framing, complete data integrity under interrupts, or causation of the reported A02 loss; the physical event timeline and damaged snapshot remain unavailable. No hardware, project, Docker workload, runtime source, qualification check or generated file was touched.
