#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""The runtime packages the site loads onto an Octatrack over USB (module sets), built from source with no firmware.

  npm run octatrack:module-packages                 # writes public/octatrack-modules/ID/VERSION.mwrm and the manifest
  npm run octatrack:module-packages -- --check      # rebuilds every package and compares it byte for byte
  npm run octatrack:module-packages -- --check --stock OCTATRACK_OS1.40C.bin   # and: no run of the stock OS inside

Each package is exactly what the local path makes (sdk/runtime/loader/build.py, as the elekloader README runs it):
- a DSP effect (--dsp): its DSP package from src/engine/assets/dsp-packages.json (dsp_packages.py rebuilds that from
  source) and its FX page recipe, with the figures the manifest (src/engine/assets/octatrack-module-packages.json)
  keeps for it (ABI 6);
- an entry with "octabam": the module's ColdFire code from its Octabam manifest (--octabam, ABI 7), beside its DSP
  effect when the entry has figures (TAPE ECHO, EUCLID; "pinned" when its C names its effect id). Its writes to stock
  code carry the SHA-256 of the stock bytes, never the bytes; the base checks them against its running code. Needs
  m68k-elf binutils and Elekloader's checkout (--upstream) to read the manifest; --check skips these entries, and
  says so, without them;
- an entry with "machine": a catalogue machine module as one independent package (--octabam-machine, ABI 8): what
  it shares goes through the base's events and tables (its runtime.json or machine port), and its authored runs that
  coincide with stock are rebuilt from the user's OS by the reviewed recipe in module-adapters/machine-recipes.json,
  so the package carries no stock bytes. Same tools as "octabam";
- an "octabam" entry with "standalone" (Play Modes, Tape Echo, Euclid): its authored runs that coincide with stock
  are rebuilt from the user's OS by its reviewed recipe in module-adapters/standalone-recipes.json (build.py
  --standalone; owner decision 14 Oct 2026);
- an entry with "tables" (Mute Modes): its units and grown stock tables (build.py --octabam-tables) from the reviewed
  table recipes in module-adapters/candidate-recipes.json; the base admits it through its reviewed table declaration
  (module-adapters/table-owners.json, built into the base);
- an entry with "base" (Sidechain Compressor, Output Matrix, Analog BD, CC Map, Recorder Loop Fix): bound to the
  exact public base, whose IDENTIFY digest its manifest entry names as requiredBase (module-adapters/base_bound.py).
  The controller packages and Analog BD call the base's write-lease entries and the base admits them through the trust
  rows built into it; the cave ports are linked for its arena and runtime pool. They link against sdk/machines/octatrack/base-binding.json,
  which `npm run octatrack:base` writes from the base it built. Same tools as "octabam";
