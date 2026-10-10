#!/usr/bin/env python3
"""Capture the real OT LCD from a locally built image; never build/upload firmware.

The plan contains panel presses, encoder turns, waits and PNG filenames. Only
the rendered LCD PNGs and their JSON provenance leave the temporary workspace.
Use a reviewed emulator and a locally built image matching the module version.
"""
import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import selectors
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]
KEYS = {'FUNC': 0x2d, 'SRC': 0x22, 'AMP': 0x23, 'LFO': 0x24,
        'FX1': 0x25, 'FX2': 0x26, 'YES': 0x31, 'NO': 0x32,
        'UP': 0x33, 'DOWN': 0x20, 'LEFT': 0x34, 'RIGHT': 0x21,
        'MENU': 0x1c, 'MIDI': 0x35, 'PART': 0x1d, 'PAGE': 0x1b,
        'CUE': 0x2a, 'PTN': 0x2e, 'BANK': 0x2f, 'MIXER': 0x30,
        'REC': 0x29, 'PLAY': 0x28, 'STOP': 0x27,
        'SCENE A': 0x19, 'SCENE B': 0x1a, 'AED': 0x1e,
        **{f'PUSH {name}': 0x38 + i for i, name in enumerate('ABCDEF')},
        'PUSH LEVEL': 0x3e,
        **{f'TRIG{i + 1}': i for i in range(16)},
        **{f'T{i + 1}': 0x10 + i for i in range(8)}}
