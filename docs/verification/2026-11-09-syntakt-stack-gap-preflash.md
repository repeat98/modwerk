# Syntakt 1.42 stack gap, before a flash, 9 November 2026

Five computer and emulator checks, made because the review of the stack-gap build asked for them before anyone flashes it. Ticket 03 is the later hardware survival run, with samples loaded. These checks are computer and emulator only. The 84 bytes at 0x47fe0000 are a photograph of the boot stub. They were read and they were not executed. None of this proves the gap. The emulator has no ColdFire data cache and no sample-page writer, and a quiet emulator boot does not prove the gap survives a full sample load. Nothing was flashed. Nothing was committed. No `.syx` was copied into the repo, and the unpacked stock image was not either.

- **Stock file:** `Syntakt_OS1.42.syx`, sha256 `ded3c59fdb909eb9e2c3307b30a486452c8fa6947b12c14e0ce35a187b7f37c1`. It stayed outside the repo.
- **Build that was booted:** `/tmp/syntakt-stack-gap/syntakt-1.42-stack-gap.syx`, sha256 `9152335cd89d976849aa50b9393ff3eb3a04549b01e9202add7f9de4ddfc51af`, the same hash as `boot-probes.json` in that directory. The copy the emulator stored, `Syntakt_OSMW01.syx`, hashed to the same value. `layout.boot` in that record is `[1077185424, 1077185508]`, which is `0x40348b90` for 84 bytes. That is the glued copy. The 84 bytes taken from the built main image at that address, with the repository's container reader, are the `.boot` section the record names. Their sha256 is `cce264242b69b493741fab88c4dd9d81faf22b96742575036ed741ea8c7ba990`. The built image hashed to `8e88bbd5b674a3549dc72dc7841244bfa90081e9a9a33aa3ef4dc3621a1022af`, the image hash in the same record.

## 1. Full copy in the emulator

The existing `/tmp` syx was hashed first and was still `9152335c…`. From the digiemu checkout, on a fresh home that did not exist yet: `uv run python -m emu.portable --home /tmp/digiemu-142-preflash-20261109 --add /tmp/syntakt-stack-gap/syntakt-1.42-stack-gap.syx --yes`. The older homes `/tmp/digiemu-142-gap` and `/tmp/digiemu-142-mark` were not resumed. digiemu commit `286f60cc4d1d2960ebadfb4c317e942fc04be82e`, branch `syntakt`, reported as digiemu 0.4.1, Python 3.12.16, from source. The working tree was dirty and was left that way: modified `README.md`, `SYNTAKT.md`, `devices/syntakt.toml`, `docs/STATUS.md`, `emu/longrun.py`, `emu/symbols.py`, `packaging/bundle_guard.py`, `packaging/digiemu_main.py`, and untracked `emu/usbotg.py` and `tests/test_usbotg.py`.

The command exited 0. It printed `Syntakt OS MW01 (build 0097, built 2026-09-30, untested)  ->  /tmp/digiemu-142-preflash-20261109/firmware/syn-mw01-9152335c`. The log `first-run.log` (22:13:10–22:13:33) records `intro_done fired 1 time(s); mainloop 148; lit 2309`, then `VERDICT: USER INTERFACE IS LIVE`, then the save of `gui-raw.snap` at 22:13:21. The settle stage then recorded `SETTLED at 1500M: 120 consecutive main-UI frames with no overlay`, saved `gui.snap` at 22:13:33, and `accepted: the card holds the finished first boot; RAM syn_dsp_running_u32=0x6`.

Memory was read by restoring those two snapshots with `emu.snapshot.restore` and calling `mem_read`. No further guest instructions were run for the read. `tools/memdump.py` was not run. At the user-interface snapshot, and again at the snapshot saved after the 1500M settle:

- `0x8000733c`, sixteen bytes: `4d 57 53 4b 00 01 00 00 00 00 0c c4 00 00 00 00`.
- `0x47fe0000`, 84 bytes: the same bytes as the `.boot` section, sha256 `cce264242b69b493741fab88c4dd9d81faf22b96742575036ed741ea8c7ba990`. The first sixteen are `4f ef ff f0 48 d7 00 f0 41 f9 80 00 73 3c 20 fc`.
- `0x40348b90`, 84 bytes: all zero.

digiemu does not model the ColdFire data cache. Its status notes still list a cache model as work not done, and `movec` is counted rather than applied as a cache, so this read cannot see a dirty cache line. The run put no samples on the card. The emulator has no model of the page writer reported between `0x45570000` and `0x47eff000`. Not done: a hardware boot, a sample load, and any execution of the 84 bytes.

## 2. Two power cycles, then the settle read

digiemu's portable command has no separate power-cycle switch. `--reset` deletes the card. The command that boots the same folder again and keeps the card is `--rebuild`. It logs `rebuild: snapshots cleared, card kept` and runs the cold boot, the intro, and the settle again. Two of those were run, in order, on the same home:

`uv run python -m emu.portable --home /tmp/digiemu-142-preflash-20261109 --rebuild syn-mw01-9152335c`

Both exited 0. The log headers are 22:19:07 and 22:19:20. Each reported `VERDICT: USER INTERFACE IS LIVE` (`mainloop 149; lit 2192`), then `SETTLED at 50M`, and `accepted: the +Drive was already initialised; it came up; RAM syn_dsp_running_u32=0x6`. The 50M settle is the emulator's settle on a card that already finished first boot. The 1500M settle is the first boot, in section 1. After each rebuild the same restore-and-`mem_read` was used on the new `gui-raw.snap` and the new `gui.snap`. No further guest instructions were run.

