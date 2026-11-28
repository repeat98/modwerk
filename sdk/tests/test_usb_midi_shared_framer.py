# SPDX-License-Identifier: GPL-3.0-or-later
"""The base's USB MIDI receiver beside DIN, and its rest during USB DISK MODE, run in Unicorn.

The receiver is the real built text (base_usb_functions.receiver_source). Stock's enqueue and framer are a Python
model of what they do with their state words (no stock bytes): one FIFO and one framer shared by USB and DIN, with
one running status, one pending flag and a half-received message at the buffer's write index.
"""
import importlib.util
from pathlib import Path
import shutil
import struct
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.append(str(ROOT / 'sdk/machines/octatrack/module-adapters'))
import base_usb_functions as functions

ENQUEUE, FRAMER = 0x40092bbc, 0x40092bf4
RING, HEAD, TAIL, COUNT = 0x46104c84, 0x46100b80, 0x46100b78, 0x46100b7c
RS, PEND, SXLEN, WIDX, MSGS = 0x46100b70, 0x46100b74, 0x46100b6c, 0x46100b5c, 0x46100b84
ENDPTPRIME, ENDPTFLUSH, ENDPTSTAT, EP2_RX_TD = 0xfc0b01b0, 0xfc0b01b4, 0xfc0b01b8, 0x4ec953e4
SYMS = ('usbmidi_up', 'usbmidi_tx_busy', 'usbmidi_setcfg_shim', 'usbmidi_isr_shim')
TOOLS = shutil.which('m68k-elf-as') and importlib.util.find_spec('unicorn')


def build(text):
    with tempfile.TemporaryDirectory() as temp:
        root = Path(temp)
        (root / 'rx.s').write_text(text)
        subprocess.run(['m68k-elf-as', '-mcpu=54455', '-o', str(root / 'rx.o'), str(root / 'rx.s')], check=True)
        subprocess.run(['m68k-elf-ld', '-Ttext=0x10000', '-e', '0x10000',
                        *[f'--defsym={name}=0x3000{2 * i}' for i, name in enumerate(SYMS)],
                        '-o', str(root / 'rx.elf'), str(root / 'rx.o')], check=True)
        subprocess.run(['m68k-elf-objcopy', '-O', 'binary', '-j', '.text', str(root / 'rx.elf'), str(root / 'rx.bin')], check=True)
        symbols = {line.split()[2]: int(line.split()[0], 16) for line in subprocess.check_output(
            ['m68k-elf-nm', str(root / 'rx.elf')], text=True).splitlines() if len(line.split()) == 3}
        return (root / 'rx.bin').read_bytes(), symbols


