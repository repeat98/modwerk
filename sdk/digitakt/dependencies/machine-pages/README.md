# Machine Pages 1.2.1

Draws the SRC and LFO pages of the SRC machines that describe their own, and
gives the render an event (`ev_render_voices`) for machines that make or take a
track's sound, so several machine mods combine. From irpina's 1.2, a machine can
also have up to seven more SRC values on a second page (`cm_ui_v32`, read back
with `cm_src_value`), and a page knob can be a stock sound parameter.

irpina's Machine Pages 1.2 (Elekloader `6e1e099d613b654c583a0f1cd3d604def9f8c8d0`,
tag `machine-pages-v1.2`, GPL-2.0-or-later), ported by Modwerk to run on Core 2.1
as sumedho ported 1.1 (see `NOTICE`). The page lookup reads a descriptor's
`CM_UI_TAG` tail itself instead of Core 3.0's `core_machine_ui`, and four firmware
locations come from per-OS `cflags` and `defsym`. No direct user controls;
included only through dependency resolution. Stock preconditions are hashes only.

The extra values live in the sound's slots 46-52, which the firmware leaves
unregistered. irpina's build also claims the stock table range it rewrites at run
time (OS 1.53 `0x401abeec`-`0x401ac058`, OS 1.54 `0x401ac1ec`-`0x401ac358`) so that
no other mod patches it; `build.json` has no field for that claim, and no library
mod patches either range.

One of irpina's 50 parameter-limit raises is left out: the instruction at
`0x400318b2` (both OSes) stays stock, because CC Names hooks it to draw its labels
and reads every parameter's label itself. Without the raise, CC Names combines
with every machine mod as before.
