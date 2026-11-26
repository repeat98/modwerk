# The recorder update's A/B harness

`status.s`'s `mw_rec_update` replaces stock's recorder control-record update (`0x4000432c`) and writes `[r+300]` and
`[r+308]` of a track's CS1 record only when they change. This harness runs stock's routine and the base's on two
emulated machines, on the same random calls (ids 0-9, zero, short, negative and large lengths, the flag, other
writers storing into all six CS1 fields and the 44-byte records, the tempo words moving, repeated calls as in steady
recording), and after every call compares every register, the CS1 records, the 44-byte records and the stack. SR is
compared but for its condition codes, and d0, which ends holding SR, but for those five bits: no C caller reads
either after a call. It prints the CS1 writes a call of each.

It needs your own OS 1.40C MAIN image (never in Git) and upstream Octabam's `ot_emu` libraries, built as for the
[delay harness](../delay-harness/README.md).

```sh
E=sdk/machines/octatrack/elekloader; B=<ot_emu build dir>; V=<its vendor dir>; U=<octabam checkout>
c++ -O2 -std=gnu++17 -fwrapv -DASMJIT_STATIC -DDSP56300_DEBUGGER=0 -I$V -I$U/tools/emu/ot_emu -I$V/dsp56300/source \
  -I$V/dsp56300/source/asmjit/src $E/rec-harness/harness.cpp -o harness $B/libot_machine.a $B/mc68k/lib68kEmu.a \
  $B/dsp56300/dsp56kEmu/libdsp56kEmu.a $B/dsp56300/dsp56kBase/libdsp56kBase.a $B/dsp56300/asmjit/libasmjit.a -lpthread
m68k-elf-as -mcpu=54455 -o status.o $E/status.s
m68k-elf-ld -Ttext=0x47308000 --defsym modwerk_idle_gap=0x47310000 --defsym modwerk_idle_counts=0x47310004 \
  --defsym mw_delay=0x47310010 -o status.elf status.o && m68k-elf-objcopy -O binary status.elf status.bin
./harness MAIN.raw status.bin 47308000 $(m68k-elf-nm status.elf | awk '/mw_rec_update/{print $1}') 1000000
```

23 November 2026: PASS, 1,000,000 calls; 4.49 CS1 writes a call for stock, 3.02 for the base (6 and 4 on a steady
recording call). The emulator's read watch does not see CS1, which it maps on first use: both read it twice a call.
