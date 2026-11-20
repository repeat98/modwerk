#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""USB MIDI to the Octatrack for scripts/octatrack-soak.mjs: a line service on 127.0.0.1.

  python -B octatrack-midi-bridge.py [PORT] [--name Octatrack] [--list]

Run it on the computer the unit is plugged into: on Windows with the device venv's Python (docs/OCTATRACK_DRIVING.md,
"On Windows, from WSL"), where WSL reaches it on 127.0.0.1 through mirrored networking as it reaches the USB bridge.
Each line holds MIDI messages as hex words ('c003', 'fa', 'b0307f'); they go out back to back, and the line is
answered 'ok N' (messages sent) or 'error: ...'. Windows sends through winmm (ctypes, nothing to install); other
systems through mido, if it is installed. Short messages only, no SysEx. --list prints the MIDI outputs and exits.

'ping' is answered 'ok 0 NAME' once the output it opened still reaches the unit, reopening it first when it does not:
after a power cycle a bridge's old handle refused every message (20 November 2026). npm run test:procedure asks it
before a soak, and starts a bridge of its own when the answer is not 'ok'. A send that fails reopens the output once too."""
import argparse, socket, socketserver, sys


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
    def __init__(self, name):
        import ctypes
        from ctypes import wintypes
        self.w = w = ctypes.WinDLL('winmm')

        class Caps(ctypes.Structure):
            _fields_ = [('mid', wintypes.WORD), ('pid', wintypes.WORD), ('ver', wintypes.DWORD), ('name', wintypes.WCHAR * 32),
                        ('tech', wintypes.WORD), ('voices', wintypes.WORD), ('notes', wintypes.WORD), ('mask', wintypes.WORD), ('support', wintypes.DWORD)]
        self.names = []
        for i in range(w.midiOutGetNumDevs()):
            c = Caps()
            w.midiOutGetDevCapsW(i, ctypes.byref(c), ctypes.sizeof(c))
            self.names.append(c.name)
        self.ctypes, self.wintypes, self.Caps, self.name, self.handle = ctypes, wintypes, Caps, name, None
        if name is None:
            return
        self.open()

    def open(self):
        ctypes, w = self.ctypes, self.w
        self.names = []
        for i in range(w.midiOutGetNumDevs()):
            c = self.Caps()
            w.midiOutGetDevCapsW(i, ctypes.byref(c), ctypes.sizeof(c))
            self.names.append(c.name)
        found = [i for i, n in enumerate(self.names) if self.name.lower() in n.lower()]
        if not found:
            raise SystemExit('No MIDI output named like %r: %s' % (self.name, ', '.join(self.names) or 'none'))
        handle = self.wintypes.HANDLE()
        if w.midiOutOpen(ctypes.byref(handle), found[0], None, None, 0):
            raise SystemExit('Could not open %s (another program may hold it).' % self.names[found[0]])
        self.handle, self.opened = handle, self.names[found[0]]

    def alive(self):
        device = self.wintypes.UINT()
        return self.handle is not None and self.w.midiOutGetID(self.handle, self.ctypes.byref(device)) == 0

    def reopen(self):
        if self.handle is not None:
            self.w.midiOutClose(self.handle)  # a stale handle: its close may fail too, which changes nothing
            self.handle = None
        self.open()

    def send(self, data):
        word = data[0] | (data[1] << 8 if len(data) > 1 else 0) | (data[2] << 16 if len(data) > 2 else 0)
        if self.w.midiOutShortMsg(self.handle, word):
            raise OSError('midiOutShortMsg refused %s' % data.hex())


class Mido:
    def __init__(self, name):
        import mido
        self.names = mido.get_output_names()
        self.port = None
        if name is None:
            return
        found = [n for n in self.names if name.lower() in n.lower()]
        if not found:
            raise SystemExit('No MIDI output named like %r: %s' % (name, ', '.join(self.names) or 'none'))
        self.port, self.opened = mido.open_output(found[0]), found[0]
        self.mido = mido

    def alive(self):
        return self.port is not None and self.opened in self.mido.get_output_names()

    def reopen(self):
        if self.port is not None:
            self.port.close()
        found = [n for n in self.mido.get_output_names() if self.opened.lower() in n.lower()]
        if not found:
            raise SystemExit('No MIDI output named like %r any more' % self.opened)
        self.port, self.opened = self.mido.open_output(found[0]), found[0]

    def send(self, data):
        self.port.send(self.mido.Message.from_bytes(list(data)))


def output(name):
    if sys.platform == 'win32':
        return Winmm(name)
    try:
        return Mido(name)
    except ImportError:
        raise SystemExit('Outside Windows this bridge needs mido (pip install mido python-rtmidi).')


def answer(out, line):
    """One line's reply: 'ping' checks (and if need be reopens) the output; MIDI words go out, with one reopen when a send
    fails, as a stale handle after a power cycle does."""
    try:
        if line.strip() == 'ping':
            if not out.alive():
                out.reopen()
            return 'ok 0 %s\n' % out.opened
        messages = parse(line)
        for m in messages:
            try:
                out.send(m)
            except OSError:
                out.reopen()
                out.send(m)
        return 'ok %d\n' % len(messages)
    except (ValueError, OSError, SystemExit) as e:
        return 'error: %s\n' % e


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('port', nargs='?', type=int, default=50124)
    ap.add_argument('--name', default='Octatrack')
    ap.add_argument('--list', action='store_true')
    a = ap.parse_args()
    if a.list:
        print('\n'.join(output(None).names))
        return
    out = output(a.name)

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
