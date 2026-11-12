# FRACT testing

## Current candidate — 10 November 2026

Unlisted `0.1.2-experimental`, SHA-256 `6ff37fdcdbfead903a4857482d0f7bd50905175b55c877e62ad7c51422ef5874`, required base `72defb09b9d463fe62ab876f350f442d10e32ec23e55918a22b9b756c5cb3da6`.
The merged SDK builder now follows committed base exports. Only the old runtime
base-ID gate was removed; engine/controls/UI remain unchanged. The package row
carries requiredBase, matching the exact build proof. Firmware-free reproduction
and full-machine synthetic base-change tests pass; original-OS reconstruction
and both unchanged strict stock-free scans pass locally. No OS is distributed.

Resource accounting is specific to this image: 31,424 resident bytes and
712 own stack bytes per callback; see release/resources.md and its audit.
Named-build functional checks on the author's physical Octatrack MKII now cover
install/integrity, Keep/readback, exact Undo, removal/reinstall, saved Part and
project reload, absent-module project fallback to FLEX, audio/POS/SIZE and a
physical reboot with independent exact-set restoration readback. See the
[10 November hardware report](release/hardware-20261110.md) for source/package/base
identities, attributed observations, refused attempts and limits. Exact-package
full-emulator START, three-head playback and retrigger passed separately;
timing/stress, companion and complete stock-flow qualification remain pending.
The historical PROJECT RELOAD stall remains unresolved; a controlled repeat on
this candidate passed without assigning the old cause.

The owner accepted a ColdFire audio-path performance record on 7 November:
worst own render/block against budget, matched native-FLEX longest-frame/idle,
and audio stress instead of MIDI flood. `evidence/performance.json` uses nulls
with reasons for unmeasured fields. No timing pass or owner waiver is claimed.
The [12 November review plan](release/review-20261112.md) records the required base sequence, guard capture and neighbouring-machine
Part reload; final relinking and timing wait for #1418 and then #1165.

```sh
python3.12 -B -m unittest discover -s sdk/tests -p 'test_source_runtime_package.py'
python3.12 -B sdk/drafts/fract-machine/check_source.py
# Exact package6ff resource audit: run at c2671568 (base72 inputs), see release/resources.md.
python3.12 -B sdk/drafts/fract-machine/qualification/resources.py --output /tmp/fract-resource-audit.json
```

## Historical 0.1.1 evidence — 6 November 2026

Everything below names the previous package. Its positive observations and
unresolved incident are retained, not promoted to the new candidate. References
to release/resources.md and release/verification.md in this historical text now
resolve to the archived versions in release/history/20261106/.

## Commands and exact revision

This is the unlisted `0.1.1-experimental` candidate, exact package SHA-256
`54ca8f6b1a30e2f4811129e082ce18881148654b00c97c026508460a6cf7272e`.
The hardware-tested native inputs are from `7bfced003145d8641792e91747f7f63ea5aac2e1`;
later reports/resource tooling reproduce identical package bytes. The manifest's
older private baseline `5b5aa328c1bbed129ab6b1a65efb9353b93ede8f` is historical,
not the final qualification fingerprint. Exact candidate results below supersede
only the matching items in earlier private/not-tested checklists. Timing and the
unexplained PROJECT RELOAD stall still prevent completed release qualification.

The README lists reproducible host, normal/profile/detail ColdFire source-check
and draft-doctor commands. `verify.py` invokes `check_source.py`; its synthetic
imports and temporary base identity validate compile/link behavior only. Tests
using `OG_FRACT_CURRENT_ENGINE` exercise the current engine; the explicitly
host-only `fixtures/fract_reference/` files are a historical differential oracle.
The FR:1 boot-preservation fixture runs on the host only; it is not hardware
evidence. Command results and bounded review coverage are in `release/verification.md`.

## Hardware and audio quality

User-reported short PRIVATE paired-build audition: sound with three grains,
centered SIZE, CPU approximately 80%, and no crackle reported. This is reported
functional evidence only. Exact image/source hashes, machine model, elapsed
minutes and full workload were not supplied here. It does not qualify this
public source tree. Aliasing, DC, clipping and parameter-extreme audio behavior
on the exact public build: not tested.

## Stock flows

