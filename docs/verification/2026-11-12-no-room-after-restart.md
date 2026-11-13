# NO ROOM on every pick after a restart (12 November 2026)

**Seen** on the owner's MKII, base `926a4fdf` (main's `off` variant), 20 modules installed, on three starts: Tape Echo on T4 FX2 was refused with "NO ROOM / FX2 ON T1-4 FULL / CHANGE ONE FIRST". Tape Echo reads no delay buffer. Taking Air Chorus off T5 FX2, picking Tape Echo and putting Air Chorus back worked.

**Cause, from the code, not read on the unit.** Every pick plans all sixteen slot buffers (`dl_buffers_prepare`), and an effect that stays in a block it may no longer hold refuses the whole pick. A module effect's whole FX2 block 0 (T1 and T5) covers the key bus window at its end, which an installed Sidechain holds. A restore makes all modules live in one pass and the board binds Sidechain's slot on a later tick, so `modwerk_dsp_buffer_permitted` did not count it yet when Air Chorus's buffer was placed. The refusal box names the first changed slot, not the slot the plan stopped at.

**Fix.** The permit also counts live controllers that no slot holds yet (`controller_reserved`, dsp.c's private port in `resident_base.patch`). When the picked effect reads no buffer, the box says "A MODULE EFFECT / IS IN THE WAY: / REMOVE + RE-ADD" (`modwerk_dsp_reads_buffer`). Base regenerated: identity `57115f8d`, `off` variant `84b0ee2e`; the base-bound packages were re-stamped, no package bytes changed.

**Tested.** Host only: `test_stock_hook_binding.c` (a live controller without a slot keeps a module's whole block off FX2 block 0 on both cores, block 1 and stock's own extent stay allowed, an unreadable owner is asked again), `test_status.c` (the box's case), the resident, controller-board and base recipe suites.

**Not tested.** A restart on a unit with the fix, and the box's new text on a screen.

**Left open.** The planner naming the slot it stopped at: `buffers.c` and `manager.c` lie before the write-lease entries in the link, so growing them moves the entries Analog BD's package calls and its reviewed recipe must be recaptured (beta finding 17). It belongs with the next base change that recaptures it. A refusal is not written to the unit's log either.
