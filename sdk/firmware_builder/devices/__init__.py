# SPDX-License-Identifier: GPL-3.0-or-later
"""Device profiles: what the builder knows about each supported instrument.

A profile lists the stock OS releases it accepts, recognised by SHA-256 rather than by file name, and the firmware
facts every later stage relies on: how the OS file stores its main OS (section id, load address, packing, trailer),
where the bootloader stages that section before unpacking it in place, how much flash the container may take, which
instruction decoder checks code sites, which memory is free at run time and where the linker lays packages out.

Each device has a module here defining DEVICE; _load() lists them in their fixed order.
"""
from dataclasses import dataclass, field


class UnknownFirmware(ValueError):
    pass


@dataclass(frozen=True)
class Release:
    version: str                 # the OS version as the maker names it
    syx_sha256: str              # the stock .syx
    main_sha256: str             # its main OS section, unpacked
    main_len: int                # and that section's length in bytes
    bin_sha256: str = ''         # the stock card file (.bin) on devices that have one


@dataclass
class Device:
    key: str                     # short id, e.g. 'digitakt-mk1'
    name: str                    # what a person reads, e.g. 'Digitakt mk1'
    sysex_id: int                # the device byte of its SysEx messages
    releases: dict               # version -> Release
    main_section: int            # the container's main OS section id
    main_load: int               # the main OS's run address
    stage: int                   # where the bootloader stages the packed main OS; None when unknown (no simulation)
    flash_at: int                # flash address of the container's first byte
    flash_limit: int             # the container must end below this
    trailer: str                 # None, or 'hmac' for a sealed file (syx.seal_key)
    isa: str                     # the CPU's instruction set: 'coldfire'
    hmac_key_from: tuple = ()    # for 'hmac': (section id, seed string), the key comes from the stock file itself
    container: str = 'ele3'      # the file family: 'ele3' (syx.py) or 'elek' (elek.py)
    version_len: int = 4         # characters of the version field the unit displays
    version_at: int = 0x14       # 'ele3': the version field's offset in the container header
    version_optional: bool = False   # a build given no version keeps the stock field
    protected: tuple = ()        # ((lo, hi, why), ...): main OS bytes no package may change
    relocatable: tuple = ()      # ((lo, n, (ref, ...), what), ...): read-only data in a protected range, reached only
                                 # through the 4-byte operands at the refs, which a package may point at its own copy
    blob_max: int = None         # most bytes a whole build may append (None: the flash budget decides)
    areas: dict = field(default_factory=dict)   # name -> (lo, hi): memory free at run time
    ddr: tuple = (0, 0)          # the linker's area for .run, tables and .bss
    core_ddr: tuple = ()         # ((core version, (lo, hi)), ...): from that core on, this area instead of ddr
    slot_claims: tuple = ()      # ((table, at, count, prefix), ...): entries of `table` point at a descriptor whose
                                 # long at +at is a sound slot below count; the package claims 'prefix:<slot>'
    sram_code: tuple = (0, 0)    # the linker's area for .fast code
    fast_table: str = ''         # the copy table .fast sections go through
    image_free: tuple = ()       # ((lo, hi), ...): zero runs inside the main OS that fixed code may use
    reserve: tuple = ()          # (unit, {name: (a, b)}): a core sizing its RAM reserve gets name = a + b*n (32-bit),
                                 # n being the units the packages' RAM fills, at least 1
    dsp_payloads: dict = field(default_factory=dict)   # tag -> (address, length) of DSP code the main OS uploads
    dsp_areas: tuple = ()        # ((tag, lo, hi, name, what), ...): P words of a payload freed by claiming `name`
    recovery: str = ''           # how a person gets back to stock
    toolchain: dict = field(default_factory=dict)   # SDK compiler settings: prefix, asflags, cflags
    notes: str = ''

    def release_for(self, syx_sha256=None, main_sha256=None):
        """The release whose stock file (or card file) or main OS has this hash, else None."""
        for release in self.releases.values():
            if syx_sha256 and syx_sha256 in (release.syx_sha256, release.bin_sha256):
                return release
            if main_sha256 and release.main_sha256 == main_sha256:
                return release
        return None

    def linkable(self):
        """True when the device has a linker area, i.e. format-2 packages exist for it."""
        lo, hi = self.ddr
        return hi > lo

    def ddr_for(self, core_version):
        """The linker's RAM area for a core of this version: the last core_ddr entry it reaches, else ddr."""
        from ..elemod import version_key
        have = version_key(core_version)
        chosen = self.ddr
        for since, span in self.core_ddr:
            if have >= version_key(since):
                chosen = span
        return chosen

    def image_end(self, release):
        """The address right after the stock main OS: where an appended blob loads."""
        return self.main_load + release.main_len

    def decoder(self):
        if self.isa != 'coldfire':
            raise UnknownFirmware('no instruction decoder for %s' % self.isa)
        from ..isa import coldfire
        return coldfire


DEVICES = None


def _load():
    from . import (analog_four_mk2, analog_rytm_mk2, digitakt_mk1, digitakt_mk2, digitone_mk1, model_cycles,
                   model_samples, octatrack)
    order = (digitakt_mk1, digitakt_mk2, digitone_mk1, octatrack, model_cycles, model_samples, analog_rytm_mk2,
             analog_four_mk2)
    return [module.DEVICE for module in order]


def devices():
    """Every profile, loaded once, in a fixed order."""
    global DEVICES
    if DEVICES is None:
        DEVICES = _load()
    return DEVICES


def version_at(sysex_id):
    """The version field's offset in an 'ele3' header for this device byte (0x14 when no profile matches)."""
    match = next((d for d in devices() if d.container == 'ele3' and d.sysex_id == sysex_id), None)
    return match.version_at if match else 0x14


def supported():
    return ', '.join('%s %s' % (d.name, version) for d in devices() for version in d.releases)


def identify(syx_sha256):
    """A stock file's SHA-256 -> (Device, Release)."""
    for device in devices():
        release = device.release_for(syx_sha256=syx_sha256)
        if release:
            return device, release
    raise UnknownFirmware('not a stock firmware the builder knows (sha256 %s). Supported: %s'
                          % (syx_sha256, supported()))


def for_target(target):
    """A package's "target" object -> (Device, Release)."""
    if not isinstance(target, dict):
        raise UnknownFirmware('no target')
    wanted = target.get('device')
    for device in devices():
        if wanted and device.key != wanted:
            continue
        release = device.release_for(syx_sha256=target.get('syx_sha256'))
        if not release:
            continue
        if (release.main_sha256 == target.get('section3_sha256', release.main_sha256)
                and release.main_len == target.get('section3_len', release.main_len)):
            return device, release
    raise UnknownFirmware('made for a firmware the builder does not know (%s %s)'
                          % (target.get('product', '?'), target.get('os', '?')))


def target_of(device, release):
    """The "target" object a package for this release carries."""
    return {'device': device.key, 'product': device.name, 'os': release.version,
            'syx_sha256': release.syx_sha256, 'section3_sha256': release.main_sha256,
            'section3_len': release.main_len}
