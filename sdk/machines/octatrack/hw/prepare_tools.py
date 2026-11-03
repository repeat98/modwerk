#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Prepare repaired copies of imported Octabam hardware tools outside Git.

Developer tooling only. No firmware, device access or audio I/O.

The approved sdk/octabam tree stays byte-identical: the release source
inventory fingerprints all of tools/, including these host tools. Each
repair is bound to the exact imported source hash, every edit must match
exactly once, and the result must reproduce the reviewed output hash.
A changed imported tool is refused, so the repairs are reviewed again.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

HERE = Path(__file__).resolve().parent
APP = HERE.parents[3]
HW = APP / 'sdk/octabam/tools/hw'
VERSION = 1

TOOLS = {
    'usb_probe.py': {
        'source': 'fe1cb7f931564abcd91afcdc620caf59f2eff328f64f3b33509654350489b591',
        'output': 'f1d3cefcf1d33098592cee725b5eac06b42c82743769f43340e8edd8d5e3f988',
        'reason': 'Poller shadowed Thread._stop(); join() then fails before '
                  'the JSON report is written on affected Python runtimes.',
        'edits': [
            ('        self._stop = threading.Event()\n',
             '        # Thread.join() calls Thread._stop(); do not shadow that method.\n'
             '        self._stop_event = threading.Event()\n'),
            ('while not self._stop.is_set():', 'while not self._stop_event.is_set():'),
            ('self._stop.wait(self.interval)', 'self._stop_event.wait(self.interval)'),
            ('        self._stop.set()\n', '        self._stop_event.set()\n'),
        ],
        # Any remaining use would still reach the shadowed attribute.
        'absent': 'self._stop.',
        # Further reviewed sources (Octabam main, 19 Oct 2026: docstrings and messages reworded, the same edits;
        # 24 Oct 2026: an optional libusb-package backend before the Homebrew lookup, the same edits).
        'revisions': {'86c2b8c55a00cc3f98a631841752b6502a3a84d27b7dad9c692fb4a204e46ff5':
                      '6b2aa3500ca9283aceb81ef804cd899bfe82622f3f6eaf8233df8fc0261231ab',
                      '901b003b7ad085c499f7e7b25f27ae1613261cde48afa49335afab01639d4bde':
                      '3f469ddf306354d64647142a8225e7f79b487f0ea68e4340c8899dd7caa0d2d5'},
    },
    'rec.swift': {
        'source': '9aa5b59ae5104be517abb96e5b644da9ca55f9f0aa0d13bcb61fd796041465db',
        'output': '3a38c4e3f0a91d5e51bcf5472e6b756d43d9d2cee1c6213e52e35e75e870e636',
        'reason': 'Float rounds 2147483647 up to 2147483648, so a positive '
                  'full-scale sample traps on conversion to Int32.',
        'edits': [
            ('                let v = max(-1.0, min(1.0, src[i * c + k]))\n',
             '                // Float rounds 2147483647 to 2147483648: +1.0 would trap\n'
             '                // when converted to Int32. Scale in Double, then truncate.\n'
             '                let v = max(-1.0, min(1.0, Double(src[i * c + k])))\n'),
        ],
        'absent': 'min(1.0, src[',
    },
}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def reviewed(spec):
    """Each reviewed source hash and the output hash its repair must reproduce."""
    return {spec['source']: spec['output'], **spec.get('revisions', {})}


def repair(name, source):
    """Apply one tool's reviewed edits to its exact imported bytes."""
    spec = TOOLS[name]
    expected = reviewed(spec).get(sha(source))
    if expected is None:
        raise ValueError('Imported %s changed; review its repairs again.' % name)
    text = source.decode('utf-8')
    for old, new in spec['edits']:
        if text.count(old) != 1:
            raise ValueError('Repair anchor for %s must match exactly once: %r' % (name, old))
        text = text.replace(old, new)
    if spec['absent'] in text:
        raise ValueError('Repair left an unrepaired use in %s.' % name)
    output = text.encode('utf-8')
    if sha(output) != expected:
        raise ValueError('Repaired %s does not match its reviewed output.' % name)
    return output


def private_output(path):
    path = path.resolve()
    if path.exists():
        raise ValueError('Choose a new output directory.')
    try:
        subprocess.run(['git', '-C', str(path.parent), 'rev-parse', '--show-toplevel'],
                       check=True, capture_output=True)
    except (OSError, subprocess.CalledProcessError):
        pass
    else:
        raise ValueError('Prepared tools stay outside Git; the imported tree is approved source.')
    path.mkdir()
    return path


def prepare(output, hw=HW):
    """Write every repaired tool and tools.json; return that manifest."""
    repaired = {name: repair(name, (hw / name).read_bytes()) for name in TOOLS}
    output = private_output(output)
    for name, data in repaired.items():
        (output / name).write_bytes(data)
    manifest = {
        'adapter': VERSION,
        'importedFrom': 'sdk/octabam/tools/hw',
        'tools': {name: {'sourceSha256': spec['source'], 'outputSha256': spec['output'],
                         'reason': spec['reason']} for name, spec in TOOLS.items()},
        'limits': 'Host-tool repairs only. Not device, module or hardware qualification.',
    }
    (output / 'tools.json').write_text(json.dumps(manifest, indent=2) + '\n')
    for name in TOOLS:
        if sha((output / name).read_bytes()) != TOOLS[name]['output']:
            raise ValueError('Saved %s does not match its reviewed output.' % name)
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True,
                        help='New directory outside every Git checkout.')
    args = parser.parse_args()
    try:
        prepare(args.output)
    except ValueError as error:
        parser.error(str(error))
    print('Prepared %s in %s' % (', '.join(TOOLS), args.output.resolve()))


if __name__ == '__main__':
    main()
