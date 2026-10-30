# Source-bound Octatrack USB reconstruction

When independently authored ColdFire output coincides with stock bytes, first
establish provenance and inspect every match. A guarded stock copy can preserve
the authored runtime while avoiding shipping those literal spans. It is not a
scanner exemption or evidence that publication is approved.

The normal `scripts/octatrack-module-packages.py` host wrapper accepts
`reconstruction: true` on an ordinary `octabam: true` package entry. The module
provides `runtime-reconstruction.json` beside its native sources. This route
uses the existing SDK recipe validator and encoder; it changes neither the
base's pinned SDK inputs nor the reviewed standalone-port list. DSP, tables,
pinned groups and alternate build modes cannot use it.

The declaration has exactly these fields:

- `schema: 1`, `imageSha256` for the original compiled image, and
  `packageSha256` for the complete, tested reconstructed package.
- `moduleSources`: SHA-256 hashes of all native source files, `manifest.py` and
  `runtime.json`, with paths relative to the module folder. Media, evidence and
  presentation folders are excluded; source symlinks are refused.
- `sharedSources`: hashes of the seven SDK inputs listed in `SHARED` in
  `scripts/octatrack-reconstruction.py`.
- `copies`: existing stock-recipe records, including destination, length,
  guarded source address/hash and authored file, line, symbol and method
  provenance. Authored file paths must name this module's native inputs.
- `fills: []`; this route admits no initializer fills.

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
