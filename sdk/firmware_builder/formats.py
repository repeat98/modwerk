# SPDX-License-Identifier: GPL-3.0-or-later
"""One interface over the OS file families a device profile names (`Device.container`): 'ele3' (syx.py) and
'elek' (elek.py, the Octatrack's SysEx and card files).

    stock, dev, rel = load(path)            # a stock file, or the maker's zip of it, recognised by hash
    built = parse(path, dev)                # any file of that device's family
    image = main_image(stock, dev)
    outputs = write(stock, stored_main, dev, version)   # {'syx': ...} or {'syx': ..., 'bin': ...}
    facts = verify(outputs, stock, want_main, dev, version)
"""
import hashlib
import io
import zipfile

from . import devices, elek, syx

MAX_ZIP_MEMBER = 64 << 20


class FormatError(ValueError):
    pass


def _read(path_or_bytes):
    if isinstance(path_or_bytes, (bytes, bytearray)):
        return bytes(path_or_bytes)
    with open(path_or_bytes, 'rb') as fh:
        return fh.read()


def parse(path_or_bytes, dev):
    """A file of `dev`'s family -> syx.Syx or elek.ElekFile."""
    raw = _read(path_or_bytes)
    readers = {'ele3': syx.Syx, 'elek': elek.ElekFile}
    reader = readers.get(dev.container)
    if reader is None:
        raise FormatError('%s: no reader for the %s family' % (dev.name, dev.container))
    try:
        return reader(raw)
    except (syx.SyxError, elek.ElekError) as e:
        raise FormatError(str(e))


def _from_zip(raw):
    """The known stock OS file inside a zip as the maker publishes it, a .syx before a .bin. -> its bytes."""
    try:
        archive = zipfile.ZipFile(io.BytesIO(raw))
        members = sorted((info for info in archive.infolist()
                          if not info.is_dir() and info.file_size <= MAX_ZIP_MEMBER
                          and info.filename.lower().endswith(('.syx', '.bin'))),
                         key=lambda info: (not info.filename.lower().endswith('.syx'), info.filename))
        for info in members:
            data = archive.read(info)
            try:
                devices.identify(hashlib.sha256(data).hexdigest())
            except devices.UnknownFirmware:
                continue
            return data
    except (zipfile.BadZipFile, OSError, RuntimeError) as e:
        raise FormatError('the zip cannot be read: %s' % e)
    raise devices.UnknownFirmware(
        'the zip holds no stock firmware the builder knows (%s). Supported: %s'
        % (', '.join(info.filename for info in members) or 'no .syx or .bin file', devices.supported()))


def load(path_or_bytes):
    """A stock OS file (or a zip holding one) -> (parsed, Device, Release), recognised by its SHA-256."""
    raw = _read(path_or_bytes)
    if raw[:4] == b'PK\x03\x04':
        raw = _from_zip(raw)
    dev, rel = devices.identify(hashlib.sha256(raw).hexdigest())
    return parse(raw, dev), dev, rel


def main_image(parsed, dev):
    return parsed.section(dev.main_section)


def check_version(dev, version):
    """Refuse a version the device's field cannot show."""
    if version is None:
        return
    text = version.encode('ascii', 'replace')
    if dev.container == 'ele3' and len(text) != dev.version_len:
        raise FormatError('the version is exactly %d ASCII characters' % dev.version_len)
    if not 0 < len(text) <= dev.version_len:
        raise FormatError('the version is 1 to %d ASCII characters' % dev.version_len)


def pack_main(image, dev):
    """A main OS image -> its stored section in `dev`'s family."""
    return syx.pack_main(image) if dev.container == 'ele3' else elek.pack_main(image)


def write(stock, stored_main, dev, version=None):
    """-> {'syx': bytes}, plus 'bin' for a family with a card file."""
    check_version(dev, version)
    try:
        if dev.container == 'ele3':
            return {'syx': syx.write(stock, stored_main, dev, version)}
        return elek.write(stock, stored_main, dev, version)
    except (syx.SyxError, elek.ElekError) as e:
        raise FormatError(str(e))


def verify(outputs, stock, want_main, dev, version=None):
    """Read every output back with the decoder and refuse it unless only the main OS (and the version field)
    changed and the protected ranges are stock's. -> facts."""
    stock_main = main_image(stock, dev)
    try:
        if dev.container == 'ele3':
            facts = syx.verify(outputs['syx'], stock, want_main, dev, version)
            kept = [sid for sid, info in sorted(facts['sections'].items()) if info['stock']]
            facts['untouched'] = ['sections %s, byte for byte' % ', '.join(kept)]
        else:
            facts = elek.verify(outputs, stock, want_main, dev, stock_main, version)
    except (syx.SyxError, elek.ElekError) as e:
        raise FormatError(str(e))
    for lo, hi, why in dev.protected:
        a, b = lo - dev.main_load, hi - dev.main_load
        if bytes(want_main[a:b]) != stock_main[a:b]:
            raise FormatError('0x%08x-0x%08x (%s) is not stock' % (lo, hi, why))
    return facts


def header_problems(stock, built, dev):
    """What differs between two files of one device apart from the main OS and the version field. -> problems."""
    bad = []
    if dev.container == 'ele3':
        if [(e[0], e[3]) for e in built.table] != [(e[0], e[3]) for e in stock.table]:
            bad.append('the section table differs from stock')
        for sid in stock.stored:
            if sid != dev.main_section and built.section(sid) != stock.section(sid):
                bad.append('section %d differs from stock; a mod can only change the main OS' % sid)
        size, (lo, hi) = 0x1C, (dev.version_at, dev.version_at + 4)
    else:
        size, (lo, hi) = elek.SECT, elek.VERSION
    changed = [i for i in range(size) if built.header[i] != stock.header[i]]
    if any(not lo <= i < hi for i in changed):
        bad.append('the container header differs outside the version field')
    return bad
