# Threshold Slices testing

## Commands and exact revision

Draft written against `eaaf60caf0d050cc158e2b281207a913183e813b`. No device trial is tied to that commit.

- `python -m unittest sdk.tests.test_threshold_slices` — PASS, 2026-11-06, host gcc. Spikes, silence, 64-slice refusal, a held rise and a short trim.
- The sample-editor host fixtures (service, board, menu, actions) were compiled with the same gcc and each printed PASS, including the new peak read.

Not run yet: a ColdFire package build, a base build that contains the peak read, and a load on a unit.

## Hardware and audio quality

Not tested. No MKI or MKII run. No audio capture.

## Stock flows

Not tested. The menu row is added in the creation group under DELETE ALL SLICES and above CREATE SLICE GRID. Stock rows, their callbacks and the remembered stock index are left to the base. DELETE SLICE and DELETE ALL SLICES are unchanged. Not compared on a unit.

## Performance

Not measured. The scan runs on the UI task while the popup is open, at most 8 reads of 32 frames a tick. Closed, the module does not read.

## Resources

Unmeasured.

## Hardware

Untested.
