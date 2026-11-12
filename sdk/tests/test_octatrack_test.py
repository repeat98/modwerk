"""scripts/octatrack-test.py's parts that never touch a unit: it keeps nothing, takes one package, and writes its entry."""
import importlib.util
import pathlib
import sys
import unittest
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('octatrack_test', ROOT / 'scripts/octatrack-test.py')
octatest = importlib.util.module_from_spec(spec)
spec.loader.exec_module(octatest)

# A stand-in for `npm run device -- try`: says it runs, then rolls back on SIGINT, or says accepted when told to.
FAKE_TRIAL = '''
import signal, sys, time
# The handler only notes the interrupt: the test sends it as soon as it reads "running", which can be while that
# line is still being written, and printing from the handler then fails with a reentrant write.
stop = []
signal.signal(signal.SIGINT, lambda *a: stop.append(1))
print('trial: 0123456789abcdef… running', flush=True)
deadline = time.monotonic() + 30
while not stop and time.monotonic() < deadline:
    time.sleep(0.01)
print(sys.argv[1], flush=True)
'''


class DeviceTest(unittest.TestCase):
    def test_the_trial_is_never_accepted(self):
        command = octatest.trial_command('/x/e.mwrm', 300, '/tmp/s.sock')
        self.assertEqual(command[1:4], ['scripts/device.mjs', 'try', '/x/e.mwrm'])
        self.assertNotIn('--accept', command)

    def test_it_takes_one_package_before_reaching_the_unit(self):
        with mock.patch.object(sys, 'argv', ['octatrack-test.py', 'a.mwrm', 'b.mwrm']), \
                mock.patch.object(octatest.qualify, 'send', side_effect=AssertionError('reached the unit')):
            with self.assertRaises(SystemExit) as c: octatest.main()
        self.assertIn('One package a run', str(c.exception))

    def test_it_installs_and_removes_only_through_the_trial(self):
        seen = {}

        class FakeTrial:
            def __init__(self, command): seen['command'] = command
            def wait_started(self): seen['started'] = True
            def end(self, failures): seen['ended'] = True

        def run(args, pkgs, install, uninstall, **kw):
            install(pkgs); uninstall(pkgs, [])
            seen['kw'] = kw
            return dict(failures=[])

        with mock.patch.object(sys, 'argv', ['octatrack-test.py', '--share', '9', 'e.mwrm']), \
                mock.patch.object(octatest, 'Trial', FakeTrial), \
                mock.patch.object(octatest.qualify, 'package', return_value=dict(path='e.mwrm')), \
                mock.patch.object(octatest.qualify, 'send', side_effect=AssertionError('the session\'s try and remove Keep')), \
                mock.patch.object(octatest.qualify, 'run', run), \
                mock.patch.object(octatest.qualify, 'finish') as finish:
            octatest.main()
        self.assertNotIn('--accept', seen['command'])
        self.assertTrue(seen['started'] and seen['ended'])
        self.assertEqual(seen['kw'], dict(selftest=True, inventory=True))
        self.assertEqual(finish.call_args.kwargs['command'], 'device:test')

    @unittest.skipIf(sys.platform == 'win32', 'the trial is ended with SIGINT, which a Windows child process cannot be sent')
    def test_the_trial_is_rolled_back_and_checked(self):
        trial = octatest.Trial([sys.executable, '-c', FAKE_TRIAL, 'rolled back'])
        trial.wait_started(10)
        failures = []
        trial.end(failures)
        self.assertEqual(failures, [])
        kept = octatest.Trial([sys.executable, '-c', FAKE_TRIAL, 'accepted'])
        kept.wait_started(10)
        kept.end(failures)
        self.assertEqual(failures, ['the trial process says accepted: the package was kept'])

    def test_the_entry_says_nothing_was_kept_and_what_is_left(self):
        result = dict(args=['e.mwrm'], crash=False, failures=[], packages=[dict(file='e.mwrm', name='E-Verb', sha256='5f' * 32)],
                      modules=[], together=None, selftest='selftest passed; modules 1/1 intact', inventory='unchanged')
        entry = octatest.qualify.testing_entry(result, '2026-11-12', title='Agent test on the unit', command='device:test',
                                               notes=[octatest.NOTE], left=octatest.LEFT_FOR_THE_DEVELOPER)
        self.assertIn('### Agent test on the unit, 2026-11-12', entry)
        self.assertIn('Command: `npm run device:test -- e.mwrm`', entry)
        self.assertIn('- Installed as a trial in RAM and rolled back at the end: nothing was kept', entry)
        self.assertIn('- Self-test with the package installed: selftest passed', entry)
        self.assertIn('- Inventory at the end: the same as before the run', entry)
        self.assertIn('Left for the developer at the unit: listening', entry)
        self.assertNotIn('Not covered by this run', entry)


if __name__ == '__main__':
    unittest.main()
