# Octatrack base: module machines play right after a boot — 27 October 2026

Owner review: this relaxes the stopped-only placement rule in `docs/OCTATRACK_RESIDENT_ENGINES_ON_DEMAND.md`.

**What was wrong.** On a flashed base (`5afa623e`, Analog BD 0.1.6, 14 modules), PLAY pressed on MODULES LOADED left
Analog BD silent until the next stop. Three causes, each in the base:
- An on-demand engine was placed only while the sequencer was stopped and settled.
- A controller RESET went one 24-word packet a 60 Hz board tick: Analog BD's 3,776 words took 158 ticks, about 2.6 s
  a core.
- The restore said MODULES LOADED before any engine ran.

**What changes.**
- **Placed while playing** when the engine fits in free words (`dl_engine_claim` commit 1). Trims, evacuations and
  unplacing still wait for a stopped, settled unit; nothing is placed while a pattern change is queued. A play-time claim
  told its code must move waits for the stop without planning again each tick (`resident_engines.c` `deferred`).
- **RESET jobs carry up to eight packets** (`DL_RESET_DATA` 192 words, `resident_driver.py`;
  `MW_CONTROLLER_RESET_CHUNK`). Each packet is the one the receiver took before, at its own offset.
- **MODULES LOADED waits** for `modwerk_controller_settling()` (`controller_board.c`) to read 0, ticked from ep0.c:
  0.5 s at least, 10 s at most. A slot waits only while the bank uses its feature; a closed core (board transport or
  owned channel), a lost core state, a key bus that cannot come up, or a stuck engine ends its wait. The notice is
  dropped if the host changes the set during the wait. SOME MODULES FAILED and MODULES NOT LOADED are said at once.
- **Used from the Part.** A packaged feature counts as used once a track of the bank's Parts, working or saved, is
  signed for its module's machine (`machine_registry.c` `modwerk_machine_bank_modules`, read by `use_tick`), not only
  once its renderer asks for the write lease, which it does only from a track's first trig.
- **`bind_live`** keeps a module's retry when a later module in the same pass binds (`bind_again` was cleared by any
  successful bind, so an earlier refused reservation waited for the next owner epoch, and the notice could come early).

**How it was checked.**
- **Host.** `test_resident_engines_board.py`: mode 1 (placed while playing, nothing while queued), 13 (core B places while
  playing, core A waits for the stop to move code), 46 (stall), 54 (settling reads 0 when nothing is used), 64 (Analog BD
  placed, reset and enabled while playing within 30 ticks; 158 reset packets a core; settling). `test_resident_transport.c`
  (a reset past `DL_RESET_DATA` refused; a 50-word multi-packet job). `test_modset.c` (the notice's minimum, maximum,
  once only; dropped on a set change; a partial restore said at once).
- **On the unit** (owner's MKII, development twin `1b913b5c` of this base, RAM-booted, trials only, nothing kept; USB
  recordings of T1, T2, T3 and MAIN):
  - *Switch while playing.* Bank A T1 FLEX → Analog BD at 18:55:06: placed on both cores within the second (offsets 3294
    and 3420), reset complete and slot ACTIVE by 18:55:07.8 (about 1.8 s). T1 stayed silent until SRC CLEAR: the separate
    FLEX-switch bug, not in this build.
  - *Bank change while playing.* Bank D → bank B (Analog BD on T1), engine unplaced before: the transport kept playing
    (T2 and T3 every 2.000 s across the change). Core 1 placed within 0.3 s, core 0 about 1 s later after waiting behind
    core 1's jobs (wait 7, transport busy); reset complete 2.3 s after the change. T1's first Analog BD sound 1.50 s after the change, in
    time; the first 12 of 16 steps of that bar were missed. No SRC CLEAR needed.
  - *Other tracks.* T2 and T3 bit-exact loop to loop through both placements (largest difference 1.2e-6, the recorder's
    floor): no click, gap or drop.
  - *Level.* Analog BD on bank B at the same RMS as on bank A (0.033).
- **Code review** of the change: reset offsets, the last partial packet, range ends and ack counts checked against the
  receiver; the 10 s cap always ends the wait. Its findings on the settling wait are fixed above.

  - *After a power cycle, before the use-from-Part change* (personal base `d4658748` flashed, 14 modules kept; three
    cold boots, PLAY on the notice): Analog BD came in 1.50 s after PLAY (boot 1 recorded: the first 6 of its trigs
    missed), about the 13th trig in the others. Its engine started loading only at PLAY: the restored track asks for
    the lease only from its first trig, so MODULES LOADED had nothing to wait for. Hence the use-from-Part change.

- **After a power cycle, with the use-from-Part change** (personal base `1db64a78`, 14 modules kept, blank project; 28
  October): MODULES LOADED, then PLAY: Analog BD sounded on the first step (boot 1 recorded over USB). T1 showed
  "SRC → ANALOG BD" without a tap on every boot (the SRC label fix, in this change).
- **Flashed `ccc53692`** (this branch at `9c9ff6bd` plus Analog BD 0.1.6, 14 modules, the owner's own project; 28
  October, Nathaniel): SRC label, first trig after MODULES LOADED and the FLEX ↔ Analog BD switch all pass. On one of
  four cold boots the early-boot halt below struck 16 s in, at a bank change while playing (stall record 21, the same
  signature); the next boot played Analog BD on its first trig.

**Open.**
- **Early-boot DSP halt, not fixed here.** Within about 10-40 s of a cold boot, at the project load or a bank change
  while playing, the frame chain stopped: 0.5 s later the watchdog showed DSP STOPPED, revived the frames and turned
  residency off for the boot (no engine loads or retires until a power cycle). It also happened on a boot with FUNC
  held (no modules restored), so it is in the base, not in Analog BD, and `dsp.c` and `status.c` are main's. All five
  stall records agree: stock transfer state 7, our transfer idle (`dl_phase` 0, TCD0 and TCD1 DONE, eDMA ES 0), the
  frame interrupt unmasked (IMRL bit 1 clear) with nothing pending, EPORT pin 1 high and its edge flag clear, DSP
  select 0, one job (a status-meter PEEK in four of five) waiting for its answer. So the chain ended state 7 normally
  and the next frame's edge was lost, which fits the 200 µs hold-off trap in `docs/OCTATRACK_HARDWARE_TRAPS.md`
  rather than a host-port access of ours. Not reproduced on a RAM-booted development twin; seen again on `ccc53692` (above). A 10 s watchdog
  (`37473105`, reverted in `b0d3e493`) made the halt permanent (a drone): keep the 0.5 s recovery.
- **Ringmod SC refused at boot restore** with `RUNTIME_BUSY` on most cold boots of `d4658748` and `1db64a78`, though
  it restores on `5afa623e` and installs live. Candidates: the key-bus admission at the restore (`controller_board.c`)
  or `rebind_tick`. Parked.
- **First trig after Analog BD → FLEX stutters** (the switch fix); an FM Synth switch and a switch in a full project
  are untested.
- **USB drop.** One unprovoked ~2 s USB drop mid-trial (twin, Analog BD placed; possibly the shared hub re-enumerating)
  rolled the trial back and left both cores' engine claims at wait 7 and the key bus closed (`0x80`) until a power cycle.
  A review points at `journal_fail()` returning before `dl_owned_lease_release` in `mw_manager_journal_release`
  (`resident_journal.py`), which is on main: a separate fix.
- **Faster still** (proposals, not here): run both cores' jobs side by side (about 1 s), or place while a bank change is
  queued against the queued bank's Parts, free words only, so the first trig sounds.
