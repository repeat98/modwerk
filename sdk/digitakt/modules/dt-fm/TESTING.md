# DT-FM testing

## In Modwerk

The evidence tier is `author-hardware`, the author's own report below. Nothing has been run on a unit in Modwerk.

## Import — 27 November 2026

- **Files.** The author's released `dt-fm-1.2.1-os1.53.elemod` (`7f0f01f2…`) and `dt-fm-1.2.1-os1.54.elemod` (`336612bc…`) from [v1.2.1](https://github.com/mtalikka/DT-FM/releases/tag/v1.2.1), pinned unchanged in `sdk/imports/elekloader-dt-fm-2026-11-27.json`. Both match elekloader 0.11.0's catalog pins. `src/` is the author's source at `9ac1802`, the tag the files were released from.
- **Linked.** Through the site's build path on the vendored kit 0.7.0, with core 4.4 and Machine Pages 1.2, against stock OS files recognised by their hashes. DT-FM alone and beside each library mod, on OS 1.53 and 1.54:
  - builds alone and beside every mod not listed below;
  - refused beside SOPHIE (the same exported names), CC Names (the same kit load and save code), and, through Machine Pages, DigiChain, Digi Mono, Digi Poly, NEIGHBOR and DIGISLICER;
  - refused beside Digi EQ 1.0.2: Digi EQ builds only on core 2.1, which DT-FM does not link with.
- **Memory.** 11,939 B of the mods' RAM, no fast RAM, as the builder reads the files.

## Documentation capture — 27 November 2026

Pinned digiemu `c1b5735`, firmware-native drawing, OS 1.54, a build of core 4.4, Machine Pages 1.2 and DT-FM (`4e5b8eb1…`), disposable first-boot project, no network. [capture.json](media/capture.json) has the identities, inputs and hashes. The machine chooser and the SRC page show as captured.

**Not seen in the emulator: turning DT-FM's knobs.** In this emulator, ALGO, RATIO and OP showed their value but kept it when turned (ALGO 1, RATIO 1.00), on core 4.4 with either Machine Pages build and on core 3.0 with elekloader's Machine Pages 1.2, the setup closest to the author's. SOPHIE's knobs turned on the same core 4.4 build. So the captures show the pages, not the knobs' behaviour. Turning was not tested on a unit in Modwerk.

## Upstream

The author reports testing 1.2.1 on a Digitakt mk1 on OS 1.54 with elekloader's core 3.0, Machine Pages 1.1 and digihealth. On OS 1.53, an earlier build played four DT-FM tracks together at about 95 % CPU, about 85 % with FAST AUDIO; eight tracks are not claimed. The author warns that several tracks can freeze the Digitakt without FAST AUDIO. The report gives no date or duration. See [upstream/README.md](upstream/README.md).

## The author's run of a Modwerk build — 22 October 2026

The author ran a Modwerk-built firmware with DT-FM 1.2.1, Digi Health, Digi Utils and Machine Pages on a Digitakt 1 on OS 1.54 with FAST AUDIO on, for about five minutes: six DT-FM tracks played before Digi Health's System Info showed 100 % CPU. The record is [evidence/hardware-performance-2026-10-22.md](evidence/hardware-performance-2026-10-22.md). It is one session's observation, not a worst-case measurement, and its firmware hash was not kept.

## Not tested

- Any Modwerk build on a unit: sound, CPU, saving and reloading a project, a power cycle.
- Turning the SRC knobs (see above), parameter locks and LFO destinations.
- Three or more mods together.
