# Pattern Sample Locks qualification evidence — 4 November 2026

These stock-free records contain source and image hashes, calculated bounds and emulator observations. They contain no firmware, extracted instruction bytes, stock tables or memory dumps. Hardware was not accessed during these analyses.

## Popup opener and window-close callback boundary

The candidate's opener calls the stock popup routine before inspecting the
menu arguments. In the reproduced base, the inspected popup routine range
`0x4006d94c–0x4006da78` matches stock and has SHA-256
`074e9597b38edd44ff8fc63828e8af9449ed99b531642fd902f48054bdb8c5ea`.
It calls the window manager whose inspected range `0x4005829c–0x4005838e`
also matches stock and hashes to
`47a83b2ab28f9f0badd741af517ada3f4cdc9ea45e1a0d0eadbaeabed669487b`.
That manager checks five window slots and conditionally calls each nonzero
close callback before continuing. Five other initial callback entries are
confirmed from cached registration callers; two callback bodies have complete
32-byte local bounds. Rooted follow-up closes the `0x400131c8` leaf at four
local bytes and finds a 408-byte finite path through the early `0x4004d948`
helper chain from popup-routine entry, but later callback paths still have
unresolved indirect targets. A pinned ColdFire whole-image sweep decodes all
50 aligned manager-call patterns with six stack argument writes and immediate
`D0` use; 44 uncached sites still lack rooted caller and code/data-boundary
proof. Initial argument-six expressions yield 48 distinct code addresses and
one runtime-derived pointer, so these patterns do not establish an exhaustive
callback set. The [popup callback evidence](popup-callback-stack-20261104.md)
records the source and image hashes, path arithmetic, assumptions and open
edges. It does not bound the opener's separate window creation path, total
stack high-water, or timing. The exact reproduced base proof has no companion
modules; results for the changed `0x4004d948` range remain bound to that base.

## Uninstrumented compiler stack audit

