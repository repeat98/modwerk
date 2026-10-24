# Compiled previews in a full firmware boot

This is a private emulator fixture, not a distributable module or base service.
It builds the original planner/session/Flex backend and command observer, reserves
eight audio pages through pinned upstream `arena.py`, and injects the fixture at
`0x46019df0`, sixteen bytes inside that reservation. Never place it in an assumed
unused stock heap/global region or run it on hardware.

`source_boot_native.py` produces the private binary, symbols and compile receipt.
`boot_source_native.py` verifies those hashes, the private 1.40C MAIN, scratch card
and arena helper before booting. Required arguments follow `--help`; all outputs
must be in a new private directory outside Git. The driver requires explicit
`--allow-private-injection`. Keep MAIN, cards, PCM, settings and binary artifacts
private; retain only source-bound stock-free result receipts.

Normal panel steps select the loaded Flex source and its full trim range. The
fixture's native calls then perform bounded preview steps. The scheduler runs
between groups. Every complete plan is compared with the synchronous host
planner over independently supplied original/expected edited PCM. Whole PCM,
controls and settings are compared before and after preview batches. Normal
stock reverse actions exercise invalidation of both RUNNING and READY previews,
then fresh previews on changed audio. A second reversal restores the source
under the previously observed inclusive-endpoint model.

The interactive emulator `call` command requires main's idle spin. A normal
panel run may stop elsewhere. The helper retries only the exact reviewed
`callAsMain` pre-entry refusal, which occurs before changing SP/PC or executing
the target; it advances normal execution briefly and has a strict attempt cap.
Timeouts, CPU stops, different contracts or uncertain execution are terminal.
The regression suite verifies that these failures are never replayed.

All lifetimes/admission are fixture-owned. The whole-command observer covers
only part of the writer set; recorder and metadata writers remain incomplete.
The fixture masks all interrupts around capture/copy, with no physical latency
qualification. The driver borrows individual native calls from main instead of
installing a scheduled service. Runtime project tempo is an observed field,
not a qualified pattern/external-clock contract. This proves the executed
read-only integration path; it does not qualify live ownership, cache behavior,
the menu, Apply, audible playback, browser/USB packages or hardware persistence.
