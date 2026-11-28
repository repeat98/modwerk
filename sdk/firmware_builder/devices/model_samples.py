# SPDX-License-Identifier: GPL-3.0-or-later
"""Model:Samples: the Model:Cycles platform with its own image (1,733,184 bytes unpacked on 1.13) and seal seed
("DELAY TIME"). It shares the Model:Cycles linker area and SRAM tail; it has no CHORD, so no CHORD areas.
"""
from . import Device, Release
from .model_cycles import DEVICE as _CYCLES

DEVICE = Device(
    key='model-samples',
    name='Model:Samples',
    sysex_id=0x0F,
    releases={
        '1.13': Release(
            version='1.13',
            syx_sha256='e11859b68deb7e5e3fe86ab32581212093849c4be5d3950add011eac398a2ce8',
            main_sha256='a351392c62ec1c6c3324a807baf46934690d54edfc76029a4b4882541cad1ab2',
            main_len=1733184),
    },
    main_section=3,
    main_load=0x40000400,
    stage=0x40200000,
    flash_at=0x20000,
    flash_limit=0x1E0000,
    trailer='hmac',
    hmac_key_from=(2, b'DELAY TIME'),
    isa='coldfire',
    version_at=0x0C,
    version_optional=True,
    areas={name: span for name, span in _CYCLES.areas.items() if not name.startswith('sram-chord')},
    ddr=_CYCLES.ddr,
    recovery=_CYCLES.recovery,
    toolchain=_CYCLES.toolchain,
)
