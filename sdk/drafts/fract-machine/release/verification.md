# Candidate verification — 10 November 2026

Unlisted 0.1.2-experimental, package6ff37fdc…ef5874, required base72defb09…3da6.

The native recipe compiles ten C units and one assembler unit with 222 own
relocations and 38 event words. The full-machine tests relink a synthetic moved
export/new base ID without recapture, reject missing imports and preserve the
normalized reviewed image. A private promoted-row fixture runs the actual
`octatrack:module-packages -- --base-only` command and its `--check`: it relinks
the new export, updates requiredBase, and reproduces exactly. The prospective
row sets base:true to participate. requiredBase matches the named receipt, independently
of future committed base changes. No current base identity is embedded.
Original local Octatrack1.40C reconstruction is byte-exact; both unchanged strict
stock-free scans pass, with nine bounded copy references. No OS is distributed.
The current host/source suite reports47 tests,4 historical transport skips.
The source-only check and reproducible memory/callback-stack audit also pass.

Experimental draft doctor is green. Listing checks remain pending: catalogue,
qualification/performance, complete hardware coverage, native comparison, active USB
row/fingerprints and pair table. No gate was weakened to hide those gaps.
Performance audit correctly reports three missing groups; the owner accepted
the audio-path method but has not granted its first-release waiver.

The older hardware/emulator and partial-review reports are archived in
history/20261106/ and remain bound to package54ca. No qualification has been
transferred to this candidate. Full readiness and isolated artifact checks are recorded in the PR description.

## Advisory review scope

The migration review used19 API requests across bounded pages/rechecks. The
latest snapshot covers16/39 classified or cached chunks,6 classifier flags and
16 uncertainties, all investigated against source/callers/tests;23 fragments
remain deferred. Seven Markdown files are excluded/static-only. Both configured
deterministic checks pass. No complete/passed advisory review is claimed.

The flags concern the intentional removal of the runtime ID gate and obsolete
ID-refusal tests, and current versus archived receipt semantics. Package-row
requiredBase admission replaces the old gate; actual-machine and actual-wrapper
base-refresh tests cover the replacement. All eight historical files were
compared byte-for-byte with the prior committed candidate. New hardware/emulator
results are scoped separately in [the hardware report](hardware-20261110.md);
full-emulator status remains untested. Deferred declarations/metadata and replacement tests were
manually inspected; that does not erase their API deferral. No confirmed defect
was found or classifier flag suppressed.
