# MIDISC2.0 build verification

Version `0.2.5-experimental`; source `bkkbrls-del/midisc`
`4f9a89453fdcdd39a3cd57f010ffa489cac721cd`, `tools/midisc/release20.json`.
The native remixer still pins the old 8.2 author dependency; this release
cannot inherit that port's acceptance, relocation or selection matrix.

## Completed local checks

The author release recipe SHA-256 is
`a2dbe20d82de8bd3a4f010c1e94c4b2ebf080ca3f7203521053f747b52dc24a1`.
The local original MAIN OS is 1,112,560 bytes with SHA-256
`164f31224bf61181e3f50e7dec40df9afcae5b16dbf6e4c0d0cc5e986af0a84e`.
The author's 843 sparse writes were applied in a private network-disabled
macOS sandbox. The full result matched his pinned MAIN OS SHA-256:
`debb24090cada4be00bc70880136f14e813b0d3a9018b516f922d33671bd9b87`.

The converted stock-free recipe uses 85 disjoint guarded regions. It references
unchanged destination bytes and matching stock spans instead of retaining
their contents. Its 5,848 literal changed bytes and 3,179 locally reconstructed
bytes produce exactly the same full author image. Every protected destination,
inherited span, input and output is fingerprinted. The native adapter resolves only against local stock during private verification.
Source-build automation binds the recipe inventory without evaluating it.

The native adapter's 85 guarded Pokes were separately resolved and applied
inside the restricted sandbox. Their result equals the direct reconstruction
and the author's full MAIN hash; a changed base was refused. For the historical 0.2.3 draft, re-importing the
pinned raw author recipe with `scripts/import-midi-scenes-recipe.py` reproduces
the committed stock-free recipe SHA-256
`0172203121018ca77ec62cac038c8e5edf4b0070db20e0e213435180ff95b4ed`.

`scripts/verify-midi-scenes-native.mjs` compares the browser reconstruction
against that exact author identity, refuses modified stock and three corrupt
recipes, and verifies the original input is unchanged. It writes no firmware.
An actual in-app-browser worker repeated standalone reconstruction and changed
base/corrupt-guard rejection on 2 October 2026: full MAIN byte parity passed;
output bytes were not downloaded, uploaded or retained by the page.

Full standalone update packaging passed in Node and the actual browser worker
on 3 October 2026. The reviewed `scripts/native-container-oracle.c` with the
unchanged native firmware tool encoded the ELEK container; the SDK's independent
`tools/build/make_bin.py` encoded ELUP with the original stock seed. The browser
engine matched both full byte arrays. Version header: `MIDISC2.0`.
ELEK: 449,404 bytes, SHA-256
`569368499581905c33e9874b87678acd1c2fc571ca6171c0e20b3e39b74892f8`.
ELUP: 449,420 bytes, SHA-256
`d7c792e0ec9b28e1b674e92526b2fa9a8a8279655dbd66a7b59495e5d5c54007`.
Round-trip MAIN equality, corrupted/truncated update rejection and unchanged
input checks passed. [packaging.json](evidence/packaging.json) retains tool and
output identities only; private firmware outputs are removed after verification.

The same private diagnostic checks thirteen current selectable single-module
companions against the 2.0 fixed regions. Every companion overlaps at least
one author region. See [compatibility.json](evidence/compatibility.json).
This detects collisions; it does not approve a mixed configuration or establish
that removing those writes would preserve behavior. No overlap was bypassed.

Reproduce privately using Node 24:

```sh
node scripts/verify-midi-scenes-native.mjs /private/local/1.40C-MAIN.bin --compatibility
node scripts/verify-midi-scenes-packaging.mjs /private/local/OCTATRACK_OS1.40C.bin
python3 -B scripts/import-midi-scenes-recipe.py /private/local/release20.json /private/local/1.40C-MAIN.bin --output /private/local/source-recipe.json
```

Use the captured author pin and stock fingerprint. Keep native module/source
execution inside the documented network-disabled temporary sandbox; read
access is restricted to source/tools/local base and writes to the private work
directory. No firmware-dependent command runs during `npm run check`.

## Real OT UI

`scripts/capture-module-ui.py` drove the actual MIDISC2.0 image at the exact
hash above, using a reviewed local `ot_emu`, MKII panel, stopped transport,
empty disposable FAT card, 50 ms key down/up and integer scale 6. Eight
visually reviewed monochrome exports show channel setup, controller 74,
enabled CC1 at 0, Scene A held at 64, release back to 0, ARP, LFO and
CONTROL 2. The complete capture run was made on 3 October 2026.