```json
{
  "compiler": "m68k-elf-gcc (GCC) 16.2.0",
  "compilerFlags": [
    "-mcpu=54455",
    "-Os",
    "-std=c99",
    "-ffreestanding",
    "-fno-builtin",
    "-fno-common",
    "-fno-tree-loop-distribute-patterns",
    "-fno-asynchronous-unwind-tables",
    "-fno-unwind-tables",
    "-Wall",
    "-Wextra",
    "-Werror",
    "-I",
    "/work/sdk/runtime/loader",
    "-fno-late-combine-instructions",
    "-fstack-usage",
    "-fcallgraph-info=su"
  ],
  "toolchainImage": "sha256:da70d46e10b243277fa3ae2e015f7258d56b3ee08ca4be47e61899958872e792",
  "sourceRevision": "5a15ac390dac2475df3fb3b2ef64154e174b4182",
  "candidatePackageSha256": "3e13c46fb0054d05f228b045746453e0c50dbbe52fb53b3c229d598ddd7fed79",
  "reconstructedImageSha256": "54efd2166b30b836401d02f8d0d785e12aebc5b40196deb1a9b6e4530e6f95d5",
  "imageMatchesCandidate": true,
  "initializedBytes": 8748,
  "bssBytes": 1328,
  "relocations": 167,
  "nodeCount": 33,
  "frames": [
    {
      "function": "close_view",
      "frameBytes": 0,
      "kind": "static"
    },
    {
      "function": "text",
      "frameBytes": 0,
      "kind": "static"
    },
    {
      "function": "psl_write_step",
      "frameBytes": 8,
      "kind": "static"
    },
    {
      "function": "source_valid",
      "frameBytes": 8,
      "kind": "static"
    },
    {
      "function": "pixel",
      "frameBytes": 4,
      "kind": "static"
    },
    {
      "function": "psl_prepare",
      "frameBytes": 60,
      "kind": "dynamic,bounded"
    },
    {
      "function": "psl_validate",
      "frameBytes": 32,
      "kind": "dynamic,bounded"
    },
    {
      "function": "psl_apply",
      "frameBytes": 64,
      "kind": "dynamic,bounded"
    },
    {
      "function": "psl_font_text_at",
      "frameBytes": 40,
      "kind": "static"
    },
    {
      "function": "psl_font_clear",
      "frameBytes": 36,
      "kind": "static"
    },
    {
      "function": "psl_font_small_text",
      "frameBytes": 52,
      "kind": "dynamic,bounded"
    },
    {
      "function": "psl_font_box",
      "frameBytes": 68,
      "kind": "dynamic,bounded"
    },
    {
      "function": "psl_font_dashed_box",
      "frameBytes": 68,
      "kind": "dynamic,bounded"
    },
    {
      "function": "psl_font_invert",
      "frameBytes": 40,
      "kind": "dynamic,bounded"
    },
    {
      "function": "psl_ui_phase",
      "frameBytes": 0,
      "kind": "static"
    },
    {
      "function": "psl_ui_open",
      "frameBytes": 0,
      "kind": "static"
    },
    {
      "function": "psl_native_source",
      "frameBytes": 44,
      "kind": "static"
    },
    {
      "function": "psl_native_context",
      "frameBytes": 0,
      "kind": "static"
    },
    {
      "function": "psl_native_popup",
      "frameBytes": 0,
      "kind": "static"
    },
    {
      "function": "module_tick",
      "frameBytes": 12,
      "kind": "dynamic,bounded"
    },
    {
      "function": "psl_native_cursor",
      "frameBytes": 0,
      "kind": "static"
    },
    {
      "function": "psl_native_set_cursor",
      "frameBytes": 0,
      "kind": "static"
    },
    {
      "function": "move",
      "frameBytes": 20,
      "kind": "dynamic,bounded"
    },
    {
      "function": "module_enc",
      "frameBytes": 16,
      "kind": "dynamic,bounded"
    },
    {
      "function": "psl_native_close_popup",
      "frameBytes": 0,
      "kind": "static"
    },
    {
      "function": "psl_native_redraw",
      "frameBytes": 0,
      "kind": "static"
    },
    {
      "function": "psl_native_text",
      "frameBytes": 60,
      "kind": "dynamic,bounded"
    },
    {
      "function": "psl_native_part_menu_draw",
      "frameBytes": 96,
      "kind": "dynamic,bounded"
    },
    {
      "function": "module_draw",
      "frameBytes": 116,
      "kind": "dynamic,bounded"
    },
    {
      "function": "psl_native_transport",
      "frameBytes": 0,
      "kind": "static"
    },
    {
      "function": "psl_native_commit",
      "frameBytes": 344,
      "kind": "dynamic,bounded"
    },
    {
      "function": "module_key",
      "frameBytes": 104,
      "kind": "dynamic,bounded"
    },
    {
      "function": "psl_open",
      "frameBytes": 36,
      "kind": "dynamic,bounded"
    }
  ],
  "authoredPaths": {
    "module_key": {
      "authoredOnlyBytes": 500,
      "path": [
        "module_key",
        "psl_native_commit",
        "psl_native_source"
      ]
    },
    "module_draw": {
      "authoredOnlyBytes": 296,
      "path": [
        "module_draw",
        "psl_native_part_menu_draw",
        "psl_font_box",
        "pixel"
      ]
    },
    "module_tick": {
      "authoredOnlyBytes": 16,
      "path": [
        "module_tick",
        "close_view"
      ]
    },
    "module_enc": {
      "authoredOnlyBytes": 44,
      "path": [
        "module_enc",
        "move",
        "psl_native_set_cursor"
      ]
    },
    "psl_open": {
      "authoredOnlyBytes": 40,
      "path": [
        "psl_open",
        "psl_native_popup"
      ]
    }
  },
  "unresolvedEdges": [
    {
      "caller": "psl_native_close_popup",
      "target": "__indirect_call"
    },
    {
      "caller": "psl_native_text",
      "target": "__indirect_call"
    },
    {
      "caller": "psl_native_part_menu_draw",
      "target": "__indirect_call"
    },
    {
      "caller": "psl_native_part_menu_draw",
      "target": "__indirect_call"
    },
    {
      "caller": "psl_native_commit",
      "target": "__indirect_call"
    },
    {
      "caller": "psl_native_commit",
      "target": "__indirect_call"
    },
    {
      "caller": "psl_open",
      "target": "__indirect_call"
    }
  ],
  "scope": "Authored function paths only; 4 bytes per internal return word. Stock callees, base dispatcher, caller, indirect edges and interrupts are excluded.",
  "sourceHashes": {
    "translation.c": "307d7f0d95a8eef8746c069472123555eebd40635e9401c3946e7d51e69113a5",
    "engine.c": "a41ace651c2ff9f72d43e783d6121c64f51fe6d21e49bc60cf3b26a97ebdaa38",
    "engine.h": "d1c067250f8bc555944303fb526cd9ec22c281c0f4773c95ed6fbdd332925ca1",
    "font.c": "63104792b675f7cce15582b554eaf4b05e008a63c2433db7fecb71210e115079",
    "font.h": "a94a3103633a0084e11d53fbe46d0590812011062aa01d2c28de35b60ef8ea99",
    "ui.c": "3d452769338be043c327ab6bf0a8db9b09c0c7504f62710c46d32d205a75f4c7",
    "ui.h": "514cbdcfd88777769e4883d020d7fe6a2b5301a5d04c136eb67f7b7bb54f45bd",
    "native.c": "a5d11e7320a91b00457fbe1f89453e8a432e65877e92af0aa64705f6b2a6050e"
  },
  "hardwareAccess": false,
  "toolchainNetworkAccess": false
}
```

## Base dispatcher and combined callback paths

