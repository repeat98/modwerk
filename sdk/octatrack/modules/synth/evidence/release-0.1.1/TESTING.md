# FM Synth testing

This report covers version 0.1.1-experimental. Publication uses the exact owner exception recorded in evidence/owner-hardware.md and sdk/synth-build-approval.json. Current hardware: **untested**. Historical author MKI reports predate the dedicated chooser and sample-free transport and are not current evidence.

## Exact sources and build

octabam `949f3be15eae5d3d16a7682b9e3218d42f6c1284`, author octatrick `525f4b19b04dc3ba3f3bae3b25abbf48df34a10a` (v2.9). The reviewed quantizer import supplies the matching mailbox/accessor, adapted to recognize the Part tag. See the import inventory for original and adapted file hashes. The chooser derives from Modwerk’s Analog BD registration at `cb1f0a16a41902fe874b8f307dd3d9065daf6eff`; the Analog BD audio engine is not included.

Native declaration/source execution used a private staged SDK tree. Only `modules/synth` was added; the regular shared `build_bus.py` remained unchanged. The preview Remix selected the fourteen stock effects plus SYNTH MACHINE; FX1 was FILTER, EQUALIZER, DJ EQ, PHASER, FLANGER, CHORUS, SPATIALIZER, COMB FILTER, COMPRESSOR, LO-FI. `fallback=NO_FALLBACK`, `static_stock=True`; platform USB/dynloader modules were omitted from this private capture profile. No module-specific public builder was added.

The build ran in local `octamod-tapehead-qualification-tools:local` with no network, read-only container root, all capabilities dropped, no-new-privileges, 128-process limit, a private source/output bind mount and a temporary filesystem. Environment: XBUS=1, SPEC=1, DEV=0, NOROUNDTRIP=0, OCTABAM_STATIC_STOCK=1, OCTABAM_NO_CACHE=1, BUILD=79, REMIX=fm-synth-ui. The local OS stayed outside Git. GNU ColdFire/DSP source assembly and native build passed.

The included `registration.s` reproduces exactly from `registration.c` with GCC 16.2.0:

```sh
m68k-elf-gcc -mcpu=5475 -O2 -ffreestanding -fno-builtin -fno-common -fno-pic -S registration.c -o registration.s
```

Firmware identity, source builder identity, image size and private arena layout are in `evidence/native-build.json`. The image SHA-256 is `6b6d0ef7b076e0096a9a930c4ec65992d5eda3b9bb18865b925ed1b49e29548a`. No output binary is retained in the module.

## UI and Part storage — passed

The trusted headless `ot_emu` and `scripts/capture-module-ui.py` drove normal MKII panel UART events. A private empty 32 MiB card was used. Container shared memory was 512 MiB (the emulator cannot start with Docker’s default 64 MiB). All seven kept screenshots were opened and visually reviewed: dedicated SRC SETUP machine row, six SRC controls, VOIC/CHRD, LEG, SCALE, ROOT and GLIDE. `media/capture.json` contains the exact panel plan and image/emulator hashes.

Reproduction, inside a reviewed private SDK staging tree containing this source as `modules/synth`, with the ordinary native toolchain and local OS:

```sh
python3 -B verify.py --emulator /path/to/ot_emu --sdk /path/to/staged/sdk/octabam --image /private/path/mainos_bus.bin --image-sha256 6b6d0ef7b076e0096a9a930c4ec65992d5eda3b9bb18865b925ed1b49e29548a --output /private/path/storage-report.json
python3 -B scripts/capture-module-ui.py --emulator /path/to/ot_emu --image /private/path/mainos_bus.bin --image-sha256 6b6d0ef7b076e0096a9a930c4ec65992d5eda3b9bb18865b925ed1b49e29548a --plan /private/path/plan.json --output /private/path/new-capture-folder
```

Use `media/capture.json`’s plan as plan.json. `verify.py` asserts selection and defaults on T1–T8, FM/1 in the current Part and SRAM shadow, all forty sample-slot bytes unchanged, edited INDX preserved on reselection, and full signature clearing when returning to FLEX. All five checks passed; sanitized results are in `evidence/storage.json`. This reads current Part storage; it does not prove a saved project reload.

## Octemu sample-free audio and recovery — passed

The owner authorized the local `coding/octemu` setup. Its cached `out/fx2` card and battery file were copied privately; the original files were not modified. The private card’s only WAV was deleted before boot. It retained a firmware-created saved project and a step-1 trig, with track 1 FX1/FX2 NONE. No FMSYNTH marker exists. Binary identities and fixture fingerprints are in `evidence/audio.json`.

Octemu ran headless/read-only with this image, the copied card/battery, `evidence/octemu-walk.jsonl`, a private WAV recording and a 150-second timeout. The walk gates on PTCH, RATO and PLAY/STOP lamp states, selects FM SYNTH with five DOWN taps, sets INDX=0 and AMP REL=40, starts the pattern and stops twice. It verifies actual firmware panel behavior, not a direct DSP test tone.

