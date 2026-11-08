# Butter Fingers — 0.1.0 experimental (draft)

## Overview

Butter Fingers fixes the most common slip when you remove a lock on the Octatrack MKII. You hold a trig and press a DATA ENTRY knob to remove that parameter's lock, and as your finger lets go, the knob turns a detent. That turn writes a new lock straight away.

With Butter Fingers, while a lock is being edited:
- the first single detent a pressed knob slips is ignored;
- every detent that knob turns for 150 ms after you let go is ignored too.

The lock stays removed. A deliberate press + turn still makes stock's coarse edit (×7), starting from the second detent.

It has no page, no setting and stores nothing in the project. It patches no stock code: it watches the panel's key and knob events through the Modwerk base and drops only the turns above.

## How the stock gesture works (MKII, measured in ot_emu)

- **Pressing a knob while holding a trig (or SCENE A/B) toggles that lock when you let go:** a locked value's lock is removed, an unlocked one gets a lock at its current value.
- **Turning while pressed is a coarse edit, ×7 per detent, and cancels the toggle.** One slipped detent therefore turns a removal into a jump of 7.
- **A detent turned after the release is an ordinary edit:** with the trig still held, it writes a new lock.

## Usage

Butter Fingers acts only while a TRIG key or SCENE A/B is held, and only on the pressed knob (A–F).

### Quick tutorial: remove a lock without a stray one

1. Hold a TRIG key with a parameter lock and press the DATA ENTRY knob of the locked parameter; let go. The lock is removed, as in stock.
2. Let go of the knob carelessly, nudging it a detent as you lift your finger: with Butter Fingers the lock stays removed instead of a new lock being written.
3. For a deliberate coarse edit, keep the knob pressed and turn it: the first detent is ignored, from the second on it moves in stock's coarse steps (×7).
4. Scene locks work the same way: hold SCENE A or B and press the knob to remove that scene's lock.

## Change to a stock flow

The module guide asks for this entry (`docs/module-guides/README.md`, "minor change to a stock flow").

- **What changes, for whom.** On the MKII, while a TRIG key or SCENE A/B is held, two kinds of detent on knobs A–F are ignored:
  - the first single detent turned while that knob is pressed;
  - every detent of that knob for 150 ms (9 UI ticks) after its release.
- **Why.** A press to remove a lock is followed or interrupted by an accidental detent so easily that removing a lock often takes several attempts:
  - a detent while pressed makes the removal a ×7 jump instead;
  - a detent after the release writes a new lock.

  Nothing else on the unit can tell a slip from an intended turn. Considered instead:
  - only the release window, which keeps the full coarse edit but still lets a slip while pressed prevent the removal;
  - dropping every turn while pressed, which removes the coarse lock edit entirely.

  The tester chose the first-detent threshold.
- **What a musician sees and does differently.**
  - A lock removed by a knob press stays removed.
  - A deliberate press + turn while editing a lock starts its coarse steps one detent later.
  - A deliberate turn of the same knob within 150 ms of releasing it is ignored. The tester reported it still feels immediate.
- **Turning it off.** It applies only while the module is installed: remove Butter Fingers to restore stock behaviour. It has no setting.
- **Neighbouring flows checked.**
  - In ot_emu: turns with no trig held (Part edits), and press + turn with no trig held, reach the firmware unchanged.
  - Reported on the unit:
    - TEMPO (LEVEL ×7 while pushed) is outside its scope, because LEVEL is never touched;
    - project-name editing, scene locks and trig locks behave as described.

## Compatibility and limitations

- OS 1.40C on the MKII; the MKI's knobs cannot be pressed. ColdFire only: no DSP code, no effect slot, no stock-code site.
- It claims the turns of knobs A–F while a TRIG key or SCENE A/B is held (`compatibility.uiClaims`). Another module taking those turns while a lock is edited would need a decision; none of the current catalogue does.
- A detent that reaches the firmware just before the press registers is not caught. The press then removes the lock it wrote.
- Panel turns are coalesced into one event when they come fast: such an event of two or more detents counts as a deliberate turn and passes.
- Hardware: reported working on one MKII over USB; no owner-verified qualification yet. See [TESTING.md](TESTING.md).

## Authorship and licence

Jan Kolkmeier: the module, its tests, documentation and thumbnail. MIT, see [LICENSE](LICENSE). No firmware, extracted stock code or built images are included; the knob and key codes and the gesture's behaviour are from octabam's public firmware notes and ot_emu measurements.
