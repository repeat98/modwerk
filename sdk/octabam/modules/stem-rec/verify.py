#!/usr/bin/env python3
"""STEM REC's gate: its card builds under the ColdFire port (ot_emu).

    python3 modules/stem-rec/verify.py        (from the vendored octabam root, sdk/octabam)

Builds four selections the way scripts/export-composition-proofs.py does
(static stock, the stock FX2 entries kept, fallback NONE): STEM REC alone,
beside APPLY SCENE, beside TUNER, and beside USB AUDIO OUT TRACKS MAIN CUE
(with USB MIDI, as the exporter adds it). Reads, and SKIPs without any of them:
  - the original MAIN OS: out/raw/section_3_MAIN_OS.bin (the user's own);
  - the port: out/emu/ot_emu (OT_EMU overrides);
  - the app's chooser metadata: ../../src/engine/assets/chooser-metadata.json.

What it checks:
  1. STEM REC alone boots to the handoff: the loader's entry once, its fatal
     hang never.
  2. Its DRAM runtime reads back equal to the link, byte for byte (STEM REC
     writes none of it before the handoff).
  3. stems_gtab, filled at build time from the OS by stock copies, holds
     core 0's gain table: the OS's 774 bytes at 0x400EA18A.
  4. The ring, the writer's stack and the card buffer lie in the platform
     reserve, clear of the runtime and its BSS, the buffer on 512 bytes.
  5. STEM REC builds beside APPLY SCENE (the card build leaves STEM REC's YES
     double tap out, so the two claim no common site).
  6. STEM REC builds beside TUNER, which claims the UI loop's head next to
     STEM REC's site there.
  7. STEM REC beside USB AUDIO OUT builds and boots as in 1.

What it cannot see: a take. Recording, the menu and the card writer are
proven by the pinned source's own gates (verify_stems, verify_stems_units,
verify_stems_menu) on the pinned source, and on a unit.
"""
import hashlib
import importlib
import json
import os
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(os.path.abspath(__file__)).parents[2]      # sdk/octabam, through the draft's build link
APP = ROOT.parents[1]
OS_SLICE = ROOT / "out/raw/section_3_MAIN_OS.bin"
EMU = pathlib.Path(os.environ.get("OT_EMU", ROOT / "out/emu/ot_emu"))
MENUS = APP / "src/engine/assets/chooser-metadata.json"
WORK = ROOT / "out/stem-rec-verify"
GTAB_ADDR, GTAB_LEN = 0x400EA18A, 258 * 3
REGIONS = {"stems_ring": 0x800000, "stems_stack": 0x2000, "stems_buf": 14 * 512}
STEMS, APPLY, TUNER = "STEM REC", "APPLY SCENE", "TUNER"
USB = ("USB AUDIO OUT TRACKS MAIN CUE", "USB MIDI")
FAILS = []


def check(name, ok, detail=""):
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}" + (f"  {detail}" if detail else ""))
    if not ok:
        FAILS.append(name)


def skip(why):
    print(f"  [SKIP] stem-rec: {why}")
    sys.exit(0)


def build_here(work, keys):
    """In this process (a child of the gate): build `keys` into work/out."""
    os.environ.update(REMIX="stem-rec-verify", XBUS="1", SPEC="1", DEV="0", NOROUNDTRIP="0",
                      OCTABAM_STATIC_STOCK="1", OCTABAM_NO_CACHE="1", BUILD="79", OCTAMOD_CORE_LOGGER_PAGES="0")
    sys.path[:0] = [str(ROOT / "tools/build"), str(ROOT / "tools")]
    import toolpath  # noqa: F401
    import dsp_modmap
    dsp_modmap.IMG = OS_SLICE
    from remix import registry
    from remix.schema import Remix
    known = registry.modules()
    menus = json.loads(MENUS.read_text())
    unknown = [k for k in keys if k not in known]
    if unknown:
        sys.exit(f"not a module here: {', '.join(unknown)}")
    mods = tuple(k for k in menus["stockFx2"] if k in known and known[k].is_stock) + tuple(keys)
    remix = registry.with_platform(Remix(name="stem-rec-verify", doc="STEM REC's gate; never flashed.", modules=mods,
                                         fx1=tuple(menus["stockFx1"]), hidden=(), fallback="NONE"), known)
    registry.remix = lambda _: remix
    work.mkdir(parents=True, exist_ok=True)
    for name in ["modules", "platform", "dsp", "vendor"]:
        link = work / name
        if not link.exists():
            os.symlink(ROOT / name, link, target_is_directory=True)
    (work / "out").mkdir(exist_ok=True)
    os.chdir(work)
    build = importlib.import_module("build_bus")
    build.IMG = OS_SLICE
    build.OUT = work / "out/image.bin"
    importlib.import_module("ab_image").OUT = work / "out/analog-bassdrum"
    build.main()


def build(tag, keys):
    """(ok, log tail): the selection built into WORK/tag by a child process."""
    work = WORK / tag
    subprocess.run(["rm", "-rf", str(work)], check=True)
    r = subprocess.run([sys.executable, os.path.abspath(__file__), "--build", str(work), *keys],
                       capture_output=True, text=True, cwd=ROOT)
    (WORK / f"{tag}.log").write_text(r.stdout + r.stderr)
    return r.returncode == 0 and (work / "out/image.bin").exists(), (r.stdout + r.stderr).strip()[-300:]


