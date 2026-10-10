# OT UI screenshots for module publication

## Write a short screenshot walkthrough

Every module gallery, on every machine, should teach a first useful task in
two to five essential screenshots. Order them as the user would work: find or
enable the module, adjust its controls, then check the expected result and
stop, reset or bypass it. Use extra screenshots only when needed for a
different route or control page; keep those under **More screenshots** on the
site so the main walkthrough stays short. All required capture evidence must
still be supplied, even when some pages are supplementary in the gallery.

Write two or three short sentences per caption, naming the button/menu/encoder
to use and what the change does. Include a small concrete example when it
helps, such as “Try STEPS 16 and PULSE 5 for five evenly spaced pulses per
cycle.” A list such as “FREQ, RES, DEPTH, DEC, STEPS and PULSE” does not teach
usage. Neither does a description of the capture fixture. Keep capture
metadata in its evidence record and provenance line; mention a limitation in
the caption when it affects how the pictured step should be understood.

Describe only what the actual screen shows in alt text. Check visible labels
against the image, and distinguish a suggested control change from a value
already pictured. Explain OFF/inactive controls when users need to enable
them. Do not claim a stopped emulator image proves the resulting audio or
hardware behavior. The caption may explain the source-documented expected
result without presenting it as a new test result.

Before finishing, read the captions in gallery order with the screenshots
open. A first-time user should understand where to start, what to change and
what to expect without opening the README. Synchronize new release captions
with the module tutorial and control documentation. For website-only copy
improvements to retained releases, edit `src/catalog/module-media-guides.ts`;
bind each guide to the exact version and real declared paths, preserve media
credits/licences and evidence, and review the guide when that version changes.


The steps for a whole module are in [Add or port a module](ADD_A_MODULE.md); this document defines the capture contract.

Every new module and update needs actual OT UI captures that explain where it
lives and how to reach it. Capture the module's chooser or enable location and
all relevant main, setup and control pages. One screenshot can cover both
location and controls when both are visible. Document alternate entry points,
machine/track prerequisites and hardware differences when applicable.

Use hardware LCD photographs/captures or the headless emulator's actual
framebuffer. Preserve the rendered pixels and use readable integer scaling.
Do not reconstruct labels, redraw the interface, generate mockups or present
an illustration as an OT capture. A selection cursor alone does not prove that
the module loaded: confirm it, then capture the resulting controls. Review
every image for error popups, stale parameters and unrelated UI.

## Manifest contract

`octamod.module.json` schema 2 accepts this additive `access` section. It is
required by PR publication checks for new or changed module folders and modules
newly added to the published catalog. An empty
`screenshots` list is allowed while developing a draft. Unchanged existing
publications remain readable.

```json
{
  "access": {
    "location": "Audio track FX2 SETUP; Mini Verb in the effect chooser.",
    "steps": [
      "Select an audio track with its TRACK key.",
      "Hold FUNC and press FX2 to open FX2 SETUP.",
      "Turn LEVEL to Mini Verb and press YES to assign it.",
      "Press FX2 to close SETUP and use DECAY, DAMP, MIX, MOD and RATE."
    ],
    "screenshots": ["media/ot-location.png", "media/ot-controls.png"]
  }
}
```

Each referenced path must be a declared hardware/emulator image in `media`,
with caption, meaningful alt text, credit, licence and `source` (`original` or
an HTTPS attribution URL). Add `otUi` to that media entry:

```json
{
  "page": "FX2 SETUP",
  "shows": "location",
  "firmware": "1.40C",
  "moduleVersion": "0.1.2-experimental",
  "imageSha256": "<64 lowercase hex digits: hash of the local MAIN OS build>",
  "setup": "Headless ot_emu, MKII panel, stopped transport; actual LCD pixels."
}
```

`shows` is `location`, `controls` or `location-and-controls`. Publication checks
require location evidence and, for modules declaring controls, control evidence.
Capture versions must match the manifest. The reviewer must additionally check
all relevant pages, current labels/behavior, instructions, authenticity and
rights. Metadata checks cannot establish those facts. Keep README instructions
and TESTING capture records synchronized with the manifest and version pin.

For a documentation/media-only version update, existing actual captures may be
reused only after comparing every native source file with the captured revision
and verifying that the relevant UI is unchanged. Preserve original pixels,
capture date, image hash and captured draft version in the capture record;
record the source-file hashes and publication-version binding. Do not relabel
old UI after a native source or control change. The reviewer checks this
binding as well as the current access steps.

