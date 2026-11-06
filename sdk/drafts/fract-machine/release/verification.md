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
worst-case timing, public promotion and first-release
owner approval remain pending. No earlier private test is counted as qualification
of this candidate, and no approval/waiver is created here.

## Resource-accounting follow-up

`qualification/resources.py` now reproduces the exact tested package and
accounts for the loader's aligned 31,776-byte resident extent. Its conservative
own-call graph gives 712 bytes for one render activation, with stock/base and
task/interrupt frames explicitly outside scope. `resource-audit.json` pins the
compiler, authored image, package and loader inputs. Native runtime inputs and
hardware package bytes remain unchanged. Relative display gauges are labelled
source estimates; worst-case ColdFire timing remains unmeasured.

Fault injection confirmed refusal of a missing indirect-call policy entry,
stale policy site, own recursive call, unbounded compiler frame and changed
loader hash. The normal audit reproduced the package and stack result. The
manifest's storage method was corrected to the contract's `static` enum;
details remain in its conditions/source report.

The bounded resource-only Jev deep pass and continuation/recheck used six API
requests in total. At their final snapshot, five of 32 chunks were classified or
cached, zero flagged, five uncertain and 27 deferred; three Markdown files were
excluded/static-only. Both configured source checks passed. All five uncertain
locations (measurement, own-stack walker, manifest, generated report and module
docstring) were investigated using the compiler/disassembly, loader allocation
formula, encoder, contract and source-estimate guide. Manual review checked all
indirect target definitions, the assembly leaf reservations, outgoing return-PC
charges, excluded stock boundaries, report offsets and package identity. The
20 omitted attention locations were inspected in the checkpoint; they are
deferred imports/constants/comments/CLI scaffolding and the compact resource
JSON, not additional classified findings. They remain outside Jev coverage.
This is partial advisory coverage, not a passed/completed full review. This
paragraph is later manually checked prose and was not part of that snapshot.

Draft doctor still reports the expected publication failures: no active
catalogue/package/pair entry, native comparison or completed qualification.
Its report is not a release pass. The draft is deliberately not promoted to
hide those failures; the resource report does not substitute for timing.


The loader ABI was subsequently checked against Elekloader's base compiler
flags, the exact compiled base loader object, and its physical saved stall
report. The module uses `-malign-int`, while the base uses 2-byte aggregate
alignment. The preliminary layout probe incorrectly used the module's setting;
its aligned header was 16 bytes too large. The corrected base header is 528
bytes, resident extent 31,776 and retained same-candidate peak 63,552. The
firmware-free probe now explicitly uses `-mno-align-int` and rejects a layout
other than the reviewed `(528, 88, 72, 38, 4)` tuple. The real base loader's
`(sites * 72 + 543) & ~15` agrees, as does the hardware's 31,776-byte pool
reading with one module. Native module/package hashes remain identical.

An explicit bounded correction continuation and changed-fragment recheck used
one further API request (seven across this resource follow-up). The resulting
checkpoint, after merging newer main, contains 44 chunks: five cached/classified,
zero flagged, five uncertain, 39 deferred and seven excluded/static-only files.
Both configured checks passed. The two measurement views, own-stack walker,
generated report and docstring uncertainties were investigated; the base ABI
and allocation evidence above supply the missing context for the correction.
The 32 omitted attention entries were inspected selectively, including the
later upstream-only diff and updated report/metadata scaffolding. They remain
outside classified coverage. Later incident-report prose was checked manually.
There is no completed/passed full-review claim and no timing qualification.
