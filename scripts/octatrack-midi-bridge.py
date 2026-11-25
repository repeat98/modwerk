#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""USB MIDI to the Octatrack for scripts/octatrack-soak.mjs: a line service on 127.0.0.1.

  python -B octatrack-midi-bridge.py [PORT] [--name Octatrack] [--list]

Run it on the computer the unit is plugged into: on Windows with the device venv's Python (docs/OCTATRACK_DRIVING.md,
"On Windows, from WSL"), where WSL reaches it on 127.0.0.1 through mirrored networking as it reaches the USB bridge.
Each line holds MIDI messages as hex words ('c003', 'fa', 'b0307f'); they go out back to back, and the line is
answered 'ok N' (messages sent) or 'error: ...'. Windows sends through winmm (ctypes, nothing to install); other
systems through mido, if it is installed. Short messages only, no SysEx. --list prints the MIDI outputs and exits.
A RAM boot or a crash restarts the unit and its USB MIDI enumerates again, which leaves the open port dead: a send that
fails closes it, opens the output of that name again (waiting up to 5 s for it to come back) and sends once more."""
import argparse, socket, socketserver, sys, time


def parse(line):
    """'c003 fa' -> [b'\\xc0\\x03', b'\\xfa']: one to three bytes a word, a status byte first. Raises ValueError."""
    out = []
    for word in line.split():
        data = bytes.fromhex(word)
        if not 1 <= len(data) <= 3 or data[0] < 0x80 or any(b > 0x7f for b in data[1:]) or data[0] == 0xf0:
            raise ValueError('not a short MIDI message: ' + word)
        out.append(data)
    return out


class Winmm:
    """Windows' MIDI outputs through winmm."""

    def __init__(self):
        import ctypes
        from ctypes import wintypes
        self.ctypes, self.wintypes, self.w = ctypes, wintypes, ctypes.WinDLL('winmm')

        class Caps(ctypes.Structure):
            _fields_ = [('mid', wintypes.WORD), ('pid', wintypes.WORD), ('ver', wintypes.DWORD), ('name', wintypes.WCHAR * 32),
                        ('tech', wintypes.WORD), ('voices', wintypes.WORD), ('notes', wintypes.WORD), ('mask', wintypes.WORD), ('support', wintypes.DWORD)]
        self.Caps = Caps

    def names(self):  # read again each time: the device numbers change when the unit enumerates again
        names = []
        for i in range(self.w.midiOutGetNumDevs()):
            c = self.Caps()
            self.w.midiOutGetDevCapsW(i, self.ctypes.byref(c), self.ctypes.sizeof(c))
            names.append(c.name)
        return names

    def open(self, name):
        w, handle = self.w, self.wintypes.HANDLE()
        if w.midiOutOpen(self.ctypes.byref(handle), self.names().index(name), None, None, 0):
            raise OSError('Could not open %s (another program may hold it).' % name)

        class Port:
            def send(self, data):
                word = data[0] | (data[1] << 8 if len(data) > 1 else 0) | (data[2] << 16 if len(data) > 2 else 0)
                if w.midiOutShortMsg(handle, word):
                    raise OSError('midiOutShortMsg refused %s' % data.hex())

            def close(self): w.midiOutClose(handle)
        return Port()


class Mido:
    """The MIDI outputs elsewhere, through mido."""

    def __init__(self):
        import mido
        self.mido = mido

    def names(self): return self.mido.get_output_names()

    def open(self, name):
        mido, port = self.mido, self.mido.open_output(name)

        class Port:
            def send(self, data):
                try: port.send(mido.Message.from_bytes(list(data)))
                except Exception as e: raise OSError('%s refused %s: %s' % (name, data.hex(), e))

            def close(self): port.close()
        return Port()


class Output:
    """The first output named like `name`, through `system` (Winmm or Mido), opened again once when a send fails."""

    def __init__(self, system, name, wait=time.sleep, log=print):
        self.system, self.name, self.wait, self.log, self.reopened = system, name, wait, log, 0
        self.port = self._open()

    def _open(self):
        names = self.system.names()
        found = [n for n in names if self.name.lower() in n.lower()]
        if not found: raise LookupError('No MIDI output named like %r: %s' % (self.name, ', '.join(names) or 'none'))
        port = self.system.open(found[0])
        self.opened = found[0]
        return port

    def close(self):
        port, self.port = self.port, None
        try:
            if port: port.close()
        except OSError: pass  # a dead handle may refuse its close too

    def send(self, data):
        try:
            if self.port is None: raise OSError('the port is closed')
            return self.port.send(data)
        except OSError as e:
            failed = e
        self.close()
        for attempt in range(10):  # the unit may still be enumerating: every half second, 5 s at most
            try:
                self.port = self._open()
                break
            except (LookupError, OSError) as e:
                missing = e
                self.wait(0.5)
        else:
            raise OSError('%s; opening %r again failed: %s' % (failed, self.name, missing))
        self.reopened += 1
        self.log('reopened %s after: %s' % (self.opened, failed), flush=True)
        self.port.send(data)  # once: a second failure is the answer


def answer(out, line):
    """One request line -> its reply line."""
    try:
        messages = parse(line)
        for m in messages:
            out.send(m)
        return 'ok %d\n' % len(messages)
    except (ValueError, OSError) as e:
        return 'error: %s\n' % e


def system():
    if sys.platform == 'win32':
        return Winmm()
    try:
        return Mido()
    except ImportError:
        raise SystemExit('Outside Windows this bridge needs mido (pip install mido python-rtmidi).')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('port', nargs='?', type=int, default=50124)
    ap.add_argument('--name', default='Octatrack')
    ap.add_argument('--list', action='store_true')
    a = ap.parse_args()
    if a.list:
        print('\n'.join(system().names()))
        return
    try:
        out = Output(system(), a.name)
    except (LookupError, OSError) as e:
        raise SystemExit(str(e))

    class Handler(socketserver.StreamRequestHandler):
        def handle(self):
            self.connection.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)  # a reply per line, no batching
            for raw in self.rfile:
                self.wfile.write(answer(out, raw.decode('ascii', 'replace')).encode())
                self.wfile.flush()

    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(('127.0.0.1', a.port), Handler) as server:
        print('MIDI to %s on 127.0.0.1:%d' % (out.opened, a.port), flush=True)
        server.serve_forever()


if __name__ == '__main__':
    main()
