# Audio previews for modules

A module that makes or changes sound can carry one short clip in its gallery. The site already plays `captureType: "audio"` media with the shared wavesurfer player, so a clip is a media entry and nothing more.

## What a clip is

- **One sample, played as it comes.** The clip plays a single sample (or, for a synth, a single hit) dry first, then through the module at one or two settings. No beats, no sequenced patterns, nothing else in the mix.
- **Short.** About 10 to 20 seconds, MP3 at 192 kbit/s, peak at -1 dBFS, 5 ms fade in, a short fade out.
- **Fair to compare.** Where the effect changes loudness (a chorus, a saturator, a filter), scale each pass to the dry pass's RMS. Where the effect changes the direct hit (a dry/wet crossfade), match the first hit. Reverb and echo tails are left alone. Say which in the caption.
- **Honest.** The clip is a render, not a recording of an Octatrack. The caption says it was rendered offline on a computer through the module's own code, and lists the settings.
- **Rights.** Pick samples whose licence allows it and credit them. A pack with no licence file needs the owner's confirmation before merge.

## Where it goes

Put the MP3 at `media/audio-preview.mp3` in the module folder and add this to `media` in `octamod.module.json`. The caption is up to 400 characters, `credit` 200, `license` 100.

```json
{
  "path": "media/audio-preview.mp3",
  "captureType": "audio",
  "caption": "One clap, played three times: dry, then …. Rendered offline through the module's own code on a computer, not recorded on an Octatrack.",
  "alt": "A single clap heard dry, then with …",
  "credit": "Modwerk contributors (offline render). Sample: <pack>.",
  "license": "Render MIT; sample per its pack terms (media/LICENSE.md)",
  "source": "original"
}
```

Add an "Audio preview" paragraph to the README's Screens and audio section, an "Audio preview" section to `media/LICENSE.md` (sample, pack, rights status, no firmware or stock code included) and a `media/audio-preview.json` with the file's SHA-256, the sample, each pass's settings and start time, and the method. `npm run modules:generate` copies the file into the site.

Audio is media, so it needs no version bump, packages or approval. **One exception:** a module still at its frozen-baseline version (see [existing modules](MODULE_QUALIFICATION.md#existing-modules)) loses its exemption when any file in its folder changes. Such a module needs an editorial release first.

## How the clips were rendered

All of this stays on the developer's computer; the original 1.40C never enters the repository.

- **DSP effects** (Mini Verb, E-Verb, Air Chorus, TapeHead, Euclid). A one-module remix is built into a private image with the native builder (`REMIX=… XBUS=1 SPEC=1 OCTABAM_STATIC_STOCK=1 python3 tools/build/build_bus.py`) and run in `dsp_host`, as the module's own `verify.py` does. Dump both payloads with `send_probe.dump_mem`, find the entry points with `send_probe.entry_points`, feed a stereo 24-bit raw stem with `-in … -stereo`, pad 256 blocks of silence first (the engines stay dry for 256 calls) and change knobs mid-render with `-paramfile`. `-tempo BPM` publishes the tempo for Euclid. `MIX 0` reproduces the input bit for bit, which is the check that the harness is wired right.
- **Tape Echo.** Its DSP half is a passthrough; the echo is `modules/tapeecho/cpu.c`. Build it natively (`cc -shared -fPIC -O2 -DTE_HOST=1`) and call `te_process` block by block, as `verify_tapeecho_cpu.py` does.
- **Analog BD.** Its 808 and 909 engines run in `bd909_host` through `tools/harness/bd808.py` and `bd909.py`; call the hosts directly, since `render()` asserts a code-growth bound that is not about audio.
- **Docker.** The toolchain image has no `dsp_host`; build the target in a container (`cmake --build vendor/dsp56300/build --target dsp_host`). Run containers with `--shm-size=2g`: with Docker's default 64 MiB, booting the second DSP core ends in SIGBUS.

## What cannot be rendered yet

- **Machines** (Synth, Poly8, Vector) and the sample-playback and sequencer modules (Repitch, Play Modes) only make sound inside the full instrument. In `ot_emu` as of 10 October 2026 the main output stays at digital zero for every fixture tried (an FM Synth with AMP HOLD, REL and VOL raised, and a tone fed through a THRU track), which matches the known TX0 limit in `sdk/octabam/docs/remixer/EMU.md`. Their previews need an emulator or a recording whose output is known to carry audio.
- **Sidechain Compressor** needs the firmware's track-level bus for its key.
- **Digitakt and Digitone modules** have no audio-capable emulator in the SDK.
- Modules that act only on MIDI, scenes or settings have no sound of their own.