```json
{
  "baseIdentity": "9680e9ac861ff9313ce4f7a710a37ad2aa8e9b50b2cf8c043dafa2a0b78cdffc",
  "baseRunSha256": "fbd83ae4faebd915bbecab9b1af5b635e4092493a1f63ca2a7e82d4f374f15d8",
  "baseMainSha256": "877a8d6884cb05508a59b312a0e95498c33ce4a1e2f1fe452423b0edc74fb69e",
  "stockMainSha256": "164f31224bf61181e3f50e7dec40df9afcae5b16dbf6e4c0d0cc5e986af0a84e",
  "candidatePackageSha256": "3e13c46fb0054d05f228b045746453e0c50dbbe52fb53b3c229d598ddd7fed79",
  "sourceRevision": "5a15ac390dac2475df3fb3b2ef64154e174b4182",
  "eventTableMembershipVerified": true,
  "inspectedInstructionAssertions": 26,
  "paths": {
    "key": {
      "busBytes": 20,
      "runtimeDispatcherBytes": 28,
      "authoredBytes": 500,
      "subtotalBytes": 548
    },
    "draw": {
      "busBytes": 12,
      "runtimeDispatcherBytes": 20,
      "authoredBytes": 296,
      "subtotalBytes": 328
    },
    "enc": {
      "busBytes": 20,
      "runtimeDispatcherBytes": 28,
      "authoredBytes": 44,
      "subtotalBytes": 92
    },
    "tick": {
      "busBytes": 8,
      "runtimeDispatcherBytes": 32,
      "authoredBytes": 16,
      "subtotalBytes": 56
    }
  },
  "method": "Reconstructed the base run from the private build, verified its hash against the build proof, checked event tables and disassembled dispatch frames and outgoing arguments. Adds the existing authored-only GCC bound. The subtotal starts at each core event entry and excludes its incoming return address.",
  "stockCallEntries": "Six distinct stock entry points have their first 32 bytes equal in stock and base; whole callees and transitive calls were not bounded.",
  "limitations": "Subtotals exclude the stock caller and initial event-entry return address, stock and indirect callees, interrupt nesting, other task contexts and any complete high-water/canary measurement. They are not full-system stack bounds.",
  "hardwareAccess": false,
  "drawIncludingStockFontCalls": {
    "callbackBoundBytes": 296,
    "path": [
      "module_draw",
      "psl_native_part_menu_draw",
      "psl_font_box",
      "pixel"
    ],
    "eventEntrySubtotalBytes": 328,
    "resolvedIndirectCalls": [
      "fontDraw",
      "fontMeasure"
    ],
    "conditions": "Exact candidate and unmodified current-base stock font ranges; excludes the stock compositor and event entry return address, interrupts and changes by other modules."
  },
  "callbacksIncludingTracedStock": {
    "paths": {
      "key": {
        "callbackBoundBytes": 760,
        "eventEntrySubtotalBytes": 808,
        "path": [
          "module_key",
          "psl_native_commit",
          "stock:trackRefresh"
        ]
      },
      "draw": {
        "callbackBoundBytes": 296,
        "eventEntrySubtotalBytes": 328,
        "path": [
          "module_draw",
          "psl_native_part_menu_draw",
          "psl_font_box",
          "pixel"
        ]
      },
      "enc": {
        "callbackBoundBytes": 44,
        "eventEntrySubtotalBytes": 92,
        "path": [
          "module_enc",
          "move",
          "psl_native_set_cursor"
        ]
      },
      "tick": {
        "callbackBoundBytes": 16,
        "eventEntrySubtotalBytes": 56,
        "path": [
          "module_tick",
          "close_view"
        ]
      }
    },
    "conditions": "Exact candidate and current-base stock call ranges; assumes no other module patches those ranges. Excludes stock event caller and incoming event return word, interrupts, exceptional paths, and the separate popup opener."
  }
}
```

## Stock leaf routines

```json
{
  "baseIdentity": "9680e9ac861ff9313ce4f7a710a37ad2aa8e9b50b2cf8c043dafa2a0b78cdffc",
  "stockMainSha256": "164f31224bf61181e3f50e7dec40df9afcae5b16dbf6e4c0d0cc5e986af0a84e",
  "baseMainSha256": "877a8d6884cb05508a59b312a0e95498c33ce4a1e2f1fe452423b0edc74fb69e",
  "toolchainImage": "sha256:da70d46e10b243277fa3ae2e015f7258d56b3ee08ca4be47e61899958872e792",
  "method": "Linear MCF54455 disassembly from each entry through its return; every branch target must be a decoded instruction within the range, no calls or indirect jumps, and all stack-pointer changes must match the audited prologue and epilogue. Full range must match stock and the reproduced base.",
  "functions": [
    {
      "function": "fontDraw",
      "start": "0x40012bd8",
      "endExclusive": "0x40012db6",
      "codeBytes": 478,
      "stockAndBaseMatch": true,
      "codeSha256": "c67733c0d4e2be16885d7b71df4890f6e295107c61573736d808cf4e41ded7b5",
      "instructions": 168,
      "localBranches": 28,
      "directAndIndirectCalls": 0,
      "localStackBytes": 64,
      "returnAddressExcluded": true
    },
    {
      "function": "fontMeasure",
      "start": "0x40012f30",
      "endExclusive": "0x40012f88",
      "codeBytes": 88,
      "stockAndBaseMatch": true,
      "codeSha256": "a30c2f017acd2217e8462050bef0f78eaec994143c6f84d80b7c8111472b86d7",
      "instructions": 36,
      "localBranches": 10,
      "directAndIndirectCalls": 0,
      "localStackBytes": 8,
      "returnAddressExcluded": true
    },
    {
      "function": "refreshGlobal",
      "start": "0x40027e00",
      "endExclusive": "0x40027e1c",
      "codeBytes": 28,
      "stockAndBaseMatch": true,
      "codeSha256": "512af4e13792c62d2498443953eb8ab994c5d606be7c165a934542ae403dc6c0",
      "instructions": 9,
      "localBranches": 2,
      "directAndIndirectCalls": 0,
      "localStackBytes": 0,
      "returnAddressExcluded": true
    }
  ],
  "limitations": "Local function storage only; excludes the caller, return address, interrupt nesting, unknown memory faults and live patches by other modules. Remaining stock callees, stock caller, dispatcher context and total stack are not bounded.",
  "hardwareAccess": false
}
```

## Popup close call path

