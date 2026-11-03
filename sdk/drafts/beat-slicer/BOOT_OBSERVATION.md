# Full stock project observation

## Stock slicing workflow (0.1.18 research)

`boot_slices.py` drives normal 1.40C MKII panel actions on the private stock
fixture. It passes 12 observations each on Flex slot 0 and Static slot 0:
backing out of the count chooser; creating four slices with NO (unaligned) and
YES (aligned); cancelling and confirming individual/all-slice deletion for each
grid; and clearing an empty table. Opening the deletion confirmation or the
alignment question changes no markers. NO at the alignment question creates
an exact four-way grid; it is not cancellation. Confirmed individual deletion
preserves the remaining complete records and order. Clear leaves zero active
slices and no selected row; it does not restore an earlier layout.

Every observation compares non-marker settings, source controls and the other
sample kind's settings. The complete Flex PCM still matches the original WAV
after both workflows. Source and copied cards are unchanged. The stock menus
examined contain no Undo row. These are the specific menus exercised, not a
claim about every Octatrack operation. Static PCM streaming, saved settings,
physical audio and the module's eventual UI are not qualified by this test.

Run with the same private mounts and arguments as `boot_static.py`, substituting
`boot_slices.py` and a fresh output directory. No `--card-rw` is used. The script
checks actual menu labels/callback identities before each choice and exports
only hashes, counts and outcomes; raw memory/logs remain private.

## Stock sample settings versus project storage

`boot_persistence.py` uses only normal stock panel actions across three fresh
1.40C MKII emulator processes. It requires `--allow-private-card-writes`, copies
the original fixture to a new private directory, and enables write-back only
on that copy. No custom serializer, injected code or direct firmware call
writes the card. Use the `boot_slices.py` arguments plus the pinned `--card-tool`,
`--card-tool-sha256` and the explicit private-write opt-in.

The sequence distinguishes these stock operations:

1. Delete one of four Flex slices, then SAVE SAMPLE SETTINGS. The test requires
   an 832-byte `.OT` file to be the only added/changed file; the original WAV
   and all 53 original project files must remain exact.
2. Reload the project in a fresh process. Its saved four-slice layout takes
   precedence over the three-slice `.OT` layout. Clear the current slices,
   cancel REVERT TO SAVED FILE once, then confirm it. Cancellation must preserve
   settings; confirmation must restore the complete saved sample metadata.
3. Clear Flex again and load the same WAV into Static through the browser.
   Static loads three slices while Flex stays cleared. Save the project,
   observe the marker writer, file close and successful final UI callback,
   then flush the completed writes. A flush alone is not save completion.
4. Check both `markers.work` and `markers.strd`: complete trim, all 64 records
   and count must exactly match the current slots, with valid extents/checksums.
   Reload again and require the distinct active layouts, trim and sample tempo
   to survive. Full Flex PCM must match the original at every sampled stage.

Stock reload is not a byte-for-byte restoration of all settings memory. In
this fixture it normalizes the deleted inactive fourth row's end to its
sentinel start, and clears one field outside the serialized marker table.
The final test permits only those specific observed changes, records their
counts separately, and still requires exact active records. Internal failed
commit rollback must retain all in-memory rows; this stock reload behavior
does not relax that requirement or introduce user Undo history.

The first attempt timed out while stock still displayed SAVING PROJECT. The
next reached a fresh load but rejected its overly broad full-settings equality
oracle. Inspection confirmed exact on-card tables and the inactive/unserialized
changes above. Those attempts are not passing evidence. The final runner waits
in bounded steps for stock completion and distinguishes disk serialization from
reload normalization. This remains stock-emulator evidence, not Beat Slicer
installation, physical reboot, audible output or Static streaming qualification.

## Project and PCM baseline

`boot_observe.py` connects an actual stock project/file load in the pinned
headless emulator to the host planner and marker-preparation code. It does not
install Beat Slicer, inject code, call firmware functions, edit the panel or
enable a live native reader. Both DSP cores and frame scheduling run during
load; emulator execution is paused during memory observations and planning.

Use a private disposable card created through stock, containing an original
stereo 16-bit 44.1 kHz WAV assigned to a Flex slot. Keep the card, source WAV,
project files, binaries, memory reads and emulator logs outside Git. The probe
copies the supplied card, disables write-back, verifies both card copies stay
unchanged and exports only a stock-free receipt. It refuses a stock/card hash
mismatch, an incomplete LOAD PROJECT, unsupported format, invalid allocation,
different PCM, changed tempo/markers or inconsistent snapshots.

The observed 1.40C MKII-panel setup used:

1. Create a disposable set/project and load the original WAV through the stock
   browser. Loading a slot does not assign it to the track: confirm the loaded
   slot before opening AED, then check the editor title's source kind and slot.
2. AED → FX1 opens ATTR. In this fixture, three DOWN presses select ORIGINAL
   TEMPO; RIGHT changes 120.00 to 120.25 BPM. Project tempo remains 120 BPM.
3. AED → AMP opens SLICE; plain YES opens its action menu. LFO opens EDIT.
   CREATE SLICE GRID → 4 SLICES → YES for zero-cross alignment exercises the
   real deferred search/completion path. These are stock actions, not Beat Grid.
4. Capture the complete marker table's hash before saving: 64 big-endian
   start/end/loop records, then the big-endian count. Save the disposable
   project and wait for completion, checking the expected saved files. A card
   flush only makes completed sector writes durable; it does not finish a
   firmware save that is still running.
5. Close the emulator and run the observer against that exact card and WAV.
   It starts a fresh emulator, requires the stock LOAD PROJECT completion,
   compares every PCM byte and the complete marker-table hash, then runs four
   previews (sample/project tempo × exact/smooth) and preservation preflight.

