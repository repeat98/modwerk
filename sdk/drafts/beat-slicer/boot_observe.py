"""Observe a source-loaded stock project and plan against its actual Flex PCM.

Private emulator/card only. No device, native injection, module installation,
panel edits or card write-back. Supply a disposable project created/saved by
stock and its original 44.1 kHz stereo 16-bit WAV. This is a stopped-snapshot
research probe, not a live native source service or hardware qualification.
"""
import argparse
import ctypes as C
from fractions import Fraction
import hashlib
import json
import os
from pathlib import Path
import selectors
import shutil
import struct
import subprocess
import time
import wave

from inspect_stock import STOCK_MAIN_SHA256
from test_planner import Request, Plan, READ

ROOT = Path(__file__).resolve().parent


class Record(C.Structure):
    _fields_ = [(name, C.c_uint32) for name in ('start', 'end', 'loop')]


class Table(C.Structure):
    _fields_ = [('count', C.c_uint32), ('records', Record * 64)]


class Edit(C.Structure):
    _fields_ = [(name, C.c_uint32) for name in ('frames', 'trim_start', 'trim_end', 'added')]
    _fields_ += [('before', Table), ('after', Table)]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


class Port:
    def __init__(self, command, work):
        # Some retained emulator builds buffer their ready line when piped.
        # The child then waits for commands while its parent waits for ready.
        if shutil.which('stdbuf') and Path(command[0]).name != 'stdbuf':
            command = ['stdbuf', '-oL', *command]
        self.err = (work / 'emulator-stderr.private.log').open('wb')
        self.log = (work / 'emulator-stdout.private.log').open('wb')
        self.process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                        stderr=self.err, cwd=work,
                                        env={k: v for k, v in os.environ.items() if not k.startswith('OT_')})
        self.poll = selectors.DefaultSelector()
        self.poll.register(self.process.stdout, selectors.EVENT_READ)
        self.pending = b''
        self.loaded = False

    def reply(self, prefixes, timeout=60):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            while b'\n' in self.pending:
                line, self.pending = self.pending.split(b'\n', 1)
                self.log.write(line + b'\n')
                if b'load run ended: LOAD PROJECT handled' in line:
                    self.loaded = True
                if line.startswith(b'err'):
                    raise RuntimeError('Emulator refused a command; private log retained.')
                if line.startswith(prefixes):
                    return line.decode('ascii')
            if self.process.poll() is not None:
                chunk = self.process.stdout.read()
                if chunk:
                    self.pending += chunk
                    continue
                raise RuntimeError('Emulator exited before the expected reply.')
            if self.poll.select(timeout=1):
                chunk = os.read(self.process.stdout.fileno(), 65536)
                if not chunk:
                    raise RuntimeError('Emulator output closed.')
                self.pending += chunk
        raise RuntimeError('Emulator command timed out; no successful observation recorded.')

    def command(self, text, prefixes=b'ok', timeout=60):
        self.log.write(('> ' + text + '\n').encode('ascii'))
        self.process.stdin.write((text + '\n').encode('ascii'))
        self.process.stdin.flush()
        return self.reply(prefixes, timeout=timeout)

    def peek(self, address, size):
        if size < 1 or size > 4096:
            raise ValueError('Bounded reads only.')
        response = self.command(f'peek {address:#x} {size}', b'peek ')
        data = bytes.fromhex(response.split()[1])
        if len(data) != size:
            raise RuntimeError('Short emulator read.')
        return data

    def close(self):
        try:
            if self.process.poll() is None:
                self.command('quit')
                self.process.wait(timeout=10)
        finally:
            if self.process.poll() is None:
                self.process.terminate()
                self.process.wait(timeout=10)
            self.poll.close()
            self.log.close()
            self.err.close()


