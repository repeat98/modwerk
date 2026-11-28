# SPDX-License-Identifier: GPL-3.0-or-later
"""Model:Cycles: ColdFire MCF54415 (V4m, EMAC, no FPU), main OS in DDR from 0x40000400.

Sections 5, 2, 3 (packed, 1,744,192 bytes unpacked on 1.13) and 4 (raw). Sealed like the Digitakt II, the key's
seed being "REVERB SEND". The version the unit shows is the header's field at 0x0C. The container starts at flash
0x20000 and must end below the OS's stores at 0x1E0000; section 3 is staged at 0x40200000. Packages run from DDR
0x47E00000-0x47E40000. The SRAM tail is free; the two 'sram-chord' areas hold CHORD's wavetables, free only to a
package that serves CHORD its tables from elsewhere.
"""
from . import Device, Release

DEVICE = Device(
    key='model-cycles',
    name='Model:Cycles',
    sysex_id=0x11,
    releases={
        '1.13': Release(
            version='1.13',
            syx_sha256='44fe586269631a0ca7da25a3383fc6733c314809505fc3cc52f1e0ed9800640c',
            main_sha256='cc99d4f0175d34d1e91d046e6ec85a5e8ab58ab9edbb3c24406acd48cb99ee98',
            main_len=1744192),
    },
    main_section=3,
    main_load=0x40000400,
    stage=0x40200000,
    flash_at=0x20000,
    flash_limit=0x1E0000,
    trailer='hmac',
    hmac_key_from=(2, b'REVERB SEND'),
    isa='coldfire',
    version_at=0x0C,
    version_optional=True,
    areas={
        'ddr': (0x47E00000, 0x47E40000),          # above every buffer, under the boot stack
        'sram-tail': (0x8000F700, 0x80010000),    # zeroed at reset, unused
        'sram-chord-a': (0x80001C5C, 0x800074B4),  # CHORD's wavetables
        'sram-chord-b': (0x8000CAC0, 0x8000EAE0),
    },
    ddr=(0x47E00000, 0x47E40000),
    recovery=('hold FUNC while powering on for the STARTUP MENU, press TRIG 4 (OS UPGRADE), '
              'then send the stock .syx over 5-pin MIDI (not USB)'),
    toolchain={
        'prefix': 'm68k-elf-',
        'asflags': ['-mcpu=54418'],
        'cflags': ['-mcpu=54418', '-O2', '-ffreestanding', '-fno-builtin', '-nostdlib',
                   '-fno-pic', '-fno-pie', '-fomit-frame-pointer', '-Wall'],
    },
)
