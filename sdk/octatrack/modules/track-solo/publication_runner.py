#!/usr/bin/env python3
"""Run private Track Solo publication fixtures with pinned inputs and isolation."""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import time

EXPECTED_PACKAGE_SHA256 = "6b7a9d2cb30ceef7d69aedd5cfe5f2ea45fdaa46f6d16069952b8ad93286a2fd"
DEFAULT_DOCKER_IMAGE = "sha256:da70d46e10b243277fa3ae2e015f7258d56b3ee08ca4be47e61899958872e792"
LOCK_PATH = Path("/tmp/modwerk-emulator.lock")
EMU_PATTERN = re.compile(r"ot_emu|digiemu|rytm[-_]emu", re.IGNORECASE)
IMAGE_PATTERN = re.compile(
    r"(?:sha256:[0-9a-f]{64}|[A-Za-z0-9][A-Za-z0-9._/:+-]*@sha256:[0-9a-f]{64})"
)
MODULE = "sdk/octabam/modules/track-solo"
FIXTURE_FILES = (
    f"{MODULE}/fixture_call.s",
    f"{MODULE}/ux_test.py",
    f"{MODULE}/emulator_test.py",
    f"{MODULE}/panel_test.py",
    f"{MODULE}/broad_emulator_test.py",
)
PRODUCTION_FILES = (
    "CHANGELOG.json", "DEVICE_TRIAL.md", "README.md", "TESTING.md", "core.s",
    "gate.s", "generate.py", "input.s", "manifest.py", "octamod.module.json",
    "runtime.json", "track_solo.c", "verify.py",
)
PINNED_SOURCE_FILES = (
    *FIXTURE_FILES,
    f"{MODULE}/publication_runner.py",
    *(f"{MODULE}/{rel}" for rel in PRODUCTION_FILES),
)


def digest(path):
    h = hashlib.sha256()
    with Path(path).open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def repository_root():
    for parent in Path(__file__).resolve().parents:
        if ((parent / "sdk/catalog.json").is_file() and
                (parent / "scripts/build-module-packages.py").is_file()):
            return parent
    raise RuntimeError("Could not locate the repository root")


def docker_emulators(own_name):
    listed = subprocess.run(
        ["docker", "ps", "--format", "{{.ID}} {{.Names}}"],
        capture_output=True, text=True, check=True,
    ).stdout.splitlines()
    found = []
    for entry in listed:
        container_id, name = entry.split(maxsplit=1)
        if name == own_name:
            continue
        top = subprocess.run(
            ["docker", "top", container_id, "-eo", "pid,ppid,comm"],
            capture_output=True, text=True,
        )
        if top.returncode:
            current = subprocess.run(
                ["docker", "ps", "-q", "--filter", f"id={container_id}"],
                capture_output=True, text=True,
            )
            if current.returncode == 0 and not current.stdout.strip():
                continue
            found.append(f"{name}: process list unavailable while still running")
            continue
        found.extend(
            f"{name}: {line.strip()}"
            for line in top.stdout.splitlines()
            if EMU_PATTERN.search(line)
        )
    return found


def active_emulators(own_name):
    host = subprocess.run(
        ["ps", "-axo", "pid=,comm="], capture_output=True, text=True, check=True,
    ).stdout.splitlines()
    found = [line.strip() for line in host if EMU_PATTERN.search(line)]
    found.extend(docker_emulators(own_name))
    return found


def selected_options(args):
    return {
        "routine": bool(args.routine),
        "broadProfile": args.broad_profile,
        "broadCases": list(args.broad_cases or []),
        "audio": bool(args.audio),
        "paired": bool(args.paired),
        "save": bool(args.save),
    }


def source_paths(root):
    paths = {rel: root / rel for rel in PINNED_SOURCE_FILES}
    paths.update({
        str(path.relative_to(root)): path
        for path in (root / "sdk/octabam/tools").rglob("*.py")
        if path.is_file()
    })
    return dict(sorted(paths.items()))


