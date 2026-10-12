#!/usr/bin/env python3
"""TUNER native smoke on the ColdFire emulator: retain summaries only, never firmware/RAM/card bytes.

Boots a local MAIN OS image that carries TUNER and checks, through the emulator's line protocol:

  keys (an empty scratch card): TEMPO alone opens the stock TEMPO window and not the tuner; UP held + TEMPO opens
  the tuner (the stock TEMPO handle stays 0); a fresh window reads "--" on silence; the frame interrupt fills the
  ring (16 samples a block) only while the window is open; TEMPO, YES, NO and UP + TEMPO each close it; FUNC + TEMPO
  (tap tempo) does not open it.

  readings (only with --template, a project your own OS made, e.g. a fresh blank one): a disposable card is built
  in a temporary directory with seven looping mono sines (T1 440 Hz, T2 82.5 Hz, T3 300 Hz, T4 1000 Hz, T5 110 Hz,
  T6 435 Hz, T7 1318.5 Hz; -12 dBFS) and a silent sample on T8, the project is loaded and played, and the tuner must read each
  track's note, octave and cents (within 1 cent of the true value) and Hz (within 0.2 %), switch with the track
  keys while open, keep the last reading with HOLD on the silent track and after STOP.

--tu-win is the address of `tu_win` (the first of the unit's state longs) in the image under test: 0x40a980f0 when
TUNER is the only DRAM module. The emulator, image, template and card stay local; nothing they contain is written to
the report."""
import argparse, contextlib, hashlib, importlib.util, io, json, math, os, re, selectors, shutil, struct, subprocess, sys, tempfile, time, wave
from pathlib import Path

KEYS = {'FUNC': 0x2d, 'PLAY': 0x28, 'STOP': 0x27, 'TEMPO': 0x18, 'UP': 0x33, 'YES': 0x31, 'NO': 0x32,
        **{f'T{i + 1}': 0x10 + i for i in range(8)}}
TEMPOWIN, TRACK = 0x460d16a0, 0x80000000
NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
TONES = [440.0, 82.5, 300.0, 1000.0, 110.0, 435.0, 1318.5, 0.0]
FRAMES = 88200


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    obj = importlib.util.module_from_spec(spec); spec.loader.exec_module(obj); return obj


def truth(f):
    n = 12 * math.log2(f / 440.0) + 57; k = round(n)
    return NAMES[k % 12], k // 12, 100 * (n - k)


class Port:
    def __init__(self, command, cwd):
        self.process = subprocess.Popen(command, cwd=cwd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                        env={k: v for k, v in os.environ.items() if not k.startswith('OT_')})
        self.poll = selectors.DefaultSelector(); self.poll.register(self.process.stdout, selectors.EVENT_READ)
        self.pending = b''; self.rows = [0] * 8; self.lines = []; self.reply((b'ready ',))

    def reply(self, prefixes):
        deadline = time.monotonic() + 900
        while True:
            while b'\n' in self.pending:
                line, self.pending = self.pending.split(b'\n', 1); self.lines.append(line.decode('latin1'))
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

    def chord(self, held, name): self.key(held, True); self.press(name); self.key(held, False)

    def peek(self, addr, n): return bytes.fromhex(self.send(f'peek {addr:#x} {n}', b'peek ').split()[-1])
    def u32(self, addr): return int.from_bytes(self.peek(addr, 4), 'big')
    def frames(self): return int(dict(kv.split('=') for kv in self.send('status', b'status').split()[1:])['frames'])

    def close(self):
        try: self.send('quit'); self.process.wait(timeout=10)
        finally:
            if self.process.poll() is None: self.process.terminate(); self.process.wait(timeout=10)
            self.poll.close()


