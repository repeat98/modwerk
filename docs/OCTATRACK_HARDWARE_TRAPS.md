# Octatrack hardware traps

Things that work in the emulator or on paper and fail on a real Octatrack
MKII (OS 1.40C), found while bringing up the Modwerk base, its USB link and
the DSP loader on the owner's unit in October 2026. Read this before
changing the base (`sdk/machines/octatrack/elekloader/`), the upload
transport (`sdk/runtime/upload/`) or the DSP loader. Octabam's own traps are
in [sdk/octabam/AGENTS.md](../sdk/octabam/AGENTS.md); the long record with
every run is [OCTATRACK_ELEKLOADER_MIGRATION.md](OCTATRACK_ELEKLOADER_MIGRATION.md).

Each entry: what you see, why, the rule, and the build it was observed on.

## USB and EP0

**No EP0 IN reply may be a whole multiple of 64 bytes.** The unit froze
once: a stale zero-length packet made the next IN return 0 bytes and stock's
ISR looped until the next SETUP. Pad or size replies (IDENTIFY 72, DIAG 68,
the screen 1028, the loader report 4 × words with words not a multiple of
16). Observed on `usbtest2`; rule kept since.

**No EP0 OUT data stage may be a whole multiple of 64 bytes either, unless
ZLT is off.** Stock leaves zero-length termination on in the EP0 OUT queue
head, so a 128- or 192-byte SUBMIT never completed and the base abandoned
it (127, 191 and 255 worked). The base clears ZLT (dQH word 0, bit 29) when
it primes its data stage, and the client never sends such a frame (it
shortens that chunk by a byte), so older bases work too. `usbtest9`,
`508b0e52`.

**An EP0 OUT data stage can go unanswered two ways, and the tick
covers both.** Measured on the owner's MKII, 11 October 2026, about one
SUBMIT in 50–100 (502 primes: 29 of the first kind, 2 of the second). (1) The
stage completes inside the ISR after the poll at the start of the transfer
path, and stock's completion loop takes the bit: no new interrupt, no status
stage. (2) The stage stops part way: 64 bytes of a 120-byte frame arrived (the
queue head's overlay token `0x00388080`), the endpoint is still primed, and
the host waits on a status stage that never comes. libusb gives up after its
timeout; a browser may wait for ever. `modwerk_ep0_tick` (60 Hz, USB held off
with the level-4 lock) finishes a stage that has completed and, after half a
second without completion, refuses the frame and stalls EP0. The host then
sees a stall and a REFUSED result for its sequence, and submits again (a
refused frame never ran). Counters: `caught`, `stalled`, `stuck_overlay` in
ep0.c (read with `mem:`). The cause of (2) on the wire is not known.

**Host frames wait for the boot restore.** The saved module set is
reinstalled about 3 s after boot and its DSP code loads afterwards. An
install in that window was refused as busy (the loader refuses to replace a
module while DSP code is publishing), and a change accepted before the
restore would be overwritten by it. The engine hook holds a queued frame
(the host reads it as pending) until the restore has run and the DSP manager
is idle, never past 10 s after boot. The engine runs only when something
posts to its queue, so the tick wakes it while it holds (a hold without that
left a RAM-booted base answering nothing until a power cycle). Bus resets
are still handled while it holds, unless a frame waits (`mv_service_held`).
The dev tool first reaches a RAM-booted base about 11 s in, so it cannot
exercise the hold.

**A fresh session can take over a half-staged transaction.** When a reply
goes missing mid-transfer, the base is left `receiving`. `UploadSession.adopt()`
takes its transaction number from the status so `cancel()` can undo it; the
site's clean-up and `npm run device -- recover` both do this. A published
candidate cannot be adopted (its previous set is unknown); the base rolls it
back after 10 s of USB quiet. The `serve` session's request every 4 s keeps
the base from ever seeing that quiet.

**Windows binds WinUSB only to a USB 2.10 device that answers BOS and the
Microsoft OS 2.0 set.** Both requests reach the base through stock's
unknown-request STALL tail; the device descriptor needs a copy (stock's sits
in the protected bootloader range). macOS and USB disk mode are unaffected.
`usbtest8`. On Windows 11 the vendor interface came up as a WinUSB device with
no driver install, next to the card's mass storage (flashed base `19d37e25`
and `ee76c36f` (S54), 12 October 2026), and libusb drives it.

