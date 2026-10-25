# Octatrack hardware traps

Things that work in the emulator or on paper and fail on a real Octatrack
MKII (OS 1.40C), found while bringing up the Modwerk base, its USB link and
the DSP loader on the owner's unit in October 2026. Read this before
changing the base (`sdk/machines/octatrack/elekloader/`), the upload
transport (`sdk/runtime/upload/`) or the DSP loader. Octabam's own traps are
in [sdk/octabam/AGENTS.md](../sdk/octabam/AGENTS.md); the long record with
every run is [OCTATRACK_ELEKLOADER_MIGRATION.md](OCTATRACK_ELEKLOADER_MIGRATION.md).

Each entry: what you see, why, the rule, and the build it was observed on.
Entries reported from other units, rather than seen on the owner's, say so.

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

## Writing NOR over USB

**Stock's OS UPGRADE reads the whole card file into RAM, then erases and programs NOR from there** (1.40C:
the sector erase at `0x40020628`, the 256-byte page program at `0x400206f4`, the 37 sector starts at `0x400a95c0`,
8 KB boot sectors from `0x4000` then 64 KB to `0x1f0000`). Both routines unlock, command and poll the chip
themselves and mask interrupts only around the command bytes, so calling them from the engine task keeps the
frame interrupt within its limit. The file buffer stock uses (`0x46147b2c`, its length at `0x46147b28`) is not
free in normal operation (a 28-byte-record list lives there too): the base copies the container into its own
reserve instead (`flash.c`). The bootloader depacks NOR from `0x4012`, the section header, and checks nothing: an
image that does not boot is recovered over DIN MIDI only, so the base writes only a container that depacks to the
base it is itself running (`sdk/machines/octatrack/elekloader/README.md`, "Updating the base over USB").

