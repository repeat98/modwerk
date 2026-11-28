# Catalogue package MICRO T / LEVEL — MOP-246 dig (28 Nov 2026)

Twin `dce64a781f8581b4` (guard), package `8958a66f…`, Keep-safe Undo only.
No Accept. No PC.

## Root cause

Earlier unit-procedure LEVEL rows marked FAIL (stock TRIGS/SLIDE/SWING/REC.TRG
only). Re-probe shows sites **do** apply mid-trial and MICRO T **is** present
on TRACK and MIDI TRIG EDIT. First FAIL was an observation/open-timing miss,
not a package defect. No source change.

## MEM

| Site | Before | Mid-trial |
| --- | --- | --- |
| `0x4007c07a` list length | `48780004` | `48780005` |
| `0x4007b7f2` names LEA | `47f9400b2e66…` | rewritten |

## LCD

| Shot | Page | Result |
| --- | --- | --- |
| `media/hw-catalog-midi-micro-t-mop246.png` | MIDI TRIG EDIT | TRIGS / MICRO T / SWING · `MT1:ON GRID` |
| `media/hw-catalog-track-micro-t-mop246.png` | TRACK TRIG EDIT | TRIGS / MICRO T / SLIDE / SWING · `MT1:ON GRID` |
| `media/hw-catalog-track-level-plus23-mop246.png` | TRACK · LEVEL | `MT1:+23/384` |
| `media/hw-catalog-midi-level-ongrid-mop246.png` | MIDI · LEVEL −23 | `MT1:ON GRID` |

Rollback clean. Digs remain paused for unrelated work; dens parked.
