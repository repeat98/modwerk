# Testing: Pattern Sample Locks 0.1.8-experimental

31 October 2026 (Taipei) · twwwy · prototype hardware follow-up; no release approval.

## Current scope

Apply leaves playback in its current state. The native writer validates its source under a level-two task guard and atomically publishes each changed sequencer step (at most eight SAMPLE/mirror pairs plus one index byte), allowing interrupts between steps. It refuses live/sampler recording. Separate session-RAM profiles remember successful Lock/Clear selections and cursors, Lock replacement policy, and the last action. Cancellation/refusal preserves prior preferences; module reload resets them.

Portable planner, UI and production native-writer sanitizer tests pass. The full exact-build DSP-enabled emulator run passed, including CPU monitoring, native save/reload, live edits and preference reset on module reload. Current MKII results include a verified kept restart and removal/Undo on the named flashed base. Full publication and cost qualification remain incomplete; reported physical/UI/listening results are labelled below.

Retired reports and obsolete captures are consolidated in [PROTOTYPE_HISTORY.md](PROTOTYPE_HISTORY.md); they do not qualify this version.

## MKII exact-current-base RAM functional trial — 3 November 2026

The author (`twwwy`) reports that both physical actions passed on the
Octatrack MKII, OS 1.40C, using the exact public candidate package
`3e13c46fb0054d05f228b045746453e0c50dbbe52fb53b3c229d598ddd7fed79` from
source revision `5a15ac390dac2475df3fb3b2ef64154e174b4182`. With Replace OFF,
Lock preserved an existing manual SAMPLE lock and filled an empty SAMPLE field
on a trig. Clear removed selected manual SAMPLE locks while preserving a
non-SAMPLE lock and unselected data. The author reported both checks passed,
with no mismatch or action refusal.

The trial ran against base identity
`9680e9ac861ff9313ce4f7a710a37ad2aa8e9b50b2cf8c043dafa2a0b78cdffc`, matching
the checked-in base binding. An offline current-beta-base build reproduced
that identity (`NOT_FLASH_CANDIDATE.bin` SHA-256
`9ae4d63a36f113f3cae563650cd44476ced0bc950bf4382f3185ec3f68728e66`); that
artifact was not loaded or flashed. The exact 300-second RAM trial ended after
203 seconds through the runner's rollback path. After rollback, the active
digest returned to prefix `951766ebfe1ef23a`, and the complete 17-module live
inventory matched the pre-trial inventory. Slot generations 6 and 7 were
unchanged. The public base does not support saved-file export, so this verifies
slot metadata and live restoration, not saved-set file contents. The working
pattern is disposable; unsaved RAM edits may remain there until it is reloaded.

There was no Keep, project save, flash or power cycle. Action counts, track
counts and per-action timing were not reported. The public base refuses the
development-only UI, transport and memory reads, so no stack watermark or
device memory measurement was obtained. Its diagnostics refusal counter rose
during the run because the USB bridge periodically sends unsupported
development request 6; this is not evidence of a Lock/Clear action refusal.
The trial establishes these two reported functional checks on the exact current
base only. It does not measure audio, maximum-load behavior, worst-case cycles
or complete memory, and does not close first-release owner review.

## Temp Save interaction on the emulator — 4 November 2026

On current base identity `9680e9ac…`, the exact Sample Locks candidate
`3e13c46f…` and published Temp Save package `00b8d5ab…` were installed
together on a copied emulator card. After opening FUNC+PART, releasing FUNC and
pressing FUNC+YES, Sample Locks retired its overlay and Temp Save saved a
deliberately changed SAMPLE byte. FUNC+NO restored that value after another
labelled emulator-only mutation. The same check passed after Sample Locks was
removed, with Temp Save still installed. Both packages were then removed from
the emulator copy.

Holding FUNC continuously from the initial FUNC+PART through YES on the
Sample Locks row opened its track selector; Temp Save's previous snapshot was
unchanged. The held-through control after removing Sample Locks also retained
the previous Temp Save snapshot. The first socket setup failed before boot; the
successful runs used the emulator's local filesystem. The [stock-free receipt](evidence/qualification-progress-20261104.md#temp-save-emulator-comparison)
names the packages, base, fixture, method and limits. This is one no-DSP
emulator scenario, not hardware, audio or complete companion qualification.

After refreshing to main `5ceb89bd…`, draft `module:doctor` reports that
the declared stock sites and UI claims pass its static cross-compatibility
check against the active catalogue, including Temp Save. It still refuses
publication: the qualification record, catalogue, packages and native
comparison are incomplete. A static claim check does not prove live behavior.

