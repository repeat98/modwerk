# The `zdl` module contract (Zoom MultiStomp effects)

Status: **in force for the MS-70CDR** (9 November 2026): module contract v3
with `platform.kind: "zdl"` (`src/catalog/module-contract-v3.ts`), the
MS-70CDR's `sdk` section, `npm run zdl:vendor`, `module:doctor` and the
library's effect pages. The machine moves to preview with its first module.
Background: [ZOOM_MULTISTOMP.md](ZOOM_MULTISTOMP.md).

Goal: list the first Zoom effects on Modwerk safely and documented. On Zoom's
firmware they install over USB with the pedal's own file commands; with
MIDISTOMP as the base they become modules like the Octatrack's
([the base](ZOOM_MULTISTOMP.md#the-base-midistomp)).

## What a module is

One effect: a `.ZDL` file (Zoom's header around a TI C674x ELF) that the
stock firmware loads like its own effects. The same file runs on every pedal
of the ZDL family, so one module serves the family, with compatibility
recorded per pedal. NAM captures and cabs (built in the browser from
templates) are a later step and not part of this contract.

## Settled first

**1. No Zoom code in a listed effect.** ZoomMultistompZDL's linker used to
build each effect's knob handlers and `Dll_` from stock Zoom effects' code and
splice in a divide routine from a stock effect. With `own_runtime`
(`LinkerConfig(own_runtime=True)` or `ZDL_OWN_RUNTIME=1`; branch `own-runtime`
of the project, to be released from repeat98/ZoomMultistompZDL) it links
Leemuzhko's runtime instead, vendored here in
[`vendor/zoom-zdl-runtime/`](../vendor/zoom-zdl-runtime/) (MIT; its three
call helpers equal TI's RTS source, BSD-3-Clause), generates the ABI
attributes, and leaves out the divide. `build/check_no_stock.py` there finds no
16-byte run of the stock blobs in Loop, Scope, Spectrum and Scorch built so;
Loop ran on the owner's MS-70CDR (MIDISTOMP V2.0.1, 9 November 2026). Still
open: an effect that divides floats needs `__c6xabi_divf` built from TI's RTS
source (`lib/src/divf.c`), and loading saved knob values at boot
(`materialize_init`) is untested with the runtime, so first releases build with
it off.

**2. Where the binary comes from** (owner, 9 November 2026): the author's
GitHub release file, pinned in the manifest (`platform.binary`).
`npm run zdl:vendor -- <id> --checker <ZoomMultistompZDL checkout> --stock-dir
<stock blobs>` downloads it, checks its hash and keeps it in
`public/zoom-effects/<id>/<version>/` only if `check_no_stock.py` passes;
Modwerk serves it from there, since the site's security policy allows no
other origin. Modwerk hosts no Zoom code.

## The folder

`sdk/zoom/modules/<id>/`, as for other machines: `modwerk.module.json`,
`README.md`, `TESTING.md`, `LICENSE`, `media/` (an original thumbnail and real
photos or captures of the pedal screen) and `evidence/` (text reports). No
`.ZDL` file in the folder.

## `modwerk.module.json`

The shared v3 core stays as it is (identity, author and maintainers, source
pin, presentation, access, controls, compatibility, resources, evidence,
tests, licence, media). Zoom-specific meanings:

- `machine`: the pedal the module was developed and tested on (for example
  `zoom-ms-70cdr`); other pedals go in `platform.pedals`.
- `compatibility.releases`: firmware versions from that machine's profile.
- `access`: where it appears (the effect's category in the pedal's effect
  list) and how to reach its knob pages.
- `controls`: every knob, with its default and range, in pedal page order.
  At most nine: a tenth leaks into the next effect's state. A patch stores
  K1-K9 in 12/11/11/8/8/8/8/9/8 bits, so each knob's range fits its width.
  Names and shown values are at most five characters (the runtime author's
  findings; the widths are the MS-50G and MS-70CDR patch format).

The `platform` section, `kind: "zdl"`:

| Field | Content | Checked |
| --- | --- | --- |
| `file` | The file name on the pedal, 8.3 (`LOOP.ZDL`) | 8 characters before the dot; unique across modules and stock effects |
| `effectId` | `gid` (category) and `fxid` | Unique across modules and Zoom's stock effects; inside the author's range |
| `effectVersion` | The version in the ZDL header (`1.00`) | Matches the binary |
| `dspCost` | The cost the pedal adds up per patch, in its percent units | Within the patch budget; measured, not guessed |
| `binary` | `sha256`, `bytes` and `release` (repository, tag, asset) | Size within the proven limit (32,126 bytes on the MS-70CDR 2.10); the vendored file matches the hash and its header the effect ID and version |
| `screen` | `static` (a cover picture) or `live` (draws its own screen) | `live` lists the firmware it draws on; elsewhere it falls back to `static` |
| `pedals` | Per pedal: `machine`, `firmware`, `status` (`confirmed`, `reported`, `untested`) and the evidence report | `confirmed` needs an author-hardware report for that pedal and firmware |

Example (shape only):

```json
"platform": {
  "kind": "zdl",
  "file": "LOOP.ZDL",
  "effectId": { "gid": 8, "fxid": 467 },
  "effectVersion": "0.02",
  "dspCost": 8,
  "binary": { "sha256": "…", "bytes": 26546, "release": { "repository": "https://github.com/repeat98/ZoomMultistompZDL", "tag": "…", "asset": "Loop.ZDL" } },
  "screen": "live",
  "pedals": [
    { "machine": "zoom-ms-70cdr", "firmware": "2.10", "status": "confirmed", "report": "evidence/ms70cdr-2.10.md" },
    { "machine": "zoom-ms-50g", "firmware": "3.10", "status": "untested", "report": null }
  ]
}
```

## Effect IDs

An effect is identified by its group and ID together: Zoom's own effects reuse
IDs across groups (DELAY, COMP, LINESEL and TREMOLO are all 8), so Matujuice
Sweep (Delay 496) and stock ANA234Cho (Modulation 496) don't clash. Two effects
with the same group and ID on one pedal do: one becomes unreachable, and
swapping one for the other froze an MS-70CDR at boot until its ROM was
reprogrammed (Spool.ZDL and TEcho4.ZDL, both Delay 409; they are now 914 and
946). A pedal can't say what it had before, so the pedal page refuses that
known clash (`CLASHING_EFFECT_IDS` in `zoom-protocol.ts`).

Collections can't be kept apart by asking every author to move, so the pedal
page settles a clash on the pedal it happens on. An added effect may use Delay
403-1023 (a patch stores 10 bits of ID). **Delay 958-1023 are local IDs**: no
collection ships there. When another effect on the pedal already has a new
effect's ID, the page moves the new one to a free local ID before writing it:
the ID is only in the file header (group at 0x3C and 0x43, ID at 0x40-0x41,
no checksum), so nothing is rebuilt. An MS-70CDR 2.10 ran Scorch moved to 917,
1000 and 1023, and stored and recalled a patch with two of them through a power
cycle (2 November 2026). The same file name gets the same local ID where there
is room, so patches move between pedals; an update of a moved effect keeps its
local ID; and the browser remembers the local IDs it gave out and never gives
one to another effect, so a patch stored with a removed effect doesn't find a
different one on its ID (only in that browser). Patches made on another pedal
with a moved effect may not find it.

Modwerk keeps a ledger of author ranges, as Stomphacks does for the ZD2
pedals, plus the IDs of Zoom's stock effects (metadata only, no stock files),
to keep moves rare. ZoomMultistompZDL reserves Delay 403-499 for its effects,
500-699 for NAM slots, 700-899 for cab slots and 900-957 for templates;
Matujuice ships Delay 480, 481, 485-497 (GRDLOOP, MIDISTOMP 2.0's looper, is
497), 501 and 502. Other authors ask for a range in a pull request.

## Combinations

The configurator checks what the pedal checks, before download: the summed
DSP cost of a patch (refused between 224.4 and 228.4 on the MS-70CDR 2.10,
measured; MIDISTOMP 2.0 raises it), six effect slots, unique file names and
effect IDs. No module depends on another, as everywhere in Modwerk.

## Evidence

The v3 tiers apply per pedal: `author-hardware` for the pedal and firmware
the author tested, `reported` for user reports linked by issue, emulator
results (the project's Ziddle checks) never counted as hardware. A module is
listed for a pedal only with hardware evidence for that pedal.

## Install

On Zoom's firmware, over USB from the browser in normal mode (the pedal page,
#989): the pedal's own file commands write the effect file and add it to the
effect list (the list from before is offered for saving), every write is read
back, then the pedal is power-cycled; removing is the reverse. Tested on the
MS-70CDR 2.10 with a test file, replacing an installed effect, and adding and
removing a new one, also from the pedal page. Recovery: remove the effect again;
for a boot freeze, All Initialize, then remove it. Zoom Effect Manager 2.3.3 or
later stays a fallback. Listed effects go in a module set, as on every
machine: Add to set in the library; the pedal page lists your sets beside its
own pages (`HubSets.tsx`, shared with the Octatrack's), and Sync on a set brings the
pedal to it (`zoomSyncPlan` in `src/devices/zoom-effects.ts`): it installs
the set's effects that are missing or another version and removes listed
effects the set dropped, from a fresh read of the pedal. It tells them apart
by file name and header group and ID (the listed ID, or the local ID this
browser gave that name): Zoom's own effects are never touched, nor files
installed by hand unless one has a listed effect's file name and ID, and
nothing is written before the list is confirmed.

## Machine profiles

Each Zoom profile gains an `sdk` section with platform `zdl`, the module
folder, the guide and its budgets (patch DSP, slots, file size). A pedal moves
to `preview` when its first module validates, as other machines do.

## First modules

A short first set of effects already tested on the MS-70CDR 2.10, for
example Loop, Scope and Spectrum and one audio effect, each rebuilt with the
vendored runtime and retested before submission. Matujuice's effects are
his to submit.

## Open questions for the owner

1. ~~Binary from a Modwerk build or a pinned release file?~~ Answered (owner,
   9 November 2026): the pinned release file, vendored only without Zoom code
   ([above](#settled-first)).
2. One module for the whole family with per-pedal status (as built:
   `sdk/zoom/modules/`, `machine` is the pedal it is developed on, `pedals`
   the rest), or one per pedal?
3. ~~The exception to the Octatrack interface.~~ Answered (owner, 27 October
   2026): no exception. MIDISTOMP becomes the base and the effects its modules;
   Zoom's firmware with effect files is the route without a base, like the
   Octatrack's card build.
4. Who holds the effect-ID ledger: Modwerk, or the project with Modwerk
   checking it?
