# Audio previews for modules

A module that makes or changes sound can carry one short clip in its gallery. The site already plays `captureType: "audio"` media with the shared wavesurfer player, so a clip is a media entry and nothing more.

## What a clip is

- **Make the controls audible.** Start with one isolated sample or generated hit, then compare one or two settings. An explicitly requested musical phrase can show a drum or synth more clearly: use the instrument tempo, document note/trig positions and automation, and keep the arrangement focused on that module.
- **Keep it moving.** Use only the time needed to hear the contrast; avoid quiet padding between passes or after decayed tails. A reverb can need a longer audible tail. Record any tail edits and short fades. Use MP3 at 192 kbit/s, decoded peak below -1 dBFS and a 5 ms fade in. Decode the final MP3 and check its peak and clipped samples; encoding can overshoot a clean source WAV.
- **Fair to compare.** Where the effect changes loudness (a chorus, a saturator, a filter), scale each pass to the dry pass's RMS. Where the effect changes the direct hit (a dry/wet crossfade), match the first hit. Apply the onset gain to the whole pass so repeat/tail levels retain their relation to the hit. Use one common gain for a generated phrase so automation and patch-level contrasts remain audible. Say which in the caption.
- **Honest.** Identify an offline render or an owner-supplied recording accurately. A render caption names the actual module code and settings; a supplied recording records what its owner confirms and leaves unknown capture setup/version fields unknown. Neither adds hardware qualification by itself.
- **Rights.** Pick samples whose licence allows it and credit them. A pack with no licence file needs the owner's confirmation before merge. Original additive sounds are also suitable: record the deterministic source recipe, PCM format/hash and original-audio licence.

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

Audio is media, so it needs no version bump, packages or approval. **One exception:** a module still at its frozen-baseline version (see [existing modules](MODULE_QUALIFICATION.md#existing-modules)) loses its exemption when any file in its folder changes. Such a module needs an editorial release first. Retain the original versioned evidence and complete the documentation under the checked retained-evidence path. If its README is a historical resource report, preserve that entire file verbatim and append the new sections. Keep protected `media/LICENSE.md` and capture records exact; put new audio rights and a fenced JSON provenance record in `docs/audio-preview.md`. Reference it from the README and audio licence declaration.

## How the clips were rendered

All of this stays on the developer's computer; the original 1.40C never enters the repository.

- **DSP effects** (Mini Verb, E-Verb, Air Chorus, TapeHead). A one-module remix is built into a private image with the native builder (`REMIX=… XBUS=1 SPEC=1 OCTABAM_STATIC_STOCK=1 python3 tools/build/build_bus.py`) and run in `dsp_host`, as the module's own `verify.py` does. Dump both payloads with `send_probe.dump_mem`, find the entry points with `send_probe.entry_points`, feed a stereo 24-bit raw stem with `-in … -stereo`, pad 256 blocks of silence first (the engines stay dry for 256 calls) and change knobs mid-render with `-paramfile`. `MIX 0` reproduces the input bit for bit, which is the check that the harness is wired right.
- **Euclid.** `dsp_host -tempo` alone does not run the rhythm/envelope code: a filter-only render is incomplete. Compile the unchanged `control.c` with `-DEUCLID_NATIVE`, advance its `EuClock` with the stock instrument-clock fixture and call `eu_process` each 16-sample block. Feed the complete Q15 cutoff/gain to the unchanged `filter.asm`, including its fractional byte; integer knob rounding suppresses amplitude pulses. The stock `dsp_host` parameter protocol needs a documented private adapter for that fractional slot. Record its patch/hash, PLAY reset, tempo24, track scale/length, swing, stored knobs and counted triggers. STEPS stores the displayed length minus one. A native render verified on 12 October 2026 uses 120 BPM, scale 6 (1x), length 16, straight swing, E(5,16) low-pass and E(7,12) amplitude passes. A fresh PLAY epoch gives 11 and 19 triggers across their 4.1-second windows. This is modeled instrument-clock input for a render, with no new hardware timing claim.
- **Tape Echo.** Its DSP half is a passthrough; the echo is `modules/tapeecho/cpu.c`. Build it natively (`cc -shared -fPIC -O2 -DTE_HOST=1`) and call `te_process` block by block, as `verify_tapeecho_cpu.py` does.
- **Analog BD.** Its 808 and 909 engines run in `bd909_host` through `tools/harness/bd808.py` and `bd909.py`; call the hosts directly, since `render()` asserts a code-growth bound that is not about audio. For a phrase, derive quarter-note trigger frames from an instrument-tempo fixture, render in 16-sample blocks, and record the trigger list and control sweep. Report this as a modeled clock, not full-instrument timing evidence.
- **FM Synth.** Octemu records the actual 0.1.2-experimental machine using a sample-free private card/battery fixture. Use its headless panel script to select the machine and set controls. PLAY then double STOP can isolate a note; a documented native trig pattern can demonstrate a phrase. To use VECTOR's current Flex/Static generator with FM, run its unchanged `engine.c` offline and transfer note positions and semitone pitches into FM parameter locks; do not claim that VECTOR runs directly on FM. A composed FM Synth + Mini Verb image records the actual effect chain. Allow around 100 ms per encoder detent and verify held-trig pitch values from captures: rapid scripted turns can miss edits. Trim boot/control-edit intervals and use one common gain. Record source/image/emulator/QEMU hashes, sample-free fixture recipe, generator parameters/seed and pitch conversion, panel walk, recording hash and PCM boundaries/hashes. These captures do not establish physical-hardware behavior or previews for other machines.
- **Docker.** The toolchain image has no `dsp_host`; build the target in a container (`cmake --build vendor/dsp56300/build --target dsp_host`). Run containers with `--shm-size=2g`: with Docker's default 64 MiB, booting the second DSP core ends in SIGBUS.

## What cannot be rendered yet

- **Other machines** (Poly8, Vector) and the sample-playback and sequencer modules (Repitch, Play Modes) need the full instrument. Their audio has not been verified by this capture workflow. In `ot_emu` as of 10 October 2026 the main output stays at digital zero for every fixture tried (an FM Synth with AMP HOLD, REL and VOL raised, and a tone fed through a THRU track), which matches the known TX0 limit in `sdk/octabam/docs/remixer/EMU.md`. Their previews need an emulator or a recording whose output is known to carry audio.
- **Sidechain Compressor** needs the firmware's track-level bus for its key.
- **Digitakt and Digitone modules** have no audio-capable emulator in the SDK.
- Modules that act only on MIDI, scenes or settings have no sound of their own.

## Videos

A module's own YouTube video, published by its author or with the author's agreement, is listed in `src/catalog/module-videos.ts`: the video ID, its title, its channel and optionally one screen capture from the module's `media`. It never goes in the manifest, so adding one rebuilds no package. The video's card opens the Overview tab, and a "Watch the video" link in the header leads to it. The card is drawn from the module's cover art and that capture, and YouTube loads only when someone presses play.