def syms(elf):
    nm = subprocess.run(["m68k-elf-nm", str(elf)], capture_output=True, text=True).stdout
    return {f[2]: int(f[0], 16) for f in (line.split() for line in nm.splitlines()) if len(f) == 3}


def boot(tag, dumps):
    """(handoff, entry hits, fatal hits, {dump name: bytes}) for WORK/tag's image."""
    work = WORK / tag
    loader = syms(work / "out/platform/loader.elf")
    entry, fatal = loader["octabam_bootstrap"], loader["fatal"]
    spec = ";".join(f"0x{a:x},{n}={work / 'out' / ('_dump_' + k + '.bin')}" for k, (a, n) in dumps.items())
    args = [str(EMU), "--image", str(work / "out/image.bin"), "--max", "80000000", "--watch-pc", f"0x{entry:x},0x{fatal:x}"]
    r = subprocess.run(args + (["--mem-dump", spec] if dumps else []), capture_output=True, text=True, cwd=work)
    hits = [line for line in r.stdout.splitlines() if line.strip().startswith("[") and " at 0x" in line]
    got = {k: (work / "out" / f"_dump_{k}.bin").read_bytes() if (work / "out" / f"_dump_{k}.bin").exists() else b""
           for k in dumps}
    return ("HANDOFF" in r.stdout, sum(f"at 0x{entry:x}" in h for h in hits), sum(f"at 0x{fatal:x}" in h for h in hits),
            got)


def main():
    if not OS_SLICE.exists():
        skip(f"no original MAIN OS at {OS_SLICE}")
    if not EMU.exists():
        skip(f"the ColdFire port is not built ({EMU}; make emu-cf, or OT_EMU)")
    if not MENUS.exists():
        skip(f"no chooser metadata at {MENUS}")
    WORK.mkdir(parents=True, exist_ok=True)

    ok, tail = build("alone", [STEMS])
    check("stem-rec builds alone", ok, "" if ok else tail)
    if ok:
        work = WORK / "alone/out"
        layout = json.loads((work / "platform/layout.json").read_text())
        raw = (work / "platform/runtime/runtime.bin").read_bytes()
        base = layout["base"]
        elf = next((work / "platform/runtime").glob("*.elf"), None)
        gtab = syms(elf).get("stems_gtab") if elf else None
        dumps = {"runtime": (base, len(raw))}
        if gtab is not None:
            dumps["gtab"] = (gtab, GTAB_LEN)
        handoff, entries, fatals, got = boot("alone", dumps)
        check("stem-rec boots to the handoff; loader ran 1x, its fatal hang 0x", handoff and entries == 1 and fatals == 0,
              f"handoff {handoff}, entry {entries}x, fatal {fatals}x")
        diff = [i for i in range(len(raw)) if i >= len(got["runtime"]) or got["runtime"][i] != raw[i]]
        check("the DRAM runtime reads back equal to the link", got["runtime"] != b"" and not diff,
              f"{len(raw):,} bytes at {base:#x}, {len(diff)} differ")
        want = OS_SLICE.read_bytes()[GTAB_ADDR - 0x40000400:][:GTAB_LEN]
        check("stems_gtab holds the OS's gain table", gtab is not None and got.get("gtab") == want,
              f"stems_gtab {gtab:#x}, sha256 {hashlib.sha256(got.get('gtab', b'')).hexdigest()[:12]}"
              if gtab is not None else "no stems_gtab in the runtime's symbols")
        regions = layout.get("regions", {})
        top = max(a + n for a, n in regions.values()) if regions else 0
        bss = layout.get("bss_end", base + len(raw))
        placed = all(k in regions and regions[k][1] == n for k, n in REGIONS.items())
        clear = placed and min(a for a, _ in regions.values()) >= bss
        disjoint = placed and all(a1 + n1 <= a2 or a2 + n2 <= a1 for k1, (a1, n1) in regions.items()
                                  for k2, (a2, n2) in regions.items() if k1 < k2)
        check("the ring, stack and buffer lie in the reserve, clear of the runtime and its BSS",
              placed and clear and disjoint and regions["stems_buf"][0] % 512 == 0,
              ", ".join(f"{k} {a:#x}+{n:#x}" for k, (a, n) in sorted(regions.items())) + f", top {top:#x}, bss end {bss:#x}")

    ok, tail = build("apply-scene", [STEMS, APPLY])
    check("stem-rec builds beside APPLY SCENE", ok, "" if ok else tail)

    ok, tail = build("tuner", [STEMS, TUNER])
    check("stem-rec builds beside TUNER (the UI loop's head beside STEM REC's site)", ok, "" if ok else tail)

    ok, tail = build("usb-audio", [STEMS, *USB])
    check("stem-rec builds beside USB AUDIO OUT", ok, "" if ok else tail)
    if ok:
        handoff, entries, fatals, _ = boot("usb-audio", {})
        check("stem-rec beside USB AUDIO OUT boots to the handoff", handoff and entries == 1 and fatals == 0,
              f"handoff {handoff}, entry {entries}x, fatal {fatals}x")

    print(f"stem-rec: {len(FAILS)} failure(s)")
    sys.exit(1 if FAILS else 0)


if __name__ == "__main__":
    if sys.argv[1:2] == ["--build"]:
        build_here(pathlib.Path(sys.argv[2]), sys.argv[3:])
    else:
        main()
