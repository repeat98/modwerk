# Proposal: the `zdl` module contract (Zoom MultiStomp effects)

Status: **proposal for owner review.** Nothing here is enforced yet; the
contract code, the module folder and the first modules follow once the open
questions at the end are answered. Background:
[ZOOM_MULTISTOMP.md](ZOOM_MULTISTOMP.md).

Goal: list the first Zoom effects on Modwerk safely and documented. They
install through Zoom Effect Manager for now; a browser install comes later
([Installing on stock firmware](ZOOM_MULTISTOMP.md#installing-on-stock-firmware)).

## What a module is

One effect: a `.ZDL` file (Zoom's header around a TI C674x ELF) that the
stock firmware loads like its own effects. The same file runs on every pedal
of the ZDL family, so one module serves the family, with compatibility
recorded per pedal. NAM captures and cabs (built in the browser from
templates) are a later step and not part of this contract.

## Two things to settle first

**1. Stock code inside the built effects.** The project's linker builds each
effect's knob handlers from a stock Zoom effect's handler code and splices in
a divide routine taken from a stock effect: a few hundred bytes in every
effect built so far, Matujuice's included. Modwerk does not ship extracted
stock code. So before any listing, the project replaces them with handlers of
its own, written from its documented calling convention, tested on the pedal,
and every listed effect is rebuilt with them. Work item in
[ZoomMultistompZDL's TODO](https://github.com/themanro/ZoomMultistompZDL/blob/main/TODO.md).

**2. Where the binary comes from.** Modwerk never commits built images. Two
ways, owner's choice:

- **(A) Modwerk builds it** from the pinned source in CI with TI's compiler
  (C6000 CGT 8.5.0, a free download from TI) and the project's linker, and
  checks that the result equals the author's release file byte for byte. This
  matches how Modwerk treats other modules. After step 1 the build needs no
  stock files. Open point: whether TI's licence allows fetching the compiler
  in CI.
- **(B) The author's GitHub release file**, pinned by SHA-256. The browser
  fetches it from GitHub and checks the hash; Modwerk stores nothing. Simpler,
  but Modwerk then lists a binary it did not build.

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

The `platform` section, `kind: "zdl"`:

| Field | Content | Checked |
| --- | --- | --- |
| `file` | The file name on the pedal, 8.3 (`LOOP.ZDL`) | 8 characters before the dot; unique across modules and stock effects |
| `effectId` | `gid` (category) and `fxid` | Unique across modules and Zoom's stock effects; inside the author's range |
| `effectVersion` | The version in the ZDL header (`1.00`) | Matches the binary |
| `dspCost` | The cost the pedal adds up per patch, in its percent units | Within the patch budget; measured, not guessed |
| `binary` | `sha256`, `bytes`, and `build` (A) or `release` (B: repository, tag, asset) | Size within the proven limit (32,126 bytes on the MS-70CDR 2.10); hash matches |
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
  "binary": { "sha256": "…", "bytes": 30738, "build": "source" },
  "screen": "live",
  "pedals": [
    { "machine": "zoom-ms-70cdr", "firmware": "2.10", "status": "confirmed", "report": "evidence/ms70cdr-2.10.md" },
    { "machine": "zoom-ms-50g", "firmware": "3.10", "status": "untested", "report": null }
  ]
}
```

## Effect IDs

An effect ID must be unique on a pedal: two effects with the same ID make one
of them unreachable. Modwerk keeps a ledger of author ranges, as Stomphacks
does for the ZD2 pedals, plus the IDs of Zoom's stock effects (metadata only,
no stock files). ZoomMultistompZDL already reserves 403-499 for its effects,
500-699 for NAM slots, 700-899 for cab slots and 900-957 for templates; other
authors ask for a range in a pull request. One clash is already known
(Matujuice Sweep and stock ANA234Cho, both 496); its author will move it.

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

For now: download the `.ZDL` and add it to the pedal with Zoom Effect Manager
2.3.3 or later, with a step-by-step guide and the recovery steps (remove the
effect in Effect Manager; for a boot freeze, All Initialize, then remove it).
The browser install is planned separately: from the user's own Zoom updater,
or as a per-effect install over the pedal's own file commands, which write
single files (tested on the MS-70CDR 2.10 with a test file, replacement of an installed effect, and adding/removing a new effect) ([Installing on stock firmware](ZOOM_MULTISTOMP.md#installing-on-stock-firmware)).

## Machine profiles

Each Zoom profile gains an `sdk` section with platform `zdl`, the module
folder, the guide and its budgets (patch DSP, slots, file size). A pedal moves
to `preview` when its first module validates, as other machines do.

## First modules

A short first set of effects already tested on the MS-70CDR 2.10, for
example Loop, Scope and Spectrum and one audio effect, each rebuilt with the
project's own handlers and retested before submission. Matujuice's effects are
his to submit.

## Open questions for the owner

1. Binary from a Modwerk build (A) or a pinned release file (B)?
2. One module for the whole family with per-pedal status, as proposed, or one
   per pedal?
3. The exception to the Octatrack interface: stock firmware has no RAM load,
   trial, Keep or Undo, so a guided Effect Manager install is the install
   path. Agreed?
4. Who holds the effect-ID ledger: Modwerk, or the project with Modwerk
   checking it?