**Don't check a running image against its own RAM.** Once stock has started it rewrites bytes inside its
bootloader copy (`0x400e201e`-`0x400e2108`) and reuses the RAM after the image, where MAIN keeps the packed `.run`
(161,328 of its 165,076 bytes changed after 20 s on ot_emu, base `d6bfff70`, 23 October 2026). The first base's
write compared both against the running RAM and refused every container (refusal 105, "Device refused commit:
backend" on a tester's unit). `flash.c` now compares the copy with stock's digest and the stream with a digest `.boot`
takes before it returns to stock (`modwerk_flash_snapshot`).

**Not yet seen on a unit (20 October 2026):** the USB write is host-tested against a NOR model and the stock
routines are read, not run; the first hardware run is the owner's call, with a MIDI interface at hand. Qualify
the written base after a sustained power-off too, not only the soft restart that follows the write (a tester reported a base stalling at the logo only after minutes
powered off, 18 October 2026).

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

**Work inside the frame interrupt counts against the same deadline.** POLY8 renders its voices in the frame interrupt.
On the owner's MKII (23 October 2026, RAM-booted twin of the beta base without `--cached-modules`), a build with its
voice limit switched off took about 34,000 DTIM3 counts (257 µs) of POLY work in one frame at six voices, and the
frames stopped for good (stall record "frames stopped"). Bound what a module does per frame in the interrupt and
measure it with DTCN3 (`0xfc07c00c`, 132 MHz, about 47,900 counts a frame); POLY8 0.3.1 sheds voices above 26,000.

**One long frame does not stop the DSP; a frame interrupt that keeps the CPU does.** Measured on the owner's MKII
(24 October 2026, development twins of the frame guard's branch, timing the interrupt from its entry `0x4000aad0` to
its exit `0x4000d9a6`), in a bank of eight tracks trigged on every step:
- **Each track renders about twice a frame:** the interrupt calls each track's renderer twice in most frames.
- **Long frames pass.** Stock tracks alone ran frames up to 96 % of a frame; with POLY8 0.3.1 up to 107 %; with FM Synth
  and USB recording up to 148 %, starting up to 69 % of a frame late. None of these stopped anything by itself.
- **The share stops it.** POLY8 0.3.1 on T1, FM Synth 0.1.2 on T2 and six busy stock tracks kept the interrupt at 86.5 %
  of the CPU (meter 94 %). Starting USB recording took it to 89.5 %, and the frames stopped within about 1,000 frames
  (stall record "frames stopped", sequencer stuck on its first step). With the interrupt kept near a whole frame every
  frame, the panel froze and USB disconnected too.
- **The guard.** The base gives the interrupt 80 % of each frame, saving up to half a frame from short ones, and
  renders stock's silent source for a machine track whose render would overdraw it (`machine_registry.c`). The same
  load and recording then ran with the interrupt at 79.7 % and a clean recording, with POLY8 skipped on about half its
  renders; POLY8 alone, sparse or on every step, was never skipped (the interrupt at 66 % and 70 %). Card builds have
  no guard. On a development base `npm run device -- guard` reads the interrupt's share, its longest frame and the
  skips, and `guard:MILLE` sets the share.

**Walk the module list once, not once per question.** A lookup that reads module headers from the pool (uncached) inside a loop over every module is quadratic in what is installed. The controller tick did that once per held controller and check, and with 26 modules (Sidechain, Output Matrix, Analog BD among them) it cost 0.8 ms of every UI tick (owner's MKII, 24 October 2026). Find an owner by its record in base RAM, read the pool only for that one, and keep results while `modwerk_runtime_owner_epoch()` stands even and unchanged (`loader.h`), checking the header with `modwerk_runtime_owner_held`. `npm run device -- do 'mem:ADDR:112'` on `modwerk_cost` (development bases) shows each tick hook's µs, and the frame guard's `guard` step shows what the frame interrupt takes.

**Uncached module code is slow in the interrupt, and so is its data.** Without `--cached-modules` every instruction
and every load or store of a module goes to SDRAM. POLY8 0.3.0 cost about 13 points of CPU per voice there and about
3.5 with cached module code (same day, same twin pair). Running only its tight loops from the cached alias barely
helped: the buffers' uncached reads dominated. A module can run its own hot path from the cached alias (its address
minus `0x08000000`) only if all of these hold, as POLY8 0.3.1's `polyphony.s` does:
- its state that other code also touches stays on uncached addresses: absolute `SYM:l`, never PC-relative from code
  running cached, or a later write through the uncached alias leaves a stale line;
- every line it touched through the cached alias is pushed before the interrupt returns (`cpushl %dc` on every way of
  the line's set, as the base's `modwerk_machine_flush_data`), so no dirty line survives a removal;
- it invalidates the instruction and branch caches whenever its own address changes (stock's CACR value plus ICINVA,
  `0xa40ce100`, as `modwerk_machine_invalidate_code`).
A push costs about 30 counts for a dirty line: caching a buffer that is read many times pays, caching a record touched a
few times barely does.

**A starved UI task freezes the CPU meter and swallows key releases.** At 100 % CPU the `stats` CPU word stops
changing, because the UI tick computes it, and panel key-ups queue behind the UI task. Notes whose release would end
the overload then never end: POLY8 0.3.0 froze the panel for about 33 s at four held voices. Read overload from the
diagnostics log's `freeze` and `hot` records or the module's own counters, not from the meter, and let a module that
works in the interrupt notice when the UI stops ticking.

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

**dsp_asm writes a `brclr` label target absolute, forward or back.** The chip reads that word as a displacement
(stock's self-wait at P:$57 is `0cd341 000000`); dsp_asm emitted `0cd341 001000` for a branch back to $1000, and
the label's address for a forward branch too (a branch four words ahead at P:$1098 went to P:$2134 and core 0
ran off the end of P memory, reported 16 October 2026). An assemble-and-decode roundtrip does not catch it: a
decoded label matches any number. Loop with `do forever` and `brkcs` instead (core 1's counted wait), or write
the displacement as a number and check it against the listing. Keep labels from being parts of other labels
(dsp_asm substitutes label text anywhere: `c1wait` inside `c1waited` stopped the build).

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

*The data cache and module memory (cached modules):* the pool is cached copy-back, so code written through the
cached alias sits dirty in the data cache until CPUSHL pushes each line. CPUSHL names a line by set and way, and this
cache has more sets than address bits 12:4 name: a push that walked `0x2000` bytes of sets "once for the whole cache"
left half of a 17 KB extent in the cache while memory still held the BSS zeros, and the first call into it hit an
illegal instruction (`ori.b`, beta finding 60). Push every line of a range by its own address. The crash record
reads the PC's bytes both cached and through the uncached alias so this is visible: equal bytes mean a wrong jump or
a stale instruction cache, zeros or other bytes uncached mean the push did not happen.

## Patching stock code

**Audio-track LFO waveforms** (OS 1.40C, measured in `ot_emu`, 24 October
2026; background in upstream Octabam's `docs/firmware/LFO.md`):
- Slots 19-31 of the audio waveform dispatch table `0x400d6210` are SAW
  padding. A new wave also needs the WAVE count (`0x400d38ac`), the label
  formatter's clamp (`moveq #19` at `0x4003be50`) and the WAVE cell drawer's
  icon bound (`moveq #19` at `0x4004693c`: no icon is drawn above it), and
  grows the label (`0x400be38e`) and icon (`0x400bdf36`) tables.
- The engine calls the handler every frame in every TRIG mode. `fp` holds
  the TRIG record `0x80006184 + 16 n`, with n the mode and 8 more on a trig
  of the track. In HOLD the engine keeps its live value between trigs and
  takes the handler's output only on a trig.
- A trig is a sample trig, or a trigless trig once the track has played a
  sample trig since PLAY (the sample need not still sound); trigless locks
  never count.
- The engine adds `(DEP_word << 8) * out >> 31` to the destination word in
  EMAC fractional mode (DEP 127 counts as 128), one knob step being 256 in
  that word. On PTCH a knob step is 1/5 semitone, and LFO pitch stops at
  +-12 semitones.
- The track's step counter (`0x800064d0 + t`) moves one sequencer tick
  before the step's trig fires and shows 0 on the track's last step; its
  tick (`0x800064f0 + t`) reaches 1 just after the trig.
- The LFO's output is the word at its record `0x800010e8 + 28 i` + 4
  (i = 3 t + LFO), which the handler writes every frame: reading it over USB
  shows a wave's values (owner's MKII, development twin `7889c57a`, 24
  October 2026).
- The engine runs the wave handlers inside the frame interrupt, and in FREE
  every LFO of equally fast tracks changes in the same frame, so a wave's
  change path and any first-use set-up add to that one interrupt. Measured
  in `ot_emu` with 24 LFOs on Deja Vu's DJQ under a MIDI flood: the frames
  where all 24 change took 32.9 µs more than on stock RND, and the frame
  where all 24 set up their state took 202.9 µs against 131.8 µs.
- In `ot_emu`, writing a Part's LFO bytes into RAM after the load does not
  reach the engine, which reads per-track page records filled when the Part
  loads. Write them into the bank file on the card before the load
  (`ot_project`'s offsets, checksum fixed).

**A detour returns after the whole span it displaced, never into it.** The
map's writer detour at `0x400888c8` displaced `lea` (4 bytes) and `tstl` (2)
and jumped back to `0x400888cc`, the second half of its own `jmp`. SYNC TO
CARD then stopped on stock's exception screen (`VEC:04`, illegal
instruction, `ADDR:400888CC`) and USB went away until a power cycle, with the
project file half-written (`dsp3-R4`). The build now refuses any absolute
jump in the base's assembly that lands strictly inside a patched site.

**Stock can branch into the middle of a span a detour displaced.** That
build check covers the base's own jumps, not stock's. A scale quantizer's
eight-byte detour at `0x400449b8` displaced a stack push that a second
stock path (MIDI TRACK > CHROMATIC) enters directly at `0x400449be`. Audio
CHROMATIC worked through the detour; the MIDI path skipped the push, the
formatter popped four bytes too many and returned into the LCD surface
(`VEC:04` at `0x400bf10a`). Reported from a tester's MKII, 15 October 2026,
and reproduced on the ColdFire emulator. Before taking a span, look for
stock branches to every instruction after its first; shorten the detour
and keep a shared target stock (Quantizer 0.1.3, its TESTING.md).

**One copy of the arena base literal is not the arena.** The sample arena's
stock base address is the operand of 23 instructions. 22 of them are the
arena. The 23rd, at `0x400254f8`, ends PURGE SAMPLES' walk over the 16
sample banks, and holds the same value only because the banks end where the
arena starts. Moved with the base, the walk runs past the banks, reads off
the end of RAM and the unit freezes on PURGE SAMPLES. Reported from a
tester's MKII, 16 October 2026, and reproduced on the ColdFire emulator.
Anything that moves the arena base leaves that operand (`0x400254fa`)
stock. Elekloader's core-ot does from 0.3.1, and the card builder
(`sdk/octabam/tools/remix/arena.py`, `src/engine/assets/platform-writes.json`)
from 22 October 2026, after card builds froze on PURGE SAMPLES (#707); check
any new list of arena writes the same way.

**`movem.l …,(%sp)` writes over the caller's frame.** `(%sp)` is plain
indirect (mode 2): it stores at sp and leaves sp where it was, so a
register save without a reserved frame overwrites the return address and
whatever lies above it, and the restore reads it back. The ColdFire has no
predecrement `movem`, so reserve first: `lea -N(%sp),%sp`, `movem.l
…,(%sp)`, and the reverse on the way out, as `hooks.s` and `rom_gate.s` do.
GCC's own output always reserves; hand-written saves are the risk. Reported
from a USB module's control-transfer handler, 19 October 2026.

**A non-zero popup pointer does not mean FX SETUP is open.** `0x460d175c`
points at a popup object shared by MIXER, TEMPO and other dialogs. Check its
open flag and SETUP's geometry before calling the FX window's draw. A
lock-byte or memory check can pass while the screen stays stale: stock's
trig-down redraws the main page only, and that redraw does not repaint the
SETUP popup, so refresh the FX window yourself after an edit. Reported 16
October 2026; verify page edits on the decoded LCD, not in memory alone.

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
`43fe3fc4`). That includes a module that gives a stock effect's slots new
meanings: Sidechain Compressor's KEY, KFLT and KGN in COMPRESSOR's page-2 slots
8-11 wiped testers' current banks at every power-on (finding 47; a RAM boot of
the owner's MKII twin of `a1471aeb` did the same). The restore also runs a
pattern validator (`0x4009a670`, not hooked) on all 16 patterns, so pattern
bytes a module writes need the same care. To test a module for this, set it up
in a scratch project's current bank and RAM-boot: the restore and both
validators run as at power-up. A refused restore has already written its fixes
into the battery copy, so the next boot restores the bank with those values
changed (Sidechain's KFLT 64 became 1). To recover a bank lost this way, do not
save or edit: power-cycle once more, or PROJECT > RELOAD the last save from the
card.

**Stock redraws a page only on its own events.** A module that patches how stock
draws a page shows only at the next key that redraws it. On the Output Matrix
author's MKII (20 October 2026, RAM-booted `b5fae2ae` and `3e3e3de1`), installing
Output Matrix over USB with OUT CFG on MATRIX left the LEV box with stock's LEV
label and split bars until CUE was pressed (audio was right). After a power cycle
on flashed `3e3e3de1` (16 October) the restored set looked the same. A RAM-boot
restore did not reproduce it on either base: the screen redrew as the module
loaded and the MODULES LOADED dialog appeared. The track screen's drawer is
`0x4004d948(-1)`. CUE's handler (`0x4004e978`) does nothing more, and the drawer
marks the display for the UI loop's flush (`0x46c7c72c`). It writes the screen's
plane and globals, so call it only from the UI task (`ev_tick`, key and encoder
handlers), never from the engine task that installs or from an interrupt. The
base calls it on the UI tick once the live modules change (`runtime.c`). On the
same MKII the fix base `2f575d3e` showed Output Matrix's own label right after the
install. That build was made before a rebase onto newer main code; the same
`runtime.c` is now in base `6650236a`. After a RAM-boot restore `2f575d3e` showed MNL with a solid bar that CUE left
unchanged. A PROJECT menu stayed intact through an install and a removal. Flashed
`6650236a` (same MKII, 20 October 2026): an install, the first boot's restore and a
power cycle with six modules kept each left MNL with a solid bar, no key pressed.

**A RAM boot can come back without USB.** On 19 October 2026 one RAM boot of a
dev twin (`82b9bef4`) ran for over 15 minutes (its log has loads) but never
enumerated on the Mac: no Elektron device at all, not a dead bridge handle.
Only a power cycle brought USB back. The same image had RAM-booted cleanly
before and did again after.

**An unused setup slot is not free storage.** MIDI NOTE SETUP shows four values, but its window binds all six
encoders: D and F edit the two `----` slots (setup record +0x03 and +0x05) unseen, and YES commits all six staged
values, so a byte kept there is changed by a turn nobody sees and overwritten by the next YES (owner's MKII, 21 October
2026). The MIDI generator registry keeps its choice in the arp step mask instead (`midi_generators.c`). Before using a
"spare" Part byte, check stock's validator range for it and every editor that can write it.

## ColdFire and DSP load

Measured with `stats` on the owner's MKII, dev twin `82b9bef4`, 19 October
2026, in a scratch project (trigs on T1-T5). The ColdFire figure moves by
several points with the page on screen, so compare only readings taken on the
same page.

- **Bare base:** about 42-47 % CPU, nothing installed. No stock-OS reference
  has been measured on this unit yet.
- **ColdFire cost of an installed module**, from removing modules one at a time
  with nothing in use:
  - FM Synth: about 8 points while installed, even when no track uses it, and
    about 5 more while a track plays it.
  - Repitch: about 2 points.
  - BBD, Tape Echo, TapeHead, E-Verb, Mini Verb: 0.5 points or less each.
  - Air Chorus: within noise.
- **DSP cost of a module effect** is on its core: BBD picked on T6 took core
  T5-8 from about 44 % to 54 %, with no ColdFire change.
- **DSP FULL:** with FM Synth on T1 and Mini Verb, E-Verb and Tape Echo on
  T2/T3/T5, TapeHead on T4 and Air Chorus on T8 were refused.
- **Testers' layout** (FM Synth plus four module effects, a tester's
  "sluggish knobs" report): about 65 % CPU stopped, about 73 % playing. The
  unit's own log shows a 100 % peak in every five-minute window, as testers'
  logs do even on the bare base.

**The base's own CPU cost, measured** (owner's MKII, 20 October 2026, development twins with the profile below;
stopped, nothing installed, no page of ours open): the tick hooks 843 µs a tick (5.1 % of the CPU), the draw hooks
28 µs a composition (0.2 %), `dl_frame` 1.1 µs a frame (0.3 %), `mw_ui_tick` 18 µs (0.1 %): about 5.7 % in all. Of
the tick, `modwerk_fxmap_generation` took 410-446 µs on its own: the fx map's 3 KB checksum in battery RAM, every
tick (fixed: 8 µs, the whole sum once in 60 calls). With that and the Part-union scan every fourth tick, the tick
hooks cost 311 µs (1.9 %) and the base about 2.5 %. With FM Synth and five effects installed the tick hooks cost
530-550 µs: `controller_tick` 170-180 µs (it derives every installed module's trust binding each tick) and
`dsp_tick` 240-250 µs (the compaction planner plans both cores each idle tick); both fixed: the binding is derived
again only when the runtime's owners change (or one waits), the planner holds off until a commit, a rollback or an
arena change. Then: 175 µs a tick idle (1.1 %), 280 µs with that layout (1.7 %); the base about 1.7 % in all. A page
of ours that is open costs
its drawing on every composition: MISSING MODULES 818 µs (4.9 %), the STATUS page about 1 ms. No stock-OS baseline
exists yet: the meter's 41 % idle is stock's own tasks.

**A controller's write lease is not free** (owner's MKII, 22 October 2026, profiling twins of the package-carried-engines
branch, uncached module code). Analog BD on one track cost the ColdFire about 20 points, stopped or playing, against a
FLEX track. Timed around the machine renderer (5,600 calls a second: two a frame) and inside the lease: a call cost
8,108 DTIM3 counts, 93 % of it the lease's Begin and End, two thirds of that `modwerk_runtime_owner_held`, whose owner
check reads the module's header (identity and package digest) through the uncached alias on every Begin and End,
about 0.6 µs a read. Analog BD's own code was about 600 counts. With one lease a frame (the frame's first renderer
call writes no control record and takes the stock silent source) and no second digest in that check: 2,375 counts a
call, the module about 10 points. Cached module code (`--cached-modules`) saved about a quarter of the original cost
on its own. So: take a lease only where a call writes, at most once a frame, and keep the owner check's reads few.