def input_paths(args):
    cache = args.cache_root.expanduser().resolve()
    build_dir = resolved_build_dir(args)
    fixture_name = "fixture-mute-delay" if args.paired and not args.save else "fixture-2"
    broad_fixture = cache / "broad-fixtures-repro-1" / args.broad_profile if args.broad_profile else None
    paths = {
        "MAIN.raw": cache / "ata-order-experiment-1/integrated-base-4/MAIN.raw",
        "base-symbols.json": cache / "ata-order-experiment-1/integrated-base-4/symbols.json",
        "track-solo.mwrm": build_dir / "track-solo.mwrm",
        "symbols.json": build_dir / "symbols.json",
        "stock-main.raw": cache / "stock-main.private.bin",
        "ot_emu": args.emulator.expanduser().resolve(),
        "panel_link.py": args.panel_helper.expanduser().resolve(),
    }
    if broad_fixture:
        paths["card.private.img"] = broad_fixture / "card.private.img"
    else:
        paths["card.private.img"] = cache / fixture_name / "card.private.img"

    needs_mute_package = args.routine or args.paired or args.broad_profile == "control"
    # emulator_test.py needs the package and symbols; ux_test.py and the broad
    # control profile consume the companion package bytes only.
    needs_mute_symbols = args.routine
    if needs_mute_symbols:
        paths["mute-symbols.json"] = cache / "mute-linked/symbols.json"
    if needs_mute_package:
        paths["mute-modes.mwrm"] = cache / "mute-linked/mute-modes.mwrm"
    if broad_fixture:
        for path in sorted(broad_fixture.rglob("*")):
            if path.is_file():
                paths[f"broad-fixture/{path.relative_to(broad_fixture)}"] = path
    return dict(sorted(paths.items()))


def resolved_build_dir(args):
    return (args.build_dir or (args.cache_root / "ux-build-13")).expanduser().resolve()


def _hash_paths(paths, hasher):
    hashes = {}
    for key, path in sorted(paths.items()):
        try:
            hashes[key] = hasher(path)
        except OSError as exc:
            raise RuntimeError(f"missing or unreadable selected file {key}: {exc}") from exc
    return hashes


def make_manifest(args, root, hasher=digest):
    package = resolved_build_dir(args) / "track-solo.mwrm"
    package_hash = hasher(package)
    if package_hash != EXPECTED_PACKAGE_SHA256:
        raise RuntimeError("refusing to pin: package SHA-256 is not the authorized 0.2.2 identity")
    image = args.docker_image
    if not IMAGE_PATTERN.fullmatch(image):
        raise RuntimeError("Docker image must be pinned by SHA-256 digest or image ID")
    return {
        "schemaVersion": 1,
        "dockerImage": image,
        "expectedPackageSha256": EXPECTED_PACKAGE_SHA256,
        "selection": selected_options(args),
        "sourceSha256": _hash_paths(source_paths(root), hasher),
        "inputSha256": _hash_paths(input_paths(args), hasher),
    }


def write_manifest(args, root, hasher=digest):
    manifest = make_manifest(args, root, hasher)
    destination = args.manifest_output.expanduser().resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open("x") as f:
        json.dump(manifest, f, indent=2, sort_keys=True)
        f.write("\n")
    print(f"Wrote candidate hash manifest: {destination}")
    print("Review its hashes against independent source and private-input receipts before using it.")


def verify_manifest(args, root, manifest_path, hasher):
    manifest_path = manifest_path.expanduser().resolve()
    with manifest_path.open() as f:
        manifest = json.load(f)
    if manifest.get("schemaVersion") != 1:
        raise RuntimeError("input manifest schemaVersion must be 1")
    if manifest.get("dockerImage") != args.docker_image:
        raise RuntimeError("input manifest Docker image does not match the selected immutable image")
    if not IMAGE_PATTERN.fullmatch(args.docker_image):
        raise RuntimeError("Docker image must be pinned by SHA-256 digest or image ID")
    if manifest.get("expectedPackageSha256") != EXPECTED_PACKAGE_SHA256:
        raise RuntimeError("input manifest package identity is not the authorized 0.2.2 hash")
    if manifest.get("selection") != selected_options(args):
        raise RuntimeError("input manifest selection does not match this run's options")

    actual_source = _hash_paths(source_paths(root), hasher)
    actual_inputs = _hash_paths(input_paths(args), hasher)
    for label, expected, actual in (
        ("source", manifest.get("sourceSha256"), actual_source),
        ("input", manifest.get("inputSha256"), actual_inputs),
    ):
        if not isinstance(expected, dict) or set(expected) != set(actual):
            raise RuntimeError(f"input manifest {label} identity keys do not match selected files")
        invalid = [key for key, value in expected.items()
                   if not isinstance(value, str) or not re.fullmatch(r"[0-9a-f]{64}", value)]
        if invalid:
            raise RuntimeError(f"input manifest has invalid SHA-256 values for {label}: {invalid}")
        mismatched = [key for key in actual if expected[key] != actual[key]]
        if mismatched:
            raise RuntimeError(f"input manifest {label} SHA-256 mismatch: {mismatched}")
    return manifest, digest(manifest_path), actual_source, actual_inputs


