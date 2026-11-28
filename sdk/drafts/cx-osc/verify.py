"""CX OSC draft gate (host: test_cx_osc_port.py)."""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
result = unittest.TextTestRunner(verbosity=2).run(
    unittest.defaultTestLoader.loadTestsFromName("test_cx_osc_port")
)
raise SystemExit(0 if result.wasSuccessful() else 1)