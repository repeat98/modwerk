# Package-carried stock-DSP hooks and DSP memory claims (design, for owner review)

Status, 20 October 2026: a proposal, implemented locally with option B (the base-owned key bus) chosen: first on
`claude/package-dsp-hooks` (old main, 15-16 October), now redone on `claude/keybus` from main `e370b78e` after the
review below. The owner has not reviewed it: the questions at the end are open, and the base, the loader ABI and the
receiver change only on that branch until he does. Hardware facts are quoted from the documents named, except the
key bus's own run on an MKII (20 October 2026, "On the unit" below).

Update, 22 October 2026: the owner ruled that no module is tied to the base; the plan that follows from it is the
next section, for his review before any of it is built.

## Owner decision and plan, 22 October 2026

Analog BD 0.1.6 changes only its 909's DSP sound, yet shipping it over USB needed a new beta base: its engine and
tables are built into the base and the base admits its package by an exact hash. The owner: "no module should be tied
to the base firmware", and on version coupling: "if some modules will require a new base later down the line because
base has drifted so much or vice versa, it's ok".

So:

- **A module update ships as a module.** Its DSP engine, its DSP tables and its controller code come from its own
  package, never from the base's build, and nothing in the base names its package's hash.
- **Versions may still require each other.** A module may need a newer base, or a base newer modules, when one has
  moved on. That is a declared requirement (`requires`, the capability record, a minimum base), checked at sync, not
  an exact identity pinned on both sides.

### What ties a module to the base today

Analog BD as the example; Sidechain Compressor and Output Matrix are tied the same way.

| Tie | Where | Consequence |
| --- | --- | --- |
| The DSP engine is base code | `resident_dsp.py` builds it from the module folder and pins those files (`SOURCES`, `src/engine/assets/octatrack-base-sources.json`) | Any DSP change is a base input: the base must be rebuilt, or its checks fail |
| The DSP tables are base data | `resident_dsp._analog`'s X record (3,776 words a core), written at RESET from `resident-engines-data.c` | Same |
| The base admits the package by hash | `controller-policies.json` trust rows: package SHA-256, entry and lease return offsets | Any package change needs new rows, so a new base |
| The package calls the base by address | Base-bound packages link the write-lease entries absolutely (`base-binding.json`, `requiredBase`) | Every base change relinks the package (acceptable under the owner's second sentence, but it is what makes the hash change) |

### Plan

**Phase 1: engines and their tables travel in the package.** One base change, one requalification.

- Base: generic hook slots. The base keeps the JSR and dormant stub at each catalogued site (`dsp-sites.json`) and one
  base word per slot; PLACE names a hook slot instead of a feature bit. The receiver, `resident_engines.c` and its
  admission take the engine unit (words, relocations, entry offsets) from the installed package's DSP section
  instead of `resident-engines-data.c`. Stubs, placement, evacuation and the on-demand rules stay as they are.
- Package, ABI 10: hook entries are accepted (ABI 9 refuses them); a claim may carry initial words, which the base
  writes before ENABLE in place of today's RESET from base data; `RUNTIME_DSP_WORDS` grows (Analog BD needs its 998
  code words plus about 3,200 table words, over today's 4,096). Each package declares its per-core DSP cost (today
  `analog_bd_dsp_price.json`), charged as now.
- Trust for Phase 1: the controller's trust row pins only its ColdFire image and lease call sites, not its DSP words,
  so a DSP-only update changes nothing the base pins.
- Analog BD moves: its package carries the 808/909 engine and tables; the base drops its resident feature and pins.
- Checks: host tests (receiver model, relocation at several bases, admission refusals, claim init), then on the
  owner's unit: install, place, both engines playing, Part switches while playing, removal and reinstall, a power
  cycle restore. Then Analog BD 0.1.6 ships as a module release, card and USB.

**Phase 1 as built (22 October 2026, `claude/package-carried-engines`).** Analog BD only; Sidechain and Output Matrix
stay base data (Phase 3).

- **The site.** `dsp-sites.json` site 5, `dsp_track_source` (P:$39c / P:$1a2, the stock `move a,x:>$20e`, its guard
  checked against the stub the base assembles), with an **exit** per payload (P:$426 / P:$221): the stock code after
  the source, where Analog BD's glue leaves when it rendered the track. Feature 4 is `"packaged"`: its engine is its
  controller's package's, its region (X:$2840, $ec0 words on both cores) stays the base's.
- **The package (ABI 10).** `module-adapters/hook_engines.py` assembles Analog BD's engine from the module's own sources
  (glue, 909, 808, desk), as `resident_dsp` did, but as one unit for both cores: its one jump to the continuation is the
  site's exit, a long branch whose displacement the base writes per core (`mw_engine_relocate`). Proven: each core's own
  assembly at four bases equals the unit placed there with that core's exit, and the unit placed with the exit equals
  main's resident Analog BD engine word for word (998 words). Its 3,776 initial words (the X tables and voice blocks)
  are one claim on both cores with initial words. `abi9.engine()` writes it into the controller package
  (`base_bound.machine`). Nothing of it is a base input.
- **Trust.** A row pins the **controller digest** (`loader.h`: the header with its DSP fields zeroed and everything up
  to the claims), not the package's SHA-256; the loader keeps it in the owner record, and the board, the owner checks and
  the write lease compare it. A package that changes only its DSP part (0.1.6) keeps its row, so the base is not rebuilt.
  The source policy in a row hashes only the controller's inputs (`build.py machine_inputs`), and the price (411 a
  voice, 3 a core) stays in the machine record (`machine-ports.json`): a price change is a controller change until
  Phase 2.
- **Admission.** The loader asks `modwerk_machine_dsp_engine_admit` (the board) for an engine: a trusted controller of a
  packaged feature, one entry at the feature's one site on its cores, entered at word 0, an exit exactly where the site
  has one, claims exactly the feature's regions with initial words, at most 2,048 words. A trusted controller of a
  packaged feature must bring one. Everything is checked at PREPARE: a refusal at the loader's switch is reported as
  `RUNTIME_BUSY`, which the host retries for good, so the long branch before an exit is checked by the package's build.
