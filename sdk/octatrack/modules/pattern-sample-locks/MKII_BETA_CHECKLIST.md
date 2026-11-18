# MKII candidate check

The later public-base run passed scoped selector Undo, exact-package Keep/reboot,
removal/reboot and original-file restoration. The author opened the native menu;
no remote panel events were sent. Public readback cannot resolve the selector's
phase after ENTER or directly inspect restored site bytes. See the
[method and limits](MKII_PUBLIC_LIFECYCLE.md). The earlier failed remote-key
attempt remains recorded in [FINAL_QUALIFICATION.md](FINAL_QUALIFICATION.md);
the development input helper remains unfixed.

The latest stationary-panel USB rerun on 31 October 2026 passed 32 maximum edits
and four minutes of audio checks, reaching 93.7% sampled main CPU. STOP worked;
cleanup needed protocol recovery, then restoration was independently verified.
An earlier concurrent physical/remote-input trial failed, and a no-module emulator
reproduced the independent input-framing bug. Its serialization fix and concurrent
input qualification remain outstanding. See [MKII_HIGH_LOAD.md](MKII_HIGH_LOAD.md).

Partially performed on 31 October 2026: unchanged candidate `3e13c46f…`
ran 43 native operations on RAM development base `20ed7910…`; a separate probe
ran 46 timing operations. Audio, data and Undo checks passed within their stated
scope. Full stack, direct mirror readback and broader stress remain open.
The later public-base lifecycle run above adds scoped selector Undo and persistence. Read the [actual method/results](MKII_AUDIO_TIMING.md) before
continuing this checklist; it is not a completed qualification certificate.

The author's chosen first-beta scope is USB-only through the Modwerk base.
Card support is deferred and card builds must refuse it; this checklist does
not qualify a card build. See [USB beta scope](USB_BETA.md).

The latest private reconstruction candidate is `3e13c46f…` (10,048 bytes,
nine stock-copy records). Its image matches the earlier prototype, but its
changed package now has scoped MKII lifecycle/audio evidence. Review its
[exact receipt](evidence/reconstruction-local-20261030.json) and the observed
base's copy capability before a physical trial.

The agent handles fixture setup, USB measurements, byte/mirror/index comparisons,
inventory and recovery checks. The author chooses a disposable project and
checks what the hardware sounds and feels like. A device load, save, Keep or
flash needs its own applicable authorization; this checklist performs none.

Use the [sample-inclusive fixture](AUDIO_FIXTURE.md), including its AUDIO folder.
Before measurements, check the loaded slots/trim, every track's output and the
main level on the unit. Emulator PCM does not replace that physical preflight.

1. Record the observed MKII base identity, package SHA-256, project/pattern,
   selected tracks, tempo/speeds, streaming/recording state and companion set.
   Read the existing inventory before making a reversible RAM trial.
2. Establish matched playback without the module, then with its UI closed.
   Record audio if available and watch the same hardware timing/load sources.
   A cached CPU reading alone cannot resolve an Apply spike.
3. Exercise full-pattern Lock and Clear with all eight eligible tracks and
   64 stored steps. Cover Clear with no other locks, a lock in the first other
   slot, and a lock in the last other slot. Repeat ten Lock/Clear pairs in the
   slowest observed case, measuring each Apply and checking all affected bytes.
4. Listen for unexpected gaps, clicks or timing slips and check control response.
   Repeat the maximum edit at the fastest tempo/track-speed combination the
   author intends to support, then with a named demanding Static-streaming and
   companion load. Record exactly what was covered. Include external MIDI/USB
   traffic only when those loads are actually available and exercised.
5. Confirm stopped Apply stays stopped, live/sampler recording refuses safely,
   manual SAMPLE locks are preserved by default Lock and removed by Clear,
   and unrelated locks and unselected tracks remain unchanged.
6. Open the selector, remove the trial module and verify inventory/site recovery;
   Undo must restore the exact previous set. Test native project reload and
   preference reset on reload/restart only when those actions are authorized.
   Keep and an actual power cycle form a separate explicit persistence test.

The report must distinguish agent measurements from author listening/UI reports.
Retain raw timings and failures, exact fixture conditions and recovery results.
A clean practical run adds hardware evidence; it does not turn emulator time
into a physical cycle bound or establish total stack safety by itself.