```sh
python3 -B scripts/capture-module-ui.py --emulator /private/local/ot_emu \
  --image /private/local/mainos.bin \
  --image-sha256 debb24090cada4be00bc70880136f14e813b0d3a9018b516f922d33671bd9b87 \
  --key-ms 50 --plan /private/local/panel-plan.json --output /private/local/captures
```

The exact plan, emulator identity, image identity and PNG hashes are in
[media/capture.json](media/capture.json). No RAM patches or internal menu calls
were used to manufacture screens. CHAN remains OFF; no external MIDI receiver
or physical OT is connected. The CTRL 1 SETUP screen includes SCNCTRL5, a
version-specific difference that needs complete control documentation/testing.

## Measured emulator evidence

The explicitly requested emulator measurements are in
[evidence/emulator.md](evidence/emulator.md), with per-fixture counters in
[evidence/focused.json](evidence/focused.json) and exact tool/build identities
in [evidence/emulator.json](evidence/emulator.json). The private harness measures
360 helper fixtures, compares measurement/reference behavior, drives the actual
panel and playback, and records audio stems and MIDI UART0 counters. It also
verifies the 73,728-byte scratch boundary change at two independent operands.
Read the workload/coverage and timing-model limits before interpreting maxima.
No firmware-dependent command was added to application checks.

The promoted version `0.2.4-experimental` retains the identical author MAIN and
screenshot pixels. The unchanged emulator reports retain their historical
`0.2.3-experimental` identity; the new build approval binds this release.

## Scene mute fix (0.2.5)

Issue #329: stock FUNC + SCENE A/B sets the bytes `0x80000006` / `0x80000007`
to 1, and the stock scene morph then ignores that side. MIDISC2.0 never read
either byte. `patch.py` (`SCENE_MUTE`) and `src/engine/midi-scenes-patch.ts`
(`MIDI_SCENES_SCENE_MUTE`) apply the same guarded rows after the author MAIN
is verified (`debb2409…`), producing release MAIN `ed7ccf4f…`:

- The crossfader mix (`0x400d2928`), endpoint snapshot (`0x400d7092`) and XF
  cache key (`0x400d6884`) call helpers that load a muted side's scene as
  unassigned, so a mute toggle also invalidates the cached context.
- The mix's null scene pointer paths (`0x400d2984`, `0x400d299e`) loaded -1
  rather than the 0xff "no lock" marker, so an unassigned side mixed as an
  out-of-range lock. Their branches now reach stubs that load 0xff.
- When neither side locks a parameter, the author writes its base value
  without sending a CC (`0x400d69d2`). With either mute active it now takes
  the author's send-if-changed path, so muting the last scene sends the
  static value, as stock does.
- Scene-held edit paths are unchanged.

The helpers and stubs occupy 114 of 116 bytes at `0x400d738c` and 26 of 140
bytes at `0x400d7470`, two unreferenced 0xff runs inside the author's main
cave. Nothing in the patched image refers into either run, and stock leaves
the area unused.

### Emulator checks (9 October 2026, local original 1.40C, no firmware kept)

- Native `patch.apply()` and the browser `reconstructMidiScenes()` both give
  `ed7ccf4f…`; the per-region native pokes match the whole image.
- The full standalone browser composition (logger, platform and startup
  writes) keeps every scene-mute row and reports no overlapping guard.
- The crossfader entry (`0x400d28c8`) was run in `ot_emu` with one CC lock
  (Scene A 100, Scene B 20, base 50) at crossfader 0, 64 and 127. With no
  mute the output equals 0.2.4. For each of the four mute combinations, the
  output equals the author image with that scene blank (no locks). On 0.2.4
  the mute flags changed nothing, reproducing the report.
- A persistent sequence (A 0, B 127, base 64, crossfader fixed) sends one CC
  for: no mute, mute B, then mute A (the static 64), and unmuting A. Moving
  the crossfader with both muted sends none.
- The retained 360-case `probe.cpp` passes with results identical to 0.2.4.
  The focused crossfader maximum rises by 816 modeled cycles (47,642 →
  48,458, about 1.7%), mostly one mute test per unlocked parameter. Observed
  stack stays 156 bytes.
- All eight LCD captures from `ed7ccf4f…` are pixel-identical to 0.2.4.

The local emulator libraries were not checked against `native-inputs.json`.
Its 0.2.4 baseline matches the recorded 47,642-cycle and 156-byte figures.
These are emulator observations, not hardware timing.

### Contributor hardware tests (reported)