- **Placement.** `resident_engines.c` takes the unit from the bound generation (`mw_engines_package`), never adopts
  another generation's engine (an update or going back unplaces the old one, while that core is known dormant and the
  sequencer quiet, then writes and places the new one), and resets the region from that package's initial words. The
  receiver's PLACE takes the engine's size in word 7 (it was 1, with sizes built in), so a packaged engine is placed as
  the base's own.
- **The base.** No Analog BD source is pinned (`resident_dsp.SOURCES`), no X record is uploaded at boot or kept
  (`resident_boot`), and every resident build is on demand (`--resident-stock-hooks` needs `--resident-on-demand`;
  the permanent-engine build is retired).
- **Checked in software.** Loader host test (ABI 10 parse, refusals, the digest across DSP-only changes); the board on
  demand (`test_resident_engines_board.py` modes 50-53: a DSP-only update under the same row, going back, refusals,
  a replacement waiting while playing; every earlier mode with Analog BD's engine from its package); the DSP interpreter
  (`test_resident_engines.py`: relocation with the exit at ten bases, the placed engine bit-exact at two places, base
  words kept beside Sidechain and the key bus); the site (`module-set.test.ts`, ABI 10 checks); the publication builder.

**Phase 2: controllers admitted by what they declare.** One base change.

- Packages import the lease entries by symbol at install, as other modules import, so a package no longer belongs to
  one base link.
- The base admits a controller by its declared feature and lease call sites, one holder per feature, with no package
  hash in the base. Trust rows and the exact `requiredBase` go; a minimum base, where needed, is a declared requirement.

**Phase 3: Sidechain Compressor and Output Matrix move** onto Phase 1's path, folded into Phase 1's base change if
ready by then. The key bus stays base-owned on purpose (readers require it).

Card builds are untouched by all three phases: modules are composed into the OS when the card image is built.

### Risk

Without hashes in the base, the base can only check structure: declared sites, claims, cost, room and lease call
sites. A published package that passes those checks but misbehaves can silence or stall a core (a hook runs on every
track of its core) or write its own Part bytes wrongly. That is the risk effect packages already carry, with a larger
reach; review and CI decide what is published. Signed packages (a key the owner holds, checked by the base) would close
it at the cost of a signing step in every release; not proposed unless the owner wants it.


## Review against main `e370b78e` (20 October 2026)

What main changed since the first implementation (based on `24a1ece8`), as far as it touches Sidechain Compressor, its
key window, the resident and on-demand DSP engines, the controller board, DSP placement or a ledger:

| Change | What it does | Effect on the key bus |
| --- | --- | --- |
| #640 | Engines on demand; Sidechain's key phase rule (`resident_dsp.REVIEWED`): a core not yet seeded adopts the other core's counter | Already the base of the first implementation; the tap the key bus takes is this reviewed text. |
| #661 | The op-10 CAS reloads `hookready` before clearing a disabled feature's ready bit | The fix the first implementation was rebased on; on main as written. |
| #670, #721 | `loader.c`: installing Play Modes or FM Synth no longer stops the DSPs; loader and host test fixes | Textual conflicts with ABI 9 in `loader.c`, `host_test.c` and the loader README only. |
| #697/#703, #733 | E-Verb 0.1.2 and Mini Verb 0.2.3 end their FX2 rings at `+$3DFD` (`buffer_words=15870`, modulus `$3dfe`), so they stop exactly where Sidechain's window starts (`+$3DFE`) | The window stays where it is ($202 words from `+$3DFE` of the bank-track-3 FX2 slots: Y `$33dfe` core A, `$3bdfe` core B). Not one word below it is free beside those effects, so the 15 October layout of the gated follow-up (want words at base-10..base-3 = `+$3DF6..+$3DFD`) is dead (below). |
| #698, #731 | The effects guide names Sidechain's window as a trap; card builds refuse an effect whose declared FX2 buffer reaches a range another module declares in that slot (`module-pairs.py slot_tail_meetings`); over USB the base refuses such a buffer per block (`mw_hook_buffer_permitted_held`, `stock_hook_resources.c`) | The USB rule is the one the ledger generalises: with the key bus, the window is refused to a buffer while Sidechain **or any reader** is installed. Card builds are unchanged: the key bus is a USB base feature, Sidechain's manifest still declares its window for the card ledger. |
| #705 | Output Matrix 0.1.1 (smaller core-0 DSP, the LEV label) shipped by rebuilding the base and its trust rows | The "Output Matrix's next version" half of the problem above is solved the old way; package-carried hooks remain only a proposal (sections 1-5). The Output Matrix sites in `dsp-sites.json` are checked against its new manifest. |
| #712 | Sidechain's KEY/KFLT/KGN bytes survive stock's power-up bank validation (`machine_registry.c`) | ColdFire only; nothing in the key path. |
| #721 | The board derives trust bindings only when the runtime's owners changed (`bind_live`'s epoch, 170-180 µs a tick with six modules on the owner's MKII); cached-module aliases | The key bus's "wanted" test reads each live module's `requires` word: a few loads a tick, no hashing, so it need not wait for the epoch. |
| #729 | Every DSP effect loads on demand: an engine's claim tries all four Parts, then the played Parts, then only what runs, and retires cached code first in a trim | The key bus's engine takes its region through the same claim; the first implementation's `mw_engines_want` (Sidechain's and the key bus's engines claimed together, one evacuation) still fits the tiered claim unchanged. |
| #732 | A base updates itself over USB (the card only for the first install) | A key bus base reaches testers without a card; it is still one base change and one requalification. |
| #738 | Redraw after a set change | Nothing in the key path. |

**Does upstream already provide any part of it, or conflict?** No. Main has no key bus, no DSP site catalogue, no DSP
data ledger and no base features: Sidechain's tap is still part of its resident engine (`resident_dsp.FEATURES` =
Sidechain, Output Matrix, Analog BD), the window's protection over USB is still the hard-coded `meets()` in
`stock_hook_resources.c`, and `loader.h` is still ABI 8. Nothing upstream contradicts the design; #731's run-time rule
is the one the ledger generalises. Upstream's site events (`events.json`) and table owners are ColdFire mechanisms and
have no DSP counterpart to reuse.

