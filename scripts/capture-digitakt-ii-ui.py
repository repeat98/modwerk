#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Capture real Digitakt II framebuffer pixels via the emulator's panel input.

Run only in the same disposable sandbox as prepare-digitakt-ii-draft.py.
Never use this for application/CI checks or hardware/audio qualification.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import re
import sys


def capture(emulator, build, work):
    temporary = (Path('/tmp').resolve(), Path(os.environ.get('TMPDIR', '/tmp')).resolve())
    if not any(work.is_relative_to(base) and build.is_relative_to(base) for base in temporary):
        raise ValueError('Build and capture workspaces must stay in temporary storage.')
    facts = json.loads((build / 'capture-build.json').read_text())
    source = build / 'perform-direct.syx'
    if hashlib.sha256(source.read_bytes()).hexdigest() != facts['syxSha256']:
        raise ValueError('The temporary capture build changed.')
    if work.exists():
        raise ValueError('Use a new temporary capture workspace.')
    work.mkdir(parents=True)
    shutil.copyfile(source, work / source.name)
    sys.path.insert(0, str(emulator))
    from emu import bootstrap, release
    paths = bootstrap.FirmwarePaths(str(work), source.name, str(emulator / 'devices'))
    identity = release.identify_release(str(work / source.name), devices_dir=str(emulator / 'devices'))
    if identity.product != 'Digitakt II':
        raise ValueError('The temporary OS is not for Digitakt II.')
    release.write_device_overlay(identity, paths.overlay, paths.devices_dir)
    os.environ.update(paths.env())
    def progress(event):
        if event.kind in ('start', 'done'):
            print(event.step + ': ' + event.text, flush=True)
    # The pinned DT2 profile's headless intro holds PIT3. GUI PIT3 delivery
    # reaches the actual stock UI; no guest RAM edits or internal menu calls.
    bootstrap.extract_sections(paths, progress=progress)
    bootstrap.prepare_card(paths.card, progress=progress)
    Path(paths.snapdir).mkdir(parents=True)
    bootstrap.cold_boot(paths, progress=progress)
    snapshot = str(work / 'gui-ready.snap')
    warmup = [sys.executable, '-B', str(emulator / 'tools/guirun.py'), paths.cold,
              '--syx', str(work / source.name), '--intro-timers', 'pit3',
              '--limit', '600000000', '--save-at', '550M:' + snapshot]
    warmup_log = subprocess.run(warmup, cwd=work, check=True, text=True,
                                stdout=subprocess.PIPE, stderr=subprocess.STDOUT).stdout
    (work / 'warmup.log').write_text(warmup_log)
    loops = re.findall(r'mainloop=(\d+)', warmup_log)
    if not loops or int(loops[-1]) < 100 or not Path(snapshot).is_file():
        raise ValueError('The emulator did not reach a live stock GUI; retain no captures.')
    print('Live GUI reached; driving real panel buttons.', flush=True)
    captures = work / 'captures'
    captures.mkdir()
    # Real panel codes: PRESET=7, FUNC=17, NO=12. No guest RAM writes or menu calls.
    plan = {
        'inputs': ['20M:press:7', '24M:release:7', '44M:press:7', '48M:release:7',
                   '65M:press:17', '72M:press:7', '76M:release:7', '80M:release:17'],
        'captures': ['40M:perform-kit.png', '60M:perform-off.png', '105M:preset-kit.png'],
    }
    (work / 'plan.json').write_text(json.dumps(plan, indent=2) + '\n')
    command = [sys.executable, '-B', str(emulator / 'tools/guirun.py'), snapshot,
               '--syx', str(work / source.name), '--limit', '110000000']
    for action in plan['inputs']:
        command += ['--input', action]
    for shot in plan['captures']:
        when, name = shot.split(':')
        command += ['--png-at', when + ':' + str(captures / name)]
    log = subprocess.run(command, cwd=work, check=True, text=True,
                         stdout=subprocess.PIPE, stderr=subprocess.STDOUT).stdout
    (work / 'panel.log').write_text(log)
    loops = re.findall(r'mainloop=(\d+)', log)
    if not loops or int(loops[-1]) < 100:
        raise ValueError('The panel run did not maintain a live GUI; retain no captures.')
    for shot in plan['captures']:
        if not (captures / shot.split(':')[1]).is_file():
            raise ValueError('A requested capture is missing; retain no captures.')
    print('Capture session finished; inspect every PNG before retaining media.', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--emulator', type=Path, required=True)
    parser.add_argument('--build', type=Path, required=True)
    parser.add_argument('--work', type=Path, required=True)
    args = parser.parse_args()
    capture(args.emulator.resolve(), args.build.resolve(), args.work.resolve())
