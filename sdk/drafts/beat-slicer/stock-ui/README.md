# Beat Slicer 0.1.67 — private stock-style UI candidate

This is the current private update, combining the popup-cache fix with the
author-approved UI. It supersedes the earlier cache-only trial for further
testing. Published 0.1.66 and its packages/catalogue remain unchanged.

The popup uses stock 1.40C's small font, character metrics and frame routine.
Its stepped title, outline thickness and full 64-pixel Mixer height come from
that routine. The frame leaves eight pixels of the live home screen on each
side. The sample editor is omitted from this backdrop; its source/edit state
and the normal return and confirmation paths are retained.

The three-by-two encoder arrangement remains. A chooses SAMPLE/PROJECT BPM;
B chooses beats per slice. C–F remain unassigned and inert. **Encoder C SNAP
and zero-crossing analysis belong to the next update**, not this package.
There is no PCM analysis, altered slicing algorithm or new alignment question.

All sample metadata, validation, confirmation and marker publication continue
through the existing shared sample-editor service. Native UI calls are confined
to `device_font.c`: text and frame drawing use module-owned picture/opacity
planes; the home plane is read only. No firmware/font bitmap is embedded and
no stock code site is patched. These new native UI references require owner
review before release; automatic publication is not requested.

The complete popup and its opacity mask are cached until displayed data changes.
Each composition combines that cached layer with the current stock home bitmap.
The stock frame's drawn contour supplies the mask, including its stepped title
and corners. Opening/drawing never retains stock sample pointers, changes source
metadata, closes AED or registers a native window/callback.

## Exact private package

`build.json` binds six source inputs and the pinned toolchain image.

- Version: `0.1.67-experimental`; module ID `c8d078f2`.
- Package SHA-256: `20ce427629de295c373e69965c12d2ea370c217a22dde0ecf76d76789a169291`.
- Package: 4,976 bytes; initialized code/data: 4,104; BSS: 3,476.
- Total code/data/state: 7,580 bytes. No DSP code, heap, stock patches or copies.
- Hook: `ot_sample_editor_actions:bs_sample_action:50`, registry index 36.
- Hardware for this exact revised package: **not tested**.

The earlier `cef16d7d…` cache-only package's hardware timings do not qualify this
renderer. The shared base and the separate private FUNC+AED shortcut work are
unchanged by this candidate.

## Build and verify

From the repository root with the reviewed compiler available:

```sh
python3 -B sdk/runtime/loader/build.py \
  sdk/drafts/beat-slicer/stock-ui/device_module.c \
  sdk/drafts/beat-slicer/stock-ui/device_font.c \
  sdk/drafts/beat-slicer/stock-ui/grid_preview.c \
  --subscribe ot_sample_editor_actions:bs_sample_action:50 \
  -o /private/output/beat-slicer.mwrm
python3 -B sdk/drafts/beat-slicer/stock-ui/test_device_module.py
```

Use the immutable toolchain in `build.json`, read-only source mounts, networking
off, private writable output and **executable** temporary storage. The host UI
stand-ins in `test_ui_host.c` qualify controller/cache behavior only; native
stock typography and frame behavior are tested separately on the exact package
payload. See [TESTING.md](TESTING.md) for observations and hardware handoff.

The private package, UI capture and native-probe inputs/logs are retained under
the developer's `stock-ui-0.1.67-20261030` task cache and `.preview/` handoff.
Firmware, disassembly, home-screen bitmaps and built firmware are not committed.
