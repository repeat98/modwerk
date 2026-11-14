#!/usr/bin/env python3
"""Run Analog Rytm MKII test cases on rytm-emu's dtboot or on a unit, over the development link.

One case file drives both targets. A case is compiled to a list of link requests on a timeline in
milliseconds; the emulator gets them as USB MIDI events at instruction clocks, the unit gets them
over USB MIDI at wall-clock times. The replies come back in the same shape from both, and the same
code checks them. A case can also play MIDI notes and measure windows of the Rytm's USB audio (rytm_audio.py).
../TEST_RUNNER.md has the case format and what a pass does not show; ../LINK.md the link.

  rytm_test.py check CASE...                       parse the cases and print their timelines
  rytm_test.py emu IMAGE CASE... --emu DTBOOT      run on the emulator (or set RYTM_EMU)
  rytm_test.py unit CASE... --label XX01           run on the unit: it must be armed and at rest

A CASE is a .case file or a folder of them. The unit run touches hardware: only with the OK of the
person whose unit it is.

References (`== ref`) are recorded with --record into --refs, by default under the cache: they are
captures of the unit's screen and stay on the developer's computer, never in Git.
"""
import argparse
import hashlib
import json
import math
import os
import re
import signal
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import rytm_link as rl                                      # noqa: E402

TAP_MS = 60             # a tap: down, this long, up, this long
GAP_MS = 20             # least time between two requests
NUDGE_GAP_MS = 50       # between a nudge's two turns
NUDGE_REST_MS = 3000    # a knob left alone this long takes the next turn as its wake-up (see nudge)
NUDGE_WAKE = 16         # counts of the wake-up turn
NUDGE_STEP = 4          # counts of one step (one detent)
KEY_SETTLE_MS = 300     # a turn comes this long after the last key change, so stock sees FUNC as it is
TURN_SETTLE_MS = 100    # and a key change this long after the last turn: a turn is handled a frame later
HALF_GAP_MS = 50        # between a screen's two halves
SETTLE_MS = 250         # before a capture that follows input, unless the case sets `settle:`
MEM_MAX = 128           # link.c's MEM_MAX
IPS = 200_000_000       # dtboot's instructions per second for this machine
LINK_TICKS_S = 20       # the link counts 20 ticks a second from the boot (measured on the unit, 10 Nov 2026)
BOOT_SETTLE_S = 6       # a unit run starts no sooner after a boot: twice the 3 s that was tried (see run_unit)
EMU_LEAD_MS = 50        # a resumed snapshot runs this long before the case's first request
EMU_TAIL_MS = 300
# rytm-emu boots to the main screen, then GLOBAL, eight rows down and RIGHT set REMOTE CTRL ON by the
# panel; the link's own NO taps leave the menu. Clocks in million instructions, off dtboot's grid.
EMU_BOOT_PRESSES = [('NO', 4503, 80), ('NO', 5303, 80), ('NO', 6103, 80), ('NO', 6903, 80), ('GLOBAL', 7703, 12)] + \
    [('DOWN', 8003 + 200 * i, 12) for i in range(8)] + [('RIGHT', 9603, 12)]
# The link's taps come 3.5 s after the last panel press: an image armed from its boot counts the recipe's panel presses as a person and refuses the link for 3 s.
EMU_BOOT_LINK = [('key', (rl.KEYS['NO'], rl.KEY_DOWN), 10303), ('key', (rl.KEYS['NO'], rl.KEY_UP), 10363),
                 ('key', (rl.KEYS['NO'], rl.KEY_DOWN), 10423), ('key', (rl.KEYS['NO'], rl.KEY_UP), 10483),
                 ('ident', (), 10493)]
EMU_BOOT_END = 10593        # two link ticks after the ident, so nothing waits in the snapshot
SNAP_VERSION = 3            # raise when a snapshot made by an older runner must not be reused
MATCH_WINDOW = 64           # a reply is looked for this far ahead: sequence numbers repeat every 128
FUNC_TURN_AT = 0x417e32b8   # OS 1.74: 1 while the last turn that moved a value was with FUNC
IDENT_NUM = ('link', 'armed', 'human', 'human_count', 'posted', 'refused', 'drops', 'received', 'ticks',
             'boot_rsr', 'playing', 'boot')
IDENT_TEXT = ('label', 'os_build', 'boot_text', 'depack_crc', 'image_crc')
NOTE_MS, NOTE_VEL = 100, 100    # a `note` without a length or a velocity
AUDIO_MAX_MS = 30000
AUDIO_RATE = 48000
TRACKS = ('BD', 'SD', 'RS', 'CP', 'BT', 'LT', 'MT', 'HT', 'CH', 'OH', 'CY', 'CB')
# The 12 USB audio channels (OS 1.74's copy routine at 0x4010e9b0): MAIN L/R, the eight voice outputs
# (two tracks share each of the last four), AUDIO IN L/R.
SOURCES = {'MAIN': (0, 1), 'BD': (2,), 'SD': (3,), 'RS': (4,), 'CP': (4,), 'BT': (5,), 'LT': (6,), 'MT': (7,),
           'HT': (7,), 'CH': (8,), 'OH': (8,), 'CY': (9,), 'CB': (9,), 'IN': (10, 11)}
AUDIO_FIELDS = ('peak', 'rms', 'hits', 'dips', 'gapmin', 'gapmax', 'onset', 'attack', 'len20', 'len40', 'pitch')
# How far a measure may be from its reference's, as (absolute, share of the reference's): the larger
# counts. A first guess. Seen on the unit, one case run three times (12 notes): onset over 6 ms, len20 within
# 0.5 ms, a short attack within 0.5 ms; the peak inside a held note moved by 50 ms (no reference for that).
TARGETS = {'emu': 'emulator', 'unit': 'unit'}
AUDIO_TOL = {'peak': (1.5, 0), 'rms': (1.5, 0), 'hits': (0, 0), 'dips': (0, 0), 'gapmin': (3, 0), 'gapmax': (3, 0),
             'onset': (8, 0), 'attack': (2, 0.2),
             'len20': (2, 0.1), 'len40': (3, 0.15), 'pitch': (2, 0.03)}


def audio():
    """rytm_audio.py, loaded for the first case with sound: the others run without numpy."""
    try:
        import rytm_audio
    except ImportError as e:
        raise Abort('a case with an `audio` step needs numpy and soundfile, and sounddevice on a unit (%s)' % e)
    return rytm_audio


class CaseError(Exception):
    """A case file that cannot be read or compiled."""


class Abort(Exception):
    """The run must stop: going on would act on a unit in an unknown state."""


class Op:
    """One link request at a time on the case's timeline, and where its reply goes. A `note` (a MIDI note
    on or off) and an `audio` (a window of the take opens) are on the timeline too, and are no requests."""

    def __init__(self, t, name, values, line, slot=None):
        self.t, self.name, self.values, self.line, self.slot = t, name, tuple(values), line, slot

    def text(self):
        return '%7d ms  %-7s %s' % (self.t, self.name, ' '.join(v if isinstance(v, str) else '%#x' % v for v in self.values))