An automatic USB module with no OT controls or dedicated OT page must explain
that fact in `access.noUiReason`, keep `screenshots` empty and document its
actual host/device access steps. Owner review verifies this narrow exception;
do not invent a menu or use unrelated stock pages as evidence.

## Headless capture workflow

Use a reviewed, locally built `ot_emu` and a local MAIN OS build from your own
verified 1.40C. Native development and compilation follow the existing SDK
review/isolation rules. Never run pending/unreviewed sources on a trusted host.
This script operates an existing image; it does not build source, qualify
hardware or enable configurator downloads.

Create a JSON panel plan using `press`, `encoder`, `wait` and `capture` actions.
For scene editing, `hold` keeps panel keys down while turning an encoder;
`release` must release those keys before the plan ends. For example:
`{"hold":["SCENE A"]}`, `{"encoder":{"name":"A","delta":4}}`,
`{"capture":"ot-scene-lock.png"}`, `{"release":["SCENE A"]}`.
The supported UI keys also include `SCENE B`, `TRIG1`–`TRIG16`, MKII `AED`,
`PUSH A`–`PUSH F` and `PUSH LEVEL` for physical encoder presses.
`MIXER` opens the MIXER page.
Kit/pattern workflows also support `CUE`, `PTN`, `BANK`, `REC` (copy),
`PLAY` (clear) and `STOP` (paste); hold FUNC for clipboard actions.

Example effect plan:

```json
[
  { "wait": 3000 },
  { "press": ["YES"] },
  { "wait": 2000 },
  { "press": ["NO"] },
  { "press": ["FUNC", "FX2"] },
  { "encoder": { "name": "LEVEL", "delta": -20 } },
  { "encoder": { "name": "LEVEL", "delta": 1 } },
  { "press": ["YES"] },
  { "capture": "ot-location.png" },
  { "press": ["FX2"] },
  { "capture": "ot-controls.png" }
]
```

This example assumes a fresh empty project and a chooser with Mini Verb as its
first effect. Adapt the plan to the actual build and inspect the results; menu
order depends on the composition. The first actions dismiss the initial date
prompt on a fresh emulator session. A custom card/project may boot differently.
Use `--key-ms 50` for track double taps; the default down/up interval is 150 ms.
The selected interval is recorded as `keyMs` in the capture metadata.

```sh
python3 -B scripts/capture-module-ui.py \
  --emulator /local/path/ot_emu \
  --image /local/private/mainos.bin \
  --image-sha256 <expected-local-image-sha256> \
  --plan /local/path/capture-plan.json \
  --output /local/path/new-screenshot-directory
```

By default the script stages an empty scratch card, boots the MKII panel, runs
the DSP cores needed for normal effect selection, keeps transport stopped and
exports the firmware LCD including popup windows through `lcd_view.py`.
`--mki` selects the MKI panel; `--card` accepts a private local fixture.
When actual project state is required, pass `--card`, `--set-name` and
`--project-name` together. The tool mounts the disposable card, loads that
project and refuses captures unless LOAD PROJECT completed. Never use an
empty-card session as evidence of a project-dependent menu. The record includes
only its card fingerprint and neutral fixture names; keep the actual card local.
On Linux, the two DSP cores need 104 MiB of shared-memory backing before
project/audio work. Docker's default `/dev/shm` is only 64 MiB: memory mapping
succeeds, then touching the second core's buffer raises SIGBUS before DSP setup
finishes. Start the existing isolated container with `--shm-size 256m`, retaining
its read-only source mount, private output mount, disabled network and dropped
capabilities. This changes the shared-memory allowance within the container's
overall memory limit. The capture script checks for at least 128 MiB free before
starting the emulator and reports the required setting if space is insufficient.

On macOS the emulator needs shared-memory access. Do not capture a failed load
as a successful control page or bypass selection guards to manufacture it.

The renderer preserves every real LCD pixel and uses two grayscale colors
(24 and 240); this directly satisfies the monochrome style requirement.
The output contains PNGs at six times the 128×64 LCD resolution and a
`capture.json` record with image/emulator hashes, panel plan, setup and screenshot
hashes. Review the pictures, then copy only these files into the module's
`media/` folder and declare the PNGs. Record module version, source identity,
build/capture commands, configuration and limitations in TESTING.md. Capture
records must contain no firmware bytes, raw LCD/RAM dumps, card images, samples,
personal project names, credentials or private emulator logs. Temporary card
and framebuffer data are removed by the script.

