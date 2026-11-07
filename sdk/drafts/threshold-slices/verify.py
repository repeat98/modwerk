#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Threshold Slices host scan. The ColdFire package is a private trial, not a published one."""
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
subprocess.run([sys.executable, '-B', '-m', 'unittest', 'sdk.tests.test_threshold_slices'], check=True, cwd=ROOT)
print('[PASS] threshold-slices host scan')
