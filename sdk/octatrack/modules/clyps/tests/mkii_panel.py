"""Interactive MKII emulator transport from the CLYPS fixture."""
from contextlib import contextmanager
from subprocess import PIPE, Popen


@contextmanager
def panel(emulator, main, card, extra=()):
    args = [emulator, '--image', main, '--interactive', '--max', '400000000000',
            '--mkii', '--mount', '--set', 'MODWERK', '--project', 'GATE3',
            '--card', card, '--load-ms', '20000', '--frame', '--internal-clock',
            '--rtc', '1000000000', *extra]
    with Popen(args, stdin=PIPE, stdout=PIPE, text=True) as process:
        try:
            for line in process.stdout:
                if line.startswith('ready '):
                    break
            else:
                raise RuntimeError('Emulator exited before panel initialization')

            def command(line):
                process.stdin.write(line + '\n')
                process.stdin.flush()
                reply = process.stdout.readline().strip()
                if not reply or reply.startswith('err') or ('stop=' in reply and 'stop=time' not in reply):
                    raise RuntimeError(f'{line}: {reply}')
                return reply

            yield command
        finally:
            if process.poll() is None:
                process.terminate()


def peek(command, address, size):
    return bytes.fromhex(command(f'peek {address:#x} {size}').split()[1])
