# SPDX-License-Identifier: GPL-3.0-or-later
"""A stock OS file and .elemod packages -> a custom OS file (also a command line).

    python -m firmware_builder.patch --stock Digitakt_OS1.53.syx \
        --mod core-2.1.elemod --mod sysinfo-2.0a.elemod ... --out CUSTOM.syx \
        [--version 2.0a] [--check] [--lockfile FILE] [--lockfile-from OLD.syx]

The steps, stopping at the first failure:
  1. the stock file must be a known release (by SHA-256) with the known main OS;
  2. every package must be made for that release, every site's stock bytes hashing as the package expects;
  3. the static conflict check (elemod.check, link.check), the device's protected ranges included;
  4. apply the sites, or link the packages;
  5. repack the main OS and rebuild the OS file, changing only the main OS and the version field;
  6. verify every output with separate code (formats.verify): the rest of the file is stock, every checksum holds,
     the main OS unpacks to the patched image (in place where the bootloader's staging is known), the protected
     ranges are stock and the flash budget holds;
  7. write the .syx, the .bin beside it on a device with a card file, OUT.json (a manifest with every hash) and,
     for linked packages, OUT.map.json (every symbol's address).

A core with package storage places the fields from a lockfile (store.py): --lockfile FILE, by default
DEVICE.lock.json in the output's folder. Keep it and give it to every later build; a build without it packs the
fields afresh. It is written back after each build, and copies go into the manifest and the build itself, so
--lockfile-from OLD.syx can take it back out of an earlier build.

--check stops after step 4 and writes nothing. Nothing here talks to a device.
"""
import argparse
import json
import os
import sys
import time

from . import devices, elemod, formats, link, store
from .elemod import sha

PATCHER = 'modwerk'


class PatchError(Exception):
    pass


def _load_stock(stock_path):
    try:
        return formats.load(stock_path)
    except OSError as e:
        raise PatchError('cannot read %s: %s' % (stock_path, e))
    except (devices.UnknownFirmware, formats.FormatError) as e:
        raise PatchError('%s: %s' % (stock_path, e))


def _load_mods(mod_paths, dev, rel, log):
    mods = []
    for path in mod_paths:
        try:
            m = elemod.load_any(path)
        except (OSError, elemod.ModError) as e:
            raise PatchError(str(e))
        if m.dev.key != dev.key or m.rel != rel:
            raise PatchError('%s is made for %s %s; your stock firmware is %s %s'
                             % (m.label(), m.dev.name, m.rel.version, dev.name, rel.version))
        log('mod %-24s %d sites%s  (file sha256 %s)'
            % (m.label(), len(m.sites), ', blob %d bytes' % m.blob['len'] if m.blob else '', m.sha256[:16]))
        mods.append(m)
    if not mods:
        raise PatchError('no mods given')
    return mods


def _mod_entry(m):
    return {'id': m.id, 'version': m.version, 'file': m.name, 'sha256': m.sha256,
            'format': 2 if isinstance(m, link.Mod2) else 1, 'sites': len(m.sites),
            'regions': [{'name': g['name'], 'lo': '0x%08x' % g['lo'], 'hi': '0x%08x' % g['hi'], 'area': g['area']}
                        for g in m.regions],
            'names': m.names}


def _pick_version(mods, dev, stock):
    shown = {m.doc.get('ele3_version') for m in mods} - {None}
    if not shown and dev.version_optional:
        shown = {stock.version}
    if len(shown) != 1:
        wanted = '%d characters' % dev.version_len if dev.container == 'ele3' \
            else 'up to %d characters' % dev.version_len
        raise PatchError('give --version (%s): the mods name %s' % (wanted, sorted(shown) or 'no version'))
    return shown.pop()


