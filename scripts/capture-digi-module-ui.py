#!/usr/bin/env python3
"""Capture Digi LCD documentation through real panel inputs in pinned digiemu.

Run in an isolated sandbox. Firmware, +Drive and snapshots stay in --out,
which must be new and outside this repository. Only reviewed PNGs and a
sanitized capture record belong in a module's media folder.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--emulator', type=Path, required=True)
parser.add_argument('--firmware', type=Path, required=True)
parser.add_argument('--plan', type=Path, required=True)
parser.add_argument('--out', type=Path, required=True)
parser.add_argument('--fixture-loop', action='store_true', help='Seed an original one-second DOC_LOOP on the disposable +Drive before boot')
parser.add_argument('--prune', action='store_true', help='After a successful capture keep only the PNGs and capture-report.json in --out (otherwise the firmware, +Drive and snapshots stay, about 0.4 GB a run)')
args = parser.parse_args()
repo = Path(__file__).resolve().parents[1]
out = args.out.resolve()
if out.is_relative_to(repo) or out.exists():
    parser.error('--out must be a new directory outside the repository')
emulator = args.emulator.resolve()
git_env = {**os.environ, 'GIT_CONFIG_GLOBAL': os.devnull, 'GIT_CONFIG_NOSYSTEM': '1', 'GIT_TERMINAL_PROMPT': '0'}
revision = subprocess.check_output(['git', '-C', str(emulator), 'rev-parse', 'HEAD'], text=True, env=git_env).strip()
if revision != 'c1b5735835923e328f8b4950d6ba927875e5b669':
    parser.error('use the reviewed digiemu revision c1b5735835923e328f8b4950d6ba927875e5b669')
if subprocess.check_output(['git', '-C', str(emulator), 'status', '--porcelain', '--untracked-files=no'], text=True, env=git_env).strip():
    parser.error('use a clean pinned emulator checkout without tracked source changes')
sys.path.insert(0, str(emulator))
from emu.fwcheck import prepare
from emu.bootstrap import first_run
from emu.session import Session, run_script
from emu.fwcompare import parse_script
from emu.panel import png_bytes, read

plan = args.plan.read_text()
steps = parse_script(plan)
out.mkdir(mode=0o700)
paths, device = prepare(str(args.firmware.resolve()), str(out))
if args.fixture_loop:
    from emu.ekfsformat import format_image,Ekfs
    import wave,io,math,struct
    buf=io.BytesIO()
    with wave.open(buf,'wb') as wav:
     wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(48000)
     wav.writeframes(b''.join(struct.pack('<h',int(18000*math.exp(-((n%12000)/1600))*math.sin(2*math.pi*(80+40*(n//12000))*n/48000))) for n in range(48000)))
    format_image(paths.card)
    fs=Ekfs(paths.card,write=True)
    try:fs.add_sample(2,'DOC_LOOP.wav',buf.getvalue())
    finally:fs.close()

first_run(paths, progress=lambda event: print(event.text, flush=True) if event.kind in ['note', 'done'] else None)
session = Session(paths.gui, paths.syx, audio=False, hle=False)
frames = []
def latch(uc, address, size, data):
    frame = read(session.m, session.profile.fb_front)
    if frame is not None:
        frames.append((session.now_ms(), frame))
session.at(session.profile.panel_diff, latch)
try:
    marks = []
    action_start = 0
    for step in steps:
        if step[0] in ['tap', 'turn']:
            action_start = session.ms
        for label, ms in run_script(session, [step]):
            marks.append((label, ms, action_start))
    if session.halted:
        raise RuntimeError(session.halted)
    captures = []
    for label, ms, action_start in marks:
        if not label.replace('-', '').replace('_', '').isalnum():
            raise ValueError('capture labels must be simple filenames')
        # Keep one complete, unmodified frame from the last 250 ms after the latest panel action. No pixels
        # are combined or drawn here; partial redraws are left out.
        candidates = [(time, frame) for time, frame in frames if max(action_start, ms - 250) <= time <= ms + 0.001]
        time, frame = max(candidates, key=lambda item: sum(value.bit_count() for value in item[1])) if candidates else (ms, session.screen_at(ms))
        if frame is None:
            raise RuntimeError('no LCD frame for ' + label)
        png = png_bytes(frame, scale=6)
        (out / (label + '.png')).write_bytes(png)
        captures.append({'path': label + '.png', 'sha256': hashlib.sha256(png).hexdigest(), 'atMs': time, 'requestedAtMs': ms})
    (out / 'capture-report.json').write_text(json.dumps({
        'imageSha256': hashlib.sha256(args.firmware.read_bytes()).hexdigest(),
        'emulatorRevision': revision, 'plan': plan, 'inputs': session.inputs,
        'captures': captures, 'halted': session.halted, 'hle': False,
        'frameSelection': 'Most populated actual LCD frame within the final 250 ms after the latest panel action; 6x integer scaling.',
    }, indent=2) + '\n')
finally:
    session.close()
if args.prune:
    import shutil
    for item in out.iterdir():
        if item.name != 'capture-report.json' and item.suffix != '.png':
            shutil.rmtree(item) if item.is_dir() and not item.is_symlink() else item.unlink()