**Does option B still fit?** Yes, for its first step (the unconditional tap). Changes from the first implementation:

1. **The tap's price.** The first implementation charged the tap on both cores whenever its engine was placed,
   Sidechain alone included. Main charges nothing for Sidechain's tap, and that charge (41 executed instructions a
   sample a core, 72 at 7/4) is a fifth of core 0's headroom over eight stock slots (allowance 3,120, reserve 342 a
   slot): Sidechain could have been refused where main admits it. Now the tap is charged only while a live package
   *requires* the key bus; Sidechain alone is admitted and charged exactly as on main. (The tap's cost with Sidechain
   alone stays uncharged, as on main.)
2. **The gated follow-up needs a new layout.** Its want words (`+$3DF6..+$3DFD`) meet E-Verb 0.1.2's and Mini Verb
   0.2.3's rings. Local wants can go in private Y past Sidechain's words (`$a00`.., free on stock on both cores), but a
   cross-core want must be in the window, which has no free word left; a single word per core would be written by the
   readers of one core and decremented by the tap of the other, a lost update. Gating therefore needs its own design
   (and a reviewed change to Sidechain's `scdet`); it is not part of this change. The want-word API stays the base's:
   today every track is always wanted, and no reader writes anything in the bus or the window.
3. **The window's owner.** The window is the key bus's while it is held (Sidechain or a reader), Sidechain's own
   ranges keep it too, and the effects guide's trap says so.
4. **Ported, not redone**: the site catalogue and ledger (`dsp-sites.json`, `dsp_sites.py`, `dsp_ledger.h`), the tap
   split out of Sidechain's reviewed text (`split_sidechain`, its SHA-256 pins), the receiver's feature 8 (CAS, PLACE,
   1,026-word reset), the board's key bus holder and the ABI 9 loader. **Redone**: the price (1), the conflicts with
   #670/#721/#729 in `loader.c`, `controller_board.c`, `resident_engines.py` and their tests, and the base and packages,
   regenerated from main.

**Latency parity and no regression, as they now read.** Sidechain's key latency on main is set by the tap and `scdet`
alone: a key on the reader's own core is this block's audio (0 samples) when the dispatcher runs the key track first and
the last block's (16) when after, and a key from the other core is two generations behind (32) on every enable (#640,
measured 5 of 5 on the owner's MKII). The key bus keeps that by construction: the tap's instructions are Sidechain's
reviewed text, split and never edited, `scdet` keeps reading its own core's counter, and the board enables the key bus
on both cores before Sidechain's first enable. The proof is the interpreter's two-core key-phase test run against the
split units (Sidechain's detector unit plus the key bus unit, placed apart), every enable offset and skew of #640's test,
plus a reader on each core, and on the unit the same T5-against-T3 lag over repeated removals and reinstalls. No
regression means: Sidechain's package bytes unchanged but for `requiredBase`, its trust row unchanged, its admission
and charge as on main when no reader is installed, the resident (not on-demand) permanent block's words identical, and
its existing host and interpreter tests passing.

## The problem

Two modules can't ship over USB today, and the cause is the same:

- **RINGMOD SC** (a ring-mod/duck insert with its own key tap; branch `claude/ring-mod-sidechain-effect-e0027c`). Its
  effect is an ordinary relocatable insert. Its key tap is a hook in stock DSP code at the per-track FX1 dispatcher, with
  fixed Y claims on both cores. `build.py --octabam ring-sc` refuses it ("hooks in stock DSP code").
- **Output Matrix's next version** (smaller core-0 DSP, the LEV destination label). Its DSP engine is resident in the
  base, built from pinned sources (`resident_dsp.py` `SOURCES`), so any change to `matrix_mix.asm` is a new base,
  a new identity and new `requiredBase` for every base-bound package.

The base's resident DSP route is a closed list: `resident_dsp.FEATURES = (SIDECHAIN, MATRIX, ANALOG_BD)`, with per-feature
`ALLOWED` cores, pinned sources, fixed `resource_ranges` and fixed stubs. Each new hook module, and each DSP change to an
existing one, needs a base rebuild, re-pinning, Analog BD's recipe recapture (finding 17) and the owner's
requalification of the base.

## What already exists and is reused

- **Stubs at stock sites** (`resident_dsp.assemble_resident`). The base's DSP image puts a permanent JSR at each hooked
  stock site, into a two-word stub whose dormant path replays the displaced instruction. The receiver's op 10 CAS
  changes only the stub's operand, between frames, on every required core.
- **Engines on demand** (`docs/OCTATRACK_RESIDENT_ENGINES_ON_DEMAND.md`). An engine is a relocatable unit (address and
  negative-displacement relocations, proven at several bases). The ColdFire places it at the top of the arena (claim,
  evacuation, owned WRITE with read-back, PLACE writing a per-feature base word, RESET, ENABLE), only while stopped, and
  unplaces it when no holder is left. Part switches never start an engine job.
- **Per-core engine cycle charge** (`dsp.c`, `modwerk_dsp_source_claim`): a per-core price charged before every FX slot,
  7/4 of an emulator figure until a hardware figure exists.
- **Y buffer fit** (`resident_dsp.buffer_fits`): a slot's delay buffer must not meet an active feature's Y range.
- **Manifest declarations** octabam's ledger already checks on card builds: `DspHook(site, stock guard, label)` and
  `DspRange(space, start, length, half_relative)` (`tools/remix/schema.py`), and `modules:compat` for the pairs.
- **Controller trust rows** (`controller-policies.json`): the base admits a base-bound ColdFire controller only by its exact
  package hash, which is a base input.

## Proposal

### 1. A base-owned catalogue of DSP hook sites

A registry like `events.json`: `sdk/machines/octatrack/dsp-sites.json`, with `events.py`-style generation. Each entry:

- name (`dsp_` and what runs there), index (an ABI: append only, never renumber);
- per payload: P address, length in whole instructions (two words today), SHA-256 guard of the stock words;
- when it runs (for example "per track per block, before FX1, X:$420 = the track"), and the register contract: the
  registers a subscriber may clobber (for the FX1 dispatcher: a, b, r0, r1, n1, x0, which stock reloads right after);
- kind: **exclusive** (one subscriber; the base refuses a second) or **chain** (a fixed room of N subscribers, called in
  order). Start with exclusive only; chaining costs cycles at the hottest site and has no user yet.

The base build installs the JSR and a dormant stub at every catalogued site, as it does for today's resident features.
The stub's on path becomes `jsr <placed entry>`, then the displaced instruction, then `rts`: **the base replays the
stock instruction, never the package.** A package then carries no stock words at all, so it stays stock-free under the
unchanged scans. Today's engines end with the displaced instruction themselves (Sidechain's `sctap` ends with it); a
package must not.

Initial sites, all already hooked by resident features or requested:

| Site | Payload A | Payload B | Today |
| --- | --- | --- | --- |
| FX1 dispatcher (per track, before FX1) | P:$004a7 | P:$0029c | Sidechain `sctap`; RINGMOD SC's tap |
| Sidechain detector, MON commit | (from its manifest) | (from its manifest) | Sidechain |
| Output Matrix mix, phones | P:$257, P:$30a | none | Output Matrix |
| Analog BD source | (resident guard) | (resident guard) | Analog BD |

### 2. A DSP data ledger owned by the base

One table per core (and one for the shared window, which both cores see) of who owns which X/Y words:

- **stock tenants**, measured and fixed at base build (for example Y:$795..$fff free on stock on both cores, the stock FX
  slot buffer bases);
- **base-owned regions**: the resident features' ranges (`resource_ranges`), and any base table (section 4);
- **package claims**: each admitted package's declared ranges, per core, read or write.

The base already tests slot buffers against resident ranges (`buffer_fits`); the same test generalises to every claim, so
a delay buffer is never placed over a claimed Y range and a claim is refused over a live buffer. Claims follow
`DspRange`: absolute below the shared window, or half-relative inside it.

Rules the ledger enforces at admission, before anything is sent:

- one owner per site (exclusive kind) and per claimed word;
- a claim inside the shared window is compared against both cores' claims and both cores' FX2 slot buffers;
- an X claim in an 8K block a DMA uses ($0000, $2000, $8000 on core 0) is refused or flagged for review
  (`OCTATRACK_HARDWARE_TRAPS.md`, dense work beside a DMA);
- claims an effect's own code writes outside its r7 block count too, not only the hook's (RINGMOD SC's readers write the
  want word of their KEY track).

### 3. The package: an ABI 9 hook descriptor

An extension of the ABI 6 DSP descriptor (`sdk/runtime/loader/README.md`), so one package can carry an effect, a hook
engine, or both (RINGMOD SC needs both: an insert and a tap):

- **engine unit**: relocatable DSP words and relocations, assembled at two origins and proven at several bases, as
  `resident_dsp.engine_unit` does; entry offsets per site;
- **hooks**: site index and entry offset, per core (a package may hook core A only, like Output Matrix);
- **claims**: `{space, core | shared, start, words, access}`;
- **init records**: the words to write into its claims before ENABLE (zero, or a seed), so cold memory is never read as
  state (RINGMOD SC's seeded mark, Sidechain's GSEED sentinel);
- **cost**: per core, while enabled, in the existing figure kinds (executed, modeled, hardware), charged like a source
  engine (`modwerk_dsp_source_claim`): a hook at the dispatcher costs on every track of the core whether or not a reader is
  active, so it is a per-core engine price, not a per-instance one.

`build.py --dsp-hook` derives all of it from the module's manifest (`DspHook`, `DspRange`) and refuses, before
packaging: a site not in the catalogue, a stock guard that differs from the catalogue's, a register outside the site's
contract (checked on the disassembly, as build_bus's round-trip audit does), a `rep`, a stack depth over the site's
allowance, or a missing `rts`.

### 4. The lifecycle (the on-demand engine path, generalised)

Install, trial, self-test, Keep and Undo as for any package. The engine part follows today's on-demand order, with a
**hook slot** in place of a feature bit:

1. admission: ledger (sites, claims), P room (`mw_engines_admit`'s dry run, the bank's Part union), cycles;
2. WRITE (owned, read back), PLACE (op 10, word 7 = 1, word 4 the hook slot, word 5 the table offset; the base word per
   slot);
3. init records into the claims;
4. ENABLE: CAS of the stub operands on every required core, in the same frame where the hook reads the other core's
   data;
5. removal: disable on every core, then UNPLACE and free the claims, only while stopped (the on-demand rules).

The base reserves a fixed number of hook slots (say 4), each with its base word in the permanent block: a few P words per
slot on each core.

### 5. Trust

The point is to ship a hook module's DSP change as a new package, with no base rebuild. So admission can't be by an exact
package hash pinned in the base, as controller trust rows are. The proposal: a hook package is admitted like an effect
package, by the catalogue and qualification path (review, `module:verify`, hardware evidence), with the base enforcing
only the structural rules above (sites, guards, claims, cost, P room). That is a policy change for the owner: a hook
runs on every track of a core, so a bad package can silence or stall a core. It is the same class of risk as an effect
package, larger in reach.

**Output Matrix also has a ColdFire half.** Its controller is a base-bound package admitted by trust rows, and the LEV
label is a ColdFire change (a new detour, a moved stock-copy span). With this proposal its DSP change ships as a
package, but its controller change still needs new trust rows, so still a base rebuild, unless controller admission also
moves from pinned hashes to declared lease entitlements. That is a separate decision (question 4).

## The key conflict: Sidechain Compressor and RINGMOD SC

Sidechain's resident engine already owns the FX1 dispatcher site and the shared windows. RINGMOD SC's tap is nearly the
same tap: same site, same key bus ($800 + track×$40, 32 words used), same cross-core window layout (base + local×$80 +
generation×$20, base $33e00 / $3be00), same seed and counter words before the window. It adds want words that gate the
copy: $7f8+track per core, which **meet Sidechain's MON words** ($7f0..$7ff), and four words below the window.

**Option A: the ledger refuses the pair.** RINGMOD SC claims the dispatcher site and its ranges; with Sidechain installed,
admission answers `RUNTIME_CONFLICT`, and the configurator never offers both (RINGMOD SC's manifest already declares
`conflicts=SIDECHAIN_COMPRESSOR`).

- Needs nothing beyond sections 1-5.
- RINGMOD SC must take the #640 counter-phase rule into its own tap: at a runtime install the cores are enabled at
  different frames, and its tap has the pre-fix behaviour (89 or 121 samples of lag, and an occasional read of the slot
  being written, as Sidechain had).
- Users choose one or the other.

**Option B: a base-owned key bus that both read.** The base owns the tap at the dispatcher as a facility, not a feature:

- the tap is Sidechain's resident `sctap` with the #640 phase rule, publishing every track's FX1 input into the existing
  layout (local bus and cross-core window, four generations, reader two behind its own counter);
- it is a base DSP table: readers declare `reads: dsp_key_bus` and claim no tap words; the base enables the tap while at
  least one reader is installed (reference count), so idle cost is paid only then;
- Sidechain's engine drops `sctap` and reads the bus as today (same addresses, so `scdet` is unchanged);
- RINGMOD SC drops its tap and its counter; its readers read the same slots.
- So under B, RINGMOD SC carries no stock-DSP hook at all: it is an ordinary effect package whose descriptor requires
  the bus, and its readers stop writing want words (they would land on Sidechain's MON words).

Trade-offs of B:

- Both modules run together, and the phase rule lives in one place.
- RINGMOD SC loses its want-word gating, so the tap copies every track while any reader is installed. Its own estimate:
  about 2 instructions per sample idle and about 11 for a listened track with both copies. Sidechain's always-on tap cost
  is not measured on its own; measure both before choosing.
- If gating is wanted, it becomes part of the bus contract (readers mark the tracks they listen to), its want words move
  out of Sidechain's MON range, and Sidechain's `scdet` gets a reviewed change (`resident_dsp.REVIEWED`) to mark its KEY.
- Sidechain's MON stash ($820.. of each track's bus slot) stays Sidechain-private and must be declared as its claim.
- It changes a base-owned tap, so it is a base rebuild and a requalification once, when the bus is introduced.

**Chosen for the local implementation: B** (owner review pending, question 1). The plan, in two steps. First, sections 1-5 with exclusive sites, and the key bus as the first base-owned
DSP table, with Sidechain moved onto it in the same base change (its tap code is already the base's). Second, RINGMOD SC
as the first package-carried reader, then Output Matrix's DSP as the first package-carried hook. Option A is the fallback
if the owner wants RINGMOD SC sooner than the bus can be qualified.

## The key bus as implemented first, and its follow-up

**First step (chosen 15 October 2026, local): an unconditional tap.** KEYBUS is Sidechain's resident `sctap`, unchanged,
with #640's phase rule: it copies every track's FX1 input to the local bus and the window on every block. Sidechain's DSP
stays byte-identical; only its feature split moves (KEYBUS, bit 8, out of SIDECHAIN; a held SIDECHAIN holds KEYBUS).

- KEYBUS is placed only while a reader package or Sidechain is installed, so it costs nothing otherwise.
- While a live package requires it, the base charges the tap on both cores as a per-core constant, before every FX
  slot, the way a source engine is charged: counted statically from the source (`resident_dsp.keybus_executed`, 41
  executed instructions a sample for a core's four tracks, seeded), charged at 7/4 like every emulator figure until it
  is timed on a unit. Sidechain alone is not charged for it, as on main (review, change 1); a reader installed beside
  Sidechain is. The price is paid at the pick, never at install (owner, 24 October 2026): a reader always goes in, and
  the FX allocator adds the price to any set that names a reader's effect while the tap is not charged
  (`modwerk_controller_keybus_pending`), so that pick or Part change is DSP FULL until it fits. The box counts the price
  and shows the core that ran out (`dl_cycles_core`, `dl_refusal_core`): with the tap on both cores, that is often T5-8
  (the smaller allowance) for a reader picked on T1-4. An install check against the Part on screen reserved nothing and refused syncs for a Part that may change.
- Measuring it on a unit: NONE on every track, one pattern playing, `scripts/octatrack-measure.py` on both cores with
  nothing installed, then with a KEYBUS reader installed (KEYBUS placed and enabled, no reader on any track), then with
  Sidechain installed; the difference is the tap's cost per core.

**Resets.** KEYBUS resets the window ($33dfe / $3bdfe, $202 words) and then the bus (Y $800, $200 words), 1,026 words
per core, when it is placed: the window first, so the first chunk zeroes the seed mark and counter. Once it is let go
after a run, the board sends that one chunk again (the scrub) while it still holds the window, so a stale mark never
outlives the bus. Sidechain keeps its exact reset (1,042 words: Y $7f0+$210 and the window), so its contract and
DSP stay byte-identical; a held Sidechain holds KEYBUS, which the base places, resets and enables first. Side effect:
installing or reinstalling Sidechain while a reader is live re-zeroes the bus and the window once, so that reader hears
up to about a block of silent key while the tap re-adopts its counter by #640's rule.

**The reader contract is generic.** Any track can be a key, and a reader may run on either core: a reader on the key
track's own core reads the local bus (this block's audio if the key track is dispatched before it, the last block's if
after), a reader on the other core reads the window two generations behind its own core's counter (#640's phase rule:
32 samples). A reader writes nothing in the bus or the window. Until the bus is live on its core (the tap's seed mark at
base-2 holds exactly $10000 and the counter at base-1 is 0..3) a reader should treat the key as absent and pass its audio
(RINGMOD SC ramps its depth to 0): a card image has no key bus, and the words there may be cold memory or another
effect's buffer. RINGMOD SC is the first reader; CHARACTER 0.1.2's KEY
(today upstream's bus server at y:$990/$991, or NOBUS_KEY) is planned as the second, once RINGMOD SC's is proven.

**Checked in software (`claude/keybus`, 20 October 2026).** None of it on a unit.

- `dsp_sites.py --check` (`test_dsp_sites.py`): every catalogued site's payload addresses and stock guard match its
  module's manifest on main (Output Matrix 0.1.1's included), and the three original features' regions match
  `resident_dsp.resource_ranges`.
- DSP interpreter (`test_resident_engines.py`, the vendored dsp56300 build; not the chip): the units relocate alike
  three ways at ten bases (Sidechain's detector 322 words, the key bus 101, 423 together as before); the split leaves
  the permanent block word for word the unsplit text; three engines placed and enabled on each core, Sidechain and then
  the key bus disabled, leave every other base word intact and refuse a re-enable without a RESET. Key latency with
  the tap and the detector assembled as two units placed apart (`split`) as with the resident text: a key from the other
  core two blocks late (32 samples) for every enable offset from -5 to 5 frames, five fixed core skews and a moving one,
  never the slot being written; a key on the reader's own core 0 blocks (key track dispatched first) or 1 block (16
  samples, after) on every enable offset.
- Host, ColdFire side (`test_resident_engines_board.py` modes 39-40, `test_controller_board.py`, ASan/UBSan): a reader
  alone places, resets (1,026 words) and enables the bus on both cores and pays its price; Sidechain beside it needs no
  second bus job and never enables before the bus is on (`sc_before_bus`); removal in both orders; with no room for the
  price a reader still goes in and waits for it (mode 40; at its switch, mode 60, beta finding 64), and the pick that
  brings its effect is DSP FULL until it fits (mode 61), while Sidechain is still admitted and charged nothing, as on main; the bus
  waits while a slot buffer covers its window. The loader's ABI 9 parsing, claims and refusals (`host_test.c`,
  `test_runtime_loader.py`).
- The site (`module-set.ts`, `module-set.test.ts`): an ABI 9 reader is chosen and synced only to a base reporting ABI
  9, its header, claims and the absence of hook entries checked as the loader checks them, and `requires` limited to
  the key bus.
- The beta base, regenerated with main's flags (main's `6650236a` first rebuilt byte-identical, `.bin` `18cdd7b4`):
  `d0acb53f…` (`.bin` `de2653e2`). Its DSP arena with nothing placed is 4,304 words on core 0 and 4,432 on core 1, 112
  fewer on each than `6650236a` (the receiver's feature 8 and the key bus's base word); Sidechain's engines still take
  423 words together. The ColdFire code grew, so the write-lease entries moved: Analog BD's recipe was recaptured
  (image hash only) and the bound packages relinked. Sidechain's package is the same 1,236 bytes but for the two
  lease-entry addresses it calls (4 bytes); Output Matrix's and Analog BD's differ only in those addresses, Recorder
  Loop Fix's in its base hashes, CC Map's not at all.

