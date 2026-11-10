# Pattern Sample Locks 0.1.8 interrupt and task-stack context

This is a stock-free, offline source/build audit, not a complete stack bound or a qualification claim. It uses the exact candidate package SHA-256 `3e13c46fb0054d05f228b045746453e0c50dbbe52fb53b3c229d598ddd7fed79` and native-source fingerprint `7ea0fbdf317bfdab6a82b22869c7029ba23901cd27a3337a4bdaf8f8beeb7e69` (62 files). The offline analysis is bound to a private reconstruction for configuration SHA `9680e9ac861ff9313ce4f7a710a37ad2aa8e9b50b2cf8c043dafa2a0b78cdffc`; its `MAIN.raw` hash is `877a8d6884cb05508a59b312a0e95498c33ce4a1e2f1fe452423b0edc74fb69e`. The private proof records Octatrack OS 1.40C and exact source/configuration inputs. The 3 November author-reported trial includes only the IDENTIFY configuration value and no MAIN hash, so image equality is unknown.

## Static facts established

- The candidate's `psl_task_lock` raises the saved SR interrupt mask to at least IPL 2; it preserves a higher incoming mask. Its short step publisher writes SR `0x2700` (IPL 7), then restores the saved SR. The compiled span bound and its edge-sensitive level-7 caveat are recorded in [the IPL-7 span audit](ipl7-span-static-20261104.md).
- The exact base's `runtime.c` source raises its shared machine lock to at least IPL 4 and has a separate full-mask operation that saves SR, writes `0x2700`, and restores SR. Its comments identify levels 1–4 as waiting at IPL 4 and the DSP frame (5) and eDMA frame transfer (6) as able to run. The candidate's IPL-2 task guard therefore permits priority levels 3 and above when their sources are enabled. IPL 7 blocks maskable levels 1–6, but the MCF54455's edge-sensitive level-7 request is not masked by SR IPL 7 ([MCF54455 Reference Manual, §§3.2.9 and 3.3.5.1](https://www.nxp.com/docs/en/reference-manual/MCF54455RM.pdf)).
- Base `crash.c` declares the vector table at `0x40000000` and, on its first `sys` tick, writes exception slots `2, 3, 4, 8, 11, 14, 61` to its crash handler. This is a fatal exception-recovery path, not evidence for the ordinary asynchronous interrupt-vector table. `crash.s` raises IPL 7 and soft-resets rather than returning to the interrupted task.
- Other base sources name INTC0 source 37 for the panel parser (`boot.c`) and source 36 for the USB-MIDI framer (`usbmidi_rx.s`), which the source places at the USB interrupt's level 4. `dsp.c` can mask the DSP frame source through INTC0 CIMR. These are source-level declarations and control paths, not a proof of the live vector-to-handler mapping or current interrupt-controller configuration.

The five source entries missing from the earlier local audit are in the existing external Elekloader checkout `~/.cache/modwerk-upstream/elekloader`, at the exact proof-pinned commit `3b31ef3c0e43c810e3acd0be6257e2484b20fc40`; the remote is the pinned upstream and its tracked tree is clean. Each body matched its `proofs.json` digest before inspection: `elekloader/README.md` maps to `mods/core-ot/README.md` (`bbce124b221ac9db9124e78f4a3b5c5c9af01a26bf75d19809b0d3cd22bd94d6`); `elekloader/bus.s` to `mods/core-ot/bus.s` (`43bbaa2a5949fe2ab1f0e7fae03b8706fc94c65b39c2c3b3bf0b66feea55f0f2`); `elekloader/core-ot.s` to `mods/core-ot/core-ot.s` (`a7344fd97d97dcbf5472f7615aa311f09e62c400342fac7f646949e423e8de3d`); `elekloader/gate.s` to `mods/core-ot/gate.s` (`d2981fef0b8132eabe21893e85fc62ef704b188378dc5b72e9caed88c29def50`); and `elekloader/mod.json` to `mods/core-ot/mod.json` (`d08358f2e39e02b1e8bfaf17db2b86d5ca97d15a4fd681ce44df25f5c3bea43c`). No upstream source was copied into Git.

