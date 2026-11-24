# Midi Mode 2 — upstream review draft

**Current upstream experiment: 0.0.20.** Read [BANK_LOAD_EVENTS.md](BANK_LOAD_EVENTS.md) for the paired-event adapter, failure-path host checks and explicit result-less-hook limitations. It builds with `--shared-bank-events`; hardware/native-load qualification and public catalogue registration remain pending. [UPSTREAM_REVIEW.md](UPSTREAM_REVIEW.md) retains the initial submission status.

**Historical local-fork candidate: 0.0.19-experimental.** This compatibility update targets the published 5 November base `462fbd2b…` and its updated Sidechain Compressor / Mute Modes packages. The authored MIDI package is byte-identical to 0.0.18; all 24 patch sites and 25 stock-copy guards match the new base and have no declared base-owned overlap. All eight installer selections and the actual host C loader lifecycle passed offline. Hardware execution and restart on this base are **not tested**. See [the hardware test steps](HARDWARE_TEST_0.0.19.md).

Historical 0.0.18 base/package pins are retained in `evidence/compatibility-0.0.18.json`. Its physical measurements and reports remain tied to that older base. The independent 0.0.13 / label-only 0.0.17 fixture remains unchanged.

Unqualified development draft. A stock-free USB trial package can be compiled
by the local app; no public catalogue entry or release is added. Hardware and
saved-project persistence are not qualified. Use only a disposable test project
for trials. The local page offers explicit Keep, removal and restart checks;
it does not flash firmware. The user reported restoration and working controls on 0.0.4
after restart; 0.0.7 bank overrides have not been tested on hardware; independently bound hardware qualification remains outstanding.

The prototype replaces either MIDI CONTROL 1 PB/AT position with an
independent CC 0–127 assignment per MIDI track. Zero in each assignment byte
means stock PB/AT; 1–128 encodes CC 0–127. Existing CC1–10 retain their storage.
The proposed assignments belong to each Part, matching stock CC assignments.

Stock 1.40C already has six CONTROL 1 SETUP bytes per MIDI track, although
SETUP hides its first two positions. This prototype exposes those positions
and routes mapped values through the stock CC sender, including its enable,
channel, mute and duplicate-value handling. It creates no transport clock.
The stopped-panel gate has measured the two CC positions, stock controls and
STK restoration. Sequencing, persistence and hardware runtime integration remain
unqualified. See TESTING.md.

## Name, copy and artwork

The presentation name is **Midi Mode 2**. The installed development identity
remains `midi-cc-slots`; no native code or package hash changes for the name.
The [proposed module copy](presentation/COPY.md),
[original CC Map-style artwork](presentation/thumbnail.svg) and
[reviewed CC and naming emulator gallery](media/README.md) are ready for review.
They do not register or publish the module.

## Version 0.0.16: USB-capable card installer

The local configuration builder now offers a ZIP containing the unchanged
published USB base plus MODWERK0.SET and MODWERK1.SET with the selected original
USB packages. This supersedes the C15 baked-card download. The loader restores
the set at boot and manages later USB updates/removal; no second copy is baked
into the base. Use [USB_CARD_INSTALLER.md](USB_CARD_INSTALLER.md). This remains
a private candidate pending hardware/release qualification. The C14/C15 evidence
stays bound to those earlier builds.

## Version 0.0.15: local combined card builds

The [local combined card guide](COMBINED_CARD.md) explains the normal configuration
build flow with Sidechain Compressor, Play Modes and Mute Modes, the separate
MIDI2 C15 packaging identity and the omitted USB loader. The existing 0.0.13
USB listing stays unchanged. Other combinations and combined hardware behavior
remain unqualified. The user reported standalone MIDI2-C14 working and all
settings retained after a physical power cycle; that report is recorded separately
in TESTING.md and does not qualify this new integration.

## Version 0.0.14: standalone card candidate