- an entry with "requiresFeatures" (a key bus reader, RINGMOD SC): the package build.py makes, written as ABI 9 by
  sdk/runtime/loader/abi9.py with those base features (dsp-sites.json names, e.g. "keybus") and its "dspClaims"
  (abi9.py's --claim syntax). The manifest then also says `requires` (the feature bits) and `claims` (their count).
To add a module, add its entry (id and figures) to the manifest and run this.

ABI 6 packages are checked to have no stock-code sites (the only place they would carry stock bytes). --stock also
scans every package, and its DSP words packed in three bytes either way round, for runs of 12 or more bytes that
appear in the stock OS image too, counted by their bytes that are not filler (zero padding and empty header fields,
and stretches of four or more 0xFF bytes such as unused hook words, match anywhere), and fails on 12 (E-Verb's DSP
words share 10 by chance), and runs check_stock_free.py's scan (16 bytes at any alignment, against the image and its
DSP words as the ColdFire keeps them). Needs Elekloader (--upstream,
default ~/.cache/modwerk-upstream/elekloader) to unpack the OS. Node 24 for the page recipe."""
import argparse, hashlib, json, shutil, struct, subprocess, sys, tempfile
from pathlib import Path

APP = Path(__file__).resolve().parents[4]
sys.path.append(str(APP / 'sdk'))  # firmware_codec
import firmware_codec  # noqa: E402
BUILD = APP / 'sdk/runtime/loader/build.py'
DSP = APP / 'src/engine/assets/dsp-packages.json'
MANIFEST = APP / 'src/engine/assets/octatrack-module-packages.json'
PUBLIC = APP / 'public'
SEED, LIMIT = 12, 12  # bytes: a shared run worth looking at; its counted (not filler) bytes that fail
FILL = 4  # 0xFF bytes in a stretch this long count as filler: a whole unused hook word (the loader's RUNTIME_NONE)


def build(entry, out, upstream, private_stock=None, stock_at=None):
    """One package through build.py, as the README's command line makes it (a base-bound one through base_bound.py)."""
    if entry.get('base'):
        sys.path.insert(0, str(APP / 'sdk/machines/octatrack/module-adapters'))
        import base_bound
        data, _ = base_bound.build(entry['id'], upstream, out.parent / (entry['id'] + '-work'), stock_at)
        out.write_bytes(data)
        return data
    args = [sys.executable, '-B', str(BUILD), '-o', str(out)]
    if entry.get('slots'):
        args += ['--dsp', '%s:%s' % (DSP, entry['id']), '--slots', entry['slots'], '--cycles', str(entry['cycles']),
                 '--cycles-kind', entry['cyclesKind'], '--state', str(entry['state'])]
    if entry.get('buffer'):
        args += ['--buffer', str(entry['buffer'])]
    if entry.get('octabam'):
        args += ['--octabam', entry['id'], '--upstream', str(upstream)] + (['--pinned'] if entry.get('pinned') else [])
    if entry.get('machine'):
        args += ['--octabam-machine', entry['id'], '--upstream', str(upstream)]
    if entry.get('standalone'):
        args += ['--standalone']
    if entry.get('tables'):
        args += ['--octabam-tables', entry['id'], '--upstream', str(upstream)]
    if private_stock:
        args += ['--private-port', '--stock', str(private_stock)]
    subprocess.run(args, check=True, capture_output=True, text=True, cwd=APP)
    if entry.get('requiresFeatures'):
        import importlib.util
        spec = importlib.util.spec_from_file_location('module_packages_abi9', APP / 'sdk/runtime/loader/abi9.py')
        abi9 = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(abi9)
        out.write_bytes(abi9.upgrade(out.read_bytes(), abi9.base_features(entry['requiresFeatures']),
                                     [abi9.parse_claim(claim) for claim in entry.get('dspClaims', [])]))
    return out.read_bytes()


def filler(data):
    """How many filler bytes `data` has before each offset: zeros, and 0xFF bytes in a stretch of FILL or more. Both
    recur in any two images and say nothing about where bytes came from (the owner allowed the strict scan to ignore
    0xFF-only runs as it ignores zeros, 14 Oct 2026). A shorter 0xFF stretch, as in an instruction, still counts."""
    marks, at = bytearray(len(data)), 0
    while at < len(data):
        end = at + 1
        if data[at] == 0xff:
            while end < len(data) and data[end] == 0xff:
                end += 1
            if end - at >= FILL:
                marks[at:end] = b'\x01' * (end - at)
        else:
            marks[at] = data[at] == 0
        at = end
    before = [0]
    for mark in marks:
        before.append(before[-1] + mark)
    return before


def runs(data, stock):
    """Stretches of `data` (from their start) that also appear in `stock`, at least SEED bytes: their bytes that are not
    filler (filler())."""
    before = filler(data)
    grams = {}
    for at in range(len(data) - SEED + 1):
        if before[at + SEED] - before[at] <= SEED // 2:  # filler-heavy seeds match everywhere and only slow the scan down
            grams.setdefault(data[at:at + SEED], []).append(at)
    found = {}
    for at in range(len(stock) - SEED + 1):
        for start in grams.get(stock[at:at + SEED], ()):
            n = SEED
            while start + n < len(data) and at + n < len(stock) and data[start + n] == stock[at + n]:
                n += 1
            found[start] = max(found.get(start, 0), n - (before[start + n] - before[start]))
    return found


RUNTIME_SITE_EVENT_LIMIT = 64  # hook words past the core four a package may carry; the base refuses more than it has


