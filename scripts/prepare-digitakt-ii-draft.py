#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Prepare only the pinned Digitakt II draft for documentation captures.

Run in a disposable sandbox with network/credentials denied, not application
checks or CI. All generated firmware/build files stay in the temporary output.
No qualification, hardware, stress or DSP test runs here.
"""
import argparse
import hashlib
import json
import importlib
import os
from pathlib import Path
import shutil
import sys

ROOT = Path(__file__).resolve().parent.parent
STOCK_SHA = '26c22f6652625ac2cfd47f7ee970d388ed8b6427dae3563c0a6a2f2d334350d5'
MAIN_SHA = 'a1e7b657b705eba1a19d81c33c1e11ba9c409816447ad74005d7bbf36da6d964'


def prepare(stock, output):
    temporary = (Path('/tmp').resolve(), Path(os.environ.get('TMPDIR', '/tmp')).resolve())
    if not any(output.is_relative_to(base) for base in temporary):
        raise ValueError('Capture builds must stay in temporary storage.')
    if output.exists():
        raise ValueError('Use a new temporary output directory.')
    if hashlib.sha256(stock.read_bytes()).hexdigest() != STOCK_SHA:
        raise ValueError('Choose the exact original Digitakt II OS 1.17 file.')
    output.mkdir(parents=True)
    os.chdir(output)  # Compiler scratch files stay inside the same private boundary.
    # Keep the approved browser engine intact. Compose this exact draft engine
    # only inside the temporary, network/credential-denied capture workspace.
    loader = ROOT / 'sdk/drafts/digitakt-ii-core/loader'
    pin = json.loads((loader / 'UPSTREAM.json').read_text())
    engine = output / 'engine'
    for name, digest in pin['files'].items():
        source = loader / name if name in pin['overlays'] else ROOT / 'vendor/elekloader' / name
        target = engine / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
        if hashlib.sha256(target.read_bytes()).hexdigest() != digest:
            raise ValueError('The staged loader does not match the exact upstream pin.')
    sys.path.insert(0, str(engine))
    importlib.invalidate_caches()
    from elekloader import formats, patch
    from elekloader.sdk import build
    st, dev, rel = formats.load(stock.read_bytes())
    image = formats.main_image(st, dev)
    if dev.key != 'digitakt-mk2' or rel.version != '1.17' or hashlib.sha256(image).hexdigest() != MAIN_SHA:
        raise ValueError('The selected OS failed its identity check.')
    packages = []
    for name in ('digitakt-ii-core', 'perform-direct'):
        source = ROOT / 'sdk/drafts' / name
        staged = output / 'source' / name
        shutil.copytree(source / 'src', staged / 'src')
        recipe = json.loads((source / 'recipe.json').read_text())
        for site in recipe.get('sites', []):
            at = int(site['addr'], 0) - dev.main_load
            preimage = image[at:at + site['len']]
            if len(preimage) != site['len'] or hashlib.sha256(preimage).hexdigest() != site['stockSha256']:
                raise ValueError('The selected OS failed a core patch guard.')
            site['stock'] = preimage.hex()
            del site['len'], site['stockSha256']
        (staged / 'mod.json').write_text(json.dumps(recipe, indent=2))
        package, _mod = build.build(str(staged), str(stock), str(output / 'packages' / name))
        packages.append(package)
    outputs, manifest = patch.build(str(stock), packages, version='PD10', log=lambda *args: None)
    syx = output / 'perform-direct.syx'
    syx.write_bytes(outputs['syx'])
    main = formats.main_image(formats.parse(outputs['syx'], dev), dev)
    facts = {
        'schemaVersion': 1, 'purpose': 'documentation-capture-only',
        'moduleVersion': '1.0.0-experimental', 'nativeVersion': '1.0',
        'sourceRevision': '71a5156781838fb5ef1c3e963b3949b781043a0d',
        'stockSha256': STOCK_SHA, 'imageSha256': hashlib.sha256(main).hexdigest(),
        'syxSha256': hashlib.sha256(outputs['syx']).hexdigest(),
        'layout': manifest.get('link', {}).get('layout'),
        'qualification': 'pending; capture preparation is not qualification or browser/native parity',
    }
    (output / 'capture-build.json').write_text(json.dumps(facts, indent=2) + '\n')
    print('Prepared temporary capture build; no firmware bytes or keys logged.', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--stock', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    prepare(args.stock.resolve(), args.output.resolve())
