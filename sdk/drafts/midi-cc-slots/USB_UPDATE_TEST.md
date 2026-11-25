# Midi Mode 2 — private USB replacement test

Open <http://127.0.0.1:5173/?preview=midi-usb-update> in Chrome or Edge. Close
other connected Modwerk tabs, leave USB DISK MODE, stop transport and use a
backed-up test project. Complete or cancel project INIT before changing modules.
This page never starts INIT, flashes the base, or edits project files itself.

The exact original 0.0.13 package and test 0.0.17-usb-test package have the same
module ID/layout and executable/image/hook/site/copy/relocation bytes. Only the
16-byte package display name changes from `MIDI CC SLOTS` to `MIDI2 TEST 17`.
The latter appears in the page's read-back inventory; no panel control changes.
Version 0.0.17 is a label-only lifecycle fixture, not a new functional release.
There is no embedded semantic version field in this MWRM format; exact package
hashes, rather than a browser version label, establish the revision.

- Original SHA-256: `086fc3c73468bd58db823bf2857106ebe05f7d1197fd226c595d4139eeca000a`
- Test SHA-256: `1d740235d843dbb6ab499809b7c6f5c77d85b08b1220cff1ce7504e64415e83e`
- Both: 33,386 bytes; module `f36a496d`, layout 1, ABI 8.
- Required published base: `0c5934e1bea411fc43143a75ee2a0fcf1c09a71b8c386732ed7526517d3b0846`.

## Hardware steps

1. Connect Octatrack, then **Prepare and read installed version**. It compiles
   and pins both packages and checks the exact runtime set. The published base
   does not export saved files: the page uses reviewed package hashes and the
   device’s MWS1 digest. On an export-capable base it also validates both saved
   files and compares the newest saved set to the runtime set. Expect
   `Confirmed MIDI CC SLOTS` and all your companions. No package has been sent.
2. Click **Trial test revision**. Wait for `Trial verified: MIDI2 TEST 17`.
   Self-test must pass and the inventory must contain the expected test name
   and every companion. Briefly check names, channels and CC controls on your
   test project. Do not run INIT.
3. Click **Undo trial**. Expect `Undo verified: MIDI CC SLOTS`. The exact original
   package and every companion hash must return. This step does not Keep.
4. Click **Trial test revision** again. Check controls, then **Keep revision**.
   Wait for `Card save confirmed: MIDI2 TEST 17`. If saving is unconfirmed, keep
   power on and retry **Check card save**; do not count a failed save as passed.
5. Power-cycle normally, boot without FUNC and reconnect on the same page/browser.
   Click **Check after restart**. Expect `Restart verified: MIDI2 TEST 17`.
   The page checks startup restoration status, exact runtime package hashes
   and companion inventory. Card confirmation comes from the base’s saved/restored
   status; without export the page does not claim to have read the saved-file bytes. Check names, channels and CC assignments on the OT.
6. Click **Prepare and read installed version**, then **Trial original revision**.
   Wait for the self-test/visible original name, check controls and **Keep revision**.
   Wait for `Card save confirmed: MIDI CC SLOTS`, then power-cycle, reconnect and
   **Check after restart**. Expect `Restart verified: MIDI CC SLOTS`.

Keep receipts live in this browser. A refresh/reconnect can retry a saved-set
check; it cannot recreate an in-progress trial's reviewed Undo state. A lost or
failed trial uses the existing base/link recovery policy; read its notice before
continuing. A mismatched package set or wrong revision never earns a pass.

This verifies package replacement, Undo, Keep and persistence. An actual MIDI
code change still needs its own functional, performance and hardware checks.
Undo changes module code; it does not reverse completed project edits.

## Software reproduction and evidence

With the local dev server and its toolchain available:

```sh
node sdk/drafts/midi-cc-slots/verify_usb_test_pair.mjs /private/new-usb-pair
python3 -B sdk/drafts/midi-cc-slots/verify_usb_update_loader.py \
  --main /private/base-MAIN.bin \
  --original /private/new-usb-pair/original-0.0.13.mwrm \
  --test /private/new-usb-pair/test-0.0.17.mwrm
```

The first checks the actual local endpoint, exact hashes and the limited byte
difference. The second executes the real C loader with synthetic host glue:
replacement in both directions, Undo, retirement and memory reclamation. It does
not execute ColdFire, USB transport, CF writes or real power-cycle persistence.
See TESTING.md for measured/reported results. Packages/proofs stay private.

### Published-base compatibility correction

The initial page incorrectly required optional saved-file export and stopped with
“Both saved module files must be readable for this test” before sending a package.
Published base 0c5934e1… does not include that export; its update, MWS1 identity,
save/read-back and startup reporting remain available. Refresh the page and choose
Prepare again. The normal path now checks the observed IDs against the reviewed
package pins and requires the device's complete MWS1 digest to match original or
test plus every companion. Both revisions and all eight companion subsets are
covered. An unsupported export is different from a failed/corrupt export; the
latter still stops. No base, firmware, package or project-file changes are needed.

## After syncing the fork with upstream

This page deliberately retains base 0c5934e1… and legacy 0.0.13/0.0.17 package
hashes. Their exact bytes still reproduce under the updated SDK using the pinned
ownership snapshot for that older base. The normal module listing now offers
0.0.18 for base c1ae2ee9…, whose generator registry owns the former NOTE SETUP
entry; it is a separate candidate with a private exit hook. The legacy page
refuses the newer base. Its completed results do not qualify the new hook/base.

The normal listing now offers 0.0.19 for the 5 November base `462fbd2b…`. The legacy update test above retains its original base and package identities and is not the hardware test for this candidate.