def observe(port, slot, expected_pcm, expected_bpm, expected_markers, expected_marker_hash):
    def words(address, count):
        return struct.unpack('>' + 'I' * count, port.peek(address, 4 * count))
    controls = port.peek(0x46c922c4 + 44 * slot, 44)
    c = struct.unpack('>11I', controls)
    settings = port.peek(0x100b14f0 + 1096 * slot, 1096)
    s = struct.unpack('>274I', settings)
    frames = len(expected_pcm) // 4
    assert words(0x46105408, 1)[0] != 0, 'pool not ready'
    assert c[0] == 3 and c[2] == 0 and c[4] == frames, 'loaded format/status/length differs'
    # Verify the runtime descriptor, without retaining a copied stock table.
    descriptor = words(0x80003c20 + 3 * 16, 4)
    assert descriptor[1:3] == (1536, 4), 'runtime geometry differs'
    pages_at, offsets_at, used, total = words(0x80006914, 4)
    # Exact normal maps observed in this pinned stock build; refuse other states.
    assert pages_at == 0x46c2e9c0 and offsets_at == 0x46c2e580, 'non-normal map publication'
    assert 0 < used <= total <= 14602, 'map capacity differs'
    offset = words(offsets_at + 4 * slot, 1)[0]
    owned = int.from_bytes(port.peek(0x46c75e88 + 2 * slot, 2), 'big')
    assert owned >= (frames + 1535) // 1536 and offset + owned <= used, 'allocation incomplete'
    pages = struct.unpack('>' + 'H' * owned, port.peek(pages_at + 2 * offset, 2 * owned))
    assert all(page < 14602 for page in pages), 'physical page outside traced pool'
    pcm = bytearray()
    for page in pages:
        count = min(6144, len(expected_pcm) - len(pcm))
        if count == 0:
            break
        for at in range(0, count, 4096):
            pcm.extend(port.peek(0x40a955e0 + page * 6144 + at, min(4096, count - at)))
    assert bytes(pcm) == expected_pcm, 'stock-loaded PCM differs from original WAV'
    assert s[75:78] == (0, frames, 0), 'expected whole-sample trim changed'
    assert s[69] == expected_bpm and s[273] == expected_markers, 'saved sample metadata differs'
    marker_hash = hashlib.sha256(settings[312:1080] + settings[1092:1096]).hexdigest()
    assert marker_hash == expected_marker_hash, 'complete saved marker table differs'
    assert 0 <= s[273] <= 64, 'invalid marker count'
    markers = [s[78 + 3 * i:81 + 3 * i] for i in range(s[273])]
    assert all(0 <= start < end <= frames and end - start >= 64 and
               (loop == 0xffffffff or start <= loop < end) for start, end, loop in markers)
    assert all(markers[i - 1][0] < markers[i][0] for i in range(1, len(markers)))
    project_bpm = words(0x80001814, 1)[0]
    assert 720 <= project_bpm <= 7200, 'project tempo outside supported bounds'
    # No run/key/call occurs between these reads: this is a paused snapshot,
    # not proof of exclusion against a concurrent native writer.
    assert port.peek(0x46c922c4 + 44 * slot, 44) == controls
    assert port.peek(0x100b14f0 + 1096 * slot, 1096) == settings
    full_table = [s[78 + 3 * i:81 + 3 * i] for i in range(64)]
    return bytes(pcm), full_table, project_bpm, {
        'frames': frames, 'encoding': '16-bit stereo, big endian',
        'ownedPages': owned, 'runtimeGeometryMatches': True, 'wholePcmMatchesOriginal': True,
        'pcmSha256': hashlib.sha256(pcm).hexdigest(), 'settingsSha256': hashlib.sha256(settings).hexdigest(),
        'markerTableSha256': marker_hash,
        'markerCount': len(markers), 'sampleBpm24': s[69], 'projectBpm24': project_bpm,
    }


