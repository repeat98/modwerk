"""Run isolated stock routines in a CPU emulator using a private, hash-bound OS.

No device access. UI/task callees are mocked where the C++ source says so.
This is not full editor execution, storage, concurrency, timing or audio proof.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

from inspect_stock import STOCK_MAIN_SHA256

ROOT = Path(__file__).resolve().parent


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--main', type=Path, required=True)
    parser.add_argument('--executable', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--kind', choices=('editor', 'storage', 'reader', 'coherence', 'worker', 'recorder', 'recorder-followup', 'recorder-bank', 'load', 'markers', 'pool-session', 'publication', 'refresh', 'clearing', 'waveform'), default='editor')
    args = parser.parse_args()
    source = ROOT / 'stock_probe' / {'editor': 'probe.cpp', 'storage': 'storage_probe.cpp',
                                     'reader': 'reader_probe.cpp',
                                     'coherence': 'coherence_probe.cpp',
                                     'worker': 'worker_probe.cpp', 'recorder': 'recorder_probe.cpp', 'recorder-followup': 'recorder_followup_probe.cpp', 'recorder-bank': 'recorder_bank_probe.cpp', 'load': 'load_probe.cpp', 'markers': 'marker_probe.cpp', 'pool-session': 'pool_session_probe.cpp', 'publication': 'publication_probe.cpp', 'refresh': 'refresh_probe.cpp', 'clearing': 'clearing_probe.cpp', 'waveform': 'waveform_probe.cpp'}[args.kind]
    if digest(args.main) != STOCK_MAIN_SHA256:
        parser.error('Expected original 1.40C MAIN; refusing another input.')
    if args.output.exists():
        parser.error('Use a new report path; preserve previous evidence.')
    result = subprocess.run([str(args.executable.resolve()), str(args.main.resolve())],
                            text=True, capture_output=True, timeout=120)
    inputs = [source]
    expected = digest(source)
    if args.kind in ('recorder-followup','recorder-bank'):
        names = (source.name, 'recorder_probe.cpp', '../preview_guard.c', '../preview_guard.h')
        inputs = [(ROOT / 'stock_probe' / name).resolve() for name in names]
        binding = ''.join(name + ':' + digest(path) + '\n' for name, path in zip(names, inputs))
        expected = hashlib.sha256(binding.encode()).hexdigest()
    if args.kind == 'waveform':
        names = ('waveform_probe.cpp', 'worker_probe.cpp', '../preview_guard.c', '../preview_guard.h')
        inputs = [(ROOT / 'stock_probe' / name).resolve() for name in names]
        binding = ''.join(name + ':' + digest(path) + '\n' for name, path in zip(names, inputs))
        expected = hashlib.sha256(binding.encode()).hexdigest()
    if args.kind in ('coherence', 'worker', 'recorder', 'load', 'clearing'):
        names = ('coherence_probe.cpp', '../planner.c', '../planner.h', '../planner_job.c',
                 '../planner_job.h', '../pcm_reader.c', '../pcm_reader.h')
        if args.kind in ('worker', 'recorder', 'load', 'clearing'):
            names = (args.kind + '_probe.cpp', '../preview_guard.c', '../preview_guard.h')
        inputs = [(ROOT / 'stock_probe' / name).resolve() for name in names]
        binding = ''.join(name + ':' + digest(path) + '\n' for name, path in zip(names, inputs))
        expected = hashlib.sha256(binding.encode()).hexdigest()
    if args.kind == 'markers':
        names = ('marker_probe.cpp', '../marker_edit.c', '../marker_edit.h', '../preview_session.h',
                 '../pcm_reader.h', '../planner_job.h', '../planner.h', '../preview_guard.h')
        inputs = [(ROOT / 'stock_probe' / name).resolve() for name in names]
        binding = ''.join(name + ':' + digest(path) + '\n' for name, path in zip(names, inputs))
        expected = hashlib.sha256(binding.encode()).hexdigest()
    if args.kind == 'pool-session':
        names = ('pool_session_probe.cpp', '../planner.c', '../planner.h', '../planner_job.c',
                 '../planner_job.h', '../pcm_reader.c', '../pcm_reader.h', '../preview_guard.c',
                 '../preview_guard.h', '../preview_session.c', '../preview_session.h')
        inputs = [(ROOT / 'stock_probe' / name).resolve() for name in names]
        binding = ''.join(name + ':' + digest(path) + '\n' for name, path in zip(names, inputs))
        expected = hashlib.sha256(binding.encode()).hexdigest()
    if 'SOURCE_SHA256: ' + expected not in result.stdout.splitlines():
        parser.error('Probe executable does not match current source; rebuild before recording evidence.')
    report = {
        'scope': ('isolated complete stock recorder entry with synthetic selected/pending/retained banks, delays and silent input; 48 initial cases plus 16 delayed follow-up calls; host guard, no scheduler, ISR, native admission or hardware'
                  if args.kind == 'recorder-bank' else 'isolated real recorder shortage/length-limit stops followed by actual queued worker dispatch; synthetic active state/silent input and host guard, 16 positive controls, 32 single follow-ups and four paired-recorder FIFO cases; no scheduler, ISR, UI consumer, manual-stop/overdub, native admission or hardware'
                  if args.kind == 'recorder-followup' else 'isolated ordinary Flex waveform reads/cache reuse and worker dispatch with synthetic memory, source write watches and an independent extrema oracle; no Static/recorder rendering, scheduler, UI consumer or hardware'
                  if args.kind == 'waveform' else 'real stock confirmed/cancelled slice deletion with synthetic settings, host guard and formatting/display/viewport/task mocks; no scheduler, native hooks or device'
                  if args.kind == 'clearing' else 'real stock editor binding/selection refresh with synthetic settings and viewport mock; no scheduler, transaction or device'
                  if args.kind == 'refresh' else 'real stock grid publication/pointer refresh with synthetic settings and display/progress/zero-search mocks; no scheduler, native transaction, persistence or device'
                  if args.kind == 'publication' else 'host preview session with real stock Flex page lookup/edit/release; synthetic ownership/identity/rate/tempo, no scheduler, native hooks or device'
                  if args.kind == 'pool-session' else 'portable candidate preparation with real stock record sort/sanitation; synthetic memory and explicit tempo/name/track mocks, no native Apply/Undo or device'
                  if args.kind == 'markers' else 'complete stock Flex replacement refusals with synthetic filesystem/header mocks and host guard; real release/allocation, no scheduler or device'
                  if args.kind == 'load' else 'complete stock recorder call with synthetic active state and silent inputs, host admission guard; no mocks, scheduler, ISR or device'
                  if args.kind == 'recorder' else 'isolated stock storage routines with synthetic memory IO and explicit follow-up mocks; no device access'
                  if args.kind == 'storage' else
                  'synthetic stock producer, queues, worker and completion posts with host admission guard; display mock, no scheduler/UI consumer/device access'
                  if args.kind == 'worker' else
                  'isolated stock edits, release and pool-to-host-reader previews; synthetic memory, no mocked callees or device access'
                  if args.kind == 'coherence' else
                  'isolated stock pool lookup and PCM conversion with synthetic memory and recorder mocks; no device access'
                  if args.kind == 'reader' else
                  'isolated stock CPU routines with explicit UI/task mocks; no device access'),
        'mainSha256': STOCK_MAIN_SHA256,
        'sourceSha256': {str(p.relative_to(ROOT)): digest(p) for p in
                         (ROOT / 'stock_probe.py', ROOT / 'inspect_stock.py', *inputs, ROOT / 'stock_probe/CMakeLists.txt')},
        'executableSha256': digest(args.executable),
        'exitCode': result.returncode, 'stdout': result.stdout.splitlines(),
        'stderrLines': len(result.stderr.splitlines()),
        'stderrSha256': hashlib.sha256(result.stderr.encode()).hexdigest(),
        'hardware': 'not tested', 'audio': 'not tested', 'stockPersistence': 'not tested',
    }
    with args.output.open('x') as output:
        output.write(json.dumps(report, indent=2) + '\n')
    print(result.stdout, end='')
    if result.stderr:
        print(result.stderr, end='')
    raise SystemExit(result.returncode)


if __name__ == '__main__':
    main()
