# Testing the public source

Run `python3 -B sdk/drafts/clyps/test_renderer.py`. A host C compiler runs the actual input and display routines against synthetic adapter state. With m68k-elf-gcc installed the suite also compiles both translation units for MCF54455. There is no installable public module.

The frame oracle comes from transmitted MKII emulator frames on OS 1.40C. Two checks cover all 1,024 bytes of Panorama at home and following a T2 override. The third covers all six CLYPS-owned bands in SRC when T2 plays A01 with A03 queued. The synthetic fixture never embeds the stock screen. The input fixture checks down/up in both dispatch phases, track focus, row focus, explicit launch and stock routing after exit.

In Meta the proposed integration leaves TRACK edges available to stock and Track Solo. LEVEL focuses a column in CLIP or a row in ROW. ARR switches between the contexts. On ordinary SRC press ARR, then SRC in Meta to enter the selected track's list. LEVEL browses and YES requests the selected source. The sequencer and protected loader remain independent qualification gates.

Hardware: NOT TESTED. Rows are volatile, T8 Master is unsupported, and foreign-source editing remains interlocked.