A private [standalone card build and hardware test guide](CARD_TEST.md) is now
available. It translates the exact reviewed 0.0.13 implementation into the
pinned Elekloader core’s native sections and event tables, adds shared Modwerk
startup artwork, and produces BIN/SYX from original 1.40C. The candidate boots
without a saved runtime set. It replaces the installed firmware and omits other
modules and the USB loader. Hardware card qualification and ordinary mixed-module
composition remain pending. The local USB page stays on unchanged 0.0.13.

## Version 0.0.13: working and saved channel maps

Valid working and stored bank files can contain different MIDI channels. The
previous check rejected that state as SAVE PROJECT FIRST, even after saving.
The update records each file’s original map, applies confirmed replacement to
both, and restores each map separately on cancellation or interruption. File
checksums, matching non-channel data and the working-versus-native check remain.
Other preflight failures now show CHECK FAILED with a bank code.

Try the MIDI controls and **Keep installed before INIT**, so restart restores
the version that can recover an unfinished setup. Older versions refuse the
new pending journal; completed/cancelled operations leave compatible terminal
records. Back up and save normally, then FUNC + D and YES to replace all banks.
After Save to New, separately complete PROJECT → SAVE PROJECT in the new
destination before INIT. Save to New can leave only working bank files; INIT
requires the stored copies created by a full project save. No physical 0.0.13
result is claimed.

## Version 0.0.12: explicitly replace a previous setup

INIT now works on an initialized project. Set Bank A / Part 1 names and channels,
back up and save normally, then hold FUNC and click D at INIT. The prompt
**REPLACE ALL? YES/NO** asks before replacing every bank’s names and all current
and saved Part channels. YES uses Bank A / Part 1 exactly, including empty names
and OFF channels; NO leaves the previous setup. NO also cancels safely during
progress. Wait for MIDI SETUP SAVED. Ordinary bank changes and restart still
never reapply defaults. The first initialization retains legacy overrides;
only a deliberately confirmed repeat replaces them.

## Version 0.0.11: centered INIT and a visible gesture

INIT now sits inside encoder D’s cell beneath CHAN, aligned with the neighboring
SBnk and NAME captions. The two-line FN+ / PUSH hint means hold FUNC and click D.
This changes only the setup drawing; storage, initialization and cancellation
behavior are unchanged. An initialized project does not need Apply again.

## Version 0.0.10: page browsing during Apply

The user clarified that 0.0.9 completed, copied MIDI channel 6 correctly into
Bank B, and returned control after more than ten seconds. The follow-up permits
bare SRC/AMP/LFO/FX page browsing while Apply runs; editing, modified shortcuts,
playback and bank changes remain held. NO still cancels safely. Bank CRC work
uses one lookup per byte instead of two, retaining all verification and rollback
checks. Physical timing of 0.0.10 remains unmeasured. An already initialized
project does not need Apply again.

## Version 0.0.9: FUNC + D, progress and cancellation

The reported physical 0.0.8 initialization failed and rolled back. A read-only
card inspection found an aborted journal, uninitialized marker, and valid bank
checksums and original non-channel fingerprints. The saved set contained the
exact 0.0.8 package. Its low-level physical failure cause is not confirmed;
the same project succeeds privately in the emulator.

For this experimental retest, save a backed-up test project normally, then
hold FUNC and push encoder D at APPLY in MIDI SRC SETUP. No typed confirmation.
Keep FUNC held through the encoder click/release. Progress identifies the bank
being checked, applied or restored. NO cancels at the next safe boundary;
STOP remains available. Wait for MIDI SETUP SAVED before testing banks.

Apply and rollback yield between bank pairs. A live failure restores in place
without automatically reloading the project and retains a stage/bank failure
code. Interrupted boot recovery can still reload the native project after
repair. Sector batches close the read descriptor before writing the same file.
Finish or cancel Apply before Undo/removal or another module change.

The exact private project-copy check includes the sixth MIDI name, all eight
Bank B channels, current/saved Parts on card, and actual outgoing controls on
MIDI channel 6. The local 0.0.9 package is software-tested, not a hardware-qualified
fix. Report any APPLY FAILED code before retrying. [Details](template/README.md).