Apart from the specific functional checks attributed below, exact-public tests
of parameter locks, LFOs, scenes, MIDI, recording and shared-module composition
remain untested. The intended deliberate change is a custom SRC machine with its own
MAIN/SETUP controls; selecting a stock machine leaves FRACT. That transition
still needs exact-build hardware validation.

## Performance

Worst-case cycles, matched stock benchmark and long stress run: not tested for
this exact public build. The user's approximately 80% private CPU reading is
not isolated per-instance ColdFire cost or a remaining-headroom guarantee.
Optional profile/detail source checks compile telemetry; they do not execute it
on a unit or establish real-time timing.

## Resources

The firmware-free `qualification/resources.py` reproduces the exact tested
package and accounts for 31,776 resident pool bytes, including the loader header
and alignment. Its reviewed compiler/assembly call graph bounds one callback's
own stack contribution at 712 bytes. See `release/resources.md` and
`release/resource-audit.json` for method and scope. Stock/base frames and
interrupt/task nesting are instrument-owned and excluded; this is not a
whole-system stack reserve. Worst-case ColdFire time and a matched stock
benchmark remain unmeasured. The source check prints synthetic
image/BSS/relocation counts, not native package placement or maximum-load
qualification. Current admission allows one owner on T1–T4, with three grain
heads; do not extrapolate to more instances or companions.

## Hardware

Exact-public build cold boot, USB install, self-test, Keep/Undo, replacement,
removal, missing-module reload, Part/project persistence and physical reboot:
not tested for a listed release. Physical live-trigger deletion and long stress:
not tested. The pre-merge private-pair check below establishes only its stated
base/boot behavior, not the complete public-release lifecycle.

### Pre-merge base check — 5 November 2026

On the author's physical Octatrack running OS 1.40C, USB installed the
`tracks-main-cue` base built from #926 source revision
`1e227430fbfaf3db6f95f19e1be2703d7e58fc42`:

- Base ID: `9b3ba41715140d5fae07868a8b2adc6d89c3ec0272d8ab34c332461cf990a14c`.
- Private FRACT package SHA-256: `a5a35eaaeb22d2361b6e8d73c9acc96df640eb4f1306dae719b2c6bb17bbae9b`.
- Installed set ID: `59cad7f1cc080efb79ecb09624fd1a22173ea392d4887c11a9474f2dee21a05f`; inventory contained one FRACT.

The author reported successful completion of the requested short checklist:
ordinary machines and FRACT played, a Part containing FRACT was saved, the unit
was powered off/on, and the track returned as FRACT and played. The exact
project/Part name, ordinary-machine names and elapsed test time were not
supplied; these listening and panel observations are reported by the author.

Independent USB readback after that power cycle confirmed the exact base and
set IDs above, one FRACT in inventory, normal/known-active operation and a new
boot session. Slot 1 generation 7 was whole and confirmed, with one boot try
and no fallback; the previous confirmed slot 0 generation 6 remained intact.
Before the power cycle, the supported self-image update and FRACT Keep were
acknowledged, the saved set was read back (one saved/live module), and native
SELF TEST passed with 1/1 modules intact and no failures (0 DSP-effect modules).
SELF TEST was not restarted after power-on; postboot checks were read-only.

This satisfies the two short checks requested for base `9b3ba417` before source
merge. It does not qualify Undo/removal, missing-module behavior, companion
modules, long stress or a future listed package, and is not a release approval.
No firmware, card/NVRAM images, samples or USB memory dumps are included.

## OT UI capture evidence

The historical images in `docs/media/fract/screenshots/` remain prototype
previews. Current `media/ot-setup.png`, `ot-main.png` and `ot-playing.png` were
captured on 11 November from exact package6ff/base72 in the reviewed octemu,
with DSPs, the real frame guard and `--guest-clock`. The SETUP capture covers
both location and PAN/SRNG; MAIN covers POS/SIZE/REVS/SPRD/SHPE/PTCH. A duplicate
SETUP image is retained privately, not repeated in the gallery.

