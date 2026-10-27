# Add a machine

Every machine Modwerk knows about has a page. A machine gets mods by moving through its family's steps, each recorded in its profile at `sdk/machines/<id>/machine.json`. A profile's `family` is `elektron` (the default), `zoom` or `erica`.

An Elektron machine moves through five steps:

1. **Firmware file understood.** The OS file's container, packing and checksums are documented.
2. **Stock file rebuilt exactly.** A writer rebuilds the stock OS file byte for byte from its own contents.
3. **Modified OS boots.** A changed OS starts in an emulator or on a real unit, and the stock file recovers it.
4. **Core with hooks.** A small core reserves memory and gives mods shared hooks, so several mods run together.
5. **First mods.** Reviewed modules with documentation, licences and evidence.

A Zoom MultiStomp pedal (`family: "zoom"`) loads separate effect files on its stock OS, which is never modified, so it has no image to rebuild or core to boot. It moves through three steps, `format`, `load` and `mods`:

1. **Effect file understood.** The ZDL container, its ELF and the calling convention for the audio and knob code are documented.
2. **Own effect runs.** An effect built from original source loads on the stock firmware, plays and is removed again.
3. **First mods.** Reviewed effects with documentation, licences and evidence.

A Zoom firmware release lists its version with `"files": []`: Zoom ships its OS as an updater app and no mod touches it. A Zoom pedal stays locked for modules until a `zdl` module contract exists ([proposal](ZOOM_MULTISTOMP.md)). MultiStomp profiles use the `pedal` art body (an upright stompbox) and the G1on series uses `floor` (two footswitch plates).

An Erica Synths machine (`family: "erica"`) has published firmware source (the LXR-02, GPL-3.0), so mods are changes to that source and nothing is reverse-engineered or rebuilt from a stock image. It moves through four steps, `source`, `boot`, `core` and `mods`:

1. **Firmware source builds.** The published source builds an SD-card update image, reproducibly, with the documented toolchain.
2. **Marked build boots.** A build whose start-up screen shows it is modified starts on a real unit, and the official update restores it from the SD card.
3. **Modwerk base with hooks.** A base built from the source gives mods shared hooks and budgets, so several mods run together.
4. **First mods.** Reviewed modules with documentation, licences and evidence.

An Erica Synths release lists its version with `"files": []`, and the machine stays locked for modules until an `lxr` module contract exists. The licence, trademark and install terms a build must meet are in [LXR_02.md](LXR_02.md).

## Never share firmware

Do not put OS files, stock effects, memory dumps, disassembly listings or extracted Elektron or Zoom code in a pull request, issue or forum post, and do not use leaked or decrypted firmware someone else has published. Work from your own download of the stock OS. Where the OS is encrypted or signed, Modwerk does not break that: such a machine is modded here only with its maker's agreement. Before a new maker's machine gets its first public download, tell that maker ([modding guidelines](../MODDING_GUIDELINES.md)). Share hashes, file structure, addresses, notes and your own code only. Erica Synths' published source is not stock firmware: link and cite it under its GPL-3.0 licence, but never commit a built image.

## Update a machine's progress

Open a pull request that edits the machine's profile:

- Set a step to `started` or `done` and add a `research` entry crediting the public work it relies on (repository, notes, author).
- Move `status` from `open` to `research` once any step has started.
- Run `npm run machines:check`; the contract rejects inconsistent claims.

A pull request that marks steps done includes the evidence in its description: links to the public writer, emulator or boot reports. It never includes firmware.

## Research a ColdFire OS image

What the Syntakt research turned up that applies to every ColdFire machine (the report is [SYNTAKT_OS_RESEARCH.md](SYNTAKT_OS_RESEARCH.md)):

