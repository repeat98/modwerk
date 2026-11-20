"""Run the reference renders and sample-position boundaries in module:doctor."""
import pathlib
import shutil
import subprocess
import sys
import tempfile

HERE = pathlib.Path(__file__).resolve().parent


if __name__ == "__main__":
    cc = shutil.which("cc") or shutil.which("gcc")
    if not cc:
        sys.exit("Grain host checks require a C compiler (cc or gcc)")
    subprocess.run([sys.executable, "-B", str(HERE / "verify.py")], check=True)
    with tempfile.TemporaryDirectory() as folder:
        exe = pathlib.Path(folder) / "grain-range-test"
        subprocess.run([cc, "-std=c11", "-O2", "-o", str(exe), "range_test.c", "gran.c"],
                       cwd=HERE, check=True)
        subprocess.run([str(exe)], check=True)
