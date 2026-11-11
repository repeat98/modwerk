| SPDX-License-Identifier: MIT
| Copyright (c) 2026 twwwy
| Test-only caller. The emulator's call command supplies a return address but
| does not reclaim argument slots. Call this fixed code with ZERO debugger
| arguments; mutable data supplies the target and eight argument values.
| This never enters the module package or device build.
        .text
        .global fixture_call
fixture_call:
        move.l %sp,0x4702f140
        move.l 0x4702f120,-(%sp)
        move.l 0x4702f11c,-(%sp)
        move.l 0x4702f118,-(%sp)
        move.l 0x4702f114,-(%sp)
        move.l 0x4702f110,-(%sp)
        move.l 0x4702f10c,-(%sp)
        move.l 0x4702f108,-(%sp)
        move.l 0x4702f104,-(%sp)
        move.l 0x4702f100,%a0
        jsr (%a0)
        lea 32(%sp),%sp
        move.l %sp,0x4702f144
        rts