```json
{
  "baseIdentity": "9680e9ac861ff9313ce4f7a710a37ad2aa8e9b50b2cf8c043dafa2a0b78cdffc",
  "stockMainSha256": "164f31224bf61181e3f50e7dec40df9afcae5b16dbf6e4c0d0cc5e986af0a84e",
  "baseMainSha256": "877a8d6884cb05508a59b312a0e95498c33ce4a1e2f1fe452423b0edc74fb69e",
  "verifiedStockLeaves": [
    {
      "start": "0x40011774",
      "endExclusive": "0x400117b2",
      "codeSha256": "d08fdf317282106812a06a27866f7b26a818840ec4542f7bd81bdedc7ef1e1c4",
      "localStackBytes": 0,
      "calls": 0,
      "branchesLocal": true
    },
    {
      "start": "0x4001175c",
      "endExclusive": "0x40011774",
      "codeSha256": "de781c7fdc410e6844a15aaa3eaa3581fffb1c3bbe752dcc2542a9aae6dcd1cf",
      "localStackBytes": 0,
      "calls": 0,
      "branchesLocal": true
    },
    {
      "start": "0x4003125c",
      "endExclusive": "0x4003146a",
      "codeSha256": "a8748527dbe408bc83c31f8cac00a6b43e24256bf10cfc2271266499b02b5160",
      "localStackBytes": 24,
      "calls": 0,
      "branchesLocal": true
    }
  ],
  "wrapperRanges": [
    {
      "start": "0x4006d754",
      "endExclusive": "0x4006d780",
      "codeSha256": "ff3f7e32a0578c80e17e6c39d168db46f9163ddca3ce2f92ee4cfd034476f095"
    },
    {
      "start": "0x40055db4",
      "endExclusive": "0x40055dde",
      "codeSha256": "efda0ed6e513b7965a9d25c651ce04b5c4eaeead035d9a01a7baa1fa953acc73"
    },
    {
      "start": "0x4003146c",
      "endExclusive": "0x40031494",
      "codeSha256": "5fc3d807c4d9a85f6eba1a5e2f7989e7647de220a833d8d5d7a379f226934068"
    }
  ],
  "localStackUpperBytes": 36,
  "excludesIncomingReturnWord": true,
  "calculation": "Close routine holds two 4-byte arguments, calls the list routine (4-byte return), and tail-branches into its 24-byte leaf: 8 + 4 + 24 = 36 bytes. The other branch peaks at 24 bytes.",
  "conditions": "Full inspected ranges match stock and the reproduced base. Other live modules must not patch these ranges. Linked-list data may affect execution time, not the stated stack depth.",
  "limitations": "Popup close call subtree only. Excludes caller, incoming return word, interrupts and all other stock paths; no complete memory or cycle qualification.",
  "hardwareAccess": false
}
```

## Bounded stock switch

```json
{
  "baseIdentity": "9680e9ac861ff9313ce4f7a710a37ad2aa8e9b50b2cf8c043dafa2a0b78cdffc",
  "baseMainSha256": "877a8d6884cb05508a59b312a0e95498c33ce4a1e2f1fe452423b0edc74fb69e",
  "stockMainSha256": "164f31224bf61181e3f50e7dec40df9afcae5b16dbf6e4c0d0cc5e986af0a84e",
  "entry": "0x400a5164",
  "endExclusive": "0x400a536a",
  "codeAndTableSha256": "34c9d190e932408db0517700111e4ef8e703679922816ee8b611fd379d74b942",
  "localStackBytes": 8,
  "excludesIncomingReturnWord": true,
  "jumpTableEntries": 64,
  "distinctTargets": 16,
  "reachableInstructions": 124,
  "otherIndirectTransfers": 0,
  "calls": 0,
  "method": "Verify the entry comparison bounds the index to 0..63; enumerate targets from the private source image and disassemble from each target, then follow both sides of every branch and verify that each target decodes. No extracted table values or firmware bytes are recorded. Check stack-pointer mutations and compare the entire range in the stock and reproduced-base images.",
  "conditions": "Exact base with no additional live patch in the inspected range.",
  "limitations": "One stock helper only. It does not bound its callers, exception/interrupt nesting, or execution cycles.",
  "hardwareAccess": false
}
```

## Track refresh call path

The private analyzer and its synthetic check have SHA-256
`11c7d938068dec18d97d9aecf46651b1b11e202ab9499a9d497633a04abe139e` and
`a679d8327a39fd90d9b43ddfeba61e2d1a00722d74b2c5e5de4656dd47dcbea6`,
respectively. Six synthetic cases passed: nested-call and argument accounting,
both branch paths, and refusal of unbalanced returns, unknown calls, unknown
instructions and a stack-growing loop. These checks do not establish the
completeness of the stock disassembly or the system stack bound.

