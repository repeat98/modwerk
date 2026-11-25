"""Check pre-publication refusal on a candidate-sized base missing the feature."""
import argparse
import json
from pathlib import Path
import shutil
import tempfile

from mkii_panel import panel, peek

parser = argparse.ArgumentParser(description=__doc__)
for name in ('emulator', 'base', 'symbols', 'synthetic_card', 'receipt'):
    parser.add_argument(name, type=Path)
parser.add_argument('--public-registry', action='store_true', help='Probe only registered lifecycle rows on the public base')
args = parser.parse_args()
if not __debug__:
    parser.error('Assertions are required')
symbols = json.loads(args.symbols.read_text())
with tempfile.TemporaryDirectory() as tmp:
    scratch = Path(tmp) / 'disposable.img'
    shutil.copyfile(args.synthetic_card, scratch)
    with panel(args.emulator, args.base, scratch, ['--card-rw', '--names-early', '--dsp']) as cmd:
        def word(addr):
            return int.from_bytes(peek(cmd, addr, 4), 'big')

        def call(name, *args):
            for attempt in range(200):
                try:
                    reply = cmd('call ' + ' '.join(hex(v) for v in (symbols[name], *args)))
                    return int(reply.split('d0=')[1].split()[0], 16)
                except RuntimeError as error:
                    if "not main's spin" not in str(error):
                        raise
                    cmd('run 3')
            raise RuntimeError('Main task busy')

        def inventory():
            # The control has the same registry and 66 slots as the candidate.
            rows = [word(word(symbols['modwerk_runtime_event_row'] + 4*(n-4))) for n in ((42,40,41) if args.public_registry else (42,40,41,63,64,65))]
            return dict(callbacks=rows, active=call('modwerk_runtime_active'),
                        pool=call('modwerk_runtime_free', 0), owners=word(symbols['core:owners']))

        module = 0x34e1e379
        for ms, key in [(3000,0x32),(3000,0x32),(500,0x31)]:
            cmd(f'run {ms}')
            for value in (1 << (key % 8), 0):
                cmd(f'key {32+key//8} {value}')
                cmd('run 35')
        cmd('run 2000')
        before = inventory()
        assert before['active'] == before['owners'] == 0 and not any(before['callbacks'])
        assert call('modwerk_modset_is_off', module)
        assert call('modwerk_modset_switch', module, 1) == 1
        for attempt in range(100):
            cmd('run 15')
            status = word(symbols['modwerk_modset_switch_result'])
            if status != 1:
                break
        # The public table ends at 62. Its length check precedes feature
        # admission: MALFORMED (1), versus CONFLICT (3) on an equal-width twin.
        expected = 0x101 if args.public_registry else 0x103
        assert status == expected, (expected, status)
        after = inventory()
        assert before == after and call('modwerk_modset_is_off', module)
        args.receipt.write_text(json.dumps(dict(refusal=status, before=before, after=after)))
