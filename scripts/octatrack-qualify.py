#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Qualification run for a module set on a development base, over `npm run device -- serve`.

  npm run device:qualify -- --keeps-ok [--seconds 30] [--soak SECONDS] [--crash] [--testing-entry FILE] PKG.mwrm ...

Run it on a bank and Part whose working copy equals its saved one (docs/OCTATRACK_DRIVING.md), transport stopped.
Installs the set, puts each DSP module alone on T1 (core 1) and T5 (core 0) and reads the load meters, then all
of them at once while the pattern plays. With everything placed, playing: each placed module's knobs swept, the
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
import argparse, datetime, hashlib, json, os, re, socket, subprocess, sys, time

SOCKET = os.environ.get('MODWERK_DEV_SOCKET', '/tmp/modwerk-dev.sock')
PEAK_LIMIT = 900  # per mille of a frame
# A package's ABI 6 header: name at 50 (15 bytes), slots at 39 (1 FX1, 2 FX2, 3 both); no DSP code below ABI 5.
def package(path):
    data = open(path, 'rb').read()
    abi = int.from_bytes(data[4:6], 'big')
    if data[:4] != b'MWRM' or abi < 6: raise SystemExit(path + ': not an ABI 6 runtime module')
    return dict(path=path, name=data[50:65].split(b'\0')[0].decode('latin1'), slots=data[39], dsp=int.from_bytes(data[32:36], 'big') > 0,
                sha256=hashlib.sha256(data).hexdigest())


NOT_COVERED = ('listening to the sound', 'the power cycle and what survives it', 'MIDI, scenes and recording',
               'modules beside other installed modules')


def testing_entry(result, day):
    """The run as a TESTING.md entry: only what it measured, and what it leaves to the developer."""
    lines = ['### Qualification run, %s' % day, '',
             'Command: `npm run device:qualify -- %s`' % ' '.join(result['args']), '']
    lines += ['- Package `%s`, %s, SHA-256 `%s`' % (p['file'], p['name'], p['sha256']) for p in result['packages']]
    for m in result['modules']:
        alone = ', '.join('%s %s' % (track, 'refused' if r == 'refused' else 'peak %d per mille of a frame, admitted in %d ms' % (
            r['core1_peak'] if track == 'T1' else r['core0_peak'], r['admit_ms'])) for track, r in m.items() if track in ('T1', 'T5'))
        lines.append('- %s on %s alone: %s' % (m['name'], m['slot'], alone))
    if result.get('together'):
        g = result['together']
        lines.append('- All at once, playing (%s): CPU %d, T1-4 peak %d, T5-8 peak %d per mille' % (', '.join(n or 'refused' for n in g['placed']), g['cpu'], g['core1_peak'], g['core0_peak']))
    if result.get('parts'): lines.append('- Part switches: %d of %d ran their own effects within 3 s' % (sum(n > 0 for n in result['parts']), len(result['parts'])))
    if result.get('soak'): lines.append('- Soak: %d s, highest core peak %d per mille' % (10 * len(result['soak']), max(max(m['core0_peak'], m['core1_peak']) for m in result['soak'])))
    lines.append('- Crash test: %s' % ('run, the unit came back' if result.get('crash') and not any('crash' in f for f in result['failures']) else 'run' if result.get('crash') else 'not run'))
    lines.append('- Result: ' + ('passed' if not result['failures'] else 'failed: ' + '; '.join(result['failures'])))
    lines += ['', 'Not covered by this run: ' + ', '.join(NOT_COVERED) + '.', '']
    return '\n'.join(lines)


def log(*a): print(*a, file=sys.stderr, flush=True)


def send(sequence):
    log('>', sequence)
    s = socket.socket(socket.AF_UNIX)
    s.settimeout(40)  # the session answers within 20 s; never wait for ever
    s.connect(SOCKET)
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


