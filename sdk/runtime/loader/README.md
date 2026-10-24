# Runtime module loader

Loads, replaces, rolls back and removes ColdFire modules on a running
instrument without a reboot, up to 32 at once: each with its own code and
data, hooks on the machine's hook bus, and patches to stock code. It is the backend of the
[upload controller](../upload/README.md) and does not depend on a machine:
every instrument Elekloader supports (Octatrack, Digitakt mk1 and mk2,
Digitone) has a ColdFire V4 CPU and a hook bus with tick, draw, key and
encoder events. Development only; the Octatrack is the first machine with
glue.

| File | What it is |
| --- | --- |
| [`modwerk_module.h`](modwerk_module.h) | What a C module sees: its four handlers and the test value |
| [`build.py`](build.py) | Builds a package from C sources, or from a catalogue module converted by Elekloader |
| [`verify_static.py`](verify_static.py) | Proves a package places the same bytes as Elekloader's static link of the module |
| [`loader.h`](loader.h), [`loader.c`](loader.c) | The loader and the glue a machine provides |
| [`tests/host_test.c`](tests/host_test.c) | Host test, run by `sdk/tests/test_runtime_loader.py` |

## Package, ABI 4

Big-endian. Header (32 bytes): `MWRM`, ABI u16 = 4, flags u16 = 0, image
length u32, bss length u32, relocation count u32, hook count u32, site count
u32, module id u32. Then one u32 offset per hook (`0xffffffff` for none),
the image (code, read-only and initialized data), one u32 offset per
relocation, and the sites: address u32, length u16, relocation count u16,
the stock bytes, the new bytes, and one u16 offset per relocation in the new
bytes. An ABI 3 package is the same without the id (a 28-byte header) and
is module 0.

- The id names the module: a package with a live module's id replaces it,
  any other loads beside the live ones, and one with no image, hooks or
  sites removes that module. `build.py` takes the first four bytes of the
  SHA-256 of the module's name (the elemod's id, or the output file's stem).

- Hooks, in this order: `module_tick`, `module_draw`, `module_key`,
  `module_enc`. Later events append. A base refuses a package with more hooks
  than it dispatches; hooks a package does not list are empty.