```sh
./octemu --headless --read-only --cf-card /private/fixture/card.img --nvram /private/fixture/nvram.bin --os /private/mainos_bus.bin --script /path/to/evidence/octemu-walk.jsonl --recording /private/audio.wav --timeout 150
python3 -B verify-audio.py /private/audio.wav --output /private/audio-report.json
```

Run Octemu from its own checkout root. Copy `out/fx2` first, remove its AUDIO WAV using the reviewed `scripts/card.py`/mtools setup, and copy the battery again before each run. The walk’s waits use guest time. The recording includes boot/settle silence; analysis checks nonzero generated audio, a carrier period near 169 frames (about 261 Hz, rather than the deleted fixture’s 440 Hz sine), and a silent final half-second. All passed. A first attempt without an active CF voice lifecycle kept sounding after STOP; the final START callback marks the native voice active so stock kill/transport ends it.

## Resource and sequencing limits

Native arena reservation: 10,487,808 bytes; current runtime extent and staging extent are recorded exactly in `evidence/native-build.json`. These are platform extents, not exact FM ownership or complete worst-case memory. Stack peaks, temporary clones, stock reuse, shared lifetimes, incremental per-track state and padding require a reviewed full inventory. Worst-case ColdFire cycles and DSP transport overhead are **not measured**. Eight-track selection is not eight-track audio stress.

The engine uses stock note/trig starts, releases and stops. Its oscillators run at sample rate for live playing; envelopes/glide follow stock clock data. At the guide checklist level: SRC SETUP selection, highlight/reselection, main name, SRC edit/page drawing, full stock guards, Part/shadow writes, sample-slot preservation, one-voice pattern PLAY and double-STOP are observed. Main chooser commit variants, neighbouring FLEX/STATIC audio, each p-lock, each LFO destination, scene sweeps, MIDI, chord/voice switching, save/reload, Part/pattern switching, non-1x speed/length, swing, tempo changes, loop transitions and restart behavior are **not tested**. The single engine has no model list.

## Release software integration — 6 October 2026

Version 0.1.1-experimental lives in sdk/octabam/modules/synth. Private quantizer object labels are prefixed to avoid collisions in the shared source packages. This packaging change reproduces the existing native image exactly: 6b6d0ef7b076e0096a9a930c4ec65992d5eda3b9bb18865b925ed1b49e29548a. The executable bytes behind the seven kept native LCD captures and native audio test are unchanged.

The ordinary source compiler assembles FM Synth with the public modules. The shared browser/native coverage comparison passed all 94 profiles: 37 matching built images outside the existing platform/logger writes, 57 matching refusals, zero mismatches. Native declaration checks found 512 clean sets containing FM Synth and 1,536 overlapping sets refused by the ledger. All overlapping Analog BD/public Scale Quantizer selections are refused before browser linking. The comparison includes Repitch; the earlier draft's guessed Repitch exclusion is removed. Accepted mixed builds have composition evidence only, not maximum-load audio qualification.

The shared firmware worker builds FM Synth, round-trips the complete upgrade, preserves the stock header prefix, tail and seed, rejects Analog BD, public Scale Quantizer and MIDI Scenes companions, and rejects changed stock firmware while clearing its previous inspected session. The generated MAIN/update remain private. Browser-image playback is recorded separately.

The common worker’s MAIN SHA-256 is c1fbc0b2eaf284e72692b7048d1dfd3693f3e3e90c71229159a619d585b52c95, and its update is 831e7cd878398ee8d1e268e9fc2bcfd902f48e785965e8e510bff58abc1405a6. That exact MAIN passed the same sample-free Octemu panel walk: peak 3715, carrier period 169 frames (260.9467 Hz), final half-second peak zero. See evidence/browser-audio.json and evidence/software.json. The runtime extent is 90,268 bytes including the existing logger, with a 10,586,112-byte total reservation (native arena plus 98,304-byte logger reservation). Section extents and authored ROM writes are inventoried; stack, lifetimes and temporary peaks remain unknown. These extents are not complete memory qualification.

The owner explicitly approved missing current hardware, worst-case chip timing and complete stack/memory bounds for this exact experimental release on 6 October 2026. See evidence/owner-hardware.md. Hardware remains untested and those quantities remain null. The frozen baseline and earlier module exceptions are unchanged. The incomplete qualification.example.json remains a worksheet; it is not attached as tests.qualification.

The seven native LCD captures are retained because the ordinary native standalone builder reproduced their exact image byte for byte after object-label namespacing. Their original image and capture plan remain recorded; they are not captures of the logger-enabled browser image. Eight-track Part storage and native audio reports retain that native image identity. No generated firmware, WAV, card or battery state is committed.
