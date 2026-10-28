#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Fails when a base package carries stock bytes: every byte it ships literally (section hex parts, site `new`
bytes, table entries) is scanned for runs of MIN or more bytes found in the stock MAIN image, at any alignment,
and in its DSP payloads read as big-endian words (how the ColdFire keeps its copies of stock effect code). What a
package repeats from the firmware must be a stock-copy part, a hash guard or a fill (build_core.strip).

    python3 -B check_stock_free.py PACKAGE.elemod --stock OCTATRACK_OS1.40C.bin --upstream ELEKLOADER [--min 16]

Below 16 bytes a base shares runs with stock by chance: the effect names it reports (chooser-metadata.json), a
few instructions of its own code. `--min 8` lists them. The startup tables are drawn from artwork.json, Modwerk's
own: its round letters are column for column the stock logo's, so those two sites are listed, not scanned.
"""
import argparse
import importlib.util
import json
from pathlib import Path
import sys

sys.path.append(str(Path(__file__).resolve().parents[3]))  # sdk/, for firmware_codec
import firmware_codec  # noqa: E402
# A seed window needs this many distinct byte values: sparse words, bitmaps and zero padding (`c0060000c0060000`,
# `01000000 00000000`) recur by chance between any two images and say nothing about where bytes came from.
DISTINCT = 5


def authored():
    """The sites the startup artwork fills (sdk/runtime/startup/build.py)."""
    spec = importlib.util.spec_from_file_location('modwerk_startup', Path(__file__).resolve().parents[3] / 'runtime/startup/build.py')
    startup = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(startup)
    return {'0x%08x' % guard['address'] for guard, _ in startup.writes()}


def literals(document, skip=()):
    """(where, bytes) of everything a package ships as literal bytes, but the sites in `skip`."""
    for name, section in document['sections'].items():
        at = 0
        for part in section.get('parts', []):
            if part[0] == 'hex':
                yield '%s+%#x' % (name, at), bytes.fromhex(part[1])
                at += len(part[1]) // 2
            else:
                at += part[2]
    for site in document.get('sites', []):
        if site['addr'] in skip:
            continue
        yield 'site %s' % site['addr'], bytes.fromhex(site['new'])
    for i, entry in enumerate(document.get('contribute', [])):
        yield 'contribution %d (%s)' % (i, entry['to']), bytes.fromhex(entry['data'])
    for name, table in document.get('collections', {}).items():
        for key in ('head', 'end'):
            if table.get(key):
                yield 'table %s %s' % (name, key), bytes.fromhex(table[key])


def stock_runs(document, haystacks, minimum, skip=()):
    """-> [(where, offset, length, stock label)] for every maximal run of `minimum`+ bytes found in a haystack."""
    index = {}
    for label, data in haystacks:
        for o in range(len(data) - minimum + 1):
            window = data[o:o + minimum]
            if len(set(window)) >= DISTINCT:
                index.setdefault(window, (label, o))
    found = []
    for where, data in literals(document, skip):
        i = 0
        while i + minimum <= len(data):
            hit = index.get(data[i:i + minimum])
            if not hit:
                i += 1
                continue
            label, o = hit
            source = dict(haystacks)[label]
            n = minimum
            while i + n < len(data) and o + n < len(source) and data[i + n] == source[o + n]:
                n += 1
            found.append((where, i, n, '%s+%#x' % (label, o)))
            i += n
    return found


def haystacks(stock_path, upstream):
    firmware_codec.use_elekloader(upstream)
    from elekloader import formats
    stock, device, release = formats.load(str(stock_path))
    image = formats.main_image(stock, device)
    big_endian = bytearray()
    for start, length in device.dsp_payloads.values():
        at = start - device.main_load
        payload = image[at:at + length]
        big_endian += b''.join(payload[k:k + 3][::-1] for k in range(0, len(payload) - 2, 3))
    return [('MAIN', image), ('DSP words, big-endian', bytes(big_endian))]


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('package', type=Path)
    parser.add_argument('--stock', type=Path, required=True)
    parser.add_argument('--upstream', type=Path, required=True)
    parser.add_argument('--min', type=int, default=16)
    args = parser.parse_args()
    skip = authored()
    print('Startup artwork sites, not scanned: ' + ', '.join(sorted(skip)))
    found = stock_runs(json.loads(args.package.read_text()), haystacks(args.stock, args.upstream.resolve()), args.min, skip)
    for where, offset, length, source in found:
        print('%s +%#x: %d bytes of %s' % (where, offset, length, source))
    if found:
        sys.exit('%s carries %d stock runs (%d bytes).' % (args.package.name, len(found), sum(f[2] for f in found)))
    print('%s: no literal run of %d or more stock bytes.' % (args.package.name, args.min))


if __name__ == '__main__':
    main()