class Unit:
    """Unicorn with the receiver loaded and stock's FIFO and framer modelled."""

    def __init__(self, text):
        from unicorn import Uc, UC_ARCH_M68K, UC_MODE_BIG_ENDIAN, UC_HOOK_CODE, UC_HOOK_MEM_READ
        from unicorn import m68k_const as m
        self.m = m
        code, self.sym = build(text)
        uc = self.uc = Uc(UC_ARCH_M68K, UC_MODE_BIG_ENDIAN)
        uc.ctl_set_cpu_model(m.UC_CPU_M68K_CFV4E)
        uc.mem_map(0x10000, 0x10000)
        for page, size in ((0x30000, 0x1000), (0x40092000, 0x1000), (0x46100000, 0x5000), (0x46c83000, 0x1000), (0x46c8c000, 0x1000),
                           (0x4ec94000, 0x2000), (0x4ecc9000, 0x1000), (0xfc070000, 0x1000), (0xfc0b0000, 0x1000),
                           (0x4001d000, 0x1000), (0x7f000, 0x1000)):
            uc.mem_map(page, size)
        uc.mem_write(0x10000, code)
        uc.mem_write(ENQUEUE, b'\x4e\x75')
        uc.mem_write(0x4001d184, b'\x4e\x75')  # the firmware's 64-byte EP2 OUT prime: return
        uc.mem_write(FRAMER, b'\x4e\x73')
        self.w(0x46c8ce14, 0x4ec94900)  # the EP2 OUT dQH pointer the receiver's prime writes through
        self.messages, self.framer_masks = [], []
        uc.hook_add(UC_HOOK_CODE, lambda u, *_: self.enqueue(u.mem_read(u.reg_read(m.UC_M68K_REG_A7) + 7, 1)[0]),
                    begin=ENQUEUE, end=ENQUEUE)
        uc.hook_add(UC_HOOK_CODE, lambda u, *_: self.framer_entry(), begin=FRAMER, end=FRAMER)
        # The controller answers a flush at once, as an idle one does.
        uc.hook_add(UC_HOOK_MEM_READ, lambda u, _a, address, *_: u.mem_write(address, bytes(4)),
                    begin=ENDPTFLUSH, end=ENDPTSTAT + 3)
        self.din_seen = []

    def r(self, at):
        return struct.unpack('>I', self.uc.mem_read(at, 4))[0]

    def w(self, at, value):
        self.uc.mem_write(at, struct.pack('>I', value & 0xffffffff))

    def b(self, at, value=None):
        if value is None:
            return self.uc.mem_read(at, 1)[0]
        self.uc.mem_write(at, bytes((value,)))

    def enqueue(self, byte):  # midi_rx_enqueue's effect: ring[head], head wraps at 32, count++
        head = self.r(HEAD)
        self.b(RING + head, byte)
        self.w(HEAD, 0 if head + 1 > 31 else head + 1)
        self.w(COUNT, self.r(COUNT) + 1)

    def framer_entry(self):  # one framer interrupt, then its rte: the frame's SR and return address
        m = self.m
        sp = self.uc.reg_read(m.UC_M68K_REG_A7)
        frame, back = self.r(sp), self.r(sp + 4)
        self.framer_masks.append(self.uc.reg_read(m.UC_M68K_REG_SR) & 0x700)
        self.frame_one()
        self.uc.reg_write(m.UC_M68K_REG_A7, sp + 8)
        self.uc.reg_write(m.UC_M68K_REG_SR, frame & 0xffff)
        self.uc.reg_write(m.UC_M68K_REG_PC, back)

    def frame_one(self):  # the stock framer's effect on its state for one byte, as its code reads
        tail = self.r(TAIL)
        byte = self.b(RING + tail)
        self.w(TAIL, 0 if tail + 1 > 31 else tail + 1)
        self.w(COUNT, self.r(COUNT) - 1)
        rs, widx = self.r(RS), self.r(WIDX)

        def done(n):
            self.messages.append(bytes(self.uc.mem_read(MSGS + widx, n)))
            self.w(WIDX, 0 if widx + n > 8191 else widx + n)
        if byte >= 0xf8:
            self.messages.append(bytes((byte,)))
        elif byte & 0x80:
            if byte == 0xf0:
                self.w(SXLEN, 0)
                self.b(MSGS + widx, 0xf0)
            elif byte == 0xf7 and rs == 0xf0:
                n = self.r(SXLEN)
                self.b(MSGS + widx + n + 1, 0xf7)
                done(n + 2)
                self.w(SXLEN, 0)
            self.w(RS, byte)
            self.w(PEND, 0)
        elif rs == 0xf0:
            n = self.r(SXLEN) + 1
            self.w(SXLEN, n)
            self.b(MSGS + widx + n, byte)
        elif self.r(PEND):
            self.b(MSGS + widx + 2, byte)
            self.w(PEND, 0)
            done(3)
        elif rs >> 4 in (8, 9, 0xa, 0xb, 0xe):
            self.w(PEND, 0xffffffff)
            self.b(MSGS + widx, rs)
            self.b(MSGS + widx + 1, byte)
        elif rs >> 4 in (0xc, 0xd):
            self.b(MSGS + widx, rs)
            self.b(MSGS + widx + 1, byte)
            done(2)
        else:
            self.w(RS, 0)

    def din(self, *data):  # bytes the UART put in the FIFO
        for byte in data:
            self.enqueue(byte)

    def settle(self):  # the framer interrupt runs until the FIFO is empty
        while self.r(COUNT):
            self.frame_one()

    def usb(self, *events):  # one USB-MIDI packet of (cin, b0, b1, b2) events
        m = self.m
        self.uc.mem_write(0x4ecc9000, b''.join(bytes(e) for e in events))
        self.uc.reg_write(m.UC_M68K_REG_SR, 0x2000)
        self.uc.reg_write(m.UC_M68K_REG_A7, 0x7ff00)
        self.uc.mem_write(0x7ff00, struct.pack('>I', 0x7fff0))
        self.uc.reg_write(m.UC_M68K_REG_D0, 4 * len(events))
        self.uc.emu_start(self.sym['usbmidi_rx_decode'], 0x7fff0, count=200000)
        assert self.uc.reg_read(m.UC_M68K_REG_SR) & 0x700 == 0, 'the decoder must return unmasked'

    def call(self, name, arg):
        m = self.m
        self.uc.reg_write(m.UC_M68K_REG_SR, 0x2000)
        self.uc.reg_write(m.UC_M68K_REG_A7, 0x7ff00)
        self.uc.mem_write(0x7ff00, struct.pack('>II', 0x7fff0, arg))
        self.uc.emu_start(self.sym[name], 0x7fff0, count=200000)


