"""Export independently authored DSP packages through the pinned native builder.

Only plain inserts accepted by its loadable predicate are exported. No stock
image is read, no stock bytecode is exported, and no emulator suite is run.
"""
import argparse
import hashlib
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def word_bytes(words):
    return b"".join(word.to_bytes(3, "big") for word in words)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("worktree", type=pathlib.Path)
    parser.add_argument("output", type=pathlib.Path)
    args = parser.parse_args()
    root, destination = args.worktree.resolve(), args.output.resolve()
    app = pathlib.Path(__file__).resolve().parents[1]
    expected = json.loads((app / "src/catalog/native-metadata.json").read_text())["revision"]
    revision = subprocess.check_output(["git", "-C", str(root), "rev-parse", "HEAD"], text=True).strip()
    if revision != expected:
        parser.error("Use a native worktree at the catalog's pinned revision.")
    if subprocess.run(["git", "-C", str(root), "diff", "--quiet", "HEAD"], check=False).returncode:
        parser.error("Commit or discard tracked native source changes before exporting pinned packages.")

    os.chdir(root)
    os.environ.update(REMIX="miniverb", XBUS="1", SPEC="1", DEV="0", OCTABAM_STATIC_STOCK="0", NOROUNDTRIP="0")
    sys.path[:0] = [str(root / "tools/build"), str(root / "tools")]
    import build_bus as native
    from remix.registry import modules

    result = {"schema": 1, "revision": revision, "license": "/licenses/octabam.txt", "packages": [], "excluded": []}
    wanted = {"miniverb", "euclid", "tapeecho"}
    try:
        for mod in sorted(modules().values(), key=lambda module: module.name):
            if mod.name not in wanted:
                continue
            native.ASM_SRC[mod.key] = mod.dsp.asm
            text = native._loadable_text(mod)
            if text is None:
                result["excluded"].append({"id": mod.name, "reason": "Native loadable predicate requires resident / selection-dependent placement."})
                continue
            if re.search(r"^\s*\.?(?:incbin|include)\b", text, re.MULTILINE | re.IGNORECASE):
                raise RuntimeError("Review transcluded source / binary content before exporting a package.")
            words, relocations, init, proc = native._package(mod.key, text, tuple(mod.dsp.ptable))
            code, proofs = word_bytes(words), []
            for base in (0x1000, 0x1400, 0x1801, 0x2407):
                source = text.replace(native.PTABLE_LITERAL, f"${base:x}") if mod.dsp.ptable else text
                fresh, _ = native.assemble_syms(source, base + len(mod.dsp.ptable), label=mod.key)
                proofs.append({"base": base, "sha256": sha256(word_bytes(list(mod.dsp.ptable) + fresh))})
            sources = {
                path: sha256((root / path).read_bytes())
                for path in (mod.dsp.asm, f"modules/{mod.name}/manifest.py")
            }
            result["packages"].append({
                "id": mod.name, "key": mod.key, "author": mod.author,
                "source": f"https://github.com/sambanks/octabam/tree/main/modules/{mod.name}",
                "sources": sources, "fxId": mod.menu.fx2_id, "words": len(words),
                "code": code.hex(), "sha256": sha256(code), "relocations": relocations,
                "init": init, "proc": proc, "proofs": proofs,
            })
            print(f"{mod.name}: {len(words)} words, {len(relocations)} relocations, four-origin native proof")
        if {pkg["id"] for pkg in result["packages"]} != wanted:
            raise RuntimeError("The native loadable set changed; review it before replacing the catalog.")
        destination.write_text(json.dumps(result, indent=2) + "\n")
    finally:
        if native._SCRATCH is not None:
            shutil.rmtree(native._SCRATCH, ignore_errors=True)


if __name__ == "__main__":
    main()