def state(port, at):
    b = port.peek(at, 44); u = lambda o: int.from_bytes(b[o:o + 4], 'big'); s = lambda o: int.from_bytes(b[o:o + 4], 'big', signed=True)
    st = dict(win=u(0), wr=u(4), note=u(12), oct=s(16), cents=s(20), f10=u(24), valid=u(28), live=u(32))
    st['reading'] = (f"{NAMES[st['note'] % 12]}{st['oct']} {st['cents']:+d}c {st['f10'] // 10}.{st['f10'] % 10}Hz" if st['valid'] else '--') \
        + ('' if st['live'] or not st['valid'] else ' HOLD')
    return st


def tone_tree(template, sdk, out):
    """The disposable fixture: TONE/TUNE (the template with eight FLEX tracks, slot N on track N, LOOP on, one trig on
    step 1 of A01) and TONE/AUDIO/TUNE/T1..T8.wav. Every FX byte is left as the template's."""
    sys.path.insert(0, str(sdk / 'tools'))
    from hw import ot_bank as bank
    from hw import ot_project as otp
    dest = out / 'TONE' / 'TUNE'; dest.mkdir(parents=True)
    for src in template.iterdir():
        if src.is_file() and src.suffix in ('.work', '.strd'): shutil.copy2(src, dest / src.name)
    blocks = b''.join(('[SAMPLE]\r\nTYPE=FLEX\r\nSLOT=%03d\r\nPATH=../AUDIO/TUNE/T%d.wav\r\nTRIM_BARSx100=100\r\nLOOP_BARSx100=100'
                       '\r\nBPMx24=2880\r\nTSMODE=0\r\nLOOPMODE=1\r\nGAIN=48\r\nTRIGQUANTIZATION=-1\r\n[/SAMPLE]\r\n\r\n' % (t + 1, t + 1)).encode()
                      for t in range(8))
    for path in (dest / 'project.work', dest / 'project.strd'):
        if not path.exists(): continue
        raw = path.read_bytes()
        for t in range(8):
            raw = re.sub(rb'\[SAMPLE\]\r?\nTYPE=FLEX\r?\nSLOT=%03d\r?\n.*?\[/SAMPLE\]\r?\n\r?\n' % (t + 1), b'', raw, flags=re.S)
        at = raw.find(b'[SAMPLE]')
        if at < 0: raise ValueError('template project has no sample section')
        raw = raw[:at] + blocks + raw[at:]
        for key, val in ((b'BANK', b'0'), (b'PATTERN', b'0'), (b'TRACK', b'0')):
            raw, count = re.subn(rb'(\r?\n)' + key + rb'=\d+', lambda m: m.group(1) + key + b'=' + val, raw, count=1)
            if count != 1: raise ValueError('template project has no ' + key.decode())
        path.write_bytes(raw.replace(b'MASTER_TRACK=1', b'MASTER_TRACK=0'))
    with contextlib.redirect_stdout(io.StringIO()):
        otp.set_tempo(dest, 120)
    for path in (dest / 'markers.work', dest / 'markers.strd'):
        if not path.exists(): continue
        data = bytearray(path.read_bytes())
        for t in range(8):
            data[0x16 + t * 784:0x16 + (t + 1) * 784] = struct.pack('>III', 0, FRAMES, 0) + bytes(772)
        data[-2:] = (sum(data[0x10:-2]) & 0xFFFF).to_bytes(2, 'big'); path.write_bytes(data)

    def mutate(data, num):
        bank.check_tags(data)
        for part in range(otp.NPARTS_ALL):
            base = otp.PART_BASE + part * otp.PART_STRIDE
            for track in range(8):
                data[base + otp.MTYPE_OFF + track] = 1; data[base + 0x2d3 + track * 5 + 1] = track; data[base + 0x01b + track * 2] = 100
                setup, values = base + 0x1e3 + track * 30 + 6, base + 0x033 + track * 30 + 6
                data[setup] = 1; data[setup + 4] = 0; data[values] = 64; data[values + 3] = 127
        for pat in range(16):
            data[bank.PTRN_BASE + pat * bank.PTRN_STRIDE + bank.PTRN_STRIDE - 5] = 0
            for track in range(8):
                off = otp.trac_off(pat, track)
                data[off:off + 64] = bytes(64); data[off + 0x59:off + 0x59 + 64 * 32] = bytes([0xff]) * (64 * 32)
                if num == 1 and pat == 0: data[off + 7] |= 1
    with contextlib.redirect_stdout(io.StringIO()):
        for num in range(1, 17): otp._bank_write(dest, num, lambda d, n=num: mutate(d, n), guard=False)
        otp.write_stored(dest)
    amp = 0.25 * 32767
    for t, f in enumerate(TONES):
        path = out / 'TONE' / 'AUDIO' / 'TUNE' / f'T{t + 1}.wav'; path.parent.mkdir(parents=True, exist_ok=True)
        with wave.open(str(path), 'wb') as w:
            w.setnchannels(2); w.setsampwidth(2); w.setframerate(44100)
            w.writeframes(b''.join(struct.pack('<hh', s, s) for s in
                                   (int(round(amp * math.sin(2 * math.pi * f * n / 44100))) if f else 0 for n in range(FRAMES))))


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--output', type=Path, required=True); p.add_argument('--emulator', type=Path, required=True)
    p.add_argument('--image', type=Path, required=True); p.add_argument('--image-sha256', required=True)
    p.add_argument('--sdk', type=Path, required=True); p.add_argument('--template', type=Path)
    p.add_argument('--tu-win', type=lambda x: int(x, 0), default=0x40a980f0)
    a = p.parse_args()
    image = a.image.resolve()
    assert hashlib.sha256(image.read_bytes()).hexdigest() == a.image_sha256, 'image fingerprint'
    codec = module('card', a.sdk.resolve() / 'tools/emu/emu_card.py')
    at = a.tu_win; checks = {}
    report = {'imageSha256': a.image_sha256, 'emulatorSha256': hashlib.sha256(a.emulator.read_bytes()).hexdigest(), 'tuWin': hex(at),
              'checks': checks, 'readings': [],
              'limitations': ['Emulator panel smoke on the MKII panel. The key checks use an empty card and the project the OS creates; '
                              'the reading checks (only with --template) use generated looping sines on FLEX tracks. No live input, '
                              'no hardware, no cycle-budget or long-run check.']}

    def check(name, ok, **facts):
        checks[name] = dict(passed=bool(ok), **facts)
        if not ok: raise AssertionError(name + ' ' + json.dumps(facts))

    def boot(w, card, extra):
        return Port([str(a.emulator.resolve()), '--image', str(image), '--card', str(card), '--dsp', '--frame', '--ms', '3000',
                     '--interactive', '--main-level', 'off', '--rtc', 'host', '--mkii'] + extra, w)

    with tempfile.TemporaryDirectory(prefix='tuner-smoke.') as tmp:
        w = Path(tmp)
        # ---- keys, empty card ----
        (w / 'tree').mkdir(); card = w / 'card.img'; card.write_bytes(codec.build_image(str(w / 'tree'), 32))
        port = boot(w, card, [])
        try:
            port.press('YES'); port.run(2000); port.press('NO'); port.run(500)          # the emulator's date prompt (stock)
            s0 = state(port, at); port.run(500); s1 = state(port, at)
            check('closed_ring_idle', s0['win'] == 0 and s1['wr'] == s0['wr'], wr=[s0['wr'], s1['wr']])
            port.press('TEMPO'); port.run(300)
            check('tempo_alone_is_stock', port.u32(TEMPOWIN) != 0 and state(port, at)['win'] == 0)
            port.press('TEMPO'); port.run(300)
            check('stock_tempo_window_closes', port.u32(TEMPOWIN) == 0)
            port.chord('UP', 'TEMPO'); port.run(100)
            s = state(port, at)
            check('up_tempo_opens_tuner', s['win'] != 0 and port.u32(TEMPOWIN) == 0)
            f0, w0 = port.frames(), state(port, at)['wr']; port.run(500); f1, w1 = port.frames(), state(port, at)['wr']
            check('ring_fills_16_per_block', f1 > f0 and (w1 - w0) % 4096 == (16 * (f1 - f0)) % 4096, blocks=f1 - f0, wr=[w0, w1])
            port.run(1000); s = state(port, at)
            check('silence_reads_dashes', s['valid'] == 0 and s['live'] == 0, reading=s['reading'])
            for name in ['TEMPO', 'YES', 'NO', 'UP+TEMPO']:
                if state(port, at)['win'] == 0: port.chord('UP', 'TEMPO'); port.run(300)
                opened = state(port, at)['win'] != 0
                if name == 'UP+TEMPO': port.chord('UP', 'TEMPO')
                else: port.press(name)
                port.run(300); s = state(port, at)
                check('closes_with_' + name.replace('+', '_'), opened and s['win'] == 0 and port.u32(TEMPOWIN) == 0)
            port.chord('FUNC', 'TEMPO'); port.run(300)
            check('func_tempo_does_not_open_tuner', state(port, at)['win'] == 0)
            port.press('NO'); port.run(300)
            port.chord('UP', 'TEMPO'); port.run(300)
            check('reopens', state(port, at)['win'] != 0)
            port.press('TEMPO'); port.run(300)
        finally:
            port.close()
        # ---- readings, generated tones (only with a local template project) ----
        if a.template:
            tone_tree(a.template.resolve(), a.sdk.resolve(), w / 'tones')
            card2 = w / 'tones.img'; card2.write_bytes(codec.build_image(str(w / 'tones'), 64))
            port = boot(w, card2, ['--mount', '--set', 'TONE', '--project', 'TUNE'])
            try:
                check('project_loaded', any('LOAD PROJECT handled' in line for line in port.lines))
                port.press('YES'); port.run(2000); port.press('NO'); port.run(500)      # the emulator's date prompt (stock)
                port.press('PLAY'); port.run(1000)
                port.chord('UP', 'TEMPO'); port.run(1500)
                for t in [0, 2, 1, 3, 4, 5, 6]:
                    port.press(f'T{t + 1}'); port.run(1200)
                    s = state(port, at); note, octave, c = truth(TONES[t]); f10 = round(TONES[t] * 10)
                    report['readings'].append(dict(track=t + 1, toneHz=TONES[t], expected=f'{note}{octave} {c:+.1f}c', read=s['reading']))
                    check(f'reads_T{t + 1}', s['valid'] == 1 and s['live'] == 1 and port.peek(TRACK, 1)[0] == t
                          and f"{NAMES[s['note'] % 12]}{s['oct']}" == f'{note}{octave}' and abs(s['cents'] - c) <= 1.0
                          and abs(s['f10'] - f10) <= max(2, f10 // 500), read=s['reading'], expected=f'{note}{octave} {c:+.1f}c {TONES[t]}Hz')
                last = state(port, at)
                port.press('T8'); port.run(1200); s = state(port, at)
                report['readings'].append(dict(track=8, toneHz=0, expected='HOLD (last note kept)', read=s['reading']))
                # The ring holds the last tone for up to 93 ms after the switch, so the held reading can be the last
                # analysis of that tail (the Hz may move by a tenth); the note and octave are the last track's.
                check('silent_track_holds', s['valid'] == 1 and s['live'] == 0 and (s['note'], s['oct']) == (last['note'], last['oct']),
                      read=s['reading'], last=last['reading'])
                port.press('T1'); port.run(1200); s = state(port, at)
                check('reads_again', s['live'] == 1 and s['reading'].startswith('A4'), read=s['reading'])
                port.press('STOP'); port.run(1500); s = state(port, at)
                report['readings'].append(dict(track=1, toneHz=0, expected='after STOP: HOLD', read=s['reading']))
                check('stop_holds', s['valid'] == 1 and s['live'] == 0 and s['reading'].endswith('HOLD'), read=s['reading'])
                port.press('TEMPO'); port.run(300)
                check('closed_after_reading', state(port, at)['win'] == 0)
            finally:
                port.close()
        else:
            report['limitations'].append('Reading checks not run: no --template project given.')
    report['passed'] = all(c['passed'] for c in checks.values())
    a.output.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
