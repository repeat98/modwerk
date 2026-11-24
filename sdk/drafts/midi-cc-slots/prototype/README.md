# One-time project template experiment

Private emulator research only. The local site continues to build 0.0.7.
No new gesture or installable release is exposed by this experiment.

The approved behavior is an explicit application of Bank A / Part 1 to all
16 banks and four Parts, with independent names and channels afterward.
Normal bank/pattern changes and boot must never reapply the template.
Channels then belong to stock bank storage, including saved Part copies;
the extension stores names, not a competing channel authority.

## Proposed shared lifecycle events

Before production integration, propose owner-reviewed SDK notifications for
successful Save to New (source/destination identity, success/failure and an
engine-task completion boundary) and project activation/reload. Existing
project-line events do not identify a completed project clone. A directory
change alone must never imply cloning. Do not depend on Octakit or patch a
site it owns: its lifecycle source is research evidence only.

The private native fixture can wrap the stock Save to New bank-writer call
at 0x4008505c, guarded against the supplied stock image. This is a simulated
future event, not a public hook or a compatible runtime package.

The staged-card initializer tests bank serialization separately from an
on-device action. It writes only a new private destination, validates all
16 bank checksums/tags first, initializes current and saved Parts, freezes
bank names, and records a prototype marker. It is not an on-device atomic
transaction. Missing/damaged banks or profiles must fail without changing
the source. Production needs interrupted-initialization recovery, an explicit
UI action, existing-project migration and exact hardware qualification.

The alternative profile core loads/saves names but never restores channels.
The Save to New callback requires the confirmed source identity to match the
loaded profile and checkpoints names into the confirmed destination; ordinary
project loading still clears/reloads project-local state. The private native
fixture supplies the source identity before invoking stock Save to New. This
simulates the proposed shared event; it does not discover that identity through
a production SDK notification.
Save failure is reported, not silently treated as a successful name copy.

## Reproduce privately

Use a card produced by the existing `verify_profile.py --gallery` test (its
final Bank A name is BASS2 and first channel is 2). No personal project is
needed. With the workspace ColdFire tools available:

```sh
python3 -B sdk/drafts/midi-cc-slots/prototype/build.py --profile \
  --output PRIVATE_BUILD/trial.mwrm --receipt PRIVATE_BUILD/symbols.json
python3 -B sdk/drafts/midi-cc-slots/verify_runtime.py --profile --external \
  --package PRIVATE_BUILD/trial.mwrm --stock PRIVATE_STOCK_MAIN \
  --output PRIVATE_BUILD/reconstruction
python3 -B sdk/drafts/midi-cc-slots/prototype/verify.py \
  --emulator PRIVATE_EMULATOR --stock PRIVATE_STOCK_MAIN \
  --source-card PRIVATE_GALLERY_CARD --build PRIVATE_BUILD --output NEW_PRIVATE_RUN
python3 -B -m unittest sdk.tests.test_midi_template_prototype \
  sdk.tests.test_midi_cc_slots_profile
```

Each output directory must be new and outside Git. The native run stages all
banks, edits via actual panel events, saves through stock project operations,
and restarts in fresh emulator processes. Card serialization, UI-cache state,
and transmitted MIDI are separate assertions. A selected-bank UI byte alone
does not establish the active MIDI channel. Check the native Part field and
the actual outgoing message before calling a cached UI-lane value a failure.
