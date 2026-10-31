# Private hardware test preparation

These tools prepare original audio and collect evidence for Beat Slicer
0.1.68. They do not qualify the module or publish a base. No device or emulator
is opened by generation, verification, source preparation or review creation.

## WAV pack

`prepare_pack.py --output /private/new-pack --preview` writes 58 original WAVs,
a complete expected-record manifest, README and crossing plots. The plotting
option needs matplotlib; generation and the evidence tools otherwise use only
Python's standard library. Files stay outside Git. All are 44.1 kHz PCM.

| Cases | Formats | Purpose |
|---|---|---|
| Nearest, exact zero, backward tie | Mono/stereo, 16/24 bit | Distances, zeros in either frame and either sign direction |
| Split stereo | Stereo, 16/24 bit | Left +9, right −5; BOTH must select −5 frames |
| Stereo tie | Stereo, 16/24 bit | Left +12, right −12; BOTH must select backward −12 |
| Antiphase | Stereo, 16/24 bit | Opposite channel signs with common crossing positions |
| Silence, bounded DC | Mono/stereo, 16/24 bit | Zero everywhere versus no crossing; retain valid anchors safely |
| Distant | Mono/stereo, 16/24 bit | A valid shift of +279 frames, beyond the abandoned 2 ms prototype |
| Trim tail, full edge | Mono/stereo, 16/24 bit | End beyond trim but within audio; no pair beyond the full-sample edge |
| Work limit/cancellation | Mono16, stereo24 | Eight-second DC; controlled 65,536-pair limit and cancellation window |
| Fractional BPM/trim | Mono16, stereo24 | 120.25 BPM, nonzero trim start, unequal final tail |
| Maximum grid | Mono16, stereo24 | 64 slices at 300 BPM |
| Short tail | Mono16, stereo24 | Omit the unusable 31-frame mathematical tail before snapping |
| Synthesized drums | Mono/stereo, 16/24 bit | Original integer-generated percussion for the separate listening pass |
| Minimum refusal | Mono/stereo, 16/24 bit | Proposed moved boundaries become less than 64 frames apart; publish nothing |
| Anchor zero | Mono/stereo, 16/24 bit | Exact zero on each ideal boundary; stock-style search selects the preceding pair |

Diagnostic fixtures are for marker inspection with monitors muted. Only the
synthesized drum case is intended for audition. No file is a promise of
click-free sliced playback, including when BOTH follows just one channel.

Positions are **PCM frames**, not interleaved words or byte offsets. The
crossing pair at `p` contains frames `p,p+1`; trim/end positions are exclusive.
Each boundary starts from its own mathematical anchor. Expected results are
computed independently by enumerating decoded-file crossing sets; the generator
does not call the C search. `verify_pack.py --pack DIR --header HEADER` compiles
the actual proposed C search, then checks all 174 channel selections, complete
points, outcomes and read counts. This is offline evidence, never stock-device
parity. The 24-bit fixtures retain nonzero low bits, not just padded 16-bit PCM.

Copy the unchanged reviewed files into the disposable project's AUDIO area
through the normal card workflow. Verify their hashes on the mounted card
before leaving disk mode. No tool here mounts, formats or writes the card.
Set trim, sample/project BPM and spacing exactly as recorded in the manifest;
the WAV header does not set the Octatrack's sample BPM. Use the same file for
Flex and Static. Set/verify Flex resolution to match the requested format;
otherwise the format check stops instead of silently qualifying a conversion.

## Measurement base and source scope

`prepare_timing.py --source CHECKOUT --output /private/new-source` applies the
strict base proposal, then a separately guarded private measurement overlay.
Build normally with the immutable toolchain from `../build.json`. The overlay:

- Reads the existing free-running timer, without programming it, around engine
  scan steps and metadata-writer lock spans. It adds no logging or USB in either
  path, and does not raise the lock/interrupt level beyond the existing code.
- Exposes target-compiled offsets for editor state/completion/read counts. The
  host never guesses struct offsets from its own pointer size.
- Lets the existing development-only, read-only MEM request read the two exact
  sample-settings arrays. It adds no write operation or new stock hook.