- A relocation names a 32-bit word (of the image or of a site's new bytes)
  that holds an offset into the module. The loader adds the module's address.
  A word that points outside the module, or one listed twice, is refused.
- A site replaces whole stock instructions: even address and length, at most
  32 bytes, inside the stock code the machine allows, not overlapping another
  site of the package.

From C, `build.py` links the module twice, at 0 and at 0x10000: the words
that differ by exactly 0x10000 are the relocations, and any other difference
(such as a 16-bit reference to the module) is refused. From a converted
catalogue module (`sdk/machines/octatrack/elekloader/build_ports.py`), it
lays out the `.run` section with the stock bytes it copies, resolves the
listed relocations, imports from the base's symbol map, and checks every
site's stock bytes against their recorded hash. Such a package holds stock
bytes: keep it private, like a firmware image. `verify_static.py` then links
the same module statically with Elekloader and requires the package, placed
at the same address, to match it byte for byte.

```sh
python3 -B sdk/runtime/loader/build.py MODULE.c -o MODULE.mwrm
npm run device -- try MODULE.mwrm --seconds 10   # scripts/device.mjs
```

## DSP code (ABI 5)

ABI 5 is ABI 4 with an 18-byte DSP descriptor after the module id, for a
machine whose OS runs effects on DSPs (the Octatrack): DSP word count u32,
relocation count u16, effect id u8, slots u8 (1 FX1, 2 FX2), init u16,
process u16, worst-case cycles per sample and instance u16, the kind of
that figure u8 (1 executed instructions, 2 modeled cycles, 3 hardware),
state words per instance u8, and the delay-buffer words it reads from its
slot's base u16. After the sites come the words (u32, 24 bits each) and the
relocations (u16, rising; each names a word holding an offset into the
code). The effect id is only the module's preferred one: modules are known
by their module id, and the machine's admission (`modwerk_machine_dsp_admit`)
gives each effect the id it gets, a handle, and says whether its DSPs can
take it. The loader keeps that id and hands the effect over at the switch
(`modwerk_machine_dsp_switch`), masked with the module's hooks and sites. The code itself goes into a DSP only when a track
picks the effect (the Octatrack's `dsp.c`). Admission refuses removing an effect a track runs (`RUNTIME_IN_USE`), except
while a restore switches (`modwerk_runtime_restoring()`: an Undo, or the rollback after a failed self-test), which puts a
position back as it was. The Octatrack then makes such a track dry first, as it was before the change (beta finding 66). `build.py --dsp` makes one from
a DSP package Modwerk's builder proved, and checks those proofs again.

ABI 6 adds 18 bytes to that descriptor (a 68-byte header): the module's
display name, 16 bytes NUL-padded (projects record the module by it, so a
missing one can be named), and its parameter-layout number u16, which a
version raises when its stored parameter values change meaning. `build.py
--dsp` takes the name from the catalogue (`--name` overrides it) and the
module id from the catalogue id. ABI 5 packages still load, with no name and
layout 0.

ABI 6 flags: 1, the image starts with the effect's page recipe (the machine
builds its chooser row and pages from it); 2, the effect id is pinned: the
module's own ColdFire code names it (EUCLID 29, TAPE ECHO 15), so the machine
gives it that id or refuses it, and never moves it to another. A package may
carry ColdFire code, stock-code sites and DSP code together (`build.py
--octabam MODULE --dsp …`); they change together.

## Hashed stock reconstruction (ABI 7 and 8)

ABI 7 extends the ABI 6 header to 72 bytes: stock-copy count u32 at
68. Its sites hold address u32, patch length u8, kept leading bytes u8,
guard length u8, relocation count u8, SHA-256 of the guarded original
bytes, replacement bytes, then u16 relocation offsets. The guard is
checked against the original stock view, including sites owned by the
module being replaced. Kept bytes are reconstructed from that view.

After sites, each stock copy holds image offset u32, stock address u32,
length u16, reserved-zero u16 and SHA-256 (44 bytes). The base captures
and verifies these stock spans before publishing any site. Packages carry
zero placeholders; replay instructions and table entries come from the
owner's local OS. ABI 7 builders retain their original 64-site/16-copy
limit; the ABI 8 base also accepts older packages.

ABI 8 adds fill count u32 at 72 (76-byte header), with up to 128 sites,
128 stock copies and 64 fills. After stock copies, each fill holds image
offset u32, length u32, nonzero byte u8 and three reserved-zero bytes.
These represent reviewed authored constant initializers, such as an
explicit `.fill` array. Every copy/fill destination must be a bounded
zero placeholder, disjoint from other destinations and relocation words.
The base reconstructs copies and fills without changing the stock-overlap
scanner or exempting encoded payloads from it. Image/BSS and relocation
limits remain 128 KiB and 2,048.

Package flags remain u16 at 6, module ID u32 at 28 and layout u16 at 66.
The Octatrack's read-only vendor request 29 (`C1`, value 0, vendor-interface
index, exact length 12) returns `MWCP`, version u8 = 1, maximum ABI u8 (10 since ABI 10, 9 since ABI 9; 8 before),
features u16, maximum sites u16 and maximum copies u16, all big-endian.
Features currently equal 7: ColdFire sites (1), hash-backed copies (2)
and authored fills (4). Table composition (8), machine groups (16) and
resident Sidechain support (32) are disabled. 64 is the volatile journal service (closed). Site events (128) are set only by a base built with them. A client must check the
current base before submitting a newer package, including Undo.

ABI 8 flag 4 identifies a pure ColdFire group with an `MWMG` v1 image
prefix: magic, version u8, member mask u8 (POLY8=1, VECTOR=2, FM=4), two
reserved-zero bytes and eight padding bytes before code. It cannot carry
DSP code, BSS or hook-bus entries. This is preparation only: the default
machine admission refuses groups. Enabling them requires a reviewed
board owner for shared sites, dropped-member Part checks and retirement
of all surviving data/UI/task references. The standalone package ID is
stable across subsets; its inventory layout must identify the exact
package and member versions, and old variants must remain available for
Undo. The private `--octabam-group` builder and source-pinned stock recipes
produce candidates, not qualified public modules.

## Events at stock sites (ABI 8)

A base may own stock sites that several modules need, and turn each into an event, as
Elekloader's core does for `ev_tick` and the others (its rule 4: do not patch the shared sites,
subscribe). The Octatrack's are one reviewed registry, `sdk/machines/octatrack/events.json`;
`events.py` generates the base's dispatch (`runtime_events.s`), the loader's table header
(`runtime_events.h`, built in with `MODWERK_RUNTIME_EVENTS`), the SDK header and
`sdk/machines/octatrack/EVENTS.md`, which states each event's prototype, context, results and
the reviewed order of its current subscribers.

