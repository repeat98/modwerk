"""Run imported upstream infrastructure regressions in Modwerk's SDK check."""
import importlib
import pathlib
import sys
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1] / "octabam"

def load_tests(loader, tests, pattern):
    sys.path.insert(0, str(ROOT / "tools/verify"))
    sys.path.insert(0, str(ROOT / "tools/verify/tests"))
    for name in ("test_module_gates", "test_linked_defsyms", "test_dsp_ranges", "test_cycle_ceiling"):
        tests.addTests(loader.loadTestsFromModule(importlib.import_module(name)))
    return tests
