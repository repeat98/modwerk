# Analog Rytm MKII base

Modwerk's own base for the Analog Rytm MKII on OS 1.74 ([recipe](../../../../docs/MACHINE_RECIPE.md)). Today it is the
source of elekloader's core-ar2 0.7, copied unchanged: `core-ar2/` (its `mod.json` and seven sources) and `core/` (the
Digitakt mk1 core's `core.s`, `settings.s` and `render.s`, which `mod.json` builds with the Rytm's addresses). Their
provenance and hashes are in
[sdk/imports/core-ar2-source-fb58292.json](../../../imports/core-ar2-source-fb58292.json). They are
GPL-2.0-or-later, by irpina and Iced-Cream, and keep their SPDX lines.

Modwerk's own sources sit beside them in `base/`, and `base.json`'s `common` and `add` merge them into the imported
recipe when the build stages it, so the imported files stay exact. `common` goes into every variant: the machine list's
sections (`sections.c`; [machine list sections](../README.md#machine-list-sections)), the amp envelope's record
(`amp.s`; [amp envelope record](../README.md#amp-envelope-record)), the FX track's edit save (`fxguard.s`) and the
[lean engine](#lean-engine) (`perf-*`). `add` holds the FX track's lock
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
and **plain**, the imported recipe with `common` alone. The site builds a set
with a send effect on send-bus, one with a digital voice machine and no send effect on voices, and any other set on
plain, so each pays only for what it uses (below). A `leave` entry is a shell pattern over a source or cflag itself, a
site's `addr` or `target`, a subscription's `fn`, a contribution's symbols, a storage field's `sym`, or a `defsym` or
collection name; one that matches nothing in `add` fails the build. Put a hook in `common` when a module that is no
send effect needs it, or that module would not link on plain; a voice machine uses none of the send bus's code
(`npm run modules:check` refuses `mw_send_*`, `mw_fx_clock` and its helpers there), or it would not link on voices. The full OS file sent with Transfer stays the fallback.

## Lean engine

Every variant carries the lean engine (`common`; Nathaniel Pavel, from the Improved Performance module, which left the
library when the owner asked for its work in the base, 21 November 2026). Stock's audio interrupt computes nearly
everything in every 32-sample block, used or not. The lean engine tests, block by block, whether a piece of that work can
change anything, and jumps it when it cannot. Each source's header says what its part assumes and why the result is the
same. Its assembler constants and switches (`defsym`s and `.ifndef` defaults) and its C defines are named `LE_*`,
and its global symbols `le_*`, so nothing it names meets another part of the base or a module.

| Part | Left out when | Source |
| --- | --- | --- |
| Sample voices | a voice plays nothing and its filters hold zero: no interpolation, decimation or transfer of silence | `perf-sample-voices.s` |
| Send mixer, delay, reverb | a voice's send gains are zero and still; the delay's or reverb's input, state and memory windows are zero | `perf-effects.s` |
| Slide pass, velocity and pressure lists, performance matrix | they would be the identity | `perf-modulation.s` |
| Parameter smoothing, compressor control words, USB audio input | a track's 42 parameters are at rest; the compressor's inputs are unchanged; nothing streams | `perf-engine.s` |

Where a part runs its own loop in place of stock's, it does stock's arithmetic in stock's order. The output is stock's
bit for bit with one exception: once the delay or the reverb has had no input for the whole length of its memory and
lies below -114 dBFS, it rests and outputs exact zero where stock keeps computing a residue of a few hundred in 2^31; the
first input ends the rest. Two parts reach the screen: `CPU` or `OVR` in the bottom status bar's lower right corner
while the core's `core_audio_load` is near or over its limit (`perf-cpu-mark.c`, stock's font, columns 96-127 cleared
under it; CPU blinks on and off, OVR blinks between lit text in a dark box and dark text, about twice a second), and every other frame step left out while more than 8 messages wait for the UI task (`perf-screen-rate.c`).

There is no wake-up latency: each test runs at the start of its part in the same block, so the first block with input
runs stock's work. The worst-case block is stock's plus the tests; their cost alone has not been measured. Measured as the module on the author's MKII, one 12-track pattern beside
17 modules: 85.4 % of the block on stock, 72.1 % with it; longest block 99.4 % and 89.8 %
([repeat98/modwerk#1937](https://github.com/repeat98/modwerk/pull/1937)).

## Beside elekloader's core-ar2

This base is Modwerk's, not elekloader's core-ar2, and its core work happens here
([contributing](../../../../CONTRIBUTING.md#contributions-stay-here)). It stays on 0.7's source:

- **Version 0.7.1** (`base.json`'s `version`, in place of the imported recipe's 0.7; 18 November 2026). The builder
  picks a base's mod area by its version (the kit's `coreDdr`), so the version moves when the layout does: 0.7.1 on
  links in the 3.7 MiB area `0x47B50000–0x47F00000` ([shared mod memory](../README.md#memory-and-budgets)), where
  `sendbus.c`'s `MODS_END` ends the send effects' work area. It is not 0.8: a mod that asks for core-ar2 0.8
  (`resources.core`) must stay refused here. Modules still ask for the 0.7 interface (`machine.json`'s
  `sdk.core.version`), so they link on core-ar2 0.7 and older development bases too. `coreDdr` goes by version alone:
  before an upstream Rytm core of 0.7.1 or later joins the catalogue, `kit-devices.test.ts` fails.
- **No core-ar2 0.8 or later.** core-ar2 0.8 (elekloader v0.9.0) jumps from the same two lock sites the lock words
  use, `0x40008f98` (row load) and `0x40009216` (lock rebuild). This base cannot take it, an elekloader mod that needs
  0.8 or later does not run on it, and a mod that uses the send bus does not run on core-ar2.
- **Projects moved between the two.** The lock words are saved as FX-track lanes 64-71 (`0x40`-`0x47`, `locks.c`).
  core-ar2 0.8 and later read lanes 42-127 on tracks below 13 as its own mod locks, so a project saved on one
  firmware and opened on the other can lose or misread those locks. Not tested.

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

| Compiler | `.run` bytes | Relocations | Same as the release |
|---|---|---|---|
| irpina's release `core-ar2-0.7.elemod` | 10,692 | 103 | — |
| m68k-elf GCC 16.2.0, binutils 2.47 (reviewed; this base's plain variant `13a1c204`, before the lean engine) | 10,792 | 102 | sources, sites, interface |
| Debian 12 m68k-linux-gnu GCC 12.2.0 | 10,248 | 94 | sources, sites, interface |
| Ubuntu 24.04 m68k-linux-gnu GCC 13.3.0 | 10,320 | 94 | sources, sites, interface |
| Debian 13 m68k-linux-gnu GCC 14.2.0 | 10,168 | 93 | sources, sites, interface |

The send-bus variant (`46e2e4f6`) has 36,901 bytes of `.run` and 4,364 of `.bss` (3,875 and 192 of them since
the lean engine), 62 of the kit's 64 storage bits and 3 bits of each sound (a voice machine's type): the rest of the
[mod area](../README.md#memory-and-budgets) stays for modules and the effect that runs, whose work area is the RAM they
leave free (`sendbus.c`). The voices variant (`e1f399a9`) has 18,771 bytes of `.run` and 3,024 of `.bss`, and plain (`5ca4480f`) 14,671
and 1,557, the lean engine included: with Analog BD 0.2.1 linked, the set took 19,520 B less of the mod area on voices (before the lean engine, which both variants carry)
than on send-bus.

The release records its sources but not its compiler, and none of these reproduces its compiled code byte for byte.
The 22 functions that change size are all compiled C: 21 from `store.c`, 1 from `machines.c`. The sites, the
exports, the imports and the tables are the same. This base is therefore identified by its own hash, built with the reviewed toolchain. With
the lock words and the send bus it ran on a unit in test build MB02, as the author reported (29 October 2026).

The kit-pinned SDK (3b31ef3) and the SDK at the release's commit (fb58292) give the same package from these sources
and headers.
