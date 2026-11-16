# Sequencer release candidate, 12 October 2026

Related to [issue #447](https://github.com/repeat98/modwerk/issues/447), reported
on MKI / OS 1.40C / POLY8 0.2.6. The reporter's AMP HOLD setting is unknown.
This report covers an identified native reproduction; it does not establish
that this was the reporter's exact configuration or claim a hardware pass.

## Reproduction and correction

Two native four-note chord trigs on steps 1 and 5, with a looping FLEX sample,
ATK 0, HOLD 127 (INF), REL 20 and AMP SYNC on: the original build retains all
eight notes in HOLD at full envelope level after the second trig. Sequenced
voices have no key owner, so no key-up ever reaches their release stage.
Finite HOLD 32 ends notes correctly in the original build; native STOP also
clears them. The AMP capture retains its finite settings, ruling out the
suspected HOLD override leaking into the per-voice settings in this fixture.

The candidate calls one bounded release pass before expanding the incoming
chord. Only active voices without a key owner enter release. The call is
skipped for pending live panel/MIDI presses; held owners and other tracks are
preserved. Calling between chord notes would release the incoming chord's own
notes, so the release is outside the expansion loop.

The matched native run retires the old four notes with finite REL and leaves
the new four notes held at full level. The final chord still sustains with
HOLD INF until another trig or STOP. REL INF intentionally retains release
tails. No timing, pattern format, saved-Part format or independent clock is
added; recorded key-up duration remains unsupported.

Original MAIN: `f060271193954e18e158bd2c70fbfdcf0d6c7ea87c078e6142bc0bb6d35d939b`.
Candidate MAIN: `ab78639d7881f05637fb876da77fa98bd7d1ef69e4815ef9a85bd427a50da00c`.
Private `POLY8T447` BIN: `d7840774da8ccb7fede2fe674a43cc6d37a58991862f401c092d15f8d71eb954`.
Packaging round-trips to the identical MAIN using the original 1.40C seed and
tail. Firmware bytes are not included in this repository. The exact final
source fingerprint is recorded in `sdk/poly8-build-approval.json` and the
[capture provenance](../media/sequence-release/capture.json).

The firmware-free compiler image was rebuilt from the current pinned
Dockerfile (`sha256:09c3d035ccbad4e8642a645018c3d85b2dc8ebda994587754fa53614bb20833f`).
It reproduces the tested native MAIN exactly. The previous cached image lacked
the current DSP assembler safeguards; its full package build was rejected on
EVERB before import. The current toolchain builds and validates all stock-free
packages, including the candidate POLY8 objects.

All three native release gates pass at audio frames 500, 1500 and 2999:

| HOLD / REL | First chord after the next trig | Final chord |
| --- | --- | --- |
| INF / 20 | Reaped; only the new four-note chord remains | Held at full level |
| 32 / 20 | Reaped | Ends after finite HOLD/REL |
| INF / INF | All four notes in RELEASE at full level | All four notes in HOLD |

The original image passes the gate's baseline assertion: all eight notes remain
in HOLD with INF / 20. ASan/UBSan pool and recording regressions pass. Source,
compiled PC-relative addressing and loaded-state initialization gates pass.
The native assignment/reselection, sample-pool navigation and dirty-RAM UI gate
also passes; the current captures bind actual black-and-white LCD images to
the candidate source and MAIN.

The current native/browser comparison covers 252 configurations: 191 builds
match outside reviewed platform writes, 61 have matching refusals and none
mismatch. Regenerating the 212 Analog BD composition records preserves every
prior image identity and refusal while binding their source-tree provenance to
the new packages. `module:doctor poly8` is green. The full Node 24 repository
check passes all 1,738 app tests and 88 SDK tests (three SDK skips), with the
existing six lint warnings. The current pinned compiler also passes the
256-case mixed shared-hook validation.

## Repeating the regression

Use the pinned `modwerk-source-tools` container for source compilation and
`native-fixture.py` to prepare a disposable project from a local template.
Generate `nm -n` symbols for each exact native runtime image. Stage the three
cases with `native-sequence-release-gate.py --stage --sdk <private-sdk>
--work <private-fixture>`: HOLD/REL 127/20, 32/20 and 127/127. Run the same script
on the host with `--image`, `--symbols` and `--emulator` instead of `--stage`.
Pass matching `--hold` and `--release` values in both commands.
`--baseline` asserts the original hanging state for the infinite-HOLD case.

The gate executes the actual native sequencer and per-voice renderer, verifies
both complete chords, reads envelope stages/levels and confirms the real AMP
settings stayed intact. Generated firmware, cards, audio, commands, logs and
dumps remain private. Sanitized `pool-test.c` additionally covers live input,
other tracks, inactive records, the new chord and existing admission bounds.

## Release requirements

No physical MKI results are available for 0.2.7. After the native tests,
versioned source, stock-free packages, current UI captures, private test BIN
and exact-version approval blocker were described, the owner replied
**"approved"** on 12 October 2026. This authorizes the scoped 0.2.7 experimental
update under an exact-source exception for current-build hardware, worst-case
chip timing and complete memory bounds. Missing measurements remain null and
hardware status remains untested. Current UI, native/browser parity, repository
checks and owner-reviewed merge remain mandatory. Prior 0.2.6 hardware reports
retain their historical source/image identities. Keep #447 open until the exact
published download is verified on the affected unit.

For the hardware check: play a recorded sequence with a looping sample,
HOLD INF and finite REL. Confirm previous chords fade on the next trig, the
incoming chord stays intact, finite HOLD still ends the final chord, REL INF
remains intentional sustain, live key releases work and STOP clears playback.
Report the exact candidate/version, MKI result and any remaining hanging notes.