Both runs were by @JamCones on an Octatrack MKII, with MIDI out looped to
MIDI in controlling CC 42 (FX2) on channel 1: static value 64, Scene A 0,
Scene B 127. These are contributor-reported results, not measurements.

**10 October 2026, final 0.2.5 build** (release MAIN `ed7ccf4f…`; private
update file SHA-256 `b8cff4d8ffe1c2c45b0b382ca6a1853d1ad4781d7b556c4ee30faa7119e27943`):
all fourteen checks passed.

- Morph with no mutes, A muted and B muted, at full A, ¼, middle and full B.
- Muting the last unmuted scene, in both orders and at both ends, sends the
  static value; with both muted the crossfader sends no MIDI.
- Unmuting in both orders resumes the expected morph.
- With the static value changed to 100, muting the last scene sends 100.
- Trig locks under scene mute behave as stock.
- A second CC with no scene locks is not sent when scenes are muted or
  unmuted.
- Two MIDI tracks each return to their own static value.
- The same behaviour with the sequencer playing, including notes at full A
  or full B with that side muted.
- Editing a muted scene's lock while holding its key.
- Part save/reload, project save/load and reboot.
- 30 minutes of playback with looping audio, crossfader moves and mute
  toggles.

**9 October 2026, first candidate** (release MAIN `c7fb7d5b…`, without the
`0x400d69d2` change): everything passed except muting the last unmuted
scene, which left the CC at its morphed value. The final build fixes this.

Observed separately: with no scene muted, editing a scene lock while holding
its key at that crossfader end does not send the CC immediately, unlike
stock audio scenes. With no mute active, every row above leaves the author's
values unchanged, so this is existing MIDISC2.0 behaviour outside #329.

## Hardware report

The owner accepts reported operation on a real unit; see
[evidence/hardware.md](evidence/hardware.md). No maximum-load, cycle, stack,
canary or direct physical-unit measurement was supplied to this task. Keep
reported evidence distinct from verified measured hardware qualification.

## Remaining evidence limits

The emulator observations do not bound hardware timing or all memory use.
SCNCTRL5, arbitrary control endpoints and persistence paths are not fully
qualified. The owner's exact build approval below accepts the documented
hardware timing and full memory unknowns without changing those claims.
The standalone restriction resolves the known composition collisions.
`qualification.example.json` retains unknown results. The eleven-module
baseline and two existing utility waivers remain untouched.

## Exact owner-approved build release

On 3 October 2026 the owner explicitly approved enabling firmware building
without hardware timing and complete memory bounds. This is recorded in
[evidence/build-approval.json](evidence/build-approval.json). It covered only
`0.2.4-experimental`, that complete module folder and the unchanged author MAIN;
its pinning record was replaced by the 0.2.5 record below and stays in git
history. The historical `0.2.3-experimental` measurements remain labelled as measured;
metadata-only promotion changes no author instructions or image identity.
Unknown timing and full memory bounds remain unknown. The original monochrome
captures identify the same image. Native 8.2 sources are archived outside
module discovery; browser/native proofs for that port are not reused here.

On 10 October 2026 the owner approved publishing `0.2.5-experimental` with
"approved without concrete hardware evidence." `sdk/midi-scenes-build-approval.json`
is an owner-approved update bound to this version and its native source. It waives
only current-build hardware evidence. The contributor's MKII checks above ran on the
pre-#392 shared runtime, so they are reported evidence for the MIDI Scenes code, not a
verified result for the shipped image. Hardware timing and complete memory bounds stay
unknown, as stated above. Software verification, packaging and worker parity, the
actual LCD captures and the documentation remain mandatory.

The supported configuration contains only MIDI Scenes. The shared worker
reconstructs the guarded author recipe before existing ELEK/ELUP packaging,
uses version header MIDISC2.0, and refuses every mixed configuration before
writing bytes. It applies no chooser, generic runtime or DSP remixer overlays.
Stock remains local and is never present in source-build automation. This
explicit owner approval does not alter the frozen baseline, utility waivers
or requirements for other modules or future MIDI Scenes versions.

## Shared production-worker proof

The private `scripts/verify-midi-scenes-worker.html` harness imports the actual
production worker, reads local original 1.40C through its file picker and saves
no firmware. On 3 October the validate/build requests passed with both stock
menu options; MAIN and full update identities matched the independent native
oracles above. All thirteen mixed selections, modified and truncated bases,
a build after failed inspection and a build after clear were refused. The
input remained unchanged. The final release identities and this result are in
[evidence/build-approval.json](evidence/build-approval.json). This developer
harness is excluded from the production build and ordinary application checks.
