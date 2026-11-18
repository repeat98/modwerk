# SPDX-License-Identifier: MIT
"""Press stress on the emulator: the dearest press, repeated while playing.

Twenty rounds, each: PLAY; LOCK SAMPLES on every eligible track of a 512-field
fixture, then CLEAR SAMPLE LOCKS, both opened through the base's Part Edit
window (FUNC+PART > LOCKS) and confirmed; every SAMPLE field and the lock index
checked after each; the sequencer still playing and audio frames advancing;
then STOP and a Part change (hold PART + the arrow of the next Part). Emulator instructions, not
hardware; no audio judgement.
"""
import hashlib
from pathlib import Path
import stress_emulator as fixture

ROUNDS = 20
state = {}


def exercise(port, run, tap, key, encoder, capture, out, reboot):
    assert not reboot
    def u32(at): return fixture.u32(port, at)
    def u8(at): return port.peek(at, 1)[0]
    frames = lambda: u32(port.base_symbols['dl_frames'])
    tap(0x22, 1)
    assert u32(0x800065b8) == 0
    bank = u32(0x46c82456)
    initial = fixture.read(port, bank, 8 * 0x91a)
    source = bytearray(initial)
    for track in range(8):
        at = track * 0x91a
        source[at:at + 8] = ((1 << 64) - 1).to_bytes(8, 'big')
        for step in range(64):
            source[at + 0x59 + 32 * step:at + 0x59 + 32 * step + 32] = bytes([255]) * 32
    fixture.put(port, bank, source); fixture.put(port, 0x1001614e, source)
    fixture.call_idle(port, 0x400339d8)

    def check(clear):
        part = u8(0x80000003) & 3
        blob = fixture.read(port, bank, len(source))
        changed = 0
        for track in range(8):
            kind = port.peek(bank + 0x8ed80 + 0x18b2 * part + 0x22 + track, 1)[0]
            eligible = kind < 2
            expected = 255 if clear or not eligible else \
                port.peek(bank + 0x8ed80 + 0x18b2 * part + 0x2ca + 5 * track + kind, 1)[0]
            for step in range(64):
                assert blob[track * 0x91a + 0x78 + 32 * step] == expected, 'SAMPLE field differs'
            changed += 64 if eligible and not clear else 0
        assert fixture.read(port, 0x1001614e, len(source)) == blob, 'battery copy differs'
        for step in range(64):
            index = sum(1 << t for t in range(8)
                        if any(v != 255 for v in blob[t * 0x91a + 0x59 + 32 * step:t * 0x91a + 0x59 + 32 * step + 32]))
            assert port.peek(0x46c7d48c + step, 1) == bytes([index]), 'lock index differs'
        return changed

    events, least_frames, parts = 0, None, []
    for round_ in range(ROUNDS):
        tap(0x25, 1); run(200)
        assert u32(0x800065b8), 'not playing'
        for clear in (False, True):
            before = frames()
            fixture.open_action(port, run, tap, key, clear)
            encoder(0, 4); key('YES'); key('YES'); run(200)
            assert port.ui_phase() == 0, 'the action did not complete'
            assert u32(0x800065b8), 'playback stopped by the action'
            changed = check(clear)
            assert clear or changed, 'Lock changed nothing'
            advanced = frames() - before
            least_frames = advanced if least_frames is None else min(least_frames, advanced)
            events += 1
        tap(0x24, 128); run(200)
        assert u32(0x800065b8) == 0, 'STOP did not stop'
        # PART + an arrow picks a Part: UP 1, RIGHT 2, DOWN 3, LEFT 4 (scripts/device.mjs part()); the next one each round.
        part = u8(0x80000003) & 3
        arrow = [(0x26, 8), (0x24, 2), (0x24, 1), (0x26, 16)][(part + 1) % 4]
        port.command('key 0x23 32'); run(80); tap(*arrow)
        port.command('key 0x23 0'); run(600)
        assert u8(0x80000003) & 3 == (part + 1) % 4, 'the Part did not change'
        parts.append(u8(0x80000003) & 3)
        print('Stress round %d of %d' % (round_ + 1, ROUNDS), flush=True)
    state.update(events=events, least_frames=least_frames, parts=parts)
    return {'pressStressEvents': events, 'pressStressHangs': 0, 'pressStressLeastFramesPerEvent': least_frames,
            'pressStressPartsVisited': sorted(set(parts)),
            'pressStressHelperSha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}


def after_undo(port, out):
    return fixture.after_undo(port, out)
