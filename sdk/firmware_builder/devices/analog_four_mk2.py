# SPDX-License-Identifier: GPL-3.0-or-later
"""Analog Four MKII: the Analog Rytm MKII's platform, main OS in DDR from 0x40000400.

Sections 5, 2, 1 (FPGA bitstream), 3 (packed) and 8; no updater and no trailer. The bootstrap stages section 3 at
0x40200000. The voice calibration record sits at flash 0x300000, so the container must end below it. Packages run
from 0x47BE0000-0x47C00000, checked in an emulator and with a DDR canary on a unit.
"""
from . import Device, Release

DEVICE = Device(
    key='analog-four-mk2',
    name='Analog Four MKII',
    sysex_id=0x0B,
    releases={
        '1.56': Release(
            version='1.56',
            syx_sha256='5aea489db3e747547f71d5e08a2d20253149fe6258defad60306402d2fc23cb5',
            main_sha256='748fec15ddc61bc3ff66047facba74328934c5fb59f427ddaf34a4e2629a474c',
            main_len=2500408),
    },
    main_section=3,
    main_load=0x40000400,
    stage=0x40200000,
    flash_at=0x80000,
    flash_limit=0x300000,                         # the calibration record begins here
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
