# Resident selection-context prototype

This component is an original portable authorization record for a proposed
base-owned popup dispatcher. It is not a released editor ABI, loader lease,
reference-detachment proof or installed module. All its storage and callbacks
remain pinned in the private native fixture.

A no-argument callback address does not identify the menu opening that selected
it. Stock can retain that address after closing a popup; allowing it to read a
new global menu token would let a late call adopt a newer opening's authority.
The prototype therefore separates three moments:

1. Capture the current window, task, callback table, selected row, owner,
   generation, domain and monotonic menu/configuration epoch before stock closes
   the popup. A new context receives a monotonic ticket, never reused.
2. Arm only at the verified selection-specific tail immediately before stock's
   direct callback helper. Its actual callback argument, table, row and task must
   still match. Capturing alone gives no callback authority.
3. The resident callback consumes that context once, before acting. It supplies
   its expected address and current owner/domain/epoch. Direct, stale, duplicate
   or mismatching calls are refused. The trusted post-dispatch path ends the
   context only after the callback returns.

These calls require the same admitted storage and verified UI/loader boundary.
Inputs and output buffers must not alias. Exhaustion fails closed; initialization
is not a way to recycle a ticket. The context does not schedule work, invoke
module code, decide source readiness or authorize marker publication.

The private wrapper captures around the pinned stock selection entry and tail.
Stock overwrites the caller's first argument with the chosen callback, then
jumps to a helper. Adding an ordinary nested call would shift that argument and
can lose the caller-visible write. The experiment preserves the original stack
layout, substitutes a resident return trampoline, and restores the original
return slot before returning to the caller. Data/address registers and SR are
saved around its own calls. Actual comparison results belong in TESTING.md.

The single-context native fixture refuses a nested selection before calling
stock; merely refusing a second capture would allow an inner callback to borrow
the outer context. Legitimate stock nesting needs further qualification before a
production adapter. Ordinary stock selections use the original callback path.
The context applies to the BEAT GRID action and configuration/result callbacks.
Callbacks only publish UI intent; the engine retains ownership of the preview.

Ending a context retires its authority, not every native reference. The selection-only
fixture (`boot_selection_native.py`) permits one contributed menu opening per boot, keeps arrays/code
alive indefinitely, and never claims package removal or memory reclamation.
Reopening must establish native reference lifetime and a safe persistent-table
contract; the context alone does not justify calling `bs_menu_detached_locked`.


The separate [resident-menu variant](RESIDENT_MENU.md) avoids rewriting tables
by keeping one immutable layout per stock shape for the whole fixed-owner
lifetime. It permits later openings only after completed native dismissal and
dispatch return. It never calls mutable-menu detachment or claims reclamation.
