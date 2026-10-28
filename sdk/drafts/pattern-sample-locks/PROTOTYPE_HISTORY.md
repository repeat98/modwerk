# Earlier prototype evidence

The complete 0.1.5 report is archived in [TESTING-v015.md](TESTING-v015.md). Version 0.1.6 removes ownership and the associated hooks; current results belong in TESTING.md. Replaced 0.1.5 layout images are preserved in media/v015-ui/.

Historical results below do not qualify 0.1.6. Original 0.1.4 receipts are retained as `media/v014-capture*.json`; older screenshots and raw private artifacts remain in the local cache. No physical result is claimed.

# Historical 0.1.4 evidence (before lifecycle safety work)

28 October 2026. Author: twwwy. Local prototype only; no push, PR, release, firmware flash or physical-device module install. The earlier MKII connection was read-only and was closed when the developer chose emulator-only work. All writes below used disposable emulator RAM/card copies.

## Exact native builds

Current private runtime package SHA-256:
`d831f8c1f6469cd972d5c3d2d3860f067e55d149c2dca315fc34399ef4ef007c`.

Pinned ColdFire build: 11,824 code/data bytes, 12,032 BSS bytes, 192 relocations, four core UI hooks and four guarded stock-code sites. The private battery ownership reservation is 12,288 bytes, `0x100f9000..0x100fc000` (end exclusive). These are allocation sizes, **not measured CPU or stack use**.

Emulator base identity:
`8ffc8ffefe3ecd00ca434fe67ee6e902ea0b359d0f6343a404a5bd3ec4e9c69a`.
Its local MAIN SHA-256 is
`025af1b78e27be20bb888427ab7462d352e8d7dbca5cf5c183244509aed94aec`.

The emulator SHA-256 and exact compiler-output/C/harness fingerprints are in the capture receipts. Native source is checkpointed locally at `4f1eb8cb4eb4a2646fcb551f9b13a2c5be85975c`; no commit has been pushed. This base is a private development base, not the user's currently flashed base. No result below qualifies their physical firmware or audible behavior. DSP execution was disabled in these metadata/UI checks.

## Actual software checks

- Node 24.22.1 and `npm ci`: passed in the isolated worktree.
- `python3 -B verify.py`: passed with `-Wall -Wextra -Werror` and ASan/UBSan.
- Planner: all 64 stored steps, selected-track isolation, non-SAMPLE preservation, manual protection/replacement, clear on trigless steps, Static/Flex/recorder slot bounds, stale source/origin rejection, mirror mismatch, disjoint targets and single-use confirmation.
- Ownership storage: fresh-reader recovery, interrupted allocation/edit, CRC corruption, same-value manual invalidation, project identity, foreign-storage refusal, a full 704-record store refusing without mutation, record reuse and guard bounds. A separate regression reads the actual base definitions and checks separation from its log, effect map, crash/stall records and stock settings. A value matching the Part assignment grants no ownership.
- UI: eight cells/two columns, disabled-track navigation and absent brackets, A/B controls, safe C defaults, per-track counts, YES/NO behavior, white headers/equal spacing, framebuffer bounds and context changes. Running transport cannot commit early; STOP passes through, pending PLAY is consumed, cancellation works, active recorders refuse and STOP times out without editing.
- Pinned freestanding `m68k-elf-gcc -mcpu=54455` compilation/linking: passed. The object passed `sdk/runtime/m68k_codegen.py`; `m68k-elf-nm -u` found no unresolved helpers.
- Draft doctor: category, UI claim and declaration cross-compatibility pass. Catalog/publication, package import, native parity and qualification gates remain red. No gates/catalogs were weakened or edited to publish this draft.

## Actual native emulator checks

The initial functional candidate (`d831f8c1f6469cd972d5c3d2d3860f067e55d149c2dca315fc34399ef4ef007c`) used normal panel gestures for the utility and transport, and one explicitly labelled native-writer fixture injection for manual locks. It stopped PLAY, wrote the previously unlocked trig, preserved a manual lock, matched the battery mirror and changed no unrelated audio-track bytes. The base effect map and diagnostic-log tag were preserved. A same-value manual SAMPLE writer call retired ownership and default Clear retained that lock. Trial Undo succeeded. `media/capture-origin-seed.json` records this run and the private battery snapshot's digest.

The current package passed a fresh-process battery-backed startup test (`media/capture-reboot.json`). It loaded the functional run's battery snapshot, with no retained module BSS, then reloaded the current package through emulated USB. The two native SAMPLE bytes were present. Default Clear removed the owned lock and retained the manual lock; it left playback stopped and preserved unrelated track data. Explicitly disabling Retain manual then cleared the remaining manual lock. Trial Undo succeeded, and the emulator continued running afterward.

This proves an **emulated battery-backed startup of the same exact build with fresh module BSS**, not physical power retention or automatic module-set restoration. The snapshot SHA-256 is `3e9d707d329f86eecc0ec795c3bbd78ab142537cd4f0b1b624643f181e3a3267`. The snapshot itself stays private.