**On the unit (MKII, OS 1.40C, 20 October 2026).** Run on a development twin of `d0acb53f`: the same source and
beta flags plus `--dev` (identity `c8ad288e…`, `.bin` `e3b44075`), RAM-booted, never flashed, with the packages relinked
to it (Sidechain `cd2dbe13`, Analog BD `5616af29`, Output Matrix `129cd5b2`). The twin differs from the beta base only
in its development requests, and in Analog BD's recipe hash for its own link; `d0acb53f` itself has not run on a unit.
Driven over USB, ears by the owner of the unit; takes, `mem:` dumps and the 20-channel recordings kept privately.

- Boot: every engine free, arena 4,304 / 4,432, nothing reserved, receiver masks `00 00`.
- Sidechain installed: the key bus at 4,203 / 4,331 and Sidechain's engine directly under it at 3,881 / 4,009 (arena
  3,881 / 4,009, 423 words reserved per core), masks `09 09`, the bus's reset complete (1,026 words per core), the slot
  ACTIVE with both enables, nothing charged for the tap. During a reinstall a reader of the masks every ~150 ms saw
  `00 00` ×9, `08 08` ×6, `09 09` ×45: the bus on before Sidechain on both cores, never Sidechain without it.
- Key latency (20 USB channels, cross-correlation of the receiver's channel with T3's; COMPRESSOR with KEY T3 and MON
  ON): T5 (other core) 32 samples, correlation 1.0000, on all 23 onsets of the first take and on every onset of each
  of five removal and reinstall cycles; T4 (same core, after T3) 0 samples and T2 (same core, before T3) 16 samples,
  12 of 12 onsets each. As 6650236a gave for the cross-core case (5 of 5, on-demand doc).