The remaining version sections are historical behavior and evidence.

## Version 0.0.8: initialize once, then save native channels

Back up a disposable project before testing. Set Bank A / Part 1 names and
channels, stop transport and recorders, and save the project normally. In
MIDI SRC SETUP, click D at INIT/PUSH, type APPLY and confirm YES. NO cancels.
Wait for MIDI SETUP SAVED before continuing. F still opens NAME/PUSH.

INIT snapshots inherited names and fills native current/saved Parts once,
retaining legacy saved overrides, including OFF. Initialize before making new
bank-specific migration edits, because old saved channel profiles remain
legacy override authority. After completion, banks keep independent names
and native channels; bank/pattern changes and restart never remap defaults.
Save channel edits normally. Names autosave while stopped; wait for MIDI
PROFILE SAVED. Native Save to New copies names and the initialized marker.

Keep all `MIDI4_*.DAT` files with full project backups. Two hold names/marker;
two hold recovery intents. Old MIDI3/MIDI2 files import read-only. Interrupted,
uncommitted INIT restores its recorded previous map and reloads the project;
it never computes new Bank A defaults during recovery. Undo/removal restores
module code, not completed bank edits. Restore a backup to undo those edits.

The local listing builds the exact experimental package recorded in
`local-build.json`. It requires ABI 8, 24 sites and 22 stock copies. Its guarded
lifecycle sites still require owner-reviewed shared SDK events for publication.
[Implementation and limits](template/README.md). Emulator checks passed;
physical installation/restart, protected-template copy and resident dispatch
are unqualified. Use the installed base and a backed-up test project.

The sections below describe historical versions, not 0.0.8 channel behavior.

## Version 0.0.7 bank name defaults and overrides

**Bank 1 supplies eight default names. Renaming in Banks 2–16 changes only
that bank**, across all four of its Parts. Unedited tracks continue to follow
Bank 1, including later changes to its defaults. Clearing a name in another
bank creates an explicit blank override (showing the native channel header),
not a return to inheritance. NO cancels without creating an override.
The NAME/PUSH entry and ten-character editor are unchanged.

The new profile uses `MIDI3_0.DAT` and `MIDI3_1.DAT`, two 4,096-byte
checkpoints in the project folder. Copy both with backups. On first use,
existing 0.0.6 `MIDI2_*.DAT` profiles import their shared names as Bank 1's
defaults and retain all channel defaults/overrides. Both old files remain
unchanged. Once a new profile exists it takes precedence; importing again
must not erase later bank edits. A new module trial can create these files;
Undo restores module code, not entered profile data. Downgrading to 0.0.6
uses the retained old files and cannot display the newer bank overrides.

Stop transport and recorders and wait for **MIDI PROFILE SAVED**. Keep still
installs the module separately; wait for **Card save confirmed** before the
first restart test. Channel behavior remains Bank 1, Part 1 defaults with
independent bank/Part overrides. Native Save As/copy/reload integration remains
unqualified; back up the sidecars explicitly and test on a disposable project.

The user reported names working in the earlier build and observed the previous
shared-name behavior across Banks 1 and 2. Those reports do not qualify the new
bank override build or independently establish the device/package identity.

## Earlier version 0.0.6 project-profile test

Eight ten-character names are shared across the project. Double-tap MIDI SRC,
click F (NAME/PUSH), enter a name and confirm with YES. Channel defaults come
from **Bank 1, Part 1**. On first visiting a bank/Part outside Bank 1, OFF channels
inherit those defaults; existing nonzero channels are preserved. Initialized
bank/Part profiles retain independent overrides, including OFF. Later default
changes do not overwrite previously initialized profiles.