`media/capture.json` records source/package/base/image/emulator identities,
panel steps, source hashes, original pixel hashes and exported PNG hashes.
The actual `module_draw` entry and return were observed before framebuffer
export; the image was not reconstructed. Integer scale 6 preserves 128x64
pixels in gray 24/240. All three images were visually reviewed, including
stored SIZE 106 and PTCH +3.0; captions do not present them as fresh defaults.
The fixture is historical, not a pristine factory project. ex1010/toli is the
capture author; underlying Elektron interface and mark rights remain reserved.
No sample, firmware, raw framebuffer, card/NVRAM or private log is included.
These are emulator UI observations, not hardware sound/timing qualification.

## Listed USB release candidate — 6 November 2026

Version `0.1.1-experimental`, package SHA-256
`54ca8f6b1a30e2f4811129e082ce18881148654b00c97c026508460a6cf7272e`:
32,120 bytes; 30,596 linked image bytes, 640 BSS bytes, 225 relocations,
38 event words, nine guarded stock copies, no fills or stock-code writes.
The generated guard contains the seven published base IDs, at their common
runtime addresses. All seven symbol-map/build-proof pairs were checked locally.

The new host tests exercise every admitted digest and reject wrong complete
digests. The prospective package reproduces without an OS file; private original
1.40C reconstruction is byte-exact and passes both unchanged strict scans.
The stock-copy source spans match the reviewed private recipe; only their
image offsets moved. Granular/UI host regressions still pass (47 tests,
four historical transport skips). The seven-layout admission update changes
neither the granular algorithm nor controls.

This is a different package from the 5 November private build: it has the
canonical runtime module ID and a seven-base guard. Its install/Keep/Undo,
replacement/removal, missing-module behavior, Part/project reload, physical
power-cycle, companion and stress results are PENDING. The author will connect
the Octatrack later. Earlier hardware results are not promoted to a pass for
this candidate. Worst-case cycle measurements and the corresponding
qualification/performance records remain pending. No approval or waiver is
created by this candidate declaration.

### Exact candidate emulator and object comparison

The exact package above completed a full native-voice emulator run on the same
base: voice 255, owner T1, three advancing grain readers, retrigger, no loader
errors/rejections or residency failures. Output was 44.1 kHz stereo PCM with
nonzero samples. `release/emulator-result.json` records scalar results and a
private audio hash. The fixture was a copied historical card/NVRAM state, not a
pristine stock fixture. Audio, card/NVRAM, firmware and raw snapshots stay private.
This is emulator evidence only.

Against the previously accepted private build, all nine other C units and the
assembly kernel have byte-identical text/read-only/data sections under the
candidate compiler settings. Only the base-binding C unit changes. Compilation
with stack reporting gives the same authored-image hash: the largest individual
C function frame is 380 bytes. This excludes callees, stock routines and
interrupt nesting and is not a total stack bound. The later own-call-graph audit
adds a conservative 712-byte per-callback bound, including own callees, assembly
leaves and return PCs; it excludes instrument-owned frames and interrupt/task
nesting. `release/resources.json` records these limits. See
`release/verification.md` for check and review scope.

### Physical USB functional check — 6 November 2026

The author connected the Octatrack, confirmed stopped playback and a disposable
test project, and selected stock FLEX to release the old private FRACT track.
The exact candidate above was installed on physical base `9b3ba417` through the
standard whole-set transaction. The previous private module was removed in the
same transaction; only canonical `5efef0cd` FRACT is installed (handle 255,
layout 1). A deliberate Undo returned the exact original inventory and set
`59cad7f1cc080efb79ecb09624fd1a22173ea392d4887c11a9474f2dee21a05f`.
The candidate was then installed again and kept. Card save/readback confirmed
one saved/live module and set
`ee31f30b8dfb85c6c8083042e9236ef2fd186815880c8f35ab679f4e0cd43a7c`.
Both confirmed base slots remain unchanged (running slot 1 generation 7,
previous slot 0 generation 6; no fallback). No base/NOR write occurred.

Native SELF TEST reported passed, zero failures, one intact module and zero
DSP-effect modules. Its DSP exercise count and CPU peaks were zero; this is
integrity/lifecycle evidence, not an audio/stress/performance qualification.
The author then reported “Всё работает, воспроизведение остановлено” in
response to selecting the new FRACT on T1, assigning a FLEX-pool sample,
listening, moving POS/SIZE and checking for hangs/crackle. These are attributed
observations by the author; sample name, duration and model were not supplied. The completed checks and remaining limits are recorded below. No project or Part was saved by the agent.