**Core 1's load meter counts at X:$2840** (`dsp_receiver.asm`, `c1wait`) on every USB base: every pass of core 1's
wait for core 0 adds one there, and each frame takes and clears it. Analog BD's X region starts there, and its 909
kept PITCH 0's step in that word until 0.1.6 (a wrong, jittery pitch on tracks 1-4 at PITCH 0 over USB). Keep module
state off X:$2840 on core 1.

*The profile* (development bases only): `modwerk_cost[24]` (diag.h) accumulates DTIM3 counts between stamps at
each hook's entry and some exits; read it over `mem` twice some seconds apart and divide by 132 for µs (`modwerk_cost[15]`
counts ticks, `[13]` compositions, `[11]` frames, `[19]` fx map checks). A tester base has none of it.

*Reading the battery-RAM log (diag.c):* an OS upgrade leaves the same trace as a hang. Stock halts the DSPs for the
upgrade while the loader may still have a job open, so the next boot logs a `stall` (reason 1, frames stopped) after a
`hot` record at 100 % CPU whose last keys are the PROJECT > SYSTEM > OS UPGRADE walk (PROJ, arrows, YES). Seen on the
owner's MKII flashing `a0dd21c4` (20 October 2026) and in every tester stall of the 16-20 October pull. Until the start
record carries the base id, read a stall followed by a start on another base as an upgrade.