```json
{
  "baseIdentity": "9680e9ac861ff9313ce4f7a710a37ad2aa8e9b50b2cf8c043dafa2a0b78cdffc",
  "baseMainSha256": "877a8d6884cb05508a59b312a0e95498c33ce4a1e2f1fe452423b0edc74fb69e",
  "stockMainSha256": "164f31224bf61181e3f50e7dec40df9afcae5b16dbf6e4c0d0cc5e986af0a84e",
  "candidatePackageSha256": "3e13c46fb0054d05f228b045746453e0c50dbbe52fb53b3c229d598ddd7fed79",
  "root": "0x4009da20",
  "stockTrackRefreshStackBytes": 304,
  "excludesIncomingReturnWord": true,
  "functions": [
    {
      "entry": "0x40000c3c",
      "endExclusive": "0x40000cd0",
      "rangeSha256": "f46b0aa6938a240518686631688087e5f05e40063aa1689ca027ecf7622d0801",
      "reachableInstructions": 45,
      "states": 45,
      "returnSites": 1,
      "localStackBytes": 4,
      "includingCalleesBytes": 4,
      "directCallees": []
    },
    {
      "entry": "0x400a694c",
      "endExclusive": "0x400a6992",
      "rangeSha256": "b8934a516d920d4704a7abfc64b5395e6394f554c520a1982ca347dc79de2650",
      "reachableInstructions": 28,
      "states": 28,
      "returnSites": 1,
      "localStackBytes": 16,
      "includingCalleesBytes": 16,
      "directCallees": []
    },
    {
      "entry": "0x4009cf4c",
      "endExclusive": "0x4009d1e8",
      "rangeSha256": "822230f16245e42125d3306129cef792ffb1e227cf383974647f8c155f58fe55",
      "reachableInstructions": 208,
      "states": 208,
      "returnSites": 1,
      "localStackBytes": 56,
      "includingCalleesBytes": 68,
      "directCallees": [
        "0x400a5164"
      ]
    },
    {
      "entry": "0x4009d1e8",
      "endExclusive": "0x4009da20",
      "rangeSha256": "f6d3f760cc5cc126c213136365d5960b3d13a00d61ce1350ae58905de89de273",
      "reachableInstructions": 665,
      "states": 665,
      "returnSites": 1,
      "localStackBytes": 120,
      "includingCalleesBytes": 136,
      "directCallees": [
        "0x400a5164",
        "0x400a694c"
      ]
    },
    {
      "entry": "0x4009da20",
      "endExclusive": "0x4009e4c8",
      "rangeSha256": "88c3c923aeace2342d9f85f28624515248782b1c3435de165f58639c9fe85872",
      "reachableInstructions": 839,
      "states": 839,
      "returnSites": 1,
      "localStackBytes": 164,
      "includingCalleesBytes": 304,
      "directCallees": [
        "0x40000c3c",
        "0x4009cf4c",
        "0x4009d1e8"
      ]
    }
  ],
  "knownBoundedSwitchReport": "qualification-progress-20261104.md#bounded-stock-switch",
  "method": "Explore both sides of every decoded conditional branch, tracking exact stack-pointer deltas per path. Resolve every direct call to a separately analyzed callee; account for a four-byte return word. Reject unrecognized instructions, unresolved transfers, unbalanced returns and increasing-depth loops. The bounded switch leaf is audited separately. Every full reachable address range must match stock and the reproduced current base.",
  "conditions": "On the exact current base and candidate with no live patch from another module in the inspected ranges; stock call paths are conservatively combined regardless of input reachability.",
  "limitations": "Excludes the event caller, module and dispatcher frames, interrupts, hardware faults and code patched by other active modules. Stack only; no cycle bound or hardware observation.",
  "hardwareAccess": false
}
```

## Temp Save emulator comparison

```json
{
  "schema": 1,
  "date": "2026-11-04",
  "hardware": false,
  "scope": "MKII emulator, copied card, no DSP execution",
  "baseIdentity": "9680e9ac861ff9313ce4f7a710a37ad2aa8e9b50b2cf8c043dafa2a0b78cdffc",
  "sampleLocksPackageSha256": "3e13c46fb0054d05f228b045746453e0c50dbbe52fb53b3c229d598ddd7fed79",
  "tempSavePackageSha256": "00b8d5ab9bedca2e0d1d02add7540af43ce98cbfc0d8b3c06e40c9b18fe68c4a",
  "emulatorSha256": "b087c97f3031f075551b3336afcd75a407ca4d3476e04a9d5cfaa059b1d40363",
  "fixtureCardSha256": "d64abdaf0f7f957da796f458114396e7df9ef626eb52a89079c922cf98861ab8",
  "helperSha256": "9f21159b753df080479cd55e3f6fd9501887067561e2ff51d0e21b0c5fb8fabb",
  "method": "Install and keep both exact packages on an emulator-only card copy; verify Sample Locks reconstructed image and three sites, and Temp Save hook sites. Save a baseline, change one SAMPLE byte and its mirror as a labelled fixture, then open FUNC+PART. Compare a fresh FUNC+YES followed by another mutation and FUNC+NO with the same sequence after removing Sample Locks. Separately try holding FUNC continuously through opening the menu, navigating to the Sample Locks row, and YES; compare the Temp Save snapshot with the held-through control after removing Sample Locks.",
  "normalGesture": {
    "sampleLocksMenuOpened": true,
    "funcPressRetiredSampleLocksOverlay": true,
    "combinedReloadedChangedValue": true,
    "controlReloadedChangedValue": true
  },
  "heldThroughGesture": {
    "sampleLocksActionOpened": true,
    "combinedReloadedOriginalSnapshot": true,
    "controlReloadedOriginalSnapshot": true
  },
  "cleanup": {
    "sampleLocksRemoved": true,
    "tempSavePatchPreservedUntilRemoval": true,
    "tempSaveRemoved": true
  },
  "attemptNotes": "First attempt failed before boot because the emulator socket was on a shared mount. The first working comparison held FUNC throughout and did not exercise the documented fresh FUNC+YES sequence; a second run added that control.",
  "limitations": "One pattern-byte scenario with a labelled direct emulator fixture. No audio, real-device result, general interaction coverage or hardware qualification is implied."
}
```

## Current-main package and USB preflight

On main `5ceb89bd…`, the normal wrapper and private USB-only catalogue fixture produced the following stock-free receipts. The public catalogue itself was not changed.

### Normal public wrapper

