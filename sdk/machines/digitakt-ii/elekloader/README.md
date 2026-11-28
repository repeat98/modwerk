# Digitakt II base source

Modwerk's base for Digitakt II OS 1.17 starts from core-dt2 1.1 at `0df8409`, the reviewed head of
[Elekloader PR #221](https://github.com/elekloader/elekloader/pull/221). Modwerk pins the reviewed commit
directly. The imported `core-dt2/` and `../include/digitakt-mk2/core.h` are byte-for-byte copies. `core/` (`core.s`,
`settings.s`, `fast.s`) is Modwerk's own hook bus (GPL-3.0-or-later, 28 November 2026): the boot copier, `ev_tick`, `ev_draw`,
`ev_key`, `ev_enc`, `ev_settings` with `core_additem`, and the `.fast` copy, with the same symbols, sites and tables as
the core it replaced. The same `core.s` builds the Rytm MKII and Model:Cycles bases; each recipe's defsyms set its
addresses and switches. The core is irpina's and the 1.1 additions are toonst's. The
[import record](../../../imports/core-dt2-source-0df8409.json) lists each file and its SHA-256.
Modwerk's additional firmware bindings and hooks live under `modwerk/`.

Core 1.1 keeps the six events and every site of core 1.0 and adds, in new code after the old:

- `ev_frame_params`: each frame's per-track parameter values, before the stock modulators;
- `ev_key_leds`: the key-LED frame, before the stock views set theirs;
- `core_projdata` and `core_kitdata`: a mod's block in the project file's header gap and in each kit record, saved
  and loaded with the project, carried through the firmware's kit copies, and written only over zeros or core's own
  data;
- `core_addvalue` for PERSONALIZE and SETTINGS rows, and the LED setter for key-LED handlers.

The entries are proposed in [core-profile/interface.json](../../../digitakt-ii/core-profile/interface.json) (marked
`since` 1.1), with each new site's address, length and SHA-256 guard.

## Local base candidate

[base.json](base.json) stages the imported sources and adds Modwerk's [sequencer and project hooks](modwerk/README.md).
The recipe checks that the candidate retains the stock sites and interface entries of the released `core-1.0.elemod`.
It pins the same compiler and assembler as `sdk/build/Dockerfile`. To reproduce the local candidate, build with
that toolchain, the kit-pinned Elekloader SDK and your local copy of the exact stock OS:

```sh
npm run machine:base -- digitakt-ii --stock /private/Digitakt_II_OS1.17.syx --out /private/dt2-base
```

The base builds from a copy of core's `mod.json` ([copies](copies/core-dt2/mod.json)) that differs in one value: `KIT_ROOM` is 146, not 194, so core's kit data ends where the [project archive](modwerk/README.md#phrase-continuation-and-project-archives) starts, 48 bytes before the end of each kit record. `sdk/tests/test_machine_base.py` refuses an overlap.

## Results

- The pinned base has 22 sites. See [base-binding.json](../base-binding.json) for its package hash and memory footprint.
- Claptom-music verified both persistence checks on E119. Save Project and a cold boot preserved SCF, LO, HI and the RNN melody. Standalone KIT Save and Load restored the saved bounds and melody. Digikit also verified the startup record update and kit recall. Image SHA-256 `d879c8c9769f91d079457e4e0d257d603bdaa8394d1214b9efbad993af816522`.
- Claptom-music verified that Create New reset SCF and octave bounds on B117. Image SHA-256 `5672391278216ee65c312a6eb1183d36acb2ac41f488b18527aab7fa47fdacd3`.
- With E120, the browser built and verified the base alone and the base with Track Names. The combined Perform Direct and Perform Levels build passed the site's builder and preflight under Node. The browser catalogue lists Track Names.
- With base `ea66a96f`, the site's builder and preflight under Node passed for the base alone, Track Names, and both Perform modules together.
- Claptom-music verified both persistence checks on E121 with base `ea66a96f` and Euclidean Scale. Save Project and a cold boot preserved the Scale settings and RNN melody. Standalone KIT Save and Load restored the saved bounds and melody after changes. Image SHA-256 `a31115727d74476e5403e29a5efe29aba1a8e0e8ddc7c18c2c0f8efc8b106db7`.

On QF17 with base `e88273ed`, Claptom-music verified that Chord Arp remained enabled on both test tracks and the checked trig locks survived Save Project and a power cycle. Digikit confirmed the startup archive update. Image SHA-256 `f8406f34dd18bed623db0d076062ac2ae2b1fe774b5525e6e6f48c5942f5f721`.

With base `e88273ed`, the site's builder and preflight under Node passed for the base alone, Track Names, both Perform modules together, and Mute Latch.

On QK17 with the same base and Euclidean Scale, Claptom-music verified that Save Project and a cold boot preserved SCF, LO, HI and the saved RNN melody. Standalone KIT Save and Load restored the saved bounds and melody after changes. Image SHA-256 `4a87420a08ff3be4f526dd80012807661b53908fa2a2e50c4d4e2dd3437f0441`.

On a base `e88273ed` image with Chord Arp, Euclidean Scale and Track Names, Claptom-music reported that Euclidean Scale kept its settings but Chord Arp's ARP came back OFF after Save Project and a power cycle. Core's kit data overlapped the project archive. Base `8650bb8a` differs from `e88273ed` in that one value (`KIT_ROOM`, one byte of the package); two isolated builds reproduced it.

On KR17 with base `8650bb8a`, Chord Arp, Euclidean Scale and Track Names, Claptom-music reported that after Save Project and a power cycle Euclidean Scale kept its settings on a stock Euclidean track where Chord Arp ran with ROOT=TRIG, Chord Arp stayed on with its lock on a track of ordinary trigs, and official OS 1.17 opened the project. Image SHA-256 `3cbe6f35ae3ad4aa76a005837c89cf29f59b238bc8f91ae047c12191ff3f6d19`.
