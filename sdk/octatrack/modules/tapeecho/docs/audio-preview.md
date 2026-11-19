# Tape Echo audio preview provenance

Rendered on 12 October 2026 through the unchanged 0.1.2-experimental fixed-point CPU engine. Editorial release 0.1.3-experimental retains that exact runtime and historical test status.

Source: `106 Synth Chord Short Blue Synth 2.wav` from Legowelt's Roland JUNO 106 sample kit. Credit: Legowelt (Danny Wolfers), ©2012 Pacific Micro International Software. The included `106 SAMPLES README.txt` declares the kit free with unrestricted use. The source and this processed comparison are used under that pack permission (LicenseRef-Legowelt-Juno106-Sample-Permission); the module's MIT software licence does not relicense the source audio. The provenance below records the exact permission quote/file hash, original WAV/PCM hashes, excerpt, gain/fades and processed file hash. Only the comparison MP3 is bundled; the source WAV and sample pack stay on the developer's computer. No firmware, extracted stock code/tables, card, memory dump or build image is included. This is an offline computer render, with no new physical-hardware or performance qualification.

```json
{
  "file": "media/audio-preview.mp3",
  "sha256": "af6a8b612e29813d792d673d8c9fd14e2a2e6657e1e762bee082149cea9c147f",
  "seconds": 7.85,
  "encoding": {
    "format": "MP3",
    "sampleRateHz": 44100,
    "channels": 2,
    "bitrateKbps": 192,
    "decodedPeakDbfs": -1.552,
    "fadeInMs": 5,
    "passFadeOutMs": 35,
    "gapSeconds": 0,
    "loudnessMatch": "first-hit",
    "matchWindowSeconds": 0.02,
    "limiter": false
  },
  "passes": [
    {
      "label": "dry",
      "seconds": 0.8500680272108844,
      "settings": {
        "time": 80,
        "feedback": 0,
        "wow": 0,
        "age": 0,
        "sync": 1,
        "mix": 0,
        "tempoBpm": 128
      },
      "pcmSha256": "745e78a8a1beb8ad7bdd22dee3d81fabaedd66509ef9ea3a5fed393b6e4a60e7",
      "dryBitExact": true,
      "start": 0.0,
      "duration": 0.85,
      "renderedFrames": 37488,
      "trimStartFrame": 0,
      "trimEndFrame": 37485,
      "matchGainDb": 0.0,
      "unmatchedPeakDbfs": -14.0
    },
    {
      "label": "clean eighth-note repeats",
      "seconds": 3.000090702947846,
      "settings": {
        "time": 80,
        "feedback": 78,
        "wow": 10,
        "age": 20,
        "sync": 1,
        "mix": 75,
        "tempoBpm": 128
      },
      "pcmSha256": "60d3b076f76350c8f77fe068c2f5b4845cf3702fb8a37a8760bb7868ce0548e0",
      "dryBitExact": false,
      "start": 0.85,
      "duration": 3.0,
      "renderedFrames": 132304,
      "trimStartFrame": 0,
      "trimEndFrame": 132300,
      "matchGainDb": 7.756,
      "unmatchedPeakDbfs": -21.756
    },
    {
      "label": "worn dotted-eighth repeats",
      "seconds": 4.0,
      "settings": {
        "time": 101,
        "feedback": 94,
        "wow": 80,
        "age": 70,
        "sync": 1,
        "mix": 75,
        "tempoBpm": 128
      },
      "pcmSha256": "0a3c69adf36c685ded0fec3176a0e819590b1e3b3d6943b6a25b79c7a67bc53a",
      "dryBitExact": false,
      "start": 3.85,
      "duration": 4.0,
      "renderedFrames": 176400,
      "trimStartFrame": 0,
      "trimEndFrame": 176400,
      "matchGainDb": 7.756,
      "unmatchedPeakDbfs": -21.756
    }
  ],
  "validation": {
    "nonzeroAudio": true,
    "decodedPeakBelowMinus1Dbfs": true,
    "final50msPeakDbfs": -4.913,
    "clippedSamples": 0,
    "maximumQuietRunSecondsBelowMinus48Dbfs": 0.16
  },
  "schemaVersion": 2,
  "moduleId": "tapeecho",
  "moduleVersion": "0.1.2-experimental",
  "rendered": "2026-10-12",
  "sourceCommit": "32ac46b0c7e8c11e48ebc41674695e033142b46e",
  "limitations": [
    "Offline emulator/native render, not a physical Octatrack recording or new hardware/performance qualification."
  ],
  "sourceFilesSha256": {
    "cpu.c": "13c8ab1a6934bab2f679c40ad8096d2151326b06d1fcffaf261bde40d82c9814",
    "cpu.h": "d07d496a62b95f23f8c2cbd893a0125e8a67071e83bf2c642e14251e48e69ff3",
    "cpu.s": "1da9056c6a175fe91b09a03172e4ef516f085ee659cf7a9f9aff53836c368e64",
    "cpu_hooks.s": "d1d959af91fbd0759191c5e244b4396613d18c057c8e65281d76cb67beb73e34",
    "cpu_kernels.s": "5cd8a759642ee9f59b6fe44f1dbe82928dc1c5ead69f5ee3c92d76d6b5945327",
    "cpu_passthrough.asm": "68ef0beaa213de43e116d2feb367b437ef8c73c7f7b1c07328fde2d72edb3fdc",
    "cpu_tables.h": "1d2e3e062651f021ca94fd19339dde824bcf49c4d867da790c20957dd24db9b2",
    "generate_cpu.py": "09477f59af29dc6b68458454f818ec999339f4f4eefadb979cc13236ce431353",
    "generate_tables.py": "3461b659e2f22d7da776eb87755610094a4a3e72609c875e82902a8da9a8a69c",
    "manifest.py": "e83c639b3a6d51946b6cb5ae2af72d9376f2ff9cad75502396287c95c751927b",
    "time_fmt.s": "f50337532bbd802f67bb3c93d975405c2e386ec2a75bf525a814b9f9756f9d15"
  },
  "method": "Offline render of the module’s unchanged fixed-point cpu.c, compiled natively with cc -shared -fPIC -O2 -DTE_HOST=1 and called through te_process in 16-sample blocks using the existing verify_tapeecho_cpu.Engine ring-buffer harness. 300 silent blocks warm the controls. Direct onset RMS is matched over 20 ms; repeat levels and tails retain the module response. Not a hardware recording.",
  "sample": {
    "name": "106 Synth Chord Short Blue Synth 2.wav",
    "pack": "Legowelt Roland JUNO 106 sample kit",
    "pathWithinPack": "106 Synth Chord Short Blue Synth 2.wav",
    "credit": "Legowelt (Danny Wolfers), ©2012 Pacific Micro International Software",
    "license": "LicenseRef-Legowelt-Juno106-Sample-Permission",
    "permissionFile": "106 SAMPLES README.txt",
    "permissionFileSha256": "20398760fc080b8b53a8fff99b302d02a2ab73a420d90ee6333ee714ff47b2c3",
    "permissionQuote": "This sample kit is free, you can do whatever you want it",
    "originalFileSha256": "d0d712b95c2ed0336923ae1a0562f58a8633c9ebb11c109f70fbead98d5ec008",
    "originalPcmSha256": "36a3776271b1bb55914d6572f8e459f329f0e84e3d31bc7b376de8b030348ac2",
    "originalFormat": {
      "sampleRateHz": 44100,
      "channels": 2,
      "sampleBits": 16,
      "frames": 50688
    },
    "preparation": {
      "startFrame": 0,
      "frames": 37485,
      "fadeInMs": 0,
      "fadeOutMs": 35.0,
      "gainDb": -13.998675,
      "peakDbfs": -14,
      "resampled": false
    },
    "sourcePcmSha256": "4a568128c0cd81e56b22d4d813983372f9ac435a7d951b44fe5066b51873146e",
    "sourceFormat": "interleaved stereo signed little-endian int32 containing Q23 words"
  },
  "harness": {
    "name": "verify_tapeecho_cpu.Engine",
    "sourceSha256": "7e978248e9d6e00ff4cef19137ecc8044b376459ff6dab3ae87499f5ec2ee806",
    "abi": "Q31 stereo in/out; 176400-frame ring; tempo24=3072 at 128 BPM"
  }
}
```
