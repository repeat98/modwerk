# Track Solo MKII RAM trial records

## 6 November 2026 — functional trials, rolled back and verified

See [TESTING.md](TESTING.md#hardware-results--6-november-2026). `0.2.2` package
`6b7a9d2c…` ran 600 s and `0.2.3` package `1895ceec…` ran 300 s on base
`462fbd2b…`. Each rolled back with its set identity and empty inventory read
back unchanged. This supersedes the UNKNOWN state of the 5 November record below
for the unit's current state; the base differs, so it does not explain which set
ran then.

## 5 November 2026 — incomplete attempt; recovery required at the time

**Evidence type:** interrupted/uncertain RAM trial; no functional qualification.

The attempt used Track Solo `0.2.2-experimental`, package SHA-256
`6b7a9d2cb30ceef7d69aedd5cfe5f2ea45fdaa46f6d16069952b8ad93286a2fd`, on the
MKII base
`9680e9ac861ff9313ce4f7a710a37ad2aa8e9b50b2cf8c043dafa2a0b78cdffc`. A fresh
20-module baseline was confirmed. The candidate inventory then confirmed 21
entries: those 20 baseline IDs plus the Track Solo candidate. The owner
observed GLIDE but no TRACK SOLO. The inventory observation does not establish
why the candidate was not visible on the panel or prove functional behavior.

The release review associates this exact package with source revision
`7acb980a07ebef61b98b791e85b098175438d8c3`; the device evidence itself is
package-bound and does not expose a separate source readback.

Undo ENTER was not confirmed, and no ROLLBACK was submitted. The controller
and bridge exited with the transaction claim retained as recovery-required;
the device state was **UNKNOWN at that time**. This is an uncertain receipt,
not a confirmed Undo failure. The owner observed GLIDE but not TRACK SOLO; that
does not establish why the setting was not visible or whether Track Solo
worked. No later device readback or current base/set identity is recorded here.

### Later owner-reported follow-up

The owner later confirmed that Undo completed and no restoration was needed.
This owner-reported confirmation is not a device readback: the current base, inventory and set
identity remain unverified here. The later administrative release of the
recovery claim is not hardware verification. This follow-up adds no functional,
audio, LED, CPU/timing or persistence qualification and grants no new device
authority. It does not change the uncertain receipt and UNKNOWN state recorded
at the time of the attempt.

Sanitized evidence paths:

- Private trial log: `~/.cache/modwerk-track-solo/track-solo-trial-b41a86d8-45d4-49ee-bae1-2b783ddc86e2.log`.
- Private recovery review: `~/.cache/modwerk-track-solo/terra-recovery-review/report.md`. It contains a source hypothesis, not an established incident cause.

The raw log and recovery material remain outside Git. They may contain private
transaction and device details; do not attach or copy them into a release.

## 3 November 2026 — historical admission and Undo only

**Date:** 3 November 2026

**Evidence type:** exact-package admission and rollback only; not a functional test.

## Identities and result

The Octatrack MKII was running OS 1.40C. The reported base identity was
`9680e9ac861ff9313ce4f7a710a37ad2aa8e9b50b2cf8c043dafa2a0b78cdffc` (ABI 10,
features 903). The trial began from the existing 17-module inventory and used a
manual RAM trial with no host expiry. It added these exact packages:

| Module | Version | Package SHA-256 |
| --- | --- | --- |
| Track Solo | 0.2.2-experimental | `6b7a9d2cb30ceef7d69aedd5cfe5f2ea45fdaa46f6d16069952b8ad93286a2fd` |
| Pattern Sample Locks | 0.1.8 | `28766a017005e664d00620d3831fc81af7449c95e1896a17121ca8fc2d306d8d` |
| Beat Slicer | 0.1.68 | `195d2b46e2620bd15118478aa02d626d6d803692e02c40db4f45a67f6927b643` |

The loader verified the 20-module trial set with SHA-256
`a7768712a95fcbbe50d6dfcec5886eca74434ce25dc3490e23a91d780fc2d46c`. On
Undo, the reported phase returned to normal and the original 17-module
inventory and set identity `51a06498432d819e85131ca0ba27eb8ba7223b639e9318c830e94c1eaa62aaba`
were verified. The private log is
`~/.cache/modwerk-track-solo/mkii-addition-trial-0.2.2.log`.

## What this establishes

The exact Track Solo package was accepted in that RAM set, and the set-level
Undo restored the recorded baseline. It does not establish that Track Solo's
gesture, editing, shortcuts, audio, LEDs or Mute Modes behavior worked on the
unit. It provides no Track Solo CPU or timing measurement and no feature
self-test result.

No project save, Keep, flash, removal-specific test, reboot or persistence test
was recorded. This historical admission does not establish functional
behavior, CPU/cycles or persistence. The approved interaction matrix includes
a no-edit save/reload regression that must leave project data unchanged. Its
physical run remains future planning only, pending source review of the exact
executable client/connection path and separate owner authorization. It has not
run, and no hardware result is claimed. This does not authorize Keep, flash,
reboot or broader persistence testing.

## Functional follow-up status

Any later functional report must identify the exact tested source revision,
Track Solo package hash, base identity, companion set, tester and date, and list
the observed cases and limitations. The current approved cases and their
source-, emulator- and hardware-specific evidence are tracked in
[INTERACTION_CASES.md](INTERACTION_CASES.md). The exact-package emulator report
is recorded in [TESTING.md](TESTING.md); it does not add a result to this
historical hardware record. Rebind evidence if the module source or package
changes.
