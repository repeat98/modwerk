#!/usr/bin/env python3
# SPDX-License-Identifier: MIT
"""Host-only real C profile/event checks. No firmware, emulator, card or device."""
from pathlib import Path
import os
import subprocess
import tempfile
import unittest

HERE = Path(__file__).resolve().parent

class BankLoadEvents(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.scratch = tempfile.TemporaryDirectory(prefix='midi2-bank-events-')
        cls.addClassCleanup(cls.scratch.cleanup)
        cls.binary = Path(cls.scratch.name) / 'events'
        result = subprocess.run([os.environ.get('CC', 'cc'), '-std=c99', '-DMM_SHARED_BANK_EVENTS',
                                 '-Werror=implicit-function-declaration',
                                 str(HERE / 'template/test_bank_load.c'), '-o', str(cls.binary)],
                                capture_output=True, text=True)
        if result.returncode:
            raise RuntimeError(result.stderr)

    def run_case(self, mode):
        with tempfile.TemporaryDirectory(prefix='midi2-projects-') as folder:
            for project in ['A', 'B']:
                path = Path(folder) / project
                path.mkdir()
                (path / 'channels.bin').write_bytes(bytes([1]) * 1024)
            result = subprocess.run([str(self.binary), folder, mode], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_failed_load_preserves_cached_names_and_clone(self): self.run_case('failed')
    def test_failed_load_preserves_dirty_name_until_normal_autosave(self): self.run_case('dirty-failed')
    def test_failed_load_preserves_pending_recovery_and_can_finish(self): self.run_case('failed-recovery')
    def test_successful_project_change_loads_names_once_after_engine_settles(self): self.run_case('changed-project')
    def test_post_load_wakes_idle_profile_and_retries_after_card_jobs(self): self.run_case('queued-change')
    def test_same_project_notification_is_not_a_success_oracle(self): self.run_case('same-project')
    def test_caller_and_mask_survive_nested_and_unrelated_pairs(self): self.run_case('caller-context')
    def test_overflow_and_unmatched_posts_do_not_invent_context(self): self.run_case('overflow')

if __name__ == '__main__': unittest.main(verbosity=2)
