#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Qualification run for a module set on a development base, over `npm run device -- serve`.

  npm run device:qualify -- --keeps-ok [--seconds 30] [--soak SECONDS] [--crash] [--testing-entry FILE] PKG.mwrm ...

Run it on a bank and Part whose working copy equals its saved one (docs/OCTATRACK_DRIVING.md), transport stopped.
Installs the set, puts each DSP effect alone on T1 (core 1) and T5 (core 0) and reads the load meters, and each track
machine (a package contributing to ot_machines) on T1 and T5 through SRC SETUP's machine list, recording its peak render
time during playback. A priced machine also gets matched quiet and triggered frame-mean readings. Then all run at once
while the pattern plays (machines on T1-T8 round the set, beside
the effects). A machine renders only on trigs: give T1 and T5 trigs. With everything placed, playing: each placed
module's knobs swept (a machine's on its SRC page), the
four Parts switched three times round (each must run its own effects), a queued pattern change into another bank
and back, an optional soak with a meter line every 10 s, and an optional deliberate crash and its restart. Fails
when the loader rejects a packet, errs or rolls back, a crash or DSP stall is recorded (other than --crash's),
frames stop, a pick or switch is refused or late, or a core's peak passes 90 % of a frame. Then it reloads the
Part from its saved copy (checked byte for byte), goes back to the bank and pattern it started on and removes the
set. Prints one JSON summary; exit status 1 on a failure. The power cycle of the plan stays the owner's.

Each install and removal is a Keep, which rewrites the card's kept set. On a RAM-booted development base the flashed
base then starts with no modules after a power cycle, so the run starts only with --keeps-ok, once you have noted the
flashed set (the session's `inventory`) and where its packages are (docs/OCTATRACK_DRIVING.md). --testing-entry FILE
writes what the run saw as a TESTING.md entry: the packages and their SHA-256, the readings and what it does not cover."""
import argparse, datetime, glob, hashlib, json, os, pathlib, re, socket, subprocess, sys, time

ROOT = pathlib.Path(__file__).resolve().parents[1]
SOCKET = os.environ.get('MODWERK_DEV_SOCKET', '/tmp/modwerk-dev.sock')
# An ot_emu session (npm run device:emulator; test:procedure --target emulator), paced to the wall clock so every wait below
# means the same there as on the unit. Never hardware evidence. A check the emulator cannot answer (its DSP frames standing
# still) is listed as not run there, never passed; on the unit every check runs as always.
EMULATOR = os.environ.get('MODWERK_UNIT') == 'emulator'
PEAK_LIMIT = 900  # per mille of a frame
HEADERS = {6: 68, 7: 72, 8: 76, 9: 80, 10: 80}  # header bytes by ABI (sdk/runtime/loader/abi9.py); hook words follow
MACHINES = next(e['index'] for e in json.loads((ROOT / 'sdk/machines/octatrack/events.json').read_text())['events'] if e['event'] == 'ot_machines')
CPU_DEFAULT = 12  # percent of a frame the base charges a machine that names no price (machine_registry.c)


def machine(data):
    """The struct modwerk_machine a package contributes to ot_machines (modwerk_events.h), else None: its hook word holds
    the order (top byte) and the record's image offset; the label is a pointer into the image, stored unrelocated."""
    abi, hooks = int.from_bytes(data[4:6], 'big'), int.from_bytes(data[20:24], 'big')
    if abi not in HEADERS or hooks <= MACHINES: return None
    image, size = HEADERS[abi] + 4 * hooks, int.from_bytes(data[8:12], 'big')
    word = int.from_bytes(data[HEADERS[abi] + 4 * MACHINES:][:4], 'big')
    at = word & 0xffffff
    if word == 0xffffffff or at + 80 > size: return None
    rec = data[image + at:image + at + 80]
    label = int.from_bytes(rec[8:12], 'big')
    if int.from_bytes(rec[:4], 'big') != 1 or label >= size: return None  # MODWERK_MACHINE_ABI
    return dict(order=word >> 24, sig=rec[4:6], lo=rec[6], hi=rec[7], voice=rec[76] > 0, price=rec[77],
                label=data[image + label:image + min(size, label + 16)].split(b'\0')[0].decode('latin1'))


# A package's ABI 6 header: name at 50 (15 bytes), slots at 39 (1 FX1, 2 FX2, 3 both), module id at 28; no DSP code below ABI 5.
# A machine with a DSP voice (Analog BD) carries DSP code too, but no effect slot: it is placed as a machine.
def package(path):
    data = open(path, 'rb').read()
    abi = int.from_bytes(data[4:6], 'big')
    if data[:4] != b'MWRM' or abi < 6: raise SystemExit(path + ': not an ABI 6 runtime module')
    return dict(path=path, name=data[50:65].split(b'\0')[0].decode('latin1'), slots=data[39], dsp=int.from_bytes(data[32:36], 'big') > 0,
                module=int.from_bytes(data[28:32], 'big'), machine=machine(data), sha256=hashlib.sha256(data).hexdigest())


def effect(p): return p['dsp'] and not p['machine']


def published_machines():
    """Module id -> machine of every package this checkout publishes: the rows of machines installed beside the run's."""
    found = {}
    for path in glob.glob(str(ROOT / 'public/octatrack-modules/*/*.mwrm')):
        try: data = pathlib.Path(path).read_bytes()
        except OSError: continue
        m = data[:4] == b'MWRM' and int.from_bytes(data[4:6], 'big') in HEADERS and machine(data)
        if m: found[int.from_bytes(data[28:32], 'big')] = m
    return found


NOT_COVERED = ('listening to the sound', 'the power cycle and what survives it', 'MIDI, scenes and recording',
               'modules beside other installed modules')


def testing_entry(result, day, title='Qualification run', command='device:qualify', notes=(), left=None):
    """The run as a TESTING.md entry: only what it measured, and what it leaves to the developer."""
    lines = ['### %s, %s' % (title, day), '',
             'Command: `npm run %s -- %s`' % (command, ' '.join(result['args'])), '']
    lines += ['- Package `%s`, %s, SHA-256 `%s`' % (p['file'], p['name'], p['sha256']) for p in result['packages']]
    lines += ['- ' + note for note in notes]
    if result.get('selftest'): lines.append('- Self-test with the package installed: ' + result['selftest'])
    for m in result['modules']:
        if m.get('machine'):
            alone = ', '.join('%s %s' % (track, 'refused' if r == 'refused' else 'core peak %d per mille, CPU %d per mille, its render %s' % (
                r['core1_peak'] if track == 'T1' else r['core0_peak'], r['cpu'], 'not read' if r.get('render') is None else 'peak %.1f %% of a frame' % r['render']))
                for track, r in m.items() if track in ('T1', 'T5'))
            lines.append('- %s (machine) alone, playing: %s' % (m['name'], alone))
            if m.get('price_on_unit_only'):
                lines.append('- Mean CPU price check: hardware only.')
            for track in ('T1', 'T5'):
                reading = m.get(track)
                if isinstance(reading, dict) and 'audition' in reading:
                    pair = reading['audition']
                    lines.append('- %s %s, mean frame interrupt: quiet %.1f %%, triggered %.1f %%, added %+.1f points; price %d %%.' %
                                 (m['name'], track, pair['quiet'], pair['triggered'], pair['added'], pair['price']))
            continue
        alone = ', '.join('%s %s' % (track, 'refused' if r == 'refused' else 'peak %d per mille of a frame, admitted in %d ms' % (
            r['core1_peak'] if track == 'T1' else r['core0_peak'], r['admit_ms'])) for track, r in m.items() if track in ('T1', 'T5'))
        lines.append('- %s on %s alone: %s' % (m['name'], m['slot'], alone))
    if result.get('together'):
        g = result['together']
        what = '; '.join(filter(None, [', '.join(n or 'refused' for n in g['placed']),
                                       g.get('machines') and 'machines T1-T8: ' + ', '.join(n or 'refused' for n in g['machines'])]))
        lines.append('- All at once, playing (%s): CPU %d, T1-4 peak %d, T5-8 peak %d per mille' % (what, g['cpu'], g['core1_peak'], g['core0_peak']))
    if result.get('parts'): lines.append('- Part switches: %d of %d ran their own effects within 3 s' % (sum(n > 0 for n in result['parts']), len(result['parts'])))
    if result.get('soak'): lines.append('- Soak: %d s, highest core peak %d per mille' % (10 * len(result['soak']), max(max(m['core0_peak'], m['core1_peak']) for m in result['soak'])))
    lines.append('- Crash test: %s' % ('run, the unit came back' if result.get('crash') and not any('crash' in f for f in result['failures']) else 'run' if result.get('crash') else 'not run'))
    if result.get('inventory'): lines.append('- Inventory at the end: ' + ('the same as before the run' if result['inventory'] == 'unchanged' else 'different from before the run'))
    if result.get('not_run'): lines.append('- Not run here: ' + '; '.join(result['not_run']))
    lines.append('- Result: ' + ('passed' if not result['failures'] else 'failed: ' + '; '.join(result['failures'])))
    if left: lines += ['', 'Left for the developer at the unit: ' + ', '.join(left) + '.', '']
    else: lines += ['', 'Not covered by this run: ' + ', '.join(NOT_COVERED) + '.', '']
    return '\n'.join(lines)


def log(*a): print(*a, file=sys.stderr, flush=True)


def session_socket(path):
    """The session's socket: a port number is TCP on this computer (Windows Python has no AF_UNIX), anything else a Unix socket."""
    return socket.socket(socket.AF_INET) if path.isdigit() else socket.socket(socket.AF_UNIX)


def session_address(path): return ('127.0.0.1', int(path)) if path.isdigit() else path


def send(sequence):
    log('>', sequence)
    s = session_socket(SOCKET)
    s.settimeout(40)  # the session answers within 20 s; never wait for ever
    s.connect(session_address(SOCKET))
    s.sendall((sequence + '\n').encode())
    reply = s.makefile().read()
    if 'error:' in reply: raise RuntimeError(sequence + ': ' + reply.strip())
    return reply


def counters():
    loader = re.search(r'rejected (\d+)/(\d+) errors (\d+) .*rollbacks (\d+)', send('loader'))
    crash, stall = re.match(r'crash (\d+)', send('crash')), re.match(r'stall (\d+)', send('stall'))
    return dict(rejected=int(loader.group(1)) + int(loader.group(2)), errors=int(loader.group(3)), rollbacks=int(loader.group(4)),
                crashes=int(crash.group(1)) if crash else 0, stalls=int(stall.group(1)) if stall else 0)


def mem(addr, n): return bytes.fromhex(''.join(send('mem:%#x:%d' % (addr, n)).split()))
def u32(addr): return int.from_bytes(mem(addr, 4), 'big')
BANK, PART = 0x46c82456, 0x80000003  # the current bank's base; the current Part (docs/OCTATRACK_DRIVING.md)
def part_fx(part, saved=False): return mem(u32(BANK) + (0x9504a if saved else 0x8ed80) + part * 6322, 16)
def part_copy(part, saved=False): return mem(u32(BANK) + (0x9504a if saved else 0x8ed80) + part * 6322, 6322)
def part_saved_equal(): part = mem(PART, 1)[0]; return part_copy(part) == part_copy(part, saved=True)
def frames(): return int(re.search(r'frames=(\d+)', send('report')).group(1))
FX_IDS = {1: 0x40052798, 2: 0x4005252a}  # lea operands naming FX1_IDS and FX2_IDS (id -> descriptor, its name at +9)
def fx_name(slot, fx): return mem(u32(u32(FX_IDS[slot]) + 4 * fx) + 9, 16).split(b'\0')[0].decode('latin1').upper().replace(' ', '_')
def chooser_names(slot):  # every effect's name in a chooser table (128 ids at most; a 0 ends a shorter table)
    table = mem(u32(FX_IDS[slot]), 4 * 128)
    return [fx_name(slot, fx) for fx in range(128) if int.from_bytes(table[4 * fx:4 * fx + 4], 'big')]
def chooser_name(names, name):
    """The chooser's name for an installed package: its page may say more than the package (Spectrum79 for Spectrum),
    or the same words in another order (RINGMOD SC for SC Ringmod)."""
    want = name.upper().replace(' ', '_')
    words = sorted(want.split('_'))
    return want if want in names else next((n for n in names if n.startswith(want)),
                                           next((n for n in names if sorted(n.split('_')) == words), want))


REFUSED = os.path.join(os.environ.get('TMPDIR', '/tmp'), 'modwerk-refused-machine-T%d.png')
SIG = 60  # a track's machine in a Part: its type byte at 0x22 + track, its signature (two letters, a version) at 60 + 30 * track


class Machines:
    """SRC SETUP's machine list: STATIC, FLEX, THRU, NEIGHBOR and PICKUP (a stock track's type byte is its row), then
    each installed machine from row 5, lower order first, then module id (HOOKS.md, ot_machines). The installed ones are
    the inventory's modules whose package is known: those under test, else the ones this checkout publishes."""

    def __init__(self, pkgs):
        known = published_machines()
        known.update({p['module']: p['machine'] for p in pkgs if p['machine']})
        try: installed = {int(m['module'], 16) for m in json.loads(send('inventory').strip().splitlines()[-1])}
        except (ValueError, TypeError, KeyError, IndexError, AttributeError): installed = set()  # a base without INVENTORY
        installed |= {p['module'] for p in pkgs}
        self.rows = [known[m] for m in sorted((m for m in installed if m in known), key=lambda m: (known[m]['order'], m))]
        self.unknown = sorted('%08x' % m for m in installed if m not in known and m not in {p['module'] for p in pkgs})

    def row_of(self, part, track):
        """The row of what `part` (a Part's bytes) names on `track`: its machine's, else its stock type."""
        kind, sig = part[0x22 + track], part[SIG + 30 * track:SIG + 30 * track + 3]
        if kind <= 1:
            for k, m in enumerate(self.rows):
                if sig[:2] == m['sig'] and m['lo'] <= sig[2] <= m['hi']: return 5 + k
        return kind

    def pick(self, track, row):
        """Track `track` (0-7) to `row` through SRC SETUP: the list clamps at STATIC, so UP past every row, then DOWN. NO
        closes the list, and with it a CPU FULL or DSP FULL box. Returns the row the working Part then names on the track."""
        send('NO w300 T%d w200 FUNC+SRC w300 UP*%d w100 %sYES w300' % (track + 1, 6 + len(self.rows), 'DOWN*%d w100 ' % row if row else ''))
        now = self.row_of(part_copy(mem(PART, 1)[0]), track)
        if now != row and row >= 5: send('png:' + REFUSED % (track + 1))  # the box says why, until NO clears it
        send('NO w300')
        return now

    def place(self, track, m):
        """`m`'s row on `track`; RuntimeError when the base refused it (the track keeps what it had) or the row was another
        machine's."""
        row = 5 + next(k for k, r in enumerate(self.rows) if r is m)
        before = self.row_of(part_copy(mem(PART, 1)[0]), track)
        now = self.pick(track, row)
        if now == row: return
        if now != before:
            raise RuntimeError('row %d of the machine list was %s, not %s: an installed machine this run has no package for (%s)'
                               % (row, self.rows[now - 5]['label'] if now >= 5 else 'a stock machine', m['label'], ', '.join(self.unknown) or 'none listed'))
        raise RuntimeError('%s refused on T%d (CPU FULL, DSP FULL or the machine\'s own admission; its screen: %s)'
                           % (m['label'], track + 1, REFUSED % (track + 1)))


def save_part(part, saved):
    """SAVE from the Part menu, on a Part whose working copy equals its saved one: the same bytes, but the closing RELOAD
    then works, which a Part not saved since the boot refuses (SAVE PART FIRST!: every Part after a RAM boot, MKII,
    20 November 2026). The menu keeps its cursor and stops at RENAME, so UP three times, DOWN twice. True when both
    copies still equal `saved`."""
    send('NO w200 savepart')  # FUNC + PART, or the MKI's own gesture (device.mjs partMenu)
    return part_copy(part) == saved and part_copy(part, saved=True) == saved


def refresh_load():
    """Five seconds of playing. Stopped, the base judges a pick by the mean of the last four seconds it played (status.c
    cpu_played), so right after a machine is taken off a track the next pick is still judged with it: on an MKII
    (20 November 2026) POLY8 on T1 played at 84 %, and every pick after it was refused CPU FULL."""
    send('PLAY w5000 STOP w500')


def restore_part(part, saved, machines=None):
    """The Part as `saved` again, in both copies. RELOAD first (run() saved the Part, so it works after a RAM boot too);
    a Part that was never saved refuses it (SAVE PART FIRST!, nothing changes), so then each slot whose effect differs gets the saved one picked back by name, which brings its
    default knobs back, and with `machines` (a Machines) each track whose machine differs gets the saved one's row: enough
    for a Part that holds defaults (a cleared one). True when both copies equal `saved`."""
    send('reload')
    if part_copy(part) != saved:
        send('NO w200')  # the SAVE PART FIRST! message
        work = part_copy(part)
        for i in range(16):
            if work[i] != saved[i]: send('pick:T%d:FX%d:%s' % (i % 8 + 1, i // 8 + 1, fx_name(i // 8 + 1, saved[i])))
        for t in range(8 if machines else 0):
            if machines.row_of(work, t) != machines.row_of(saved, t): machines.pick(t, machines.row_of(saved, t))
    return part_copy(part) == saved and part_copy(part, saved=True) == saved


def renders():
    """The `cpu` step's guarded renders, the longest of each track since the last read, in percent of a frame (both passes)."""
    try: reply = send('cpu')
    except RuntimeError: return None  # a base without the CPU budget
    found = dict(re.findall(r'T([1-8]) ([\d.]+)', reply.split('guarded renders', 1)[-1]))
    return [float(found.get(str(t + 1), 0)) for t in range(8)]


def running(failures, what):  # frames advance: the DSPs are alive
    a = frames(); send('w300'); b = frames()
    if a == b: failures.append('frames stopped (%s)' % what)
    return a != b


def frame_clock(result):
    """Whether the DSP frames advance, so the checks that read them can run. Always on the unit; in the emulator only when
    its session runs the DSPs and the frame interrupt (--dsp --frame), else those checks are listed in result['not_run']."""
    if not EMULATOR: return True
    a = frames(); send('w300')
    if frames() != a: return True
    result.setdefault('not_run', []).append('the frame checks and the queued bank change: the emulator\'s DSP frames stand still')
    return False


def until(test, seconds):
    for _ in range(int(seconds * 4)):
        if test(): return True
        time.sleep(0.25)  # not over the session: it may be down (the crash test)
    return False


def meters(n):
    send('w3000')  # each core's meter window is read in turn: let a fresh one settle after a change
    rows = [list(map(int, m.groups())) for m in
            re.finditer(r'stats cpu (\d+) T1-4 (\d+)/(\d+) T5-8 (\d+)/(\d+)', send(' '.join(['w1500 stats'] * n)))]
    return dict(cpu=max(r[0] for r in rows), core1=sum(r[1] for r in rows) // len(rows), core1_peak=max(r[2] for r in rows),
                core0=sum(r[3] for r in rows) // len(rows), core0_peak=max(r[4] for r in rows))


def _alive():
    try: return 'loader accepted' in send('loader')
    except (RuntimeError, OSError): return False


def selftest_reading(failures):
    """The session's `selftest` step (transport stopped): its verdict line. A failed verdict is a failure; a step the
    session does not answer is recorded as such, since a self-test during a trial is not yet observed on a unit."""
    try:
        reply = send('selftest')
    except RuntimeError as e:
        return 'not answered (%s)' % e
    line = next((l.strip() for l in reply.splitlines() if l.startswith('selftest ')), reply.strip() or 'no reply')
    if line.startswith('selftest failed'): failures.append(line)
    return line


def frame_mean(reply):
    readings = re.findall(r'in the frame interrupt ([\d.]+) % over (\d+) frames', reply)
    if not readings or int(readings[-1][1]) == 0:
        raise ValueError('no frame mean in the guard window')
    return float(readings[-1][0])


def audition_price(track, price):
    """Incremental mean in two equal-duration windows on one stopped Part, with only this track retriggered.
    Panel auditions leave the pattern and its parameter locks alone. The sequenced peak is recorded separately."""
    key = 'T%d' % track
    if send('state').strip() != 'stopped':
        raise ValueError('stop the transport before the audition')
    # Holding a track and pressing STOP silences its machine. TRACK+PLAY auditions it without starting the sequencer.
    send(key + '+STOP w500')
    try:
        send('w2500 guard')
        quiet = frame_mean(send('w6000 guard'))
        send(key + '+PLAY w2500')
        renders()
        send('guard')
        start = time.monotonic()
        for i in range(24):
            time.sleep(max(0, start + i * 0.25 - time.monotonic()))
            send(key + '+PLAY')
        time.sleep(max(0, start + 6 - time.monotonic()))
        triggered = frame_mean(send('guard'))
        peaks = renders()
        if not peaks or peaks[track - 1] == 0:
            raise ValueError('no guarded render during the audition')
        if send('state').strip() != 'stopped':
            raise ValueError('transport changed during the audition')
        return dict(quiet=quiet, triggered=triggered, added=round(triggered - quiet, 1), price=price)
    finally:
        send(key + '+STOP w300')


def machine_alone(machines, m, failures):
    """Measure the sequenced peak separately from the mean cost of triggering the track."""
    entry = dict(name=m['label'], slot='SRC', machine=True)
    price = m['price'] or (0 if m['voice'] else CPU_DEFAULT)
    if price and EMULATOR:
        entry['price_on_unit_only'] = True
    for track in (1, 5):
        back = machines.row_of(part_copy(mem(PART, 1)[0]), track - 1)
        try:
            machines.place(track - 1, m)
            renders()  # from now on
            send('PLAY w1000')
            reading = meters(2)
            took = renders()
            send('STOP w500')
            reading['render'] = took and took[track - 1]
            entry['T%d' % track] = reading
            log('  %s on T%d:' % (m['label'], track), reading)
            if price and not EMULATOR:
                try:
                    pair = audition_price(track, price)
                    reading['audition'] = pair
                    if pair['added'] > price:
                        failures.append('%s on T%d added %.1f points of mean frame time, over its %d %% CPU price'
                                        % (m['label'], track, pair['added'], price))
                except (ValueError, RuntimeError) as error:
                    failures.append('%s on T%d: CPU price not measured: %s' % (m['label'], track, error))
        except RuntimeError as e:
            send('STOP w300'); failures.append(str(e)); entry['T%d' % track] = 'refused'
        if machines.pick(track - 1, back) != back: failures.append('T%d did not get its own machine back (row %d)' % (track, back))
        refresh_load()
    return entry


def run(args, pkgs, install, uninstall, selftest=False, inventory=False):
    """The run on the unit between `install(pkgs)` and `uninstall(pkgs, failures)`: device:qualify Keeps both, device:test
    holds a trial and rolls it back (scripts/octatrack-test.py). Returns the result with its failures."""
    failures, result = [], dict(base=None, modules=[], together=None, crash=args.crash, args=sys.argv[1:],
                                packages=[dict(file=os.path.basename(p['path']), name=p['name'], sha256=p['sha256']) for p in pkgs])
    if 'stopped' not in send('state'): raise SystemExit('Stop the transport first.')
    if not part_saved_equal(): raise SystemExit('The current Part differs from its saved copy: run on one that does not.')
    saved_start = part_copy(mem(PART, 1)[0], saved=True)  # what the reload at the end must bring back, in both copies
    if not save_part(mem(PART, 1)[0], saved_start): raise SystemExit('Saving the Part, so that RELOAD works at the end, changed it: check the unit.')
    before = counters()
    inventory_start = send('inventory').strip() if inventory else None
    start_part, (start_bank, start_pattern) = mem(PART, 1)[0], mem(0x800065bd, 2)
    live = mem(0x80000ec4, 16)  # what each track runs now: FX1 T1-8, then FX2
    names = [line[4:16].strip() for line in send('ui').splitlines()[:8]], [line[17:].strip() for line in send('ui').splitlines()[:8]]
    machines = None
    try:
        install(pkgs)
        listed = {1: chooser_names(1), 2: chooser_names(2)}
        for p in pkgs: p['name'] = p['machine']['label'] if p['machine'] else chooser_name(listed[2 if p['slots'] & 2 else 1], p['name'])
        if any(p['machine'] for p in pkgs): machines = Machines(pkgs)
        if selftest: result['selftest'] = selftest_reading(failures)
        for p in pkgs:
            if p['machine']: result['modules'].append(machine_alone(machines, p['machine'], failures))
            if not effect(p): continue
            slot = 2 if p['slots'] & 2 else 1
            entry = dict(name=p['name'], slot='FX%d' % slot)
            for track in (1, 5):
                try:
                    took = re.search(r'running (\d+) ms', send('pick:T%d:FX%d:%s' % (track, slot, p['name'].replace(' ', '_'))))
                    entry['T%d' % track] = dict(meters(1), admit_ms=int(took.group(1)))
                    log('  %s on T%d:' % (p['name'], track), entry['T%d' % track])
                except RuntimeError as e:
                    failures.append(str(e)); entry['T%d' % track] = 'refused'
                send('pick:T%d:FX%d:%s' % (track, slot, names[slot - 1][track - 1].replace(' ', '_')))
            result['modules'].append(entry)
        # All at once: one module a track, T1-T8, FX2 where it fits, while the pattern plays.
        placed = []
        for i, p in enumerate([p for p in pkgs if effect(p)] * 8):
            if len(placed) == 8: break
            slot = 2 if p['slots'] & 2 else 1
            try:
                send('pick:T%d:FX%d:%s' % (len(placed) + 1, slot, p['name'].replace(' ', '_'))); placed.append((len(placed) + 1, slot, p['name']))
            except RuntimeError:
                placed.append((len(placed) + 1, slot, None))  # refused by the ledger: expected once a core is full
        # Machines on T1-T8 round the set, beside those effects: refused once the CPU budget or a core is full.
        sources, ms = [], [p['machine'] for p in pkgs if p['machine']]
        for t in range(8 if ms else 0):
            try: machines.place(t, ms[t % len(ms)]); sources.append((t + 1, 'SRC', ms[t % len(ms)]['label']))
            except RuntimeError as e: log(' ', e); sources.append((t + 1, 'SRC', None))
        send('PLAY w1000')
        together = meters(max(2, args.seconds * 2 // 3))
        send('STOP w500')
        together['placed'] = [n for _, _, n in placed]
        if sources: together['machines'] = [n for _, _, n in sources]
        log('  all at once:', together)
        result['together'] = together
        for core, peak in (('core1', together['core1_peak']), ('core0', together['core0_peak'])):
            if peak > PEAK_LIMIT: failures.append('%s peaked at %d per mille with everything at once' % (core, peak))
        send('PLAY w1000')
        # Each placed module's knobs, main page (a machine's: SRC): from the minimum to the maximum in eight steps.
        for track, slot, name in [t for i, t in enumerate(placed + sources) if t[2] and t[2] not in [n for _, _, n in (placed + sources)[:i]]]:
            send('T%d w200 %s w300 ' % (track, slot if slot == 'SRC' else 'FX%d' % slot) + ' '.join('enc%s-127 enc%s-127 ' % (e, e) + ' '.join(['enc%s+16 w100' % e] * 8) for e in 'ABCDEF'))
            running(failures, 'sweeping %s on T%d' % (name, track))
        # The four Parts, three times round: each switch done (the part step waits) and its effects running.
        clock = frame_clock(result)
        result['parts'] = []
        for n in [2, 3, 4, 1] * 3:
            try:
                send('part%d' % n)
                ok = until(lambda: mem(0x80000ec4, 16) == part_fx(n - 1), 3)
                result['parts'].append(n if ok else -n)
                if not ok: failures.append('Part %d did not run its own effects within 3 s' % n)
            except RuntimeError as e: failures.append(str(e))
        if clock: running(failures, 'after the Part switches')
        # A queued pattern change into another bank (BANK, TRIG b, TRIG n) and back, playing: it lands at the pattern's end.
        other = 2 if start_bank == 0 else 1
        for bank, pattern in ((other - 1, 0), (start_bank, start_pattern)) if clock else ():
            send('BANK w150 TRIG%d w150 TRIG%d' % (bank + 1, pattern + 1))
            if not until(lambda: mem(0x800065bd, 2) == bytes([bank, pattern]), 20):
                failures.append('the queued change to bank %d pattern %d did not land within 20 s' % (bank + 1, pattern + 1)); break
            running(failures, 'after the change to bank %d' % (bank + 1))
        # A track takes the new bank's effects at its next trig; one without trigs keeps the old: a Part switch there and
        # back puts the start Part's effects on every track.
        send('part%d part%d' % ((start_part + 1) % 4 + 1, start_part + 1))
        if args.soak:
            result['soak'] = []
            for _ in range(args.soak // 10):
                m = meters(5); result['soak'].append(m); log('  soak:', m)
                peak = max(m['core0_peak'], m['core1_peak'])
                if peak > PEAK_LIMIT: failures.append('a core peaked at %d per mille in the soak' % peak); break
                if clock and not running(failures, 'soak'): break
        send('STOP w500')
    finally:
        send('STOP w300')
        if mem(PART, 1)[0] != start_part: send('part%d' % (start_part + 1))
        if not restore_part(start_part, saved_start, machines):  # the Part as saved, every pick and knob of this run undone
            failures.append('Part %d is not back as saved after the reload (working or saved copy changed)' % (start_part + 1))
        if mem(0x800065bd, 2) != bytes([start_bank, start_pattern]):
            send('BANK w150 TRIG%d w150 TRIG%d w500' % (start_bank + 1, start_pattern + 1))
            if mem(0x800065bd, 2) != bytes([start_bank, start_pattern]): failures.append('not back on the bank and pattern it started on')
        uninstall(pkgs, failures)
        changed = [i for i, v in enumerate(mem(0x80000ec4, 16)) if v != live[i]]
        if changed: failures.append('tracks not back as before (FX index %s); restore them' % changed)
    if inventory:
        result['inventory'] = 'unchanged' if send('inventory').strip() == inventory_start else 'changed'
        if result['inventory'] == 'changed': failures.append('the inventory at the end differs from the one before the run')
    time.sleep(1)  # the DSP watchdog records a stall after half a second of still frames (dsp.c STALL_TICKS)
    after = counters()
    for key in ('rejected', 'errors'):
        if after[key] != before[key]: failures.append('the loader counted %d more %s' % (after[key] - before[key], key))
    if after['rollbacks'] != before['rollbacks']: failures.append('the loader rolled back %d transaction(s)' % (after['rollbacks'] - before['rollbacks']))
    if args.crash:  # last, on the restored unit: crash.c records an illegal instruction and restarts it (RAM counters reset)
        send('crashtest')
        if not until(_alive, 15):  # a restart can leave the bridge on a dead handle: restart the session (its loop starts it)
            subprocess.run(['pkill', '-f', 'usb_bridge']); subprocess.run(['pkill', '-fx', 'node scripts/device.mjs serve'])
            if not until(_alive, 30): failures.append('the unit did not come back within 45 s of the crash test')
        after.update(counters())
    if after['crashes'] != before['crashes'] + args.crash: failures.append('%d crash(es) recorded, %d expected' % (after['crashes'] - before['crashes'], args.crash))
    if after['stalls'] != before['stalls']: failures.append('a DSP stall was recorded (the session\'s stall step shows it)')
    result['failures'] = failures
    return result


def finish(result, args, **entry):
    """Print the result, write the TESTING.md entry when asked, and exit 1 on a failure."""
    print(json.dumps(result, indent=1))
    if args.testing_entry:
        with open(args.testing_entry, 'w') as f: f.write(testing_entry(result, datetime.date.today().isoformat(), **entry))
        log('TESTING.md entry written to ' + args.testing_entry)
    sys.exit(1 if result['failures'] else 0)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--seconds', type=int, default=30)
    ap.add_argument('--soak', type=int, default=0, help='seconds of soak with everything placed, playing')
    ap.add_argument('--crash', action='store_true', help='end with a deliberate crash and check the restart')
    ap.add_argument('--keeps-ok', action='store_true', help='each install and removal Keeps: noted the flashed set, and a RAM-booted base may replace it')
    ap.add_argument('--testing-entry', metavar='FILE', help='also write what the run saw as a TESTING.md entry to FILE')
    ap.add_argument('packages', nargs='+')
    args = ap.parse_args()
    if not args.keeps_ok:
        raise SystemExit('Each install and removal in this run is a Keep, which rewrites the card\'s kept set; on a RAM-booted base the flashed base '
                         'then starts with no modules after a power cycle. Note the flashed set first (the session\'s inventory step, '
                         'docs/OCTATRACK_DRIVING.md), then run again with --keeps-ok. For a run that keeps nothing: npm run device:test.')
    # The whole run is one turn on the unit: it waits here while another session has it (scripts/unit-queue.mjs).
    import importlib.util
    turn = importlib.util.spec_from_file_location('unit_turn', os.path.join(os.path.dirname(os.path.realpath(__file__)), 'unit_turn.py'))
    unit_turn = importlib.util.module_from_spec(turn)
    turn.loader.exec_module(unit_turn)
    unit_turn.take_turn(__file__, 'device:qualify ' + ' '.join(os.path.basename(p) for p in args.packages),
                        expect='%ds' % (600 + 120 * len(args.packages) + 2 * args.soak + 4 * args.seconds))
    pkgs = [package(p) for p in args.packages]

    def install(pkgs):
        for p in pkgs: send('try ' + p['path'])  # the session's try accepts at once: a Keep

    def uninstall(pkgs, failures):
        for p in pkgs:
            try: send('remove ' + p['path'])
            except RuntimeError as e: failures.append(str(e))

    finish(run(args, pkgs, install, uninstall), args)


if __name__ == '__main__':
    main()
