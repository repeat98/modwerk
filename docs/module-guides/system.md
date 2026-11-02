# System

Read [the module guides index](README.md) first.

**Applies to** modules with manifest `category: system`: behaviour that belongs to the project or system menus rather than to a track or an effect. No module uses this manifest category yet; the library shows [Scale Quantizer](../../sdk/octabam/modules/quantizer/README.md), [Repitch](../../sdk/octabam/modules/repitch/README.md) and [Preview Vol](../../sdk/octabam/modules/previewvol/README.md) under System, so read their READMEs as the nearest examples and also [machines.md](machines.md) (project machines) and [playback.md](playback.md).

## Behave like the instrument

- [ ] **Put the setting in the stock menu where it belongs.** Scale Quantizer's SCALE, ROOT and GLIDE rows sit under PROJ → CONTROL → SEQUENCER. Do not add a top-level screen.
- [ ] **A way to turn it off that restores stock behaviour exactly.** Test OFF against an unmodified build.
- [ ] **Defaults are stock behaviour,** so adding the module changes nothing until the musician changes a setting. Say so.
- [ ] **Persistence is honest.** Settings storage today is "nowhere, or a private file", and the proposed shared project store is not implemented ([MODULES.md, Settings on the card](../../sdk/octabam/docs/remixer/MODULES.md#settings-on-the-card)). Do not invent a format. State whether your setting survives Part Save, project save and load and power cycles, and test it.
- [ ] **A project saved with the setting loads on a build without the module.** State what the musician sees. **Verify.**
- [ ] **Say who is affected:** which track types, which models (MKI and MKII key sequences differ), which existing projects.
- [ ] **No effect slot and no new knob** unless the feature genuinely needs one. The README says so.
- [ ] **Timing-related settings** follow [sequencing.md](sequencing.md).

## Sample-editor actions

- Match the machine’s native popup and encoder-field layout. Composite inside the popup rectangle, preserve stock content outside it, and keep unassigned controls inert while the modal owns input.

- Bind an edit to the actual source, content lifetime, trim, tempo and complete marker table. Revalidate at explicit confirmation; a cancelled or stale view must not write.
- Preserve complete end/loop records and native minimum-length constraints. Replacing existing records needs an explicit warning and confirmation; reject rather than silently sanitize a preservation edit.
- Keep a complete internal rollback snapshot, including inactive rows. Verify both the expected after-state and current source before attempting restoration. Internal rollback does not imply a musician-facing Undo feature.
- Gate recording by the source being edited. A playback track and its recorder are independent; recording into another buffer must not automatically block editing an unrelated file or inactive buffer. Verify the actual source ownership and writer boundary.
- A queue being empty, a dirty flag or an unchanged slot counter does not establish ownership. Cover complete writer lifetimes, nested calls, failed replacements, recorder/allocator work and delayed completion before admitting access.
- Copy views for the UI. Validate on opening and explicit intent rather than polling live metadata every display tick; retain a busy confirmation intent only while its source and owner remain valid, and cancel it on Back or changed controls.
- Use the machine's metadata-writer boundary while preserving frame/DMA deadlines. A loader lock is not proof of exclusion against PCM or recorder writers. Refuse heavy work from unsuitable interrupt contexts.
- A final state check still races with a higher-priority recorder unless the commit is ordered against it. Keep table copies and whole-table comparisons outside any short commit guard, and measure its duration on the unit.
- Establish native menu-pointer lifetime before contributing rows. Copied labels, callbacks and selection storage can outlive a closed menu; retire all references before reclaiming module memory. Check typed descriptor alignment on the target, not only the host.
- Follow stock create, delete and confirmation behavior. Distinguish working metadata, sample-settings save, project save/load and physical reboot; no save is implicit. Record observed results and remaining gaps on the exact build in the module's testing/integration notes.
- A mathematical grid without amplitude analysis says nothing about click-free playback. Verify each admitted sample kind, source lifetime and failure path separately. Grid tempo and stock playback/time-stretch controls are separate; explain which sample tempo and playback settings the musician must set.

## Integrate

- [ ] `sdk/catalog.json` entry, thumbnail, `resources.impact`, README sections, tutorial and screenshots of the menu path, with exact button sequences.
- [ ] If the library should group it under System while its manifest says otherwise, that is a one-line override in `src/catalog/modules.ts`, not a reason to change the manifest category.
- [ ] `npm run module:verify -- <id> --os <your 1.40C>` and `npm run module:doctor -- <id>` are green.

Compile portable C with the pinned freestanding ColdFire toolchain early and
inspect unresolved symbols (`m68k-elf-nm -u`) before claiming native readiness.
Host compilation can hide compiler-generated multiply/divide and memory helpers;
an object file alone does not prove that a module links. Use the shared
`sdk/runtime/m68k_codegen.py` flags and object guard too.

## Digitakt and Digitone

Settings rows come from the core's `ev_settings` event: add rows with `core_additem(menu, row)` and claim each row (`settings:FAST AUDIO`, for example) in `platform.claims`. Rows are claimed resources, so two mods cannot add the same one ([Digitakt guide](../../sdk/machines/digitakt/README.md)).
