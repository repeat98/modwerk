# The delay routine's A/B harness

`status.s` leaves out the stock delay routine's ring transfers, filter and mix for a track whose ring and filter are
silent (every word within 2,048 counts of zero, -120 dBFS) and whose send is shut (`mw_delay_read0`, `mw_delay_read`, `mw_delay_idle`). This harness runs the whole stock routine
(`0x400031a0`) on two emulated machines, stock and stock with those stubs, on the same random audio, knobs and FX2
changes, and compares after every frame: the tracks' audio blocks, the eight 68-byte state records, the scratch and
filter pointers, the 128 bytes each ring was written, and every 20,000 frames the whole rings. `mod.s` is a test
double of a module that takes stock's own seam (`0x4000361a`) as Tape Echo does, often for exactly one ring turn.

It needs your own OS 1.40C MAIN image (never in Git) and upstream Octabam's `ot_emu` libraries built from its
`tools/emu/ot_emu` (CMake target `ot_machine`, with `vendor/dsp56300` at the pin in its `scripts/vendor.sh` and its
patch applied).

```sh
E=sdk/machines/octatrack/elekloader; B=<ot_emu build dir>; V=<its vendor dir>; U=<octabam checkout>
c++ -O2 -std=gnu++17 -fwrapv -DASMJIT_STATIC -DDSP56300_DEBUGGER=0 -I$V -I$U/tools/emu/ot_emu -I$V/dsp56300/source \
  -I$V/dsp56300/source/asmjit/src $E/delay-harness/harness.cpp -o harness $B/libot_machine.a $B/mc68k/lib68kEmu.a \
  $B/dsp56300/dsp56kEmu/libdsp56kEmu.a $B/dsp56300/dsp56kBase/libdsp56kBase.a $B/dsp56300/asmjit/libasmjit.a -lpthread
m68k-elf-as -mcpu=54455 -o mod.o $E/delay-harness/mod.s && m68k-elf-ld -Ttext=0x47300000 --oformat binary -o mod.bin mod.o
# The base packs its code, so the built image cannot run in isolation: assemble status.s on its own.
m68k-elf-as -mcpu=54455 -o status.o $E/status.s
m68k-elf-ld -Ttext=0x47308000 --defsym modwerk_idle_gap=0x47310000 --defsym modwerk_idle_counts=0x47310004 \
  --defsym mw_delay=0x47310010 -o status.elf status.o && m68k-elf-objcopy -O binary status.elf status.bin
# Fill each modwerk_stock_<address>_<n> gap in status.bin with the n stock bytes at that address (as build_core.py
# does), take the three entry addresses from `m68k-elf-nm status.elf`, then:
./harness MAIN.raw MAIN.raw mod.bin 3000000 status.bin 47308000 4000332a:<mw_delay_read0> 400035ba:<mw_delay_read> 4000362a:<mw_delay_idle>
NODELAY=1 ./harness …   # no DELAY on any track: the steady saving
TOL=2048 ./harness …     # audio, filter state and ring words may differ by up to 2,048; prints the largest difference
```

Without `TOL` every byte must match, which the floor no longer promises: a quiet track drops the residue stock would
have mixed in. With `TOL=2048` everything but the audio, the four filter state words and the ring must still be equal.

`ot::Machine` logs every peripheral write until `endPeripheralWriteLog()` is called, about 2 KB a frame here: a host
harness that runs millions of frames must call it after the boot, as this one does, or it runs out of memory (a 3M-frame
run reached 3.9 GB and was OOM-killed). Cap long runs anyway (`prlimit --as=2000000000`).

It prints PASS, the instructions a frame and the eDMA transfers a frame on both sides. Its eDMA moves bytes at once:
it proves bytes and order, never transfer timing. That is the unit's part.

## What was measured (an MKII, development twins RAM-booted, 16 and 17 November 2026)

- Stock's delay routine takes 44.9 µs a call, once a 362.8 µs frame: 12.4 % of the ColdFire, stopped or playing.
  About 43 µs of it is the eDMA transfers (two tap reads and one ring write a track) and the waits on them; leaving
  out only the filter and the mix saved 1.6 µs.
- With the transfers of quiet tracks left out: 18.6 µs a call with all eight quiet, about 5 µs more for each track
  that is not; the CPU meter read 33.8 % stopped against 41.2 % (default Parts: FILTER and DELAY on every track).
- Recorded over USB on both twins from a fresh start, two tracks echoing and one dry among five quiet ones: the
  first seven seconds were bit-identical on the three tracks and MAIN. So were they after FX2 went from DELAY to NONE
  and back. A send opened during play from the quiet state matched within the last few bits, the level at which two
  runs on one twin differ.
- Stock's delay time depends on how it was reached: with the tape flag on, the glide to a new TIME truncates, so a
  time reached from below settles 8 samples short (14,801 against 14,809 at TIME 47). One step of TIME up and back, or
  picking FX2 NONE, moves it for good. Compare recordings only at equal delay times (state record `+0x2c`).
- A delay that has been fed does not return to zeros: its filter's output sticks at a small negative value, and with
  feedback its ring keeps a constant of about one 24-bit step. Stock then adds that to the track for good. Such a
  track never counts as quiet again until the next start, so the saving shrinks as more tracks' delays get used.
  Since 17 November 2026 the skip treats every word within a floor of zero as silence (owner's call), so a fed
  track counts as quiet again; filters stuck further out keep stock's path.
- Everything above ran on the exact-zero build. A first floor of 680 (-130 dBFS) passed this harness (`TOL=680`,
  3,000,000 frames; largest differences audio -137.3, filter state -131.9, ring -138.7 dBFS; eDMA transfers 32.0 a
  frame against 14.8, the exact-zero build 23.4). On the MKII (twin `0f487c37`, Part 2, DELAY on every track, three
  tracks with trigs) it left two of three fed tracks on stock's path: after the sends closed their filters stuck at
  -1,404 and -758/-700. The meter read 37.8-38.0 % stopped before, 48.2-51.7 % playing with every send open,
  42.5-43.7 % playing with them shut, 38.8-39.0 % stopped after. Hence 2,048.
- The 2,048 build (base 0.7.6), harness: `TOL=2048`, 3,000,000 frames, PASS; largest differences audio 411 (-134.4
  dBFS), filter state 1,464 (-123.3 dBFS), ring 743 (-129.2 dBFS); eDMA transfers 32.0 a frame against 14.0.
  `NODELAY=1`: no word differs.
- The 2,048 build on the MKII (twin `745efb59`, the same steps): 37.6-37.8 % stopped before, 47.7-52.2 % playing with
  every send open, 40.3-41.4 % playing with them shut, 36.3-36.5 % stopped after; all three fed tracks went quiet
  (filters at -1,404, -1,404 and -720/-702). Tape Echo 0.1.6 (a USB trial) on a track with trigs ran at about 50 % (its sound not listened to);
  back to DELAY, that track's filter restarted at zero and the meter read 37.3-37.4 % stopped with Tape Echo installed.
- Same twin, same Part, playing: 32 cycles in 10 minutes of opening the sends on all or a random subset of tracks
  (1.5-7.5 s) and shutting them (8-15 s): meter 42.1-48.2 % open, 39.9-41.7 % shut, no new stall or crash record.
  Then 30 minutes playing with every send shut: 40.5-41.9 %, nothing new, about an hour since the boot. A track
  recorder (T1, MKII key code 0x2b) recording while T1-T3's sends opened and shut: T1's filter settled at -1,179,
  nothing new.
- Not yet run on a unit: a card build, a soak with a real project.
