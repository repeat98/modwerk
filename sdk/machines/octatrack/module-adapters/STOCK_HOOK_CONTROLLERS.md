# Stock-hook controllers: Sidechain Compressor and Output Matrix

`stock_hook_controllers.py` derives each controller from its exact imported
source (pins refuse drift) and encodes it as one stock-site package per base:

```sh
python3 -B sdk/machines/octatrack/module-adapters/stock_hook_controllers.py \
  --base-symbols EMPTY_ROW_BASE/symbols.json --upstream PINNED_ELEKLOADER --out NEW_PRIVATE_DIR
build_core.py ... --resident-stock-hooks --controller-policies NEW_PRIVATE_DIR/controller-policies.json \
  --controller-layout EMPTY_ROW_BASE/symbols.json
```

A package names the base's strong lease entries by absolute address, so it
belongs to one base link. The trust rows (encoded package and source-policy
SHA-256, module id, revisions, feature, cores, entry and Begin/End return
offsets) go into the fixed-capacity table of `controller_write_policy.c`;
build_core refuses a rebuilt base whose symbols moved. Without rows (the
default) every package is ordinary and nothing activates.

Leased entries: Sidechain `sc_norm` (frame interrupt); Output Matrix
`page_levels` (frame interrupt), `matrix_leave` and `matrix_enter` (the
AUDIO page). The wrappers use caller-stack opaque storage and save all input
registers; after Begin they restore only CCR, keeping the backend's level-4
lock across the authored writes; refused Begin replays only the displaced
stock instruction (or, for a mode switch, changes nothing); failed End exits
without replay or notification. No stock call, wait, redraw or notification
runs in a held span.

Output Matrix mode switch: NORMAL <-> STUDIO stores as authored, with no
lease. A switch into or out of MATRIX runs the authored whole-bank conversion
unchanged under one lease (executed instructions in the native fixture: at
most 38,632 held); CC 51 notifications and the redraw run after End. Stock
boot parses the project and checks the CS1 settings before any package is
installed, so resident bases own those widenings (`resident-runtime/cue_cfg.s`:
CUE CFG 0..2 kept, three sites) and the package leaves them out; MATRIX then
survives a power cycle and `matrix_enter` is trusted by default. Retirement
refuses while MATRIX is selected (live or CS1 mirror): leave it on the AUDIO
page first. Six authored Matrix spans equal stock code byte for byte; they
ship as zeros plus hash-checked ABI 7 stock copies from bytes nobody patches.

Sidechain answers the base's raised `ev_mute_keep` (order 50, `sc_mute_keep`,
Mute Modes' native SC_KEY scan) when the base it is encoded for raises it.
COMPRESSOR's page-2 KEY/KFLT/KGN/MON: the image begins with an MWPP record,
the catalogue's in-place descriptor recipe (descriptor-recipes.json: stock
descriptor and its SHA-256, integer and text patches, pointers to the
package's own formatters, and inherits that keep the stock enable nibbles of
the recipe's `inheritedEnable` slots, as the browser's descriptor clone does;
a board older than inherits refuses the record and runs without the page). The board applies it in place while the controller
is ACTIVE, only over the exact stock bytes, and writes the saved bytes back
before it disables the hooks; a page that changed meanwhile quarantines.

`controller-policy/controller_board.c` is the board side: providers for
`controller_transport.c`, the tick that activates a live trusted controller
(reserve, bind its owner generation, zero-reset its DSP state, enable its
dormant hooks, publish), and metadata admission that disables the hooks
before any removal or replacement unpublishes the sites. See its header.

Run source-only SDK tests normally. Run actual emulator evidence locally with
the owner's exact original MAIN and built native Octabam archives:

```sh
lockf -k /tmp/modwerk-check.lock python3 -B \
  sdk/machines/octatrack/module-adapters/probe_stock_hook_controllers.py \
  --main PRIVATE_ORIGINAL_MAIN --native PRIVATE_NATIVE_OCTABAM --out NEW_PRIVATE_DIR
```

The tool refuses changed imported sources, firmware identity, non-private or
Git output directories and nonempty outputs. It compares fresh native links at
two origins to relocation replay, then executes original and scoped controllers
against independent memory/register/stack oracles. Outputs and logs are private;
never commit them or use firmware in CI. The receipt records exact authored,
compiler-input and native-archive hashes. The scoped fixture runs the leased
derivatives with synthetic Begin/End events, not the board's lease.

Executed instructions are distinct from modeled cycles and physical timing.
See `docs/OCTATRACK_HARDWARE_TRAPS.md`: work masking level 5 or above must remain
well under 200 microseconds. Native loops and a clean instruction budget do not
prove backend overhead, physical timing, DSP/audio headroom, complete-base fit,
Part persistence or reboot behavior. Public admission remains closed.