A package subscribes with hook words after the four core events: the word at hook index
`RUNTIME_EVENTS + k` holds event k's order in its top byte and the handler's image offset below
(`0xffffffff`: none). Only ABI 8 carries them; a base without events refuses a package with more
than four hook words. `build.py` writes them from a module's `runtime.json`
(`{"schema": 1, "subscribe": [{"event", "fn", "order", "replaces"}]}`; `replaces` names the
detour its native octabam build keeps at that site, and its units assemble with
`MODWERK_EVENTS`), from an elemod's `subscribe`, or from `--subscribe EVENT:FN:ORDER` for C
sources. `contribute` is refused.

The loader keeps one row per event: every live module's handler, by (order, module id), then 0.
A switch that changes a row builds it under the stable lock and writes it masked with the
switch's sites, and waits (`RUNTIME_BUSY`) while any paused task is inside the base's dispatch,
so no task resumes part way through a row. Removal and rollback rebuild the rows from the live
set, so they come back exactly and install order never matters. A site or stock copy on an
event's bytes is refused as `RUNTIME_EVENT`; `modwerk_runtime_refused_event()` gives the event's
hook index. MWCP feature 128 says the base has events.

## Base features and DSP claims (ABI 9)

ABI 9 extends the ABI 8 header to 80 bytes: `requires` u16 at 76 (the base feature bits the DSP code needs), the
claim count u8 at 78 and the hook-entry count u8 at 79. After the fills come the claims, 12 bytes each: space u8
(1 X, 2 Y), core u8 (0 or 1; the Octatrack runs payload A, tracks 5-8, on core 0), access u8 (1 read, 2 write,
3 both), a zero byte, address u32 and words u32. A claim lies wholly in one core's memory or wholly in the window
both cores see (at or past 0x30000), and no two of a package's claims meet. Then the hook entries, 8 bytes each:
site u8 (an index of the base's DSP site catalogue), cores u8 (bit 0 core 0, bit 1 core 1), a zero u16 and the
entry, a DSP word u32. Then the DSP words and relocations, as before. Claims and entries need DSP code.

- **`requires`.** A bit the base does not provide (`modwerk_machine_dsp_features`, weak, none by default) refuses
  the package (`RUNTIME_CONFLICT`). The Octatrack's on-demand base provides the key bus (KEYBUS, 8, in
  `sdk/machines/octatrack/dsp-sites.json`): every track's FX1 input, which it publishes while a live package requires
  it (docs/OCTATRACK_PACKAGE_DSP_HOOKS.md). A reader of a base feature needs no claim on the feature's words; it may
  declare reads wholly inside a feature it requires, which the base admits (below). A provided feature that cannot
  come up this boot refuses the package as `RUNTIME_FEATURE` (10), so it is never admitted to run without it; on the
  Octatrack, the key bus while a DSP core's state is lost (its owned channel closed for the boot): restart, then retry.
- **Claims** are the X/Y words the DSP code reads or writes outside its own slot. The loader refuses a claim that
  meets another live module's claim when either of the two writes (`RUNTIME_CONFLICT`); the machine checks the rest
  (`modwerk_machine_dsp_claims_admit`, weak: a machine with no DSP ledger refuses every claim). The Octatrack's
  resident base refuses a claim on any base feature's words but a read wholly inside a feature the package requires,
  and one over a live or planned slot buffer (`RUNTIME_MEMORY`), and keeps every buffer clear of live claims.
- **Hook entries** are checked whole and then refused (`RUNTIME_CONFLICT`) in an ABI 9 package: an ABI 9 base has no
  hook slots. ABI 10 gives them to engines (below).

## Engines at hook sites (ABI 10)

ABI 10 keeps ABI 9's 80-byte header and lets a package's DSP words be an **engine** for the base's stock-DSP hook sites
instead of an effect: DSP words with slots 0 (and id, init, proc, cycles, kind, state and buffer 0). The loader parses
such words into `runtime_dsp.engine` (count 0, so nothing takes them for an effect) and asks the machine
(`modwerk_machine_dsp_engine_admit`, weak: refuses every engine) in place of the claims' check. A machine refuses an
engine there, at admission (its words are not kept yet): a refusal at the switch reaches the host as `RUNTIME_BUSY`,
which it retries, so check what needs the words when the package is built.

- **Hook entries** (8 bytes each, at least one, an engine's only): site u8 (the base's catalogue index), cores u8, exit u16
  and entry u32. `exit` is 0 or the engine word holding a long branch's displacement: the base writes it per core so the
  branch reaches the site's exit (its stock continuation), and no relocation may name that word. An engine's words are
  then the same on both cores.