An initial attempt was safely refused as `RUNTIME_IN_USE` while a track named
old FRACT; the author then selected FLEX. Two private test-driver issues were
also corrected: the base intentionally withholds its cached set digest during
a retained trial, and a two-row set Undo requires acknowledged continuation
through its intermediate recovery state. Each stopped attempt was followed by
confirmation of the exact old inventory/set before a deliberate corrected run.
These outcomes remain separate from the final successful explicit Undo/Keep;
no failed/unfinished attempt is counted as a hardware pass.

The canonical package was subsequently removed and kept: USB confirmed an empty
inventory and saved/read-back count zero. The author reported that the instrument
remained responsive, but was unsure whether RELOAD Part had actually been done
while FRACT was absent. That missing-module reload is **unconfirmed**, not a pass.
The identical candidate was reinstalled, passed the same integrity check and was
kept/read back as the original candidate set above.

After saving the test Part/project, the author physically switched the unit off
and on and reported: “Да, перезапустил: FRACT остался и звучит”. Independent USB
readback at 13:06:44 UTC confirmed the same base, one canonical FRACT and the same
candidate set digest. The boot session changed from
`63af31a668f574161a218ba25a90981dadb09cbab89207e6866abf6085bc6b61` to
`51392267d2cfafab48c7618795adb7f612431c66f72b51b2995a0a68a91d74ba`.
Saved-set restore reported one restored/live module; both confirmed NOR slots
remained unchanged, with no fallback. The first read met a stale libusb handle;
a read-only reconnect succeeded. No SELF TEST was started after reboot.

Finally, with FRACT installed, the author changed POS without saving and used
FUNC+CUE to reload the saved Part. The author confirmed: “Да, значение вернулось,
FRACT работает”. This is an installed-Part reload functional pass, separate from
the unconfirmed missing-module case. Project-file reload is recorded separately below. Distinct
parameter comparisons across tracks, other controls, companions and long load,
worst-case cycles, shared task/interrupt stack use and full release qualification remain untested
or unmeasured. There is no implied first-release approval. The tested source was
`7bfced003145d8641792e91747f7f63ea5aac2e1`; this update records observations and
changes no native candidate input or package byte.


### Project RELOAD incident and stopped-state repeat — 6 November 2026

During the later resource-accounting session the author explicitly used
PROJECT > RELOAD. FRACT remained on T1, but the author reported no sound and no
sequencer movement after PLAY. Exiting menus and STOP twice followed by PLAY
did not recover it. The precise transport state at the initial RELOAD was not
recorded. This is a failed observation, not a project-reload pass or an isolated
FRACT root cause.

Read-only USB at 14:28–14:31 UTC found the same base, canonical FRACT inventory,
kept set and boot session as before. No module was missing. Runtime ticks
advanced, but audio frame count stayed at 13,376,511. The base's saved stall
record had reason 1 (frames stopped), tick 290,997 and that same frame count;
its loader error/rejection and residency-failure fields were zero. The record
was captured privately before recovery. Cached CPU/DSP load was stale/null;
these readings are not a performance measurement. No upload, Keep, base write,
SELF TEST start or project/Part save was performed by the agent.

The author then physically powered off/on without a new save and reported that
PLAY advanced and FRACT sounded again. USB confirmed a new session,
`e5281fc4cfcb92785615d01aa37964e2575a447b664df3d6c8e7a0b356f3911d`,
with the same base, canonical inventory and kept set. Frames advanced from
150,744 to 156,257 over approximately two seconds; both confirmed NOR slots
were unchanged. No package or base was replaced to obtain recovery.

For a controlled repeat, the author pressed STOP twice, used PROJECT > RELOAD,
waited for it to finish, then pressed PLAY. The author reported that steps ran
and FRACT sounded. USB at 14:35:28–14:35:30 UTC confirmed the same new session
and set, with frames advancing from 434,639 to 440,152. This is one successful
stopped-state project-reload repeat. It does not explain or erase the first
stall; loading while playing, stock-only isolation and the root cause remain
unverified. The incident requires review before release qualification.
