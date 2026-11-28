"""Native returning-processor regressions: no firmware, USB or emulator."""
from pathlib import Path
import shutil,subprocess,sys,tempfile,unittest

ROOT=Path(__file__).resolve().parents[2]
FIXTURES=Path(__file__).with_name('track_processor')

@unittest.skipUnless(shutil.which('clang'),'clang is required for native C fixtures')
class TrackProcessor(unittest.TestCase):
    def test_budget_and_publication_requests(self):
        subprocess.run([sys.executable,'-B',str(FIXTURES/'check_budget.py')],check=True)

    def test_publication_identity_and_complete_trial_readiness(self):
        subprocess.run([sys.executable,'-B',str(FIXTURES/'check_ready.py')],check=True)

    def test_returning_chain_contract_and_transport(self):
        subprocess.run([sys.executable,'-B',str(FIXTURES/'returning/check_chain.py')],check=True)

    def test_owned_controls_and_retirement(self):
        policy=ROOT/'sdk/machines/octatrack/module-adapters/controller-policy'
        with tempfile.TemporaryDirectory(prefix='track-controls-') as tmp:
            exe=Path(tmp)/'controls'
            subprocess.run(['clang','-std=c11','-Wall','-Wextra','-Werror','-O1',
                '-fsanitize=undefined','-fno-sanitize-recover=all',
                str(policy/'test_track_controls.c'),'-o',str(exe)],check=True)
            subprocess.run([str(exe)],check=True)

    def test_auxiliary_sources_are_part_of_base_identity(self):
        # These files are read by a generator, so omitting them would let a
        # changed implementation keep an unchanged Base configuration identity.
        source=(ROOT/'sdk/machines/octatrack/elekloader/build_core.py').read_text()
        for name in ['track_budget.py','track_receiver.py','track_budget.c','modwerk_track.h']:
            self.assertIn(name,source)

if __name__=='__main__':unittest.main()