- **Relocations** of an engine may also name a word holding a fixed P address (`index | 0x8000`: value − base), as the
  base's own engines (`resident_dsp.engine_unit`).
- **Claims** of an engine may name both cores (core 2) and carry initial words (access bit 4): the words follow the DSP
  relocations, each claim's in claim order, 4 bytes a 24-bit word, at most `RUNTIME_DSP_INIT_WORDS` (4,096) in all. The
  base writes them before it enables the engine's hooks.
- **The controller digest** (`runtime_dsp.controller_sha256`, kept in the owner record too): SHA-256 of the SHA-256 of
  the header with its DSP fields zeroed (bytes 32-49, and 76-79 from ABI 9) and the SHA-256 of everything up to the
  claims (hooks, image, relocations, sites, copies, fills). A base trusts a controller by it, so a package that changes
  only its DSP part keeps it. Computed for every ABI.

`abi9.py`'s `engine()` writes an ABI 10 package from an ABI 4 to 8 controller package with no DSP code, and
`controller_sha256()` computes the digest as the loader does. The Octatrack's on-demand base admits an engine only from
a controller one of its trust rows names, for a feature it packages (`sdk/machines/octatrack/dsp-sites.json` "packaged",
today Analog BD), with its claims exactly that feature's regions (docs/OCTATRACK_PACKAGE_DSP_HOOKS.md, "Phase 1").

`abi9.py` writes an ABI 9 package from a DSP package `build.py` made (ABI 6, 7 or 8), copying everything else byte
for byte (`--requires keybus`, `--claim y:0:w:0x7a0:16`). It is kept apart from `build.py`, whose hash is an input of
the reviewed machine and standalone recipes. The capability record's maximum ABI is 10 on a base built from this loader.
The site's module-set builder (`src/engine/elekloader/module-set.ts`) checks an ABI 9 package as the loader does
(header, claims, no hook entries) and offers it only to a base whose capability record reports ABI 9; the only
`requires` bit it accepts is the key bus, and a reader of it goes only to a base the site knows has the bus (the
published one, built with the resident engines on demand): the capability record says nothing about base features.

## Several modules at once

The `MODWERK_RUNTIME_SETS` candidate adds MWCP feature **512** and the
[`MWMS v1` bundle](set_package.h): an 80-byte header binds the exact base and
the baseline's sorted `(module id, package SHA-256)` digest; up to 20 unique
length-prefixed MWRM changes follow, with zero padding to four bytes. The
resulting census is bounded to 20 modules. The existing single-package
protocol and ABI remain available.

All candidates are admitted before publication. Both generations keep their
pool extents, dispatch positions and DSP handles until one complete Keep or
reverse-order restoration. Publication advances one row per engine command
while the transport stays held. A prefix reports `publishing`, an unknown
active identity and no generation change. Only completion starts trial.
Keep seals the saved set once; nothing saves a prefix. Undo and abandoned
session recovery restore the actual retained images, including packages the
website no longer has. Both generations must fit concurrently; site ownership,
event capacity and the production DSP/controller safety checks can refuse or
delay a change. This does not enable the separate experimental volatile DSP
journal or relax its trust and reclamation gates.

Octatrack request **38** returns a cached 40-byte `MWSD v1` baseline record
(`magic, version, known, count u16, digest[32]`). The engine computes it; EP0
only copies a complete record for the current owner epoch, otherwise stalls
and wakes the engine. Never hash packages or scan patched sites in a USB ISR.
Host/controller/loader and simulated-card regressions cover interruption and
torn writes. Exact-build hardware, audio and reboot persistence remain open.

