# Digitakt II base source

Modwerk's base for Digitakt II OS 1.17 starts from core-dt2 1.1 at `0df8409`, the reviewed head of
[Elekloader PR #221](https://github.com/elekloader/elekloader/pull/221). Modwerk pins the reviewed commit
directly. The imported `core-dt2/`, shared `core/` sources and `../include/digitakt-mk2/core.h` are
byte-for-byte copies. The core is irpina's and the 1.1 additions are toonst's. The
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

## Results

- The pinned base has 22 sites. See [base-binding.json](../base-binding.json) for its package hash and memory footprint.
- Claptom-music verified both persistence checks on E119. Save Project and a cold boot preserved SCF, LO, HI and the RNN melody. Standalone KIT Save and Load restored the saved bounds and melody. Digikit also verified the startup record update and kit recall. Image SHA-256 `d879c8c9769f91d079457e4e0d257d603bdaa8394d1214b9efbad993af816522`.
- Claptom-music verified that Create New reset SCF and octave bounds on B117. Image SHA-256 `5672391278216ee65c312a6eb1183d36acb2ac41f488b18527aab7fa47fdacd3`.
- With E120, the browser built and verified the base alone and the base with Track Names. The combined Perform Direct and Perform Levels build passed the site's builder and preflight under Node. The browser catalogue lists Track Names.
- With base `ea66a96f`, the site's builder and preflight under Node passed for the base alone, Track Names, and both Perform modules together. The E121 persistence image uses that base with Euclidean Scale. Image SHA-256 `a31115727d74476e5403e29a5efe29aba1a8e0e8ddc7c18c2c0f8efc8b106db7`. Hardware verification is pending.