**WinUSB refuses a control transfer longer than 4,096 bytes** ("Invalid
parameter", before anything reaches the wire); macOS and Linux take the
protocol's 4,148-byte frames. Every frame must fit 4 KiB: the client sends
chunks of `UPLOAD_CHUNK` (4,044 bytes, 4,043 after the 64-byte rule above),
and the base accepts any chunk length. WebUSB on Windows uses WinUSB, so the
site has the same limit. Seen as a RAM boot failing on its first chunk
("chunk was not confirmed", no device refusal), S54, 12 October 2026.

**The flashed `usbtest9` times out on 4,095-byte frames; RAM boots from it need `--chunk 4096`.** It predates
the tick that answers stuck EP0 stages (S43). On the owner's MKII from macOS, 12 October 2026, staging a RAM-boot
image in the client's default frames (4,043-byte chunks, the WinUSB limit) failed five times in five, at chunks
4-60: a data stage timed out after 2 s and the session stopped ("chunk was not confirmed"). With 4,148-byte
frames (`device boot DIR --chunk 4096`; serve: `boot DIR 4096`) the same 1.3 MB staged in about 1.3 s, twice,
the base refusing some SUBMITs with a stall that the client retries. Bases from S43 on are not affected. Windows
cannot send those frames, so a unit flashed with `usbtest9` RAM-boots from macOS or Linux only. The next RAM boot
after those failures (4,148-byte frames, staged and armed) hung at the logo until a power cycle; whether the failed
stages, or a DSP left stalled by the restart that had put the unit on `usbtest9` before them, caused it was not found.
After the power cycle one RAM boot with `--chunk 4096` came back in 15 s.

**macOS keeps stale device entries after the unit disappears abruptly**
(`ioreg` shows inactive IOUSBHostDevice nodes held by `configd` or
`systemstats`). They are harmless; a power-cycled unit enumerates beside
them. If a unit does not come back at all, the cause is on the unit.

**The bench must serialize whole control transfers.** Its socket's `setup`,
data and status commands form one transaction. Serializing individual commands
does not prevent the site's keepalive IDENTIFY (72 bytes) from overlapping a
pending SELFTEST (96 bytes). On the owner's MKII, the ABI 8 candidate at source
`e86283a6` produced a short self-test record through the unqueued host adapter;
the device remained responsive. A deterministic host fixture reproduces the
overlap, and six separate trial/self-test/Undo runs passed with the transaction
queue. Keep strict response lengths; this host evidence does not establish
combined-set audio or reboot persistence.

**Extracted 1.40C MAIN starts at `0x40000400`.** Map stock addresses to file
offsets from that section's load address, not the `0x40000000` vector base.
After a runtime install, compare every declared relocation with an independent
fresh link, including words beyond any leading-code sample. The private CC Map
and Recorder Loop Fix envelopes prepared from `e86283a6` passed sequential
emulator install/remove with these checks; that does not establish hardware,
coexistence, MIDI, audio or reboot behavior.

**A source-linked base's DDR symbol is not a MAIN file offset.** Elekloader
places `.run` in appended flash and copies it to its DDR execution address at
boot. To inspect an authored identity or arena binding in a private build,
translate through that build's native `.run` load/execution map, after checking
the saved MAIN length and hash and bounding the translated span. The frozen
`e86283a6` base's identity binding was checked this way; subtracting MAIN's
load address from its DDR symbol would read the wrong place.

**A reconnect failure need not mean the RAM image failed to boot.** The host
bridge must catch transient enumeration/claim failures while the device returns,
dispose partially opened handles and keep listening for the next explicit
request. Never replay a write, reset USB or select a configuration as recovery.
The same `e86283a6` candidate identified successfully after this host fix on the
owner's MKII; the earlier dead bridge could not establish a device boot failure.

**Snapshot StockCopy sources before activation.** A source span can overlap a
site the package replaces. Reading it after Keep compares the loader's correctly
replayed original bytes against the new detour. The CC Map private runtime
adapter exposed this verifier error in the emulator on 13 October 2026. Capture
and hash-check the original spans before install, then compare the installed
copies and removal against those snapshots.

## RAM boot

**Private resident DSP packing needs an execution oracle.** In preparation
`2f66d5d6`, each original upload stream was extended with source-pinned authored
initialization records, preserving its stock prefix, terminator and trailer.
An independent ColdFire execution check verified both complete streams,
linked blob/scratch bounds and saved registers. Share initialization storage only
when complete typed-record bytes are equal, then verify each core independently.
This proves the packing shim, not a complete base boot, audio, timing or
persistence.

That preparation reserves the core 1 wait/meter counter at X:$7fff, outside
Analog BD's initialization and reset ranges. Preserve that ownership boundary
and exclude the counter from X probes; the older X:$2840 location overlaps
Analog BD's authored tables. This is a private native proof, not hardware
qualification of resident modules.

**Only the flashed base's gate decides a RAM boot.** After the soft reset
the bootloader always unpacks the flashed image, so its gate reads the
mailbox. Each build puts its stage at another address, so a boot armed by a
RAM-booted base fell back to the flashed one. The gate (`usbtest9`) scans
the platform reserve for exactly one valid mailbox and spends every one it
finds; the build refuses a stage outside that range.

**A soft reset leaves the USB controller and its PHY as they were.** One RAM
boot in about six came back with the screen working and no USB until a power
cycle. The base now stops the controller (USBCMD.RS = 0) and waits about
50 ms before the reset; with that, 20 of 20 boots came back
(`usbtest9`, 12–16 s each).

**REMIX SWITCH's DSP park works for RAM boot.** Audio, sequencing and the
card were normal after RAM boots, including into bases with edited DSP
payloads.

**`npm run device -- boot` must wait for the unit to go away.** With the
same base before and after, its identity answers before the reset fires.
Wait for a failed request, then for HELLO (the engine refuses SUBMIT for a
moment after the restart).

## Simulating the user

**Never post key event records to stock's queues directly.** It crashed the
unit twice, minutes later, and a remote STOP made a brief distortion instead
of stopping: stock's handlers also read the panel parser's held-key rows.
Feed the parser the panel's own bytes through its byte ringer instead (row
report `0x20 | row` with the row's held keys, `0x30 | encoder` with a signed
delta, `0x40` with the fader position), masked as the UART interrupt does.
This is what octemu's emulated panel sends too. Remote PLAY, STOP and
auto-stop work this way (development base `54f2ce5c`).