*A module's edit can cost milliseconds on the UI task.* Installed module code and data run uncached (the cached
alias is `--cached-modules`, a prototype), so a loop over a pattern record costs far more than in the base. On the owner's
MKII (21 October 2026, development twin `c2f6b65e`), VECTOR's 64-step MIDI rewrite took 3.9 ms a knob turn: about 3 ms
in stock's lock-index rebuild `0x400339d8`, which rescans all 16 tracks' 64 x 32 lock bytes, and 0.8 ms copying the
2,224-byte track record in and out. Setting only its own track's bit of the per-step lock index (MIDI `0x46c7d2e4`,
audio `0x46c7d48c`, as that routine does) and writing the record in place brought it to 0.5 ms. Audio frames stayed
at 406-417 µs apart throughout, since all of it runs on the UI task. Time a module's edits with the profile below
(`[24]`-`[27]` are the MIDI generators'; `[18]` and `[19]` are the fx map check's).

*The DSP peak meter:* a core's peak (status.c, the diag log's five-minute windows) is the busiest single frame of a
1,024-frame receiver window. A self-test that runs DSP modules, or a sync, leaves the window at 99.7-99.8 % although
the mean stays flat and the audio is fine; a stock effect load does not. Read the self-test's longest frame for
overload, not the peak (finding 59 in the beta test plan).

