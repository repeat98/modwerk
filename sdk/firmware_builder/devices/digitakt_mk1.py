# SPDX-License-Identifier: GPL-3.0-or-later
"""Digitakt (mk1): ColdFire MCF54418, main OS in DDR from 0x40000400.

Sections 5, 2 (bootstrap), 3 (main OS, packed), 4 (updater) and 8; no trailer. The bootstrap stages section 3 at
0x40200000 and unpacks it over itself to the load address. Packages run from DDR 0x47BE0000-0x47C00000, below the
audio input ring, or from core 4.0 on from the whole gap 0x47BC0000-0x47C00000 above the sample pool; two SRAM
ranges the OS zeroes and never uses are free as well. OS 1.53 and 1.54 share every one of these facts.
"""
from . import Device, Release

DEVICE = Device(
    key='digitakt-mk1',
    name='Digitakt mk1',
    sysex_id=0x0A,
    releases={
        '1.53': Release(
            version='1.53',
            syx_sha256='9bdd44bb6102fb25c143cfab97bc92b7a89c463f795d3112dce89771e29bcc92',
            main_sha256='4b47a9507758ca5669ca02ab2c0374d2c04c98aece445408295cc1dcb265c5df',
            main_len=2475584),
        '1.54': Release(
            version='1.54',
            syx_sha256='f78ba80fa7b1da5fb0e1ff61ad61e9e71aafe79f4364fc49679f3651353e3cf6',
            main_sha256='5c58bf9e3949ef09977c5fc007a61e8d026931f67f1621238379dfb8ee4d31a2',
            main_len=2479680),
    },
    main_section=3,
    main_load=0x40000400,
    stage=0x40200000,
    flash_at=0x80000,
    flash_limit=0x380000,
    trailer=None,
    isa='coldfire',
    areas={
        'ddr': (0x47BE0000, 0x47C00000),          # under the audio DMA ring
        'sram-tail': (0x8000F700, 0x80010000),    # unused end of SRAM
        'sram-block': (0x80003360, 0x80008000),   # unused SRAM block
    },
    ddr=(0x47BE0000, 0x47C00000),
    core_ddr=(('4.0', (0x47BC0000, 0x47C00000)),),   # 256 KB from core 4.0
    sram_code=(0x8000F700, 0x80010000),
    fast_table='fa_copies',
    recovery='hold FUNC while powering on for the startup menu, then send the stock .syx',
    toolchain={
        'prefix': 'm68k-linux-gnu-',
        'asflags': ['-mcpu=54455'],
        'cflags': ['-mcpu=54455', '-O2', '-ffreestanding', '-fno-builtin', '-nostdlib',
                   '-fno-pic', '-fno-pie', '-fomit-frame-pointer', '-Wall'],
    },
)