Example inside the existing isolated private mounts, serialized with other
checks and with Docker shared memory set to 256 MiB:

```sh
python3 -B /source/sdk/drafts/beat-slicer/boot_observe.py \
  --emulator /output/build/emulator/ot_emu --main /stock/stock-main.bin \
  --card /evidence/private-card.img --card-sha256 <exact-card-sha256> \
  --set-name BEATLAB --project-name '<private-fixture-project>' \
  --wav /evidence/original.wav --slot 0 --sample-bpm24 2886 --markers 4 \
  --marker-sha256 <complete-marker-table-sha256> \
  --output /evidence/new-private-observation
```

The report names the source, emulator, stock, card and WAV hashes. Raw logs
and the copied card remain private in the output directory. The source sample
rate comes from the verified WAV and matching loaded frame extent, not a new
native rate getter. Other rates/encodings, replacement failure, Static streaming,
concurrent writers, physical audio/save/reboot behavior and Beat Slicer's
commit/rollback and USB lifecycle remain unqualified.

The initial exploratory session also attempted borrowed stock lookup calls.
The emulator refused them before execution because its main task was not in
the required parked state. Those calls provide no lookup evidence. The
observer uses bounded memory reads and never bypasses that guard. Full stock
lookup execution remains covered separately by the compiled isolated probes.

## WAV format matrix

`boot_formats.py` starts a separate full stock load for each mono/stereo,
16/24-bit and 44.1/48 kHz combination. It uses the pinned upstream pure FAT
builder to replace only an original `AUDIO/PULSE.wav` in the disposable
53-file project; all other extracted files must remain byte-identical. Each
case verifies normal pool maps, descriptor geometry, frame/channel count and
every decoded PCM byte against independent signed width conversion. The
source card and each repacked card remain unchanged; no write-back is enabled.

In the observed project, all eight cases load 44,100 frames into 16-bit Flex
pools: mono uses format 2 and 15 pages, stereo format 3 and 29 pages. Original
24-bit values truncate arithmetically to 16 bits, including the deliberately
nonzero low bytes. The 44.1 and 48 kHz pairs have identical complete controls,
settings and PCM. Therefore these fields cannot identify the original file
rate in these cases; no native playback-rate getter or audible resampling
behavior is established. This initial matrix does not exercise 24-bit retention or Static streaming;
the separate authored-project variant below adds retention coverage.

Run with the same private mounts and machine-wide lock, supplying `--emulator`,
`--main`, `--card`, `--card-sha256`, `--card-tool` (the pinned upstream
`tools/emu/emu_card.py`), `--card-tool-sha256` and a fresh private `--output`.
Optional `--case 0` through `--case 7` selects individual cases. The report
contains only input/source hashes and outcomes; cards, WAVs, raw controls,
settings, PCM and logs stay private.

### File rate versus the stock playback clock

Elektron's [OS 1.40A manual](https://www.elektron.se/wp-content/uploads/2024/09/Octatrack-MKII-User-Manual_ENG_OS1.40A_210414.pdf)
(§7.2.2, §8.3.3 and §8.6.5) specifies 44.1 kHz mono/stereo WAV/AIFF at
16/24 bits, warns that 48 kHz files load at the wrong playback speed, and
describes optional 24-to-16-bit Flex conversion. The 48 kHz matrix cases are
compatibility investigations, not newly supported sample rates. The planned
1.40C adapter must use the stock frame clock for spacing, not assume the input
WAV header rate survives loading. The manual and unchanged PCM are supporting
evidence; exact native source binding and physical playback remain unqualified.

## Authored 24-bit-retaining project variant

`boot_formats24.py` changes only `LOAD_24BIT_FLEX=0` to `1` in the private
project's `.work` and `.strd` text settings, preserving every other byte in
those files and every other project file. This is an authored test variant,
not evidence that a native settings dialog or save was exercised. The stock
project loader then loads four 44.1 kHz WAVs through `boot_formats.py`.

All four retain the complete original PCM: 16-bit mono/stereo use formats 2/3
and 15/29 pages; 24-bit mono/stereo use formats 0/1 and 22/44 pages. The 24-bit
low bytes are deliberately nonzero and must match exactly. Original and
variant cards remain unchanged. Use the same arguments as `boot_formats.py`;
the wrapper adds the documented settings variant and runs cases 0, 2, 4 and 6.
This establishes observed load/geometry/PCM behavior only, not live ownership,
Static IO, actual playback or physical-device qualification.

## Normal writer lifecycle

`boot_writer.py` uses the original card/WAV arguments from `boot_observe.py`
(without its set/project/metadata options) and a new private output directory.
It checks the actual editor binding and reverse-menu callback before confirming
two stock reversals. Full PCM checks use the explicitly observed inclusive
endpoint convention; a normal exclusive-end reversal does not match this
fixture. The second operation restores the source exactly. Worker/UI completion
and unchanged prepared metadata are reported separately from that limitation.
No raw PCM, extra allocated-frame bytes or native traces leave private storage.

## Static lifecycle observation

`boot_static.py` accepts the same arguments as `boot_writer.py`. It opens the
Static list through normal quick assignment, loads the original WAV, verifies
actual editor kind/slot and metadata, then confirms a stock slot clear. It
checks that the prompt alone leaves controls unchanged, confirmed release
retires the file handle, and the separate Flex source stays byte-identical.
Cards and raw observations remain private and unchanged on disk. This is
load/clear evidence, not a Static PCM reader or concurrent file-ownership proof.
