# ORDER063: ordinary Tuner USB admission

**STOP: the Tuner adapter cannot be reached without a base change beyond the adapter.** No adapter, USB package, worktree, build, host test or emulator session was created for this part. The ordinary Tuner package remains unqualified for USB installation. Closing the window before a transaction is not offered as a safety procedure.

This is a source audit of main `916ce01bbfc60f3aedd7156066354fedb521e6f4` and the unchanged staged upstream Tuner. Exact absolute paths and whole-file identities are in [USB_ADMISSION_063.json](USB_ADMISSION_063.json).

## Missing dispatch hook

The loader already calls `modwerk_machine_metadata_admit()` at PREPARE and SWITCH, under its stable lock: `sdk/runtime/loader/loader.c:901–906` and `:599–606`. The missing hook is **inside the Octatrack implementation**, `sdk/machines/octatrack/module-adapters/machine_admission_runtime.c:33–37`: ordinary modules immediately receive `RUNTIME_OK` and `foreign_roots = 0`. Only group metadata, recognised table families or `ot_machines` contributors reach the later root checks. Tuner declares none of those.

An adapter file alone has no registration point on that path. A `runtime.json` cannot declare a lifetime callback: the accepted keys in `sdk/runtime/loader/build.py:316–343` are subscriptions, contributions and raised events. Declaring a fake machine/table or a resident DSP feature would change the module's meaning and does not supply a legitimate ordinary-module lifetime contract.

The earlier resident-controller branch at `machine_admission_runtime.c:25–31` does not fill the gap. `controller-policy/controller_board.c:837–845,883` binds reviewed controller policy rows and otherwise returns success. Its header `:7–14` associates those rows with the resident DSP-feature controllers. It is not an ordinary UI adapter registry.

## What the Analog BD pattern actually supplies

`analog_bd_ui.h:6–9` explicitly describes preparation without production admission or writes. `analog_bd_ui.c:55–102` supplies a useful read-only snapshot/retirement planner with identity validation, reviewed roots and paused-consumer checks. Its driver, `analog_bd_ui_driver.c:2–3`, is a private synthetic fixture. `sdk/tests/test_analog_bd_ui.py:16–33` calls the source unwired and retains false production-stable-lock/admission qualifications.

The base source list in `sdk/machines/octatrack/elekloader/build_core.py:35–42` includes machine/table admission and `machine_lifetime`, but not `analog_bd_ui`. The contract in `EVENTS.md:47` applies to contributed machines; the actual contributor route is `machine_contributors.c:33–42,55–75`. It does not make an ordinary Tuner contribution reachable.

## Tuner roots that a reviewed adapter must cover

Upstream references below are to `staging/tuner/upstream/tuner.s`.

| Published reference or consumer | Source evidence and required coverage |
| --- | --- |
| Window eviction/close callback `tu_close` | Passed to `WCREATE` at lines 149–155. The returned handle is stored in relocatable `tu_win` at line 157. The window-manager registry/list and callback field address/offset are **not established** by the reviewed helper sources. This is a required coverage gap, not a guessed constant. |
| Input-layer root pointing into `TU_LAYER` | Pushed at lines 162–163. Reviewed root address is `0x460d165c`, four bytes, in `machine_lifetime.c:12,104–107`. |
| Cached key/encoder dispatch references | Reviewed cache is `0x46c7d8de`, 1696 bytes; `machine_lifetime.c:10–11,95–113` scans packed pointers and cached layer links. |
| Both linked input-layer graphs and callback definitions | `machine_lifetime.c:38–67,114–131` follows 28-byte nodes with links at offsets 0 and 12, and 26-byte key/22-byte encoder definitions. Tuner's `TU_LAYER` names `TU_KEYS` and `TU_ENCS` at lines 853–855; its three close callbacks are at lines 857, 860 and 863. |
| Paused code/data references into the outgoing generation | `loader.c:409–455` extends retirement checks to the full image when trusted `foreign_roots` is set. Ordinary Tuner currently receives zero. Aliases and the actual owned generation must be handled. |

`tu_close` destroys its window and pops its input layer at lines 171–179; `tu_win` is declared at line 881. A zero handle alone is not proof that all foreign callback/cache roots are clear. The helper's own header, `machine_lifetime.h:5–9`, limits its claim to reviewed UI roots rather than every widget cache. No complete window-root inventory or closed-window removal success is claimed here.

## Required refusal propagation

PREPARE currently preserves the adapter's refusal (`loader.c:901–906`). SWITCH reduces it to a boolean (`:599–606`). Legacy publication then sets `RUNTIME_BUSY` (`:1001`); Undo runs through `restore_to()` and `restore_context()` with boolean results (`:649–651,1006–1007`). The journal switch path converts a failed switch into `RJ_WAIT` (`:1171–1175`). Therefore even adding a guarded call would not, by itself, satisfy the requested exact `RUNTIME_IN_USE` response for Undo/removal/replacement.

## Proposal for Jannik

1. Add a trusted ordinary-module UI lifetime dispatcher before the early return in `modwerk_machine_metadata_admit()`. Invoke it under the existing stable lock at PREPARE and immediately before SWITCH, including Undo and removal.
2. Bind a reviewed adapter and source/package identity to the loader-owned generation and complete image extent. Set `foreign_roots` through trusted board admission; do not accept an uploaded readiness flag or repurpose machine/DSP registration.
3. Review the window-manager registry/list and close-callback field, then cover those roots together with the existing input-layer/cache traversal and paused consumers. Unknown reads/layouts must refuse. The adapter should refuse while retained; it must not forcibly close the window or unpublish a live callback.
4. Preserve exact refusal status through publication, Undo and journal paths, leaving the old module and its allocations intact on `RUNTIME_IN_USE`. Wire the adapter into the base source inputs.
5. Once that base contract is reviewed, test through the actual loader entry paths as well as the helper: open window, each close path, stale cache/root, aliases, paused task, unavailable reads and mismatched identity. Prove refusal while open and successful retirement only after all roots clear. Then build the package and local base.

These are proposed follow-up requirements, not implemented or executed work. The explicit ORDER063 stop branch was followed.
