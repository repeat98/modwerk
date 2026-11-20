"""Build the private Grain timing probe in a host scratch directory, without firmware."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile

HERE = Path(__file__).resolve().parent
GRAIN = HERE.parents[1]
SDK = GRAIN.parents[2]
ROOT = SDK.parent
sys.path.insert(0, str(SDK / "runtime" / "loader"))
sys.path.insert(0, str(SDK / "runtime"))
import build
import m68k_codegen

CANDIDATE = "371e2e19169814750c4bf844a2b907b1871328f8919fd32b5bddd869859c60b0"
PROBE = "ad52e8af91b33cdd97531ff7d390e57162d20b0cf259ce788e54d7d02037d652"


def assemble(out):
    out.mkdir(parents=True, exist_ok=True)
    package = (ROOT / "public/octatrack-modules/grain/0.1.0-experimental.mwrm").read_bytes()
    historical = hashlib.sha256(package).hexdigest() == CANDIDATE
    cross = "m68k-elf-"
    grain, fixture = out / "grain.o", out / "bench.o"
    subprocess.run([cross + "as", "-mcpu=54455", "--defsym", "MODWERK_EVENTS=1",
                    GRAIN / "grain_core.s", "-o", grain], check=True)
    image, _, _, _ = build.link_units([grain], cross, 0, out, anywhere=True)
    if package.count(image) != 1:
        raise ValueError("Linked Grain image differs from the catalogue package")
    (out / "0.elf").replace(out / "grain.elf")
    if not historical:
        print("Wrote the current catalogue ELF for bound.py. The physical timing probe belongs to the earlier SCAN package.")
        return
    subprocess.run([cross + "gcc", *build.CFLAGS, *m68k_codegen.FLAGS,
                    "-I" + str(GRAIN), "-c", HERE / "bench.c", "-o", fixture], check=True)
    m68k_codegen.check_mcf54455([grain, fixture], cross + "objdump")
    image, symbols, bss, offsets = build.link_units([grain, fixture], cross, 0, out, anywhere=True)
    hooks = [symbols["module_tick"], build.NONE, build.NONE, build.NONE]
    probe = build.package(image, bss, hooks, offsets, name="grain-clock")
    if hashlib.sha256(probe).hexdigest() != PROBE:
        raise ValueError("Probe differs from the one timed on hardware")
    (out / "grain-clock.mwrm").write_bytes(probe)


def verify_audio():
    """Compare all hardware case fingerprints with the portable C renderer."""
    evidence = json.loads((HERE / "measurements.json").read_text())
    assert evidence["probeSha256"] == PROBE and evidence["candidateSha256"] == CANDIDATE
    with tempfile.TemporaryDirectory() as temp:
        driver = Path(temp) / "check.c"
        binary = Path(temp) / "check"
        driver.write_text(
            '#include "bench.c"\n#include <stdio.h>\n'
            'int main(void) {\n'
            '    struct modwerk_runtime_api api = {0};\n'
            '    while (report.completed < report.expected) module_tick(&api);\n'
            '    for (unsigned i = 0; i < CASES; ++i) printf("%u\\n", (unsigned)report.row[i].digest);\n'
            '    return 0;\n}\n')
        subprocess.run(["cc", "-O2", "-DHOST", "-DGRAN_UNIT_PATH=0", "-DGRAN_PTR_PATH=0",
                        "-I" + str(SDK / "runtime/loader"), "-I" + str(GRAIN), "-I" + str(HERE),
                        driver, GRAIN / "gran.c", "-o", binary], check=True)
        expected = list(map(int, subprocess.check_output([binary], text=True).split()))
    for label in ("quiet", "withMidi"):
        rows = evidence["kernel"][label]
        assert len(rows) == len(expected) == evidence["cases"]
        for row, reference in zip(rows, expected):
            count, minimum, maximum, total, fingerprint = row
            assert count == evidence["repeats"] and 0 < minimum <= maximum
            assert count * minimum <= total <= count * maximum
            assert fingerprint == reference, (label, row, reference)
    print(f"{len(expected)} different cases checked in both MKII runs")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("out", type=Path, help="private build directory outside the source tree")
    assemble(parser.parse_args().out.resolve())
    verify_audio()
