# Digitone II runtime loader

Development bases load modules into RAM over the [link](LINK.md) and run them beside stock, with no reflash: a trial
first, then Keep or a rollback. A power cycle ends every module and brings the flashed OS back. The loader is the
machine-neutral [`sdk/runtime/loader`](../../runtime/loader/README.md) with its
[upload controller](../../runtime/upload/README.md); the Digitone II's glue is
[`elekloader/base/runtime.c`](elekloader/base/runtime.c), the Octatrack's with OS 1.12's addresses.

```sh
python3 -B sdk/runtime/loader/build.py MODULE.c -o MODULE.mwrm                       # a package from C
python3 sdk/machines/digitone-ii/tools/dn2_link.py loader                            # phase, the live set, staged bytes
python3 sdk/machines/digitone-ii/tools/dn2_link.py try MODULE.mwrm --seconds 10      # a trial, then rolled back
python3 sdk/machines/digitone-ii/tools/dn2_link.py try MODULE.mwrm --keep            # a trial, then kept
python3 sdk/machines/digitone-ii/tools/dn2_link.py remove MODULE.mwrm --keep         # that module's removal, kept
python3 sdk/machines/digitone-ii/tools/dn2_link.py keep    # or undo: the open trial
```

A first module to try is [`examples/corner_dot.c`](examples/corner_dot.c): while it is live, a 3x3 dot sits in the
screen's bottom-right corner.

The unit must be stopped: the loader refuses while the sequencer plays (`unsafe`), and SETTINGS > REMOTE CTRL must be
on. While a trial is open the host sends a frame at least every ten seconds (`try` does); a host gone for ten seconds
is handled as unplugged, and the unit rolls the trial back once it is stopped.

## Transport

The link's `upload` command (0x30) carries one frame of the controller's wire v1, 7-bit packed in the link's format;
the reply's payload is its 144-byte response, packed the same way. A chunk frame of 2,048 bytes is about 2.4 KB of
SysEx. Stock passes link messages of up to at least 8,192 bytes to the link's receive site (measured on a unit), and
link.c keeps one frame at a time in its own slot (`UPLOAD_IN`, the largest frame): a frame sent while one waits is
dropped and counted in `ident`. The UI task runs it: the controller, the loader's admission and its switches never
run in the MIDI task.

**Which build HELLO names.** The controller's base is the development build's layout digest: `machine:base
--dev` hashes the staged sources and the merged recipe (cflags, defsyms, sites; `layout_digest` in
`scripts/machine-base.py`) and writes it to `base/build_identity.h` (base.json's dev `identity`), prints it and saves
it beside the package as `.identity`. Two development builds with different layouts report different bases, and an
offer bound to one is refused on the other (the controller's identity check). `dn2_link.py try --base FILE` refuses
before sending anything when the unit's HELLO names another build.

## The Digitone II's glue (OS 1.12)

Each value was found in the stock OS and checked on a unit (20 November 2026).

| What the loader needs | Here |
| --- | --- |
| Stopped | The sequencer's playing word, 0x42c5b918: 1 while it plays. Recording needs it to play |
| Uncached alias | DDR + 0x0800_0000: ACR0 (0x4007e020) caches 0x4000_0000-0x47ff_ffff only, so 0x4800_0000 up is uncached; it read the same as the cached view on a unit |
| Instruction caches | CACR 0xa40ce100: stock's boot value 0xa50ce100 without DCINVA, which written now would drop every dirty data-cache line |
| Patchable code | The OS's code in RAM, 0x4000_0400 to 0x401d_0800: not its vectors, not the tables after it. An update flashes the upload buffer, never this RAM |
| Lock | Interrupt level 4: the time slice (PIT0, vector 205, level 1), USB and the UART wait; the frame interrupt (vector 191, level 5), the kernel timers (vectors 221 and 222, levels 6 and 5) and DMA (level 6) run, so the sound goes on |
| Paused tasks | The kernel's task records: `task_create(tcb, entry, priority, stack, size)` at 0x400012c8, fifteen calls, sixteen tasks. Their table is in runtime.c; two are created on a condition only, and a TCB whose list head (+8) is 0 was never created. Each TCB holds d0-d7/a0-a7 at +0x0c, its saved sp at +0x48, as the Octatrack's. The current task is 0x4664bcdc's, the sixteen ready lists start at 0x4664bc9c |
| Pool | 2 MiB at 0x4680_0000, staging 256 KiB at 0x46a0_0000 (`RUNTIME_POOL_AT`, base.json): above all DDR stock uses. Stock clears up to 0x466b_8c50 at boot and, through the uncached alias, keeps DMA buffers from 0x466c_0000 and a descriptor ring at 0x4670_9300 (about 0x4670_9340 at most); no stock instruction names DDR above that, in either alias (values such as 0x4f00_0000 are float constants). On a unit the pool's area read as power-on noise, and a nearly full pool left the sound normal. Below the RAM boot's copy at 0x4700_0000 and the base's area at 0x47f0_0000 |
| Hooks | The core's `ev_tick` (30 Hz), `ev_draw` (the frame's Bitmap object, the Digitone II's own), `ev_key` (the panel's key ids, [LINK.md](LINK.md)) and `ev_enc` (1-8 A-H, 9 LEVEL; the delta in the encoder's raw counts, as the Digitakt II's mods read it) |

## Seen on a unit

[20 November 2026](../../../docs/verification/2026-11-20-digitone-ii-runtime-loader-on-a-unit.md): a trial, a rollback,
Keep, a removal and the rollback of a host that went away, each with the base booted from RAM; a refusal while the
sequencer played; the tick, draw, key and encoder hooks; a stock-code site patched, run and restored, ten times over.
Not yet: stock copies, a switch while another task is paused inside a site, and a package converted from a catalogue
mod.