ENCODERS = {name: index for index, name in enumerate(['A', 'B', 'C', 'D', 'E', 'F', 'LEVEL'])}


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def check_dsp_shared_memory():
    # Two reviewed DSP MemoryBuffers need 104 MiB of backing storage before
    # project/audio work. Docker defaults to 64 MiB; mmap succeeds there but
    # touching the second buffer raises SIGBUS. Reserve some working headroom.
    if sys.platform != 'linux' or not Path('/dev/shm').exists():
        return
    space = os.statvfs('/dev/shm')
    available = space.f_bavail * space.f_frsize
    if available < 128 * 1024 * 1024:
        raise ValueError(
            f'DSP capture needs at least 128 MiB free in /dev/shm '
            f'({available // (1024 * 1024)} MiB available). '
            'For Docker, start the isolated container with --shm-size 256m.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--emulator', type=Path, required=True)
    parser.add_argument('--image', type=Path, required=True, help='Local MAIN OS image; never commit it')
    parser.add_argument('--image-sha256', required=True, help='Expected SHA-256 of that local image')
    parser.add_argument('--plan', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True, help='New screenshot output directory')
    parser.add_argument('--card', type=Path, help='Optional local card; otherwise create an empty scratch card')
    parser.add_argument('--set-name', help='Local card SET name; requires --card and --project-name')
    parser.add_argument('--project-name', help='Load this disposable project before panel actions')
    parser.add_argument('--mki', action='store_true', help='Default panel is MKII')
    parser.add_argument('--key-ms', type=int, default=150, help='Key down/up interval, 20–500 ms; use 50 for double taps')
    args = parser.parse_args()
    if not 20 <= args.key_ms <= 500:
        parser.error('--key-ms must be 20–500 emulated milliseconds.')
    if bool(args.set_name) != bool(args.project_name) or (args.project_name and not args.card):
        parser.error('Project loading requires --card, --set-name and --project-name together.')
    if any(name and (name in ('.', '..') or len(name) > 64 or '/' in name or '\\' in name or any(ord(c) < 32 for c in name)) for name in (args.set_name, args.project_name)):
        parser.error('Use plain local card folder names, without paths.')
    image = args.image.resolve()
    if hashlib.sha256(image.read_bytes()).hexdigest() != args.image_sha256:
        parser.error('The local capture image differs from its expected fingerprint.')
    plan = json.loads(args.plan.read_text())
    if not isinstance(plan, list) or not plan or len(plan) > 200:
        parser.error('Use an array of 1–200 panel actions.')
    shots, held = set(), set()
    for action in plan:
        if not isinstance(action, dict) or len(action) != 1:
            parser.error('Each action contains exactly one of press, hold, release, encoder, wait, capture.')
        key, value = next(iter(action.items()))
        if key in ('press', 'hold', 'release'):
            if not isinstance(value, list) or not value or any(not isinstance(v, str) or v not in KEYS for v in value) or len(set(value)) != len(value):
                parser.error('Panel actions must contain unique supported key names.')
            if key == 'release':
                if not set(value) <= held:
                    parser.error('release may only name keys held earlier in the plan.')
                held.difference_update(value)
            else:
                if held.intersection(value):
                    parser.error('A held key cannot be pressed or held again.')
                if key == 'hold':
                    held.update(value)
        elif key == 'encoder':
            if not isinstance(value, dict) or set(value) != {'name', 'delta'} or value['name'] not in ENCODERS or type(value['delta']) is not int or not -127 <= value['delta'] <= 127:
                parser.error('encoder needs a supported name and signed delta in -127..127.')
        elif key == 'wait':
            if type(value) is not int or not 1 <= value <= 10000:
                parser.error('wait is 1–10000 emulated milliseconds.')
        elif key == 'capture':
            if not isinstance(value, str) or not value.endswith('.png') or Path(value).name != value or value in shots:
                parser.error('capture needs a unique PNG filename without a directory.')
            shots.add(value)
        else:
            parser.error('Unknown capture action.')
    if not shots:
        parser.error('The plan must capture at least one PNG.')
    if held:
        parser.error('Release every held key before the plan ends.')
    output = args.output.resolve()
    if output.exists():
        parser.error('Output exists; choose a new directory to preserve previous captures.')
    try:
        check_dsp_shared_memory()
    except ValueError as error:
        parser.error(str(error))
    lcd = load('octamod_lcd', ROOT / 'sdk/octabam/tools/emu/lcd_view.py')
    # Render the actual bitplane in the required monochrome documentation style.
    # Preserve every LCD pixel; this changes only the two display colors.
    lcd.ON, lcd.OFF = (240, 240, 240), (24, 24, 24)
    output.mkdir(parents=True)
    provenance = {'firmware': '1.40C', 'imageSha256': args.image_sha256,
                  'emulatorSha256': hashlib.sha256(args.emulator.read_bytes()).hexdigest(),
                  'setup': 'Headless ot_emu; ' + ('MKI' if args.mki else 'MKII') + ' panel; stopped transport; 128×64 LCD at integer scale 6.',
                  'palette': {'on': list(lcd.ON), 'off': list(lcd.OFF)},
                  'keyMs': args.key_ms, 'plan': plan, 'screenshots': {}}
    if args.card:
        provenance['cardSha256'] = hashlib.sha256(args.card.read_bytes()).hexdigest()
    if args.project_name:
        provenance['project'] = {'set': args.set_name, 'name': args.project_name}
    # Discard emulator diagnostics: never retain RAM, firmware, card or private logs.
    with tempfile.TemporaryDirectory(prefix='octamod-ui-capture.') as directory:
        work = Path(directory)
        card = args.card.resolve() if args.card else work / 'card.img'
        if not args.card:
            codec = load('octamod_card', ROOT / 'sdk/octabam/tools/emu/emu_card.py')
            (work / 'card-tree').mkdir()
            card.write_bytes(codec.build_image(str(work / 'card-tree'), 32))
        plane = work / 'lcd.bin'
        command = [str(args.emulator.resolve()), '--image', str(image), '--card', str(card),
                   '--dsp', '--frame', '--ms', '3000', '--interactive', '--lcd', str(plane),
                   '--main-level', 'off', '--rtc', 'host']
        if args.project_name:
            command.extend(['--mount', '--set', args.set_name, '--project', args.project_name])
        if not args.mki:
            command.append('--mkii')
        env = {key: value for key, value in os.environ.items() if not key.startswith('OT_')}
        port = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                stderr=subprocess.DEVNULL, cwd=work, env=env)
        poll = selectors.DefaultSelector()
        poll.register(port.stdout, selectors.EVENT_READ)
        pending = b''
        project_loaded = False

        def reply(prefixes, timeout=120):
            nonlocal pending, project_loaded
            deadline = time.monotonic() + timeout
            while True:
                while b'\n' in pending:
                    line, pending = pending.split(b'\n', 1)
                    if b'load run ended: LOAD PROJECT handled' in line:
                        project_loaded = True
                    if line.startswith(prefixes):
                        if line.startswith(b'err'):
                            raise RuntimeError('The emulator refused a capture command.')
                        return line
                if time.monotonic() >= deadline or port.poll() is not None:
                    raise RuntimeError('The emulator did not finish the UI command.')
                if poll.select(timeout=1):
                    chunk = os.read(port.stdout.fileno(), 65536)
                    if not chunk:
                        raise RuntimeError('The emulator exited before capture completed.')
                    pending += chunk

        def send(line):
            port.stdin.write((line + '\n').encode('ascii'))
            port.stdin.flush()
            result = reply((b'ok', b'err'))
            if line.startswith('run ') and b'stop=time' not in result:
                raise RuntimeError('The UI session stopped before the requested time elapsed.')

        rows = [0] * 8
        try:
            reply(b'ready ', timeout=600 if args.project_name else 120)
            if args.project_name and not project_loaded:
                raise RuntimeError('The disposable project did not finish loading; refuse misleading captures.')
            for action in plan:
                key, value = next(iter(action.items()))
                if key in ('press', 'hold', 'release'):
                    if key != 'release':
                        for name in value:
                            code = KEYS[name]
                            rows[code >> 3] |= 1 << (code & 7)
                            send(f'key {0x20 | (code >> 3)} {rows[code >> 3]}')
                            send(f'run {args.key_ms}')
                    for name in reversed(value) if key != 'hold' else []:
                        code = KEYS[name]
                        rows[code >> 3] &= ~(1 << (code & 7))
                        send(f'key {0x20 | (code >> 3)} {rows[code >> 3]}')
                        send(f'run {args.key_ms}')
                elif key == 'encoder':
                    send(f"knob {0x30 | ENCODERS[value['name']]} {value['delta'] & 255}")
                    send('run 200')
                elif key == 'wait':
                    send(f'run {value}')
                else:
                    lcd.png(lcd.screen(lcd.read_plane(plane)), str(output / value), 6)
                    provenance['screenshots'][value] = hashlib.sha256((output / value).read_bytes()).hexdigest()
                    print('Captured ' + value, flush=True)
            send('quit')
            port.wait(timeout=10)
            (output / 'capture.json').write_text(json.dumps(provenance, indent=2) + '\n')
        finally:
            if port.poll() is None:
                port.terminate()
                port.wait(timeout=10)
            poll.close()
    print('Capture complete. Review every screenshot before adding it to a module manifest.')


if __name__ == '__main__':
    main()
