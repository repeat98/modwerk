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

Two isolated builds with GCC 16.2.0 and binutils 2.47 produced byte-identical packages and verified the
[binding](../base-binding.json) for the `0df8409` source refresh. The pinned build has 19 sites and links with both Perform modules, Euclidean Scale and the Chord Arp test fixture.
A Windows GCC 13.1.0 diagnostic reproduced all 19 sites, linked with both Perform modules, and linked
with the Euclidean Scale and Chord Arp test modules separately and together. In digikit, the
Euclidean Scale fixture restored its settings after clearing and reloading the project, and the
swung Chord Arp fixture reached the scheduler commit routine 16 times.

## Release status

- **Browser builds.** The site selects `modwerk-base-digitakt-ii-<sha8>.elemod` by the SHA-256 in the binding.
  The package declares `core` 1.1, which satisfies the released Perform modules' dependency. Downloads stay disabled.
- **Hardware.** Earlier base builds have reported hardware results for the Euclidean pitch hook and kit-data reload.
  Claptom-music reported that **Create New** passed with Euclidean Scale: SCF turned off and both octave bounds
  returned to AUTO in the new project. The Scale-only B117 trial used base SHA-256
  `1c5c0cd88ad80ba10b22b29853914b189b42b8e0ac2b62643f8bb2a01c65010a` and image SHA-256
  `5672391278216ee65c312a6eb1183d36acb2ac41f488b18527aab7fa47fdacd3`.
  On the same image, Claptom-music reported that **SAVE KIT → LOAD KIT** failed to restore Euclidean
  Scale settings. After loading the saved kit, SCF was off and both bounds showed AUTO.
  A second hardware trial changed stock AMP DEC before saving and changed it again before loading.
  Loading the saved kit restored AMP DEC, while SCF and the octave bounds stayed at their defaults.
  The failure has not yet been isolated to kit export, import or the copy into the active pattern.
  Digikit replayed the standalone kit save and load on the same image using an initialized +Drive
  fixture. The trace reached the kit serializer, loader and copy hook. After clearing the live
  settings, loading the saved slot restored SCF, both bounds and the reroll generation in the emulator.
  The phrase scheduler hardware check remains pending.

  On the private KTR1 diagnostic image (`487b078c533106ce5d2a52fb90569ddcc44ad040e4f2b01a53adb3d3d04e76b7`),
  Claptom-music reported a zero save reading after saving and zero load and copy readings after
  loading, with both bounds still at AUTO. The diagnostic counts save and load only after their
  kit-data registration check, and counts copies only when they target a project kit. An emulator
  replay of the same image recorded one load and one copy with matching nonzero kit data.

  On KTR2 (`e9ddd0b4945e88c7faa35915557139ff9a5e5d886107ac3b0be2c769155be7bf`),
  Claptom-music again reported zero save, load and copy readings for the standalone kit
  round trip, with LO and HI at AUTO. KTR2 counts at entry to the storage handlers.
  Digikit recorded two save entries and, after resetting the trace, one load and one copy
  with matching nonzero data. The hardware project-save control reported `S258:5`.
  That confirms the save counter works on the unit and observed at least one matching
  nonzero record. The standalone kit operations left all three counters at zero.
  A second Digikit replay captured the KIT column with SAVE selected, the ENTER KIT NAME
  screen, and the KIT column with LOAD selected. After the final naming confirmation,
  the standalone save caller entered the shared serializer, followed by a second
  serializer call from the active-pattern update. After selecting the saved slot in
  KIT LOAD, the standalone load caller entered the shared deserializer, then the
  kit copy handler ran. This confirms the menu route and hook order in Digikit.
