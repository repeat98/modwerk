# Private Octatrack emulator adapter

`build.py` copies the native checkout's `rtos.cpp` into a new private build folder and changes only its detoured-idle recognition. Imported Octabam files remain exact. It links against the native checkout's existing emulator archives and records their hashes, the compiled inputs and the resulting emulator in `inputs.json`.

The original emulator marks 128 bytes from a detour entry as idle. Modwerk's `status.s` starts with the displaced stock initialization call, which creates the `p1b` task, then initializes its idle counter before entering the loop. Skipping at that entry suppresses task creation; later borrowed calls return main to the stock park. The ABI 7 investigation measured nine tasks created, ten contexts run and a zero saved stack pointer for the absent task. The runtime loader correctly refused site publication as an unknown task state.

`idle-range.h` recognizes the instructions and backward branches of Modwerk's authored idle loop, excluding both initialization instructions. Unknown detours are stepped normally. This changes the emulator alone: the runtime's unknown-task refusal, qualified tester image and hardware behavior are unchanged.

```sh
export PATH="$HOME/.nvm/versions/node/v24.21.0/bin:/opt/homebrew/bin:$PATH"
lockf -k /tmp/modwerk-check.lock python3 -B scripts/octatrack-emulator/build.py   --native "$HOME/.cache/modwerk-upstream/octabam" --out /private/tmp/my-abi7-emulator
```

Build the source recognizer's synthetic regression with a host C++ compiler:

```sh
c++ -std=c++17 scripts/octatrack-emulator/test-idle-range.cpp -o /private/tmp/my-idle-test
/private/tmp/my-idle-test
```

`verify-stock.py --native NATIVE --adapter ADAPTER --stock PRIVATE-MAIN.raw` builds the native RTOS gate with and without the adapted `rtos.cpp`, requires both to pass, and compares their reports byte for byte. Run it under the same lock. The stock MAIN image stays private.

Use the resulting `ot_emu` with `scripts/verify-octatrack-dsp-loader.mjs`'s `sites` scenario. That scenario verifies the kernel task gate, installed site bytes and relocations, the first code bytes and declared stock copies, then restoration of every site's original bytes after removal. It does not establish audio, task timing, hardware safety, physical reboot persistence or qualification of a new base. Those remain owner review and hardware gates.

For a private TEMPLATE card fixture, `run-sites.sh EMULATOR BUILD NEW-OUT CARD PACKAGE [PACKAGE...]` runs sequential install/remove checks in one boot and removes its temporary card and socket. Run it under the shared lock from the repository root with Node 24. Packages and images containing stock data must stay outside Git; the legacy ABI 6 regression is private.

## For the test procedure

Step 5 of `npm run test:procedure` starts its own session with this build ([TEST_PROCEDURE.md](../../docs/TEST_PROCEDURE.md)). Build it once: `npm run upstream:tools`, `make setup && make emu-cf` in `~/.cache/modwerk-upstream/octabam`, then `build.py` as above into a new folder outside Git. Then set `MODWERK_OT_EMU` to its `ot_emu` and `MODWERK_OT_TWIN` to a development twin's build folder ([OCTATRACK_DRIVING.md](../../docs/OCTATRACK_DRIVING.md)) in your shell profile.
