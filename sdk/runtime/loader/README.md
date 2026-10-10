# Runtime module loader

Loads, replaces, rolls back and removes a ColdFire module on a running
instrument without a reboot. It is the backend of the
[upload controller](../upload/README.md) and does not depend on a machine:
every instrument Elekloader supports (Octatrack, Digitakt mk1 and mk2,
Digitone) has a ColdFire V4 CPU and a hook bus with tick, draw, key and
encoder events. Development only; the Octatrack is the first machine with
glue.

| File | What it is |
| --- | --- |
| [`modwerk_module.h`](modwerk_module.h) | What a module sees: its four handlers and the test value |
| [`build.py`](build.py) | Builds a package from C sources with the ColdFire cross compiler |
| [`loader.h`](loader.h), [`loader.c`](loader.c) | The loader and the glue a machine provides |
| [`tests/host_test.c`](tests/host_test.c) | Host test, run by `sdk/tests/test_runtime_loader.py` |

## Package, ABI 2

Big-endian. Header (24 bytes): `MWRM`, ABI u16 = 2, flags u16 = 0, image
length u32, bss length u32, relocation count u32, hook count u32. Then one
u32 offset per hook (`0xffffffff` for none), the image (code, read-only data
and initialized data), and one u32 offset per relocation.

- Hooks, in this order: `module_tick`, `module_draw`, `module_key`,
  `module_enc`. Later events append. A base refuses a package with more hooks
  than it dispatches; hooks a package does not list are empty.
- A relocation names a 32-bit word of the image that holds an offset into
  the module (image or bss). The loader adds the slot's address. A word that
  points outside the module, or one listed twice, is refused.
- An image length of zero removes the module.

`build.py` links the module twice, at 0 and at 0x10000. The words that
differ by exactly 0x10000 are the relocations; any other difference (such as
a 16-bit reference to the module) is refused. Absolute addresses of stock
code stay as they are. No C library or libgcc.

```sh
python3 -B sdk/runtime/loader/build.py MODULE.c -o MODULE.mwrm
npm run device -- try MODULE.mwrm --seconds 10   # scripts/device.mjs
```

## Loading

Prepare copies the image into the inactive of two 16 KiB slots through the
machine's uncached alias, clears the bss, applies the relocations and
invalidates the instruction cache. Publishing swaps one pointer; rollback
swaps it back. A slot is reused, and the previous module retired, only once
the machine's tick has passed the swap twice and no hook is marked busy.
Activation needs nothing playing or recording.

## Porting to another machine

A machine provides, next to its base:

- `modwerk_machine_stopped()`: nothing plays or records.
- `modwerk_machine_uncached(p)`: the alias that module code and data run
  from. Data accesses there must bypass the data cache.
- `modwerk_machine_invalidate_code()`: invalidates the instruction (and
  branch) caches with the OS's own cache-control value.
- Trampolines subscribed to its core's `ev_tick`, `ev_draw`, `ev_key` and
  `ev_enc`. Each reads `modwerk_runtime_active()` once and calls the hook.
  The tick trampoline advances `modwerk_runtime_ticks` from the task that
  runs the hooks one after another; a hook that may run in another task is
  wrapped in `modwerk_runtime_busy`.

The Octatrack's glue is
[`sdk/machines/octatrack/elekloader/runtime.c`](../../machines/octatrack/elekloader/runtime.c).
Key codes, encoder numbers and the frame layout are the machine's own, so a
module that uses them is built for one machine.

## Not yet

MIDI and audio-frame hooks, patches to stock code (most catalogue modules
need them), DSP code, more than one module at a time, ledger memory instead
of fixed slots, and a package that names the base it was built for.
