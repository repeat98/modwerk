# Threshold Slices testing

## Commands and exact revision

Draft written against `eaaf60caf0d050cc158e2b281207a913183e813b`. No device trial is tied to that commit.

- `python -m unittest sdk.tests.test_threshold_slices` — PASS, 2026-11-06, host gcc. Spikes, silence, 64-slice refusal, a held rise and a short trim.
- The sample-editor host fixtures (service, board, menu, actions) were compiled with the same gcc and each printed PASS, including the new peak read.
- Host scan again on 2026-11-07, WSL gcc (`-std=c99 -Wall -Wextra -Werror`): PASS, including one rectified tone burst staying two starts (trim start plus one hit). Windows `python -m unittest` skipped because this machine has no `cc`.

Private ColdFire package `C:\Users\Roy Walker\modwerk-builds\threshold-slices.mwrm`, SHA-256 `a020a947cfdad3ad42b3e5566ec78e88a1e769942926f20fd897e6e9b145d3e7`, subscribed at order 60. Not committed.

On the unit, 2026-11-07, OCTATRACK 1.40C, base `671f0afd406290cb`: `device try` of that package for 12 seconds, then rolled back (not kept). While it ran, the slot was running, refusals stayed 0, and the tick value stayed `0x54530000` (the editor was not opened). About 60 ticks a second. After rollback the unit was normal, generation 2, the same base, and no slot running. The menu, LEVEL insert, D removal, scan time and CPU were not tried.

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
