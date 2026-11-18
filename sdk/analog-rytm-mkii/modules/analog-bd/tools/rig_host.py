"""BD ANALOG's host model for voice_rig.py: the module's own DSP (src/ab_dsp.c, built for
the host as tools/compare.py builds it) rendered for a type, the knobs and a velocity.
LEV is applied as the base applies it (squared); the voice path after it is not modelled."""
import array
import pathlib
import subprocess
import tempfile

HERE = pathlib.Path(__file__).resolve().parent
INCLUDE = HERE.parents[3] / 'machines' / 'analog-rytm-mkii' / 'include'
_exe = None


def _build():
    global _exe
    if _exe is None:
        d = pathlib.Path(tempfile.mkdtemp(prefix='analog-bd-host-'))
        _exe = d / 'host_render'
        subprocess.run(['cc', '-O2', '-DMW_DSP_HOST', '-I', str(INCLUDE), '-o', str(_exe),
                        str(HERE / 'host_render.c'), str(HERE.parent / 'src' / 'ab_dsp.c')], check=True)
    return _exe


def render(type_index, knobs, velocity, seconds=1.5):
    args = [str(_build()), str(type_index), knobs['TUN'], knobs['DEC'], knobs['TON'], knobs['ATK'], knobs['SWP'],
            velocity, knobs['LOW'], knobs['HI'], int(seconds * 48000 / 32)]
    raw = subprocess.run([str(a) for a in args], check=True, capture_output=True).stdout
    gain = (knobs['LEV'] / 127) ** 2
    return [v / 2 ** 31 * gain for v in array.array('i', raw)]