The current package also passed the 512-lock/native-storage run (`media/capture-native.json`):

- Injected fixture: all 64 existing sample trigs on each of eight Flex/Static tracks, empty SAMPLE bytes, matching working/battery copies. Injection is explicitly separate from testing the utility UI.
- Lock through the real menu wrote 512 expected SAMPLE bytes, left playback stopped and preserved every other audio-track byte. The base effect map and diagnostic-log tag were unchanged.
- Native SAVE PROJECT ran on the stock engine task and completed; the copied card flushed with zero write errors. Native bank reload recovered the saved tracks after a deliberate private fixture change, preserving the compared Part region.
- Default Clear recovered ownership after that reload and removed all 512 created locks without changing unrelated audio-track bytes.
- The module was removed while its track-selection overlay was open. All four stock-code sites matched their original guard hashes afterward; native stock bank reload recovered the saved 512 locks with the module absent. The emulator continued running.

The storage run used **Keep only on the disposable emulator/card copy**, then an accepted empty package with the exact module id to remove it. A long native save can exceed the USB trial's host timeout, so this run is not labelled Undo. Earlier attempts that timed out or used an unready fixture call are not passing evidence. No physical Keep occurred.

The declaration compatibility result does not establish audible or runtime coexistence with companion modules.

## Reproduction

`translation.c` is freestanding original C. Compile with the pinned toolchain and flags from `sdk/runtime/m68k_codegen.py`, inspect undefined symbols and run the ColdFire object guard before building. `unit.s` is compiler output, not extracted stock code.

Temporarily stage this draft under `sdk/octabam/modules/pattern-sample-locks/`, use `sdk/runtime/loader/build.py --octabam pattern-sample-locks --name 'SAMPLE LOCKS' --upstream <verified elekloader> -o <private output>.mwrm`, and remove the staging copy. Do not put firmware or packages in Git.

`capture_emulator.py` requires an emulator Unix socket and always copies the input card into an output directory outside the repository. Ordinary mode captures the UI and requests trial Undo. `--exercise` runs the manual/created-lock and STOP checks; `--cs1-in <private snapshot>` runs the fresh-start variant. `--stress-save` creates the maximum fixture, keeps the module only on the disposable copy, checks stock engine save/reload and explicitly removes it. `--no-dsp` provides no audio evidence. Do not run hardware/device-bridge tools for these checks.

Receipts contain hashes and observed booleans/counts, never raw project, firmware, card or battery-memory contents. The harness refuses to bind a receipt if its recorded source files change during a run.

## Remaining qualification blockers

- Physical MKII/MKI behavior, physical power cycles, audio continuity, worst-case CPU/stack use and publication-guard interrupt delay are **not tested**. The publication guard masks interrupts; maximum mutation count passing in an emulator does not establish a hardware deadline.
- Do not use this prototype on hardware yet. Same-value edits made while the module is absent, replacement/reinstall history, every native copy/undo/reload path and other modules' writers still need explicit ownership-lifetime protection. The current record alone cannot establish an unobserved history.
- The sparse store admits 704 active track/pattern combinations (88 complete eight-track patterns). It never evicts known ownership. Full-capacity refusal is host-tested; new locking refuses before the publication guard. Clearing the last owned lock on a track frees its record.
- Ownership is local battery material for one project identity, not portable project-file metadata. A different project identity forgets earlier ownership at the next operation. An otherwise changed SAMPLE vector/trig mask conservatively retains the track's unknown locks.
- Automatic USB module-set boot restore, interrupted real card writes and full companion runtime combinations remain unqualified. Native stock-only card integration is not implemented.
- Published custom-machine signatures PL/AB/FM/S2 are excluded. Future contributed machines require review. Upstream PLOCKS P2 (outside this catalog) overlaps the battery region and is unsupported.
- No catalog entry, imported public package, first-release owner review or published download exists. No release qualification is claimed.

## UI capture history

The earlier 0.1.2 layout captures established the agreed headerless six-item Part Edit list, eight visible two-column tracks, greyed-out unsupported machines without brackets, equal eight-pixel spacing and white headers on levels two and three. Those earlier outputs remain in the private capture cache. Current declared layout images were refreshed through a fresh trial of the current package, visually inspected and bound by `media/capture.json`; Undo and continued emulator execution passed. T3 THRU/T7 NEIGHBOR are disabled. A screenshot establishes its actual pixels, not save, audio or reboot behavior.

## Withdrawn candidate and separate checker finding

The local 0.1.3 prototype wrongly reserved stock-unreferenced battery RAM that the Modwerk base already uses for diagnostics and its effect map. It never touched physical hardware. Its compatibility claim is withdrawn; its emulator results do not qualify the corrected build. The 0.1.4 sparse store fits below the base log, has an explicit actual-base regression, and was freshly retested through all runs above. Only corrected-build receipts and images are retained here.

The shared declaration checker did not catch that base battery overlap. A future separate change, **Fix: include base battery reservations in compatibility checks**, would close that gap. No shared checker change or PR is included in this module prototype.