def capabilities(data):
    """Derive browser preflight requirements from the actual record types, never a handwritten module allowlist."""
    if len(data) < 68 or data[:4] != b'MWRM':
        raise ValueError('Not a published runtime package.')
    abi, flags = struct.unpack_from('>HH', data, 4)
    headers = {6: 68, 7: 72, 8: 76, 9: 80}
    if abi not in headers or len(data) < headers[abi]:
        raise ValueError('Not a supported published runtime ABI.')
    hooks, sites = struct.unpack_from('>II', data, 20)
    copies = struct.unpack_from('>I', data, 68)[0] if abi >= 7 else 0
    fills = struct.unpack_from('>I', data, 72)[0] if abi >= 8 else 0
    header = headers[abi]
    words = struct.unpack_from('>%dI' % hooks, data, header) if abi >= 8 and len(data) >= header + 4 * hooks else None
    # ABI 9: base features (key bus readers) and DSP claims; hook entries, which every base refuses, are never published.
    requires, claims, entries = struct.unpack_from('>HBB', data, 76) if abi == 9 else (0, 0, 0)
    if ((hooks and (words is None or hooks > 4 + RUNTIME_SITE_EVENT_LIMIT)) or flags & ~(7 if abi >= 8 else 3)
            or abi == 6 and sites or sites > 128 or copies > 128 or fills > 64 or claims > 16 or entries):
        raise ValueError('The published runtime package has unsupported hooks, flags or records.')
    # One machine group needs both table composition and explicit lifetime admission. A hook word past the four core
    # events subscribes to (or raises) a site event: the base must report events (MWCP 128, loader.h).
    features = (bool(sites) | (bool(copies) << 1) | (bool(fills) << 2) | (24 if flags & 4 else 0)
                | (128 if words and any(w != 0xffffffff for w in words[4:]) else 0))
    return dict(abi=abi, features=features, sites=sites, copies=copies, fills=fills,
                **(dict(requires=requires, claims=claims) if abi == 9 else {}))


def dsp_words(data):
    """A supported stock-free runtime package: its DSP words packed big- and little-endian."""
    capabilities(data)
    words, count = struct.unpack_from('>IH', data, 32)
    if words > 4096 or count > 256 or 4 * words + 2 * count > len(data) - 68:
        raise ValueError('The runtime DSP section exceeds its bounds.')
    values = struct.unpack_from('>%dI' % words, data, len(data) - 4 * words - 2 * count)
    return [b''.join(v.to_bytes(3, order) for v in values) for order in ('big', 'little')]


