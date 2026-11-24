#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Build or verify the single USB Audio runtime package and its published manifest entry."""
import argparse
import hashlib
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SDK = ROOT / 'sdk/machines/octatrack'
sys.path.insert(0, str(SDK / 'module-adapters'))
import usb_audio_package as audio


def generate(check, stock=None, upstream=None):
    module = json.loads((ROOT / 'sdk/octatrack/modules' / audio.MODULE / 'octamod.module.json').read_text())
    manifest_path = ROOT / 'src/engine/assets/octatrack-module-packages.json'
    manifest = json.loads(manifest_path.read_text())
    path = Path('octatrack-modules') / audio.MODULE / (module['version'] + '.mwrm')
    output = ROOT / 'public' / path
    if check and not shutil.which('m68k-elf-gcc') and stock is None:
        data = output.read_bytes()
        print('USB Audio compiler unavailable, checking the published bytes and metadata')
    else:
        data, _ = audio.build(None, release=True, stock=stock, upstream=upstream, usb_input=True)
    packages = audio.load('usb_audio_package_metadata', SDK / 'elekloader/module_packages.py')
    entry = dict(name='USB Audio', version=module['version'], path=str(path.as_posix()), bytes=len(data),
                 sha256=hashlib.sha256(data).hexdigest(), **packages.capabilities(data), installPresets=True,
                 requiredBase=json.loads((SDK / 'base-binding.json').read_text())['identity'])
    if check:
        if manifest.get('usbAudio', {}).get('configurable') != entry or output.read_bytes() != data:
            raise ValueError('Rebuild the configurable USB Audio release package and catalogue')
    else:
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_bytes(data)
        manifest.setdefault('usbAudio', {})['configurable'] = entry
        manifest_path.write_text(json.dumps(manifest, indent=2) + '\n')
    print('USB Audio', entry['version'], entry['sha256'])


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--stock', type=Path)
    parser.add_argument('--upstream', type=Path, default=Path.home() / '.cache/modwerk-upstream/elekloader')
    args = parser.parse_args()
    generate(args.check, args.stock, args.upstream)