```json
{
  "hardware": false,
  "published": false,
  "privateCatalogueFixtureOnly": true,
  "normalPublicBuildPassed": true,
  "normalPublicCheckPassed": true,
  "bothStockScansPassed": true,
  "usbOnly": true,
  "packageSha256": "3e13c46fb0054d05f228b045746453e0c50dbbe52fb53b3c229d598ddd7fed79",
  "bytes": 10048,
  "byteIdenticalToEmulatorTestedPackage": true,
  "negativeCliChecks": [
    {
      "case": "changed native source, unchanged assembled instructions",
      "refused": true,
      "exitCode": 1
    },
    {
      "case": "protected bootloader source",
      "refused": true,
      "exitCode": 1
    },
    {
      "case": "changed final package pin",
      "refused": true,
      "exitCode": 1
    },
    {
      "case": "foreign source provenance",
      "refused": true,
      "exitCode": 1
    },
    {
      "case": "missing reconstruction opt-in exposes original strict-scan rejection",
      "refused": true,
      "exitCode": 1
    }
  ],
  "testAndDiagnosticEditsRemainIdentical": true,
  "nativeInputsRestoredAfterNegativeProbes": true,
  "helperSha256": "3589a5de5dafb1068733ab1b11c4185896736f0cc3bac8488ae37be80af8e190",
  "inputs": {
    "scripts/octatrack-module-packages.py": "72be304c6b32581e641f6d03c5b35b4d6c37021f6ab5adbe2df9a31e88a8aa82",
    "scripts/octatrack-reconstruction.py": "8718956033e620cfc22d3047b8adbc5708e687133a67ff94e09c5a807fbff3a9",
    "sdk/machines/octatrack/module-adapters/reconstruction-recipes.json": "e4fd34d65e2b8e88695ab7fe2da38d1905773cfe57ee391264c3c8b70a7f8559"
  },
  "limitations": "Private catalogue fixture only; real catalogue and qualification remain unchanged. No device or new runtime claim."
}
```

### USB-only scope and package preflight

```json
{
  "hardware": false,
  "published": false,
  "privateCatalogueFixtureOnly": true,
  "usbOnly": true,
  "cardRefusal": {
    "beta": "Pattern Sample Locks needs the Modwerk base, so card firmware cannot include it. Sync this set over USB, or take it out to build card firmware.",
    "classic": "Pattern Sample Locks needs the Modwerk base, so card firmware cannot include it. Loading the base over USB is in the beta for now; take it out to build card firmware."
  },
  "classicLibraryBlocked": true,
  "betaLibraryAllowsUsbSelection": true,
  "excludedFromCardCompilerVersionsAndSources": true,
  "existingCardSourceFingerprintUnchanged": true,
  "packageSha256": "3e13c46fb0054d05f228b045746453e0c50dbbe52fb53b3c229d598ddd7fed79",
  "byteIdenticalToEmulatorTestedPackage": true,
  "sevenPublicBaseAddAndRemovalUndoPreflights": 7,
  "allPackagesPreflighted": 30,
  "simultaneousRuntimeCompanionsTested": false
}
```


## System task dispatch stack

```json
{
  "baseIdentity": "9680e9ac861ff9313ce4f7a710a37ad2aa8e9b50b2cf8c043dafa2a0b78cdffc",
  "baseMainSha256": "877a8d6884cb05508a59b312a0e95498c33ce4a1e2f1fe452423b0edc74fb69e",
  "candidatePackageSha256": "3e13c46fb0054d05f228b045746453e0c50dbbe52fb53b3c229d598ddd7fed79",
  "taskEntry": "0x40061a94",
  "taskStackSpanBytes": 8192,
  "taskFrameBytes": 96,
  "initializationReachableStates": 136,
  "initializationDepthAtMessageLoopBytes": [
    96
  ],
  "messageLoopReachableStates": 1068,
  "loopReturnDepthsRelativeToLoopEntry": [
    0
  ],
  "switchEntryCounts": [
    78,
    6,
    6
  ],
  "key": {
    "messageArgsAndEventReturnBytes": 12,
    "eventEntryToCallbackBoundBytes": 808,
    "subtotalFromTaskEntryBytes": 916
  },
  "encoder": {
    "messageArgsAndEventReturnBytes": 12,
    "eventEntryToCallbackBoundBytes": 92,
    "subtotalFromTaskEntryBytes": 200
  },
  "tick": {
    "messageArgsAndEventReturnBytes": 4,
    "eventEntryToCallbackBoundBytes": 56,
    "subtotalFromTaskEntryBytes": 156
  },
  "method": "Decode current-base system task from its entry through initialization and the message loop, enumerate three range-checked stock jump tables, follow both branches, and track each stack-pointer adjustment until the message loop resumes. Verify all reached loop returns have zero net stack change. Add previously audited dispatcher, callback and stock-callee bounds. The exact base hash, decoded branch sites and stack deltas were checked. No jump-table contents are recorded.",
  "assumptions": "Called functions preserve the ColdFire ABI stack pointer, and no other module patches the audited task, dispatcher or stock-callee ranges. Assumes normal, non-faulting execution.",
  "limitations": "Subtotals exclude the incoming task-entry return word, interrupt/exception frames and nested handlers, and the separate popup opener. The draw event may run outside the sys task. This is not an overall stack upper bound or a hardware high-water measurement.",
  "hardwareAccess": false
}
```

## Current-base emulator edit matrix

