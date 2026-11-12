# MKII public-base lifecycle — 31 October 2026

The exact USB-only candidate passed scoped install/Undo, Keep/reboot and
removal/reboot checks on the author's MKII. Original saved sets and fixture
files were preserved. This closes the exact-package persistence gap; complete
system stack qualification and first-release approval remain outstanding.

## Build and method

- Candidate: 0.1.8-experimental, 10,048 bytes, SHA-256
  `3e13c46fb0054d05f228b045746453e0c50dbbe52fb53b3c229d598ddd7fed79`.
- Flashed public base:
  `2aa35c3965d13087e7b83ff6f29d17bd6e6b7a59c7ed443e8720684b2b6d157b`.
- Fixture: PSL AUDIO TEST, A01; author instructed to leave playback stopped
  and recording off. No Apply or project Save was issued.
- One transport/upload-session owner throughout each retained trial. No second
  HELLO client, development KEY/encoder/fader event or RAM base was used.
- Only the singleton Sample Locks module was installed. Cached load and saved
  status were read; no self-test was started and no new audio/load test is claimed.

The original live inventory was empty, but the card held foreign saved sets
from base `a542a515…`: generation 2 with 19 modules and generation 1 with 18.
Both complete files were copied to the host and read back by SHA-256; payload
checksums, counts and records validated. The originals were temporarily renamed
into a separate card folder before testing, so Keep overwrote neither file.
The public base was restarted and reported NONE_SAVED before installation.

## Observations

1. The exact candidate was staged, activated and started as a trial. The author
   physically opened Lock's native selector and reported **selector open**.
   The owning session held and rolled back the trial. The base acknowledged
   normal state, its original active identity, empty inventory and the original
   empty-set identity `87f28e38…`. The same candidate then reinstalled successfully.
2. Explicit Keep was acknowledged. Read-only status reported SAVED (7), one
   saved module and one live module. The whole-set identity was `a07a27b7…`.
   The author reported a normal closed screen after this sequence and performed
   a power cycle. Readback reported RESTORED (1), the same singleton inventory
   and whole-set identity; DSP frames advanced 37,736 → 39,113.
3. The production 32-byte removal package, SHA-256 `397033ae…`, removed Sample
   Locks in a trial, then explicit Keep saved the empty set. Readback reported
   SAVED (7), zero saved/live modules and the original empty-set identity.
   After an author power cycle, RESTORED (1) still reported zero modules and the
   same empty-set identity; DSP frames advanced 57,029 → 58,407.
4. USB Disk Mode readback independently verified both test files. Generation 1
   contained the exact `3e13c46f…` package; generation 2 was an empty set. Both
   payload checksums passed. All 60 fixture files matched their pre-test hashes.
5. Both original foreign saved files were restored byte-for-byte and the
   temporary card archive removed. After safe eject and an author restart,
   read-only verification confirmed the original public base, normal state,
   empty live inventory and original empty-set identity. FOREIGN (4) matches
   the restored original files; DSP frames advanced 62,544 → 63,921. USB was released.

## Limits

The selector was author-reported open immediately before hold/Undo. The public
base supplies no development memory/screen readback: its phase after ENTER,
the exact close/retirement instant, original site bytes, module BSS/preferences
and held-key memory were not independently sampled in this run. The normal
screen report was after the Undo/reinstall/Keep sequence, not an isolated frame
at rollback. This is an end-to-end lifecycle observation, not proof that the
selector stayed open until deallocation.

No new running-playback, audio-continuity, worst-case CPU or total-stack claim
follows from these stopped tests. Earlier audio/load evidence retains its own
named development base and limits. The earlier remote-key attempt remains a
failed attempt; it was not rerun or relabelled as passing. Physical controls
avoided that input helper here; its bug remains unfixed.

The [stock-free receipt](evidence/mkii-public-lifecycle-20261031.json) records
identities, file hashes, measurements, author reports and raw-artifact pins.
Firmware, saved sets, card/project data and raw captures remain outside Git.