- Sidechain ACTIVE: SPRING REV, PLATE REV and DARK REV on T5-T7 FX2 accepted, no refusal; load while playing CPU
  80.4 %, T1-4 193/217 ‰, T5-8 417/418 ‰ (not compared with `6650236a` in the same session). Stock DARK REV on T7 FX2
  and SPRING REV on T3 FX2, the key window's slots, accepted.
- BBD on T5-T8 FX2: only T5 accepted, T6-T8 refused for DSP time ("NEEDS +11 %"), the same with Sidechain removed,
  so no effect of the bus. No module buffer takes those slots' block on this base anyway (no reviewed head proof), so
  there was no buffer for the window rule to refuse.
- Removal: masks `00 00`, every engine free, arena back to 4,304 / 4,432, the slot RELEASED with both disables.
- Analog BD, Output Matrix and Sidechain together: every engine placed (Output Matrix on core 0 only), arena 2,208 /
  3,011, masks `0f 0d`, three slots ACTIVE; Parts 1-4 twice while playing started no engine job and no loader packet.
  Analog BD's drum and Output Matrix's MATRIX routing as before (by ear). All three removed (Output Matrix only once
  OUT CFG was back on NORMAL, as designed): arena back, every engine free.
- Ten removals and reinstalls of Sidechain with T3 playing, a take after each: T3 and MAIN at their usual peaks every
  time, no silence after an enable. Sidechain ducking from its key checked by ear.
