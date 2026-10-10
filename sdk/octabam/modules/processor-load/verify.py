#!/usr/bin/env python3
"""PROCESSOR LOAD native smoke on the ColdFire emulator: retain summaries only, never firmware/RAM/card bytes.

Boots a local MAIN OS image that carries PROCESSOR LOAD on an empty scratch card and checks, through the
emulator's line protocol: the meter arms after start-up and counts audio blocks; the TEMPO header poke is in
place; the TEMPO popup opens and the meter's text is its mean ("47%", "!" from 70); FUNC held gives the
longest block ("W<n>"); a playing transport keeps reading; with the tail's timer-reset limit forced to 0 in
emulator RAM no block is counted and the popup reads "--%" / "W--", and after restoring it the meter reads
again; TEMPO closes the popup. pl_stats / pl_state are the DRAM unit's symbols in the image under test
(--pl-stats; 0x40a95900 when PROCESSOR LOAD is the only DRAM module). The emulator, image and card stay local."""
import argparse, hashlib, importlib.util, json, os, selectors, subprocess, tempfile, time
from pathlib import Path

KEYS = {'FUNC': 0x2d, 'PLAY': 0x28, 'STOP': 0x27, 'TEMPO': 0x18}
SYS_UP, TEMPOWIN, HEADER_Y = 0x460d180e, 0x460d16a0, 0x4004b5b4
TAIL_LIMIT = 0x1a          # pl_tail + 0x1a: the immediate of `cmpi.l #BODY_MAX,%d0` (pl_stats - 0x2e2)


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    obj = importlib.util.module_from_spec(spec); spec.loader.exec_module(obj); return obj


class Port:
    def __init__(self, command, cwd):
        self.process = subprocess.Popen(command, cwd=cwd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                        env={k: v for k, v in os.environ.items() if not k.startswith('OT_')})
        self.poll = selectors.DefaultSelector(); self.poll.register(self.process.stdout, selectors.EVENT_READ)
        self.pending = b''; self.rows = [0] * 8; self.reply((b'ready ',))

    def reply(self, prefixes):
        deadline = time.monotonic() + 300
        while True:
            while b'\n' in self.pending:
                line, self.pending = self.pending.split(b'\n', 1)
                if line.startswith(prefixes):
                    if line.startswith(b'err'): raise RuntimeError(line.decode())
                    return line.decode()
            if time.monotonic() > deadline or self.process.poll() is not None: raise RuntimeError('Emulator stopped or timed out')
            if self.poll.select(timeout=1):
                data = os.read(self.process.stdout.fileno(), 65536)
                if not data: raise RuntimeError('Emulator exited')
                self.pending += data

    def send(self, line, prefix=b'ok'):
        self.process.stdin.write((line + '\n').encode()); self.process.stdin.flush()
        answer = self.reply((prefix, b'err'))
        if line.startswith('run ') and 'stop=time' not in answer: raise RuntimeError('Emulator did not complete panel action')
        return answer

    def run(self, ms): self.send('run ' + str(ms))

    def key(self, name, down):
        c = KEYS[name]; r = c >> 3; b = 1 << (c & 7)
        self.rows[r] = (self.rows[r] | b) if down else (self.rows[r] & ~b)
        self.send(f'key {0x20 | r} {self.rows[r]}'); self.run(150)

    def press(self, name): self.key(name, True); self.key(name, False)
    def peek(self, addr, n): return bytes.fromhex(self.send(f'peek {addr:#x} {n}', b'peek ').split()[-1])
    def poke(self, addr, data): self.send(f'poke {addr:#x} {data.hex()}')
    def u32(self, addr): return int.from_bytes(self.peek(addr, 4), 'big')

    def close(self):
        try: self.send('quit'); self.process.wait(timeout=10)
        finally:
            if self.process.poll() is None: self.process.terminate(); self.process.wait(timeout=10)
            self.poll.close()


def meter(port, stats):
    st, ss = port.peek(stats, 32), port.peek(stats + 32, 52)
    u = lambda b, o: int.from_bytes(b[o:o + 4], 'big'); s = lambda b, o: int.from_bytes(b[o:o + 4], 'big', signed=True)
    t = lambda b, o: b[o:o + 8].split(b'\0')[0].decode('latin1')
    return dict(armed=u(st, 4), count=u(st, 20), percent=s(ss, 16), worst=s(ss, 20), func=u(ss, 32), text=t(ss, 36), wtext=t(ss, 44))