def copy_frozen_sources(root, inputs, work, input_source_paths, copy_file, copy_tree):
    inputs.mkdir()
    work.mkdir()
    for rel in FIXTURE_FILES:
        src = root / rel
        dst = work / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        copy_file(src, dst)
    for rel in PRODUCTION_FILES:
        src = root / MODULE / rel
        dst = work / MODULE / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        copy_file(src, dst)
    tools = root / "sdk/octabam/tools"
    for src in sorted(tools.rglob("*.py")):
        if not src.is_file():
            continue
        dst = work / src.relative_to(root)
        dst.parent.mkdir(parents=True, exist_ok=True)
        copy_file(src, dst)
    broad_root = input_source_paths.get("broad-fixture/card.private.img")
    if broad_root:
        copy_tree(broad_root.parent, inputs / "broad-fixture")
    for name, src in input_source_paths.items():
        if name.startswith("broad-fixture/"):
            continue
        copy_file(src, inputs / name)


def test_command(args, name, work, inputs, run_dir):
    command = [
        "docker", "run", "--rm", "--name", name, "--shm-size=128m",
        "-v", f"{work}:/work:ro", "-v", f"{inputs}:/inputs:ro",
        "-v", f"{run_dir}:/out", args.docker_image, "python3", "-B",
        f"/work/{MODULE}/ux_test.py", "--inputs", "/inputs", "--output", "/out/result",
    ]
    fixture_arg = f"/work/{MODULE}/ux_test.py"
    if args.routine:
        command = command[:command.index(fixture_arg)] + [
            f"/work/{MODULE}/emulator_test.py",
            "--emulator", "/inputs/ot_emu", "--stock-main", "/inputs/stock-main.raw",
            "--package", "/inputs/track-solo.mwrm", "--symbols", "/inputs/symbols.json",
            "--output", "/out/result", "--mute-package", "/inputs/mute-modes.mwrm",
            "--mute-symbols", "/inputs/mute-symbols.json",
        ]
    elif args.broad_profile:
        command = command[:command.index(fixture_arg)] + [
            f"/work/{MODULE}/broad_emulator_test.py",
            "--emulator", "/inputs/ot_emu", "--base-main", "/inputs/MAIN.raw",
            "--base-symbols", "/inputs/base-symbols.json",
            "--package", "/inputs/track-solo.mwrm", "--symbols", "/inputs/symbols.json",
            "--fixture", "/inputs/broad-fixture", "--output", "/out/result",
            "--profile", args.broad_profile,
        ]
        if args.broad_profile == "control":
            command += ["--mute-package", "/inputs/mute-modes.mwrm"]
        if args.broad_cases:
            command += ["--cases", *args.broad_cases]
    command += ["--" + flag for flag in ("audio", "paired", "save")
                if getattr(args, flag)]
    return command


def stop_owned_container(name):
    return subprocess.run(
        ["docker", "stop", name], stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL, check=False,
    ).returncode


class RunFailed(RuntimeError):
    def __init__(self, message, run_dir):
        super().__init__(message)
        self.run_dir = run_dir


