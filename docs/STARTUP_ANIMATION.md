# Modwerk Octatrack startup — 8 October 2026

## Beta docking edition — 12 October 2026

New Octatrack builds for beta testers and verified administrators include the
Elekloader migration's docking startup, ported independently of its new base.
The mark flies in, a module crosses the lamps and docks, and its wave reveals
MODWERK with **NEW / BETA**. It lasts 3.5 seconds. Ordinary members keep the existing
2.8-second startup. Existing firmware files need to be rebuilt to receive it.

Startup package `3.0.0-beta.2` removes the shockwave's solid circular outline and
dotted echo. The expanding distortion, text reveal and panel-lamp sweep retain
their original timing. A host-renderer comparison across 350 frames on both
models found only removed pixels during the outline phase; all other frames,
including the final artwork, remain byte-identical.

Beta eligibility is carried through validation, composition, alternative placement
checks and standalone MIDI Scenes. The server rechecks beta access immediately
before a beta build; revocation also changes the frontend build key. The build
panel labels the beta startup, and its source/configuration fingerprints distinguish
it in the device logger.

The port changes the startup loop and compositor frame-load sites and adds its
authored runtime object and persistent ROM cave gate. Both sites have SHA-256
guards; original frame-load code
comes from the verified local firmware. The drawing adapter preserves registers
and flags and stops drawing after startup. Both models restore the stock panel
colours. The same sample-memory reservation is used; the extra initialized runtime
state remains inside the existing runtime/staging bounds. The gate and its
initially zero active word occupy 80 bytes reserved before beta descriptor clones;
utility overflow sites stay intact.
Standalone MIDI Scenes uses the unused fill after its scene-mute helper. Early
compositor calls replay the stock instruction before the runtime is unpacked;
the appended loader area is reused by stock RAM and cannot hold this gate.

The original migration's MKII RAM-boot observation on 11 October applies to that
base, not to this port. Physical flashing, reboot and timing of this beta port
remain untested. The emulator exercised core-only and standalone MIDI Scenes on
both MKI and MKII. All four runs matched all 912 authored final pixels, lit the
expected 44/67 lamps on the correct channel with bounded levels, ended dark,
and handed over to the stock screen with identical LED levels, rows and colours.

The native matrix passed for core only, Repitch, Mini Verb, Tape Echo + Euclid,
Analog BD, Sidechain Compressor, USB Audio + Quantizer, standalone MIDI Scenes,
Airwindows Chorus and Poly8; the developer dynamic-loader Repitch path passed
as well. The authored startup package reproduced exactly with the macOS and
isolated Linux toolchains. GNU/browser startup links matched at both runtime bases, and the ROM
gate matched GNU placement. Every final image round-tripped through the original
firmware container without changing its tail or seed. Changed hooks and repeated
patching were rejected. The standalone live CC-cache table remained intact.

The current full repository check rejects the changed startup package while
Tape Echo retains evidence bound to the previous shared runtime. It reports a
stale `vector.json` builder-preservation record. The qualification gate and
existing owner exceptions have not been changed; release remains pending that
evidence review. SDK tests, lint and TypeScript checks passed independently.

![Outline-free beta docking animation, captured from MKII firmware](media/startup/beta-docking.gif)

[Native composition evidence](media/startup/beta-docking-native.json),
[core boot captures](media/startup/beta-docking-core.json) and
[standalone boot captures](media/startup/beta-docking-midi-scenes.json) contain
hashes and results only. Firmware and raw memory remain private.