## Cold starts and card writes

**A cold start can stall at the logo where a quick restart does not.** An
early-startup change passed emulator boots and quick power cycles on a
tester's MKII, then stalled at the logo after several minutes powered off
(reported 18 October 2026). Moving the small activation helper into the
resident OS image fixed repeated cold starts on that unit; the module itself
still runs from RAM. The mechanism is not known: it does not show a defect
in RAM execution, the loader or the cache. Keep startup gates and activation
helpers resident where you can, publish a callback only once its runtime is
ready, and qualify a startup change after a sustained power-off as well as
a quick restart. The emulator models neither cache, reset settling nor RAM
retention.

**A card-write completion interrupt can run before the bookkeeping it
reads.** Stock's first-sector PIO write lowers the interrupt mask again
before it sends the 256 data words and before it advances the buffer pointer
and the remaining-sector count. If the engine task is preempted after the
last word, the completion interrupt sees the old count, polls for a data
request the card has already finished, and spins for ever; the engine never
resumes to fix the count. Seen only on the ColdFire emulator, as a gate hang
(15 October 2026); whether real card timing opens the window is not
measured. When a hang follows card writes, ask what an interrupt handler
reads while the producer is mid-update before chasing parsers, names or
card latency.

## Octabam's register

Octabam moved its trap register out of `AGENTS.md` into `docs/contributing/TRAPS.md` on 14 October 2026 and kept adding to it. Both are vendored unchanged, pinned at the revision in `sdk/imports/octabam-infrastructure-5c71bc8c.json`: [sdk/octabam/AGENTS.md](../sdk/octabam/AGENTS.md) (the register to 30 September 2026) and [sdk/octabam/docs/TRAPS.md](../sdk/octabam/docs/TRAPS.md) (the register to 23 October 2026, with anchors). Of the entries added since the snapshot, these reach Modwerk's base, loader, DSP sources and emulator work; the ones about `brclr`, descriptor names, label prefixes and `rep` are already above or in the effects guide.

