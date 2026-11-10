# SPDX-License-Identifier: GPL-3.0-or-later
"""The hardware bridge's unplug/re-enumeration seams, with fake USB only."""
import errno
import importlib.util
from pathlib import Path
import struct
import sys
from types import ModuleType, SimpleNamespace
import unittest
from unittest.mock import Mock, patch

PATH = Path(__file__).resolve().parents[2] / 'scripts/octatrack-usb-bridge.py'


class USBError(Exception):
    def __init__(self, message, errno=None):
        super().__init__(message); self.errno = errno


class BridgeTests(unittest.TestCase):
    def setUp(self):
        usb, core, util = ModuleType('usb'), ModuleType('usb.core'), ModuleType('usb.util')
        usb.core, usb.util = core, util
        core.find, core.USBError = Mock(), USBError
        util.claim_interface, util.dispose_resources, util.release_interface = Mock(), Mock(), Mock()
        self.modules = patch.dict(sys.modules, {'usb': usb, 'usb.core': core, 'usb.util': util, 'libusb_package': None})
        self.modules.start(); self.addCleanup(self.modules.stop)
        spec = importlib.util.spec_from_file_location('test_hardware_bridge', PATH)
        self.bridge = importlib.util.module_from_spec(spec); spec.loader.exec_module(self.bridge)
        self.core, self.util = core, util
        self.device = Mock()
        self.device.get_active_configuration.return_value = [SimpleNamespace(bInterfaceNumber=1,
            bInterfaceClass=0xff, bInterfaceSubClass=0x4d, bInterfaceProtocol=1)]
        self.core.find.return_value = self.device

    def setup(self, request=21, direction=0xc1, length=32):
        return 'setup ' + struct.pack('<BBHHH', direction, request, 0, 1, length).hex()

    def test_another_elektron_device_is_not_taken_for_the_unit(self):
        # An Analog Rytm on Overbridge beside the Octatrack: only the device offering the Modwerk interface matches.
        self.bridge.open_unit()
        match = self.core.find.call_args.kwargs['custom_match']
        interface = lambda c, s, p: SimpleNamespace(bInterfaceClass=c, bInterfaceSubClass=s, bInterfaceProtocol=p)
        rytm = [[interface(0xff, 0, 0), interface(1, 1, 0), interface(1, 3, 0)]]
        octatrack = [[interface(8, 6, 80), interface(0xff, 0x4d, 1), interface(1, 1, 0)]]
        self.assertFalse(match(rytm)); self.assertTrue(match(octatrack))
        self.assertEqual(self.core.find.call_args.kwargs['idVendor'], 0x1935)

    def test_descriptor_or_claim_error_disposes_partial_handle(self):
        for stage in ('descriptor', 'claim'):
            with self.subTest(stage=stage):
                self.device.get_active_configuration.side_effect = None
                self.util.claim_interface.side_effect = None; self.util.dispose_resources.reset_mock()
                target = self.device.get_active_configuration if stage == 'descriptor' else self.util.claim_interface
                target.side_effect = USBError('transient during re-enumeration')
                with self.assertRaises(USBError): self.bridge.open_unit()
                self.util.dispose_resources.assert_called_once_with(self.device)
        self.device.reset.assert_not_called(); self.device.set_configuration.assert_not_called()

    def test_reacquisition_error_is_reported_and_next_explicit_request_reopens(self):
        self.device.get_active_configuration.side_effect = [USBError('transient'), self.device.get_active_configuration.return_value]
        unit, held, reply = self.bridge.serve_request(None, [('stale',), True], self.setup())
        self.assertIsNone(unit); self.assertIsNone(held); self.assertIn('err the unit went away', reply)
        self.device.ctrl_transfer.assert_not_called(); self.assertEqual(self.core.find.call_count, 1)
        unit, held, reply = self.bridge.serve_request(unit, held, self.setup())
        self.assertEqual(unit, (self.device, 1)); self.assertEqual(reply, 'ok'); self.assertIsNotNone(held)
        self.assertEqual(self.core.find.call_count, 2); self.device.ctrl_transfer.assert_not_called()
        self.device.ctrl_transfer.return_value = b'actual read'
        unit, held, reply = self.bridge.serve_request(unit, held, 'in 0 32')
        self.assertTrue(reply.startswith('in 0 ')); self.device.ctrl_transfer.assert_called_once()

    def test_find_error_is_one_bounded_attempt_even_without_a_device(self):
        self.core.find.side_effect = USBError('temporary enumeration failure')
        unit, held, reply = self.bridge.serve_request(None, None, self.setup())
        self.assertIsNone(unit); self.assertIsNone(held); self.assertTrue(reply.startswith('err '))
        self.core.find.assert_called_once(); self.util.claim_interface.assert_not_called()
        self.util.dispose_resources.assert_not_called()

    def test_write_failure_clears_setup_and_does_not_replay_on_replug(self):
        unit = self.bridge.open_unit()
        unit, held, _ = self.bridge.serve_request(unit, None, self.setup(request=9, direction=0x41, length=1))
        self.device.ctrl_transfer.side_effect = USBError('unplug during write')
        unit, held, reply = self.bridge.serve_request(unit, held, 'out 0 01')
        self.assertIsNone(unit); self.assertIsNone(held); self.assertTrue(reply.startswith('err '))
        self.device.ctrl_transfer.assert_called_once(); self.util.dispose_resources.assert_called_once_with(self.device)
        self.device.ctrl_transfer.side_effect = None
        unit, held, reply = self.bridge.serve_request(unit, held, 'out 0 01')
        self.assertIn('unsupported', reply); self.device.ctrl_transfer.assert_called_once()
        self.device.reset.assert_not_called(); self.device.set_configuration.assert_not_called()

    def test_disappearing_cleanup_preserves_original_error_and_listener_state(self):
        self.util.claim_interface.side_effect = USBError('claim failed')
        self.util.dispose_resources.side_effect = USBError('gone during dispose')
        unit, held, reply = self.bridge.serve_request(None, None, self.setup())
        self.assertIsNone(unit); self.assertIsNone(held); self.assertIn('claim failed', reply)
        self.core.find.assert_called_once(); self.util.dispose_resources.assert_called_once()

    def test_absent_vendor_releases_descriptor_handle_and_clears_held_setup(self):
        self.device.get_active_configuration.return_value = []
        unit, held, reply = self.bridge.serve_request(None, [('stale',), False], self.setup())
        self.assertIsNone(unit); self.assertIsNone(held); self.assertEqual(reply, 'err the unit is away')
        self.util.dispose_resources.assert_called_once_with(self.device); self.util.claim_interface.assert_not_called()

    def test_prohibited_setup_and_stall_do_not_reset_or_reconfigure_usb(self):
        for request in (5, 9):
            held, reply = self.bridge.reply_for(self.device, None, self.setup(request=request, direction=0))
            self.assertIsNone(held); self.assertIn('never sends', reply)
        _, held, _ = self.bridge.serve_request((self.device, 1), None, self.setup())
        self.device.ctrl_transfer.side_effect = USBError('stall', errno=errno.EPIPE)
        unit, held, reply = self.bridge.serve_request((self.device, 1), held, 'in 0 32')
        self.assertEqual(unit, (self.device, 1)); self.assertEqual(reply, 'in 0 stall')
        self.device.reset.assert_not_called(); self.device.set_configuration.assert_not_called()
        self.util.dispose_resources.assert_not_called()


if __name__ == '__main__':
    unittest.main()
