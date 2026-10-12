# Machine Pages 1.2

Draws the SRC and LFO pages of the SRC machines that describe their own, and
gives the render an event (`ev_render_voices`) for machines that make or take a
track's sound, so several machine mods combine.

irpina's Machine Pages 1.1 (Elekloader `3acac10ea86882a2ea51c9377ac6bd58fc4fec57`,
GPL-2.0-or-later), adapted by sumedho to run on Core 2.1 (see `NOTICE`). The page
lookup reads a descriptor's `CM_UI_TAG` tail itself instead of Core 3.0's
`core_machine_ui`, and three firmware locations come from per-OS `cflags` and
`defsym`. No direct user controls; included only through dependency resolution.
Stock preconditions are hashes only.