Counters report instrumented **wall time**, including permitted preemption.
Use deltas for counts/totals; the maximum is since boot and cannot be labelled
as a per-case peak unless the run establishes that. Each raw span must be less
than one timer wrap (about 32.5 seconds); an unresponsive scan is a stop, not a
valid wrapped timing result. Counter wrap/carry is tested. Recording USB audio
is a separate pass because its CPU cost changes timing conditions.

This measurement base has its own identity. Results on it cannot establish
timing or behavior on the uninstrumented candidate. Repeat the required cases
on the exact eventual release build before qualifying or publishing it.

## Capture, compare and recovery

Before device access, follow `/modwerk-try-on-unit`: obtain fresh readiness and
exclusive ownership of the unit, stopped on a disposable project. Start only
one bridge from a stable checkout, sharing EP0 as described in
`docs/OCTATRACK_DRIVING.md`. The tools here reuse that session; they do not start
another one. No hardware command is run merely by preparing this pack.

1. `baseline.mjs --socket SHARE_SOCKET --output NEW_DIR --backup-saved` reads
   the full base identity, active set and inventory. Where supported it exports
   both original saved sets with the existing hash-checked read-only API. An
   unsupported/failed export requires verified alternative rollback packages
   before a RAM boot. Also record project, bank/Part, working/saved Part and
   transport with the normal device tools. Baselines are never overwritten.
2. `prepare_review.py --pack PACK --module beat-slicer.mwrm --base BUILD
   --output NEW_JSON` verifies the exact artifacts and makes the review matrix
   and ZIP. Review also includes the original baseline/recovery evidence; the
   offline matrix alone never authorizes device use.
3. RAM-boot the matching private base and use review/trial/self-test/Undo, in
   short logged batches with a stated trial timeout. Do not use session `try`,
   `--accept`, `lifecycle`, Keep or flash. A private trial does not inherit the
   flashed saved set. Prepare/review base-bound companions before a full-set
   trial; do not install stale copies merely because their names match.
4. Load each fixture normally and verify the selected source/format/settings.
   Seed a visibly different old grid, then capture before opening the dialog.
   Agent-driven navigation must check the actual screen/state between steps;
   no blind fixed key macro is provided. Run stock and candidate grids with
   identical initial anchors for admitted parity cases. Defensive failures and
   unequal fractional/tail grids have separate expectations.
5. `capture.py --socket COMMAND_SOCKET --build BUILD --output NEW_JSON` reads
   the actual selected sample controls, complete settings, all 64 marker rows,
   editor completion and counters. It requires the matching measurement base.
   Add `--pack PACK --case ID --verify-flex-pcm` before and after each ordinary
   Flex fixture operation: the full decoded pool PCM must match the reviewed
   WAV, including 24-bit low bits, with unchanged page/source bindings. This
   supports normal file-backed Flex only; Static file identity uses the
   verified card file and checked browser/source selection. It rejects changing
   reads. Two identical settled reads are not an atomic
   snapshot or proof against arbitrary simultaneous writers; run race tests
   separately and inspect settled original tables after the race.
6. `compare_records.py --pack PACK --before BEFORE --after AFTER --case ID
   --snap ON --selection BOTH [--stock STOCK_CAPTURE]` checks exact
   count/start/end/loop, inactive rows, settings, completion and pair reads.
   `--cancelled` requires the entire old table unchanged. Source-change tests
   must inspect the original source again after cancellation, not compare
   different selected sources as if they were one sample. Matching metadata
   alone never proves which card file was loaded; keep the PCM/file/load
   log and source-binding checks with each result.
7. Run additional BPM/spacing, recorder/concurrency, BUSY/read-failure, audible
   and disposable-save procedures from `../TESTING.md`; a WAV cannot create all
   those conditions. Their results stay untested until observed.
8. Verify Undo, have the owner power-cycle, then run `baseline.mjs --compare
   ORIGINAL/baseline.json` and the Part checks again. Stop on an unknown active
   set, changed inventory, failed restoration, USB loss or unexpected marker
   write. Never attempt card-set repair with Keep on the temporary base.

Run `python3 -B hardware/test_preparation.py` from this folder for the offline
WAV/C-oracle, complete-record rejection, cancellation, measurement arithmetic,
read-range and actual overlaid board/service regression checks.

Guide feedback: nothing missing from the shared guides for this preparation;
the measurement limitations and procedures belong with this private proposal.
