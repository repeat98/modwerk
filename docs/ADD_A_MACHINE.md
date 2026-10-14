# Add a machine

Every Elektron machine has a page on Modwerk. A machine gets mods by moving through five steps, each recorded in its profile at `sdk/machines/<id>/machine.json`:

1. **Firmware file understood.** The OS file's container, packing and checksums are documented.
2. **Stock file rebuilt exactly.** A writer rebuilds the stock OS file byte for byte from its own contents.
3. **Modified OS boots.** A changed OS starts in an emulator or on a real unit, and the stock file recovers it.
4. **Core with hooks.** A small core reserves memory and gives mods shared events, so several mods run together.
5. **First mods.** Reviewed modules with documentation, licences and evidence.

## Never share firmware

Do not put OS files, memory dumps, disassembly listings or extracted Elektron code in a pull request, issue or forum post. Work from your own download of the stock OS. Share hashes, file structure, addresses, notes and your own code only.

## Update a machine's progress

Open a pull request that edits the machine's profile:

- Set a step to `started` or `done` and add a `research` entry crediting the public work it relies on (repository, notes, author).
- Move `status` from `open` to `research` once any step has started.
- Run `npm run machines:check`; the contract rejects inconsistent claims.

A pull request that marks steps done includes the evidence in its description: links to the public writer, emulator or boot reports. It never includes firmware.

## Give a machine an SDK

When steps 1–4 are done:

1. **Choose the platform.** Reuse `elemod` when the machine's OS can host a core with shared events and linked mods. A new platform needs an owner decision, a contract section in `module-contract-v3.ts` and its own build tooling.
2. **Fill in the profile.**
   - `firmware`: every supported OS release with its stock file names and SHA-256.
   - `flash` and `recovery` text users can follow.
   - `sdk`: platform, module folder, guide, core release and source path, toolchain, and every budget (memory, fast memory, slots) that combinations of mods must fit.
3. **Add the guide** at `sdk/machines/<id>/README.md`: the core's events and their C prototypes, memory areas, budgets, how to build and how to recover.
4. **Create the module folder** (`sdk/<id>/modules/`) and a first module with `npm run module:new -- <mod> --machine <id> --author <login>`.
5. **Set the status.** Set `status` to `preview` and every step to `done` when the first module validates. The status becomes `available` once Modwerk's engine builds and verifies firmware for the machine.

Run `npm run check` before opening the pull request. A new machine, platform or core always gets owner review.

## Aim for the Octatrack's interface

Every machine should end up working the way the Octatrack does now, so a module installs, runs beside the others and is tested the same way everywhere:

- **A Modwerk base on the unit** that owns every stock site several modules need, as events and tables, and admits modules by their declared resources and budgets ([cross-compatibility](module-guides/README.md#cross-compatibility)).
- **A USB link** to the base: identify the base, list the installed modules, report status, load and self-test results.
- **Loading without a reflash** through the [runtime loader](../sdk/runtime/loader/README.md#porting-to-another-machine): review, trial, self-test, Keep and Undo, in RAM, so a power cycle restores the stock state. The loader does not depend on a machine; a ColdFire machine needs only the glue its porting section lists.
- **The developer MCP's device tools and the site's device hub** on top of that link, so developers and their agents drive the unit as they drive an Octatrack ([MCP guide](FRONTEND_MCP.md)).
- **The Octatrack page on the site**: what the Octatrack page does, for this machine: the hero, Status, module sets and guided sync, and only the unit pages that fit it (the Octatrack's Samples page, for example, does not fit every machine), generalized from `OctatrackHub.tsx` rather than built again ([the beta page](APP_DEVELOPMENT.md#octatrack-base-install-prompt)). The whole status and configuration page is beta-only, behind `hasBetaUi`, on every device until the owner releases it; visitors and members keep main's configuration page.

Build these as extensions of the Octatrack's base, link, loader, MCP and page, not as a second design. The Digitakt and Digitone are the next candidates: elemod cores exist and their CPU is the same ColdFire family. Each step is shared SDK work and needs owner review.