def mean_text(p): return '--%' if p < 0 else f'{p}%' + ('!' if p >= 70 else '')


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--output', type=Path, required=True); p.add_argument('--emulator', type=Path, required=True)
    p.add_argument('--image', type=Path, required=True); p.add_argument('--image-sha256', required=True)
    p.add_argument('--sdk', type=Path, required=True); p.add_argument('--pl-stats', type=lambda x: int(x, 0), default=0x40a95900)
    a = p.parse_args()
    image = a.image.resolve()
    assert hashlib.sha256(image.read_bytes()).hexdigest() == a.image_sha256, 'image fingerprint'
    codec = module('card', a.sdk.resolve() / 'tools/emu/emu_card.py')
    stats = a.pl_stats; checks = {}
    report = {'imageSha256': a.image_sha256, 'emulatorSha256': hashlib.sha256(a.emulator.read_bytes()).hexdigest(),
              'plStats': hex(stats), 'checks': checks,
              'limitations': ['Emulator panel smoke: an empty card, the stock project the OS creates, no samples. Readings are '
                              'emulator percentages, not hardware ones. No hardware, cycle-budget or long-run check.']}

    def check(name, ok, **facts):
        checks[name] = dict(passed=bool(ok), **facts)
        if not ok: raise AssertionError(name + ' ' + json.dumps(facts))

    with tempfile.TemporaryDirectory(prefix='procload-smoke.') as tmp:
        w = Path(tmp); (w / 'tree').mkdir(); card = w / 'card.img'; card.write_bytes(codec.build_image(str(w / 'tree'), 32))
        port = Port([str(a.emulator.resolve()), '--image', str(image), '--card', str(card), '--dsp', '--frame', '--ms', '3000',
                     '--interactive', '--main-level', 'off', '--rtc', 'host', '--mkii'], w)
        try:
            port.run(1000)
            m0 = meter(port, stats); port.run(500); m1 = meter(port, stats)
            check('armed_after_startup', port.u32(SYS_UP) != 0 and m0['armed'] == 1)
            blocks = (m1['count'] - m0['count']) & 0xffffffff
            check('counts_blocks', 1300 <= blocks <= 1450, blocks_in_500ms=blocks)
            check('header_two_pixels_down', port.peek(HEADER_Y, 4).hex() == '48780023')
            port.press('TEMPO'); port.run(600)
            m = meter(port, stats)
            check('popup_open', port.u32(TEMPOWIN) != 0)
            check('mean_reading_stopped', 0 <= m['percent'] <= 100 and m['text'] == mean_text(m['percent']), percent=m['percent'], text=m['text'])
            port.key('FUNC', True); port.run(500); m = meter(port, stats)
            check('func_longest_block', m['func'] == 1 and 0 <= m['worst'] <= 999 and m['wtext'] == f"W{m['worst']}", worst=m['worst'], wtext=m['wtext'])
            port.key('FUNC', False); port.run(300); m = meter(port, stats)
            check('func_released', m['func'] == 0)
            port.press('PLAY'); port.run(2000); m = meter(port, stats)
            check('mean_reading_playing', 0 <= m['percent'] <= 100 and m['text'] == mean_text(m['percent']), percent=m['percent'], text=m['text'])
            port.press('STOP'); port.run(1000)
            limit = stats - 0x2e2 + TAIL_LIMIT
            check('tail_limit_located', port.peek(limit, 4).hex() == '01000000')
            port.poke(limit, bytes(4)); port.run(1000); m = meter(port, stats)
            check('no_blocks_reads_dashes', m['percent'] == -1 and m['text'] == '--%' and m['wtext'] == 'W--', text=m['text'], wtext=m['wtext'])
            port.poke(limit, bytes.fromhex('01000000')); port.run(1000); m = meter(port, stats)
            check('reads_again_after_restore', 0 <= m['percent'] <= 100, percent=m['percent'], text=m['text'])
            port.press('TEMPO'); port.run(500)
            check('popup_closed', port.u32(TEMPOWIN) == 0)
        finally:
            port.close()
    report['passed'] = all(c['passed'] for c in checks.values())
    a.output.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