@unittest.skipUnless(TOOLS, 'ColdFire binutils or Unicorn unavailable')
class SharedFramer(unittest.TestCase):
    def unit(self):
        return Unit(functions.receiver_source((ROOT / 'sdk/machines/octatrack/elekloader/usbmidi_rx.s').read_text()))

    def test_usb_message_between_din_running_status_notes(self):
        unit = self.unit()
        unit.din(0x90, 0x3c, 0x64)
        unit.usb((0xc, 0xc0, 0x05, 0))
        unit.din(0x3e, 0x64)
        unit.settle()
        self.assertEqual(unit.messages, [b'\x90\x3c\x64', b'\xc0\x05', b'\x90\x3e\x64'])
        self.assertTrue(unit.framer_masks and set(unit.framer_masks) <= {0, 0x700})

    def test_usb_message_between_a_din_message_data_bytes(self):
        unit = self.unit()
        unit.din(0x90, 0x3c, 0x64, 0x3d)  # the second note waits for its velocity
        unit.usb((0xc, 0xc0, 0x05, 0))
        unit.din(0x64)
        unit.settle()
        self.assertEqual(unit.messages, [b'\x90\x3c\x64', b'\xc0\x05', b'\x90\x3d\x64'])

    def test_three_byte_usb_message_inside_a_din_note(self):
        unit = self.unit()
        unit.din(0x90, 0x3c)
        unit.usb((0xb, 0xb0, 0x07, 0x7f))
        unit.din(0x64)
        unit.settle()
        self.assertEqual(unit.messages, [b'\xb0\x07\x7f', b'\x90\x3c\x64'])

    def test_din_sysex_cut_by_a_usb_message_never_plays_as_notes(self):
        unit = self.unit()
        unit.din(0xf0, 0x43, 0x10)
        unit.usb((0x9, 0x90, 0x3c, 0x64))
        unit.din(0x12, 0x34, 0xf7)
        unit.settle()
        self.assertEqual(unit.messages, [b'\x90\x3c\x64'])
        self.assertEqual(unit.r(RS), 0xf7)

    def test_realtime_and_usb_alone_are_unchanged(self):
        unit = self.unit()
        unit.din(0x90, 0x3c, 0x64, 0x3d)
        unit.usb((0xf, 0xf8, 0, 0))
        unit.din(0x64)
        unit.settle()
        self.assertEqual(unit.messages, [b'\x90\x3c\x64', b'\xf8', b'\x90\x3d\x64'])
        unit = self.unit()
        unit.usb((0x9, 0x90, 0x3c, 0x64), (0x8, 0x80, 0x3c, 0x00))
        unit.settle()
        self.assertEqual(unit.messages, [b'\x90\x3c\x64', b'\x80\x3c\x00'])

    def test_disk_mode_holds_usb_midi_and_gives_it_back(self):
        unit = self.unit()
        up, busy, acc = unit.sym['usbmidi_up'], unit.sym['usbmidi_tx_busy'], unit.sym['usbmidi_up'] + 4
        held, holds = unit.sym['mw_usb_midi_held'], unit.sym['mw_usb_midi_disk_holds']
        unit.b(up, 1)
        unit.b(unit.sym['usbmidi_rx_state'], 2)
        unit.uc.mem_write(acc, b'\x00\x08')
        flushes = []
        from unicorn import UC_HOOK_MEM_WRITE
        unit.uc.hook_add(UC_HOOK_MEM_WRITE, lambda u, _a, address, _s, value, *_: flushes.append(value),
                         begin=ENDPTFLUSH, end=ENDPTFLUSH + 3)
        unit.call('mw_usb_midi_disk', 0)  # closed, never held: nothing
        self.assertEqual((unit.b(held), unit.r(holds), flushes), (0, 0, []))
        unit.call('mw_usb_midi_disk', 1)
        self.assertEqual((unit.b(held), unit.b(busy), bytes(unit.uc.mem_read(acc, 2)), unit.r(holds)), (1, 1, b'\0\0', 1))
        self.assertEqual(flushes[0], 0x00040004)
        self.assertEqual(unit.b(up), 1, 'usbmidi_up is the watchdog\'s "configured": never cleared here')
        unit.call('mw_usb_midi_disk', 1)  # still open: no new flush
        self.assertEqual(unit.r(holds), 1)
        unit.b(busy, 0)  # a SET_CONFIGURATION while open clears the sender's busy flag
        unit.call('mw_usb_midi_disk', 1)
        self.assertEqual((unit.r(holds), unit.b(busy)), (2, 1))
        unit.w(ENDPTPRIME, 0)
        unit.uc.mem_write(acc, b'\x00\x03')
        unit.call('mw_usb_midi_disk', 0)  # closed: the receiver primed again, the stale queue gone
        self.assertEqual((unit.b(held), unit.b(busy), bytes(unit.uc.mem_read(acc, 2))), (0, 0, b'\0\0'))
        self.assertEqual(unit.r(EP2_RX_TD), 0x02008080)
        self.assertEqual(unit.r(ENDPTPRIME) & 4, 4)

    def test_disk_mode_end_without_a_host_waits_for_set_configuration(self):
        unit = self.unit()
        busy = unit.sym['usbmidi_tx_busy']
        unit.b(unit.sym['usbmidi_up'], 1)
        unit.call('mw_usb_midi_disk', 1)
        unit.b(unit.sym['usbmidi_up'], 0)  # a bus reset or the cable pulled meanwhile
        unit.w(ENDPTPRIME, 0)
        unit.call('mw_usb_midi_disk', 0)
        self.assertEqual((unit.b(unit.sym['mw_usb_midi_held']), unit.b(busy), unit.r(ENDPTPRIME)), (0, 1, 0))

    def test_the_receiver_takes_no_completion_while_held(self):
        text = functions.receiver_source((ROOT / 'sdk/machines/octatrack/elekloader/usbmidi_rx.s').read_text())
        shim = text.split('usbmidi_rx_isr_shim:', 1)[1].split('\n2:', 1)[0]
        self.assertIn('tstb    usbmidi_up\n    beqw    9f\n    tstb    mw_usb_midi_held', shim)


if __name__ == '__main__':
    unittest.main()
