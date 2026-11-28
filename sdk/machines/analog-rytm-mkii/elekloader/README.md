# Analog Rytm MKII base

Modwerk's own base for the Analog Rytm MKII on OS 1.74 ([recipe](../../../../docs/MACHINE_RECIPE.md)). Its core is
Modwerk's own (GPL-2.0-or-later, 28 November 2026): `core-ar2/` (`mod.json`, `store.c` and `store.s` for mod
storage, `route.s` for the velocity routes' field bytes, `pages.s` for pages and page-key lists, `machines.c`, `load.s`
and `finish.s`) and the headers in [`../include/analog-rytm-mk2/`](../include/analog-rytm-mk2/). It keeps the folder
name and the interface of elekloader's core-ar2 0.7, which the build checks it against (`reference.keeps`): id `core`
0.7, every site, export, import and table, and the saved-data format, so modules and saved projects move between the
two. The core's stock addresses are `mod.json`'s defsyms (assembly) and `base.json`'s `common.cflags` (C), so the MKI
builds the same sources with its own. `core-ar2/test_store.c` pins the saved-data format on the host
(`sdk/tests/test_machine_base.py`). `core/` (`core.s`, `settings.s`, `render.s`) is Modwerk's own hook bus
(GPL-2.0-or-later), the same `core.s` and `settings.s` as the Digitakt II's. The bus does not save EMAC around
`ev_render_in` and `ev_render_out` handlers: a handler that uses it saves its own.

Modwerk's base sources sit beside them in `base/`, and `base.json`'s `common` and `add` merge them into the core's
recipe when the build stages it. `common` goes into every variant: the machine list's
sections (`sections.c`; [machine list sections](../README.md#machine-list-sections)) and the amp envelope's record
(`amp.s`; [amp envelope record](../README.md#amp-envelope-record)). `add` holds the FX track's lock
words (`locks.c`, `locks.s`) and the send bus (`sendbus.c`, `sendbus.s`, `fx-tables.h`;
[send effects](../README.md#send-effects)). A site names the stock bytes it replaces by length and SHA-256 only; the
build fills them from your OS. `dev` goes only into development bases (`npm run machine:base -- analog-rytm-mkii --dev`,
never recorded or released): the USB link (`link.c`, `link.s`; [LINK.md](../LINK.md)).

The base comes in three variants (`base.json`'s `variants`): **send-bus**, the default, with `common` and everything `add`
names; **voices**, `common` and `add` without what the variant's `leave` names (the FX track's lock words `locks.c`,
`locks.s` and their three `core_lk_*` sites, the send bus's sources `clock.c`, `sendbus.c`, `sendbus.s`, its sites,
subscriptions, pages and storage, all `mw_send_*`, and the FX list `mw_fx`), so it keeps the digital voices alone. Only the
send bus writes the lock words, so on voices a pattern's send-FX locks are not kept: one saved with them on send-bus plays
without them, and stock's next save of all its locks frees their lanes. Word 0 keeps marking those controls locked, so
back on send-bus such a step plays the kit's stored words 38-41 for them (and shows 127), as after a trip through plain;
and **plain**, the core's recipe with `common` alone. The site builds a set
with a send effect on send-bus, one with a digital voice machine and no send effect on voices, and any other set on
plain, so each pays only for what it uses (below). A `leave` entry is a shell pattern over a source or cflag itself, a
site's `addr` or `target`, a subscription's `fn`, a contribution's symbols, a storage field's `sym`, or a `defsym` or
collection name; one that matches nothing in `add` fails the build. Put a hook in `common` when a module that is no
send effect needs it, or that module would not link on plain; a voice machine uses none of the send bus's code
(`npm run modules:check` refuses `mw_send_*`, `mw_fx_clock` and its helpers there), or it would not link on voices. The full OS file sent with Transfer stays the fallback.

## Beside elekloader's core-ar2

This base is Modwerk's, not elekloader's core-ar2, and its core work happens here
([contributing](../../../../CONTRIBUTING.md#contributions-stay-here)). It keeps core-ar2 0.7's interface:

- **No core-ar2 0.8 or later.** core-ar2 0.8 (elekloader v0.9.0) jumps from the same two lock sites the lock words
  use, `0x40008f98` (row load) and `0x40009216` (lock rebuild). This base cannot take it, an elekloader mod that needs
  0.8 or later does not run on it, and a mod that uses the send bus does not run on core-ar2.
- **Projects moved between the two.** The lock words are saved as FX-track lanes 64-71 (`0x40`-`0x47`, `locks.c`).
  core-ar2 0.8 and later read lanes 42-127 on tracks below 13 as its own mod locks, so a project saved on one
  firmware and opened on the other can lose or misread those locks. Not tested.

## Build it

`base.json` names the core folder, the SDK headers (`../include`, the same API as elekloader's), the OS and the
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

It builds every variant and records each identity in the binding's `variants`, the default's as `identity`. `--out
NEW-DIR` (outside Git) keeps each `.elemod` under the name the site's catalogue serves it by,
`modwerk-base-analog-rytm-mkii-<first 8 of its identity>.elemod`. `--write` records new identities: use it only for a
deliberate change, and say why in the pull request. A new identity is published as the Filter Hz package is: the
files in `sdk/imports/packages/modwerk-base-analog-rytm-mkii/` and `vendor/elekloader/catalog/`, and their record
`sdk/imports/elekloader-modwerk-base-analog-rytm-mkii-<date>.json`.

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

| Variant | Identity | `.run` | `.bss` | Relocations |
|---|---|---|---|---|
| irpina's release `core-ar2-0.7.elemod` (the reference) | — | 10,692 | 1,368 | 103 |
| plain | `14aab2f2` | 10,772 | 1,368 | 150 |
| voices | `69713be7` | 14,900 | 2,832 | 227 |
| send-bus | `2623f464` | 33,022 | 4,172 | 645 |

Every variant has a 110-byte `.boot`. Each keeps the exports, imports, tables, contributions and sites of the variant
it follows (plain `6dce8111`, voices `187b5126`, send-bus `9dc04c4c`, built from core-ar2 0.7's source with the same
hook bus), and its `.bss` is the same. The send-bus variant uses 62 of the kit's 64 storage bits and 3 bits of each
sound (a voice machine's type). Each of the 38 catalogue modules builds alone on its variant through the site's build
path with the same lockfile as before; `ramSpare` moves by at most 32 bytes (Analog BD 0.2.2 on voices: 95,784 B).
Not yet run on a unit.
