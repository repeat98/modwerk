#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""What would fail the test procedure's unit steps minutes in, found in seconds before anything is installed.

  python3 -B scripts/octatrack-preflight.py [--pick-pattern 1-16] [--midi HOST:PORT]

Read-only requests to the session (`npm run device -- serve`, MODWERK_DEV_SOCKET), and with --midi one tune request (F6,
a message the Octatrack has nothing to do with) through scripts/octatrack-midi-bridge.py. It checks that:
- the base answers development requests (a flashed release base does not, and every unit step needs them);
- the transport is stopped, and the current Part's working copy equals its saved copy (device:test refuses otherwise);
- with --pick-pattern, the unit is on that pattern or on one with room: device:test picks the module on the pattern the
  unit is on, and on a pattern with trigs on all eight tracks admission refused it (CPU FULL, 25 November 2026);
- with --midi, the MIDI bridge the soak sends through answers and can send.
Prints one line a problem with its fix (`preflight: ...`) and exits 1, or `preflight: ready` and exits 0.
npm run test:procedure runs it before step 1 and again when its unit turn starts (docs/TEST_PROCEDURE.md)."""
import argparse, importlib.util, pathlib, socket, sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
_spec = importlib.util.spec_from_file_location('octatrack_qualify', ROOT / 'scripts/octatrack-qualify.py')
qualify = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(qualify)

CURRENT = 0x800065bd  # the bank and pattern the unit is on, 0-based (octatrack-qualify.py, the soak's health)
PATTERN, TRACK = 0x8ed8, 0x91a  # a pattern of the current bank and a track's 8-byte trig mask in it (octatrack-price.mjs)
ROOM = 6  # the medium pattern a release must be admitted on has trigs on six tracks (docs/TEST_PROCEDURE.md, step 9)
TUNE_REQUEST = 'f6'


def pattern_name(bank, pattern): return 'ABCDEFGHIJKLMNOP'[bank] + '%02d' % (pattern + 1)


def busy_tracks(masks):
    """Eight trig masks -> the tracks (1-8) with at least one trig."""
    return [track + 1 for track, mask in enumerate(masks) if any(mask)]


def pattern_problem(bank, pattern, tracks, pick):
    """Why a module's pick on the current pattern would be refused, or None: it is the pick pattern, or has room."""
    if pattern + 1 == pick or len(tracks) <= ROOM: return None
    return ('pattern %s has trigs on %d tracks, and device:test picks the module on the pattern the unit is on: admission refused '
            'such picks (CPU FULL). Select the empty pattern first, `npm run device -- do PATTERN+TRIG%d`, or one with trigs on '
            'at most %d tracks' % (pattern_name(bank, pattern), len(tracks), pick, ROOM))


def unit_problems(pick=None):
    """The session's state, Part and pattern -> problems. Only reads (state, mem)."""
    try:
        state = qualify.send('state')
    except OSError as e:
        return ['no session answers on %s (%s): start `npm run device -- serve --share /tmp/modwerk-share.sock` in its loop '
                '(docs/OCTATRACK_DRIVING.md)' % (qualify.SOCKET, e)]
    except RuntimeError as e:
        if 'development requests' not in str(e): return ['the session answered %s' % e]
        return ['the unit runs a base that does not answer development requests (a flashed release base): RAM-boot a development '
                'twin (`npm run device -- boot DIR`, a build_core.py --dev build), then run again']
    problems = []
    if 'stopped' not in state: problems.append('the transport plays: stop it (`npm run device -- do STOP`)')
    bank, pattern = qualify.mem(CURRENT, 2)
    if not qualify.part_saved_equal():
        problems.append('Part %d of bank %s differs from its saved copy, and device:test refuses such a Part: go to a bank and Part '
                        'whose working copy equals its saved one (docs/OCTATRACK_DRIVING.md, The rules), or `npm run device -- do '
                        'reload` if its changes may go' % (qualify.mem(qualify.PART, 1)[0] + 1, 'ABCDEFGHIJKLMNOP'[bank]))
    if pick:
        base = qualify.u32(qualify.BANK)
        masks = [qualify.mem(base + pattern * PATTERN + track * TRACK, 8) for track in range(8)]
        problem = pattern_problem(bank, pattern, busy_tracks(masks), pick)
        if problem: problems.append(problem)
    return problems


def midi_problem(address, connect=socket.create_connection, seconds=10):
    """One harmless message through the MIDI bridge -> None, or why the soak would fail at its first operation."""
    host, _, port = address.rpartition(':')
    start = 'start scripts/octatrack-midi-bridge.py %s on the computer the unit is plugged into (on Windows with the device venv\'s Python)' % port
    try:
        link = connect((host or '127.0.0.1', int(port)), 3)
    except OSError as e:
        return 'no MIDI bridge on %s (%s): %s' % (address, e, start)
    try:
        link.settimeout(seconds)  # a bridge reopening the unit's port after a RAM boot answers within 5 s
        link.sendall((TUNE_REQUEST + '\n').encode())
        reply = link.makefile().readline().strip()
    except OSError as e:
        reply = 'no answer (%s): another run may hold it' % e
    finally:
        link.close()
    if reply.startswith('ok'): return None
    return ('the MIDI bridge on %s cannot send: %s. Stop it and %s; a copy from before 25 November 2026 holds a dead port '
            'after a RAM boot, so take this checkout\'s' % (address, reply or 'no answer', start))


def main():
    ap = argparse.ArgumentParser(description='The unit steps\' preflight (docs/TEST_PROCEDURE.md).')
    ap.add_argument('--pick-pattern', type=int, choices=range(1, 17), metavar='1-16', help='the empty pattern of the bank (device:price --pick-pattern)')
    ap.add_argument('--midi', metavar='HOST:PORT', help='the MIDI bridge the soak sends through (octatrack-soak.mjs --midi)')
    args = ap.parse_args()
    problems = unit_problems(args.pick_pattern)
    if args.midi: problems += [p for p in [midi_problem(args.midi)] if p]
    for problem in problems: print('preflight: ' + problem, flush=True)
    if not problems: print('preflight: ready', flush=True)
    sys.exit(1 if problems else 0)


if __name__ == '__main__':
    main()
