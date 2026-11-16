#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""The agent's test of one module on the unit, as a trial that is never kept (/modwerk-test-on-unit, stage 1).

  npm run device:test -- [--seconds 30] [--soak SECONDS] [--hold SECONDS] [--share SOCKET] [--testing-entry FILE] PKG.mwrm

The run of `npm run device:qualify` (the module alone on T1 and T5 with the load meters, then on every track while the
pattern plays, its knobs swept, the Parts and a bank switched, an optional soak, the Part restored, the loader, crash
and stall counters compared), with these differences:
- The package goes in as a trial in RAM through `npm run device -- try` on the session's shared socket, without
  --accept, and SIGINT rolls it back at the end. Nothing is kept: the card's set and the flashed base's modules stay
  as they were, so no --keeps-ok.
- It reads the self-test with the package installed, and checks that the inventory at the end equals the one before.
- One package a run (bases without whole-set trials take one change), and no crash test (a restart ends the trial
  outside the run).

Start the session with `npm run device -- serve --share /tmp/modwerk-share.sock`, on a development base, transport
stopped, on a bank and Part whose working copy equals its saved one (docs/OCTATRACK_DRIVING.md). --testing-entry FILE
writes what the run saw, and what it leaves to the developer at the unit, as a TESTING.md entry. Prints one JSON
summary; exit status 1 on a failure. If this process dies mid-trial, unplug USB: the base rolls back what was not kept."""
import argparse, importlib.util, os, pathlib, shutil, signal, subprocess, threading

ROOT = pathlib.Path(__file__).resolve().parents[1]
_spec = importlib.util.spec_from_file_location('octatrack_qualify', ROOT / 'scripts/octatrack-qualify.py')
qualify = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(qualify)

SHARE = os.environ.get('MODWERK_SHARE_SOCKET', '/tmp/modwerk-share.sock')
LEFT_FOR_THE_DEVELOPER = ('listening (how it sounds and plays, timing by ear)', 'MIDI, scenes and recording',
                          'the module beside the other modules installed on the unit', 'the Keep, the power cycle and what survives it')
NOTE = 'Installed as a trial in RAM and rolled back at the end: nothing was kept'


def trial_command(path, seconds, share):
    """`npm run device -- try` without --accept: rolled back when its time ends or on SIGINT (scripts/device.mjs)."""
    return [shutil.which('node') or 'node', 'scripts/device.mjs', 'try', path, '--seconds', str(seconds), '--socket', share]


class Trial:
    """The trial process, its output collected as it comes."""

    def __init__(self, command):
        self.lines, self.started = [], threading.Event()
        self.proc = subprocess.Popen(command, cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        self.reader = threading.Thread(target=self._read, daemon=True)
        self.reader.start()

    def _read(self):
        for line in self.proc.stdout:
            line = line.rstrip()
            self.lines.append(line)
            qualify.log('  trial |', line)
            if self.running(): self.started.set()
        self.started.set()  # it ended: wake the waiter

    def running(self):
        return any(l.startswith('trial:') and l.endswith('running') for l in self.lines)

    def wait_started(self, seconds=60):
        self.started.wait(seconds)
        if not self.running(): raise RuntimeError('the trial did not start: ' + ' / '.join(self.lines[-5:] or ['no output']))

    def end(self, failures):
        """Roll the trial back (SIGINT, as Ctrl-C does) and check that it says so."""
        if self.proc.poll() is None: self.proc.send_signal(signal.SIGINT)
        try:
            self.proc.wait(60)
        except subprocess.TimeoutExpired:
            self.proc.kill()
            failures.append('the trial did not end within 60 s of SIGINT: unplug USB, the base rolls back what was not kept')
            return
        self.reader.join(5)
        self.proc.stdout.close()
        if 'accepted' in self.lines: failures.append('the trial process says accepted: the package was kept')
        elif self.running() and not any(l.startswith('rolled back') for l in self.lines):
            failures.append('the trial did not report its rollback: ' + ' / '.join(self.lines[-3:]))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--seconds', type=int, default=30)
    ap.add_argument('--soak', type=int, default=0, help='seconds of soak with the module placed, playing')
    ap.add_argument('--hold', type=int, default=0, help='the longest the trial may last (default: enough for the run)')
    ap.add_argument('--share', default=SHARE, help='the socket `npm run device -- serve --share` shares the unit on')
    ap.add_argument('--testing-entry', metavar='FILE', help='also write what the run saw as a TESTING.md entry to FILE')
    ap.add_argument('packages', nargs='+')
    args = ap.parse_args()
    if len(args.packages) != 1:
        raise SystemExit('One package a run: a trial on a base without whole-set trials takes one change. Run it once per package.')
    if not args.share.isdigit() and not os.path.exists(args.share):
        raise SystemExit('Nothing shares the unit on %s: start the session with `npm run device -- serve --share %s`.' % (args.share, args.share))
    args.crash = False
    pkgs = [qualify.package(p) for p in args.packages]
    hold = args.hold or min(3600, 300 + 2 * args.seconds + 2 * args.soak)
    trials = []

    def install(pkgs):
        trials.append(Trial(trial_command(os.path.abspath(pkgs[0]['path']), hold, args.share)))
        trials[0].wait_started()

    def uninstall(pkgs, failures):
        for trial in trials: trial.end(failures)

    result = qualify.run(args, pkgs, install, uninstall, selftest=True, inventory=True)
    qualify.finish(result, args, title='Agent test on the unit', command='device:test', notes=[NOTE], left=LEFT_FOR_THE_DEVELOPER)


if __name__ == '__main__':
    main()