- Not run: a reader (none exists yet), a side-by-side on `6650236a` in the same session, the tap's chip-cycle cost,
  and a power cycle on a key bus base.
- Bench notes: a reinstalled COMPRESSOR comes back with KEY OFF and MON OFF, and the encoder steps are not linear, so
  check KEY and MON on a screenshot every time; an install or removal over USB stops the transport.

**Fixed after that run (code review of #750, 20 October 2026).** The MKII run above was on the pre-fix twin `c8ad288e`;
the base was regenerated with these fixes (`b3ac5155…`, `.bin` `f6488e90`) and re-checked on its own development twin
(below).

- **A reset let go before its ENABLE restarts from offset 0.** The board kept each core's reset progress until a
  DISABLE ACK, so a bus that stopped being wanted before its ENABLE (a reader removed mid-reset) resumed, or went
  straight to ENABLE, at the next want, although a slot buffer could have used the window meanwhile: the tap would
  then start from that buffer's seed and counter words and could break #640's phase rule. Now a core's progress is
  dropped as soon as the bus is no longer held there and its lane is idle; the next want begins with an offset-0 chunk,
  which the receiver takes as a fresh start (it clears its ready bit). Board test: a reader removed mid-reset, the
  window's words dirtied, a reader again (resets from offset 0 on both cores, never enabled over the dirty words).
- **Readers no longer admitted where no bus can come.** On a closed board (no valid trust rows, or a transport that did
  not start) or before its first tick, a reader is refused (`RUNTIME_CONFLICT`): nothing would hold the bus or charge
  its price. And a reader's admission always asks the engines' dry run (`mw_engines_admit(KEYBUS, ...)`, which says
  FITS when the bus is already placed), so a stuck bus engine refuses a second reader instead of admitting it.
- **A stale seed (second review, 21 October 2026).** A disable left the window's seed mark and counter as the tap last
  wrote them, and a later placement reset the bus first and reached the seed only at its 23rd chunk (with the bus's 512 words first); a reader that
  checks the mark (RINGMOD SC does) installed meanwhile on a track that already runs it took the dead bus for a live
  one and read frozen frames. Now the window comes first in the key bus's reset (dsp-sites.json, resident_dsp's ranges,
  in the same order: `dsp_sites.py --check` compares it), and after a run the board zeroes the seed with one offset-0
  chunk (KB_SCRUB) before it lets the window go. Board test mode 43.
- **The same class, third review (21 October 2026).** A reader checks its own core's seed but reads another core's keys
  from that core's half of the window, which only a full reset makes fresh (the scrub zeroes the seed alone); so a core
  now enables only once both cores' resets are complete (or the other core's bus is on), and an unknown core keeps both
  off. Enabling both within a frame or two of each other keeps the tap's phase rule and the 0/16/32 latency, and
  Sidechain still enables only after the bus on its core. And a reader arriving while the bus is being let go (a core
  disabling or scrubbing, or off with a live seed) is told to retry (`RUNTIME_BUSY`) rather than admitted to a stale
  mark. Board tests 43 (the window held, tick by tick, while a seed is live), 44 (a reader during the disable and the
  scrub), 45 (Sidechain arriving mid-scrub), 46 (one core's reset lagging) and the controller board's 14 (no scrub over a
  slot buffer). Fourth review: the enable gate counts the other core's bus as on only if that core is known (an
  uncertain DISABLE leaves its mask set but unknown); a seed that can never be scrubbed (its core unknown, its lane stuck
  or its owned channel closed) refuses readers for the boot (`RUNTIME_CONFLICT`) instead of retries that never succeed;
  an offset-0 reset chunk clears the dirty mark as a scrub does. Board tests 47 (an unknown core: no enable on the
  other, a reader refused) and 48 (a slot buffer over the window: no scrub, readers retry, then admitted). The base was
  regenerated for these and again after merging main's Quant Live Rec and its USB Audio layout variants (#756): `9591faad…`
  (`.bin` `70a9cedd`) and its six variants (base-binding.json); the MKII re-check below ran on
  the twin of `b3ac5155`, before them, and the next MKII session re-checks the new twin.
