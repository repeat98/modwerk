# Modwerk startup animation

Original monochrome artwork for the Octatrack's 128×64 LCD: an open rounded
frame that traces clockwise, eight tiles that lock in from the center around
the ring, a detached ninth tile with a short comet tail, and a geometric
MODWERK wordmark. The mark adapts `public/modwerk-mark.svg`; the lettering is
original pixel artwork, with the stock title's scale and line weight.

The stock particle convergence, horizontal title reveal, 2.8-second timer and
MKI/MKII LED choreography remain in place. No stock image, bitmap, instruction
bytes or LED tables are included here. `artwork.json` contains only authored
pixel rows, layout facts and SHA-256 guards for the two original graphic tables.

## Integration

`src/engine/startup-animation.ts` encodes the shared artwork and adds the two
guarded writes to static builds, the developer dynamic-loader path and the
standalone MIDI Scenes build. The replacement is mandatory infrastructure,
independent of module selection. Existing original-firmware validation and
atomic write-plan validation still apply. A changed graphic table or a second
application of the patch is refused.

For a native image already composed locally, use a separate private output:

```sh
python3 -B sdk/runtime/startup/build.py /private/local/mainos.bin /private/local/modwerk-mainos.bin
```

`build.py` is an independent Python encoder of the same artwork. It checks
both graphic guards before writing any output. It accepts images whose module
composition leaves those tables intact. Package the resulting MAIN image with
the existing firmware packaging tools; keep all firmware local.

## Layout and resource bounds

| Region | Address | Exact bytes |
| --- | --- | ---: |
| Particle records | `0x400a81fc` | 5,058 |
| Wordmark ink | `0x400c3c32` | 440 |

The 843 particle records each hold three signed big-endian 16-bit values. The
483 distinct mark pixels repeat at identical final positions to retain the
original record count and loop bound. Frame delays form a clockwise phase;
each tile shares a delay so it lands as a coherent block. Repeated ninth-tile
points land 80 ms after the first pass, creating a short comet tail. All delays
stay in the original 0–255 range. The renderer's smallest 7×7 sprite places its ink at (3,3), and the
renderer subtracts ten from the particle Y coordinate; final display coordinates
are therefore `(63 + X, 21 - Y)`.

The wordmark retains 110 columns, 15 rows, one 32-bit word per column and the
original opaque mask. The bitmap and LCD use reversed vertical coordinates;
the top visual row occupies bit 17 and the bottom row bit 31. No additional
flash bytes, RAM, stack, heap or sample-memory reservation are introduced.
Renderer and LED instructions are unchanged. No physical chip timing is claimed.

## Verification

With Node 24 and the local original MAIN OS 1.40C:

```sh
node scripts/verify-startup-animation-native.mjs /private/local/original-MAIN.bin /private/local/new-startup-report
```

The input can also be the owner's complete original `.bin` firmware; that adds
full firmware round trips, including preservation of its opaque tail and seed.
The private verifier compares complete browser/native image bytes for ten
profiles: core only, Repitch, Mini Verb, Tape Echo + Euclid, Analog BD,
Sidechain Compressor, USB Audio + Quantizer, standalone MIDI Scenes, the
developer dynamic-loader path and direct static composition with stock FX2.
It checks separation from other static write plans, changed-table refusals,
repeat-application refusal and original-input immutability. Temporary firmware
is removed; only a sanitized text report is retained.

Unit tests check exact table extents, bitmap orientation/padding, every final
mark pixel, bounded particle coordinates, the clockwise tile sequence and the
ninth tile's later arrival/echo.
See [the verification record](../../../docs/STARTUP_ANIMATION.md) for actual
LCD capture results and remaining checks.

## Beta docking edition

Beta testers and verified administrators get the Elekloader migration's 3.5-second
docking score in new Octatrack builds: flying mark, arriving module, screen wave,
and matching panel lamps. The compact screen says **NEW / BETA**; it does not
claim that the complete new Elekloader base is installed. Ordinary builds retain
the original two graphics writes and 2.8-second stock renderer.

The shockwave bends the artwork and reveals the text without drawing a circular
outline or dotted echo. Its timing and panel-lamp sweep are unchanged.

`boot_anim.c`, `base.json` and `base_art.py` are ported from migration commit
`fbef9d564`. `hooks.s` adapts the score to the existing runtime rather than importing
the migration's loader, DSP, USB or module infrastructure. The two six-byte stock
sites are fingerprint-guarded, and the compositor's instruction is recovered from
verified local firmware into an empty replay slot. Drawing preserves all live
registers and flags. The rom_gate.s adapter occupies the first 80 bytes of the
verified descriptor cave (0x400d6b20..0x400d6b70); beta descriptor clones start
80 bytes later, leaving the utility modules' fixed overflow sites intact. Its
active word is zero in the initial MAIN image, so early compositor
calls replay the local stock instruction before the RAM runtime is unpacked.
Standalone MIDI Scenes uses 0x400d7490..0x400d74e0 inside the documented,
unreferenced 0xff run after the scene-mute helper. Its live zero-filled CC cache
at 0x400d7500..0x400d7600 stays intact. Only the score sets the active word while drawing; both replay slots are empty in the shipped
packages. Keep persistent hooks inside the protected image caves: the appended
early loader area is reused by stock RAM and is no longer executable during
startup. Outside startup the drawing hook only replays the stock path.
State is explicitly initialized in the loaded data, because this runtime loader
does not initialize an added BSS. Existing runtime and staging bounds still apply;
the sample-memory reservation is unchanged. The logger's configuration and source
fingerprints identify the beta startup package.

Compile only authored sources, without any firmware:

```sh
python3 -B sdk/runtime/startup/package.py --output src/engine/assets/beta-startup.json
```

The SDK host test covers MKI/MKII final pixels, frame bounds, LED choreography
and colour restoration. With original firmware and the reviewed native tools,
run the separate private composition and boot checks:

```sh
node scripts/verify-startup-beta-native.mjs /private/original.bin /private/new-beta-check
python3 scripts/verify-startup-beta.py --image /private/new-beta-check/beta-MAIN.bin --stock /private/new-beta-check/stock-MAIN.bin --version 3.0.0 --emulator /private/ot_emu
```

The native verifier deliberately keeps test images only in the requested private
directory. Never commit these images. See [the startup release record](../../../docs/STARTUP_ANIMATION.md)
for evidence and limits of this port.

## Authorship and licence

Original Modwerk artwork and encoders © 2026 Modwerk contributors, under the
repository's GPL-3.0-or-later licence. Underlying Octatrack firmware and renderer
remain Elektron's property and are never distributed with this source.
