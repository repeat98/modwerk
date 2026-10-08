"""Static DSP placement facts from a verified native registry; no stock bytes.

The legacy mode uses the clean catalog-pinned upstream worktree. Vendored mode
binds the complete SDK source inventory to the reviewed app checkout and uses
its catalog order. This exporter reads the verified local MAIN OS for address
facts only; it does not build or qualify a module.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys

SOURCE_GROUPS = ("modules", "platform", "tools", "dsp", "licenses")
LEGACY_ORDER = ("spectrum", "modulation", "character", "miniverb",
                "tapeecho", "euclid", "repitch")


def sha(data):
    return hashlib.sha256(data).hexdigest()


def source_inventory(root, directory):
    """Match the composition exporter's complete reviewed source inventory."""
    folder = root / directory
    if folder.is_symlink() or not folder.is_dir():
        raise ValueError("Source group must be a real directory: " + directory)
    result = {}
    for path in folder.rglob("*"):
        if "__pycache__" in path.parts or path.suffix == ".pyc":
            continue
        if path.is_symlink():
            raise ValueError("Source symlinks are prohibited: " + str(path.relative_to(root)))
        if path.is_file():
            result[path.relative_to(root).as_posix()] = sha(path.read_bytes())
    return result


def reviewed_revision(root, app, vendored):
    if vendored:
        revision = json.loads((app / "sdk/catalog.json").read_text())["sourceRevision"]
        for directory in SOURCE_GROUPS:
            if source_inventory(root, directory) != source_inventory(app / "sdk/octabam", directory):
                raise ValueError("Private SDK differs from reviewed source: " + directory)
        return revision
    revision = subprocess.check_output(["git", "-C", str(root), "rev-parse", "HEAD"], text=True).strip()
    if revision != json.loads((app / "src/catalog/native-metadata.json").read_text())["revision"]:
        raise ValueError("Use the catalog-pinned native worktree.")
    if subprocess.run(["git", "-C", str(root), "diff", "--quiet", "HEAD"]).returncode:
        raise ValueError("Native tracked sources must be clean.")
    return revision


def verified_stock(root, source_hash):
    path = root / "out/raw/section_3_MAIN_OS.bin"
    if sha(path.read_bytes()) != source_hash:
        raise ValueError("The original OS fingerprint is invalid.")
    return path


def catalog_modules(catalog, documents, known):
    """Only compiled catalog DSP entries, in catalog order, with matching pins."""
    byid = {module.name: module for module in known.values()}
    result, seen = [], set()
    for row in catalog["modules"]:
        id = row["id"]
        if not isinstance(id, str) or not re.fullmatch(r"[a-z][a-z0-9-]*", id) or id in seen:
            raise ValueError("Invalid catalog module id: " + str(id))
        seen.add(id)
        document = documents[id]
        if document["id"] != id or document["version"] != row["version"]:
            raise ValueError("Stale catalog module version: " + id)
        if document.get("build", {}).get("status") == "pending":
            continue
        module = byid[id]
        # Standalone/ColdFire imports have separate authored/native credit
        # bindings. They contribute no static DSP placement facts here.
        if module.dsp is None:
            continue
        if document["key"] != module.key or document["author"]["github"] != module.author:
            raise ValueError(id + ": catalog attribution differs from its native declaration")
        fx_id = module.menu.fx2_id if module.menu else None
        if document["compatibility"].get("effectId") != fx_id:
            raise ValueError(id + ": catalog effect ID differs from its native declaration")
        if module.is_stock or module.menu is None:
            raise ValueError(id + ": placeable DSP requires a custom menu declaration")
        result.append({"id": id, "key": module.key, "fxId": fx_id,
                       "priority": module.dsp.priority})
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("worktree", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--app", type=Path, required=True)
    parser.add_argument("--vendored-sdk", action="store_true",
                        help="Bind the complete private SDK inventory to the reviewed app checkout")
    args = parser.parse_args()
    root, app, dest = args.worktree.resolve(), args.app.resolve(), args.output.resolve()
    try:
        revision = reviewed_revision(root, app, args.vendored_sdk)
        stockmeta = json.loads((app / "src/engine/assets/stock-dsp-metadata.json").read_text())
        stock_path = verified_stock(root, stockmeta["sourceSha256"])
    except ValueError as error:
        parser.error(str(error))
    os.chdir(root)
    sys.path[:0] = [str(root / "tools/build"), str(root / "tools")]
    os.environ.update(REMIX="miniverb", XBUS="1", SPEC="1", DEV="0", NOROUNDTRIP="0",
                      OCTABAM_STATIC_STOCK="1", OCTABAM_NO_CACHE="1", BUILD="79")
    import toolpath  # noqa: F401
    import dsp_modmap as dm
    dm.IMG = stock_path
    from remix import registry
    known = registry.modules()
    if args.vendored_sdk:
        # build_bus resolves a remix at import; the reviewed SDK has no
        # upstream remixes. An empty probe supplies metadata and builds nothing.
        from remix.schema import Remix
        registry.remix = lambda _: registry.with_platform(Remix(
            name="octamod-static-facts", doc="Import probe; never built.",
            modules=(), fallback="NONE"), known)
    import build_bus as native
    if args.vendored_sdk:
        catalog = json.loads((app / "sdk/catalog.json").read_text())
        documents = {row["id"]: json.loads((app / "sdk/octabam/modules" / row["id"] /
                                          "octamod.module.json").read_text())
                     for row in catalog["modules"]}
        try:
            modules = catalog_modules(catalog, documents, known)
        except (ValueError, KeyError) as error:
            parser.error(str(error))
    else:
        byid = {module.name: module for module in known.values()}
        modules = [{"id": id, "key": byid[id].key, "fxId": byid[id].menu.fx2_id,
                    "priority": byid[id].dsp.priority}
                   for id in LEGACY_ORDER if byid[id].dsp is not None]
    # Match build_bus's omitted custom ids, including unlisted native modules.
    # Stock replacements retain their original dispatch and are excluded here.
    custom = sorted({module.menu.fx2_id for module in known.values()
                     if module.menu and not module.is_stock and not module.menu.replaces})
    payloads = [{"core": 0 if tag == "A" else 1, "tag": tag,
                 "nullInit": native.PP[tag]["nul_i"], "nullProc": native.PP[tag]["nul_p"]}
                for tag in "AB"]
    result = {"schema": 1, "revision": revision, "sourceSha256": stockmeta["sourceSha256"],
              "noneId": native.NONE_ID, "modules": modules, "customIds": custom, "payloads": payloads}
    dest.write_text(json.dumps(result, indent=2) + "\n")
    print(f"{len(modules)} placeable DSP modules, {len(custom)} custom ids, "
          "null stubs per core; no stock bytes retained. No qualification gates run.")


if __name__ == "__main__":
    main()