```json
{
  "date": "2026-11-04",
  "hardware": false,
  "scope": "DSP-enabled MKII emulator, playback active during each watched edit, copied private card, main audio disabled",
  "baseIdentity": "9680e9ac861ff9313ce4f7a710a37ad2aa8e9b50b2cf8c043dafa2a0b78cdffc",
  "candidatePackageSha256": "3e13c46fb0054d05f228b045746453e0c50dbbe52fb53b3c229d598ddd7fed79",
  "emulatorSha256": "b087c97f3031f075551b3336afcd75a407ca4d3476e04a9d5cfaa059b1d40363",
  "fixtureCardSha256": "d64abdaf0f7f957da796f458114396e7df9ef626eb52a89079c922cf98861ab8",
  "symbolPackageSha256": "3e13c46fb0054d05f228b045746453e0c50dbbe52fb53b3c229d598ddd7fed79",
  "wrapperSha256": "7cbe0450ac44b552e3fa58816681611dfcd0f92efe62e227e7913d46b7d5d849",
  "sourceHashes": {
    "capture_emulator.py": "bf73e0aee9a34a43b9f840f783edc117328a00e2e8651be85d1637b482bed44e",
    "attestation_emulator.py": "24856c4ca80551313dd78fa4d7ef7d342aa39d2a27c71e6ea78c3952525f34d5",
    "prepare_fixture_emulator.py": "7cc2bfd126fc9ed2380f21653e0b96c34e4104afe1783184c1934a8abc04dd72",
    "profile_symbols.py": "972462022bd9534dc574a0a706976febdd448147079d7c20ca906ca65155f4dc",
    "live_emulator.py": "ba26261794b953152641fc16b53e1dced6ccbd88a7443ba8e99a0bf58102416a",
    "performance_emulator.py": "abf2f0094b48cf021b6c2edb18ecbf8077f38b5be9f9e1324b5e9c65ba38ea9e",
    "profile_emulator.py": "20152342d1dd859b152d3781245783c2dc2c409162b077b5a1d6098832a5944d",
    "stress_emulator.py": "65ad5a1d951cfba71513468855d9e79ea602c8a74226eeea5c52e90cbc693aad",
    "exercise_emulator.py": "fabef3812487f64a9fa59fa25cb44b5b5b214b7dd3898e49569b34791c4a2b30",
    "unit.s": "837e44f48fa137444e14755d96011731c8fde29a73fa877ffc35edac3510473f",
    "engine.c": "a41ace651c2ff9f72d43e783d6121c64f51fe6d21e49bc60cf3b26a97ebdaa38",
    "engine.h": "d1c067250f8bc555944303fb526cd9ec22c281c0f4773c95ed6fbdd332925ca1",
    "ui.c": "3d452769338be043c327ab6bf0a8db9b09c0c7504f62710c46d32d205a75f4c7",
    "ui.h": "514cbdcfd88777769e4883d020d7fe6a2b5301a5d04c136eb67f7b7bb54f45bd",
    "native.c": "a5d11e7320a91b00457fbe1f89453e8a432e65877e92af0aa64705f6b2a6050e",
    "font.c": "63104792b675f7cce15582b554eaf4b05e008a63c2433db7fecb71210e115079",
    "font.h": "a94a3103633a0084e11d53fbe46d0590812011062aa01d2c28de35b60ef8ea99",
    "runtime.json": "710371710bd6c2522067c62f36c6ffbf211232b88c75a71a3dab2ac913e9742e",
    "manifest.py": "ff0d9749fa181a8dabadddc711295a987d58c0d7f3516556aadbae97b6e7d7ab"
  },
  "candidateReconstructionAttested": true,
  "nineStockCopyGuardsVerified": true,
  "nativeSitesAttested": 3,
  "cases": {
    "smallEmpty": {
      "changedLocks": 2,
      "operations": {
        "lock": {
          "commitElapsedInstructions": 9978,
          "maxKeyCallbackElapsedInstructions": 10171,
          "publicationGuards": 2,
          "maxGuardElapsedInstructions": 23,
          "commitPhaseInstructions": {
            "preflightAndValidation": 1448,
            "indexPlanning": 1722,
            "finalRevalidation": 1022,
            "publication": 5561,
            "nativeFollowup": 219,
            "epilogue": 5
          }
        },
        "clear": {
          "commitElapsedInstructions": 34786,
          "maxKeyCallbackElapsedInstructions": 34975,
          "publicationGuards": 2,
          "maxGuardElapsedInstructions": 23,
          "commitPhaseInstructions": {
            "preflightAndValidation": 1448,
            "indexPlanning": 2228,
            "finalRevalidation": 1022,
            "publication": 29863,
            "nativeFollowup": 219,
            "epilogue": 5
          }
        }
      }
    },
    "oneTrackEmpty": {
      "changedLocks": 64,
      "operations": {
        "lock": {
          "commitElapsedInstructions": 38911,
          "maxKeyCallbackElapsedInstructions": 39104,
          "publicationGuards": 64,
          "maxGuardElapsedInstructions": 23,
          "commitPhaseInstructions": {
            "preflightAndValidation": 1448,
            "indexPlanning": 2094,
            "finalRevalidation": 1022,
            "publication": 34122,
            "nativeFollowup": 219,
            "epilogue": 5
          }
        },
        "clear": {
          "commitElapsedInstructions": 55009,
          "maxKeyCallbackElapsedInstructions": 55198,
          "publicationGuards": 64,
          "maxGuardElapsedInstructions": 23,
          "commitPhaseInstructions": {
            "preflightAndValidation": 1448,
            "indexPlanning": 18286,
            "finalRevalidation": 1022,
            "publication": 34028,
            "nativeFollowup": 219,
            "epilogue": 5
          }
        }
      }
    },
    "maximumEmpty": {
      "changedLocks": 512,
      "operations": {
        "lock": {
          "commitElapsedInstructions": 72881,
          "maxKeyCallbackElapsedInstructions": 73074,
          "publicationGuards": 64,
          "maxGuardElapsedInstructions": 86,
          "commitPhaseInstructions": {
            "preflightAndValidation": 6040,
            "indexPlanning": 12020,
            "finalRevalidation": 6741,
            "publication": 46735,
            "nativeFollowup": 1339,
            "epilogue": 5
          }
        },
        "clear": {
          "commitElapsedInstructions": 314125,
          "maxKeyCallbackElapsedInstructions": 314314,
          "publicationGuards": 64,
          "maxGuardElapsedInstructions": 86,
          "commitPhaseInstructions": {
            "preflightAndValidation": 38647,
            "indexPlanning": 246836,
            "finalRevalidation": 6741,
            "publication": 20556,
            "nativeFollowup": 1339,
            "epilogue": 5
          }
        }
      }
    },
    "maximumFirstOtherLock": {
      "changedLocks": 512,
      "operations": {
        "lock": {
          "commitElapsedInstructions": 98863,
          "maxKeyCallbackElapsedInstructions": 99056,
          "publicationGuards": 64,
          "maxGuardElapsedInstructions": 86,
          "commitPhaseInstructions": {
            "preflightAndValidation": 32099,
            "indexPlanning": 12020,
            "finalRevalidation": 6741,
            "publication": 46658,
            "nativeFollowup": 1339,
            "epilogue": 5
          }
        },
        "clear": {
          "commitElapsedInstructions": 110541,
          "maxKeyCallbackElapsedInstructions": 110730,
          "publicationGuards": 64,
          "maxGuardElapsedInstructions": 86,
          "commitPhaseInstructions": {
            "preflightAndValidation": 38556,
            "indexPlanning": 16116,
            "finalRevalidation": 6741,
            "publication": 46836,
            "nativeFollowup": 1339,
            "epilogue": 952
          }
        }
      }
    },
    "maximumLastOtherLock": {
      "changedLocks": 512,
      "operations": {
        "lock": {
          "commitElapsedInstructions": 72899,
          "maxKeyCallbackElapsedInstructions": 73092,
          "publicationGuards": 64,
          "maxGuardElapsedInstructions": 86,
          "commitPhaseInstructions": {
            "preflightAndValidation": 6040,
            "indexPlanning": 12020,
            "finalRevalidation": 32919,
            "publication": 20556,
            "nativeFollowup": 1339,
            "epilogue": 24
          }
        },
        "clear": {
          "commitElapsedInstructions": 305134,
          "maxKeyCallbackElapsedInstructions": 305323,
          "publicationGuards": 64,
          "maxGuardElapsedInstructions": 86,
          "commitPhaseInstructions": {
            "preflightAndValidation": 6040,
            "indexPlanning": 244132,
            "finalRevalidation": 6741,
            "publication": 46876,
            "nativeFollowup": 1339,
            "epilogue": 5
          }
        }
      }
    }
  },
  "patternMirrorAndIndexChecksPassed": true,
  "emulatedDspFramesBefore": 42851,
  "emulatedDspFramesAfter": 97294,
  "dspErrorsBeforeAndAfter": [
    0,
    0
  ],
  "dspStallsBeforeAndAfter": [
    0,
    0
  ],
  "emulatorRemovalPassed": true,
  "limitations": "Observed elapsed emulator instruction counts include intervening interrupts and depend on the fixture and schedule. They are not ColdFire cycles, hardware timings, a universal upper bound, audio evidence or an isolated CPU benchmark."
}
```

