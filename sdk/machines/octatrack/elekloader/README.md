# Private Elekloader base source recipe

The firmware builder runs locally in TypeScript in a browser Web Worker.
[`machine-build.ts`](../../../../src/engine/elekloader/machine-build.ts) delegates
stock identification, linking, patching, resource checks, packing and output
verification to the unchanged Elekloader kit. Every machine extends that kit
with its profile, core and linkable packages. Browser users need no Python,
native compiler, local helper server or remote firmware build service.

`build_core.py` is developer-side package preparation and an independent
reference. It compiles original source into a format-2 `.elemod` with the
kit-pinned upstream SDK. It uses Elekloader's native linker to produce a
private comparison image; it never invokes the Octabam composer. The resulting
package must also pass the shared TypeScript kit's private verifier.

The prototype extends upstream core 0.3 with Modwerk's existing logger and
authored startup artwork. It preserves the logger's 8 KiB retained region
through the bootstrap's BSS clear, keeps its 512-byte I/O buffer on the
uncached alias and records a core-only configuration identity. Stock function
replays use guarded format-2 stock references recovered locally from the
owner's original firmware. Generated stock-bearing recipes, packages, maps,
images and proofs stay outside Git.

The bounded upload controller is compiled into the prototype but has no USB
adapter, lifecycle backend or module executor connected. This prototype is
**not a flash candidate**. Native linking and Python/TypeScript byte parity
do not establish safe boot, logger retention, cache handling or hardware
behaviour. The current identity describes only the base; arbitrary module
selections still need exact identity integration before public use.

Use Node 24, the reviewed GNU `m68k-elf` toolchain, a clean Elekloader checkout
at `vendor/elekloader/kit/kit.json`'s commit and your original OT OS 1.40C.
Both output directories below must be new and outside every Git checkout:

```sh
python3 -B sdk/machines/octatrack/elekloader/test_recipe.py
python3 -B sdk/machines/octatrack/elekloader/build_core.py \
  --stock /private/OCTATRACK_OS1.40C.bin \
  --upstream /private/pinned-elekloader \
  --output /private/NEW-core-output
npm run octatrack:elekloader:verify -- \
  /private/OCTATRACK_OS1.40C.bin /private/NEW-ts-proof \
  /private/pinned-elekloader \
  /private/NEW-core-output/package/core-0.3.1-modwerk-dev.1.elemod
```

The source recipe is GPL-3.0-or-later. The pinned upstream core assembly is
GPL-2.0-or-later; it is copied only into the private generated source, with
its existing notices preserved. See the repository licence inventory for
the imported source and tooling.