The normal public package wrapper on that main built and checked the exact
`3e13c46f…` candidate in a private catalogue fixture; both stock scans and five
negative CLI checks passed. A private USB-only scope check preflighted add
and removal on seven public base identities and all 30 packages, including
Temp Save. It also verified the card-build refusal and beta-library path.
These are [software preflights](evidence/qualification-progress-20261104.md#current-main-package-and-usb-preflight),
not real catalogue admission or complete combined-runtime evidence.

On the same reproduced base, a DSP-enabled MKII emulator ran the exact package
through five playback-active Lock/Clear fixtures: two changes, one full track,
and 512 changes with no other lock, a first-slot lock or a last-slot lock.
Every resulting pattern, mirror and lock index matched; the module image and
sites were attested, and removal passed. The highest observed Clear callback
interval was 314,314 emulator instructions in the 512-change no-other-lock
case. DSP frames advanced without reported errors or stalls. Main audio was
disabled; the count includes intervening interrupts and is not chip cycles,
a universal bound or audio evidence. See the [edit matrix](evidence/qualification-progress-20261104.md#current-base-emulator-edit-matrix).

## Exact package image and current-base pool extent — 3 November 2026

A source-only build in pinned toolchain image
`sha256:da70d46e10b243277fa3ae2e015f7258d56b3ee08ca4be47e61899958872e792`
(GCC 16.2.0), at source revision `5a15ac390dac2475df3fb3b2ef64154e174b4182`,
compiled `translation.c` and assembled `unit.s`. Linking both at origin zero
produced identical images: 8,748 initialized bytes, SHA-256
`54efd2166b30b836401d02f8d0d785e12aebc5b40196deb1a9b6e4530e6f95d5`, 1,328
BSS bytes and 167 relocations. The exact candidate package SHA-256 is
`3e13c46fb0054d05f228b045746453e0c50dbbe52fb53b3c229d598ddd7fed79`; its
header records four hooks and three sites.

After refreshing to main on 4 November, the current qualification fingerprint
of the draft's native-source inventory is
`7ea0fbdf317bfdab6a82b22869c7029ba23901cd27a3337a4bdaf8f8beeb7e69`.
The current fingerprinting code produces the same value for the draft archived
at the tested revision `5a15ac39…`. Both calculations used the unqualified
draft manifests; recompute it against the final qualification record because
declared report paths affect the inventory.

For the checked-in current base source, `RUNTIME_SITE_EVENTS` is 34 and
`RUNTIME_POOL_BYTES` is 768 KiB. The pinned 54455 layout gives
`sizeof(struct runtime_module) = 528` and one site record 72 bytes. Three sites
make a 752-byte aligned module header; the image and BSS align to 10,080 bytes.
With no DSP tail, the loader reserves exactly 10,832 bytes in its shared runtime
pool for one installed copy of this package. The module ID maps to one live
position, so at most one copy is active. During replacement, the loader can
retain the old extent while it stages or holds the candidate for rollback. Two
extents of this exact package occupy 21,664 bytes together; a different old
version may have a different extent, and reclamation depends on reachability.
The 10,076-byte image-plus-BSS figure above excludes the runtime header and
alignment. These are source-derived pool allocations for the
checked-in base and exact package, not a device memory readback. The separately
shared `sys` task stack is not part of the pool extent; complete stack demand
remains unbounded, so the overall memory gate stays open.

The [current-base memory layout](evidence/qualification-progress-20261104.md#current-base-shared-memory-layout)
also accounts for the base's fixed, shared upload stage and loader ledgers.
The stage includes a 1,310,720-byte image buffer; the candidate's 10,048-byte
package occupies part of that existing buffer while staged. The base separately
reserves the 786,432-byte runtime pool, 256 owner records and pointer slots,
and 128 live-position pointers. These fixed allocations exist independently of
this module and must not be added again as per-module dynamic allocations.
Whole-set staging, concurrent extents, reclamation and stack demand remain
separate peak-accounting questions.

The current base source places key, encoder and tick hooks on the `sys` task,
with an 8,192-byte stack span. It says draw runs there nearly always, so that
span is not established for every draw context. The stock task inventory also
lists a separate 2,048-byte UI-task stack; whether each draw path can run there
remains to be established. On 4 November, a network-disabled pinned GCC 16.2.0 build with
`-fstack-usage -fcallgraph-info=su` reproduced the candidate's reconstructed
image, 1,328-byte BSS and 167 relocations. Its 33 authored frames are static or
compiler-bounded. Adding four bytes per internal return word gives the same
authored-only path bounds as the earlier audit: key 500 bytes, draw 296,
encoder 44, opener 40 and tick 16. The [stock-free compiler report](evidence/qualification-progress-20261104.md#uninstrumented-compiler-stack-audit)
records the source hashes, flags, frames, paths and seven indirect call edges.
Stock font, refresh, popup and close callees, the base dispatcher/caller and
interrupt nesting are not included; no stack high-water or canary was measured.
Full stack demand is still unbounded.

On 4 November, offline disassembly of the reproduced current base, verified
against its build proof and event tables, accounted for the base's event bus
and runtime dispatcher while the module callback runs. From the event entry,
the authored-only subtotals are key 548 bytes, draw 328, encoder 92 and tick 56;
these exclude the incoming event return word and stock caller. Three stock
leaf routines were also bounded on the matching, unmodified base code: font
drawing uses 64 local bytes, font measuring eight, and global refresh zero,
excluding their return words. Including the two font callees does not increase
the draw subtotal above 328 bytes. Further stock-code call-path audits bound
the popup close subtree to 36 bytes and the track refresh subtree to 304 bytes,
each excluding its incoming return word. Including those paths, the key-event
subtotal is 808 bytes from the base event entry; draw remains 328, encoder 92
and tick 56. These are conservative stack subtotals for the exact candidate and
reproduced base, assuming no other module patches the audited stock ranges.
The reproduced base's system-task initialization and message-loop audit adds
the task frame and event-call arguments: from task entry the key subtotal is
916 bytes, encoder 200 and tick 156. This assumes called functions preserve
their ABI stack pointer. The incoming task-entry return word, popup opening,
interrupt nesting and other contexts remain unbounded. The popup audit now
confirms five other initial callback entries from cached stock callers; two
have complete 32-byte callback-local bounds, while three still have unresolved
paths. The candidate's own close subtree retains its prior 36-byte bound. The
rooted follow-up closes the `0x400131c8` leaf at four local bytes and finds a
408-byte finite path through the early `0x4004d948` helper chain from the popup
routine's entry; this is a path total, not an opener bound. The separate
window-creation path remains unbounded. A ColdFire whole-image sweep gives all
50 manager-call patterns a six-write argument setup and immediate `D0` use,
but the 44 uncached callers still lack rooted code/data-boundary proof. Their
initial argument-six values suggest 48 distinct code
addresses plus one runtime-derived target, not a closed callback set. The
`0x40037d80` path reaches a runtime table dispatch, and the `0x40055ec0` path
retains dynamic object and register-indirect targets. The exact base proof
contains no companion modules; one later `0x4004d948` code window differs from
stock, so results stay bound to this base image. The [popup callback evidence](evidence/popup-callback-stack-20261104.md)
records the hashes, methods and limits; the [stack evidence](evidence/qualification-progress-20261104.md)
also records the base dispatcher, stock leaves, popup close, bounded switch
and track refresh. No device was accessed, and neither the complete memory
nor cycle gate is closed.

Static source inspection establishes finite loop limits for the authored commit
path: eight tracks and 64 steps; up to 31 remaining parameter-lock slots scanned
for each cleared SAMPLE field when recomputing the index; and at most 64
per-step publications, each writing up to eight selected tracks. These control-
flow limits are not a cycle bound. The candidate targets MCF54455 ColdFire V4,
not MCF5206E. A separately identified MCF54455 timing probe recorded 1,103,227
DTIM3 counts (8.35778 ms at its assumed 132 counts/µs scale) for the maximum
Clear commit body among five recorded runs. That interval includes interrupts,
validation, scanning, publication, native follow-up, probe overhead and stack
samples; it excludes the caller and function prologue/epilogue. It is neither
exclusive core cycles nor a universal worst-case bound. The [NXP MCF54455
Reference Manual, §3.3.5.1](https://www.nxp.com/docs/en/reference-manual/MCF54455RM.pdf)
lists instruction timings under the assumptions that instruction fetches are
ready, there are no sequence-related pipeline stalls, and memory is zero-wait.
This evidence does not bound those conditions, stock callees or interrupt nesting,
so no defensible worst-case core-cycle bound is established. The stack and cycle
gates remain open.

## PR #1088 reconstruction maintenance review — 31 October 2026

Reconstruction recipes now live in the SDK machine adapters. Shared-input
updates refresh them in the SDK/base PR, without editing module folders. The
reviewed module inputs exclude scanner/test files; all eleven native/provenance
inputs remain byte-identical to `d803af33`. No module version or runtime changed.

Eight focused host regressions pass, including SDK-only pin refresh, test-only
edits and stale committed pins. The ordinary public wrapper build and `--check`
reproduce the same 10,048-byte `3e13c46f…` package with both stock scans and all
five negative CLI probes. Editing all three excluded diagnostic/test sources
also leaves the real build identical. USB-only library/card/source checks,
seven public-base add/removal preflights and all 29 package preflights pass.
The isolated Octatrack build passes the normal importer’s committed-artifact
comparison; all 28 current elemod release exports reproduce. Node 24
`pr:ready` reports Ready. See the [stock-free receipt](evidence/review-response-20261031.json).

The two draft qualification/audio application changelog entries were removed;
results remain here and in the linked reports, while draft release notes remain
in `CHANGELOG.json`. The no-module input fault is tracked in
[base issue #1110](https://github.com/repeat98/modwerk/issues/1110), with emulator
reproduction and separately scoped hardware observations. No new hardware test,
input-helper fix, catalogue admission or release approval is claimed.

## MKII exact-package public-base lifecycle — 31 October 2026

Candidate `3e13c46f…` passed scoped native-selector Undo, explicit Keep/reboot,
removal/reboot and original-file restoration on public base `2aa35c39…`.
The author opened the selector physically; no remote panel events were sent.
Undo restored the prior active/set identities and empty inventory. The kept
singleton restored after power cycle with the same whole-set identity; removal
also survived reboot. Card readback independently verified the exact package
and a newer empty set. All 60 fixture files and both original saved-set files
were preserved byte-for-byte. A final restart verified the original public
base, normal empty inventory and advancing DSP frames; USB was released.

Selector opening and the normal screen after the sequence were author-reported.
The public base supplied no direct selector-phase-after-ENTER or site/BSS/held-key
readback. This was a stopped lifecycle test, not a new audio/load test or total
stack qualification. The earlier failed remote-key attempt remains a failure;
its helper is unfixed. See [method and limits](MKII_PUBLIC_LIFECYCLE.md) and the
[stock-free receipt](evidence/mkii-public-lifecycle-20261031.json).

## MKII companion-load follow-up — 31 October 2026

The later [final qualification attempt](FINAL_QUALIFICATION.md) reproduces the
exact public package and authored stack audit after merging current upstream.
Repository checks pass. The open-selector lifecycle test stopped before reaching
its selector when a remote key was not acknowledged; rollback was confirmed.
A no-module input probe also failed. This attempt supplies no open-selector
removal pass. At that point, exact-package Keep/reboot/removal was deferred for foreign saved
files; the later run above preserved those files and completed the scoped test.
No Keep or flash occurred in the failed remote-key attempt.

The latest fresh-boot rerun held the physical panel still and used USB recording
for added load. All 32 maximum 512-field edits, full pattern/index/Part comparisons
and input-state checks passed. Four minutes of USB PCM passed the stated continuity
checks; sampled main CPU reached 93.7%, with no DSP errors/stalls or frame shedding.
STOP worked. Initial Undo hit a protocol fault; subsequent recovery and complete
restoration were verified. See the separate
[rerun receipt](evidence/mkii-usb-recording-rerun-20261031.json) for final restart status.
Following the author's power cycle, the original flashed base, normal state,
empty inventory, original set identity and advancing DSP frames were verified;
USB was released. Nothing was pushed.

The unchanged candidate ran beside TapeHead, E-Verb and Air Chorus with real FX
assignments. The initial 32 maximum edits passed data, transport and USB-audio
checks; sampler recording refused Apply without writes. Earlier higher-load qualification
**failed**: after 24 individually verified USB-recorded edits across interrupted
attempts, physical STOP behaved as a paste gesture and A02 had six missing SAMPLE
fields. The input/modifier fault and unintended edits remain unattributed. Recovery
restored all four patterns, cleared held keys, stopped playback and verified Undo.
After the author's restart, the original public base and empty inventory were
verified and USB released. See [method and limits](MKII_HIGH_LOAD.md) and the
[receipt](evidence/mkii-companion-load-20261031.json). No push occurred.

The subsequent no-module emulator baseline reproduced TRIG5–7 held and lost
FUNC release by interleaving a USB development key with a split physical fader
report. This confirms an independent development input-path bug and strongly
explains the hardware signature; it does not qualify a fix or attribute every
unintended edit. See the [isolation receipt](evidence/input-isolation-emulator-20261031.json) and
[base issue #1110](https://github.com/repeat98/modwerk/issues/1110).

## MKII automated audio/timing follow-up — 31 October 2026

Unchanged candidate `3e13c46f…` passed 43 native operations on RAM development
base `20ed7910…`: forty maximum 512-field edits, two selected-track 64-field
edits and one preserve-existing no-op, including ten maximum Lock/Clear pairs
and 300 BPM checks. Complete pattern bytes, working Parts and active lock-index
flags matched; transport stayed as it was. Live-sequencer recording refusal,
cancellation and armed pattern-change cancellation passed in a separate edge run.
Direct battery-mirror readback, sampler recording and broader stress remain open.

A separately identified timing probe `7ecf9700…` ran 46 operations. Five A01
pairs without USB recording gave Clear median/maximum 4.43/4.80 ms; with recording,
7.66/8.36 ms. These are elapsed instrumented native commit-body intervals including
interrupts and probe overhead, not unchanged-package or universal CPU bounds.
The unchanged candidate's inner publication timer peaked at 573 counts (about
4.34 microseconds), excluding interrupt-mask boundary instructions.

Forty USB captures covered about 232 seconds. All 188 complete 120 BPM one-second
windows verified eight track tones plus Main; 300 BPM captures matched their own
unloaded spectral baseline. Whole-capture held/zero/repeated-block and adjacent
sample-change checks matched the baselines. DSP errors/stalls stayed zero; some
frame lateness occurred both with edits and in unloaded recording baselines.
Sampled probe stack use was 612 of 8,192 bytes; stock/interrupt minima and full
stack qualification are not established.

All four automated trials verified Undo, original sites and empty inventory.
The fixture's four patterns and 120 BPM were restored. The author power-cycled;
original public base `2aa35c39…`, empty inventory and advancing DSP frames were
verified. No project Save, Keep, flash or push occurred. The initial runner's
recording assertion used the wrong status field; its Undo passed and the native
live-flag follow-up passed. See [full method, corrections and limits](MKII_AUDIO_TIMING.md)
and the [stock-free receipt](evidence/mkii-audio-timing-20261031.json).

## Sample-inclusive audio fixture — 31 October 2026

The private fixture now contains eight original generated stereo WAVs, four
Flex/four Static assignments and four saved 512-trig patterns. All sample files
are explicitly staged in its FAT image and verified by hash, with valid trim
markers and saved bank checksums. Fresh repeated generation is byte-identical.

An independent emulator process/card/socket ran package `3e13c46f…` on named base
`2e1a6128…`, with main level explicitly set to 64. Ten PCM windows passed the
main-mix and eight per-track expected-tone checks: with the module closed,
through maximum Lock/Clear on A01, before/through Clear on A02–A04, and after
native removal. Working/mirror records, lock-index flags and playback state
matched expectations. All 80 track-tone checks passed; native DSP errors/stalls
stayed zero. See [method, results and limits](AUDIO_FIXTURE.md) and the
[stock-free receipt](evidence/audio-fixture-20261031.json).

The older harness's `--main-level off` means its phase/DSP-counter runs establish
no main-output audio result. This follow-up supplies native emulator PCM evidence;
no physical listening, continuity/dropout, CPU or complete stack qualification
is inferred. One incomplete audio run hit the loader's stopped-transport rule
during teardown; it remains recorded separately from the completed run.

## Physical fixture preparation — 31 October 2026

On the author’s MKII, public base `2aa35c39…`, the new disposable set
`PSLTEST_261031` / project `PSL AUDIO TEST` was copied to the mounted card:
60 files / 23,780,482 bytes, including eight samples, all read back by SHA-256.
Existing module-set files were preserved and the card was safely ejected.
The author confirmed the fixture loaded on A01. No module was installed,
no Keep or flash was performed, and no owner project was saved.

Initially the author reported stalled playback and silent previews. Read-only
load queries confirmed frozen DSP frames while UI ticks advanced. After an
author-performed power cycle, DSP frames advanced on the same base. The initial
“Playing and audible” reply was later corrected: PLAY had not been pressed for
the first post-restart captures. Those recordings contain constant values via
both Swift HAL and FFmpeg AVFoundation, but do not establish a USB audio fault
or playback result. The author subsequently explicitly pressed PLAY and
confirmed advancing, audible playback. A new three-second USB capture then
passed: all eight expected tones were verified in the track stems and all
eight were present in Main. Expected-frequency energy fractions were
99.83–99.99% in the analysed one-second window. The earlier USB-fault inference
was retracted; the unconfirmed-transport captures remain in the receipt.

Four synthetic analyser checks accepted PCM16/PCM32 tones and rejected loud
constant channels, muted Main with active stems, and swapped tracks. This
validates the measurement path, not edit continuity. No Apply/Clear, dropout,
CPU or stack qualification is claimed. Inventory remained empty. See the
[stock-free preparation receipt](evidence/device-fixture-20261031.json).

## Normal public package builder — 31 October 2026

The local host-wrapper integration builds and checks the reconstructed candidate
through the normal CLI in a disposable catalogue fixture. Both strict scanners
pass; its complete package equals the emulator-tested `3e13c46f…` candidate.
Five negative CLI probes are refused. This changes packaging only, preserving
the initialized runtime, BSS, relocations, callbacks and sites. The real
catalogue remains unchanged; no physical device was accessed. See
[method and reproduction](RECONSTRUCTION.md#normal-package-path--31-october-2026).

The author then selected a USB-only first beta. The candidate declares
`usbOnly: true`; production components refuse card downloads, block classic
library additions without USB access and permit beta USB selection. Card
compiler source/version scope stays unchanged. Normal USB build/check and five
rejection probes pass with the exact emulator-tested package; add/removal Undo
preflight passes on all seven public base identities and preflight accepts all
29 packages. These are private fixtures, not publication or concurrent runtime
qualification. See [scope and method](USB_BETA.md) and the
[stock-free receipt](evidence/usb-beta-scope-20261031.json).

## Apply phase profiling — 30 October 2026

An independent DSP-enabled MKII emulator process used its own copied card and
socket, with shared inputs mounted read-only. The unchanged package
`28766a01…` ran on base `2e1a6128…`; this is a separate named emulator base,
not qualification of current public main. Symbol-only assembly annotations
reproduced the linked package image byte-for-byte. See
[reproduction and phase definitions](APPLY_PROFILING.md) and the
[stock-free receipt](evidence/apply-profile-20261030.json).

All ten native panel operations passed (Lock and Clear for five fixtures).
Complete track-byte comparisons preserved every non-SAMPLE byte; canonical
battery mirrors and every audio lock-index byte matched. Transport remained
running during Apply. Removal restored the declared stock sites and image
attestation matched all 8,748 initialized bytes and three opener sites. DSP
frames advanced from 42,798 to 97,219; errors and stalls stayed zero. No listening
or physical hardware result is inferred.

| Clear fixture | Changed fields | Total elapsed emulator instructions | Index-planning interval |
| --- | ---: | ---: | ---: |
| Two steps, no other locks | 2 | 10,483 | 2,228 |
| One full track, no other locks | 64 | 29,890 | 18,286 |
| Eight full tracks, no other locks | 512 | 307,630 | 246,660 |
| Eight full tracks, other lock in first slot | 512 | 77,046 | 16,116 |
| Eight full tracks, other lock in last other slot | 512 | 278,686 | 244,004 |

Each row is one operation. Index planning includes mirror checks and mask
preparation, not only scanning. All phase intervals include any intervening
interrupt execution: the first-slot case includes 32,989 instructions in final
revalidation, versus 6,741 in the other maximum Clear cases. These observations
are not isolated chip cycles, repeat-run maxima or universal bounds. The
no-other-lock maximum spent 80.2% of its observed interval in index planning;
the first/last-slot comparison supports investigating the scan before changing
transaction semantics. Full-pattern Lock totals ranged from 72,748 to 98,996
elapsed instructions. Maximum publication-mask spans were 86 instructions,
with 64 short guards per full operation; guard timer maxima are cumulative and
exclude some boundary instructions.

The phase run deliberately omitted the legacy cached-meter baseline experiment.
Its raw completion metadata inherited a `performanceBaselineAfterRemoval` label;
that label does not establish a measured unloaded baseline. The helper now
reports removal completion instead. The receipt preserves the actual executed
helper hash and explains this metadata-only correction. An earlier private
startup was stopped before measurements to freeze the helper revision; it is
not a module failure or a completed timing run.

No native C/assembly or transaction behavior changed. Deferred flag cleanup and
cooperative batches remain unimplemented. A subsequent local
[scheduling test](SCHEDULING_TEST.md) observed task exclusion and resumption on
the unchanged emulator package. Physical phase timing, complete interrupt/stack
bounds and release qualification remain unqualified.

## Local beta preparation — 30 October 2026

Fresh C compilation matches the committed assembly and exact tested package.
The unchanged public wrapper also builds and rebuilds that package byte-for-byte,
but both stock-byte scans reject it; this remains a publication blocker.
Authored stack paths sum to at most 500 bytes, excluding stock callees, the caller
and interrupts. Full system stack safety and physical worst-case cycles remain
unqualified.

The production browser USB preflight passes standalone addition/removal/Undo
for all seven current base identities, all 29 candidate-plus-published packages,
and corruption/capability rejection. GNU/browser object-link bytes, exports and
BSS end match at three addresses. These private component fixtures do not prove
full card integration: its native UI subscriptions remain unfinished. Portable
and production native-writer sanitizer tests pass; 91 existing package/linker
tests pass. No physical device was accessed and no new work was pushed.

See [methods, limits and blockers](BETA_PREPARATION.md), the
[stock-free receipt](evidence/beta-preparation-local-20261030.json) and the
[future supervised MKII checklist](MKII_BETA_CHECKLIST.md). Publication gates
remain active and this module stays a draft.

The [stock-scan investigation](SCANNER_INVESTIGATION.md) subsequently reproduced
the encoder prologue and signed-remainder matches with a 60-byte independent
compiler probe. A separate compilation container had no private stock or
reference package mounted. All 15 rejecting seed starts are classified into
eight groups of compiler output, font calls and authored action labels. The
unchanged scans still reject the original reference; the subsequent private
reconstruction candidate below evaluates the existing guarded packaging route.
No scanner, runtime or public package changed during that investigation.

## Private reconstruction candidate — 30 October 2026

Candidate `3e13c46f…` is 10,048 bytes, with nine hash-guarded copies restoring
107 bytes. Both unchanged strict stock scans pass. Fresh C/assembly and complete
reconstruction preserve the original 8,748-byte image, 1,328-byte BSS allocation
and 167 relocations. Twelve malformed recipe cases are refused. All copy source
hashes match in seven actual public-base builds; production browser preflight
and source comparisons against 541 declared patch spans pass.

On named emulator base `2e1a6128…`, the real loader refused six malformed
packages without changing active identity/generation or the opener sites, then
installed the valid package in the same session. Four complete live-image/site
attestations passed, including all nine source guards. Live 512-field Lock/Clear,
non-SAMPLE bytes and canonical mirrors, pattern switching, recording refusal,
stopped-state preservation, native project save/reload, RAM preference retention,
removal, reinstallation/default reset and Undo passed. DSP frames advanced
44,149 → 276,660; errors and stalls stayed zero. The unloaded baseline's cached
CPU meter also saturated, so it provides no isolated CPU estimate.

An initial eight-copy package was refused for a source in protected bootloader
storage. Splitting that source into two permitted eight-byte copies corrected
the candidate without changing loader rules or runtime bytes. Two intermediate
attempts stopped on harness transaction-number errors; only the final complete
run qualifies this local lifecycle result. No physical device was accessed.

See [reproduction and limitations](RECONSTRUCTION.md), the
[candidate declaration](evidence/reconstruction-candidate-recipe-20261030.json)
and [combined receipt](evidence/reconstruction-local-20261030.json). Public adapter
admission/short-title support, card UI integration, physical cost/complete stack
bounds and first-release qualification remain pending. Nothing has been pushed.

## Exact local build

- Source checkpoint: 42525aa0064bd228b3ad8d0aa1a3dae7f9413622 (module implementation 481e78b6; later checkpoint changes the emulator harness only).
- Package SHA-256: 28766a017005e664d00620d3831fc81af7449c95e1896a17121ca8fc2d306d8d.
- Object SHA-256: b8733f98963fcd1e8e1b85a49f4cff1f196c73ade9a3c9ee7be982bc9a9bffb2.
- Initialized code/data 8,748 bytes; BSS 1,328; 167 relocations; four standard UI hooks; the same three guarded opener sites. No DSP code, effect slot, frame callback, ownership ledger or private retained storage.
- GCC 16.2.0, freestanding MCF54455, strict warnings and late-combine disabled. Regenerated assembly reproduced byte-for-byte; undefined-symbol and ColdFire instruction guards passed. The profile linker independently reproduced the exact package image.
- Compiler stack-usage output reports 344 bytes for the native commit frame, 104 for its module-key caller and eight for the per-step helper. This does not bound stock callees, interrupts, or total hardware stack use.

Draft module:doctor passes category, thumbnail, manifest parsing, UI claims and declared compatibility with the base and all active modules. Catalogue/package import, native parity and hardware publication gates remain red for this unqualified draft; none is bypassed.

## DSP-enabled native emulator results

The complete run passed on a copied private card, with source hashes frozen throughout. Receipts: [capture](media/emulator-0.1.8.json), [CPU and operation measurements](media/emulator-0.1.8-performance.json). The entire relocated initialized image and all three live sites matched the exact package. The long test kept the module only on the disposable emulator card; no physical USB surface was available to the container.

- Lock preserved the manual SAMPLE lock with replacement OFF; repeated Lock made zero writes. Clear removed all selected SAMPLE locks while preserving other locks, unselected bytes, trig data and native mirrors.
- Live maximum Lock and Clear each changed 512 SAMPLE fields, with playback continuing. A second pattern passed the same operations; the other pattern remained unchanged. Pattern selection retired an armed confirmation before stock processed it.
- Independent successful Lock/Clear profiles, last action, cursor, cancellation/refusal preservation, first-session empty selection and replacement OFF passed. Native project reload retained the RAM preferences. Removal/reinstallation reset both profiles to safe defaults. Portable UI cases additionally cover changed eligibility and remembering All versus a custom subset.
- A real panel REC+PLAY gesture enabled live recording; Apply refused without changing recording, transport or pattern data. Stopped Lock/Clear remained stopped. No implicit transport commands are emitted by the module.
- Native Save Project and both Reload Project stages completed through the stock UI. The entire saved pattern and its canonical mirror matched after reload, including all 512 SAMPLE locks. Clear then removed those locks without unrelated pattern changes.
- Removal with track selection open restored all three original sites; playback and execution continued. Reinstallation and a second Undo/removal also passed.
- DSP execution advanced 232,521 frame interrupts overall (42,852 to 275,373); errors stayed 0 and stalls stayed 0. The dedicated native playback interval advanced 82,891 frames (over 30 model seconds). This is emulator execution evidence; no audio capture or listening verdict was recorded.

## CPU / DSP observations

Five windows each contain ten cached readings, spaced by 50 model milliseconds. Each Apply also records before/during/after readings. CPU read 1,000 per mille in every window, including matched playback after removing the module. The cached DSP fields likewise showed T1–4 at 1,000 and T5–8 at zero with and without the module. These saturated/asymmetric emulator values cannot resolve added CPU or DSP load or short spikes. They are not evidence of zero added cost.

| State | Cached CPU | Cached DSP T1–4 / T5–8 |
| --- | --- | --- |
| Closed, with module, before edits | 100% | 100% / 0% |
| Lock confirmation | 100% | 100% / 0% |
| Closed after live edits | 100% | 100% / 0% |
| Closed with module after all checks | 100% | 100% / 0% |
| Matched playback without module | 100% | 100% / 0% |

Exact-object PC watches measured elapsed emulator instruction intervals. Commit intervals include any intervening interrupt work; they are neither ColdFire cycles nor physical CPU percentages. The saved task mask was observed as level two in its saved register; the level-seven publication mask and restoration instructions were verified in the exact assembly. Hit records do not expose the current SR directly.

| Operation | SAMPLE changes | Commit interval, emulator instructions | Guards | Longest guard, emulator instructions |
| --- | ---: | ---: | ---: | ---: |
| Live T1 Lock | 63 | 13,638 | 63 | 23 |
| Live T1 Clear | 64 | 55,185 | 64 | 23 |
| Live maximum Lock | 512 | 73,255 | 64 | 86 |
| Live maximum Clear | 512 | 308,108 | 64 | 86 |
| Stopped maximum Clear | 512 | 314,791 | 64 | 86 |

No changed step publishes more than eight SAMPLE/mirror pairs plus its index byte. Maximum-size operations used 64 guards; the longest guard across all measured operations was 86 emulator instructions. No-change success and stale/recording refusals used zero publication guards. Sequencer-entry watches recorded zero ticks inside the measured commit intervals; instruction-mask analysis establishes which interrupts remain enabled, rather than treating those short observations as an interrupt stress test.

The module adds no DSP program or audio-frame callback. Its new CPU work is bounded, explicit editing and UI work. Ordinary SAMPLE locks still use the instrument's existing playback path; these observations do not establish a physical utilization tier or worst-case streaming/voice budget.

## MKII functional and maximum-size trial — 30 October 2026 (Taipei)

The author authorized this USB session and named a disposable project. A reported fresh physical power cycle preceded the RAM boot. The flashed base `a542a515c1955b9264712073bb40c81a492f1a993bfa991640d111eb03aaa130`, eighteen module records, active identity and whole-set identity were recorded first. The base has no development controls, so the agent RAM-booted development base `9056dbbd2a84c80051eee33f97d6407ecf079c51f27bd682243d44c9344777d2`. This cached-module prototype is a named test environment, not qualification of the current public base or card build.

The exact 0.1.8 package above was installed alone and passed device self-test (one intact module, zero failures). Native panel controls prepared A03 at 120 BPM with 64 sample trigs on each of eight Flex/Static tracks. The disposable Part was saved natively; temporary changes made by native track paste were restored with Part Reload, and complete working/saved Part equality was verified before the tests. Original firmware, project snapshots, raw memory and packages stay private.

### Observed results

- Twenty alternating live maximum-size operations passed: ten Lock and ten Clear, each changing 512 SAMPLE fields. Every complete eight-track record matched the expected result: only selected SAMPLE bytes changed, trigs and other bytes stayed intact, both Part copies stayed intact, and playback remained running before/after each Apply.
- Stopped Lock/Clear stayed stopped; repeated Lock with replacement OFF made zero changes. A T1-only operation preserved the other seven tracks. Separate successful Lock/Clear selections were recalled; cancelling a selection or replacement-policy change preserved the previous successful profile. Replacement ON was visually recalled after cancellation.
- A SAMPLE lock created through stock controls (slot 0 versus Part slot 3) survived Lock with replacement OFF. Replacement ON replaced it; Clear removed it. A native pitch lock at the same step and every non-SAMPLE track byte survived these operations.
- Live recording was verified through its actual native flag, then Apply refused without changing that flag, playback or track bytes. The development STATE reply’s recording byte covers sampler recording and was not suitable for the first harness assertion. Switching to A04 cancelled an armed confirmation; returning to A03 found its data unchanged.
- Native Save Project, Clear and Reload Project restored the exact saved track records with all 512 SAMPLE locks. The first fixed two-second comparison was premature; later complete comparisons, repeated after 250 ms, matched the settled saved result. No premature comparison is recorded as a pass.
- During the live test the author reported **“Playback sounds continuous.”** This remains an author listening report; no independent audio recording or sample-level dropout analysis was made.
- Undo was performed with track selection open. Readback matched the temporary base’s empty inventory, active/whole-set identities and all three original opener-site hashes. Saved SAMPLE edits remained. After the author’s final physical power cycle, readback verified the original flashed base, all eighteen original module records and the original active/whole-set identities. Those companions were not stress-tested.

### Timing method and limits

The host used a monotonic clock from sending the final YES press until DIAG first reported CLOSED. Completion was then checked against all track bytes and transport state. This gives an observed upper bound including USB transfers, UI scheduling, publication and telemetry latency, rather than isolated execution cycles.

| Operation | Repetitions | SAMPLE changes each | Largest observed host completion bound |
| --- | ---: | ---: | ---: |
| Live Lock | 10 | 512 | 18.433 ms |
| Live Clear | 10 | 512 | 18.304 ms |

The frame-gap read covering this repeat run and intervening menu/host work was 413.03 µs. Cached whole-instrument CPU readings taken after these operations ranged 70.1–72.7%; these do not isolate module cost or instantaneous spikes. Later project save/reload activity reached a cached 100% window, outside this timing run. No per-step hardware interrupt bound, full stock-callee/interrupt stack bound or universal worst-case guarantee is inferred.

An initial run completed seven verified operations before a separate status query interleaved with a MEM high/low read. The read was refused and the runner stopped playback; no failed firmware edit was observed. The twenty-operation run above used one memory reader. Its receipt retains the interruption and harness corrections rather than treating them as module failures or hiding them.

See the stock-free [hardware receipt](media/v018-mkii-qualification.json) and [actual MKII confirmation](media/v018-mkii-live512-confirm.png). Source/package/base identities, individual timing samples and exact observed scope are recorded there. **No Keep or flash occurred during this singleton trial.** The later flashed-base Keep/restart result is separate below. Hardware module-reload preference reset without a restart, MKI, heavy streaming/USB/MIDI loads, tempo/speed extremes, companion runtime combinations, native stock-only card/browser parity and full cost bounds remain unqualified. The RAM base sees the flashed saved set as foreign; this trial makes no saved-set recovery or Keep attestation. Keep this PR in draft.

## Flashed-base companion trial — 30 October 2026 (Taipei)

On the unchanged flashed base `a542a515…`, an addition-only whole-set offer installed the same 0.1.8 package beside the original eighteen modules. Inventory readback preserved every original module record and found nineteen total. The base self-test found all nineteen intact and ran all seven DSP modules. It ended with only CPU load bit 256: peak CPU 90.2%, DSP T1–4 75.8%, T5–8 85.5%. The shared frontend policy treats this as a load advisory; there were no hard-fault bits. This is not a zero-failure stress pass or an isolated Sample Locks cost measurement.

The author selected **Undo the addition**. No Keep or flash was sent. Rollback and fresh readback verified the original eighteen records, normal/known active identity and original whole-set identity `04a677a407a662ce743d753c1e0464c7957525eb39440f7aee58a760c152a1fd`. USB was released. This earlier Undo trial makes no kept-restart or hardware preference-reset claim; the subsequent explicitly approved Keep trial follows below.

The first host attempt incorrectly asked for the whole-set digest while the base retained its trial journal; that read is deliberately refused. It rolled back and verified the original eighteen modules. The repeat bound the candidate to the acknowledged immutable offer identity and preserved inventory, as the frontend does. See the [companion-trial receipt](media/v018-mkii-companion-trial.json). This harness correction changes no module or shared SDK code.

## Kept restart and removal/Undo — 30 October 2026 (Taipei)

The author requested a new Keep test on disposable **PROJECT 261029**. The unchanged flashed `a542a515…` base received the exact same 0.1.8 package beside its original eighteen modules. Every original inventory record was preserved. The nineteen-module self-test found all nineteen intact and ran all seven DSP modules, ending with only load bit 256: CPU 90.3%, DSP T1–4 75.2%, T5–8 78.3%, with no hard-fault bits. As above, the shared frontend accepts this load advisory; it does not establish isolated module cost or a zero-failure stress pass.

Before Keep, the author reported successfully applying T1 with Replace existing ON while stopped, then explicitly confirmed **“Profile set—Keep 0.1.8.”** Keep completed and readback verified saved status 7, nineteen saved and nineteen live. The canonical whole-set identity was `3d66fbdb220385aef4959ad2aa8d589c9b4082ccdfd29d046574839d75390b77`.

After the author reported switching the unit off and on, fresh USB readback verified the same flashed base, all nineteen exact inventory records, the original eighteen companions and the same canonical whole-set identity. Saved status was 1 (present/valid), saved/live counts were both nineteen. The boot correctly began in normal/known state at generation zero with the base as its active status identity; the earlier upload-offer digest is not expected to survive as that status identity. No new self-test run is inferred from the reset counters.

The author reported **“Both actions return; defaults reset”** after checking both Part Edit actions and opening Lock without turning knobs: selection empty and Replace existing OFF. Agent diagnostics independently observed the Lock selector open and selection empty; the visible replacement control is author-reported. This qualifies the reported physical-restart reset on this build, not module reload without a restart.

With that selector open and playback reported stopped, a removal-only trial temporarily left the exact original eighteen live records while the saved nineteen-module set remained unchanged. Undo restored all nineteen exact records, normal/known status and the same kept canonical identity; saved/live counts both read nineteen. The removal was not kept. USB was then released, leaving **nineteen modules kept**, including exact Sample Locks 0.1.8. No flash was performed.

See the stock-free [Keep/restart/removal receipt](media/v018-mkii-kept-reboot.json). No new listening or audio-recording result is claimed for this companion cycle. Full runtime companion coverage, heavy streaming/USB/MIDI loads, tempo/speed extremes, MKI, complete stack/interrupt bounds and native stock-only card/browser parity remain unqualified. A newer public base was merged into this source branch afterward; the hardware result remains bound to `a542a515…`, not that untested base. This PR remains draft.