With all 233 proof source hashes now matched, the exact upstream core files show that `core-ot.s` is a boot copier and does not install VBR or interrupt vectors. `mod.json` contributes one `jsr core_frame` call in the stock frame-interrupt tail, and `bus.s` identifies the interrupt as vector `0x41`, level 5. The proof records zero linked `ev_frame` callback entries (four bytes per entry), corroborated by the zero `ev_frame_n` symbol. For this empty table, the dispatcher takes its empty-table path, executes no indirect callback, recomputes the tail-test condition, and returns to the stock tail. The call adds a **four-byte temporary return-address contribution** above the stack pointer at that call site; the normal return consumes it, leaving the same stack pointer for the resumed stock code. This finite segment does not bound the interrupt as a whole: stock vector entry and exception-frame use, any task-to-interrupt stack transition, stock ISR prologue/body/epilogue and callees, companion-provided callbacks, and higher-priority nesting remain outside it. The base source scan finds one explicit vector-table assignment (the crash exception patch) and no VBR install reference; it cannot establish the stock firmware's live VBR.

As a separate code cross-check, the repository's Octatrack RTOS emulator model (`sdk/octabam/tools/emu/ot_emu/rtos.h` and `rtos.cpp`) specifies VBR `0x40000000`, models trap vector 32 and PIT0 vector 171 at the same scheduler entry, and uses INTC0/INTC1 vector bases 64/128. From those bases its named sources map to frame vector 65 (INTC0 source 1), USB-MIDI vectors 100/101 (sources 36/37), eDMA vectors 72–87 (sources 8–23), PIT1 vector 172 (INTC1 source 44), USB vector 175 (source 47), and ATA vector 182 (source 54). The model source and `test_rtos.cpp` contain VBR and scheduler-vector checks against a supplied OS image; those tests were not rerun here, and this model is not a live register readback or proof that every source is enabled at the same level on hardware. It supplies useful vector identities while the active ICR/IMR/edge state remains unresolved. The cross-check is bound to `rtos.h` SHA-256 `76c7264ab1fbb0ad17a14788f2891a455cf9634c65eeae8dcc98f0d7d9456c95`, `rtos.cpp` `b4589de516372e21211b37b6f68511f23503219a6fbeb3ef1a325dcc130bdfce`, and `test_rtos.cpp` `d89aec7ad09c77bb4b21bed870a7113914d3d3ceb8140a25eb75cfc411f73cf1`.

## What the task-stack reports cover