def tools(entry, upstream):
    """Whether this machine can build the entry: an Octabam or machine one needs m68k-elf binutils and Elekloader's checkout."""
    return not (entry.get('octabam') or entry.get('machine') or entry.get('tables') or entry.get('base')) or bool(
        shutil.which('m68k-elf-as') and (upstream / 'elekloader/sdk/octabam.py').is_file())


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('--check', action='store_true', help='rebuild and compare; write nothing, exit 1 on a difference')
    ap.add_argument('--base-only', action='store_true', help='rebind only packages that name the base; preserve other published bytes')
    ap.add_argument('--stock', type=Path, help='the stock OS (.bin): fail on any run of it copied into a package')
    ap.add_argument('--upstream', type=Path, default=Path.home() / '.cache/modwerk-upstream/elekloader')
    ap.add_argument('--prepare-ports', help='comma-separated reviewed private ports; never changes published packages')
    ap.add_argument('--output-dir', type=Path, help='new private preparation directory outside Git')
    ap.add_argument('--base-image', type=Path, help='actual private candidate MAIN image')
    ap.add_argument('--base-symbols', type=Path, help='matching private native symbol map')
    ap.add_argument('--base-proof', type=Path, help='matching private native build proof')
    a = ap.parse_args()
    if a.prepare_ports:
        sys.path.insert(0, str(APP / 'sdk/machines/octatrack/module-adapters'))
        import candidate_packages
        try:
            candidate_packages.prepare(a, sys.modules[__name__])
        except (ValueError, subprocess.CalledProcessError) as error:
            ap.exit(1, str(error) + '\n')
        return
    if any((a.output_dir, a.base_image, a.base_symbols, a.base_proof)):
        ap.error('Private base/output inputs require --prepare-ports; ordinary publication is unchanged.')
    manifest = json.loads(MANIFEST.read_text())
    versions = {m['id']: m['version'] for m in json.loads((APP / 'sdk/catalog.json').read_text())['modules']}
    dsp = {p['id']: p for p in json.loads(DSP.read_text())['packages']}
    stock, stock_at, upstream = None, None, a.upstream.expanduser().resolve()
    if a.stock:
        firmware_codec.use_elekloader(upstream)
        from elekloader import formats
        parsed, device, _ = formats.load(str(a.stock))
        stock = formats.main_image(parsed, device)
        stock_at = lambda address, n: stock[address - device.main_load:address - device.main_load + n]
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        import check_stock_free
        haystacks = check_stock_free.haystacks(a.stock, upstream)
    failed, entries = 0, []
    with tempfile.TemporaryDirectory() as work:
        for entry in manifest['packages']:
            if a.base_only and not entry.get('base'):
                data = (PUBLIC / entry['path']).read_bytes()
                if len(data) != entry['bytes'] or hashlib.sha256(data).hexdigest() != entry['sha256']:
                    sys.exit('%s: the published package is missing or changed.' % entry['id'])
                entries.append(entry)
                continue
            version = versions[entry['id']]
            if entry.get('slots') and dsp[entry['id']]['version'] != version:
                sys.exit('%s: dsp-packages.json holds %s, the catalogue %s; rebuild it with dsp_packages.py first.' % (
                    entry['id'], dsp[entry['id']]['version'], version))
            if not tools(entry, upstream):
                if not a.check:
                    sys.exit('%s needs m68k-elf binutils and Elekloader\'s checkout (--upstream) to build.' % entry['id'])
                print('%-18s skipped: no m68k-elf binutils or Elekloader checkout here' % entry['id'])
                entries.append(entry)
                continue
            data = build(entry, Path(work) / 'p.mwrm', upstream, stock_at=stock_at)
            views = [data] + dsp_words(data)
            path = 'octatrack-modules/%s/%s.mwrm' % (entry['id'], version)
            name = data[50:66].split(b'\0')[0].decode('latin-1')
            made = dict(entry, **capabilities(data), version=version, name=name, module=data[28:32].hex(), bytes=len(data),
                        sha256=hashlib.sha256(data).hexdigest(), path=path)
            if entry.get('base'):
                made['requiredBase'] = json.loads((APP / 'sdk/machines/octatrack/base-binding.json').read_text())['identity']
            entries.append(made)
            if a.check:
                same = made == entry and (PUBLIC / path).is_file() and (PUBLIC / path).read_bytes() == data
                print('%-18s %s %s' % (entry['id'], made['sha256'][:16], 'identical' if same else 'DIFFERS: run without --check'))
                failed += not same
            else:
                if not a.base_only and not entries[:-1]:  # only the current versions stay published
                    shutil.rmtree(PUBLIC / 'octatrack-modules', ignore_errors=True)
                (PUBLIC / path).parent.mkdir(parents=True, exist_ok=True)
                (PUBLIC / path).write_bytes(data)
            if stock is not None:
                longest = 0
                for view in views:
                    for start, n in sorted(runs(view, stock).items()):
                        longest = max(longest, n)
                        if n >= LIMIT:
                            print('  %s: a run at %d with %d non-zero bytes is also in the stock OS' % (entry['id'], start, n))
                print('  %-16s most non-zero bytes in a run shared with the stock OS: %d (fails at %d)' % (entry['id'], longest, LIMIT))
                found = check_stock_free.stock_runs({'sections': {'package': {'parts': [['hex', data.hex()]]}}}, haystacks, 16)
                for where, offset, length, source in found:
                    print('  %s +%#x: %d bytes of %s (check_stock_free.py)' % (entry['id'], offset, length, source))
                failed += longest >= LIMIT or bool(found)
    if not a.check:
        MANIFEST.write_text(json.dumps(dict(manifest, packages=entries), indent=2) + '\n')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