Source, package regeneration and private-check commands are in the
[startup SDK](../sdk/runtime/startup/README.md#beta-docking-edition).

## Public graphic-table edition

The boot animation now traces the Modwerk frame clockwise, locks eight tiles
in from the center around the ring, and brings the ninth tile in with a short
comet tail. It reveals original geometric MODWERK lettering alongside the
assembly. The stock monochrome treatment, 2.8-second duration and both models'
LED choreography remain in place. The extra choreography uses the same 843
records; it adds no firmware bytes.

![Actual MKII firmware LCD capture of the Modwerk startup animation](media/startup/modwerk-startup.gif)

The preview uses complete frames read from the real firmware LCD plane. Its
final 600 ms hold is for reviewing the image; firmware timing is unchanged.
[Capture provenance](media/startup/capture.json) records the exact local image,
emulator and asset hashes. [Verification records](media/startup/verification.json)
bind the current sources and graphic bytes to the checks below. No firmware or
raw memory is published.

## Scope

Two original graphic tables are replaced: 5,058 bytes of particle records and
440 bytes of title ink. Boot, LCD renderer, LED and module instructions remain
byte-identical. Table extents and particle count are unchanged, with no added
flash/RAM allocation or sample-memory reservation. The startup artwork is
installed in static compositions, standalone MIDI Scenes, and the developer
dynamic-loader composition path. Both writes are guarded and checked before
any mutation.

See [the source and native encoder](../sdk/runtime/startup/README.md) and
`scripts/verify-startup-animation-native.mjs` for reproduction instructions.

## Passed checks

- Ten complete images matched the independent Python encoder byte for byte:
  core only, Repitch, Mini Verb, Tape Echo + Euclid, Analog BD, Sidechain
  Compressor, USB Audio + Quantizer, standalone MIDI Scenes, dynamic-loader
  Mini Verb, and direct static core composition with stock FX2.
- Against private complete-image baselines captured before the change, all ten
  final images had exactly the same length and identical bytes outside the
  two graphic tables, including every appended runtime byte.
- Both encoders rejected changed graphic tables; the browser rejected a
  repeated patch. Native guard failures created no partial output. Original
  inputs remained unchanged. Static graphics spans were disjoint from all
  other module/platform/logger writes in the tested profiles.
- All ten final images round-tripped through full firmware packaging with
  the owner's original local 1.40C container.
  Decoded MAIN bytes matched exactly; opaque tail and seed were preserved and
  the original firmware input remained unchanged.
- The standard emulator ran the full boot on MKI (core-only composition) and
  MKII (standalone MIDI Scenes) and reached normal playback after the animation.
  Complete-frame capture then recorded 70 MKI and 69 MKII frames. Both final
  LCD frames exactly matched all authored pixels, with identical PNG hashes.
- Twenty focused engine tests passed, including artwork extent/orientation,
  final silhouette, bounded delays, clockwise tile order and the late ninth
  tile/echo timing.
  On the focused PR checkout based on current `main`, all 1,191 repository
  tests in 180 files passed. ESLint, the full TypeScript check, SDK checks,
  generated-record checks and the production Vite bundle passed using
  Node 24.21.0 (`npm run check -- --base origin/main`).

## Limits

Physical startup/reboot and chip wall-clock timing remain untested. No loaded
project, Part save/reload, project save/load or restart retaining only card and
battery-backed RAM was exercised here. A boot to playback without a loaded
project does not establish any of those paths. The byte comparisons show that
this patch leaves module/runtime bytes intact; they do not upgrade earlier
stateful-module qualification or physical reports.

No hardware flashing or module qualification-status change was performed.

## Firmware name before the animation

Updates now use **ELEKLOADER** in the fixed ten-byte ELEK name field, including
standalone MIDI Scenes. The original panel boot font uses uppercase letter
codes; lowercase codes select symbols, patterns and filled blocks. The first
follow-up used `Elekloader`: its header was correct, but its glyphs were wrong.
The owner reported the malformed text on their device. This correction keeps
the same ten cells, with no extra firmware space or runtime changes.

The headless emulator ran the **original MKII panel character-drawing routine**
for the previous `OCTAMOD79 `, the broken `Elekloader`, and corrected
`ELEKLOADER`. Each of the 30 original calls returned. The captures below decode
the routine's actual LCD controller command/data writes, with all 80 columns
per name matched against the original local panel font. They are crops of the
ten observed name cells, enlarged at integer scale 8; no text is reconstructed.

Broken lowercase name:

![Actual original MKII panel routine output for Elekloader](media/startup/boot-name-lowercase.png)

Corrected uppercase name:

![Actual original MKII panel routine output for ELEKLOADER](media/startup/boot-name-fixed.png)

[Renderer and packaging verification](media/startup/boot-name-renderer-verification.json)
records the exact MAIN, emulator, panel and capture hashes. Reproduce on a host
where the reviewed local emulator runs:

```sh
python3 scripts/verify-boot-name-renderer.py \
  --image /private/path/decoded-MAIN.os \
  --emulator /private/path/ot_emu \
  --output /private/path/new-capture-directory
```

The checker uses a new empty disposable FAT16 card. It runs the unchanged
embedded panel instructions through the headless emulator's function-call
path, maps the original local font at the panel's own absolute address, seeds
the resident loader's page/cell cursor, and records the GPIO/LCD writes.
Firmware, font tables, card and raw logs remain private. The new checker needs
no Unicorn installation and does not change emulator or firmware instructions.

This is a **panel-renderer function capture**, not a complete resident-loader
boot. Standard Octemu/headless MAIN boot skips the resident loader, and Octemu
currently ignores its character protocol. MKI panel firmware/font is absent
from MAIN and was not emulated; the new physical rendering is still untested.
These limits do not negate the reproduced MKII lowercase glyph failure.

Native Python ELUP output matches browser packaging byte for byte for FM Synth,
standalone MIDI Scenes and dynamic-loader Mini Verb. Every MAIN hash still
matches its previously tested startup image; original inputs, opaque tail and
seed remain intact. Against the saved visitor baseline, the complete ELEK
container differs only in the ten name bytes. OS/runtime/DSP instructions,
artwork, extents and memory reservations remain unchanged.

Session regression tests cover validation/build reports and all ten header
bytes for Repitch, MIDI Scenes and USB Audio + Quantizer with both stock-FX2
choices. A separate letter-range assertion rejects accidental lowercase
branding. Individual module versions remain separate. The earlier
[header-only proof](media/startup/boot-name-verification.json) retains its
original names and hashes as historical packaging evidence, not glyph evidence.
