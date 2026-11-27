# SPDX-License-Identifier: GPL-3.0-or-later
"""Digitakt II: ColdFire MCF5441x (V4m, no FPU), main OS in DDR from 0x40000400.

Sections 5, 2, 3 (main OS, packed, 3,275,616 bytes unpacked on 1.17), 4, 7 (the SHARC program) and 8. The file is
sealed with a 32-byte HMAC-SHA256 after the last section; its key comes from the bootstrap's seed string "Master
Overdrive" (syx.seal_key). The bootstrap stages section 3 at 0x40400000. The OS keeps a store from flash 0x380000,
so the container must end below it. Free at run time: DDR 0x47F00000-0x47F40000 below the boot stack, and two SRAM
tails past what the reset copies; core-dt2 declares the .fast copy table core_fast.
"""
from . import Device, Release

DEVICE = Device(
    key='digitakt-mk2',
    name='Digitakt II',
    sysex_id=0x14,
    releases={
        '1.17': Release(
            version='1.17',
            syx_sha256='26c22f6652625ac2cfd47f7ee970d388ed8b6427dae3563c0a6a2f2d334350d5',
            main_sha256='a1e7b657b705eba1a19d81c33c1e11ba9c409816447ad74005d7bbf36da6d964',
            main_len=3275616)
    },
    main_section=3,
    main_load=0x40000400,
    stage=0x40400000,
    flash_at=0x80000,
    flash_limit=0x380000,
    trailer='hmac',
    hmac_key_from=(2, b'Master Overdrive'),
    isa='coldfire',
    areas={
        'ddr': (0x47F00000, 0x47F40000),          # past the DSP buffers, under the boot stack
        'sram-tail': (0x8000F100, 0x80010000),    # unused end of SRAM
        'sram-block': (0x80006E80, 0x80008000),   # unused end of the first SRAM half
    },
    ddr=(0x47F00000, 0x47F40000),
    sram_code=(0x8000F100, 0x80010000),
    fast_table='core_fast',
    recovery=('hold FUNC while powering on for the STARTUP menu, press TRIG 4 (OS UPGRADE), '
              'then send the stock .syx over MIDI (not USB)'),
    toolchain={
        'prefix': 'm68k-linux-gnu-',
        'asflags': ['-mcpu=54455'],
        'cflags': ['-mcpu=54455', '-O2', '-ffreestanding', '-fno-builtin', '-nostdlib',
                   '-fno-pic', '-fno-pie', '-fomit-frame-pointer', '-Wall'],
    },
)
