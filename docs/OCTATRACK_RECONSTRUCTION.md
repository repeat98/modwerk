# Source-bound Octatrack USB reconstruction

When independently authored ColdFire output coincides with stock bytes, first
establish provenance and inspect every match. A guarded stock copy can preserve
the authored runtime while avoiding shipping those literal spans. It is not a
scanner exemption or evidence that publication is approved.

The normal `scripts/octatrack-module-packages.py` host wrapper accepts
`reconstruction: true` on an ordinary `octabam: true` package entry. Its recipe
lives in the SDK's
`sdk/machines/octatrack/module-adapters/reconstruction-recipes.json`, keyed by
module id under `modules` in a schema-1 document. This route uses the existing
recipe validator and encoder, without changing standalone-port admission. DSP,
tables,
pinned groups and alternate build modes cannot use it.

The declaration has exactly these fields:

- `schema: 1`, `imageSha256` for the original compiled image, and
  `packageSha256` for the complete, tested reconstructed package.
- `moduleSources`: SHA-256 hashes of the explicitly reviewed build and authored
  provenance inputs, including assembly, `manifest.py` and applicable
  `runtime.json`/C/header inputs, relative to the module folder. Tests and
  diagnostic probes are not build inputs. Traversal and source symlinks are refused.
- `sharedSources`: hashes of the seven SDK inputs listed in `SHARED` in
  `scripts/octatrack-reconstruction.py`.
- `copies`: existing stock-recipe records, including destination, length,
  guarded source address/hash and authored file, line, symbol and method
  provenance. Authored file paths must name this module's native inputs.
- `fills: []`; this route admits no initializer fills.

Shared-source changes refresh the affected SDK recipes in the same SDK/base PR,
without editing module folders. Never refresh pins alone: rebuild and compare
the exact image/package, rerun stock guards/scans and negative checks. Changed
output needs a new reviewed recipe and qualification for the changed package.
Module build/provenance edits still invalidate their pins, even if instructions
stay identical; test-only edits do not. Host regressions cover these cases and
check committed shared pins, including pending draft recipes, so SDK changes
cannot leave this registry stale unnoticed.

Each source must satisfy the machine's patchable OS bounds and avoid base-owned
sites. Existing recipe checks reject overlaps, relocation collisions, changed
images and invalid provenance. The normal final-package stock scans still run.
With `--stock`, the builder additionally verifies each source against private
firmware; firmware-free builds retain the guards for native install validation.
Never commit firmware, packages or extracted spans.

Run the normal build and `--check` with private stock and the pinned toolchain.
Require exact agreement with the tested package, exercise malformed inputs
through the native loader, and verify source availability on every claimed base
and companion composition. Card integration and exact-build physical
qualification remain separate requirements. A declaration in `sdk/drafts/`
does not add the module to the catalogue or grant release admission.

## USB-only distribution

An assembly-backed module whose callbacks need the Modwerk base can explicitly
set `usbOnly: true` on its USB package entry. This uses the same library and
card-download refusal path as C source runtimes. The card compiler and source
importer exclude that module from their native inventory and compiled-version
list; USB build, preflight and install still use its ordinary package route.
Omitting the flag or setting it to false retains the existing card scope.

Document this distribution limit in the module's README and manifest. A private
fixture can verify the refusal and USB path before publication. USB-only scope
does not qualify the physical runtime or grant first-release approval, and it
does not claim a working card form. Card support needs its own integration and
qualification later.
