# slice-loop

Port of rytm-mods-src `mods/0012-slice-loop` (MrScruff; hardware-verified there).

Adds SLICE LOOP after SAVE TRACK in the track menu (FUNC + CHRO). On an empty sound track of 16 steps
or more it:

- sets the track's TRIG page defaults to SYN off, SMP on;
- places trigs on steps 1..16;
- locks trig n's sample STA to 6(n-1) and END to 6n (0/6, 6/12 .. 90/96);
- shows LOOP SLICED and closes the menu.

For a one-bar loop sample padded so the bar is 96/120 of it. It refuses, changing nothing, with
TRACK NOT EMPTY (any trig, lock trigs included), NEEDS 16 STEPS, or ONLY ON SOUND TRACKS (FX track).
Every write goes through stock's own setters.

## How it hooks

One site, the same as rytm-mods' detour: 0x400f9e96 in TrackMenuView's constructor, the epilogue's
`movem.l %sp@(24),%d2-%d6/%a2-%fp` (6 bytes), becomes `jmp slice_loop_menu_add`. The stub builds
one more menu item exactly as SAVE TRACK's is built (same std::function managers, label, action and
an empty icon), appends it, re-emits the `movem.l` and rejoins at 0x400f9e9c.

## Changes from rytm-mods

- The code is unchanged. The label `slice_menu_add` is renamed `slice_loop_menu_add` (global labels
  carry the mod id) and is the only `.globl`.
- It runs from the elemod DDR area instead of cave8 (0x40012aa0). Its 6 absolute references to its
  own label, action, icon and strings are relocated by the elemod linker.

## Test (on a unit)

1. Select an empty sound track, FUNC + CHRO: SLICE LOOP is the last item.
2. Choose it: LOOP SLICED, trigs on steps 1..16, each with STA/END locks (6(n-1), 6n).
3. Choose it again on the same track: TRACK NOT EMPTY, nothing changes. On the FX track: ONLY ON
   SOUND TRACKS.

## Results so far

- Hardware: on an Analog Rytm MKII, 2026-10-13, in a build of core-ar2 with filter-hz, ctrl-all,
  env-reset-amp and slice-loop: works as described.
- `.run` 752 B, 1 site, 6 relocations; lint OK; links with core-ar2 0.1.
- The 751 B of code and strings linked into the image are byte-identical to the stub in
  rytm-mods-src's default build (cave8, 0x40012aa0) except the 6 relocated words, each moved by
  exactly the difference between the two load addresses.
- rytm-emu, the four-mod build above: FUNC + CHRO lists SLICE LOOP after SAVE TRACK; choosing it on BD shows LOOP
  SLICED, choosing it again shows TRACK NOT EMPTY. Stock lists no such item.