- **Admission before anything changes.** A package is refused, with the
  live set untouched, when another live module patches any byte of its
  sites (Elekloader's own rule: one owner per byte), when `RUNTIME_MODULES`
  are live (32 by default; the Octatrack base builds with 128 in a 768 KiB
  pool), or when the pool has no free run large enough. The refusal reason
  (`modwerk_runtime_refusal()`: malformed, memory, conflict, full, busy)
  is kept for diagnostics and the unit's own message.
- **One position each.** A module keeps its dispatch position for life;
  replacement takes the same one, a new module the first free one. Tick
  and draw hooks all run, in position order; the first key or encoder hook
  that returns nonzero takes the event. Two modules wanting the same key is
  not detected (Elekloader's `resources.names` claims are not carried yet).
- **Memory is reclaimed.** Each module has one pool extent (its record,
  sites, code, data and bss), written and read only through the uncached
  alias. A module that no position or transaction holds is freed once,
  with interrupts masked, no paused task's stack or saved registers hold an
  address inside it; unknown task state frees nothing. `modwerk_runtime_free()`
  reports free bytes and the largest free run. `modwerk_runtime_list()` lists the live modules
  (id, name, layout, effect id) for a machine's INVENTORY request, so a host can
  make the unit match a module set (the Octatrack's vendor request 27).
- **Not carried at run time:** `requires`, imports between modules and
  `contribute` tables. A module must not leave pointers to itself anywhere
  but its sites and hooks.

## Loading, and why it is safe

- **RAM only.** Module memory comes from a pool in the base. Sites are
  written only where the machine's `modwerk_machine_patchable` allows: on
  the Octatrack, the RAM copy of the stock OS image below the copy of the
  bootloader inside it that the OS can write to flash (past it, the DSP
  payloads' RAM holds the current bank once a project loads), never flash,
  peripherals or the base itself. A power cycle restores everything.
- **Exact bytes.** A site is written only over the stock bytes the package
  expects, read through the uncached alias; the result is read back. Any
  mismatch puts the previous module's bytes back and changes nothing.
- **Nothing runs while code changes.** Hooks and sites switch together with
  interrupts masked. First the loader checks every other task's live stack
  and saved registers: an address inside a site (other than its first byte)
  means a paused task could resume in the middle of a new instruction, so
  the switch is refused and can be retried. Unknown task state also refuses.
- **No overwriting running code.** Pool memory is reused only once no
  paused task can return into it (above). Data-cache lines of a site are
  pushed before it is written, and the instruction and branch caches
  invalidated after new code is written.
- Activation needs nothing playing or recording. A bus reset or unplug rolls
  back anything not accepted (the controller's disconnect).

## Cached modules

A base built with `MODWERK_CACHED_MODULES` (the Octatrack's `build_core.py --cached-modules`,
part of its beta base, `npm run octatrack:base -- --beta`) places, relocates and runs modules
through the pool's own cached alias instead of the uncached one, so a module's loads
and stores of its own code and data hit the data cache instead of each going to memory.
Neither the ledger nor a module uses the uncached alias of the pool, so neither alias
can hold a stale copy of the other, and extents are whole 16-byte lines. What stays:

- **New code reaches memory before it runs.** Instruction fetches read memory, not the
  data cache: prepare pushes the extent it wrote (`modwerk_machine_flush_data`, every
  way of each set it maps to), then invalidates the instruction and branch caches, all
  before publication. The Octatrack's FX pages push each formatter after its fixups.
- **Freeing needs nothing.** A freed extent is reused only through the same alias, and
  its next owner is pushed in turn.
- **Reachability compares canonical addresses** (`modwerk_machine_reference`): return
  addresses on stacks are in the cached alias.

Unproven on hardware: a module that rewrites its own code, or hands its own memory to a
DMA engine or to code that reads it through the uncached alias, needs its own pushes.

## Porting to another machine

A machine provides, next to its base:

- `modwerk_machine_stopped()`: nothing plays or records.
- `modwerk_machine_uncached(p)`: the alias module code and data run from.
  Data accesses there must bypass the data cache.
- `modwerk_machine_invalidate_code()`: instruction and branch caches, with
  the OS's own cache-control value.
- `modwerk_machine_patchable(address, length)`, `modwerk_machine_code(address)`
  (an uncached view) and `modwerk_machine_flush_data(address, length)`.
- `modwerk_machine_mask()` / `modwerk_machine_unmask()`.
- `modwerk_machine_paused()`: every other task's live stack and saved
  registers, from the kernel's task records.
- Trampolines subscribed to its core's `ev_tick`, `ev_draw`, `ev_key` and
  `ev_enc`. Each reads every position (`modwerk_runtime_module(i)`) once
  and calls its hook.

The Octatrack's glue is
[`sdk/machines/octatrack/elekloader/runtime.c`](../../machines/octatrack/elekloader/runtime.c).
Key codes, encoder numbers, the frame layout and stock code addresses are the
machine's own, so a module is built for one machine and OS.

## Not yet

Patches to data tables (they need the data cache handled), modules that add
to the core's tables (`contribute`, such as CC MAP's MIDI handler), MIDI and
audio-frame hooks, shared DSP routines and the Part routes for DSP code
([design](../../../docs/OCTATRACK_ELEKLOADER_MIGRATION.md#several-modules-on-the-device-design-10-october-2026)),
pool memory taken from the arena on demand, a package that names the base
it was built for, and the browser builder.