- REA (6.5.0) cannot open a headless m68k image: its ELF admission has no `EM_68K` and its raw-binary route admits only x86, x86_64, ARM, ARM64 and 6502, with no language override. Use Ghidra's `analyzeHeadless` directly: `BinaryLoader` at the image's load address, processor `68000:BE:32:Coldfire`, your own pre-script to seed the entry and a post-script that exports what you need. Keep your own ledger of tool, version, import settings, target hash and the query behind each claim, since no REA Evidence IDs exist on that route.
- Ghidra's Coldfire language does not decode `movec`, so disassembly stops after each one and the reset, cache and VBR code looks empty. Read those few windows from a throwaway MC68020-language import of the same bytes; ISA_A boot code shares the encodings. EMAC-dense functions have undecoded holes too; treat function boundaries as approximate.
- Pin the load base of a headerless image before trusting anything: at the right base, nearly every absolute call target lands on a function prologue; at a wrong base almost none do. Check the image's own structure next (reset entry, vector-table fill, stack and cache setup).
- A region with no static reference is not free. On the Syntakt, hardware showed runtime page writes into memory nothing in the image names (Synthack-OS issue #4). Prove a range two ways, static and allocator, in every supported release, and offer mods only what both proofs cover.
- Check where the image's BSS starts before appending code: on the Syntakt everything after the initialised data, including an appended tail, lies inside the range the OS zeroes at reset, so a core must hook before the clear and move its payload first.
- The repository's packer may store the main OS more densely than Elektron's, which narrows the in-place depack margin rather than widening it; check the margin of the actual build, not of the stock file.

## Research a Linux-class OS image

What the Tonverk research turned up applies to every machine that ships a Linux-class `.swu` update instead of a ColdFire `.syx` (the report is [TONVERK_OS_RESEARCH.md](TONVERK_OS_RESEARCH.md)):

- A `.swu` is the SWUpdate convention: a cpio archive whose `sw-description` manifest drives verification. When the manifest and the payloads are encrypted with device-held keys, the container documents cleanly but the checksum contract cannot be read off-device, and no modified image can be re-signed: the OS-image mod route is closed before it starts. Establish that before planning any core.
- Record the boot and recovery design from the signed boot script (A/B roots, rescue partition, rollback): it decides how safe on-unit research is.
- The machine profile contract accepts stock file names ending `.syx` or `.bin` only, so a `.swu` release cannot be recorded until the contract is widened — an owner-reviewed change on its own pull request.

## Give a machine an SDK

When steps 1–4 are done:

1. **Choose the platform.** Reuse `elemod` when the machine's OS can host a core with shared hooks and linked mods. A new platform needs an owner decision, a contract section in `module-contract-v3.ts` and its own build tooling.
2. **Fill in the profile.**
   - `firmware`: every supported OS release with its stock file names and SHA-256.
   - `flash` and `recovery` text users can follow.
   - `sdk`: platform, module folder, guide, core release and source path, toolchain, and every budget (memory, fast memory, slots) that combinations of mods must fit.
3. **Add the guide** at `sdk/machines/<id>/README.md`: the core's hooks and their C prototypes, memory areas, budgets, how to build and how to recover. Before the first module, agree with the owner how mods will reach the musician: how several mods add pages, rows and controls behind the stock keys, and which shared sites the core should own. Start from what the upstream core already offers, and add a core hook only where many mods will use it ([choose how a module hooks in](module-guides/README.md#choose-how-a-module-hooks-in)).
4. **Create the module folder** (`sdk/<id>/modules/`) and a first module with `npm run module:new -- <mod> --machine <id> --author <login>`.
5. **Set the status.** Set `status` to `preview` and every step to `done` when the first module validates. The status becomes `available` once Modwerk's engine builds and verifies firmware for the machine.

Run `npm run check` before opening the pull request. A new machine, platform or core always gets owner review.

## Aim for the Octatrack's interface

Every machine should end up working the way the Octatrack does now, so a module installs, runs beside the others and is tested the same way everywhere:

- **A Modwerk base on the unit** that owns every stock site several modules need, as hooks, and admits modules by their declared resources and budgets ([cross-compatibility](module-guides/README.md#cross-compatibility)).
- **A USB link** to the base: identify the base, list the installed modules, report status, load and self-test results.
- **Loading without a reflash** through the [runtime loader](../sdk/runtime/loader/README.md#porting-to-another-machine): review, trial, self-test, Keep and Undo, in RAM, so a power cycle restores the stock state. The loader does not depend on a machine; a ColdFire machine needs only the glue its porting section lists.
- **The developer MCP's device tools and the site's device hub** on top of that link, so developers and their agents drive the unit as they drive an Octatrack ([MCP guide](FRONTEND_MCP.md)).
- **The Octatrack page on the site**: what the Octatrack page does, for this machine: the hero, Status, module sets and guided sync, and only the unit pages that fit it (the Octatrack's Samples page, for example, does not fit every machine), generalized from `OctatrackHub.tsx` rather than built again ([the beta page](APP_DEVELOPMENT.md#octatrack-base-install-prompt)). The whole status and configuration page is beta-only, behind `hasBetaUi`, on every device until the owner releases it; visitors and members keep main's configuration page.

Build these as extensions of the Octatrack's base, link, loader, MCP and page, not as a second design. The Digitakt and Digitone are the next candidates: elemod cores exist and their CPU is the same ColdFire family. Each step is shared SDK work and needs owner review.