def plan_snapshot(pcm, records, marker_count, sample_bpm, project_bpm, work):
    library = work / 'planner.so'
    flags = ['-std=c99', '-O2', '-Wall', '-Wextra', '-Werror', '-pedantic', '-shared', '-fPIC']
    cc = os.environ.get('CC', 'cc')
    subprocess.run([cc, *flags, str(ROOT / 'planner.c'), str(ROOT / 'marker_edit.c'), '-o', str(library)], check=True)
    lib = C.CDLL(str(library))
    lib.bs_preview.argtypes = [C.POINTER(Request), C.POINTER(Plan)]
    lib.bs_preview.restype = C.c_int
    lib.bs_marker_prepare.argtypes = [C.POINTER(Table), C.POINTER(Plan), C.c_uint32,
                                     C.c_uint32, C.c_uint32, C.POINTER(Edit)]
    lib.bs_marker_prepare.restype = C.c_int
    frames = len(pcm) // 4
    @READ
    def read(_context, frame, out):
        if frame >= frames:
            return 1
        left, right = struct.unpack_from('>hh', pcm, 4 * frame)
        out[0], out[1] = left * 256, right * 256
        return 0
    starts = (C.c_uint32 * marker_count)(*(r[0] for r in records[:marker_count]))
    table = Table(count=marker_count)
    for i, record in enumerate(records):
        table.records[i] = Record(*record)
    reasons = ('ready', 'invalid', 'capacity', 'missing-existing', 'ordinal-conflict', 'short-region', 'overlap')
    results = []
    for source in (0, 1):
        for snap in (0, 1):
            request = Request(sample_rate=44100, trim_end=frames, sample_bpm24=sample_bpm,
                              project_bpm24=project_bpm, beats=1, tempo_source=source,
                              existing_count=marker_count, existing=starts, snap=snap, read=read)
            plan = Plan()
            assert lib.bs_preview(C.byref(request), C.byref(plan)) == 0, 'preview refused'
            got = list(plan.starts)[:plan.count]
            assert plan.bpm24 == (project_bpm if source else sample_bpm)
            assert set(starts).issubset(got) and got == sorted(set(got))
            if not snap:
                step = Fraction(44100 * 60 * 24, plan.bpm24)
                expected, i = set(starts), 0
                while True:
                    point = (2 * i * step.numerator + step.denominator) // (2 * step.denominator)
                    if point >= frames:
                        break
                    expected.add(point)
                    i += 1
                assert got == sorted(expected), 'independent rational grid differs'
            edit = Edit()
            C.memset(C.byref(edit), 0xa5, C.sizeof(edit))
            untouched = bytes(edit)
            status = lib.bs_marker_prepare(C.byref(table), C.byref(plan), frames, 0, frames, C.byref(edit))
            assert 0 <= status < len(reasons), 'unexpected candidate status'
            if status:
                assert bytes(edit) == untouched, 'refusal changed candidate output'
            else:
                assert bytes(edit.before) == bytes(table), 'full original table not retained'
                for i in range(marker_count):
                    assert bytes(edit.after.records[i]) == bytes(table.records[i]), 'old record/ordinal changed'
            results.append({'tempoSource': 'project' if source else 'sample', 'snap': bool(snap),
                            'count': plan.count, 'retainsExistingStarts': True,
                            'fadeWarnings': sum(bool(x) for x in plan.needs_fade[:plan.count]),
                            'endFadeWarning': bool(plan.end_needs_fade), 'markerPreflight': reasons[status]})
    return results, subprocess.check_output([cc, '--version'], text=True).splitlines()[0], flags