- **One ledger.** The board's key bus constants (its bit, reset total 1,026 and first range 514, what Sidechain
  implies, each feature's cores), the transport's reset totals and splits and the engines' feature index now come from
  `dsp_ledger.h` (generated from `dsp-sites.json`, so `dsp_sites.py --check` covers them).
- The contract for claims is now stated once: a reader needs no claim on a feature's words, and may declare reads wholly
  inside a feature it requires (RINGMOD SC does); the window refusal also holds while a core's bus mask is unknown.
- A reader is refused (`RUNTIME_FEATURE`) while the key bus cannot come up this boot (a core's state lost: its
  owned channel closed or a lane stuck), not only when that core's seed is dirty, so it is never admitted to
  pass its audio; a closed board refuses it as `RUNTIME_CONFLICT`. A reader already live when its core is lost
  fails the self-test (`SELFTEST_FEATURE`) and, when the loader has no refusal of its own to report, the self-test
  record's refusal reads `RUNTIME_FEATURE` (the loader's own comes first: the site retries `RUNTIME_BUSY` from it); the
  development view's key bus byte shows it (bit 7). Nothing reopens the core before a restart.
- ABI 9 beyond the loader: the site's module sets (`module-set.ts`), the publication builder (`module_packages.py`,
  entries with `requiresFeatures` and `dspClaims`), the private candidate reader and the MCP's prepared packages accept
  ABI 9.