def run_fixture(args, *, root=None, active_scan=None, popen=None, stop_container=None,
                sleeper=None, loadavg=None, hasher=digest, copy_file=None, copy_tree=None,
                lock_path=LOCK_PATH):
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]*", args.label):
        raise RuntimeError("label must contain only letters, digits, dot, underscore, or dash")
    active_scan = active_scan or active_emulators
    popen = popen or subprocess.Popen
    stop_container = stop_container or stop_owned_container
    sleeper = sleeper or time.sleep
    loadavg = loadavg or os.getloadavg
    copy_file = copy_file or shutil.copy2
    copy_tree = copy_tree or shutil.copytree
    output_root = args.output_root.expanduser().resolve()
    run_dir = output_root / args.label
    output_root.mkdir(parents=True, exist_ok=True)
    run_dir.mkdir(exist_ok=False)

    name = "track-solo-" + args.label
    error = None
    exit_code = None
    observations = []
    last_other = []
    child = None
    lock = None
    lock_acquired = False
    lock_released = False
    stop_requested = False
    stopped_container = None
    stop_exit_code = None
    frozen_hashes = {}
    manifest_hash = None
    log = None
    try:
        root = root or repository_root()
        manifest, manifest_hash, _, input_hashes = verify_manifest(
            args, root, args.input_manifest, hasher,
        )
        package_hash = hasher(resolved_build_dir(args) / "track-solo.mwrm")
        if package_hash != EXPECTED_PACKAGE_SHA256:
            raise RuntimeError("refusing to run: package SHA-256 is not the authorized 0.2.2 identity")

        lock = Path(lock_path).open("a+")
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            lock_acquired = True
        except BlockingIOError as exc:
            raise RuntimeError("emulator lock is held by another session; no emulator started") from exc

        last_other = active_scan(name)
        if last_other:
            raise RuntimeError("another emulator or unverifiable running container is active: " + repr(last_other))

        inputs = run_dir / "inputs"
        work = run_dir / "work"
        copy_frozen_sources(root, inputs, work, input_paths(args), copy_file, copy_tree)
        pinned_sources = manifest["sourceSha256"]
        for tree in (inputs, work):
            for path in tree.rglob("*"):
                if path.is_file():
                    relative = str(path.relative_to(run_dir))
                    value = hasher(path)
                    frozen_hashes[relative] = value
                    if relative.startswith("inputs/"):
                        expected_key = relative[len("inputs/"):]
                        if input_hashes.get(expected_key) != value:
                            raise RuntimeError(f"copied input SHA-256 changed during copy: {expected_key}")
                    elif relative.startswith("work/"):
                        source_key = relative[len("work/"):]
                        if source_key in pinned_sources and pinned_sources[source_key] != value:
                            raise RuntimeError(f"copied source SHA-256 changed during copy: {source_key}")

        (run_dir / "inputs.json").write_text(json.dumps({
            "expectedPackageSha256": EXPECTED_PACKAGE_SHA256,
            "dockerImage": manifest["dockerImage"],
            "manifestSha256": manifest_hash,
            "selection": selected_options(args),
            "sourceHashes": frozen_hashes,
        }, indent=2, sort_keys=True) + "\n")

        log = (run_dir / "docker.private.log").open("w")
        last_other = active_scan(name)
        if last_other:
            raise RuntimeError("emulator appeared before launch: " + repr(last_other))
        command = test_command(args, name, work, inputs, run_dir)
        child = popen(command, stdout=log, stderr=subprocess.STDOUT)
        while child.poll() is None:
            last_other = active_scan(name)
            observations.append({
                "time": time.time(), "otherEmulators": last_other, "load": loadavg(),
            })
            (run_dir / "resource-monitor.json").write_text(
                json.dumps(observations, indent=2) + "\n"
            )
            if last_other:
                raise RuntimeError("competing emulator/unverifiable process: " + repr(last_other))
            sleeper(3)
        exit_code = child.wait()
        last_other = active_scan(name)
        observations.append({
            "time": time.time(), "otherEmulators": last_other, "load": loadavg(),
        })
        (run_dir / "resource-monitor.json").write_text(
            json.dumps(observations, indent=2) + "\n"
        )
        if last_other:
            raise RuntimeError("another emulator appeared before teardown: " + repr(last_other))
    except BaseException as exc:
        error = f"{type(exc).__name__}: {exc}"
    finally:
        if log is not None:
            log.close()
        if child is not None:
            try:
                if child.poll() is None:
                    stop_requested = True
                    stop_exit_code = stop_container(name)
                    if stop_exit_code == 0:
                        stopped_container = name
                    child.wait()
            except BaseException as cleanup_exc:
                if error is None:
                    error = f"{type(cleanup_exc).__name__}: {cleanup_exc}"
        if lock is not None:
            lock.close()
            lock_released = True

        unchanged = None
        if frozen_hashes:
            unchanged = all(
                (run_dir / relative).is_file() and hasher(run_dir / relative) == expected
                for relative, expected in frozen_hashes.items()
            )
            if not unchanged and error is None:
                error = "frozen input/source hash changed during the run"
        child_state = "not-started"
        if child is not None:
            try:
                child_state = "exited" if child.poll() is not None else "running"
            except BaseException:
                child_state = "unknown"
        cleanup = {
            "lockAcquired": lock_acquired,
            "lockReleased": lock_released,
            "containerName": name,
            "containerLaunched": child is not None,
            "childStateAtCleanup": child_state,
            "stopRequested": stop_requested,
            "stopExitCode": stop_exit_code,
            "stoppedContainer": stopped_container,
        }
        if error is not None:
            (run_dir / "runner-error.json").write_text(json.dumps({
                "error": error,
                **cleanup,
            }, indent=2, sort_keys=True) + "\n")
        (run_dir / "isolation.json").write_text(json.dumps({
            "exitCode": exit_code,
            "inputAndCopiedSourceFilesUnchanged": unchanged,
            "verifiedFileCount": len(frozen_hashes),
            "monitorObservations": len(observations),
            "otherEmulators": last_other,
            "runnerError": error,
            "cleanup": cleanup,
        }, indent=2, sort_keys=True) + "\n")

    if error is not None:
        raise RunFailed(error, run_dir)
    if log is not None:
        print((run_dir / "docker.private.log").read_text()[-5000:])
    return exit_code or 0, run_dir


