# MS-70CDR SDK

Effects for the Zoom MS-70CDR are `.ZDL` files, Zoom's header around a TI
C674x ELF, that the pedal's own firmware loads like its own effects. Modwerk
lists them on module contract v3 with the `zdl` platform
([docs/ZDL_MODULE_CONTRACT.md](../../../docs/ZDL_MODULE_CONTRACT.md)) and
installs them over USB from the effect's page or the pedal page.

## Modwerk stack

Where the MS-70CDR stands on the stack every machine gets
([docs/MACHINE_RECIPE.md](../../../docs/MACHINE_RECIPE.md)):

- **Base:** Luca Matturro's MIDISTOMP (MIT), Zoom's own 2.10 patched in the
  browser from the user's updater and flashed once in update mode from the
  pedal page ([ZOOM_MULTISTOMP.md](../../../docs/ZOOM_MULTISTOMP.md)). Effects
  also run without it, on Zoom's 2.10.
- **USB link:** Web MIDI with the pedal's own file commands
  (`src/engine/zoom/zoom-link.ts`): list, back up, install, remove; the base
  flash in update mode.
- **Loading:** an effect is a file written to the pedal and added to its
  effect list; a power cycle loads it. Loading without a reboot is not built.
- **Modules:** `sdk/zoom/modules/<id>/`, one folder per effect for the whole
  ZDL family, each naming the pedal it is developed on and every pedal's
  tested status.

## Create an effect

1. **Check what exists and claim it:** the library, `sdk/zoom/modules/`, open
   pull requests and the agent board (`npm run board -- list module`). Claim
   the effect with its effect ID in the note, so nobody takes the same one:
   `npm run board -- claim module zoom-ms-70cdr/<id> --note "Delay <fxid>: …"`
   (`module:new` in step 6 claims it too).
2. **Write and build it in ZoomMultistompZDL**
   ([repeat98/ZoomMultistompZDL](https://github.com/repeat98/ZoomMultistompZDL),
   MIT): your source in `src/custom/<id>/` with its `manifest.json`, built by
   its linker with TI's C6000 compiler 8.5.0.LTS. Build with the effect's own
   runtime, so it carries no code from Zoom's effects:
   `ZDL_OWN_RUNTIME=1 python3 src/custom/<id>/build.py`. An effect that
   divides floats waits for `divf` from TI's runtime source.
3. **Check it:** `python3 build/check_no_stock.py dist/<File>.ZDL --stock-dir
   <your stock blobs>` must say "no stock code"; then
   `ziddle effect check` and `ziddle effect render` (Ziddle, kept by
   `npm run upstream:tools`) for a quick run without the pedal. Emulator
   results are never hardware evidence.
4. **Try it on the pedal:** run the site (`npm run dev`), open the pedal page
   (`#zoom-ms-70cdr/pedal`), back up all files, then **Choose a .ZDL file**
   on Status. Power-cycle, put it in a patch, try every knob, on/off, saving
   and recalling the patch through a power cycle.
5. **Release it:** a GitHub release on your repository with the `.ZDL`
   attached, the build command and its SHA-256 in the notes.
6. **List it:** `npm run module:new -- <id> --machine zoom-ms-70cdr --author
   <login>`, then fill in `modwerk.module.json`: the file, effect ID and
   header version, the DSP cost, the release (`platform.binary`) and each
   pedal's status with its report. `npm run zdl:vendor -- <id> --checker
   <ZoomMultistompZDL checkout> --stock-dir <your stock blobs>` downloads the
   release file and keeps it only without Zoom code. Screenshots of the
   effect's own screen come from ZoomMultistompZDL's
   `src/custom/common/zvis_host.py` (emulator captures) or the pedal.
7. Run `npm run module:doctor -- <id>` until it is green, then
   `npm run pr:ready`.

## Effect IDs

Group 8 (Delay), IDs 403 to 957. 958 to 1023 are the pedal page's local IDs,
to which it moves an effect whose ID another effect on the pedal already has.
ZoomMultistompZDL holds 403-499 for its effects, 500-699 for NAM slots,
700-899 for cab slots and 900-957 for templates; Matujuice ships 480, 481,
485-497, 501 and 502. Two listed effects never share a file name or an ID,
and Delay 409 (Spool and TEcho4's old clash) is refused
([effect IDs](../../../docs/ZDL_MODULE_CONTRACT.md#effect-ids)).

## Budgets

| Budget | Value | Note |
| --- | --- | --- |
| Patch DSP | 225 | The cost the pedal adds up per patch; MIDISTOMP 2.0 raises it to 300. |
| Effect slots | 6 | Effects in one patch. |
| Effect file | 32,126 bytes | The largest effect proven to load on the 2.10. |
| Code and constants | 30,032 bytes | `.text` + `.const`, the measured load boundary. |
| Controls | 9 | A tenth leaks into the next effect's state; a patch stores K1-K9 in 12/11/11/8/8/8/8/9/8 bits. |

## Toolchain

TI's C6000 compiler 8.5.0.LTS (a free download from TI, kept outside
Modwerk), ZoomMultistompZDL's linker with Leemuzhko's runtime
(`build/runtime/`), and Ziddle for emulator runs. Nothing of Zoom's enters
this repository: no stock effects, firmware, dumps or code taken from them.

## Flash and recover

Installing an effect writes the pedal's file system; every write is read back
and the effect list from before is offered for saving. Back up all files
first (pedal page, Backups). Remove an effect from the pedal page or with Zoom
Effect Manager. If a bad effect freezes the pedal at boot, run All Initialize
(hold the leftmost knob while powering on), then remove the effect. Zoom's
2.10 updater always puts the original firmware back.

## Credits

ZoomMultistompZDL (Jannik Aßfalg, Roman Rusinov and contributors, MIT); the
effect runtime by Leemuzhko (MIT, TI's RTS helpers BSD-3-Clause); MIDISTOMP by
Luca Matturro (MIT); Ziddle by Berbasoft.
