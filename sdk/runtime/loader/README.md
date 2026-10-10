# Runtime module loader

Loads, replaces, rolls back and removes a ColdFire module on a running
instrument without a reboot: its own code and data, hooks on the machine's
hook bus, and patches to stock code. It is the backend of the
[upload controller](../upload/README.md) and does not depend on a machine:
every instrument Elekloader supports (Octatrack, Digitakt mk1 and mk2,
Digitone) has a ColdFire V4 CPU and a hook bus with tick, draw, key and
encoder events. Development only; the Octatrack is the first machine with
glue.

| File | What it is |
| --- | --- |
| [`modwerk_module.h`](modwerk_module.h) | What a C module sees: its four handlers and the test value |
| [`build.py`](build.py) | Builds a package from C sources, or from a catalogue module converted by Elekloader |
| [`verify_static.py`](verify_static.py) | Proves a package places the same bytes as Elekloader's static link of the module |
| [`loader.h`](loader.h), [`loader.c`](loader.c) | The loader and the glue a machine provides |
| [`tests/host_test.c`](tests/host_test.c) | Host test, run by `sdk/tests/test_runtime_loader.py` |

## Package, ABI 3

Big-endian. Header (28 bytes): `MWRM`, ABI u16 = 3, flags u16 = 0, image
length u32, bss length u32, relocation count u32, hook count u32, site count
u32. Then one u32 offset per hook (`0xffffffff` for none), the image (code,
read-only and initialized data), one u32 offset per relocation, and the
sites: address u32, length u16, relocation count u16, the stock bytes, the
new bytes, and one u16 offset per relocation in the new bytes.

- Hooks, in this order: `module_tick`, `module_draw`, `module_key`,
  `module_enc`. Later events append. A base refuses a package with more hooks
  than it dispatches; hooks a package does not list are empty.
- A relocation names a 32-bit word (of the image or of a site's new bytes)
  that holds an offset into the module. The loader adds the module's address.
  A word that points outside the module, or one listed twice, is refused.
- A site replaces whole stock instructions: even address and length, at most
  32 bytes, inside the stock code the machine allows, not overlapping another
  site of the package.
- No image, hooks or sites removes the module.

From C, `build.py` links the module twice, at 0 and at 0x10000: the words
that differ by exactly 0x10000 are the relocations, and any other difference
(such as a 16-bit reference to the module) is refused. From a converted
catalogue module (`sdk/machines/octatrack/elekloader/build_ports.py`), it
lays out the `.run` section with the stock bytes it copies, resolves the
listed relocations, imports from the base's symbol map, and checks every
site's stock bytes against their recorded hash. Such a package holds stock
bytes: keep it private, like a firmware image. `verify_static.py` then links
the same module statically with Elekloader and requires the package, placed
at the same address, to match it byte for byte.

```sh
python3 -B sdk/runtime/loader/build.py MODULE.c -o MODULE.mwrm
npm run device -- try MODULE.mwrm --seconds 10   # scripts/device.mjs
```

## Loading, and why it is safe

- **RAM only.** Module memory comes from a pool in the base. Sites are
  written only where the machine's `modwerk_machine_patchable` allows: on
  the Octatrack, the RAM copy of the stock OS image, never the copy of the
  bootloader inside it that the OS can write to flash, never flash,
  peripherals or the base itself. A power cycle restores everything.
- **Exact bytes.** A site is written only over the stock bytes the package
  expects, read through the uncached alias; the result is read back. Any
  mismatch puts the previous module's bytes back and changes nothing.
- **Nothing runs while code changes.** Hooks and sites switch together with
  interrupts masked. First the loader checks every other task's live stack
  and saved registers: an address inside a site (other than its first byte)
  means a paused task could resume in the middle of a new instruction, so
  the switch is refused and can be retried. Unknown task state also refuses.
- **No memory reuse.** Pool memory is never reused before a reboot, so code
  a task may still be running is never overwritten; when the pool is full,
  loads are refused until a reboot. Data-cache lines are pushed before code
  is written, and the instruction and branch caches invalidated after.
- Activation needs nothing playing or recording. A bus reset or unplug rolls
  back anything not accepted (the controller's disconnect).

## Porting to another machine

A machine provides, next to its base:

- `modwerk_machine_stopped()`: nothing plays or records.
- `modwerk_machine_uncached(p)`: the alias module code and data run from.
  Data accesses there must bypass the data cache.
- `modwerk_machine_invalidate_code()`: instruction and branch caches, with
  the OS's own cache-control value.
- `modwerk_machine_patchable(address, length)`, `modwerk_machine_code(address)`
  (an uncached view) and `modwerk_machine_flush_data(address, length)`.
- `modwerk_machine_mask()` / `modwerk_machine_unmask()`.
- `modwerk_machine_paused()`: every other task's live stack and saved
  registers, from the kernel's task records.
- Trampolines subscribed to its core's `ev_tick`, `ev_draw`, `ev_key` and
  `ev_enc`. Each reads `modwerk_runtime_active()` once and calls the hook.

The Octatrack's glue is
[`sdk/machines/octatrack/elekloader/runtime.c`](../../machines/octatrack/elekloader/runtime.c).
Key codes, encoder numbers, the frame layout and stock code addresses are the
machine's own, so a module is built for one machine and OS.

## Not yet

Patches to data tables (they need the data cache handled), modules that add
to the core's tables (`contribute`, such as CC MAP's MIDI handler), MIDI and
audio-frame hooks, DSP code, more than one module at a time, ledger memory
instead of a pool, a package that names the base it was built for, and the
browser builder.
