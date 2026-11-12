# Reproduced TapeHead benchmark

Version 0.1.2-experimental, 2 October 2026. `BLOCKS=2048 REMIX=tapehead-spring python3 -B modules/tapehead/benchmark.py` on Octamod `866ea9e` with the 0.1.2 source in the module folder, `make image REMIX=tapehead-spring BUILD=7`. Executed instructions exclude stalls and common processing; no hardware-cycle claim. 0.1.1's run (image `bb700652…`) measured 4,287 per block for one instance and a 17,616 worst peak per core.

```json
{
  "units": "executed DSP instructions (not hardware cycles)",
  "blocks": 2048,
  "stock_sha256": "164f31224bf61181e3f50e7dec40df9afcae5b16dbf6e4c0d0cc5e986af0a84e",
  "image_sha256": "774aa99723625fb698e5f0bb6fc32ea3196996931f55beb10ce1ec53eccc328b",
  "summary": {
    "SPRING REV": {
      "one_instance_mean_per_block": 4185.9,
      "one_instance_per_sample": 261.6,
      "eight_worst_peak_per_core_block": 20376,
      "eight_worst_per_core_sample": 1273.5,
      "worst_case": "eight_mod_split15",
      "init_instructions_per_core": 380
    },
    "TAPEHEAD": {
      "one_instance_mean_per_block": 4383.0,
      "one_instance_per_sample": 273.9,
      "eight_worst_peak_per_core_block": 18000,
      "eight_worst_per_core_sample": 1125.0,
      "worst_case": "eight_mod_split1",
      "init_instructions_per_core": 24
    }
  },
  "results": [
    {
      "effect": "SPRING REV",
      "case": "one_fixed",
      "instances": 1,
      "blocks": 2048,
      "cores": [
        {
          "core": 0,
          "mean_block": 4185.9296875,
          "peak_block": 4186,
          "peak_at": 270,
          "init_instructions": 95
        },
        {
          "core": 1,
          "mean_block": 0.0,
          "peak_block": 0,
          "peak_at": 0,
          "init_instructions": 0
        }
      ],
      "peak_audio": 1820876,
      "clipped_samples": 0
    },
    {
      "effect": "SPRING REV",
      "case": "eight_fixed",
      "instances": 8,
      "blocks": 2048,
      "cores": [
        {
          "core": 0,
          "mean_block": 16743.71875,
          "peak_block": 16744,
          "peak_at": 270,
          "init_instructions": 380
        },
        {
          "core": 1,
          "mean_block": 16743.71875,
          "peak_block": 16744,
          "peak_at": 270,
          "init_instructions": 380
        }
      ],
      "peak_audio": 3481900,
      "clipped_samples": 0
    },
    {
      "effect": "SPRING REV",
      "case": "eight_modulated",
      "instances": 8,
      "blocks": 2048,
      "cores": [
        {
          "core": 0,
          "mean_block": 16740.57589285714,
          "peak_block": 16748,
          "peak_at": 270,
          "init_instructions": 380
        },
        {
          "core": 1,
          "mean_block": 16740.57589285714,
          "peak_block": 16748,
          "peak_at": 270,
          "init_instructions": 380
        }
      ],
      "peak_audio": 6650127,
      "clipped_samples": 0
    },
    {
      "effect": "SPRING REV",
      "case": "eight_mod_split1",
      "instances": 8,
      "blocks": 2048,
      "cores": [
        {
          "core": 0,
          "mean_block": 18088.640625,
          "peak_block": 18100,
          "peak_at": 270,
          "init_instructions": 380
        },
        {
          "core": 1,
          "mean_block": 18088.640625,
          "peak_block": 18100,
          "peak_at": 270,
          "init_instructions": 380
        }
      ],
      "peak_audio": 6650127,
      "clipped_samples": 0
    },
    {
      "effect": "SPRING REV",
      "case": "eight_mod_split15",
      "instances": 8,
      "blocks": 2048,
      "cores": [
        {
          "core": 0,
          "mean_block": 20361.566964285714,
          "peak_block": 20376,
          "peak_at": 271,
          "init_instructions": 380
        },
        {
          "core": 1,
          "mean_block": 20361.566964285714,
          "peak_block": 20376,
          "peak_at": 271,
          "init_instructions": 380
        }
      ],
      "peak_audio": 6650126,
      "clipped_samples": 0
    },
    {
      "effect": "SPRING REV",
      "case": "sync_split00",
      "instances": 8,
      "blocks": 2048,
      "cores": [
        {
          "core": 0,
          "mean_block": 16740.57589285714,
          "peak_block": 16748,
          "peak_at": 270,
          "init_instructions": 380
        },
        {
          "core": 1,
          "mean_block": 16740.57589285714,
          "peak_block": 16748,
          "peak_at": 270,
          "init_instructions": 380
        }
      ],
      "peak_audio": 6600679,
      "clipped_samples": 0
    },
    {
      "effect": "SPRING REV",
      "case": "sync_split01",
      "instances": 8,
      "blocks": 2048,
      "cores": [
        {
          "core": 0,
          "mean_block": 18088.640625,
          "peak_block": 18100,
          "peak_at": 270,
          "init_instructions": 380
        },
        {
          "core": 1,
          "mean_block": 18088.640625,
          "peak_block": 18100,
          "peak_at": 270,
          "init_instructions": 380
        }
      ],
      "peak_audio": 6600679,
      "clipped_samples": 0
    },
    {
      "effect": "SPRING REV",
      "case": "sync_split02",
      "instances": 8,
      "blocks": 2048,
      "cores": [
        {
          "core": 0,
          "mean_block": 18088.63839285714,
          "peak_block": 18096,
          "peak_at": 270,
          "init_instructions": 380
        },
        {
          "core": 1,
          "mean_block": 18088.63839285714,
          "peak_block": 18096,
          "peak_at": 270,
          "init_instructions": 380
        }
      ],
      "peak_audio": 6600679,
      "clipped_samples": 0
    },
    {
      "effect": "SPRING REV",
      "case": "sync_split03",
      "instances": 8,
      "blocks": 2048,
      "cores": [
        {
          "core": 0,
          "mean_block": 18088.636160714286,
          "peak_block": 18096,
          "peak_at": 271,
          "init_instructions": 380
        },
        {
          "core": 1,
          "mean_block": 18088.636160714286,
          "peak_block": 18096,
          "peak_at": 271,
          "init_instructions": 380
        }
      ],
      "peak_audio": 6600679,
      "clipped_samples": 0
    },
    {
      "effect": "SPRING REV",
      "case": "sync_split04",
      "instances": 8,
      "blocks": 2048,
      "cores": [
        {
          "core": 0,
          "mean_block": 20357.59151785714,
          "peak_block": 20376,
          "peak_at": 270,
          "init_instructions": 380
        },
        {
          "core": 1,
          "mean_block": 20357.59151785714,
          "peak_block": 20376,
          "peak_at": 270,
          "init_instructions": 380
        }
      ],
      "peak_audio": 6580481,
      "clipped_samples": 0
    },
    {
      "effect": "SPRING REV",
      "case": "sync_split05",
      "instances": 8,
      "blocks": 2048,
      "cores": [
        {
          "core": 0,
          "mean_block": 20361.589285714286,
          "peak_block": 20376,
          "peak_at": 270,
          "init_instructions": 380
        },
        {
          "core": 1,
          "mean_block": 20361.589285714286,
          "peak_block": 20376,
          "peak_at": 270,
          "init_instructions": 380
        }
      ],
      "peak_audio": 6580481,
      "clipped_samples": 0
    },
    {
      "effect": "SPRING REV",
      "case": "sync_split06",
      "instances": 8,
      "blocks": 2048,
      "cores": [
        {
          "core": 0,
          "mean_block": 20361.587053571428,
          "peak_block": 20376,
          "peak_at": 271,
          "init_instructions": 380
        },
        {
          "core": 1,
          "mean_block": 20361.587053571428,
          "peak_block": 20376,
          "peak_at": 271,
          "init_instructions": 380
        }
      ],
      "peak_audio": 6580481,
      "clipped_samples": 0
    },
    {
      "effect": "SPRING REV",
      "case": "sync_split07",
      "instances": 8,
      "blocks": 2048,
      "cores": [
        {
          "core": 0,
          "mean_block": 20361.584821428572,
          "peak_block": 20376,
          "peak_at": 271,
          "init_instructions": 380
        },
        {
          "core": 1,
          "mean_block": 20361.584821428572,
          "peak_block": 20376,
          "peak_at": 271,
          "init_instructions": 380
        }
      ],
      "peak_audio": 6580481,
      "clipped_samples": 0
    },
    {
      "effect": "SPRING REV",
      "case": "sync_split08",
      "instances": 8,
      "blocks": 2048,
      "cores": [
        {
          "core": 0,
          "mean_block": 19857.582589285714,
          "peak_block": 19872,
          "peak_at": 271,
          "init_instructions": 380
        },
        {
          "core": 1,
          "mean_block": 19857.582589285714,
          "peak_block": 19872,
          "peak_at": 271,
          "init_instructions": 380
        }
      ],
      "peak_audio": 6609187,
      "clipped_samples": 0
    },
    {
      "effect": "SPRING REV",
      "case": "sync_split09",
      "instances": 8,
      "blocks": 2048,
      "cores": [
        {
          "core": 0,
          "mean_block": 19861.58035714286,
          "peak_block": 19876,
          "peak_at": 271,
          "init_instructions": 380
        },
        {
          "core": 1,
          "mean_block": 19861.58035714286,
          "peak_block": 19876,
          "peak_at": 271,
          "init_instructions": 380
        }
      ],
      "peak_audio": 6609187,
      "clipped_samples": 0
    },
    {
      "effect": "SPRING REV",
      "case": "sync_split10",
      "instances": 8,
      "blocks": 2048,
      "cores": [
        {
          "core": 0,
          "mean_block": 19861.578125,
          "peak_block": 19876,
          "peak_at": 271,
          "init_instructions": 380
        },
        {
          "core": 1,
          "mean_block": 19861.578125,
          "peak_block": 19876,
          "peak_at": 271,
          "init_instructions": 380
        }
      ],
      "peak_audio": 6609187,
      "clipped_samples": 0
    },
    {
      "effect": "SPRING REV",
      "case": "sync_split11",
      "instances": 8,
      "blocks": 2048,
      "cores": [
        {
          "core": 0,
          "mean_block": 19861.57589285714,
          "peak_block": 19876,
          "peak_at": 271,
          "init_instructions": 380
        },
        {
          "core": 1,
          "mean_block": 19861.57589285714,
          "peak_block": 19876,
          "peak_at": 271,
          "init_instructions": 380
        }
      ],
      "peak_audio": 6609187,
      "clipped_samples": 0
    },
    {
      "effect": "SPRING REV",
      "case": "sync_split12",
      "instances": 8,
      "blocks": 2048,
      "cores": [
        {
          "core": 0,
          "mean_block": 20357.573660714286,
          "peak_block": 20372,
          "peak_at": 271,
          "init_instructions": 380
        },
        {
          "core": 1,
          "mean_block": 20357.573660714286,
          "peak_block": 20372,
          "peak_at": 271,
          "init_instructions": 380
        }
      ],
      "peak_audio": 6532790,
      "clipped_samples": 0
    },
    {
      "effect": "SPRING REV",
      "case": "sync_split13",
      "instances": 8,
      "blocks": 2048,
      "cores": [
        {
          "core": 0,
          "mean_block": 20361.571428571428,
          "peak_block": 20376,
          "peak_at": 271,
          "init_instructions": 380
        },
        {
          "core": 1,
          "mean_block": 20361.571428571428,
          "peak_block": 20376,
          "peak_at": 271,
          "init_instructions": 380
        }
      ],
      "peak_audio": 6532791,
      "clipped_samples": 0
    },
    {
      "effect": "SPRING REV",
      "case": "sync_split14",
      "instances": 8,
      "blocks": 2048,
      "cores": [
        {
          "core": 0,
          "mean_block": 20361.569196428572,
          "peak_block": 20376,
          "peak_at": 271,
          "init_instructions": 380
        },
        {
          "core": 1,
          "mean_block": 20361.569196428572,
          "peak_block": 20376,
          "peak_at": 271,
          "init_instructions": 380
        }
      ],
      "peak_audio": 6532791,
      "clipped_samples": 0
    },
    {
      "effect": "SPRING REV",
      "case": "sync_split15",
      "instances": 8,
      "blocks": 2048,
      "cores": [
        {
          "core": 0,
          "mean_block": 20361.566964285714,
          "peak_block": 20376,
          "peak_at": 271,
          "init_instructions": 380
        },
        {
          "core": 1,
          "mean_block": 20361.566964285714,
          "peak_block": 20376,
          "peak_at": 271,
          "init_instructions": 380
        }
      ],
      "peak_audio": 6532791,
      "clipped_samples": 0
    },
    {
      "effect": "TAPEHEAD",
      "case": "one_fixed",
      "instances": 1,
      "blocks": 2048,
      "cores": [
        {
          "core": 0,
          "mean_block": 4383.0,
          "peak_block": 4383,
          "peak_at": 0,
          "init_instructions": 6
        },
        {
          "core": 1,
          "mean_block": 0.0,
          "peak_block": 0,
          "peak_at": 0,
          "init_instructions": 0
        }
      ],
      "peak_audio": 2048136,
      "clipped_samples": 0
    },
    {
      "effect": "TAPEHEAD",
      "case": "eight_fixed",
      "instances": 8,
      "blocks": 2048,
      "cores": [
        {
          "core": 0,
          "mean_block": 17532.0,
          "peak_block": 17532,
          "peak_at": 0,
          "init_instructions": 24
        },
        {
          "core": 1,
          "mean_block": 17532.0,
          "peak_block": 17532,
          "peak_at": 0,
          "init_instructions": 24
        }
      ],
      "peak_audio": 2097152,
      "clipped_samples": 0
    },
    {
      "effect": "TAPEHEAD",
      "case": "eight_modulated",
      "instances": 8,
      "blocks": 2048,
      "cores": [
        {
          "core": 0,
          "mean_block": 17538.428571428572,
          "peak_block": 17544,
          "peak_at": 384,
          "init_instructions": 24
        },
        {
          "core": 1,
          "mean_block": 17538.428571428572,
          "peak_block": 17544,
          "peak_at": 384,
          "init_instructions": 24
        }
      ],
      "peak_audio": 2097152,
      "clipped_samples": 0
    },
    {
      "effect": "TAPEHEAD",
      "case": "eight_mod_split1",
      "instances": 8,
      "blocks": 2048,
      "cores": [
        {
          "core": 0,
          "mean_block": 17988.85714285714,
          "peak_block": 18000,
          "peak_at": 384,
          "init_instructions": 24
        },
        {
          "core": 1,
          "mean_block": 17988.85714285714,
          "peak_block": 18000,
          "peak_at": 384,
          "init_instructions": 24
        }
      ],
      "peak_audio": 2097152,
      "clipped_samples": 0
    },
    {
      "effect": "TAPEHEAD",
      "case": "eight_mod_split15",
      "instances": 8,
      "blocks": 2048,
      "cores": [
        {
          "core": 0,
          "mean_block": 17988.85714285714,
          "peak_block": 18000,
          "peak_at": 384,
          "init_instructions": 24
        },
        {
          "core": 1,
          "mean_block": 17988.85714285714,
          "peak_block": 18000,
          "peak_at": 384,
          "init_instructions": 24
        }
      ],
      "peak_audio": 2097152,
      "clipped_samples": 0
    },
    {
      "effect": "TAPEHEAD",
      "case": "sync_split00",
      "instances": 8,
      "blocks": 2048,
      "cores": [
        {
          "core": 0,
          "mean_block": 17538.428571428572,
          "peak_block": 17544,
          "peak_at": 384,
          "init_instructions": 24
        },
        {
          "core": 1,
          "mean_block": 17538.428571428572,
          "peak_block": 17544,
          "peak_at": 384,
          "init_instructions": 24
        }
      ],
      "peak_audio": 2097152,
      "clipped_samples": 0
    },
    {
      "effect": "TAPEHEAD",
      "case": "sync_split01",
      "instances": 8,
      "blocks": 2048,
      "cores": [
        {
          "core": 0,
          "mean_block": 17988.85714285714,
          "peak_block": 18000,
          "peak_at": 384,
          "init_instructions": 24
        },
        {
          "core": 1,
          "mean_block": 17988.85714285714,
          "peak_block": 18000,
          "peak_at": 384,
          "init_instructions": 24
        }
      ],
      "peak_audio": 2097152,
      "clipped_samples": 0
    },
    {
      "effect": "TAPEHEAD",
      "case": "sync_split02",
      "instances": 8,
      "blocks": 2048,
      "cores": [
        {
          "core": 0,
          "mean_block": 17988.85714285714,
          "peak_block": 18000,
          "peak_at": 384,
          "init_instructions": 24
        },
        {
          "core": 1,
          "mean_block": 17988.85714285714,
          "peak_block": 18000,
          "peak_at": 384,
          "init_instructions": 24
        }
      ],
      "peak_audio": 2097152,
      "clipped_samples": 0
    },
    {
      "effect": "TAPEHEAD",
      "case": "sync_split03",
      "instances": 8,
      "blocks": 2048,
      "cores": [
        {
          "core": 0,
          "mean_block": 17988.85714285714,
          "peak_block": 18000,
          "peak_at": 384,
          "init_instructions": 24
        },
        {
          "core": 1,
          "mean_block": 17988.85714285714,
          "peak_block": 18000,
          "peak_at": 384,
          "init_instructions": 24
        }
      ],
      "peak_audio": 2097152,
      "clipped_samples": 0
    },
    {
      "effect": "TAPEHEAD",
      "case": "sync_split04",
      "instances": 8,
      "blocks": 2048,
      "cores": [
        {
          "core": 0,
          "mean_block": 17988.85714285714,
          "peak_block": 18000,
          "peak_at": 384,
          "init_instructions": 24
        },
        {
          "core": 1,
          "mean_block": 17988.85714285714,
          "peak_block": 18000,
          "peak_at": 384,
          "init_instructions": 24
        }
      ],
      "peak_audio": 2097152,
      "clipped_samples": 0
    },
    {
      "effect": "TAPEHEAD",
      "case": "sync_split05",
      "instances": 8,
      "blocks": 2048,
      "cores": [
        {
          "core": 0,
          "mean_block": 17988.85714285714,
          "peak_block": 18000,
          "peak_at": 384,
          "init_instructions": 24
        },
        {
          "core": 1,
          "mean_block": 17988.85714285714,
          "peak_block": 18000,
          "peak_at": 384,
          "init_instructions": 24
        }
      ],
      "peak_audio": 2097152,
      "clipped_samples": 0
    },
    {
      "effect": "TAPEHEAD",
      "case": "sync_split06",
      "instances": 8,
      "blocks": 2048,
      "cores": [
        {
          "core": 0,
          "mean_block": 17988.85714285714,
          "peak_block": 18000,
          "peak_at": 384,
          "init_instructions": 24
        },
        {
          "core": 1,
          "mean_block": 17988.85714285714,
          "peak_block": 18000,
          "peak_at": 384,
          "init_instructions": 24
        }
      ],
      "peak_audio": 2097152,
      "clipped_samples": 0
    },
    {
      "effect": "TAPEHEAD",
      "case": "sync_split07",
      "instances": 8,
      "blocks": 2048,
      "cores": [
        {
          "core": 0,
          "mean_block": 17988.85714285714,
          "peak_block": 18000,
          "peak_at": 384,
          "init_instructions": 24
        },
        {
          "core": 1,
          "mean_block": 17988.85714285714,
          "peak_block": 18000,
          "peak_at": 384,
          "init_instructions": 24
        }
      ],
      "peak_audio": 2097152,
      "clipped_samples": 0
    },
    {
      "effect": "TAPEHEAD",
      "case": "sync_split08",
      "instances": 8,
      "blocks": 2048,
      "cores": [
        {
          "core": 0,
          "mean_block": 17988.85714285714,
          "peak_block": 18000,
          "peak_at": 384,
          "init_instructions": 24
        },
        {
          "core": 1,
          "mean_block": 17988.85714285714,
          "peak_block": 18000,
          "peak_at": 384,
          "init_instructions": 24
        }
      ],
      "peak_audio": 2097152,
      "clipped_samples": 0
    },
    {
      "effect": "TAPEHEAD",
      "case": "sync_split09",
      "instances": 8,
      "blocks": 2048,
      "cores": [
        {
          "core": 0,
          "mean_block": 17988.85714285714,
          "peak_block": 18000,
          "peak_at": 384,
          "init_instructions": 24
        },
        {
          "core": 1,
          "mean_block": 17988.85714285714,
          "peak_block": 18000,
          "peak_at": 384,
          "init_instructions": 24
        }
      ],
      "peak_audio": 2097152,
      "clipped_samples": 0
    },
    {
      "effect": "TAPEHEAD",
      "case": "sync_split10",
      "instances": 8,
      "blocks": 2048,
      "cores": [
        {
          "core": 0,
          "mean_block": 17988.85714285714,
          "peak_block": 18000,
          "peak_at": 384,
          "init_instructions": 24
        },
        {
          "core": 1,
          "mean_block": 17988.85714285714,
          "peak_block": 18000,
          "peak_at": 384,
          "init_instructions": 24
        }
      ],
      "peak_audio": 2097152,
      "clipped_samples": 0
    },
    {
      "effect": "TAPEHEAD",
      "case": "sync_split11",
      "instances": 8,
      "blocks": 2048,
      "cores": [
        {
          "core": 0,
          "mean_block": 17988.85714285714,
          "peak_block": 18000,
          "peak_at": 384,
          "init_instructions": 24
        },
        {
          "core": 1,
          "mean_block": 17988.85714285714,
          "peak_block": 18000,
          "peak_at": 384,
          "init_instructions": 24
        }
      ],
      "peak_audio": 2097152,
      "clipped_samples": 0
    },
    {
      "effect": "TAPEHEAD",
      "case": "sync_split12",
      "instances": 8,
      "blocks": 2048,
      "cores": [
        {
          "core": 0,
          "mean_block": 17988.85714285714,
          "peak_block": 18000,
          "peak_at": 384,
          "init_instructions": 24
        },
        {
          "core": 1,
          "mean_block": 17988.85714285714,
          "peak_block": 18000,
          "peak_at": 384,
          "init_instructions": 24
        }
      ],
      "peak_audio": 2097152,
      "clipped_samples": 0
    },
    {
      "effect": "TAPEHEAD",
      "case": "sync_split13",
      "instances": 8,
      "blocks": 2048,
      "cores": [
        {
          "core": 0,
          "mean_block": 17988.85714285714,
          "peak_block": 18000,
          "peak_at": 384,
          "init_instructions": 24
        },
        {
          "core": 1,
          "mean_block": 17988.85714285714,
          "peak_block": 18000,
          "peak_at": 384,
          "init_instructions": 24
        }
      ],
      "peak_audio": 2097152,
      "clipped_samples": 0
    },
    {
      "effect": "TAPEHEAD",
      "case": "sync_split14",
      "instances": 8,
      "blocks": 2048,
      "cores": [
        {
          "core": 0,
          "mean_block": 17988.85714285714,
          "peak_block": 18000,
          "peak_at": 384,
          "init_instructions": 24
        },
        {
          "core": 1,
          "mean_block": 17988.85714285714,
          "peak_block": 18000,
          "peak_at": 384,
          "init_instructions": 24
        }
      ],
      "peak_audio": 2097152,
      "clipped_samples": 0
    },
    {
      "effect": "TAPEHEAD",
      "case": "sync_split15",
      "instances": 8,
      "blocks": 2048,
      "cores": [
        {
          "core": 0,
          "mean_block": 17988.85714285714,
          "peak_block": 18000,
          "peak_at": 384,
          "init_instructions": 24
        },
        {
          "core": 1,
          "mean_block": 17988.85714285714,
          "peak_block": 18000,
          "peak_at": 384,
          "init_instructions": 24
        }
      ],
      "peak_audio": 2097152,
      "clipped_samples": 0
    }
  ]
}
```
