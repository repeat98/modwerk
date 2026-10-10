# Repaired Octatrack hardware tools

For Sam's newest tools, run `npm run upstream:tools`. It keeps a verified
checkout of upstream Octabam (and Elekloader) outside Git, with these repairs
applied in place, so every tool runs in the layout it expects. `-- --update`
moves the pin in `sdk/upstream-tools.json` to upstream `main`. The rest of this
page covers the imported copies in this repository.

Octabam's host tools in [`sdk/octabam/tools/hw/`](../../../octabam/tools/hw/)
stay byte-identical: the release source inventory fingerprints all of
`tools/`, so editing them would change the approved package identity.
`prepare_tools.py` writes repaired copies of two of them to a new directory
outside every Git checkout, with a `tools.json` of source and output hashes.

| Tool | Repair |
| --- | --- |
| `usb_probe.py` | `Poller` no longer shadows `Thread._stop()`. Python 3.9's `join()` called it and failed before the JSON report was written. |
| `rec.swift` | Float samples are scaled in Double. Float rounds `2147483647` up, so a positive full-scale sample trapped on conversion to `Int32`. |

Each repair is bound to the imported file's SHA-256, every edit must match
exactly once and the result must reproduce the reviewed output hash. If the
imported tool changes, the adapter refuses until the repairs are reviewed again.

```sh
python3 -B sdk/machines/octatrack/hw/prepare_tools.py --output /private/NEW-hw-tools
swiftc -O /private/NEW-hw-tools/rec.swift -o /private/NEW-hw-tools/rec
```

Run the prepared `usb_probe.py` instead of the imported one. `gain_pass.py`
rebuilds its recorder from the imported `rec.swift` whenever its binary is
missing or older, and `hw_bus_test.py` expects a `rec` beside itself: supply
the prepared recorder, or those captures use the unrepaired conversion. The
other tools are used unchanged.
`sdk/tests/test_usb_hardware_probe.py` runs the regressions on prepared copies
with synthetic inputs and opens no device. These are host-tool repairs, not
device, module or hardware qualification.