On all four snapshots the mark was the same sixteen bytes, the 84 gap bytes matched the `.boot` section (same sha256), and the 84 bytes at `0x40348b90` were zero. The gap was read from the settle snapshot as well as from the user-interface snapshot, on the first boot and on both rebuilds. Not done: a power cycle of a Syntakt, and a settle with samples loaded. These two rebuilds are not that.

## 3. References to the stack word, and the stores of 0x48000000

There is no Ghidra project in the repo. No toolchain was installed for this. The stock syx was unpacked with the repository's container reader into a temporary file, checked (3,442,576 bytes, sha256 `1a9723b19fb54d0566c1f690379d2e6dfe43227f77e170ad731dd029430eb3e7`, the main-image hash in the research report), scanned, and deleted. The scan used Capstone's M68020 disassembler from the digiemu virtualenv for the instruction text, and digiemu's ColdFire decoder `emu/cfisa.py` for length and operand class. No disassembly listing was written into the repo.

The address `0x400004f4` does not occur in the main image. The ColdFire decoder was run at every even address that can start an instruction with an extension (the last three words of the image are 3 MB above the stack word, outside a PC-relative displacement). No PC-relative displacement, 16-bit or the 8-bit displacement of an indexed PC-relative word, targets `0x400004f4`. No branch target is that address. The branch scan covered every even word in the image. One instruction, at `0x400004f2`, holds the stack word as its immediate. That is the stack load. Nothing else in the image contains that address.

The address `0x48000000` occurs 148 times. Nine of those sit in an instruction as an immediate or as an absolute destination. The other occurrences are data, including odd alignments, and were not counted as instructions.

| Address | Count | Role |
| --- | --- | --- |
| `0x400004f2` | 1 | stack load; the immediate is the stack word at `0x400004f4` |
| `0x40001df2`, `0x40005900`, `0x400bce12`, `0x400bd432`, `0x4011abc8` | 5 | absolute store of `0x48000000`, preceded by a cleared register |
| `0x40081590`, `0x400815ee` | 2 | absolute store of `0x48000000`, preceded by another constant |
| `0x40006e00` | 1 | load of `0x48000000` into a register; the following store does not write `0x48000000` |

The seven absolute stores each write one longword at `0x48000000`, the first address above the gap, and each is followed by 27 no-op instructions. None of the seven writes the stack pointer. The load at `0x40006e00` is not one of those stores. The image contains 10 stop instructions. The nearest of them to any of these stores is thousands of bytes away, so this scan does not place a stop beside the stores and does not re-derive the research note's "halt path" name. Not done: addresses computed at runtime by adding an index to some other base, and a hand decode of any window `emu/cfisa.py` rejects. Those rejected windows still do not contain the address `0x400004f4`.

## 4. Unit tests

`checkStockWrites` was left unchanged. It still accepts any bytes at a declared data site. The 1.42 build path now calls `assertSyntaktStackWord` in `src/engine/elektron/syntakt.ts` after that check. The function reads the built image at `0x400004f4` and requires `0x47fe0000`. `src/engine/elektron/syntakt.test.ts` gained three tests: that function, on the linked 1.42 probe and on a word that is still `0x48000000` or `0x40000000`; the gap constants; and `sdk/syntakt/core/boot.s` against `SYNTAKT_GAP_STUB` and `SYNTAKT_BOOT_STUB`.

The gap test uses the stock map. The gap start is `0x48000000` minus 128 KB, the map's `ddr-top` candidate. It lies above the 1.42 BSS end `0x45566490`, above the map's 1.42 heap-pool end, and above the reported writer top `0x47eff000` from research L9. No heap address was added. The `boot.s` test requires each source line to match the decoder's class. `move.l (%sp)+,%a1` is required to be the `movea` encoding `225f`. `subq.l #1,%d1` is required to be the bytes `5381`; the decoder's class name for that encoding is `addq`. A line with no class fails the test. `beq.s` and `bne.s` must be opcodes `67` and `66` and must land on the labels in `boot.s`.

`npx vitest run src/engine/elektron/syntakt.test.ts src/engine/elektron/stock-writes.test.ts` passed: 2 files, 18 tests. Not done: the vitest run does not open the owner's syx. The Node 24 rebuild in section 5 does, and it goes through `assertSyntaktStackWord`.

## 5. Rebuild with Node 24

The recorded syx was built with Homebrew Node 26.7.0. `.nvmrc` says `24`. This machine had no `nvm`, `fnm`, `n`, asdf, mise, volta, or nodenv, and Homebrew's `node` is 26.7.0 only. Node 24.22.2 was unpacked from the official `darwin-arm64` tarball under `/tmp` (sha256 `aa9549349e47dffaa42dcf95d6e06ade8c4bdafc980979883b88767670df385a`, checked against `SHASUMS256.txt`) and used for one command. Homebrew `node` was still v26.7.0 afterwards.

`/tmp/node-v24.22.2-darwin-arm64/bin/node scripts/verify-syntakt-core-probe.mjs --out /tmp/syntakt-stack-gap-node24 --firmware` the stock file. It printed `syntakt 1.42: stack gap linked (2 sites, 96 tail bytes), container verified, in-place margin 16673 (stock 96357); hardware evidence still required`. `/tmp/syntakt-stack-gap-node24/syntakt-1.42-stack-gap.syx` sha256 `9152335cd89d976849aa50b9393ff3eb3a04549b01e9202add7f9de4ddfc51af`. That is the recorded hash. The rebuilt file stayed under `/tmp`.
