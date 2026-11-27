"""The current engine obeys native packet, owner and START contracts."""
from pathlib import Path
import sys
import unittest

MODULE = Path(__file__).resolve().parents[2]
ROOT = next(p for p in MODULE.parents if (p / 'sdk/tests/test_fract_machine.py').is_file())
sys.path.insert(0, str(ROOT / 'sdk/tests'))
import test_fract_machine as adapter  # noqa: E402

adapter.DRAFT = MODULE
adapter.SUPPORT = MODULE / 'support'
adapter.MODULE = MODULE / 'engine'
adapter.EXTENSION_FLAGS = ['-DOG_MACHINE_START_EXTENSION']


class CurrentNativeAdapter(adapter.FractMachineTests):
    PROFILE_FLAGS = ['-DOG_MACHINE_GRAIN_ONLY', '-DOG_FRACT_CURRENT_ENGINE', '-DOG_MACHINE_ALL_TRACKS']


def load_tests(loader, tests, pattern):
    # The inherited legacy FX cases remain in the unchanged SDK suite.
    names = (
        'test_native_render_packet_bounds_controls_and_tstr_override',
        'test_pitched_and_split_source_packets_preserve_fetch_boundaries',
        'test_owner_lifecycle_and_invalid_calls',
        'test_pcm_state_and_owner_match_fx_reference',
        'test_proposed_start_translates_and_restores_src_controls',
    )
    return unittest.TestSuite(CurrentNativeAdapter(name) for name in names)