def common_arguments(parser):
    parser.add_argument("--cache-root", type=Path,
                        default=Path.home() / ".cache/modwerk-track-solo")
    parser.add_argument("--build-dir", type=Path,
                        help="private package build directory (defaults to CACHE_ROOT/ux-build-13)")
    parser.add_argument("--emulator", type=Path,
                        default=Path.home() / ".cache/modwerk-pattern-sample-locks/emulator/ot_emu")
    parser.add_argument("--panel-helper", type=Path,
                        default=Path.home() / ".cache/modwerk-upstream/octabam/tools/panel/panel_link.py")
    parser.add_argument("--docker-image", default=DEFAULT_DOCKER_IMAGE)
    parser.add_argument("--routine", action="store_true")
    parser.add_argument("--broad-profile", choices=("control", "machines", "master"))
    parser.add_argument("--broad-cases", nargs="+",
                        help="exact broad-emulator case names to select")
    for flag in ("audio", "paired", "save"):
        parser.add_argument("--" + flag, action="store_true")


def build_parser():
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    manifest_parser = subparsers.add_parser(
        "manifest", help="write a candidate hash-only identity manifest for review",
    )
    common_arguments(manifest_parser)
    manifest_parser.add_argument("--manifest-output", required=True, type=Path)

    run_parser = subparsers.add_parser("run", help="run fixtures against a reviewed manifest")
    common_arguments(run_parser)
    run_parser.add_argument("label", help="unique, new run label")
    run_parser.add_argument("--input-manifest", required=True, type=Path,
                            help="reviewed hash-only manifest matching this exact selection")
    run_parser.add_argument("--output-root", type=Path,
                            default=Path.home() / ".cache/modwerk-track-solo/publication-20261104/validation-0.2.2/runs")
    return parser


def main():
    parser = build_parser()
    args = parser.parse_args()
    if args.broad_cases and not args.broad_profile:
        parser.error("--broad-cases requires --broad-profile")
    if args.command == "manifest":
        write_manifest(args, repository_root())
        return
    try:
        code, _ = run_fixture(args)
    except RunFailed as exc:
        raise SystemExit(str(exc)) from exc
    raise SystemExit(code)


if __name__ == "__main__":
    main()