def build(stock_path, mod_paths, version=None, check_only=False, log=print, lock=None):
    """-> (outputs {'syx': bytes[, 'bin': bytes]} or None, manifest). lock: the package-storage lockfile, or None
    for a new one; the new one is the manifest's 'store'. Raises PatchError."""
    stock, dev, rel = _load_stock(stock_path)
    stock_main = formats.main_image(stock, dev)
    if sha(stock_main) != rel.main_sha256:
        raise PatchError('its main OS is not the known %s %s image' % (dev.name, rel.version))
    log('stock: %s OS %s (%s)' % (dev.name, rel.version, stock.sha256))
    mods = _load_mods(mod_paths, dev, rel, log)
    linkable = [m for m in mods if isinstance(m, link.Mod2)]
    linked = None
    try:
        if not linkable:
            img = elemod.apply(mods, stock_main)
        else:
            if len(linkable) != len(mods):
                raise elemod.ModError('a whole-build bundle (format 1) cannot be combined '
                                      'with separate mods (format 2)')
            linked = link.link(mods, stock_main, lock)
            img = linked.image
    except elemod.ModError as e:
        raise PatchError(str(e))
    log('the mods combine: no overlaps, stock bytes as expected, code sites whole instructions')
    if linked:
        lay = linked.layout
        log('linked %s: RAM 0x%08x-0x%08x (%d bytes spare), .fast to 0x%08x (%d spare), '
            'blob %d bytes' % (', '.join(linked.order), lay['ddr'][0], lay['bss'][1],
                               lay['ddr_spare'], lay['fast'][1], lay['fast_spare'], lay['blob_len']))
    man = {
        'patcher': PATCHER, 'device': dev.key,
        'stock': {'path': os.path.abspath(stock_path), 'sha256': stock.sha256,
                  'os': rel.version, 'main_sha256': sha(stock_main)},
        'mods': [_mod_entry(m) for m in mods],
        'main_sha256': sha(img),
        'main_len': len(img),
    }
    if linked:
        man['link'] = {'order': linked.order, 'layout': linked.layout,
                       'tables': {c: {'at': '0x%08x' % a, 'entries': n, 'entry': e}
                                  for c, (a, n, e) in sorted(linked.tables.items())}}
        man['_map'] = linked.map
        if linked.store is not None:
            man['store'] = linked.store
            for note in linked.store_notes:
                log('storage: ' + note)
    if len(mods) == 1 and not linkable and (mods[0].doc.get('build') or {}).get('section3_sha256'):
        want = mods[0].doc['build'].get('section3_sha256')
        man['bundle_matches_build'] = want == sha(img)
        if want != sha(img):
            raise PatchError('the bundle does not reproduce its build\'s main OS')
        log('the main OS matches the build the bundle came from (sha256 %s)' % sha(img)[:16])
    if check_only:
        return None, man
    if version is None:
        version = _pick_version(mods, dev, stock)
    try:
        formats.check_version(dev, version)
    except formats.FormatError as e:
        raise PatchError(str(e))
    started = time.time()
    stored = formats.pack_main(img, dev)
    log('packed the main OS: %d -> %d bytes (%.1f s)' % (len(img), len(stored), time.time() - started))
    try:
        outputs = formats.write(stock, stored, dev, version)
        facts = formats.verify(outputs, stock, img, dev, version)
    except formats.FormatError as e:
        raise PatchError('the output failed verification: %s' % e)
    gap = facts['main'].get('inplace_min_gap')
    log('verified: %s; the main OS depacks to the patched image%s; flash ends %s (%d bytes spare)'
        % ('; '.join(facts['untouched']),
           ' in place (min gap %d bytes)' % gap if gap is not None else '',
           facts['flash_end'], facts['flash_headroom']))
    man['version'] = version
    man['output'] = facts
    return outputs, man


def companion(path, kind):
    """The path of a second output beside `path` (the .bin beside a .syx)."""
    root, ext = os.path.splitext(path)
    return (root if ext.lower() == '.syx' else path) + '.' + kind


def _write_atomic(path, data):
    part = path + '.part'
    with open(part, 'wb') as fh:
        fh.write(data)
    os.replace(part, path)


def save(outputs, man, path):
    """Write the .syx at `path`, the .bin beside it, the manifest and the symbol map. -> the OS files written."""
    written = []
    for kind, data in outputs.items():
        target = path if kind == 'syx' else companion(path, kind)
        _write_atomic(target, data)
        written.append(target)
    man['output']['path'] = os.path.abspath(path)
    if 'bin' in outputs:
        man['output']['bin_path'] = os.path.abspath(companion(path, 'bin'))
    symbol_map = man.pop('_map', None)
    if symbol_map is not None:
        with open(path + '.map.json', 'w') as fh:
            json.dump({k: '0x%08x' % v for k, v in sorted(symbol_map.items())}, fh, indent=0)
        man['map'] = os.path.basename(path) + '.map.json'
    with open(path + '.json', 'w') as fh:
        json.dump(man, fh, indent=1)
    return written


