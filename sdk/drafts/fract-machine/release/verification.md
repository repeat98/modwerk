# Candidate verification — 6 November 2026

Candidate: 0.1.1-experimental, runtime id 5efef0cd, SHA-256
54ca8f6b1a30e2f4811129e082ce18881148654b00c97c026508460a6cf7272e.

- Seven recipe/admission tests pass, including source/header symlink rejection,
  stale base/non-export rejection, all seven full base digests, wrong-digest
  refusal and source-only exact package reproduction.
- FRACT host/source suite: 47 tests, four historical transport skips. The current
  source checker compiles 10 C and one assembler unit and links both origins.
- Private original-OS reconstruction is byte-exact; both unchanged strict scans
  pass. No firmware bytes or original OS file are included in this tree.
- Existing USB packages all rebuild identically through the unchanged fallback
  paths of the shared wrapper.
- All seven existing native base proofs match the committed binding identities
  and the same two published export addresses. No base inputs were changed.
- Exact-candidate full emulator execution passes; see emulator-result.json.
  This does not establish hardware audio, persistence or real-time headroom.
- Compiler object comparison preserves the engine/UI units; only base-binding
  code changes. Memory counts and limits are in resources.json.

## Advisory review coverage

The new release-preparation Jev deep pass used 19 requests of its 20-request cap,
including three changed-fragment rechecks. Both configured deterministic checks
passed. At the final code-review snapshot, 63 chunks existed: 16 were classified
(three rechecked and 13 cached), zero flagged, 16 uncertain, 47 deferred. Three
Markdown files were excluded/static-only. The shortened attention list omitted
51 locations: four classified uncertain and 47 deferred; the checkpoint was
inspected to identify the full set. No parser/size blockers occurred.

All 16 uncertain locations were investigated against source/callers/tests:
recipe path/declaration/flags, compile/link/prune and imports, stock-copy bounds,
capture/apply/reconstruction, write/capture/CLI behavior, runtime tables, manifest
and candidate facts, and the two negative-test fragments. Existing SDK linker,
encoder, event registry, reconstruction and frontend base-binding behavior were
read for the omitted context. Manual review also covered the deferred wrapper
integration and native base guard. Confirmed include-header symlink rejection
and macOS resolved-root handling were fixed and their regression check passes.
The recheck classified the changed fragments without flags, but retained
uncertainty; it does not certify them. Other deferred chunks were not classified
by Jev. This is a partial advisory review, not a completed or passed full review.
The generic compiler is not a sandbox for untrusted C; use the isolated builder.

This coverage snapshot precedes the final prose/report additions. Reports and
prospective listing declarations are manually checked; hardware qualification,
complete stack/worst-case-cycle bounds, public promotion and first-release
owner approval remain pending. No earlier private test is counted as qualification
of this candidate, and no approval/waiver is created here.
