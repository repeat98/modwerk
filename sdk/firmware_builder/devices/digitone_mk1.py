# SPDX-License-Identifier: GPL-3.0-or-later
"""Digitone (mk1) and Digitone Keys, which share one OS file: two ColdFire MCF5441x CPUs, main OS in DDR from
0x40000400.

Seven sections (5, 2, 3 packed, 4, 6, 7, 8), so section data starts at 0xA0; no trailer. The updater stages
section 3 at 0x40200000 and unpacks it over itself, as on the Digitakt mk1, with the same flash limit. Packages run
from 0x47BE0000-0x47C00000, or from core-dn1 4.0 on from 0x43EC0000-0x44000000 (1.25 MB). 'bulk' is DDR no code
names, for large buffers a package claims as regions; the OS never clears it. A parameter slot descriptor in
core_params names its sound slot at +8, which the package then claims (slot_claims). 1.43 and 1.44 share these facts.
"""
from . import Device, Release

DEVICE = Device(
    key='digitone-mk1',
    name='Digitone mk1',
    sysex_id=0x0D,
    releases={
        '1.43': Release(
            version='1.43',
            syx_sha256='c5a54cc05b921f2e4bd814834c5365c2a5aa01d7772a9a2961fac1c3095bf9aa',
            main_sha256='3831a477a2a22befb23c42e47e782853da49566ef5d0a1767fcf6c30e6767414',
            main_len=2732208),
        '1.44': Release(
            version='1.44',
            syx_sha256='d4f200d04484333d82822db7744e6484d0def8f2db8ddf55ee2b780cc13c9659',
            main_sha256='fce648a97c6c5d93b961732e8f8db6b02e0820c6d344c7e2131fa05a4b3168e4',
            main_len=2736304),
    },
    main_section=3,
    main_load=0x40000400,
    stage=0x40200000,
    flash_at=0x80000,
    flash_limit=0x380000,
    trailer=None,
    isa='coldfire',
    areas={
        'ddr': (0x47BE0000, 0x47C00000),          # under the stack's page, above all the OS uses
        'bulk': (0x44000000, 0x47BE0000),         # large buffers, claimed as regions
    },
    ddr=(0x47BE0000, 0x47C00000),
    core_ddr=(('4.0', (0x43EC0000, 0x44000000)),),   # 1.25 MB from core-dn1 4.0
    slot_claims=(('core_params', 8, 79, 'soundslot'),),
    recovery=('hold FUNC while powering on for the startup menu, press TRIG 4 (OS UPGRADE), '
              'then send the stock .syx'),
    toolchain={
        'prefix': 'm68k-linux-gnu-',
        'asflags': ['-mcpu=54455'],
        'cflags': ['-mcpu=54455', '-O2', '-ffreestanding', '-fno-builtin', '-nostdlib',
                   '-fno-pic', '-fno-pie', '-fomit-frame-pointer', '-Wall'],
    },
)