## Current-base shared memory layout

```json
{
  "baseIdentity": "9680e9ac861ff9313ce4f7a710a37ad2aa8e9b50b2cf8c043dafa2a0b78cdffc",
  "baseMainSha256": "877a8d6884cb05508a59b312a0e95498c33ce4a1e2f1fe452423b0edc74fb69e",
  "toolchainImage": "sha256:da70d46e10b243277fa3ae2e015f7258d56b3ee08ca4be47e61899958872e792",
  "layoutHelperSha256": "60eb624d6164221186ea416151a9526e89a7c08a56431cadf0759b502f9c72ae",
  "pointerBytes": 4,
  "ownerRecordBytes": 88,
  "candidatePackageBytes": 10048,
  "runtimeExtentComponentsBytes": {
    "initializedCodeAndData": 8748,
    "bss": 1328,
    "runtimeHeader": 528,
    "threeSiteRecords": 216,
    "headerAlignment": 8,
    "imageAlignment": 4
  },
  "oneCandidatePoolExtentBytes": 10832,
  "twoIdenticalCandidateExtentsBytes": 21664,
  "baseRuntimePool": {
    "linkedStart": "0x40d2abf0",
    "linkedEndExclusive": "0x40deabf0",
    "capacityBytes": 786432
  },
  "baseUploadStage": {
    "structStart": "0x40ae3cf0",
    "structEndExclusive": "0x40c23e30",
    "mailboxBytes": 64,
    "stubBytes": 256,
    "imageCapacityBytes": 1310720,
    "volatileFrameReserveBytes": 4096,
    "volatilePayloadCapacityBytes": 1306624
  },
  "baseFixedLedgers": {
    "ownerRecords": 256,
    "ownerRecordsBytes": 22528,
    "ownerPointers": 256,
    "ownerPointersBytes": 1024,
    "livePointers": 128,
    "livePointersBytes": 512
  },
  "method": "Pinned ColdFire compiler measures struct runtime_owner, pointer and boot-stage sizes; exact base symbol map verifies owner-array and pointer-array spacing and identifies pool/stage extents. Loader source supplies alignment and staging formulas.",
  "accounting": "The boot stage and ledger arrays are fixed shared base allocations. The serialized candidate occupies part of the existing shared stage during upload, and its live extent occupies the existing runtime pool; do not add package bytes or the pool twice. Other modules, whole-set staging, stack demand, fragmentation and delayed reclamation determine system-wide peak usage.",
  "limitations": "Source/build layout only; not a device memory readback or complete system memory or stack qualification.",
  "hardwareAccess": false
}
```