## Rights and release review

Provide an accurate contributor declaration for original captures and preserve
underlying Elektron/third-party rights and attribution. An original photograph
or framebuffer export does not make every depicted UI element yours to license.
Retain the applicable media licence/declaration and have the reviewer verify
reuse rights; review is not automatic legal clearance.

PNG/JPEG/WebP images are limited to 5 MiB each; audio previews remain optional
(12 MiB for WAV/MP3/Ogg); at most eight declared media assets per module.
Submit source, instructions, screenshots and evidence together through a PR,
increase the module semantic version and synchronize `sdk/catalog.json`.
Run `npm run modules:generate`, `npm run check` and
`npm run modules:check -- --base origin/main` on the latest revision. Owner merge
approves the version; pending/rejected updates preserve the current publication.
Capturing the UI does not establish audio safety, native/browser parity or
hardware qualification, and never authorizes uploading firmware.

## Release documentation gate — 2 October 2026

New modules and updates must include complete documentation and a short practical tutorial, with real screenshots in the same black-and-white/gray style as the online modules. Yellow or colored captures do not qualify. Declare PNG screenshot paths and `screenshotStyle: "black-and-white"` under `tests.qualification.documentation`; release validation inspects actual pixels, requires the tutorial and complete README sections, and checks the OT location/control evidence even without `--base`. Preserve actual captured labels and controls; never replace them with a reconstruction. The owner verifies page coverage, exact access steps, tutorial usefulness and provenance. Automatic no-OT-UI modules still need real host setup/routing screenshots and a tutorial. See [the full qualification and documentation gates](MODULE_QUALIFICATION.md).

An owner-approved experimental update may retain an earlier version's UI captures when its exact-source approval explicitly names `retainedUiVersion` and waives release documentation. The screenshots retain their original capture version, date and image hashes; this grants no current hardware evidence. Other updates still require current-version UI evidence.

## Digitakt and Digitone

The Digi modules use the same seven README sections, a matching short tutorial,
real monochrome selection/control captures, and `media/capture.json`. Declare
`tests.documentation` in `modwerk.module.json`: `tutorial` has `title` and at
least three `steps` matching `presentation.usage`, `screenshots` lists the
module-relative PNGs, and `captureRecord` points to the provenance JSON. Each
screenshot's `media.capture.type` identifies `emulator` or `hardware`.
`modules:check -- --base origin/main` requires this record for new or updated Digi modules; existing unchanged imports remain readable during migration.
`modules:check` checks those links, current module version, firmware/build
identity, PNG hashes and monochrome pixels. UI documentation does not upgrade
the module's hardware/audio/timing qualification.

For local emulator captures, use digiemu revision
`c1b5735835923e328f8b4950d6ba927875e5b669` with its six pinned Unicorn patches.
Build the author's pinned catalog release with the unchanged vendored elekloader
kit and your own supported stock OS file, then run the capture script in an
isolated sandbox with network and user credentials denied:

```sh
python3 scripts/capture-digi-module-ui.py \
  --emulator /path/to/reviewed/digiemu \
  --firmware /private/capture/custom.syx \
  --plan sdk/digitakt/modules/digislicer/media/capture-plan.txt \
  --out /private/capture/new-session --fixture-loop
```

Use a new private output directory. `--fixture-loop` seeds an original synthetic
`DOC_LOOP` on the disposable +Drive before boot; the plan still has to load it
through the instrument's sample browser. It does not write RAM, menu selection
or parameter state. The script runs firmware-native drawing (`hle=False`),
collects the firmware-rendered LCD buffer at flushes and selects one complete
unmodified frame from the final 250 ms after the last panel action at each `snap`. It scales the 128×64
pixels by six without interpolation. Open every PNG and keep only complete,
correct pages. Retain the panel-input plan, capture timestamps and PNG hashes,
built-image/stock/catalog/kit/emulator identities, module source pin and
conditions in `media/capture.json`. Keep firmware, cards, extracted sections,
raw frames and snapshots in private storage. Credit the capture contribution
separately from Elektron's underlying interface rights, as for the OT captures.
