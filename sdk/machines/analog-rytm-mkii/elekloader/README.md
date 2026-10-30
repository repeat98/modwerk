# Analog Rytm MKII base

Modwerk's own base for the Analog Rytm MKII on OS 1.74 ([recipe](../../../../docs/MACHINE_RECIPE.md)). Today it is the
source of elekloader's core-ar2 0.7, copied unchanged: `core-ar2/` (its `mod.json` and seven sources) and `core/` (the
Digitakt mk1 core's `core.s`, `settings.s` and `render.s`, which `mod.json` builds with the Rytm's addresses). Their
provenance and hashes are in
[sdk/imports/core-ar2-source-fb58292.json](../../../imports/core-ar2-source-fb58292.json). They are
GPL-2.0-or-later, by irpina and Iced-Cream, and keep their SPDX lines.

Modwerk's own sources sit beside them in `base/`, and `base.json`'s `add` merges them into the imported recipe when the
build stages it, so the imported files stay exact: the FX track's lock words (`locks.c`, `locks.s`) and the send bus
(`sendbus.c`, `sendbus.s`, `fx-tables.h`; [send effects](../README.md#send-effects)). A site `add` names gives the stock
bytes it replaces by length and SHA-256 only; the build fills them from your OS. The USB stack comes next.

Until the site moves to this base (studied on [#878](https://github.com/repeat98/modwerk/pull/878)), it builds with
irpina's released `core-ar2-0.7.elemod`. The full OS file sent with Transfer stays the fallback afterwards.

## Build it

`base.json` names the core folder, the SDK headers (`../include`, the same bytes as elekloader's), the OS and the
reviewed toolchain. The SDK is the kit-pinned Elekloader checkout. The build needs your own original
`Analog-Rytm_MKII_OS1.74.syx`, which stays outside the repository:

```sh
npm run upstream:tools
npm run machine:base -- analog-rytm-mkii --stock /private/Analog-Rytm_MKII_OS1.74.syx
```

It builds in a temporary folder outside Git, so neither this checkout nor the upstream one changes. It then checks two
things:

- **Against the release it started from:** every source, site, export, import and table it has (`reference.keeps`), with Modwerk's additions on top.
- **Against [base-binding.json](../base-binding.json):** the SHA-256 of the package.

`--out NEW-DIR` (outside Git) keeps the `.elemod`. `--write` records a new identity: use it only for a deliberate
change, and say why in the pull request.

It needs m68k-elf GCC 16.2.0 and binutils 2.47, as in `sdk/build/Dockerfile`. Homebrew's `m68k-elf-gcc` and the
toolchain image give the same bytes. Build the image once, as the
[Octatrack base guide](../../octatrack/elekloader/README.md#the-base-in-the-browser) says. Then mount the stock file's
folder and the upstream checkouts at paths of their own:

```sh
docker run --rm --user "$(id -u):$(id -g)" -e HOME=/tmp -v "$PWD:$PWD" -w "$PWD" \
  -v ~/.cache/modwerk-upstream:/upstream:ro -v /private/rytm-os:/stock:ro modwerk-toolchain:local \
  python3 -B scripts/machine-base.py analog-rytm-mkii --stock /stock/Analog-Rytm_MKII_OS1.74.syx --upstream /upstream/elekloader
```

## What the build shows

| Compiler | `.run` bytes | Relocations | Same as the release |
|---|---|---|---|
| irpina's release `core-ar2-0.7.elemod` | 10,692 | 103 | — |
| m68k-elf GCC 16.2.0, binutils 2.47 (reviewed; this base) | 10,348 | 102 | sources, sites, interface |
| Debian 12 m68k-linux-gnu GCC 12.2.0 | 10,248 | 94 | sources, sites, interface |
| Ubuntu 24.04 m68k-linux-gnu GCC 13.3.0 | 10,320 | 94 | sources, sites, interface |
| Debian 13 m68k-linux-gnu GCC 14.2.0 | 10,168 | 93 | sources, sites, interface |

The release records its sources but not its compiler, and none of these reproduces its compiled code byte for byte.
The 22 functions that change size are all compiled C: 21 from `store.c`, 1 from `machines.c`. The sites, the
exports, the imports and the tables are the same. This base is therefore identified by its own hash, built with the reviewed toolchain. With
the lock words and the send bus it ran on a unit in test build MB02, as the author reported (29 October 2026).

The kit-pinned SDK (3b31ef3) and the SDK at the release's commit (fb58292) give the same package from these sources
and headers.
