# Source-only Digitakt and Digitone builds

Modwerk compiles the reviewed C and assembly in each module folder in the pinned `sdk/build/Dockerfile` toolchain. GCC 16.2.0 targets `m68k-elf`/ColdFire 54455; Node 24 converts the relocatable ELF to an elemod-compatible recipe. GNU's release checksum pins the compiler archive and an immutable image digest pins Node. Module compilation has no network, credentials, firmware, repository history or publication privileges.

## Build isolation

Build the toolchain with `docker build --file sdk/build/Dockerfile --tag modwerk-source-tools .`. Its restricted context contains toolchain preparation files only. Resolve that image's immutable ID with `docker image inspect modwerk-source-tools --format '{{.Id}}'`, then pass a clean checkout and a new output directory to `bash scripts/build-elemod-isolated.sh CHECKOUT OUTPUT IMAGE_ID`.

The wrapper archives only tracked source, mounts it read-only, runs as an unprivileged user with no network/capabilities and a read-only filesystem, and limits CPU, RAM, process count and scratch space. It never mounts a developer's ignored files. Compilation parses manifests as data, rejects binary and symlink inputs and invokes the assembler/compiler with argument arrays. It does not execute the compiled module.

PR checks compile twice and compare every output byte. The source job emits recipes and a final `elemod-build.json` inventory containing versions, release identities, source fingerprints, compiler versions and artifact hashes. A failed build never writes a complete inventory. The [original core foundation](../sdk/elemod/core/README.md) additionally emits explicitly incomplete boot-only (`core-build.json`), UI-hook (`core-ui-build.json`) and SETTINGS/render (`core-event-build.json`) probes for local evidence. Common-event probes carry only addresses and hash guards for stock helper bindings and inline resumes; `core-event-fixtures.json` contains authored synthetic CPU instructions. Its firmware-free host tests execute in a separate 16 MiB executable scratch mount; compilation uses a 256 MiB non-executable scratch mount. These are review artifacts; this workflow does not publish or enable firmware downloads. The approved Octatrack release pipeline remains independent.

## ELF conversion and local work

The converter accepts ELF32 big-endian m68k relocatable objects with RELA relocations. It places `.boot`, `.run`, `.fast` and `.bss`, preserving alignment, symbols, exports, imports and signed addends for absolute 32-bit and PC-relative 32/16-bit references. Unknown allocated sections, unsupported relocation types and malformed/truncated tables fail closed. Core events become table contributions.