class Case:
    def __init__(self, path, func_turn=False):
        self.path = Path(path)
        self.name = self.path.stem
        self.head = {'state': 'changes', 'start': 'home', 'settle': str(SETTLE_MS), 'transport': 'stopped',
                     'target': 'any'}
        self.ops, self.expects, self.captures = [], [], {}
        self.ignore = []                                    # parts of the screen no compare looks at
        self.t = 0
        self.audio_end = 0                                  # when the last `audio` window closes
        self.after_input = False
        self.turned = {}                                    # encoder: time of its last turn
        self.keyed = -KEY_SETTLE_MS                         # time of the last key change
        self.held = set()                                   # keys a `hold` holds
        self.flags = rl.KeyFlags()
        self.func_turn = func_turn                          # stock's "the last moved turn was with FUNC";
        self.func_nudges = 0                                # None once a raw `enc` may have changed it
        self.parse()

    def fail(self, n, why):
        raise CaseError('%s:%d: %s' % (self.path, n, why))

    def req(self, n, name, *values, slot=None, gap=GAP_MS):
        self.ops.append(Op(self.t, name, values, n, slot))
        self.t += gap

    def key(self, n, name, down):
        if name not in rl.KEYS:
            self.fail(n, 'unknown key %s' % name)
        self.after_turn()
        self.req(n, 'key', rl.KEYS[name], self.flags.flags(name, down))
        self.keyed = self.t

    def release_all(self, n):
        """Held keys let go one by one, as the panel sends them, then the link's release: it posts every up
        as a plain 0x10, which is wrong for a key that went down under FUNC, so it is only the net."""
        for name in self.flags.held():
            self.key(n, name, False)
        self.after_turn()
        self.req(n, 'release')
        self.keyed = self.t
        self.held.clear()
        self.flags.clear()

    def after_turn(self):
        self.t = max(self.t, max(self.turned.values(), default=-TURN_SETTLE_MS) + TURN_SETTLE_MS)

    def turn(self, n, name, counts, gap=GAP_MS):
        self.req(n, 'enc', rl.ENCODERS[name], counts & 0xffffffff, gap=gap)
        self.turned[name] = self.t

    def nudge(self, n, name, counts):
        """A turn the stock filter takes whole: rest, a wake-up turn the other way, the turn."""
        self.t = max(self.t, self.turned.get(name, 0) + NUDGE_REST_MS)
        self.turn(n, name, -NUDGE_WAKE if counts > 0 else NUDGE_WAKE, gap=NUDGE_GAP_MS)
        self.turn(n, name, counts)

    def tap(self, n, chord, count):
        keys = chord.split('+')
        for k in keys:
            if k in self.held:
                self.fail(n, '%s is held: let it go before a tap or chord with it' % k)
        if len(set(keys)) != len(keys):
            self.fail(n, 'a chord names each key once')
        for _ in range(count):
            for k in keys[:-1]:
                self.key(n, k, True)
            self.key(n, keys[-1], True)
            self.t += TAP_MS - GAP_MS
            self.key(n, keys[-1], False)
            for k in reversed(keys[:-1]):
                self.key(n, k, False)
            self.t += TAP_MS - GAP_MS

    def capture(self, n, name, kind):
        if not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*', name) or name in ('ref', 'region', 'within'):
            self.fail(n, 'a capture needs a name of letters, digits and _ (not "ref", "region" or "within")')
        if name in self.captures:
            self.fail(n, 'capture %s is taken twice' % name)
        self.captures[name] = kind
        if self.after_input:
            self.t += int(self.head['settle'])
        self.after_input = False

    def parse(self):
        body, seen = False, set()
        for n, raw in enumerate(self.path.read_text().splitlines(), 1):
            line = raw.split('#')[0].strip()
            if not line:
                continue
            m = re.fullmatch(r'([a-z]+):\s*(.*)', line)
            if m and not body:
                key, value = m.groups()
                if key in seen:
                    self.fail(n, 'the header %s is given twice' % key)
                seen.add(key)
                if key == 'name':
                    if not re.fullmatch(r'[A-Za-z0-9_-][A-Za-z0-9._-]*', value):
                        self.fail(n, 'a name is letters, digits, . _ and -, and does not start with a .')
                    self.name = value
                elif key == 'state' and value in ('safe', 'changes'):
                    self.head[key] = value
                elif key == 'start' and value in ('home', 'as-is'):
                    self.head[key] = value
                elif key == 'transport' and value in ('stopped', 'any'):
                    self.head[key] = value
                elif key == 'target' and value in ('any', 'emu', 'unit'):
                    self.head[key] = value
                elif key == 'settle' and re.fullmatch(r'[0-9]{1,5}', value):
                    self.head[key] = value
                elif key == 'ignore' and re.fullmatch(r'\d+(\s+\d+){3}(\s*,\s*\d+(\s+\d+){3})*', value):
                    for part in value.split(','):
                        x, y, w, h = (int(v) for v in part.split())
                        if not (x < 128 and y < 64 and 1 <= w <= 128 - x and 1 <= h <= 64 - y):
                            self.fail(n, 'an ignored part is X Y W H inside 128 x 64')
                        self.ignore.append((x, y, w, h))
                else:
                    self.fail(n, 'unknown header or value: %s' % line)
                continue
            if not body:
                body = True
                self.req(0, 'release')                      # no key held from an earlier case
                if self.head['start'] == 'home':
                    self.tap(0, 'NO', 3)
                    self.t += 200
            self.step(n, line.split())
        if not body:
            self.fail(1, 'no steps')
        self.t = max(self.t, self.audio_end)
        self.release_all(0)
        self.duration = self.t

    def step(self, n, w):
        verb, args = w[0], w[1:]
        try:
            if verb == 'key':
                count = 1
                if len(args) == 2 and re.fullmatch(r'x\d+', args[1]):
                    count = int(args.pop()[1:])
                (chord,) = args
                if not 1 <= count <= 64:
                    self.fail(n, 'a count is 1 to 64')
                self.tap(n, chord, count)
                self.after_input = True
            elif verb in ('hold', 'release'):
                (name,) = args
                if verb == 'release' and name == 'all':
                    self.release_all(n)
                else:
                    self.key(n, name, verb == 'hold')
                    (self.held.add if verb == 'hold' else self.held.discard)(name)
                self.after_input = True
            elif verb in ('nudge', 'enc') and args and re.fullmatch(r'x\d+', args[-1]):
                if not 1 <= int(args[-1][1:]) <= 64 or re.fullmatch(r'x\d+', w[-2]):
                    self.fail(n, 'a count is 1 to 64, and there is one')
                for _ in range(int(args[-1][1:])):          # the same turn again and again: nudge B -42 per 3 x4
                    self.step(n, w[:-1])
            elif verb in ('nudge', 'enc'):
                per = NUDGE_STEP
                if 'per' in args:
                    if verb != 'nudge' or len(args) != 4 or args[2] != 'per' or not re.fullmatch(r'[1-8]', args[3]):
                        self.fail(n, '`per` takes 1 to 8 counts a step, after a nudge: nudge B +6 per 3')
                    per = int(args.pop())
                    args.pop()
                name, amount = args
                if name not in rl.ENCODERS or not re.fullmatch(r'[+-]\d+', amount) or int(amount) == 0:
                    self.fail(n, '%s takes an encoder (A-H, LEVEL) and a signed amount, as: %s A +2' % (verb, verb))
                v, sign = abs(int(amount)), 1 if amount[0] == '+' else -1
                func = 'FUNC' in self.held
                self.t = max(self.t, self.keyed + KEY_SETTLE_MS)
                if verb == 'enc':
                    if v > 127:
                        self.fail(n, 'one turn is at most 127 counts')
                    self.turn(n, name, sign * v)
                    if func != self.func_turn:
                        self.func_turn = None               # it moved a value or not: stock's flag is unknown
                else:
                    # Stock filters every turn per knob (OS 1.74, 0x4006f1fa): a turn that finds the
                    # knob's rest counter above 24 only lowers it (3 per count) and moves nothing;
                    # the counter climbs back by one every 100 ms up to 48, and a moved step may add
                    # 48. So: let the knob rest until the counter is above 24 whatever it was, turn
                    # 16 counts the other way (taken as the wake-up, clears the counter, the count
                    # remainder and the acceleration), then all steps in one turn.
                    if v > 127 // per:
                        self.fail(n, 'a nudge is at most %d steps at %d counts a step' % (127 // per, per))
                    if func and self.func_turn is None:
                        self.fail(n, 'a raw `enc` before this nudge may or may not have moved a value, so whether '
                                     'stock drops this first FUNC turn is unknown: use `nudge` for that turn too')
                    if func and not self.func_turn:
                        # The first moved turn with FUNC after one without is dropped, and so is
                        # every turn of that knob in the next 0.4 s (0x4003a118 on): spend it here.
                        self.nudge(n, name, sign * NUDGE_WAKE)
                    self.nudge(n, name, sign * per * v)
                    self.func_turn = func
                    self.func_nudges += func
                self.after_input = True
            elif verb == 'wait':
                (ms,) = args
                if not ms.isdigit() or int(ms) > 60000:
                    self.fail(n, 'wait takes milliseconds, at most 60000')
                self.t += int(ms)
            elif verb == 'screen':
                (name,) = args
                self.capture(n, name, 'screen')
                self.req(n, 'screen', 0, slot=(name, 0), gap=HALF_GAP_MS)
                self.req(n, 'screen', 512, slot=(name, 1))
            elif verb == 'mem':
                name, addr, count = args
                addr, count = int(addr, 0), int(count, 0)
                if not 1 <= count <= 1024 or addr < 0 or addr + count > 1 << 32:
                    self.fail(n, 'mem reads 1 to 1024 bytes at a 32-bit address')
                self.capture(n, name, 'mem')
                for i, off in enumerate(range(0, count, MEM_MAX)):
                    self.req(n, 'mem', addr + off, min(MEM_MAX, count - off), slot=(name, i))
            elif verb == 'ident':
                (name,) = args
                self.capture(n, name, 'ident')
                self.req(n, 'ident', slot=(name, 0))
            elif verb == 'note':
                track, vel, ms = (args + [str(NOTE_VEL), str(NOTE_MS)][len(args) - 1:])
                if track not in TRACKS or not (vel.isdigit() and 1 <= int(vel) <= 127) or \
                        not (ms.isdigit() and 10 <= int(ms) <= 10000):
                    self.fail(n, 'note takes a track (%s), a velocity 1 to 127 and a length of 10 to 10000 ms, as: '
                                 'note BD 100 250' % ' '.join(TRACKS))
                self.after_turn()                           # a turn before it has reached the sound
                self.req(n, 'note', 'on', track, int(vel), gap=int(ms))
                self.req(n, 'note', 'off', track, 0)
            elif verb == 'cc':
                number, value = args
                if not (number.isdigit() and value.isdigit() and int(number) <= 119 and int(value) <= 127):
                    self.fail(n, 'cc takes a controller 0 to 119 and a value 0 to 127, as: cc 79 42')
                self.after_turn()
                self.req(n, 'cc', int(number), int(value))
                self.after_input = True
            elif verb == 'audio':
                name, source, ms = args
                if source not in SOURCES or not ms.isdigit() or not 20 <= int(ms) <= AUDIO_MAX_MS:
                    self.fail(n, 'audio takes a name, a source (%s) and 20 to %d ms, as: audio hit BD 500'
                              % (' '.join(SOURCES), AUDIO_MAX_MS))
                self.capture(n, name, 'audio')
                self.after_turn()
                self.req(n, 'audio', source, int(ms), slot=(name, 0), gap=0)
                self.audio_end = max(self.audio_end, self.t + int(ms))
            elif verb == 'expect':
                self.expect(n, args)
            else:
                self.fail(n, 'unknown step %s' % verb)
        except ValueError:
            self.fail(n, 'cannot read: %s' % ' '.join(w))

    def expect(self, n, a):
        text = ' '.join(a)
        region = None
        if 'region' in a:
            i = a.index('region')
            region = tuple(int(v) for v in a[i + 1:])
            a = a[:i]
            x, y, w, h = region                             # ValueError unless four numbers
            if not (0 <= x < 128 and 0 <= y < 64 and 1 <= w <= 128 - x and 1 <= h <= 64 - y):
                self.fail(n, 'a region is X Y W H inside 128 x 64')
        if len(a) < 3 or a[1] not in ('==', '!=', '<', '>'):
            self.fail(n, 'expect is: NAME ==|!= OTHER|ref|BYTES, or NAME.FIELD ==|!=|<|> VALUE|OTHER.FIELD [+|- N] [within N]')
        left, op, right = a[0], a[1], a[2:]
        name, _, field = left.partition('.')
        kind = self.captures.get(name)
        if kind is None:
            self.fail(n, 'expect names %s before it is captured' % name)
        if region and kind != 'screen':
            self.fail(n, 'a region is for screens')
        within = None
        if kind == 'audio':
            want, within = self.expect_audio(n, name, field, op, right)
        elif (kind == 'ident') != bool(field):
            self.fail(n, 'an ident capture is checked by field (%s.armed == 1), others whole' % name)
        elif kind == 'ident':
            if len(right) != 1:
                self.fail(n, 'one value after %s' % op)
            if field not in IDENT_NUM + IDENT_TEXT:
                self.fail(n, 'ident has no field %s (it has: %s)' % (field, ' '.join(IDENT_NUM + IDENT_TEXT)))
            other, _, other_field = right[0].partition('.')
            if other_field and self.captures.get(other) == 'ident':
                if other_field not in IDENT_NUM + IDENT_TEXT or (other_field in IDENT_NUM) != (field in IDENT_NUM):
                    self.fail(n, '%s and %s do not compare' % (left, right[0]))
                want = ('field', (other, other_field))
            elif field in IDENT_NUM:
                want = ('value', int(right[0], 0))          # ValueError unless a number
            else:
                want = ('value', right[0])
            if field in IDENT_TEXT and op in '<>':
                self.fail(n, '%s is text: compare with == or !=' % field)
        elif op not in ('==', '!='):
            self.fail(n, '%s captures compare with == or !=' % kind)
        elif right == ['ref']:
            if kind != 'screen' or op != '==':
                self.fail(n, 'only a screen compares with a reference, and only with == (a memory reference '
                             'would be a memory dump among the cases: give the bytes)')
            want = ('ref', None)
        elif len(right) == 1 and right[0] in self.captures:
            if self.captures[right[0]] != kind:
                self.fail(n, '%s and %s are different kinds of capture' % (name, right[0]))
            want = ('capture', right[0])
        elif kind == 'mem':
            want = ('bytes', bytes.fromhex(''.join(right)))
        else:
            self.fail(n, 'expect names %s, which is not captured before it' % ' '.join(right))
        self.expects.append({'line': n, 'text': text, 'name': name, 'field': field, 'op': op, 'want': want,
                             'region': region, 'within': within})

    def expect_audio(self, n, name, field, op, right):
        """A sound's check: (('ref', None) | ('value', number) | ('field', (other, its field, offset)), within)."""
        within = None
        if 'within' in right:
            i = right.index('within')
            (tol,) = right[i + 1:]                          # ValueError unless one number
            within, right = float(tol), right[:i]
            if not 0 <= within < math.inf or op not in ('==', '!='):
                self.fail(n, '`within` takes a tolerance of 0 or more, after == or !=')
        if right == ['ref']:
            if field or op != '==' or within is not None:
                self.fail(n, 'a sound compares with its reference whole, with == and the runner\'s tolerances: '
                             '%s == ref' % name)
            return ('ref', None), None
        if field not in AUDIO_FIELDS:
            self.fail(n, 'a sound is checked by a measure (%s.peak > -30; it has: %s) or against its reference '
                         '(%s == ref)' % (name, ' '.join(AUDIO_FIELDS), name))
        offset = 0.0
        if len(right) == 3 and right[1] in ('+', '-'):
            offset, right = float(right[2]) * (1 if right[1] == '+' else -1), right[:1]
            if not math.isfinite(offset):
                self.fail(n, 'an offset is a number')
        if len(right) != 1:
            self.fail(n, 'after %s: a number, or another sound\'s measure and an offset (other.len20 + 30)' % op)
        other, _, other_field = right[0].partition('.')
        if other_field and self.captures.get(other) == 'audio':
            if other_field not in AUDIO_FIELDS:
                self.fail(n, 'a sound has no measure %s' % other_field)
            return ('field', (other, other_field, offset)), within
        if offset:
            self.fail(n, 'an offset follows another sound\'s measure')
        if not math.isfinite(float(right[0])):
            self.fail(n, 'a measure is compared with a number')
        return ('value', float(right[0])), within

    def timeline(self):
        return '\n'.join(op.text() for op in self.ops)


def find_cases(paths):
    files = []
    for p in map(Path, paths):
        files += sorted(p.rglob('*.case')) if p.is_dir() else [p]
    if not files:
        raise CaseError('no .case files in %s' % ' '.join(map(str, paths)))
    cases = [Case(f) for f in files]
    names = [c.name for c in cases]
    for name in names:
        if names.count(name) > 1:
            raise CaseError('two cases are named %s' % name)
    return cases


# ---- the screen as a file -------------------------------------------------------------------

def write_pbm(rows, path):
    data = bytearray()
    for row in rows:
        for i in range(0, 128, 8):
            data.append(sum(px << (7 - k) for k, px in enumerate(row[i:i + 8])))
    Path(path).write_bytes(b'P4\n128 64\n' + bytes(data))


def read_pbm(path):
    raw = Path(path).read_bytes()
    if not raw.startswith(b'P4\n128 64\n') or len(raw) != 10 + 1024:
        raise CaseError('%s is not a 128 x 64 PBM this tool wrote' % path)
    data = raw[10:]
    return [[(data[y * 16 + x // 8] >> (7 - x % 8)) & 1 for x in range(128)] for y in range(64)]


def screen_diff(a, b, region, ignore=()):
    """(pixels that differ, their bounding box as X Y W H or None), inside the region if one is given and
    outside the ignored parts."""
    x0, y0, w, h = region or (0, 0, 128, 64)
    pts = [(x, y) for y in range(y0, y0 + h) for x in range(x0, x0 + w) if a[y][x] != b[y][x]
           and not any(i <= x < i + k and j <= y < j + m for i, j, k, m in ignore)]
    if not pts:
        return 0, None
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    return len(pts), (min(xs), min(ys), max(xs) - min(xs) + 1, max(ys) - min(ys) + 1)


# ---- checking a case's replies --------------------------------------------------------------

def decode(kind, ops, got):
    """A capture from its requests and their replies' payloads; ValueError names a reply that is not whole."""
    if kind == 'audio':
        return audio().measure(got[0])
    data = []
    for op, p in zip(ops, got):
        if kind == 'ident':
            if len(p) < 63:
                raise ValueError('the ident reply has %d bytes, not 63 or more' % len(p))
            return rl.ident_text(p)
        size = 512 if kind == 'screen' else op.values[1]
        if len(p) < 5 or rl.get32(p, 0) != op.values[0]:
            raise ValueError('the reply is not for %#x' % op.values[0])
        part = rl.unpack7(p[5:])[:size]
        if len(part) < size:
            raise ValueError('the reply for %#x has %d bytes, not %d' % (op.values[0], len(part), size))
        data.append(part)
    return rl.frame_rows(b''.join(data)) if kind == 'screen' else b''.join(data)


def judge(case, replies, out, refs, record, problems=()):
    """The case's result from its replies: {'status': pass|fail|error, 'checks': [...], 'problems': [...]}."""
    out.mkdir(parents=True, exist_ok=True)
    problems, parts = list(problems), {}
    for op, r in zip(case.ops, replies):
        where = 'line %d' % op.line if op.line else 'the runner\'s own steps'
        if r is None:
            if op.name != 'audio':                          # a window that was not cut is a problem already
                problems.append('%s: no reply to %s at %d ms' % (where, op.name, op.t))
        elif r[0]:
            problems.append('%s: %s at %d ms: %s' % (where, op.name, op.t, rl.STATUS.get(r[0], r[0])))
        elif op.slot:
            parts.setdefault(op.slot[0], {})[op.slot[1]] = r[1]
    caps = {}
    for i, (name, kind) in enumerate(case.captures.items()):
        got = parts.get(name, {})
        ops = [op for op in case.ops if op.slot and op.slot[0] == name]
        if len(got) != len(ops):
            continue                                        # its failed request is a problem already
        try:
            caps[name] = decode(kind, ops, [got[k] for k in range(len(ops))])
        except ValueError as e:
            problems.append('line %d: %s was not captured: %s' % (ops[0].line, name, e))
            continue
        if kind == 'screen':
            rl.write_png(caps[name], out / ('%02d-%s.png' % (i, name)))
        if kind == 'audio':
            audio().write_wav(out / ('%02d-%s.wav' % (i, name)), got[0])
    # A reference is recorded only from a case with nothing wrong and every other check passed.
    checks = {}
    for final in (False, True):
        clean = not problems and all(c['ok'] for c in checks.values())
        for k, e in enumerate(case.expects):
            if (e['want'][0] == 'ref') == final:
                ok, note = check(case, e, caps, out, refs, record, clean)
                checks[k] = {'line': e['line'], 'expect': e['text'], 'ok': ok, 'note': note}
    checks = [checks[k] for k in range(len(case.expects))]
    status = 'error' if problems or any(c['ok'] is None for c in checks) else \
        'pass' if all(c['ok'] for c in checks) else 'fail'
    return {'name': case.name, 'file': str(case.path), 'status': status, 'problems': problems, 'checks': checks,
            'mem': {k: v.hex(' ') for k, v in caps.items() if case.captures[k] == 'mem'},
            'ident': {k: v for k, v in caps.items() if case.captures[k] == 'ident'},
            'audio': {k: v for k, v in caps.items() if case.captures[k] == 'audio'}}


def check(case, e, caps, out, refs, record, clean):
    """(True, False or None for "could not be checked", a note)."""
    name, kind = e['name'], case.captures[e['name']]
    if name not in caps:
        return None, '%s was not captured' % name
    got = caps[name]
    if kind == 'ident':
        if e['field'] not in got:
            return None, 'ident has no field %s' % e['field']
        have, want = got[e['field']], e['want'][1]
        if e['want'][0] == 'field':
            other, field = want
            if field not in caps.get(other, {}):
                return None, '%s.%s was not captured' % (other, field)
            want = caps[other][field]
        ok = {'==': have == want, '!=': have != want, '<': have < want, '>': have > want}[e['op']]
        return ok, '%s is %s' % (e['field'], have)
    if kind == 'audio':
        return check_audio(e, caps, refs, record, clean)
    how, other = e['want']
    if how == 'ref':
        path = refs / ('%s.pbm' % name)
        try:
            old = read_pbm(path) if path.exists() else None
        except CaseError as err:
            if not record:
                return None, str(err)
            old = None
        if record:
            if not clean:
                return None, 'not recorded: the case has a problem or a failed check'
            path.parent.mkdir(parents=True, exist_ok=True)
            write_pbm(got, path)
            return True, 'recorded %s%s' % (path, ' (it replaces a different one)' if old not in (None, got) else '')
        if old is None:
            return None, 'no reference %s: run once with --record and look at it' % path
        want = old
    elif how == 'capture':
        if other not in caps:
            return None, '%s was not captured' % other
        want = caps[other]
    else:
        want = other
    if kind == 'mem':
        same = got == want
        return same == (e['op'] == '=='), 'bytes are %s' % got.hex(' ')
    count, box = screen_diff(got, want, e['region'], case.ignore)
    if count:
        rl.write_png([[a ^ b for a, b in zip(ra, rb)] for ra, rb in zip(got, want)],
                     out / ('diff-line%d-%s.png' % (e['line'], name)))
    note = 'the screens are equal' if not count else '%d pixels differ, inside %d %d %d %d' % ((count,) + box)
    if e['region']:
        note += ' (region %d %d %d %d)' % e['region']
    return (count == 0) == (e['op'] == '=='), note


def near(field, have, want):
    if have is None or want is None:
        return have is want
    flat, share = AUDIO_TOL[field]
    return abs(have - want) <= max(flat, share * abs(want))


def check_audio(e, caps, refs, record, clean):
    name, got = e['name'], caps[e['name']]
    how, other = e['want']
    if how == 'ref':
        path, old = refs / ('%s.audio.json' % name), None
        if path.exists():
            try:
                old = json.loads(path.read_text())
                if not isinstance(old, dict):
                    raise ValueError
            except ValueError:
                if not record:
                    return None, '%s is not a reference this tool wrote' % path
                old = None
        if record:
            if not clean:
                return None, 'not recorded: the case has a problem or a failed check'
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(got, indent=1) + '\n')
            return True, 'recorded %s%s' % (path, ' (it replaces a different one)' if old not in (None, got) else '')
        if old is None:
            return None, 'no reference %s: run once with --record and listen to the take' % path
        off = ['%s is %s, the reference has %s' % (f, got[f], old.get(f)) for f in AUDIO_FIELDS
               if not near(f, got[f], old.get(f))]
        return not off, '; '.join(off) or 'every measure is near the reference\'s'
    have, note = got[e['field']], '%s is %s' % (e['field'], got[e['field']])
    if how == 'field':
        name2, field2, offset = other
        if name2 not in caps:
            return None, '%s was not captured' % name2
        want = caps[name2][field2]
        note += ', %s.%s is %s' % (name2, field2, want)
        if want is not None:
            want += offset
    else:
        want = other
    if have is None or want is None:
        return False, note + ': no such measure here (a window without sound, or gapmin and gapmax with under two dips)'
    if e['within'] is not None:
        return (abs(have - want) <= e['within']) == (e['op'] == '=='), note
    return {'==': have == want, '!=': have != want, '<': have < want, '>': have > want}[e['op']], note


def note_bytes(op, channel):
    """The MIDI message of a `note` or `cc` op on the auto channel: a note's number is the track's place, 0
    for BD; a controller change goes to the active track."""
    if op.name == 'cc':
        return bytes([0xb0 | (channel - 1), op.values[0], op.values[1]])
    on, track, vel = op.values
    return bytes([(0x90 if on == 'on' else 0x80) | (channel - 1), TRACKS.index(track), vel])


# ---- the emulator ---------------------------------------------------------------------------

def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def link_replies(data):
    """Every development-link reply in a stream of USB MIDI bytes, in order."""
    out, i = [], 0
    while (s := data.find(rl.HEADER, i)) != -1:
        e = data.find(b'\xF7', s)
        if e < 0:
            break
        r = rl.parse(data[s:e + 1])
        if r:
            out.append(r)
        i = e + 1
    return out


def match_replies(sent, replies):
    """For each (seq, command) sent, its reply's (status, payload) or None; replies come in order."""
    out, j = [], 0
    for seq, cmd in sent:
        k = next((k for k in range(j, min(len(replies), j + MATCH_WINDOW))
                  if (replies[k][0], replies[k][1]) == (seq, cmd)), None)
        if k is None:
            out.append(None)
        else:
            out.append((replies[k][2], replies[k][3]))
            j = k + 1
    return out


class Emu:
    def __init__(self, dtboot, image, cache, log):
        self.dtboot, self.image, self.log = Path(dtboot).resolve(), Path(image).resolve(), log
        if not self.dtboot.is_file():
            raise Abort('no dtboot at %s' % self.dtboot)
        self.image_sha = sha256(self.image)
        recipe = repr((SNAP_VERSION, IPS, EMU_BOOT_PRESSES, EMU_BOOT_LINK, EMU_BOOT_END)).encode()
        self.dir = Path(cache) / ('%s-%s-%s' % (self.image_sha[:12], sha256(self.dtboot)[:8],
                                                hashlib.sha256(recipe).hexdigest()[:6]))
        self.snap, self.meta = self.dir / 'armed.snap', self.dir / 'armed.json'

    def run(self, args, usb_out, stdout, timeout):
        if usb_out.exists():
            usb_out.unlink()
        try:
            r = subprocess.run([str(self.dtboot), str(self.image)] + args, timeout=timeout,
                               env=dict(os.environ, DTBOOT_USB_OUT=str(usb_out)),
                               capture_output=True, text=True, errors='replace', cwd=self.dtboot.parent)
        except subprocess.TimeoutExpired:
            raise Abort('dtboot did not finish in %d s' % timeout)
        stdout.write_text(r.stdout + r.stderr)
        if r.returncode:
            raise Abort('dtboot left with status %d: see %s' % (r.returncode, stdout))
        m = re.search(r'^(FAULT vector .*|BREAK at .*)$', r.stdout, re.M)
        self.stopped = 'the emulator stopped early: %s (see %s)' % (m.group(1), stdout) if m else None
        return r.stdout, usb_out.read_bytes() if usb_out.exists() else b''

    def prepare(self, rebuild=False):
        """A snapshot of this image booted and armed, made once per image and emulator build."""
        if self.meta.exists() and self.snap.exists() and not rebuild:
            meta = json.loads(self.meta.read_text())
            if meta.get('sha256') == self.image_sha:
                self.clock = meta['clock']
                return
        self.dir.mkdir(parents=True, exist_ok=True)
        self.log('booting and arming the image in the emulator (once per image, under a minute)')
        args = ['--every', '500M']
        for key, at, hold in EMU_BOOT_PRESSES:
            args += ['--press', '%s@%dM:%dM' % (key, at, hold)]
        sent = []
        for i, (name, values, at) in enumerate(EMU_BOOT_LINK, 1):
            args += ['--usb-midi', '%s@%dM' % (rl.request(i, name, *values).hex(), at)]
            sent.append((i, rl.CMD[name]))
        tmp = self.dir / 'armed.snap.tmp'
        _, usb = self.run(args + ['--instr', '%dM' % EMU_BOOT_END, '--save', str(tmp)], self.dir / 'boot.usb',
                          self.dir / 'boot.log', 900)
        if self.stopped:
            raise Abort(self.stopped)
        got = match_replies(sent, link_replies(usb))
        bad = [i for i, m in enumerate(got[:-1]) if not m or m[0]]
        if bad:                         # a refused NO tap leaves GLOBAL open in the snapshot
            raise Abort('the boot recipe\'s link taps were not all taken (%s); see %s'
                        % (', '.join('%d: %s' % (i, got[i] and rl.STATUS.get(got[i][0], got[i][0])) for i in bad),
                           self.dir / 'boot.log'))
        last = got[-1]
        ident = rl.ident_text(last[1]) if last and not last[0] else None
        if not ident or not ident['armed'] or ident['human']:
            raise Abort('the image did not come up armed in the emulator (ident: %s); see %s'
                        % (ident, self.dir / 'boot.log'))
        out, _ = self.run(['--load', str(tmp), '--instr', '1'], self.dir / 'probe.usb', self.dir / 'probe.log', 300)
        m = re.search(r'restored .* at clock (\d+)', out)
        if not m:
            raise Abort('dtboot did not say where the snapshot resumes; see %s' % (self.dir / 'probe.log'))
        self.clock = int(m.group(1))
        tmp.replace(self.snap)
        self.meta.write_text(json.dumps({'clock': self.clock, 'image': str(self.image), 'sha256': self.image_sha,
                                         'ident': ident}, indent=1))

    def play(self, case, out, note_channel):
        out.mkdir(parents=True, exist_ok=True)
        base = self.clock + EMU_LEAD_MS * IPS // 1000
        args, sent, wav = ['--load', str(self.snap), '--every', '500M'], [], out.resolve() / 'emu.usb.wav'
        for op in case.ops:
            at = base + op.t * IPS // 1000
            if op.name in ('note', 'cc'):
                args += ['--usb-midi', '%s@%d' % (note_bytes(op, note_channel).hex(), at)]
            elif op.name != 'audio':
                seq = (len(sent) + 1) & 0x7f
                args += ['--usb-midi', '%s@%d' % (rl.request(seq, op.name, *op.values).hex(), at)]
                sent.append((seq, rl.CMD[op.name]))
        sound = 'audio' in case.captures.values()
        if sound:
            wav.unlink(missing_ok=True)
            args += ['--usb-wav', str(wav)]
        args += ['--instr', str((EMU_LEAD_MS + case.duration + EMU_TAIL_MS) * IPS // 1000)]
        problems, take = [], None
        try:
            _, usb = self.run(args, out / 'emu.usb', out / 'emu.log', 300 + case.duration // 100)
            if sound:
                try:
                    take = audio().read_take(wav)           # its frame 0 is the snapshot's clock
                except (OSError, ValueError, RuntimeError) as e:
                    problems.append('no take from the emulator: %s' % e)
        finally:
            wav.unlink(missing_ok=True)                     # each window is kept as its own file
        if self.stopped:
            problems.insert(0, self.stopped)
        got, replies = iter(match_replies(sent, link_replies(usb))), []
        for op in case.ops:
            if op.name in ('note', 'cc'):
                replies.append((0, b''))
            elif op.name == 'audio':
                replies.append(None)
                if take is not None:
                    try:
                        replies[-1] = (0, audio().cut(take, (EMU_LEAD_MS + op.t) * AUDIO_RATE // 1000, op.values[1],
                                                      SOURCES[op.values[0]]))
                    except ValueError as e:
                        problems.append('line %d: %s' % (op.line, e))
            else:
                replies.append(next(got))
        return replies, problems


# ---- the unit -------------------------------------------------------------------------------

def unit_play(link, case, rec, note_channel):
    """Sends the case's requests and notes at their times and returns (replies, late ms, answers that were
    not ok, problems with the sound).

    An answer takes up to a link tick, so a request can be due before the one ahead of it is answered. It
    then goes late and the rest of the case moves later by as much: every gap, settle and `wait` the case
    asks for is kept in full, and an `audio` window opens when its step is reached, on the recorder's clock.
    The firmware counts each answer that is not ok in `refused`."""
    if rec and 'audio' in case.captures.values():
        rec.begin()
    try:
        return unit_play_ops(link, case, rec, note_channel)
    finally:
        if rec:
            rec.end()


def unit_play_ops(link, case, rec, note_channel):
    replies, t0, late, not_ok, sounding, windows, problems = [], time.time(), 0.0, 0, {}, [], []
    try:
        for op in case.ops:
            wait = t0 + op.t / 1000 - time.time()
            if wait > 0:
                time.sleep(max(0, wait - 0.02))             # sleep wakes up to 10 ms late (measured, macOS):
                while time.time() < t0 + op.t / 1000:       # the last of the wait is spun, for a note's time
                    pass
            else:
                t0, late = t0 - wait, late - wait
            if op.name == 'cc':
                link.out.send(link.mido.Message.from_bytes(note_bytes(op, note_channel)))
                replies.append((0, b''))
                continue
            if op.name == 'note':
                raw = note_bytes(op, note_channel)
                link.out.send(link.mido.Message.from_bytes(raw))
                if op.values[0] == 'on':
                    sounding[raw[1]] = bytes([raw[0] - 0x10, raw[1], 0])
                else:
                    sounding.pop(raw[1], None)
                replies.append((0, b''))
                continue
            if op.name == 'audio':
                windows.append((len(replies), rec.now()))
                replies.append(None)
                continue
            for _ in range(50):
                status, payload = link.call(op.name, *op.values)
                not_ok += status != 0
                if status != 3 or op.name not in ('key', 'enc'):
                    break
                time.sleep(0.05)                            # busy: the UI loop is behind
            replies.append((status, payload))
            if status == 5:
                raise Abort('a person is at the unit: stopped at %s' % (('line %d' % op.line) if op.line else 'the start'))
            if status == 1:
                raise Abort('the unit is not armed (GLOBAL > REMOTE CTRL)')
    finally:
        for off in sounding.values():                       # no note is left on when a case stops midway
            try:
                link.out.send(link.mido.Message.from_bytes(off))
            except Exception:
                pass
    for i, start in windows:
        op = case.ops[i]
        try:
            x, why = rec.window(start, op.values[1], SOURCES[op.values[0]])
        except Exception as e:                              # the sound is lost, the case's other answers are not
            x, why = None, '%s: %s' % (type(e).__name__, e)
        if why:
            problems.append('line %d: %s' % (op.line, why))
        else:
            replies[i] = (0, x)
    return replies, round(late * 1000), not_ok, problems


def unit_ready(ident, case, label):
    if ident['label'] != label:
        return 'the unit runs %s, not %s' % (ident['label'], label)
    if not ident['armed']:
        return 'the unit is not armed (GLOBAL > REMOTE CTRL)'
    if ident['human']:
        return 'a person is at the unit'
    if ident['playing'] and case.head['transport'] == 'stopped':
        return 'the sequencer is playing (the case does not say `transport: any`)'
    return None


# ---- runs -----------------------------------------------------------------------------------

def report(out, target, about, results, log):
    counts = {s: sum(1 for r in results if r['status'] == s) for s in ('pass', 'fail', 'error', 'skipped')}
    lines = ['Rytm test run on the %s, %s' % (target, time.strftime('%Y-%m-%d %H:%M:%S'))]
    lines += ['%s: %s' % kv for kv in about.items()]
    lines.append('')
    for r in results:
        lines.append('%-7s %s%s' % (r['status'].upper(), r['name'],
                                    '  (no checks)' if r['status'] == 'pass' and not r.get('checks') else ''))
        lines += ['        %s' % p for p in r.get('problems', [])]
        for c in r.get('checks', []):
            if c['ok'] is not True or c['note'].startswith('recorded'):
                mark = {True: 'ok', False: 'FAILED', None: 'not checked'}[c['ok']]
                lines.append('        line %d: expect %s: %s (%s)' % (c['line'], c['expect'], mark, c['note']))
    lines.append('')
    lines.append(', '.join('%d %s' % (n, s) for s, n in counts.items() if n) or 'no cases')
    text = '\n'.join(lines)
    (out / 'report.txt').write_text(text + '\n')
    (out / 'report.json').write_text(json.dumps({'target': target, 'about': about, 'counts': counts,
                                                 'results': results}, indent=1))
    log(text)
    log('report: %s' % (out / 'report.txt'))
    return 0 if counts['pass'] == len(results) and results else 1


def broken(case, status, why):
    return {'name': case.name, 'file': str(case.path), 'status': status, 'problems': [str(why)], 'checks': []}


def refs_dir(a, case, target):
    """Where a case's references live: under --refs (default <cache>/refs), by the case's folder and name, so
    two modules' cases of one name keep apart and no capture lands in the repository."""
    return Path(a.refs) / case.path.parent.name / case.name / target


def run_emu(a, cases, out, log):
    emu = Emu(a.emu or os.environ.get('RYTM_EMU') or sys.exit('name dtboot with --emu or RYTM_EMU'), a.image,
              a.cache, log)
    emu.prepare(a.rebuild_snapshot)

    def one(case):
        try:
            replies, problems = emu.play(case, out / case.name, a.note_channel)
            return judge(case, replies, out / case.name, refs_dir(a, case, 'emu'), a.record, problems)
        except Exception as e:                              # one broken case does not end the run
            return broken(case, 'error', e if isinstance(e, Abort) else '%s: %s' % (type(e).__name__, e))
    with ThreadPoolExecutor(max_workers=max(1, a.jobs)) as pool:
        results = list(pool.map(one, cases))
    about = {'image': str(emu.image), 'image sha256': emu.image_sha, 'emulator': str(emu.dtboot),
             'snapshot': str(emu.snap)}
    return report(out, 'emulator', about, results, log)


def seconds(text):
    v = float(text)
    if not (0 <= v <= 600):
        raise argparse.ArgumentTypeError('%s: give 0 to 600 seconds' % text)
    return v


def run_unit(a, cases, out, log):
    if not a.allow_state_change:
        risky = [c.name for c in cases if c.head['state'] != 'safe']
        if risky:
            raise Abort('not marked `state: safe`, so they may change what the unit has saved: %s. '
                        'Run them with --allow-state-change only with a backup.' % ', '.join(risky))
    link = rl.Link(a.port)
    first = link.ident()
    about = {'label': first['label'], 'os build': first['os_build'], 'boot': first.get('boot_text', '?'),
             'image crc': first.get('image_crc', '?')}
    if a.image:
        want = '%08x' % rl.ramboot_args(Path(a.image).read_bytes())[1]
        about['image'] = '%s (unpacked CRC %s)' % (a.image, want)
        if first.get('boot') != 1:
            raise Abort('--image names a RAM-booted image, and the unit runs its flashed OS (%s): RAM-boot the '
                        'image first, or leave --image out to test what is flashed' % first.get('boot_text', '?'))
        if first.get('image_crc') != want:
            raise Abort('the unit runs a RAM-booted image with CRC %s, not %s' % (first.get('image_crc'), want))

    rec = None
    if any('audio' in c.captures.values() for c in cases):
        try:
            rec = audio().Recorder(a.audio)
        except Exception as e:                              # no such device, or PortAudio cannot open it
            raise Abort('no audio from the unit: %s' % e)
        about['audio'] = a.audio

    def stopped(sig, frame):
        raise Abort('stopped by signal %d' % sig)
    for sig in (signal.SIGTERM, signal.SIGHUP):
        signal.signal(sig, stopped)
    # The first note after a boot can be silent: the envelope runs, but no sample sounds (a
    # MKII, 10 Nov 2026: 7 of 12 boots with Improved AMP and 3 of 11 with stock's AMP when
    # the note came about 1 s after the boot; none of 7 with 3 s more, none of 5 with this wait).
    # Perhaps the samples are still loading; not read from code, and a project with more samples
    # may need longer. The link's tick counter starts with the base, so it gives the time since.
    up = first['ticks'] / LINK_TICKS_S
    if up < a.boot_settle:
        log('the link has run %.1f s since the boot: waiting %.1f s before the first case' % (up, a.boot_settle - up))
        time.sleep(a.boot_settle - up)
    results, stop = [], None
    try:
        for case in cases:
            if stop:
                results.append(broken(case, 'skipped', stop))
                continue
            try:
                before = link.ident()
                stop = unit_ready(before, case, a.label)
                if not stop and case.func_nudges and link.mem(FUNC_TURN_AT, 1) != b'\0':
                    case = Case(case.path, func_turn=True)  # stock will not drop the first FUNC turn
                if not stop:
                    replies, late, not_ok, heard = unit_play(link, case, rec, a.note_channel)
                    after = link.ident()
            except (Abort, TimeoutError, RuntimeError) as e:
                stop = str(e)
            except CaseError as e:
                results.append(broken(case, 'error', e))
                continue
            if stop:
                results.append(broken(case, 'error', stop))
                continue
            moved = [k for k in ('human_count', 'drops') if after[k] != before[k]]
            if after['refused'] - before['refused'] != not_ok:
                moved.append('refused')
            problems = ['disturbed while it ran (%s changed): run it again' % ', '.join(moved)] if moved else []
            problems += heard
            try:
                r = judge(case, replies, out / case.name, refs_dir(a, case, 'unit'), a.record, problems)
            except Exception as e:                          # one broken case does not end the run
                r = broken(case, 'error', '%s: %s' % (type(e).__name__, e))
            r['late_ms'] = late
            results.append(r)
            log('%-7s %s' % (r['status'].upper(), r['name']))
    finally:
        for sig in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP):
            signal.signal(sig, signal.SIG_IGN)              # nothing stops the release below
        try:
            link.call('release')                            # leave no key held on the unit
        except Exception:
            log('could not send the closing release: check the unit for a held key')
        if rec:
            try:
                rec.close()
            except Exception:
                pass
    return report(out, 'unit', about, results, log)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest='cmd', required=True)
    s = sub.add_parser('check')
    s.add_argument('cases', nargs='+')
    for name in ('emu', 'unit'):
        s = sub.add_parser(name)
        if name == 'emu':
            s.add_argument('image', help='the image to boot (.syx)')
        s.add_argument('cases', nargs='+')
        s.add_argument('--out', help='the report folder (default: a new one under --cache)')
        s.add_argument('--cache', default=os.environ.get('RYTM_TEST_CACHE', '~/.cache/rytm-test'),
                       help='snapshots and reports (default: RYTM_TEST_CACHE or ~/.cache/rytm-test)')
        s.add_argument('--record', action='store_true', help='write the references `== ref` compares with')
        s.add_argument('--refs', help='the references folder, outside Git (default: refs under --cache)')
        s.add_argument('--note-channel', type=int, default=14, choices=range(1, 17), metavar='1-16',
                       help="the unit's AUTO CHANNEL, which a `note` plays on (default: 14, stock's)")
        if name == 'emu':
            s.add_argument('--emu', help="rytm-emu's dtboot (default: RYTM_EMU)")
            s.add_argument('--jobs', type=int, default=4)
            s.add_argument('--rebuild-snapshot', action='store_true')
        else:
            s.add_argument('--label', required=True, help='the 4-character build the unit must run')
            s.add_argument('--image', help="the RAM-booted image the unit must run, by its CRC (leave out to test the flashed OS)")
            s.add_argument('--port', help='MIDI port name part (default: Analog Rytm)')
            s.add_argument('--allow-state-change', action='store_true')
            s.add_argument('--boot-settle', type=seconds, default=BOOT_SETTLE_S, metavar='S',
                           help='start the first case no sooner than this long after the unit booted (default: %(default)s)')
            s.add_argument('--audio', default='Analog Rytm', help='audio device name part, for cases with an '
                           '`audio` step: the Rytm in OVERBRIDGE mode (default: Analog Rytm)')
    a = ap.parse_args()
    cases = find_cases(a.cases)
    if a.cmd == 'check':
        for c in cases:
            print('%s (%s): %d requests, %d checks, %d ms; state %s%s' % (
                c.name, c.path, len(c.ops), len(c.expects), c.duration, c.head['state'],
                '' if c.head['target'] == 'any' else '; only on the ' + TARGETS[c.head['target']]))
            print(c.timeline())
        return 0
    a.cache = str(Path(a.cache).expanduser())
    a.refs = str(Path(a.refs).expanduser().resolve() if a.refs else Path(a.cache) / 'refs')
    out = Path(a.out).expanduser().resolve() if a.out else Path(a.cache) / 'runs' / (time.strftime('%Y%m%d-%H%M%S-') + a.cmd)
    out.mkdir(parents=True, exist_ok=True)

    def log(text):
        print(text, flush=True)
    for c in cases:
        if c.head['target'] not in ('any', a.cmd):
            log('NOT RUN %s: a case for the %s' % (c.name, TARGETS[c.head['target']]))
    cases = [c for c in cases if c.head['target'] in ('any', a.cmd)]
    if not cases:
        raise Abort('no case for this target')
    return (run_emu if a.cmd == 'emu' else run_unit)(a, cases, out, log)


if __name__ == '__main__':
    # Leave without closing the MIDI ports, as rytm_link.py does (rtmidi's close can hang).
    code = 1
    try:
        code = main()
    except (CaseError, Abort) as e:
        print(e, file=sys.stderr)
        code = 2
    except SystemExit as e:
        code = e.code if isinstance(e.code, int) else (0 if e.code is None else 2)
        if isinstance(e.code, str):
            print(e.code, file=sys.stderr)
    except BaseException:
        import traceback
        traceback.print_exc()
        code = 2
    sys.stdout.flush()
    sys.stderr.flush()
    os._exit(code)
