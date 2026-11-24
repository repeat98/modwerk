# SPDX-License-Identifier: MIT
"""SNAP exercises the real editor/search service with an authored pair source."""
import unittest
import shutil
import test_sample_editor as fixtures


@unittest.skipUnless(shutil.which('cc'), 'host C compiler unavailable')
class SnapService(unittest.TestCase):
    def test_bounded_analysis_and_atomic_publication(self):
        fixtures.SampleEditor().run_fixture(
            ['sample_editor_service.c', 'test_sample_editor_snap.c'])


if __name__ == '__main__':
    unittest.main()