The existing exact-base system-task report binds the same base identity and candidate package. It gives an 8,192-byte `sys` stack span and source/base-traced task-entry subtotals of 916 bytes for key, 200 for encoder, and 156 for tick. These exclude the task-entry return word, interrupt/exception frames and nested handlers. The draw path may execute outside `sys`; the separate UI-task context is not bounded for every draw path. The existing popup audit bounds the close subtree (36 bytes) and track-refresh subtree (304 bytes), but popup opening remains unbounded because up to five live window slots can supply callbacks with unresolved targets. See [the system-task and popup evidence](qualification-progress-20261104.md#system-task-dispatch-stack).

`runtime.c`'s stack table and paused-task checks describe configured task ranges and validate saved SPs against those ranges when the loader runs. They do not establish the current task, live SR/SP, an interrupt-stack switch, or historical high-water. The task subtotals above are not stack minima or complete demand.

The exact base's empty-table frame dispatcher remains bounded: it adds a four-byte call word, makes no callback call or other stack adjustment, and returns with the call-site stack pointer restored. A follow-up rooted audit now traces the frame vector's patched entry through the stock handler body, base exit wrapper and one normal exception return when indirect callees return. This is not a complete ISR bound: the stock body and directly called routines contain unresolved dynamic calls, the current SSP/task relationship is not known, and possible level-6/7 nesting remains unbounded. The pinned stock study identifies the level-7 vector's handler as a non-returning halt path, but live source routing, edge/pending state and possible re-entry are not established; the base crash handler also remains non-returning.

## Static configuration versus missing live evidence

The build proof's configuration binds a base build, not a running module set or live register snapshot. Static source does not establish the active VBR/vector table, INTC0/1 ICR priorities, IMR/IPRL pending/enabled state, EPORT edge routing/flags, current SR, current TCB/SP, task-to-interrupt stack switching, or the effect of other installed modules on callback and stock-patch paths. A base configuration with no additional build-time modules does not prove which runtime companions are selected. These live and companion-dependent inputs prevent a complete interrupt nesting or task high-water bound.

Closing the static bound still requires contracts for every dynamic callback reachable from this frame path, the exact runtime companion set, a proven current task/SSP relationship, and bounded nesting for the enabled level-6/7 sources. Static configuration can establish what the linked base and pinned OS report; it cannot establish active VBR, ICR/IMR/IPRL or EPORT edge/pending state, current SR/SP/TCB, or runtime-selected callback targets. The repository's [exact-memory gate](../../../../docs/MODULE_QUALIFICATION.md#exact-memory) requires stack/heap upper bounds and applicable guard evidence, and explicitly asks reports to say when hardware canaries were not measured; it does not mandate an additional canary when a complete defensible static bound exists. Separately, a new Octatrack module still needs the repository's real-unit functional or detailed hardware report under [hardware evidence](../../../../docs/MODULE_QUALIFICATION.md#hardware-evidence), with no minimum duration or track count. This candidate still lacks a complete bound, so that gate remains open; a canary would add evidence but would not replace the missing source/companion analysis. No hardware or live registers were accessed for this audit.

## Reproduction and self-checks

A private helper checks the current base `MAIN.raw` hash, all 233 proof-listed source hashes, the clean pinned external checkout, the bounded empty-table frame dispatcher, RTOS model source hashes, and the exact private package and native-source fingerprint. It prints no image bytes or source excerpts. The helper is outside Git at `~/.cache/psl-source-bound-profile-20261103/interrupt-audit-20261104/audit_interrupt_context.py`, SHA-256 `fda28ceafb823ee69e267648ff0375962c00cec098f03fd3e4bcb451c1048668`.

```sh
python3 "$HOME/.cache/psl-source-bound-profile-20261103/interrupt-audit-20261104/audit_interrupt_context.py" \
  "$PWD" \
  "$HOME/.cache/psl-current-base-workspace/current" \
  "$HOME/.cache/psl-source-bound-profile-20261103/stock-bound-20261104/public-integration-80f442d5-container/pattern-sample-locks-0.1.8-public-path.mwrm" \
  "$HOME/.cache/modwerk-upstream/elekloader"
shasum -a 256 "$HOME/.cache/psl-source-bound-profile-20261103/interrupt-audit-20261104/audit_interrupt_context.py"
```

The helper passed: the main-image hash and all 233 source hashes matched (228 repository files, five external upstream files); the upstream checkout was clean at the pinned commit; one vector-table assignment remained (the seven crash exception slots); no VBR install reference was found in the base proof sources; and the exact package/source fingerprints remained unchanged. A second private helper at `~/.cache/psl-source-bound-profile-20261103/interrupt-audit-20261105/audit_frame_hook.py`, SHA-256 `65acf6bb5e30bbf384033b58b3c86116779758476ba48314d9fcbfb0f3879f6`, reruns that preflight, verifies the pinned frame source/recipe and zero-entry linked table, and proves the four-byte peak with zero net stack change at return. Its four self-check cases passed: the exact path, rejection of a stack-push mutation, rejection of a missing return, and refusal to bound a nonempty callback table. No firmware, extracted bytes, upstream code, disassembly, memory dump, or helper artifact is committed.

Run the deeper check with the same bound inputs:

```sh
python3 "$HOME/.cache/psl-source-bound-profile-20261103/interrupt-audit-20261105/audit_frame_hook.py" \
  "$PWD" \
  "$HOME/.cache/psl-current-base-workspace/current" \
  "$HOME/.cache/psl-source-bound-profile-20261103/stock-bound-20261104/public-integration-80f442d5-container/pattern-sample-locks-0.1.8-public-path.mwrm" \
  "$HOME/.cache/modwerk-upstream/elekloader"
shasum -a 256 "$HOME/.cache/psl-source-bound-profile-20261103/interrupt-audit-20261105/audit_frame_hook.py"
```

The deeper check reported `emptyHookPathPeakAddedStackBytes=4`, `emptyHookPathNetAddedStackBytesAtReturn=0`, and `syntheticMutationSelfTests=4/4 passed`; it prints no source excerpts or image bytes. This bounds the inserted dispatcher on the exact empty-table base only, not the surrounding stock ISR or a runtime set with other callbacks.

## Follow-up: exact frame vector entry, return and unresolved stack paths

This follow-up is bound to the same candidate package SHA-256 `3e13c46fb0054d05f228b045746453e0c50dbbe52fb53b3c229d598ddd7fed79` and native-source fingerprint `7ea0fbdf317bfdab6a82b22869c7029ba23901cd27a3337a4bdaf8f8beeb7e69`; the private reconstruction configuration SHA is `9680e9ac861ff9313ce4f7a710a37ad2aa8e9b50b2cf8c043dafa2a0b78cdffc`, with `MAIN.raw` SHA-256 `877a8d6884cb05508a59b312a0e95498c33ce4a1e2f1fe452423b0edc74fb69e`; no physical MAIN hash was captured. The base proof's unpacked runtime image is 320,540 bytes with SHA-256 `fbd83ae4faebd915bbecab9b1af5b635e4092493a1f63ca2a7e82d4f374f15d8`, loaded at `0x40a955e0`; it was reconstructed from the exact private `MAIN.raw`, `symbols.json`, `proofs.json` and repository `run_pack.unpack`, then checked against `proofs.json`'s `runPack` hash and size. The native-source preflight still matched all 233/233 proof inputs, and the linked frame callback table remained empty.

The vector report in the pinned Octabam `KERNEL.md` identifies vector `0x41` (INTC0 source 1, level 5) and handler `0x4000aad0`; its upstream commit is `5f8e779fa9e8dcf5f36b2b62f7f80c7309daced4`, and the committed document SHA-256 is `d9f17b4f6380dced9f5bb7385339d7870d095fe72c15be05903a8359b5753727`. The exact base patches this handler entry to its `mw_frame_entry` runtime wrapper, which relocates the original entry save, allocates 252 bytes on the current A7/stack and records the frame start before rejoining the handler body. At the tail, the base redirects through `mw_frame_leave`, calls `mw_frame_exit`, restores the saved registers and 252-byte frame, then executes one normal exception return. The rooted control-flow walk reached that return on the modeled paths where every indirect call returns; it does not prove that any unresolved callback returns.

The MCF54455 Reference Manual states that a normal ColdFire interrupt creates the fixed two-longword exception frame on the supervisor stack, sets supervisor mode and the interrupt mask, and clears the M bit; its alignment rules give an 8-byte frame plus 0–3 alignment bytes. Thus the processor contribution is 8–11 bytes on SSP, while whether that SSP is the interrupted task's stack depends on the incoming S mode: supervisor tasks continue on SSP, whereas a user-mode task switches from USP to SSP. The base source does not establish the live mode or stack pointers. See [MCF54455 Reference Manual §§3.3.3–3.3.3.1 and 4.3.3.2](https://www.nxp.com/docs/en/reference-manual/MCF54455RM.pdf).

The base-side stack contributions are scoped facts, not additive whole-handler maxima: the CPU exception frame plus entry wrapper consumes 260–263 bytes on the ISR's SSP before the handler body; the `core_frame` call contributes four bytes and zero net stack on the exact empty-table path; and the exit call adds a four-byte return word plus the callee's 12-byte local/save area (16 bytes above the SP at that call site), after which the entry frame is restored. No hardware, cycle or latency bound follows from these byte counts. The exact-base rooted walk covers 3,604 instruction starts in the vector-to-return path, 22 direct call sites and 11 indirect call sites; its direct-call closure covers 29 entries and 24 direct call sites, with four more indirect call sites after the empty `ev_frame` dispatch is excluded. It reaches one normal exception-return site, but dynamic callees and non-returning paths keep that path conditional.

The unresolved vector-to-return indirect call sites are at `0x4000ab12`, `0x4000b1d8`, `0x4000d022`, `0x4000d340`, `0x4000d35a`, `0x4000d36c`, `0x4000d43e`, `0x4000d45a`, `0x4000d49c`, `0x4000d52c` and `0x4000d784`. The directly called base routines add unresolved indirect call sites at `0x40ab400a`, `0x40ab403e`, `0x40ab409e` and `0x40acf73c`. These are transfer addresses only; no stock instruction bytes, instruction listing, disassembly or dump is included. The empty `ev_frame` proof removes only that one dispatch family: it does not constrain stock state-selected targets or other runtime/companion callbacks. To close the stack path, each reachable target set needs an exact runtime source/companion binding, a bounded callback stack/return contract, and proof that its indirect calls cannot re-enter or recurse without a finite limit.

The pinned stock interrupt report assigns level 6 to eDMA frame channels and UART0/UART1, level 5 to the DSP frame handler, and vector `0x47` at level 7 to a halt path. Rooted base control flow contains reachable IPL-5 and IPL-7 writes: level 6 can therefore preempt during IPL-5 portions and is masked during the IPL-7 portion, while the edge-sensitive level-7 request is not masked by IPL 7 ([MCF54455 Reference Manual §3.2.9](https://www.nxp.com/docs/en/reference-manual/MCF54455RM.pdf)). The active source enables, pending bits, EPORT edge flags, and retrigger behavior remain live-state inputs; complete nested stack accounting also needs the eDMA/UART handlers and the possible level-7 entry. The exact base source contains no VBR install, and no current SR/SP/SSP/TCB or companion inventory was read. SDRAM/cache/arbitration/core timing inputs also remain absent, so this is not a chip-cycle or latency proof.

The private analysis used GNU `m68k-elf-objdump` 2.47.20260726, rooted at the vector entry and restarted at otherwise missing call targets to validate instruction boundaries. The private helper `~/.cache/psl-source-bound-profile-20261103/interrupt-audit-20261105/audit_frame_isr_root.py` has SHA-256 `d1ee6a56cc2c95ba33111af6672011a9ed1ef05d6d625efd3962066d9ebb4996`; it emitted only counts and transfer addresses and passed five synthetic self-checks (branch reachability, unresolved indirect call, rejection of missing boundary, exact empty-table exception, and non-trapping TPF classification). All raw images and decoded listings remained in the private cache, outside Git.

Reconstruct the private runtime bytes from the proof-bound base and generate the listings with:

```sh
PSL_ROOT="$PWD"
PSL_BASE="$HOME/.cache/psl-current-base-workspace/current"
PSL_AUDIT="$HOME/.cache/psl-source-bound-profile-20261103/interrupt-audit-20261105"
python3 - "$PSL_ROOT" "$PSL_BASE" "$PSL_AUDIT" <<'PY'
import hashlib, importlib.util, json, pathlib, sys
root, base, audit = map(pathlib.Path, sys.argv[1:])
proof = json.loads((base / 'proofs.json').read_text())
symbols = json.loads((base / 'symbols.json').read_text())
spec = importlib.util.spec_from_file_location('private_run_pack', root / 'sdk/machines/octatrack/elekloader/run_pack.py')
run_pack = importlib.util.module_from_spec(spec)
spec.loader.exec_module(run_pack)
main = (base / 'MAIN.raw').read_bytes()
start, words = symbols['__run_start'], symbols['__run_words']
layout = {'run_load': symbols['__run_load'], 'ddr': [start, start + 4 * words]}
unpacked = run_pack.unpack(main, layout, symbols, 0x40000400)
meta = proof['runPack']
plain = unpacked[len(main) - meta['packedBytes']:]
assert len(plain) == meta['plainBytes'] and hashlib.sha256(plain).hexdigest() == meta['plainSha256']
out = audit / 'base-run-private.raw'
out.write_bytes(plain)
out.chmod(0o600)
print('verifiedPrivateRunBytes=', len(plain), 'sha256=', meta['plainSha256'])
PY
/opt/homebrew/bin/m68k-elf-objdump -D -b binary -m m68k --adjust-vma=0x40000400 "$PSL_BASE/MAIN.raw" > "$PSL_AUDIT/base-MAIN-private.objdump"
/opt/homebrew/bin/m68k-elf-objdump -D -b binary -m m68k --adjust-vma=0x40a955e0 "$PSL_AUDIT/base-run-private.raw" > "$PSL_AUDIT/base-run-private.objdump"
/opt/homebrew/bin/m68k-elf-objdump -D -b binary -m m68k --adjust-vma=0x40000400 --start-address=0x4000aad0 --stop-address=0x4000d9c0 "$PSL_BASE/MAIN.raw" > "$PSL_AUDIT/frame-handler-rooted-private.objdump"
chmod 600 "$PSL_AUDIT"/*.objdump "$PSL_AUDIT/base-run-private.raw"
```

```sh
python3 "$HOME/.cache/psl-source-bound-profile-20261103/interrupt-audit-20261105/audit_frame_isr_root.py" \
  "$HOME/.cache/psl-source-bound-profile-20261103/interrupt-audit-20261105/base-MAIN-private.objdump" \
  "$HOME/.cache/psl-source-bound-profile-20261103/interrupt-audit-20261105/base-run-private.objdump" \
  "$HOME/.cache/psl-source-bound-profile-20261103/interrupt-audit-20261105/frame-handler-rooted-private.objdump" \
  "$HOME/.cache/psl-current-base-workspace/current/MAIN.raw" \
  "$HOME/.cache/psl-source-bound-profile-20261103/interrupt-audit-20261105/base-run-private.raw"
```