def lock_from_build(path):
    """An earlier build's OS file -> the package-storage lockfile it carries, or None."""
    with open(path, 'rb') as fh:
        raw = fh.read()
    for dev in devices.devices():
        if not store.supports(dev.key):
            continue
        try:
            image = formats.main_image(formats.parse(raw, dev), dev)
        except Exception:                      # not a file of this family
            continue
        lock = store.from_image(image)
        if lock is not None:
            return lock
    return None


def default_lockfile(stock_path, out):
    """DEVICE.lock.json in the output's folder, the lockfile a build keeps without --lockfile; None when the stock
    file cannot be read (the build then says why)."""
    try:
        _, dev, _ = formats.load(stock_path)
    except (OSError, devices.UnknownFirmware, formats.FormatError):
        return None
    return os.path.join(os.path.dirname(os.path.abspath(out)), dev.key + '.lock.json')


def _parser():
    ap = argparse.ArgumentParser(prog='firmware_builder.patch', description=__doc__.split('\n')[0])
    ap.add_argument('--stock', required=True, help='your stock OS file (.syx, or the Octatrack\'s .bin)')
    ap.add_argument('--mod', action='append', default=[], help='a .elemod (repeat for more)')
    ap.add_argument('--out', help='the .syx to write (a .bin is written beside it for devices '
                                  'that have a card file)')
    ap.add_argument('--version', help='what the unit shows as its OS version: 4 characters on '
                                      'a Digitakt, up to 10 on an Octatrack (default: the mod\'s)')
    ap.add_argument('--check', action='store_true', help='check the mods combine; write nothing')
    ap.add_argument('--lockfile', help='the mod-storage lockfile, read and written back '
                                       '(default: DEVICE.lock.json in the output\'s folder)')
    ap.add_argument('--lockfile-from', metavar='OLD', help='when the lockfile does not exist: '
                    'take it from this earlier build (.syx)')
    return ap


def _read_lock(a, lockpath):
    """-> (lock or None, exit code or None)."""
    readpath = lockpath
    if not a.lockfile and lockpath and not os.path.exists(lockpath) and os.path.exists(a.out + '.lock.json'):
        readpath = a.out + '.lock.json'           # the older default name
    if readpath and os.path.exists(readpath):
        if a.lockfile_from:
            print('IGNORED --lockfile-from %s: the lockfile %s exists (move it away to take the '
                  'build\'s)' % (a.lockfile_from, readpath))
        try:
            with open(readpath) as fh:
                lock = json.load(fh)
        except (OSError, ValueError) as e:
            print('REFUSED: cannot read the lockfile %s: %s' % (readpath, e))
            return None, 1
        if readpath != lockpath:
            print('READ the lockfile %s; it is kept as %s from now on' % (readpath, lockpath))
        return lock, None
    if not a.lockfile_from:
        return None, None
    try:
        lock = lock_from_build(a.lockfile_from)
    except (OSError, elemod.ModError, formats.FormatError) as e:
        print('REFUSED: cannot take the lockfile from %s: %s' % (a.lockfile_from, e))
        return None, 1
    if lock is None:
        print('REFUSED: %s carries no lockfile (built without mod storage, or before '
              'builds kept one)' % a.lockfile_from)
        return None, 1
    print('READ the lockfile (layout ID %s) from %s' % (lock['id'], a.lockfile_from))
    return lock, None


def main(argv=None):
    ap = _parser()
    a = ap.parse_args(argv)
    if not a.check and not a.out:
        ap.error('--out is required (or --check)')
    if a.out and os.path.exists(a.stock) and os.path.exists(a.out) and os.path.samefile(a.stock, a.out):
        ap.error('--out is the stock file')
    lockpath = a.lockfile or (default_lockfile(a.stock, a.out) if a.out else None)
    lock, code = _read_lock(a, lockpath)
    if code is not None:
        return code
    try:
        outputs, man = build(a.stock, a.mod, a.version, a.check, lock=lock)
    except PatchError as e:
        print('REFUSED: %s' % e)
        return 1
    if a.check:
        print('OK: the mods combine (nothing written)')
        return 0
    for p in save(outputs, man, a.out):
        print('WROTE %s' % p)
    if man.get('store') is not None:
        with open(lockpath + '.part', 'w') as fh:
            fh.write(store.dumps(man['store']))
        os.replace(lockpath + '.part', lockpath)
        print('WROTE %s (keep it for your next build)' % lockpath)
    print('  sha256 %s, version %s, %d bytes' % (man['output']['sha256'], man['version'], man['output']['bytes']))
    return 0


if __name__ == '__main__':
    sys.exit(main())
