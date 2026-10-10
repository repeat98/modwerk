#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Keep verified developer checkouts of upstream Octabam and Elekloader outside Git.

    npm run upstream:tools                 # check out the pinned commits
    npm run upstream:tools -- --update     # move Octabam to upstream main first
    npm run upstream:tools -- --dir DIR    # default ~/.cache/modwerk-upstream

Octabam is pinned in sdk/upstream-tools.json; Elekloader follows the vendored
kit's commit, so the browser builder and the Python SDK cannot drift apart.
These are developer tools only: nothing in a checkout enters a Modwerk build,
catalogue or release fingerprint, and no firmware is read or written here.
Octabam's reviewed host-tool repairs (sdk/machines/octatrack/hw) are applied in
place and are the only edits a checkout may carry.
"""
import argparse
import datetime
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess

APP = Path(__file__).resolve().parents[1]
PINS = APP / 'sdk/upstream-tools.json'
DEFAULT_DIR = Path.home() / '.cache/modwerk-upstream'
_spec = importlib.util.spec_from_file_location('hw_tools_adapter', APP / 'sdk/machines/octatrack/hw/prepare_tools.py')
adapter = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(adapter)
REPAIRED = tuple('tools/hw/' + name for name in adapter.TOOLS)


def git(root, *args):
    result = subprocess.run(['git', '-C', str(root), *args], capture_output=True, text=True)
    if result.returncode:
        raise ValueError('git %s failed in %s: %s' % (' '.join(args), root, result.stderr.strip()))
    return result.stdout.strip()


def git_bytes(root, *args):
    return subprocess.run(['git', '-C', str(root), *args], check=True, capture_output=True).stdout


def sha(data):
    return hashlib.sha256(data).hexdigest()


def outside_git(base):
    """The checkouts must not land inside this or any other Git work tree."""
    probe = base.resolve()
    while not probe.exists():
        probe = probe.parent
    inside = subprocess.run(['git', '-C', str(probe), 'rev-parse', '--is-inside-work-tree'], capture_output=True, text=True)
    if inside.returncode == 0 and inside.stdout.strip() == 'true':
        raise ValueError('Keep upstream checkouts outside every Git work tree: ' + str(base))


def edits(path):
    """Tracked paths with local changes. Untracked and ignored files (out/, vendor/) are allowed."""
    # Unstripped: the first column of the first line is significant.
    lines = git_bytes(path, 'status', '--porcelain', '--untracked-files=no').decode().splitlines()
    return {line[3:] for line in lines if line}


def repair(path):
    for name, spec in adapter.TOOLS.items():
        tool = path / 'tools/hw' / name
        data = tool.read_bytes()
        if sha(data) != spec['output']:
            tool.write_bytes(adapter.repair(name, data))


def check_edits(path, allowed):
    """Refuse local edits other than the reviewed repairs in their exact repaired form."""
    for item in edits(path):
        if item not in allowed or sha((path / item).read_bytes()) != adapter.TOOLS[Path(item).name]['output']:
            raise ValueError('%s has local edits (%s); keep your own work out of this checkout.' % (path, item))


def sync(name, repository, commit, base, repairs):
    """Check out one upstream at an exact commit and verify the result."""
    path = base / name
    allowed = REPAIRED if repairs else ()
    if not path.exists():
        # Exact upstream bytes on every platform (core.autocrlf below): the repairs are bound to them.
        subprocess.run(['git', 'clone', '-q', '--config', 'core.autocrlf=false', '--filter=blob:none',
                        '--no-checkout', repository, str(path)], check=True, capture_output=True)
    if Path(git(path, 'rev-parse', '--show-toplevel')).resolve() != path.resolve():
        raise ValueError('Not an upstream checkout of its own: ' + str(path))
    if git(path, 'remote', 'get-url', 'origin') != repository:
        raise ValueError('%s does not track %s.' % (path, repository))
    git(path, 'config', 'core.autocrlf', 'false')
    # Before the first checkout the empty index would read as every file deleted.
    if (path / '.git/index').exists():
        check_edits(path, allowed)
        if allowed and edits(path):
            git(path, 'checkout', '--', *sorted(edits(path)))
    if subprocess.run(['git', '-C', str(path), 'cat-file', '-e', commit + '^{commit}'], capture_output=True).returncode:
        git(path, 'fetch', '-q', '--filter=blob:none', 'origin')
    git(path, 'checkout', '-q', '--detach', commit)
    if git(path, 'rev-parse', 'HEAD') != commit:
        raise ValueError('%s is not at %s.' % (path, commit))
    if repairs:
        repair(path)
    check_edits(path, allowed)
    if repairs and edits(path) != set(REPAIRED):
        raise ValueError('The reviewed repairs are not all applied in ' + str(path))
    return path


def update_octabam(pins_path, base, today=None):
    """Move the Octabam pin to upstream main, unless a repaired tool changed upstream."""
    pins = json.loads(pins_path.read_text())
    entry = pins['octabam']
    path = sync('octabam', entry['repository'], entry['commit'], base, True)
    head = git(path, 'ls-remote', 'origin', 'refs/heads/main').split()[0]
    if head == entry['commit']:
        return head, False
    git(path, 'fetch', '-q', '--filter=blob:none', 'origin', 'main')
    for name in adapter.TOOLS:
        # Raises when Sam changed a repaired tool: review the repairs before moving.
        adapter.repair(name, git_bytes(path, 'show', head + ':tools/hw/' + name))
    entry['commit'] = head
    entry['updated'] = today or datetime.date.today().isoformat()
    pins_path.write_text(json.dumps(pins, indent=2) + '\n')
    return head, True


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--dir', type=Path, default=DEFAULT_DIR)
    parser.add_argument('--update', action='store_true', help='Move the Octabam pin to upstream main first.')
    args = parser.parse_args()
    base = args.dir.expanduser().resolve()
    try:
        outside_git(base)
        base.mkdir(parents=True, exist_ok=True)
        if args.update:
            head, moved = update_octabam(PINS, base)
            print('Octabam pin %s %s.' % ('moved to' if moved else 'already at', head[:7]))
        pins = json.loads(PINS.read_text())
        kit = json.loads((APP / pins['elekloader']['commitFrom']).read_text())
        octabam = sync('octabam', pins['octabam']['repository'], pins['octabam']['commit'], base, True)
        elekloader = sync('elekloader', pins['elekloader']['repository'], kit['commit'], base, False)
        if args.update:
            main_head = git(elekloader, 'ls-remote', 'origin', 'refs/heads/main').split()[0]
            if main_head != kit['commit']:
                print('Elekloader main (%s) is ahead of kit %s. The kit and catalogue follow releases: '
                      'npm run elekloader:update -- elekloader-kit-<version>.zip' % (main_head[:7], kit['version']))
    except (ValueError, subprocess.CalledProcessError) as error:
        parser.error(str(error))
    tools = sorted(p.name for p in (octabam / 'tools/hw').iterdir() if p.is_file())
    print('octabam     %s (%s)  %s  repaired: %s' % (pins['octabam']['commit'][:7], pins['octabam']['updated'],
                                                    octabam, ', '.join(adapter.TOOLS)))
    print('elekloader  %s (kit %s)  %s' % (kit['commit'][:7], kit['version'], elekloader))
    print('Hardware tools (%d): %s/tools/hw' % (len(tools), octabam))
    print('Recorder:    swiftc -O %s/tools/hw/rec.swift -o %s/tools/rec' % (octabam, octabam))
    print('Emulator and DSP assembler: run "make setup" then "make emu-cf" in %s (builds into its ignored vendor/).' % octabam)


if __name__ == '__main__':
    main()