- **A zero CS1 with a valid settings tail boots stock's settings as zeros** ([trap-cs1-zero](../sdk/octabam/docs/TRAPS.md#trap-cs1-zero)). A base variant that reads run-time settings from the CS1 early block must treat an all-zero block as "no settings", not as every setting off.
- **Same-named labels across DRAM units resolve by nm table order** ([TRAPS.md](../sdk/octabam/docs/TRAPS.md), "Same-named labels across DRAM units"). Two linked units with a local label of the same name bind a reference to whichever the symbol table lists first; octabam now resolves symbols per unit. Keep labels unique across the units one runtime links.
- **`moveml %sp@` is the mode-2 form: it stores at sp and leaves sp unchanged** (same file). A ColdFire save sequence that means to push must use the predecrement form; the port runs the wrong one happily.
- **A completion interrupt in the first-sector card write window polls DRQ on a count the producer has not updated yet** (same file). Card writes from an interrupt context race the PIO sector loop; octabam's ATA WRITE GUARD keeps the first sector and its pointer update atomic. Anything Modwerk writes to the card from a hook must hold the mask the same way.
- **The emulator's bench socket is non-blocking and dropped the rest of a large reply on EAGAIN** (same file; fixed in the vendored `usb.cpp`). A bench client that read a truncated reply was seeing this, not a firmware fault.
- **A persistent slot that init does not clear holds whatever the effect before ours left in the block** ([TRAPS.md](../sdk/octabam/docs/TRAPS.md), "A persistent slot"). Init zeroes every slot the sample loop reads before it writes; `dsp_host -dirty` and the vendored `-pword` option (a knob word with its LFO companion bits 8-15 set) reproduce both of these locally.

## The emulator and the tools

What `ot_emu` does not show:
- DMA finishes instantly, so races between transfers and stock's frame
  machine never appear.
- Unaligned eDMA addresses are accepted.
- Host reads wait for the DSP's word, so host-read traps never appear.
- It never restarts from RAM, so the park-and-upload path is not covered.
- `--dsp` dies with a bus error in Docker unless `--shm-size=128m`;
  `--frame` is needed for the audio producer (USB audio) to run.
- It honours one `--watch-mem`: given several, it reports only the last.
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
