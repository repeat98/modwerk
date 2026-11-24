"""Run the reference renders and sample-position boundaries in module:doctor."""
import importlib.util
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
        reference = pathlib.Path(folder) / "plain.o"
        subprocess.run([cc, "-std=c11", "-O2", "-DGRAN_UNIT_PATH=0", "-DGRAN_PTR_PATH=0",
                        "-Dgran_render=plain_render", "-Dgran_params=plain_params",
                        "-Dgran_init=plain_init", "-Dgran_trigger=plain_trigger",
                        "-c", "gran.c", "-o", str(reference)], cwd=HERE, check=True)
        render = pathlib.Path(folder) / "grain-render-test"
        subprocess.run([cc, "-std=c11", "-O2", "render_test.c", "gran.c", str(reference), "-o", str(render)],
                       cwd=HERE, check=True)
        subprocess.run([str(render)], check=True)
    if importlib.util.find_spec("unicorn") and shutil.which("m68k-elf-as"):
        subprocess.run([sys.executable, "-B", str(HERE / "verify_lanes.py")], check=True)
    else:
        print("[SKIP] Compiled Flex frame test requires Python Unicorn and m68k-elf binutils")