def main():
    p = argparse.ArgumentParser(description=__doc__)
    for name in ('emulator', 'main', 'card', 'wav', 'output'):
        p.add_argument('--' + name, type=Path, required=True)
    p.add_argument('--card-sha256', required=True)
    p.add_argument('--set-name', required=True)
    p.add_argument('--project-name', required=True)
    p.add_argument('--slot', type=int, default=0)
    p.add_argument('--sample-bpm24', type=int, required=True)
    p.add_argument('--markers', type=int, required=True)
    p.add_argument('--marker-sha256', required=True, help='Complete 64 records followed by count, big endian')
    a = p.parse_args()
    if not __debug__:
        p.error('Run without Python optimization so every research assertion remains enabled.')
    repo, out = ROOT.parents[2], a.output.resolve()
    if out == repo or repo in out.parents or out.exists():
        p.error('Use a new private output directory outside the repository.')
    if any(not name or name in ('.', '..') or len(name) > 64 or '/' in name or '\\' in name or
           not name.isascii() or any(ord(c) < 32 for c in name) for name in (a.set_name, a.project_name)):
        p.error('Use plain ASCII fixture directory names.')
    if not 0 <= a.slot < 128 or not 0 <= a.markers <= 64 or not 720 <= a.sample_bpm24 <= 7200:
        p.error('Unsupported expected metadata.')
    if digest(a.main) != STOCK_MAIN_SHA256 or digest(a.card) != a.card_sha256:
        p.error('Private stock/card identity mismatch.')
    with wave.open(str(a.wav), 'rb') as wav:
        if (wav.getnchannels(), wav.getsampwidth(), wav.getframerate()) != (2, 2, 44100):
            p.error('This research fixture requires original stereo 16-bit 44.1 kHz PCM.')
        raw = wav.readframes(wav.getnframes())
    if not raw or len(raw) > 4 * 1536 * 1024:
        p.error('Use a bounded original test sample.')
    expected_pcm = b''.join(raw[i:i + 2][::-1] for i in range(0, len(raw), 2))
    if Path('/dev/shm').exists() and os.statvfs('/dev/shm').f_bavail * os.statvfs('/dev/shm').f_frsize < 128 * 1024 * 1024:
        p.error('Two DSP cores require at least 128 MiB free shared memory; use --shm-size 256m.')
    out.mkdir(parents=True)
    card = out / 'card.private.img'
    shutil.copyfile(a.card, card)
    command = [str(a.emulator.resolve()), '--image', str(a.main.resolve()), '--card', str(card),
               '--mount', '--set', a.set_name, '--project', a.project_name, '--load-ms', '90000',
               '--dsp', '--frame', '--ms', '3000', '--interactive', '--main-level', 'off', '--rtc', 'host', '--mkii']
    port = Port(command, out)
    try:
        port.reply(b'ready ', timeout=600)
        assert port.loaded, 'LOAD PROJECT did not complete'
        pcm, markers, project_bpm, observation = observe(port, a.slot, expected_pcm, a.sample_bpm24, a.markers, a.marker_sha256)
        plans, compiler, flags = plan_snapshot(pcm, markers, observation['markerCount'], a.sample_bpm24, project_bpm, out)
        # No preview may mutate the live state, even though this probe uses a copy.
        _, _, _, after = observe(port, a.slot, expected_pcm, a.sample_bpm24, a.markers, a.marker_sha256)
        assert after == observation
    finally:
        port.close()
    assert digest(card) == a.card_sha256 and digest(a.card) == a.card_sha256, 'card changed'
    report = {
        'scope': 'full stock emulator project/file load and paused Flex PCM snapshot; host planning only, no installed module/native ownership/device',
        'sourceSha256': {n: digest(ROOT / n) for n in ('boot_observe.py', 'inspect_stock.py', 'test_planner.py',
            'planner.c', 'planner.h', 'marker_edit.c', 'marker_edit.h', 'preview_session.h',
            'pcm_reader.h', 'preview_guard.h', 'planner_job.h')},
        'mainSha256': STOCK_MAIN_SHA256, 'emulatorSha256': digest(a.emulator),
        'cardSha256': a.card_sha256, 'originalWavSha256': digest(a.wav),
        'projectLoadCompleted': True, 'observation': observation, 'previews': plans,
        'compiler': compiler, 'flags': flags, 'cardUnchanged': True,
        'exitCode': 0,
        'setup': 'stock 1.40C, MKII panel, both DSPs, frame scheduling, normal project/file load; no card write-back or injected calls; paused read snapshots',
        'hardware': 'not tested', 'audio': 'not qualified', 'timing': 'not measured',
        'nativeOwnership': 'not implemented; emulator paused during reads',
    }
    (out / 'observation.json').write_text(json.dumps(report, indent=2) + '\n')
    print('PASS: real stock project/file load, complete PCM match, four host previews and unchanged settings/card')


if __name__ == '__main__':
    main()
