# USB base layout preparation — 21 October 2026

These are additional results for [PR #745](https://github.com/repeat98/modwerk/pull/745),
source commit `3f65ff885a7385f6cb613830f02b6b269d81784b`. They do not release
USB Audio or admit it to USB module sets. The card module remains
`0.2.0-experimental`; the reported Ableton and second-interface symptoms remain open.

## Alternative source-built bases: software only

Built the four existing smaller output layouts and a MIDI-only base from
source, using local OS 1.40C and Elekloader
`7b5b5b8ea969eb23f25a68e5c245294f3085bf90`. Each used `--dsp-loader`,
`--usb-midi`, `--site-events`, `--table-owners`, `--resident-stock-hooks`
and `--resident-on-demand`, with uncached module execution. Controller trust
rows were intentionally empty: these are private layout preparations, not
substitutes for the twenty-channel public-flags candidate or its bound packages.
No generated public package was replaced, and none of these five images was
booted on the physical unit.

For each image:

- `check_stock_free.py` passed; native and browser-built complete `.bin`
  bytes matched exactly.
- `verify-octatrack-usb-reconnect.py` passed four replug cycles and a bus reset:
  35 checks per audio layout, 17 for MIDI-only. The audio checks use each
  layout's real frame size (64, 8, 16 and 8 bytes respectively).
- `verify_vendor_usb.py` passed at high and full speed: 45 checks per audio
  layout, 37 for MIDI-only. This checks exact IDENTIFY bytes, configuration
  and other-speed descriptors, refusal paths, upload enter/leave, the
  mass-storage protocol and audio alternate settings/streaming. The MSC
  check is not physical DISK MODE or card-integrity evidence.

The emulator flushes immediately and does not model physical host packet
scheduling. These results do not prove audible routing, channel alignment,
post-fader behavior, host-driver recovery, module companions or persistence.
At the source commit named above, the sixth catalogue layout, `tracks-post`,
was absent from the base's five-layout source/CLI; it was not tested or
silently substituted in this run. The later shared stock-data recipe and
six-layout build preparation have their own source-built results; these
older image identities are not relabelled.

Exact private image identities (hashes only; no firmware is committed):

```json
[
  {
    "profile": "tracks",
    "base": "dc7f9c3ad2a10a0deeb90b20cf7baf5c6320d76c38e1ce9e1a9a8dfe95752f8e",
    "mainSha256": "f28ff3b5d23381f6c005ab5e4151f83cd3349091b907952fd9b28ed4f6748441",
    "binSha256": "62822271f899d9a4a3e4ee7fca23aa035c242ca25821fdcafc4183767fa122e2",
    "reconnectChecks": 35,
    "vendorChecks": 45
  },
  {
    "profile": "master",
    "base": "74257f3a135bf6b11238ebd9f96f33e5ed895055c0223b33b29facd5151d7a8a",
    "mainSha256": "56ff44ea4769b18e572bb076e8901309aa77471dab023479ba318ba4b3cc0ac8",
    "binSha256": "d78e3f3e6c489ff824223bc6e28a91e557d3c8700481b1c8d7c220bce419f8cd",
    "reconnectChecks": 35,
    "vendorChecks": 45
  },
  {
    "profile": "main-cue",
    "base": "709513c1193bc2355577115753a0adb661249cd8f655583e63e2190f6487bcb9",
    "mainSha256": "f678baf527fb5861b86f355ec5dd664e223f517468211db8a7254c724ccfee10",
    "binSha256": "60173e9eaae86b2d3dcbb0a888a24c1bc81742703f95aa734da5d8446b1cb5b6",
    "reconnectChecks": 35,
    "vendorChecks": 45
  },
  {
    "profile": "main",
    "base": "49b11f303704e6dc3d8986392474d7053cbc5521e73e929a341f4dc2a434ac5c",
    "mainSha256": "101c4b274bc4241e0a327453e3109a4a801cf87e272f9f46639484fa414c9ec6",
    "binSha256": "9fa8e4eaf56f7bd40acdab0db1c4a92cf8d07ed82060ae0e7b4cc6f61fced518",
    "reconnectChecks": 35,
    "vendorChecks": 45
  },
  {
    "profile": "midi-only",
    "base": "cb9a17cd20b223f7e9c4dd77290e8597541f9c40a6776aed9c9efe92c6200823",
    "mainSha256": "2b855c53077d34e1a7768660e789bf09b5d6b287119925de9f0ccf66e75c3bb5",
    "binSha256": "b2fc77bb0b4134539a0c977c2bce718e466493bee11aa5d7a99b9c1589cfb53e",
    "reconnectChecks": 17,
    "vendorChecks": 37
  }
]
```

## Twenty-channel physical base: module trial during capture

On the owner's MKII, exact base
`98ec6014fd03b413d91fd83c2089b6cf7c68dbb16aa8482f6e905595d7b8223e`
([its build and earlier results](usb-reconnect-20261020.json)), a continuous
CoreAudio HAL recording stayed open while the real frontend MCP reviewed and
trialled Tape Echo 0.1.5, ran its physical self-test, and explicitly undid the
trial. Package SHA-256:
`21b953eb038429a5f7428c655cb889aa871e6c794313e51b00568150528630d1`.

The self-test passed (`state=2`, `failed=0`, `modules=1`, `dsp=1`,
`intact=1`, `ran=1`). Audio overrun, underrun, bank-duplicate and re-prime
counters stayed zero before, during and after the trial/Undo. Undo and a
fresh status receipt confirmed the original empty live inventory and exact
base identity. Foreign saved-set files were left untouched; no Keep,
project save, flash or power cycle was performed.

The capture contains 1,985,024 frames, 20 channels at 44.1 kHz
(45.011882 seconds), SHA-256
`a4c353d81a7d4874c51af1b7a84601835c0a41e7c0b8befd793d344163e38f72`.
Transport was stopped, so this proves concurrent host capture and module
transport/self-test/Undo, not audible continuity or musical-signal quality.
The MCP deliberately refuses live-load reads during a trial; the corrected
harness reads those only in the ready state. An initial attempt reached a
passed trial, hit that harness restriction and successfully undid it; it is
not counted as a complete capture test.

Physical cable reconnect on this exact base, Ableton stop/save, AudioFuse
hotplug, the reporter's seven-module project, FM Synth, MKI, Windows/Linux,
listening/analog checks and cold-start/persistence remain unverified. The
six-minute musical capture and owner cable pull still belong only to the
older development identity in the linked record.

## Added 11 November 2026: the `off` layout of the PROJ base, RAM-booted

The `off` layout of the base `4854b76c…` (identity `d891acb3…`), built through the site's own path, was RAM-booted on
the owner's MKII: it started and answered `status` over the USB link ("normal"). It was not flashed, and its audio and
MIDI on a host were not tested. None of that base's other layout images was booted; a development twin of its 20-channel
layout (`513be133…`) was RAM-booted for the PROJ test ([edge case 15](../../../../docs/OCTATRACK_MODULE_EDGE_CASES.md)).
