# SPDX-License-Identifier: GPL-3.0-or-later
"""Analog Rytm MKII: the Digitakt mk1's ColdFire platform, main OS in DDR from 0x40000400.

Sections 5, 2, 1 (FPGA bitstream), 3 (packed) and 8; no updater section and no trailer. The bootstrap stages
section 3 at 0x40200000. The OS keeps stores from flash 0x300000, so the container must end below it. Packages run
from 0x47BE0000-0x47C00000, the Digitakt mk1's area, checked on a unit with a DDR canary. 1.73 and 1.74 share these
facts.
"""
from . import Device, Release

DEVICE = Device(
    key='analog-rytm-mk2',
    name='Analog Rytm MKII',
    sysex_id=0x0C,
    releases={
        '1.73': Release(
            version='1.73',
            syx_sha256='8ad671087ec30433d5407c7380d2396e0915ab931c5d3dd18a78bf284d3d1e52',
            main_sha256='28d9ef40c895e03f17dfce096543109adaf708947392db72818fc2a412d685d6',
            main_len=3005432),
        '1.74': Release(
            version='1.74',
            syx_sha256='cb0f99d620edde994fb860c0e79cc2464e427d06882828cfdfb00fc53700e123',
            main_sha256='34cd0c4da8e4b810d1b25284475a99ea53821e2ab7d30a978bf15dc578251f3b',
            main_len=3005432),
    },
    main_section=3,
    main_load=0x40000400,
    stage=0x40200000,
    flash_at=0x80000,
    flash_limit=0x300000,                         # the OS's own store begins here
    trailer=None,
    isa='coldfire',
    areas={
        'ddr': (0x47BE0000, 0x47C00000),
    },
    ddr=(0x47BE0000, 0x47C00000),
    recovery=('hold FUNC while powering on for the STARTUP menu, press TRIG 4 (OS UPGRADE), '
              'then send the stock .syx over MIDI DIN (not USB)'),
    toolchain={
        'prefix': 'm68k-linux-gnu-',
        'asflags': ['-mcpu=54455'],
        'cflags': ['-mcpu=54455', '-O2', '-ffreestanding', '-fno-builtin', '-nostdlib',
                   '-fno-pic', '-fno-pie', '-fomit-frame-pointer', '-Wall'],
    },
)
