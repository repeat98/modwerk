# SPDX-License-Identifier: GPL-3.0-or-later
"""Octatrack (MKI and MKII, one 1.40C file): ColdFire MCF5445x (V4e, EMAC) and a DSP56721; main OS in SDRAM from
0x40000400.

The 'elek' family (elek.py): one ELEK container with a single packed section, the legacy SysEx transport, and the
ELUP card file. The bootloader is in NOR flash and never in an OS file; the OS carries a copy to re-flash it from,
so the 16 KB below 0x400e21e0 are protected. The USB device descriptor at the top of that range is reached through
one operand only and never written, so a package may serve its own copy (relocatable). Where the bootloader unpacks
from is unknown, so no in-place simulation (stage None). The container is programmed from flash 0x4000 up to
0x200000. The audio page arena gets the whole free SDRAM; the core takes its bottom pages (at most 1,707 of 6,144
bytes) and moves the arena base past what the packages use (reserve). image_free lists unused zero runs in the
image. Two DSP payloads are uploaded at boot; SPATIALIZER's code on payload A is the one DSP area, freed by claiming
'dsp:harvest:SPATIALIZER'.
"""
from . import Device, Release

DEVICE = Device(
    key='octatrack',
    name='Octatrack',
    sysex_id=0x05,
    releases={
        '1.40C': Release(
            version='1.40C',
            syx_sha256='0a8d2d2b35c2cc78fa338576adc1af0cbc094cef973255103165c73edd87f2b6',
            main_sha256='164f31224bf61181e3f50e7dec40df9afcae5b16dbf6e4c0d0cc5e986af0a84e',
            main_len=1112560,
            bin_sha256='34695b606eb00e1b4dded5fd0c4b66f3a460522a632e47d7416dbd220599e1ad'),
    },
    main_section=3,
    main_load=0x40000400,
    stage=None,
    flash_at=0x4000,
    flash_limit=0x200000,
    trailer=None,
    isa='coldfire',
    container='elek',
    version_len=10,
    protected=((0x400de1e0, 0x400e21e0,
                'the copy of the bootloader the OS can re-flash it from'),),
    relocatable=((0x400e2000, 18, (0x4001d82e,), 'the USB device descriptor'),),
    blob_max=None,
    areas={
        'ddr': (0x40A955E0, 0x41495DE0),          # the arena's bottom pages, at most 1,707
    },
    ddr=(0x40A955E0, 0x41495DE0),
    image_free=((0x400C45B0, 0x400C4702), (0x400D24D0, 0x400D2CE0), (0x400D64E0, 0x400D7C3C)),
    reserve=(6144, {'arena_base': (0x40A955E0, 6144), '__arena_pages': (14602, -1),
                    '__arena_fill': (14603, -1), '__arena_clear': (0x05590800, -6144)}),
    dsp_payloads={'A': (0x400E2324, 0x136CB), 'B': (0x400F59EF, 0x12D05)},
    dsp_areas=(('A', 0x0AA8, 0x0BAD, 'dsp:harvest:SPATIALIZER',
                "SPATIALIZER's code on payload A (core 0)"),),
    recovery=('hold FUNC while powering on for the startup menu, press TRIG 3 (MIDI '
              'UPGRADE) and send the stock .syx over 5-pin MIDI (not USB)'),
    toolchain={
        'prefix': 'm68k-linux-gnu-',
        'asflags': ['-mcpu=54455'],
        'cflags': ['-mcpu=54455', '-O2', '-ffreestanding', '-fno-builtin', '-nostdlib',
                   '-fno-pic', '-fno-pie', '-fomit-frame-pointer', '-Wall'],
    },
)