Names and channel profiles autosave to `MIDI2_0.DAT` and `MIDI2_1.DAT` in the
current project folder while transport and recorders are stopped. Wait for
**MIDI PROFILE SAVED** before switching off. A failed write reports **MIDI SAVE
FAILED** and retains the preceding checkpoint. Copy both files when backing up
or moving a project; do not delete them expecting native project saves to
contain this data. A native Save As/copy may omit them. Same-project reload,
Part copy/clear and native project save/rollback integration remain unqualified;
shared names deliberately do not belong to a Part. Changing project folders
loads that project's profile instead of carrying the previous names across.

Use a disposable project for hardware tests. Keep installs the module itself;
profile files store entered names and channel settings independently. Ordinary
CC assignments still use stock Part/project saving. The native emulator card
restart test supplies the base UI callback through a declared private shim;
it is not evidence of a physical reboot or the full base/companion set.

For an already installed same-ID draft, open the local updater below and choose
**Try updated module**. Merely adding an already installed module does not
replace its package.

## Earlier version 0.0.5 naming test

The earlier local test version combined the existing CC behavior with temporary
MIDI track names. Double-tap SRC on a MIDI track, then click F at NAME/PUSH.
Use the stock name editor (ten characters), YES to confirm or NO to cancel.
PUSH shares the neighboring value's vertical baseline. A nonempty name
replaces the normal MIDI channel header; CHAN remains editable in SRC SETUP.

Names are volatile and only indexed by the current Part and MIDI track.
They reset when the module is replaced or restarted. Bank/project identity,
save/load/reload and Part copy/clear are not integrated; stay in one disposable
test project and bank. Keep installs the module, not the entered names.

To replace an earlier same-ID draft, open
`http://127.0.0.1:5173/?preview=midi-cc-slots`, build/read modules and choose
**Try updated module**. Verify CC behavior and naming before Keep. The normal
module-set review cannot distinguish these same-ID individual package versions
from its inventory; the module detail page links to this explicit updater.

## Controls and usage

On MKII, select a MIDI track and press FX1 for CONTROL 1. Double-tap FX1 to
open MIDI CTRL 1 SETUP. The stock FUNC + FX1 shortcut also opens this menu.

Click encoder A to switch its PB position to CC mode, or encoder B to switch
its AT position. Each switches independently. The SETUP caption follows the
mode: PB or AT for native, CC for mapped. STK means native behavior; a number
below CC is the assignment. A click changes the mode immediately.

In CC mode, turn that encoder to choose CC 0–127 and press YES to confirm the
number. Turning alone cannot leave STK or switch back to it at the bottom of
the CC range. Click again to restore PB or AT. Switching into CC mode starts
at CC0; the previous CC number is not remembered across a return to STK.

Return to CONTROL 1 with FX1. Enable each value with the normal FUNC + encoder
press and turn it to send values. Ordinary main-page encoder clicks retain
their stock behavior. On both main CONTROL pages, each CC header is its
assigned number (0–127),
not a CC1–CC10 slot name. Remapped PB/AT headers also show their CC number;
native PB and AT keep their names. Short numeric headers and the two-letter
SETUP captions fit fully inside the stock highlight. Values stay ordinary
0–127 bytes.

Build private experiments only, using output folders outside every checkout:

```sh
python3 sdk/drafts/midi-cc-slots/build_probe.py --stock /private/local/MAIN.bin --output /private/local/cc-candidate
python3 sdk/drafts/midi-cc-slots/build_monitor.py --native /local/octabam --build /local/emulator-build --output /private/local/cc-monitor
python3 sdk/drafts/midi-cc-slots/verify_panel.py --candidate /private/local/cc-candidate/candidate.private.bin --emulator /private/local/cc-monitor/ot_emu --output /private/local/cc-panel
```

The monitor builds only a private CLI adapter against the selected emulator's
existing libraries. Its extra command reads UART0 output; it neither injects
MIDI nor edits firmware state. Inputs and library fingerprints are recorded.
The panel gate uses real double-taps, keys and encoder clicks, reads channel
bytes to correct stock encoder acceleration, and decodes MIDI running status.
It covers mode clicks, held-encoder fast editing and the full controller
range. Add `--sequencer` to include its two playback-lock cases.

