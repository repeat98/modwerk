"""Driver retry safety: only a proved pre-entry refusal permits another call."""
import tempfile
import unittest
from pathlib import Path
from boot_source_native import call_original


class FakePort:
    def __init__(self, folder, replies):
        self.log = (Path(folder) / 'private.log').open('wb')
        self.replies = iter(replies)
        self.commands = []

    def command(self, command):
        self.commands.append(command)
        answer = 'ok' if command.startswith('run ') else next(self.replies)
        self.log.write((answer + '\n').encode('ascii'))
        if answer.startswith('err'):
            raise RuntimeError('refused')
        return answer


class RetrySafety(unittest.TestCase):
    def test_success_is_never_replayed(self):
        with tempfile.TemporaryDirectory() as work:
            port = FakePort(work, ['ok d0=0x3'])
            with port.log:
                self.assertEqual(call_original(port, 0x46010000, 1, 2), 3)
                self.assertEqual(port.commands, ['call 0x46010000 0x1 0x2'])

    def test_only_exact_preentry_refusal_advances_and_retries(self):
        with tempfile.TemporaryDirectory() as work:
            port = FakePort(work, ["err did not return: callAsMain(0x46010000): pc is 0x4000c9d8, not main's spin 0x4001fc9c", 'ok d0=0'])
            with port.log:
                self.assertEqual(call_original(port, 0x46010000), 0)
                self.assertEqual(port.commands, ['call 0x46010000', 'run 0.01', 'call 0x46010000'])

    def test_uncertain_execution_or_different_contract_is_terminal(self):
        errors = [
            'err did not return: callAsMain(0x46010000) did not return in 400000000 steps',
            'err CPU stopped',
            "err did not return: callAsMain(0x46010004): pc is 0x4000c9d8, not main's spin 0x4001fc9c",
            "err did not return: callAsMain(0x46010000): pc is 0x4000c9d8, not main's spin 0x4001fc9e",
        ]
        for error in errors:
            with self.subTest(error=error), tempfile.TemporaryDirectory() as work:
                port = FakePort(work, [error, 'ok d0=0'])
                with port.log, self.assertRaises(RuntimeError):
                    call_original(port, 0x46010000)
                self.assertEqual(port.commands, ['call 0x46010000'])

    def test_explicit_long_source_readiness_wait(self):
        with tempfile.TemporaryDirectory() as work:
            port = FakePort(work, ["err did not return: callAsMain(0x46010000): pc is 0x4008e556, not main's spin 0x4001fc9c", 'ok d0=0'])
            with port.log:
                self.assertEqual(call_original(port, 0x46010000, wait_ms=5, attempts=2), 0)
                self.assertEqual(port.commands, ['call 0x46010000', 'run 5', 'call 0x46010000'])

    def test_invalid_wait_budget_never_calls(self):
        cases = ({'wait_ms': 0}, {'wait_ms': -1}, {'wait_ms': float('nan')},
                 {'wait_ms': float('inf')}, {'wait_ms': 10.01}, {'wait_ms': True},
                 {'attempts': 0}, {'attempts': 201}, {'attempts': 1.5}, {'attempts': True})
        for options in cases:
            with self.subTest(options=options), tempfile.TemporaryDirectory() as work:
                port = FakePort(work, ['ok d0=0'])
                with port.log, self.assertRaises(ValueError):
                    call_original(port, 0x46010000, **options)
                self.assertEqual(port.commands, [])

    def test_readiness_run_failure_is_terminal(self):
        class RunFailure(FakePort):
            def command(self, command):
                if command.startswith('run '):
                    self.commands.append(command)
                    raise RuntimeError('CPU stopped while reaching readiness')
                return super().command(command)
        with tempfile.TemporaryDirectory() as work:
            port = RunFailure(work, ["err did not return: callAsMain(0x46010000): pc is 0x4008e556, not main's spin 0x4001fc9c", 'ok d0=0'])
            with port.log, self.assertRaisesRegex(RuntimeError, 'CPU stopped'):
                call_original(port, 0x46010000, wait_ms=5)
            self.assertEqual(port.commands, ['call 0x46010000', 'run 5'])

    def test_preentry_wait_is_bounded(self):
        with tempfile.TemporaryDirectory() as work:
            port = FakePort(work, ["err did not return: callAsMain(0x46010000): pc is 0x4000c9d8, not main's spin 0x4001fc9c"] * 200)
            with port.log, self.assertRaisesRegex(RuntimeError, 'no call executed'):
                call_original(port, 0x46010000)
            self.assertEqual(port.commands.count('call 0x46010000'), 200)
            self.assertEqual(port.commands.count('run 0.01'), 200)


if __name__ == '__main__':
    unittest.main()
