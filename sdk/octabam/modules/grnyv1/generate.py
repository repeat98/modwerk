"""Regenerate FRACT's authored ColdFire sources with GCC 16.2.0, without firmware.

The native manifest consumes the committed assembly. --check proves that it
still represents the C sources before the stock-free package build uses it.
"""
import argparse
from pathlib import Path
import re
import runpy
import shutil
import subprocess
import sys
import tempfile

HERE = Path(__file__).resolve().parent


def generated():
    if subprocess.check_output(["m68k-elf-gcc", "-dumpfullversion"], text=True).strip() != "16.2.0":
        raise RuntimeError("FRACT assembly regeneration requires m68k-elf GCC 16.2.0")
    sys.path.insert(0, str(HERE.parents[1] / "tools"))
    declaration = runpy.run_path(str(HERE / "manifest.py"))
    lengths, densities = declaration["SIZES"], declaration["DENSITIES"]
    first_high = next((i for i, n in enumerate(lengths) if n > 65535), len(lengths))
    if len(lengths) != 64 or any(n < 0 or n >= 131072 or
                                (n > 65535) != (i >= first_high) for i, n in enumerate(lengths)):
        raise RuntimeError("Update the packed Hann table for this SIZE range.")
    if len(densities) != 128 or densities[127] != 127 or min(densities) < 1 or any(
            b < a for a, b in zip(densities, densities[1:])):
        raise RuntimeError("DENS must rise monotonically to 127 and stay positive.")
    result = {
        "sizes.h": "#ifndef GRNYV1_SIZES_H\n#define GRNYV1_SIZES_H\n"
        + f"static const uint16_t og_lengths_low[64]={{{','.join(str(n & 65535) for n in lengths)}}};\n"
        + "static inline uint32_t og_length(unsigned index) {\n"
        + f"    return og_lengths_low[index]+(index>={first_high}?65536u:0u);\n"
        + "}\n/* DENS (SETUP D) -> the engine's density (manifest.py, DENSITIES). */\n"
        + f"static const uint8_t og_densities[128]={{{','.join(map(str, densities))}}};\n#endif\n",
        "fxid.h": f"#define OG_FX_ID 0x{declaration['MODULE'].menu.fx2_id:02x}u\n",
    }
    with tempfile.TemporaryDirectory(prefix="fract-coldfire-") as temporary:
        work = Path(temporary)
        for path in HERE.iterdir():
            if path.suffix in (".c", ".h"):
                shutil.copyfile(path, work / path.name)
        for name, source in result.items():
            (work / name).write_text(source)
        for stem, hook in (("pitch", None), ("control", None), ("grain", "kernel.s"),
                           ("source", "sourcehook.s"), ("view", None)):
            subprocess.run([
                "m68k-elf-gcc", "-mcpu=5475", "-msoft-float", "-malign-int", "-Os", "-fomit-frame-pointer",
                "-ffreestanding", "-fno-builtin", "-fno-common", "-fno-pic",
                *(["-fno-tree-ter"] if stem == "view" else []),
                "-fno-zero-initialized-in-bss", "-DOG_NATIVE_STAGE_ONE",
                "-S", stem + ".c", "-o", stem + ".s",
            ], cwd=work, check=True)
            source = (work / (stem + ".s")).read_text().replace("\t.data", "\t.text")
            source = re.sub(r"\t.section\s+\.rodata[^\n]*", "\t.text", source)
            if hook:
                source += "\n#APP\n" + (HERE / hook).read_text()
            result[stem + ".s"] = source
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    for name, source in generated().items():
        path = HERE / name
        if args.check:
            if not path.is_file() or path.read_text() != source:
                raise SystemExit(name + " differs: run python3 modules/grnyv1/generate.py")
        else:
            path.write_text(source)
    print("FRACT ColdFire sources " + ("match C sources." if args.check else "regenerated."))