## Local app, installation and removal

For the normal local catalogue, set `VITE_LOCAL_CC_SLOTS=1` in the checkout's
ignored `.env.local` and start the development server. Open Modules → MIDI & USB
and choose **Midi Mode 2**, marked **Local draft**, or open
`http://127.0.0.1:5173/module/midi-cc-slots/`. Add it to your module set, then
use Your Octatrack → Sync to Octatrack to review, trial and explicitly Keep.
An already installed `f36a496d` is recognized as the same module. Preserve
other selected modules when reviewing the set.

This overlay and its on-demand, hash-verified package endpoint are development
only. Production builds do not register the draft. Card firmware builds refuse
sets containing this draft with instructions to use USB. The public catalogue
and native card composer remain unchanged. The diagnostic page below remains
available for detailed restart checks.

Use Node 24, Python 3.12+ and `m68k-elf` binutils on PATH. From this checkout:

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:5173/?preview=midi-cc-slots` in a WebUSB-capable
browser. Exit USB DISK MODE after ejecting the card. Choose **Connect Octatrack**,
then **Build draft and read installed modules**. Review the base digest,
installed modules and draft package digest. **Start temporary USB trial**
adds only this draft and runs the base self-test through the existing link.
The base rejects conflicting patches. Test the controls and outgoing MIDI,
then choose **Undo trial** or **Keep installed**. Do not use your working project
for qualification. Keep saves the complete running module set to the CF card;
use the installed Modwerk base, not a temporarily RAM-booted base. Wait for
**Card save confirmed** before switching off. A missing or failed save status
does not count as success; leave the unit on, check its card and choose
**Check card save** again.

After a confirmed save, power-cycle manually, reconnect and choose **Check after
restart**. This requires the same base, the base’s startup-restoration result,
and the reviewed module IDs/layouts including companions. Browser metadata
survives a page refresh; it is not a backup or a readback of package bytes.
A successful check still needs a front-panel/MIDI check on a test project.

To remove the feature, build/read modules again, choose **Try removing MIDI CC
Slots**, check native PB/AT behavior, then **Keep removal**. Repeat the card-save
and restart checks. Only this module is changed; companions must remain.
Keep installs the feature, while CC assignments use the normal Octatrack
Part/project save workflow, which remains unqualified for this draft.

The route and compiler endpoint exist only in the development server. The
endpoint compiles original source into a temporary directory, returns a
stock-free ABI 7 package and removes its temporary files. It accepts no
firmware input. The compiler refuses source changes whose package digest differs from the
last software-verified local build. The app checks package identity, connected loader capabilities
and an inventory snapshot tied to the base and running set before sending.
It sends only one module change, with an explicit tested-trial Keep or Undo.
Keep uses the existing base’s whole-set card persistence; the page confirms
the diagnostic save result rather than assuming a resolved Keep call saved.
It never writes firmware.
Hardware support is checked on the connected unit, not inferred from its
firmware filename. Unknown or insufficient capabilities block the trial.

To reproduce the package and private software proofs:

```sh
python3 -B sdk/drafts/midi-cc-slots/build_runtime.py --profile --output /private/local/cc.mwrm --receipt /private/local/cc-symbols.json
python3 -B sdk/drafts/midi-cc-slots/verify_runtime.py --profile --external --package /private/local/cc.mwrm --stock /private/local/MAIN.bin --output /private/local/cc-runtime-proof
python3 -B sdk/drafts/midi-cc-slots/verify_loader.py --package /private/local/cc.mwrm --main /private/local/MAIN.bin
python3 -B sdk/drafts/midi-cc-slots/verify_persistence.py --package /private/local/cc.mwrm --main /private/local/MAIN.bin
```

`verify_runtime.py` can also check every site/copy guard against a privately
decoded user build with `--installed-main`. It checks direct overlap with the
current app base's patch sites and scans literal code for stock overlaps.
`verify_loader.py` uses the actual C loader with host machine glue to test the
exact package's publication, Undo, repeat install, removal and reclamation;
it does not execute ColdFire code, model real tasks or establish hardware safety.
`verify_persistence.py` also compiles the real saved-set implementation, keeps
the exact package in simulated files and restores it in fresh processes. It
covers removal/restart and failed-write fallback while preserving a synthetic
companion. It does not exercise physical card I/O or establish reboot behavior
on a unit.

## Compatibility and limitations

The emulator prototype patches stock sites directly. The relocatable USB
package uses guarded private sites and hash-backed stock copies; it does not claim the emulator code cave on a unit. No current base
event or direct base write overlaps those sites. The user reported the controls and display working on hardware, without an
independently read build identity. On-device
install/self-test/Undo/removal and persistence still need exact-build testing. Full
release metadata, public mixed-module card composition and Keep qualification remain outstanding.
An opt-in local development listing is available; no public catalogue entry is added.
No compatibility with MIDI Scenes or other modules is established merely
because the candidate hook addresses do not overlap their current recipes.
Same-channel competing tracks and mixed PB/CC assignments need explicit tests.

## Authorship and licences

Original experimental adapters: Cooper Scobey, MIT. Stock routines and tables
remain private. Build-time replay spans must be read from the user's own
verified image; they must never be copied into the repository or uploaded.

## Screens and audio

Five actual MKII emulator LCD captures and reviewed captions are in
[media/README.md](media/README.md), with sanitized source/image/package provenance.
Firmware, raw LCD/RAM planes and capture working files stay private.
No receiver audio or physical-device capture.


For the project profile, `--profile` is required; omitting it deliberately
reproduces the earlier 0.0.5 volatile-naming package. Run the core test with
`python3 -B -m unittest sdk.tests.test_midi_cc_slots_profile`. The native card
probe accepts `--emulator`, `--candidate`, `--receipt`, `--origin`, `--stock`
and a new private `--output` directory; use an origin from reconstruction.
It creates its own scratch card and never accesses a connected instrument.


Version 0.0.7 exceeds the small stock firmware zero cave. Its private native
probe therefore boots stock, verifies an unused RAM region and all site guards,
then publishes the exact relocated module image and sites from the reconstruction
fixture. Pass `--fixture /private/.../fixture-47e00000.private.json` and
`--origin 0x47e00000` to the native verifiers, using stock MAIN as `--candidate`.
The fixture contains initialization/publication only; name and channel edits
still use panel input. It is an isolated runtime publication simulation, not the
resident loader or hardware. The actual C-loader lifecycle is tested separately.


The normal local listing is `/module/midi-cc-slots/`. Its naming walkthrough
shows NAME/PUSH, BASS in the editor, Bank 2's LEAD override and Bank 1's BASS
retained afterward. These four 0.0.7 emulator images have separate provenance
in `media/capture-names.json`; earlier CC captures retain their original version.
The firmware package is unchanged by this documentation update.

## USB package replacement test (0.0.17-usb-test)

The development-only [USB update test](USB_UPDATE_TEST.md) provides the exact
0.0.13 original and a separately pinned label-only test revision. Open
`http://127.0.0.1:5173/?preview=midi-usb-update`. It checks trial/Undo/Keep and
fresh-start package identities while preserving companions; neither the ordinary
0.0.13 catalogue package nor C16 installer changes. This is a lifecycle fixture,
not a new MIDI behavior release.

## Current upstream integration

The 0.0.18 installer candidate uses the current published USB base; its review
is independent of historical C15 native composition. The older 0.0.13 MIDI
package and the 0.0.17 lifecycle test remain pinned separately. The test page retains the
older tested base and companion hashes; it does not silently upgrade hardware.
See [release measurements](MEASUREMENTS.md), [local site setup](LOCAL_SITE.md), [storage lessons](HARDWARE_NOTES.md) and
[installer instructions](USB_CARD_INSTALLER.md). The working C14/C16 files remain
private and unchanged. New-base hardware qualification remains pending.