**Moving the cursor in an FX chooser does not pick; YES does.**

**A script's YES can land somewhere else.**
- *The MODWERK CONNECTED popup.* It shows when a host connects after a
  quiet spell, and seemed to swallow a YES sent about 2.9 s after the
  connection (one try, 11 October 2026). Wait 3.5 s after connecting before
  sending YES or NO.
- *A PROJ menu left open under a page.* If page keys open another window
  while the PROJ menu is still open, the menu's input layer stays
  registered. YES then reaches the menu's focused row, unseen: a pick on
  the FX2 list opened SYSTEM > MODWERK's hint. The menu also keeps its
  focus after closing (`0x400cbda8`).
- *Check.* The input layers are a list at `0x460d165c` (`npm run device
  -- mem`). With no menu open there are two: the base layer and the open
  window's. To clear a stale menu, open PROJ, press LEFT, then NO.

**Auto-stop never stops a recording, and never for a disconnect's
rollback.** The controller answers `unsafe` while the unit plays (the
backend's "not stopped") and the host retries.

## DSP loader (dynamic DSP code)

**eDMA source buffers must match the inherited transfer size.** The loader
reuses stock's TCD0 and inherits its 16-byte bursts. Its packet buffer sat
4 bytes off a 16-byte boundary: the chip raised a source address error
(`ES` 0x80000080), the frame engine stopped, and nothing played until a
power cycle. The emulator does not check alignment. The buffers are now
aligned and the build refuses a misaligned one.

**When frames stop, everything stops.** Core 0 writes a word per frame and
waits for the ColdFire to take it; if the ColdFire's frame chain stops, the
sequencer sticks on its first step and USB audio has nothing to send. Read
the loader report (`npm run device -- report`): frames, job state, eDMA
`ES`, the TCD CSRs, stalls and drained words show where it stopped.

**A watchdog on the tick runs but cannot revive a dead frame chain.** Its
heartbeat kept climbing after every freeze, it detected the stall and
drained the frame words, but frames never resumed: a corrupted DSP needs
both cores stopped, parked and re-uploaded, as RAM boot does. Prevent the
collision instead of relying on the watchdog.

**Never hold off the frame interrupt for more than about 200 µs.** The DSP frame interrupt is level 5 and the eDMA
frame transfer level 6 (Octabam's KERNEL.md).

Measured on the owner's MKII, 11 October 2026 (development request 20):
- **Up to 200 µs:** masking every interrupt for 100, 150 and 200 µs, 25 times each while playing, left frames running.
- **300 µs:** frames stopped within the first few masks.
- **What dies:** core 0 stops for good and does not wait for the host (its HSR's RXDF is clear). That fits its audio
  DMA dying when the bank word is taken past a ring half (16 samples, 363 µs).

How it hit the loader:
- **The masked work.** The loader masked everything for a module switch and a reclaim: stack scans, the DSP switch,
  the chooser page. That lasted up to about 760 µs on an install and 70–200 µs on a removal.
- **The stalls.** About one install or removal in ten stalled the DSPs (Euclid at cycles 7, 7 and 10; E-Verb at
  about 12).
- **The fix.** It now locks at level 4: no task switch, no USB, no storage, but frames run. Only the stock-code bytes
  are written fully masked; the longest such span measured 3,219 timer counts (24 µs).
- **The result.** 20 Euclid and 20 E-Verb install/remove cycles while playing, no stall.

Any other code that masks at level 5 or above must stay well under 200 µs.

**A switch's masked span grows with the module's stock-code sites.** The loader used to check, write and read back
every site byte through the uncached alias inside the mask, about 6.5 µs a site: Play Modes (35 sites) held frames
229 µs, FM Synth (24) 203 µs, Euclid (3) 25 µs (development twins of `99336d35`, 16 October 2026). With both in a set,
a sync's self-test and a power-on restore each stopped the DSPs once ([finding 46](OCTATRACK_BETA_TEST_PLAN.md#findings-log)).
Now only the writes are masked, a word at a time, and the checks run under the lock: 69 µs for the same set. To
measure, read `modwerk_masked_max` with `mem` on a development base (the outermost masked span since boot, in
132 MHz counts); recording `__builtin_return_address(0)` in `modwerk_machine_unmask` beside it names the caller.

**The DSP watchdog only sees stopped frames while a loader job waits.** `modwerk_dsp_stalled` counts only while a
transfer or a job (a meter PEEK, a pick) is in flight, so the record is taken at the next such job, not when the
frames stopped.

**A RAM boot does not rescue a stalled DSP; it hangs at the logo.** The soft reset parks both DSP cores first, and a
hung core does not park. After a DSP stall only a power cycle helps.

**After a crash restart, power-cycle before the next RAM boot** (rule from 12 October 2026, until disproved). A crash
restart (`crash.c`, or `crashtest`) lands on the flashed base without a power cycle, and its DSPs may be left as the
crash found them. That day the unit was found on the flashed `usbtest9` after an unknown restart, and the first RAM
boot from there hung at the logo (above, under USB and EP0). So after any restart that was not a power cycle, ask the
owner for one before arming a RAM boot.

**Never select core 1 at state 7, not even to read its host flags.** The
loader read each core's answer flags by setting the DSP select byte
(`0xfc0a400c`) to the core and back, from state 7. For core 0 that wrote the
value already there; for core 1 it switched, and the frames stopped: with
a packet sent there, and with nothing sent at all (`dsp2-AB2`, `core1Sent`
0). Stock switches cores only early in the frame (state 2 selects core 1,
state 3 core 0). Core 1's packet now goes right after stock's state-2 push,
and its flags are read at state 3's entry, while state 2 still has it
selected. With that (`dsp2-AB3`, `35b48eb4`) core 1 answered a probe and
took E-Verb's 68 packets with frames running.

**Clean a host word before a 56-bit compare.** E-Verb's upload to core 0
was refused at its fifth packet every time: a WRITE whose opcode, count and
offset, masked to 16 bits, were all in range (record `$020003`, count 24,
offset 136, `dsp2-AB2`), with a good checksum and no overrun. The receiver
masked each word with `and #$ffff` and then used `cmp` and `do`, which read
all of A, and `and` leaves A2 stale (Octabam's own trap). The receiver now
rewrites the header words masked once, after the magic check, and tests the
magic with `eor` then `and`, whose Z flag looks only at A1. All 68 packets
then went through on the unit (`dsp2-AB3`). The fix confirms that some header
words reach the DSP with junk in bits 16 to 23. Which bits and why was not
measured.

**The project's working state survives a RAM boot.** Picks made under one
test base were still there after booting the next (stock keeps a working
copy of the project on the card): a chooser opened on E-Verb, the last row,
so a scripted DOWN did nothing. Read the screen before scripting a chooser.

**A project that used a static module triggers its load at install.**
Static E-Verb and dynamic E-Verb share effect id 27, so installing E-Verb
started an upload at once on a project that already used it. Test the loader
on a blank project first.

**dsp_asm writes a backward `brclr` target absolute.** The chip reads that word as a displacement (stock's
self-wait at P:$57 is `0cd341 000000`); dsp_asm emitted `0cd341 001000` for a branch back to $1000. Loop
with `do forever` and `brkcs` instead (core 1's counted wait), and keep labels from being parts of other
labels (dsp_asm substitutes label text anywhere: `c1wait` inside `c1waited` stopped the build).

**Don't use `rep` in DSP code that runs every frame; use a DO loop.**
A calibration build spending 2,000 more cycles a frame with `rep` on both cores
hung the unit at its logo (`dsp3-B2`); the emulator ran it. The same amount in
an interruptible DO loop on core 0 alone was fine. A developer's report from an
MKI (11 October 2026, measured on the unit) gives the mechanism. Stock P code has
no `rep` at all, on either payload, and a REP is not interruptible (56300 FM
§2.3.2). The host-port handlers (P:$588/$597 on payload A) arm DMA0/1 from
M_HORX and must answer at once. Answered late, the ColdFire's transfer slips by
a word:
- each sample's read-back is torn, its halves from different moments, with L and
  R offset by a word;
- at worst ColdFire RAM is written out of place: a garbage project name, "never
  saved", "set not mounted", until a power cycle.

A per-sample `rep #21` did this on both cores, and the same loop as DO fixed it.
In this repository Spectrum (4), Character (5) and Modulation (1) still use
`rep`; the report also names busdelay, character-txtr, testgen and vocoder (at
init only). The base and the modules in today's runs (E-Verb, Mini Verb,
TapeHead, Euclid, Air Chorus, Tape Echo) have none. Not checked against "Junk on
main R" yet.

**Dense DSP work in a memory block a DMA uses stalls that DMA (reported, not
reproduced here).** When the core and a DMA channel contend for the same
internal memory partition, the core wins and the DMA waits (56300 FM §10.3.2).
The partitions are 8K words ($0000, $2000, $4000, $6000, $8000). On the same
MKI, dense work at X:$3224 failed, while X:$6400 and X:$7b24 were clean. Core 0's
DMA lives in:
- ESAI TX X:$8000-$80ff and RX X:$8100-$833f (DMA2/3, armed at boot P:$3001d,
  payload A only);
- the host ping-pong X:$2400-$28ff and X:$4400-$48ff;
- the records at X:$000-$1cf.

Dense X work in the $8000 block, and later the $2000 block, slipped the
ColdFire-core 0 handoff into states that held until the next disturbance:
- the track's output left only, right only, silent or stereo;
- a muted track leaking into MAIN on about 29 % of frames, mostly every other
  frame;
- at worst the sequencer stuck on step 1-2 until a power cycle.

It depended on where in core 0's frame the work landed (T5 and T8 clean until
disturbed, T6 and T7 dirty from the start). Core 1 never showed it, and Y has no
DMA on either core. Moving the 216-word working set to X:$7b24, inside stock's
unreferenced X:$7a92-$7fff (the $6000 block of tables and FX state), made it
clean on every track and both cores, with two instances, through a 10-minute
soak.

Possibly affected:
- Analog BD's DSP voice keeps its tables at X:$2840-$30ff and its voice blocks
  at $3100-$31ff, in the $2000 block.
- Any plan to put base tables in X:$8d98-$8fff (`OCTATRACK_MORE_EFFECT_IDS.md`):
  that is ESAI's block on core 0. Prefer the $6000 block.

To check: run the module on T5-T8 with the track muted and listen to MAIN, or
record MAIN with SRC3 = MAIN; leaked frames are the muted audio. Sweeping a knob
through a heavy mode and back flipped the stuck states. The emulator models
neither contention nor interrupt latency, so neither shows there.

## Patching stock code

**A detour returns after the whole span it displaced, never into it.** The
map's writer detour at `0x400888c8` displaced `lea` (4 bytes) and `tstl` (2)
and jumped back to `0x400888cc`, the second half of its own `jmp`. SYNC TO
CARD then stopped on stock's exception screen (`VEC:04`, illegal
instruction, `ADDR:400888CC`) and USB went away until a power cycle, with the
project file half-written (`dsp3-R4`). The build now refuses any absolute
jump in the base's assembly that lands strictly inside a patched site.

**Base seams must leave catalogue modules' sites alone.** The runtime loader
patches only over the exact stock bytes a package expects, so a base site on
a module's site refuses that module on the base. The project map once took
PLAY MODES' three project-file seams; it now sits beside them and SCALE
QUANTIZER's, and the build fails when a base site meets the stock bytes any
catalogue module patches or keeps (`catalogue_overlaps`).

**GCC 16.2 at -O2 can store one byte late.** Its late-combine pass turned
the controller board's byte copy into `move.b (%a0)+,(0,%a0,%d0.l)`. The
ColdFire computes the destination from the register it has just
incremented, so the whole COMPRESSOR descriptor landed one byte high. The
FX1 SETUP page then saw the wrong slots enabled and jumped through an odd
widget pointer: vector 3 (address error) at `0x40037c2a`, on a dev twin
built from base 9d5aa74d. Host builds never show it. The base now compiles
with `-fno-late-combine-instructions`. `sdk/runtime/m68k_codegen.py`
refuses any C object, in the base and elemod builds, where an instruction
steps an address register in its source and reuses it in its destination.

**Stock copies a table entry; restoring the table is not enough.** A track
bind (`0x4000bff0`, in the frame builder, on a trig that asks for it) copies
its machine type's renderer (`0x400d6434[type]`) into the track's
next-renderer slot (`0x400d61f0`); every frame copies that into the
current-renderer slot (`0x400d61d0`) and calls both (`0x4000d43c`). Start
routines are called from their table (`0x400d6454[type]`) and never copied. A machine package patches the type table, so
after it played, removing it put the table back but left the slots on its
freed code: the unit kept running the removed module until the next install
was copied over it, then crashed (vector 4 in pool code, beta run 2,
finding 30, twin `025b3559`). The loader now calls
`modwerk_machine_site_restored` whenever a site goes back to stock, and the
Octatrack runtime puts slots that hold the removed entry back to the stock
one. Any new site whose stock data is copied elsewhere needs the same
follow-up; fill freed memory with illegal instructions on a dev twin to see
such a leftover call at once instead of on a later install.

**The boot validates the bank before any module is back.** At power-up and
RAM boot stock restores the current bank from its battery-backed Part copies
(`0x40025770`) and runs the Part validator on each first; the saved module set
reinstalls modules only about 3 s later. One value the validator has to fix
refuses the whole restore: the bank is never copied in or applied, every Part
reads STATIC with stock defaults, no track is ever bound (renderer slots stay
`0x400047f0`) and the unit is silent, while the fix is already written into
the battery copy. A module whose Part bytes stock would reject must be kept
from the validator by the base itself, before the module is installed (beta
finding 24: Analog BD; reproduced on `ot_emu` with `--cs1-in --no-post`, twin
`43fe3fc4`).

## The emulator and the tools

What `ot_emu` does not show:
- DMA finishes instantly, so races between transfers and stock's frame
  machine never appear.
- Unaligned eDMA addresses are accepted.
- Host reads wait for the DSP's word, so host-read traps never appear.
- It never restarts from RAM, so the park-and-upload path is not covered.
- `--dsp` dies with a bus error in Docker unless `--shm-size=128m`;
  `--frame` is needed for the audio producer (USB audio) to run.
- It boots as an MKI unless given `--mkii`, and the MKI panel has no PROJ,
  PART, AED or ARR key: remote PROJ does nothing. Card writes stay in memory
  unless given `--card-rw`. Hold remote keys for unit ticks, not wall time:
  under `--dsp` it runs far slower than the clock.

**Keep one link open and drive it by name** (the full how-to: [OCTATRACK_DRIVING.md](OCTATRACK_DRIVING.md)).
- *The session.* Each `npm run device` call opens the bridge again (one to
  two seconds) and, after a quiet spell, brings up MODWERK CONNECTED.
  Instead run `while :; do npm run device -- serve; sleep 1; done` in a
  terminal. It starts the bridge, keeps the link open, sends a request every
  4 s so the popup shows once, and comes back after a RAM boot (`boot DIR`).
- *Sending.* `scripts/device-send.py 'part2 pick:T1:FX2:E-Verb stats'`
  replies in well under a second: `pick` by name (scrolled with LEVEL, done
  once the track runs it, about 1.4 s), `part1`-`part4`, `ui` (effects,
  current track, Part, transport), `stats`, `png:FILE`, `try`/`remove`.
- *Looking.* A screenshot at `--scale 2` (`png:FILE`) is cheaper to read
  than the text rendering. Take one only for screens `ui` cannot name.

Tools that work on this Mac:
- Development bases (`build_core.py --dev`): `npm run device -- key`,
  `enc`, `fader`, `state`, `screen [--png FILE]`, `loader`, `report`,
  `probe`, plus USB audio (MAIN and CUE).
- Recording: the repaired `rec.swift` (`sdk/machines/octatrack/hw/prepare_tools.py`,
  then `swiftc -O rec.swift -o rec; rec SECONDS OUT.wav Octatrack`).
  Homebrew's ffmpeg was broken (missing libx265).
- `dsp_asm` for `--dsp-loader` builds: build `source/dsp_host/dsp_asm` from
  Octabam's vendored `dsp56300` with CMake and set `ELEKLOADER_DSP_ASM`.
- Read device state in one USB connection when timing matters: separate
  `npm run device` calls each take most of a second.

## How to debug on the unit

1. RAM-boot a development base (`npm run device -- boot DIR`); a power
   cycle always returns to the flashed base.
2. Bisect with probe bases that differ in exactly one aspect, and read the
   report before and right after the step.
3. Watch the sequencer (two screen captures a second apart while playing)
   and USB audio; the loader's own counter freezes once it is switched off.
4. Keep the owner's projects out of it: a blank project avoids loads
   triggered by modules a project already uses.
5. Which admission refused a pick: every cause (code arena, transition,
   Y buffers, cycles) shows DSP MEMORY FULL. Read the manager's
   `allocator` (`core:allocator` in the twin's `symbols.json`) right after
   the refusal: with 128 effect ids a placement is 6 bytes (offset, words,
   present), `live[2][128]` at +24 and `target[2][128]` at +1560; a failed
   plan leaves its partial target, so the last id placed shows where it
   ran out. `capacity[2]` at +4, `keep[2]` (the Parts' union) at +3132.
