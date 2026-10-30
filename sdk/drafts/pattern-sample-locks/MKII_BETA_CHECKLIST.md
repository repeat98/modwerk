# MKII candidate check

Prepared locally; **not performed**. Resolve the software qualification blockers
in [BETA_PREPARATION.md](BETA_PREPARATION.md), freeze the candidate and review
the exact base/package before arranging a supervised physical run. Existing
0.1.8 results stay bound to their previously recorded bases.

The agent handles fixture setup, USB measurements, byte/mirror/index comparisons,
inventory and recovery checks. The author chooses a disposable project and
checks what the hardware sounds and feels like. A device load, save, Keep or
flash needs its own applicable authorization; this checklist performs none.

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