- A module whose published package requires a base DSP feature is USB-only: card firmware has no base, so the
  configurator and the firmware session refuse card firmware with it (`cardBuildError` in `src/catalog/usb-only.ts`,
  derived from the published package's `requires`, not a manifest field, not listed per module and not checked
  against a pinned version) and the MCP shows `card: false`. While USB sync is beta-only, members without the beta
  interface cannot add it (`libraryCompatibility`'s `usb-only` block) and the MCP's public catalogue leaves it out.
  Its card rows stay, so native comparisons and the pair checks still cover the card build it would make.

**Re-check on the fixed twin (MKII, OS 1.40C, 20-21 October 2026).** The development twin of `b3ac5155` (identity
`2bf3c9ab…`, `.bin` `d4522c1a`), RAM-booted, with Sidechain's package relinked to it (`f509d094`); ears and capture by
the owner of the unit.

- Boot: arena 4,304 / 4,432, masks `00 00`.
- Sidechain installed: the masks, read in parallel with the install, `00 00` ×10, `08 08` ×8, `09 09` ×42, never `01`;
  key bus flags `00 00 01` (wanted, not priced: nothing charged for the tap with Sidechain alone); the key bus engine at
  4,203 / 4,331 and Sidechain's at 3,881 / 4,009, 423 words reserved a core, both resets complete (128 / 128 in the
  view's eighths), the slot ACTIVE.
- Key latency (20 USB channels, `keylag.py`; COMPRESSOR with KEY T3, T3's FX1 and FX2 NONE, the receivers' FX2 NONE):
  T5 (other core) 32 samples, T4 (same core, after T3) 0, T2 (same core, before T3) 16, correlation 1.0000 and every
  onset the same; three Sidechain removals and reinstalls: 32 every time.
- Final removal: masks `00 00`, arena 4,304 / 4,432, nothing reserved, the slot RELEASED after its disables.
- Not re-run on this twin (done on the pre-fix `c8ad288e` only): BBD and the stock reverbs in the window's slots, the
  three engines together, the ten reinstalls with no silence after an enable, a power cycle.
- Bench note: after a power cycle the project's Part came back with stock default effects (FILTER on FX1, DELAY on FX2),
  and T3's FILTER added a uniform 22-sample offset to every lag (54 / 22 / 38, correlation 0.978) until T3's effects
  were set to NONE. The key track's FX slots must be NONE for a latency measurement.

**Follow-up, not implemented: a gated tap.** Superseded as written: the layout below puts want words at
`+$3DF6..+$3DFD` of the window's slot, which E-Verb 0.1.2's and Mini Verb 0.2.3's rings now use (review, change 2); it
is kept for its reasoning. RINGMOD SC's own tap copied a track only while someone asked for it
(about 30 instructions per track per block idle). The contract for that, with every want word in the shared window so
any reader on either core can write it and nothing meets Sidechain's MON words ($7f0..$7ff); per core, base = $33e00
(tracks 5-8) or $3be00 (tracks 1-4):

| Words | Use |
| --- | --- |
| base-10..base-7 | local-bus want, one per local track (same-core readers write it) |
| base-6..base-3 | window want, one per local track (other-core readers write it) |
| base-2 | seed mark (unchanged) |
| base-1 | generation counter (unchanged) |

A reader writes 4 to the want word on every call; the tap takes 1 off each block and copies while it is above 0 (only
the low three bits count, so cold memory runs out within seven blocks). The window range grows from $202 to $20a words,
still past every stock FX2 tenant. Sidechain's `scdet` must then write the want word of its KEY track on every call (a
reviewed change to its pinned source, as #640's was), and reads stale bus words for one or two blocks after a KEY change
or a first enable. The fix for that is a short fade-in on a KEY change, as RINGMOD SC's ten-call wait (option i), also a
reviewed change.

## What it costs

- Base: the site catalogue and its generator, stubs for every catalogued site, hook slots and their base words, the
  generalised receiver op 10, the ledger in the manager, the init-record writer, the reference-counted key bus.
- Loader: ABI 9 parsing, admission, and the hook slot lifecycle in `resident_engines.c`'s place.
- Tools: `build.py --dsp-hook`, the register and `rep` audit, `modules:compat` reading the catalogue and the claims.
- Tests: host tests in the style of `test_resident_engines_board.py` (place, enable, refuse, remove, a stuck PLACE);
  the DSP interpreter run of the bus with two readers on both cores and enable offsets, as for #640's phase test.
- Hardware: the base requalified once; per module, install, removal and reinstall with the key latency the same each
  time, readers and keys on both cores, FX1 and FX2.

## Open questions for the owner

Answered by the owner's decision of 22 October 2026 (above), as read for his review: 1 B (merged as the key bus,
#737); 2 yes, structural rules plus the publication path; 3 exclusive sites (no chaining user yet); 4 yes (Phase 2);
5 yes, all three move (Phases 1 and 3).

1. Option A or B for Sidechain and RINGMOD SC?
2. Admission of hook packages by structural rules plus the publication path (section 5), instead of hashes pinned in the
   base?
3. Exclusive sites only for now, or chaining from the start?
4. Should ColdFire controller admission also move from pinned trust rows to declared lease entitlements, so Output
   Matrix's ColdFire changes stop needing a base rebuild too? Separate design if yes.
5. Migrate Sidechain, Output Matrix and Analog BD's resident engines onto hook packages later, or keep them resident?

## Owner-approved integration, 21 October 2026

The key bus is integrated with whole-set transactions and every published USB Audio layout. The owner waived the named final-build hardware, chip-timing and reboot gaps in chat. `sdk/machines/octatrack/evidence/keybus-owner-approval-20261021.json` binds the exact base, variants and source inventory; the module-set record beside it names its separate lifecycle gaps. The final source-built packages pass native/browser equality and stock-free scans for every layout. Synthetic ABI 9 reader transactions retain feature refusal and complete rollback. Historical unit results above keep their original build identities; there is no physical qualification of this combined base or an actual reader.