def restore_part(part, saved):
    """The Part as `saved` again, in both copies. RELOAD first; a Part that was never saved refuses it (SAVE PART FIRST!,
    nothing changes), so then each slot whose effect differs gets the saved one picked back by name, which brings its
    default knobs back: enough for a Part that holds defaults (a cleared one). True when both copies equal `saved`."""
    send('reload')
    if part_copy(part) != saved:
        send('NO w200')  # the SAVE PART FIRST! message
        work = part_copy(part)
        for i in range(16):
            if work[i] != saved[i]: send('pick:T%d:FX%d:%s' % (i % 8 + 1, i // 8 + 1, fx_name(i // 8 + 1, saved[i])))
    return part_copy(part) == saved and part_copy(part, saved=True) == saved


def running(failures, what):  # frames advance: the DSPs are alive
    a = frames(); send('w300'); b = frames()
    if a == b: failures.append('frames stopped (%s)' % what)
    return a != b


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
                         'docs/OCTATRACK_DRIVING.md), then run again with --keeps-ok.')
    pkgs = [package(p) for p in args.packages]
    failures, result = [], dict(base=None, modules=[], together=None, crash=args.crash, args=sys.argv[1:],
                                packages=[dict(file=os.path.basename(p['path']), name=p['name'], sha256=p['sha256']) for p in pkgs])
    if 'stopped' not in send('state'): raise SystemExit('Stop the transport first.')
    if not part_saved_equal(): raise SystemExit('The current Part differs from its saved copy: run on one that does not.')
    saved_start = part_copy(mem(PART, 1)[0], saved=True)  # what the reload at the end must bring back, in both copies
    before = counters()
    start_part, (start_bank, start_pattern) = mem(PART, 1)[0], mem(0x800065bd, 2)
    live = mem(0x80000ec4, 16)  # what each track runs now: FX1 T1-8, then FX2
    names = [line[4:16].strip() for line in send('ui').splitlines()[:8]], [line[17:].strip() for line in send('ui').splitlines()[:8]]
    try:
        for p in pkgs: send('try ' + p['path'])
        listed = {1: chooser_names(1), 2: chooser_names(2)}
        for p in pkgs: p['name'] = chooser_name(listed[2 if p['slots'] & 2 else 1], p['name'])
        for p in pkgs:
            if not p['dsp']: continue
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
        for i, p in enumerate([p for p in pkgs if p['dsp']] * 8):
            if len(placed) == 8: break
            slot = 2 if p['slots'] & 2 else 1
            try:
                send('pick:T%d:FX%d:%s' % (len(placed) + 1, slot, p['name'].replace(' ', '_'))); placed.append((len(placed) + 1, slot, p['name']))
            except RuntimeError:
                placed.append((len(placed) + 1, slot, None))  # refused by the ledger: expected once a core is full
        send('PLAY w1000')
        together = meters(max(2, args.seconds * 2 // 3))
        send('STOP w500')
        together['placed'] = [n for _, _, n in placed]
        log('  all at once:', together)
        result['together'] = together
        for core, peak in (('core1', together['core1_peak']), ('core0', together['core0_peak'])):
            if peak > PEAK_LIMIT: failures.append('%s peaked at %d per mille with everything at once' % (core, peak))
        send('PLAY w1000')
        # Each placed module's knobs, main page: from the minimum to the maximum in eight steps.
        for track, slot, name in [t for i, t in enumerate(placed) if t[2] and t[2] not in [n for _, _, n in placed[:i]]]:
            send('T%d w200 FX%d w300 ' % (track, slot) + ' '.join('enc%s-127 enc%s-127 ' % (e, e) + ' '.join(['enc%s+16 w100' % e] * 8) for e in 'ABCDEF'))
            running(failures, 'sweeping %s on T%d' % (name, track))
        # The four Parts, three times round: each switch done (the part step waits) and its effects running.
        result['parts'] = []
        for n in [2, 3, 4, 1] * 3:
            try:
                send('part%d' % n)
                ok = until(lambda: mem(0x80000ec4, 16) == part_fx(n - 1), 3)
                result['parts'].append(n if ok else -n)
                if not ok: failures.append('Part %d did not run its own effects within 3 s' % n)
            except RuntimeError as e: failures.append(str(e))
        running(failures, 'after the Part switches')
        # A queued pattern change into another bank (BANK, TRIG b, TRIG n) and back, playing: it lands at the pattern's end.
        other = 2 if start_bank == 0 else 1
        for bank, pattern in ((other - 1, 0), (start_bank, start_pattern)):
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
                if not running(failures, 'soak'): break
        send('STOP w500')
    finally:
        send('STOP w300')
        if mem(PART, 1)[0] != start_part: send('part%d' % (start_part + 1))
        if not restore_part(start_part, saved_start):  # the Part as saved, every pick and knob of this run undone
            failures.append('Part %d is not back as saved after the reload (working or saved copy changed)' % (start_part + 1))
        if mem(0x800065bd, 2) != bytes([start_bank, start_pattern]):
            send('BANK w150 TRIG%d w150 TRIG%d w500' % (start_bank + 1, start_pattern + 1))
            if mem(0x800065bd, 2) != bytes([start_bank, start_pattern]): failures.append('not back on the bank and pattern it started on')
        for p in pkgs:
            try: send('remove ' + p['path'])
            except RuntimeError as e: failures.append(str(e))
        changed = [i for i, v in enumerate(mem(0x80000ec4, 16)) if v != live[i]]
        if changed: failures.append('tracks not back as before (FX index %s); restore them' % changed)
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
    print(json.dumps(result, indent=1))
    if args.testing_entry:
        with open(args.testing_entry, 'w') as f: f.write(testing_entry(result, datetime.date.today().isoformat()))
        log('TESTING.md entry written to ' + args.testing_entry)
    sys.exit(1 if failures else 0)


if __name__ == '__main__':
    main()