The recipe carries stock-hash guards and patch instructions from `build.json`, never stock opcode bytes. `strings` optionally maps generated symbol names to diagnostic strings (for example digihealth's `str_name`). A FAST AUDIO declaration explicitly lists each supported release that uses its addresses and guards; its stubs can be compiled from those addresses alone.

`materializeElemodRecipe` (the source recipe adapter) runs locally in the browser or the owner's verification process. It first checks the complete main-image identity, then verifies each patch guard, fills `keep2` opcode words and plans FAST AUDIO copy/fixup tables from the selected firmware. For original core inline resumes it requires a matching patch site, zero placeholder and continuation binding, checks all instruction boundaries and rejects control flow, PC-relative operands or overlapping relocations before copying locally. Guarded stock helper bindings must also match. A branch outside a FAST AUDIO copied block or an invalid SRAM range is rejected. The normal linker additionally enforces copied-block claims, patch overlap, instruction boundaries, symbols and budgets. Materialized objects and linked images stay local and must never enter CI, uploads or source control.

Format compatibility follows [elekloader's format documentation](https://github.com/irpina/elekloader/blob/main/docs/FORMAT.md), by irpina under GPL-2.0-or-later. FAST AUDIO planning follows [digihealth's public recipe](https://github.com/irpina/digihealth/blob/6d2a95605901f4f5ea6301dbad16e573380331a6/build.py), under the same licence. Modwerk's converter and local engine are GPL-3.0-or-later.

## Verification limits

Repeatable source compilation and a valid recipe do not establish native byte parity, correct module behaviour or hardware qualification. Compare each materialized object with its author's pinned release, then verify Modwerk's own cores and each module in the emulator. Retain honest comparison results in `docs/VERIFICATION.md`; keep firmware and local images outside the repository. No firmware, DSP or emulator checks run as part of ordinary `npm run check` or visitor builds.

For a local release comparison, run `node scripts/verify-elemod-source-parity.mjs --packages RECIPES --oracle AUTHOR_OBJECTS --out LOCAL_REPORTS --firmware digitakt:STOCK.syx` (repeat `--firmware` for each release). It verifies package hashes and source commit identities before linking. Missing stock/reference inputs and differing images are reported as unverified/different and produce a nonzero exit; the report contains hashes and section lengths only.

## Source-only release objects

Source-only release packages live under `sdk/imports/packages/<module-id>/`, named `<module-id>-<version>-os<release>.elemod` to match the native build inventory. `node scripts/package-elemod-recipe.mjs RECIPE.json OUTPUT.elemod` exports the native compiler recipe without reading firmware. It accepts only explicit pointer, JSR and JMP operations and refuses `derive`, inline resumes, stock routine bindings and `keep2`. The output contains authored instructions and module sections plus stock address/length/hash guards. It is separate from private local materialization, whose output must never be committed.

Pass `--check` to compare the source-derived output byte for byte with an existing package. After its two deterministic builds, the native PR job runs `node scripts/verify-elemod-release-exports.mjs COMPILED_DIRECTORY`. It checks every committed export for the inventory's current module version and OS release, so adding a module does not require another hard-coded workflow check. An export published before the optional `resources.core` field existed keeps its bytes, because hardware evidence binds its hash; the check accepts it when a rebuild differs only by that one field, and every export that carries the field must match exactly. Catalog pins name a committed package and hash; update those pins after pushing the source/package commit. Ordinary owner release review and hardware evidence gates still apply.

## Guarded authored instructions and draft dependencies

`bytes` sites declare `new` lowercase hex and `kind` (`code` or `data`), with exact
length and stock SHA-256 and no target. Code must contain complete supported
ColdFire instructions. `lea` declares an address register 0–7 and a symbol target;
it emits the ISA instruction without retaining a stock opcode. `keep2` is still
local-only and cannot be exported. `package-elemod-recipe.mjs` and the local
adapter share these checks. Whole-image identity, local stock guards, instruction
boundaries, overlap, resource and dependency checks remain required at link time.

The reviewed extra compiler options include `-msoft-float`, `-fno-common`,
`-fno-asynchronous-unwind-tables`, `-Wall`, `-Wextra`, and `-Werror`. Path injection,
response files, plugins and arbitrary compiler options remain prohibited.

`sdk/<machine>/dependencies/<id>` holds a strict `dependency.json`, `build.json`,
authored source, licence and provenance. These are compiled frameworks, not library
cards. `core` is never a dependency folder: its tables and events come from the
machine's core interface (Core 2.1 for Digitakt), and the matrix verifier links the
catalogue's pinned Core 2.1. Machine Pages supplies `ev_render_voices`. Only
explicitly required providers can supply a module's tables/events, on every
declared OS.

Unpublished module folders live in `modules/_submissions/`. Compile them with
`--drafts --module digitakt:<id>` (repeat `--module` for every required dependency),
and validate their manifests and documentation with
`node scripts/machine-modules.mjs --drafts --base origin/main`. Draft validation
cannot write public catalogue metadata. Default compilation still builds the
normal source set and original Core probes; selected builds label their scope.
`verify-elemod-matrix.mjs` compares exported objects and every feature selection
against private native reference builds, through both Modwerk and the browser kit.
Use the machine-wide `/tmp/modwerk-check.lock` for checks/native builds.

A schema-2 capture bundle contains separate schema-1 `records`, each retaining its
OS, image identity, module/version, panel plan and PNG hashes. Each declared PNG
must occur exactly once and match its own record; single-OS schema-1 records remain
valid. Bundling does not turn screenshots into audio or hardware evidence.
